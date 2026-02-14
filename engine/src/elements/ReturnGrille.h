#pragma once

#include "elements/FlowElement.h"
#include "utils/Constants.h"
#include <cmath>

namespace contam {

// Return Grille: PowerLaw element representing an HVAC return inlet
// Flow: ṁ = ρ · C · |ΔP|^n · sign(ΔP)
// Typically n ≈ 0.5 (turbulent orifice behavior)
class ReturnGrille : public FlowElement {
public:
    ReturnGrille(double C, double n = 0.5);

    FlowResult calculate(double deltaP, double density) const override;
    std::string typeName() const override { return "ReturnGrille"; }
    std::unique_ptr<FlowElement> clone() const override;

    double getFlowCoefficient() const { return C_; }
    double getFlowExponent() const { return n_; }

private:
    double C_;
    double n_;
    double linearSlope_;
};

} // namespace contam
