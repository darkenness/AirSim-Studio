#include <gtest/gtest.h>
#include "io/OneDOutput.h"
#include "core/OneDZone.h"
#include <cmath>
#include <cstdio>
#include <string>

using namespace contam;

// Helper: create a temp file path
static std::string tempPath(const std::string& ext) {
    return std::string("_test_oned_output") + ext;
}

// Cleanup helper
static void removeFile(const std::string& path) {
    std::remove(path.c_str());
}

// ── Writer basic registration and recording ──────────────────────────

TEST(OneDOutput, RegisterAndRecord) {
    OneDZone zone(5, 1.0, 0.1, 2);  // 5 cells, 1m, 0.1m^2, 2 species

    OneDOutputWriter writer;
    writer.setSpeciesCount(2);
    writer.registerZone(0, zone);

    EXPECT_EQ(writer.getZoneInfos().size(), 1u);
    EXPECT_EQ(writer.getZoneInfos()[0].zoneId, 0);
    EXPECT_EQ(writer.getZoneInfos()[0].numCells, 5);

    // Set some concentrations
    zone.setConcentration(0, 0, 1.0);
    zone.setConcentration(1, 0, 0.8);
    zone.setConcentration(2, 0, 0.6);
    zone.setConcentration(3, 0, 0.4);
    zone.setConcentration(4, 0, 0.2);
    zone.setConcentration(0, 1, 0.5);

    writer.recordFromZone(0.0, 0, zone, 0.012, 1.2);

    EXPECT_EQ(writer.getTimeSteps().size(), 1u);
    EXPECT_NEAR(writer.getTimeSteps()[0].time, 0.0, 1e-10);
    EXPECT_EQ(writer.getTimeSteps()[0].zones.size(), 1u);
    EXPECT_EQ(writer.getTimeSteps()[0].zones[0].concentrations.size(), 10u);  // 5*2
    EXPECT_NEAR(writer.getTimeSteps()[0].zones[0].concentrations[0], 1.0, 1e-10);
}

TEST(OneDOutput, DuplicateZoneRegistration) {
    OneDOutputWriter writer;
    OneDZoneInfo info{0, 5, 1.0, 0.1};
    writer.registerZone(info);
    writer.registerZone(info);  // duplicate
    EXPECT_EQ(writer.getZoneInfos().size(), 1u);
}

TEST(OneDOutput, MultipleTimeSteps) {
    OneDZone zone(3, 1.0, 0.1, 1);
    OneDOutputWriter writer;
    writer.setSpeciesCount(1);
    writer.registerZone(0, zone);

    zone.setConcentration(0, 0, 1.0);
    zone.setConcentration(1, 0, 0.5);
    zone.setConcentration(2, 0, 0.0);
    writer.recordFromZone(0.0, 0, zone);

    zone.setConcentration(0, 0, 0.9);
    zone.setConcentration(1, 0, 0.6);
    zone.setConcentration(2, 0, 0.1);
    writer.recordFromZone(1.0, 0, zone);

    zone.setConcentration(0, 0, 0.8);
    zone.setConcentration(1, 0, 0.7);
    zone.setConcentration(2, 0, 0.2);
    writer.recordFromZone(2.0, 0, zone);

    EXPECT_EQ(writer.getTimeSteps().size(), 3u);
    EXPECT_NEAR(writer.getTimeSteps()[0].time, 0.0, 1e-10);
    EXPECT_NEAR(writer.getTimeSteps()[1].time, 1.0, 1e-10);
    EXPECT_NEAR(writer.getTimeSteps()[2].time, 2.0, 1e-10);
}

// ── Binary write/read roundtrip: RXR ─────────────────────────────────

