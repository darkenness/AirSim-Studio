#include "elements/PowerLawOrifice.h"
#include <cmath>
#include <stdexcept>

namespace contam {

PowerLawOrifice::PowerLawOrifice(double C, double n)
    : C_(C), n_(n)
{
    if (C <= 0.0) {
        throw std::invalid_argument("Flow coefficient C must be positive");
    }
    if (n < 0.5 || n > 1.0) {
        throw std::invalid_argument("Flow exponent n must be in [0.5, 1.0]");
    }

    // Pre-compute linearization slope at DP_MIN boundary
    // Use chord slope: flow(DP_MIN) / DP_MIN = C * DP_MIN^n / DP_MIN = C * DP_MIN^(n-1)
    // This ensures flow continuity at the linearization boundary
    linearSlope_ = C_ * std::pow(DP_MIN, n_ - 1.0);
}

FlowResult PowerLawOrifice::calculate(double deltaP, double density) const {
    FlowResult result;

    double absDp = std::abs(deltaP);
    double sign = (deltaP >= 0.0) ? 1.0 : -1.0;

    if (absDp < DP_MIN) {
        // Linearized regime: avoid derivative singularity near zero
        // ṁ = ρ · linearSlope · ΔP
        // d(ṁ)/d(ΔP) = ρ · linearSlope
        result.massFlow = density * linearSlope_ * deltaP;
        result.derivative = density * linearSlope_;
    } else {
        // Normal power law regime
        // ṁ = ρ · C · |ΔP|^n · sign(ΔP)
        double flow = C_ * std::pow(absDp, n_);
        result.massFlow = density * flow * sign;

        // d(ṁ)/d(ΔP) = ρ · n · C · |ΔP|^(n-1)
        // Always positive (Jacobian convention)
        result.derivative = density * n_ * C_ * std::pow(absDp, n_ - 1.0);
    }

    return result;
}

std::unique_ptr<FlowElement> PowerLawOrifice::clone() const {
    return std::make_unique<PowerLawOrifice>(*this);
}

PowerLawOrifice PowerLawOrifice::fromLeakageArea(double ELA_m2, double n,
                                                  double dPref, double rhoRef) {
    // ASHRAE conversion: at reference ΔP, volume flow Q_ref = ELA * sqrt(2*ΔP_ref/ρ_ref)
    // Power law: Q = C * ΔP^n  →  C = Q_ref / ΔP_ref^n = ELA * sqrt(2/(ρ_ref)) * ΔP_ref^(0.5-n)
    double C = ELA_m2 * std::sqrt(2.0 / rhoRef) * std::pow(dPref, 0.5 - n);
    return PowerLawOrifice(C, n);
}

PowerLawOrifice PowerLawOrifice::fromOrificeArea(double area_m2, double Cd,
                                                  double rhoRef) {
    // Sharp-edged orifice: Q = Cd * A * sqrt(2*ΔP/ρ)
    // Power law form with n=0.5: Q = C * ΔP^0.5 where C = Cd * A * sqrt(2/ρ_ref)
    double C = Cd * area_m2 * std::sqrt(2.0 / rhoRef);
    return PowerLawOrifice(C, 0.5);
}

} // namespace contam
