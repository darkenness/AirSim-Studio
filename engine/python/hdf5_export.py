"""
CONTAM-Next HDF5 Export Utility
================================
Converts JSON simulation results to HDF5 format using h5py.
Works with both steady-state and transient results.

Usage:
    python hdf5_export.py <input.json> <output.h5>
    python -m hdf5_export <input.json> <output.h5>
"""
import json
import sys
import os
import numpy as np

try:
    import h5py
except ImportError:
    print("Error: h5py is required. Install with: pip install h5py")
    sys.exit(1)


def export_steady_state(data: dict, h5file: h5py.File):
    """Export steady-state solver results to HDF5."""
    solver = data.get("solver", {})
    grp = h5file.create_group("solver")
    grp.attrs["converged"] = solver.get("converged", False)
    grp.attrs["iterations"] = solver.get("iterations", 0)
    grp.attrs["max_residual"] = solver.get("maxResidual", 0.0)

    # Nodes
    nodes = data.get("nodes", [])
    if nodes:
        ng = h5file.create_group("nodes")
        ng.create_dataset("id", data=[n["id"] for n in nodes])
        ng.create_dataset("name", data=[n["name"].encode("utf-8") for n in nodes])
        ng.create_dataset("pressure", data=[n.get("pressure", 0.0) for n in nodes])
        ng.create_dataset("density", data=[n.get("density", 0.0) for n in nodes])
        ng.create_dataset("temperature", data=[n.get("temperature", 0.0) for n in nodes])
        ng.create_dataset("elevation", data=[n.get("elevation", 0.0) for n in nodes])

    # Links
    links = data.get("links", [])
    if links:
        lg = h5file.create_group("links")
        lg.create_dataset("id", data=[l["id"] for l in links])
        lg.create_dataset("from", data=[l["from"] for l in links])
        lg.create_dataset("to", data=[l["to"] for l in links])
        lg.create_dataset("massFlow", data=[l.get("massFlow", 0.0) for l in links])
        lg.create_dataset("volumeFlow", data=[l.get("volumeFlow_m3s", 0.0) for l in links])


def export_transient(data: dict, h5file: h5py.File):
    """Export transient simulation results to HDF5."""
    h5file.attrs["completed"] = data.get("completed", False)
    h5file.attrs["totalSteps"] = data.get("totalSteps", 0)

    # Species metadata
    species = data.get("species", [])
    if species:
        sg = h5file.create_group("species")
        sg.create_dataset("id", data=[s["id"] for s in species])
        sg.create_dataset("name", data=[s["name"].encode("utf-8") for s in species])
        sg.create_dataset("molarMass", data=[s.get("molarMass", 0.029) for s in species])

    # Node metadata
    nodes = data.get("nodes", [])
    if nodes:
        ng = h5file.create_group("nodes")
        ng.create_dataset("id", data=[n["id"] for n in nodes])
        ng.create_dataset("name", data=[n["name"].encode("utf-8") for n in nodes])
        ng.create_dataset("type", data=[n.get("type", "normal").encode("utf-8") for n in nodes])

    # Time series data
    ts = data.get("timeSeries", [])
    if ts:
        num_steps = len(ts)
        num_nodes = len(nodes)
        num_species = len(species)

        tg = h5file.create_group("timeSeries")

        # Time vector
        times = np.array([step["time"] for step in ts])
        tg.create_dataset("time", data=times, compression="gzip")

        # Airflow data
        ag = tg.create_group("airflow")
        converged = np.array([step["airflow"]["converged"] for step in ts])
        ag.create_dataset("converged", data=converged)

        if ts[0]["airflow"].get("pressures"):
            pressures = np.array([step["airflow"]["pressures"] for step in ts])
            ag.create_dataset("pressures", data=pressures, compression="gzip")
            ag.attrs["shape_info"] = "pressures[time_step, node_index]"

        if ts[0]["airflow"].get("massFlows"):
            mass_flows = np.array([step["airflow"]["massFlows"] for step in ts])
            ag.create_dataset("massFlows", data=mass_flows, compression="gzip")
            ag.attrs["shape_info"] = "massFlows[time_step, link_index]"

        # Concentration data
        if num_species > 0:
            conc = np.zeros((num_steps, num_nodes, num_species))
            for i, step in enumerate(ts):
                if step.get("concentrations"):
                    for j in range(num_nodes):
                        if j < len(step["concentrations"]):
                            for k in range(num_species):
                                if k < len(step["concentrations"][j]):
                                    conc[i, j, k] = step["concentrations"][j][k]

            cg = tg.create_group("concentrations")
            cg.create_dataset("data", data=conc, compression="gzip", chunks=True)
            cg.attrs["shape_info"] = "data[time_step, node_index, species_index]"
            cg.attrs["units"] = "kg/m3"


def export_json_to_hdf5(json_path: str, hdf5_path: str):
    """Convert a JSON results file to HDF5 format."""
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    with h5py.File(hdf5_path, "w") as h5f:
        h5f.attrs["generator"] = "CONTAM-Next v0.1.0"
        h5f.attrs["source_file"] = os.path.basename(json_path)

        if "timeSeries" in data:
            h5f.attrs["result_type"] = "transient"
            export_transient(data, h5f)
        else:
            h5f.attrs["result_type"] = "steady_state"
            export_steady_state(data, h5f)

    # Report file sizes
    json_size = os.path.getsize(json_path)
    hdf5_size = os.path.getsize(hdf5_path)
    ratio = json_size / hdf5_size if hdf5_size > 0 else 0
    print(f"Exported: {json_path} -> {hdf5_path}")
    print(f"  JSON:  {json_size:>10,} bytes")
    print(f"  HDF5:  {hdf5_size:>10,} bytes")
    print(f"  Ratio: {ratio:.1f}x compression")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python hdf5_export.py <input.json> <output.h5>")
        sys.exit(1)

    export_json_to_hdf5(sys.argv[1], sys.argv[2])
