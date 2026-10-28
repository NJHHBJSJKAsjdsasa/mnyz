# 05 · 组件清单与处置

> 239 个文件逐个定性。四类处置：**A 冻结 / B 包装 / C 重写 / D 新增**，另有 **E 删除**。
> 判据：文件是否触及行星/星系渲染 → 冻结；是否是逻辑层（数据/状态机）→ 保留逻辑只重写表现。

---

## 1. 统计

| 类 | 文件数 | 行数 | 占全站 |
|---|---:|---:|---:|
| A 冻结（不修改） | 79 | 40,124 | 55.3% |
| B 包装（逻辑不动，只换外壳） | 12 | 3,163 | 4.4% |
| C 重写（表现层） | 27 | 8,216 | 11.3% |
| 保留原样（`Utils/` 逻辑层 + `Icons/` + `Hooks/`） | 96 | 20,207 | 27.8% |
| D 新增 | 0 → 约 28 | +≈7,000 | — |
| E 删除 | 5 | 904 | 1.2% |

> 口径：按文件归类，行数为 `wc -l` 实测加总，全站 72,614 行（239 文件）。
> `Utils/` 15,005 行全部"保留原样"——它是数据层与玩法状态机，重设计中一行不改。

---

## 2. A 组 · 冻结（禁止任何修改）

### 2.1 行星渲染核心

| 文件 | 行数 | 说明 |
|---|---:|---|
| `3DComponents/ModularPlanetRenderer.tsx` | 1,827 | 行星主渲染器 |
| `3DComponents/ModularPlanetRendererWrapper.tsx` | 208 | 对外 props 契约 + `captureScreenshot` / `toggleEffect` |
| `3DComponents/PlanetLayerSystem.tsx` | 1,638 | 图层系统 |
| `3DComponents/MoonSystem.tsx` | 1,672 | 卫星系统 |
| `3DComponents/UniversalPlanet3DWrapper.tsx` | 152 | |
| `3DComponents/UniversalPlanetRenderer.tsx` | 165 | |
| `3DEffects/**`（56 个 + `index.ts` + `EffectRegistry.tsx`） | 25,161 | 行星/大气/生命/地形全部效果 |
| `Config/UniversalRenderer.ts` | 169 | 渲染配置 |

### 2.2 星系 / 恒星系 / 宇宙渲染

| 文件 | 行数 |
|---|---:|
| `Components/Galaxy3DViewer.tsx` | 1,451 |
| `Components/Galaxy3DViewerFullscreen.tsx` | 1,194 |
| `Components/SolarSystem3DViewerLeft.tsx` | 824 |
| `Components/SolarSystem3DViewer.tsx` | 630 |
| `Components/SolarSystem3DViewerFullscreen.tsx` | 415 |
| `Components/Universe3DViewer.tsx` | 445 |
| `Components/Universe3DViewerFullscreen.tsx` | 378 |
| `Components/GalaxyVisualization.tsx` | 190 |
| `Components/SystemVisualizationUniversal.tsx` | 263 |
| `Components/PlanetVisualizationUniversal.tsx` | 263（**仅内部 3D 分支冻结**，见下） |
| `Components/CoordinateViewer3D.tsx` | 302（坐标预览 3D） |
| `Components/MultiverseTransitionCanvas.tsx` | 985（转场 canvas，**允许改调用时机**） |
| `Components/StarfieldWarpReveal.tsx` | 779（**允许改调用时机与跳过逻辑**） |
| `Components/UniverseAnimationCanvas.tsx` | 753（onboarding 背景） |
| `3DEffects/StarField.tsx` | 495 |
| `Components/AdaptivePreloadCanvas.tsx` | 260 |

### 2.3 `PlanetVisualizationUniversal` 的半冻结规则

