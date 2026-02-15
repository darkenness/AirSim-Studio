#include <gtest/gtest.h>
#include "core/OneDZone.h"
#include "core/AdaptiveIntegrator.h"
#include "core/DuctNetwork.h"
#include "core/Network.h"
#include "core/Node.h"
#include "core/Link.h"
#include "core/Solver.h"
#include "core/ContaminantSolver.h"
#include "core/TransientSimulation.h"
#include "core/Species.h"
#include "elements/PowerLawOrifice.h"
#include "io/AchReport.h"
#include "io/CsmReport.h"
#include <cmath>
#include <memory>
#include <vector>

using namespace contam;

// ============================================================================
// E-05: OneDZone Tests
// ============================================================================

TEST(OneDZoneTest, Construction) {
    OneDZone zone(10, 5.0, 0.5, 2);
    EXPECT_EQ(zone.numCells(), 10);
    EXPECT_EQ(zone.numSpecies(), 2);
    EXPECT_DOUBLE_EQ(zone.length(), 5.0);
    EXPECT_DOUBLE_EQ(zone.crossSectionArea(), 0.5);
}

TEST(OneDZoneTest, InvalidConstruction) {
    EXPECT_THROW(OneDZone(0, 5.0, 0.5, 1), std::invalid_argument);
    EXPECT_THROW(OneDZone(10, -1.0, 0.5, 1), std::invalid_argument);
    EXPECT_THROW(OneDZone(10, 5.0, 0.0, 1), std::invalid_argument);
    EXPECT_THROW(OneDZone(10, 5.0, 0.5, 0), std::invalid_argument);
}

TEST(OneDZoneTest, InitialConcentrationZero) {
    OneDZone zone(5, 1.0, 1.0, 1);
    for (int i = 0; i < 5; ++i) {
        EXPECT_DOUBLE_EQ(zone.getConcentration(i, 0), 0.0);
    }
}

TEST(OneDZoneTest, SetGetConcentration) {
    OneDZone zone(5, 1.0, 1.0, 2);
    zone.setConcentration(2, 0, 1.5);
    zone.setConcentration(3, 1, 2.5);
    EXPECT_DOUBLE_EQ(zone.getConcentration(2, 0), 1.5);
    EXPECT_DOUBLE_EQ(zone.getConcentration(3, 1), 2.5);
    EXPECT_DOUBLE_EQ(zone.getConcentration(2, 1), 0.0);
}

TEST(OneDZoneTest, AverageConcentration) {
    OneDZone zone(4, 1.0, 1.0, 1);
    zone.setConcentration(0, 0, 1.0);
    zone.setConcentration(1, 0, 2.0);
    zone.setConcentration(2, 0, 3.0);
    zone.setConcentration(3, 0, 4.0);
    EXPECT_DOUBLE_EQ(zone.getAverageConcentration(0), 2.5);
}

TEST(OneDZoneTest, AdvectionOnly) {
    // Pure advection: flow left->right, left BC = 1.0
    // After enough steps, concentration should propagate rightward
    int N = 20;
    OneDZone zone(N, 10.0, 1.0, 1);

    double flowRate = 1.2;  // kg/s
    double density = 1.2;   // kg/m^3
    std::vector<double> diffCoeffs = {0.0};
    std::vector<double> leftBC = {1.0};
    std::vector<double> rightBC = {0.0};

    double dtMax = zone.getMaxTimeStep(flowRate, density, 0.0);
    double dt = dtMax * 0.5; // stay within CFL

    // Run many steps
    for (int step = 0; step < 500; ++step) {
        zone.step(dt, flowRate, density, diffCoeffs, leftBC, rightBC);
    }

    // After many steps with left BC=1.0, cells should approach 1.0
    // At least the first few cells should be close to 1.0
    EXPECT_GT(zone.getConcentration(0, 0), 0.9);
    EXPECT_GT(zone.getConcentration(N / 2, 0), 0.5);
    // Average should be significantly above zero
    EXPECT_GT(zone.getAverageConcentration(0), 0.5);
}

