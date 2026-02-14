#pragma once

#include <string>
#include <vector>
#include <utility>
#include <algorithm>
#include <cmath>
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
    void setDensity(double rho) { density_ = rho; }
    void updateDensity();
    void updateDensity(double absolutePressure);

    bool isKnownPressure() const { return type_ == NodeType::Ambient; }

    // Wind pressure support (for ambient/exterior nodes)
    // Pw = 0.5 * ρ * Ch * Cp(θ) * V_met²
    // θ = windDirection - wallAzimuth (angle between wind and wall normal)

    // Scalar Cp (backward compatible, sets uniform Cp for all angles)
    void setWindPressureCoeff(double cp) { windCp_ = cp; cpProfile_.clear(); }
    double getWindPressureCoeff() const { return windCp_; }

    // Cp(θ) profile: list of (angle_degrees, Cp) pairs, 0°=normal to wall
    void setWindPressureProfile(const std::vector<std::pair<double, double>>& profile) {
        cpProfile_ = profile;
        std::sort(cpProfile_.begin(), cpProfile_.end());
    }

    // Wall azimuth angle (degrees from north, clockwise)
    void setWallAzimuth(double azimuth) { wallAzimuth_ = azimuth; }
    double getWallAzimuth() const { return wallAzimuth_; }

    // Terrain height correction factor Ch (default 1.0)
    // Ch accounts for terrain roughness and building height
    void setTerrainFactor(double ch) { terrainCh_ = ch; }
    double getTerrainFactor() const { return terrainCh_; }

    // Get Cp at given wind direction (degrees from north)
    double getCpAtWindDirection(double windDir) const {
        if (cpProfile_.empty()) return windCp_;
        // θ = wind direction relative to wall normal
        double theta = windDir - wallAzimuth_;
        // Normalize to [0, 360)
        while (theta < 0.0) theta += 360.0;
        while (theta >= 360.0) theta -= 360.0;
        // Linear interpolation in the profile
        if (cpProfile_.size() == 1) return cpProfile_[0].second;
        // Find bracketing entries
        for (size_t i = 0; i < cpProfile_.size() - 1; ++i) {
            if (theta >= cpProfile_[i].first && theta <= cpProfile_[i + 1].first) {
                double dt = cpProfile_[i + 1].first - cpProfile_[i].first;
                if (dt < 1e-10) return cpProfile_[i].second;
                double alpha = (theta - cpProfile_[i].first) / dt;
                return cpProfile_[i].second * (1.0 - alpha) + cpProfile_[i + 1].second * alpha;
            }
        }
        return cpProfile_.back().second;
    }

    // Full wind pressure: Pw = 0.5 * ρ * Ch * Cp(θ) * V²
    double getWindPressure(double windSpeed, double windDirection) const {
        double cp = getCpAtWindDirection(windDirection);
        return 0.5 * density_ * terrainCh_ * cp * windSpeed * windSpeed;
    }
    // Backward compatible overload (uses scalar Cp, no terrain correction)
    double getWindPressure(double windSpeed) const {
        return 0.5 * density_ * terrainCh_ * windCp_ * windSpeed * windSpeed;
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
    double windCp_ = 0.0;          // scalar wind pressure coefficient (dimensionless)
    std::vector<std::pair<double, double>> cpProfile_;  // Cp(θ) profile: (angle°, Cp)
    double wallAzimuth_ = 0.0;     // wall normal azimuth (degrees from north)
    double terrainCh_ = 1.0;       // terrain height correction factor
};

} // namespace contam
