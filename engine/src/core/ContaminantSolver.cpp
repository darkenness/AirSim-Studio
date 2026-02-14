#include "ContaminantSolver.h"
#include "utils/Constants.h"
#include <Eigen/Dense>
#include <cmath>
#include <stdexcept>

namespace contam {

void ContaminantSolver::initialize(const Network& network) {
    numZones_ = static_cast<int>(network.getNodeCount());
    numSpecies_ = static_cast<int>(species_.size());

    if (numSpecies_ == 0) return;

    // Initialize concentration matrix: C_[zone][species]
    C_.resize(numZones_);
    for (int i = 0; i < numZones_; ++i) {
        C_[i].resize(numSpecies_, 0.0);

        // Set ambient nodes to outdoor concentration
        if (network.getNode(i).isKnownPressure()) {
            for (int k = 0; k < numSpecies_; ++k) {
                C_[i][k] = species_[k].outdoorConc;
            }
        }
    }
}

void ContaminantSolver::setInitialConcentration(int nodeIdx, int speciesIdx, double conc) {
    if (nodeIdx >= 0 && nodeIdx < numZones_ && speciesIdx >= 0 && speciesIdx < numSpecies_) {
        C_[nodeIdx][speciesIdx] = conc;
    }
}

double ContaminantSolver::getScheduleValue(int scheduleId, double t) const {
    if (scheduleId < 0) return 1.0; // No schedule = always on
    auto it = schedules_.find(scheduleId);
    if (it == schedules_.end()) return 1.0;
    return it->second.getValue(t);
}

ContaminantResult ContaminantSolver::step(const Network& network, double t, double dt) {
    if (numSpecies_ == 0) {
        return {t + dt, C_};
    }

    if (!rxnNetwork_.empty()) {
        // Coupled multi-species solve with chemical kinetics
        solveCoupled(network, t, dt);
    } else {
        // Solve each species independently
        for (int k = 0; k < numSpecies_; ++k) {
            solveSpecies(network, k, t, dt);
        }
    }

    // Update ambient node concentrations to outdoor values
    for (int i = 0; i < numZones_; ++i) {
        if (network.getNode(i).isKnownPressure()) {
            for (int k = 0; k < numSpecies_; ++k) {
                C_[i][k] = species_[k].outdoorConc;
            }
        }
    }

    return {t + dt, C_};
}

void ContaminantSolver::solveSpecies(const Network& network, int specIdx, double t, double dt) {
    // Build equation index map (only unknown = non-ambient zones)
    std::vector<int> unknownMap(numZones_, -1);
    int numUnknown = 0;
    for (int i = 0; i < numZones_; ++i) {
        if (!network.getNode(i).isKnownPressure()) {
            unknownMap[i] = numUnknown++;
        }
    }

    if (numUnknown == 0) return;

    // Implicit Euler: (V/dt + outflow_coeff + removal + decay) * C^{n+1}
    //                 = V/dt * C^n + inflow_terms + generation
    //
    // A * C_new = b
    Eigen::MatrixXd A = Eigen::MatrixXd::Zero(numUnknown, numUnknown);
    Eigen::VectorXd b = Eigen::VectorXd::Zero(numUnknown);

    // Diagonal terms: V_i / dt
    for (int i = 0; i < numZones_; ++i) {
        int eq = unknownMap[i];
        if (eq < 0) continue;

        const auto& node = network.getNode(i);
        double Vi = node.getVolume();
        double rho_i = node.getDensity();

        if (Vi <= 0.0) Vi = 1.0; // Safety for zero-volume nodes

        // V/dt term (from time derivative)
        A(eq, eq) += Vi / dt;

        // RHS: V/dt * C_old
        b(eq) += Vi / dt * C_[i][specIdx];

        // Decay: -λ * C * V  →  A += λ * V (implicit)
        double lambda = species_[specIdx].decayRate;
        if (lambda > 0.0) {
            A(eq, eq) += lambda * Vi;
        }
    }

    // Flow terms from links
    for (const auto& link : network.getLinks()) {
        int nodeI = link.getNodeFrom();
        int nodeJ = link.getNodeTo();
        double massFlow = link.getMassFlow();

        // massFlow > 0: flow from I to J
        // massFlow < 0: flow from J to I
        if (massFlow > 0.0) {
            // Flow from I to J: C_I leaves I, enters J
            double flowRate = massFlow / network.getNode(nodeI).getDensity(); // m³/s

            // Node I loses flow (outflow)
            int eqI = unknownMap[nodeI];
            if (eqI >= 0) {
                A(eqI, eqI) += flowRate; // outflow from I (implicit in C_I^{n+1})
            }

            // Node J gains flow from I (inflow)
            int eqJ = unknownMap[nodeJ];
            if (eqJ >= 0) {
                if (eqI >= 0) {
                    // Both unknown: A(eqJ, eqI) -= flowRate (off-diagonal)
                    A(eqJ, eqI) -= flowRate;
                } else {
                    // I is ambient: put its concentration on RHS
                    b(eqJ) += flowRate * C_[nodeI][specIdx];
                }
            }
        } else if (massFlow < 0.0) {
            // Flow from J to I: C_J leaves J, enters I
            double flowRate = -massFlow / network.getNode(nodeJ).getDensity(); // m³/s

            // Node J loses flow (outflow)
            int eqJ = unknownMap[nodeJ];
            if (eqJ >= 0) {
                A(eqJ, eqJ) += flowRate;
            }

            // Node I gains flow from J (inflow)
            int eqI = unknownMap[nodeI];
            if (eqI >= 0) {
                if (eqJ >= 0) {
                    A(eqI, eqJ) -= flowRate;
                } else {
                    // J is ambient: put its concentration on RHS
                    b(eqI) += flowRate * C_[nodeJ][specIdx];
                }
            }
        }
    }

    // Source/sink terms
    for (const auto& src : sources_) {
        if (src.speciesId != species_[specIdx].id) continue;

        // Find zone index
        int zoneIdx = network.getNodeIndexById(src.zoneId);
        if (zoneIdx < 0) continue;
        int eq = unknownMap[zoneIdx];
        if (eq < 0) continue;

        double scheduleMult = getScheduleValue(src.scheduleId, t + dt);

        if (src.type == SourceType::ExponentialDecay) {
            // S(t) = mult * G0 * exp(-(t - startTime) / tau_c)
            double elapsed = (t + dt) - src.startTime;
            if (elapsed >= 0.0 && src.decayTimeConstant > 0.0) {
                double decayGen = src.multiplier * src.generationRate
                                  * std::exp(-elapsed / src.decayTimeConstant);
                b(eq) += decayGen * scheduleMult;
            }
        } else {
            // Constant source: G * schedule → RHS
            b(eq) += src.generationRate * scheduleMult;
        }

        // Removal sink: -R * C * V → A += R * V (implicit)
        if (src.removalRate > 0.0) {
            double Vi = network.getNode(zoneIdx).getVolume();
            A(eq, eq) += src.removalRate * Vi;
        }
    }

    // Solve A * C_new = b
    Eigen::VectorXd C_new = A.colPivHouseholderQr().solve(b);

    // Update concentrations (clamp to non-negative)
    for (int i = 0; i < numZones_; ++i) {
        int eq = unknownMap[i];
        if (eq >= 0) {
            C_[i][specIdx] = std::max(0.0, C_new(eq));
        }
    }
}

void ContaminantSolver::solveCoupled(const Network& network, double t, double dt) {
    // Build equation index map (only unknown = non-ambient zones)
    std::vector<int> unknownMap(numZones_, -1);
    int numUnknown = 0;
    for (int i = 0; i < numZones_; ++i) {
        if (!network.getNode(i).isKnownPressure()) {
            unknownMap[i] = numUnknown++;
        }
    }
    if (numUnknown == 0) return;

    // Block system: N = numUnknown * numSpecies
    // Variable ordering: [zone0_spec0, zone0_spec1, ..., zone1_spec0, ...]
    int N = numUnknown * numSpecies_;
    Eigen::MatrixXd A = Eigen::MatrixXd::Zero(N, N);
    Eigen::VectorXd b = Eigen::VectorXd::Zero(N);

    auto idx = [&](int zoneEq, int specIdx) { return zoneEq * numSpecies_ + specIdx; };

    // Build reaction rate matrix K[to][from]
    auto K = rxnNetwork_.buildMatrix(numSpecies_);

    // Diagonal terms: V_i / dt + decay + chemical self-consumption
    for (int i = 0; i < numZones_; ++i) {
        int eq = unknownMap[i];
        if (eq < 0) continue;
        const auto& node = network.getNode(i);
        double Vi = std::max(node.getVolume(), 1.0);

        for (int k = 0; k < numSpecies_; ++k) {
            int row = idx(eq, k);
            A(row, row) += Vi / dt;
            b(row) += Vi / dt * C_[i][k];

            // Species decay
            double lambda = species_[k].decayRate;
            if (lambda > 0.0) A(row, row) += lambda * Vi;

            // Chemical kinetics: dC_k/dt = Σ_j K[k][j]*C_j
            // Implicit: for production (off-diagonal): A(row_k, row_j) -= K[k][j]*Vi
            //           for self-consumption (diagonal): A(row_k, row_k) += |K[k][k]|*Vi
            for (int j = 0; j < numSpecies_; ++j) {
                if (std::abs(K[k][j]) < 1e-30) continue;
                int col = idx(eq, j);
                if (k == j) {
                    // Self-reaction (consumption): K[k][k] is typically negative
                    // Add |K[k][k]|*Vi to diagonal (implicit removal)
                    if (K[k][k] < 0.0) {
                        A(row, row) += std::abs(K[k][k]) * Vi;
                    }
                } else {
                    // Inter-species: β→α production
                    // K[k][j] > 0 means j produces k
                    A(row, col) -= K[k][j] * Vi;
                }
            }
        }
    }

    // Flow terms from links (same as single-species but for all species)
    for (const auto& link : network.getLinks()) {
        int nodeI = link.getNodeFrom();
        int nodeJ = link.getNodeTo();
        double massFlow = link.getMassFlow();

        for (int k = 0; k < numSpecies_; ++k) {
            if (massFlow > 0.0) {
                double flowRate = massFlow / network.getNode(nodeI).getDensity();
                int eqI = unknownMap[nodeI];
                int eqJ = unknownMap[nodeJ];
                if (eqI >= 0) A(idx(eqI, k), idx(eqI, k)) += flowRate;
                if (eqJ >= 0) {
                    if (eqI >= 0) A(idx(eqJ, k), idx(eqI, k)) -= flowRate;
                    else b(idx(eqJ, k)) += flowRate * C_[nodeI][k];
                }
            } else if (massFlow < 0.0) {
                double flowRate = -massFlow / network.getNode(nodeJ).getDensity();
                int eqI = unknownMap[nodeI];
                int eqJ = unknownMap[nodeJ];
                if (eqJ >= 0) A(idx(eqJ, k), idx(eqJ, k)) += flowRate;
                if (eqI >= 0) {
                    if (eqJ >= 0) A(idx(eqI, k), idx(eqJ, k)) -= flowRate;
                    else b(idx(eqI, k)) += flowRate * C_[nodeJ][k];
                }
            }
        }
    }

    // Source/sink terms
    for (const auto& src : sources_) {
        int specIdx = -1;
        for (int k = 0; k < numSpecies_; ++k) {
            if (species_[k].id == src.speciesId) { specIdx = k; break; }
        }
        if (specIdx < 0) continue;

        int zoneIdx = network.getNodeIndexById(src.zoneId);
        if (zoneIdx < 0) continue;
        int eq = unknownMap[zoneIdx];
        if (eq < 0) continue;

        double scheduleMult = getScheduleValue(src.scheduleId, t + dt);
        int row = idx(eq, specIdx);

        if (src.type == SourceType::ExponentialDecay) {
            double elapsed = (t + dt) - src.startTime;
            if (elapsed >= 0.0 && src.decayTimeConstant > 0.0) {
                b(row) += src.multiplier * src.generationRate
                          * std::exp(-elapsed / src.decayTimeConstant) * scheduleMult;
            }
        } else {
            b(row) += src.generationRate * scheduleMult;
        }

        if (src.removalRate > 0.0) {
            double Vi = network.getNode(zoneIdx).getVolume();
            A(row, row) += src.removalRate * Vi;
        }
    }

    // Solve block system
    Eigen::VectorXd C_new = A.colPivHouseholderQr().solve(b);

    // Update concentrations
    for (int i = 0; i < numZones_; ++i) {
        int eq = unknownMap[i];
        if (eq >= 0) {
            for (int k = 0; k < numSpecies_; ++k) {
                C_[i][k] = std::max(0.0, C_new(idx(eq, k)));
            }
        }
    }
}

} // namespace contam
