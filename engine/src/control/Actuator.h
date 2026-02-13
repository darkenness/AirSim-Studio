#pragma once

#include <string>

namespace contam {

// What the actuator controls
enum class ActuatorType {
    DamperFraction,   // Controls a Damper element's opening fraction (0-1)
    FanSpeed,         // Controls a Fan element's speed multiplier (0-1)
    FilterBypass      // Controls filter bypass fraction (0 = full filter, 1 = full bypass)
};

// Actuator: applies controller output to a flow element
struct Actuator {
    int id;
    std::string name;
    ActuatorType type;
    int linkIdx;        // which link's flow element to control
    double currentValue; // current actuator position (0-1)

    Actuator() : id(0), type(ActuatorType::DamperFraction), linkIdx(0), currentValue(0.0) {}
    Actuator(int id, const std::string& name, ActuatorType type, int linkIdx)
        : id(id), name(name), type(type), linkIdx(linkIdx), currentValue(0.0) {}
};

} // namespace contam
