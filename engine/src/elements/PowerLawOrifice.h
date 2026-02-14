#pragma once

#include "elements/FlowElement.h"
#include "utils/Constants.h"
#include <cmath>

namespace contam {

// Power Law Orifice Model
// Flow: ṁ = ρ · C · |ΔP|^n · sign(ΔP)
// Derivative: d = n · ρ · C · |ΔP|^(n-1)
// Linearized when |ΔP| < DP_MIN to avoid derivative singularity
class PowerLawOrifice : public FlowElement {
public:
    // C: flow coefficient (m^3/(s·Pa^n))
    // n: flow exponent (0.5 = turbulent, 1.0 = laminar, typical 0.5-0.65)
    PowerLawOrifice(double C, double n);

    FlowResult calculate(double deltaP, double density) const override;
    std::string typeName() const override { return "PowerLawOrifice"; }
    std::unique_ptr<FlowElement> clone() const override;

    double getFlowCoefficient() const { return C_; }
    double getFlowExponent() const { return n_; }

    // Factory: from ASHRAE Effective Leakage Area (ELA)
    // ELA (m²) at reference ΔP_ref (typically 4 Pa per ASHRAE or 10 Pa per LBL)
    // C = ELA * sqrt(2/ρ_ref) * ΔP_ref^(0.5-n)
    // Default: ΔP_ref=4 Pa, n=0.65 (typical building crack), ρ_ref=1.2 kg/m³
    static PowerLawOrifice fromLeakageArea(double ELA_m2, double n = 0.65,
                                            double dPref = 4.0, double rhoRef = 1.2);

    // Factory: from equivalent sharp-edged orifice area
    // Q = Cd * A * sqrt(2*ΔP/ρ)  →  ṁ = ρ * Cd * A * sqrt(2*ΔP/ρ)
    // For power law: C = Cd * A * sqrt(2/ρ_ref), n = 0.5 (pure turbulent orifice)
    // Default: Cd=0.6 (standard sharp-edged orifice)
    static PowerLawOrifice fromOrificeArea(double area_m2, double Cd = 0.6,
                                            double rhoRef = 1.2);

private:
    double C_;  // flow coefficient
    double n_;  // flow exponent

    // Linearization coefficients (computed at DP_MIN)
    double linearSlope_;  // slope for linear regime
};

} // namespace contam
