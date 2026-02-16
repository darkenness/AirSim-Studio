# CONTAM-Next — 开发指南

## 项目概述

多区域室内空气质量与通风仿真平台，NIST CONTAM 的现代重构版本。

## 技术栈

| 层 | 技术 |
|---|------|
| 引擎 | C++17, Eigen 3.4, nlohmann-json, CMake 3.20+, GoogleTest |
| 桌面 | Tauri 2.0 (Rust), externalBin 调用 C++ CLI |
| 前端 | React 19 + TypeScript 5.9, Vite 8, HTML5 Canvas 2D |
| 状态 | Zustand 5 + zundo (undo/redo) |
| 控制流 | @xyflow/react 12 (React Flow) |
| 图表 | ECharts 6 |
| 样式 | TailwindCSS v4 + shadcn/ui (Radix 原语) |
| Python | pybind11 (可选) |

## 项目结构

```
contam-next/
├── engine/                 # C++17 计算引擎
│   ├── src/core/           # 19 个核心模块: Node, Link, Network, Solver, ContaminantSolver, TransientSimulation, Species, Schedule, WeekSchedule, ChemicalKinetics, AerosolDeposition, AxleyBLD, SuperFilter, SimpleAHS, Occupant, OneDZone, DuctNetwork, AdaptiveIntegrator, PcgSolver
│   ├── src/elements/       # 16 种气流元件 (PowerLaw, Fan, Duct, Damper, Filter, TwoWayFlow, CheckValve, SelfRegVent, QuadraticElement, BackdraftDamper, SupplyDiffuser, ReturnGrille, ...)
│   ├── src/control/        # Sensor, Controller (PI+死区+抗饱和), Actuator, 15 种 LogicNodes (AND/OR/NOT/XOR, Sum/Avg/Min/Max, Exp/Ln/Abs, Multiply/Divide, Integrator, MovingAverage)
│   ├── src/io/             # JsonReader, JsonWriter, Hdf5Writer, WeatherReader, ContaminantReader, CvfReader, WpcReader, CbwReport, SqliteWriter, AchReport, CsmReport, ValReport, EbwReport, CexReport, LogReport, OneDOutput
│   ├── test/               # 266 GoogleTest 用例 (16 个测试文件)
│   └── python/             # pycontam pybind11 绑定
├── app/                    # React 前端
│   ├── src/canvas/         # Canvas2D 渲染器 (Excalidraw 风格无限画布)
│   │   ├── Canvas2D.tsx    # 主画布组件 (DPI-aware, rAF dirty-flag 渲染)
│   │   ├── camera2d.ts     # 世界↔屏幕坐标变换, 缩放/平移
│   │   ├── renderer.ts     # 纯渲染函数 (网格, 区域, 墙体, 顶点, 构件, 预览)
│   │   ├── interaction.ts  # 正交约束, 顶点吸附, 命中测试
│   │   └── components/     # FloatingStatusBox, FloorSwitcher, ZoomControls, TimeStepper, ContextMenu, ScaleFactorControl, TracingImageControls, ToolModeIndicator
│   ├── src/components/     # UI 组件
│   │   ├── TopBar/         # 工具栏 (运行, 保存, 加载, 导出, 暗色模式)
│   │   ├── VerticalToolbar/# 左侧工具栏 (选择, 墙体, 矩形, 门, 窗, 擦除)
│   │   ├── PropertyPanel/  # 右侧属性面板 (区域/边/构件/楼层属性)
│   │   ├── ContaminantPanel/ # 污染物/物种配置
│   │   ├── ControlPanel/   # 控制系统配置
│   │   ├── ScheduleEditor/ # 时间表编辑器 (ECharts 可视化)
│   │   ├── FilterPanel/    # 过滤器配置 (气体/UVGI/超级过滤器)
│   │   ├── AHSPanel/       # 空调系统配置
│   │   ├── WeatherPanel/   # 气象数据配置
│   │   ├── OccupantPanel/  # 人员暴露配置
│   │   ├── LibraryManager/ # 库管理器
│   │   ├── ResultsView/    # 稳态结果展示
│   │   ├── TransientChart/ # 瞬态浓度图表
│   │   ├── ExposureReport/ # 暴露报告
│   │   ├── ScheduleGantt/  # 时间表甘特图
│   │   ├── ModelSummary/   # 模型摘要
│   │   ├── WelcomePage/    # 欢迎页面
│   │   ├── StatusBar/      # 底部状态栏
│   │   ├── ShortcutDialog/ # 快捷键帮助对话框
│   │   └── ui/             # shadcn/ui 基础组件 (14 个 Radix 原语)
│   ├── src/control/        # React Flow 控制流画布
│   ├── src/store/          # Zustand stores (useCanvasStore, useAppStore)
│   ├── src/model/          # geometry.ts (Vertex→Edge→Face), dataBridge.ts (画布→引擎 JSON)
│   ├── src/tools/          # StateNode (预留的层级状态机)
│   ├── src/types/          # TypeScript 类型定义 (31 个 interface + 5 个 type)
│   ├── src/hooks/          # 自定义 hooks (use-toast, useMergedRooms)
│   ├── src/utils/          # 工具函数 (fileOps — Tauri 原生对话框 + 浏览器回退)
│   ├── src/lib/            # 通用工具 (cn 类名合并)
│   └── src-tauri/          # Tauri Rust 后端 (run_engine IPC, UUID 临时文件)
├── schemas/                # topology.schema.json
├── validation/             # 4 个验证案例
└── docs/                   # 算法公式, 用户手册, 验证报告
```

