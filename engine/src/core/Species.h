#pragma once
#include <string>
#include <vector>

namespace contam {

struct Species {
    int id;
    std::string name;
    double molarMass;          // kg/mol (e.g., CO2 = 0.044)
    double decayRate;          // 1/s, first-order decay constant (0 = no decay)
    double outdoorConc;        // kg/m³, outdoor background concentration
    bool isTrace;              // true = trace (no density feedback), false = non-trace (affects density)
    double diffusionCoeff;     // m²/s, molecular diffusion coefficient (for 1D zone advection-diffusion)
    double meanDiameter;       // m, mean aerodynamic diameter (for particle filter efficiency lookup)
    double effectiveDensity;   // kg/m³, particle effective density (for mass↔count conversion)

    Species()
        : id(0), molarMass(0.029), decayRate(0.0), outdoorConc(0.0), isTrace(true),
          diffusionCoeff(0.0), meanDiameter(0.0), effectiveDensity(0.0) {}
    Species(int id, const std::string& name, double molarMass = 0.029,
            double decayRate = 0.0, double outdoorConc = 0.0, bool trace = true)
        : id(id), name(name), molarMass(molarMass),
          decayRate(decayRate), outdoorConc(outdoorConc), isTrace(trace),
          diffusionCoeff(0.0), meanDiameter(0.0), effectiveDensity(0.0) {}
};

// Source type enumeration
enum class SourceType {
    Constant,           // S = G * schedule(t) - R * C  (constant coefficient)
    ExponentialDecay,   // S = mult * G0 * exp(-t_elapsed / tau_c)  (liquid spill, spray)
    PressureDriven,     // Source driven by pressure difference
    CutoffConcentration // Source with concentration cutoff
};

// Source/Sink model for a species in a zone
struct Source {
    int zoneId;          // which zone this source is in
    int speciesId;       // which species
    SourceType type;
    double generationRate; // kg/s (base generation rate, G0 for decay)
    double removalRate;    // 1/s (first-order removal rate coefficient, sink)
    int scheduleId;        // schedule ID for time-varying (-1 = always on)

    // ExponentialDecay specific:
    double decayTimeConstant; // τ_c (seconds), time constant for exponential decay
    double startTime;         // when the source was activated (s)
    double multiplier;        // scaling multiplier (default 1.0)

    // PressureDriven specific:
    double pressureCoeff;     // generation rate per Pa of pressure difference (kg/(s·Pa))

    // CutoffConcentration specific:
    double cutoffConc;        // concentration threshold (kg/m³), source stops when C >= cutoff

    Source()
        : zoneId(0), speciesId(0), type(SourceType::Constant),
          generationRate(0.0), removalRate(0.0), scheduleId(-1),
          decayTimeConstant(3600.0), startTime(0.0), multiplier(1.0),
          pressureCoeff(0.0), cutoffConc(0.0) {}

    Source(int zoneId, int speciesId, double genRate, double remRate = 0.0,
           int schedId = -1)
        : zoneId(zoneId), speciesId(speciesId), type(SourceType::Constant),
          generationRate(genRate), removalRate(remRate), scheduleId(schedId),
          decayTimeConstant(3600.0), startTime(0.0), multiplier(1.0),
          pressureCoeff(0.0), cutoffConc(0.0) {}

    // Factory for exponential decay source
    static Source makeDecay(int zoneId, int speciesId, double G0, double tauC,
                            double startT = 0.0, double mult = 1.0) {
        Source s;
        s.zoneId = zoneId;
        s.speciesId = speciesId;
        s.type = SourceType::ExponentialDecay;
        s.generationRate = G0;
        s.decayTimeConstant = tauC;
        s.startTime = startT;
        s.multiplier = mult;
        return s;
    }

    // Factory for pressure-driven source: G = pressureCoeff * |P_zone|
    static Source makePressureDriven(int zoneId, int speciesId, double pCoeff) {
        Source s;
        s.zoneId = zoneId;
        s.speciesId = speciesId;
        s.type = SourceType::PressureDriven;
        s.pressureCoeff = pCoeff;
        return s;
    }

    // Factory for cutoff source: G = genRate when C < cutoff, 0 otherwise
    static Source makeCutoff(int zoneId, int speciesId, double genRate, double cutoff) {
        Source s;
        s.zoneId = zoneId;
        s.speciesId = speciesId;
        s.type = SourceType::CutoffConcentration;
        s.generationRate = genRate;
        s.cutoffConc = cutoff;
        return s;
    }
};

} // namespace contam
