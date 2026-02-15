#include "TransientSimulation.h"
#include "elements/Damper.h"
#include "elements/Fan.h"
#include <cmath>

namespace contam {

TransientResult TransientSimulation::run(Network& network) {
    TransientResult result;
    result.completed = false;

    // Merge external schedules (CVF/DVF) into main schedule map
    for (const auto& [id, sched] : externalSchedules_) {
        schedules_[id] = sched;
    }

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

        // Step 0: Update zone temperatures from schedules
        if (!zoneTempSchedules_.empty()) {
            updateZoneTemperatures(network, t + currentDt);
        }

        // Step 0b: Update weather-driven boundary conditions
        if (!weatherData_.empty()) {
            updateWeatherConditions(network, t + currentDt);
        }

        // Step 0c: Update WPC per-opening wind pressures
        if (!wpcPressures_.empty()) {
            updateWpcConditions(network, t + currentDt);
        }

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
            // Step 2b: Apply AHS flows to contaminant solver
            if (!ahSystems_.empty()) {
                applyAHSFlows(network, contSolver, t + currentDt);
            }

            // Step 2c: Inject occupant CO2 sources
            if (!occupants_.empty()) {
                std::vector<Source> occSources;
                injectOccupantSources(occSources, t + currentDt);
                if (!occSources.empty()) {
                    contSolver.addExtraSources(occSources);
                }
            }

            contResult = contSolver.step(network, t, currentDt);

            // Step 3b: Non-trace density feedback coupling
            // If non-trace species exist, iterate density-airflow until convergence
            if (hasNonTraceSpecies()) {
                constexpr int MAX_COUPLING_ITER = 5;
                constexpr double DENSITY_TOL = 1e-4; // relative tolerance

                for (int iter = 0; iter < MAX_COUPLING_ITER; ++iter) {
                    // Save current densities
                    std::vector<double> prevDensities(network.getNodeCount());
                    for (int i = 0; i < network.getNodeCount(); ++i) {
                        prevDensities[i] = network.getNode(i).getDensity();
                    }

                    // Update densities from concentrations
                    updateDensitiesFromConcentrations(network, contSolver);

                    // Check convergence
                    double maxRelChange = 0.0;
                    for (int i = 0; i < network.getNodeCount(); ++i) {
                        if (network.getNode(i).isKnownPressure()) continue;
                        double rhoOld = prevDensities[i];
                        double rhoNew = network.getNode(i).getDensity();
                        if (rhoOld > 0.0) {
                            double relChange = std::abs(rhoNew - rhoOld) / rhoOld;
                            maxRelChange = std::max(maxRelChange, relChange);
                        }
                    }

                    // Re-solve airflow with updated densities
                    auto airResult2 = airflowSolver.solve(network);
                    if (airResult2.converged) airResult = airResult2;

                    if (maxRelChange < DENSITY_TOL) break;
                }
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

        // Modified gas constant for non-trace species mixture
        double R_mix = R_air * (1.0 + sumCorrection);
        double T = network.getNode(i).getTemperature();
        double P_abs = P_ATM + network.getNode(i).getPressure();
        double newDensity = P_abs / (R_mix * T);

        // Directly set corrected density (bypass updateDensity which uses pure-air R_AIR)
        network.getNode(i).setDensity(newDensity);
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

        // Zone movement via schedule: schedule returns zone index as integer
        if (occ.scheduleId >= 0) {
            auto it = schedules_.find(occ.scheduleId);
            if (it != schedules_.end()) {
                int newZone = static_cast<int>(std::round(it->second.getValue(t)));
                if (newZone >= 0 && newZone < (int)conc.size()) {
                    occ.currentZoneIdx = newZone;
                }
            }
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
    // Generate CO2 sources from occupants based on breathing rate
    // Standard CO2 generation: breathingRate * CO2_fraction_exhaled
    // Typical exhaled CO2 fraction ~0.04 (4%)
    constexpr double CO2_EXHALED_FRACTION = 0.04;
    constexpr double AIR_DENSITY = 1.2; // kg/m³ approximate

    // Find CO2 species index (by name or molar mass ~0.044 kg/mol)
    int co2Idx = -1;
    for (int k = 0; k < (int)species_.size(); ++k) {
        if (species_[k].name == "CO2" || species_[k].name == "co2" ||
            (std::abs(species_[k].molarMass - 0.044) < 0.001)) {
            co2Idx = k;
            break;
        }
    }
    if (co2Idx < 0) return; // No CO2 species defined

    for (const auto& occ : occupants_) {
        if (occ.currentZoneIdx < 0) continue;

        Source src;
        src.zoneId = occ.currentZoneIdx;
        src.speciesId = co2Idx;
        src.type = SourceType::Constant;
        // Generation rate: breathingRate (m³/s) * airDensity (kg/m³) * CO2 fraction
        src.generationRate = occ.breathingRate * AIR_DENSITY * CO2_EXHALED_FRACTION;
        src.removalRate = 0.0;
        src.scheduleId = -1;
        dynamicSources.push_back(src);
    }
}

void TransientSimulation::updateWeatherConditions(Network& network, double t) {
    WeatherRecord wx = WeatherReader::interpolate(weatherData_, t);

    // Update network ambient conditions
    network.setWindSpeed(wx.windSpeed);
    network.setWindDirection(wx.windDirection);
    network.setAmbientTemperature(wx.temperature);
    network.setAmbientPressure(wx.pressure);

    // Update ambient nodes: temperature, density, and wind pressures
    for (int i = 0; i < network.getNodeCount(); ++i) {
        auto& node = network.getNode(i);
        if (!node.isKnownPressure()) continue; // only ambient nodes

        node.setTemperature(wx.temperature);
        node.updateDensity();
    }
}

void TransientSimulation::applyAHSFlows(Network& network, ContaminantSolver& contSolver, double t) {
    // For each AHS, inject supply/return mass flows as additional sources/sinks
    // in the contaminant transport equation.
    // Supply air = mix of outdoor air + recirculated return air
    // This modifies the effective source terms for each connected zone.

    const auto& conc = contSolver.getConcentrations();
    int numSpecies = (int)species_.size();

    for (const auto& ahs : ahSystems_) {
        // Get schedule-modulated flow rates
        double supplyQ = ahs.supplyFlow;
        if (ahs.supplyFlowScheduleId >= 0) {
            auto it = schedules_.find(ahs.supplyFlowScheduleId);
            if (it != schedules_.end()) {
                supplyQ *= it->second.getValue(t);
            }
        }

        double oaFraction = ahs.getOutdoorAirFraction();
        if (ahs.outdoorAirScheduleId >= 0) {
            auto it = schedules_.find(ahs.outdoorAirScheduleId);
            if (it != schedules_.end()) {
                oaFraction = it->second.getValue(t);
            }
        }

        // Compute mixed return air concentration (weighted average of return zones)
        std::vector<double> returnConc(numSpecies, 0.0);
        double totalReturnFrac = 0.0;
        for (const auto& rz : ahs.returnZones) {
            int zIdx = rz.zoneId;
            if (zIdx >= 0 && zIdx < (int)conc.size()) {
                for (int k = 0; k < numSpecies && k < (int)conc[zIdx].size(); ++k) {
                    returnConc[k] += rz.fraction * conc[zIdx][k];
                }
                totalReturnFrac += rz.fraction;
            }
        }
        if (totalReturnFrac > 0.0) {
            for (int k = 0; k < numSpecies; ++k) {
                returnConc[k] /= totalReturnFrac;
            }
        }

        // Supply air concentration = OA_fraction * outdoor + (1 - OA_fraction) * return
        std::vector<double> supplyConc(numSpecies, 0.0);
        for (int k = 0; k < numSpecies; ++k) {
            double outdoorC = species_[k].outdoorConc;
            supplyConc[k] = oaFraction * outdoorC + (1.0 - oaFraction) * returnConc[k];
        }

        // Inject supply air as additional sources into supply zones
        // Each supply zone gets: supplyQ * fraction * density * supplyConc[k]
        // and loses: returnQ * fraction * density * zoneConc[k] (via return)
        // These are handled as extra source terms added to the contaminant solver
        double rho = 1.2; // approximate air density for volume→mass conversion

        std::vector<Source> ahsSources;
        for (const auto& sz : ahs.supplyZones) {
            int zIdx = sz.zoneId;
            if (zIdx < 0) continue;

            for (int k = 0; k < numSpecies; ++k) {
                Source src;
                src.zoneId = zIdx;
                src.speciesId = k;
                src.type = SourceType::Constant;
                // Supply injects contaminant: Q_supply * frac * rho * C_supply
                src.generationRate = supplyQ * sz.fraction * rho * supplyConc[k];
                // Return removes contaminant proportional to zone concentration
                // This is modeled as a removal rate coefficient: Q_return * frac * rho / V
                // But since the solver already handles outflow, we only add the supply injection
                src.removalRate = 0.0;
                src.scheduleId = -1;

                if (src.generationRate > 0.0) {
                    ahsSources.push_back(src);
                }
            }
        }

        // Add AHS sources to the solver for this timestep
        if (!ahsSources.empty()) {
            contSolver.addExtraSources(ahsSources);
        }
    }
}

void TransientSimulation::updateZoneTemperatures(Network& network, double t) {
    for (const auto& [nodeIdx, schedId] : zoneTempSchedules_) {
        if (nodeIdx < 0 || nodeIdx >= network.getNodeCount()) continue;
        auto it = schedules_.find(schedId);
        if (it == schedules_.end()) continue;

        double newTemp = it->second.getValue(t);
        // Schedule value is in Kelvin (must be > 0)
        if (newTemp > 0.0) {
            network.getNode(nodeIdx).setTemperature(newTemp);
        }
    }
}

void TransientSimulation::updateWpcConditions(Network& network, double t) {
    // Apply per-opening wind pressure from WPC data
    auto pressures = WpcReader::interpolatePressure(wpcPressures_, t);

    for (size_t i = 0; i < wpcLinkIndices_.size() && i < pressures.size(); ++i) {
        int linkIdx = wpcLinkIndices_[i];
        if (linkIdx < 0 || linkIdx >= network.getLinkCount()) continue;

        auto& link = network.getLink(linkIdx);
        // The WPC pressure is applied as an external pressure offset on the
        // ambient node side of this opening. Find the ambient node and set
        // its pressure to the WPC value.
        int fromIdx = link.getNodeFrom();
        int toIdx = link.getNodeTo();
        if (fromIdx >= 0 && fromIdx < network.getNodeCount() &&
            network.getNode(fromIdx).isKnownPressure()) {
            network.getNode(fromIdx).setPressure(pressures[i]);
        } else if (toIdx >= 0 && toIdx < network.getNodeCount() &&
                   network.getNode(toIdx).isKnownPressure()) {
            network.getNode(toIdx).setPressure(pressures[i]);
        }
    }
}

} // namespace contam
