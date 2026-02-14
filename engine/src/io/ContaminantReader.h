#pragma once

#include <string>
#include <vector>
#include <fstream>
#include <sstream>
#include <stdexcept>

namespace contam {

// CTM Contaminant concentration file record
// Provides time-varying ambient contaminant concentrations
struct ContaminantRecord {
    double time;           // seconds from simulation start
    int speciesId;         // species ID
    double concentration;  // kg/kg (mass fraction)
};

// CTM file reader for ambient contaminant concentration time series
// Format: time(s) speciesId concentration(kg/kg)
class ContaminantReader {
public:
    static std::vector<ContaminantRecord> readFile(const std::string& filepath) {
        std::ifstream file(filepath);
        if (!file.is_open()) {
            throw std::runtime_error("Cannot open contaminant file: " + filepath);
        }

        std::vector<ContaminantRecord> records;
        std::string line;

        while (std::getline(file, line)) {
            if (line.empty() || line[0] == '!' || line[0] == '#') continue;

            ContaminantRecord rec;
            std::istringstream iss(line);
            if (iss >> rec.time >> rec.speciesId >> rec.concentration) {
                records.push_back(rec);
            }
        }
        return records;
    }

    // Get concentration for a species at a given time (linear interpolation)
    static double interpolate(const std::vector<ContaminantRecord>& records,
                              int speciesId, double t) {
        // Filter records for this species
        std::vector<const ContaminantRecord*> filtered;
        for (const auto& r : records) {
            if (r.speciesId == speciesId) filtered.push_back(&r);
        }

        if (filtered.empty()) return 0.0;
        if (filtered.size() == 1) return filtered[0]->concentration;
        if (t <= filtered.front()->time) return filtered.front()->concentration;
        if (t >= filtered.back()->time) return filtered.back()->concentration;

        for (size_t i = 0; i < filtered.size() - 1; ++i) {
            if (t >= filtered[i]->time && t <= filtered[i + 1]->time) {
                double dt = filtered[i + 1]->time - filtered[i]->time;
                double alpha = (dt > 0) ? (t - filtered[i]->time) / dt : 0.0;
                return filtered[i]->concentration * (1 - alpha)
                     + filtered[i + 1]->concentration * alpha;
            }
        }
        return filtered.back()->concentration;
    }
};

} // namespace contam
