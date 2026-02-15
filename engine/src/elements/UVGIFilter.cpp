#include "elements/UVGIFilter.h"
#include <cmath>
#include <stdexcept>
#include <algorithm>

namespace contam {

UVGIFilter::UVGIFilter(double C, double n, const UVGIParams& params)
    : C_(C), n_(n), params_(params)
{
    if (C <= 0.0) throw std::invalid_argument("Flow coefficient C must be positive");
    if (n < 0.5 || n > 1.0) throw std::invalid_argument("Flow exponent n must be in [0.5, 1.0]");
    if (params_.chamberVolume <= 0.0) throw std::invalid_argument("Chamber volume must be positive");
    if (params_.irradiance < 0.0) throw std::invalid_argument("Irradiance must be non-negative");

    linearSlope_ = C_ * std::pow(DP_MIN, n_ - 1.0);
}

FlowResult UVGIFilter::calculate(double deltaP, double density) const {
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

double UVGIFilter::getSurvivalFraction(double flowRate, double temperature, double lampAge) const {
    if (flowRate <= 0.0 || params_.k <= 0.0 || params_.irradiance <= 0.0) {
        return 1.0; // No inactivation if no flow or no UV
    }

    // Residence time: t_res = V_chamber / Q
    double t_res = params_.chamberVolume / flowRate;

    // Base survival: S_base = exp(-k * I * t_res)
    double S_base = std::exp(-params_.k * params_.irradiance * t_res);

    // Temperature correction: f(T)
    double f_T = evalPolynomial(params_.tempCoeffs, temperature);
    f_T = std::max(0.0, f_T);

    // Flow velocity correction: g(U) where U = Q / A_cross (approximate as Q for simplicity)
    double g_U = evalPolynomial(params_.flowCoeffs, flowRate);
    g_U = std::max(0.0, g_U);

    // Lamp aging correction: h(age) = max(0, 1 - agingRate * age)
    double h_age = std::max(0.0, 1.0 - params_.agingRate * lampAge);

    // Combined survival: S = S_base^(f(T) * g(U) * h(age))
    // This models corrections as modifiers to the effective UV dose
    double effectiveExponent = f_T * g_U * h_age;
    double S = std::pow(S_base, effectiveExponent);

    return std::clamp(S, 0.0, 1.0);
}

double UVGIFilter::getSurvivalFraction(double flowRate, double temperature) const {
    return getSurvivalFraction(flowRate, temperature, params_.lampAgeHours);
}

double UVGIFilter::getEfficiency(double flowRate, double temperature) const {
    return 1.0 - getSurvivalFraction(flowRate, temperature);
}

double UVGIFilter::evalPolynomial(const std::vector<double>& coeffs, double x) const {
    if (coeffs.empty()) return 1.0;
    double result = 0.0;
    double xPow = 1.0;
    for (double c : coeffs) {
        result += c * xPow;
        xPow *= x;
    }
    return result;
}

std::unique_ptr<FlowElement> UVGIFilter::clone() const {
    return std::make_unique<UVGIFilter>(*this);
}

} // namespace contam
