# 开发文档状态审查报告

> 审查日期: 2026-02-16
> 审查对象: CLAUDE.md 中所有声称"已完成"和"待完成"的功能状态

---

## 审查结论

CLAUDE.md 中声称"已完成"的功能全部经代码验证确认存在且有实质性实现，无空壳或虚假标注。但文档存在大量**滞后问题**——许多已经实现的功能仍标注为"待实现"或"未完成"，数字统计也严重过时。

---

## 一、需要修正的过时数字

| 位置 | CLAUDE.md 当前值 | 实际值 | 说明 |
|------|------------------|--------|------|
| 项目结构 `src/elements/` | 16 种 ✅ 已修正 | 16 种 | 缺 QuadraticElement, BackdraftDamper, SupplyDiffuser, ReturnGrille |
| 项目结构 `test/` | 266 (16 个文件) ✅ 已修正 | 266 (16 个测试文件) | 精确统计: test_elements 71, test_advanced 37, test_p1_features 23, test_validation 21 等 |
| 已完成 - 引擎 | 16 种 ✅ 已修正 | 16 种 | 同上 |
| 已完成 - 引擎 | 5 种 ✅ 已修正 | 5 种 | BurstSource 已在 Phase 5 实现 |
| 已完成 - 引擎 | 15 种 ✅ 已修正 | 15 种 | 多了 MovingAverage |
| 常用命令 | 运行 266 个测试 ✅ 已修正 | 运行 266 个测试 | |
| Phase 4+4.5 | 266 个 ✅ 已修正 | 266 个 | 精确统计: useCanvasStore 71, geometry 53, dataBridge 38, interaction 35, camera2d 31, useAppStore 26, dagValidation 7, fileOps 5 |

---

## 二、标注为"待完成"但实际已实现的功能

### 集成缺口 (第 113-118 行)

| # | CLAUDE.md 状态 | 实际状态 | 证据 |
|---|---------------|----------|------|
| 2 | 背景图渲染未接入 | ✅ 已接入 | `Canvas2D.tsx` L87-102: useEffect 加载背景图; L154-163: 渲染步骤 0 调用 `drawBackgroundImage()` |
| 3 | 风压矢量未接入 | ✅ 已接入 | `Canvas2D.tsx` L342-360: results mode 中计算 Cp(θ) 并调用 `drawWindPressureVectors()` |
| 4 | 文件对话框使用浏览器 API | ✅ 已改用 Tauri | `fileOps.ts`: `saveFile`/`openFile` 检测 Tauri 环境，使用 `@tauri-apps/plugin-dialog` + `@tauri-apps/plugin-fs` |

### Phase 5 前端 P1 (第 153-157 行)

| # | CLAUDE.md 状态 | 实际状态 | 证据 |
|---|---------------|----------|------|
| F-03 | ⏳ Canvas2D 渲染循环接入未完成 | ✅ 已完成 | `Canvas2D.tsx` L154-163 渲染步骤 0 |
| F-04 | ⏳ Canvas2D 渲染循环接入未完成 | ✅ 已完成 | `Canvas2D.tsx` L342-360 |
| F-06 | ⏳ 未与 Canvas2D 结果叠加层联动 | ✅ 已完成 | `Canvas2D.tsx` L211-215 使用 `currentTransientStep` 索引 |

### Phase 6.1 前端 (第 261-266 行)

| # | CLAUDE.md 状态 | 实际状态 | 证据 |
|---|---------------|----------|------|
| F-07 | ⏳ 待实现 | 部分实现 | `PropertyPanel.tsx` L15 导入 `LibraryManager`，L461-463 渲染在"库管理"标签页。组件存在，深度待评估 |
| F-09 | ⏳ 待实现 | 部分实现 | `FloatingStatusBox` 组件已在 `Canvas2D.tsx` L738 渲染 |
| F-11 | ⏳ 待实现 | ✅ 已完成 | `useCanvasStore.ts` L58: `scaleFactor` 字段; L506-518: `setScaleFactor`/`setCalibrationPoints`/`applyCalibration`; `dataBridge.ts` L40-42: sf/sf2/sf3 自动换算; `renderer.ts` L809-900: 物理尺寸标注; `Canvas2D.tsx` L739: `<ScaleFactorControl />` |

### P2 引擎 — 标注为待实现但已完成

