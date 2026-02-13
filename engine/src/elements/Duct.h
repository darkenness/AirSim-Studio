#pragma once

#include "elements/FlowElement.h"

namespace contam {

// Duct Model (Darcy-Weisbach with friction factor)
// Pressure drop: ΔP = f * (L/D) * (ρ * V² / 2) + ΔP_minor
// Flow: ṁ = ρ * V * A
// Combined: ṁ = sign(ΔP) * A * sqrt(2 * ρ * |ΔP| / (f*L/D + sumK))
//
// For laminar flow (Re < 2300): f = 64/Re
// For turbulent flow: uses Swamee-Jain approximation of Colebrook-White
class Duct : public FlowElement {
public:
    // length: duct length (m)
    // diameter: hydraulic diameter (m)
    // roughness: surface roughness (m), default 0.0001 for galvanized steel
    // sumK: sum of minor loss coefficients (dimensionless)
    Duct(double length, double diameter, double roughness = 0.0001, double sumK = 0.0);

    FlowResult calculate(double deltaP, double density) const override;
    std::string typeName() const override { return "Duct"; }
    std::unique_ptr<FlowElement> clone() const override;

    double getLength() const { return length_; }
    double getDiameter() const { return diameter_; }
    double getRoughness() const { return roughness_; }
    double getSumK() const { return sumK_; }

private:
    double length_;
    double diameter_;
    double roughness_;
    double sumK_;
    double area_;          // cross-sectional area
    double linearSlope_;   // for linearization near ΔP=0
};

} // namespace contam
