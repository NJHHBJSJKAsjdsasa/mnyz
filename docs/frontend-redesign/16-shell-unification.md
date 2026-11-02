# 16 · 统一外壳与连续世界（Unified Shell）

> **本文性质**：~~结构方案，不改任何代码。~~ **2026-10-31 起本文已转化为实施记录**——
> P0–P6 全部落地（`Shell/GameFrame.tsx` / `GameRouter.tsx` / `ShellProvider.tsx` 已在用），
> §4 每节标 ✅ 处即完成时间。
>
> **注意**：§3 说的「把 5 个文档变成 1 个」在实现上并未合并 HTML —— `atlas-ui/template/` 仍是
> `index` / `galaxy` / `system` / `planet` / `multiverse` 五个文档 + 五个 MountPoint，跨层跳转由
> `Utils/PageNavigation.ts` 的 PJJAX-lite 接管（fetch → DOMParser → 数据岛 → `pushState`），
> 只有 `POST /navigate` 与 `/multiverse/exit` 保留整页加载。这是有意的最小改动，不是遗漏。
>
> §1「证据」保留为**改造前**的现场记录，不要据此判断当前实现；当前状态看 §4 与 §6。
>
> 视觉权威仍是 [15-game-hud.md](15-game-hud.md)——
> 15 解决的是「皮肤」，本文解决的是「骨架」。两者不冲突：15 的 token、类名、动效全部沿用。
>
> **用户原话（2026-10-31）**：「前端不像一个游戏，而且不同的页面很割裂。」
>
> **结论**：视觉早就统一了，割裂来自结构——**首页是游戏，内页是套了游戏皮肤的网站**。

---

## 1. 证据

### 1.1 两套页面原型

| | 首页 `/` | 内页 `/galaxy` `/system` `/planet` |
|---|---|---|
| 布局 | 单屏四区，`min-h-screen` 无滚动 | 文档流，居中标题 + 内容列，页面滚动 |
| 顶栏 | `HomeScreen` 内部自绘（坐标 + 账户） | `Components/Header.tsx`（名称牌 + 状态芯片） |
| 主体 | 3D 舞台占主区 | 一整块 `.atlas-hud` 包住 3D + 信息 |
| 导航 | 拖动 + 跳跃控制台 | 列表 + `Pagination` 七按钮 + 灰色大返回按钮 |
| 页脚 | 无 | `VersionFooter` |
| 浮动件 | `EconomyShell` 为组件 `<EconomyShell />` | `ensureEconomyShell()` 命令式挂载 |

同一套配色、同一套 token，但**屏幕的物理规则不同**：首页是「一块仪表盘」，内页是「一篇文档」。

### 1.2 五个独立 HTML 文档

`atlas-ui/template/` 下 `index.html` / `galaxy.html` / `system.html` / `planet.html` / `multiverse.html`，
各自 `createRoot` 挂一个 React 树。跨层切换走 `window.location.href`——前端共 **39 处**
（`Layouts/` + `Components/` 内实测）。

每次跳转的代价：白屏 → `_preloader` → 3D 全量重建 → 右侧经济坞卸载再挂载 → 布局从「单屏」切成「文档流」再切回。

### 1.3 世界被做成了目录

| 层 | 现有呈现 | 玩家感受 |
|---|---|---|
| 宇宙 | 3D 舞台拖拽选坐标 | 在飞船上 |
| 星系 | 3D 星系图 + 下方系统列表 + 7 个分页按钮 | 在看一个详情页 |
| 恒星系 | 3D 星系图 + 行星列表 | 同上 |
| 行星 | 3D 球 + 探索实验台 | 同上 |

业务上「每个 (x,y,z) 一个星系，可向相邻坐标进位」，本该是**原地跃迁**，做成了**翻页**。

### 1.4 六个各自为政的浮动件

`TreasureChest` / `DidYouKnow` / `TaskPanel` / `SpaceshipPanel` / `FuelBars` / `MultiverseBanner`
各自 `fixed` 悬在角落，只在内页出现，首页没有。它们不属于任何网格。