## 常用命令

```bash
# 前端开发
cd app && npm run dev          # Vite 开发服务器 (localhost:5173)
cd app && npm run build        # TypeScript 检查 + 生产构建
cd app && npm run lint         # ESLint
cd app && npx tauri dev        # Tauri 桌面应用 (调用真实引擎)

# C++ 引擎
cd engine
cmake -S . -B build -G "Visual Studio 16 2019" -A x64
cmake --build build --config Release
./build/Release/contam_tests.exe    # 运行 266 个测试
./build/Release/contam_engine.exe -i ../validation/case01_3room/input.json -o output.json -v
```

## 架构约定

### 画布系统
- **Canvas2D** 使用 HTML5 Canvas 2D API，Excalidraw 风格 (非 Three.js/Konva)
- 渲染循环: `requestAnimationFrame` + dirty-flag，仅在状态变化时重绘
- 坐标系: 世界坐标 (米) ↔ 屏幕坐标 (像素)，camera2d.ts 负责变换
- 几何模型: Vertex → Edge → Face (受 Floorspace.js 启发)
- 命中测试优先级: Placement > Edge > Face

### 状态管理
- `useCanvasStore` (45 个 action): 画布几何、工具模式、选择/悬停状态、楼层管理 (CRUD+复制)、背景图、比例因子、相机控制、侧边栏
- `useAppStore` (42 个 action): 全局应用状态 (节点、链接、物种、源、时间表、周计划、日类型、人员、控制系统、天气、AHS、过滤器、仿真结果)
- 两个 store 都通过 zundo 支持 undo/redo

### 数据流
- 画布几何 → `dataBridge.ts:canvasToTopology()` → 引擎 JSON
- Tauri: `invoke('run_engine', { input })` → C++ CLI → JSON 结果
- 浏览器模式: mock 数据回退

### 代码风格
- UI 文本使用中文
- 组件使用 shadcn/ui + Radix 原语
- 图标使用 lucide-react
- 样式使用 TailwindCSS v4 utility classes

## 当前开发状态

