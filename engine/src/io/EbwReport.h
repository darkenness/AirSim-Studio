#pragma once
#include "core/Occupant.h"
#include "core/Species.h"
#include "core/TransientSimulation.h"
#include <vector>
#include <string>

namespace contam {

// Per-occupant, per-species exposure summary
struct OccupantExposure {
    int occupantId;
    std::string occupantName;
    int speciesIndex;
    double cumulativeDose;      // kg (total inhaled mass)
    double peakConcentration;   // kg/m^3
    double timeAtPeak;          // s
    double totalExposureTime;   // s (time in non-zero concentration)
    double meanConcentration;   // kg/m^3 (time-weighted average)
    double breathingRate;       // m^3/s
};

// Zone location entry for occupant movement history
struct ZoneVisit {
    int occupantId;
    int zoneIndex;
    std::string zoneName;
    double enterTime;   // s
    double leaveTime;   // s
};

class EbwReport {
public:
    // Generate exposure summaries from occupant data after simulation
    static std::vector<OccupantExposure> compute(
        const std::vector<Occupant>& occupants,
        const std::vector<Species>& species);

    // Generate exposure summaries from transient result history
    // (recomputes from concentration time series if occupant exposure wasn't tracked inline)
    static std::vector<OccupantExposure> computeFromHistory(
        const std::vector<Occupant>& occupants,
        const std::vector<Species>& species,
        const TransientResult& result);

    // Extract zone visit history from transient result
    // (requires occupant zone index to change between steps)
    static std::vector<ZoneVisit> extractZoneHistory(
        const std::vector<Occupant>& occupants,
        const TransientResult& result,
        const std::vector<std::string>& zoneNames = {});

    static std::string formatText(
        const std::vector<OccupantExposure>& exposures,
        const std::vector<Species>& species,
        const std::vector<ZoneVisit>& zoneHistory = {});

    static std::string formatCsv(
        const std::vector<OccupantExposure>& exposures,
        const std::vector<Species>& species);
};

} // namespace contam