TEST(OneDZoneTest, DiffusionOnly) {
    // Pure diffusion: no flow, initial spike in center cell
    int N = 21;
    OneDZone zone(N, 1.0, 1.0, 1);

    // Set spike in center
    zone.setConcentration(N / 2, 0, 1.0);

    double diffCoeff = 0.01;
    std::vector<double> diffCoeffs = {diffCoeff};
    std::vector<double> leftBC = {0.0};
    std::vector<double> rightBC = {0.0};

    double dtMax = zone.getMaxTimeStep(0.0, 1.2, diffCoeff);
    double dt = dtMax * 0.4;

    double initialAvg = zone.getAverageConcentration(0);

    // Run diffusion
    for (int step = 0; step < 200; ++step) {
        zone.step(dt, 0.0, 1.2, diffCoeffs, leftBC, rightBC);
    }

    // Peak should have decreased (spread out)
    EXPECT_LT(zone.getConcentration(N / 2, 0), 1.0);
    // Neighbors should have gained concentration
    EXPECT_GT(zone.getConcentration(N / 2 - 1, 0), 0.0);
    EXPECT_GT(zone.getConcentration(N / 2 + 1, 0), 0.0);
}

TEST(OneDZoneTest, CombinedAdvectionDiffusion) {
    int N = 20;
    OneDZone zone(N, 5.0, 0.5, 1);

    double flowRate = 0.6;
    double density = 1.2;
    double diffCoeff = 0.005;
    std::vector<double> diffCoeffs = {diffCoeff};
    std::vector<double> leftBC = {1.0};
    std::vector<double> rightBC = {0.0};

    double dtMax = zone.getMaxTimeStep(flowRate, density, diffCoeff);
    double dt = dtMax * 0.3;

    for (int step = 0; step < 1000; ++step) {
        zone.step(dt, flowRate, density, diffCoeffs, leftBC, rightBC);
    }

    // With left BC=1.0 and positive flow, concentration should decrease left to right
    // (monotonically or nearly so)
    EXPECT_GT(zone.getConcentration(0, 0), zone.getConcentration(N - 1, 0));
    EXPECT_GT(zone.getAverageConcentration(0), 0.0);
}

TEST(OneDZoneTest, CflTimeStep) {
    OneDZone zone(10, 5.0, 1.0, 1);
    double dtMax = zone.getMaxTimeStep(1.2, 1.2, 0.01);
    EXPECT_GT(dtMax, 0.0);
    EXPECT_LT(dtMax, 1e10);

    // Zero flow, zero diffusion -> very large dt
    double dtInf = zone.getMaxTimeStep(0.0, 1.2, 0.0);
    EXPECT_GT(dtInf, 1e20);
}

// ============================================================================
// E-06: AdaptiveIntegrator Tests
// ============================================================================

TEST(AdaptiveIntegratorTest, ExponentialDecay) {
    // dy/dt = -k*y, y(0) = 1.0, exact: y(t) = exp(-k*t)
    double k = 0.1;
    int N = 1;

    AdaptiveIntegrator::Config cfg;
    cfg.rtol = 1e-6;
    cfg.atol = 1e-10;
    cfg.dtMin = 0.001;
    cfg.dtMax = 10.0;
    cfg.maxOrder = 2;

    AdaptiveIntegrator integrator(N, cfg);

    auto rhs = [k](double /*t*/, const std::vector<double>& y, std::vector<double>& dydt) {
        dydt[0] = -k * y[0];
    };

    std::vector<double> y = {1.0};
    double t = 0.0;
    double tEnd = 10.0;

    t = integrator.step(t, tEnd, y, rhs);

    double exact = std::exp(-k * tEnd);
    EXPECT_NEAR(y[0], exact, 1e-4);
    EXPECT_NEAR(t, tEnd, 1e-10);
    EXPECT_GT(integrator.totalSteps(), 0);
}

TEST(AdaptiveIntegratorTest, LinearGrowth) {
    // dy/dt = 1.0, y(0) = 0 -> y(t) = t
    AdaptiveIntegrator::Config cfg;
    cfg.rtol = 1e-6;
    cfg.atol = 1e-10;
    cfg.maxOrder = 1;

    AdaptiveIntegrator integrator(1, cfg);

    auto rhs = [](double /*t*/, const std::vector<double>& /*y*/, std::vector<double>& dydt) {
        dydt[0] = 1.0;
    };

    std::vector<double> y = {0.0};
    double t = integrator.step(0.0, 5.0, y, rhs);

    EXPECT_NEAR(y[0], 5.0, 1e-4);
    EXPECT_NEAR(t, 5.0, 1e-10);
}

