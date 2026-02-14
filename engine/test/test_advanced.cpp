#include <gtest/gtest.h>
#include "core/Species.h"
#include "core/ChemicalKinetics.h"
#include "core/SuperFilter.h"
#include "core/AxleyBLD.h"
#include "core/AerosolDeposition.h"
#include "core/Occupant.h"
#include "core/Network.h"
#include "core/Solver.h"
#include "core/ContaminantSolver.h"
#include "core/TransientSimulation.h"
#include "elements/PowerLawOrifice.h"
#include "elements/TwoWayFlow.h"
#include <cmath>
#include <memory>

using namespace contam;

// ── DecaySource Tests ────────────────────────────────────────────────

TEST(DecaySourceTest, FactoryMethod) {
    Source s = Source::makeDecay(1, 0, 1e-5, 3600.0, 0.0, 2.0);
    EXPECT_EQ(s.type, SourceType::ExponentialDecay);
    EXPECT_EQ(s.zoneId, 1);
    EXPECT_EQ(s.speciesId, 0);
    EXPECT_DOUBLE_EQ(s.generationRate, 1e-5);
    EXPECT_DOUBLE_EQ(s.decayTimeConstant, 3600.0);
    EXPECT_DOUBLE_EQ(s.multiplier, 2.0);
}

TEST(DecaySourceTest, DecayInTransient) {
    Network net;
    Node outdoor(0, "Outdoor", NodeType::Ambient);
    outdoor.setTemperature(293.15);
    net.addNode(outdoor);

    Node room(1, "Room");
    room.setTemperature(293.15);
    room.setVolume(30.0);
    net.addNode(room);

    Link l1(1, 0, 1, 1.0);
    l1.setFlowElement(std::make_unique<PowerLawOrifice>(0.003, 0.65));
    net.addLink(std::move(l1));

    Species voc(0, "VOC", 0.1);
    Source decaySrc = Source::makeDecay(1, 0, 1e-4, 600.0); // tau=600s

    TransientSimulation sim;
    TransientConfig config;
    config.endTime = 1800;
    config.timeStep = 60;
    config.outputInterval = 600;
    sim.setConfig(config);
    sim.setSpecies({voc});
    sim.setSources({decaySrc});

    auto result = sim.run(net);
    EXPECT_TRUE(result.completed);
    // Source decays over time, so later concentrations should be lower growth rate
    EXPECT_GE(result.history.size(), 2);
}

// ── Chemical Kinetics Tests ──────────────────────────────────────────

TEST(ChemKineticsTest, BuildMatrix) {
    ReactionNetwork rxn;
    rxn.addReaction(0, 1, 0.01);  // species 0 → species 1 at rate 0.01/s
    rxn.addReaction(1, 0, 0.005); // species 1 → species 0 at rate 0.005/s

    auto K = rxn.buildMatrix(2);
    EXPECT_NEAR(K[1][0], 0.01, 1e-10);  // 0→1
    EXPECT_NEAR(K[0][1], 0.005, 1e-10); // 1→0
    EXPECT_DOUBLE_EQ(K[0][0], 0.0);
    EXPECT_DOUBLE_EQ(K[1][1], 0.0);
}