```
允许改：
  - 外层容器 div 的 className（尺寸、边框、圆角、背景色）
  - 删除 <h3>Planet Visualization</h3> 与 "Gateway to the stars"
  - 下载/全屏按钮的位置与样式

禁止改：
  - canvasHidden / decelerateRef / imageLoaded 三个状态的时序
  - useEffect 里的 setTimeout(..., 800)
  - ModularPlanetRendererWrapper 的任何 prop
  - planetData 对象的任何字段
  - planetRendererRef 的三个方法调用点
```

同理 `MultiverseTransitionCanvas` / `StarfieldWarpReveal`：
**允许**改"何时挂载、何时卸载、是否跳过"；**禁止**改内部 canvas 绘制。

### 2.4 冻结区的样式约束

冻结组件内部写死了 `bg-black`、`border-2 border-blue-400/30`、`#0ff` 等。
**不在本次重设计中清理**（改了就要重测渲染）。只用外层容器覆盖：

```tsx
{/* 外层包一层，用 overflow-hidden + 自身背景遮住内层的黑底边框 */}
<div className="surface-plate overflow-hidden aspect-square max-w-[400px] bg-n-200">
  <PlanetVisualizationUniversal ... />
</div>
```

> 若内层硬编码的 `border-2 border-blue-400/30` 穿透可见，允许在冻结组件上
> **仅追加**一个可选 prop `frameClassName?: string`（默认值保持现状），
> 这是本文件唯一允许的冻结区改动，且必须由阶段四统一评审。

---

## 3. B 组 · 包装（逻辑不动，只换外壳）

| 文件 | 行数 | 处置 |
|---|---:|---|
| `Components/ExplorationLab.tsx` | 125 | 重写容器：12 平铺 → 4 组 × N（见 02 §3.2）。12 个 Tab 组件**零改动** |
| `Components/PlanetInfo.tsx` | 535 | 拆为 4 个（见下） |
| `Components/FuelBars.tsx` | 315 | 重写为 `StatusBar` 的资源段；12 资源读取逻辑复用 |
| `Components/Header.tsx` | 56 | 重写为 `TopRail`；`UniverseDetection` 轮询删除，改用 `ShellContext` |
| `Components/ServerAuthPanel.tsx` | 140 | 保留逻辑；改成 `Modal` + 表单 token |
| `Components/SpaceshipPanel.tsx` | 907 | 保留全部业务逻辑（升级/改装/维修）；外壳改 `ContextDrawer` 内的分段面板 |
| `Components/TaskPanel.tsx` | 270 | 保留逻辑；改 `ContextDrawer` |
| `Components/TreasureChest.tsx` | 242 | 保留逻辑；改 `Modal` |
| `Components/DidYouKnow.tsx` | 225 | 保留轮播逻辑；外壳改右下角 Toast 卡（现状是浮动圆圈，遮挡交互） |
| `Components/VersionFooter.tsx` | 115 | 内容并入 `StatusBar` 右侧，组件删除 |
| `Components/Pagination.tsx` | 191 | 重写（唯一改动：样式 + 无障碍） |
| `Components/CosmicBanner.tsx` | 41 | 保留（坐标滚动条），改色 |
| `Components/ResourceStatusBar.tsx` + `ResourceCollectionButton.tsx` | 214 | 合并进新的 `PlanetActions` |

### 3.1 `PlanetInfo` 拆分方案

现状 535 行单组件承载 6 种内容。拆为：

| 新组件 | 内容 | 数据来源 |
|---|---|---|
| `PlanetOverview.tsx`（新） | 6 格仪表：直径/质量/重力/温度/大气/自转 | 现有 `planet` prop |
| `PlanetEffectsControl.tsx`（新） | 效果开关列表（仅 `ENABLE_EFFECTS_CONTROL` 时渲染） | 现有 `effects` / `onToggleEffect` |
| `PlanetActions.tsx`（新） | 采集 / 书签 / 分享 / 扫描 4 个动作 | `ResourceCollectionButton` + `SaveLocationButton` 逻辑 |
| `PlanetMoons.tsx`（新） | 卫星列表（`selectedMoon` 存在时） | 现有 `selectedMoon` prop |

