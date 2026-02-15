#include <gtest/gtest.h>
#include "io/CvfReader.h"
#include "io/WpcReader.h"
#include "io/CbwReport.h"
#include "core/Schedule.h"
#include "core/TransientSimulation.h"
#include <cmath>

using namespace contam;

// ── Schedule InterpolationMode ───────────────────────────────────────

TEST(ScheduleInterp, LinearMode) {
    Schedule s(1, "linear");
    s.setInterpolationMode(InterpolationMode::Linear);
    s.addPoint(0.0, 0.0);
    s.addPoint(100.0, 10.0);
    EXPECT_NEAR(s.getValue(50.0), 5.0, 1e-10);
    EXPECT_NEAR(s.getValue(0.0), 0.0, 1e-10);
    EXPECT_NEAR(s.getValue(100.0), 10.0, 1e-10);
}

TEST(ScheduleInterp, StepHoldMode) {
    Schedule s(2, "step");
    s.setInterpolationMode(InterpolationMode::StepHold);
    s.addPoint(0.0, 1.0);
    s.addPoint(100.0, 5.0);
    s.addPoint(200.0, 3.0);
    // Between 0 and 100, should hold at 1.0
    EXPECT_NEAR(s.getValue(50.0), 1.0, 1e-10);
    EXPECT_NEAR(s.getValue(99.9), 1.0, 1e-10);
    // At exact boundary 100, step-hold still returns current interval's value
    EXPECT_NEAR(s.getValue(100.0), 1.0, 1e-10);
    // Just past 100, enters next interval → holds at 5.0
    EXPECT_NEAR(s.getValue(100.1), 5.0, 1e-10);
    // Between 100 and 200, should hold at 5.0
    EXPECT_NEAR(s.getValue(150.0), 5.0, 1e-10);
    // Before first point
    EXPECT_NEAR(s.getValue(-10.0), 1.0, 1e-10);
    // After last point
    EXPECT_NEAR(s.getValue(300.0), 3.0, 1e-10);
}

// ── CvfReader ────────────────────────────────────────────────────────

TEST(CvfReader, SingleColumn) {
    std::string content =
        "# test CVF\n"
        "0.0   0.0\n"
        "3600.0  1.0\n"
        "7200.0  0.5\n";
    auto sched = CvfReader::readFromString(content, 10, "test_cvf");
    EXPECT_EQ(sched.id, 10);
    EXPECT_EQ(sched.name, "test_cvf");
    EXPECT_EQ(sched.getInterpolationMode(), InterpolationMode::Linear);
    EXPECT_NEAR(sched.getValue(0.0), 0.0, 1e-10);
    EXPECT_NEAR(sched.getValue(1800.0), 0.5, 1e-10);  // midpoint linear
    EXPECT_NEAR(sched.getValue(3600.0), 1.0, 1e-10);
    EXPECT_NEAR(sched.getValue(5400.0), 0.75, 1e-10); // midpoint 1.0->0.5
}

TEST(CvfReader, MultiColumn) {
    std::string content =
        "0.0   10.0  20.0\n"
        "100.0 30.0  40.0\n";
    auto scheds = CvfReader::readMultiColumnFromString(content, 100);
    ASSERT_EQ(scheds.size(), 2u);
    EXPECT_NEAR(scheds[0].getValue(50.0), 20.0, 1e-10);
    EXPECT_NEAR(scheds[1].getValue(50.0), 30.0, 1e-10);
}

TEST(CvfReader, CommentsAndBlanks) {
    std::string content =
        "# header\n"
        "\n"
        "  # another comment\n"
        "0.0  5.0\n"
        "\n"
        "100.0  10.0\n";
    auto sched = CvfReader::readFromString(content, 1);
    EXPECT_NEAR(sched.getValue(0.0), 5.0, 1e-10);
    EXPECT_NEAR(sched.getValue(100.0), 10.0, 1e-10);
}

TEST(CvfReader, NonMonotonicThrows) {
    std::string content =
        "0.0  1.0\n"
        "100.0  2.0\n"
        "50.0  3.0\n";  // time goes backwards
    EXPECT_THROW(CvfReader::readFromString(content, 1), std::runtime_error);
}