TEST(ChemKineticsTest, CoupledSolve) {
    Network net;
    Node outdoor(0, "Outdoor", NodeType::Ambient);
    outdoor.setTemperature(293.15);
    net.addNode(outdoor);

    Node room(1, "Room");
    room.setTemperature(293.15);
    room.setVolume(50.0);
    net.addNode(room);

    Link l1(1, 0, 1, 1.0);
    l1.setFlowElement(std::make_unique<PowerLawOrifice>(0.001, 0.65));
    net.addLink(std::move(l1));

    // Two species: A converts to B
    Species specA(0, "A", 0.029);
    Species specB(1, "B", 0.029);

    // Source of A in room
    Source srcA(1, 0, 1e-5);

    // Reaction: A → B at 0.001/s
    ReactionNetwork rxn;
    rxn.addReaction(0, 1, 0.001);

    ContaminantSolver solver;
    solver.setSpecies({specA, specB});
    solver.setSources({srcA});
    solver.setReactionNetwork(rxn);
    solver.initialize(net);

    // Solve airflow first
    Solver airSolver;
    airSolver.solve(net);

    // Step forward
    auto result = solver.step(net, 0.0, 60.0);
    // A should be present (from source), B should also appear (from reaction)
    EXPECT_GT(result.concentrations[1][0], 0.0); // A in room
    // B may be very small after one step but should exist
    // (depends on the implicit coupling strength)

    // After many steps, B should accumulate
    for (int i = 0; i < 100; ++i) {
        result = solver.step(net, (i + 1) * 60.0, 60.0);
    }
    EXPECT_GT(result.concentrations[1][1], 0.0); // B should have accumulated
}

// ── Super Filter Tests ───────────────────────────────────────────────

TEST(SuperFilterTest, SingleStage) {
    SuperFilter sf;
    sf.addStage(0.9);
    EXPECT_NEAR(sf.totalEfficiency(), 0.9, 1e-10);
}

TEST(SuperFilterTest, CascadeEfficiency) {
    // η_super = 1 - (1-0.8)*(1-0.9) = 1 - 0.2*0.1 = 1 - 0.02 = 0.98
    SuperFilter sf;
    sf.addStage(0.8);
    sf.addStage(0.9);
    EXPECT_NEAR(sf.totalEfficiency(), 0.98, 1e-10);
}

TEST(SuperFilterTest, ThreeStages) {
    // η = 1 - (1-0.5)*(1-0.5)*(1-0.5) = 1 - 0.125 = 0.875
    SuperFilter sf;
    sf.addStage(0.5);
    sf.addStage(0.5);
    sf.addStage(0.5);
    EXPECT_NEAR(sf.totalEfficiency(), 0.875, 1e-10);
}

TEST(SuperFilterTest, LoadingDecay) {
    SuperFilter sf;
    sf.addStage(FilterStage(0.9, 0.0, 0.1)); // decay rate 0.1/kg
    EXPECT_NEAR(sf.totalEfficiency(), 0.9, 1e-10);

    // Add some loading
    sf.updateLoading(5.0); // 5 kg captured
    // Stage efficiency should decrease: 0.9 * exp(-0.1 * loading)
    // After loading ~4.5kg on stage: 0.9 * exp(-0.1*4.5) = 0.9 * 0.6376 ≈ 0.574
    double eff = sf.totalEfficiency();
    EXPECT_LT(eff, 0.9);
    EXPECT_GT(eff, 0.0);
}

// ── Axley BLD Tests ──────────────────────────────────────────────────

TEST(AxleyBLDTest, Adsorption) {
    AxleyBLDSource bld(0, 0, 0.005, 10.0, 10000.0, 0.005);
    // Air concentration > solid/k → adsorption (positive transfer = sink)
    double rate = bld.computeTransferRate(0.001, 1.2); // airConc=0.001, solidConc=0
    EXPECT_GT(rate, 0.0); // adsorbing
}

TEST(AxleyBLDTest, Desorption) {
    AxleyBLDSource bld(0, 0, 0.005, 10.0, 10000.0, 0.005);
    bld.solidConc = 100.0; // high solid concentration
    // solidConc/k = 100/10000 = 0.01 > airConc=0.001 → desorption (negative = source)
    double rate = bld.computeTransferRate(0.001, 1.2);
    EXPECT_LT(rate, 0.0); // desorbing (secondary emission)
}

TEST(AxleyBLDTest, ImplicitCoeffs) {
    AxleyBLDSource bld(0, 0, 0.005, 10.0, 10000.0, 0.005);
    bld.solidConc = 50.0;
    auto [a_add, b_add] = bld.getImplicitCoeffs(1.2, 60.0);
    EXPECT_GT(a_add, 0.0); // removal coefficient
    EXPECT_GT(b_add, 0.0); // desorption contribution (solidConc > 0)
}

