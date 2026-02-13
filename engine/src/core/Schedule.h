#pragma once
#include <string>
#include <vector>
#include <algorithm>

namespace contam {

// A single point in a piecewise-linear schedule
struct SchedulePoint {
    double time;   // seconds from simulation start
    double value;  // multiplier (0.0 to 1.0 typically)

    SchedulePoint() : time(0.0), value(1.0) {}
    SchedulePoint(double t, double v) : time(t), value(v) {}
};

// Piecewise-linear time schedule
// Interpolates linearly between defined points
// Before first point: uses first value
// After last point: uses last value
class Schedule {
public:
    int id;
    std::string name;

    Schedule() : id(-1) {}
    Schedule(int id, const std::string& name) : id(id), name(name) {}

    void addPoint(double time, double value) {
        points_.push_back({time, value});
        // Keep sorted by time
        std::sort(points_.begin(), points_.end(),
                  [](const SchedulePoint& a, const SchedulePoint& b) {
                      return a.time < b.time;
                  });
    }

    // Get interpolated value at time t
    double getValue(double t) const {
        if (points_.empty()) return 1.0;
        if (points_.size() == 1) return points_[0].value;

        // Before first point
        if (t <= points_.front().time) return points_.front().value;
        // After last point
        if (t >= points_.back().time) return points_.back().value;

        // Find bracketing interval
        for (size_t i = 0; i < points_.size() - 1; ++i) {
            if (t >= points_[i].time && t <= points_[i + 1].time) {
                double dt = points_[i + 1].time - points_[i].time;
                if (dt < 1e-15) return points_[i].value;
                double alpha = (t - points_[i].time) / dt;
                return points_[i].value * (1.0 - alpha) + points_[i + 1].value * alpha;
            }
        }
        return points_.back().value;
    }

    const std::vector<SchedulePoint>& getPoints() const { return points_; }

private:
    std::vector<SchedulePoint> points_;
};

} // namespace contam
