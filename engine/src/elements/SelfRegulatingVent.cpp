#include "elements/SelfRegulatingVent.h"
#include "utils/Constants.h"
#include <cmath>
#include <stdexcept>

namespace contam {

SelfRegulatingVent::SelfRegulatingVent(double targetFlow, double pMin, double pMax)
    : targetFlow_(targetFlow), pMin_(pMin), pMax_(pMax) {
    if (targetFlow_ <= 0.0) throw std::invalid_argument("SelfRegulatingVent: targetFlow must be positive");
    if (pMin_ <= 0.0) pMin_ = 1.0;
    if (pMax_ <= pMin_) pMax_ = pMin_ * 50.0;
}

FlowResult SelfRegulatingVent::calculate(double deltaP, double density) const {
    double absDp = std::abs(deltaP);
    double sign = (deltaP >= 0.0) ? 1.0 : -1.0;
    double massFlow, derivative;

    if (absDp < DP_MIN) {
        // Linear near zero
        double slope = density * targetFlow_ / pMin_;
        massFlow = slope * deltaP;
        derivative = slope;
    } else if (absDp < pMin_) {
        // Ramp-up region: linear from 0 to targetFlow
        double Q = targetFlow_ * absDp / pMin_;
        massFlow = density * Q * sign;
        derivative = density * targetFlow_ / pMin_;
    } else if (absDp <= pMax_) {
        // Regulation region: constant flow
        massFlow = density * targetFlow_ * sign;
        // Very small derivative (constant flow → d(ṁ)/d(ΔP) ≈ 0)
        // Use small value for numerical stability
        derivative = density * 1e-8;
    } else {
        // Overflow region: power law beyond pMax
        double Q_base = targetFlow_;
        double Q_overflow = Q_base * std::sqrt(absDp / pMax_);
        massFlow = density * Q_overflow * sign;
        derivative = 0.5 * density * Q_base / std::sqrt(absDp * pMax_);
    }

    return {massFlow, derivative};
}

std::unique_ptr<FlowElement> SelfRegulatingVent::clone() const {
    return std::make_unique<SelfRegulatingVent>(*this);
}

} // namespace contam
