#include <gtest/gtest.h>
#include "core/Species.h"
#include "core/Schedule.h"
#include "core/ContaminantSolver.h"
#include "core/TransientSimulation.h"
#include "core/Network.h"
#include "elements/PowerLawOrifice.h"
#include <cmath>

using namespace contam;

// ── Schedule Tests ───────────────────────────────────────────────────

TEST(ScheduleTest, EmptyScheduleReturnsOne) {
    Schedule s(1, "empty");
    EXPECT_DOUBLE_EQ(s.getValue(0.0), 1.0);
    EXPECT_DOUBLE_EQ(s.getValue(100.0), 1.0);
}

TEST(ScheduleTest, SinglePointReturnsConstant) {
    Schedule s(1, "const");
    s.addPoint(0.0, 0.5);
    EXPECT_DOUBLE_EQ(s.getValue(-10.0), 0.5);
    EXPECT_DOUBLE_EQ(s.getValue(0.0), 0.5);
    EXPECT_DOUBLE_EQ(s.getValue(100.0), 0.5);
}

TEST(ScheduleTest, LinearInterpolation) {
    Schedule s(1, "ramp");
    s.addPoint(0.0, 0.0);
    s.addPoint(100.0, 1.0);

    EXPECT_NEAR(s.getValue(50.0), 0.5, 1e-12);
    EXPECT_NEAR(s.getValue(25.0), 0.25, 1e-12);
    EXPECT_NEAR(s.getValue(75.0), 0.75, 1e-12);
}

TEST(ScheduleTest, StepSchedule) {
    Schedule s(1, "step");
    s.addPoint(0.0, 0.0);
    s.addPoint(60.0, 0.0);
    s.addPoint(60.0001, 1.0);  // near-instant step at t=60
    s.addPoint(120.0, 1.0);

    EXPECT_NEAR(s.getValue(30.0), 0.0, 1e-6);
    EXPECT_NEAR(s.getValue(90.0), 1.0, 1e-3);
}

TEST(ScheduleTest, BeyondRange) {
    Schedule s(1, "bounded");
    s.addPoint(10.0, 0.5);
    s.addPoint(20.0, 1.0);

    EXPECT_DOUBLE_EQ(s.getValue(5.0), 0.5);   // before first
    EXPECT_DOUBLE_EQ(s.getValue(25.0), 1.0);   // after last
}

// ── ContaminantSolver Tests ──────────────────────────────────────────

class ContaminantTest : public ::testing::Test {
protected:
    Network buildTwoRoomNetwork() {
        Network net;

        // Outdoor (ambient)
        Node outdoor(0, "Outdoor", NodeType::Ambient);
        outdoor.setTemperature(293.15);
        net.addNode(outdoor);

        // Room (50 m³)
        Node room(1, "Room");
        room.setTemperature(293.15);
        room.setVolume(50.0);
        net.addNode(room);

        // Link: outdoor -> room (crack)
        Link l1(1, 0, 1, 1.5);
        l1.setFlowElement(std::make_unique<PowerLawOrifice>(0.002, 0.65));
        net.addLink(std::move(l1));

        // Link: room -> outdoor (crack)
        Link l2(2, 1, 0, 1.5);
        l2.setFlowElement(std::make_unique<PowerLawOrifice>(0.002, 0.65));
        net.addLink(std::move(l2));

        return net;
    }
};

TEST_F(ContaminantTest, ZeroSourceZeroConcentration) {
    auto network = buildTwoRoomNetwork();

    // Solve airflow first
    Solver solver;
    solver.solve(network);

    // Setup: one species (CO2), no sources, zero initial/outdoor concentration
    Species co2(0, "CO2", 0.044, 0.0, 0.0);

    ContaminantSolver contSolver;
    contSolver.setSpecies({co2});
    contSolver.setSources({});
    contSolver.initialize(network);

    // Step forward
    auto result = contSolver.step(network, 0.0, 60.0);

    // With no sources and zero initial, concentrations should remain zero
    EXPECT_EQ(result.concentrations.size(), 2);
    EXPECT_NEAR(result.concentrations[1][0], 0.0, 1e-15);
}

TEST_F(ContaminantTest, ConstantSourceBuildUp) {
    auto network = buildTwoRoomNetwork();

    Solver solver;
    solver.solve(network);

    // CO2 with constant source in room
    Species co2(0, "CO2", 0.044, 0.0, 0.0);
    Source src(1, 0, 1e-5);  // 10 µg/s generation in room (node 1)

    ContaminantSolver contSolver;
    contSolver.setSpecies({co2});
    contSolver.setSources({src});
    contSolver.initialize(network);

    // Step forward 60 seconds
    auto result = contSolver.step(network, 0.0, 60.0);

    // Concentration should increase from zero
    EXPECT_GT(result.concentrations[1][0], 0.0);

    // Step forward more - concentration should keep increasing
    double prevConc = result.concentrations[1][0];
    result = contSolver.step(network, 60.0, 60.0);
    EXPECT_GT(result.concentrations[1][0], prevConc);
}

