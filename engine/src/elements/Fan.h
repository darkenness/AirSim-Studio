#pragma once

#include "elements/FlowElement.h"
#include <vector>
#include <utility>

namespace contam {

// Fan / Blower Model
// Uses a polynomial performance curve: ΔP = a0 + a1*Q + a2*Q^2 + ...
// where Q is the volumetric flow rate (m³/s)
// The fan maintains flow against a pressure difference.
// When ΔP exceeds the shutoff pressure (a0), flow is zero.
// Flow is always in the positive direction (from node_i to node_j).
class Fan : public FlowElement {
public:
    // Simple linear mode: maxFlow at ΔP=0, zero flow at shutoffPressure
    Fan(double maxFlow, double shutoffPressure);

    // Polynomial mode: ΔP = coeffs[0] + coeffs[1]*Q + coeffs[2]*Q² + ...
    // coeffs[0] = shutoff pressure, flow solved by Newton iteration
    explicit Fan(const std::vector<double>& coeffs);

    FlowResult calculate(double deltaP, double density) const override;
    std::string typeName() const override { return "Fan"; }
    std::unique_ptr<FlowElement> clone() const override;

    double getMaxFlow() const { return maxFlow_; }
    double getShutoffPressure() const { return shutoffPressure_; }
    bool isPolynomial() const { return usePolynomial_; }
    const std::vector<double>& getCoeffs() const { return coeffs_; }

private:
    double maxFlow_;          // m³/s at ΔP=0
    double shutoffPressure_;  // Pa, fan curve intercept
    bool usePolynomial_;      // true = polynomial mode
    std::vector<double> coeffs_; // polynomial coefficients

    // Evaluate polynomial: ΔP_fan(Q) = sum(coeffs[i] * Q^i)
    double evalCurve(double Q) const;
    // Derivative: dΔP_fan/dQ = sum(i * coeffs[i] * Q^(i-1))
    double evalCurveDerivative(double Q) const;
    // Newton solve: find Q such that evalCurve(Q) = deltaP
    double solveForFlow(double deltaP) const;
};

} // namespace contam
