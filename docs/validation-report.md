# CONTAM-Next 验证报告

> 版本 2.0 | 2026-02-16

---

## 1. 验证方法

### 1.1 单元测试覆盖

| 测试文件 | 测试数 | 覆盖模块 |
|----------|--------|---------|
| test_elements.cpp | 71 | 16 种气流元件 (PowerLaw, Fan, TwoWayFlow, Duct, Damper, Filter, CheckValve, SelfRegVent, Quadratic, BackdraftDamper, SupplyDiffuser, ReturnGrille, SimpleParticleFilter, SimpleGaseousFilter, UVGI, SuperFilter) |
| test_advanced.cpp | 37 | ChemKinetics, SuperFilter, AxleyBLD, Aerosol, 1D FVM, DuctNetwork |
| test_p1_features.cpp | 23 | CVF/DVF 外部时序, WPC 风压, 高级过滤器 |
| test_validation.cpp | 21 | 4 个验证案例 (3房间/CO₂源/风机管道/多物种) |
| test_phase6.cpp | 16 | 外部数据驱动, 箱线图统计 |
| test_oned_output.cpp | 16 | 1D 二进制输出 (RXR/RZF/RZM/RZ1) |
| test_contaminant.cpp | 14 | 污染物传输 + 排程 + 瞬态仿真 |
| test_control.cpp | 12 | 控制系统 (PI控制器+逻辑节点) + Occupant暴露 |
| test_log_report.cpp | 12 | 控制节点日志 (.LOG) |
| test_ebw_report.cpp | 8 | 乘员暴露记录 (.EBW) |
| test_cex_report.cpp | 7 | 污染外渗追踪 (.CEX) |
| test_powerlaw.cpp | 7 | PowerLawOrifice 元件 |
| test_network.cpp | 6 | Node, Link, Network 数据结构 |
| test_solver.cpp | 6 | N-R 求解器 (SUR + Trust Region) |
| test_val_report.cpp | 6 | 建筑加压测试 (.VAL) |
| test_json.cpp | 4 | JSON I/O (读写) |
| **总计** | **266** | |

### 1.2 算法验证（对照需求文档）

| 算法项 | 需求文档公式 | 实现验证 | 状态 |
|--------|-------------|---------|------|
| 雅可比矩阵装配 | J_ii = -Σd, J_ik = d | assembleSystem() 硬编码 | ✅ |
| 收敛判据 | \|R\|∞ < 1e-5 kg/s | convergenceTol_ = 1e-5 | ✅ |
| 压差公式 | ΔP_k = (P_i-ρ_ig(Z_k-Z_i))-(P_j-ρ_jg(Z_k-Z_j)) | computeDeltaP() | ✅ |
| 密度计算 | ρ = P_abs/(R_air·T) | Node::updateDensity() | ✅ |
| 零压差线性化 | \|ΔP\| < 0.001 Pa → 线性 | DP_MIN = 0.001 | ✅ |
| 解析偏导数 | 禁止数值差分 | 全部硬编码 | ✅ |
| 亚松弛 | P_new = P_old + α·ΔP | applyUpdateSUR() | ✅ |
| 信赖域 | 自适应步长 | applyUpdateTR() | ✅ |
| 增量式PI | output_t = output_{t-1}+Kp(e_t-e_{t-1})+Ki(e_t+e_{t-1}) | Controller::update() | ✅ |
| 污染物矩阵 | 生成→[B], 浓度依赖→[A]对角线 | solveSpecies() | ✅ |
| Fan偏导数 | 逆向解析 dQ/dΔP = 1/(dΔP/dQ) | Fan::calculate() | ✅ |

---

## 2. 验证案例

### Case 01: 三房间烟囱效应

- **配置**: 3 个房间 (20°C, 10°C, 15°C), 3 条 PowerLawOrifice 路径
- **驱动力**: 温差产生的密度差异 → 热压驱动
- **结果**: 12 次迭代收敛, 残差 < 1e-5 kg/s
- **验证**: 质量守恒 ΣṁΔP = 0 ✅

### Case 02: CO₂ 源瞬态模拟

