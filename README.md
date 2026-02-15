# CONTAM-Next

多区域室内空气质量与通风仿真软件 — NIST CONTAM 的现代重构版本。

Multi-zone indoor air quality and ventilation simulation software — a modern reimplementation of NIST CONTAM.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Tauri 2.0 Desktop App                                    │
│  ┌─────────────────────────┐  ┌────────────────────────┐ │
│  │  React 19 + TypeScript   │  │ Rust Backend           │ │
│  │  • Canvas2D (HTML5 2D)   │  │ • run_engine command   │ │
│  │  • PropertyPanel         │◄─┤ • File I/O             │ │
│  │  • ContaminantPanel      │  │ • JSON temp files      │ │
│  │  • ControlFlowCanvas     │  └──────────┬─────────────┘ │
│  │  • ResultsView (ECharts) │             │               │
│  │  • Zustand + zundo       │             │               │
│  └─────────────────────────┘             │               │
└───────────────────────────────────────────┼───────────────┘
                                            │ CLI call
                               ┌────────────▼──────────────┐
                               │  C++17 Engine (139 tests)  │
                               │  • N-R Solver (Trust+SUR)  │
                               │  • 13 FlowElement types    │
                               │  • Control System (PI)     │
                               │  • Contaminant Transport   │
                               │  • Occupant Exposure       │
                               │  • Eigen sparse + PCG      │
                               │  • JSON I/O + HDF5         │
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
# Run 139 tests
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
├── engine/                 # C++17 calculation engine
│   ├── src/core/           # Node, Link, Network, Solver, ContaminantSolver, TransientSimulation
│   ├── src/elements/       # 13 flow elements (PowerLaw, Fan, Duct, TwoWayFlow, Damper, Filter, CheckValve, SelfRegVent, ...)
│   ├── src/control/        # Sensor, Controller (PI), Actuator, LogicNodes (14 types)
│   ├── src/io/             # JsonReader, JsonWriter, Hdf5Writer, WeatherReader, ContaminantReader
│   ├── test/               # 139 GoogleTest cases (9 test files)
│   └── python/             # pycontam pybind11 bindings
├── app/                    # Tauri 2.0 + React 19 frontend
│   ├── src/canvas/         # Canvas2D (Excalidraw-style infinite 2D editor)
│   ├── src/components/     # TopBar, PropertyPanel, ContaminantPanel, ControlPanel, ScheduleEditor, ResultsView, ...
│   ├── src/control/        # React Flow control network visualization
│   ├── src/store/          # Zustand + zundo (useCanvasStore, useAppStore)
│   ├── src/model/          # geometry.ts (Vertex→Edge→Face), dataBridge.ts (canvas→engine JSON)
│   └── src-tauri/          # Rust backend (run_engine IPC)
├── schemas/                # topology.schema.json
├── docs/                   # algorithm-formulas.md, user-manual.md, validation-report.md
└── validation/             # 4 verification case studies
```

## Features

### C++ Engine (139 tests)
- **求解器**: Newton-Raphson + 信赖域 + 亚松弛 + PCG (BiCGSTAB) + RCM 节点重排序
- **13 种气流元件**: 幂律孔口, Brown-Solvason 双向流, 风扇(多项式曲线), 风管(Darcy-Weisbach), 阀门, 过滤器, 自调节通风口, 单向阀, 二次元件, 逆止阀, 粒子过滤器, 送风口, 回风口
- **4 种源类型**: 恒定源, 指数衰减源, 压力驱动源, 浓度切断源
- **瞬态求解**: 隐式欧拉 + 耦合多物种求解器 + 非痕量密度反馈耦合
- **控制系统**: Sensor → CONTAM 标准增量式 PI 控制器 (死区+硬截断) → Actuator + 14 种逻辑节点
- **化学动力学**: 一阶反应矩阵 (ChemicalKinetics) + 耦合求解器
- **高级源汇**: Axley 边界层扩散(可逆吸附), 气溶胶沉积/重悬浮, 超级过滤器(级联+载灰量)
- **人员暴露**: 累积吸入剂量 + 峰值浓度 + 多物种 + 区域移动时间表

### Frontend
- **画布**: HTML5 Canvas 2D (Excalidraw 风格), 正交墙体绘制, 顶点吸附, 矩形房间工具
- **构件放置**: 门/窗/开口/风机/风管/风阀/过滤器/裂缝/自调节通风口/单向阀
- **多楼层**: 楼层切换器, 背景图叠加
- **控制流**: React Flow 可视化 (Sensor, PI Controller, Actuator, Math, Logic 节点)
- **Undo/Redo**: zundo 时间旅行中间件 (Ctrl+Z / Ctrl+Shift+Z)
- **结果展示**: 稳态表格, 瞬态浓度图表 (ECharts), 暴露报告, CSV 导出
- **中文 UI**: 工具栏, 属性面板, 状态栏, 快捷键对话框

### Python API
- **pycontam**: Node, Network, Solver, 全部元件类型
- **便捷函数**: `solve_from_json()`, `load_network()`

## Status

- ✅ Phase 0–8: 引擎核心 + 前端基础 + Python API + HDF5
- ✅ Sprint 1–6: Canvas 编辑器 + 控制系统 + CI/CD
- ✅ 高级功能: ChemKinetics + AxleyBLD + Aerosol + SuperFilter + RCM + 13 元件 (**139 tests**)
- ✅ Canvas 迁移: Konva → HTML5 Canvas 2D (Excalidraw 风格)
- ✅ 控制流可视化: React Flow + 5 种自定义节点
- 🔲 结果叠加层接入 (流向箭头, 浓度热力图, 压力标签, 风压矢量)
- 🔲 前端测试 (Vitest + Playwright)
- 🔲 Tauri 原生文件对话框
- 🔲 StateNode 层级状态机启用
