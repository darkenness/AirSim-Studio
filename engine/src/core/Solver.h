#pragma once

#include "core/Network.h"
#include <Eigen/Sparse>
#include <vector>
#include <functional>

namespace contam {

enum class SolverMethod {
    SubRelaxation,  // Simple under-relaxation (SUR), α ≈ 0.75
    TrustRegion     // Trust region method (default, more robust)
};

struct SolverResult {
    bool converged = false;
    int iterations = 0;
    double maxResidual = 0.0;
    std::vector<double> pressures;   // final pressures for each node
    std::vector<double> massFlows;   // final mass flows for each link
};

class Solver {
public:
    explicit Solver(SolverMethod method = SolverMethod::TrustRegion);

    // Solve steady-state airflow network
    SolverResult solve(Network& network);

    // Configuration
    void setMethod(SolverMethod m) { method_ = m; }
    void setMaxIterations(int n) { maxIterations_ = n; }
    void setConvergenceTol(double tol) { convergenceTol_ = tol; }
    void setRelaxFactor(double alpha) { relaxFactor_ = alpha; }

private:
    SolverMethod method_;
    int maxIterations_ = MAX_ITERATIONS;
    double convergenceTol_ = CONVERGENCE_TOL;
    double relaxFactor_ = RELAX_FACTOR_SUR;

    // Compute real pressure difference across a link (with elevation correction)
    double computeDeltaP(const Network& network, const Link& link) const;

    // Compute flows and derivatives for all links
    void computeFlows(Network& network);

    // Assemble Jacobian matrix and residual vector
    void assembleSystem(
        const Network& network,
        Eigen::SparseMatrix<double>& J,
        Eigen::VectorXd& R,
        const std::vector<int>& unknownMap  // node index -> equation index (-1 if known)
    );

    // Apply pressure update with sub-relaxation
    void applyUpdateSUR(Network& network, const Eigen::VectorXd& dP,
                        const std::vector<int>& unknownMap);

    // Apply pressure update with trust region
    void applyUpdateTR(Network& network, const Eigen::VectorXd& dP,
                       const std::vector<int>& unknownMap,
                       double& trustRadius, double prevResidualNorm,
                       const Eigen::VectorXd& R);

    // Reverse Cuthill-McKee node reordering for bandwidth reduction
    // Returns a permutation vector: perm[new_idx] = old_node_idx
    static std::vector<int> computeRCMOrdering(const Network& network,
                                                const std::vector<int>& unknownMap,
                                                int numUnknowns);
};

} // namespace contam