// ── DvfReader ────────────────────────────────────────────────────────

TEST(DvfReader, StepHoldBehavior) {
    std::string content =
        "0.0   1.0\n"
        "3600.0  0.0\n"
        "7200.0  1.0\n";
    auto sched = DvfReader::readFromString(content, 20, "occupancy");
    EXPECT_EQ(sched.getInterpolationMode(), InterpolationMode::StepHold);
    EXPECT_NEAR(sched.getValue(1800.0), 1.0, 1e-10);  // holds at 1.0
    EXPECT_NEAR(sched.getValue(3600.0), 1.0, 1e-10);  // exact boundary, still holds previous
    EXPECT_NEAR(sched.getValue(3600.1), 0.0, 1e-10);  // just past boundary, steps to 0.0
    EXPECT_NEAR(sched.getValue(5400.0), 0.0, 1e-10);  // holds at 0.0
}

TEST(DvfReader, MultiColumn) {
    std::string content =
        "0.0   1.0  0.0\n"
        "100.0 0.0  1.0\n";
    auto scheds = DvfReader::readMultiColumnFromString(content, 200);
    ASSERT_EQ(scheds.size(), 2u);
    EXPECT_EQ(scheds[0].getInterpolationMode(), InterpolationMode::StepHold);
    EXPECT_NEAR(scheds[0].getValue(50.0), 1.0, 1e-10);  // step hold
    EXPECT_NEAR(scheds[1].getValue(50.0), 0.0, 1e-10);  // step hold
}

// ── WpcReader ────────────────────────────────────────────────────────

TEST(WpcReader, PressureParse) {
    std::string content =
        "# WPC pressure: time open0 open1 open2\n"
        "0.0    10.0  20.0  30.0\n"
        "3600.0 15.0  25.0  35.0\n";
    auto records = WpcReader::readPressureString(content);
    ASSERT_EQ(records.size(), 2u);
    ASSERT_EQ(records[0].pressures.size(), 3u);
    EXPECT_NEAR(records[0].pressures[0], 10.0, 1e-10);
    EXPECT_NEAR(records[1].pressures[2], 35.0, 1e-10);
}

TEST(WpcReader, PressureInterpolation) {
    std::string content =
        "0.0    0.0  100.0\n"
        "100.0  50.0  0.0\n";
    auto records = WpcReader::readPressureString(content);
    auto p = WpcReader::interpolatePressure(records, 50.0);
    ASSERT_EQ(p.size(), 2u);
    EXPECT_NEAR(p[0], 25.0, 1e-10);
    EXPECT_NEAR(p[1], 50.0, 1e-10);
}

TEST(WpcReader, ConcentrationParse) {
    // 2 openings, 2 species: columns = time, o0s0, o0s1, o1s0, o1s1
    std::string content =
        "0.0    1.0 2.0 3.0 4.0\n"
        "100.0  5.0 6.0 7.0 8.0\n";
    auto records = WpcReader::readConcentrationString(content, 2, 2);
    ASSERT_EQ(records.size(), 2u);
    EXPECT_NEAR(records[0].concentrations[0][0], 1.0, 1e-10);
    EXPECT_NEAR(records[0].concentrations[0][1], 2.0, 1e-10);
    EXPECT_NEAR(records[0].concentrations[1][0], 3.0, 1e-10);
    EXPECT_NEAR(records[0].concentrations[1][1], 4.0, 1e-10);
}

// ── CbwReport ────────────────────────────────────────────────────────

TEST(CbwReport, EmptyResult) {
    TransientResult result;
    result.completed = true;
    std::vector<Species> species;
    auto stats = CbwReport::compute(result, species, 0);
    EXPECT_TRUE(stats.empty());
}

