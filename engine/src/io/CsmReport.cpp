#include "io/CsmReport.h"

namespace contam {

std::vector<CsmSpeciesResult> CsmReport::compute(
    const Network& net,
    const std::vector<Species>& species,
    const std::vector<TimeStepResult>& history)
{
    std::vector<CsmSpeciesResult> results;
    if (history.empty() || species.empty()) return results;

    int numNodes = net.getNodeCount();
    int numSpecies = static_cast<int>(species.size());

    for (int k = 0; k < numSpecies; ++k) {
        CsmSpeciesResult sr;
        sr.speciesId = species[k].id;
        sr.speciesName = species[k].name;
        sr.totalBuildingEmission = 0.0;
        sr.totalBuildingRemoval = 0.0;
        sr.totalExfiltration = 0.0;

        for (int i = 0; i < numNodes; ++i) {
            const auto& node = net.getNode(i);
            if (node.isKnownPressure()) continue;

            CsmZoneResult zr;
            zr.zoneId = node.getId();
            zr.zoneName = node.getName();
            zr.avgConcentration = 0.0;
            zr.peakConcentration = 0.0;
            zr.peakTime = 0.0;
            zr.totalEmission = 0.0;
            zr.totalRemoval = 0.0;
            zr.totalFiltered = 0.0;

            double sumConc = 0.0;
            int validSteps = 0;

            for (size_t step = 0; step < history.size(); ++step) {
                const auto& snap = history[step];
                const auto& conc = snap.contaminant.concentrations;

                if (i >= static_cast<int>(conc.size())) continue;
                if (k >= static_cast<int>(conc[i].size())) continue;

                double c = conc[i][k];
                sumConc += c;
                validSteps++;

                if (c > zr.peakConcentration) {
                    zr.peakConcentration = c;
                    zr.peakTime = snap.time;
                }
            }

            if (validSteps > 0) {
                zr.avgConcentration = sumConc / validSteps;
            }

            // Estimate total exfiltration from this zone for this species
            // by looking at outflows to ambient nodes in the last step
            if (!history.empty()) {
                const auto& lastSnap = history.back();
                const auto& lastConc = lastSnap.contaminant.concentrations;
                double zoneConc = 0.0;
                if (i < static_cast<int>(lastConc.size()) && k < static_cast<int>(lastConc[i].size())) {
                    zoneConc = lastConc[i][k];
                }

                // Sum outflows to ambient
                for (int j = 0; j < net.getLinkCount(); ++j) {
                    const auto& link = net.getLink(j);
                    double mf = link.getMassFlow();
                    double density = net.getNode(i).getDensity();
                    if (density <= 0.0) density = 1.2;

                    // Flow from this zone to ambient
                    if (mf > 0.0 && link.getNodeFrom() == i &&
                        net.getNode(link.getNodeTo()).isKnownPressure()) {
                        double volFlow = mf / density;
                        // Rough estimate: exfiltration over simulation duration
                        double duration = history.back().time - history.front().time;
                        if (duration > 0.0) {
                            sr.totalExfiltration += volFlow * zoneConc * duration;
                        }
                    } else if (mf < 0.0 && link.getNodeTo() == i &&
                               net.getNode(link.getNodeFrom()).isKnownPressure()) {
                        double volFlow = -mf / density;
                        double duration = history.back().time - history.front().time;
                        if (duration > 0.0) {
                            sr.totalExfiltration += volFlow * zoneConc * duration;
                        }
                    }
                }
            }

            sr.zones.push_back(zr);
        }

        results.push_back(sr);
    }

    return results;
}

std::string CsmReport::formatText(const std::vector<CsmSpeciesResult>& results) {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(6);
    oss << "=== Contaminant Summary Report ===\n\n";

    for (const auto& sr : results) {
        oss << "Species: " << sr.speciesName << " (ID=" << sr.speciesId << ")\n";
        oss << "  Total Building Exfiltration: " << sr.totalExfiltration << " kg\n\n";

        oss << std::left
            << std::setw(6) << "Zone"
            << std::setw(16) << "Name"
            << std::right
            << std::setw(14) << "Avg(kg/m3)"
            << std::setw(14) << "Peak(kg/m3)"
            << std::setw(12) << "PeakTime(s)"
            << "\n";
        oss << std::string(62, '-') << "\n";

        for (const auto& zr : sr.zones) {
            oss << std::left
                << std::setw(6) << zr.zoneId
                << std::setw(16) << zr.zoneName
                << std::right
                << std::setw(14) << zr.avgConcentration
                << std::setw(14) << zr.peakConcentration
                << std::setw(12) << zr.peakTime
                << "\n";
        }
        oss << "\n";
    }

    return oss.str();
}

std::string CsmReport::formatCsv(const std::vector<CsmSpeciesResult>& results) {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(8);
    oss << "SpeciesId,SpeciesName,ZoneId,ZoneName,AvgConc_kg_m3,PeakConc_kg_m3,"
        << "PeakTime_s,TotalEmission_kg,TotalRemoval_kg,TotalFiltered_kg\n";

    for (const auto& sr : results) {
        for (const auto& zr : sr.zones) {
            oss << sr.speciesId << ","
                << sr.speciesName << ","
                << zr.zoneId << ","
                << zr.zoneName << ","
                << zr.avgConcentration << ","
                << zr.peakConcentration << ","
                << zr.peakTime << ","
                << zr.totalEmission << ","
                << zr.totalRemoval << ","
                << zr.totalFiltered << "\n";
        }
    }

    return oss.str();
}

} // namespace contam
