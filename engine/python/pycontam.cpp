#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <pybind11/functional.h>

#include "core/Node.h"
#include "core/Link.h"
#include "core/Network.h"
#include "core/Solver.h"
#include "core/Species.h"
#include "core/Schedule.h"
#include "core/ContaminantSolver.h"
#include "core/TransientSimulation.h"
#include "elements/FlowElement.h"
#include "elements/PowerLawOrifice.h"
#include "elements/Fan.h"
#include "elements/TwoWayFlow.h"
#include "elements/Duct.h"
#include "elements/Damper.h"
#include "core/Occupant.h"
#include "core/SimpleAHS.h"
#include "control/Sensor.h"
#include "control/Controller.h"
#include "control/Actuator.h"
#include "control/LogicNodes.h"
#include "io/JsonReader.h"
#include "io/JsonWriter.h"
#include "io/ValReport.h"
#include "io/EbwReport.h"
#include "io/CexReport.h"
#include "io/LogReport.h"

namespace py = pybind11;
using namespace contam;

PYBIND11_MODULE(pycontam, m) {
    m.doc() = "CONTAM-Next: Multi-zone airflow and contaminant transport simulation";

    // ── NodeType ─────────────────────────────────────────────────────
    py::enum_<NodeType>(m, "NodeType")
        .value("Normal", NodeType::Normal)
        .value("Ambient", NodeType::Ambient)
        .export_values();

    // ── Node ─────────────────────────────────────────────────────────
    py::class_<Node>(m, "Node")
        .def(py::init<int, const std::string&, NodeType>(),
             py::arg("id"), py::arg("name") = "Zone", py::arg("type") = NodeType::Normal)
        .def("id", &Node::getId)
        .def("name", &Node::getName)
        .def("type", &Node::getType)
        .def("temperature", &Node::getTemperature)
        .def("set_temperature", &Node::setTemperature)
        .def("elevation", &Node::getElevation)
        .def("set_elevation", &Node::setElevation)
        .def("volume", &Node::getVolume)
        .def("set_volume", &Node::setVolume)
        .def("density", &Node::getDensity)
        .def("__repr__", [](const Node& n) {
            return "<Node id=" + std::to_string(n.getId()) + " name='" + n.getName() + "' type=" +
                   (n.getType() == NodeType::Ambient ? "Ambient" : "Normal") + ">";
        });

    // ── FlowElement (abstract) ───────────────────────────────────────
    py::class_<FlowElement, std::shared_ptr<FlowElement>>(m, "FlowElement")
        .def("type_name", &FlowElement::typeName);

    // ── PowerLawOrifice ──────────────────────────────────────────────
    py::class_<PowerLawOrifice, FlowElement, std::shared_ptr<PowerLawOrifice>>(m, "PowerLawOrifice")
        .def(py::init<double, double>(), py::arg("C"), py::arg("n"))
        .def("flow_coefficient", &PowerLawOrifice::getFlowCoefficient)
        .def("flow_exponent", &PowerLawOrifice::getFlowExponent);

    // ── Fan ──────────────────────────────────────────────────────────
    py::class_<Fan, FlowElement, std::shared_ptr<Fan>>(m, "Fan")
        .def(py::init<double, double>(), py::arg("max_flow"), py::arg("shutoff_pressure"))
        .def("max_flow", &Fan::getMaxFlow)
        .def("shutoff_pressure", &Fan::getShutoffPressure);

    // ── TwoWayFlow ───────────────────────────────────────────────────
    py::class_<TwoWayFlow, FlowElement, std::shared_ptr<TwoWayFlow>>(m, "TwoWayFlow")
        .def(py::init<double, double>(), py::arg("Cd"), py::arg("area"))
        .def("discharge_coefficient", &TwoWayFlow::getDischargeCoefficient)
        .def("area", &TwoWayFlow::getArea);

    // ── Duct ─────────────────────────────────────────────────────────
    py::class_<Duct, FlowElement, std::shared_ptr<Duct>>(m, "Duct")
        .def(py::init<double, double, double, double>(),
             py::arg("length"), py::arg("diameter"),
             py::arg("roughness") = 0.0001, py::arg("sumK") = 0.0)
        .def("length", &Duct::getLength)
        .def("diameter", &Duct::getDiameter)
        .def("roughness", &Duct::getRoughness)
        .def("sum_k", &Duct::getSumK);

    // ── Damper ───────────────────────────────────────────────────────
    py::class_<Damper, FlowElement, std::shared_ptr<Damper>>(m, "Damper")
        .def(py::init<double, double, double>(),
             py::arg("Cmax"), py::arg("n"), py::arg("fraction") = 1.0)
        .def("cmax", &Damper::getCmax)
        .def("flow_exponent", &Damper::getFlowExponent)
        .def("fraction", &Damper::getFraction)
        .def("set_fraction", &Damper::setFraction);

    // ── Network ──────────────────────────────────────────────────────
    // Note: Link is not directly exposed (non-copyable due to unique_ptr).
    // Use Network.add_link() factory and Network.get_link_info() for read access.
    py::class_<Network>(m, "Network")
        .def(py::init<>())
        .def("add_node", &Network::addNode)
        .def("add_link", [](Network& net, int id, int from, int to, double elev,
                            std::shared_ptr<FlowElement> elem) {
            Link link(id, from, to, elev);
            if (elem) link.setFlowElement(elem->clone());
            net.addLink(std::move(link));
        }, py::arg("id"), py::arg("from_node"), py::arg("to_node"),
           py::arg("elevation") = 0.0, py::arg("element") = nullptr)
        .def("node_count", &Network::getNodeCount)
        .def("link_count", &Network::getLinkCount)
        .def("get_node", [](Network& net, int i) -> Node& { return net.getNode(i); },
             py::return_value_policy::reference)
        .def("get_link_info", [](const Network& net, int i) -> py::dict {
            const auto& l = net.getLink(i);
            py::dict d;
            d["id"] = l.getId();
            d["from"] = l.getNodeFrom();
            d["to"] = l.getNodeTo();
            d["elevation"] = l.getElevation();
            d["mass_flow"] = l.getMassFlow();
            if (l.getFlowElement()) d["element_type"] = l.getFlowElement()->typeName();
            return d;
        });

    // ── SolverResult ─────────────────────────────────────────────────
    py::class_<SolverResult>(m, "SolverResult")
        .def_readonly("converged", &SolverResult::converged)
        .def_readonly("iterations", &SolverResult::iterations)
        .def_readonly("max_residual", &SolverResult::maxResidual)
        .def_readonly("pressures", &SolverResult::pressures)
        .def_readonly("mass_flows", &SolverResult::massFlows)
        .def("__repr__", [](const SolverResult& r) {
            return "<SolverResult converged=" + std::string(r.converged ? "True" : "False") +
                   " iterations=" + std::to_string(r.iterations) + ">";
        });

    // ── Solver ───────────────────────────────────────────────────────
    py::class_<Solver>(m, "Solver")
        .def(py::init<>())
        .def("solve", &Solver::solve);

    // ── Species ──────────────────────────────────────────────────────
    py::class_<Species>(m, "Species")
        .def(py::init<>())
        .def_readwrite("id", &Species::id)
        .def_readwrite("name", &Species::name)
        .def_readwrite("molar_mass", &Species::molarMass)
        .def_readwrite("decay_rate", &Species::decayRate)
        .def_readwrite("outdoor_conc", &Species::outdoorConc);

    // ── Source ────────────────────────────────────────────────────────
    py::class_<Source>(m, "Source")
        .def(py::init<>())
        .def_readwrite("zone_id", &Source::zoneId)
        .def_readwrite("species_id", &Source::speciesId)
        .def_readwrite("generation_rate", &Source::generationRate)
        .def_readwrite("removal_rate", &Source::removalRate)
        .def_readwrite("schedule_id", &Source::scheduleId);

    // ── Schedule ─────────────────────────────────────────────────────
    py::class_<SchedulePoint>(m, "SchedulePoint")
        .def(py::init<double, double>(), py::arg("time"), py::arg("value"))
        .def_readwrite("time", &SchedulePoint::time)
        .def_readwrite("value", &SchedulePoint::value);

    py::class_<Schedule>(m, "Schedule")
        .def(py::init<int, const std::string&>(), py::arg("id"), py::arg("name") = "")
        .def("add_point", &Schedule::addPoint)
        .def("get_value", &Schedule::getValue);

    // ── TransientConfig ──────────────────────────────────────────────
    py::class_<TransientConfig>(m, "TransientConfig")
        .def(py::init<>())
        .def_readwrite("start_time", &TransientConfig::startTime)
        .def_readwrite("end_time", &TransientConfig::endTime)
        .def_readwrite("time_step", &TransientConfig::timeStep)
        .def_readwrite("output_interval", &TransientConfig::outputInterval);

    // ── ContaminantResult ────────────────────────────────────────
    py::class_<ContaminantResult>(m, "ContaminantResult")
        .def_readonly("time", &ContaminantResult::time)
        .def_readonly("concentrations", &ContaminantResult::concentrations);

    // ── TimeStepResult ──────────────────────────────────────────────
    py::class_<TimeStepResult>(m, "TimeStepResult")
        .def_readonly("time", &TimeStepResult::time)
        .def_readonly("airflow", &TimeStepResult::airflow)
        .def_readonly("contaminant", &TimeStepResult::contaminant);

    // ── TransientResult ──────────────────────────────────────────
    py::class_<TransientResult>(m, "TransientResult")
        .def_readonly("completed", &TransientResult::completed)
        .def_readonly("history", &TransientResult::history);

    // ── TransientSimulation ──────────────────────────────────────────
    py::class_<TransientSimulation>(m, "TransientSimulation")
        .def(py::init<>())
        .def("run", &TransientSimulation::run);

    // ── SensorType ──────────────────────────────────────────────────
    py::enum_<SensorType>(m, "SensorType")
        .value("Concentration", SensorType::Concentration)
        .value("Pressure", SensorType::Pressure)
        .value("Temperature", SensorType::Temperature)
        .value("MassFlow", SensorType::MassFlow)
        .export_values();

    // ── Sensor ──────────────────────────────────────────────────────
    py::class_<Sensor>(m, "Sensor")
        .def(py::init<>())
        .def(py::init<int, const std::string&, SensorType, int, int>(),
             py::arg("id"), py::arg("name"), py::arg("type"),
             py::arg("target_id"), py::arg("species_idx") = 0)
        .def_readwrite("id", &Sensor::id)
        .def_readwrite("name", &Sensor::name)
        .def_readwrite("type", &Sensor::type)
        .def_readwrite("target_id", &Sensor::targetId)
        .def_readwrite("species_idx", &Sensor::speciesIdx)
        .def_readwrite("last_reading", &Sensor::lastReading);

    // ── Controller ──────────────────────────────────────────────────
    py::class_<Controller>(m, "Controller")
        .def(py::init<>())
        .def(py::init<int, const std::string&, int, int, double, double, double, double>(),
             py::arg("id"), py::arg("name"), py::arg("sensor_id"),
             py::arg("actuator_id"), py::arg("setpoint"), py::arg("Kp"),
             py::arg("Ki") = 0.0, py::arg("deadband") = 0.0)
        .def_readwrite("id", &Controller::id)
        .def_readwrite("name", &Controller::name)
        .def_readwrite("sensor_id", &Controller::sensorId)
        .def_readwrite("actuator_id", &Controller::actuatorId)
        .def_readwrite("setpoint", &Controller::setpoint)
        .def_readwrite("Kp", &Controller::Kp)
        .def_readwrite("Ki", &Controller::Ki)
        .def_readwrite("deadband", &Controller::deadband)
        .def_readwrite("output_min", &Controller::outputMin)
        .def_readwrite("output_max", &Controller::outputMax)
        .def_readwrite("output", &Controller::output)
        .def("update", &Controller::update, py::arg("sensor_value"), py::arg("dt"))
        .def("reset", &Controller::reset);

    // ── ActuatorType ────────────────────────────────────────────────
    py::enum_<ActuatorType>(m, "ActuatorType")
        .value("DamperFraction", ActuatorType::DamperFraction)
        .value("FanSpeed", ActuatorType::FanSpeed)
        .value("FilterBypass", ActuatorType::FilterBypass)
        .export_values();

    // ── Actuator ────────────────────────────────────────────────────
    py::class_<Actuator>(m, "Actuator")
        .def(py::init<>())
        .def(py::init<int, const std::string&, ActuatorType, int>(),
             py::arg("id"), py::arg("name"), py::arg("type"), py::arg("link_idx"))
        .def_readwrite("id", &Actuator::id)
        .def_readwrite("name", &Actuator::name)
        .def_readwrite("type", &Actuator::type)
        .def_readwrite("link_idx", &Actuator::linkIdx)
        .def_readwrite("current_value", &Actuator::currentValue);

    // ── LogicNode (abstract base) ───────────────────────────────────
    py::class_<LogicNode, std::shared_ptr<LogicNode>>(m, "LogicNode")
        .def("evaluate", &LogicNode::evaluate)
        .def("type_name", &LogicNode::typeName);

    // Stateless logic nodes
    py::class_<AndNode, LogicNode, std::shared_ptr<AndNode>>(m, "AndNode").def(py::init<>());
    py::class_<OrNode, LogicNode, std::shared_ptr<OrNode>>(m, "OrNode").def(py::init<>());
    py::class_<XorNode, LogicNode, std::shared_ptr<XorNode>>(m, "XorNode").def(py::init<>());
    py::class_<NotNode, LogicNode, std::shared_ptr<NotNode>>(m, "NotNode").def(py::init<>());
    py::class_<SumNode, LogicNode, std::shared_ptr<SumNode>>(m, "SumNode").def(py::init<>());
    py::class_<AverageNode, LogicNode, std::shared_ptr<AverageNode>>(m, "AverageNode").def(py::init<>());
    py::class_<MinNode, LogicNode, std::shared_ptr<MinNode>>(m, "MinNode").def(py::init<>());
    py::class_<MaxNode, LogicNode, std::shared_ptr<MaxNode>>(m, "MaxNode").def(py::init<>());
    py::class_<ExpNode, LogicNode, std::shared_ptr<ExpNode>>(m, "ExpNode").def(py::init<>());
    py::class_<LnNode, LogicNode, std::shared_ptr<LnNode>>(m, "LnNode").def(py::init<>());
    py::class_<AbsNode, LogicNode, std::shared_ptr<AbsNode>>(m, "AbsNode").def(py::init<>());
    py::class_<MultiplyNode, LogicNode, std::shared_ptr<MultiplyNode>>(m, "MultiplyNode").def(py::init<>());
    py::class_<DivideNode, LogicNode, std::shared_ptr<DivideNode>>(m, "DivideNode").def(py::init<>());

    // Stateful logic nodes
    py::class_<IntegratorNode, LogicNode, std::shared_ptr<IntegratorNode>>(m, "IntegratorNode")
        .def(py::init<>())
        .def("set_time_step", &IntegratorNode::setTimeStep)
        .def("step", &IntegratorNode::step)
        .def("reset", &IntegratorNode::reset);

    py::class_<MovingAverageNode, LogicNode, std::shared_ptr<MovingAverageNode>>(m, "MovingAverageNode")
        .def(py::init<int>(), py::arg("window_size") = 10)
        .def("add_sample", &MovingAverageNode::addSample);

    // ── ExposureRecord ──────────────────────────────────────────────
    py::class_<ExposureRecord>(m, "ExposureRecord")
        .def(py::init<>())
        .def_readwrite("species_idx", &ExposureRecord::speciesIdx)
        .def_readwrite("cumulative_dose", &ExposureRecord::cumulativeDose)
        .def_readwrite("peak_concentration", &ExposureRecord::peakConcentration)
        .def_readwrite("time_at_peak", &ExposureRecord::timeAtPeak)
        .def_readwrite("total_exposure_time", &ExposureRecord::totalExposureTime);

    // ── Occupant ────────────────────────────────────────────────────
    py::class_<Occupant>(m, "Occupant")
        .def(py::init<>())
        .def(py::init<int, const std::string&, int, double>(),
             py::arg("id"), py::arg("name"), py::arg("zone_idx"),
             py::arg("breathing_rate") = 1.2e-4)
        .def_readwrite("id", &Occupant::id)
        .def_readwrite("name", &Occupant::name)
        .def_readwrite("current_zone_idx", &Occupant::currentZoneIdx)
        .def_readwrite("breathing_rate", &Occupant::breathingRate)
        .def_readwrite("schedule_id", &Occupant::scheduleId)
        .def_readwrite("exposure", &Occupant::exposure)
        .def("init_exposure", &Occupant::initExposure)
        .def("update_exposure", &Occupant::updateExposure);

    // ── SimpleAHS ───────────────────────────────────────────────────
    {
        auto ahs = py::class_<SimpleAHS>(m, "SimpleAHS")
            .def(py::init<>())
            .def(py::init<int, const std::string&, double, double, double, double>(),
                 py::arg("id"), py::arg("name"),
                 py::arg("supply"), py::arg("ret"),
                 py::arg("oa"), py::arg("exhaust"))
            .def_readwrite("id", &SimpleAHS::id)
            .def_readwrite("name", &SimpleAHS::name)
            .def_readwrite("supply_flow", &SimpleAHS::supplyFlow)
            .def_readwrite("return_flow", &SimpleAHS::returnFlow)
            .def_readwrite("outdoor_air_flow", &SimpleAHS::outdoorAirFlow)
            .def_readwrite("exhaust_flow", &SimpleAHS::exhaustFlow)
            .def_readwrite("supply_temperature", &SimpleAHS::supplyTemperature)
            .def_readwrite("supply_zones", &SimpleAHS::supplyZones)
            .def_readwrite("return_zones", &SimpleAHS::returnZones)
            .def_readwrite("outdoor_air_schedule_id", &SimpleAHS::outdoorAirScheduleId)
            .def_readwrite("supply_flow_schedule_id", &SimpleAHS::supplyFlowScheduleId)
            .def("outdoor_air_fraction", &SimpleAHS::getOutdoorAirFraction)
            .def("recirculated_flow", &SimpleAHS::getRecirculatedFlow)
            .def("is_balanced", &SimpleAHS::isBalanced, py::arg("tolerance") = 0.001);

        py::class_<SimpleAHS::ZoneConnection>(ahs, "ZoneConnection")
            .def(py::init<>())
            .def_readwrite("zone_id", &SimpleAHS::ZoneConnection::zoneId)
            .def_readwrite("fraction", &SimpleAHS::ZoneConnection::fraction);
    }

    // ── ValReport ───────────────────────────────────────────────────
    py::class_<ValLinkResult>(m, "ValLinkResult")
        .def_readonly("link_id", &ValLinkResult::linkId)
        .def_readonly("node_from_id", &ValLinkResult::nodeFromId)
        .def_readonly("node_to_id", &ValLinkResult::nodeToId)
        .def_readonly("element_type", &ValLinkResult::elementType)
        .def_readonly("mass_flow", &ValLinkResult::massFlow)
        .def_readonly("volume_flow", &ValLinkResult::volumeFlow);

    py::class_<ValResult>(m, "ValResult")
        .def_readonly("target_delta_p", &ValResult::targetDeltaP)
        .def_readonly("air_density", &ValResult::airDensity)
        .def_readonly("total_leakage_mass", &ValResult::totalLeakageMass)
        .def_readonly("total_leakage_vol", &ValResult::totalLeakageVol)
        .def_readonly("total_leakage_vol_h", &ValResult::totalLeakageVolH)
        .def_readonly("equivalent_leakage_area", &ValResult::equivalentLeakageArea)
        .def_readonly("link_breakdown", &ValResult::linkBreakdown);

    m.def("val_generate", &ValReport::generate,
          "Run building pressurization test",
          py::arg("net"), py::arg("target_dp") = 50.0, py::arg("air_density") = 1.2);
    m.def("val_format_text", &ValReport::formatText);
    m.def("val_format_csv", &ValReport::formatCsv);

    // ── EbwReport ───────────────────────────────────────────────────
    py::class_<OccupantExposure>(m, "OccupantExposure")
        .def_readonly("occupant_id", &OccupantExposure::occupantId)
        .def_readonly("occupant_name", &OccupantExposure::occupantName)
        .def_readonly("species_index", &OccupantExposure::speciesIndex)
        .def_readonly("cumulative_dose", &OccupantExposure::cumulativeDose)
        .def_readonly("peak_concentration", &OccupantExposure::peakConcentration)
        .def_readonly("time_at_peak", &OccupantExposure::timeAtPeak)
        .def_readonly("total_exposure_time", &OccupantExposure::totalExposureTime)
        .def_readonly("mean_concentration", &OccupantExposure::meanConcentration)
        .def_readonly("breathing_rate", &OccupantExposure::breathingRate);

    py::class_<ZoneVisit>(m, "ZoneVisit")
        .def_readonly("occupant_id", &ZoneVisit::occupantId)
        .def_readonly("zone_index", &ZoneVisit::zoneIndex)
        .def_readonly("zone_name", &ZoneVisit::zoneName)
        .def_readonly("enter_time", &ZoneVisit::enterTime)
        .def_readonly("leave_time", &ZoneVisit::leaveTime);

    m.def("ebw_compute", &EbwReport::compute,
          "Compute occupant exposure from inline data",
          py::arg("occupants"), py::arg("species"));
    m.def("ebw_compute_from_history", &EbwReport::computeFromHistory,
          "Compute occupant exposure from transient history",
          py::arg("occupants"), py::arg("species"), py::arg("result"));
    m.def("ebw_extract_zone_history", &EbwReport::extractZoneHistory,
          "Extract zone visit history",
          py::arg("occupants"), py::arg("result"), py::arg("zone_names") = std::vector<std::string>{});
    m.def("ebw_format_text", &EbwReport::formatText,
          py::arg("exposures"), py::arg("species"), py::arg("zone_history") = std::vector<ZoneVisit>{});
    m.def("ebw_format_csv", &EbwReport::formatCsv,
          py::arg("exposures"), py::arg("species"));

    // ── CexReport ───────────────────────────────────────────────────
    py::class_<CexOpeningResult>(m, "CexOpeningResult")
        .def_readonly("link_id", &CexOpeningResult::linkId)
        .def_readonly("from_node_index", &CexOpeningResult::fromNodeIndex)
        .def_readonly("to_node_index", &CexOpeningResult::toNodeIndex)
        .def_readonly("from_node_name", &CexOpeningResult::fromNodeName)
        .def_readonly("to_node_name", &CexOpeningResult::toNodeName)
        .def_readonly("total_mass_exfiltrated", &CexOpeningResult::totalMassExfiltrated)
        .def_readonly("avg_mass_flow_rate", &CexOpeningResult::avgMassFlowRate)
        .def_readonly("peak_mass_flow_rate", &CexOpeningResult::peakMassFlowRate);

    py::class_<CexSpeciesResult>(m, "CexSpeciesResult")
        .def_readonly("species_id", &CexSpeciesResult::speciesId)
        .def_readonly("species_name", &CexSpeciesResult::speciesName)
        .def_readonly("total_exfiltration", &CexSpeciesResult::totalExfiltration)
        .def_readonly("openings", &CexSpeciesResult::openings);

    m.def("cex_compute", &CexReport::compute,
          "Compute contaminant exfiltration",
          py::arg("net"), py::arg("species"), py::arg("history"));
    m.def("cex_format_text", &CexReport::formatText);
    m.def("cex_format_csv", &CexReport::formatCsv);

    // ── LogReport ───────────────────────────────────────────────────
    py::class_<LogSnapshot>(m, "LogSnapshot")
        .def_readonly("time", &LogSnapshot::time)
        .def_readonly("sensor_values", &LogSnapshot::sensorValues)
        .def_readonly("controller_outputs", &LogSnapshot::controllerOutputs)
        .def_readonly("controller_errors", &LogSnapshot::controllerErrors)
        .def_readonly("actuator_values", &LogSnapshot::actuatorValues)
        .def_readonly("logic_node_values", &LogSnapshot::logicNodeValues);

    py::class_<LogColumnInfo>(m, "LogColumnInfo")
        .def_readonly("sensor_names", &LogColumnInfo::sensorNames)
        .def_readonly("sensor_types", &LogColumnInfo::sensorTypes)
        .def_readonly("controller_names", &LogColumnInfo::controllerNames)
        .def_readonly("actuator_names", &LogColumnInfo::actuatorNames)
        .def_readonly("actuator_types", &LogColumnInfo::actuatorTypes)
        .def_readonly("logic_node_names", &LogColumnInfo::logicNodeNames);

    m.def("log_capture", &LogReport::capture,
          "Capture control system snapshot",
          py::arg("time"), py::arg("sensors"), py::arg("controllers"),
          py::arg("actuators"), py::arg("logic_node_values") = std::vector<double>{});
    m.def("log_build_column_info", &LogReport::buildColumnInfo,
          py::arg("sensors"), py::arg("controllers"), py::arg("actuators"),
          py::arg("logic_node_names") = std::vector<std::string>{});
    m.def("log_format_text", &LogReport::formatText);
    m.def("log_format_csv", &LogReport::formatCsv);

    // ── JSON I/O convenience functions ───────────────────────────────
    m.def("load_network", &JsonReader::readFromFile,
          "Load a network from a JSON file", py::arg("filepath"));

    m.def("load_network_string", &JsonReader::readFromString,
          "Load a network from a JSON string", py::arg("json_string"));

    m.def("solve_from_json", [](const std::string& json_input) -> std::string {
        Network net = JsonReader::readFromString(json_input);
        Solver solver;
        SolverResult result = solver.solve(net);
        return JsonWriter::writeToString(net, result);
    }, "Solve steady-state from JSON string, return JSON result", py::arg("json_input"));

    m.def("solve_from_file", [](const std::string& input_path, const std::string& output_path) {
        Network net = JsonReader::readFromFile(input_path);
        Solver solver;
        SolverResult result = solver.solve(net);
        JsonWriter::writeToFile(output_path, net, result);
    }, "Solve steady-state from JSON file, write result to file",
       py::arg("input_path"), py::arg("output_path"));

    // Version info
    m.attr("__version__") = "0.1.0";
}
