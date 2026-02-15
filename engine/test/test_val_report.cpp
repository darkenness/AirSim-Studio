#include <gtest/gtest.h>
#include "io/ValReport.h"
#include "core/Network.h"
#include "core/Node.h"
#include "core/Link.h"
#include "elements/FlowElement.h"
#include <cmath>
#include <memory>

using namespace contam;

// ── Minimal power-law element for testing ────────────────────────────
// Q = C * dP^n  (mass flow = rho * C * |dP|^n * sign(dP))
class TestPowerLaw : public FlowElement {
public:
    TestPowerLaw(double coeff, double exponent)
        : coeff_(coeff), exponent_(exponent) {}

    FlowResult calculate(double deltaP, double density) const override {
        double sign = (deltaP >= 0.0) ? 1.0 : -1.0;
        double absDp = std::abs(deltaP);
        double volFlow = coeff_ * std::pow(absDp, exponent_);
        double massFlow = density * volFlow * sign;
        double deriv = (absDp > 1e-12)
            ? density * coeff_ * exponent_ * std::pow(absDp, exponent_ - 1.0)
            : 0.0;
        return {massFlow, deriv};
    }

    std::string typeName() const override { return "TestPowerLaw"; }
    std::unique_ptr<FlowElement> clone() const override {
        return std::make_unique<TestPowerLaw>(coeff_, exponent_);
    }

private:
    double coeff_;
    double exponent_;
};

// ── Helper: build a simple 1-zone + 1-ambient network with N links ──
static Network buildSimpleNetwork(int numLinks, double coeff, double exponent) {
    Network net;

    // Node 0: interior zone
    Node interior(1, "Zone1", NodeType::Normal);
    interior.setVolume(100.0);
    net.addNode(interior);

    // Node 1: ambient
    Node ambient(2, "Ambient", NodeType::Ambient);
    net.addNode(ambient);

    for (int i = 0; i < numLinks; ++i) {
        Link link(i + 1, 0, 1, 0.0); // from interior(0) to ambient(1)
        link.setFlowElement(std::make_unique<TestPowerLaw>(coeff, exponent));
        net.addLink(std::move(link));
    }

    return net;
}

// ── Tests ────────────────────────────────────────────────────────────

TEST(ValReport, SingleLinkLeakage) {
    // C=0.01, n=0.65, dP=50 Pa, rho=1.2
    double C = 0.01;
    double n = 0.65;
    double dP = 50.0;
    double rho = 1.2;

    Network net = buildSimpleNetwork(1, C, n);
    ValResult res = ValReport::generate(net, dP, rho);

    EXPECT_EQ(res.linkBreakdown.size(), 1u);
    EXPECT_DOUBLE_EQ(res.targetDeltaP, dP);
    EXPECT_DOUBLE_EQ(res.airDensity, rho);

    // Expected volumetric flow: C * dP^n
    double expectedVolFlow = C * std::pow(dP, n);
    double expectedMassFlow = rho * expectedVolFlow;

    EXPECT_NEAR(res.totalLeakageVol, expectedVolFlow, 1e-10);
    EXPECT_NEAR(res.totalLeakageMass, expectedMassFlow, 1e-10);
    EXPECT_NEAR(res.totalLeakageVolH, expectedVolFlow * 3600.0, 1e-6);

    // ELA = Q / (Cd * sqrt(2*dP/rho))
    double Cd = 0.611;
    double expectedELA = expectedVolFlow / (Cd * std::sqrt(2.0 * dP / rho));
    EXPECT_NEAR(res.equivalentLeakageArea, expectedELA, 1e-10);
}

TEST(ValReport, MultipleLinksSum) {
    double C = 0.005;
    double n = 0.5;
    double dP = 50.0;
    double rho = 1.2;
    int numLinks = 3;

    Network net = buildSimpleNetwork(numLinks, C, n);
    ValResult res = ValReport::generate(net, dP, rho);

    EXPECT_EQ(res.linkBreakdown.size(), static_cast<size_t>(numLinks));

    double singleVolFlow = C * std::pow(dP, n);
    double expectedTotalVol = singleVolFlow * numLinks;

    EXPECT_NEAR(res.totalLeakageVol, expectedTotalVol, 1e-10);
    EXPECT_NEAR(res.totalLeakageMass, rho * expectedTotalVol, 1e-10);
}

TEST(ValReport, NoExteriorLinks) {
    // Two interior zones connected — no ambient node involved
    Network net;
    Node z1(1, "Zone1", NodeType::Normal);
    z1.setVolume(50.0);
    Node z2(2, "Zone2", NodeType::Normal);
    z2.setVolume(50.0);
    net.addNode(z1);
    net.addNode(z2);

    Link link(1, 0, 1, 0.0);
    link.setFlowElement(std::make_unique<TestPowerLaw>(0.01, 0.65));
    net.addLink(std::move(link));

    ValResult res = ValReport::generate(net, 50.0, 1.2);

    EXPECT_EQ(res.linkBreakdown.size(), 0u);
    EXPECT_DOUBLE_EQ(res.totalLeakageMass, 0.0);
    EXPECT_DOUBLE_EQ(res.totalLeakageVol, 0.0);
    EXPECT_DOUBLE_EQ(res.equivalentLeakageArea, 0.0);
}

TEST(ValReport, ReverseNodeOrder) {
    // Link from ambient(0) to interior(1) — should still work
    double C = 0.01;
    double n = 0.65;
    double dP = 50.0;
    double rho = 1.2;

    Network net;
    Node ambient(1, "Ambient", NodeType::Ambient);
    Node interior(2, "Zone1", NodeType::Normal);
    interior.setVolume(100.0);
    net.addNode(ambient);   // index 0
    net.addNode(interior);  // index 1

    Link link(1, 0, 1, 0.0); // from ambient to interior
    link.setFlowElement(std::make_unique<TestPowerLaw>(C, n));
    net.addLink(std::move(link));

    ValResult res = ValReport::generate(net, dP, rho);

    EXPECT_EQ(res.linkBreakdown.size(), 1u);
    double expectedVolFlow = C * std::pow(dP, n);
    EXPECT_NEAR(res.totalLeakageVol, expectedVolFlow, 1e-10);
}

TEST(ValReport, FormatTextContainsKey) {
    Network net = buildSimpleNetwork(1, 0.01, 0.65);
    ValResult res = ValReport::generate(net, 50.0, 1.2);
    std::string text = ValReport::formatText(res);

    EXPECT_NE(text.find("Building Pressurization Test"), std::string::npos);
    EXPECT_NE(text.find("50.0000"), std::string::npos);
    EXPECT_NE(text.find("ELA"), std::string::npos);
    EXPECT_NE(text.find("TestPowerLaw"), std::string::npos);
}

TEST(ValReport, FormatCsvStructure) {
    Network net = buildSimpleNetwork(2, 0.01, 0.65);
    ValResult res = ValReport::generate(net, 50.0, 1.2);
    std::string csv = ValReport::formatCsv(res);

    // Header row
    EXPECT_NE(csv.find("LinkId,NodeFromId,NodeToId,ElementType,MassFlow_kgs,VolFlow_m3s"), std::string::npos);
    // Metadata comments
    EXPECT_NE(csv.find("# TargetDeltaP_Pa,"), std::string::npos);
    EXPECT_NE(csv.find("# ELA_m2,"), std::string::npos);
}
