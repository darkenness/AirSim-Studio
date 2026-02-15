#include "io/AchReport.h"

namespace contam {

std::vector<AchResult> AchReport::compute(
    const Network& net,
    const std::vector<double>& massFlows,
    double airDensity)
{
    std::vector<AchResult> results;

    for (int i = 0; i < net.getNodeCount(); ++i) {
        const auto& node = net.getNode(i);
        if (node.isKnownPressure()) continue; // Skip ambient nodes

        double volume = node.getVolume();
        if (volume <= 0.0) continue;

        AchResult r;
        r.zoneId = node.getId();
        r.zoneName = node.getName();
        r.volume = volume;

        // Sum inflows to this zone from all links
        double totalInflow = 0.0;      // m^3/s
        double mechInflow = 0.0;
        double infiltInflow = 0.0;

        for (int j = 0; j < net.getLinkCount(); ++j) {
            const auto& link = net.getLink(j);
            double mf = (j < static_cast<int>(massFlows.size())) ? massFlows[j] : link.getMassFlow();
            double volFlow = std::abs(mf) / airDensity; // m^3/s

            bool flowIntoZone = false;
            bool fromAmbient = false;

            if (mf > 0.0 && link.getNodeTo() == i) {
                flowIntoZone = true;
                fromAmbient = net.getNode(link.getNodeFrom()).isKnownPressure();
            } else if (mf < 0.0 && link.getNodeFrom() == i) {
                flowIntoZone = true;
                fromAmbient = net.getNode(link.getNodeTo()).isKnownPressure();
            }

            if (flowIntoZone) {
                totalInflow += volFlow;

                // Classify: if connected to ambient, it's infiltration
                // Otherwise it's inter-zone (counted as mechanical for simplicity)
                if (fromAmbient) {
                    infiltInflow += volFlow;
                } else {
                    mechInflow += volFlow;
                }
            }
        }

        // ACH = volumetric_flow_rate * 3600 / volume
        r.totalAch = totalInflow * 3600.0 / volume;
        r.mechanicalAch = mechInflow * 3600.0 / volume;
        r.infiltrationAch = infiltInflow * 3600.0 / volume;
        r.naturalVentAch = 0.0; // Would need element type classification for full breakdown

        results.push_back(r);
    }

    return results;
}

std::string AchReport::formatText(const std::vector<AchResult>& results) {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(3);
    oss << "=== Air Changes Per Hour Report ===\n\n";
    oss << std::left << std::setw(6) << "Zone"
        << std::setw(20) << "Name"
        << std::right
        << std::setw(10) << "Vol(m3)"
        << std::setw(10) << "Total"
        << std::setw(10) << "Mech"
        << std::setw(10) << "Infilt"
        << std::setw(10) << "NatVent"
        << "\n";
    oss << std::string(76, '-') << "\n";

    for (const auto& r : results) {
        oss << std::left << std::setw(6) << r.zoneId
            << std::setw(20) << r.zoneName
            << std::right
            << std::setw(10) << r.volume
            << std::setw(10) << r.totalAch
            << std::setw(10) << r.mechanicalAch
            << std::setw(10) << r.infiltrationAch
            << std::setw(10) << r.naturalVentAch
            << "\n";
    }

    return oss.str();
}

std::string AchReport::formatCsv(const std::vector<AchResult>& results) {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(6);
    oss << "ZoneId,ZoneName,Volume_m3,TotalACH,MechanicalACH,InfiltrationACH,NaturalVentACH\n";

    for (const auto& r : results) {
        oss << r.zoneId << ","
            << r.zoneName << ","
            << r.volume << ","
            << r.totalAch << ","
            << r.mechanicalAch << ","
            << r.infiltrationAch << ","
            << r.naturalVentAch << "\n";
    }

    return oss.str();
}

} // namespace contam
