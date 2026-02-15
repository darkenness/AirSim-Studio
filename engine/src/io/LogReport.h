#pragma once
#include "control/Sensor.h"
#include "control/Controller.h"
#include "control/Actuator.h"
#include "control/LogicNodes.h"
#include <vector>
#include <string>
#include <sstream>
#include <iomanip>

namespace contam {

// Snapshot of all control node values at a single time step
struct LogSnapshot {
    double time;
    std::vector<double> sensorValues;      // one per sensor
    std::vector<double> controllerOutputs; // one per controller
    std::vector<double> controllerErrors;  // current error per controller
    std::vector<double> actuatorValues;    // one per actuator
    std::vector<double> logicNodeValues;   // one per logic node
};

// Metadata for building column headers
struct LogColumnInfo {
    std::vector<std::string> sensorNames;
    std::vector<SensorType>  sensorTypes;
    std::vector<std::string> controllerNames;
    std::vector<std::string> actuatorNames;
    std::vector<ActuatorType> actuatorTypes;
    std::vector<std::string> logicNodeNames;
};

// Control node logging report (.LOG)
// Records sensor readings, controller outputs, actuator positions,
// and logic node intermediate values at each time step.
class LogReport {
public:
    // Record a snapshot from current control system state
    static LogSnapshot capture(
        double time,
        const std::vector<Sensor>& sensors,
        const std::vector<Controller>& controllers,
        const std::vector<Actuator>& actuators,
        const std::vector<double>& logicNodeValues = {});

    // Build column metadata from control components
    static LogColumnInfo buildColumnInfo(
        const std::vector<Sensor>& sensors,
        const std::vector<Controller>& controllers,
        const std::vector<Actuator>& actuators,
        const std::vector<std::string>& logicNodeNames = {});

    // Format full log as aligned text table
    static std::string formatText(
        const std::vector<LogSnapshot>& snapshots,
        const LogColumnInfo& columns);

    // Format full log as CSV
    static std::string formatCsv(
        const std::vector<LogSnapshot>& snapshots,
        const LogColumnInfo& columns);

    // Helper: sensor type to short string
    static std::string sensorTypeStr(SensorType t);

    // Helper: actuator type to short string
    static std::string actuatorTypeStr(ActuatorType t);
};

} // namespace contam
