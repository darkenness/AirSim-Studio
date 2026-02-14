#pragma once

#include <string>
#include <vector>
#include <memory>

namespace contam {

// Simple Air Handling System (AHS)
// Models a basic HVAC system with supply, return, outdoor air, and exhaust paths
// Each AHS connects to zones via supply diffusers and return grilles
// The system maintains mass balance: supply = return = outdoor + recirculated
class SimpleAHS {
public:
    int id;
    std::string name;

    // Design flow rates (m³/s)
    double supplyFlow;        // total supply air flow
    double returnFlow;        // total return air flow
    double outdoorAirFlow;    // minimum outdoor air flow
    double exhaustFlow;       // exhaust air flow

    // Supply air temperature (K) — can be overridden by schedule
    double supplyTemperature;

    // Connected zone IDs
    struct ZoneConnection {
        int zoneId;
        double fraction;  // fraction of total supply/return going to this zone
    };
    std::vector<ZoneConnection> supplyZones;
    std::vector<ZoneConnection> returnZones;

    // Outdoor air fraction schedule ID (-1 = constant)
    int outdoorAirScheduleId;
    // Supply flow schedule ID (-1 = constant)
    int supplyFlowScheduleId;

    SimpleAHS()
        : id(-1), supplyFlow(0.1), returnFlow(0.1),
          outdoorAirFlow(0.02), exhaustFlow(0.02),
          supplyTemperature(295.15),
          outdoorAirScheduleId(-1), supplyFlowScheduleId(-1) {}

    SimpleAHS(int id, const std::string& name,
              double supply, double ret, double oa, double exhaust)
        : id(id), name(name),
          supplyFlow(supply), returnFlow(ret),
          outdoorAirFlow(oa), exhaustFlow(exhaust),
          supplyTemperature(295.15),
          outdoorAirScheduleId(-1), supplyFlowScheduleId(-1) {}

    // Get outdoor air fraction at current time
    double getOutdoorAirFraction() const {
        if (supplyFlow <= 0) return 0.0;
        return outdoorAirFlow / supplyFlow;
    }

    // Get recirculated air flow
    double getRecirculatedFlow() const {
        return supplyFlow - outdoorAirFlow;
    }

    // Validate mass balance
    bool isBalanced(double tolerance = 0.001) const {
        return std::abs(supplyFlow - returnFlow) < tolerance;
    }
};

} // namespace contam
