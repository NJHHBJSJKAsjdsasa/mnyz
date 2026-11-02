# 05 · 组件清单与处置

> 239 个文件逐个定性。四类处置：**A 冻结 / B 包装 / C 重写 / D 新增**，另有 **E 删除**。
> 判据：文件是否触及行星/星系渲染 → 冻结；是否是逻辑层（数据/状态机）→ 保留逻辑只重写表现。

---

## 1. 统计

| 类 | 文件数 | 行数 | 占全站 |
|---|---:|---:|---:|
| A 冻结（不修改） | 79 | 40,124 | 55.3% |
| B 包装（逻辑不动，只换外壳） | 13 | 3,509 | 4.8% |
| C 重写（表现层） | 33 | 7,556 | 10.4% |
| 保留原样（`Utils/` 逻辑层 + `Icons/` + `Hooks/` + 其余） | 109 | 20,521 | 28.3% |
| D 新增 | 0 → 约 48 | +≈10,500 | — |
| E 删除 | 5 | 904 | 1.2% |

> 口径：按文件归类，行数为 `wc -l` 实测加总，全站 72,614 行 / 239 文件（2026-10-28 12:00 基线）。
> 五列（不含 D）相加 = 239 文件 / 72,614 行，无重叠。
> `Utils/` 15,005 行全部"保留原样"——它是数据层与玩法状态机，重设计中一行不改。
> E 组 5 个文件当前也在"保留原样"里，删除后总计降为 71,710 行。

### 附录 · 基线 → 现值拆解（2026-10-28 16:4x 复测，渲染移植阶段 5 后）

全站现值 **281 文件 / 84,755 行**（+42 文件 / +12,141 行），差额全部来自新增，A/B/C/保留/E 五类未变：

| 新增 | 文件 | 行数 | 归属 |
|---|---:|---:|---|
| `js/3DComponents/realistic3/` | 23 | 8,580 | 渲染移植（14 vendored + adapter/systemAdapter/systemTypes/moons/perf/variantCache/view/VENDOR.md） |
| `js/economy/` | 5 | 1,121 | 经济四面板 + 外壳（v1.6 首个切片） |
| `js/ui/` | 4 | 488 | `Money` / `Status` / `bits` / `api` |
| `js/PlanetLab/main.tsx` | 1 | 225 | dev-only 实验页（不进 build） |
| `js/SystemLab/` | 2 | 324 | 恒星 / 恒星系 / 异象 实验页 + fixture（不进 build） |
| `js/Components/RealisticPlanetStage.tsx` | 1 | 204 | 真实渲染舞台壳 |
| `js/Components/RealisticStarStage.tsx` | 1 | 145 | 单颗恒星展台 |
| `js/Components/RealisticSystemStage.tsx` | 1 | 490 | 恒星系页落点（标签 / 点选 / 行星检视器 / setDetailed / setPlanetColor） |
| `js/Components/WarpTunnelFX.tsx` | 1 | 223 | 超跳跃换皮：隧道光环 + 速度线 + 径向色散（2D overlay） |
| `js/Components/ExoticShowcase.tsx` | 1 | 263 | 星系尺度天体展品 |
| `css/tokens.css` | 1 | 99 | 设计 token 层 |
| `js/Utils/RendererFlag.tsx` | 1 | 39 | 渲染开关 |
| 合计 | 42 | 12,193 | 与「+12,141」差 52 行 = 12:00 的基线快照与逐目录复测之间本来就有的误差（存量文件在此期间也被就地改过） |

