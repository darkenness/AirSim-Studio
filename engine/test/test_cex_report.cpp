#include <gtest/gtest.h>
#include "io/CexReport.h"
#include "core/Network.h"
#include "core/Species.h"
#include "core/TransientSimulation.h"
#include <cmath>

using namespace contam;

// Helper: build a simple 2-zone + 1-ambient network with 2 exterior links
// Zone0 (interior) --link0--> Zone1 (ambient)
// Zone2 (interior) --link1--> Zone1 (ambient)
static Network makeTestNetwork() {
    Network net;

    Node zone0(0, "Room1", NodeType::Normal);
    zone0.setVolume(50.0);
    zone0.setTemperature(293.15);
    zone0.setDensity(1.2);
    net.addNode(zone0);

    Node ambient(1, "Outdoor", NodeType::Ambient);
    ambient.setDensity(1.2);
    net.addNode(ambient);

    Node zone2(2, "Room2", NodeType::Normal);
    zone2.setVolume(30.0);
    zone2.setTemperature(293.15);
    zone2.setDensity(1.2);
    net.addNode(zone2);

    // Link 0: Room1 (idx=0) -> Outdoor (idx=1), outward flow
    Link link0(100, 0, 1, 0.0);
    net.addLink(std::move(link0));

    // Link 1: Room2 (idx=2) -> Outdoor (idx=1), outward flow
    Link link1(101, 2, 1, 0.0);
    net.addLink(std::move(link1));

    return net;
}

static std::vector<Species> makeTestSpecies() {
    std::vector<Species> sp;
    sp.push_back(Species(0, "CO2", 0.044, 0.0, 0.0004, true));
    return sp;
}

// Build a simple 3-step history with constant outward flow and rising concentration
static std::vector<TimeStepResult> makeTestHistory() {
    std::vector<TimeStepResult> history;

    // 3 nodes, 1 species, 2 links
    for (int step = 0; step < 3; ++step) {
        TimeStepResult ts;
        ts.time = step * 100.0;  // 0, 100, 200 seconds

        // Airflow: both links have 0.12 kg/s outward (positive = from->to)
        ts.airflow.converged = true;
        ts.airflow.massFlows = {0.12, 0.06};

        // Concentrations: [nodeIdx][speciesIdx]
        // Room1 concentration rises: 0.001, 0.002, 0.003
        // Outdoor stays at background
        // Room2 concentration constant: 0.005
        ts.contaminant.time = ts.time;
        ts.contaminant.concentrations.resize(3);
        ts.contaminant.concentrations[0] = {0.001 * (step + 1)};  // Room1
        ts.contaminant.concentrations[1] = {0.0004};               // Outdoor
        ts.contaminant.concentrations[2] = {0.005};                // Room2

        history.push_back(ts);
    }

    return history;
}

TEST(CexReport, EmptyHistory) {
    Network net = makeTestNetwork();
    auto species = makeTestSpecies();
    std::vector<TimeStepResult> empty;

    auto results = CexReport::compute(net, species, empty);
    EXPECT_TRUE(results.empty());
}

TEST(CexReport, EmptySpecies) {
    Network net = makeTestNetwork();
    std::vector<Species> empty;
    auto history = makeTestHistory();

    auto results = CexReport::compute(net, empty, history);
    EXPECT_TRUE(results.empty());
}

TEST(CexReport, BasicExfiltration) {
    Network net = makeTestNetwork();
    auto species = makeTestSpecies();
    auto history = makeTestHistory();

    auto results = CexReport::compute(net, species, history);
    ASSERT_EQ(results.size(), 1u);  // 1 species

    const auto& sr = results[0];
    EXPECT_EQ(sr.speciesId, 0);
    EXPECT_EQ(sr.speciesName, "CO2");
    EXPECT_EQ(sr.openings.size(), 2u);  // 2 exterior links

    // Opening 0: Link 100, Room1 -> Outdoor
    // massFlow = 0.12 kg/s, density = 1.2 -> volFlow = 0.1 m3/s
    // Concentrations at steps: 0.001, 0.002, 0.003 kg/m3
    // Rates: 0.0001, 0.0002, 0.0003 kg/s
    // Trapezoidal: integral = 0.5*(0.0001+0.0002)*100 + 0.5*(0.0002+0.0003)*100
    //            = 0.015 + 0.025 = 0.04 kg
    const auto& op0 = sr.openings[0];
    EXPECT_EQ(op0.linkId, 100);
    EXPECT_EQ(op0.fromNodeName, "Room1");
    EXPECT_EQ(op0.toNodeName, "Outdoor");
    EXPECT_NEAR(op0.totalMassExfiltrated, 0.04, 1e-10);
    EXPECT_NEAR(op0.peakMassFlowRate, 0.0003, 1e-10);
    EXPECT_NEAR(op0.avgMassFlowRate, 0.04 / 200.0, 1e-10);

    // Opening 1: Link 101, Room2 -> Outdoor
    // massFlow = 0.06 kg/s, density = 1.2 -> volFlow = 0.05 m3/s
    // Concentration constant at 0.005 kg/m3
    // Rate = 0.05 * 0.005 = 0.00025 kg/s (constant)
    // Trapezoidal: 0.5*(0.00025+0.00025)*100 + 0.5*(0.00025+0.00025)*100 = 0.05 kg
    const auto& op1 = sr.openings[1];
    EXPECT_EQ(op1.linkId, 101);
    EXPECT_EQ(op1.fromNodeName, "Room2");
    EXPECT_NEAR(op1.totalMassExfiltrated, 0.05, 1e-10);
    EXPECT_NEAR(op1.peakMassFlowRate, 0.00025, 1e-10);

    // Total exfiltration = 0.04 + 0.05 = 0.09
    EXPECT_NEAR(sr.totalExfiltration, 0.09, 1e-10);
}

