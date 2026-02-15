#pragma once
#include "core/Network.h"
#include "core/Species.h"
#include "core/TransientSimulation.h"
#include <vector>
#include <string>
#include <sstream>
#include <iomanip>
#include <cmath>

namespace contam {

// Per-opening exfiltration detail for one species
struct CexOpeningResult {
    int linkId;
    int fromNodeIndex;
    int toNodeIndex;
    std::string fromNodeName;
    std::string toNodeName;
    double totalMassExfiltrated;  // kg over simulation duration
    double avgMassFlowRate;       // kg/s average
    double peakMassFlowRate;      // kg/s peak instantaneous
};

// Per-species exfiltration summary
struct CexSpeciesResult {
    int speciesId;
    std::string speciesName;
    double totalExfiltration;     // kg total across all openings
    std::vector<CexOpeningResult> openings;
};

class CexReport {
public:
    // Compute contaminant exfiltration from transient history.
    // For each exterior link with outward flow, mass = massFlow * concentration / density.
    // Integrates over all timesteps using trapezoidal rule.
    static std::vector<CexSpeciesResult> compute(
        const Network& net,
        const std::vector<Species>& species,
        const std::vector<TimeStepResult>& history);

    static std::string formatText(const std::vector<CexSpeciesResult>& results);
    static std::string formatCsv(const std::vector<CexSpeciesResult>& results);
};

} // namespace contam
