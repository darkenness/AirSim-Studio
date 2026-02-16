#pragma once
#include <vector>
#include <functional>
#include <cmath>
#include <algorithm>

namespace contam {

struct AdaptiveIntegratorConfig {
    double rtol = 1e-4;       // relative tolerance
    double atol = 1e-8;       // absolute tolerance
    double dtMin = 0.01;      // minimum time step (s)
    double dtMax = 3600.0;    // maximum time step (s)
    double safetyFactor = 0.9;
    int maxOrder = 2;         // BDF order (1 or 2)
};

class AdaptiveIntegrator {
public:
    using Config = AdaptiveIntegratorConfig;

    AdaptiveIntegrator(int numStates, const Config& config = Config());

    // RHS function: dy/dt = f(t, y)
    using RhsFunc = std::function<void(double t, const std::vector<double>& y, std::vector<double>& dydt)>;

    // Advance from t to t+dtTarget, may take multiple internal steps
    // Returns actual time reached
    double step(double t, double dtTarget, std::vector<double>& y, const RhsFunc& rhs);

    // Get suggested next time step
    double getSuggestedDt() const { return suggestedDt_; }

    // Statistics
    int totalSteps() const { return totalSteps_; }
    int rejectedSteps() const { return rejectedSteps_; }

private:
    int numStates_;
    Config config_;
    double suggestedDt_;
    int totalSteps_ = 0;
    int rejectedSteps_ = 0;

    // History for BDF-2
    std::vector<double> yPrev_;
    double dtPrev_ = 0;
    bool hasPrevious_ = false;

    // Error estimation
    double estimateError(const std::vector<double>& y, const std::vector<double>& yEst,
                         const std::vector<double>& yRef) const;
    double computeNewDt(double dt, double error, int order) const;

    // Single BDF-1 step (backward Euler) with simplified Newton
    bool stepBDF1(double t, double dt, const std::vector<double>& yn,
                  std::vector<double>& ynp1, const RhsFunc& rhs);

    // Single BDF-2 step with simplified Newton
    bool stepBDF2(double t, double dt, double dtPrev,
                  const std::vector<double>& yn, const std::vector<double>& ynm1,
                  std::vector<double>& ynp1, const RhsFunc& rhs);
};

} // namespace contam