TEST(OneDOutput, RXR_Roundtrip) {
    std::string path = tempPath(".rxr");

    OneDZone zone(4, 2.0, 0.05, 2);
    zone.setConcentration(0, 0, 1.0);
    zone.setConcentration(1, 0, 0.75);
    zone.setConcentration(2, 0, 0.5);
    zone.setConcentration(3, 0, 0.25);
    zone.setConcentration(0, 1, 0.1);
    zone.setConcentration(1, 1, 0.2);
    zone.setConcentration(2, 1, 0.3);
    zone.setConcentration(3, 1, 0.4);

    {
        OneDOutputWriter writer;
        writer.setSpeciesCount(2);
        writer.registerZone(7, zone);
        writer.recordFromZone(0.0, 7, zone);

        // Modify and record second timestep
        zone.setConcentration(0, 0, 0.9);
        writer.recordFromZone(60.0, 7, zone);

        writer.writeRXR(path);
    }

    {
        OneDOutputReader reader;
        ASSERT_TRUE(reader.readFile(path));

        EXPECT_EQ(reader.magic(), ONED_MAGIC_RXR);
        EXPECT_EQ(reader.version(), 1u);
        EXPECT_EQ(reader.numZones(), 1u);
        EXPECT_EQ(reader.numSpecies(), 2u);
        EXPECT_EQ(reader.numTimeSteps(), 2u);
        EXPECT_EQ(reader.maxCellsPerZone(), 4u);
        EXPECT_NEAR(reader.startTime(), 0.0, 1e-10);
        EXPECT_NEAR(reader.endTime(), 60.0, 1e-10);

        // Zone descriptor
        EXPECT_EQ(reader.zoneDescriptors()[0].zoneId, 7u);
        EXPECT_EQ(reader.zoneDescriptors()[0].numCells, 4u);
        EXPECT_NEAR(reader.zoneDescriptors()[0].length, 2.0, 1e-10);
        EXPECT_NEAR(reader.zoneDescriptors()[0].crossSectionArea, 0.05, 1e-10);

        // t=0: cell 0, species 0 = 1.0
        EXPECT_NEAR(reader.getConcentration(0, 0, 0, 0), 1.0, 1e-10);
        EXPECT_NEAR(reader.getConcentration(0, 0, 1, 0), 0.75, 1e-10);
        EXPECT_NEAR(reader.getConcentration(0, 0, 3, 1), 0.4, 1e-10);

        // t=60: cell 0, species 0 = 0.9
        EXPECT_NEAR(reader.getConcentration(1, 0, 0, 0), 0.9, 1e-10);

        // getCellProfile
        auto profile = reader.getCellProfile(0, 0, 0);
        ASSERT_EQ(profile.size(), 4u);
        EXPECT_NEAR(profile[0], 1.0, 1e-10);
        EXPECT_NEAR(profile[3], 0.25, 1e-10);
    }

    removeFile(path);
}

// ── Binary write/read roundtrip: RZF ─────────────────────────────────

TEST(OneDOutput, RZF_Roundtrip) {
    std::string path = tempPath(".rzf");

    OneDZone zone(3, 1.5, 0.02, 1);

    {
        OneDOutputWriter writer;
        writer.setSpeciesCount(1);
        writer.registerZone(1, zone);
        // flowRate=0.024 kg/s, density=1.2 -> u = 0.024/(1.2*0.02) = 1.0 m/s
        writer.recordFromZone(0.0, 1, zone, 0.024, 1.2);
        writer.writeRZF(path);
    }

    {
        OneDOutputReader reader;
        ASSERT_TRUE(reader.readFile(path));

        EXPECT_EQ(reader.magic(), ONED_MAGIC_RZF);
        EXPECT_EQ(reader.numZones(), 1u);
        EXPECT_EQ(reader.numTimeSteps(), 1u);

        // All cells should have velocity = 1.0 m/s
        for (int i = 0; i < 3; ++i) {
            EXPECT_NEAR(reader.getVelocity(0, 0, i), 1.0, 1e-10);
        }
    }

    removeFile(path);
}

// ── Binary write/read roundtrip: RZM ─────────────────────────────────