| # | CLAUDE.md 状态 | 实际状态 | 证据 |
|---|---------------|----------|------|
| E-19 | 污染外渗追踪 — 待实现 | ✅ 已实现 | `CexReport.h/cpp` 存在，`test_cex_report.cpp` 含 7 个测试 |
| E-20 | 乘员暴露记录 — 待实现 | ✅ 已实现 | `EbwReport.h/cpp` 存在，`test_ebw_report.cpp` 含 8 个测试 |
| E-21 | 建筑加压测试 — 待实现 | ✅ 已实现 | `ValReport.h/cpp` 存在，`test_val_report.cpp` 含 6 个测试 |

### P3 引擎 — 标注为远期但已完成

| # | CLAUDE.md 状态 | 实际状态 | 证据 |
|---|---------------|----------|------|
| E-22 | 控制节点日志 — 待实现 | ✅ 已实现 | `LogReport.h/cpp` 存在，`test_log_report.cpp` 含 10 个测试 |
| E-23 | 1D 专用二进制输出 — 待实现 | ✅ 已实现 | `OneDOutput.h/cpp` 存在 (RXR/RZF/RZM/RZ1 格式)，`test_oned_output.cpp` 含 14 个测试 |

### Phase 6.2 前端 — 标注为待实现但已有组件

| # | CLAUDE.md 状态 | 实际状态 | 证据 |
|---|---------------|----------|------|
| F-08 | 底图追踪 — 待实现 | 部分实现 | `Canvas2D.tsx` L738 渲染 `<TracingImageControls />`，组件已存在 |

---

## 三、确认仍为待实现的功能

### 引擎

| # | 功能 | 状态 |
|---|------|------|
| E-12 | CFD 区域耦合求解 | 未实现 — 无对应源文件 |
| E-14 | TCP/IP 套接字桥接模式 | 未实现 — 无 BridgeServer 文件 |
| E-15 | FMI/FMU 联合仿真接口 | 未实现 — 无 FMU 相关文件 |
| E-17 | 超级控制元件 SuperElement | 未实现 — SuperFilter 存在但 SuperElement (封装控制回路) 不存在 |

### 前端

| # | 功能 | 状态 |
|---|------|------|
| F-12 | 联合仿真配置 UI | 未实现 — 无对应组件 |
| StateNode | 层级状态机 | 未启用 — 文件存在但 Canvas2D 仍用 switch(toolMode) |

---

## 四、Python 绑定状态

`engine/python/pycontam.cpp` 存在且有实质内容，暴露 30+ 类/函数，覆盖 Node、Network、Solver、所有流量元件、Species、Schedule、TransientSimulation、完整控制系统、Occupant、SimpleAHS、4 种报告类型 (Val, EBW, CEX, Log)。`test_pycontam.py` 存在但使用裸 `assert` 而非 pytest 框架。

---

## 五、验证案例状态

| Case | 场景 | 测试数 | 状态 |
|------|------|--------|------|
| 01 | 3 房间浮力驱动 | 4+ | ✅ 通过 |
| 02 | CO₂ 瞬态源 | 4+ | ✅ 通过 |
| 03 | 风机+管道+门网络 | 4+ | ✅ 通过 |
| 04 | 多区域多物种 | 4+ | ✅ 通过 |

验证测试包含收敛性检查、气流精度 (1e-4 相对容差)、浓度精度 (1% 容差)、质量守恒验证。

---

## 六、建议的 CLAUDE.md 更新清单

1. 项目结构中 `src/elements/` 改为 "16 种气流元件"
2. 项目结构中 `test/` 改为 "247+ GoogleTest 用例 (16 个测试文件)"
3. 已完成引擎列表更新: 16 种气流元件、5 种源类型、15 种逻辑节点
4. 常用命令中 "运行 200+ 个测试" 改为 "运行 247+ 个测试"
5. Phase 4+4.5 中 "25 个 Vitest 测试" 改为 "170+ 个 Vitest 测试 (8 个测试文件)"
6. 删除集成缺口 #2 (背景图)、#3 (风压矢量)、#4 (文件对话框) — 均已完成
7. Phase 5 P1 中 F-03/F-04/F-06 改为 ✅ 已完成
8. Phase 6.1 前端中 F-11 改为 ✅ 已完成，F-07/F-09 改为"部分实现"
9. P2 引擎中 E-19/E-20/E-21 标注为 ✅ 已完成
10. P3 中 E-22/E-23 标注为 ✅ 已完成
11. Phase 6.2 前端中 F-08 标注为"部分实现"
12. 新增 I/O 文件列表: ValReport, EbwReport, CexReport, LogReport, OneDOutput
13. 新增引擎元件列表: QuadraticElement, BackdraftDamper, SupplyDiffuser, ReturnGrille
14. 新增项目统计概览章节，包含精确的文件数、测试数、组件数等统计
