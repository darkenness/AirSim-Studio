#pragma once
#include "core/Schedule.h"
#include <string>
#include <vector>

namespace contam {

/// Continuous Value File reader — linear interpolation between time-value pairs
class CvfReader {
public:
    static Schedule readFromFile(const std::string& filepath, int scheduleId, const std::string& name = "");
    static Schedule readFromString(const std::string& content, int scheduleId, const std::string& name = "");
    static std::vector<Schedule> readMultiColumnFromFile(const std::string& filepath, int startId);
    static std::vector<Schedule> readMultiColumnFromString(const std::string& content, int startId);
};

/// Discrete Value File reader — zero-order hold (step) between time-value pairs
class DvfReader {
public:
    static Schedule readFromFile(const std::string& filepath, int scheduleId, const std::string& name = "");
    static Schedule readFromString(const std::string& content, int scheduleId, const std::string& name = "");
    static std::vector<Schedule> readMultiColumnFromFile(const std::string& filepath, int startId);
    static std::vector<Schedule> readMultiColumnFromString(const std::string& content, int startId);
};

} // namespace contam
