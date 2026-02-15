#pragma once

#include <string>
#include <vector>
#include <memory>

#ifdef CONTAM_HAS_SQLITE3

#include "core/Network.h"
#include "core/Species.h"

namespace contam {

class SqliteWriter {
public:
    explicit SqliteWriter(const std::string& filename);
    ~SqliteWriter();

    void writeMetadata(const Network& net, const std::vector<Species>& species);
    void writeSteadyState(const Network& net, const std::vector<double>& concentrations);
    void writeTransientStep(double time, const std::vector<double>& pressures,
                           const std::vector<double>& massFlows,
                           const std::vector<std::vector<double>>& concentrations);
    void finalize();

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace contam

#endif // CONTAM_HAS_SQLITE3