### 已完成
- C++ 引擎: 16 种气流元件, N-R 求解器 (TrustRegion+SUR), PCG 迭代, 隐式欧拉, 5 种源类型, PI 控制器+死区, 15 种逻辑节点, 化学动力学, 气溶胶沉积/重悬浮, Axley BLD 吸附, SimpleParticleFilter (三次样条), SuperFilter (级联+负载衰减), 风压 Cp(θ) 配置, WeekSchedule/DayType, SimpleAHS, 乘员暴露追踪, 气象文件读取, JSON/HDF5 I/O, OneDZone (1D FVM), AdaptiveIntegrator (BDF), DuctNetwork, SqliteWriter, AchReport, CsmReport, CvfReader/DvfReader (外部时序), WpcReader (非均匀风压), CbwReport (箱线图统计), ValReport (加压测试), EbwReport (暴露记录), CexReport (外渗追踪), LogReport (控制日志), OneDOutput (1D 二进制输出)
- 前端画布: 墙体/矩形绘制, 门窗放置, 多楼层, 缩放/平移, undo/redo
- 属性面板: 区域/边/构件/楼层属性编辑
- 控制流: React Flow 可视化 (Sensor, PI Controller, Actuator, Math, Logic 节点)
- 结果展示: 稳态表格, 瞬态图表, 暴露报告, CSV 导出
- Tauri 集成: run_engine IPC, externalBin 打包

### 待完成 — 集成缺口
1. **StateNode 未启用** — 层级状态机已编写但工具仍使用 switch(toolMode)

> 注：结果叠加层、背景图渲染、风压矢量、文件对话框均已在 Phase 5/14R 中完成接入。

### 已完成 — Phase 4 + 4.5
- ✅ 前端 266 个 Vitest 测试 (8 个测试文件: geometry, camera2d, interaction, useCanvasStore, useAppStore, dataBridge, dagValidation, fileOps)
- ✅ 引擎 JSON 解析 (气象记录, AHS 系统, 人员)
- ✅ DAG 环路检测 (控制流画布)
- ✅ HDF5 输出 (稳态+瞬态, 物种/节点元数据)
- ✅ SimpleGaseousFilter + UVGI 过滤器元件
- ✅ 暗色模式全组件适配 (7 个组件, 无硬编码颜色)
- ✅ PropertyPanel 标签页布局优化 (flex-wrap)
- ✅ Null-safety 修复 (FloatingStatusBox, ZoneProperties, EdgeProperties, PlacementProperties, StoryProperties)
- ✅ ResultsView 底部面板响应式布局
- ✅ CI 添加 Vitest 步骤
- ✅ AHS 配置面板, 气象面板

### 已完成 — Phase 5 (P0 功能补全, 2026-02-15)

#### 引擎 P0 — 全部已完成 (确认已实现)
- ✅ E-01 BurstSource: 5 种源类型全部实现 (Constant, ExponentialDecay, PressureDriven, CutoffConcentration, Burst)，含 factory 方法、JSON 解析
- ✅ E-02 SimpleGaseousFilter: 已实现 (负载量-效率曲线)
- ✅ E-03 UVGI: 已实现 (Penn State 模型)
- ✅ E-04 非微量密度耦合: TransientSimulation 中已实现 (hasNonTraceSpecies → 密度-气流迭代, 最多 5 轮)

#### 前端 P0 — 已完成
- ✅ F-01 WeekSchedule/DayType 编辑器:
  - 新增 `DayType` 和 `WeekSchedule` TypeScript 类型 (types/index.ts)
  - useAppStore 新增 9 个 CRUD action (addWeekSchedule/updateWeekSchedule/removeWeekSchedule, addDayType/updateDayType/removeDayType, updateSchedule/removeSchedule)
  - 新建 `WeekScheduleEditor.tsx` 组件 (日类型管理 + 周计划 7 天分配)
  - ScheduleEditor 重构: 使用 store action 替代 setState 直接操作, 新增 "时间表/周计划" 标签页切换
