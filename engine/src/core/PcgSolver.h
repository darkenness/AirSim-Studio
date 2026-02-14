#pragma once

#include <Eigen/Sparse>
#include <Eigen/IterativeLinearSolvers>
#include <vector>

namespace contam {

// Preconditioned Conjugate Gradient solver for symmetric positive-definite systems
// Used as an alternative to direct (SparseLU) solve for large networks (>100 nodes)
class PcgSolver {
public:
    PcgSolver(int maxIterations = 1000, double tolerance = 1e-10)
        : maxIterations_(maxIterations), tolerance_(tolerance) {}

    // Solve Ax = b where A is the Jacobian (made symmetric via J^T*J approach)
    // Returns the solution vector x
    // For N-R: we solve J * dx = -F, but J is not symmetric.
    // Instead we use BiCGSTAB which handles non-symmetric systems.
    bool solve(const Eigen::SparseMatrix<double>& A,
               const Eigen::VectorXd& b,
               Eigen::VectorXd& x) const {
        Eigen::BiCGSTAB<Eigen::SparseMatrix<double>, Eigen::IncompleteLUT<double>> solver;
        solver.setMaxIterations(maxIterations_);
        solver.setTolerance(tolerance_);
        solver.compute(A);

        if (solver.info() != Eigen::Success) {
            return false;
        }

        x = solver.solve(b);
        lastIterations_ = static_cast<int>(solver.iterations());
        lastError_ = solver.error();

        return solver.info() == Eigen::Success;
    }

    int lastIterations() const { return lastIterations_; }
    double lastError() const { return lastError_; }

private:
    int maxIterations_;
    double tolerance_;
    mutable int lastIterations_ = 0;
    mutable double lastError_ = 0.0;
};

} // namespace contam
