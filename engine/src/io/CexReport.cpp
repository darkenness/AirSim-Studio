#include "io/CexReport.h"

namespace contam {

std::vector<CexSpeciesResult> CexReport::compute(
    const Network& net,
    const std::vector<Species>& species,
    const std::vector<TimeStepResult>& history)
{
    std::vector<CexSpeciesResult> results;
    if (history.empty() || species.empty()) return results;

    int numLinks = net.getLinkCount();
    int numSpecies = static_cast<int>(species.size());

    // Identify exterior links: links where one end is Ambient
    struct ExteriorLink {
        int linkIndex;
        int interiorNodeIndex;  // the non-ambient node
        int ambientNodeIndex;   // the ambient node
    };
    std::vector<ExteriorLink> exteriorLinks;

    for (int j = 0; j < numLinks; ++j) {
        const auto& link = net.getLink(j);
        int nFrom = link.getNodeFrom();
        int nTo = link.getNodeTo();
        bool fromAmbient = net.getNode(nFrom).isKnownPressure();
        bool toAmbient = net.getNode(nTo).isKnownPressure();

        if (fromAmbient && !toAmbient) {
            exteriorLinks.push_back({j, nTo, nFrom});
        } else if (!fromAmbient && toAmbient) {
            exteriorLinks.push_back({j, nFrom, nTo});
        }
        // Skip links between two ambient nodes or two interior nodes
    }

    if (exteriorLinks.empty()) {
        // No exterior openings — return empty results per species
        for (int k = 0; k < numSpecies; ++k) {
            CexSpeciesResult sr;
            sr.speciesId = species[k].id;
            sr.speciesName = species[k].name;
            sr.totalExfiltration = 0.0;
            results.push_back(sr);
        }
        return results;
    }

    for (int k = 0; k < numSpecies; ++k) {
        CexSpeciesResult sr;
        sr.speciesId = species[k].id;
        sr.speciesName = species[k].name;
        sr.totalExfiltration = 0.0;

        for (const auto& ext : exteriorLinks) {
            CexOpeningResult op;
            op.linkId = net.getLink(ext.linkIndex).getId();
            op.fromNodeIndex = ext.interiorNodeIndex;
            op.toNodeIndex = ext.ambientNodeIndex;
            op.fromNodeName = net.getNode(ext.interiorNodeIndex).getName();
            op.toNodeName = net.getNode(ext.ambientNodeIndex).getName();
            op.totalMassExfiltrated = 0.0;
            op.avgMassFlowRate = 0.0;
            op.peakMassFlowRate = 0.0;

            // Integrate exfiltration over time using trapezoidal rule
            double prevRate = 0.0;
            double prevTime = history[0].time;

            for (size_t step = 0; step < history.size(); ++step) {
                const auto& snap = history[step];
                const auto& conc = snap.contaminant.concentrations;
                const auto& massFlows = snap.airflow.massFlows;

                // Get mass flow through this link
                double mf = 0.0;
                if (ext.linkIndex < static_cast<int>(massFlows.size())) {
                    mf = massFlows[ext.linkIndex];
                }

                // Determine outward flow (from interior to ambient)
                // Link convention: positive flow = nodeFrom -> nodeTo
                const auto& link = net.getLink(ext.linkIndex);
                double outwardMassFlow = 0.0;
                if (link.getNodeFrom() == ext.interiorNodeIndex && mf > 0.0) {
                    outwardMassFlow = mf;  // positive = from interior to ambient
                } else if (link.getNodeTo() == ext.interiorNodeIndex && mf < 0.0) {
                    outwardMassFlow = -mf; // negative = reverse, from nodeTo(interior) to nodeFrom(ambient)
                }

                // Get interior zone concentration
                double zoneConc = 0.0;
                if (ext.interiorNodeIndex < static_cast<int>(conc.size()) &&
                    k < static_cast<int>(conc[ext.interiorNodeIndex].size())) {
                    zoneConc = conc[ext.interiorNodeIndex][k];
                }

                // Get zone density for volume flow conversion
                double density = net.getNode(ext.interiorNodeIndex).getDensity();
                if (density <= 0.0) density = 1.2;

                // Contaminant mass flow rate = volumeFlow * concentration
                // volumeFlow = massFlow / density
                double rate = (outwardMassFlow / density) * zoneConc;  // kg/s

                // Track peak
                if (rate > op.peakMassFlowRate) {
                    op.peakMassFlowRate = rate;
                }

                // Trapezoidal integration
                if (step > 0) {
                    double dt = snap.time - prevTime;
                    if (dt > 0.0) {
                        op.totalMassExfiltrated += 0.5 * (prevRate + rate) * dt;
                    }
                }

                prevRate = rate;
                prevTime = snap.time;
            }

            // Average rate over simulation duration
            double duration = history.back().time - history.front().time;
            if (duration > 0.0) {
                op.avgMassFlowRate = op.totalMassExfiltrated / duration;
            }

            sr.totalExfiltration += op.totalMassExfiltrated;
            sr.openings.push_back(op);
        }

        results.push_back(sr);
    }

    return results;
}

std::string CexReport::formatText(const std::vector<CexSpeciesResult>& results) {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(6);
    oss << "=== Contaminant Exfiltration Report (.CEX) ===\n\n";

    for (const auto& sr : results) {
        oss << "Species: " << sr.speciesName << " (ID=" << sr.speciesId << ")\n";
        oss << "  Total Exfiltration: " << sr.totalExfiltration << " kg\n\n";

        oss << "  Per-Opening Breakdown:\n";
        oss << "  " << std::left
            << std::setw(8) << "LinkID"
            << std::setw(16) << "FromZone"
            << std::setw(16) << "ToZone"
            << std::right
            << std::setw(16) << "Total(kg)"
            << std::setw(16) << "AvgRate(kg/s)"
            << std::setw(16) << "PeakRate(kg/s)"
            << "\n";
        oss << "  " << std::string(88, '-') << "\n";

        for (const auto& op : sr.openings) {
            oss << "  " << std::left
                << std::setw(8) << op.linkId
                << std::setw(16) << op.fromNodeName
                << std::setw(16) << op.toNodeName
                << std::right
                << std::setw(16) << op.totalMassExfiltrated
                << std::setw(16) << op.avgMassFlowRate
                << std::setw(16) << op.peakMassFlowRate
                << "\n";
        }
        oss << "\n";
    }

    return oss.str();
}

std::string CexReport::formatCsv(const std::vector<CexSpeciesResult>& results) {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(8);
    oss << "SpeciesId,SpeciesName,LinkId,FromZone,ToZone,"
        << "TotalExfiltrated_kg,AvgRate_kg_s,PeakRate_kg_s\n";

    for (const auto& sr : results) {
        for (const auto& op : sr.openings) {
            oss << sr.speciesId << ","
                << sr.speciesName << ","
                << op.linkId << ","
                << op.fromNodeName << ","
                << op.toNodeName << ","
                << op.totalMassExfiltrated << ","
                << op.avgMassFlowRate << ","
                << op.peakMassFlowRate << "\n";
        }
    }

    return oss.str();
}

} // namespace contam
