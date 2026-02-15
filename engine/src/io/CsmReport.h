#pragma once
#include "core/Network.h"
#include "core/Species.h"
#include "core/TransientSimulation.h"
#include <vector>
#include <string>
#include <sstream>
#include <iomanip>
#include <cmath>
#include <algorithm>

namespace contam {

struct CsmZoneResult {
    int zoneId;
    std::string zoneName;
    double avgConcentration;   // time-averaged (kg/m^3)
    double peakConcentration;  // maximum over simulation
    double peakTime;           // time of peak (s)
    double totalEmission;      // total source emission (kg)
    double totalRemoval;       // total sink removal (kg)
    double totalFiltered;      // total filter capture (kg)
};

struct CsmSpeciesResult {
    int speciesId;
    std::string speciesName;
    std::vector<CsmZoneResult> zones;
    double totalBuildingEmission;
    double totalBuildingRemoval;
    double totalExfiltration;
};

class CsmReport {
public:
    // Compute from transient history
    static std::vector<CsmSpeciesResult> compute(
        const Network& net,
        const std::vector<Species>& species,
        const std::vector<TimeStepResult>& history);

    static std::string formatText(const std::vector<CsmSpeciesResult>& results);
    static std::string formatCsv(const std::vector<CsmSpeciesResult>& results);
};

} // namespace contam
