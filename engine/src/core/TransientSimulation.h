#pragma once
#include "Network.h"
#include "Solver.h"
#include "ContaminantSolver.h"
#include "Species.h"
#include "Schedule.h"
#include "control/Sensor.h"
#include "control/Controller.h"
#include "control/Actuator.h"
#include "Occupant.h"
#include "SimpleAHS.h"
#include "io/WeatherReader.h"
#include <vector>
#include <map>
#include <functional>

namespace contam {

struct TransientConfig {
    double startTime = 0.0;      // s
    double endTime = 3600.0;     // s (1 hour default)
    double timeStep = 60.0;      // s
    double outputInterval = 60.0; // s (how often to record results)
    SolverMethod airflowMethod = SolverMethod::TrustRegion;
};

struct TimeStepResult {
    double time;
    SolverResult airflow;
    ContaminantResult contaminant;
};

struct TransientResult {
    bool completed;
    std::vector<TimeStepResult> history;
};

// Main transient simulation loop:
//   For each timestep:
//     1. Update schedules / boundary conditions
//     2. Solve airflow (Newton-Raphson)
//     3. Solve contaminant transport (implicit Euler)
//     4. Record results at output intervals
class TransientSimulation {
public:
    TransientSimulation() = default;

    void setConfig(const TransientConfig& config) { config_ = config; }
    void setSpecies(const std::vector<Species>& species) { species_ = species; }
    void setSources(const std::vector<Source>& sources) { sources_ = sources; }
    void setSchedules(const std::map<int, Schedule>& schedules) { schedules_ = schedules; }

    // Control system
    void setSensors(const std::vector<Sensor>& sensors) { sensors_ = sensors; }
    void setControllers(const std::vector<Controller>& controllers) { controllers_ = controllers; }
    void setActuators(const std::vector<Actuator>& actuators) { actuators_ = actuators; }

    // Zone temperature schedules: maps node index -> schedule ID
    void setZoneTemperatureSchedules(const std::map<int, int>& zoneToSchedule) {
        zoneTempSchedules_ = zoneToSchedule;
    }

    // Occupants (exposure tracking + mobile pollution sources)
    void setOccupants(const std::vector<Occupant>& occupants) { occupants_ = occupants; }

    // Weather data (time-varying outdoor conditions)
    void setWeatherData(const std::vector<WeatherRecord>& weather) { weatherData_ = weather; }

    // Simple AHS (HVAC systems)
    void setAHSystems(const std::vector<SimpleAHS>& systems) { ahSystems_ = systems; }

    // Optional progress callback: (currentTime, endTime) -> bool (return false to cancel)
    using ProgressCallback = std::function<bool(double, double)>;
    void setProgressCallback(ProgressCallback cb) { progressCb_ = cb; }

    // Run the full transient simulation
    TransientResult run(Network& network);

private:
    TransientConfig config_;
    std::vector<Species> species_;
    std::vector<Source> sources_;
    std::map<int, Schedule> schedules_;
    std::vector<Sensor> sensors_;
    std::vector<Controller> controllers_;
    std::vector<Actuator> actuators_;
    std::vector<Occupant> occupants_;
    std::map<int, int> zoneTempSchedules_;  // nodeIdx -> scheduleId
    std::vector<WeatherRecord> weatherData_;
    std::vector<SimpleAHS> ahSystems_;
    ProgressCallback progressCb_;

    // Control system helpers
    void updateSensors(const Network& network, const ContaminantSolver& contSolver);
    void updateControllers(double dt);
    void applyActuators(Network& network);

    // Non-trace density feedback: update zone densities based on non-trace species concentrations
    bool hasNonTraceSpecies() const;
    void updateDensitiesFromConcentrations(Network& network, const ContaminantSolver& contSolver);

    // Zone temperature schedule update
    void updateZoneTemperatures(Network& network, double t);

    // Weather-driven boundary condition update
    void updateWeatherConditions(Network& network, double t);

    // AHS flow injection
    void applyAHSFlows(Network& network, ContaminantSolver& contSolver, double t);

    // Occupant exposure + mobile source injection
    void updateOccupantExposure(const ContaminantSolver& contSolver, double t, double dt);
    void injectOccupantSources(std::vector<Source>& dynamicSources, double t);
};

} // namespace contam