原 `PlanetInfo.tsx` 保留为薄壳，按顺序组合以上 4 个，供阶段一先跑通再由阶段三替换。
**所有业务逻辑（`ResourceEventManager`、`PlanetScanSystem`、`LocationBookmarks` 调用）一行不改。**

---

## 4. C 组 · 重写（表现层重写，逻辑复用）

| 文件 | 行数 | 重写范围 |
|---|---:|---|
| `Layouts/__main__.tsx` | 459 | 全新栅格（见 03 §1）；轮询合并为 1 个 tick |
| `Layouts/__planet__.tsx` | 199 | 全新栅格（见 03 §4） |
| `Layouts/__system__.tsx` | 156 | 行星列表卡片化 |
| `Layouts/__galaxy__.tsx` | 134 | 星系列表卡片化 |
| `Layouts/__multiverse__.tsx` | 626 | 节点网格；canvas 从常驻改按需 |
| `Layouts/__faq__.tsx` | 560 | 文档排版 |
| `Layouts/__onboarding__.tsx` | 231 | 三步向导 |
| `Layouts/__error__.tsx` | 58 | 错误码 + 人话 + 折叠详情 |
| `Components/CoordinateSelector.tsx` | 830 | **重点**：逻辑全保留（坐标步进、随机、校验、旅行成本展示），表现层重写。830 行里约 600 行是被 `global.css` 的 `coordinate-selector-*` 动画类驱动的装饰 JSX，可降到 ~280 行 |
| `Components/GalaxyInfo.tsx` | 153 | 表格化 |
| `Components/GalaxyNavigation.tsx` | 170 | 面包屑化 |
| `Components/SystemInfo.tsx` | 189 | 表格化 |
| `Components/SystemNavigation.tsx` | ~150 | 面包屑化 |
| `Components/PlanetNavigation.tsx` | 197 | 改为系统内行星切换条（横向 pill 列表），不用卡片网格 |
| `Components/PlanetsList.tsx` | ~180 | 卡片化（见 03 §3） |
| `Components/SystemsList.tsx` | ~180 | 卡片化 |
| `Components/StockMarketPanel.tsx` | 394 | 三栏布局（列表 / 图表 / 下单），K 线 SVG 保留 |
| `Components/ScanTab.tsx` | 245 | 表格 + 内联状态 |
| `Components/TradeTab.tsx` | 163 | 两栏报价表 |
| `Components/ShipyardTab.tsx` | 224 | 模块卡片 + 属性对比条 |
| `Components/StationTab.tsx` | 293 | 模块网格 |
| `Components/FabricatorTab.tsx` | 83 | 配方列表 + 队列 |
| `Components/TechTab.tsx` | 102 | 树形（现状平铺） |
| `Components/ContractTab.tsx` | 316 | 表格 + Drawer 详情 |
| `Components/ResidentsTab.tsx` | 253 | 卡片网格 |
| `Components/CodexTab.tsx` | 174 | 网格 + 详情 |
| `Components/WeeklyTab.tsx` | 66 | 进度条列表 |
| `Components/CouncilTab.tsx` | 210 | 动议表格 + 投票条 |
| `Components/CombatPanel.tsx` | 276 | 回合制战斗界面重排 |
| `Components/SiegePanel.tsx` | 164 | 攻城进度 + 参与方 |
| `Components/FleetPanel.tsx` | 164 | 舰队表 + 任务分配 |
| `Components/IntelPanel.tsx` | 67 | 情报表 |
| `Components/MiningAnimationOverlay.tsx` | 82 | 改为单层径向脉冲（见 04 §8.4） |

**"重写"的定义**：JSX 结构与 className 全部替换；`useState` / `useEffect` / 事件处理 /
`ServerApi` 调用 / `localStorage` 键 **保持不变**。不允许在重写过程中"顺手改逻辑"——
逻辑变更必须单独提交，便于回滚。

---

## 5. D 组 · 新增组件（约 28 个）

