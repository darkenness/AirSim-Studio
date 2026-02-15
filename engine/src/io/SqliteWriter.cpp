#ifdef CONTAM_HAS_SQLITE3

#include "io/SqliteWriter.h"
#include <sqlite3.h>
#include <stdexcept>

namespace contam {

struct SqliteWriter::Impl {
    sqlite3* db = nullptr;
    sqlite3_stmt* stmtTransient = nullptr;

    ~Impl() {
        if (stmtTransient) sqlite3_finalize(stmtTransient);
        if (db) sqlite3_close(db);
    }
};

SqliteWriter::SqliteWriter(const std::string& filename)
    : impl_(std::make_unique<Impl>())
{
    int rc = sqlite3_open(filename.c_str(), &impl_->db);
    if (rc != SQLITE_OK) {
        throw std::runtime_error("SqliteWriter: cannot open database: " + filename);
    }

    // Create tables
    const char* sql =
        "CREATE TABLE IF NOT EXISTS metadata ("
        "  key TEXT PRIMARY KEY, value TEXT);"
        "CREATE TABLE IF NOT EXISTS nodes ("
        "  id INTEGER PRIMARY KEY, name TEXT, type TEXT,"
        "  elevation REAL, volume REAL);"
        "CREATE TABLE IF NOT EXISTS links ("
        "  id INTEGER PRIMARY KEY, node_from INTEGER, node_to INTEGER,"
        "  element_type TEXT);"
        "CREATE TABLE IF NOT EXISTS species ("
        "  id INTEGER PRIMARY KEY, name TEXT, molar_mass REAL,"
        "  decay_rate REAL, outdoor_conc REAL);"
        "CREATE TABLE IF NOT EXISTS steady_state ("
        "  node_id INTEGER, species_id INTEGER, concentration REAL,"
        "  PRIMARY KEY (node_id, species_id));"
        "CREATE TABLE IF NOT EXISTS transient ("
        "  time REAL, node_id INTEGER, pressure REAL);"
        "CREATE TABLE IF NOT EXISTS transient_flows ("
        "  time REAL, link_id INTEGER, mass_flow REAL);"
        "CREATE TABLE IF NOT EXISTS transient_conc ("
        "  time REAL, node_id INTEGER, species_id INTEGER, concentration REAL);";

    char* errMsg = nullptr;
    rc = sqlite3_exec(impl_->db, sql, nullptr, nullptr, &errMsg);
    if (rc != SQLITE_OK) {
        std::string err = errMsg ? errMsg : "unknown error";
        sqlite3_free(errMsg);
        throw std::runtime_error("SqliteWriter: table creation failed: " + err);
    }

    // Begin transaction for performance
    sqlite3_exec(impl_->db, "BEGIN TRANSACTION;", nullptr, nullptr, nullptr);
}

SqliteWriter::~SqliteWriter() = default;

void SqliteWriter::writeMetadata(const Network& net, const std::vector<Species>& species) {
    // Write nodes
    for (int i = 0; i < net.getNodeCount(); ++i) {
        const auto& node = net.getNode(i);
        std::string sql = "INSERT OR REPLACE INTO nodes VALUES("
            + std::to_string(node.getId()) + ",'"
            + node.getName() + "','"
            + (node.isKnownPressure() ? "Ambient" : "Normal") + "',"
            + std::to_string(node.getElevation()) + ","
            + std::to_string(node.getVolume()) + ");";
        sqlite3_exec(impl_->db, sql.c_str(), nullptr, nullptr, nullptr);
    }

    // Write links
    for (int i = 0; i < net.getLinkCount(); ++i) {
        const auto& link = net.getLink(i);
        std::string elemType = link.getFlowElement() ? link.getFlowElement()->typeName() : "none";
        std::string sql = "INSERT OR REPLACE INTO links VALUES("
            + std::to_string(link.getId()) + ","
            + std::to_string(link.getNodeFrom()) + ","
            + std::to_string(link.getNodeTo()) + ",'"
            + elemType + "');";
        sqlite3_exec(impl_->db, sql.c_str(), nullptr, nullptr, nullptr);
    }

    // Write species
    for (const auto& sp : species) {
        std::string sql = "INSERT OR REPLACE INTO species VALUES("
            + std::to_string(sp.id) + ",'"
            + sp.name + "',"
            + std::to_string(sp.molarMass) + ","
            + std::to_string(sp.decayRate) + ","
            + std::to_string(sp.outdoorConc) + ");";
        sqlite3_exec(impl_->db, sql.c_str(), nullptr, nullptr, nullptr);
    }
}

void SqliteWriter::writeSteadyState(const Network& net, const std::vector<double>& concentrations) {
    // concentrations is flat: [node0_spec0, node0_spec1, ..., node1_spec0, ...]
    // We don't know numSpecies here, so write as single-species if flat
    for (size_t i = 0; i < concentrations.size(); ++i) {
        std::string sql = "INSERT OR REPLACE INTO steady_state VALUES("
            + std::to_string(i) + ",0,"
            + std::to_string(concentrations[i]) + ");";
        sqlite3_exec(impl_->db, sql.c_str(), nullptr, nullptr, nullptr);
    }
}

void SqliteWriter::writeTransientStep(double time, const std::vector<double>& pressures,
                                       const std::vector<double>& massFlows,
                                       const std::vector<std::vector<double>>& concentrations)
{
    // Write pressures
    for (size_t i = 0; i < pressures.size(); ++i) {
        std::string sql = "INSERT INTO transient VALUES("
            + std::to_string(time) + ","
            + std::to_string(i) + ","
            + std::to_string(pressures[i]) + ");";
        sqlite3_exec(impl_->db, sql.c_str(), nullptr, nullptr, nullptr);
    }

    // Write mass flows
    for (size_t i = 0; i < massFlows.size(); ++i) {
        std::string sql = "INSERT INTO transient_flows VALUES("
            + std::to_string(time) + ","
            + std::to_string(i) + ","
            + std::to_string(massFlows[i]) + ");";
        sqlite3_exec(impl_->db, sql.c_str(), nullptr, nullptr, nullptr);
    }

    // Write concentrations
    for (size_t i = 0; i < concentrations.size(); ++i) {
        for (size_t k = 0; k < concentrations[i].size(); ++k) {
            std::string sql = "INSERT INTO transient_conc VALUES("
                + std::to_string(time) + ","
                + std::to_string(i) + ","
                + std::to_string(k) + ","
                + std::to_string(concentrations[i][k]) + ");";
            sqlite3_exec(impl_->db, sql.c_str(), nullptr, nullptr, nullptr);
        }
    }
}

void SqliteWriter::finalize() {
    sqlite3_exec(impl_->db, "COMMIT;", nullptr, nullptr, nullptr);
}

} // namespace contam

#endif // CONTAM_HAS_SQLITE3
