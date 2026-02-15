#include "CbwReport.h"
#include <algorithm>
#include <cmath>
#include <sstream>
#include <iomanip>
#include <numeric>

namespace contam {

static double percentile(std::vector<double>& sorted, double p) {
    if (sorted.empty()) return 0.0;
    if (sorted.size() == 1) return sorted[0];
    double idx = p * (sorted.size() - 1);
    int lo = static_cast<int>(std::floor(idx));
    int hi = static_cast<int>(std::ceil(idx));
    if (lo == hi || hi >= static_cast<int>(sorted.size())) return sorted[lo];
    double frac = idx - lo;
    return sorted[lo] * (1.0 - frac) + sorted[hi] * frac;
}

std::vector<DailyStats> CbwReport::compute(
    const TransientResult& result,
    const std::vector<Species>& species,
    int numZones,
    double dayLength)
{
    std::vector<DailyStats> allStats;
    if (result.history.empty() || species.empty() || numZones <= 0) return allStats;

    int numSpecies = static_cast<int>(species.size());

    // Determine number of days
    double maxTime = result.history.back().time;
    int numDays = static_cast<int>(std::ceil(maxTime / dayLength));
    if (numDays < 1) numDays = 1;

    // For each day/zone/species, collect concentration values
    for (int day = 0; day < numDays; ++day) {
        double dayStart = day * dayLength;
        double dayEnd = (day + 1) * dayLength;

        for (int z = 0; z < numZones; ++z) {
            for (int s = 0; s < numSpecies; ++s) {
                std::vector<double> values;
                double tMin = 0.0, tMax = 0.0;
                double vMin = 1e30, vMax = -1e30;

                for (const auto& step : result.history) {
                    if (step.time < dayStart - 1e-10 || step.time >= dayEnd - 1e-10) continue;
                    const auto& conc = step.contaminant.concentrations;
                    if (z >= static_cast<int>(conc.size())) continue;
                    if (s >= static_cast<int>(conc[z].size())) continue;

                    double c = conc[z][s];
                    values.push_back(c);
                    if (c < vMin) { vMin = c; tMin = step.time; }
                    if (c > vMax) { vMax = c; tMax = step.time; }
                }

                if (values.empty()) continue;

                DailyStats ds;
                ds.dayIndex = day;
                ds.zoneIndex = z;
                ds.speciesIndex = s;
                ds.minimum = vMin;
                ds.maximum = vMax;
                ds.timeOfMin = tMin;
                ds.timeOfMax = tMax;

                // Mean
                double sum = std::accumulate(values.begin(), values.end(), 0.0);
                ds.mean = sum / values.size();

                // Stddev
                double sqSum = 0.0;
                for (double v : values) sqSum += (v - ds.mean) * (v - ds.mean);
                ds.stddev = (values.size() > 1) ? std::sqrt(sqSum / (values.size() - 1)) : 0.0;

                // Sort for percentiles
                std::sort(values.begin(), values.end());
                ds.q1 = percentile(values, 0.25);
                ds.median = percentile(values, 0.50);
                ds.q3 = percentile(values, 0.75);

                allStats.push_back(ds);
            }
        }
    }
    return allStats;
}

std::string CbwReport::formatText(
    const std::vector<DailyStats>& stats,
    const std::vector<Species>& species,
    const std::vector<std::string>& zoneNames)
{
    std::ostringstream os;
    os << std::fixed << std::setprecision(6);
    os << "CONTAM Daily Statistics Report (CBW)\n";
    os << "=====================================\n\n";

    int prevDay = -1;
    for (const auto& s : stats) {
        if (s.dayIndex != prevDay) {
            os << "--- Day " << s.dayIndex << " ---\n";
            prevDay = s.dayIndex;
        }
        std::string zName = (s.zoneIndex < static_cast<int>(zoneNames.size()))
            ? zoneNames[s.zoneIndex] : ("Zone_" + std::to_string(s.zoneIndex));
        std::string spName = (s.speciesIndex < static_cast<int>(species.size()))
            ? species[s.speciesIndex].name : ("Sp_" + std::to_string(s.speciesIndex));

        os << "  " << zName << " / " << spName << ":\n";
        os << "    Mean=" << s.mean << "  StdDev=" << s.stddev << "\n";
        os << "    Min=" << s.minimum << " (t=" << s.timeOfMin << "s)"
           << "  Max=" << s.maximum << " (t=" << s.timeOfMax << "s)\n";
        os << "    Q1=" << s.q1 << "  Median=" << s.median << "  Q3=" << s.q3 << "\n";
    }
    return os.str();
}

std::string CbwReport::formatCsv(
    const std::vector<DailyStats>& stats,
    const std::vector<Species>& species,
    const std::vector<std::string>& zoneNames)
{
    std::ostringstream os;
    os << std::fixed << std::setprecision(6);
    os << "Day,Zone,Species,Mean,StdDev,Min,Max,Q1,Median,Q3,TimeOfMin,TimeOfMax\n";

    for (const auto& s : stats) {
        std::string zName = (s.zoneIndex < static_cast<int>(zoneNames.size()))
            ? zoneNames[s.zoneIndex] : ("Zone_" + std::to_string(s.zoneIndex));
        std::string spName = (s.speciesIndex < static_cast<int>(species.size()))
            ? species[s.speciesIndex].name : ("Sp_" + std::to_string(s.speciesIndex));

        os << s.dayIndex << "," << zName << "," << spName << ","
           << s.mean << "," << s.stddev << ","
           << s.minimum << "," << s.maximum << ","
           << s.q1 << "," << s.median << "," << s.q3 << ","
           << s.timeOfMin << "," << s.timeOfMax << "\n";
    }
    return os.str();
}

} // namespace contam
