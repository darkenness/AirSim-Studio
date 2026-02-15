#include "io/LogReport.h"

namespace contam {

LogSnapshot LogReport::capture(
    double time,
    const std::vector<Sensor>& sensors,
    const std::vector<Controller>& controllers,
    const std::vector<Actuator>& actuators,
    const std::vector<double>& logicNodeValues)
{
    LogSnapshot snap;
    snap.time = time;

    snap.sensorValues.reserve(sensors.size());
    for (const auto& s : sensors) {
        snap.sensorValues.push_back(s.lastReading);
    }

    snap.controllerOutputs.reserve(controllers.size());
    snap.controllerErrors.reserve(controllers.size());
    for (const auto& c : controllers) {
        snap.controllerOutputs.push_back(c.output);
        snap.controllerErrors.push_back(c.prevError);
    }

    snap.actuatorValues.reserve(actuators.size());
    for (const auto& a : actuators) {
        snap.actuatorValues.push_back(a.currentValue);
    }

    snap.logicNodeValues = logicNodeValues;

    return snap;
}

LogColumnInfo LogReport::buildColumnInfo(
    const std::vector<Sensor>& sensors,
    const std::vector<Controller>& controllers,
    const std::vector<Actuator>& actuators,
    const std::vector<std::string>& logicNodeNames)
{
    LogColumnInfo info;

    info.sensorNames.reserve(sensors.size());
    info.sensorTypes.reserve(sensors.size());
    for (const auto& s : sensors) {
        info.sensorNames.push_back(s.name);
        info.sensorTypes.push_back(s.type);
    }

    info.controllerNames.reserve(controllers.size());
    for (const auto& c : controllers) {
        info.controllerNames.push_back(c.name);
    }

    info.actuatorNames.reserve(actuators.size());
    info.actuatorTypes.reserve(actuators.size());
    for (const auto& a : actuators) {
        info.actuatorNames.push_back(a.name);
        info.actuatorTypes.push_back(a.type);
    }

    info.logicNodeNames = logicNodeNames;

    return info;
}

std::string LogReport::sensorTypeStr(SensorType t) {
    switch (t) {
        case SensorType::Concentration: return "Conc";
        case SensorType::Pressure:      return "Press";
        case SensorType::Temperature:   return "Temp";
        case SensorType::MassFlow:      return "Flow";
    }
    return "?";
}

std::string LogReport::actuatorTypeStr(ActuatorType t) {
    switch (t) {
        case ActuatorType::DamperFraction: return "Damper";
        case ActuatorType::FanSpeed:       return "Fan";
        case ActuatorType::FilterBypass:   return "Filter";
    }
    return "?";
}

std::string LogReport::formatText(
    const std::vector<LogSnapshot>& snapshots,
    const LogColumnInfo& columns)
{
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(6);
    oss << "=== Control Node Log Report ===\n\n";

    // Build column headers
    const int colW = 14;
    oss << std::right << std::setw(12) << "Time(s)";

    for (size_t i = 0; i < columns.sensorNames.size(); ++i) {
        std::string hdr = columns.sensorNames[i] + "(" + sensorTypeStr(columns.sensorTypes[i]) + ")";
        oss << std::setw(colW) << hdr;
    }
    for (size_t i = 0; i < columns.controllerNames.size(); ++i) {
        oss << std::setw(colW) << (columns.controllerNames[i] + "_out");
        oss << std::setw(colW) << (columns.controllerNames[i] + "_err");
    }
    for (size_t i = 0; i < columns.actuatorNames.size(); ++i) {
        std::string hdr = columns.actuatorNames[i] + "(" + actuatorTypeStr(columns.actuatorTypes[i]) + ")";
        oss << std::setw(colW) << hdr;
    }
    for (size_t i = 0; i < columns.logicNodeNames.size(); ++i) {
        oss << std::setw(colW) << columns.logicNodeNames[i];
    }
    oss << "\n";

    // Separator line
    int totalCols = 1
        + static_cast<int>(columns.sensorNames.size())
        + static_cast<int>(columns.controllerNames.size()) * 2
        + static_cast<int>(columns.actuatorNames.size())
        + static_cast<int>(columns.logicNodeNames.size());
    oss << std::string(12 + (totalCols - 1) * colW, '-') << "\n";

    // Data rows
    for (const auto& snap : snapshots) {
        oss << std::setw(12) << snap.time;

        for (size_t i = 0; i < snap.sensorValues.size(); ++i) {
            oss << std::setw(colW) << snap.sensorValues[i];
        }
        for (size_t i = 0; i < snap.controllerOutputs.size(); ++i) {
            oss << std::setw(colW) << snap.controllerOutputs[i];
            oss << std::setw(colW) << snap.controllerErrors[i];
        }
        for (size_t i = 0; i < snap.actuatorValues.size(); ++i) {
            oss << std::setw(colW) << snap.actuatorValues[i];
        }
        for (size_t i = 0; i < snap.logicNodeValues.size(); ++i) {
            oss << std::setw(colW) << snap.logicNodeValues[i];
        }
        oss << "\n";
    }

    return oss.str();
}

std::string LogReport::formatCsv(
    const std::vector<LogSnapshot>& snapshots,
    const LogColumnInfo& columns)
{
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(8);

    // Header row
    oss << "Time_s";
    for (size_t i = 0; i < columns.sensorNames.size(); ++i) {
        oss << "," << columns.sensorNames[i] << "_" << sensorTypeStr(columns.sensorTypes[i]);
    }
    for (size_t i = 0; i < columns.controllerNames.size(); ++i) {
        oss << "," << columns.controllerNames[i] << "_output";
        oss << "," << columns.controllerNames[i] << "_error";
    }
    for (size_t i = 0; i < columns.actuatorNames.size(); ++i) {
        oss << "," << columns.actuatorNames[i] << "_" << actuatorTypeStr(columns.actuatorTypes[i]);
    }
    for (size_t i = 0; i < columns.logicNodeNames.size(); ++i) {
        oss << "," << columns.logicNodeNames[i];
    }
    oss << "\n";

    // Data rows
    for (const auto& snap : snapshots) {
        oss << snap.time;

        for (size_t i = 0; i < snap.sensorValues.size(); ++i) {
            oss << "," << snap.sensorValues[i];
        }
        for (size_t i = 0; i < snap.controllerOutputs.size(); ++i) {
            oss << "," << snap.controllerOutputs[i];
            oss << "," << snap.controllerErrors[i];
        }
        for (size_t i = 0; i < snap.actuatorValues.size(); ++i) {
            oss << "," << snap.actuatorValues[i];
        }
        for (size_t i = 0; i < snap.logicNodeValues.size(); ++i) {
            oss << "," << snap.logicNodeValues[i];
        }
        oss << "\n";
    }

    return oss.str();
}

} // namespace contam
