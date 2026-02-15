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
│   ├── src/core/           # Node, Link, Network, Solver, ContaminantSolver, TransientSimulation
│   ├── src/elements/       # 13 种气流元件 (PowerLaw, Fan, Duct, Damper, Filter, TwoWayFlow, CheckValve, SelfRegVent, ...)
│   ├── src/control/        # Sensor, Controller (PI), Actuator, LogicNodes
│   ├── src/io/             # JsonReader, JsonWriter, Hdf5Writer, WeatherReader, ContaminantReader, CvfReader, WpcReader, CbwReport, SqliteWriter, AchReport, CsmReport
│   ├── test/               # 182+ GoogleTest 用例 (10 个测试文件)
│   └── python/             # pycontam pybind11 绑定
├── app/                    # React 前端
│   ├── src/canvas/         # Canvas2D 渲染器 (Excalidraw 风格无限画布)
│   │   ├── Canvas2D.tsx    # 主画布组件 (DPI-aware, rAF dirty-flag 渲染)
│   │   ├── camera2d.ts     # 世界↔屏幕坐标变换, 缩放/平移
│   │   ├── renderer.ts     # 纯渲染函数 (网格, 区域, 墙体, 顶点, 构件, 预览)
│   │   ├── interaction.ts  # 正交约束, 顶点吸附, 命中测试
│   │   └── components/     # FloatingStatusBox, FloorSwitcher, ZoomControls, TimeStepper, ContextMenu
│   ├── src/components/     # UI 组件
│   │   ├── TopBar/         # 工具栏 (运行, 保存, 加载, 导出, 暗色模式)
│   │   ├── VerticalToolbar/# 左侧工具栏 (选择, 墙体, 矩形, 门, 窗, 擦除)
│   │   ├── PropertyPanel/  # 右侧属性面板 (区域/边/构件/楼层属性)
│   │   ├── ContaminantPanel/ # 污染物/物种配置
│   │   ├── ControlPanel/   # 控制系统配置
│   │   ├── ScheduleEditor/ # 时间表编辑器 (ECharts 可视化)
│   │   ├── OccupantPanel/  # 人员暴露配置
│   │   ├── ResultsView/    # 稳态结果展示
│   │   ├── TransientChart/ # 瞬态浓度图表
│   │   ├── ExposureReport/ # 暴露报告
│   │   └── ui/             # shadcn/ui 基础组件
│   ├── src/control/        # React Flow 控制流画布
│   ├── src/store/          # Zustand stores (useCanvasStore, useAppStore)
│   ├── src/model/          # geometry.ts (Vertex→Edge→Face), dataBridge.ts (画布→引擎 JSON)
│   ├── src/tools/          # StateNode (预留的层级状态机)
│   ├── src/types/          # TypeScript 类型定义
│   └── src-tauri/          # Tauri Rust 后端 (run_engine IPC)
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
./build/Release/contam_tests.exe    # 运行 200+ 个测试
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
- `useCanvasStore`: 画布几何、工具模式、选择/悬停状态、楼层管理、背景图
- `useAppStore`: 全局应用状态 (节点、链接、物种、源、时间表、人员、控制系统、仿真结果)
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
- C++ 引擎: 13 种气流元件, N-R 求解器 (TrustRegion+SUR), PCG 迭代, 隐式欧拉, 4 种源类型, PI 控制器+死区, 14 种逻辑节点, 化学动力学, 气溶胶沉积/重悬浮, Axley BLD 吸附, SimpleParticleFilter (三次样条), SuperFilter (级联+负载衰减), 风压 Cp(θ) 配置, WeekSchedule/DayType, SimpleAHS, 乘员暴露追踪, 气象文件读取, JSON/HDF5 I/O, OneDZone (1D FVM), AdaptiveIntegrator (BDF), DuctNetwork, SqliteWriter, AchReport, CsmReport, CvfReader/DvfReader (外部时序), WpcReader (非均匀风压), CbwReport (箱线图统计)
- 前端画布: 墙体/矩形绘制, 门窗放置, 多楼层, 缩放/平移, undo/redo
- 属性面板: 区域/边/构件/楼层属性编辑
- 控制流: React Flow 可视化 (Sensor, PI Controller, Actuator, Math, Logic 节点)
- 结果展示: 稳态表格, 瞬态图表, 暴露报告, CSV 导出
- Tauri 集成: run_engine IPC, externalBin 打包

