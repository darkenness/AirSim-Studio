#include "core/Solver.h"
#include <Eigen/IterativeLinearSolvers>
#include <cmath>
#include <algorithm>
#include <iostream>
#include <queue>
#include <set>

namespace contam {

Solver::Solver(SolverMethod method)
    : method_(method)
{
}

double Solver::computeDeltaP(const Network& network, const Link& link) const {
    const auto& nodeI = network.getNode(link.getNodeFrom());
    const auto& nodeJ = network.getNode(link.getNodeTo());
    double Zk = link.getElevation();

    // ΔP_k = (P_j - ρ_j·g·(Z_k - Z_j)) - (P_i - ρ_i·g·(Z_k - Z_i))
    double pEffI = nodeI.getPressure() - nodeI.getDensity() * GRAVITY * (Zk - nodeI.getElevation());
    double pEffJ = nodeJ.getPressure() - nodeJ.getDensity() * GRAVITY * (Zk - nodeJ.getElevation());

    // Convention: positive ΔP drives flow from nodeI to nodeJ
    return pEffI - pEffJ;
}

void Solver::computeFlows(Network& network) {
    for (auto& link : network.getLinks()) {
        const auto* elem = link.getFlowElement();
        if (!elem) continue;

        double deltaP = computeDeltaP(network, link);

        // Use average density of the two connected nodes
        const auto& nodeI = network.getNode(link.getNodeFrom());
        const auto& nodeJ = network.getNode(link.getNodeTo());
        double avgDensity = 0.5 * (nodeI.getDensity() + nodeJ.getDensity());

        auto result = elem->calculate(deltaP, avgDensity);
        link.setMassFlow(result.massFlow);
        link.setDerivative(result.derivative);
    }
}

void Solver::assembleSystem(
    const Network& network,
    Eigen::SparseMatrix<double>& J,
    Eigen::VectorXd& R,
    const std::vector<int>& unknownMap)
{
    int n = network.getUnknownCount();
    J.resize(n, n);
    R.setZero(n);

    std::vector<Eigen::Triplet<double>> triplets;
    triplets.reserve(n * 5);  // estimate ~5 non-zeros per row

    // For each link, contribute to residual and Jacobian
    for (const auto& link : network.getLinks()) {
        int i = link.getNodeFrom();
        int j = link.getNodeTo();
        double massFlow = link.getMassFlow();
        double deriv = link.getDerivative();

        int eqI = unknownMap[i];  // equation index for node i (-1 if ambient)
        int eqJ = unknownMap[j];

        // Residual convention: net inflow = 0
        // R_i -= ṁ (outflow from i reduces net inflow)
        // R_j += ṁ (inflow to j increases net inflow)
        if (eqI >= 0) {
            R(eqI) -= massFlow;
        }
        if (eqJ >= 0) {
            R(eqJ) += massFlow;
        }

        // Jacobian contributions:
        // J_ii += -d (diagonal, node i)
        // J_jj += -d (diagonal, node j)
        // J_ij += d  (off-diagonal)
        // J_ji += d  (off-diagonal)
        if (eqI >= 0) {
            triplets.emplace_back(eqI, eqI, -deriv);
            if (eqJ >= 0) {
                triplets.emplace_back(eqI, eqJ, deriv);
            }
        }
        if (eqJ >= 0) {
            triplets.emplace_back(eqJ, eqJ, -deriv);
            if (eqI >= 0) {
                triplets.emplace_back(eqJ, eqI, deriv);
            }
        }
    }

    J.setFromTriplets(triplets.begin(), triplets.end());
}

void Solver::applyUpdateSUR(Network& network, const Eigen::VectorXd& dP,
                              const std::vector<int>& unknownMap) {
    for (int i = 0; i < network.getNodeCount(); ++i) {
        int eq = unknownMap[i];
        if (eq >= 0) {
            auto& node = network.getNode(i);
            node.setPressure(node.getPressure() + relaxFactor_ * dP(eq));
        }
    }
}

void Solver::applyUpdateTR(Network& network, const Eigen::VectorXd& dP,
                             const std::vector<int>& unknownMap,
                             double& trustRadius, double prevResidualNorm,
                             const Eigen::VectorXd& R) {
    double stepNorm = dP.norm();

    // Clamp step to trust region
    double scale = 1.0;
    if (stepNorm > trustRadius) {
        scale = trustRadius / stepNorm;
    }

    // Apply scaled update
    for (int i = 0; i < network.getNodeCount(); ++i) {
        int eq = unknownMap[i];
        if (eq >= 0) {
            auto& node = network.getNode(i);
            node.setPressure(node.getPressure() + scale * dP(eq));
        }
    }

    // After applying, we'd need to recompute residual to get actual reduction.
    // For simplicity in initial implementation, we adjust trust radius based on step scaling.
    if (scale < 1.0) {
        // Step was clamped - shrink trust region
        trustRadius *= 0.5;
        trustRadius = std::max(trustRadius, TR_MIN_RADIUS);
    } else {
        // Full step accepted - expand trust region
        trustRadius *= 2.0;
        trustRadius = std::min(trustRadius, TR_MAX_RADIUS);
    }
}

std::vector<int> Solver::computeRCMOrdering(const Network& network,
                                              const std::vector<int>& unknownMap,
                                              int numUnknowns)
{
    if (numUnknowns <= 1) {
        std::vector<int> identity(numUnknowns);
        for (int i = 0; i < numUnknowns; ++i) identity[i] = i;
        return identity;
    }

    // Build adjacency list for the unknown nodes
    std::vector<std::set<int>> adj(numUnknowns);
    for (const auto& link : network.getLinks()) {
        int eqI = unknownMap[link.getNodeFrom()];
        int eqJ = unknownMap[link.getNodeTo()];
        if (eqI >= 0 && eqJ >= 0 && eqI != eqJ) {
            adj[eqI].insert(eqJ);
            adj[eqJ].insert(eqI);
        }
    }

    // Find starting node: the one with minimum degree (peripheral node heuristic)
    int startNode = 0;
    int minDeg = (int)adj[0].size();
    for (int i = 1; i < numUnknowns; ++i) {
        if ((int)adj[i].size() < minDeg) {
            minDeg = (int)adj[i].size();
            startNode = i;
        }
    }

    // BFS (Cuthill-McKee ordering)
    std::vector<int> cmOrder;
    cmOrder.reserve(numUnknowns);
    std::vector<bool> visited(numUnknowns, false);

    std::queue<int> bfsQueue;
    bfsQueue.push(startNode);
    visited[startNode] = true;

    while (!bfsQueue.empty()) {
        int node = bfsQueue.front();
        bfsQueue.pop();
        cmOrder.push_back(node);

        // Get neighbors sorted by degree (ascending)
        std::vector<std::pair<int, int>> neighbors;
        for (int nb : adj[node]) {
            if (!visited[nb]) {
                neighbors.emplace_back((int)adj[nb].size(), nb);
            }
        }
        std::sort(neighbors.begin(), neighbors.end());

        for (auto& [deg, nb] : neighbors) {
            if (!visited[nb]) {
                visited[nb] = true;
                bfsQueue.push(nb);
            }
        }
    }

    // Handle disconnected components
    for (int i = 0; i < numUnknowns; ++i) {
        if (!visited[i]) cmOrder.push_back(i);
    }

    // Reverse for RCM
    std::reverse(cmOrder.begin(), cmOrder.end());
    return cmOrder;
}

SolverResult Solver::solve(Network& network) {
    SolverResult result;

    // Build unknown map: for each node, map to equation index (-1 if known pressure)
    std::vector<int> baseUnknownMap(network.getNodeCount(), -1);
    int eqIdx = 0;
    for (int i = 0; i < network.getNodeCount(); ++i) {
        if (!network.getNode(i).isKnownPressure()) {
            baseUnknownMap[i] = eqIdx++;
        }
    }

    int n = eqIdx;  // number of unknowns

    // Apply RCM node reordering for bandwidth reduction
    auto rcmPerm = computeRCMOrdering(network, baseUnknownMap, n);

    // Build reordered unknownMap: rcmPerm[new] = old, so invPerm[old] = new
    std::vector<int> invPerm(n);
    for (int i = 0; i < n; ++i) invPerm[rcmPerm[i]] = i;

    std::vector<int> unknownMap(network.getNodeCount(), -1);
    for (int i = 0; i < network.getNodeCount(); ++i) {
        if (baseUnknownMap[i] >= 0) {
            unknownMap[i] = invPerm[baseUnknownMap[i]];
        }
    }
    if (n == 0) {
        result.converged = true;
        return result;
    }

    // Initialize densities
    network.updateAllDensities();

    Eigen::SparseMatrix<double> J(n, n);
    Eigen::VectorXd R(n);
    double trustRadius = TR_INITIAL_RADIUS;

    for (int iter = 0; iter < maxIterations_; ++iter) {
        // Update densities based on current pressures
        network.updateAllDensities();

        // Compute flows and derivatives for all links
        computeFlows(network);

        // Assemble Jacobian and residual
        assembleSystem(network, J, R, unknownMap);

        // Check convergence
        result.maxResidual = R.lpNorm<Eigen::Infinity>();
        result.iterations = iter + 1;

        if (result.maxResidual < convergenceTol_) {
            result.converged = true;
            break;
        }

        // Solve J * dP = -R
        // Auto-switch: SparseLU for small systems, BiCGSTAB+ILU for large
        Eigen::VectorXd dP;
        bool solveOk = false;

        if (n > 50) {
            // Large system: use iterative BiCGSTAB with ILU preconditioning
            Eigen::BiCGSTAB<Eigen::SparseMatrix<double>, Eigen::IncompleteLUT<double>> iterSolver;
            iterSolver.setMaxIterations(1000);
            iterSolver.setTolerance(1e-10);
            iterSolver.compute(J);
            if (iterSolver.info() == Eigen::Success) {
                dP = iterSolver.solve(-R);
                solveOk = (iterSolver.info() == Eigen::Success);
            }
            // Fallback to direct if iterative fails
            if (!solveOk) {
                Eigen::SparseLU<Eigen::SparseMatrix<double>> directSolver;
                directSolver.compute(J);
                if (directSolver.info() == Eigen::Success) {
                    dP = directSolver.solve(-R);
                    solveOk = (directSolver.info() == Eigen::Success);
                }
            }
        } else {
            // Small system: use direct SparseLU
            Eigen::SparseLU<Eigen::SparseMatrix<double>> directSolver;
            directSolver.compute(J);
            if (directSolver.info() == Eigen::Success) {
                dP = directSolver.solve(-R);
                solveOk = (directSolver.info() == Eigen::Success);
            }
        }

        if (!solveOk) {
            std::cerr << "Solver: linear solve failed at iteration " << iter << std::endl;
            break;
        }

        // Apply pressure update
        double prevResidualNorm = R.norm();
        if (method_ == SolverMethod::SubRelaxation) {
            applyUpdateSUR(network, dP, unknownMap);
        } else {
            applyUpdateTR(network, dP, unknownMap, trustRadius, prevResidualNorm, R);
        }
    }

    // Collect final results
    result.pressures.resize(network.getNodeCount());
    for (int i = 0; i < network.getNodeCount(); ++i) {
        result.pressures[i] = network.getNode(i).getPressure();
    }

    result.massFlows.resize(network.getLinkCount());
    for (int i = 0; i < network.getLinkCount(); ++i) {
        result.massFlows[i] = network.getLink(i).getMassFlow();
    }

    return result;
}

} // namespace contam
