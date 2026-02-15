#pragma once
#include "core/Node.h"
#include "core/Link.h"
#include "elements/FlowElement.h"
#include <vector>
#include <memory>
#include <unordered_map>
#include <cmath>
#include <Eigen/Dense>

namespace contam {

// Junction node in duct network
struct DuctJunction {
    int id;
    double elevation = 0.0;  // m
    double pressure = 0.0;   // Pa (gauge)
};

// Terminal node connecting duct network to zone network
struct DuctTerminal {
    int id;
    int zoneNodeId;           // connected zone node in main network
    double designFlow = 0.0;  // m^3/s
    double balanceCoeff = 1.0; // auto-balance coefficient
};

class DuctNetwork {
public:
    void addJunction(const DuctJunction& j);
    void addTerminal(const DuctTerminal& t);
    void addDuctLink(int id, int fromId, int toId, std::unique_ptr<FlowElement> element);

    // Solve duct network pressures/flows (Newton-Raphson)
    bool solve(double tolerance = 1e-4, int maxIter = 100);

    // Auto-balance terminal flows to match design flows
    // Iteratively adjusts balanceCoeff on each terminal
    bool autoBalance(int maxIterations = 20, double tolerance = 0.02);

    // Get results
    double getJunctionPressure(int id) const;
    double getLinkFlow(int id) const;
    double getTerminalFlow(int id) const;

    const std::vector<DuctJunction>& junctions() const { return junctions_; }
    const std::vector<DuctTerminal>& terminals() const { return terminals_; }

private:
    std::vector<DuctJunction> junctions_;
    std::vector<DuctTerminal> terminals_;

    struct DuctLink {
        int id;
        int fromId, toId;
        std::unique_ptr<FlowElement> element;
        double massFlow = 0.0;
        double derivative = 0.0;
    };
    std::vector<DuctLink> links_;

    // Index maps for fast lookup
    std::unordered_map<int, int> junctionIdToIdx_;
    std::unordered_map<int, int> terminalIdToIdx_;
    std::unordered_map<int, int> linkIdToIdx_;

    // Get pressure for a node (junction or terminal)
    double getNodePressure(int nodeId) const;
    // Set pressure for a junction
    void setJunctionPressure(int nodeId, double p);
    // Check if a node is a junction (unknown pressure)
    bool isJunction(int nodeId) const;
};

} // namespace contam
