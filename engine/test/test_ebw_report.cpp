#include <gtest/gtest.h>
#include "io/EbwReport.h"
#include <cmath>

using namespace contam;

// Helper: build a minimal TransientResult with concentration data
static TransientResult makeTestResult(int numSteps, int numZones, int numSpecies,
                                       double dt, double baseConc) {
    TransientResult result;
    result.completed = true;
    for (int i = 0; i < numSteps; ++i) {
        TimeStepResult step;
        step.time = i * dt;
        step.contaminant.concentrations.resize(numZones);
        for (int z = 0; z < numZones; ++z) {
            step.contaminant.concentrations[z].resize(numSpecies);
            for (int s = 0; s < numSpecies; ++s) {
                // Concentration ramps up linearly then holds
                double t = step.time;
                double rampEnd = (numSteps / 2) * dt;
                double c = (t < rampEnd) ? baseConc * (t / rampEnd) : baseConc;
                // Vary slightly by zone/species
                c *= (1.0 + 0.1 * z + 0.05 * s);
                step.contaminant.concentrations[z][s] = c;
            }
        }
        result.history.push_back(step);
    }
    return result;
}

// ── EbwReport::compute (from Occupant inline exposure) ──────────────

TEST(EbwReport, ComputeFromOccupantExposure) {
    Species co2(0, "CO2", 0.044);
    Species pm25(1, "PM2.5", 0.001);
    std::vector<Species> species = {co2, pm25};

    Occupant occ(1, "Worker_A", 0, 1.5e-4);
    occ.initExposure(2);

    // Simulate some exposure updates
    std::vector<double> conc1 = {1e-3, 5e-6};
    std::vector<double> conc2 = {2e-3, 8e-6};
    occ.updateExposure(conc1, 0.0, 60.0);
    occ.updateExposure(conc2, 60.0, 60.0);

    std::vector<Occupant> occupants = {occ};
    auto exposures = EbwReport::compute(occupants, species);

    ASSERT_EQ(exposures.size(), 2u); // 1 occupant x 2 species

    // CO2 exposure
    EXPECT_EQ(exposures[0].occupantId, 1);
    EXPECT_EQ(exposures[0].occupantName, "Worker_A");
    EXPECT_EQ(exposures[0].speciesIndex, 0);
    // dose = breathRate * (c1*dt1 + c2*dt2) = 1.5e-4 * (1e-3*60 + 2e-3*60)
    double expectedDoseCO2 = 1.5e-4 * (1e-3 * 60.0 + 2e-3 * 60.0);
    EXPECT_NEAR(exposures[0].cumulativeDose, expectedDoseCO2, 1e-12);
    EXPECT_NEAR(exposures[0].peakConcentration, 2e-3, 1e-12);
    EXPECT_NEAR(exposures[0].timeAtPeak, 60.0, 1e-10);
    EXPECT_GT(exposures[0].totalExposureTime, 0.0);

    // PM2.5 exposure
    EXPECT_EQ(exposures[1].speciesIndex, 1);
    double expectedDosePM = 1.5e-4 * (5e-6 * 60.0 + 8e-6 * 60.0);
    EXPECT_NEAR(exposures[1].cumulativeDose, expectedDosePM, 1e-15);
    EXPECT_NEAR(exposures[1].peakConcentration, 8e-6, 1e-15);
}

TEST(EbwReport, ComputeEmptyInput) {
    std::vector<Occupant> empty;
    std::vector<Species> species = {Species(0, "CO2")};
    auto result = EbwReport::compute(empty, species);
    EXPECT_TRUE(result.empty());

    std::vector<Occupant> occupants = {Occupant(1, "A", 0)};
    std::vector<Species> noSpecies;
    result = EbwReport::compute(occupants, noSpecies);
    EXPECT_TRUE(result.empty());
}

// ── EbwReport::computeFromHistory ───────────────────────────────────

TEST(EbwReport, ComputeFromHistory) {
    Species co2(0, "CO2", 0.044);
    std::vector<Species> species = {co2};

    Occupant occ(1, "Resident", 0, 1.2e-4);
    std::vector<Occupant> occupants = {occ};

    // 10 steps, 1 zone, 1 species, dt=60s, baseConc=1e-3
    auto result = makeTestResult(10, 1, 1, 60.0, 1e-3);
    auto exposures = EbwReport::computeFromHistory(occupants, species, result);

    ASSERT_EQ(exposures.size(), 1u);
    EXPECT_EQ(exposures[0].occupantId, 1);
    EXPECT_GT(exposures[0].cumulativeDose, 0.0);
    EXPECT_GT(exposures[0].peakConcentration, 0.0);
    EXPECT_GT(exposures[0].totalExposureTime, 0.0);
    EXPECT_GT(exposures[0].meanConcentration, 0.0);
    // Peak should be at or near the max concentration (step 5+ where ramp ends)
    EXPECT_NEAR(exposures[0].peakConcentration, 1e-3, 1e-10);
}

