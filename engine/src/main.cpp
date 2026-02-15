#include "core/Network.h"
#include "core/Solver.h"
#include "core/TransientSimulation.h"
#include "io/JsonReader.h"
#include "io/JsonWriter.h"
#ifdef CONTAM_HAS_HDF5
#include "io/Hdf5Writer.h"
#endif
#include <iostream>
#include <string>

void printUsage(const char* progName) {
    std::cout << "CONTAM-Next Engine v0.2.0\n"
              << "Usage: " << progName << " -i <input.json> -o <output.json> [options]\n"
              << "\nOptions:\n"
              << "  -i <file>    Input JSON file (required)\n"
              << "  -o <file>    Output results JSON file (required)\n"
              << "  -m <method>  Solver method: 'sur' or 'tr' (default: tr)\n"
#ifdef CONTAM_HAS_HDF5
              << "  --hdf5 <file> Also write results to HDF5 file\n"
#endif
              << "  -v           Verbose output\n"
              << "  -h           Show this help\n"
              << "\nTransient mode is auto-detected when input contains 'species' and/or 'transient' sections.\n";
}

int main(int argc, char* argv[]) {
    std::string inputFile;
    std::string outputFile;
    std::string hdf5File;
    contam::SolverMethod method = contam::SolverMethod::TrustRegion;
    bool verbose = false;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "-i" && i + 1 < argc) {
            inputFile = argv[++i];
        } else if (arg == "-o" && i + 1 < argc) {
            outputFile = argv[++i];
        } else if (arg == "-m" && i + 1 < argc) {
            std::string m = argv[++i];
            if (m == "sur") method = contam::SolverMethod::SubRelaxation;
            else if (m == "tr") method = contam::SolverMethod::TrustRegion;
            else {
                std::cerr << "Unknown solver method: " << m << std::endl;
                return 1;
            }
        } else if (arg == "--hdf5" && i + 1 < argc) {
            hdf5File = argv[++i];
#ifndef CONTAM_HAS_HDF5
            std::cerr << "Warning: --hdf5 flag ignored (HDF5 support not compiled in)" << std::endl;
            hdf5File.clear();
#endif
        } else if (arg == "-v") {
            verbose = true;
        } else if (arg == "-h") {
            printUsage(argv[0]);
            return 0;
        }
    }

    if (inputFile.empty() || outputFile.empty()) {
        printUsage(argv[0]);
        return 1;
    }

    try {
        if (verbose) std::cout << "Reading input: " << inputFile << std::endl;
        auto model = contam::JsonReader::readModelFromFile(inputFile);

        if (verbose) {
            std::cout << "Network: " << model.network.getNodeCount() << " nodes, "
                      << model.network.getLinkCount() << " links\n"
                      << "Unknown pressures: " << model.network.getUnknownCount() << "\n";
            if (!model.species.empty()) {
                std::cout << "Species: " << model.species.size() << "\n";
                std::cout << "Sources: " << model.sources.size() << "\n";
            }
        }

        if (model.hasTransient || !model.species.empty()) {
            // ── Transient simulation ──
            if (!model.hasTransient) {
                model.transientConfig.endTime = 3600.0;
                model.transientConfig.timeStep = 60.0;
                model.transientConfig.outputInterval = 60.0;
            }
            model.transientConfig.airflowMethod = method;

            if (verbose) {
                std::cout << "Running transient simulation: "
                          << model.transientConfig.startTime << "s to "
                          << model.transientConfig.endTime << "s (dt="
                          << model.transientConfig.timeStep << "s)..." << std::endl;
            }

            contam::TransientSimulation sim;
            sim.setConfig(model.transientConfig);
            sim.setSpecies(model.species);
            sim.setSources(model.sources);
            sim.setSchedules(model.schedules);
            sim.setZoneTemperatureSchedules(model.zoneTemperatureSchedules);
            sim.setOccupants(model.occupants);
            if (!model.weatherData.empty()) {
                sim.setWeatherData(model.weatherData);
            }
            if (!model.ahSystems.empty()) {
                sim.setAHSystems(model.ahSystems);
            }

            if (verbose) {
                sim.setProgressCallback([](double t, double end) {
                    std::cout << "\r  t=" << t << "/" << end << "s" << std::flush;
                    return true;
                });
            }

            auto result = sim.run(model.network);

            if (verbose) {
                std::cout << "\n" << (result.completed ? "Completed" : "Incomplete")
                          << " (" << result.history.size() << " output steps)" << std::endl;
            }

            contam::JsonWriter::writeTransientToFile(outputFile, model.network, result, model.species);
            if (verbose) std::cout << "Results written to: " << outputFile << std::endl;

#ifdef CONTAM_HAS_HDF5
            if (!hdf5File.empty()) {
                contam::Hdf5Writer::writeTransient(hdf5File, model.network, model.species, result);
                if (verbose) std::cout << "HDF5 results written to: " << hdf5File << std::endl;
            }
#endif

            return result.completed ? 0 : 2;

        } else {
            // ── Steady-state solve ──
            contam::Solver solver(method);
            if (verbose) {
                std::cout << "Solving steady-state with "
                          << (method == contam::SolverMethod::TrustRegion ? "Trust Region" : "Sub-Relaxation")
                          << " method..." << std::endl;
            }

            auto result = solver.solve(model.network);

            if (verbose) {
                std::cout << (result.converged ? "Converged" : "FAILED to converge")
                          << " in " << result.iterations << " iterations"
                          << " (max residual: " << result.maxResidual << " kg/s)" << std::endl;
            }

            contam::JsonWriter::writeToFile(outputFile, model.network, result);
            if (verbose) std::cout << "Results written to: " << outputFile << std::endl;

#ifdef CONTAM_HAS_HDF5
            if (!hdf5File.empty()) {
                contam::Hdf5Writer::writeSteadyState(hdf5File, model.network, result);
                if (verbose) std::cout << "HDF5 results written to: " << hdf5File << std::endl;
            }
#endif

            return result.converged ? 0 : 2;
        }

    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }
}
