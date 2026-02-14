#include "elements/QuadraticElement.h"
#include <cmath>
#include <stdexcept>

namespace contam {

QuadraticElement::QuadraticElement(double a, double b)
    : a_(a), b_(b)
{
    if (a < 0.0) {
        throw std::invalid_argument("Linear coefficient a must be non-negative");
    }
    if (b < 0.0) {
        throw std::invalid_argument("Quadratic coefficient b must be non-negative");
    }
    if (a == 0.0 && b == 0.0) {
        throw std::invalid_argument("At least one coefficient must be positive");
    }
}

FlowResult QuadraticElement::calculate(double deltaP, double density) const {
    FlowResult result;
    double absDp = std::abs(deltaP);
    double sign = (deltaP >= 0.0) ? 1.0 : -1.0;

    if (absDp < DP_MIN) {
        // Linearized regime
        double slope = (a_ > 0.0) ? (1.0 / a_) : std::sqrt(1.0 / (b_ * DP_MIN));
        result.massFlow = density * slope * deltaP;
        result.derivative = density * slope;
        return result;
    }

    double F; // volume flow (m³/s)

    if (b_ < 1e-30) {
        // Pure linear: ΔP = a·F → F = ΔP/a
        F = absDp / a_;
        result.massFlow = density * F * sign;
        result.derivative = density / a_;
    } else if (a_ < 1e-30) {
        // Pure quadratic: ΔP = b·F² → F = sqrt(ΔP/b)
        F = std::sqrt(absDp / b_);
        result.massFlow = density * F * sign;
        // dF/dΔP = 1/(2b·F) = 1/(2·sqrt(b·ΔP))
        result.derivative = density / (2.0 * std::sqrt(b_ * absDp));
    } else {
        // General case: ΔP = a·F + b·F²
        // Quadratic formula: F = (-a + sqrt(a² + 4b·ΔP)) / (2b)
        double disc = a_ * a_ + 4.0 * b_ * absDp;
        F = (-a_ + std::sqrt(disc)) / (2.0 * b_);
        result.massFlow = density * F * sign;
        // dF/dΔP = 1/(a + 2b·F) = 2 / sqrt(a² + 4b·ΔP)
        result.derivative = density * 2.0 / std::sqrt(disc);
    }

    return result;
}

std::unique_ptr<FlowElement> QuadraticElement::clone() const {
    return std::make_unique<QuadraticElement>(*this);
}

QuadraticElement QuadraticElement::fromCrackDescription(
    double length, double width, double depth,
    double viscosity, double density)
{
    if (length <= 0 || width <= 0 || depth <= 0) {
        throw std::invalid_argument("Crack dimensions must be positive");
    }
    // Poiseuille flow through rectangular crack:
    // a = 12·μ·L / (w³·l)  where L=depth, w=width, l=length
    // Entrance/exit loss (Bernoulli):
    // b = ρ/(2·(w·l)²)  (contraction + expansion ≈ 1.5 loss coefficients)
    double area = width * length;
    double a = 12.0 * viscosity * depth / (width * width * area);
    double b = 1.5 * density / (2.0 * area * area);
    return QuadraticElement(a, b);
}

} // namespace contam
