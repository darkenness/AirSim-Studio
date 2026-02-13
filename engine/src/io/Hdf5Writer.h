#pragma once

#ifdef CONTAM_HAS_HDF5

#include "core/Network.h"
#include "core/Solver.h"
#include "core/TransientSimulation.h"
#include "core/Species.h"
#include <string>
#include <vector>

namespace contam {

// HDF5 output writer for CONTAM simulation results
// Requires HDF5 C library + HighFive header-only wrapper
class Hdf5Writer {
public:
    // Write steady-state results to HDF5 file
    static void writeSteadyState(const std::string& filepath,
                                 const Network& network,
                                 const SolverResult& result);

    // Write transient results to HDF5 file
    static void writeTransient(const std::string& filepath,
                               const Network& network,
                               const std::vector<Species>& species,
                               const TransientResult& result);
};

} // namespace contam

#endif // CONTAM_HAS_HDF5
