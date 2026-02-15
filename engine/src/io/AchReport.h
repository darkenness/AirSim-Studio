#pragma once
#include "core/Network.h"
#include <vector>
#include <string>
#include <sstream>
#include <iomanip>
#include <cmath>

namespace contam {

struct AchResult {
    int zoneId;
    std::string zoneName;
    double volume;           // m^3
    double totalAch;         // total air changes per hour
    double mechanicalAch;    // from AHS/fans
    double infiltrationAch;  // from leakage paths
    double naturalVentAch;   // from windows/doors
};

class AchReport {
public:
    static std::vector<AchResult> compute(
        const Network& net,
        const std::vector<double>& massFlows,
        double airDensity = 1.2);

    static std::string formatText(const std::vector<AchResult>& results);
    static std::string formatCsv(const std::vector<AchResult>& results);
};

} // namespace contam
