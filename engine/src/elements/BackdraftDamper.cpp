#include "elements/BackdraftDamper.h"
#include <cmath>
#include <stdexcept>

namespace contam {

BackdraftDamper::BackdraftDamper(double Cf, double nf, double Cr, double nr)
    : Cf_(Cf), nf_(nf), Cr_(Cr), nr_(nr)
{
    if (Cf <= 0.0 || Cr <= 0.0) {
        throw std::invalid_argument("Flow coefficients must be positive");
    }
    if (nf < 0.5 || nf > 1.0 || nr < 0.5 || nr > 1.0) {
        throw std::invalid_argument("Flow exponents must be in [0.5, 1.0]");
    }
    linearSlopeFwd_ = Cf_ * std::pow(DP_MIN, nf_ - 1.0);
    linearSlopeRev_ = Cr_ * std::pow(DP_MIN, nr_ - 1.0);
}

FlowResult BackdraftDamper::calculate(double deltaP, double density) const {
    FlowResult result;
    double absDp = std::abs(deltaP);

    if (absDp < DP_MIN) {
        // Linearized: use average of forward/reverse slopes for smooth transition
        double avgSlope = (linearSlopeFwd_ + linearSlopeRev_) / 2.0;
        result.massFlow = density * avgSlope * deltaP;
        result.derivative = density * avgSlope;
        return result;
    }

    if (deltaP >= 0.0) {
        // Forward flow
        double flow = Cf_ * std::pow(absDp, nf_);
        result.massFlow = density * flow;
        result.derivative = density * nf_ * Cf_ * std::pow(absDp, nf_ - 1.0);
    } else {
        // Reverse flow (typically much smaller)
        double flow = Cr_ * std::pow(absDp, nr_);
        result.massFlow = -density * flow;
        result.derivative = density * nr_ * Cr_ * std::pow(absDp, nr_ - 1.0);
    }

    return result;
}

std::unique_ptr<FlowElement> BackdraftDamper::clone() const {
    return std::make_unique<BackdraftDamper>(*this);
}

} // namespace contam
