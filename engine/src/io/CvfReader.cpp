#include "CvfReader.h"
#include <fstream>
#include <sstream>
#include <stdexcept>

namespace contam {

static std::vector<std::pair<double, std::vector<double>>> parseLines(const std::string& content) {
    std::vector<std::pair<double, std::vector<double>>> rows;
    std::istringstream iss(content);
    std::string line;
    int lineNum = 0;
    double prevTime = -1e30;

    while (std::getline(iss, line)) {
        ++lineNum;
        // Skip comments and blank lines
        size_t first = line.find_first_not_of(" \t\r");
        if (first == std::string::npos || line[first] == '#') continue;

        std::istringstream ls(line);
        double t;
        if (!(ls >> t)) {
            throw std::runtime_error("CVF/DVF parse error at line " + std::to_string(lineNum) + ": invalid time");
        }
        if (t < prevTime) {
            throw std::runtime_error("CVF/DVF parse error at line " + std::to_string(lineNum) + ": time not monotonically increasing");
        }
        prevTime = t;

        std::vector<double> vals;
        double v;
        while (ls >> v) vals.push_back(v);
        if (vals.empty()) {
            throw std::runtime_error("CVF/DVF parse error at line " + std::to_string(lineNum) + ": no value columns");
        }
        rows.push_back({t, vals});
    }
    return rows;
}

static std::string readFile(const std::string& filepath) {
    std::ifstream f(filepath);
    if (!f.is_open()) throw std::runtime_error("Cannot open file: " + filepath);
    std::ostringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

// ── CvfReader ────────────────────────────────────────────────────────

Schedule CvfReader::readFromString(const std::string& content, int scheduleId, const std::string& name) {
    auto rows = parseLines(content);
    Schedule s(scheduleId, name.empty() ? ("cvf_" + std::to_string(scheduleId)) : name);
    s.setInterpolationMode(InterpolationMode::Linear);
    for (const auto& [t, vals] : rows) {
        s.addPoint(t, vals[0]);
    }
    return s;
}

Schedule CvfReader::readFromFile(const std::string& filepath, int scheduleId, const std::string& name) {
    return readFromString(readFile(filepath), scheduleId, name);
}

std::vector<Schedule> CvfReader::readMultiColumnFromString(const std::string& content, int startId) {
    auto rows = parseLines(content);
    if (rows.empty()) return {};
    int numCols = static_cast<int>(rows[0].second.size());
    std::vector<Schedule> result;
    for (int c = 0; c < numCols; ++c) {
        Schedule s(startId + c, "cvf_col_" + std::to_string(c));
        s.setInterpolationMode(InterpolationMode::Linear);
        for (const auto& [t, vals] : rows) {
            if (c < static_cast<int>(vals.size())) {
                s.addPoint(t, vals[c]);
            }
        }
        result.push_back(std::move(s));
    }
    return result;
}

std::vector<Schedule> CvfReader::readMultiColumnFromFile(const std::string& filepath, int startId) {
    return readMultiColumnFromString(readFile(filepath), startId);
}

// ── DvfReader ────────────────────────────────────────────────────────

Schedule DvfReader::readFromString(const std::string& content, int scheduleId, const std::string& name) {
    auto rows = parseLines(content);
    Schedule s(scheduleId, name.empty() ? ("dvf_" + std::to_string(scheduleId)) : name);
    s.setInterpolationMode(InterpolationMode::StepHold);
    for (const auto& [t, vals] : rows) {
        s.addPoint(t, vals[0]);
    }
    return s;
}

Schedule DvfReader::readFromFile(const std::string& filepath, int scheduleId, const std::string& name) {
    return readFromString(readFile(filepath), scheduleId, name);
}

std::vector<Schedule> DvfReader::readMultiColumnFromString(const std::string& content, int startId) {
    auto rows = parseLines(content);
    if (rows.empty()) return {};
    int numCols = static_cast<int>(rows[0].second.size());
    std::vector<Schedule> result;
    for (int c = 0; c < numCols; ++c) {
        Schedule s(startId + c, "dvf_col_" + std::to_string(c));
        s.setInterpolationMode(InterpolationMode::StepHold);
        for (const auto& [t, vals] : rows) {
            if (c < static_cast<int>(vals.size())) {
                s.addPoint(t, vals[c]);
            }
        }
        result.push_back(std::move(s));
    }
    return result;
}

std::vector<Schedule> DvfReader::readMultiColumnFromFile(const std::string& filepath, int startId) {
    return readMultiColumnFromString(readFile(filepath), startId);
}

} // namespace contam
