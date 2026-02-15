#pragma once
#include <string>
#include <vector>

namespace contam {

/// Per-opening, per-timestep wind pressure coefficient record
struct WpcRecord {
    double time;                        // seconds
    std::vector<double> pressures;      // one per opening (link index)
};

/// Per-opening, per-timestep ambient concentration record
struct WpcConcentration {
    double time;
    std::vector<std::vector<double>> concentrations; // [opening][species]
};

/// Wind Pressure Coefficient file reader
/// Imports spatially non-uniform external boundary conditions from CFD
class WpcReader {
public:
    /// Read WPC pressure file: columns = time, opening_0, opening_1, ...
    static std::vector<WpcRecord> readPressureFile(const std::string& filepath);
    static std::vector<WpcRecord> readPressureString(const std::string& content);

    /// Read WPC concentration file: columns = time, then (numSpecies) cols per opening
    static std::vector<WpcConcentration> readConcentrationFile(
        const std::string& filepath, int numOpenings, int numSpecies);
    static std::vector<WpcConcentration> readConcentrationString(
        const std::string& content, int numOpenings, int numSpecies);

    /// Interpolate pressure at time t for each opening
    static std::vector<double> interpolatePressure(
        const std::vector<WpcRecord>& records, double t);

    /// Interpolate concentration at time t
    static std::vector<std::vector<double>> interpolateConcentration(
        const std::vector<WpcConcentration>& records, double t);
};

} // namespace contam
