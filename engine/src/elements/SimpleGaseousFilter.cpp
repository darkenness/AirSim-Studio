#include "elements/SimpleGaseousFilter.h"
#include <cmath>
#include <stdexcept>
#include <algorithm>

namespace contam {

SimpleGaseousFilter::SimpleGaseousFilter(double C, double n,
                                         const std::vector<LoadingPoint>& loadingTable,
                                         double breakthroughThreshold)
    : C_(C), n_(n), table_(loadingTable), breakthroughThreshold_(breakthroughThreshold)
{
    if (C <= 0.0) throw std::invalid_argument("Flow coefficient C must be positive");
    if (n < 0.5 || n > 1.0) throw std::invalid_argument("Flow exponent n must be in [0.5, 1.0]");
    if (table_.size() < 2) throw std::invalid_argument("Loading table needs at least 2 points");

    // Sort by loading
    std::sort(table_.begin(), table_.end(),
              [](const LoadingPoint& a, const LoadingPoint& b) {
                  return a.loading < b.loading;
              });

    linearSlope_ = C_ * std::pow(DP_MIN, n_ - 1.0);
    buildSpline();
}

FlowResult SimpleGaseousFilter::calculate(double deltaP, double density) const {
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

double SimpleGaseousFilter::getEfficiency(int /*speciesIdx*/, double currentLoading) const {
    return interpolateEfficiency(currentLoading);
}

double SimpleGaseousFilter::getEfficiency() const {
    return interpolateEfficiency(currentLoading_);
}

void SimpleGaseousFilter::addLoading(double mass) {
    currentLoading_ += mass;
    if (currentLoading_ < 0.0) currentLoading_ = 0.0;
}

bool SimpleGaseousFilter::isBreakthrough() const {
    return getEfficiency() < breakthroughThreshold_;
}

double SimpleGaseousFilter::interpolateEfficiency(double loading) const {
    if (table_.empty()) return 0.0;
    if (table_.size() == 1) return table_[0].efficiency;

    // Clamp to table range
    if (loading <= table_.front().loading) return table_.front().efficiency;
    if (loading >= table_.back().loading) return table_.back().efficiency;

    // Find interval
    size_t i = 0;
    for (i = 0; i < table_.size() - 1; ++i) {
        if (loading >= table_[i].loading && loading <= table_[i + 1].loading) break;
    }

    // Cubic spline evaluation
    double dx = loading - table_[i].loading;
    double val = splineA_[i] + splineB_[i] * dx + splineC_[i] * dx * dx + splineD_[i] * dx * dx * dx;
    return std::max(0.0, std::min(1.0, val));
}

void SimpleGaseousFilter::buildSpline() {
    // Natural cubic spline (same algorithm as SimpleParticleFilter)
    size_t n = table_.size();
    splineA_.resize(n);
    splineB_.resize(n);
    splineC_.resize(n);
    splineD_.resize(n);

    for (size_t i = 0; i < n; ++i) splineA_[i] = table_[i].efficiency;

    if (n == 2) {
        double h = table_[1].loading - table_[0].loading;
        splineB_[0] = (splineA_[1] - splineA_[0]) / h;
        splineC_[0] = 0;
        splineD_[0] = 0;
        splineB_[1] = splineB_[0];
        splineC_[1] = 0;
        splineD_[1] = 0;
        return;
    }

    std::vector<double> h(n - 1), alpha(n);
    for (size_t i = 0; i < n - 1; ++i)
        h[i] = table_[i + 1].loading - table_[i].loading;

    for (size_t i = 1; i < n - 1; ++i)
        alpha[i] = 3.0 / h[i] * (splineA_[i + 1] - splineA_[i])
                 - 3.0 / h[i - 1] * (splineA_[i] - splineA_[i - 1]);

    // Tridiagonal solve for c
    std::vector<double> l(n, 1.0), mu(n, 0.0), z(n, 0.0);
    for (size_t i = 1; i < n - 1; ++i) {
        l[i] = 2.0 * (table_[i + 1].loading - table_[i - 1].loading) - h[i - 1] * mu[i - 1];
        mu[i] = h[i] / l[i];
        z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
    }

    splineC_[n - 1] = 0;
    for (int j = static_cast<int>(n) - 2; j >= 0; --j) {
        size_t ju = static_cast<size_t>(j);
        splineC_[ju] = z[ju] - mu[ju] * splineC_[ju + 1];
        splineB_[ju] = (splineA_[ju + 1] - splineA_[ju]) / h[ju]
                     - h[ju] * (splineC_[ju + 1] + 2.0 * splineC_[ju]) / 3.0;
        splineD_[ju] = (splineC_[ju + 1] - splineC_[ju]) / (3.0 * h[ju]);
    }
}

std::unique_ptr<FlowElement> SimpleGaseousFilter::clone() const {
    return std::make_unique<SimpleGaseousFilter>(*this);
}

} // namespace contam
