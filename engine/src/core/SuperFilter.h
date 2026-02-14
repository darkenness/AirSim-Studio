#pragma once

#include <vector>
#include <cmath>

namespace contam {

// Super Filter — Cascaded Multi-Stage Filter Model
//
// Per CONTAM requirements document (Module 8.2):
//   η_super = 1 - Π(1 - η_k)  for k = 1..n stages
//
// Each sub-filter has:
//   - Species-specific efficiency η_k (0-1)
//   - Mass loading tracking (cumulative mass captured)
//   - Optional dynamic efficiency decay based on loading

struct FilterStage {
    double baseEfficiency;    // η_k base efficiency (0-1)
    double massLoading;       // cumulative captured mass (kg)
    double maxLoading;        // capacity before breakthrough (kg), 0 = infinite
    double decayRate;         // efficiency decay rate with loading (1/kg), 0 = constant

    FilterStage()
        : baseEfficiency(0.9), massLoading(0.0), maxLoading(0.0), decayRate(0.0) {}

    FilterStage(double eff, double maxLoad = 0.0, double decay = 0.0)
        : baseEfficiency(eff), massLoading(0.0), maxLoading(maxLoad), decayRate(decay) {}

    // Current effective efficiency accounting for loading
    double currentEfficiency() const {
        if (decayRate > 0.0 && massLoading > 0.0) {
            // Exponential decay with loading: η(M) = η_base * exp(-decayRate * M)
            return baseEfficiency * std::exp(-decayRate * massLoading);
        }
        if (maxLoading > 0.0 && massLoading >= maxLoading) {
            return 0.0; // Breakthrough
        }
        return baseEfficiency;
    }

    // Update mass loading after filtering
    void addLoading(double massCaptured) {
        massLoading += massCaptured;
    }
};

class SuperFilter {
public:
    SuperFilter() = default;

    void addStage(const FilterStage& stage) { stages_.push_back(stage); }
    void addStage(double efficiency, double maxLoad = 0.0, double decay = 0.0) {
        stages_.emplace_back(efficiency, maxLoad, decay);
    }

    // Compute cascaded efficiency: η_super = 1 - Π(1 - η_k)
    double totalEfficiency() const {
        double penetration = 1.0;
        for (const auto& stage : stages_) {
            penetration *= (1.0 - stage.currentEfficiency());
        }
        return 1.0 - penetration;
    }

    // Update all stages' mass loading given total mass flow through filter
    void updateLoading(double totalMassCaptured) {
        if (stages_.empty()) return;
        // Distribute captured mass across stages proportionally
        double remaining = totalMassCaptured;
        for (auto& stage : stages_) {
            double captured = remaining * stage.currentEfficiency();
            stage.addLoading(captured);
            remaining -= captured;
            if (remaining <= 0.0) break;
        }
    }

    size_t numStages() const { return stages_.size(); }
    const std::vector<FilterStage>& getStages() const { return stages_; }

private:
    std::vector<FilterStage> stages_;
};

} // namespace contam