- ✅ F-02 源/汇完整配置面板:
  - SourceType 新增 `'Burst'` 类型
  - Source 接口新增 `burstMass`, `burstTime`, `burstDuration` 字段
  - ContaminantPanel 新增 "爆发式释放源" 选项及参数输入 (释放总量/触发时间/持续时间)
  - 现在支持全部 5 种源类型的 UI 配置

#### 前端 P1 — ✅ 全部完成
- ✅ F-05 Schedule CRUD: useAppStore 新增 updateSchedule/removeSchedule action
- ✅ F-03 背景图渲染接入: Canvas2D L87-102 useEffect 加载 + L154-163 渲染步骤 0 调用 drawBackgroundImage
- ✅ F-04 风压矢量接入: Canvas2D L342-360 results mode 中计算 Cp(θ) 并调用 drawWindPressureVectors
- ✅ F-06 TimeStepper 瞬态回放: Canvas2D L211-215 使用 currentTransientStep 索引瞬态时间步进行叠加渲染

---

## 功能缺口开发计划 (对照 CONTAM 3.4 完整功能)

> 基于 `深入探究内容.md` 逐项比对后识别的缺失功能

### P0 — 核心功能缺失 (必须实现)

#### 引擎 — ✅ 全部完成
| # | 功能 | 状态 |
|---|------|------|
| E-01 | BurstSource 爆发式释放源 | ✅ 已实现 |
| E-02 | SimpleGaseousFilter 气体过滤器 | ✅ 已实现 |
| E-03 | UVGI 紫外杀菌过滤器 | ✅ 已实现 |
| E-04 | 非微量污染物密度耦合 | ✅ 已实现 |

#### 前端 — ✅ 全部完成
| # | 功能 | 状态 |
|---|------|------|
| F-01 | WeekSchedule/DayType 编辑器 | ✅ 类型+Store+UI 组件 |
| F-02 | 源/汇模型完整配置面板 | ✅ 5 种源类型 UI |

### P1 — 重要功能缺失 (高优先级) — ✅ 全部完成

#### 引擎 — ✅ 全部完成
| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| E-05 | 1D 对流-扩散区域求解器 | ✅ 已实现 | OneDZone.h/cpp — Patankar 上风 FVM + CFL 稳定性 |
| E-06 | 自适应变步长积分器 | ✅ 已实现 | AdaptiveIntegrator.h/cpp — BDF-1/BDF-2 + 误差控制 |
| E-07 | 管道网络拓扑 (Junction/Terminal) | ✅ 已实现 | DuctNetwork.h/cpp — 多管道串并联 + N-R 压力流量求解 |
| E-08 | 自动管道平衡 DuctBalance | ✅ 已实现 | DuctNetwork::autoBalance() — 迭代末端流量平衡 |
| E-09 | SQLite3 输出 (.SQLITE3) | ✅ 已实现 | SqliteWriter.h/cpp — pImpl + 事务写入 |
| E-10 | ACH 换气次数报告 (.ACH) | ✅ 已实现 | AchReport.h/cpp — 总/机械/渗透分项 |
| E-11 | 污染物汇总报告 (.CSM) | ✅ 已实现 | CsmReport.h/cpp — 时均/峰值浓度 + 外渗估算 |

#### 前端 — ✅ 全部完成
| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| F-03 | 背景图渲染接入 | ✅ 已完成 | Canvas2D render loop 已接入 drawBackgroundImage |
| F-04 | 风压矢量接入 | ✅ 已完成 | Canvas2D render loop 已接入 drawWindPressureVectors |
| F-05 | Schedule CRUD | ✅ 已完成 | updateSchedule/removeSchedule action 已加入 useAppStore |
| F-06 | TimeStepper 瞬态回放 | ✅ 已完成 | 通过 useCanvasStore.currentTransientStep 联动 Canvas2D 结果叠加 |
| F-10 | 过滤器配置面板 | ✅ 已完成 | FilterPanel — 气体/UVGI/超级过滤器参数配置 (从 P2 提前完成) |

