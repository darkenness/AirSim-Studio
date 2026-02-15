#include "io/ValReport.h"
#include "elements/FlowElement.h"

namespace contam {

ValResult ValReport::generate(
    const Network& net,
    double targetDeltaP,
    double airDensity)
{
    ValResult result;
    result.targetDeltaP = targetDeltaP;
    result.airDensity = airDensity;
    result.totalLeakageMass = 0.0;
    result.totalLeakageVol = 0.0;

    for (int j = 0; j < net.getLinkCount(); ++j) {
        const auto& link = net.getLink(j);
        int nFrom = link.getNodeFrom();
        int nTo = link.getNodeTo();

        // Identify exterior links: exactly one node is Ambient
        bool fromAmbient = net.getNode(nFrom).isKnownPressure();
        bool toAmbient = net.getNode(nTo).isKnownPressure();

        if (fromAmbient == toAmbient) continue; // both interior or both ambient — skip

        const FlowElement* elem = link.getFlowElement();
        if (!elem) continue;

        // Pressurization test: interior is at +targetDeltaP relative to ambient.
        // Flow direction: interior -> ambient (exfiltration under positive pressure).
        // If nodeFrom is interior and nodeTo is ambient: dP = +targetDeltaP
        // If nodeFrom is ambient and nodeTo is interior: dP = -targetDeltaP
        double dP = fromAmbient ? -targetDeltaP : targetDeltaP;

        FlowResult fr = elem->calculate(dP, airDensity);
        double massFlowMag = std::abs(fr.massFlow);
        double volFlow = massFlowMag / airDensity;

        ValLinkResult lr;
        lr.linkId = link.getId();
        lr.nodeFromId = net.getNode(nFrom).getId();
        lr.nodeToId = net.getNode(nTo).getId();
        lr.elementType = elem->typeName();
        lr.massFlow = massFlowMag;
        lr.volumeFlow = volFlow;

        result.linkBreakdown.push_back(lr);
        result.totalLeakageMass += massFlowMag;
        result.totalLeakageVol += volFlow;
    }

    result.totalLeakageVolH = result.totalLeakageVol * 3600.0;

    // ELA = Q / (Cd * sqrt(2 * dP / rho))
    double denom = DEFAULT_CD * std::sqrt(2.0 * targetDeltaP / airDensity);
    result.equivalentLeakageArea = (denom > 0.0)
        ? result.totalLeakageVol / denom
        : 0.0;

    return result;
}

std::string ValReport::formatText(const ValResult& result) {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(4);
    oss << "=== Building Pressurization Test Report (.VAL) ===\n\n";
    oss << "Target pressure differential: " << result.targetDeltaP << " Pa\n";
    oss << "Air density:                  " << result.airDensity << " kg/m3\n\n";

    oss << "--- Per-Opening Breakdown ---\n";
    oss << std::left
        << std::setw(8)  << "LinkId"
        << std::setw(10) << "FromNode"
        << std::setw(10) << "ToNode"
        << std::setw(20) << "ElementType"
        << std::right
        << std::setw(14) << "MassFlow(kg/s)"
        << std::setw(14) << "VolFlow(m3/s)"
        << "\n";
    oss << std::string(76, '-') << "\n";

    for (const auto& lr : result.linkBreakdown) {
        oss << std::left
            << std::setw(8)  << lr.linkId
            << std::setw(10) << lr.nodeFromId
            << std::setw(10) << lr.nodeToId
            << std::setw(20) << lr.elementType
            << std::right
            << std::setw(14) << lr.massFlow
            << std::setw(14) << lr.volumeFlow
            << "\n";
    }

    oss << std::string(76, '-') << "\n\n";
    oss << "--- Summary ---\n";
    oss << "Total leakage (mass):   " << result.totalLeakageMass << " kg/s\n";
    oss << "Total leakage (volume): " << result.totalLeakageVol << " m3/s\n";
    oss << "Total leakage (volume): " << result.totalLeakageVolH << " m3/h\n";
    oss << "Equivalent Leakage Area (ELA): " << result.equivalentLeakageArea << " m2\n";
    oss << "  (Cd = " << DEFAULT_CD << ")\n";

    return oss.str();
}

std::string ValReport::formatCsv(const ValResult& result) {
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(6);

    // Metadata
    oss << "# TargetDeltaP_Pa," << result.targetDeltaP << "\n";
    oss << "# AirDensity_kgm3," << result.airDensity << "\n";
    oss << "# TotalLeakageMass_kgs," << result.totalLeakageMass << "\n";
    oss << "# TotalLeakageVol_m3s," << result.totalLeakageVol << "\n";
    oss << "# TotalLeakageVol_m3h," << result.totalLeakageVolH << "\n";
    oss << "# ELA_m2," << result.equivalentLeakageArea << "\n";
    oss << "# Cd," << DEFAULT_CD << "\n";

    // Per-link data
    oss << "LinkId,NodeFromId,NodeToId,ElementType,MassFlow_kgs,VolFlow_m3s\n";
    for (const auto& lr : result.linkBreakdown) {
        oss << lr.linkId << ","
            << lr.nodeFromId << ","
            << lr.nodeToId << ","
            << lr.elementType << ","
            << lr.massFlow << ","
            << lr.volumeFlow << "\n";
    }

    return oss.str();
}

} // namespace contam
