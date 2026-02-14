# CONTAM-Next 用户手册

> 版本 2.0 | 2026-02-14

---

## 1. 概述

CONTAM-Next 是 NIST CONTAM 多区域气流与污染物传输仿真软件的现代重构版本。采用 C++17 计算引擎 + Tauri 2.0 桌面框架 + React 前端架构。

### 主要功能

- **稳态气流求解**：Newton-Raphson + 信赖域/亚松弛
- **瞬态污染物传输**：隐式欧拉时间积分
- **6 种气流元件**：幂律孔口、大开口双向流、风扇（含多项式曲线）、风管、阀门、过滤器
- **控制系统**：传感器 → PI 控制器（死区+抗饱和）→ 执行器
- **人员暴露评估**：累积吸入剂量 + 峰值浓度跟踪
- **Python API**：pybind11 封装，支持批量仿真
- **HDF5 输出**：gzip 压缩时序数据

---

## 2. 安装

### 2.1 引擎编译（C++）

```bash
cd contam-next/engine
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build . --config Release
```

依赖通过 CMake FetchContent 自动下载：Eigen3、nlohmann-json、Google Test。

### 2.2 前端开发

```bash
cd contam-next/app
npm install
npm run dev          # Vite 开发服务器
npm run tauri dev    # Tauri 桌面窗口
```

### 2.3 Python API

```bash
cd contam-next/python
pip install pybind11
python setup.py build_ext --inplace
```

---

## 3. 快速开始

### 3.1 GUI 操作

1. **添加房间**：工具栏点击「房间」或按 `2`，在画布上点击放置
2. **添加室外节点**：工具栏点击「室外」或按 `3`
3. **创建连接**：工具栏点击「连接」或按 `4`，依次点击两个节点
4. **编辑属性**：选择模式下点击节点/连接，右侧面板编辑参数
5. **运行仿真**：点击「稳态求解」或「瞬态仿真」按钮
6. **查看结果**：画布显示压力/流量，图表显示时序数据

### 3.2 快捷键

| 快捷键 | 功能 |
|--------|------|
| `1` | 选择模式 |
| `2` | 添加房间 |
| `3` | 添加室外节点 |
| `4` | 创建连接 |
| `Delete` | 删除选中元素 |
| `Esc` | 取消选择 |
| `Ctrl+Z` | 撤销 |
| `Ctrl+Shift+Z` | 重做 |
| 滚轮 | 缩放画布 |
| 拖拽空白 | 平移画布 |

### 3.3 CLI 使用

```bash
contam_engine -i input.json -o output.json -v
contam_engine -i input.json -o output.json --transient
```

---

## 4. 气流元件

### 4.1 幂律孔口 (PowerLawOrifice)

$$\dot{m} = \rho \cdot C \cdot |\Delta P|^n \cdot \text{sign}(\Delta P)$$

| 参数 | 说明 | 典型值 |
|------|------|--------|
| C | 流动系数 | 0.001 m³/(s·Pa^n) |
| n | 流动指数 | 0.5~1.0 (0.65 典型) |

### 4.2 大开口双向流 (TwoWayFlow)

$$\dot{m} = \rho \cdot C_d \cdot A \cdot \sqrt{2|\Delta P|/\rho} \cdot \text{sign}(\Delta P)$$

| 参数 | 说明 | 典型值 |
|------|------|--------|
| Cd | 流量系数 | 0.6~0.7 |
| area | 开口面积 | 0.1~2.0 m² |

### 4.3 风扇 (Fan)

**线性模式**：$Q = Q_{max} \cdot (1 - \Delta P / P_{shutoff})$

**多项式模式**：$\Delta P = a_0 + a_1 Q + a_2 Q^2 + \cdots$（Newton 反解求 Q）

| 参数 | 说明 |
|------|------|
| maxFlow | 最大流量 m³/s |
| shutoffPressure | 截止压力 Pa |
| coeffs | 多项式系数数组（可选） |

### 4.4 风管 (Duct)

Darcy-Weisbach + Swamee-Jain 摩擦系数自动计算。

| 参数 | 说明 | 典型值 |
|------|------|--------|
| length | 管长 m | 1~50 |
| diameter | 管径 m | 0.1~0.5 |
| roughness | 粗糙度 m | 0.0001 (镀锌钢) |
| sumK | 局部损失系数 | 0~10 |

### 4.5 阀门 (Damper)

$$\dot{m} = \rho \cdot C_{max} \cdot f \cdot |\Delta P|^n \cdot \text{sign}(\Delta P)$$

| 参数 | 说明 |
|------|------|
| Cmax | 全开流量系数 |
| fraction | 开度 0~1 |

### 4.6 过滤器 (Filter)

气流阻力同幂律孔口模型，附加污染物去除效率 η。

$$C_{out} = C_{in} \cdot (1 - \eta)$$

---

## 5. 控制系统

### 控制回路

```
传感器(Sensor) → 控制器(Controller) → 执行器(Actuator) → 气流元件
```

### PI 控制器

$$u(t) = K_p \cdot e(t) + K_i \int e(\tau) d\tau$$

- **死区**：$|e| < \text{deadband}$ 时不动作
- **抗饱和**：输出饱和时停止积分
- **输出范围**：硬截断到 [0, 1]

### 传感器类型

- `Concentration`：区域污染物浓度 (kg/m³)
- `Pressure`：区域压力 (Pa)
- `Temperature`：区域温度 (K)
- `MassFlow`：路径质量流量 (kg/s)

### 执行器类型

- `DamperFraction`：控制阀门开度
- `FanSpeed`：控制风扇转速
- `FilterBypass`：控制过滤器旁通

---

## 6. 人员暴露评估

### 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| breathingRate | 呼吸率 m³/s | 1.2×10⁻⁴ (静息) |
| zoneIdx | 所在区域 | - |
| scheduleId | 区域时间表 | -1 (固定) |

### 输出

- **累积吸入剂量** = Σ(呼吸率 × 浓度 × Δt)
- **峰值浓度** + 峰值出现时间
- **暴露时长**：浓度 > 0 的总时间

---

## 7. JSON 输入格式

参见 `schemas/topology.schema.json` 获取完整 JSON Schema 定义。

### 最小示例

```json
{
  "nodes": [
    { "id": 0, "name": "室外", "type": "ambient", "temperature": 283.15 },
    { "id": 1, "name": "办公室", "temperature": 293.15, "volume": 50 }
  ],
  "links": [
    {
      "id": 1, "from": 0, "to": 1, "elevation": 1.0,
      "element": { "type": "PowerLawOrifice", "C": 0.003, "n": 0.65 }
    }
  ]
}
```

---

## 8. 验证案例

| 案例 | 描述 | 节点 | 路径 |
|------|------|------|------|
| case01 | 三房间烟囱效应 | 3 | 3 |
| case02 | CO₂ 源瞬态 1 小时 | 2 | 2 |
| case03 | 风扇+风管+大开口 | 3 | 4 |
| case04 | 全 5 元件 + 2 物种 | 4 | 8 |

验证文件位于 `validation/` 目录。
