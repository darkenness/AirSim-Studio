#pragma once

#include "elements/FlowElement.h"
#include "utils/Constants.h"
#include <vector>
#include <cmath>

namespace contam {

// Simple Gaseous Filter: activated carbon / chemical media filter
// Flow: PowerLaw (ṁ = ρ · C · |ΔP|^n · sign(ΔP))
// Efficiency: cubic spline over (loading, efficiency) breakpoints
// Breakthrough: when efficiency drops below threshold, isBreakthrough() returns true
class SimpleGaseousFilter : public FlowElement {
public:
    struct LoadingPoint {
        double loading;     // cumulative mass captured (kg)
        double efficiency;  // removal efficiency at this loading (0~1)
    };

    // C, n: power-law flow parameters
    // loadingTable: sorted by loading, efficiency interpolated with cubic spline
    // breakthroughThreshold: efficiency below which filter is considered spent (default 0.05)
    SimpleGaseousFilter(double C, double n,
                        const std::vector<LoadingPoint>& loadingTable,
                        double breakthroughThreshold = 0.05);

    FlowResult calculate(double deltaP, double density) const override;
    std::string typeName() const override { return "SimpleGaseousFilter"; }
    std::unique_ptr<FlowElement> clone() const override;

    // Get efficiency for a given species at current loading
    double getEfficiency(int speciesIdx, double currentLoading) const;

    // Convenience: get efficiency at current internal loading
    double getEfficiency() const;

    // Add captured mass to internal loading counter
    void addLoading(double mass);

    // Check if filter has reached breakthrough
    bool isBreakthrough() const;

    // Accessors
    double getFlowCoefficient() const { return C_; }
    double getFlowExponent() const { return n_; }
    double getCurrentLoading() const { return currentLoading_; }
    void setCurrentLoading(double loading) { currentLoading_ = loading; }
    double getBreakthroughThreshold() const { return breakthroughThreshold_; }
    const std::vector<LoadingPoint>& getLoadingTable() const { return table_; }

private:
    double C_;
    double n_;
    double linearSlope_;
    double breakthroughThreshold_;
    double currentLoading_ = 0.0;

    std::vector<LoadingPoint> table_;
    // Pre-computed cubic spline coefficients
    std::vector<double> splineA_, splineB_, splineC_, splineD_;

    void buildSpline();
    double interpolateEfficiency(double loading) const;
};

} // namespace contam