### 待完成 — 集成缺口
1. ~~**结果叠加层未接入**~~ — ✅ drawFlowArrows/drawConcentrationHeatmap/drawPressureLabels 已在 Canvas2D results mode 中接入
2. **背景图渲染未接入** — drawBackgroundImage 已实现，Canvas2D 接入代码待补 (bgImageRef + useEffect 加载 + render step 0)
3. **风压矢量未接入** — drawWindPressureVectors 已实现，Canvas2D 接入代码待补 (Cp 计算 + 调用)
4. **文件对话框** — 保存/加载使用浏览器 API，应改用 Tauri 原生对话框
5. **StateNode 未启用** — 层级状态机已编写但工具仍使用 switch(toolMode)

### 已完成 — Phase 4 + 4.5
- ✅ 前端 25 个 Vitest 测试 (store CRUD, DAG 验证, 文件操作)
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

#### 前端 P1 — 部分完成
- ✅ F-05 Schedule CRUD: useAppStore 新增 updateSchedule/removeSchedule action
- ⏳ F-03 背景图渲染接入: drawBackgroundImage 导入已准备，Canvas2D 渲染循环接入未完成
- ⏳ F-04 风压矢量接入: drawWindPressureVectors 导入已准备，Canvas2D 渲染循环接入未完成
- ⏳ F-06 TimeStepper 瞬态回放: 组件已存在且有完整播放逻辑，但未与 Canvas2D 结果叠加层联动

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

### P2 — 进阶功能 (中优先级)

#### 引擎
| # | 功能 | 说明 | 对应文档章节 |
|---|------|------|-------------|
| E-12 | CFD 区域耦合求解 | 零阶湍流 CFD 求解器 + 宏观网络双向边界条件交换 | §2.2 |
| E-13 | CVF/DVF 外部数据文件驱动 | ✅ 已完成 | CvfReader + DvfReader，线性插值/阶跃保持 | §5.2 |
| E-14 | TCP/IP 套接字桥接模式 | ContamX Bridge Mode，外部程序实时遥控 (变量注入、时间步推进) | §7.1 |
| E-15 | FMI/FMU 联合仿真接口 | EnergyPlus/TRNSYS 耦合，温度-气流-浓度双向交换 | §7.2 |
| E-16 | WPC 空间非均匀外部边界 | ✅ 已完成 | WpcReader，逐开口逐时间步风压/浓度导入 | §5.1 |
| E-17 | 超级控制元件 SuperElement | 可复用的封装控制回路，库文件存储，实例化部署 | §5.3 |
| E-18 | 箱线图日统计 (.CBW) | ✅ 已完成 | CbwReport，日均/峰值/分位数 + text/csv | §9 |
| E-19 | 污染外渗追踪 (.CEX) | 逐开口溯源毒气泄漏量 (基础/详细模式) | §9 |
| E-20 | 乘员暴露记录 (.EBW) | 个人全天候呼吸道吸入量评估 | §9 |
| E-21 | 建筑加压测试 (.VAL) | 鼓风门模拟，50Pa 正压泄漏量 (ACH/m³·h) | §9 |

#### 前端
| # | 功能 | 说明 | 对应文档章节 |
|---|------|------|-------------|
| F-07 | 库管理器 LibraryManager | 气流元件、风机曲线、过滤器效率、日程表的跨项目复用 (.LB0~.LB5) | §6.2 |
| F-08 | 底图追踪 TracingImage | 导入建筑平面位图作为草图板底层追踪图像 | §2.1 |
| F-09 | 浮动状态框接入 | FloatingStatusBox 已有组件，需接入 Canvas2D 渲染 + 结果模式数据 | §6.2 |
| ~~F-10~~ | ~~过滤器配置面板~~ | ✅ 已在 P1 阶段提前完成 | §4.3 |
| F-11 | 伪几何比例因子 | 草图板网格→物理尺寸的比例换算，自动计算墙面积/区域面积/管道长度 | §2.1 |