---

## 2. 目标：一个壳，四个区

```
┌─ AtlasFrame ── 100vh，不可滚动，四区 1px 发光接缝 ─────────────────────┐
│ Topbar 46                                                            │
│  品牌 · 面包屑「星系 › 系统 › 行星」 · 坐标 · 燃料 · 账户 · ⌘K         │
├──────────┬─────────────────────────────────────┬─────────────────────┤
│ LeftRail │  Stage                              │ EconomyDock         │
│ 232      │  唯一的可变区                        │ 404（已有）          │
│          │  ┌───────────────────────────────┐  │                     │
│ 当前层级  │  │  3D 舞台（占满）               │  │  资产/银行/市场      │
│ 的子项列表 │  │                               │  │  公司/法务/活动      │
│          │  └───────────────────────────────┘  │                     │
│          │  角落信息卡 · 底部层级步进 ‹ ›      │                     │
├──────────┴─────────────────────────────────────┴─────────────────────┤
│ Statusbar 26   服务器时间 · 下次 tick · 在线 · 版本                   │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.1 关键抽象：LeftRail 就是「当前位置的子项」

这是消除目录感的支点。四个层级共用同一根轨道，只是内容随位置变：

| 当前视图 | LeftRail 内容 | Stage 内容 |
|---|---|---|
| `/` | 宇宙档案（现有 `HomeScreen` 左栏：种子、年龄、发展度） | 星图 + 跳跃控制台 |
| `/galaxy/n` | **系统列表**（现 `SystemsList`） | 星系 3D + 角落星系信息卡 |
| `/system/i` | **行星列表**（现 `PlanetsList`） | 恒星系 3D + 角落恒星信息卡 |
| `/planet/x` | **卫星 + 探索项**（现 `ExplorationLab`） | 行星 3D + 角落行星信息卡 |

于是：列表不再是页面主体，是**导航轨**；3D 不再是「一大块面板」，是**窗口**。
玩家在任何一层看到的都是同一块屏幕，只有轨道内容变了。

> **注意**：`num_systems` 可达 50000+（`__drawer_class_galaxy.py` 按 5 万/10 万分支）。
> LeftRail 列表必须虚拟滚动，`Pagination` 的 7 个数字按钮改成分页哨兵（滚到底加载下一页）。

### 2.2 组件处置

| 组件 | 处置 |
|---|---|
| `GalaxyVisualization` / `Galaxy3DViewer` / `SystemVisualizationUniversal` / `RealisticPlanetStage` / `RealisticSystemStage` | 渲染内核**零改动**；三个包装器在 P1b 各加了 `fill?: boolean`（只切容器 className，见 §4 P1b 注） |
| `SystemsList` / `PlanetsList` | 改造成 LeftRail 的列表项，加虚拟滚动 |
| `GalaxyInfo` / `SystemInfo` / `PlanetInfo` | 改造成 Stage 角落信息卡（复用现有内容，换容器） |
| `GalaxyNavigation` / `SystemNavigation` / `PlanetNavigation` | 合并为 `LevelNav`：`‹ ›` 沿层级步进 + 面包屑 |
| `Pagination` | 删除数字按钮，改分页哨兵 |
| `Header.tsx` | **删除**，并入 `Topbar` |
| `VersionFooter.tsx` | **删除**，并入 `Statusbar` |
| 灰色大返回按钮（3 处） | **删除**，由面包屑 + `LevelNav` 替代 |
| `TreasureChest` / `DidYouKnow` / `TaskPanel` / `SpaceshipPanel` / `FuelBars` / `MultiverseBanner` | 保留功能，**改由壳提供 slot**，不再各自 `fixed` |
| `EconomyShell` | 从命令式 `ensureEconomyShell()` 改为壳内组件，首页与内页统一 |

`HomeScreen`（840 行）不删，降级为 `Stage` 的一个视图：`stage/UniverseStage.tsx`。

---

## 3. 导航模型：把 5 个文档变成 1 个

### 3.1 边界（重要）

两类移动必须分开处理，别混：

| 移动 | 例子 | 方案 |
|---|---|---|
| **世界内移动** | 星系→系统→行星、系统翻页、行星→卫星 | 客户端视图切换，**不刷新** |
| **坐标跳跃** | 跳跃控制台 → `/navigate` | **保留整页跳转** |

坐标跳跃保留整页是对的：它要重算 session 里的 `galaxy`、扣燃料、播跃迁转场。那也是唯一该「真跳」的时刻。
**把跃迁做成唯二的白屏时刻，剩下 38 处全干掉。**

### 3.2 数据通道（纯前端，不动后端）

现状：每个模板都把数据以 JSON 注入页面（`#system-data` / `#galaxy-data` / `#meta-data` / `#data-universe-config`），
mount point 读出来交给 React。