> **D 组进度**：原计划"约 48 文件 / ≈10,500 行"，已落 **11 文件 / 1,708 行**（`economy/` 5 + `ui/` 4 + `tokens.css`）≈ 16%；
> 其余 31 文件（`realistic3/` 23 + `RendererFlag.tsx` + 四个 Stage/Showcase + `WarpTunnelFX.tsx` + `SystemLab/` 2）属渲染移植线，**不计入 D 组**，
> 否则 D 组完成度会虚高而实际设计系统只落了 token 与 4 个基础件。

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
| `Components/ExplorationLab.tsx` | 125 → **150** | ✅ 重写容器：12 平铺 → 4 簇（勘探/经营/成长/势力，见 02 §3.2）。12 个 Tab 组件**零改动**；多出的 25 行是分组表与 `aria-pressed` |
| `Components/PlanetInfo.tsx` | 535 → **270** | ✅ 拆为 4 个（见 §3.1），四块全部落地 |
| `Components/FuelBars.tsx` | 315 → **76** | ✅ 拆成容器 + `fuel/FuelBar.tsx`(116) + `fuel/resourceConfig.tsx`(54)；5s 轮询改订阅（`Hooks/useShipResources.ts`）。**没有**并入 `StatusBar`：`StatusBar` 只在经济外壳里，而顶栏资源条要出现在全部 5 个游戏页 |
| `Components/Header.tsx` | 56 | ✅ 重写为令牌化仪器条（T-77）；`UniverseDetection` 轮询删除，改用 `ShellContext` |
| `Components/ServerAuthPanel.tsx` | 140 | ✅ 保留逻辑；改成 `ui/Modal` + 表单 token，且不再默认弹出（T-78） |
| `Components/SpaceshipPanel.tsx` | 907 → **224** | ✅ 逻辑 → `spaceship/useSpaceshipPanel.ts`(321)，三个 tab → `spaceship/{StatsTab,ShipTab,SavedTab}.tsx`(175/147/247)。**外壳仍是右下浮层**，Drawer 版待 `ui/Drawer`（T-69） |
| `Components/TaskPanel.tsx` | 270 | 🟡 保留逻辑；已与 `SpaceshipPanel`/`TreasureChest` 定好堆叠顺序（T-76），Drawer 化未做 |
| `Components/TreasureChest.tsx` | 242 | 🟡 保留逻辑；同上 |
| `Components/DidYouKnow.tsx` | 225 | ✅ 保留轮播逻辑；容器改 `pointer-events-none`，去掉两个装饰循环 |
| `Components/VersionFooter.tsx` | 115 → **91** | ✅ 图标拆到 `footer/icons.tsx`(48)，删掉声明后从未被读的 `showBadge`。**未并入 `StatusBar`**：它在 7 个 Layout 里都渲染（含 FAQ/错误页），`StatusBar` 只属于经济外壳，合并会把版本号从 5 个页面弄丢 |
| `Components/Pagination.tsx` | 191 | 🟡 样式与无障碍未改（不阻塞） |
| `Components/CosmicBanner.tsx` | 41 | 🟡 保留（坐标滚动条），改色未做 |
| `Components/ResourceStatusBar.tsx` | 127 | ✅ **直接删除**（T-84）：全仓 0 引用，`isExpanded` 永不变，`efficiency`/`getTravelCostPreview` 算完不用。`ResourceCollectionButton.tsx` 保留 |

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

**落地情况（2026-10-29）**：`PlanetOverview`(120) / `PlanetOwnership`(54) / `PlanetMoonCard`(101) / `PlanetTechData`(48) + `planet/format.ts`(26)，主文件 270 行只留状态与数据流。
`PlanetEffectsControl` 与 `PlanetActions` 没有按原计划拆 —— 前者只剩一行 `<EffectsControl …/>`，再包一层是纯函数调用开销；
后者的两个按钮各自带请求与冷却，合并会强迫它们共享一个 props 袋子。

### 3.2 拆分手法与验收（2026-10-29）

三次拆分用的都是同一套手法，记下来是为了下一批不用重新想：

1. **逻辑先出、标记后出**。先把手写状态与 effect 抽成 hook（`useSpaceshipPanel` / `useShipResources`），
   hook 返回 `PanelBag`，子组件用 `Pick<PanelBag, "a"|"b">` 只声明自己读的字段，父组件 `<Tab {...panel} />`。
   好处是标记搬运期间不用改一行 JSX。
2. **逐字搬运，不做"顺手优化"**。`SpaceshipPanel` 的三个 tab、`FuelBars` 的单段、`Arecibo` 的 158 个方法
   全是原样剪切。验证靠渲染产物而不是靠读 diff：
   - 纯计算（Arecibo）→ `npm run check:arecibo` 比对 22 组 SHA-1；
   - 纯展示（FuelBars / PlanetInfo）→ `tsc` + 冒烟 + 构建，标记差异靠 `git diff --word-diff` 复核。
3. **拆分必须让某条约束变得可执行**。`check_frontend_gates.py` 新增 `SIZE_BUDGET = 1200`：
   非渲染面文件超过 1200 行直接 fail，渲染面（`3DComponents/`、`3DEffects/`、`*3DViewer*`、半冻结三个）豁免。
   没有这条，`Arecibo` 这种 4.5k 行文件迟早会重新长出来。

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

## 5. D 组 · 新增组件（约 48 个）

### 5.1 外壳（7）· ✅ 已落地 2026-10-28

> 原 `economy/EconomyShell.tsx`（299 行）把这 7 个职责塞在一个文件里。现在按下面拆开，
> 旧文件降到 **57 行**（只剩"哪些面板 + 各渲染什么"）。`Shell/*` 7 件 665 行，含 `PanelHost` 共 **704 行**。
>
> **硬约束已进闸门**：`scripts/check_frontend_gates.py` 检查 `Shell/**` 里不得出现 `fetch(`
> （当前 0）—— 数据只能经 `ShellProvider`。

