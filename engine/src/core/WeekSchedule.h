#pragma once

#include "core/Schedule.h"
#include <string>
#include <vector>
#include <array>
#include <unordered_map>
#include <stdexcept>

namespace contam {

// DayType: a named daily profile (e.g., "Weekday", "Weekend", "Holiday")
// Contains a 24-hour piecewise-linear schedule (time in seconds from midnight)
struct DayType {
    int id;
    std::string name;
    Schedule profile;  // points should use 0~86400 seconds (midnight to midnight)

    DayType() : id(-1) {}
    DayType(int id, const std::string& name) : id(id), name(name), profile(id, name) {}

    double getValue(double secondsSinceMidnight) const {
        return profile.getValue(secondsSinceMidnight);
    }
};

// WeekSchedule: maps each day of the week to a DayType
// dayOfWeek: 0=Monday, 1=Tuesday, ..., 6=Sunday
// Automatically cycles through weeks during transient simulation
class WeekSchedule {
public:
    int id;
    std::string name;

    WeekSchedule() : id(-1) {}
    WeekSchedule(int id, const std::string& name) : id(id), name(name) {
        weekMap_.fill(-1); // -1 = no assignment
    }

    // Assign a DayType ID to a day of the week (0=Mon ... 6=Sun)
    void assignDayType(int dayOfWeek, int dayTypeId) {
        if (dayOfWeek < 0 || dayOfWeek > 6) {
            throw std::out_of_range("dayOfWeek must be 0-6 (Mon-Sun)");
        }
        weekMap_[static_cast<size_t>(dayOfWeek)] = dayTypeId;
    }

    // Get DayType ID for a day of the week
    int getDayTypeId(int dayOfWeek) const {
        if (dayOfWeek < 0 || dayOfWeek > 6) return -1;
        return weekMap_[static_cast<size_t>(dayOfWeek)];
    }

    // Get interpolated value at a given simulation time
    // startDayOfWeek: what day of week does t=0 correspond to (0=Mon)
    // dayTypes: lookup map from dayType ID to DayType
    double getValue(double t, int startDayOfWeek,
                    const std::unordered_map<int, DayType>& dayTypes) const {
        if (t < 0) t = 0;

        double totalSeconds = t;
        int totalDays = static_cast<int>(totalSeconds / 86400.0);
        double secondsInDay = totalSeconds - totalDays * 86400.0;

        int dayOfWeek = (startDayOfWeek + totalDays) % 7;
        int dtId = getDayTypeId(dayOfWeek);

        auto it = dayTypes.find(dtId);
        if (it != dayTypes.end()) {
            return it->second.getValue(secondsInDay);
        }
        return 1.0; // default if no DayType assigned
    }

    const std::array<int, 7>& getWeekMap() const { return weekMap_; }

private:
    std::array<int, 7> weekMap_; // dayOfWeek → dayTypeId
};

} // namespace contam
