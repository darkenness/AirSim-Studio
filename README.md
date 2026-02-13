# CONTAM-Next

Multi-zone indoor air quality and ventilation simulation software — a modern reimplementation of NIST CONTAM.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Tauri 2.0 Desktop App                          │
│  ┌──────────────────────┐  ┌──────────────────┐ │
│  │  React + TypeScript   │  │ Rust Backend     │ │
│  │  • SketchPad (Konva)  │  │ • Engine bridge  │ │
│  │  • PropertyPanel      │◄─┤ • File I/O       │ │
│  │  • ResultsView        │  │ • IPC commands   │ │
│  │  • Zustand store      │  └────────┬─────────┘ │
│  └──────────────────────┘           │            │
└─────────────────────────────────────┼────────────┘
                                      │ CLI call
                              ┌───────▼───────────┐
                              │  C++17 Engine      │
                              │  • N-R Solver      │
                              │  • Eigen sparse    │
                              │  • JSON I/O        │
                              │  engine -i X -o Y  │
                              └───────────────────┘
```

## Quick Start

### Prerequisites

- **C++**: Visual Studio 2019+ with C++ workload, CMake 3.20+
- **Frontend**: Node.js 20+, Rust toolchain (for Tauri)

### Build Engine

```bash
cd engine
cmake -S . -B build -G "Visual Studio 16 2019" -A x64
cmake --build build --config Release
# Run tests
./build/Release/contam_tests.exe
# Run CLI
./build/Release/contam_engine.exe -i ../validation/case01_3room/input.json -o output.json -v
```

### Run Frontend (Dev Mode)

```bash
cd app
npm install
npm run dev          # Browser-only (mock solver)
npx tauri dev        # Full Tauri desktop app (calls real engine)
```

## Project Structure

```
contam-next/
├── engine/          # C++17 calculation engine
│   ├── src/core/    # Node, Link, Network, Solver
│   ├── src/elements/# FlowElement polymorphic hierarchy
│   ├── src/io/      # JSON reader/writer
│   └── test/        # Google Test suite
├── app/             # Tauri + React frontend
│   ├── src/         # React components + Zustand store
│   └── src-tauri/   # Rust backend (engine bridge)
├── schemas/         # JSON Schema definitions
└── validation/      # Test cases for engine verification
```

## Status

- ✅ Phase 0: Build system + project setup
- ✅ Phase 1: Steady-state airflow solver (23/23 tests pass)
- ✅ Phase 2: Minimum viable GUI + frontend-backend integration
- ✅ Phase 3: Transient contaminant transport (34/34 tests, ECharts visualization)
- ⬜ Phase 4: Full flow element library + HVAC + HDF5
- ⬜ Phase 5: Control systems + advanced models
- ⬜ Phase 6: Python API + release