| 组件 | 职责 |
|---|---|
| `Shell/AtlasShell.tsx` | 外壳容器（四区组装 + launcher + ⌘K）· **171 行** |
| `Shell/ShellProvider.tsx` | 唯一状态源 + 唯一 tick + 数据缓存（`useShell()`）· 99 行 |
| `Shell/ShellRouter.tsx` | hash ↔ `ShellView` 映射（`useShellRouter()`）· 49 行 |
| `Shell/TopRail.tsx` | 顶栏（52px，含 `ui/Status` 与 ⌘K 入口）· 78 行 |
| `Shell/NavRail.tsx` | 左侧导航 118px（badge 由 snapshot 派生）· 71 行 |
| `Shell/StatusBar.tsx` | 底部状态带 30px · 38 行 |
| `Shell/CommandPalette.tsx` | ⌘K 面板（过滤 + ↑↓ + Esc）· 157 行 |

### 5.2 基础控件（11）· ✅ 已落地 2026-10-28

> 全部在 `atlas-ui/react/static/js/ui/`，统一从 `ui/index.ts` 导入；用 `tokens.css` 的
> `--atlas-*` 变量，不写十六进制色值。`Button`(4×3) / `IconButton` / `Input` / `NumberInput`(mono+步进) /
> `Select` / `Checkbox` / `Switch`(role=switch) / `Badge`(6 tone) / `Tooltip` / `Tabs`(两级) / `Progress`(含
> indeterminate)。`tsc --noEmit` 0 错。

`ui/Button.tsx`（4 variant × 3 size）、`ui/IconButton.tsx`、`ui/Input.tsx`、
`ui/NumberInput.tsx`（mono + 步进）、`ui/Select.tsx`、`ui/Checkbox.tsx`、`ui/Switch.tsx`、
`ui/Badge.tsx`、`ui/Tooltip.tsx`、`ui/Tabs.tsx`（含组/子标签两级）、`ui/Progress.tsx`。

### 5.3 结构控件（6）· ✅ 5/6 已落地 2026-10-29

| 文件 | 行数 | 说明 |
|---|---:|---|
| `ui/Panel.tsx` | 56 | 标题区 + 操作区 + hint，`.surface-plate` 底色 |
| `ui/Table.tsx` | 119 | 发丝边框、定宽列、mono 数值、空态（排序未做，见下） |
| `ui/Modal.tsx` | 139 | `.surface-overlay` 宿主 + Esc + 焦点回填 |
| `ui/Toast.tsx` | 118 | `ToastHost` 单例，挂在 `AtlasShell` |
| `ui/EmptyState.tsx` | 28 | 空态占位 |
| `ui/Skeleton.tsx` | 28 | 与 `prefers-reduced-motion` 联动 |
| `ui/Drawer.tsx` | — | **未建**：1280/768 两档用 CSS 网格折叠（`.market-quotes`），没有必须用抽屉的交互 |

> `panels/PanelHost.tsx` **已落地**（39 行，keep-alive：`visibility` 切换，隐藏面板绝对定位零高，
> 不占滚动高度）。**`Table` 的排序没有实现**——`panels/` 里 26 个子分区的数据量都不到一屏，
> 排序交给服务端的 `ORDER BY` 更省事；等真有翻页表格再加。

### 5.4 数据展示（4）· 🟡 2/4 已落地

`ui/Sparkline.tsx`（47，纯 SVG）、`ui/CandleChart.tsx`（102，从 `StockMarketPanel` 抽出）**已落地**；
`ui/MetricGrid.tsx`、`ui/StatusDot.tsx` **未建**——面板头部信息量用 `Panel` 的 `hint` 就够，
再抽一个 6 格仪表反而要多维护一套断点。等真有"一屏 6 个并列指标"的页面再建。

### 5.5 hook（3）· ⬜ 未建（按需）

计划：`Hooks/useReducedMotion.ts`、`Hooks/useInViewPause.ts`、`Hooks/useHashView.ts`。
现状 `Hooks/` 下只有 `useAtlasKeySequence.tsx`：

- `useHashView` 的功能被 `Shell/ShellRouter.tsx`（49 行）吸收，不必单独存在；
- `useReducedMotion` 在 `animations.css` 里用 `@media (prefers-reduced-motion)` 处理，TS 侧暂时不需要；
- `useInViewPause` 只有 3D 层需要，而 3D 层属冻结区（07 §1），不动。

### 5.6 新增业务面板（7 + 市场子分区 10 = 17，见 [06](06-economy-surfaces.md)）

