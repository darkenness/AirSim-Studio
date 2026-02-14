#pragma once
#include "Network.h"
#include "Species.h"
#include "Schedule.h"
#include "ChemicalKinetics.h"
#include "Solver.h"
#include <Eigen/Dense>
#include <vector>
#include <map>

namespace contam {

struct ContaminantResult {
    double time;                                    // current simulation time (s)
    std::vector<std::vector<double>> concentrations; // [nodeIdx][speciesIdx] kg/m³
};

// Transient contaminant transport solver
// Solves: V_i * dC_ik/dt = Σ_j(ṁ_ji * C_jk/ρ_j) - Σ_j(ṁ_ij * C_ik/ρ_i)
//                         + G_ik * schedule(t) - R_ik * C_ik * V_i - λ_k * C_ik * V_i
class ContaminantSolver {
public:
    ContaminantSolver() = default;

    // Set species list
    void setSpecies(const std::vector<Species>& species) { species_ = species; }

    // Set source/sink list
    void setSources(const std::vector<Source>& sources) { sources_ = sources; }

    // Set schedules
    void setSchedules(const std::map<int, Schedule>& schedules) { schedules_ = schedules; }

    // Set chemical reaction network (inter-species reactions)
    void setReactionNetwork(const ReactionNetwork& rxnNet) { rxnNetwork_ = rxnNet; }

    // Initialize concentration matrix (all zones, all species)
    void initialize(const Network& network);

    // Advance one timestep using implicit Euler (backward Euler)
    // Uses the current airflow solution from network links
    // Returns concentration state after dt
    ContaminantResult step(const Network& network, double t, double dt);

    // Get current concentrations
    const std::vector<std::vector<double>>& getConcentrations() const { return C_; }

    // Set initial concentration for a specific zone and species
    void setInitialConcentration(int nodeIdx, int speciesIdx, double conc);

private:
    std::vector<Species> species_;
    std::vector<Source> sources_;
    std::map<int, Schedule> schedules_;

    // C_[nodeIdx][speciesIdx] = concentration in kg/m³
    std::vector<std::vector<double>> C_;

    int numZones_ = 0;
    int numSpecies_ = 0;

    // Get schedule multiplier at time t
    double getScheduleValue(int scheduleId, double t) const;

    ReactionNetwork rxnNetwork_;

    // Build and solve the implicit system for one species (no inter-species coupling)
    void solveSpecies(const Network& network, int specIdx, double t, double dt);

    // Coupled multi-species solve (when chemical kinetics are present)
    void solveCoupled(const Network& network, double t, double dt);
};

} // namespace contam
