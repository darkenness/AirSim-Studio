#pragma once

#include "elements/FlowElement.h"
#include "utils/Constants.h"
#include <cmath>

namespace contam {

// Supply Diffuser: PowerLaw element representing an HVAC supply outlet
// Flow: ṁ = ρ · C · |ΔP|^n · sign(ΔP)
// Typically n ≈ 0.5 (turbulent orifice behavior)
class SupplyDiffuser : public FlowElement {
public:
    SupplyDiffuser(double C, double n = 0.5);

    FlowResult calculate(double deltaP, double density) const override;
    std::string typeName() const override { return "SupplyDiffuser"; }
    std::unique_ptr<FlowElement> clone() const override;

    double getFlowCoefficient() const { return C_; }
    double getFlowExponent() const { return n_; }

private:
    double C_;
    double n_;
    double linearSlope_;
};

} // namespace contam
