#include "core/AdaptiveIntegrator.h"
#include <stdexcept>
#include <limits>

namespace contam {

AdaptiveIntegrator::AdaptiveIntegrator(int numStates, const Config& config)
    : numStates_(numStates), config_(config), suggestedDt_(config.dtMax)
{
    if (numStates <= 0) {
        throw std::invalid_argument("AdaptiveIntegrator: numStates must be positive");
    }
    yPrev_.resize(numStates_, 0.0);
}

double AdaptiveIntegrator::estimateError(const std::vector<double>& y,
                                          const std::vector<double>& yEst,
                                          const std::vector<double>& yRef) const
{
    // Weighted RMS norm: err = sqrt(1/N * sum((yEst_i - yRef_i)/(atol + rtol*|y_i|))^2)
    double sumSq = 0.0;
    for (int i = 0; i < numStates_; ++i) {
        double scale = config_.atol + config_.rtol * std::abs(y[i]);
        if (scale < 1e-30) scale = 1e-30;
        double diff = (yEst[i] - yRef[i]) / scale;
        sumSq += diff * diff;
    }
    return std::sqrt(sumSq / numStates_);
}

double AdaptiveIntegrator::computeNewDt(double dt, double error, int order) const {
    if (error < 1e-30) {
        return std::min(dt * 5.0, config_.dtMax);
    }
    // dt_new = safety * dt * (1/error)^(1/(order+1))
    double factor = config_.safetyFactor * std::pow(1.0 / error, 1.0 / (order + 1));
    // Clamp growth/shrink factor
    factor = std::max(0.2, std::min(factor, 5.0));
    double dtNew = dt * factor;
    return std::max(config_.dtMin, std::min(dtNew, config_.dtMax));
}

bool AdaptiveIntegrator::stepBDF1(double t, double dt, const std::vector<double>& yn,
                                   std::vector<double>& ynp1, const RhsFunc& rhs)
{
    // BDF-1 (backward Euler): y^{n+1} = y^n + dt * f(t^{n+1}, y^{n+1})
    // Simplified Newton iteration: start from explicit Euler predictor
    const int maxNewton = 10;
    const double newtonTol = 1e-10;

    // Predictor: explicit Euler
    std::vector<double> f(numStates_);
    rhs(t, yn, f);
    ynp1.resize(numStates_);
    for (int i = 0; i < numStates_; ++i) {
        ynp1[i] = yn[i] + dt * f[i];
    }

    // Newton iteration
    std::vector<double> fNew(numStates_);
    std::vector<double> residual(numStates_);

    for (int iter = 0; iter < maxNewton; ++iter) {
        rhs(t + dt, ynp1, fNew);

        // Residual: R = y^{n+1} - y^n - dt * f(t+dt, y^{n+1})
        double maxRes = 0.0;
        for (int i = 0; i < numStates_; ++i) {
            residual[i] = ynp1[i] - yn[i] - dt * fNew[i];
            maxRes = std::max(maxRes, std::abs(residual[i]));
        }

        if (maxRes < newtonTol) return true;

        // Simplified Newton: approximate Jacobian as I - dt * diag(df/dy)
        // Use finite differences for diagonal Jacobian
        double eps = std::sqrt(std::numeric_limits<double>::epsilon());
        std::vector<double> yPerturbed(ynp1);
        std::vector<double> fPerturbed(numStates_);

        for (int i = 0; i < numStates_; ++i) {
            double h = eps * std::max(std::abs(ynp1[i]), 1.0);
            yPerturbed[i] = ynp1[i] + h;
            rhs(t + dt, yPerturbed, fPerturbed);
            yPerturbed[i] = ynp1[i];

            double dfdy_ii = (fPerturbed[i] - fNew[i]) / h;
            double jac_ii = 1.0 - dt * dfdy_ii;
            if (std::abs(jac_ii) < 1e-30) jac_ii = 1.0;

            ynp1[i] -= residual[i] / jac_ii;
        }
    }

    return true; // Accept even if not fully converged
}

bool AdaptiveIntegrator::stepBDF2(double t, double dt, double dtPrev,
                                   const std::vector<double>& yn,
                                   const std::vector<double>& ynm1,
                                   std::vector<double>& ynp1, const RhsFunc& rhs)
{
    // BDF-2 with variable step size:
    // r = dt / dtPrev
    // y^{n+1} = (1+2r)/(1+r) * y^n - r^2/(1+r) * y^{n-1} + dt*(1+r)/(1+2r) * ...
    // Simplified: for equal steps (r=1):
    //   y^{n+1} = (4/3)*y^n - (1/3)*y^{n-1} + (2/3)*dt*f(t+dt, y^{n+1})
    double r = dt / dtPrev;
    double a1 = (1.0 + 2.0 * r) / (1.0 + r);
    double a2 = -(r * r) / (1.0 + r);
    double b = dt * (1.0 + r) / (1.0 + 2.0 * r);

    const int maxNewton = 10;
    const double newtonTol = 1e-10;

    // Predictor: extrapolation
    ynp1.resize(numStates_);
    std::vector<double> f(numStates_);
    rhs(t, yn, f);
    for (int i = 0; i < numStates_; ++i) {
        ynp1[i] = a1 * yn[i] + a2 * ynm1[i] + b * f[i];
    }

    // Newton iteration
    std::vector<double> fNew(numStates_);
    std::vector<double> residual(numStates_);

    for (int iter = 0; iter < maxNewton; ++iter) {
        rhs(t + dt, ynp1, fNew);

        double maxRes = 0.0;
        for (int i = 0; i < numStates_; ++i) {
            residual[i] = ynp1[i] - a1 * yn[i] - a2 * ynm1[i] - b * fNew[i];
            maxRes = std::max(maxRes, std::abs(residual[i]));
        }

        if (maxRes < newtonTol) return true;

        // Diagonal Newton
        double eps = std::sqrt(std::numeric_limits<double>::epsilon());
        std::vector<double> yPerturbed(ynp1);
        std::vector<double> fPerturbed(numStates_);

        for (int i = 0; i < numStates_; ++i) {
            double h = eps * std::max(std::abs(ynp1[i]), 1.0);
            yPerturbed[i] = ynp1[i] + h;
            rhs(t + dt, yPerturbed, fPerturbed);
            yPerturbed[i] = ynp1[i];

            double dfdy_ii = (fPerturbed[i] - fNew[i]) / h;
            double jac_ii = 1.0 - b * dfdy_ii;
            if (std::abs(jac_ii) < 1e-30) jac_ii = 1.0;

            ynp1[i] -= residual[i] / jac_ii;
        }
    }

    return true;
}

double AdaptiveIntegrator::step(double t, double dtTarget, std::vector<double>& y,
                                 const RhsFunc& rhs)
{
    double tCurrent = t;
    double tEnd = t + dtTarget;
    double dt = std::min(suggestedDt_, dtTarget);
    dt = std::max(dt, config_.dtMin);
    dt = std::min(dt, config_.dtMax);

    const int maxInternalSteps = 100000;
    int internalSteps = 0;

    while (tCurrent < tEnd - 1e-14) {
        // Don't overshoot
        if (tCurrent + dt > tEnd) {
            dt = tEnd - tCurrent;
        }
        if (dt < config_.dtMin * 0.5) break;
        if (++internalSteps > maxInternalSteps) break;

        int order;
        std::vector<double> ySolution;

        if (hasPrevious_ && config_.maxOrder >= 2) {
            // Try BDF-2 for the solution
            order = 2;
            stepBDF2(tCurrent, dt, dtPrev_, y, yPrev_, ySolution, rhs);

            // Error estimate: compare with BDF-1 solution
            std::vector<double> yBDF1;
            stepBDF1(tCurrent, dt, y, yBDF1, rhs);

            double error = estimateError(y, ySolution, yBDF1);

            if (error > 1.0 && dt > config_.dtMin * 1.01) {
                // Reject step, but only if we can still shrink
                rejectedSteps_++;
                dt = computeNewDt(dt, error, order);
                dt = std::max(dt, config_.dtMin);
                continue;
            }

            // Accept step (or forced accept at dtMin)
            suggestedDt_ = computeNewDt(dt, error, order);
        } else {
            // BDF-1 only
            order = 1;
            stepBDF1(tCurrent, dt, y, ySolution, rhs);

            // Error estimate: compare with two half-steps
            double halfDt = dt * 0.5;
            std::vector<double> yHalf, yDouble;
            stepBDF1(tCurrent, halfDt, y, yHalf, rhs);
            stepBDF1(tCurrent + halfDt, halfDt, yHalf, yDouble, rhs);

            double error = estimateError(y, ySolution, yDouble);

            if (error > 1.0 && dt > config_.dtMin * 1.01) {
                // Reject step, but only if we can still shrink
                rejectedSteps_++;
                dt = computeNewDt(dt, error, order);
                dt = std::max(dt, config_.dtMin);
                continue;
            }

            suggestedDt_ = computeNewDt(dt, error, order);
        }

        // Accept step: update history
        yPrev_ = y;
        dtPrev_ = dt;
        hasPrevious_ = true;

        y = ySolution;
        tCurrent += dt;
        totalSteps_++;

        dt = std::min(suggestedDt_, tEnd - tCurrent);
        dt = std::max(dt, config_.dtMin);
    }

    return tCurrent;
}

} // namespace contam