#### 验证测试 — ✅ 全部完成
| Case | 场景 | 状态 |
|------|------|------|
| 01 | 3 房间浮力驱动 | ✅ 4 个测试 |
| 02 | CO₂ 瞬态源 (开关调度) | ✅ 4 个测试 |
| 03 | 风机+管道+门网络 | ✅ 4 个测试 |
| 04 | 多区域多物种 (CO₂+PM2.5) | ✅ 4 个测试 |

### P2 — 进阶功能 (中优先级) — 大部分已完成

#### 引擎 — 大部分已完成
| # | 功能 | 状态 | 说明 | 对应文档章节 |
|---|------|------|------|-------------|
| E-12 | CFD 区域耦合求解 | 待实现 | 零阶湍流 CFD 求解器 + 宏观网络双向边界条件交换 | §2.2 |
| E-13 | CVF/DVF 外部数据文件驱动 | ✅ 已完成 | CvfReader + DvfReader，线性插值/阶跃保持 | §5.2 |
| E-14 | TCP/IP 套接字桥接模式 | 待实现 | ContamX Bridge Mode，外部程序实时遥控 | §7.1 |
| E-15 | FMI/FMU 联合仿真接口 | 待实现 | EnergyPlus/TRNSYS 耦合，温度-气流-浓度双向交换 | §7.2 |
| E-16 | WPC 空间非均匀外部边界 | ✅ 已完成 | WpcReader，逐开口逐时间步风压/浓度导入 | §5.1 |
| E-17 | 超级控制元件 SuperElement | 待实现 | 可复用的封装控制回路，库文件存储，实例化部署 | §5.3 |
| E-18 | 箱线图日统计 (.CBW) | ✅ 已完成 | CbwReport，日均/峰值/分位数 + text/csv | §9 |
| E-19 | 污染外渗追踪 (.CEX) | ✅ 已完成 | CexReport.h/cpp — 逐开口溯源泄漏量 (基础/详细模式), 7 个测试 | §9 |
| E-20 | 乘员暴露记录 (.EBW) | ✅ 已完成 | EbwReport.h/cpp — 个人呼吸道吸入量评估, 8 个测试 | §9 |
| E-21 | 建筑加压测试 (.VAL) | ✅ 已完成 | ValReport.h/cpp — 鼓风门模拟 50Pa 泄漏量, 6 个测试 | §9 |

#### 前端 — 部分完成
| # | 功能 | 状态 | 说明 | 对应文档章节 |
|---|------|------|------|-------------|
| F-07 | 库管理器 LibraryManager | 部分实现 — PropertyPanel 已导入并渲染 LibraryManager 组件于"库管理"标签页 | §6.2 |
| F-08 | 底图追踪 TracingImage | 部分实现 — TracingImageControls 组件已在 Canvas2D 中渲染 | §2.1 |
| F-09 | 浮动状态框接入 | 部分实现 — FloatingStatusBox 已在 Canvas2D 中渲染，结果模式数据接入待完善 | §6.2 |
| ~~F-10~~ | ~~过滤器配置面板~~ | ✅ 已在 P1 阶段提前完成 | §4.3 |
| F-11 | 伪几何比例因子 | ✅ 已完成 — useCanvasStore.scaleFactor + dataBridge sf/sf2/sf3 自动换算 + ScaleFactorControl 组件 + renderer 物理尺寸标注 | §2.1 |

### P3 — 远期功能 (低优先级)

| # | 功能 | 说明 | 对应文档章节 |
|---|------|------|-------------|
| E-22 | 控制节点日志 (.LOG) | ✅ 已完成 — LogReport.h/cpp, 10 个测试 | §9 |
| E-23 | 1D 专用二进制输出 (.RXR/.RZF/.RZM/.RZ1) | ✅ 已完成 — OneDOutput.h/cpp, 14 个测试 | §9 |
| F-12 | 联合仿真配置 UI | 待实现 — TCP/IP 桥接、FMI/FMU 变量映射的前端配置界面 | §7 |

---

## Phase 6 开发计划

