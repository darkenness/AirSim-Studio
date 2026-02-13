#include <gtest/gtest.h>
#include "elements/Fan.h"
#include "elements/TwoWayFlow.h"
#include "elements/Duct.h"
#include "elements/PowerLawOrifice.h"
#include "core/Network.h"
#include "core/Solver.h"
#include <cmath>
#include <memory>

using namespace contam;

// ── Fan Tests ────────────────────────────────────────────────────────

TEST(FanTest, ZeroPressureMaxFlow) {
    Fan fan(0.1, 100.0);  // 0.1 m³/s max, 100 Pa shutoff
    double density = 1.2;
    auto result = fan.calculate(0.0, density);
    EXPECT_NEAR(result.massFlow, density * 0.1, 1e-10);
}

TEST(FanTest, ShutoffPressureZeroFlow) {
    Fan fan(0.1, 100.0);
    double density = 1.2;
    auto result = fan.calculate(100.0, density);
    EXPECT_NEAR(result.massFlow, 0.0, 1e-10);
}

TEST(FanTest, BeyondShutoffStillZero) {
    Fan fan(0.1, 100.0);
    double density = 1.2;
    auto result = fan.calculate(150.0, density);
    EXPECT_NEAR(result.massFlow, 0.0, 1e-10);
}

TEST(FanTest, NegativePressureIncreasesFlow) {
    Fan fan(0.1, 100.0);
    double density = 1.2;
    auto resultZero = fan.calculate(0.0, density);
    auto resultNeg = fan.calculate(-50.0, density);
    EXPECT_GT(resultNeg.massFlow, resultZero.massFlow);
}

TEST(FanTest, DerivativeNegative) {
    Fan fan(0.1, 100.0);
    double density = 1.2;
    auto result = fan.calculate(50.0, density);
    EXPECT_LT(result.derivative, 0.0);
}

TEST(FanTest, LinearFanCurve) {
    Fan fan(0.1, 100.0);
    double density = 1.2;
    // At half shutoff pressure, should give half max flow
    auto result = fan.calculate(50.0, density);
    EXPECT_NEAR(result.massFlow, density * 0.05, 1e-10);
}

TEST(FanTest, InvalidParameters) {
    EXPECT_THROW(Fan(0.0, 100.0), std::invalid_argument);
    EXPECT_THROW(Fan(0.1, 0.0), std::invalid_argument);
    EXPECT_THROW(Fan(-0.1, 100.0), std::invalid_argument);
}

TEST(FanTest, Clone) {
    Fan fan(0.1, 100.0);
    auto cloned = fan.clone();
    auto result1 = fan.calculate(50.0, 1.2);
    auto result2 = cloned->calculate(50.0, 1.2);
    EXPECT_DOUBLE_EQ(result1.massFlow, result2.massFlow);
}

// ── TwoWayFlow Tests ─────────────────────────────────────────────────

TEST(TwoWayFlowTest, PositivePressurePositiveFlow) {
    TwoWayFlow twf(0.65, 1.0);  // Cd=0.65, 1 m² opening
    double density = 1.2;
    auto result = twf.calculate(10.0, density);
    EXPECT_GT(result.massFlow, 0.0);
}

TEST(TwoWayFlowTest, NegativePressureNegativeFlow) {
    TwoWayFlow twf(0.65, 1.0);
    double density = 1.2;
    auto result = twf.calculate(-10.0, density);
    EXPECT_LT(result.massFlow, 0.0);
}

TEST(TwoWayFlowTest, Antisymmetry) {
    TwoWayFlow twf(0.65, 1.0);
    double density = 1.2;
    auto pos = twf.calculate(10.0, density);
    auto neg = twf.calculate(-10.0, density);
    EXPECT_NEAR(pos.massFlow, -neg.massFlow, 1e-6);
}

TEST(TwoWayFlowTest, ZeroPressureLinearization) {
    TwoWayFlow twf(0.65, 1.0);
    double density = 1.2;
    auto result = twf.calculate(0.0, density);
    EXPECT_NEAR(result.massFlow, 0.0, 1e-10);
    EXPECT_GT(result.derivative, 0.0);
}