### P3 — 远期功能 (低优先级)

| # | 功能 | 说明 | 对应文档章节 |
|---|------|------|-------------|
| E-22 | 控制节点日志 (.LOG) | Report Node 实时记录控制变量流水 | §9 |
| E-23 | 1D 专用二进制输出 (.RXR/.RZF/.RZM/.RZ1) | 1D 网格微单元浓度分布序列 | §9 |
| F-12 | 联合仿真配置 UI | TCP/IP 桥接、FMI/FMU 变量映射的前端配置界面 | §7 |

---

## Phase 6 开发计划

> Phase 5 (P0+P1) 已全部完成。Phase 6 从 P2 中挑选高价值功能，分三个迭代推进。

### Phase 6.1 — 外部数据驱动 + UI 补全 (进行中)

目标：让引擎支持外部时序数据输入，前端补齐核心交互缺失。

#### 引擎 — ✅ 全部完成 (代码已实现，测试通过)
| # | 功能 | 状态 | 新增文件 |
|---|------|------|----------|
| E-13 | CVF/DVF 外部数据文件驱动 | ✅ 已完成 | `CvfReader.h/cpp` (线性插值), `DvfReader.h/cpp` (阶跃保持), `Schedule.h` 新增 InterpolationMode 枚举 |
| E-16 | WPC 空间非均匀外部边界 | ✅ 已完成 | `WpcReader.h/cpp` (逐开口逐时间步风压/浓度导入), TransientSimulation 集成 WPC 更新 |
| E-18 | 箱线图日统计 (.CBW) | ✅ 已完成 | `CbwReport.h/cpp` (日均/峰值/分位数统计, text/csv 输出) |

#### 前端 — ⏳ 未开始 (需要实现)
| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| F-07 | 库管理器 LibraryManager | ⏳ 待实现 | 气流元件、风机曲线、过滤器效率、日程表的跨项目复用。需新增 LibraryManager 组件 + 本地文件存储 (.LB0~.LB5) |
| F-09 | 浮动状态框接入 | ⏳ 待实现 | FloatingStatusBox 已有组件，需接入结果模式数据 (压力/流量/浓度悬停显示) |
| F-11 | 伪几何比例因子 | ⏳ 待实现 | useCanvasStore 加 scaleFactor，dataBridge 自动换算面积/体积/管道长度 |

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
| F-08 | 底图追踪 TracingImage | 中 | 导入建筑平面位图，支持缩放/旋转/透明度调节，作为草图板底层 |
| F-12 | 联合仿真配置 UI | 中 | TCP/IP 桥接变量映射 + FMI/FMU 输入输出端口配置界面 |

### Phase 6.3 — 高级报告 + 专项分析

目标：补齐 CONTAM 原版的专项报告输出能力。

#### 引擎
| # | 功能 | 工作量 | 说明 |
|---|------|--------|------|
| E-12 | CFD 区域耦合求解 | 大 | 零阶湍流 CFD 求解器 + 宏观网络双向边界条件交换 |
| E-19 | 污染外渗追踪 (.CEX) | 中 | 逐开口溯源毒气泄漏量 (基础/详细模式) |
| E-20 | 乘员暴露记录 (.EBW) | 中 | 个人全天候呼吸道吸入量评估 |
| E-21 | 建筑加压测试 (.VAL) | 中 | 鼓风门模拟，50Pa 正压泄漏量 (ACH/m³·h) |
| E-22 | 控制节点日志 (.LOG) | 小 | Report Node 实时记录控制变量流水 |
| E-23 | 1D 专用二进制输出 | 小 | 1D 网格微单元浓度分布序列 |
