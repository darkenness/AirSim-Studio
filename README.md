# CONTAM-Next

多区域室内空气质量与通风仿真软件 — NIST CONTAM 的现代重构版本。

Multi-zone indoor air quality and ventilation simulation software — a modern reimplementation of NIST CONTAM.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Tauri 2.0 Desktop App                                  │
│  ┌────────────────────────┐  ┌────────────────────────┐ │
│  │  React + TypeScript     │  │ Rust Backend           │ │
│  │  • SketchPad (Konva)    │  │ • run_engine command   │ │
│  │  • PropertyPanel        │◄─┤ • File I/O             │ │
│  │  • ContaminantPanel     │  │ • JSON temp files      │ │
│  │  • ScheduleEditor       │  └──────────┬─────────────┘ │
│  │  • ControlPanel         │             │               │
│  │  • ResultsView (ECharts)│             │               │
│  │  • Zustand + zundo      │             │               │
│  └────────────────────────┘             │               │
└──────────────────────────────────────────┼───────────────┘
                                           │ CLI call
                              ┌────────────▼──────────────┐
                              │  C++17 Engine (100 tests)  │
                              │  • N-R Solver (Trust+SUR)  │
                              │  • 6 FlowElement types     │
                              │  • Control System (PI)     │
                              │  • Contaminant Transport   │
                              │  • Occupant Exposure       │
                              │  • Eigen sparse + PCG      │
                              │  • JSON I/O                │
                              └────────────┬──────────────┘
                                           │
                              ┌────────────▼──────────────┐
                              │  Python API (pybind11)     │
                              │  • pycontam module         │
                              │  • HDF5 export (h5py)      │
                              └───────────────────────────┘
```

## Quick Start

### Prerequisites

- **C++**: Visual Studio 2019+ with C++ workload, CMake 3.20+
- **Frontend**: Node.js 20+, Rust toolchain (for Tauri)
- **Python** (optional): Python 3.8+, pybind11

### Build Engine

```bash
cd engine
cmake -S . -B build -G "Visual Studio 16 2019" -A x64
cmake --build build --config Release
# Run 100 tests
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
├── engine/              # C++17 calculation engine
│   ├── src/core/        # Node, Link, Network, Solver, ContaminantSolver, TransientSimulation, Occupant, PcgSolver
│   ├── src/elements/    # PowerLawOrifice, Fan, TwoWayFlow, Duct, Damper, Filter
│   ├── src/control/     # Sensor, Controller (PI), Actuator
│   ├── src/io/          # JsonReader, JsonWriter, Hdf5Writer
│   └── test/            # 100 Google Test cases (7 test files)
├── app/                 # Tauri 2.0 + React frontend
│   ├── src/components/  # SketchPad, PropertyPanel, ContaminantPanel, ScheduleEditor, ControlPanel, ModelSummary, ResultsView, StatusBar, Toolbar
│   ├── src/store/       # Zustand + zundo (Undo/Redo)
│   └── src-tauri/       # Rust backend (run_engine IPC)
├── python/              # pybind11 Python API (pycontam)
├── schemas/             # JSON Schema v2.0
├── docs/                # 用户手册 (user-manual.md)
├── validation/          # 4 verification cases
└── .github/workflows/   # CI/CD (GitHub Actions)
```

## Features

### C++ Engine (100/100 tests)
- **求解器**: Newton-Raphson + 信赖域 + 亚松弛 + PCG (BiCGSTAB)
- **6 种气流元件**: 幂律孔口, 大开口双向流, 风扇(含多项式曲线), 风管(Darcy-Weisbach), 阀门, 过滤器
- **瞬态求解**: 隐式欧拉污染物传输 + 气流-污染物耦合
- **控制系统**: Sensor → PI Controller (死区+抗饱和) → Actuator → FlowElement
- **人员暴露**: 累积吸入剂量 + 峰值浓度 + 多物种跟踪

### Frontend (tsc clean)
- **中文 UI**: 工具栏, 属性面板, 结果视图, 状态栏
- **画布**: Konva 拖拽编辑, 缩放/平移, 网格对齐
- **Undo/Redo**: zundo 时间旅行中间件 (Ctrl+Z/Ctrl+Shift+Z)
- **6 种元件编辑器**: 切换类型自动填充默认参数
- **排程编辑器**: 可视化折线图 + 预设模板 (工作日/24h/夜间)
- **控制面板**: 传感器/控制器/执行器 CRUD + PI 参数
- **ECharts**: 瞬态浓度 + 压力时序图
- **CSV 导出**: UTF-8 BOM 编码

### Python API (5/5 tests)
- **pycontam**: Node, Network, Solver, 全部元件类型
- **便捷函数**: `solve_from_json()`, `load_network()`

## Status

- ✅ Phase 0: Build system + project setup
- ✅ Phase 1: Steady-state airflow solver (23 tests)
- ✅ Phase 2: Minimum viable GUI + frontend-backend integration
- ✅ Phase 3: Transient contaminant transport (34 tests, ECharts)
- ✅ Phase 4: Fan, TwoWayFlow, Duct elements (64 tests)
- ✅ Phase 5: Damper + CSV export (75 tests, 4 validation cases)
- ✅ Phase 6: ModelSummary + StatusBar
- ✅ Phase 7: Python API via pybind11 (5/5 tests)
- ✅ Phase 8: HDF5 output (h5py, gzip compression)
- ✅ Sprint 1: Canvas zoom/pan + Undo/Redo (zundo)
- ✅ Sprint 2: ScheduleEditor + Filter element (83 tests)
- ✅ Sprint 3: Control system — Sensor/Controller/Actuator (91 tests)
- ✅ Sprint 4: Occupant exposure + Fan polynomial + PCG solver + JSON Schema v2.0 + 用户手册 (100 tests)
- ✅ Sprint 5: ControlPanel UI + progress bar
- ✅ Sprint 6: CI/CD (GitHub Actions)
