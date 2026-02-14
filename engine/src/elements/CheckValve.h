#pragma once

#include "elements/FlowElement.h"
#include <algorithm>

namespace contam {

// Check Valve (One-Way Valve) Model
//
// Per CONTAM requirements document (Module 2.5):
// Allows flow only in the positive direction (from node_i to node_j).
// When ΔP < 0, flow is blocked (zero flow with tiny derivative for stability).
// When ΔP > 0, behaves like a power law orifice with given C and n.
class CheckValve : public FlowElement {
public:
    // C: flow coefficient when open
    // n: flow exponent (0.5-1.0)
    CheckValve(double C, double n);

    FlowResult calculate(double deltaP, double density) const override;
    std::string typeName() const override { return "CheckValve"; }
    std::unique_ptr<FlowElement> clone() const override;

    double getFlowCoefficient() const { return C_; }
    double getFlowExponent() const { return n_; }

private:
    double C_;
    double n_;
    double linearSlope_;
};

} // namespace contam
