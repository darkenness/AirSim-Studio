#pragma once

#include "elements/FlowElement.h"
#include "utils/Constants.h"
#include <cmath>
#include <stdexcept>

namespace contam {

// Quadratic Flow Element: ΔP = a·F + b·F²
// Inverted to solve for F given ΔP:
//   F = (-a + sqrt(a² + 4b|ΔP|)) / (2b) · sign(ΔP)
// When b→0, degenerates to linear: F = ΔP/a
// Derivative: dF/dΔP = 1 / (a + 2b|F|)
// Mass flow: ṁ = ρ · F
class QuadraticElement : public FlowElement {
public:
    // a: linear resistance coefficient (Pa·s/m³)
    // b: quadratic resistance coefficient (Pa·s²/m⁶)
    QuadraticElement(double a, double b);

    FlowResult calculate(double deltaP, double density) const override;
    std::string typeName() const override { return "QuadraticElement"; }
    std::unique_ptr<FlowElement> clone() const override;

    double getLinearCoeff() const { return a_; }
    double getQuadraticCoeff() const { return b_; }

    // Factory: from crack description (CONTAM CrackDescription)
    // length: crack length (m)
    // width: crack width (m)  
    // depth: wall thickness / crack depth (m)
    // Uses Poiseuille + Bernoulli entrance/exit losses
    static QuadraticElement fromCrackDescription(
        double length, double width, double depth,
        double viscosity = 1.81e-5, double density = 1.2);

private:
    double a_;  // linear coefficient
    double b_;  // quadratic coefficient
};

} // namespace contam
