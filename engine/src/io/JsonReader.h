#pragma once

#include "core/Network.h"
#include "core/Species.h"
#include "core/Schedule.h"
#include "core/TransientSimulation.h"
#include "core/SimpleAHS.h"
#include "core/Occupant.h"
#include "io/WeatherReader.h"
#include <string>
#include <vector>
#include <map>

namespace contam {

struct ModelInput {
    Network network;
    std::vector<Species> species;
    std::vector<Source> sources;
    std::map<int, Schedule> schedules;
    std::map<int, int> zoneTemperatureSchedules;  // nodeIdx -> scheduleId
    TransientConfig transientConfig;
    bool hasTransient = false;
    std::vector<WeatherRecord> weatherData;
    std::vector<SimpleAHS> ahSystems;
    std::vector<Occupant> occupants;
};

class JsonReader {
public:
    // Parse a JSON topology file and build a Network
    static Network readFromFile(const std::string& filepath);
    static Network readFromString(const std::string& jsonStr);

    // Parse full model including contaminant and transient config
    static ModelInput readModelFromFile(const std::string& filepath);
    static ModelInput readModelFromString(const std::string& jsonStr);
};

} // namespace contam