TEST(TwoWayFlowTest, LargerAreaMoreFlow) {
    TwoWayFlow small(0.65, 0.5);  // 0.5 m²
    TwoWayFlow large(0.65, 2.0);  // 2.0 m²
    double density = 1.2;
    auto rSmall = small.calculate(10.0, density);
    auto rLarge = large.calculate(10.0, density);
    EXPECT_GT(rLarge.massFlow, rSmall.massFlow);
}

TEST(TwoWayFlowTest, OrificeEquation) {
    double Cd = 0.65;
    double A = 1.0;
    double dP = 50.0;
    double rho = 1.2;
    TwoWayFlow twf(Cd, A);
    auto result = twf.calculate(dP, rho);

    // Expected: ṁ = ρ * Cd * A * sqrt(2 * ΔP / ρ)
    double Q = Cd * A * std::sqrt(2.0 * dP / rho);
    double expected = rho * Q;
    EXPECT_NEAR(result.massFlow, expected, 1e-6);
}

TEST(TwoWayFlowTest, DerivativePositive) {
    TwoWayFlow twf(0.65, 1.0);
    double density = 1.2;
    auto result = twf.calculate(10.0, density);
    EXPECT_GT(result.derivative, 0.0);
}

TEST(TwoWayFlowTest, InvalidParameters) {
    EXPECT_THROW(TwoWayFlow(0.0, 1.0), std::invalid_argument);
    EXPECT_THROW(TwoWayFlow(0.65, 0.0), std::invalid_argument);
}

TEST(TwoWayFlowTest, Clone) {
    TwoWayFlow twf(0.65, 1.0);
    auto cloned = twf.clone();
    auto result1 = twf.calculate(10.0, 1.2);
    auto result2 = cloned->calculate(10.0, 1.2);
    EXPECT_DOUBLE_EQ(result1.massFlow, result2.massFlow);
}

// ── Integration: Fan in Network ──────────────────────────────────────

TEST(FanIntegrationTest, FanDrivenFlow) {
    Network net;

    Node outdoor(0, "Outdoor", NodeType::Ambient);
    outdoor.setTemperature(293.15);
    net.addNode(outdoor);

    Node room(1, "Room");
    room.setTemperature(293.15);
    room.setVolume(50.0);
    net.addNode(room);

    // Fan pushing air into room
    Link l1(1, 0, 1, 1.5);
    l1.setFlowElement(std::make_unique<Fan>(0.05, 200.0));  // 50 L/s, 200 Pa
    net.addLink(std::move(l1));

    // Exhaust crack
    Link l2(2, 1, 0, 1.5);
    l2.setFlowElement(std::make_unique<PowerLawOrifice>(0.005, 0.65));
    net.addLink(std::move(l2));

    Solver solver;
    auto result = solver.solve(net);
    EXPECT_TRUE(result.converged);

    // Room should be pressurized (positive pressure from fan)
    EXPECT_GT(result.pressures[1], 0.0);

    // Fan flow should be positive (into room)
    EXPECT_GT(result.massFlows[0], 0.0);
}

// ── Integration: TwoWayFlow in Network ───────────────────────────────

TEST(TwoWayFlowIntegrationTest, LargeOpeningFlow) {
    Network net;

    Node outdoor(0, "Outdoor", NodeType::Ambient);
    outdoor.setTemperature(283.15);  // Cool outside
    net.addNode(outdoor);

    Node room(1, "Room");
    room.setTemperature(293.15);  // Warm inside
    room.setVolume(50.0);
    net.addNode(room);

    // Small window opening at bottom
    Link l1(1, 0, 1, 0.5);
    l1.setFlowElement(std::make_unique<TwoWayFlow>(0.65, 0.02));  // 0.02 m² opening
    net.addLink(std::move(l1));

    // Comparable crack at top
    Link l2(2, 1, 0, 2.5);
    l2.setFlowElement(std::make_unique<PowerLawOrifice>(0.005, 0.65));
    net.addLink(std::move(l2));

    Solver solver;
    auto result = solver.solve(net);
    EXPECT_TRUE(result.converged);

    // With temperature difference, should have some pressure in the room
    // (stack effect drives flow)
}

// ── Duct Tests ───────────────────────────────────────────────────────

