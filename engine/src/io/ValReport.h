#pragma once
#include "core/Network.h"
#include <vector>
#include <string>
#include <sstream>
#include <iomanip>
#include <cmath>

namespace contam {

struct ValLinkResult {
    int linkId;
    int nodeFromId;
    int nodeToId;
    std::string elementType;
    double massFlow;       // kg/s at target dP
    double volumeFlow;     // m^3/s at target dP
};

struct ValResult {
    double targetDeltaP;       // Pa (test pressure differential)
    double airDensity;         // kg/m^3
    double totalLeakageMass;   // kg/s (sum of all exterior link flows)
    double totalLeakageVol;    // m^3/s
    double totalLeakageVolH;   // m^3/h
    double equivalentLeakageArea; // m^2 (ELA)
    std::vector<ValLinkResult> linkBreakdown;
};

class ValReport {
public:
    // Cd = discharge coefficient for ELA calculation (standard: 0.611)
    static constexpr double DEFAULT_CD = 0.611;
    static constexpr double DEFAULT_TARGET_DP = 50.0; // Pa

    /// Generate building pressurization test report.
    /// Iterates all exterior links (one node is Ambient), computes flow
    /// at the given target pressure differential using each link's FlowElement.
    static ValResult generate(
        const Network& net,
        double targetDeltaP = DEFAULT_TARGET_DP,
        double airDensity = 1.2);

    static std::string formatText(const ValResult& result);
    static std::string formatCsv(const ValResult& result);
};

} // namespace contam