方案：**PJAX-lite**

```
navigate(url)
  → 已在缓存？用缓存
  → fetch(url, {credentials:'same-origin'})
  → DOMParser 解析响应
  → 取出 #atlas-react-root 之前的所有 <script type="application/json">
  → setView({route, data})
  → history.pushState(null,'',url)
```

- 后端零改动（继续渲染完整 HTML，前端只取数据岛，丢掉 DOM）。
- 服务端 session 语义不变：`/system/5` 仍依赖 session 里的 `galaxy`，客户端导航不改变这一点。
- 缓存：`Map<url, data>`，容量 20，FIFO。返回上一层是瞬时的。
- 二期优化（可选，需后端配合）：请求带 `X-Atlas-View: 1`，服务端只吐 JSON 数据块，传输量降 ~90%。
  这是一次性改动，且不碰 `/api/v1` 契约。

> 为什么不上 react-router 全接管：`/planet/<name>` 的 3D 数据完全来自服务端数据岛，
> 客户端重建需要复制 `pymodules/` 里整套星系生成逻辑。PJAX-lite 保住了这个唯一的真源。

### 3.3 3D 生命周期

WebGL context 有上限（浏览器 ~16）。视图切换必须显式 dispose，不能只靠 unmount。

| 切换 | 行为 |
|---|---|
| 跨层（星系↔系统↔行星） | 允许卸载重建，用 `.atlas-jump-warp` 遮住 250–400ms |
| 同层换项（系统 3 → 系统 4） | **不卸载**，只换 props。`RealisticPlanetView` 已分 runtime / content 两层，runtime 天然复用 |
| 打开经济坞面板 | 不动 Stage |

这一条要写进代码注释，否则后人会把跨层重建也「优化」成复用，导致 signature 混乱。

---

## 4. 迁移步骤

每步独立可验收，前一步不绿不进下一步。

### P0 · 壳骨架（不动内页）— ✅ 2026-10-31 完成

1. 新建 `Shell/GameFrame.tsx`：四区骨架 + 接缝，只接受 `topbar` / `rail` / `stage` / `dock` / `status` 五个 slot。
2. `main/HomeScreen.tsx` 拆成 `stage/UniverseStage.tsx`，塞进 `GameFrame`。
3. `EconomyShell` 改为壳内组件，删掉 `ensureEconomyShell()`。
4. 验收：首页视觉效果**零回归**（对比现有截图）。

落地形态：`HomeScreen.tsx` 840 → 96 行（纯组合）。新增 `Shell/{GameFrame,GameTopBar,GameAtoms}.tsx` +
`main/{UniverseStage,UniverseRail}.tsx`。首页截图前后比对，布局逐项一致。

### P1 · 内页并入 — ✅ 2026-10-31 完成

1. `__galaxy__.tsx` / `__system__.tsx` / `__planet__.tsx` 从「整页布局」降级为 Stage 视图。
2. 列表搬进 LeftRail，`Header` / `VersionFooter` / 大返回按钮删除。
3. 浮动件接入壳 slot。
4. 验收：四个页面截图并排，**骨架完全一致**，只有内容不同。

