#pragma once

#include "elements/FlowElement.h"
#include "utils/Constants.h"
#include <vector>
#include <cmath>

namespace contam {

// UVGI (Ultraviolet Germicidal Irradiation) Filter
// Penn State model: S = exp(-k * I * t_residence)
// where S = survival fraction, k = susceptibility constant (m²/J),
//       I = UV irradiance (W/m²), t_residence = V_chamber / Q (s)
//
// Corrections:
//   Temperature: f(T) = a0 + a1*T + a2*T² + a3*T³  (polynomial)
//   Flow velocity: g(U) = b0 + b1*U + b2*U²  (polynomial)
//   Lamp aging: h(age) = 1 - agingRate * age_hours  (linear degradation)
//
// Flow: PowerLaw (same as other filter elements)
class UVGIFilter : public FlowElement {
public:
    struct UVGIParams {
        double k = 0.0;              // susceptibility constant (m²/J)
        double irradiance = 0.0;     // UV irradiance (W/m²)
        double chamberVolume = 0.0;  // UV chamber volume (m³)

        // Temperature correction polynomial coefficients: f(T) = a0 + a1*T + a2*T² + a3*T³
        std::vector<double> tempCoeffs = {1.0};  // default: no correction

        // Flow velocity correction polynomial: g(U) = b0 + b1*U + b2*U²
        std::vector<double> flowCoeffs = {1.0};  // default: no correction

        // Lamp aging: h(age) = max(0, 1 - agingRate * age_hours)
        double agingRate = 0.0;      // degradation per hour (e.g., 0.0001 = 0.01%/hr)
        double lampAgeHours = 0.0;   // current lamp age (hours)
    };

    // C, n: power-law flow parameters
    UVGIFilter(double C, double n, const UVGIParams& params);

    FlowResult calculate(double deltaP, double density) const override;
    std::string typeName() const override { return "UVGIFilter"; }
    std::unique_ptr<FlowElement> clone() const override;

    // Get survival fraction for given conditions
    // flowRate in m³/s, temperature in K, lampAge in hours
    double getSurvivalFraction(double flowRate, double temperature, double lampAge) const;

    // Convenience: get survival fraction using internal lamp age
    double getSurvivalFraction(double flowRate, double temperature) const;

    // Get removal efficiency = 1 - S
    double getEfficiency(double flowRate, double temperature) const;

    // Accessors
    double getFlowCoefficient() const { return C_; }
    double getFlowExponent() const { return n_; }
    const UVGIParams& getParams() const { return params_; }
    void setLampAge(double hours) { params_.lampAgeHours = hours; }
    double getLampAge() const { return params_.lampAgeHours; }

private:
    double C_;
    double n_;
    double linearSlope_;
    UVGIParams params_;

    double evalPolynomial(const std::vector<double>& coeffs, double x) const;
};

} // namespace contam
