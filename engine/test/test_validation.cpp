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

// ============================================================================
// Case 02: Single room CO2 transient validation
// ============================================================================
// Topology: 1 room (Office, 60m³) + Ambient, 2 cracks
// Driving force: stack effect (indoor 293.15K, outdoor 273.15K), no wind
// CO2 source: 5e-6 kg/s with schedule (off 0-300s, on 360-1800s, off 1860-3600s)
// Transient: 0-3600s, dt=30s, output every 60s
// Verification: airflow convergence, concentration accuracy, mass conservation

TEST(ValidationCase02, Converges) {
    auto model = JsonReader::readModelFromFile("../../validation/case02_co2_source/input.json");

    TransientSimulation sim;
    sim.setConfig(model.transientConfig);
    sim.setSpecies(model.species);
    sim.setSources(model.sources);
    sim.setSchedules(model.schedules);

    auto result = sim.run(model.network);
    ASSERT_TRUE(result.completed);
    EXPECT_GT(result.history.size(), 0);

    // Check first step converged
    EXPECT_TRUE(result.history[0].airflow.converged);
    EXPECT_LT(result.history[0].airflow.maxResidual, CONVERGENCE_TOL);
}

TEST(ValidationCase02, AirflowAccuracy) {
    auto model = JsonReader::readModelFromFile("../../validation/case02_co2_source/input.json");

    TransientSimulation sim;
    sim.setConfig(model.transientConfig);
    sim.setSpecies(model.species);
    sim.setSources(model.sources);
    sim.setSchedules(model.schedules);

    auto result = sim.run(model.network);
    ASSERT_TRUE(result.completed);
    ASSERT_GT(result.history.size(), 0);

    // Reference airflow at first step (constant throughout)
    std::vector<double> refMassFlows = {0.002271335797949386, 0.0022713302524782785};
    std::vector<double> refPressures = {0.0, -1.2971159249570685};

    auto& firstStep = result.history[0];
    ASSERT_EQ(firstStep.airflow.massFlows.size(), refMassFlows.size());

    // Check mass flows (1e-4 relative tolerance)
    for (size_t i = 0; i < refMassFlows.size(); ++i) {
        double relTol = std::abs(refMassFlows[i]) * 1e-4;
        EXPECT_NEAR(firstStep.airflow.massFlows[i], refMassFlows[i], relTol)
            << "Mass flow mismatch at link " << i;
    }

    // Check pressures
    ASSERT_EQ(firstStep.airflow.pressures.size(), refPressures.size());
    for (size_t i = 0; i < refPressures.size(); ++i) {
        if (std::abs(refPressures[i]) < 1e-6) {
            EXPECT_NEAR(firstStep.airflow.pressures[i], refPressures[i], 1e-6);
        } else {
            double relTol = std::abs(refPressures[i]) * 1e-4;
            EXPECT_NEAR(firstStep.airflow.pressures[i], refPressures[i], relTol)
                << "Pressure mismatch at node " << i;
        }
    }
}

TEST(ValidationCase02, ConcentrationAccuracy) {
    auto model = JsonReader::readModelFromFile("../../validation/case02_co2_source/input.json");

    TransientSimulation sim;
    sim.setConfig(model.transientConfig);
    sim.setSpecies(model.species);
    sim.setSources(model.sources);
    sim.setSchedules(model.schedules);

    auto result = sim.run(model.network);
    ASSERT_TRUE(result.completed);

    // Find t=1800s step (peak source)
    auto it1800 = std::find_if(result.history.begin(), result.history.end(),
        [](const auto& step) { return std::abs(step.time - 1800.0) < 1e-3; });
    ASSERT_NE(it1800, result.history.end());

    // Reference CO2 at t=1800s: Office conc = 0.00015774366850436868
    double refConc1800 = 0.00015774366850436868;
    ASSERT_GT(it1800->contaminant.concentrations.size(), 0);
    ASSERT_GT(it1800->contaminant.concentrations[0].size(), 1);  // Node 1 (Office), species 0 (CO2)
    double actualConc1800 = it1800->contaminant.concentrations[0][1];
    double relTol1800 = refConc1800 * 0.01;  // 1% tolerance
    EXPECT_NEAR(actualConc1800, refConc1800, relTol1800)
        << "CO2 concentration mismatch at t=1800s";

    // Find t=3600s step (end, source off since 1860s)
    auto it3600 = std::find_if(result.history.begin(), result.history.end(),
        [](const auto& step) { return std::abs(step.time - 3600.0) < 1e-3; });
    ASSERT_NE(it3600, result.history.end());

    // Reference CO2 at t=3600s: Office conc = 0.00018714391510893705
    double refConc3600 = 0.00018714391510893705;
    double actualConc3600 = it3600->contaminant.concentrations[0][1];
    double relTol3600 = refConc3600 * 0.01;
    EXPECT_NEAR(actualConc3600, refConc3600, relTol3600)
        << "CO2 concentration mismatch at t=3600s";
}

