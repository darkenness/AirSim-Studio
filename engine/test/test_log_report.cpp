#include <gtest/gtest.h>
#include "io/LogReport.h"
#include "control/Sensor.h"
#include "control/Controller.h"
#include "control/Actuator.h"
#include <cmath>
#include <sstream>

using namespace contam;

// ── LogReport::capture ──────────────────────────────────────────────

TEST(LogReportTest, CaptureEmptyControlSystem) {
    auto snap = LogReport::capture(0.0, {}, {}, {});
    EXPECT_DOUBLE_EQ(snap.time, 0.0);
    EXPECT_TRUE(snap.sensorValues.empty());
    EXPECT_TRUE(snap.controllerOutputs.empty());
    EXPECT_TRUE(snap.controllerErrors.empty());
    EXPECT_TRUE(snap.actuatorValues.empty());
    EXPECT_TRUE(snap.logicNodeValues.empty());
}

TEST(LogReportTest, CaptureSingleSensorControllerActuator) {
    Sensor s(0, "CO2_sens", SensorType::Concentration, 1, 0);
    s.lastReading = 0.0012;

    Controller c(0, "PI_ctrl", 0, 0, 0.001, 1.0, 0.1);
    c.output = 0.75;
    c.prevError = 0.0002;

    Actuator a(0, "Damper1", ActuatorType::DamperFraction, 1);
    a.currentValue = 0.75;

    auto snap = LogReport::capture(60.0, {s}, {c}, {a});

    EXPECT_DOUBLE_EQ(snap.time, 60.0);
    ASSERT_EQ(snap.sensorValues.size(), 1u);
    EXPECT_DOUBLE_EQ(snap.sensorValues[0], 0.0012);
    ASSERT_EQ(snap.controllerOutputs.size(), 1u);
    EXPECT_DOUBLE_EQ(snap.controllerOutputs[0], 0.75);
    ASSERT_EQ(snap.controllerErrors.size(), 1u);
    EXPECT_DOUBLE_EQ(snap.controllerErrors[0], 0.0002);
    ASSERT_EQ(snap.actuatorValues.size(), 1u);
    EXPECT_DOUBLE_EQ(snap.actuatorValues[0], 0.75);
}

TEST(LogReportTest, CaptureWithLogicNodes) {
    std::vector<double> logicVals = {1.0, 0.0, 42.5};
    auto snap = LogReport::capture(120.0, {}, {}, {}, logicVals);

    ASSERT_EQ(snap.logicNodeValues.size(), 3u);
    EXPECT_DOUBLE_EQ(snap.logicNodeValues[0], 1.0);
    EXPECT_DOUBLE_EQ(snap.logicNodeValues[1], 0.0);
    EXPECT_DOUBLE_EQ(snap.logicNodeValues[2], 42.5);
}

// ── LogReport::buildColumnInfo ──────────────────────────────────────

TEST(LogReportTest, BuildColumnInfo) {
    Sensor s1(0, "TempSens", SensorType::Temperature, 0);
    Sensor s2(1, "FlowSens", SensorType::MassFlow, 0);
    Controller c(0, "Ctrl1", 0, 0, 20.0, 1.0);
    Actuator a(0, "Fan1", ActuatorType::FanSpeed, 0);

    auto info = LogReport::buildColumnInfo({s1, s2}, {c}, {a}, {"AND_1", "SUM_2"});

    ASSERT_EQ(info.sensorNames.size(), 2u);
    EXPECT_EQ(info.sensorNames[0], "TempSens");
    EXPECT_EQ(info.sensorNames[1], "FlowSens");
    EXPECT_EQ(info.sensorTypes[0], SensorType::Temperature);
    EXPECT_EQ(info.sensorTypes[1], SensorType::MassFlow);

    ASSERT_EQ(info.controllerNames.size(), 1u);
    EXPECT_EQ(info.controllerNames[0], "Ctrl1");

    ASSERT_EQ(info.actuatorNames.size(), 1u);
    EXPECT_EQ(info.actuatorNames[0], "Fan1");
    EXPECT_EQ(info.actuatorTypes[0], ActuatorType::FanSpeed);

    ASSERT_EQ(info.logicNodeNames.size(), 2u);
    EXPECT_EQ(info.logicNodeNames[0], "AND_1");
    EXPECT_EQ(info.logicNodeNames[1], "SUM_2");
}