TEST(EbwReport, ComputeFromHistoryMultiOccupant) {
    Species co2(0, "CO2", 0.044);
    std::vector<Species> species = {co2};

    Occupant occ1(1, "Office_Worker", 0, 1.2e-4);
    Occupant occ2(2, "Lab_Tech", 1, 2.0e-4); // different zone, higher breathing rate
    std::vector<Occupant> occupants = {occ1, occ2};

    auto result = makeTestResult(10, 2, 1, 60.0, 1e-3);
    auto exposures = EbwReport::computeFromHistory(occupants, species, result);

    ASSERT_EQ(exposures.size(), 2u);
    // Lab_Tech in zone 1 has higher concentration (1.1x) and higher breathing rate
    EXPECT_GT(exposures[1].cumulativeDose, exposures[0].cumulativeDose);
}

// ── Zone history extraction ─────────────────────────────────────────

TEST(EbwReport, ExtractZoneHistory) {
    Occupant occ(1, "Worker", 2, 1.2e-4);
    std::vector<Occupant> occupants = {occ};

    auto result = makeTestResult(5, 3, 1, 60.0, 1e-3);
    std::vector<std::string> zoneNames = {"Kitchen", "Bedroom", "Office"};

    auto visits = EbwReport::extractZoneHistory(occupants, result, zoneNames);
    ASSERT_EQ(visits.size(), 1u);
    EXPECT_EQ(visits[0].occupantId, 1);
    EXPECT_EQ(visits[0].zoneIndex, 2);
    EXPECT_EQ(visits[0].zoneName, "Office");
    EXPECT_NEAR(visits[0].enterTime, 0.0, 1e-10);
    EXPECT_NEAR(visits[0].leaveTime, 240.0, 1e-10); // (5-1)*60
}

TEST(EbwReport, ExtractZoneHistoryNoNames) {
    Occupant occ(1, "Worker", 0);
    std::vector<Occupant> occupants = {occ};
    auto result = makeTestResult(3, 1, 1, 60.0, 1e-3);

    auto visits = EbwReport::extractZoneHistory(occupants, result);
    ASSERT_EQ(visits.size(), 1u);
    EXPECT_EQ(visits[0].zoneName, "Zone_0");
}

// ── Text formatting ─────────────────────────────────────────────────

TEST(EbwReport, FormatTextOutput) {
    Species co2(0, "CO2", 0.044);
    std::vector<Species> species = {co2};

    Occupant occ(1, "Worker_A", 0, 1.2e-4);
    occ.initExposure(1);
    occ.updateExposure({5e-4}, 100.0, 60.0);
    std::vector<Occupant> occupants = {occ};

    auto exposures = EbwReport::compute(occupants, species);

    ZoneVisit v;
    v.occupantId = 1;
    v.zoneIndex = 0;
    v.zoneName = "Office";
    v.enterTime = 0.0;
    v.leaveTime = 3600.0;
    std::vector<ZoneVisit> visits = {v};

    std::string text = EbwReport::formatText(exposures, species, visits);

    EXPECT_NE(text.find("CONTAM Occupant Exposure Report"), std::string::npos);
    EXPECT_NE(text.find("Zone Location History"), std::string::npos);
    EXPECT_NE(text.find("Worker_A"), std::string::npos);
    EXPECT_NE(text.find("CO2"), std::string::npos);
    EXPECT_NE(text.find("Office"), std::string::npos);
}

// ── CSV formatting ──────────────────────────────────────────────────

TEST(EbwReport, FormatCsvOutput) {
    Species co2(0, "CO2", 0.044);
    Species pm(1, "PM2.5", 0.001);
    std::vector<Species> species = {co2, pm};

    Occupant occ(1, "Tester", 0, 1.0e-4);
    occ.initExposure(2);
    occ.updateExposure({1e-3, 2e-6}, 0.0, 120.0);
    std::vector<Occupant> occupants = {occ};

    auto exposures = EbwReport::compute(occupants, species);
    std::string csv = EbwReport::formatCsv(exposures, species);

    // Check header
    EXPECT_NE(csv.find("OccupantId,OccupantName,Species"), std::string::npos);
    // Check data rows
    EXPECT_NE(csv.find("Tester"), std::string::npos);
    EXPECT_NE(csv.find("CO2"), std::string::npos);
    EXPECT_NE(csv.find("PM2.5"), std::string::npos);

    // Count lines (header + 2 data rows)
    int lineCount = 0;
    for (char c : csv) if (c == '\n') lineCount++;
    EXPECT_EQ(lineCount, 3); // header + 2 species rows
}
