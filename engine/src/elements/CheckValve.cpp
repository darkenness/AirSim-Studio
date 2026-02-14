#include "elements/CheckValve.h"
#include "utils/Constants.h"
#include <cmath>
#include <stdexcept>

namespace contam {

CheckValve::CheckValve(double C, double n)
    : C_(C), n_(n) {
    if (C_ <= 0.0) throw std::invalid_argument("CheckValve: C must be positive");
    if (n_ < 0.5 || n_ > 1.0) throw std::invalid_argument("CheckValve: n must be in [0.5, 1.0]");

    double rho_ref = 1.2;
    double flow_at_min = rho_ref * C_ * std::pow(DP_MIN, n_);
    linearSlope_ = flow_at_min / DP_MIN;
}

FlowResult CheckValve::calculate(double deltaP, double density) const {
    // Check valve: only allows flow in positive direction (ΔP > 0)
    if (deltaP <= 0.0) {
        // Blocked: near-zero flow with tiny derivative for numerical stability
        return {0.0, density * 1e-12};
    }

    double massFlow, derivative;

    if (deltaP < DP_MIN) {
        massFlow = linearSlope_ * deltaP;
        derivative = linearSlope_;
    } else {
        double flow = density * C_ * std::pow(deltaP, n_);
        massFlow = flow;
        derivative = density * n_ * C_ * std::pow(deltaP, n_ - 1.0);
    }

    return {massFlow, derivative};
}

std::unique_ptr<FlowElement> CheckValve::clone() const {
    return std::make_unique<CheckValve>(*this);
}

} // namespace contam
