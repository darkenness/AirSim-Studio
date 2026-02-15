#pragma once
#include "core/OneDZone.h"
#include "core/Species.h"
#include <vector>
#include <string>
#include <cstdint>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <stdexcept>
#include <cstring>

namespace contam {

// ── Binary file format constants ─────────────────────────────────────
// All four file types (.RXR, .RZF, .RZM, .RZ1) share the same header.
// Magic numbers distinguish them.

static constexpr uint32_t ONED_MAGIC_RXR = 0x52585231;  // "RXR1"
static constexpr uint32_t ONED_MAGIC_RZF = 0x525A4631;  // "RZF1"
static constexpr uint32_t ONED_MAGIC_RZM = 0x525A4D31;  // "RZM1"
static constexpr uint32_t ONED_MAGIC_RZ1 = 0x525A3131;  // "RZ11"
static constexpr uint16_t ONED_FORMAT_VERSION = 1;

// ── Binary header (40 bytes, fixed) ──────────────────────────────────
#pragma pack(push, 1)
struct OneDFileHeader {
    uint32_t magic;
    uint16_t version;
    uint16_t reserved;
    uint32_t numZones;
    uint32_t numSpecies;
    uint32_t numTimeSteps;
    uint32_t maxCellsPerZone;   // max cell count across all zones
    double   startTime;         // seconds
    double   endTime;           // seconds
};
#pragma pack(pop)

static_assert(sizeof(OneDFileHeader) == 40, "OneDFileHeader must be 40 bytes");

// ── Per-zone descriptor (in header block after main header) ──────────
#pragma pack(push, 1)
struct OneDZoneDescriptor {
    uint32_t zoneId;
    uint32_t numCells;
    double   length;            // m
    double   crossSectionArea;  // m^2
};
#pragma pack(pop)

static_assert(sizeof(OneDZoneDescriptor) == 24, "OneDZoneDescriptor must be 24 bytes");

// ── Snapshot data captured per time step per zone ────────────────────

struct OneDZoneSnapshot {
    int zoneId = 0;
    int numCells = 0;
    int numSpecies = 0;

    // concentrations[cell * numSpecies + species] (kg/m^3)
    std::vector<double> concentrations;

    // flow field: velocity at each cell center (m/s), size = numCells
    std::vector<double> velocities;

    // mass balance per cell per species: net flux (kg/s), size = numCells * numSpecies
    std::vector<double> massFluxes;
};

struct OneDTimeStep {
    double time = 0.0;
    std::vector<OneDZoneSnapshot> zones;
};

// ── Zone metadata for registration ───────────────────────────────────

struct OneDZoneInfo {
    int zoneId;
    int numCells;
    double length;
    double crossSectionArea;
};

// ── Writer ───────────────────────────────────────────────────────────

class OneDOutputWriter {
public:
    // Register zones before recording. Call once per 1D zone.
    void registerZone(int zoneId, const OneDZone& zone);
    void registerZone(const OneDZoneInfo& info);

    void setSpeciesCount(int n) { numSpecies_ = n; }

    // Record a snapshot for one zone at a given time.
    // concentrations: cell-major, size = numCells * numSpecies
    // velocity: per-cell velocity (m/s), size = numCells (can be empty)
    // massFlux: per-cell per-species net flux (kg/s), size = numCells * numSpecies (can be empty)
    void recordSnapshot(double time, int zoneId,
                        const std::vector<double>& concentrations,
                        const std::vector<double>& velocities = {},
                        const std::vector<double>& massFluxes = {});

    // Convenience: record directly from a OneDZone object
    void recordFromZone(double time, int zoneId, const OneDZone& zone,
                        double flowRate = 0.0, double density = 1.2);

    // Write binary files
    void writeRXR(const std::string& path) const;  // concentration distribution
    void writeRZF(const std::string& path) const;  // flow field
    void writeRZM(const std::string& path) const;  // mass balance
    void writeRZ1(const std::string& path) const;  // combined summary

    // Write text/CSV for debugging
    std::string formatTextRXR() const;
    std::string formatCsvRXR() const;
    std::string formatTextRZ1() const;
    std::string formatCsvRZ1() const;

    // Access recorded data
    const std::vector<OneDTimeStep>& getTimeSteps() const { return timeSteps_; }
    const std::vector<OneDZoneInfo>& getZoneInfos() const { return zoneInfos_; }
    int numSpecies() const { return numSpecies_; }

    void clear();

private:
    std::vector<OneDZoneInfo> zoneInfos_;
    std::vector<OneDTimeStep> timeSteps_;
    int numSpecies_ = 0;

    // Find or create time step entry
    OneDTimeStep& getOrCreateTimeStep(double time);
    int findZoneIndex(int zoneId) const;
    uint32_t maxCellsPerZone() const;

    void writeHeader(std::ofstream& out, uint32_t magic) const;
    void writeZoneDescriptors(std::ofstream& out) const;
};

// ── Reader (for post-processing) ─────────────────────────────────────

class OneDOutputReader {
public:
    // Read any of the four binary formats
    bool readFile(const std::string& path);

    // Accessors
    uint32_t magic() const { return header_.magic; }
    uint16_t version() const { return header_.version; }
    uint32_t numZones() const { return header_.numZones; }
    uint32_t numSpecies() const { return header_.numSpecies; }
    uint32_t numTimeSteps() const { return header_.numTimeSteps; }
    uint32_t maxCellsPerZone() const { return header_.maxCellsPerZone; }
    double startTime() const { return header_.startTime; }
    double endTime() const { return header_.endTime; }

    const std::vector<OneDZoneDescriptor>& zoneDescriptors() const { return zoneDescs_; }
    const std::vector<OneDTimeStep>& timeSteps() const { return timeSteps_; }

    // Query helpers
    // Get concentration at a specific time step, zone, cell, species
    double getConcentration(int timeIdx, int zoneIdx, int cell, int species) const;
    double getVelocity(int timeIdx, int zoneIdx, int cell) const;
    double getMassFlux(int timeIdx, int zoneIdx, int cell, int species) const;

    // Get all cell concentrations for a zone at a time step for one species
    std::vector<double> getCellProfile(int timeIdx, int zoneIdx, int species) const;

private:
    OneDFileHeader header_{};
    std::vector<OneDZoneDescriptor> zoneDescs_;
    std::vector<OneDTimeStep> timeSteps_;

    bool readDataBlocks(std::ifstream& in);
};

} // namespace contam
