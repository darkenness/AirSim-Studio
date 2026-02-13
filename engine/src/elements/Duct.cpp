#include "elements/Duct.h"
#include "utils/Constants.h"
#include <cmath>
#include <algorithm>
#include <stdexcept>

namespace contam {

static constexpr double PI = 3.14159265358979323846;
static constexpr double MU_AIR = 1.81e-5;  // dynamic viscosity of air (Pa·s) at ~20°C

Duct::Duct(double length, double diameter, double roughness, double sumK)
    : length_(length), diameter_(diameter), roughness_(roughness), sumK_(sumK) {
    if (length_ <= 0.0) throw std::invalid_argument("Duct length must be positive");
    if (diameter_ <= 0.0) throw std::invalid_argument("Duct diameter must be positive");
    if (roughness_ < 0.0) throw std::invalid_argument("Duct roughness must be non-negative");
    if (sumK_ < 0.0) throw std::invalid_argument("Duct sumK must be non-negative");

    area_ = PI * diameter_ * diameter_ / 4.0;

    // Linearization: compute slope at DP_MIN using turbulent approximation
    // Approximate total resistance: K_total = f*L/D + sumK, with f ~ 0.02 initial guess
    double f_guess = 0.02;
    double K_total = f_guess * length_ / diameter_ + sumK_;
    if (K_total < 1e-10) K_total = 1.0;
    double rho_ref = 1.2;
    double V_min = std::sqrt(2.0 * DP_MIN / (rho_ref * K_total));
    double mdot_min = rho_ref * area_ * V_min;
    linearSlope_ = mdot_min / DP_MIN;
}

FlowResult Duct::calculate(double deltaP, double density) const {
    double absDp = std::abs(deltaP);
    double sign = (deltaP >= 0.0) ? 1.0 : -1.0;

    if (absDp < DP_MIN) {
        return { linearSlope_ * deltaP, linearSlope_ };
    }

    // Iterative solve: given ΔP, find velocity V
    // ΔP = (f*L/D + sumK) * ρ*V²/2
    // Start with guess using f=0.02
    double f = 0.02;
    double V = 0.0;

    for (int iter = 0; iter < 10; ++iter) {
        double K_total = f * length_ / diameter_ + sumK_;
        if (K_total < 1e-10) K_total = 1e-10;
        V = std::sqrt(2.0 * absDp / (density * K_total));

        // Reynolds number
        double Re = density * V * diameter_ / MU_AIR;
        if (Re < 1.0) Re = 1.0;

        double f_new;
        if (Re < 2300.0) {
            // Laminar: f = 64/Re
            f_new = 64.0 / Re;
        } else {
            // Swamee-Jain approximation of Colebrook-White
            double e_D = roughness_ / diameter_;
            double term = e_D / 3.7 + 5.74 / std::pow(Re, 0.9);
            double logTerm = std::log10(term);
            f_new = 0.25 / (logTerm * logTerm);
        }

        // Check convergence
        if (std::abs(f_new - f) < 1e-6) {
            f = f_new;
            break;
        }
        f = f_new;
    }

    double massFlow = density * area_ * V * sign;

    // Derivative: d(ṁ)/d(ΔP)
    // From ΔP = K*ρ*V²/2, V = sqrt(2*ΔP/(ρ*K))
    // dV/dΔP = 1/(2*V) * 2/(ρ*K) = 1/(ρ*K*V)
    // d(ṁ)/dΔP = ρ*A*dV/dΔP = A/(K*V)
    // But more simply: d(ṁ)/dΔP = ṁ / (2*ΔP)
    double derivative = std::abs(massFlow) / (2.0 * absDp);

    return { massFlow, derivative };
}

std::unique_ptr<FlowElement> Duct::clone() const {
    return std::make_unique<Duct>(*this);
}

} // namespace contam