TEST(ValidationCase02, MassConservation) {
    auto model = JsonReader::readModelFromFile("../../validation/case02_co2_source/input.json");

    TransientSimulation sim;
    sim.setConfig(model.transientConfig);
    sim.setSpecies(model.species);
    sim.setSources(model.sources);
    sim.setSchedules(model.schedules);

    auto result = sim.run(model.network);
    ASSERT_TRUE(result.completed);

    int numNodes = model.network.getNodeCount();

    // Check mass conservation at each time step
    for (const auto& step : result.history) {
        std::vector<double> netFlow(numNodes, 0.0);

        for (size_t i = 0; i < step.airflow.massFlows.size(); ++i) {
            int from = model.network.getLink(i).getNodeFrom();
            int to = model.network.getLink(i).getNodeTo();
            double flow = step.airflow.massFlows[i];
            netFlow[from] -= flow;
            netFlow[to] += flow;
        }

        // Each non-ambient node should have net flow ≈ 0
        for (int i = 0; i < numNodes; ++i) {
            if (!model.network.getNode(i).isKnownPressure()) {
                EXPECT_NEAR(netFlow[i], 0.0, 1e-6)
                    << "Mass conservation violated at node " << i
                    << " at time " << step.time << "s";
            }
        }
    }
}

// ============================================================================
// Case 03: Fan-driven ventilation with duct validation
// ============================================================================
// Topology: Office (60m³) + Corridor (40m³) + Ambient
// Elements: supply_fan, exhaust_duct, door (TwoWayFlow), crack
// CO2 source: 8e-6 kg/s in Office (constant)
// Transient: 0-3600s, dt=30s, output every 60s
// Verification: fan operation, duct resistance, concentration accuracy

TEST(ValidationCase03, Converges) {
    auto model = JsonReader::readModelFromFile("../../validation/case03_fan_duct/input.json");

    TransientSimulation sim;
    sim.setConfig(model.transientConfig);
    sim.setSpecies(model.species);
    sim.setSources(model.sources);
    sim.setSchedules(model.schedules);

    auto result = sim.run(model.network);
    ASSERT_TRUE(result.completed);
    EXPECT_GT(result.history.size(), 0);

    // Check first step converged
    EXPECT_TRUE(result.history[0].airflow.converged);
    EXPECT_LT(result.history[0].airflow.maxResidual, CONVERGENCE_TOL);
}

TEST(ValidationCase03, AirflowAccuracy) {
    auto model = JsonReader::readModelFromFile("../../validation/case03_fan_duct/input.json");

    TransientSimulation sim;
    sim.setConfig(model.transientConfig);
    sim.setSpecies(model.species);
    sim.setSources(model.sources);
    sim.setSchedules(model.schedules);

    auto result = sim.run(model.network);
    ASSERT_TRUE(result.completed);
    ASSERT_GT(result.history.size(), 0);

    // Reference airflow (steady-state)
    std::vector<double> refMassFlows = {
        0.06766392356111356,   // Fan: Amb→Office
        0.059066503143075114,  // Door: Office→Corridor
        0.05906647203571158,   // Duct: Corridor→Amb
        0.008597417236456427   // Crack: Office→Amb
    };
    std::vector<double> refPressures = {
        0.0,                   // Ambient
        19.820511643800145,    // Office
        11.358868725428604     // Corridor
    };

    auto& firstStep = result.history[0];
    ASSERT_EQ(firstStep.airflow.massFlows.size(), refMassFlows.size());

    // Check mass flows
    for (size_t i = 0; i < refMassFlows.size(); ++i) {
        double relTol = std::abs(refMassFlows[i]) * 1e-4;
        EXPECT_NEAR(firstStep.airflow.massFlows[i], refMassFlows[i], relTol)
            << "Mass flow mismatch at link " << i;
    }

    // Check pressures
    ASSERT_EQ(firstStep.airflow.pressures.size(), refPressures.size());
    for (size_t i = 0; i < refPressures.size(); ++i) {
        if (std::abs(refPressures[i]) < 1e-6) {
            EXPECT_NEAR(firstStep.airflow.pressures[i], refPressures[i], 1e-6);
        } else {
            double relTol = std::abs(refPressures[i]) * 1e-4;
            EXPECT_NEAR(firstStep.airflow.pressures[i], refPressures[i], relTol)
                << "Pressure mismatch at node " << i;
        }
    }
}