落地形态：

| 新增/改造 | 说明 |
|---|---|
| `Shell/StageHeading.tsx` | `RailHeading` + `StageHeading`，三页共用；替代每页自绘的居中大标题 |
| `Shell/Breadcrumb.tsx` | 顶栏 `trail` 槽：`星系 › 系统 › 行星` |
| `Shell/RailPager.tsx` | `‹ 3 / 74 ›`，替代 191 行的 `Pagination`；`sticky bottom` 贴住轨道底 |
| `SystemsList` / `PlanetsList` | 网格卡片 → `.rail-row` 竖排（`tokens.css` 新增 5 条 rail 规则） |
| 三个 MountPoint | 删 `ensureEconomyShell()`，经济坞进 Layout 的 `dock` 槽 |

### P1b · Stage 重排 — ✅ 2026-10-31 完成

1. `GalaxyInfo` / `SystemInfo` / `PlanetInfo` 移入 `InfoDrawer`：默认收起为右侧 34px 竖条，展开时浮在 3D 上。
2. 3D 容器吃满 stage 宽高。
3. 验收：三页 3D 区 ≥ 视口宽度的 60%。

落地形态：

| 改动 | 说明 |
|---|---|
| `Shell/InfoDrawer.tsx` | 34px 竖条 ↔ 380px 浮层，`position:absolute` 覆盖在 3D 右缘；3D 不重排，渲染器不收到 resize |
| `GalaxyVisualization` / `SystemVisualizationUniversal` / `PlanetVisualizationUniversal` | 新增 `fill?: boolean`：跳过 `max-w-80 sm:max-w-96 aspect-square`，改为 `w-full flex-1 min-h-[280px]` |
| `RealisticPlanetStage` | `height={520}` → `height="100%"` |
| planet 页 `ExplorationLab` | 外层限 `maxHeight:46%` 内部滚动，3D 保底 `minHeight:300` |

> **`fill` 是这次唯一碰 3D 组件的地方**，且只改容器 className（尺寸），未动 props 语义、相机、shader 或挂载时机——符合 07 §1「只允许用外壳容器包住」。
>
> 顺带发现的真问题：三个 3D 包装器都把画布锁死在 `max-w-96`（384px）正方形里。这才是「3D 很小」的根因，不是列宽——之前无论给多宽的列，画布都不超过 384px。

**仍未解决**：铺满后星系图（1000+ 系统）和单恒星系显得空旷，点云稀疏。这是渲染器的相机距离 / 点密度参数，属于冻结区，不在本文范围。

### P1c · 行星页修复 + 3D 参数（2026-10-31，经用户授权解除渲染冻结）

用户原话：「行星页面为什么显示的好奇怪，都没有看到行星了」「星舰实验舱感觉不该放在下面」「现在可以动 该动就动」。

#### 1. 行星页 3D 塌陷（bug）

`RealisticPlanetStage` 的根是 `display:grid`，我把 `height="100%"` 传给了内层画布盒。
百分比在内容尺寸的 grid 容器里解析为 `auto` → 画布高度塌成 200px，其余舞台全空。
修法：根加 `height:100%; minHeight:0`，百分比才有参照。

#### 2. 星舰实验舱不该在行星下面

它是 12 个工具 tab 的行动面板，放页面底部时占了 46% 高度、把行星挤成一条。
改为 `InfoDrawer` 的第二个 tab（「档案 / 实验舱」），抽屉 440px，3D 独占舞台。
`ExplorationLab` 加 `embedded?: boolean`：去掉 `atlas-hud` 外框与页面边距（卡中卡是这次重设计要消灭的形态）。

#### 3. 3D 参数（**唯一一次跨过「不碰渲染」的线**，用户明确授权）