TEST(OneDOutput, RZM_Roundtrip) {
    std::string path = tempPath(".rzm");

    OneDZone zone(2, 1.0, 0.1, 1);
    zone.setConcentration(0, 0, 0.5);
    zone.setConcentration(1, 0, 0.3);

    {
        OneDOutputWriter writer;
        writer.setSpeciesCount(1);
        writer.registerZone(2, zone);
        // flowRate=0.12 kg/s, density=1.2 -> u = 0.12/(1.2*0.1) = 1.0 m/s
        // flux[0] = 1.0 * 0.1 * 0.5 = 0.05
        // flux[1] = 1.0 * 0.1 * 0.3 = 0.03
        writer.recordFromZone(10.0, 2, zone, 0.12, 1.2);
        writer.writeRZM(path);
    }

    {
        OneDOutputReader reader;
        ASSERT_TRUE(reader.readFile(path));

        EXPECT_EQ(reader.magic(), ONED_MAGIC_RZM);
        EXPECT_NEAR(reader.getMassFlux(0, 0, 0, 0), 0.05, 1e-10);
        EXPECT_NEAR(reader.getMassFlux(0, 0, 1, 0), 0.03, 1e-10);
    }

    removeFile(path);
}

// ── Binary write/read roundtrip: RZ1 (combined) ─────────────────────

TEST(OneDOutput, RZ1_Roundtrip) {
    std::string path = tempPath(".rz1");

    OneDZone zone(3, 1.0, 0.1, 2);
    zone.setConcentration(0, 0, 1.0);
    zone.setConcentration(1, 0, 0.5);
    zone.setConcentration(2, 0, 0.0);
    zone.setConcentration(0, 1, 0.2);
    zone.setConcentration(1, 1, 0.4);
    zone.setConcentration(2, 1, 0.6);

    {
        OneDOutputWriter writer;
        writer.setSpeciesCount(2);
        writer.registerZone(3, zone);
        writer.recordFromZone(0.0, 3, zone, 0.06, 1.2);
        writer.recordFromZone(30.0, 3, zone, 0.06, 1.2);
        writer.writeRZ1(path);
    }

    {
        OneDOutputReader reader;
        ASSERT_TRUE(reader.readFile(path));

        EXPECT_EQ(reader.magic(), ONED_MAGIC_RZ1);
        EXPECT_EQ(reader.numZones(), 1u);
        EXPECT_EQ(reader.numSpecies(), 2u);
        EXPECT_EQ(reader.numTimeSteps(), 2u);

        // Concentrations
        EXPECT_NEAR(reader.getConcentration(0, 0, 0, 0), 1.0, 1e-10);
        EXPECT_NEAR(reader.getConcentration(0, 0, 2, 1), 0.6, 1e-10);

        // Velocity: u = 0.06/(1.2*0.1) = 0.5 m/s
        EXPECT_NEAR(reader.getVelocity(0, 0, 0), 0.5, 1e-10);
        EXPECT_NEAR(reader.getVelocity(0, 0, 2), 0.5, 1e-10);

        // Mass flux: cell 0, sp 0: 0.5 * 0.1 * 1.0 = 0.05
        EXPECT_NEAR(reader.getMassFlux(0, 0, 0, 0), 0.05, 1e-10);
        // cell 2, sp 1: 0.5 * 0.1 * 0.6 = 0.03
        EXPECT_NEAR(reader.getMassFlux(0, 0, 2, 1), 0.03, 1e-10);
    }

    removeFile(path);
}

// ── Multiple zones ───────────────────────────────────────────────────