TEST_F(ContaminantTest, OutdoorConcentrationPenetrates) {
    // Need temperature difference to drive airflow through the room
    Network net;

    Node outdoor(0, "Outdoor", NodeType::Ambient);
    outdoor.setTemperature(273.15);  // 0°C cold outside
    net.addNode(outdoor);

    Node room(1, "Room");
    room.setTemperature(293.15);  // 20°C warm inside
    room.setVolume(50.0);
    room.setElevation(0.0);
    net.addNode(room);

    // Low crack at bottom (inflow from stack effect)
    Link l1(1, 0, 1, 0.5);
    l1.setFlowElement(std::make_unique<PowerLawOrifice>(0.002, 0.65));
    net.addLink(std::move(l1));

    // High crack at top (outflow from stack effect)
    Link l2(2, 1, 0, 3.0);
    l2.setFlowElement(std::make_unique<PowerLawOrifice>(0.002, 0.65));
    net.addLink(std::move(l2));

    Solver solver;
    auto airResult = solver.solve(net);
    ASSERT_TRUE(airResult.converged);

    // CO2 with outdoor background
    double outdoorCO2 = 7.2e-4;
    Species co2(0, "CO2", 0.044, 0.0, outdoorCO2);

    ContaminantSolver contSolver;
    contSolver.setSpecies({co2});
    contSolver.setSources({});
    contSolver.initialize(net);

    // Room starts at 0, outdoor at 7.2e-4
    // Stack effect drives flow through room, carrying outdoor CO2
    double t = 0.0;
    for (int i = 0; i < 2000; ++i) {
        contSolver.step(net, t, 60.0);
        t += 60.0;
    }

    auto conc = contSolver.getConcentrations();
    // After many steps, room concentration should approach outdoor
    EXPECT_NEAR(conc[1][0], outdoorCO2, outdoorCO2 * 0.15);
}

TEST_F(ContaminantTest, DecayReducesConcentration) {
    auto network = buildTwoRoomNetwork();

    Solver solver;
    solver.solve(network);

    // Species with high decay rate, no outdoor conc
    Species decaying(0, "Radon", 0.222, 0.01, 0.0);  // decay = 0.01/s

    ContaminantSolver contSolver;
    contSolver.setSpecies({decaying});
    contSolver.setSources({});
    contSolver.initialize(network);

    // Set initial room concentration
    contSolver.setInitialConcentration(1, 0, 1.0);

    // Step forward - concentration should decrease due to decay
    contSolver.step(network, 0.0, 10.0);
    auto conc = contSolver.getConcentrations();
    EXPECT_LT(conc[1][0], 1.0);
    EXPECT_GT(conc[1][0], 0.0);
}

// ── TransientSimulation Tests ────────────────────────────────────────

TEST_F(ContaminantTest, TransientSimulationRuns) {
    auto network = buildTwoRoomNetwork();

    Species co2(0, "CO2", 0.044, 0.0, 0.0);
    Source src(1, 0, 1e-5);  // constant source in room

    TransientConfig config;
    config.startTime = 0.0;
    config.endTime = 300.0;    // 5 minutes
    config.timeStep = 60.0;
    config.outputInterval = 60.0;

    TransientSimulation sim;
    sim.setConfig(config);
    sim.setSpecies({co2});
    sim.setSources({src});

    auto result = sim.run(network);

    EXPECT_TRUE(result.completed);
    // Should have 6 output points: t=0, 60, 120, 180, 240, 300
    EXPECT_GE(result.history.size(), 5);

    // Concentrations should be monotonically increasing
    for (size_t i = 1; i < result.history.size(); ++i) {
        auto& prev = result.history[i - 1].contaminant.concentrations;
        auto& curr = result.history[i].contaminant.concentrations;
        if (!prev.empty() && !curr.empty() && prev[1].size() > 0 && curr[1].size() > 0) {
            EXPECT_GE(curr[1][0], prev[1][0]);
        }
    }
}

TEST_F(ContaminantTest, TransientWithSchedule) {
    auto network = buildTwoRoomNetwork();

    Species co2(0, "CO2", 0.044, 0.0, 0.0);

    // Source that turns on at t=60
    Schedule onAt60(1, "delayed_on");
    onAt60.addPoint(0.0, 0.0);
    onAt60.addPoint(59.0, 0.0);
    onAt60.addPoint(60.0, 1.0);
    onAt60.addPoint(300.0, 1.0);

    Source src(1, 0, 1e-5, 0.0, 1);  // generation with schedule ID=1

    TransientConfig config;
    config.startTime = 0.0;
    config.endTime = 300.0;
    config.timeStep = 30.0;
    config.outputInterval = 60.0;

    TransientSimulation sim;
    sim.setConfig(config);
    sim.setSpecies({co2});
    sim.setSources({src});
    sim.setSchedules({{1, onAt60}});

    auto result = sim.run(network);

    EXPECT_TRUE(result.completed);

    // At t=0, concentration should be 0
    if (!result.history.empty() && !result.history[0].contaminant.concentrations.empty()) {
        EXPECT_NEAR(result.history[0].contaminant.concentrations[1][0], 0.0, 1e-15);
    }
}
