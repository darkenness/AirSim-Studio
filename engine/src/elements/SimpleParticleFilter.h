#pragma once

#include "elements/FlowElement.h"
#include "utils/Constants.h"
#include <vector>
#include <cmath>

namespace contam {

// Simple Particle Filter: PowerLaw flow element with particle-size-dependent efficiency
// Flow: same as PowerLawOrifice (ṁ = ρ · C · |ΔP|^n · sign(ΔP))
// Efficiency: cubic spline interpolation over (diameter, efficiency) breakpoints
// Used by ContaminantSolver to apply η(d) for each species based on meanDiameter
class SimpleParticleFilter : public FlowElement {
public:
    struct EfficiencyPoint {
        double diameter;    // particle diameter (μm)
        double efficiency;  // removal efficiency (0~1)
    };

    // C, n: power-law flow parameters
    // efficiencyTable: sorted by diameter, efficiency interpolated with cubic spline
    SimpleParticleFilter(double C, double n,
                         const std::vector<EfficiencyPoint>& efficiencyTable);

    FlowResult calculate(double deltaP, double density) const override;
    std::string typeName() const override { return "SimpleParticleFilter"; }
    std::unique_ptr<FlowElement> clone() const override;

    // Get efficiency for a given particle diameter (μm)
    // Uses monotone cubic interpolation (Fritsch-Carlson)
    double getEfficiency(double diameter_um) const;

    double getFlowCoefficient() const { return C_; }
    double getFlowExponent() const { return n_; }
    const std::vector<EfficiencyPoint>& getEfficiencyTable() const { return table_; }

private:
    double C_;
    double n_;
    double linearSlope_;
    std::vector<EfficiencyPoint> table_;
    // Pre-computed cubic spline coefficients
    std::vector<double> splineA_, splineB_, splineC_, splineD_;

    void buildSpline();
};

} // namespace contam