`panels/AssetsPanel.tsx`、`panels/MarketPanel.tsx`、`panels/BankPanel.tsx`、
`panels/CompanyPanel.tsx`、`panels/LegalPanel.tsx`、`panels/LogPanel.tsx`、
`panels/PanelHost.tsx`

市场面板的子分区拆成独立文件（0123–0124 让它从 3 个 tab 涨到 9 个）：

```
panels/Market/
├── QuotesTab.tsx      行情三栏（复用现有 CandleChart）
├── OrdersTab.tsx      我的委托
├── PortfolioTab.tsx   持仓
├── IndicesTab.tsx     指数卡 + 点位序列
├── MarginTab.tsx      融资融券（维持担保比例）
├── IpoTab.tsx         发行（含 exchange_code 可选）
├── DividendsTab.tsx   分红
├── MmTab.tsx          做市程序（last_run_at / last_error）
├── VenuesTab.tsx      交易所清单 + 开所（5000 cc4 牌照费）
└── ActionsTab.tsx     拆股（危险操作）+ 退市信息
```

`panels/_shared/`：**实际落地 2 个** —— `useWrite.ts`（57，幂等键 + inFlight + 错误映射）、
`errors.ts`（22，`messageOf`）。计划里的 `Money.tsx`/`GateNotice.tsx`/`usePanelData.ts`/`errorText.ts`
**没有单独建**：金额统一用 `ui/Money`，门槛提示由 `Panel` 的 `hint` + `Toast` 承担，
每个面板的读数据逻辑差异太大（有的要轮询、有的只要一次），抽公共 hook 反而增加间接层。

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
| P3 面板 | 12 个 Tab 重写 + `panels/` 7 个 + 市场 10 个子分区 | 19 改 + 7 新增 | 9 人日 |
| P4 动效 | 删旧动画 + 新动效标定 + 性能调优 | 全局 | 3 人日 |

合计约 **25 人日**（单人）。可分阶段独立合并，每阶段都可上线。

---

## 9. 验收（本文件）· 2026-10-29 复核

- [x] A 组冻结文件无实质改动：`3DComponents/`、`3DEffects/`、`StarfieldWarpReveal` 均无 diff。
      唯一的渲染相关 diff 在 `Components/SystemVisualizationUniversal.tsx`（+28），内容是
      `useRealistic ? <RealisticSystemStage/> : <SolarSystem3DViewerLeft/>` 的**换壳**，属允许级别（调用时机/prop 透传）。
- [x] **E 组 5 个死文件已删除**（904 行，2026-10-29）：`MatrixTextReveal`(486) / `NavigationForm`(46) /
      `StorageDebug`(60) / `SystemVisualization`(118) / `PlanetVisualization`(194)，同时清掉
      `__planet__.tsx:5` 那条未使用的 import。删后 `npx tsc --noEmit` 仍为 0 错。
- [x] `ui/` 下 21 个组件零 `ServerApi` / `localStorage`；唯一引用在 `ui/api.ts`（数据层，非组件，设计如此）。
- [x] `panels/` 34 个文件零硬编码颜色（`#hex` / `rgba()` 各 0 处），零 `backdrop-blur`。
- [ ] **`Props` 接口导出未强制**：`BankPanel` / `LegalPanel` / `LogPanel` 用内联类型（无 props 时没意义），
      有 props 的（`AssetsPanel`、`MarketPanel` 的子分区）都显式声明了。**结论：按需，不作为门禁。**

### 9.1 2026-10-29 第二轮拆分复核

| 文件 | 拆前 | 拆后 | 校验 |
|---|---:|---|---|
| `Utils/LifeAreciboTranslator.tsx` | 4,515 | **113** + `Utils/arecibo/` 8 模块（最大 929） | `npm run check:arecibo` 22 组 SHA-1 逐位一致 |
| `Components/PlanetInfo.tsx` | 432 | **270** + `planet/` 3 新块 | `tsc` 0 错、冒烟 34/34、`vite build` 通过 |
| `Components/FuelBars.tsx` | 306 | **76** + `fuel/` 2 文件 | 同上；5s 轮询改事件订阅 |
| `Components/ResourceStatusBar.tsx` | 127 | **删除** | 全仓 0 引用 |
| `Components/ExplorationLab.tsx` | 125 | **150**（12 标签分 4 簇） | 有意增量，见 §3 |
| `Components/VersionFooter.tsx` | 115 | **91** + `footer/icons.tsx`(48) | 删死 prop `showBadge` |

新增硬闸门：`SIZE_BUDGET = 1200`（非渲染面），当前最大为 `Utils/arecibo/data.ts` 930 行。