### 5.1 外壳（7）

| 组件 | 职责 |
|---|---|
| `Shell/AtlasShell.tsx` | 外壳容器 |
| `Shell/ShellProvider.tsx` | 唯一状态源 + 唯一 tick + 数据缓存 |
| `Shell/ShellRouter.tsx` | hash ↔ `ShellView` 映射 |
| `Shell/TopRail.tsx` | 顶栏 |
| `Shell/NavRail.tsx` | 左侧导航（移动端底部栏） |
| `Shell/StatusBar.tsx` | 底部状态带（含资源段） |
| `Shell/CommandPalette.tsx` | ⌘K 面板 |

### 5.2 基础控件（11）

`ui/Button.tsx`（4 variant × 3 size）、`ui/IconButton.tsx`、`ui/Input.tsx`、
`ui/NumberInput.tsx`（mono + 步进）、`ui/Select.tsx`、`ui/Checkbox.tsx`、`ui/Switch.tsx`、
`ui/Badge.tsx`、`ui/Tooltip.tsx`、`ui/Tabs.tsx`（含组/子标签两级）、`ui/Progress.tsx`。

### 5.3 结构控件（6）

`ui/Panel.tsx`（`.surface-plate` + 可选角标 + 标题区 + 操作区）、
`ui/Table.tsx`（发丝边框、定宽列、mono 数值、排序、空态）、
`ui/Drawer.tsx`、`ui/Modal.tsx`、`ui/Toast.tsx`（`ToastHost` 单例）、
`ui/EmptyState.tsx` / `ui/Skeleton.tsx`。

### 5.4 数据展示（4）

`ui/MetricGrid.tsx`（6 格仪表，`divide-x`）、`ui/Sparkline.tsx`（纯 SVG，用于指数/余额趋势）、
`ui/CandleChart.tsx`（从 `StockMarketPanel` 抽出，逻辑不变）、`ui/StatusDot.tsx`。

### 5.5 hook（3）

`Hooks/useReducedMotion.ts`、`Hooks/useInViewPause.ts`、`Hooks/useHashView.ts`。

### 5.6 新增业务面板（7，见 [06](06-economy-surfaces.md)）

`panels/AssetsPanel.tsx`、`panels/MarketPanel.tsx`、`panels/BankPanel.tsx`、
`panels/CompanyPanel.tsx`、`panels/LegalPanel.tsx`、`panels/LogPanel.tsx`、
`panels/PanelHost.tsx`。

---

## 6. E 组 · 删除

### 6.1 已确认的死代码（零引用，实测）

| 文件 | 行数 | 证据 |
|---|---:|---|
| `Components/MatrixTextReveal.tsx` | 486 | 全仓库无 `import`（含 `lazy(() => import(...))`） |
| `Components/NavigationForm.tsx` | 46 | 全仓库无 `import`。它内部引用了 `CoordinateViewer3D`，但自身无引用者 |
| `Components/StorageDebug.tsx` | 60 | 全仓库无 `import` |
| `Components/SystemVisualization.tsx` | 118 | 全仓库无 `import`（实际使用的是 `SystemVisualizationUniversal`） |
| `Components/PlanetVisualization.tsx` | 194 | `__planet__.tsx` 第 5 行 import 了，但 JSX 里**从未使用**（第 159 行用的是 `PlanetVisualizationUniversal`）——死 import |

删除 **5 个文件、904 行**。

> 注：`Components/StarfieldWarpReveal.tsx`（779 行）由 `lazy(() => import(...))` **动态导入**，
> 常规静态 import grep 搜不到引用，**不要误删**。同理 `MultiverseBanner.jsx`、`StarfieldWarpReveal`、
> `CoordinateViewer3D`、`SpaceshipPanel`、`FuelBars`、`TaskPanel` 全部走 `lazy()`，删除前必须
> `grep -rn "import(" js` 二次确认。

### 6.2 合并

