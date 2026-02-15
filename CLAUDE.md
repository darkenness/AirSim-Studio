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
│   ├── src/io/             # JsonReader, JsonWriter, Hdf5Writer, WeatherReader, ContaminantReader
│   ├── test/               # 166 GoogleTest 用例 (9 个测试文件)
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
./build/Release/contam_tests.exe    # 运行 166 个测试
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
- C++ 引擎: 13 种气流元件, N-R 求解器 (TrustRegion+SUR), PCG 迭代, 隐式欧拉, 4 种源类型, PI 控制器+死区, 14 种逻辑节点, 化学动力学, 气溶胶沉积/重悬浮, Axley BLD 吸附, SimpleParticleFilter (三次样条), SuperFilter (级联+负载衰减), 风压 Cp(θ) 配置, WeekSchedule/DayType, SimpleAHS, 乘员暴露追踪, 气象文件读取, JSON/HDF5 I/O
- 前端画布: 墙体/矩形绘制, 门窗放置, 多楼层, 缩放/平移, undo/redo
- 属性面板: 区域/边/构件/楼层属性编辑
- 控制流: React Flow 可视化 (Sensor, PI Controller, Actuator, Math, Logic 节点)
- 结果展示: 稳态表格, 瞬态图表, 暴露报告, CSV 导出
- Tauri 集成: run_engine IPC, externalBin 打包

### 待完成 — 集成缺口 (原有)
1. **结果叠加层未接入** — renderer.ts 中 drawFlowArrows/drawConcentrationHeatmap/drawPressureLabels/drawWindPressureVectors 已实现但 Canvas2D 渲染循环未调用
2. **背景图渲染未接入** — drawBackgroundImage 已实现但未调用
3. **文件对话框** — 保存/加载使用浏览器 API，应改用 Tauri 原生对话框
4. **StateNode 未启用** — 层级状态机已编写但工具仍使用 switch(toolMode)

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

---

## 功能缺口开发计划 (对照 CONTAM 3.4 完整功能)

> 基于 `深入探究内容.md` 逐项比对后识别的缺失功能

### P0 — 核心功能缺失 (必须实现)

#### 引擎
| # | 功能 | 说明 | 对应文档章节 |
|---|------|------|-------------|
| E-01 | BurstSource 爆发式释放源 | 脉冲式瞬时大量释放，配合控制日程触发。用于生化应急、试剂泄漏场景 | §4.2 |
| E-02 | SimpleGaseousFilter 气体过滤器 | 活性炭吸附介质，"负载量-效率"曲线 + 穿透阈值 (Breakthrough) 报警 | §4.3 |
| E-03 | UVGI 紫外杀菌过滤器 | Penn State 模型 S=e^{-kIt}，温度/流速多项式修正 + 灯管老化因子 | §4.3 |
| E-04 | 非微量污染物密度耦合 | Species.isTrace 字段已有，需在 Solver 内实现浓度→密度→压力场双向 N-R 迭代 | §4.1 |

#### 前端
| # | 功能 | 说明 | 对应文档章节 |
|---|------|------|-------------|
| F-01 | WeekSchedule/DayType 编辑器 | 引擎已有 WeekSchedule，前端缺少周日程/日类型配置 UI | §5.2 |
| F-02 | 源/汇模型完整配置面板 | 前端缺少 BurstSource、PressureDriven、Decay、CutoffConc、AxleyBLD、Deposition 等源类型的配置 UI | §4.2 |

### P1 — 重要功能缺失 (高优先级)

#### 引擎
| # | 功能 | 说明 | 对应文档章节 |
|---|------|------|-------------|
| E-05 | 1D 对流-扩散区域求解器 | Patankar 有限体积法 + 显式 STS 求解器 (CFL 限制)，用于走廊/竖井浓度梯度捕捉 | §2.2, §8.2 |
| E-06 | CVODE 自适应变步长求解器 | BDF 高阶积分器，处理刚性模型 (急速化学反应 + 高频瞬态源) | §8.2 |
| E-07 | 管道网络拓扑 (Junction/Terminal) | 管道交汇点、送回风末端节点 — 目前只有单段 Duct 元件，缺少完整管网图 | §3.3 |
| E-08 | 自动管道平衡 DuctBalance | 多轮 N-R 迭代微调末端平衡系数 C_b，生成 .BAL 报告 | §3.3 |
| E-09 | SQLite3 输出 (.SQLITE3) | 关系数据库格式，支持 SQL 查询大规模仿真结果 | §9 |
| E-10 | ACH 换气次数报告 (.ACH) | 建筑宏观换气次数，机械通风 vs 渗透分项，能效认证数据源 | §9 |
| E-11 | 污染物汇总报告 (.CSM) | 排污总量、滤网拦截量、穿透时刻点 | §9 |

