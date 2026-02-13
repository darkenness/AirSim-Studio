#include <gtest/gtest.h>
#include "control/Sensor.h"
#include "control/Controller.h"
#include "control/Actuator.h"
#include "core/Network.h"
#include "core/Solver.h"
#include "core/TransientSimulation.h"
#include "elements/PowerLawOrifice.h"
#include "elements/Damper.h"
#include <cmath>
#include <memory>

using namespace contam;

// ── Controller Unit Tests ────────────────────────────────────────────

TEST(ControllerTest, ProportionalOnly) {
    Controller ctrl(0, "P-ctrl", 0, 0, 100.0, 1.0, 0.0);
    // setpoint=100, Kp=1, Ki=0
    // sensor=80 → error=20 → output = 1*20 = 20, clamped to [0,1] → 1.0
    double out = ctrl.update(80.0, 1.0);
    EXPECT_DOUBLE_EQ(out, 1.0);  // saturated

    // sensor=99 → error=1 → output = 1*1 = 1.0
    ctrl.reset();
    out = ctrl.update(99.0, 1.0);
    EXPECT_DOUBLE_EQ(out, 1.0);

    // sensor=100.5 → error=-0.5 → output = -0.5, clamped to 0
    ctrl.reset();
    out = ctrl.update(100.5, 1.0);
    EXPECT_DOUBLE_EQ(out, 0.0);
}

TEST(ControllerTest, PIController) {
    Controller ctrl(0, "PI-ctrl", 0, 0, 1.0, 0.5, 0.1);
    // setpoint=1.0, Kp=0.5, Ki=0.1

    // First step: sensor=0.8, error=0.2, dt=1.0
    // integral = 0 + 0.2*1 = 0.2
    // raw = 0.5*0.2 + 0.1*0.2 = 0.1 + 0.02 = 0.12
    double out = ctrl.update(0.8, 1.0);
    EXPECT_NEAR(out, 0.12, 1e-10);

    // Second step: sensor=0.9, error=0.1, dt=1.0
    // integral = 0.2 + 0.1*1 = 0.3
    // raw = 0.5*0.1 + 0.1*0.3 = 0.05 + 0.03 = 0.08
    out = ctrl.update(0.9, 1.0);
    EXPECT_NEAR(out, 0.08, 1e-10);
}

TEST(ControllerTest, Deadband) {
    Controller ctrl(0, "DB-ctrl", 0, 0, 100.0, 1.0, 0.0, 5.0);
    // deadband=5, setpoint=100

    // sensor=97 → error=3, within deadband → treated as 0
    double out = ctrl.update(97.0, 1.0);
    EXPECT_DOUBLE_EQ(out, 0.0);

    // sensor=90 → error=10, outside deadband
    ctrl.reset();
    out = ctrl.update(90.0, 1.0);
    EXPECT_GT(out, 0.0);
}

TEST(ControllerTest, OutputClamping) {
    Controller ctrl(0, "clamp", 0, 0, 100.0, 10.0, 0.0);
    // Large gain → output saturates
    double out = ctrl.update(0.0, 1.0);  // error=100, raw=1000
    EXPECT_DOUBLE_EQ(out, 1.0);  // clamped to max

    ctrl.reset();
    out = ctrl.update(200.0, 1.0);  // error=-100, raw=-1000
    EXPECT_DOUBLE_EQ(out, 0.0);  // clamped to min
}

TEST(ControllerTest, Reset) {
    Controller ctrl(0, "reset", 0, 0, 1.0, 0.5, 0.1);
    ctrl.update(0.5, 1.0);
    ctrl.update(0.7, 1.0);
    EXPECT_NE(ctrl.output, 0.0);
    ctrl.reset();
    EXPECT_DOUBLE_EQ(ctrl.output, 0.0);
    EXPECT_DOUBLE_EQ(ctrl.integral, 0.0);
}

// ── Sensor Tests ─────────────────────────────────────────────────────

TEST(SensorTest, BasicConstruction) {
    Sensor s(0, "CO2_sensor", SensorType::Concentration, 1, 0);
    EXPECT_EQ(s.id, 0);
    EXPECT_EQ(s.type, SensorType::Concentration);
    EXPECT_EQ(s.targetId, 1);
    EXPECT_EQ(s.speciesIdx, 0);
    EXPECT_DOUBLE_EQ(s.lastReading, 0.0);
}

// ── Actuator Tests ───────────────────────────────────────────────────

TEST(ActuatorTest, BasicConstruction) {
    Actuator a(0, "Damper_act", ActuatorType::DamperFraction, 2);
    EXPECT_EQ(a.id, 0);
    EXPECT_EQ(a.type, ActuatorType::DamperFraction);
    EXPECT_EQ(a.linkIdx, 2);
    EXPECT_DOUBLE_EQ(a.currentValue, 0.0);
}

// ── Integration: Control Loop in Transient Simulation ────────────────

TEST(ControlIntegrationTest, DamperControlLoop) {
    // Setup: Room with CO2 source, damper controlled by CO2 sensor
    // When CO2 rises above setpoint, damper opens to ventilate
    Network net;

    Node outdoor(0, "Outdoor", NodeType::Ambient);
    outdoor.setTemperature(283.15);
    net.addNode(outdoor);

    Node room(1, "Room");
    room.setTemperature(293.15);
    room.setVolume(30.0);
    net.addNode(room);

    // Inlet crack (always open)
    Link l1(1, 0, 1, 0.5);
    l1.setFlowElement(std::make_unique<PowerLawOrifice>(0.003, 0.65));
    net.addLink(std::move(l1));

    // Outlet damper (controlled by CO2 level)
    Link l2(2, 1, 0, 2.5);
    l2.setFlowElement(std::make_unique<Damper>(0.005, 0.65, 0.1));  // starts mostly closed
    net.addLink(std::move(l2));

    // Species: CO2
    Species co2(0, "CO2", 0.044, 0.0, 7.2e-4);

    // Source: constant CO2 in room
    Source src(1, 0, 5e-6);

    // Control: sensor reads CO2 in room → controller → damper actuator
    Sensor sensor(0, "CO2_sensor", SensorType::Concentration, 1, 0);
    Controller ctrl(0, "CO2_ctrl", 0, 0, 0.001, 500.0, 10.0);  // setpoint=0.001 kg/m³
    Actuator act(0, "Damper_act", ActuatorType::DamperFraction, 1);  // link index 1 = damper

    TransientSimulation sim;
    TransientConfig config;
    config.startTime = 0;
    config.endTime = 1800;  // 30 minutes
    config.timeStep = 30;
    config.outputInterval = 300;  // every 5 min

    sim.setConfig(config);
    sim.setSpecies({co2});
    sim.setSources({src});
    sim.setSensors({sensor});
    sim.setControllers({ctrl});
    sim.setActuators({act});

    auto result = sim.run(net);
    EXPECT_TRUE(result.completed);
    EXPECT_GE(result.history.size(), 2);

    // CO2 should have changed over time
    if (result.history.size() >= 2) {
        double co2_start = result.history[0].contaminant.concentrations[1][0];
        double co2_end = result.history.back().contaminant.concentrations[1][0];
        // CO2 should have risen from initial (0) due to source
        EXPECT_GT(co2_end, co2_start);
    }
}