| 现有 | 合并到 |
|---|---|
| `VersionFooter` | `StatusBar` |
| `ResourceStatusBar` + `ResourceCollectionButton` | `PlanetActions` |
| `MultiverseBanner`（导航页/行星页的滚动横幅） | `TopRail` 的 `aurora` 徽章 + `LogPanel` |
| `CopyrightWatermark` | 保留（它在 3D 截图里作为水印，属冻结区调用） |
| `StarfieldWarpReveal` + `MatrixTextReveal` | 只留前者（后者已死） |

### 6.3 `global.css` 内的样式

见 [01 §9](01-design-system.md)：2,209 行 → ≤ 400 行，88 个 keyframe → ≤ 16。

---

## 7. 目录规范（新增代码必须遵守）

```
atlas-ui/react/static/js/
├── shell/            AtlasShell / TopRail / NavRail / StatusBar / CommandPalette / ShellRouter
├── ui/               无业务的基础控件（Button/Input/Table/Panel/...）
├── panels/           经济面板（Assets/Market/Bank/Company/Legal/Log）
├── Components/       既有业务组件（保留现状目录，逐步迁出）
├── Layouts/          8 个页面布局
├── Utils/            数据层与玩法状态机（ServerApi 等）
├── Hooks/            通用 hook
└── Icons/            SVG 图标（新增 20 个，补齐导航与面板图标）
```

命名：

- 组件文件 `PascalCase.tsx`，hook `useXxx.ts`，工具 `camelCase.tsx`（沿用现状 `.tsx` 扩展名，不强制改）。
- **不引入路径别名**（`@/`），继续用相对路径 —— `vite.config.mjs` 无 alias 配置，加了要改构建配置。
- 每个新增组件必须导出 `Props` 接口，且 `props` 必填项不得有默认值。

### 7.1 新增图标（20 个）

导航：`CompassIcon`(有 `GalaxyIcon` 可复用)、`LayersIcon`、`ChartIcon`、`VaultIcon`、`BuildingIcon`、`ScaleIcon`
动作：`SearchIcon`、`CloseIcon`、`ChevronIcon`、`ArrowRightIcon`、`TrashIcon`、`EditIcon`、`CopyIcon`、`FilterIcon`、`SortIcon`
状态：`CheckCircleIcon`、`AlertIcon`、`InfoIcon`、`LoadingIcon`、`OfflineIcon`

风格：24×24 viewBox、`stroke-width 1.5`、`currentColor`、无填充（与现有 `Icons/` 一致）。

---

## 8. 工作量估算

| 阶段 | 内容 | 涉及文件 | 预估 |
|---|---|---|---:|
| P0 基座 | token + `global.css` 腰斩 + `ui/` 11 个基础控件 | 7 新增 + 2 改 | 3 人日 |
| P1 外壳 | `shell/` 7 个 + 8 个 Layout 接入 | 7 新增 + 8 改 | 4 人日 |
| P2 页面 | 8 个 Layout 重排 + B 组 12 个换壳 | 20 改 | 6 人日 |
| P3 面板 | 12 个 Tab 重写 + `panels/` 7 个 | 19 改 + 7 新增 | 8 人日 |
| P4 动效 | 删旧动画 + 新动效标定 + 性能调优 | 全局 | 3 人日 |

合计约 **24 人日**（单人）。可分阶段独立合并，每阶段都可上线。

---

## 9. 验收（本文件）

- [ ] A 组 71 个文件 `git diff` 为空（`StarfieldWarpReveal` / `MultiverseTransitionCanvas` / `PlanetVisualizationUniversal` 只允许出现"调用时机/prop 透传"级别的 diff）
- [ ] E 组 5 个死文件已删除，`npx tsc --noEmit` 仍为 0 错误
- [ ] `ui/` 下组件无任何 `ServerApi` / `localStorage` 引用（纯展示）
- [ ] `panels/` 下组件无任何硬编码颜色
- [ ] 每个新增组件都有 `Props` 接口导出
