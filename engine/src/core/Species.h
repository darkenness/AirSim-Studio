#pragma once
#include <string>
#include <vector>

namespace contam {

struct Species {
    int id;
    std::string name;
    double molarMass;      // kg/mol (e.g., CO2 = 0.044)
    double decayRate;      // 1/s, first-order decay constant (0 = no decay)
    double outdoorConc;    // kg/m³, outdoor background concentration

    Species() : id(0), molarMass(0.029), decayRate(0.0), outdoorConc(0.0) {}
    Species(int id, const std::string& name, double molarMass = 0.029,
            double decayRate = 0.0, double outdoorConc = 0.0)
        : id(id), name(name), molarMass(molarMass),
          decayRate(decayRate), outdoorConc(outdoorConc) {}
};

// Source type enumeration
enum class SourceType {
    Constant,           // Constant generation rate (kg/s)
    PressureDriven,     // Source driven by pressure difference
    CutoffConcentration // Source with concentration cutoff
};

// Source/Sink model for a species in a zone
struct Source {
    int zoneId;          // which zone this source is in
    int speciesId;       // which species
    SourceType type;
    double generationRate; // kg/s (base generation rate)
    double removalRate;    // 1/s (first-order removal rate coefficient, sink)
    int scheduleId;        // schedule ID for time-varying (-1 = always on)

    Source()
        : zoneId(0), speciesId(0), type(SourceType::Constant),
          generationRate(0.0), removalRate(0.0), scheduleId(-1) {}

    Source(int zoneId, int speciesId, double genRate, double remRate = 0.0,
           int schedId = -1)
        : zoneId(zoneId), speciesId(speciesId), type(SourceType::Constant),
          generationRate(genRate), removalRate(remRate), scheduleId(schedId) {}
};

} // namespace contam