// ── Type string helpers ─────────────────────────────────────────────

TEST(LogReportTest, SensorTypeStr) {
    EXPECT_EQ(LogReport::sensorTypeStr(SensorType::Concentration), "Conc");
    EXPECT_EQ(LogReport::sensorTypeStr(SensorType::Pressure), "Press");
    EXPECT_EQ(LogReport::sensorTypeStr(SensorType::Temperature), "Temp");
    EXPECT_EQ(LogReport::sensorTypeStr(SensorType::MassFlow), "Flow");
}

TEST(LogReportTest, ActuatorTypeStr) {
    EXPECT_EQ(LogReport::actuatorTypeStr(ActuatorType::DamperFraction), "Damper");
    EXPECT_EQ(LogReport::actuatorTypeStr(ActuatorType::FanSpeed), "Fan");
    EXPECT_EQ(LogReport::actuatorTypeStr(ActuatorType::FilterBypass), "Filter");
}

// ── CSV format ──────────────────────────────────────────────────────

TEST(LogReportTest, FormatCsvHeaderAndRows) {
    Sensor s(0, "CO2", SensorType::Concentration, 1, 0);
    s.lastReading = 0.001;
    Controller c(0, "PCtrl", 0, 0, 0.001, 1.0);
    c.output = 0.5;
    c.prevError = 0.0;
    Actuator a(0, "Dmp", ActuatorType::DamperFraction, 0);
    a.currentValue = 0.5;

    auto info = LogReport::buildColumnInfo({s}, {c}, {a});

    std::vector<LogSnapshot> snaps;
    snaps.push_back(LogReport::capture(0.0, {s}, {c}, {a}));

    // Advance state
    s.lastReading = 0.0015;
    c.output = 0.8;
    c.prevError = -0.0005;
    a.currentValue = 0.8;
    snaps.push_back(LogReport::capture(60.0, {s}, {c}, {a}));

    std::string csv = LogReport::formatCsv(snaps, info);

    // Check header
    EXPECT_NE(csv.find("Time_s"), std::string::npos);
    EXPECT_NE(csv.find("CO2_Conc"), std::string::npos);
    EXPECT_NE(csv.find("PCtrl_output"), std::string::npos);
    EXPECT_NE(csv.find("PCtrl_error"), std::string::npos);
    EXPECT_NE(csv.find("Dmp_Damper"), std::string::npos);

    // Check we have 3 lines (header + 2 data rows)
    std::istringstream iss(csv);
    std::string line;
    int lineCount = 0;
    while (std::getline(iss, line)) {
        if (!line.empty()) lineCount++;
    }
    EXPECT_EQ(lineCount, 3);
}

TEST(LogReportTest, FormatCsvWithLogicNodes) {
    auto info = LogReport::buildColumnInfo({}, {}, {}, {"AND_1", "SUM_2"});

    LogSnapshot snap;
    snap.time = 0.0;
    snap.logicNodeValues = {1.0, 25.5};

    std::string csv = LogReport::formatCsv({snap}, info);

    EXPECT_NE(csv.find("AND_1"), std::string::npos);
    EXPECT_NE(csv.find("SUM_2"), std::string::npos);
    EXPECT_NE(csv.find("25.5"), std::string::npos);
}

// ── Text format ─────────────────────────────────────────────────────

TEST(LogReportTest, FormatTextHeader) {
    Sensor s(0, "Pres", SensorType::Pressure, 0);
    s.lastReading = 5.0;
    Actuator a(0, "Fan1", ActuatorType::FanSpeed, 0);
    a.currentValue = 0.9;

    auto info = LogReport::buildColumnInfo({s}, {}, {a});
    auto snap = LogReport::capture(0.0, {s}, {}, {a});

    std::string txt = LogReport::formatText({snap}, info);

    EXPECT_NE(txt.find("=== Control Node Log Report ==="), std::string::npos);
    EXPECT_NE(txt.find("Pres(Press)"), std::string::npos);
    EXPECT_NE(txt.find("Fan1(Fan)"), std::string::npos);
    EXPECT_NE(txt.find("Time(s)"), std::string::npos);
}

// ── Multi-step time series ──────────────────────────────────────────

