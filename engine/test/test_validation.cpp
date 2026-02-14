#include <gtest/gtest.h>
#include "io/JsonReader.h"
#include "io/JsonWriter.h"
#include "core/Solver.h"
#include "core/TransientSimulation.h"
#include "elements/PowerLawOrifice.h"
#include <cmath>
#include <fstream>
#include <sstream>

using namespace contam;

// ============================================================================
// Case 01: Steady-state 3-room stack effect validation
// ============================================================================
// Topology: 3 rooms vertically stacked (z=0, z=3, z=6) + Ambient
// Driving force: pure stack effect (indoor 20°C, outdoor 0°C), no wind
// Expected: neutral plane ~3m, flow up through building
// Verification: mass conservation at each node, correct flow directions

static Network buildCase01Network() {
    Network network;
    network.setAmbientTemperature(273.15);  // 0°C outdoor
    network.setWindSpeed(0.0);              // No wind

    // Ambient node
    Node ambient(0, "Ambient", NodeType::Ambient);
    ambient.setTemperature(273.15);
    ambient.setElevation(0.0);
    ambient.updateDensity();
    network.addNode(ambient);

    // Room0 (ground floor, z=0m)
    Node room0(1, "Room0_Ground", NodeType::Normal);
    room0.setTemperature(293.15);  // 20°C indoor
    room0.setElevation(0.0);
    room0.setVolume(75.0);         // 5m x 5m x 3m
    room0.updateDensity();
    network.addNode(room0);

    // Room1 (first floor, z=3m)
    Node room1(2, "Room1_Floor1", NodeType::Normal);
    room1.setTemperature(293.15);
    room1.setElevation(3.0);
    room1.setVolume(75.0);
    room1.updateDensity();
    network.addNode(room1);

    // Room2 (second floor, z=6m)
    Node room2(3, "Room2_Floor2", NodeType::Normal);
    room2.setTemperature(293.15);
    room2.setElevation(6.0);
    room2.setVolume(75.0);
    room2.updateDensity();
    network.addNode(room2);

    // Links: exterior cracks and floor leaks
    // C=0.001 m³/(s·Pa^n), n=0.65 for exterior cracks
    // C=0.0005 for floor leaks
    auto extCrack = std::make_unique<PowerLawOrifice>(0.001, 0.65);
    auto floorLeak = std::make_unique<PowerLawOrifice>(0.0005, 0.65);

    // Link 0: Ambient(0) -> Room0(1), exterior wall at z=1.5m
    Link link0(0, 0, 1, 1.5);
    link0.setFlowElement(extCrack->clone());
    network.addLink(std::move(link0));

    // Link 1: Room0(1) -> Ambient(0), opposite exterior wall at z=1.5m
    Link link1(1, 1, 0, 1.5);
    link1.setFlowElement(extCrack->clone());
    network.addLink(std::move(link1));

    // Link 2: Room0(1) -> Room1(2), floor leak at z=3.0m
    Link link2(2, 1, 2, 3.0);
    link2.setFlowElement(floorLeak->clone());
    network.addLink(std::move(link2));

    // Link 3: Room1(2) -> Room2(3), floor leak at z=6.0m
    Link link3(3, 2, 3, 6.0);
    link3.setFlowElement(floorLeak->clone());
    network.addLink(std::move(link3));

    // Link 4: Room1(2) -> Ambient(0), exterior wall at z=4.5m
    Link link4(4, 2, 0, 4.5);
    link4.setFlowElement(extCrack->clone());
    network.addLink(std::move(link4));

    // Link 5: Room2(3) -> Ambient(0), exterior wall at z=7.5m
    Link link5(5, 3, 0, 7.5);
    link5.setFlowElement(extCrack->clone());
    network.addLink(std::move(link5));

    return network;
}

TEST(ValidationCase01, StackEffectConverges) {
    auto network = buildCase01Network();
    Solver solver(SolverMethod::TrustRegion);
    auto result = solver.solve(network);

    EXPECT_TRUE(result.converged);
    EXPECT_LT(result.maxResidual, CONVERGENCE_TOL);
    EXPECT_LT(result.iterations, 50);
}

