#include "TransientSimulation.h"
#include "elements/Damper.h"
#include "elements/Fan.h"
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

        // Step 1: Update control system (read sensors -> run controllers -> apply actuators)
        if (!controllers_.empty()) {
            updateSensors(network, contSolver);
            updateControllers(currentDt);
            applyActuators(network);
        }

        // Step 2: Solve airflow (quasi-steady at each timestep)
        airResult = airflowSolver.solve(network);

        if (!airResult.converged) {
            // Airflow didn't converge - continue with current solution
        }

        // Step 3: Solve contaminant transport
        ContaminantResult contResult = {t + currentDt, {}};
        if (hasContaminants) {
            contResult = contSolver.step(network, t, currentDt);
        }

        t += currentDt;

        // Step 4: Record at output intervals
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

void TransientSimulation::updateSensors(const Network& network, const ContaminantSolver& contSolver) {
    const auto& conc = contSolver.getConcentrations();
    for (auto& sensor : sensors_) {
        switch (sensor.type) {
            case SensorType::Concentration:
                if (sensor.targetId >= 0 && sensor.targetId < (int)conc.size() &&
                    sensor.speciesIdx >= 0 && sensor.speciesIdx < (int)conc[sensor.targetId].size()) {
                    sensor.lastReading = conc[sensor.targetId][sensor.speciesIdx];
                }
                break;
            case SensorType::Pressure:
                if (sensor.targetId >= 0 && sensor.targetId < network.getNodeCount()) {
                    sensor.lastReading = network.getNode(sensor.targetId).getPressure();
                }
                break;
            case SensorType::Temperature:
                if (sensor.targetId >= 0 && sensor.targetId < network.getNodeCount()) {
                    sensor.lastReading = network.getNode(sensor.targetId).getTemperature();
                }
                break;
            case SensorType::MassFlow:
                if (sensor.targetId >= 0 && sensor.targetId < network.getLinkCount()) {
                    sensor.lastReading = network.getLink(sensor.targetId).getMassFlow();
                }
                break;
        }
    }
}

void TransientSimulation::updateControllers(double dt) {
    for (auto& ctrl : controllers_) {
        // Find the sensor for this controller
        for (const auto& sensor : sensors_) {
            if (sensor.id == ctrl.sensorId) {
                ctrl.update(sensor.lastReading, dt);
                break;
            }
        }
    }
}

void TransientSimulation::applyActuators(Network& network) {
    for (auto& act : actuators_) {
        // Find the controller output for this actuator
        double ctrlOutput = 0.0;
        for (const auto& ctrl : controllers_) {
            if (ctrl.actuatorId == act.id) {
                ctrlOutput = ctrl.output;
                break;
            }
        }
        act.currentValue = ctrlOutput;

        // Apply to the flow element
        if (act.linkIdx >= 0 && act.linkIdx < network.getLinkCount()) {
            auto& link = network.getLink(act.linkIdx);
            const FlowElement* elem = link.getFlowElement();
            if (!elem) continue;

            if (act.type == ActuatorType::DamperFraction) {
                // Clone, modify, and replace
                if (elem->typeName() == "Damper") {
                    auto cloned = elem->clone();
                    static_cast<Damper*>(cloned.get())->setFraction(ctrlOutput);
                    link.setFlowElement(std::move(cloned));
                }
            }
            // FanSpeed and FilterBypass can be added similarly
        }
    }
}

} // namespace contam