> Phase 5 (P0+P1) 已全部完成。Phase 6 从 P2 中挑选高价值功能，分三个迭代推进。

### Phase 6.1 — 外部数据驱动 + UI 补全 (大部分完成)

目标：让引擎支持外部时序数据输入，前端补齐核心交互缺失。

#### 引擎 — ✅ 全部完成 (代码已实现，测试通过)
| # | 功能 | 状态 | 新增文件 |
|---|------|------|----------|
| E-13 | CVF/DVF 外部数据文件驱动 | ✅ 已完成 | `CvfReader.h/cpp` (线性插值), `DvfReader.h/cpp` (阶跃保持), `Schedule.h` 新增 InterpolationMode 枚举 |
| E-16 | WPC 空间非均匀外部边界 | ✅ 已完成 | `WpcReader.h/cpp` (逐开口逐时间步风压/浓度导入), TransientSimulation 集成 WPC 更新 |
| E-18 | 箱线图日统计 (.CBW) | ✅ 已完成 | `CbwReport.h/cpp` (日均/峰值/分位数统计, text/csv 输出) |

#### 前端 — 部分完成
| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| F-07 | 库管理器 LibraryManager | 部分实现 | PropertyPanel 已导入并渲染 LibraryManager 组件于"库管理"标签页，深度功能待完善 |
| F-09 | 浮动状态框接入 | 部分实现 | FloatingStatusBox 已在 Canvas2D 中渲染，结果模式数据接入待完善 |
| F-11 | 伪几何比例因子 | ✅ 已完成 | useCanvasStore.scaleFactor + dataBridge sf/sf2/sf3 自动换算 + ScaleFactorControl 组件 + renderer 物理尺寸标注 |

#### 测试状态
- ✅ Phase 6 引擎测试: 16/16 通过 (ScheduleInterp, CvfReader, DvfReader, WpcReader, CbwReport)
- ✅ test_validation.cpp: API 已适配到当前 TransientResult 结构 (`result.history[i].airflow.*` / `.contaminant.*`)
- ✅ 编译: contam_engine_lib.lib + contam_engine.exe + contam_tests.exe 全部成功
- ⚠️ AdaptiveIntegratorTest.ExponentialDecay: 运行时间过长，可能需要优化 (非阻塞性问题)

### Phase 6.2 — 联合仿真基础设施

目标：打通与外部仿真工具 (EnergyPlus/TRNSYS) 的数据通道。

#### 引擎
| # | 功能 | 工作量 | 说明 |
|---|------|--------|------|
| E-14 | TCP/IP 套接字桥接模式 | 大 | ContamX Bridge Mode — 外部程序通过 TCP 连接实时注入变量、推进时间步。需新增 `BridgeServer.h/cpp`，基于 asio 或原生 socket |
| E-15 | FMI/FMU 联合仿真接口 | 大 | 实现 FMI 2.0 Co-Simulation Slave 接口，导出为 .fmu 包。温度-气流-浓度双向交换 |
| E-17 | 超级控制元件 SuperElement | 中 | 可复用的封装控制回路，库文件存储 + 实例化部署。新增 `SuperElement.h/cpp` |

#### 前端
| # | 功能 | 工作量 | 说明 |
|---|------|--------|------|
| F-08 | 底图追踪 TracingImage | 部分实现 | TracingImageControls 组件已在 Canvas2D 中渲染，缩放/旋转/透明度调节待完善 |
| F-12 | 联合仿真配置 UI | 中 | TCP/IP 桥接变量映射 + FMI/FMU 输入输出端口配置界面 |

### Phase 6.3 — 高级报告 + 专项分析 — 报告类全部完成，CFD 待实现

目标：补齐 CONTAM 原版的专项报告输出能力。