| 位置 | 改动 | 为什么 |
|---|---|---|
| `Galaxy3DViewer` | **`galaxyType === "Spiral"` → 先 `toLowerCase()` 再比** | **真 bug**：服务端传 `"spiral"`（`__atlas_cache_proxy` 默认小写），四个分支全不匹配，每个星系都掉进兜底分支画几十个散点。这才是「星系只有几个点」的根因 |
| `Galaxy3DViewer` | `renderer.setSize(size,size)` → 容器宽高，`camera.aspect` 同步 | 画布强制正方形，宽舞台里星系只占中间三分之一 |
| `Galaxy3DViewer` | 点 `size: 2 → 3.4`，`opacity .8 → .9` | 衰减后单点不到 1px |
| `RealisticSystemStage` | 相机 `outer * 1.9 → 1.55` | 外圈轨道正好压在画面边缘，恒星是针尖 |
| `SystemLayer.ts` | `STAR_SCALE = 8 → 110` | 真实比例下太阳屏幕半径 1px（0.037 AU vs 外轨 17.7 AU）。纯观感取舍，已在文件内注明 |
| `RealisticPlanetStage` / `RealisticSystemStage` | 移植期仪表（tier/oct/fps/prog、「切回旧渲染」）收进 `?dev=1` | 这些是阶段 3 验收埋点，正式视图里看起来像没做完。速度按钮（实时/1天/1年）保留——那是玩法 |

副作用需知：`STAR_SCALE` 是 `realistic3` vendored 内核的常量，上游更新时要重新对齐（见 `3DComponents/realistic3/VENDOR.md`）。

### P2 · 客户端导航 — ✅ 2026-10-31 完成

1. `navigate()` + 数据缓存 + `pushState`。
2. 替换 38 处 `window.location.href`（保留 `/navigate` 与 `/multiverse/exit`）。
3. 转场覆盖，`back/forward` 可用。
4. 验收：星系→系统→行星连点，**无白屏、无 3D 重载、经济坞常驻**。

落地形态：

| 文件 | 作用 |
|---|---|
| `Shell/viewData.ts` | Document → view。把三个 MountPoint 里各写一遍的数据岛解析搬出来，`parseRoute` / `viewFromDocument` / `syncDataIslands` / `syncDocumentMeta` |
| `Utils/PageNavigation.ts` | `navigate()` / `go()`：fetch → DOMParser → 取数据岛 → emit → `pushState`。12 条 LRU 缓存，`popstate` 同步 |
| `Shell/GameRouter.tsx` | 一棵 React 树按 view.kind 渲染三个 Layout。**不加 `key`**，同层换项复用组件实例 |
| 三个 MountPoint | 从各自 80–90 行降到 20 行，只负责 `viewFromCurrentDocument()` + `render(<GameRouter/>)` |
| `Components/Pagination.tsx` | **删除**，无引用 |

导航边界（照 §3.1）：列表 / 分页 / 层级前后 / 面包屑走 `go()`；`POST /navigate`（坐标跳跃）、`/multiverse/exit`、`/onboarding` 仍是整页加载。`ContractTab` 的 `POST /navigate` 之后也保留整页——session 里的星系变了，缓存必须失效。

#### 两个必须记住的实现细节

**1. `PageNavigation.ts` 在 `Utils/`，不在 `Shell/`。**
`scripts/check_frontend_gates.py` 禁止 `Shell/**` 出现 `fetch(`（数据必须走 ShellProvider）。这个文件 fetch 的是**HTML 文档**不是数据，但它不是壳组件——它是页面导航器。放进 `Shell/` 会让闸门报警，放进 `Utils/` 语义也更准。

