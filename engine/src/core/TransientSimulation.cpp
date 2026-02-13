#include "TransientSimulation.h"
#include <cmath>

namespace contam {

TransientResult TransientSimulation::run(Network& network) {
    TransientResult result;
    result.completed = false;

    // Initialize airflow solver
    Solver airflowSolver(config_.airflowMethod);

    // Initialize contaminant solver
    ContaminantSolver contSolver;
    bool hasContaminants = !species_.empty();

    if (hasContaminants) {
        contSolver.setSpecies(species_);
        contSolver.setSources(sources_);
        contSolver.setSchedules(schedules_);
        contSolver.initialize(network);
    }

    double t = config_.startTime;
    double dt = config_.timeStep;
    double nextOutput = config_.startTime;

    // Initial airflow solve
    auto airResult = airflowSolver.solve(network);

    // Record initial state
    if (hasContaminants) {
        ContaminantResult contResult = {t, contSolver.getConcentrations()};
        result.history.push_back({t, airResult, contResult});
    } else {
        result.history.push_back({t, airResult, {t, {}}});
    }
    nextOutput += config_.outputInterval;

    // Main time-stepping loop
    while (t < config_.endTime - 1e-10) {
        // Adjust last step to hit endTime exactly
        double currentDt = std::min(dt, config_.endTime - t);

        // Step 1: Solve airflow (quasi-steady at each timestep)
        // TODO: Update wind/weather boundary conditions from schedules here
        airResult = airflowSolver.solve(network);

        if (!airResult.converged) {
            // Airflow didn't converge - record and continue with smaller step
            // For now, just continue with current solution
        }

        // Step 2: Solve contaminant transport
        ContaminantResult contResult = {t + currentDt, {}};
        if (hasContaminants) {
            contResult = contSolver.step(network, t, currentDt);
        }

        t += currentDt;

        // Step 3: Record at output intervals
        if (t >= nextOutput - 1e-10 || t >= config_.endTime - 1e-10) {
            result.history.push_back({t, airResult, contResult});
            nextOutput += config_.outputInterval;
        }

        // Progress callback
        if (progressCb_) {
            if (!progressCb_(t, config_.endTime)) {
                return result; // User cancelled
            }
        }
    }

    result.completed = true;
    return result;
}

} // namespace contam
