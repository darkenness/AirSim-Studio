#include "io/JsonReader.h"
#include "elements/PowerLawOrifice.h"
#include "elements/Fan.h"
#include "elements/TwoWayFlow.h"
#include "elements/Duct.h"
#include <nlohmann/json.hpp>
#include <fstream>
#include <stdexcept>

using json = nlohmann::json;

namespace contam {

Network JsonReader::readFromFile(const std::string& filepath) {
    std::ifstream ifs(filepath);
    if (!ifs.is_open()) {
        throw std::runtime_error("Cannot open file: " + filepath);
    }
    json j;
    ifs >> j;
    return readFromString(j.dump());
}

Network JsonReader::readFromString(const std::string& jsonStr) {
    json j = json::parse(jsonStr);
    Network network;

    // Parse ambient conditions
    if (j.contains("ambient")) {
        auto& amb = j["ambient"];
        if (amb.contains("temperature")) {
            network.setAmbientTemperature(amb["temperature"].get<double>());
        }
        if (amb.contains("pressure")) {
            network.setAmbientPressure(amb["pressure"].get<double>());
        }
        if (amb.contains("windSpeed")) {
            network.setWindSpeed(amb["windSpeed"].get<double>());
        }
        if (amb.contains("windDirection")) {
            network.setWindDirection(amb["windDirection"].get<double>());
        }
    }

    // Parse flow element definitions (reusable templates)
    std::unordered_map<std::string, json> elementDefs;
    if (j.contains("flowElements")) {
        for (auto& [key, val] : j["flowElements"].items()) {
            elementDefs[key] = val;
        }
    }

    // Parse nodes
    if (j.contains("nodes")) {
        for (auto& jNode : j["nodes"]) {
            int id = jNode["id"].get<int>();
            std::string name = jNode.value("name", "Node_" + std::to_string(id));

            NodeType type = NodeType::Normal;
            if (jNode.contains("type")) {
                std::string t = jNode["type"].get<std::string>();
                if (t == "ambient") type = NodeType::Ambient;
                else if (t == "phantom") type = NodeType::Phantom;
                else if (t == "cfd") type = NodeType::CFD;
            }

            Node node(id, name, type);

            if (jNode.contains("temperature")) {
                node.setTemperature(jNode["temperature"].get<double>());
            } else if (type == NodeType::Ambient) {
                node.setTemperature(network.getAmbientTemperature());
            }

            if (jNode.contains("elevation")) {
                node.setElevation(jNode["elevation"].get<double>());
            }
            if (jNode.contains("volume")) {
                node.setVolume(jNode["volume"].get<double>());
            }
            if (jNode.contains("pressure")) {
                node.setPressure(jNode["pressure"].get<double>());
            }

            node.updateDensity();
            network.addNode(node);
        }
    }

    // Parse links
    if (j.contains("links")) {
        for (auto& jLink : j["links"]) {
            int id = jLink["id"].get<int>();
            int fromId = jLink["from"].get<int>();
            int toId = jLink["to"].get<int>();
            double elevation = jLink.value("elevation", 0.0);

            // Resolve node IDs to indices
            int fromIdx = network.getNodeIndexById(fromId);
            int toIdx = network.getNodeIndexById(toId);

            Link link(id, fromIdx, toIdx, elevation);

            // Create flow element
            if (jLink.contains("element")) {
                auto& elemRef = jLink["element"];
                json elemDef;

                if (elemRef.is_string()) {
                    // Reference to a named element definition
                    std::string ref = elemRef.get<std::string>();
                    if (elementDefs.count(ref)) {
                        elemDef = elementDefs[ref];
                    } else {
                        throw std::runtime_error("Unknown flow element reference: " + ref);
                    }
                } else {
                    // Inline definition
                    elemDef = elemRef;
                }

                std::string elemType = elemDef["type"].get<std::string>();
                if (elemType == "PowerLawOrifice") {
                    double C = elemDef["C"].get<double>();
                    double n = elemDef["n"].get<double>();
                    link.setFlowElement(std::make_unique<PowerLawOrifice>(C, n));
                } else if (elemType == "Fan") {
                    double maxFlow = elemDef["maxFlow"].get<double>();
                    double shutoffPressure = elemDef["shutoffPressure"].get<double>();
                    link.setFlowElement(std::make_unique<Fan>(maxFlow, shutoffPressure));
                } else if (elemType == "TwoWayFlow") {
                    double Cd = elemDef["Cd"].get<double>();
                    double area = elemDef["area"].get<double>();
                    link.setFlowElement(std::make_unique<TwoWayFlow>(Cd, area));
                } else if (elemType == "Duct") {
                    double length = elemDef["length"].get<double>();
                    double diameter = elemDef["diameter"].get<double>();
                    double roughness = elemDef.value("roughness", 0.0001);
                    double sumK = elemDef.value("sumK", 0.0);
                    link.setFlowElement(std::make_unique<Duct>(length, diameter, roughness, sumK));
                }
            }

            network.addLink(std::move(link));
        }
    }

    return network;
}

ModelInput JsonReader::readModelFromFile(const std::string& filepath) {
    std::ifstream ifs(filepath);
    if (!ifs.is_open()) {
        throw std::runtime_error("Cannot open file: " + filepath);
    }
    json j;
    ifs >> j;
    return readModelFromString(j.dump());
}

ModelInput JsonReader::readModelFromString(const std::string& jsonStr) {
    ModelInput model;
    json j = json::parse(jsonStr);

    // Parse network (reuse existing logic via readFromString)
    model.network = readFromString(jsonStr);

    // Parse species
    if (j.contains("species")) {
        for (auto& js : j["species"]) {
            Species sp;
            sp.id = js["id"].get<int>();
            sp.name = js.value("name", "Species_" + std::to_string(sp.id));
            sp.molarMass = js.value("molarMass", 0.029);
            sp.decayRate = js.value("decayRate", 0.0);
            sp.outdoorConc = js.value("outdoorConcentration", 0.0);
            model.species.push_back(sp);
        }
    }

    // Parse sources
    if (j.contains("sources")) {
        for (auto& jsrc : j["sources"]) {
            Source src;
            src.zoneId = jsrc["zoneId"].get<int>();
            src.speciesId = jsrc["speciesId"].get<int>();
            src.generationRate = jsrc.value("generationRate", 0.0);
            src.removalRate = jsrc.value("removalRate", 0.0);
            src.scheduleId = jsrc.value("scheduleId", -1);
            model.sources.push_back(src);
        }
    }

    // Parse schedules
    if (j.contains("schedules")) {
        for (auto& jsch : j["schedules"]) {
            int id = jsch["id"].get<int>();
            Schedule sch(id, jsch.value("name", "Schedule_" + std::to_string(id)));
            if (jsch.contains("points")) {
                for (auto& jp : jsch["points"]) {
                    sch.addPoint(jp["time"].get<double>(), jp["value"].get<double>());
                }
            }
            model.schedules[id] = sch;
        }
    }

    // Parse transient config
    if (j.contains("transient")) {
        model.hasTransient = true;
        auto& jt = j["transient"];
        model.transientConfig.startTime = jt.value("startTime", 0.0);
        model.transientConfig.endTime = jt.value("endTime", 3600.0);
        model.transientConfig.timeStep = jt.value("timeStep", 60.0);
        model.transientConfig.outputInterval = jt.value("outputInterval", 60.0);
        std::string method = jt.value("airflowMethod", "trustRegion");
        if (method == "subRelaxation") {
            model.transientConfig.airflowMethod = SolverMethod::SubRelaxation;
        }
    }

    return model;
}

} // namespace contam