#### 前端
| # | 功能 | 说明 | 对应文档章节 |
|---|------|------|-------------|
| F-03 | 风压审查模式 WindPressure Mode | 草图板上可视化显示各外墙开口的风压矢量方向与大小 | §6.1 |
| F-04 | 结果回放模式 Results Mode | 时空回放播放器，流量箭头+压差线段动画，时间步前进/后退导航 | §6.1 |
| F-05 | 管道网络编辑器 | 管道段、交汇点、末端的可视化绘制与参数配置 | §3.3 |
| F-06 | AHS 配置面板 | SimpleAHS 的供/回风区域连接、新风比日程、供风温度配置 UI | §3.2 |

### P2 — 进阶功能 (中优先级)

#### 引擎
| # | 功能 | 说明 | 对应文档章节 |
|---|------|------|-------------|
| E-12 | CFD 区域耦合求解 | 零阶湍流 CFD 求解器 + 宏观网络双向边界条件交换 | §2.2 |
| E-13 | CVF/DVF 外部数据文件驱动 | 连续值文件 (线性插值) 和离散值文件 (阶跃保持)，支持 8760h 全息时序 | §5.2 |
| E-14 | TCP/IP 套接字桥接模式 | ContamX Bridge Mode，外部程序实时遥控 (变量注入、时间步推进) | §7.1 |
| E-15 | FMI/FMU 联合仿真接口 | EnergyPlus/TRNSYS 耦合，温度-气流-浓度双向交换 | §7.2 |
| E-16 | WPC 空间非均匀外部边界 | 逐开口逐时间步的外部 CFD 风压/浓度文件导入 | §5.1 |
| E-17 | 超级控制元件 SuperElement | 可复用的封装控制回路，库文件存储，实例化部署 | §5.3 |
| E-18 | 箱线图日统计 (.CBW) | 日均值、标准差、极值时刻 | §9 |
| E-19 | 污染外渗追踪 (.CEX) | 逐开口溯源毒气泄漏量 (基础/详细模式) | §9 |
| E-20 | 乘员暴露记录 (.EBW) | 个人全天候呼吸道吸入量评估 | §9 |
| E-21 | 建筑加压测试 (.VAL) | 鼓风门模拟，50Pa 正压泄漏量 (ACH/m³·h) | §9 |

#### 前端
| # | 功能 | 说明 | 对应文档章节 |
|---|------|------|-------------|
| F-07 | 库管理器 LibraryManager | 气流元件、风机曲线、过滤器效率、日程表的跨项目复用 (.LB0~.LB5) | §6.2 |
| F-08 | 底图追踪 TracingImage | 导入建筑平面位图作为草图板底层追踪图像 | §2.1 |
| F-09 | 浮动状态框接入 | FloatingStatusBox 已有组件，需接入 Canvas2D 渲染 + 结果模式数据 | §6.2 |
| F-10 | 过滤器配置面板 | SimpleGaseousFilter、UVGI、SuperFilter 的参数配置 UI | §4.3 |
| F-11 | 伪几何比例因子 | 草图板网格→物理尺寸的比例换算，自动计算墙面积/区域面积/管道长度 | §2.1 |

### P3 — 远期功能 (低优先级)

| # | 功能 | 说明 | 对应文档章节 |
|---|------|------|-------------|
| E-22 | 控制节点日志 (.LOG) | Report Node 实时记录控制变量流水 | §9 |
| E-23 | 1D 专用二进制输出 (.RXR/.RZF/.RZM/.RZ1) | 1D 网格微单元浓度分布序列 | §9 |
| F-12 | 联合仿真配置 UI | TCP/IP 桥接、FMI/FMU 变量映射的前端配置界面 | §7 |
