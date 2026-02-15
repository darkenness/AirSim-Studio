# CONTAM-Next Debug Log

Bug 追踪与修复记录。每次发现 bug 后在此记录问题描述、根因分析、修复方案和涉及文件。

---

## 格式模板

```
### BUG-XXX: [简短标题]
- **发现日期**: YYYY-MM-DD
- **严重程度**: Critical / High / Medium / Low
- **状态**: 🔴 Open / 🟡 In Progress / 🟢 Fixed
- **影响范围**: [引擎 / 前端 / Tauri / CI]

**问题描述**
[复现步骤和现象]

**根因分析**
[为什么会出现这个 bug]

**修复方案**
[具体做了什么修改]

**涉及文件**
- `path/to/file.ts` — [修改说明]

**验证**
- [ ] 单元测试通过
- [ ] 手动测试通过
- [ ] TypeScript 编译通过
```

---

## 已修复

### BUG-001: 暗色模式下多组件颜色硬编码
- **发现日期**: 2026-02-15
- **严重程度**: Medium
- **状态**: 🟢 Fixed
- **影响范围**: 前端

**问题描述**
ScheduleEditor、ContaminantPanel、PropertyPanel、ZoneProperties、ModelSummary、AHSPanel 中大量使用 `#000000`、`#FFFFFF`、`text-slate-*`、`bg-white`、`border-slate-*` 等硬编码颜色，暗色模式下文字不可见或对比度极低。

**根因分析**
组件开发时未使用 Tailwind 主题变量，直接写死了亮色模式颜色值。

**修复方案**
全部替换为 theme-aware 的 Tailwind 类: `text-foreground`、`text-muted-foreground`、`bg-background`、`bg-card`、`border-border`、`bg-accent`。

**涉及文件**
- `app/src/components/ScheduleEditor/ScheduleEditor.tsx` — 13 处颜色替换
- `app/src/components/ContaminantPanel/ContaminantPanel.tsx` — 11 处颜色替换 + 单位标签
- `app/src/components/PropertyPanel/PropertyPanel.tsx` — 6 处颜色替换
- `app/src/components/PropertyPanel/ZoneProperties.tsx` — 1 处单位标签颜色
- `app/src/components/ModelSummary/ModelSummary.tsx` — 8 处颜色替换
- `app/src/components/AHSPanel/AHSPanel.tsx` — 5 处颜色替换

**验证**
- [x] TypeScript 编译通过
- [x] 暗色/亮色模式手动切换验证

---

### BUG-002: PropertyPanel 标签页拥挤不可读
- **发现日期**: 2026-02-15
- **严重程度**: Medium
- **状态**: 🟢 Fixed
- **影响范围**: 前端

**问题描述**
PropertyPanel 7 个标签页挤在固定 `h-8` 的单行中，文字被截断，点击困难。侧边栏顶部被 TopBar 遮挡。

**根因分析**
标签容器使用固定高度且无换行，标签内边距过小 (`px-1`)。侧边栏缺少顶部间距。

**修复方案**
- 标签容器改为 `flex-wrap gap-1`，允许自动换行
- 标签内边距从 `px-1` 增加到 `px-2.5 py-1`
- 侧边栏添加 `pt-12` 避开浮动 TopBar

**涉及文件**
- `app/src/components/PropertyPanel/PropertyPanel.tsx` — 标签布局重构

**验证**
- [x] TypeScript 编译通过
- [x] 7 个标签页均可正常显示和点击

---

### BUG-003: 多组件 story 空引用崩溃
- **发现日期**: 2026-02-15
- **严重程度**: Critical
- **状态**: 🟢 Fixed
- **影响范围**: 前端

**问题描述**
FloatingStatusBox、ZoneProperties、EdgeProperties、PlacementProperties、StoryProperties 直接访问 `story.geometry` 而不检查 `story` 是否为 null/undefined。当 `getActiveStory()` 返回 undefined 时（如楼层数据未加载），页面白屏崩溃。

**根因分析**
`getActiveStory()` 可能返回 undefined，但调用方未做空值守卫。

**修复方案**
在所有访问 `story.geometry` 之前添加 `if (!story) return null;` 守卫。FloatingStatusBox 额外添加了 `story?.geometry` 可选链。

**涉及文件**
- `app/src/canvas/components/FloatingStatusBox.tsx` — 2 处 null guard
- `app/src/components/PropertyPanel/ZoneProperties.tsx` — 4 处 null guard (ZoneProperties, EdgeProperties, PlacementProperties, StoryProperties)

**验证**
- [x] 25 个 Vitest 测试通过
- [x] TypeScript 编译通过

---

### BUG-004: ResultsView 底部面板溢出画布
- **发现日期**: 2026-02-15
- **严重程度**: Low
- **状态**: 🟢 Fixed
- **影响范围**: 前端

**问题描述**
BottomPanel 在宽屏下无宽度限制，结果标签文字溢出容器边界。

**根因分析**
BottomPanel 使用固定居中定位，无 max-width 约束，标签文字无 overflow 处理。

**修复方案**
- BottomPanel 改为 `left-3 right-3 max-w-[900px] mx-auto` 响应式布局
- 结果标签添加 `overflow-hidden text-ellipsis`

**涉及文件**
- `app/src/App.tsx` — BottomPanel 容器样式

**验证**
- [x] TypeScript 编译通过

---

## 待修复

<!-- 在此添加新发现的 bug -->