TEST(CexReport, NoOutwardFlow) {
    // If flow is inward (infiltration), exfiltration should be zero
    Network net = makeTestNetwork();
    auto species = makeTestSpecies();

    std::vector<TimeStepResult> history;
    for (int step = 0; step < 2; ++step) {
        TimeStepResult ts;
        ts.time = step * 100.0;
        // Negative flow = from nodeTo to nodeFrom = inward (ambient -> interior)
        ts.airflow.converged = true;
        ts.airflow.massFlows = {-0.12, -0.06};
        ts.contaminant.time = ts.time;
        ts.contaminant.concentrations.resize(3);
        ts.contaminant.concentrations[0] = {0.002};
        ts.contaminant.concentrations[1] = {0.0004};
        ts.contaminant.concentrations[2] = {0.005};
        history.push_back(ts);
    }

    auto results = CexReport::compute(net, species, history);
    ASSERT_EQ(results.size(), 1u);
    EXPECT_NEAR(results[0].totalExfiltration, 0.0, 1e-15);
    for (const auto& op : results[0].openings) {
        EXPECT_NEAR(op.totalMassExfiltrated, 0.0, 1e-15);
    }
}

TEST(CexReport, FormatText) {
    Network net = makeTestNetwork();
    auto species = makeTestSpecies();
    auto history = makeTestHistory();

    auto results = CexReport::compute(net, species, history);
    std::string text = CexReport::formatText(results);

    EXPECT_NE(text.find("Contaminant Exfiltration Report"), std::string::npos);
    EXPECT_NE(text.find("CO2"), std::string::npos);
    EXPECT_NE(text.find("Room1"), std::string::npos);
    EXPECT_NE(text.find("Room2"), std::string::npos);
    EXPECT_NE(text.find("Outdoor"), std::string::npos);
}

TEST(CexReport, FormatCsv) {
    Network net = makeTestNetwork();
    auto species = makeTestSpecies();
    auto history = makeTestHistory();

    auto results = CexReport::compute(net, species, history);
    std::string csv = CexReport::formatCsv(results);

    // Check header
    EXPECT_NE(csv.find("SpeciesId,SpeciesName,LinkId,FromZone,ToZone"), std::string::npos);
    // Check data rows exist
    EXPECT_NE(csv.find("CO2"), std::string::npos);
    // Should have 2 data rows (2 openings)
    size_t lineCount = 0;
    for (char c : csv) {
        if (c == '\n') lineCount++;
    }
    EXPECT_EQ(lineCount, 3u);  // 1 header + 2 data rows
}

TEST(CexReport, NoExteriorLinks) {
    // Network with no ambient nodes -> no exterior links
    Network net;
    Node z0(0, "Room1", NodeType::Normal);
    z0.setVolume(50.0);
    z0.setDensity(1.2);
    net.addNode(z0);

    Node z1(1, "Room2", NodeType::Normal);
    z1.setVolume(30.0);
    z1.setDensity(1.2);
    net.addNode(z1);

    Link link(200, 0, 1, 0.0);
    net.addLink(std::move(link));

    auto species = makeTestSpecies();
    auto history = makeTestHistory();
    // Adjust history for 2-node network
    for (auto& ts : history) {
        ts.airflow.massFlows = {0.1};
        ts.contaminant.concentrations.resize(2);
        ts.contaminant.concentrations[0] = {0.002};
        ts.contaminant.concentrations[1] = {0.001};
    }

    auto results = CexReport::compute(net, species, history);
    ASSERT_EQ(results.size(), 1u);
    EXPECT_NEAR(results[0].totalExfiltration, 0.0, 1e-15);
    EXPECT_TRUE(results[0].openings.empty());
}
