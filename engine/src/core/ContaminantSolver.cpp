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

    // Solve each species independently (no inter-species reactions for now)
    for (int k = 0; k < numSpecies_; ++k) {
        solveSpecies(network, k, t, dt);
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

        // Generation: G * schedule → RHS
        b(eq) += src.generationRate * scheduleMult;

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

} // namespace contam
