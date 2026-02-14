#pragma once

#include "elements/FlowElement.h"
#include <algorithm>

namespace contam {

// Self-Regulating Vent Model
//
// Per CONTAM requirements document (Module 2.4):
// Automatically adjusts flow within a specific pressure range.
// Below P_min: flow increases linearly from 0
// Between P_min and P_max: flow is held constant at target flow rate
// Above P_max: flow increases with power law (overflow)
//
// This models pressure-regulated ventilation devices that maintain
// a constant flow rate across a range of pressure differences.
class SelfRegulatingVent : public FlowElement {
public:
    // targetFlow: desired constant volumetric flow rate (m³/s)
    // pMin: minimum pressure for regulation (Pa)
    // pMax: maximum pressure before overflow (Pa)
    SelfRegulatingVent(double targetFlow, double pMin = 1.0, double pMax = 50.0);

    FlowResult calculate(double deltaP, double density) const override;
    std::string typeName() const override { return "SelfRegulatingVent"; }
    std::unique_ptr<FlowElement> clone() const override;

    double getTargetFlow() const { return targetFlow_; }
    double getPMin() const { return pMin_; }
    double getPMax() const { return pMax_; }

private:
    double targetFlow_;  // m³/s
    double pMin_;        // Pa, lower regulation bound
    double pMax_;        // Pa, upper regulation bound
};

} // namespace contam