TEST(DuctTest, PositivePressurePositiveFlow) {
    Duct duct(5.0, 0.2);  // 5m long, 200mm diameter
    double density = 1.2;
    auto result = duct.calculate(50.0, density);
    EXPECT_GT(result.massFlow, 0.0);
}

TEST(DuctTest, NegativePressureNegativeFlow) {
    Duct duct(5.0, 0.2);
    auto result = duct.calculate(-50.0, 1.2);
    EXPECT_LT(result.massFlow, 0.0);
}

TEST(DuctTest, Antisymmetry) {
    Duct duct(5.0, 0.2);
    auto pos = duct.calculate(50.0, 1.2);
    auto neg = duct.calculate(-50.0, 1.2);
    EXPECT_NEAR(pos.massFlow, -neg.massFlow, 1e-6);
}

TEST(DuctTest, LongerDuctLessFlow) {
    Duct short_duct(2.0, 0.2);
    Duct long_duct(10.0, 0.2);
    auto rShort = short_duct.calculate(50.0, 1.2);
    auto rLong = long_duct.calculate(50.0, 1.2);
    EXPECT_GT(rShort.massFlow, rLong.massFlow);
}

TEST(DuctTest, LargerDiameterMoreFlow) {
    Duct small(5.0, 0.1);
    Duct large(5.0, 0.3);
    auto rSmall = small.calculate(50.0, 1.2);
    auto rLarge = large.calculate(50.0, 1.2);
    EXPECT_GT(rLarge.massFlow, rSmall.massFlow);
}

TEST(DuctTest, ZeroPressureLinearization) {
    Duct duct(5.0, 0.2);
    auto result = duct.calculate(0.0, 1.2);
    EXPECT_NEAR(result.massFlow, 0.0, 1e-10);
    EXPECT_GT(result.derivative, 0.0);
}

TEST(DuctTest, DerivativePositive) {
    Duct duct(5.0, 0.2);
    auto result = duct.calculate(50.0, 1.2);
    EXPECT_GT(result.derivative, 0.0);
}

TEST(DuctTest, MinorLossesReduceFlow) {
    Duct noMinor(5.0, 0.2, 0.0001, 0.0);
    Duct withMinor(5.0, 0.2, 0.0001, 10.0);  // sumK=10
    auto r1 = noMinor.calculate(50.0, 1.2);
    auto r2 = withMinor.calculate(50.0, 1.2);
    EXPECT_GT(r1.massFlow, r2.massFlow);
}

TEST(DuctTest, InvalidParameters) {
    EXPECT_THROW(Duct(0.0, 0.2), std::invalid_argument);
    EXPECT_THROW(Duct(5.0, 0.0), std::invalid_argument);
    EXPECT_THROW(Duct(5.0, 0.2, -0.001), std::invalid_argument);
}

TEST(DuctTest, Clone) {
    Duct duct(5.0, 0.2, 0.0001, 2.0);
    auto cloned = duct.clone();
    auto r1 = duct.calculate(50.0, 1.2);
    auto r2 = cloned->calculate(50.0, 1.2);
    EXPECT_DOUBLE_EQ(r1.massFlow, r2.massFlow);
}

// ── Integration: Duct in Network ─────────────────────────────────────

TEST(DuctIntegrationTest, DuctWithFanNetwork) {
    Network net;

    Node outdoor(0, "Outdoor", NodeType::Ambient);
    outdoor.setTemperature(293.15);
    net.addNode(outdoor);

    Node room(1, "Room");
    room.setTemperature(293.15);
    room.setVolume(50.0);
    net.addNode(room);

    // Fan supply duct
    Link l1(1, 0, 1, 1.5);
    l1.setFlowElement(std::make_unique<Fan>(0.05, 200.0));
    net.addLink(std::move(l1));

    // Exhaust duct
    Link l2(2, 1, 0, 1.5);
    l2.setFlowElement(std::make_unique<Duct>(3.0, 0.15, 0.0001, 1.5));
    net.addLink(std::move(l2));

    Solver solver;
    auto result = solver.solve(net);
    EXPECT_TRUE(result.converged);

    // Room should be pressurized by fan
    EXPECT_GT(result.pressures[1], 0.0);
    // Fan flow into room
    EXPECT_GT(result.massFlows[0], 0.0);
    // Duct exhaust flow out of room
    EXPECT_GT(result.massFlows[1], 0.0);
}