#### 引擎 — 报告类全部完成
| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| E-12 | CFD 区域耦合求解 | 待实现 | 零阶湍流 CFD 求解器 + 宏观网络双向边界条件交换 |
| E-19 | 污染外渗追踪 (.CEX) | ✅ 已完成 | CexReport.h/cpp — 逐开口溯源泄漏量, 7 个测试 |
| E-20 | 乘员暴露记录 (.EBW) | ✅ 已完成 | EbwReport.h/cpp — 个人呼吸道吸入量评估, 8 个测试 |
| E-21 | 建筑加压测试 (.VAL) | ✅ 已完成 | ValReport.h/cpp — 鼓风门模拟 50Pa 泄漏量, 6 个测试 |
| E-22 | 控制节点日志 (.LOG) | ✅ 已完成 | LogReport.h/cpp — 控制变量流水记录, 10 个测试 |
| E-23 | 1D 专用二进制输出 | ✅ 已完成 | OneDOutput.h/cpp — RXR/RZF/RZM/RZ1 格式, 14 个测试 |

---

## Phase 14R — Bug Fix 批量修复 (68 项)

> 基于 `bug-tracker.md` 审计结果，分 9 个 Phase 批量修复。全部已完成。

### Phase 1: dataBridge 核心修复 — ✅ 已完成
| Bug | 修复内容 |
|-----|---------|
| C-01 | `buildElementFromPlacement()` 替代硬编码工厂，用户编辑参数正确传递引擎 |
| C-02 | door 类型映射为 TwoWayFlow (Cd/area/height)，UI 显示对应参数 |
| C-04 | opening 类型映射为 TwoWayFlow，新增 openingHeight 字段 |
| M-01 | zone.volume > 0 时使用用户值，不再强制覆盖 |
| M-17 | 节点/链接标高统一乘以 scaleFactor |
| L-14 | 孤立墙构件验证警告 |
| L-33 | 移除死代码 `downloadAsFile` |

### Phase 2: 引擎集成安全 — ✅ 已完成
| Bug | 修复内容 |
|-----|---------|
| C-05 | 浏览器模式 mock 数据警告 toast |
| C-06 | Rust 临时文件使用 UUID 避免并发冲突 |
| M-19 | 跨平台引擎可执行文件名 (Windows .exe / Linux/macOS 无后缀) |
| L-27 | 仿真 60 秒超时保护 |

### Phase 3: 多楼层垂直连通 — ✅ 已完成
| Bug | 修复内容 |
|-----|---------|
| C-03 | shaftGroupId 竖井分组 → 跨楼层 TwoWayFlow 自动连接 |
| H-06 | Story CRUD (removeStory/renameStory/duplicateStory) + FloorSwitcher 按钮 |
| M-05 | Story.elevation 绝对标高覆盖 |
| M-07 | FloorSwitcher 始终显示 (移除 stories.length <= 1 隐藏) |

### Phase 4: 画布交互 UX — 墙体与矩形 — ✅ 已完成
| Bug | 修复内容 |
|-----|---------|
| 链式墙 | confirmWall 后自动以终点为起点继续绘制 |
| 原子矩形 | addRect 单次 set() 调用，undo 一步撤销 4 面墙 |
| 键盘守卫 | 工具快捷键在 input/textarea/select 中不触发 |

### Phase 5: 画布交互 UX — 门窗与擦除 — ✅ 已完成
| Bug | 修复内容 |
|-----|---------|
| 悬停预览 | door/window/erase 模式下启用边/面悬停高亮 |

### Phase 6: 面板数据一致性 — ✅ 已完成
| Bug | 修复内容 |
|-----|---------|
| L-30 | setAmbient 仅接受 ambient 相关字段 |
| H-07 | initialConcentrations 传递到引擎 JSON |
| 类型切换 | placement type 切换时重置所有类型特定字段 |

### Phase 7: 验证与 Schema 同步 — ✅ 已完成
| Bug | 修复内容 |
|-----|---------|
| 增强验证 | 层高 > 0、面积 > 0、zone ID 唯一、温度范围、物种/源一致性 |
| 竖井提示 | 多楼层无竖井连通警告 |

