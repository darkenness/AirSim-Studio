#pragma once

#include <string>
#include <vector>
#include "utils/Constants.h"

namespace contam {

enum class NodeType {
    Normal,     // Standard room node
    Phantom,    // Special connection node (no volume)
    Ambient,    // Outdoor environment (known pressure boundary)
    CFD         // Coupled with CFD solver (future)
};

class Node {
public:
    Node() = default;
    Node(int id, const std::string& name, NodeType type = NodeType::Normal);

    // Accessors
    int getId() const { return id_; }
    const std::string& getName() const { return name_; }
    NodeType getType() const { return type_; }

    double getPressure() const { return pressure_; }
    void setPressure(double p) { pressure_ = p; }

    double getTemperature() const { return temperature_; }
    void setTemperature(double t) { temperature_ = t; }

    double getElevation() const { return elevation_; }
    void setElevation(double z) { elevation_ = z; }

    double getVolume() const { return volume_; }
    void setVolume(double v) { volume_ = v; }

    double getDensity() const { return density_; }
    void updateDensity();
    void updateDensity(double absolutePressure);

    bool isKnownPressure() const { return type_ == NodeType::Ambient; }

    // Wind pressure support (for ambient/exterior nodes)
    // Pw = 0.5 * ρ * Cp * V_wind²
    double getWindPressureCoeff() const { return windCp_; }
    void setWindPressureCoeff(double cp) { windCp_ = cp; }
    double getWindPressure(double windSpeed) const {
        return 0.5 * density_ * windCp_ * windSpeed * windSpeed;
    }

private:
    int id_ = 0;
    std::string name_;
    NodeType type_ = NodeType::Normal;

    double pressure_ = 0.0;       // Pa (gauge, relative to atmospheric)
    double temperature_ = T_REF;  // K
    double elevation_ = 0.0;      // m (base elevation of zone)
    double volume_ = 0.0;         // m^3
    double density_ = 0.0;        // kg/m^3 (computed from ideal gas law)
    double windCp_ = 0.0;          // wind pressure coefficient (dimensionless)
};

} // namespace contam