TEST(ValidationCase03, ConcentrationAccuracy) {
    auto model = JsonReader::readModelFromFile("../../validation/case03_fan_duct/input.json");

    TransientSimulation sim;
    sim.setConfig(model.transientConfig);
    sim.setSpecies(model.species);
    sim.setSources(model.sources);
    sim.setSchedules(model.schedules);

    auto result = sim.run(model.network);
    ASSERT_TRUE(result.completed);

    // Find t=3600s step (final)
    auto it3600 = std::find_if(result.history.begin(), result.history.end(),
        [](const auto& step) { return std::abs(step.time - 3600.0) < 1e-3; });
    ASSERT_NE(it3600, result.history.end());

    // Reference CO2 at t=3600s
    double refOfficeConc = 0.0008078077413932571;
    double refCorridorConc = 0.0007501299758226876;

    ASSERT_GT(it3600->contaminant.concentrations.size(), 0);
    ASSERT_GE(it3600->contaminant.concentrations[0].size(), 3);  // Nodes 0,1,2

    double actualOfficeConc = it3600->contaminant.concentrations[0][1];    // Node 1 (Office)
    double actualCorridorConc = it3600->contaminant.concentrations[0][2];  // Node 2 (Corridor)

    double relTolOffice = refOfficeConc * 0.01;
    double relTolCorridor = refCorridorConc * 0.01;

    EXPECT_NEAR(actualOfficeConc, refOfficeConc, relTolOffice)
        << "Office CO2 concentration mismatch at t=3600s";
    EXPECT_NEAR(actualCorridorConc, refCorridorConc, relTolCorridor)
        << "Corridor CO2 concentration mismatch at t=3600s";
}

TEST(ValidationCase03, MassConservation) {
    auto model = JsonReader::readModelFromFile("../../validation/case03_fan_duct/input.json");

    TransientSimulation sim;
    sim.setConfig(model.transientConfig);
    sim.setSpecies(model.species);
    sim.setSources(model.sources);
    sim.setSchedules(model.schedules);

    auto result = sim.run(model.network);
    ASSERT_TRUE(result.completed);

    int numNodes = model.network.getNodeCount();

    for (const auto& step : result.history) {
        std::vector<double> netFlow(numNodes, 0.0);

        for (size_t i = 0; i < step.airflow.massFlows.size(); ++i) {
            int from = model.network.getLink(i).getNodeFrom();
            int to = model.network.getLink(i).getNodeTo();
            double flow = step.airflow.massFlows[i];
            netFlow[from] -= flow;
            netFlow[to] += flow;
        }

        for (int i = 0; i < numNodes; ++i) {
            if (!model.network.getNode(i).isKnownPressure()) {
                EXPECT_NEAR(netFlow[i], 0.0, 1e-6)
                    << "Mass conservation violated at node " << i
                    << " at time " << step.time << "s";
            }
        }
    }
}

// ============================================================================
// Case 04: Multi-zone with all element types validation
// ============================================================================
// Topology: Office A (45m³) + Office B (55m³) + Corridor (30m³) + Ambient
// Elements: supply_fan, supply_duct, exhaust_duct, office_door (x2),
//           corridor_damper, window_crack, facade_crack
// 2 species: CO2 + PM2.5 (with decay 0.0001)
// CO2 sources: 6e-6 in Office A, 8e-6 in Office B
// Transient: 0-7200s, dt=30s, output every 120s
// Verification: multi-species transport, decay, complex topology

TEST(ValidationCase04, Converges) {
    auto model = JsonReader::readModelFromFile("../../validation/case04_multizone/input.json");

    TransientSimulation sim;
    sim.setConfig(model.transientConfig);
    sim.setSpecies(model.species);
    sim.setSources(model.sources);
    sim.setSchedules(model.schedules);

    auto result = sim.run(model.network);
    ASSERT_TRUE(result.completed);
    EXPECT_GT(result.history.size(), 0);

    // Check first step converged
    EXPECT_TRUE(result.history[0].airflow.converged);
    EXPECT_LT(result.history[0].airflow.maxResidual, CONVERGENCE_TOL);
}

