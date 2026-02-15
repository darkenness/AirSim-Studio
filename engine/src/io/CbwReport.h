#pragma once
#include "core/TransientSimulation.h"
#include "core/Species.h"
#include <vector>
#include <string>

namespace contam {

struct DailyStats {
    int dayIndex;
    int zoneIndex;
    int speciesIndex;
    double mean;
    double stddev;
    double minimum;
    double maximum;
    double median;
    double q1;
    double q3;
    double timeOfMin;
    double timeOfMax;
};

class CbwReport {
public:
    static std::vector<DailyStats> compute(
        const TransientResult& result,
        const std::vector<Species>& species,
        int numZones,
        double dayLength = 86400.0);

    static std::string formatText(
        const std::vector<DailyStats>& stats,
        const std::vector<Species>& species,
        const std::vector<std::string>& zoneNames = {});

    static std::string formatCsv(
        const std::vector<DailyStats>& stats,
        const std::vector<Species>& species,
        const std::vector<std::string>& zoneNames = {});
};

} // namespace contam
