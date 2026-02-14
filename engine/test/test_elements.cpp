#include <gtest/gtest.h>
#include "elements/Fan.h"
#include "elements/TwoWayFlow.h"
#include "elements/Duct.h"
#include "elements/Damper.h"
#include "elements/Filter.h"
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

// ── Fan Polynomial Tests ─────────────────────────────────────────────

TEST(FanPolyTest, QuadraticCurve) {
    // ΔP = 200 - 4000*Q  (linear, equivalent to maxFlow=0.05, shutoff=200)
    Fan fan(std::vector<double>{200.0, -4000.0});
    EXPECT_TRUE(fan.isPolynomial());
    EXPECT_NEAR(fan.getShutoffPressure(), 200.0, 1e-6);

    // At ΔP=0, Q should be ~0.05
    auto r0 = fan.calculate(0.0, 1.2);
    EXPECT_NEAR(r0.massFlow, 1.2 * 0.05, 1e-4);

    // At ΔP=200 (shutoff), Q should be ~0
    auto r200 = fan.calculate(200.0, 1.2);
    EXPECT_NEAR(r200.massFlow, 0.0, 1e-6);
}

TEST(FanPolyTest, CubicCurve) {
    // ΔP = 300 - 2000*Q - 50000*Q²
    Fan fan(std::vector<double>{300.0, -2000.0, -50000.0});
    EXPECT_TRUE(fan.isPolynomial());

    // At ΔP=0, should give some positive flow
    auto r = fan.calculate(0.0, 1.2);
    EXPECT_GT(r.massFlow, 0.0);

    // At shutoff (ΔP=300), flow ~0
    auto rs = fan.calculate(300.0, 1.2);
    EXPECT_NEAR(rs.massFlow, 0.0, 1e-4);
}

TEST(FanPolyTest, MatchesLinearMode) {
    // Both should give same results for a linear curve
    Fan linear(0.05, 200.0);
    Fan poly(std::vector<double>{200.0, -4000.0});

    double density = 1.2;
    for (double dp : {0.0, 50.0, 100.0, 150.0}) {
        auto rl = linear.calculate(dp, density);
        auto rp = poly.calculate(dp, density);
        EXPECT_NEAR(rl.massFlow, rp.massFlow, 1e-4);
    }
}

TEST(FanPolyTest, InvalidCoeffs) {
    EXPECT_THROW(Fan(std::vector<double>{200.0}), std::invalid_argument);
}

