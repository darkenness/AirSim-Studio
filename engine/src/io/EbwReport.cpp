#include "EbwReport.h"
#include <algorithm>
#include <cmath>
#include <sstream>
#include <iomanip>

namespace contam {

std::vector<OccupantExposure> EbwReport::compute(
    const std::vector<Occupant>& occupants,
    const std::vector<Species>& species)
{
    std::vector<OccupantExposure> results;
    if (occupants.empty() || species.empty()) return results;

    for (const auto& occ : occupants) {
        for (int s = 0; s < static_cast<int>(species.size()); ++s) {
            OccupantExposure ex;
            ex.occupantId = occ.id;
            ex.occupantName = occ.name;
            ex.speciesIndex = s;
            ex.breathingRate = occ.breathingRate;

            if (s < static_cast<int>(occ.exposure.size())) {
                const auto& rec = occ.exposure[s];
                ex.cumulativeDose = rec.cumulativeDose;
                ex.peakConcentration = rec.peakConcentration;
                ex.timeAtPeak = rec.timeAtPeak;
                ex.totalExposureTime = rec.totalExposureTime;
                // Mean concentration = dose / (breathingRate * exposureTime)
                if (occ.breathingRate > 0.0 && rec.totalExposureTime > 0.0) {
                    ex.meanConcentration = rec.cumulativeDose / (occ.breathingRate * rec.totalExposureTime);
                } else {
                    ex.meanConcentration = 0.0;
                }
            } else {
                ex.cumulativeDose = 0.0;
                ex.peakConcentration = 0.0;
                ex.timeAtPeak = 0.0;
                ex.totalExposureTime = 0.0;
                ex.meanConcentration = 0.0;
            }

            results.push_back(ex);
        }
    }
    return results;
}

std::vector<OccupantExposure> EbwReport::computeFromHistory(
    const std::vector<Occupant>& occupants,
    const std::vector<Species>& species,
    const TransientResult& result)
{
    std::vector<OccupantExposure> results;
    if (occupants.empty() || species.empty() || result.history.size() < 2) return results;

    int numSpecies = static_cast<int>(species.size());

    for (const auto& occ : occupants) {
        // Per-species accumulators
        std::vector<double> dose(numSpecies, 0.0);
        std::vector<double> peak(numSpecies, 0.0);
        std::vector<double> peakTime(numSpecies, 0.0);
        std::vector<double> exposureTime(numSpecies, 0.0);
        std::vector<double> concSum(numSpecies, 0.0);
        std::vector<int> concCount(numSpecies, 0);

        for (size_t i = 1; i < result.history.size(); ++i) {
            double t = result.history[i].time;
            double dt = result.history[i].time - result.history[i - 1].time;
            if (dt <= 0.0) continue;

            int zoneIdx = occ.currentZoneIdx;
            const auto& conc = result.history[i].contaminant.concentrations;
            if (zoneIdx >= static_cast<int>(conc.size())) continue;

            for (int s = 0; s < numSpecies; ++s) {
                if (s >= static_cast<int>(conc[zoneIdx].size())) continue;
                double c = conc[zoneIdx][s];

                dose[s] += occ.breathingRate * c * dt;

                if (c > peak[s]) {
                    peak[s] = c;
                    peakTime[s] = t;
                }

                if (c > 1e-15) {
                    exposureTime[s] += dt;
                }

                concSum[s] += c;
                concCount[s]++;
            }
        }

        for (int s = 0; s < numSpecies; ++s) {
            OccupantExposure ex;
            ex.occupantId = occ.id;
            ex.occupantName = occ.name;
            ex.speciesIndex = s;
            ex.breathingRate = occ.breathingRate;
            ex.cumulativeDose = dose[s];
            ex.peakConcentration = peak[s];
            ex.timeAtPeak = peakTime[s];
            ex.totalExposureTime = exposureTime[s];
            ex.meanConcentration = (concCount[s] > 0) ? (concSum[s] / concCount[s]) : 0.0;
            results.push_back(ex);
        }
    }
    return results;
}

std::vector<ZoneVisit> EbwReport::extractZoneHistory(
    const std::vector<Occupant>& occupants,
    const TransientResult& result,
    const std::vector<std::string>& zoneNames)
{
    std::vector<ZoneVisit> visits;
    if (occupants.empty() || result.history.empty()) return visits;

    // For static occupants (no schedule), produce a single zone visit spanning the simulation
    double tStart = result.history.front().time;
    double tEnd = result.history.back().time;

    for (const auto& occ : occupants) {
        ZoneVisit v;
        v.occupantId = occ.id;
        v.zoneIndex = occ.currentZoneIdx;
        v.zoneName = (occ.currentZoneIdx < static_cast<int>(zoneNames.size()))
            ? zoneNames[occ.currentZoneIdx]
            : ("Zone_" + std::to_string(occ.currentZoneIdx));
        v.enterTime = tStart;
        v.leaveTime = tEnd;
        visits.push_back(v);
    }

    return visits;
}

std::string EbwReport::formatText(
    const std::vector<OccupantExposure>& exposures,
    const std::vector<Species>& species,
    const std::vector<ZoneVisit>& zoneHistory)
{
    std::ostringstream os;
    os << std::fixed << std::setprecision(6);
    os << "CONTAM Occupant Exposure Report (EBW)\n";
    os << "======================================\n\n";

    // Zone history section
    if (!zoneHistory.empty()) {
        os << "--- Zone Location History ---\n";
        os << std::left << std::setw(6) << "OccID"
           << std::setw(16) << "Zone"
           << std::right
           << std::setw(12) << "Enter(s)"
           << std::setw(12) << "Leave(s)"
           << std::setw(12) << "Duration(s)"
           << "\n";
        os << std::string(58, '-') << "\n";

        for (const auto& v : zoneHistory) {
            os << std::left << std::setw(6) << v.occupantId
               << std::setw(16) << v.zoneName
               << std::right
               << std::setw(12) << v.enterTime
               << std::setw(12) << v.leaveTime
               << std::setw(12) << (v.leaveTime - v.enterTime)
               << "\n";
        }
        os << "\n";
    }

    // Exposure section grouped by occupant
    int prevOccId = -1;
    for (const auto& ex : exposures) {
        if (ex.occupantId != prevOccId) {
            os << "--- Occupant " << ex.occupantId << ": " << ex.occupantName
               << " (breathing rate: " << ex.breathingRate << " m3/s) ---\n";
            os << std::left << std::setw(14) << "Species"
               << std::right
               << std::setw(14) << "CumDose(kg)"
               << std::setw(14) << "Peak(kg/m3)"
               << std::setw(12) << "PeakT(s)"
               << std::setw(14) << "Mean(kg/m3)"
               << std::setw(12) << "ExpTime(s)"
               << "\n";
            os << std::string(80, '-') << "\n";
            prevOccId = ex.occupantId;
        }

        std::string spName = (ex.speciesIndex < static_cast<int>(species.size()))
            ? species[ex.speciesIndex].name
            : ("Sp_" + std::to_string(ex.speciesIndex));

        os << std::left << std::setw(14) << spName
           << std::right
           << std::setw(14) << ex.cumulativeDose
           << std::setw(14) << ex.peakConcentration
           << std::setw(12) << ex.timeAtPeak
           << std::setw(14) << ex.meanConcentration
           << std::setw(12) << ex.totalExposureTime
           << "\n";
    }

    return os.str();
}

std::string EbwReport::formatCsv(
    const std::vector<OccupantExposure>& exposures,
    const std::vector<Species>& species)
{
    std::ostringstream os;
    os << std::fixed << std::setprecision(6);
    os << "OccupantId,OccupantName,Species,BreathingRate_m3s,CumulativeDose_kg,"
       << "PeakConcentration_kgm3,TimeAtPeak_s,MeanConcentration_kgm3,ExposureTime_s\n";

    for (const auto& ex : exposures) {
        std::string spName = (ex.speciesIndex < static_cast<int>(species.size()))
            ? species[ex.speciesIndex].name
            : ("Sp_" + std::to_string(ex.speciesIndex));

        os << ex.occupantId << ","
           << ex.occupantName << ","
           << spName << ","
           << ex.breathingRate << ","
           << ex.cumulativeDose << ","
           << ex.peakConcentration << ","
           << ex.timeAtPeak << ","
           << ex.meanConcentration << ","
           << ex.totalExposureTime << "\n";
    }

    return os.str();
}

} // namespace contam