TEST(OneDOutput, MultipleZones) {
    std::string path = tempPath("_multi.rxr");

    OneDZone z1(3, 1.0, 0.1, 1);
    OneDZone z2(5, 2.0, 0.2, 1);

    z1.setConcentration(0, 0, 1.0);
    z1.setConcentration(1, 0, 0.5);
    z1.setConcentration(2, 0, 0.0);

    z2.setConcentration(0, 0, 0.1);
    z2.setConcentration(1, 0, 0.2);
    z2.setConcentration(2, 0, 0.3);
    z2.setConcentration(3, 0, 0.4);
    z2.setConcentration(4, 0, 0.5);

    {
        OneDOutputWriter writer;
        writer.setSpeciesCount(1);
        writer.registerZone(10, z1);
        writer.registerZone(20, z2);
        writer.recordFromZone(0.0, 10, z1);
        writer.recordFromZone(0.0, 20, z2);
        writer.writeRXR(path);
    }

    {
        OneDOutputReader reader;
        ASSERT_TRUE(reader.readFile(path));

        EXPECT_EQ(reader.numZones(), 2u);
        EXPECT_EQ(reader.maxCellsPerZone(), 5u);

        EXPECT_EQ(reader.zoneDescriptors()[0].zoneId, 10u);
        EXPECT_EQ(reader.zoneDescriptors()[0].numCells, 3u);
        EXPECT_EQ(reader.zoneDescriptors()[1].zoneId, 20u);
        EXPECT_EQ(reader.zoneDescriptors()[1].numCells, 5u);

        // Zone 0 (id=10)
        EXPECT_NEAR(reader.getConcentration(0, 0, 0, 0), 1.0, 1e-10);
        EXPECT_NEAR(reader.getConcentration(0, 0, 2, 0), 0.0, 1e-10);

        // Zone 1 (id=20)
        EXPECT_NEAR(reader.getConcentration(0, 1, 0, 0), 0.1, 1e-10);
        EXPECT_NEAR(reader.getConcentration(0, 1, 4, 0), 0.5, 1e-10);
    }

    removeFile(path);
}

// ── Text/CSV output ──────────────────────────────────────────────────

TEST(OneDOutput, TextFormatRXR) {
    OneDZone zone(2, 1.0, 0.1, 1);
    zone.setConcentration(0, 0, 1.0);
    zone.setConcentration(1, 0, 0.5);

    OneDOutputWriter writer;
    writer.setSpeciesCount(1);
    writer.registerZone(0, zone);
    writer.recordFromZone(0.0, 0, zone);

    std::string text = writer.formatTextRXR();
    EXPECT_NE(text.find("1D Zone Concentration"), std::string::npos);
    EXPECT_NE(text.find("Zone 0"), std::string::npos);
    EXPECT_NE(text.find("1.000000"), std::string::npos);
    EXPECT_NE(text.find("0.500000"), std::string::npos);
}

TEST(OneDOutput, CsvFormatRXR) {
    OneDZone zone(2, 1.0, 0.1, 1);
    zone.setConcentration(0, 0, 1.0);
    zone.setConcentration(1, 0, 0.5);

    OneDOutputWriter writer;
    writer.setSpeciesCount(1);
    writer.registerZone(0, zone);
    writer.recordFromZone(0.0, 0, zone);

    std::string csv = writer.formatCsvRXR();
    EXPECT_NE(csv.find("Time,ZoneId,Cell,Species,Concentration"), std::string::npos);
    // Should have header + 2 data rows
    int lineCount = 0;
    for (char c : csv) { if (c == '\n') ++lineCount; }
    EXPECT_EQ(lineCount, 3);  // header + 2 cells
}

TEST(OneDOutput, TextFormatRZ1) {
    OneDZone zone(2, 1.0, 0.1, 1);
    zone.setConcentration(0, 0, 0.8);
    zone.setConcentration(1, 0, 0.4);

    OneDOutputWriter writer;
    writer.setSpeciesCount(1);
    writer.registerZone(0, zone);
    writer.recordFromZone(0.0, 0, zone, 0.012, 1.2);

    std::string text = writer.formatTextRZ1();
    EXPECT_NE(text.find("Combined Summary"), std::string::npos);
    EXPECT_NE(text.find("Velocity"), std::string::npos);
}

// ── Reader: invalid file ─────────────────────────────────────────────

TEST(OneDOutput, ReaderInvalidFile) {
    OneDOutputReader reader;
    EXPECT_FALSE(reader.readFile("nonexistent_file.rxr"));
}

// ── Reader: out-of-bounds queries return 0 ───────────────────────────