TEST(AdaptiveIntegratorTest, TwoStateSystem) {
    // dy0/dt = -y0, dy1/dt = y0 (decay + production)
    // y0(0)=1, y1(0)=0 -> y0=exp(-t), y1=1-exp(-t)
    AdaptiveIntegrator::Config cfg;
    cfg.rtol = 1e-5;
    cfg.atol = 1e-10;
    cfg.maxOrder = 2;

    AdaptiveIntegrator integrator(2, cfg);

    auto rhs = [](double /*t*/, const std::vector<double>& y, std::vector<double>& dydt) {
        dydt[0] = -y[0];
        dydt[1] = y[0];
    };

    std::vector<double> y = {1.0, 0.0};
    double t = integrator.step(0.0, 3.0, y, rhs);

    EXPECT_NEAR(y[0], std::exp(-3.0), 1e-3);
    EXPECT_NEAR(y[1], 1.0 - std::exp(-3.0), 1e-3);
    EXPECT_NEAR(t, 3.0, 1e-10);
}

TEST(AdaptiveIntegratorTest, StiffProblem) {
    // dy/dt = -1000*(y - cos(t)), stiff ODE
    // Exact solution approaches cos(t) quickly
    AdaptiveIntegrator::Config cfg;
    cfg.rtol = 1e-3;
    cfg.atol = 1e-8;
    cfg.dtMin = 1e-6;
    cfg.dtMax = 1.0;
    cfg.maxOrder = 2;

    AdaptiveIntegrator integrator(1, cfg);

    auto rhs = [](double t, const std::vector<double>& y, std::vector<double>& dydt) {
        dydt[0] = -1000.0 * (y[0] - std::cos(t));
    };

    std::vector<double> y = {1.0}; // y(0) = cos(0) = 1
    double t = integrator.step(0.0, 1.0, y, rhs);

    // Should track cos(t) closely
    EXPECT_NEAR(y[0], std::cos(1.0), 0.05);
    EXPECT_NEAR(t, 1.0, 1e-10);
}

TEST(AdaptiveIntegratorTest, Statistics) {
    AdaptiveIntegrator integrator(1);
    EXPECT_EQ(integrator.totalSteps(), 0);
    EXPECT_EQ(integrator.rejectedSteps(), 0);

    auto rhs = [](double /*t*/, const std::vector<double>& y, std::vector<double>& dydt) {
        dydt[0] = -y[0];
    };

    std::vector<double> y = {1.0};
    integrator.step(0.0, 1.0, y, rhs);

    EXPECT_GT(integrator.totalSteps(), 0);
    EXPECT_GT(integrator.getSuggestedDt(), 0.0);
}

// ============================================================================
// E-07/E-08: DuctNetwork Tests
// ============================================================================

TEST(DuctNetworkTest, SimpleThreeJunction) {
    // Fan -> Junction1 -> Junction2 -> Junction3 -> Terminal
    // All connected by duct elements (power law orifices as proxy)
    DuctNetwork dn;

    DuctJunction j1{1, 0.0, 0.0};
    DuctJunction j2{2, 0.0, 0.0};
    DuctJunction j3{3, 0.0, 0.0};
    dn.addJunction(j1);
    dn.addJunction(j2);
    dn.addJunction(j3);

    // Two terminals: supply (id=10) and return (id=20)
    DuctTerminal t1{10, 0, 0.1, 1.0};
    DuctTerminal t2{20, 1, 0.1, 1.0};
    dn.addTerminal(t1);
    dn.addTerminal(t2);

    // Links: terminal10 -> j1 -> j2 -> j3 -> terminal20
    dn.addDuctLink(101, 10, 1, std::make_unique<PowerLawOrifice>(0.01, 0.65));
    dn.addDuctLink(102, 1, 2, std::make_unique<PowerLawOrifice>(0.01, 0.65));
    dn.addDuctLink(103, 2, 3, std::make_unique<PowerLawOrifice>(0.01, 0.65));
    dn.addDuctLink(104, 3, 20, std::make_unique<PowerLawOrifice>(0.01, 0.65));

    bool converged = dn.solve();
    // With all terminals at P=0, no driving pressure -> zero flow, trivially converged
    EXPECT_TRUE(converged);

    // All junction pressures should be zero (no driving force)
    EXPECT_NEAR(dn.getJunctionPressure(1), 0.0, 1e-3);
    EXPECT_NEAR(dn.getJunctionPressure(2), 0.0, 1e-3);
    EXPECT_NEAR(dn.getJunctionPressure(3), 0.0, 1e-3);
}