**2. `variantCache` 的 abort 不能切断正在进行的 probe。**
`compileProbe` 原来用 `raceAbort(compiled, signal)`：卸载时立即返回，`finally` 里 dispose 探针，而 three 的 `compileAsync` 还在用 `setTimeout` 轮询 `material.isReady()`。结果是从库内部的定时器抛出
`Cannot read properties of undefined (reading 'isReady')`，外面任何 `catch` 都接不住。
现在 `compileProbe` 始终 `await compiled`（signal 只用来在 probe **之间**停止循环），`RealisticPlanetView` 的 cleanup 保存 warming 的 promise，等它 settle 后才 `renderer.dispose()`。
整页刷新时代谢路径不一样，所以这个 bug 一直藏着，P2 才暴露。

#### 代价

三个 Layout 静态 import 进同一个入口，最大 chunk 从 343 KB 涨到 **439 KB（gzip 125 KB）**。可接受，但若之后在意首屏，把 `PlanetLayout` 改成 `React.lazy` 即可——行星页本来就不是首屏。

### P3 · 列表检索 + LevelNav — ✅ 2026-10-31 完成

1. ~~LeftRail 虚拟滚动 + 分页哨兵~~ → 换成 **全星系搜索** + 跳页输入（接口解禁后重做）。
2. `LevelNav` 合并三个 Navigation 组件 → `Shell/LevelStepper.tsx`。
3. 验收：~~50000 系统的星系，左轨滚动 60fps~~ → 换成「79 万系统下搜索 < 100ms」。

落地形态：

| 文件 | 作用 |
|---|---|
| `Shell/RailSearch.tsx` | 轨道顶部搜索框，`⌕ 12/11,038 ×`，`⋯` 表示查询中，Esc 清空 |
| `Shell/RailNote.tsx` | 搜索结果是空 / 不完整时的一行说明（“已扫描全部 N 个” vs “只扫了 68 / 790,140”） |
| `Shell/railFilter.ts` | 行星页仍用本页过滤（行星就那么几颗） |
| `Shell/RailPager.tsx` | 点页码变输入框，回车跳页。74 页不必点 73 次 |
| `Shell/LevelStepper.tsx` | `‹ 137·42·8 │ 相邻星系 │ 137·42·10 ›`。三个 Navigation 只保留业务逻辑，外观统一 |
| **`GET /api/v1/universe/systems`** | 新增：跨整个星系的系统搜索 |

#### 搜索为什么必须是后端

原计划只做本页过滤，因为接口冻结。玩家解禁接口后，真正的方案才成立：一个系统名只是
`generate_name(system_seed + index, "system")`，而 `system_seed` 是种子 + 坐标 + index 的 sha256 ——
**名字可以单独算，不必生成恒星系**（后者要建星体、行星、大气、地表）。

端点按 **流式扫描** 工作，不建全量索引：

| 查询 | 行为 | 实测（793 万系统星系） |
|---|---|---|
| `#4213` | O(1)，直接算那一个名字 | 1 ms |
| 常见词（`nebula coming`） | 凑够 limit 就停 | 73 ms / 扫 2,996 个 |
| 稀有词 | 到 `_SCAN_BUDGET_MS`（600ms）停，返回 `complete: false` | ≤ 600 ms |

早期版本建全量索引：8 千系统时 200ms，**79 万系统时 4.5 秒**，10^11 的星系根本跑不完。
星系是不封顶的（玩家明确要求保留增长），所以索引方案从根上不成立，改成流式 + 时间预算，
并用 `scanned` / `complete` 如实告诉界面它看到了多少。

#### 顺带修掉两个跨进程一致性 bug

接入这个端点时暴露了两个真问题，都不是前端能修的：

**1. `galaxy_type` 用全局 `random.choice`。**
`Universe.get_galaxy` 里星系类型取自进程级 RNG，而 RNG 状态取决于此前所有调用者做过什么。
页面进程和 API 进程因此可能对同一坐标得出**不同的星系类型**，而 `num_systems` 是由类型推出来的。
现在改为 `("Dwarf", "Spiral", "Elliptical")[galaxy_seed % 3]` —— 星系的身份本来就是 sha256，类型属于身份。