- **配置**: 2 房间, CO₂ 恒定源 (5e-6 kg/s), 1 小时模拟
- **驱动力**: 排程控制的 CO₂ 释放 + 自然通风稀释
- **结果**: 61 个时间步输出, CO₂ 浓度先升后稳定
- **验证**: 质量平衡 (生成-排出 = 累积变化) ✅

### Case 03: Fan + Duct + TwoWayFlow 多区域

- **配置**: 3 房间, Fan (0.05 m³/s), Duct (5m, Ø0.2m), TwoWayFlow
- **驱动力**: 风扇强制通风 + 密度差异
- **结果**: 收敛, 风扇维持 20 Pa 工作压力
- **验证**: 流量方向符合物理预期 ✅

### Case 04: 全元件多区域验证

- **配置**: 4 节点, 8 路径, 5 种元件, 2 种污染物
- **驱动力**: 混合 (温差 + 风扇 + 阀门控制)
- **结果**: 收敛, 所有元件正确计算流量和偏导数
- **验证**: 残差 < 1e-5, 浓度非负 ✅

---

## 3. 元件模型验证

### 3.1 PowerLawOrifice

- 正压差/负压差对称性 ✅
- 零压差线性化连续性 ✅
- 导数在全压差范围内正值 ✅

### 3.2 Brown-Solvason TwoWayFlow

- 温差 = 0 时退化为单向孔口 ✅
- 温差 > 0 时产生双向流 (flow_ij > 0 且 flow_ji > 0) ✅
- 中性面位置随压差变化正确移动 ✅

### 3.3 Fan (线性 + 多项式)

- 零压差时流量 = maxFlow ✅
- 截止压力时流量 = 0 ✅
- 多项式模式与线性模式结果一致（线性系数时） ✅

### 3.4 Duct

- Darcy-Weisbach 摩擦损失正确 ✅
- Swamee-Jain 摩擦系数与 Moody 图吻合 ✅
- 局部损失系数 sumK 正确叠加 ✅

### 3.5 SelfRegulatingVent

- 缓升区域线性 ✅
- 调节区域恒定流量 ✅
- 溢出区域流量递增 ✅

### 3.6 CheckValve

- 正向流量 = PowerLawOrifice ✅
- 反向流量 = 0 ✅
- 数值稳定性（反向微小导数） ✅

### 3.7 QuadraticElement

- 二次流量-压差关系 Q = C·√ΔP ✅
- 零压差线性化连续性 ✅

### 3.8 BackdraftDamper

- 正向流量同 PowerLawOrifice ✅
- 反向流量阻止 ✅

### 3.9 SupplyDiffuser / ReturnGrille

- 低阻力末端装置流量计算 ✅
- 导数连续性 ✅

---

## 4. 高级模型验证

### 4.1 化学动力学

- A→B 反应: B 累积随时间增长 ✅
- 耦合求解器 solveCoupled 结果与独立求解一致（无反应时） ✅

### 4.2 超级过滤器

- 单级效率 = 基础效率 ✅
- 级联效率 η = 1 - Π(1-η_k) ✅
- 载灰量衰减降低效率 ✅

### 4.3 Axley BLD

- 空气浓度 > 固相/k → 吸附(正) ✅
- 固相/k > 空气浓度 → 解吸(负) ✅

### 4.4 气溶胶沉积

- 沉积系数 = d × A_s ✅
- 质量守恒 (沉积量 = d×A×C×dt) ✅

### 4.5 报告输出验证

| 报告类型 | 测试数 | 验证内容 |
|---------|--------|---------|
| AchReport (.ACH) | 含于 test_p1_features | 总/机械/渗透换气次数分项 |
| CsmReport (.CSM) | 含于 test_p1_features | 时均/峰值浓度 + 外渗估算 |
| CbwReport (.CBW) | 含于 test_phase6 | 日均/峰值/分位数统计 |
| ValReport (.VAL) | 6 | 鼓风门 50Pa 泄漏量模拟 |
| EbwReport (.EBW) | 8 | 个人呼吸道吸入量评估 |
| CexReport (.CEX) | 7 | 逐开口溯源泄漏量 (基础/详细模式) |
| LogReport (.LOG) | 12 | 控制变量流水记录 |
| OneDOutput | 16 | RXR/RZF/RZM/RZ1 二进制格式 |
