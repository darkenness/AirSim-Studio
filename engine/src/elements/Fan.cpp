#include "elements/Fan.h"
#include <cmath>
#include <algorithm>
#include <stdexcept>

namespace contam {

Fan::Fan(double maxFlow, double shutoffPressure)
    : maxFlow_(maxFlow), shutoffPressure_(std::abs(shutoffPressure)),
      usePolynomial_(false) {
    if (maxFlow_ <= 0.0) {
        throw std::invalid_argument("Fan maxFlow must be positive");
    }
    if (shutoffPressure_ <= 0.0) {
        throw std::invalid_argument("Fan shutoffPressure must be positive");
    }
}

Fan::Fan(const std::vector<double>& coeffs)
    : maxFlow_(0), shutoffPressure_(0), usePolynomial_(true), coeffs_(coeffs) {
    if (coeffs_.size() < 2) {
        throw std::invalid_argument("Fan polynomial needs at least 2 coefficients");
    }
    shutoffPressure_ = std::abs(coeffs_[0]); // a0 = shutoff pressure
    // Estimate maxFlow: find Q where evalCurve(Q) = 0
    // Start from a guess and Newton-iterate
    maxFlow_ = solveForFlow(0.0);
    if (maxFlow_ <= 0.0) maxFlow_ = 0.1; // fallback
}

FlowResult Fan::calculate(double deltaP, double density) const {
    double Q, dQdP;

    if (usePolynomial_) {
        // Polynomial mode: solve ΔP_fan(Q) = deltaP for Q
        Q = solveForFlow(deltaP);
        if (Q < 0.0) Q = 0.0;

        // dQ/d(deltaP) = 1 / (dΔP_fan/dQ) via implicit differentiation
        double dPdQ = evalCurveDerivative(Q);
        dQdP = (std::abs(dPdQ) > 1e-15) ? (1.0 / dPdQ) : -1e-10;
    } else {
        // Simple linear mode
        Q = maxFlow_ * (1.0 - deltaP / shutoffPressure_);
        if (Q < 0.0) Q = 0.0;
        dQdP = -maxFlow_ / shutoffPressure_;
    }

    double massFlow = density * Q;
    double derivative = density * dQdP;

    if (Q <= 0.0) {
        derivative = -density * 1e-10;
    }

    return {massFlow, derivative};
}

double Fan::evalCurve(double Q) const {
    double result = 0.0;
    double Qpow = 1.0;
    for (size_t i = 0; i < coeffs_.size(); ++i) {
        result += coeffs_[i] * Qpow;
        Qpow *= Q;
    }
    return result;
}

double Fan::evalCurveDerivative(double Q) const {
    double result = 0.0;
    double Qpow = 1.0;
    for (size_t i = 1; i < coeffs_.size(); ++i) {
        result += static_cast<double>(i) * coeffs_[i] * Qpow;
        Qpow *= Q;
    }
    return result;
}

double Fan::solveForFlow(double deltaP) const {
    // Newton iteration: find Q such that evalCurve(Q) - deltaP = 0
    double Q = maxFlow_ > 0.0 ? maxFlow_ * 0.5 : 0.05;
    for (int iter = 0; iter < 50; ++iter) {
        double f = evalCurve(Q) - deltaP;
        double fp = evalCurveDerivative(Q);
        if (std::abs(fp) < 1e-20) break;
        double dQ = -f / fp;
        Q += dQ;
        if (Q < 0.0) Q = 0.0;
        if (std::abs(dQ) < 1e-12) break;
    }
    return Q;
}

std::unique_ptr<FlowElement> Fan::clone() const {
    return std::make_unique<Fan>(*this);
}

} // namespace contam