TEST(LogReportTest, MultiStepTimeSeries) {
    Sensor s(0, "CO2", SensorType::Concentration, 1, 0);
    Controller c(0, "PI", 0, 0, 0.001, 0.5, 0.1);
    Actuator a(0, "Dmp", ActuatorType::DamperFraction, 1);

    auto info = LogReport::buildColumnInfo({s}, {c}, {a});

    std::vector<LogSnapshot> snaps;

    // Simulate 5 time steps with controller updating
    double sensorVal = 0.0005;
    for (int i = 0; i < 5; ++i) {
        s.lastReading = sensorVal;
        c.update(sensorVal, 60.0);
        a.currentValue = c.output;

        snaps.push_back(LogReport::capture(i * 60.0, {s}, {c}, {a}));
        sensorVal += 0.0002;
    }

    ASSERT_EQ(snaps.size(), 5u);

    // Verify time progression
    EXPECT_DOUBLE_EQ(snaps[0].time, 0.0);
    EXPECT_DOUBLE_EQ(snaps[4].time, 240.0);

    // Verify sensor values track input
    EXPECT_DOUBLE_EQ(snaps[0].sensorValues[0], 0.0005);
    EXPECT_NEAR(snaps[4].sensorValues[0], 0.0013, 1e-10);

    // Controller output should be consistent with actuator
    for (const auto& snap : snaps) {
        EXPECT_DOUBLE_EQ(snap.controllerOutputs[0], snap.actuatorValues[0]);
    }

    // CSV should have 6 lines (header + 5 data)
    std::string csv = LogReport::formatCsv(snaps, info);
    std::istringstream iss(csv);
    std::string line;
    int lineCount = 0;
    while (std::getline(iss, line)) {
        if (!line.empty()) lineCount++;
    }
    EXPECT_EQ(lineCount, 6);
}

// ── Multiple sensors/controllers/actuators ──────────────────────────

TEST(LogReportTest, MultipleComponents) {
    Sensor s1(0, "CO2", SensorType::Concentration, 1, 0);
    s1.lastReading = 0.001;
    Sensor s2(1, "Temp", SensorType::Temperature, 1);
    s2.lastReading = 293.15;

    Controller c1(0, "CO2_ctrl", 0, 0, 0.001, 1.0);
    c1.output = 0.6;
    c1.prevError = -0.0001;
    Controller c2(1, "Temp_ctrl", 1, 1, 293.0, 0.5);
    c2.output = 0.3;
    c2.prevError = 0.15;

    Actuator a1(0, "Damper", ActuatorType::DamperFraction, 0);
    a1.currentValue = 0.6;
    Actuator a2(1, "Fan", ActuatorType::FanSpeed, 1);
    a2.currentValue = 0.3;

    auto info = LogReport::buildColumnInfo({s1, s2}, {c1, c2}, {a1, a2});
    auto snap = LogReport::capture(0.0, {s1, s2}, {c1, c2}, {a1, a2});

    ASSERT_EQ(snap.sensorValues.size(), 2u);
    ASSERT_EQ(snap.controllerOutputs.size(), 2u);
    ASSERT_EQ(snap.controllerErrors.size(), 2u);
    ASSERT_EQ(snap.actuatorValues.size(), 2u);

    // CSV header should contain all column names
    std::string csv = LogReport::formatCsv({snap}, info);
    EXPECT_NE(csv.find("CO2_Conc"), std::string::npos);
    EXPECT_NE(csv.find("Temp_Temp"), std::string::npos);
    EXPECT_NE(csv.find("CO2_ctrl_output"), std::string::npos);
    EXPECT_NE(csv.find("Temp_ctrl_output"), std::string::npos);
    EXPECT_NE(csv.find("Damper_Damper"), std::string::npos);
    EXPECT_NE(csv.find("Fan_Fan"), std::string::npos);
}

// ── Empty snapshots produce header-only output ──────────────────────

TEST(LogReportTest, EmptySnapshotsProduceHeaderOnly) {
    Sensor s(0, "S1", SensorType::Pressure, 0);
    auto info = LogReport::buildColumnInfo({s}, {}, {});

    std::string csv = LogReport::formatCsv({}, info);
    // Should have just the header line
    std::istringstream iss(csv);
    std::string line;
    int lineCount = 0;
    while (std::getline(iss, line)) {
        if (!line.empty()) lineCount++;
    }
    EXPECT_EQ(lineCount, 1);
    EXPECT_NE(csv.find("Time_s"), std::string::npos);
    EXPECT_NE(csv.find("S1_Press"), std::string::npos);
}
