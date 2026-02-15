#include "core/DuctNetwork.h"
#include "utils/Constants.h"
#include <algorithm>
#include <stdexcept>

namespace contam {

void DuctNetwork::addJunction(const DuctJunction& j) {
    junctionIdToIdx_[j.id] = static_cast<int>(junctions_.size());
    junctions_.push_back(j);
}

void DuctNetwork::addTerminal(const DuctTerminal& t) {
    terminalIdToIdx_[t.id] = static_cast<int>(terminals_.size());
    terminals_.push_back(t);
}

void DuctNetwork::addDuctLink(int id, int fromId, int toId, std::unique_ptr<FlowElement> element) {
    linkIdToIdx_[id] = static_cast<int>(links_.size());
    DuctLink dl;
    dl.id = id;
    dl.fromId = fromId;
    dl.toId = toId;
    dl.element = std::move(element);
    links_.push_back(std::move(dl));
}

double DuctNetwork::getNodePressure(int nodeId) const {
    auto jit = junctionIdToIdx_.find(nodeId);
    if (jit != junctionIdToIdx_.end()) {
        return junctions_[jit->second].pressure;
    }
    auto tit = terminalIdToIdx_.find(nodeId);
    if (tit != terminalIdToIdx_.end()) {
        // Terminal pressure is fixed (boundary condition from zone network)
        // For duct solve, terminals act as known-pressure boundaries (P=0 gauge by default)
        return 0.0;
    }
    return 0.0;
}

void DuctNetwork::setJunctionPressure(int nodeId, double p) {
    auto jit = junctionIdToIdx_.find(nodeId);
    if (jit != junctionIdToIdx_.end()) {
        junctions_[jit->second].pressure = p;
    }
}

bool DuctNetwork::isJunction(int nodeId) const {
    return junctionIdToIdx_.find(nodeId) != junctionIdToIdx_.end();
}

bool DuctNetwork::solve(double tolerance, int maxIter) {
    int nJunctions = static_cast<int>(junctions_.size());
    if (nJunctions == 0) {
        // No unknowns, just compute link flows from terminal pressures
        for (auto& link : links_) {
            double pFrom = getNodePressure(link.fromId);
            double pTo = getNodePressure(link.toId);
            double dP = pFrom - pTo;
            double density = 1.2; // default air density
            auto result = link.element->calculate(dP, density);
            link.massFlow = result.massFlow;
            link.derivative = result.derivative;
        }
        return true;
    }

    // Build junction index map: junction id -> equation index
    std::unordered_map<int, int> eqMap;
    for (int i = 0; i < nJunctions; ++i) {
        eqMap[junctions_[i].id] = i;
    }

    double density = 1.2; // standard air density for duct network

    for (int iter = 0; iter < maxIter; ++iter) {
        // Compute flows and derivatives for all links
        for (auto& link : links_) {
            double pFrom = getNodePressure(link.fromId);
            double pTo = getNodePressure(link.toId);
            double dP = pFrom - pTo;
            auto result = link.element->calculate(dP, density);
            link.massFlow = result.massFlow;
            link.derivative = result.derivative;
        }

        // Assemble Jacobian and residual
        Eigen::MatrixXd J = Eigen::MatrixXd::Zero(nJunctions, nJunctions);
        Eigen::VectorXd R = Eigen::VectorXd::Zero(nJunctions);

        for (const auto& link : links_) {
            auto itFrom = eqMap.find(link.fromId);
            auto itTo = eqMap.find(link.toId);
            int eqFrom = (itFrom != eqMap.end()) ? itFrom->second : -1;
            int eqTo = (itTo != eqMap.end()) ? itTo->second : -1;

            // Mass conservation: net outflow from junction = 0
            if (eqFrom >= 0) {
                R(eqFrom) -= link.massFlow;
                J(eqFrom, eqFrom) -= link.derivative;
                if (eqTo >= 0) {
                    J(eqFrom, eqTo) += link.derivative;
                }
            }
            if (eqTo >= 0) {
                R(eqTo) += link.massFlow;
                J(eqTo, eqTo) -= link.derivative;
                if (eqFrom >= 0) {
                    J(eqTo, eqFrom) += link.derivative;
                }
            }
        }

        // Check convergence
        double maxRes = R.lpNorm<Eigen::Infinity>();
        if (maxRes < tolerance) {
            return true;
        }

        // Solve J * dP = -R
        Eigen::VectorXd dP = J.colPivHouseholderQr().solve(-R);

        // Apply update with relaxation
        for (int i = 0; i < nJunctions; ++i) {
            junctions_[i].pressure += 0.75 * dP(i);
        }
    }

    return false; // Did not converge
}

bool DuctNetwork::autoBalance(int maxIterations, double tolerance) {
    for (int balIter = 0; balIter < maxIterations; ++balIter) {
        // Solve the duct network with current balance coefficients
        if (!solve()) return false;

        // Check if all terminals are within tolerance of design flow
        bool allBalanced = true;
        for (auto& term : terminals_) {
            double actualFlow = getTerminalFlow(term.id);
            if (std::abs(term.designFlow) < 1e-10) continue;

            double ratio = actualFlow / term.designFlow;
            double error = std::abs(ratio - 1.0);

            if (error > tolerance) {
                allBalanced = false;
                // Adjust balance coefficient: increase if flow too low, decrease if too high
                // For power-law elements, flow ~ C * dP^n, so adjusting C proportionally
                if (ratio > 1e-10) {
                    term.balanceCoeff *= (1.0 / ratio);
                    // Clamp to reasonable range
                    term.balanceCoeff = std::max(0.01, std::min(term.balanceCoeff, 100.0));
                }
            }
        }

        if (allBalanced) return true;
    }

    return false;
}

double DuctNetwork::getJunctionPressure(int id) const {
    auto it = junctionIdToIdx_.find(id);
    if (it != junctionIdToIdx_.end()) {
        return junctions_[it->second].pressure;
    }
    return 0.0;
}

double DuctNetwork::getLinkFlow(int id) const {
    auto it = linkIdToIdx_.find(id);
    if (it != linkIdToIdx_.end()) {
        return links_[it->second].massFlow;
    }
    return 0.0;
}

double DuctNetwork::getTerminalFlow(int id) const {
    auto it = terminalIdToIdx_.find(id);
    if (it == terminalIdToIdx_.end()) return 0.0;

    int termId = terminals_[it->second].id;

    // Sum flows through links connected to this terminal
    double totalFlow = 0.0;
    for (const auto& link : links_) {
        if (link.toId == termId) {
            totalFlow += link.massFlow;
        } else if (link.fromId == termId) {
            totalFlow -= link.massFlow;
        }
    }
    return totalFlow;
}

} // namespace contam