### Phase 8: UI 细节与暗色模式 — ✅ 已完成
| Bug | 修复内容 |
|-----|---------|
| 暗色持久化 | localStorage 存储 dark mode 偏好，刷新后保持 |

### Phase 9: 代码清理 — ✅ 已完成
| Bug | 修复内容 |
|-----|---------|
| L-29 | 提取 `autoAssignZones()` 消除 confirmWall/addWall/addRect 三处重复 |
| L-30 | setAmbient 收窄 (Phase 6 已完成) |
| L-32 | 移除重复 ZONE_COLORS 定义 |

### 新增接口字段
| 接口 | 新增字段 |
|------|---------|
| EdgePlacement | openingHeight, ductDiameter, ductRoughness, ductSumK, targetFlow, pMin, pMax |
| ZoneAssignment | shaftGroupId, initialConcentrations |
| Story | elevation |
| CanvasState | addRect, removeStory, renameStory, duplicateStory |

---

## 项目统计概览 (2026-02-16)

| 维度 | 数量 |
|------|------|
| C++ 引擎 .h/.cpp 文件 | 112 |
| 气流元件种类 | 16 (PowerLaw, Fan, TwoWayFlow, Duct, Damper, Filter, CheckValve, SelfRegVent, Quadratic, BackdraftDamper, SupplyDiffuser, ReturnGrille, SimpleParticleFilter, SimpleGaseousFilter, UVGI, SuperFilter) |
| 逻辑节点类型 | 15 (AND/OR/XOR/NOT, Sum/Avg/Min/Max, Exp/Ln/Abs, Multiply/Divide, Integrator, MovingAverage) |
| 核心模块 (src/core/) | 19 |
| I/O 模块 (src/io/) | 16 (3 读取器 + 3 写入器 + 10 报告类) |
| 源类型 | 5 (Constant, ExponentialDecay, PressureDriven, CutoffConcentration, Burst) |
| GoogleTest 用例 | 266 (16 个测试文件) |
| 前端 .tsx/.ts 文件 | 78 |
| Vitest 用例 | 266 (8 个测试文件) |
| UI 组件目录 | 19 (含 14 个 shadcn/ui 基础组件) |
| Canvas 子组件 | 8 |
| React Flow 节点类型 | 5 (Sensor, PIController, Actuator, Math, Logic) |
| Zustand store action | 87 (useCanvasStore 45 + useAppStore 42) |
| TypeScript 类型定义 | 36 (31 interface + 5 type) |
| 验证案例 | 4 |
| Python 绑定导出类 | 30+ |
| npm dependencies | 27 + 19 devDependencies |

### 引擎测试分布

| 测试文件 | 用例数 | 覆盖模块 |
|---------|--------|---------|
| test_elements.cpp | 71 | 16 种气流元件 |
| test_advanced.cpp | 37 | ChemKinetics/SuperFilter/AxleyBLD/Aerosol/1D/Duct |
| test_dataBridge.test.ts | 38 | 画布→引擎 JSON 转换 |
| test_p1_features.cpp | 23 | CVF/DVF/WPC/过滤器 |
| test_validation.cpp | 21 | 4 个验证案例 |
| test_phase6.cpp | 16 | 外部数据驱动/报告 |
| test_oned_output.cpp | 16 | 1D 二进制输出 |
| test_contaminant.cpp | 14 | 污染物传输 |
| test_control.cpp | 12 | 控制系统 |
| test_log_report.cpp | 12 | 控制日志 |
| test_ebw_report.cpp | 8 | 暴露记录 |
| test_cex_report.cpp | 7 | 外渗追踪 |
| test_powerlaw.cpp | 7 | 幂律孔口 |
| test_network.cpp | 6 | 网络拓扑 |
| test_solver.cpp | 6 | N-R 求解器 |
| test_val_report.cpp | 6 | 加压测试 |
| test_json.cpp | 4 | JSON I/O |