// ── Aerosol Deposition Tests ─────────────────────────────────────────

TEST(AerosolTest, DepositionCoeff) {
    AerosolSurface surf(0, 0, 5e-4, 20.0); // PM2.5 typical values
    double coeff = surf.getDepositionCoeff();
    EXPECT_NEAR(coeff, 5e-4 * 20.0, 1e-10); // d * A_s = 0.01
}

TEST(AerosolTest, Resuspension) {
    AerosolSurface surf(0, 0, 5e-4, 20.0, 1e-6);
    surf.depositedMass = 0.001; // 1 mg deposited
    double rate = surf.getResuspensionRate(50.0); // 50 m³ zone
    EXPECT_GT(rate, 0.0);
}

TEST(AerosolTest, MassBalance) {
    AerosolSurface surf(0, 0, 5e-4, 20.0, 0.0); // no resuspension
    surf.updateDeposited(0.001, 50.0, 60.0); // airConc=0.001, dt=60s
    EXPECT_GT(surf.depositedMass, 0.0);
    double expected = 5e-4 * 20.0 * 1.0 * 0.001 * 60.0; // d*A*mult*C*dt
    EXPECT_NEAR(surf.depositedMass, expected, 1e-10);
}

// ── Wind Pressure Cp Tests ───────────────────────────────────────────

TEST(WindPressureTest, CpCalculation) {
    Node n(0, "Exterior wall", NodeType::Ambient);
    n.setTemperature(283.15);
    n.updateDensity();
    n.setWindPressureCoeff(0.6);
    double Pw = n.getWindPressure(10.0); // 10 m/s wind
    // Pw = 0.5 * rho * Cp * V² = 0.5 * ~1.24 * 0.6 * 100 ≈ 37.2
    EXPECT_NEAR(Pw, 0.5 * n.getDensity() * 0.6 * 100.0, 0.1);
    EXPECT_GT(Pw, 30.0);
}

// ── TwoWayFlow Bidirectional Tests ───────────────────────────────────

TEST(TwoWayFlowBiTest, NeutralPlaneInOpening) {
    TwoWayFlow twf(0.6, 2.0, 2.0); // Cd=0.6, A=2m², height=2m
    // Zone i: cold (293K), Zone j: warm (303K) → density difference
    double rhoI = 101325.0 / (287.055 * 293.15); // ~1.205
    double rhoJ = 101325.0 / (287.055 * 303.15); // ~1.164

    auto result = twf.calculateBidirectional(0.0, rhoI, rhoJ, 0.0, 0.0, 1.0);
    // With zero mechanical pressure and density difference,
    // should have bidirectional flow
    EXPECT_GT(result.flow_ij, 0.0);
    EXPECT_GT(result.flow_ji, 0.0);
    EXPECT_GT(result.derivative, 0.0);
}

TEST(TwoWayFlowBiTest, NoDensityDifference) {
    TwoWayFlow twf(0.6, 2.0, 2.0);
    double rho = 1.2;
    // Same density → falls back to simplified orifice
    auto result = twf.calculateBidirectional(10.0, rho, rho, 0.0, 0.0, 1.0);
    EXPECT_GT(result.netMassFlow, 0.0);
    EXPECT_DOUBLE_EQ(result.flow_ji, 0.0); // unidirectional
}

// ── Species isTrace Flag Test ────────────────────────────────────────

TEST(SpeciesTest, TraceFlag) {
    Species co2(0, "CO2", 0.044, 0.0, 0.0, true);
    EXPECT_TRUE(co2.isTrace);

    Species h2o(1, "H2O", 0.018, 0.0, 0.0, false);
    EXPECT_FALSE(h2o.isTrace);
}