TEST(DuctNetworkTest, PressureDrivenFlow) {
    // Single junction between two terminals
    // Set initial junction pressure to create flow
    DuctNetwork dn;

    DuctJunction j1{1, 0.0, 50.0}; // 50 Pa initial pressure
    dn.addJunction(j1);

    DuctTerminal t1{10, 0, 0.1, 1.0};
    DuctTerminal t2{20, 1, 0.1, 1.0};
    dn.addTerminal(t1);
    dn.addTerminal(t2);

    // terminal10 -> j1 -> terminal20
    dn.addDuctLink(101, 10, 1, std::make_unique<PowerLawOrifice>(0.005, 0.65));
    dn.addDuctLink(102, 1, 20, std::make_unique<PowerLawOrifice>(0.005, 0.65));

    bool converged = dn.solve();
    EXPECT_TRUE(converged);

    // Junction pressure should settle to satisfy mass conservation
    // Flow in = flow out at junction
    double flowIn = dn.getLinkFlow(101);
    double flowOut = dn.getLinkFlow(102);
    // Mass conservation at junction: flowIn should approximately equal flowOut
    EXPECT_NEAR(flowIn, flowOut, 1e-3);
}

TEST(DuctNetworkTest, GetResults) {
    DuctNetwork dn;
    // Non-existent IDs should return 0
    EXPECT_DOUBLE_EQ(dn.getJunctionPressure(999), 0.0);
    EXPECT_DOUBLE_EQ(dn.getLinkFlow(999), 0.0);
    EXPECT_DOUBLE_EQ(dn.getTerminalFlow(999), 0.0);
}

TEST(DuctNetworkTest, NoJunctionsSolve) {
    // Direct terminal-to-terminal link (no junctions)
    DuctNetwork dn;

    DuctTerminal t1{10, 0, 0.1, 1.0};
    DuctTerminal t2{20, 1, 0.1, 1.0};
    dn.addTerminal(t1);
    dn.addTerminal(t2);

    dn.addDuctLink(101, 10, 20, std::make_unique<PowerLawOrifice>(0.005, 0.65));

    bool converged = dn.solve();
    EXPECT_TRUE(converged);
    // Both terminals at P=0, so no flow
    EXPECT_NEAR(dn.getLinkFlow(101), 0.0, 1e-10);
}

// ============================================================================
// E-10: AchReport Tests
// ============================================================================

TEST(AchReportTest, TwoZoneModel) {
    Network net;

    // Outdoor (ambient)
    Node outdoor(0, "Outdoor", NodeType::Ambient);
    outdoor.setTemperature(273.15); // cold outside for stack effect
    net.addNode(outdoor);

    // Room 1 (50 m^3)
    Node room1(1, "Room1");
    room1.setTemperature(293.15);
    room1.setVolume(50.0);
    net.addNode(room1);

    // Room 2 (30 m^3)
    Node room2(2, "Room2");
    room2.setTemperature(293.15);
    room2.setVolume(30.0);
    net.addNode(room2);

    // Links: outdoor->room1, room1->room2, room2->outdoor
    Link l1(1, 0, 1, 0.5);
    l1.setFlowElement(std::make_unique<PowerLawOrifice>(0.003, 0.65));
    net.addLink(std::move(l1));

    Link l2(2, 1, 2, 1.5);
    l2.setFlowElement(std::make_unique<PowerLawOrifice>(0.002, 0.65));
    net.addLink(std::move(l2));

    Link l3(3, 2, 0, 2.5);
    l3.setFlowElement(std::make_unique<PowerLawOrifice>(0.003, 0.65));
    net.addLink(std::move(l3));

    // Solve airflow
    Solver solver;
    auto airResult = solver.solve(net);
    ASSERT_TRUE(airResult.converged);

    // Compute ACH
    auto achResults = AchReport::compute(net, airResult.massFlows);

    // Should have 2 zone results (room1 and room2)
    EXPECT_EQ(achResults.size(), 2u);

    for (const auto& r : achResults) {
        EXPECT_GT(r.volume, 0.0);
        // ACH should be non-negative
        EXPECT_GE(r.totalAch, 0.0);
        EXPECT_GE(r.mechanicalAch, 0.0);
        EXPECT_GE(r.infiltrationAch, 0.0);
    }

    // Format outputs should not be empty
    std::string text = AchReport::formatText(achResults);
    EXPECT_FALSE(text.empty());
    EXPECT_NE(text.find("Air Changes"), std::string::npos);

    std::string csv = AchReport::formatCsv(achResults);
    EXPECT_FALSE(csv.empty());
    EXPECT_NE(csv.find("ZoneId"), std::string::npos);
}