TEST(ValidationCase04, AirflowAccuracy) {
    auto model = JsonReader::readModelFromFile("../../validation/case04_multizone/input.json");

    TransientSimulation sim;
    sim.setConfig(model.transientConfig);
    sim.setSpecies(model.species);
    sim.setSources(model.sources);
    sim.setSchedules(model.schedules);

    auto result = sim.run(model.network);
    ASSERT_TRUE(result.completed);
    ASSERT_GT(result.history.size(), 0);

    // Reference airflow (steady-state)
    std::vector<double> refMassFlows = {
        0.10132547778346775,   // supply_fan
        -0.06664655379020709,  // supply_duct
        0.03281810000224549,   // exhaust_duct
        -0.0010610618443331994,// office_door_A
        -0.0010654535327370676,// office_door_B
        0.028500448735391027,  // corridor_damper
        0.003252215944880021,  // window_crack
        0.0018608267060884834  // facade_crack
    };
    std::vector<double> refPressures = {
        0.0,                   // Ambient
        5.116779015247205,     // Office A
        0.4469147852604575,    // Office B
        0.5730967623578821     // Corridor
    };

    auto& firstStep = result.history[0];
    ASSERT_EQ(firstStep.airflow.massFlows.size(), refMassFlows.size());

    // Check mass flows
    for (size_t i = 0; i < refMassFlows.size(); ++i) {
        double relTol = std::abs(refMassFlows[i]) * 1e-4;
        if (relTol < 1e-9) relTol = 1e-9;  // Minimum absolute tolerance
        EXPECT_NEAR(firstStep.airflow.massFlows[i], refMassFlows[i], relTol)
            << "Mass flow mismatch at link " << i;
    }

    // Check pressures
    ASSERT_EQ(firstStep.airflow.pressures.size(), refPressures.size());
    for (size_t i = 0; i < refPressures.size(); ++i) {
        if (std::abs(refPressures[i]) < 1e-6) {
            EXPECT_NEAR(firstStep.airflow.pressures[i], refPressures[i], 1e-6);
        } else {
            double relTol = std::abs(refPressures[i]) * 1e-4;
            EXPECT_NEAR(firstStep.airflow.pressures[i], refPressures[i], relTol)
                << "Pressure mismatch at node " << i;
        }
    }
}

TEST(ValidationCase04, ConcentrationAccuracy) {
    auto model = JsonReader::readModelFromFile("../../validation/case04_multizone/input.json");

    TransientSimulation sim;
    sim.setConfig(model.transientConfig);
    sim.setSpecies(model.species);
    sim.setSources(model.sources);
    sim.setSchedules(model.schedules);

    auto result = sim.run(model.network);
    ASSERT_TRUE(result.completed);

    // Find t=7200s step (final)
    auto it7200 = std::find_if(result.history.begin(), result.history.end(),
        [](const auto& step) { return std::abs(step.time - 7200.0) < 1e-3; });
    ASSERT_NE(it7200, result.history.end());

    // Reference CO2 at t=7200s
    double refOfficeAConc = 0.0007493835916719974;
    double refOfficeBConc = 0.0010526575083065054;
    double refCorridorConc = 0.000757347777498626;

    ASSERT_GT(it7200->contaminant.concentrations.size(), 0);  // At least 1 species (CO2)
    ASSERT_GE(it7200->contaminant.concentrations[0].size(), 4);  // Nodes 0,1,2,3

    double actualOfficeAConc = it7200->contaminant.concentrations[0][1];   // Node 1 (Office A)
    double actualOfficeBConc = it7200->contaminant.concentrations[0][2];   // Node 2 (Office B)
    double actualCorridorConc = it7200->contaminant.concentrations[0][3];  // Node 3 (Corridor)

    double relTolA = refOfficeAConc * 0.01;
    double relTolB = refOfficeBConc * 0.01;
    double relTolC = refCorridorConc * 0.01;

    EXPECT_NEAR(actualOfficeAConc, refOfficeAConc, relTolA)
        << "Office A CO2 concentration mismatch at t=7200s";
    EXPECT_NEAR(actualOfficeBConc, refOfficeBConc, relTolB)
        << "Office B CO2 concentration mismatch at t=7200s";
    EXPECT_NEAR(actualCorridorConc, refCorridorConc, relTolC)
        << "Corridor CO2 concentration mismatch at t=7200s";
}

TEST(ValidationCase04, MassConservation) {
    auto model = JsonReader::readModelFromFile("../../validation/case04_multizone/input.json");

    TransientSimulation sim;
    sim.setConfig(model.transientConfig);
    sim.setSpecies(model.species);
    sim.setSources(model.sources);
    sim.setSchedules(model.schedules);

    auto result = sim.run(model.network);
    ASSERT_TRUE(result.completed);

    int numNodes = model.network.getNodeCount();

    for (const auto& step : result.history) {
        std::vector<double> netFlow(numNodes, 0.0);

        for (size_t i = 0; i < step.airflow.massFlows.size(); ++i) {
            int from = model.network.getLink(i).getNodeFrom();
            int to = model.network.getLink(i).getNodeTo();
            double flow = step.airflow.massFlows[i];
            netFlow[from] -= flow;
            netFlow[to] += flow;
        }

        for (int i = 0; i < numNodes; ++i) {
            if (!model.network.getNode(i).isKnownPressure()) {
                EXPECT_NEAR(netFlow[i], 0.0, 1e-6)
                    << "Mass conservation violated at node " << i
                    << " at time " << step.time << "s";
            }
        }
    }
}
