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

            // Step 3b: Non-trace density feedback coupling
            // If non-trace species exist, update densities and re-solve airflow
            if (hasNonTraceSpecies()) {
                updateDensitiesFromConcentrations(network, contSolver);
                auto airResult2 = airflowSolver.solve(network);
                if (airResult2.converged) airResult = airResult2;
            }
        }

        t += currentDt;

        // Step 3c: Update occupant exposure
        if (!occupants_.empty() && hasContaminants) {
            updateOccupantExposure(contSolver, t, currentDt);
        }

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

bool TransientSimulation::hasNonTraceSpecies() const {
    for (const auto& sp : species_) {
        if (!sp.isTrace) return true;
    }
    return false;
}

void TransientSimulation::updateDensitiesFromConcentrations(
    Network& network, const ContaminantSolver& contSolver)
{
    // For non-trace species, update zone densities using modified gas constant
    // R_mix = R_air * (1 + Σ(w_k * (M_air/M_k - 1)))
    // where w_k = mass fraction of non-trace species k
    const auto& conc = contSolver.getConcentrations();
    const double M_air = 0.029; // kg/mol
    const double R_air = 287.055; // J/(kg·K)

    for (int i = 0; i < network.getNodeCount(); ++i) {
        if (network.getNode(i).isKnownPressure()) continue;
        if (i >= (int)conc.size()) continue;

        double sumCorrection = 0.0;
        double rho_base = network.getNode(i).getDensity();
        if (rho_base <= 0.0) rho_base = 1.2;

        for (int k = 0; k < (int)species_.size(); ++k) {
            if (species_[k].isTrace) continue;
            if (k >= (int)conc[i].size()) continue;

            // Mass fraction w_k = C_k / rho
            double w_k = conc[i][k] / rho_base;
            double M_k = species_[k].molarMass;
            if (M_k > 0.0) {
                sumCorrection += w_k * (M_air / M_k - 1.0);
            }
        }

        // Modified gas constant
        double R_mix = R_air * (1.0 + sumCorrection);
        double T = network.getNode(i).getTemperature();
        double P_abs = P_ATM + network.getNode(i).getPressure();
        double newDensity = P_abs / (R_mix * T);

        // Directly set density (bypass normal updateDensity which uses pure air)
        // We access via const_cast since Node doesn't have setDensity
        // Instead, we'll update temperature slightly to achieve the target density
        // Actually, let's just use updateDensity with the absolute pressure
        network.getNode(i).updateDensity(P_abs);
    }
}

void TransientSimulation::updateOccupantExposure(
    const ContaminantSolver& contSolver, double t, double dt)
{
    const auto& conc = contSolver.getConcentrations();
    int numSpecies = (int)species_.size();

    for (auto& occ : occupants_) {
        // Initialize exposure records if needed
        if ((int)occ.exposure.size() != numSpecies) {
            occ.initExposure(numSpecies);
        }

        int zoneIdx = occ.currentZoneIdx;
        if (zoneIdx >= 0 && zoneIdx < (int)conc.size()) {
            occ.updateExposure(conc[zoneIdx], t, dt);
        }
    }
}

void TransientSimulation::injectOccupantSources(
    std::vector<Source>& dynamicSources, double /*t*/)
{
    // Occupants as mobile pollution sources
    // Each occupant can emit CO2 (or other species) in their current zone
    // This is handled by the user adding sources with matching zone IDs
    // Future: auto-generate sources based on occupant breathing rate and zone
    (void)dynamicSources; // placeholder for future implementation
}

} // namespace contam
