#include "WpcReader.h"
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <cmath>

namespace contam {

static std::string readFileContent(const std::string& filepath) {
    std::ifstream f(filepath);
    if (!f.is_open()) throw std::runtime_error("Cannot open WPC file: " + filepath);
    std::ostringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

std::vector<WpcRecord> WpcReader::readPressureString(const std::string& content) {
    std::vector<WpcRecord> records;
    std::istringstream iss(content);
    std::string line;
    int lineNum = 0;
    double prevTime = -1e30;

    while (std::getline(iss, line)) {
        ++lineNum;
        size_t first = line.find_first_not_of(" \t\r");
        if (first == std::string::npos || line[first] == '#') continue;

        std::istringstream ls(line);
        WpcRecord rec;
        if (!(ls >> rec.time)) {
            throw std::runtime_error("WPC pressure parse error at line " + std::to_string(lineNum));
        }
        if (rec.time < prevTime) {
            throw std::runtime_error("WPC pressure: time not monotonic at line " + std::to_string(lineNum));
        }
        prevTime = rec.time;

        double v;
        while (ls >> v) rec.pressures.push_back(v);
        if (rec.pressures.empty()) {
            throw std::runtime_error("WPC pressure: no data columns at line " + std::to_string(lineNum));
        }
        records.push_back(std::move(rec));
    }
    return records;
}

std::vector<WpcRecord> WpcReader::readPressureFile(const std::string& filepath) {
    return readPressureString(readFileContent(filepath));
}

std::vector<WpcConcentration> WpcReader::readConcentrationString(
    const std::string& content, int numOpenings, int numSpecies)
{
    std::vector<WpcConcentration> records;
    std::istringstream iss(content);
    std::string line;
    int lineNum = 0;
    double prevTime = -1e30;
    int colsExpected = numOpenings * numSpecies;

    while (std::getline(iss, line)) {
        ++lineNum;
        size_t first = line.find_first_not_of(" \t\r");
        if (first == std::string::npos || line[first] == '#') continue;

        std::istringstream ls(line);
        WpcConcentration rec;
        if (!(ls >> rec.time)) {
            throw std::runtime_error("WPC conc parse error at line " + std::to_string(lineNum));
        }
        if (rec.time < prevTime) {
            throw std::runtime_error("WPC conc: time not monotonic at line " + std::to_string(lineNum));
        }
        prevTime = rec.time;

        std::vector<double> vals;
        double v;
        while (ls >> v) vals.push_back(v);
        if (static_cast<int>(vals.size()) < colsExpected) {
            throw std::runtime_error("WPC conc: expected " + std::to_string(colsExpected) +
                " columns at line " + std::to_string(lineNum));
        }

        rec.concentrations.resize(numOpenings);
        for (int o = 0; o < numOpenings; ++o) {
            rec.concentrations[o].resize(numSpecies);
            for (int s = 0; s < numSpecies; ++s) {
                rec.concentrations[o][s] = vals[o * numSpecies + s];
            }
        }
        records.push_back(std::move(rec));
    }
    return records;
}

std::vector<WpcConcentration> WpcReader::readConcentrationFile(
    const std::string& filepath, int numOpenings, int numSpecies)
{
    return readConcentrationString(readFileContent(filepath), numOpenings, numSpecies);
}

std::vector<double> WpcReader::interpolatePressure(
    const std::vector<WpcRecord>& records, double t)
{
    if (records.empty()) return {};
    if (records.size() == 1) return records[0].pressures;
    if (t <= records.front().time) return records.front().pressures;
    if (t >= records.back().time) return records.back().pressures;

    // Find bracketing interval
    for (size_t i = 0; i < records.size() - 1; ++i) {
        if (t >= records[i].time && t <= records[i + 1].time) {
            double dt = records[i + 1].time - records[i].time;
            if (dt < 1e-15) return records[i].pressures;
            double alpha = (t - records[i].time) / dt;

            int n = static_cast<int>(records[i].pressures.size());
            std::vector<double> result(n);
            for (int j = 0; j < n; ++j) {
                double p0 = records[i].pressures[j];
                double p1 = (j < static_cast<int>(records[i + 1].pressures.size()))
                    ? records[i + 1].pressures[j] : p0;
                result[j] = p0 * (1.0 - alpha) + p1 * alpha;
            }
            return result;
        }
    }
    return records.back().pressures;
}

std::vector<std::vector<double>> WpcReader::interpolateConcentration(
    const std::vector<WpcConcentration>& records, double t)
{
    if (records.empty()) return {};
    if (records.size() == 1) return records[0].concentrations;
    if (t <= records.front().time) return records.front().concentrations;
    if (t >= records.back().time) return records.back().concentrations;

    for (size_t i = 0; i < records.size() - 1; ++i) {
        if (t >= records[i].time && t <= records[i + 1].time) {
            double dt = records[i + 1].time - records[i].time;
            if (dt < 1e-15) return records[i].concentrations;
            double alpha = (t - records[i].time) / dt;

            int nOpen = static_cast<int>(records[i].concentrations.size());
            std::vector<std::vector<double>> result(nOpen);
            for (int o = 0; o < nOpen; ++o) {
                int nSp = static_cast<int>(records[i].concentrations[o].size());
                result[o].resize(nSp);
                for (int s = 0; s < nSp; ++s) {
                    double c0 = records[i].concentrations[o][s];
                    double c1 = c0;
                    if (i + 1 < records.size() &&
                        o < static_cast<int>(records[i + 1].concentrations.size()) &&
                        s < static_cast<int>(records[i + 1].concentrations[o].size())) {
                        c1 = records[i + 1].concentrations[o][s];
                    }
                    result[o][s] = c0 * (1.0 - alpha) + c1 * alpha;
                }
            }
            return result;
        }
    }
    return records.back().concentrations;
}

} // namespace contam
