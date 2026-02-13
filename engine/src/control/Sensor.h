#pragma once

#include <string>

namespace contam {

// What the sensor measures
enum class SensorType {
    Concentration,  // kg/m³ of a specific species in a zone
    Pressure,       // Pa gauge pressure in a zone
    Temperature,    // K temperature in a zone
    MassFlow        // kg/s through a specific link
};

// Sensor: reads a value from the simulation state
struct Sensor {
    int id;
    std::string name;
    SensorType type;
    int targetId;       // zone node index (for Conc/Pressure/Temp) or link index (for MassFlow)
    int speciesIdx;     // only used when type == Concentration
    double lastReading; // most recent sensor value

    Sensor() : id(0), type(SensorType::Concentration), targetId(0), speciesIdx(0), lastReading(0.0) {}
    Sensor(int id, const std::string& name, SensorType type, int targetId, int speciesIdx = 0)
        : id(id), name(name), type(type), targetId(targetId), speciesIdx(speciesIdx), lastReading(0.0) {}
};

} // namespace contam
