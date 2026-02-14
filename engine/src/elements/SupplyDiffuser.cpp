#include "elements/SupplyDiffuser.h"
#include <cmath>
#include <stdexcept>

namespace contam {

SupplyDiffuser::SupplyDiffuser(double C, double n)
    : C_(C), n_(n)
{
    if (C <= 0.0) throw std::invalid_argument("Flow coefficient C must be positive");
    if (n < 0.5 || n > 1.0) throw std::invalid_argument("Flow exponent n must be in [0.5, 1.0]");
    linearSlope_ = C_ * std::pow(DP_MIN, n_ - 1.0);
}

FlowResult SupplyDiffuser::calculate(double deltaP, double density) const {
    FlowResult result;
    double absDp = std::abs(deltaP);
    double sign = (deltaP >= 0.0) ? 1.0 : -1.0;

    if (absDp < DP_MIN) {
        result.massFlow = density * linearSlope_ * deltaP;
        result.derivative = density * linearSlope_;
    } else {
        double flow = C_ * std::pow(absDp, n_);
        result.massFlow = density * flow * sign;
        result.derivative = density * n_ * C_ * std::pow(absDp, n_ - 1.0);
    }
    return result;
}

std::unique_ptr<FlowElement> SupplyDiffuser::clone() const {
    return std::make_unique<SupplyDiffuser>(*this);
}

} // namespace contam