TEST(FanPolyTest, ClonePolynomial) {
    Fan fan(std::vector<double>{200.0, -4000.0, -10000.0});
    auto cloned = fan.clone();
    auto r1 = fan.calculate(50.0, 1.2);
    auto r2 = cloned->calculate(50.0, 1.2);
    EXPECT_DOUBLE_EQ(r1.massFlow, r2.massFlow);
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

// ── Damper Tests ─────────────────────────────────────────────────────

TEST(DamperTest, FullyOpenMatchesPowerLaw) {
    Damper damper(0.001, 0.65, 1.0);
    PowerLawOrifice plo(0.001, 0.65);
    double density = 1.2;
    auto rd = damper.calculate(10.0, density);
    auto rp = plo.calculate(10.0, density);
    EXPECT_NEAR(rd.massFlow, rp.massFlow, 1e-10);
}

TEST(DamperTest, FullyClosedZeroFlow) {
    Damper damper(0.001, 0.65, 0.0);
    auto result = damper.calculate(50.0, 1.2);
    EXPECT_NEAR(result.massFlow, 0.0, 1e-10);
}

TEST(DamperTest, HalfOpenReducesFlow) {
    Damper full(0.001, 0.65, 1.0);
    Damper half(0.001, 0.65, 0.5);
    auto rFull = full.calculate(50.0, 1.2);
    auto rHalf = half.calculate(50.0, 1.2);
    EXPECT_GT(rFull.massFlow, rHalf.massFlow);
    EXPECT_GT(rHalf.massFlow, 0.0);
}

TEST(DamperTest, NegativePressureNegativeFlow) {
    Damper damper(0.001, 0.65, 0.8);
    auto result = damper.calculate(-10.0, 1.2);
    EXPECT_LT(result.massFlow, 0.0);
}

TEST(DamperTest, Antisymmetry) {
    Damper damper(0.001, 0.65, 0.7);
    auto pos = damper.calculate(10.0, 1.2);
    auto neg = damper.calculate(-10.0, 1.2);
    EXPECT_NEAR(pos.massFlow, -neg.massFlow, 1e-10);
}

TEST(DamperTest, SetFractionChangesFlow) {
    Damper damper(0.001, 0.65, 1.0);
    auto r1 = damper.calculate(10.0, 1.2);
    damper.setFraction(0.3);
    auto r2 = damper.calculate(10.0, 1.2);
    EXPECT_GT(r1.massFlow, r2.massFlow);
}

TEST(DamperTest, FractionClampedToRange) {
    Damper damper(0.001, 0.65, 1.5);  // clamped to 1.0
    EXPECT_DOUBLE_EQ(damper.getFraction(), 1.0);
    damper.setFraction(-0.5);  // clamped to 0.0
    EXPECT_DOUBLE_EQ(damper.getFraction(), 0.0);
}

TEST(DamperTest, InvalidParameters) {
    EXPECT_THROW(Damper(0.0, 0.65), std::invalid_argument);
    EXPECT_THROW(Damper(0.001, 0.3), std::invalid_argument);
    EXPECT_THROW(Damper(0.001, 1.1), std::invalid_argument);
}

TEST(DamperTest, Clone) {
    Damper damper(0.001, 0.65, 0.6);
    auto cloned = damper.clone();
    auto r1 = damper.calculate(10.0, 1.2);
    auto r2 = cloned->calculate(10.0, 1.2);
    EXPECT_DOUBLE_EQ(r1.massFlow, r2.massFlow);
}

TEST(DamperTest, ZeroPressureLinearization) {
    Damper damper(0.001, 0.65, 0.8);
    auto result = damper.calculate(0.0, 1.2);
    EXPECT_NEAR(result.massFlow, 0.0, 1e-10);
    EXPECT_GT(result.derivative, 0.0);
}

// ── Integration: Damper in Network ───────────────────────────────────

TEST(DamperIntegrationTest, DamperControlsFlow) {
    // Two rooms connected by a damper, with stack-driven flow
    Network net;

    Node outdoor(0, "Outdoor", NodeType::Ambient);
    outdoor.setTemperature(283.15);
    net.addNode(outdoor);

    Node room(1, "Room");
    room.setTemperature(293.15);
    room.setVolume(50.0);
    net.addNode(room);

    // Inlet crack
    Link l1(1, 0, 1, 0.5);
    l1.setFlowElement(std::make_unique<PowerLawOrifice>(0.003, 0.65));
    net.addLink(std::move(l1));

    // Outlet damper (half open)
    Link l2(2, 1, 0, 2.5);
    l2.setFlowElement(std::make_unique<Damper>(0.005, 0.65, 0.5));
    net.addLink(std::move(l2));

    Solver solver;
    auto result = solver.solve(net);
    EXPECT_TRUE(result.converged);
}

// ── Filter Tests ─────────────────────────────────────────────────────

TEST(FilterTest, MatchesPowerLawForAirflow) {
    Filter filter(0.001, 0.65, 0.9);
    PowerLawOrifice plo(0.001, 0.65);
    auto rf = filter.calculate(10.0, 1.2);
    auto rp = plo.calculate(10.0, 1.2);
    EXPECT_NEAR(rf.massFlow, rp.massFlow, 1e-10);
}

TEST(FilterTest, NegativePressure) {
    Filter filter(0.001, 0.65, 0.9);
    auto result = filter.calculate(-10.0, 1.2);
    EXPECT_LT(result.massFlow, 0.0);
}

TEST(FilterTest, Antisymmetry) {
    Filter filter(0.001, 0.65, 0.9);
    auto pos = filter.calculate(10.0, 1.2);
    auto neg = filter.calculate(-10.0, 1.2);
    EXPECT_NEAR(pos.massFlow, -neg.massFlow, 1e-10);
}

TEST(FilterTest, EfficiencyClamp) {
    Filter f1(0.001, 0.65, 1.5);
    EXPECT_DOUBLE_EQ(f1.getEfficiency(), 1.0);
    Filter f2(0.001, 0.65, -0.5);
    EXPECT_DOUBLE_EQ(f2.getEfficiency(), 0.0);
}

TEST(FilterTest, SetEfficiency) {
    Filter filter(0.001, 0.65, 0.9);
    EXPECT_DOUBLE_EQ(filter.getEfficiency(), 0.9);
    filter.setEfficiency(0.5);
    EXPECT_DOUBLE_EQ(filter.getEfficiency(), 0.5);
}

TEST(FilterTest, InvalidParameters) {
    EXPECT_THROW(Filter(0.0, 0.65), std::invalid_argument);
    EXPECT_THROW(Filter(0.001, 0.3), std::invalid_argument);
}

TEST(FilterTest, Clone) {
    Filter filter(0.001, 0.65, 0.85);
    auto cloned = filter.clone();
    auto r1 = filter.calculate(10.0, 1.2);
    auto r2 = cloned->calculate(10.0, 1.2);
    EXPECT_DOUBLE_EQ(r1.massFlow, r2.massFlow);
}

TEST(FilterIntegrationTest, FilterInNetwork) {
    Network net;

    Node outdoor(0, "Outdoor", NodeType::Ambient);
    outdoor.setTemperature(283.15);
    net.addNode(outdoor);

    Node room(1, "Room");
    room.setTemperature(293.15);
    room.setVolume(50.0);
    net.addNode(room);

    Link l1(1, 0, 1, 0.5);
    l1.setFlowElement(std::make_unique<PowerLawOrifice>(0.003, 0.65));
    net.addLink(std::move(l1));

    Link l2(2, 1, 0, 2.5);
    l2.setFlowElement(std::make_unique<Filter>(0.003, 0.65, 0.9));
    net.addLink(std::move(l2));

    Solver solver;
    auto result = solver.solve(net);
    EXPECT_TRUE(result.converged);
}
