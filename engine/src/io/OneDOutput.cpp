#include "io/OneDOutput.h"
#include <algorithm>
#include <cmath>
#include <numeric>

namespace contam {

// ── OneDOutputWriter ─────────────────────────────────────────────────

void OneDOutputWriter::registerZone(int zoneId, const OneDZone& zone) {
    OneDZoneInfo info;
    info.zoneId = zoneId;
    info.numCells = zone.numCells();
    info.length = zone.length();
    info.crossSectionArea = zone.crossSectionArea();
    registerZone(info);
}

void OneDOutputWriter::registerZone(const OneDZoneInfo& info) {
    // Avoid duplicates
    for (const auto& z : zoneInfos_) {
        if (z.zoneId == info.zoneId) return;
    }
    zoneInfos_.push_back(info);
}

void OneDOutputWriter::recordSnapshot(double time, int zoneId,
                                       const std::vector<double>& concentrations,
                                       const std::vector<double>& velocities,
                                       const std::vector<double>& massFluxes) {
    int zi = findZoneIndex(zoneId);
    if (zi < 0) return;  // zone not registered

    auto& ts = getOrCreateTimeStep(time);

    OneDZoneSnapshot snap;
    snap.zoneId = zoneId;
    snap.numCells = zoneInfos_[zi].numCells;
    snap.numSpecies = numSpecies_;
    snap.concentrations = concentrations;
    snap.velocities = velocities;
    snap.massFluxes = massFluxes;

    // Find existing snapshot for this zone in this timestep, or add new
    for (auto& existing : ts.zones) {
        if (existing.zoneId == zoneId) {
            existing = snap;
            return;
        }
    }
    ts.zones.push_back(snap);
}

void OneDOutputWriter::recordFromZone(double time, int zoneId, const OneDZone& zone,
                                       double flowRate, double density) {
    int nc = zone.numCells();
    int ns = zone.numSpecies();

    // Extract concentrations
    std::vector<double> conc(nc * ns);
    for (int i = 0; i < nc; ++i) {
        for (int s = 0; s < ns; ++s) {
            conc[i * ns + s] = zone.getConcentration(i, s);
        }
    }

    // Compute velocity field (uniform for now, from bulk flow)
    std::vector<double> vel(nc, 0.0);
    if (density > 0.0 && zone.crossSectionArea() > 0.0) {
        double u = flowRate / (density * zone.crossSectionArea());
        for (int i = 0; i < nc; ++i) {
            vel[i] = u;
        }
    }

    // Compute mass flux per cell per species (advective component)
    // flux = velocity * area * concentration
    std::vector<double> flux(nc * ns, 0.0);
    double area = zone.crossSectionArea();
    for (int i = 0; i < nc; ++i) {
        for (int s = 0; s < ns; ++s) {
            flux[i * ns + s] = vel[i] * area * conc[i * ns + s];
        }
    }

    recordSnapshot(time, zoneId, conc, vel, flux);
}

void OneDOutputWriter::clear() {
    zoneInfos_.clear();
    timeSteps_.clear();
    numSpecies_ = 0;
}

OneDTimeStep& OneDOutputWriter::getOrCreateTimeStep(double time) {
    // Find existing with tolerance
    for (auto& ts : timeSteps_) {
        if (std::abs(ts.time - time) < 1e-10) return ts;
    }
    // Create new, maintaining sorted order
    OneDTimeStep newTs;
    newTs.time = time;
    auto it = std::lower_bound(timeSteps_.begin(), timeSteps_.end(), time,
        [](const OneDTimeStep& a, double t) { return a.time < t; });
    auto inserted = timeSteps_.insert(it, newTs);
    return *inserted;
}

int OneDOutputWriter::findZoneIndex(int zoneId) const {
    for (int i = 0; i < static_cast<int>(zoneInfos_.size()); ++i) {
        if (zoneInfos_[i].zoneId == zoneId) return i;
    }
    return -1;
}

uint32_t OneDOutputWriter::maxCellsPerZone() const {
    uint32_t mx = 0;
    for (const auto& z : zoneInfos_) {
        mx = std::max(mx, static_cast<uint32_t>(z.numCells));
    }
    return mx;
}

void OneDOutputWriter::writeHeader(std::ofstream& out, uint32_t magic) const {
    OneDFileHeader hdr{};
    hdr.magic = magic;
    hdr.version = ONED_FORMAT_VERSION;
    hdr.reserved = 0;
    hdr.numZones = static_cast<uint32_t>(zoneInfos_.size());
    hdr.numSpecies = static_cast<uint32_t>(numSpecies_);
    hdr.numTimeSteps = static_cast<uint32_t>(timeSteps_.size());
    hdr.maxCellsPerZone = maxCellsPerZone();
    hdr.startTime = timeSteps_.empty() ? 0.0 : timeSteps_.front().time;
    hdr.endTime = timeSteps_.empty() ? 0.0 : timeSteps_.back().time;
    out.write(reinterpret_cast<const char*>(&hdr), sizeof(hdr));
}

void OneDOutputWriter::writeZoneDescriptors(std::ofstream& out) const {
    for (const auto& z : zoneInfos_) {
        OneDZoneDescriptor desc{};
        desc.zoneId = static_cast<uint32_t>(z.zoneId);
        desc.numCells = static_cast<uint32_t>(z.numCells);
        desc.length = z.length;
        desc.crossSectionArea = z.crossSectionArea;
        out.write(reinterpret_cast<const char*>(&desc), sizeof(desc));
    }
}

// ── .RXR: concentration distribution ─────────────────────────────────
// Layout: header | zone descriptors | for each timestep { time(f64) | for each zone { conc[cells*species](f64) } }

void OneDOutputWriter::writeRXR(const std::string& path) const {
    std::ofstream out(path, std::ios::binary);
    if (!out) throw std::runtime_error("Cannot open " + path + " for writing");

    writeHeader(out, ONED_MAGIC_RXR);
    writeZoneDescriptors(out);

    for (const auto& ts : timeSteps_) {
        out.write(reinterpret_cast<const char*>(&ts.time), sizeof(double));
        for (const auto& zi : zoneInfos_) {
            // Find snapshot for this zone
            const OneDZoneSnapshot* snap = nullptr;
            for (const auto& s : ts.zones) {
                if (s.zoneId == zi.zoneId) { snap = &s; break; }
            }
            int dataSize = zi.numCells * numSpecies_;
            if (snap && static_cast<int>(snap->concentrations.size()) >= dataSize) {
                out.write(reinterpret_cast<const char*>(snap->concentrations.data()),
                          dataSize * sizeof(double));
            } else {
                // Write zeros if no data
                std::vector<double> zeros(dataSize, 0.0);
                out.write(reinterpret_cast<const char*>(zeros.data()),
                          dataSize * sizeof(double));
            }
        }
    }
}

// ── .RZF: flow field ─────────────────────────────────────────────────
// Layout: header | zone descriptors | for each timestep { time(f64) | for each zone { velocity[cells](f64) } }

void OneDOutputWriter::writeRZF(const std::string& path) const {
    std::ofstream out(path, std::ios::binary);
    if (!out) throw std::runtime_error("Cannot open " + path + " for writing");

    writeHeader(out, ONED_MAGIC_RZF);
    writeZoneDescriptors(out);

    for (const auto& ts : timeSteps_) {
        out.write(reinterpret_cast<const char*>(&ts.time), sizeof(double));
        for (const auto& zi : zoneInfos_) {
            const OneDZoneSnapshot* snap = nullptr;
            for (const auto& s : ts.zones) {
                if (s.zoneId == zi.zoneId) { snap = &s; break; }
            }
            if (snap && static_cast<int>(snap->velocities.size()) >= zi.numCells) {
                out.write(reinterpret_cast<const char*>(snap->velocities.data()),
                          zi.numCells * sizeof(double));
            } else {
                std::vector<double> zeros(zi.numCells, 0.0);
                out.write(reinterpret_cast<const char*>(zeros.data()),
                          zi.numCells * sizeof(double));
            }
        }
    }
}

// ── .RZM: mass balance ───────────────────────────────────────────────
// Layout: header | zone descriptors | for each timestep { time(f64) | for each zone { flux[cells*species](f64) } }

void OneDOutputWriter::writeRZM(const std::string& path) const {
    std::ofstream out(path, std::ios::binary);
    if (!out) throw std::runtime_error("Cannot open " + path + " for writing");

    writeHeader(out, ONED_MAGIC_RZM);
    writeZoneDescriptors(out);

    for (const auto& ts : timeSteps_) {
        out.write(reinterpret_cast<const char*>(&ts.time), sizeof(double));
        for (const auto& zi : zoneInfos_) {
            const OneDZoneSnapshot* snap = nullptr;
            for (const auto& s : ts.zones) {
                if (s.zoneId == zi.zoneId) { snap = &s; break; }
            }
            int dataSize = zi.numCells * numSpecies_;
            if (snap && static_cast<int>(snap->massFluxes.size()) >= dataSize) {
                out.write(reinterpret_cast<const char*>(snap->massFluxes.data()),
                          dataSize * sizeof(double));
            } else {
                std::vector<double> zeros(dataSize, 0.0);
                out.write(reinterpret_cast<const char*>(zeros.data()),
                          dataSize * sizeof(double));
            }
        }
    }
}

// ── .RZ1: combined summary ───────────────────────────────────────────
// Layout: header | zone descriptors | for each timestep { time(f64) | for each zone {
//   conc[cells*species](f64) | velocity[cells](f64) | flux[cells*species](f64)
// }}

void OneDOutputWriter::writeRZ1(const std::string& path) const {
    std::ofstream out(path, std::ios::binary);
    if (!out) throw std::runtime_error("Cannot open " + path + " for writing");

    writeHeader(out, ONED_MAGIC_RZ1);
    writeZoneDescriptors(out);

    for (const auto& ts : timeSteps_) {
        out.write(reinterpret_cast<const char*>(&ts.time), sizeof(double));
        for (const auto& zi : zoneInfos_) {
            const OneDZoneSnapshot* snap = nullptr;
            for (const auto& s : ts.zones) {
                if (s.zoneId == zi.zoneId) { snap = &s; break; }
            }
            int concSize = zi.numCells * numSpecies_;
            int velSize = zi.numCells;

            // Concentrations
            if (snap && static_cast<int>(snap->concentrations.size()) >= concSize) {
                out.write(reinterpret_cast<const char*>(snap->concentrations.data()),
                          concSize * sizeof(double));
            } else {
                std::vector<double> zeros(concSize, 0.0);
                out.write(reinterpret_cast<const char*>(zeros.data()),
                          concSize * sizeof(double));
            }

            // Velocities
            if (snap && static_cast<int>(snap->velocities.size()) >= velSize) {
                out.write(reinterpret_cast<const char*>(snap->velocities.data()),
                          velSize * sizeof(double));
            } else {
                std::vector<double> zeros(velSize, 0.0);
                out.write(reinterpret_cast<const char*>(zeros.data()),
                          zeros.size() * sizeof(double));
            }

            // Mass fluxes
            if (snap && static_cast<int>(snap->massFluxes.size()) >= concSize) {
                out.write(reinterpret_cast<const char*>(snap->massFluxes.data()),
                          concSize * sizeof(double));
            } else {
                std::vector<double> zeros(concSize, 0.0);
                out.write(reinterpret_cast<const char*>(zeros.data()),
                          concSize * sizeof(double));
            }
        }
    }
}

// ── Text/CSV formatters ──────────────────────────────────────────────

std::string OneDOutputWriter::formatTextRXR() const {
    std::ostringstream os;
    os << std::fixed << std::setprecision(6);
    os << "=== 1D Zone Concentration Distribution (RXR) ===\n\n";

    for (const auto& ts : timeSteps_) {
        os << "Time = " << ts.time << " s\n";
        for (const auto& snap : ts.zones) {
            os << "  Zone " << snap.zoneId
               << " (" << snap.numCells << " cells, " << snap.numSpecies << " species):\n";
            os << "    Cell";
            for (int s = 0; s < snap.numSpecies; ++s) {
                os << std::setw(14) << ("Sp" + std::to_string(s));
            }
            os << "\n";
            for (int i = 0; i < snap.numCells; ++i) {
                os << "    " << std::setw(4) << i;
                for (int s = 0; s < snap.numSpecies; ++s) {
                    int idx = i * snap.numSpecies + s;
                    double val = (idx < static_cast<int>(snap.concentrations.size()))
                                 ? snap.concentrations[idx] : 0.0;
                    os << std::setw(14) << val;
                }
                os << "\n";
            }
        }
        os << "\n";
    }
    return os.str();
}

std::string OneDOutputWriter::formatCsvRXR() const {
    std::ostringstream os;
    os << std::fixed << std::setprecision(9);
    os << "Time,ZoneId,Cell,Species,Concentration\n";

    for (const auto& ts : timeSteps_) {
        for (const auto& snap : ts.zones) {
            for (int i = 0; i < snap.numCells; ++i) {
                for (int s = 0; s < snap.numSpecies; ++s) {
                    int idx = i * snap.numSpecies + s;
                    double val = (idx < static_cast<int>(snap.concentrations.size()))
                                 ? snap.concentrations[idx] : 0.0;
                    os << ts.time << "," << snap.zoneId << ","
                       << i << "," << s << "," << val << "\n";
                }
            }
        }
    }
    return os.str();
}

std::string OneDOutputWriter::formatTextRZ1() const {
    std::ostringstream os;
    os << std::fixed << std::setprecision(6);
    os << "=== 1D Zone Combined Summary (RZ1) ===\n\n";

    for (const auto& ts : timeSteps_) {
        os << "Time = " << ts.time << " s\n";
        for (const auto& snap : ts.zones) {
            os << "  Zone " << snap.zoneId << ":\n";
            os << "    Cell  Velocity";
            for (int s = 0; s < snap.numSpecies; ++s) {
                os << std::setw(14) << ("Conc_Sp" + std::to_string(s));
                os << std::setw(14) << ("Flux_Sp" + std::to_string(s));
            }
            os << "\n";
            for (int i = 0; i < snap.numCells; ++i) {
                os << "    " << std::setw(4) << i;
                double vel = (i < static_cast<int>(snap.velocities.size()))
                             ? snap.velocities[i] : 0.0;
                os << std::setw(10) << vel;
                for (int s = 0; s < snap.numSpecies; ++s) {
                    int idx = i * snap.numSpecies + s;
                    double conc = (idx < static_cast<int>(snap.concentrations.size()))
                                  ? snap.concentrations[idx] : 0.0;
                    double flux = (idx < static_cast<int>(snap.massFluxes.size()))
                                  ? snap.massFluxes[idx] : 0.0;
                    os << std::setw(14) << conc << std::setw(14) << flux;
                }
                os << "\n";
            }
        }
        os << "\n";
    }
    return os.str();
}

std::string OneDOutputWriter::formatCsvRZ1() const {
    std::ostringstream os;
    os << std::fixed << std::setprecision(9);
    os << "Time,ZoneId,Cell,Velocity,Species,Concentration,MassFlux\n";

    for (const auto& ts : timeSteps_) {
        for (const auto& snap : ts.zones) {
            for (int i = 0; i < snap.numCells; ++i) {
                double vel = (i < static_cast<int>(snap.velocities.size()))
                             ? snap.velocities[i] : 0.0;
                for (int s = 0; s < snap.numSpecies; ++s) {
                    int idx = i * snap.numSpecies + s;
                    double conc = (idx < static_cast<int>(snap.concentrations.size()))
                                  ? snap.concentrations[idx] : 0.0;
                    double flux = (idx < static_cast<int>(snap.massFluxes.size()))
                                  ? snap.massFluxes[idx] : 0.0;
                    os << ts.time << "," << snap.zoneId << ","
                       << i << "," << vel << ","
                       << s << "," << conc << "," << flux << "\n";
                }
            }
        }
    }
    return os.str();
}

// ── OneDOutputReader ─────────────────────────────────────────────────

bool OneDOutputReader::readFile(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return false;

    // Read header
    in.read(reinterpret_cast<char*>(&header_), sizeof(header_));
    if (!in || in.gcount() != sizeof(header_)) return false;

    // Validate magic
    if (header_.magic != ONED_MAGIC_RXR &&
        header_.magic != ONED_MAGIC_RZF &&
        header_.magic != ONED_MAGIC_RZM &&
        header_.magic != ONED_MAGIC_RZ1) {
        return false;
    }

    if (header_.version != ONED_FORMAT_VERSION) return false;

    // Read zone descriptors
    zoneDescs_.resize(header_.numZones);
    for (uint32_t i = 0; i < header_.numZones; ++i) {
        in.read(reinterpret_cast<char*>(&zoneDescs_[i]), sizeof(OneDZoneDescriptor));
        if (!in) return false;
    }

    return readDataBlocks(in);
}

bool OneDOutputReader::readDataBlocks(std::ifstream& in) {
    timeSteps_.clear();
    timeSteps_.resize(header_.numTimeSteps);

    for (uint32_t t = 0; t < header_.numTimeSteps; ++t) {
        double time;
        in.read(reinterpret_cast<char*>(&time), sizeof(double));
        if (!in) return false;
        timeSteps_[t].time = time;
        timeSteps_[t].zones.resize(header_.numZones);

        for (uint32_t z = 0; z < header_.numZones; ++z) {
            auto& snap = timeSteps_[t].zones[z];
            snap.zoneId = static_cast<int>(zoneDescs_[z].zoneId);
            snap.numCells = static_cast<int>(zoneDescs_[z].numCells);
            snap.numSpecies = static_cast<int>(header_.numSpecies);

            int nc = snap.numCells;
            int ns = snap.numSpecies;

            if (header_.magic == ONED_MAGIC_RXR) {
                // Concentration only
                snap.concentrations.resize(nc * ns);
                in.read(reinterpret_cast<char*>(snap.concentrations.data()),
                        nc * ns * sizeof(double));
            } else if (header_.magic == ONED_MAGIC_RZF) {
                // Velocity only
                snap.velocities.resize(nc);
                in.read(reinterpret_cast<char*>(snap.velocities.data()),
                        nc * sizeof(double));
            } else if (header_.magic == ONED_MAGIC_RZM) {
                // Mass flux only
                snap.massFluxes.resize(nc * ns);
                in.read(reinterpret_cast<char*>(snap.massFluxes.data()),
                        nc * ns * sizeof(double));
            } else if (header_.magic == ONED_MAGIC_RZ1) {
                // Combined: conc + vel + flux
                snap.concentrations.resize(nc * ns);
                in.read(reinterpret_cast<char*>(snap.concentrations.data()),
                        nc * ns * sizeof(double));
                snap.velocities.resize(nc);
                in.read(reinterpret_cast<char*>(snap.velocities.data()),
                        nc * sizeof(double));
                snap.massFluxes.resize(nc * ns);
                in.read(reinterpret_cast<char*>(snap.massFluxes.data()),
                        nc * ns * sizeof(double));
            }

            if (!in) return false;
        }
    }
    return true;
}

double OneDOutputReader::getConcentration(int timeIdx, int zoneIdx, int cell, int species) const {
    if (timeIdx < 0 || timeIdx >= static_cast<int>(timeSteps_.size())) return 0.0;
    const auto& ts = timeSteps_[timeIdx];
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(ts.zones.size())) return 0.0;
    const auto& snap = ts.zones[zoneIdx];
    int idx = cell * snap.numSpecies + species;
    if (idx < 0 || idx >= static_cast<int>(snap.concentrations.size())) return 0.0;
    return snap.concentrations[idx];
}