**2. 页面走 `CachedGalaxy`，API 走直算。**
页面经 `patch_universe_get_galaxy()` 从 Postgres 读星系的标量（类型、`num_systems`、`base_max`），
API 却在内存里重算。同一个坐标，页面说 11,038 个系统，API 说 793,416，两边都"对"——只是算的不是一件事。
API 现在同样 patch，读同一份缓存。

这两个 bug 在只有页面进程时完全看不出来。**加一个会读同一份世界数据的第二个进程，立刻就现形了。**

### P4 · 收尾 — ✅ 2026-10-31 完成

1. 闸门通过（`check_frontend_gates.py` + `check:render`）。
2. 截图基线 6 张（首页 / FAQ / 多元宇宙 / 引导 / 星系 / 系统 / 行星）。
3. 本文即规范；15 号文档的视觉条款继续有效，16 号负责架构。

API 契约同步：`scripts/gen_api_docs.py` → **239 paths / 255 operations**（原 254）。
新增端点必须重新生成，`--check` 在 CI 里会拦。

### P6 · 循环动画收口（2026-11-01）

闸门里的「42 处」是**源码里 class 字符串的出现次数**，不是运行时。用 `document.getAnimations()`
实测后，真正的持续动画是另一回事：

| 页面 | 加载 3.5s 后 | 稳态（12s 后） |
|---|---|---|
| 首页 | 30 | 26（含 5 个 `fadeIn` 已结束但 `fill: forwards` 残留） |
| 星系 | 25 | **12** |
| 系统 | 24 | **10** |
| 行星 | 24 | **10** |

最大的单一来源不是 Tailwind 的 `animate-*`（全站才 1–3 个），而是**我自己加的 `hud-breathe`：14 个**。
它只在 `ui/EmptyState.tsx` 用了一处，但经济坞每个空面板都渲染一个 `EmptyState`，于是 14 个圆圈相位不同地永远呼吸。

改 `animation: hud-breathe 2.8s ease-in-out 3` —— 播 3 次后停在 `opacity: .55`。空面板不需要一直宣告自己存在。
内页稳态因此从 24 掉到 10。

顺手补齐 `prefers-reduced-motion`：原来只覆盖 `hud-scanbeam` / `hud-lamp` / `atlas-loading-bar`，
现在也停 `atlas-stars`（120s 星空漂移）、`hud-shell-scan`、`atlas-jump-veil`、`atlas-view-fade`。

剩下的 10 个都是**有意义的**：3 个状态灯 `hud-ping`、1 个加载 `spin`、6 个 `hud-boot`（已结束，`fill: both` 残留，不再合成）。

**教训**：以后看到「N 处动画」先量 `getAnimations()`，别拿 grep 计数当运行时事实——两者差了一倍多，而且指向完全不同的地方。

### P5 · 层级返回（2026-10-31 补）

面包屑在顶栏里是 9px 小字，夹在六个其他元素中间，玩家不把它当控件。加了一组真正的按钮：

| 位置 | 内容 |
|---|---|
| 行星页 | `‹ 返回`（回所属恒星系）+ `‹‹ 星系`（直接回星系） |
| 系统页 | `‹ 星系` |

放在 `StageHeading` 的 `leading` 槽（kicker 那一行的最左），因此**不增加行高**——那一行左边本来就是空的。
走 `go()`，和向下钻取一样是零刷新。

#### 顺带修掉抽屉竖条压住 3D 控件

`InfoDrawer` 收起时是钉在舞台右缘的 34px 竖条，它压住了恒星系页右上角的「实时 / 1天/秒 / 1年/秒」。
两处都要改，第一处不是根因：

1. 舞台容器预留 `marginRight: 34`。**必须是 margin 不能是 padding**——绝对定位的子元素相对 *padding box* 解析，
   用 padding 的话按钮会正好落在那 34px 里，等于没让。
2. 速度按钮组自己加 `right: 44`。因为它的 offset parent 是外层舞台盒而不是缩窄后的画布，
   只做第 1 步它仍然贴在竖条底下。这一条是实测出来的，不是推的。