TEST(ValidationCase01, MassConservation) {
    auto network = buildCase01Network();
    Solver solver;
    auto result = solver.solve(network);
    ASSERT_TRUE(result.converged);

    // For each non-ambient node, sum of mass flows must be ~0
    int numNodes = network.getNodeCount();
    std::vector<double> netFlow(numNodes, 0.0);

    for (int i = 0; i < network.getLinkCount(); ++i) {
        int from = network.getLink(i).getNodeFrom();
        int to = network.getLink(i).getNodeTo();
        double flow = result.massFlows[i];
        netFlow[from] -= flow;  // outflow from 'from'
        netFlow[to] += flow;    // inflow to 'to'
    }

    // Each non-ambient node should have net flow ≈ 0
    for (int i = 0; i < numNodes; ++i) {
        if (!network.getNode(i).isKnownPressure()) {
            EXPECT_NEAR(netFlow[i], 0.0, 1e-6)
                << "Mass conservation violated at node " << network.getNode(i).getName()
                << ", net flow = " << netFlow[i] << " kg/s";
        }
    }
}

TEST(ValidationCase01, StackEffectFlowDirection) {
    auto network = buildCase01Network();
    Solver solver;
    auto result = solver.solve(network);
    ASSERT_TRUE(result.converged);

    // With indoor warmer than outdoor (20°C vs 0°C):
    // - Lower openings: cold outdoor air flows IN (positive flow Ambient->Room0)
    // - Upper openings: warm indoor air flows OUT (positive flow Room2->Ambient)
    // Link 0: Ambient(0)->Room0(1) at z=1.5m: should be positive (inflow at bottom)
    EXPECT_GT(result.massFlows[0], 0.0)
        << "Expected inflow at bottom exterior crack (link 0)";

    // Link 5: Room2(3)->Ambient(0) at z=7.5m: should be positive (outflow at top)
    EXPECT_GT(result.massFlows[5], 0.0)
        << "Expected outflow at top exterior crack (link 5)";

    // Vertical flow should go upward: Room0->Room1->Room2
    // Link 2: Room0(1)->Room1(2): should be positive
    EXPECT_GT(result.massFlows[2], 0.0)
        << "Expected upward flow through floor (link 2)";

    // Link 3: Room1(2)->Room2(3): should be positive
    EXPECT_GT(result.massFlows[3], 0.0)
        << "Expected upward flow through floor (link 3)";
}

TEST(ValidationCase01, JsonRoundTrip) {
    // Verify Case 01 works via JSON input
    std::string jsonStr = R"({
        "ambient": {
            "temperature": 273.15,
            "pressure": 0.0,
            "windSpeed": 0.0
        },
        "nodes": [
            {"id": 0, "name": "Ambient", "type": "ambient", "temperature": 273.15},
            {"id": 1, "name": "Room0", "temperature": 293.15, "elevation": 0.0, "volume": 75.0},
            {"id": 2, "name": "Room1", "temperature": 293.15, "elevation": 3.0, "volume": 75.0},
            {"id": 3, "name": "Room2", "temperature": 293.15, "elevation": 6.0, "volume": 75.0}
        ],
        "links": [
            {"id": 0, "from": 0, "to": 1, "elevation": 1.5,
             "element": {"type": "PowerLawOrifice", "C": 0.001, "n": 0.65}},
            {"id": 1, "from": 1, "to": 0, "elevation": 1.5,
             "element": {"type": "PowerLawOrifice", "C": 0.001, "n": 0.65}},
            {"id": 2, "from": 1, "to": 2, "elevation": 3.0,
             "element": {"type": "PowerLawOrifice", "C": 0.0005, "n": 0.65}},
            {"id": 3, "from": 2, "to": 3, "elevation": 6.0,
             "element": {"type": "PowerLawOrifice", "C": 0.0005, "n": 0.65}},
            {"id": 4, "from": 2, "to": 0, "elevation": 4.5,
             "element": {"type": "PowerLawOrifice", "C": 0.001, "n": 0.65}},
            {"id": 5, "from": 3, "to": 0, "elevation": 7.5,
             "element": {"type": "PowerLawOrifice", "C": 0.001, "n": 0.65}}
        ]
    })";

    auto network = JsonReader::readFromString(jsonStr);
    EXPECT_EQ(network.getNodeCount(), 4);
    EXPECT_EQ(network.getLinkCount(), 6);

    Solver solver;
    auto result = solver.solve(network);
    EXPECT_TRUE(result.converged);
}

// ============================================================================
// PowerLawOrifice factory method tests
// ============================================================================

