#ifdef CONTAM_HAS_HDF5

#include "io/Hdf5Writer.h"
#include <highfive/H5File.hpp>
#include <highfive/H5DataSet.hpp>
#include <highfive/H5DataSpace.hpp>

namespace contam {

void Hdf5Writer::writeSteadyState(const std::string& filepath,
                                   const Network& network,
                                   const SolverResult& result) {
    HighFive::File file(filepath, HighFive::File::Overwrite);

    auto meta = file.createGroup("metadata");
    meta.createAttribute("nodeCount", network.getNodeCount());
    meta.createAttribute("linkCount", network.getLinkCount());
    meta.createAttribute("converged", result.converged);
    meta.createAttribute("iterations", result.iterations);
    meta.createAttribute("maxResidual", result.maxResidual);

    // Node data
    auto nodesGrp = file.createGroup("nodes");
    const int nNodes = network.getNodeCount();

    std::vector<double> pressures(nNodes), densities(nNodes), temperatures(nNodes), elevations(nNodes);
    std::vector<std::string> names(nNodes);

    for (int i = 0; i < nNodes; ++i) {
        const auto& node = network.getNode(i);
        pressures[i] = node.getPressure();
        densities[i] = node.getDensity();
        temperatures[i] = node.getTemperature();
        elevations[i] = node.getElevation();
        names[i] = node.getName();
    }

    nodesGrp.createDataSet("pressure", pressures);
    nodesGrp.createDataSet("density", densities);
    nodesGrp.createDataSet("temperature", temperatures);
    nodesGrp.createDataSet("elevation", elevations);
    nodesGrp.createDataSet("name", names);

    // Link data
    auto linksGrp = file.createGroup("links");
    const int nLinks = network.getLinkCount();

    std::vector<double> massFlows(nLinks), volFlows(nLinks);
    for (int i = 0; i < nLinks; ++i) {
        const auto& link = network.getLink(i);
        massFlows[i] = link.getMassFlow();
        volFlows[i] = link.getVolumeFlow();
    }

    linksGrp.createDataSet("massFlow", massFlows);
    linksGrp.createDataSet("volumeFlow", volFlows);
}

void Hdf5Writer::writeTransient(const std::string& filepath,
                                 const Network& network,
                                 const std::vector<Species>& species,
                                 const TransientResult& result) {
    HighFive::File file(filepath, HighFive::File::Overwrite);

    const int nSteps = static_cast<int>(result.history.size());
    const int nNodes = network.getNodeCount();
    const int nSpecies = static_cast<int>(species.size());
    const int nLinks = network.getLinkCount();

    // Metadata
    auto meta = file.createGroup("metadata");
    meta.createAttribute("completed", result.completed);
    meta.createAttribute("timeSteps", nSteps);
    meta.createAttribute("nodeCount", nNodes);
    meta.createAttribute("linkCount", nLinks);
    meta.createAttribute("speciesCount", nSpecies);

    // Species names
    std::vector<std::string> speciesNames(nSpecies);
    for (int s = 0; s < nSpecies; ++s) {
        speciesNames[s] = species[s].name;
    }
    file.createDataSet("speciesNames", speciesNames);

    // Node names
    std::vector<std::string> nodeNames(nNodes);
    for (int i = 0; i < nNodes; ++i) {
        nodeNames[i] = network.getNode(i).getName();
    }
    file.createDataSet("nodeNames", nodeNames);

    // Time vector
    std::vector<double> times(nSteps);
    for (int t = 0; t < nSteps; ++t) {
        times[t] = result.history[t].time;
    }
    file.createDataSet("time", times);

    // Pressures: [nSteps x nNodes]
    std::vector<std::vector<double>> pressures(nSteps, std::vector<double>(nNodes, 0.0));
    for (int t = 0; t < nSteps; ++t) {
        const auto& af = result.history[t].airflow;
        for (int i = 0; i < nNodes && i < static_cast<int>(af.pressures.size()); ++i) {
            pressures[t][i] = af.pressures[i];
        }
    }
    file.createDataSet("pressures", pressures);

    // Mass flows: [nSteps x nLinks]
    std::vector<std::vector<double>> flows(nSteps, std::vector<double>(nLinks, 0.0));
    for (int t = 0; t < nSteps; ++t) {
        const auto& af = result.history[t].airflow;
        for (int i = 0; i < nLinks && i < static_cast<int>(af.massFlows.size()); ++i) {
            flows[t][i] = af.massFlows[i];
        }
    }
    file.createDataSet("massFlows", flows);

    // Concentrations: [nSteps x nNodes x nSpecies]
    // HDF5 via HighFive supports nested vectors for 3D
    std::vector<std::vector<std::vector<double>>> conc(
        nSteps, std::vector<std::vector<double>>(nNodes, std::vector<double>(nSpecies, 0.0)));

    for (int t = 0; t < nSteps; ++t) {
        const auto& cr = result.history[t].contaminant;
        for (int i = 0; i < nNodes && i < static_cast<int>(cr.concentrations.size()); ++i) {
            for (int s = 0; s < nSpecies && s < static_cast<int>(cr.concentrations[i].size()); ++s) {
                conc[t][i][s] = cr.concentrations[i][s];
            }
        }
    }
    file.createDataSet("concentrations", conc);
}

} // namespace contam

#endif // CONTAM_HAS_HDF5