---

## 5. 验收标准

| 项 | 标准 |
|---|---|
| 骨架一致 | 四个页面顶栏、左轨宽度、右坞宽度、底栏高度**完全相同** |
| 切换连续 | 世界内移动零白屏，经济坞不卸载 |
| 无整页跳 | `window.location.href =` 从 39 降到 **6**，且全部是跨应用：`ContractTab`（POST /navigate 之后）、`MultiverseBanner` + `__multiverse__`（退出多元宇宙）、`__onboarding__`、`ShareModal`（mailto） |
| 组件归零 | 游戏页不再引用 `Header` / `VersionFooter` / `Pagination`（三者在 faq / multiverse / onboarding 仍在用，等公共页转壳后一并删） |
| 3D 不退化 | `npm run check:render` / `npm run check:shaders` 通过 |
| 闸门 | `python scripts/check_frontend_gates.py` 全绿 |
| 构建 | `npx tsc --noEmit` 零错误 |
| 搜索跨页 | 左轨搜索命中**全星系**任意系统（不止当前 150 行）；`#4213` 直达；79 万系统下 ≤ 100ms |
| 世界一致 | 页面与 API 对同一坐标报出相同的 `galaxy_type` / `num_systems` |

---

## 6. 实现约束（P0/P1 踩过的坑，别回退）

这五条都是「看起来能简化、一改就崩」的地方，每一条都实际导致过一次整页渲染错乱：

| 位置 | 约束 | 不改会怎样 |
|---|---|---|
| `GameFrame` 根 | **`height: 100vh` + `overflow: hidden`**，不能用 `minHeight` | 高度不确定 → 150 行左轨撑高整个文档 → stage 被拉伸到 4500px，内容浮在巨大空白里 |
| rail `<aside>` | `min-height: 0` | flex item 默认 `min-height: auto` 拒绝小于内容高度，同样撑高整页 |
| stage `<main>` | `min-height: 0` | 同上，且会覆盖掉 `overflow: auto` |
| `StageHeading` | **flex column，不能用 grid** | 作为 stage 的 grid 子项时，隐式 `auto` 行会把它拉到与兄弟同高，子元素再在 2000px 里居中 |
| 顶栏各段 | 面包屑 `flex: 0 1 auto` + 其它段 `flexShrink: 0` | 长名称把徽章和链接挤到下一条行，54px 的条变成 70px 并错位 |

一句话：**这个壳是「固定高度的容器 + 各自滚动的区域」，不是「会变长的 page」。**
任何让容器高度回到 `auto` 的改动都会退回文档流。

---

## 7. 风险

| 风险 | 说明 | 对策 |
|---|---|---|
| session 依赖 | 直接打开 `/system/5` 而 session 无 galaxy → 后端 redirect `/`。客户端导航不解决这个 | 保持现有 redirect，客户端捕获后回首页并提示 |
| WebGL context 泄漏 | 反复切层未 dispose → context lost | 切层强制 dispose，P2 加运行时计数断言 |
| 列表规模 | 单星系可达 5 万系统 | 必须虚拟滚动，不能一次渲染 |
| 完整 HTML 传输 | PJAX-lite 每次拉整页 HTML | 缓存 + 二期 `X-Atlas-View` 头 |
| 构建陷阱 | manifest 只在进程启动时读 | 每次 `vite build` 后**重启 Flask** |
| 冻结区越界 | 容易被「顺手优化」 | 3D 目录只允许包裹，不改 props/相机/shader |

---

## 8. 不做的事

- 不换框架、不引路由库（继续手写 `navigate`，60 行够用）。
- 不动 `/api/v1`、不动 3D 渲染内核。
- 不做暗/亮双主题。
- 不重写 `HomeScreen` 的交互逻辑，只换容器。
- 不追求「全屏 3D + 无 UI」那种极端沉浸——信息密度要保住，经济系统是玩法核心。