TEST(CbwReport, SingleDayStats) {
    // Build a 24h result with known concentration pattern
    TransientResult result;
    result.completed = true;

    Species sp;
    sp.name = "CO2";
    sp.molarMass = 0.044;
    sp.isTrace = true;
    std::vector<Species> species = {sp};

    // 25 hourly steps (0h to 24h), zone 0, species 0
    // Values: 0, 1, 2, ..., 24 (concentration = hour index)
    for (int h = 0; h <= 24; ++h) {
        TimeStepResult step;
        step.time = h * 3600.0;
        step.contaminant.time = step.time;
        step.contaminant.concentrations = {{static_cast<double>(h)}};
        result.history.push_back(step);
    }

    auto stats = CbwReport::compute(result, species, 1);
    ASSERT_EQ(stats.size(), 1u);
    EXPECT_EQ(stats[0].dayIndex, 0);
    EXPECT_EQ(stats[0].zoneIndex, 0);
    EXPECT_EQ(stats[0].speciesIndex, 0);
    EXPECT_NEAR(stats[0].minimum, 0.0, 1e-10);
    EXPECT_NEAR(stats[0].maximum, 23.0, 1e-10);
    EXPECT_NEAR(stats[0].mean, 11.5, 1e-10);
    EXPECT_NEAR(stats[0].median, 11.5, 1e-10);
}

TEST(CbwReport, MultiDay) {
    TransientResult result;
    result.completed = true;

    Species sp;
    sp.name = "PM25";
    sp.molarMass = 0.0;
    sp.isTrace = true;
    std::vector<Species> species = {sp};

    // 48h: day 0 (hours 0-23) all 10.0, day 1 (hours 24-47) all 20.0
    for (int h = 0; h < 48; ++h) {
        TimeStepResult step;
        step.time = h * 3600.0;
        step.contaminant.time = step.time;
        double val = (h < 24) ? 10.0 : 20.0;
        step.contaminant.concentrations = {{val}};
        result.history.push_back(step);
    }

    auto stats = CbwReport::compute(result, species, 1);
    ASSERT_EQ(stats.size(), 2u);
    EXPECT_EQ(stats[0].dayIndex, 0);
    EXPECT_NEAR(stats[0].mean, 10.0, 1e-10);
    EXPECT_EQ(stats[1].dayIndex, 1);
    EXPECT_NEAR(stats[1].mean, 20.0, 1e-10);
}

TEST(CbwReport, QuartilesKnownData) {
    // 5 values: 1, 2, 3, 4, 5 → Q1=2, median=3, Q3=4
    TransientResult result;
    result.completed = true;

    Species sp;
    sp.name = "test";
    sp.molarMass = 0.0;
    sp.isTrace = true;
    std::vector<Species> species = {sp};

    double vals[] = {3.0, 1.0, 5.0, 2.0, 4.0};  // unsorted
    for (int i = 0; i < 5; ++i) {
        TimeStepResult step;
        step.time = i * 1000.0;
        step.contaminant.time = step.time;
        step.contaminant.concentrations = {{vals[i]}};
        result.history.push_back(step);
    }

    auto stats = CbwReport::compute(result, species, 1, 100000.0); // one big day
    ASSERT_EQ(stats.size(), 1u);
    EXPECT_NEAR(stats[0].q1, 2.0, 1e-10);
    EXPECT_NEAR(stats[0].median, 3.0, 1e-10);
    EXPECT_NEAR(stats[0].q3, 4.0, 1e-10);
}

TEST(CbwReport, CsvFormat) {
    DailyStats ds;
    ds.dayIndex = 0; ds.zoneIndex = 0; ds.speciesIndex = 0;
    ds.mean = 1.5; ds.stddev = 0.5; ds.minimum = 1.0; ds.maximum = 2.0;
    ds.q1 = 1.25; ds.median = 1.5; ds.q3 = 1.75;
    ds.timeOfMin = 0.0; ds.timeOfMax = 3600.0;

    Species sp;
    sp.name = "CO2";
    std::vector<Species> species = {sp};

    auto csv = CbwReport::formatCsv({ds}, species);
    EXPECT_NE(csv.find("Day,Zone,Species"), std::string::npos);
    EXPECT_NE(csv.find("CO2"), std::string::npos);
}