TEST(AchReportTest, EmptyNetwork) {
    Network net;
    Node outdoor(0, "Outdoor", NodeType::Ambient);
    outdoor.setTemperature(293.15);
    net.addNode(outdoor);

    std::vector<double> flows;
    auto results = AchReport::compute(net, flows);
    EXPECT_TRUE(results.empty()); // No non-ambient zones
}

// ============================================================================
// E-11: CsmReport Tests
// ============================================================================

TEST(CsmReportTest, BasicComputation) {
    Network net;

    Node outdoor(0, "Outdoor", NodeType::Ambient);
    outdoor.setTemperature(293.15);
    net.addNode(outdoor);

    Node room(1, "Room");
    room.setTemperature(293.15);
    room.setVolume(50.0);
    net.addNode(room);

    Link l1(1, 0, 1, 1.0);
    l1.setFlowElement(std::make_unique<PowerLawOrifice>(0.002, 0.65));
    net.addLink(std::move(l1));

    Link l2(2, 1, 0, 1.0);
    l2.setFlowElement(std::make_unique<PowerLawOrifice>(0.002, 0.65));
    net.addLink(std::move(l2));

    Species co2(0, "CO2", 0.044);
    Source src(1, 0, 1e-5);

    TransientConfig config;
    config.startTime = 0.0;
    config.endTime = 300.0;
    config.timeStep = 60.0;
    config.outputInterval = 60.0;

    TransientSimulation sim;
    sim.setConfig(config);
    sim.setSpecies({co2});
    sim.setSources({src});

    auto result = sim.run(net);
    ASSERT_TRUE(result.completed);
    ASSERT_GE(result.history.size(), 2u);

    // Compute CSM report
    auto csmResults = CsmReport::compute(net, {co2}, result.history);

    EXPECT_EQ(csmResults.size(), 1u); // one species
    EXPECT_EQ(csmResults[0].speciesName, "CO2");
    EXPECT_GE(csmResults[0].zones.size(), 1u);

    // Room should have non-zero average concentration (source was active)
    bool foundRoom = false;
    for (const auto& zr : csmResults[0].zones) {
        if (zr.zoneName == "Room") {
            foundRoom = true;
            EXPECT_GT(zr.avgConcentration, 0.0);
            EXPECT_GT(zr.peakConcentration, 0.0);
            EXPECT_GE(zr.peakTime, 0.0);
        }
    }
    EXPECT_TRUE(foundRoom);

    // Format outputs
    std::string text = CsmReport::formatText(csmResults);
    EXPECT_FALSE(text.empty());
    EXPECT_NE(text.find("Contaminant Summary"), std::string::npos);

    std::string csv = CsmReport::formatCsv(csmResults);
    EXPECT_FALSE(csv.empty());
    EXPECT_NE(csv.find("SpeciesId"), std::string::npos);
}

TEST(CsmReportTest, EmptyHistory) {
    Network net;
    Node outdoor(0, "Outdoor", NodeType::Ambient);
    outdoor.setTemperature(293.15);
    net.addNode(outdoor);

    std::vector<TimeStepResult> emptyHistory;
    auto results = CsmReport::compute(net, {}, emptyHistory);
    EXPECT_TRUE(results.empty());
}

TEST(CsmReportTest, MultiSpecies) {
    Network net;

    Node outdoor(0, "Outdoor", NodeType::Ambient);
    outdoor.setTemperature(293.15);
    net.addNode(outdoor);

    Node room(1, "Room");
    room.setTemperature(293.15);
    room.setVolume(50.0);
    net.addNode(room);

    Link l1(1, 0, 1, 1.0);
    l1.setFlowElement(std::make_unique<PowerLawOrifice>(0.002, 0.65));
    net.addLink(std::move(l1));

    Species co2(0, "CO2", 0.044);
    Species pm25(1, "PM2.5", 0.029);

    Source src1(1, 0, 1e-5);
    Source src2(1, 1, 5e-6);

    TransientConfig config;
    config.startTime = 0.0;
    config.endTime = 120.0;
    config.timeStep = 60.0;
    config.outputInterval = 60.0;

    TransientSimulation sim;
    sim.setConfig(config);
    sim.setSpecies({co2, pm25});
    sim.setSources({src1, src2});

    auto result = sim.run(net);
    ASSERT_TRUE(result.completed);

    auto csmResults = CsmReport::compute(net, {co2, pm25}, result.history);
    EXPECT_EQ(csmResults.size(), 2u);
    EXPECT_EQ(csmResults[0].speciesName, "CO2");
    EXPECT_EQ(csmResults[1].speciesName, "PM2.5");
}