TEST(OneDOutput, ReaderOutOfBounds) {
    std::string path = tempPath("_oob.rxr");

    OneDZone zone(2, 1.0, 0.1, 1);
    zone.setConcentration(0, 0, 1.0);

    {
        OneDOutputWriter writer;
        writer.setSpeciesCount(1);
        writer.registerZone(0, zone);
        writer.recordFromZone(0.0, 0, zone);
        writer.writeRXR(path);
    }

    {
        OneDOutputReader reader;
        ASSERT_TRUE(reader.readFile(path));

        // Out of bounds should return 0
        EXPECT_NEAR(reader.getConcentration(99, 0, 0, 0), 0.0, 1e-10);
        EXPECT_NEAR(reader.getConcentration(0, 99, 0, 0), 0.0, 1e-10);
        EXPECT_NEAR(reader.getConcentration(0, 0, 99, 0), 0.0, 1e-10);
        EXPECT_NEAR(reader.getVelocity(99, 0, 0), 0.0, 1e-10);
        EXPECT_NEAR(reader.getMassFlux(0, 0, 99, 0), 0.0, 1e-10);

        auto profile = reader.getCellProfile(99, 0, 0);
        EXPECT_TRUE(profile.empty());
    }

    removeFile(path);
}

// ── Writer clear ─────────────────────────────────────────────────────

TEST(OneDOutput, WriterClear) {
    OneDOutputWriter writer;
    writer.setSpeciesCount(1);
    OneDZoneInfo info{0, 3, 1.0, 0.1};
    writer.registerZone(info);
    writer.recordSnapshot(0.0, 0, {1.0, 0.5, 0.0});

    EXPECT_EQ(writer.getZoneInfos().size(), 1u);
    EXPECT_EQ(writer.getTimeSteps().size(), 1u);

    writer.clear();
    EXPECT_EQ(writer.getZoneInfos().size(), 0u);
    EXPECT_EQ(writer.getTimeSteps().size(), 0u);
    EXPECT_EQ(writer.numSpecies(), 0);
}

// ── Snapshot for unregistered zone is ignored ────────────────────────

TEST(OneDOutput, UnregisteredZoneIgnored) {
    OneDOutputWriter writer;
    writer.setSpeciesCount(1);
    writer.recordSnapshot(0.0, 999, {1.0, 0.5});
    EXPECT_TRUE(writer.getTimeSteps().empty());
}

// ── Integration: OneDZone step + output ──────────────────────────────

TEST(OneDOutput, IntegrationWithStepping) {
    std::string path = tempPath("_integ.rz1");

    int numCells = 10;
    double length = 1.0;
    double area = 0.01;
    int numSpecies = 1;
    double flowRate = 0.0012;  // kg/s
    double density = 1.2;
    double dt = 0.01;

    OneDZone zone(numCells, length, area, numSpecies);
    // Initial pulse at left boundary
    zone.setConcentration(0, 0, 1.0);

    OneDOutputWriter writer;
    writer.setSpeciesCount(numSpecies);
    writer.registerZone(0, zone);

    // Record initial state
    writer.recordFromZone(0.0, 0, zone, flowRate, density);

    // Step 10 times
    std::vector<double> diffCoeffs = {1e-5};
    std::vector<double> leftBC = {0.0};
    std::vector<double> rightBC = {0.0};

    for (int step = 1; step <= 10; ++step) {
        zone.step(dt, flowRate, density, diffCoeffs, leftBC, rightBC);
        writer.recordFromZone(step * dt, 0, zone, flowRate, density);
    }

    EXPECT_EQ(writer.getTimeSteps().size(), 11u);

    // Write and read back
    writer.writeRZ1(path);

    OneDOutputReader reader;
    ASSERT_TRUE(reader.readFile(path));
    EXPECT_EQ(reader.numTimeSteps(), 11u);
    EXPECT_EQ(reader.numZones(), 1u);
    EXPECT_EQ(reader.numSpecies(), 1u);

    // Initial state: cell 0 should have concentration 1.0
    EXPECT_NEAR(reader.getConcentration(0, 0, 0, 0), 1.0, 1e-10);

    // After stepping, concentration should have spread (cell 0 < 1.0)
    double finalCell0 = reader.getConcentration(10, 0, 0, 0);
    EXPECT_LT(finalCell0, 1.0);
    EXPECT_GT(finalCell0, 0.0);

    removeFile(path);
}