TEST(PowerLawFactoryTest, FromLeakageArea) {
    // ELA = 0.01 m² at 4 Pa reference, n=0.65
    auto plo = PowerLawOrifice::fromLeakageArea(0.01, 0.65, 4.0);
    EXPECT_GT(plo.getFlowCoefficient(), 0.0);
    EXPECT_DOUBLE_EQ(plo.getFlowExponent(), 0.65);

    // At 4 Pa, volume flow should equal ELA * sqrt(2*4/1.2)
    double expectedQ = 0.01 * std::sqrt(2.0 * 4.0 / 1.2);
    auto flowResult = plo.calculate(4.0, 1.2);
    double actualQ = flowResult.massFlow / 1.2;  // mass flow / density = volume flow
    EXPECT_NEAR(actualQ, expectedQ, expectedQ * 0.01)
        << "Leakage area conversion should reproduce reference flow at dPref";
}

TEST(PowerLawFactoryTest, FromOrificeArea) {
    // A = 0.05 m², Cd = 0.6
    auto plo = PowerLawOrifice::fromOrificeArea(0.05, 0.6);
    EXPECT_GT(plo.getFlowCoefficient(), 0.0);
    EXPECT_DOUBLE_EQ(plo.getFlowExponent(), 0.5);

    // At 10 Pa, Q = Cd * A * sqrt(2*dP/rho)
    double dP = 10.0;
    double rho = 1.2;
    double expectedQ = 0.6 * 0.05 * std::sqrt(2.0 * dP / rho);
    auto flowResult = plo.calculate(dP, rho);
    double actualQ = flowResult.massFlow / rho;
    EXPECT_NEAR(actualQ, expectedQ, expectedQ * 0.01);
}

// ============================================================================
// Wind pressure Cp(θ) profile test
// ============================================================================

TEST(WindPressureTest, CpProfileInterpolation) {
    Node node(1, "TestWall", NodeType::Ambient);
    node.setTemperature(293.15);
    node.updateDensity();

    // Wall facing north (azimuth = 0°)
    node.setWallAzimuth(0.0);
    node.setTerrainFactor(1.0);

    // Cp profile: 0°=+0.6 (windward), 90°=−0.3, 180°=−0.5 (leeward), 270°=−0.3
    std::vector<std::pair<double, double>> profile = {
        {0.0, 0.6}, {90.0, -0.3}, {180.0, -0.5}, {270.0, -0.3}, {360.0, 0.6}
    };
    node.setWindPressureProfile(profile);

    // Wind from north (0°): θ = 0° - 0° = 0° → Cp = 0.6
    EXPECT_NEAR(node.getCpAtWindDirection(0.0), 0.6, 0.01);

    // Wind from east (90°): θ = 90° → Cp = -0.3
    EXPECT_NEAR(node.getCpAtWindDirection(90.0), -0.3, 0.01);

    // Wind from south (180°): θ = 180° → Cp = -0.5
    EXPECT_NEAR(node.getCpAtWindDirection(180.0), -0.5, 0.01);

    // Wind from 45° (interpolated): Cp ≈ (0.6 + (-0.3)) / 2 = 0.15
    EXPECT_NEAR(node.getCpAtWindDirection(45.0), 0.15, 0.05);
}

TEST(WindPressureTest, TerrainFactorApplied) {
    Node node(1, "Test", NodeType::Ambient);
    node.setTemperature(293.15);
    node.updateDensity();
    node.setWindPressureCoeff(0.6);
    node.setTerrainFactor(0.8);

    double windSpeed = 5.0;
    double pw = node.getWindPressure(windSpeed);
    double expected = 0.5 * node.getDensity() * 0.8 * 0.6 * 25.0;
    EXPECT_NEAR(pw, expected, 0.01);
}

// ============================================================================
// LeakageArea JSON parsing test
// ============================================================================

TEST(JsonReaderTest, LeakageAreaElement) {
    std::string jsonStr = R"({
        "nodes": [
            {"id": 0, "name": "Out", "type": "ambient"},
            {"id": 1, "name": "Room", "temperature": 293.15, "volume": 50.0}
        ],
        "links": [
            {
                "id": 1, "from": 0, "to": 1, "elevation": 1.5,
                "element": {"type": "PowerLawOrifice", "leakageArea": 0.01, "n": 0.65}
            }
        ]
    })";

    auto network = JsonReader::readFromString(jsonStr);
    EXPECT_EQ(network.getLinkCount(), 1);
    auto* elem = network.getLink(0).getFlowElement();
    EXPECT_NE(elem, nullptr);
    EXPECT_EQ(elem->typeName(), "PowerLawOrifice");
}