double OneDOutputReader::getVelocity(int timeIdx, int zoneIdx, int cell) const {
    if (timeIdx < 0 || timeIdx >= static_cast<int>(timeSteps_.size())) return 0.0;
    const auto& ts = timeSteps_[timeIdx];
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(ts.zones.size())) return 0.0;
    const auto& snap = ts.zones[zoneIdx];
    if (cell < 0 || cell >= static_cast<int>(snap.velocities.size())) return 0.0;
    return snap.velocities[cell];
}

double OneDOutputReader::getMassFlux(int timeIdx, int zoneIdx, int cell, int species) const {
    if (timeIdx < 0 || timeIdx >= static_cast<int>(timeSteps_.size())) return 0.0;
    const auto& ts = timeSteps_[timeIdx];
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(ts.zones.size())) return 0.0;
    const auto& snap = ts.zones[zoneIdx];
    int idx = cell * snap.numSpecies + species;
    if (idx < 0 || idx >= static_cast<int>(snap.massFluxes.size())) return 0.0;
    return snap.massFluxes[idx];
}

std::vector<double> OneDOutputReader::getCellProfile(int timeIdx, int zoneIdx, int species) const {
    std::vector<double> profile;
    if (timeIdx < 0 || timeIdx >= static_cast<int>(timeSteps_.size())) return profile;
    const auto& ts = timeSteps_[timeIdx];
    if (zoneIdx < 0 || zoneIdx >= static_cast<int>(ts.zones.size())) return profile;
    const auto& snap = ts.zones[zoneIdx];

    profile.resize(snap.numCells);
    for (int i = 0; i < snap.numCells; ++i) {
        int idx = i * snap.numSpecies + species;
        profile[i] = (idx >= 0 && idx < static_cast<int>(snap.concentrations.size()))
                     ? snap.concentrations[idx] : 0.0;
    }
    return profile;
}

} // namespace contam
