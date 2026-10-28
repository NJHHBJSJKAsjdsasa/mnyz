# 03 · 页面规格

> 8 个页面逐页规格。每页给：目标 / 栅格 / 区块 / 交互 / 冻结项 / 删除项。
> 所有页面共用 [02](02-shell-and-ia.md) 的 `AtlasShell`，本文件不再重复外壳部分。

---

## 通用：星尘底（替代渐变背景）

现状每个 Layout 都写一遍：

```tsx
<div className="w-full min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `url("data:image/svg+xml,...")` }} />
```

问题：紫蓝渐变在深色屏上产生明显色带（banding），且与 3D 场景的背景不融合。

新方案（`AtlasShell` 统一提供，页面内不再写）：

```css
.starfield-bg {
  background-color: var(--n-0);
  background-image:
    radial-gradient(1200px 600px at 50% -10%, rgba(61, 220, 255, 0.05), transparent 70%),
    radial-gradient(800px 400px at 85% 110%, rgba(139, 124, 255, 0.04), transparent 70%);
  background-repeat: no-repeat;
}
```

加一层**静态**细噪点（纯 CSS `radial-gradient` 网格，或 1 张 4×4 px 的 base64 PNG repeat），
`opacity: .03`。**不用 canvas，不用动画**。目的只是避免纯色死黑，不再抢戏。

---

## 1. `/` 导航控制台（`__main__.tsx`）

### 现状问题

居中大标题 + 一段说明 + 中央 96×96（`w-96 h-96`）的坐标 3D + 下方整宽玻璃卡（坐标选择器），
页面下半部分大面积留白；宇宙种子/年龄等信息挤在标题下方，与"我现在要做什么"无关。

### 目标

从"落地页"改为"驾驶舱"：**一屏内完成「我在哪 → 我要去哪 → 要花多少 → 是否够」**。

### 栅格（≥1024px，12 列）

```
┌─────────────────────── Content (12col) ─────────────────────────┐
│ row1: 页面标题区（h1 + 坐标面包屑）              col 1-8          │
│ row2: ┌─ 坐标矩阵 8col ────┐ ┌─ 航行简报 4col ──┐                │
│       │ CoordinateViewer3D │ │ 距离 / ETA / 消耗 │                │
│       │ （冻结，原样嵌入）  │ │ 燃料是否足够      │                │
│       │ 400×400            │ │ [启程] 主按钮     │                │
│       └────────────────────┘ └───────────────────┘                │
│ row3: ┌─ 坐标输入 8col ────────────────────────┐                  │
│       │ X / Y / Z 三个数字输入 + 随机 + 书签     │                  │
│       └─────────────────────────────────────────┘                 │
│ row4: ┌─ 最近访问 4col ─┐ ┌─ 宇宙参数 8col ────┐                  │
│       │ 5 条快捷卡片     │ │ 种子/纪元/年龄（表格）│                │
└───────────────────────────────────────────────────────────────────┘
```

移动端：单列，顺序 `标题 → 坐标矩阵(280×280) → 航行简报 → 坐标输入 → 宇宙参数`。

### 区块规格

| 区块 | 内容 | 交互 |
|---|---|---|
| 标题区 | `display` 字号 **`ATLAS`**（英文 mono，`tracking-[0.2em]`）+ `h2` 中文"宇宙导航"。**不做渐变文字** | — |
| 坐标矩阵 | `CoordinateViewer3D` 原样嵌入，容器 400×400 `.surface-plate` + `.plate-ticks` | **保留现状行为**：输入坐标即预览，4s 无交互回退到文字态 |
| 航行简报 | 3 行数据：距离（`AU`/单位）、预计耗时、消耗（反物质/115/氘 三个 mono 值） | 消耗不足项标 `danger`，主按钮 `disabled` |
| 主按钮 | "启程" `signal` 实心，宽 100% | 点击走现状 `SpaceshipTravelManager.executeTravel` + form POST `/navigate`（逻辑不动） |
| 坐标输入 | 3 个 input（mono，`text-h2` 字号便于读数），步进 ±1000 按钮，`随机` `书签` `复位` 三个次操作 | 输入即时反映到 3D 与简报，**去掉 700ms 交叉淡入淡出**（现状标题/3D 互斥切换，切换时整页跳动） |
| 最近访问 | 5 条（`VisitHistory` 已有数据） | 点击填入坐标 |
| 宇宙参数 | 表格 4 行：种子 / 比特大爆炸时间 / 宇宙年龄 / 宇宙发展度。**用 `<dl>` 表格，不用图标 + 文字混排** | 数值 `font-mono`，每秒 tick 只更新"年龄"单元格的文本节点（不 re-render 整表） |

### 关键改动

1. **标题与 3D 不再互斥**。现状二者绝对定位叠加、互斥淡入淡出（`showNavigationText` / `show3DViewer`），
   导致页面高度抖动、用户输入时标题消失很突兀。新方案：标题常驻，3D 常驻，只有"简报"随输入更新。
2. **宇宙参数据降级**。现状把种子/纪元/年龄/发展度用 4 个彩色图标 + 大号字放在标题正下方（视觉重心错位）。
   新方案移到页面底部右侧的表格，`text-small`。
3. **删除** `MultiverseBanner`（滚动横幅）在导航页的出现，改为 TopRail 的 `aurora` 徽章。
4. **保留** `StarfieldWarpReveal` 但改为**可跳过 + 只播一次 + 不阻塞首屏**（见 [04 §6](04-motion-system.md)）。

### 冻结项

`CoordinateViewer3D`（302 行）及其内部 Three.js 场景 —— **只改外层容器尺寸与背景**。

---

## 2. `/galaxy[/<page>]`（`__galaxy__.tsx`）

### 目标

星图是"选择去哪"的界面，不是展示页。

### 栅格（≥1024px）

```
┌─ 星图 7col ─────────────────────────┐ ┌─ 星系列表 5col ────────┐
│ Galaxy3DViewer（冻结，h: 520）       │ │ 搜索框                  │
│ 右上角：视图切换（3D/列表/全屏）      │ │ 分页列表（每项一行）     │
│                                      │ │ 名称 · 坐标 · 行星数    │
└──────────────────────────────────────┘ │ [进入] ← 行内主操作     │
                                         └────────────────────────┘
```

移动端：3D 视图 320 高，列表在下。

### 交互

- 列表行 hover → 3D 视图中对应星系高亮（**不改 3D 内部**，仅通过现有 props 传选中坐标；若组件不支持则该交互降级为 hover 行高亮）。
- 点击行 → `POST /navigate`（现状表单提交，保留）。
- 分页：`Pagination` 组件重写为 `text-small` mono + 首尾/上下页按钮，不用页码按钮堆。

### 删除

- 现状页面的渐变大标题。
- 全屏 3D 查看器入口保留，但**移到 TopRail 右侧图标**，不再在页面里放一个巨大的按钮。

### 冻结项

`Galaxy3DViewer`（1,451 行）、`Galaxy3DViewerFullscreen`（1,194 行）、`GalaxyVisualization`。

---

## 3. `/system/<index>`（`__system__.tsx`）

### 目标

看清"这个恒星系里有什么、哪颗值得去"。

### 栅格（≥1024px）

```
┌─ 轨道视图 8col ─────────────────────┐ ┌─ 行星列表 4col ─────────┐
│ SolarSystem3DViewer（冻结，h: 480）  │ │ 恒星系名 + 索引          │
│                                      │ │ 行星卡 × N（可滚动）      │
│                                      │ │ ┌──────────────────┐   │
│                                      │ │ │ ● 行星名          │   │
│                                      │ │ │ 类型 · 温度 · 元素 │   │
│                                      │ │ │ [进入] [详情]     │   │
└──────────────────────────────────────┘ └────────────────────┘
```

### 行星卡规格

- 高度 72px，`surface-raised`，左侧 8px 圆点（颜色按 `planet_type` 映射，见下表）。
- 主行：行星名（`h3`）+ 类型徽章（`text-micro`）。
- 次行：`温度 288K · 重力 1.02g · 元素 4`（`text-small` `text-n-800`，mono 数值）。
- 右侧：`进入 →`（`signal` 文字按钮）。
- hover：`bg-n-400`，不位移。

**行星类型色映射**（唯一来源，禁止组件内硬编码）：

| 类型 | token |
|---|---|
| 类地 / 海洋 | `down` |
| 沙漠 / 干旱 | `relic` |
| 冰 / 苔原 | `info` |
| 火山 / 岩浆 | `up` |
| 气态 / 冰巨星 | `aurora` |
| 其他 | `n-700` |

### 冻结项

`SolarSystem3DViewer`（630）、`SolarSystem3DViewerLeft`（824）、`SolarSystem3DViewerFullscreen`（415）。

---

## 4. `/planet/<name>`（`__planet__.tsx`）— 主战场

### 目标

行星本身是主角（3D 保留），**它周围的信息要能支撑"经营"决策**。
现状是上 400px 3D + 右 535 行 `PlanetInfo` + 下方 12 标签实验舱。

### 栅格（≥1280px）

```
┌─ Header 区（h1 行星名 + 一行元信息 + 产权链接）──────────────────┐
├─ 左 5col ──────────────────┐ ┌─ 右 7col ───────────────────────┐
│ ┌ 行星 3D 400×400 ───────┐ │ │ 概览卡（6 格仪表）               │
│ │ ModularPlanetRenderer  │ │ │ 直径/重力/温度/大气/自转/公转     │
│ │ （冻结，原样）          │ │ ├────────────────────────────────┤
│ └────────────────────────┘ │ │ 实验舱（4 组 × N 子标签）        │
│ 快捷操作条（4 个图标按钮）   │ │ ┌────────────────────────────┐ │
│ 卫星/光环选择列表           │ │ │ 组 Tab: 观测 经营 组织 治理  │ │
│                            │ │ │ 子 Tab: ...                 │ │
│                            │ │ │ 内容区（原 12 个 Tab 组件）  │ │
│                            │ │ └────────────────────────────┘ │
└────────────────────────────┴─┴────────────────────────────────┘
```

`1024–1279`：上下堆叠（3D 在上 360 高，概览在中间，实验舱在下）。
`< 768`：3D 320 高全宽，概览折叠成 2×3 网格，实验舱子标签横向滚动。

### 区块规格

| 区块 | 规格 |
|---|---|
| Header | `h1` 行星名（`replace(/_/g," ")`），第二行 `text-small text-n-800`：`恒星系 › 星系 › 坐标`，右侧"产权：未登记 / 已登记"徽章 → 跳 `#/legal?tab=property` |
| 3D 容器 | `.surface-plate` + `aspect-square` + `max-w-[400px]`，**去掉 `border-2 border-blue-400/30`** 与 `bg-black`（改 `bg-n-200`）。保留下载/全屏两个图标按钮，移到容器右上角，hover 才显 |
| 快捷操作条 | 4 个：`采集`（主，`signal`）、`扫描`、`存为书签`、`分享`。图标 + `text-micro` 竖排 |
| 卫星列表 | 仅在 `selectedMoon` 存在时出现，`surface-raised` 内 2 列网格 |
| 概览卡 | 6 格：直径 / 质量 / 重力 / 表面温度 / 大气 / 自转周期。每格 = `text-micro` 标签 + `text-h3` mono 值 + 单位。**网格用 `divide-x divide-white/6` 而非 6 个独立卡片** |
| 实验舱 | 见 [02 §3.2](02-shell-and-ia.md) |

### 关键改动

1. 现状 `PlanetInfo`（535 行）把"物理参数 + 效果开关 + 卫星 + 采集按钮 + 一堆说明"混在一个长列。
   新方案：**拆成 3 个组件** —— `PlanetOverview`（6 格仪表）、`PlanetEffectsControl`（调试用，默认隐藏，
   由 `debugConfig.ENABLE_EFFECTS_CONTROL` 控制，现状已有此开关）、`PlanetActions`（采集/书签/分享）。
2. 现状 `PlanetVisualizationUniversal` 里 `<h3>Planet Visualization</h3>` 英文标题与下方 "Gateway to the stars"
   与全站中文不一致，删除。
3. 现状"← 返回系统"按钮是一个整宽灰渐变块，占 100+px 高。改为 **TopRail 面包屑**的"恒星系"可点。
   页面底部不再放返回按钮。

### 冻结项（严格）

`PlanetVisualizationUniversal` 的**内部 3D 分支**必须原样保留：
`AdaptivePreloadCanvas` → `ModularPlanetRendererWrapper` → `ModularPlanetRenderer` 的挂载顺序、
`canvasHidden` / `decelerateRef` / `imageLoaded` 三个状态的时序、
`planetRendererRef` 的 `captureScreenshot` / `toggleEffect` 接口。

**允许的改动**：外层 `div` 的 className（尺寸/边框/圆角）、标题文字删除、按钮位置调整。
**禁止的改动**：任何 `useEffect` 里的 `setTimeout(800)`、`ModularPlanetRendererWrapper` 的 props、`planet` 对象字段。

---

## 5. `/multiverse`（`__multiverse__.tsx`，626 行）

### 目标

节点选择器。现状是全屏 `MultiverseTransitionCanvas`（985 行）叠加 + 节点卡列表。

### 规格

```
┌─ 页头：h1 多元宇宙 + 说明（1 行）──────────────────────────────┐
├─ 节点网格（auto-fill minmax(280px,1fr)，gap 24）──────────────┤
│ ┌ 节点卡 ─────────────────┐ ┌ 节点卡 ────────────────┐        │
│ │ 节点 ID（mono, 可截断）  │ │                        │        │
│ │ 状态徽章：在线/离线/同步中│ │                        │        │
│ │ 延迟 42ms · 玩家 3       │ │                        │        │
│ │ [进入探索]               │ │                        │        │
│ └─────────────────────────┘ └────────────────────────┘        │
├─ 页脚：本节点信息（表格）──────────────────────────────────────┤
```

- 节点状态色：在线 `down`、同步中 `warn`、离线 `n-600`。
- `MultiverseTransitionCanvas` **只保留跳转时的 800ms 过渡**（点击"进入探索"触发一次），
  **不在页面静止时作为背景常驻运行**（现状是全屏 canvas 持续渲染）。
- `aurora` 色只在此页大面积使用。

### 冻结项

`MultiverseTransitionCanvas`（985）、`MultiverseBanner`（186）、`useMultiverseGlitch`（文本故障效果）。
`useMultiverseGlitch` 的**触发时机**改为"仅在远程宇宙 + 状态变化时播 400ms"，不再常驻抖动。

---

## 6. `/universe-faq`（`__faq__.tsx`，560 行）

### 目标

可读的长文档页。

### 规格

- 两栏：左侧固定目录（sticky，240px，`text-small`，当前章节左侧 2px `signal`），右侧正文 `max-width: 72ch`。
- 正文排版（新增 `prose-atlas` 类，不引入 `@tailwindcss/typography`）：
  - `h2` → `text-h2` + 上间距 48px
  - `p` → `text-body` + `text-n-900` + 下间距 16px
  - `code` → mono `n-200` 底 + `rounded-instrument` + 12px/6px padding
  - `table` → 发丝边框，表头 `text-micro` 大写，单元格 `text-small`
  - `blockquote` → 左侧 2px `signal-line`
- 顶部搜索框（客户端过滤标题，`scrollIntoView`）。
- 移动端：目录折叠为"本页目录"下拉。

### 删除

现状的玻璃卡片包裹每段、彩色图标小节标题。

---

## 7. `/onboarding`（`__onboarding__.tsx`，231 行）

### 目标

三步走完，不吓人。

### 规格

```
┌─ 居中卡 480px（.surface-plate + .plate-ticks）──────────┐
│ 步骤指示：① ── ② ── ③   （2px 线 + 圆点，当前 signal）  │
│                                                        │
│ 步骤 1  命名宇宙（输入 + 随机建议）                       │
│ 步骤 2  选择起始星系（3 张卡：均衡/富矿/边疆）             │
│ 步骤 3  确认（参数表格 + 警告）                          │
│                                                        │
│ [上一步]                              [下一步 / 开始]    │
└────────────────────────────────────────────────────────┘
```

- 步骤切换：`slide-up-4` 8px + fade 160ms，方向按前进/后退取反。
- 表单校验内联显示（`danger` 2px 左条 + 字段下方 `text-small`）。
- **不渲染任何 3D**，此页为纯表单，首屏极轻。

---

## 8. `/error`（`__error__.tsx`）

- 居中：错误码（`display` mono + `danger`）、一句人话、一个"返回导航"主按钮、可折叠技术详情。
- 现状无错误码概念，只有一段英文与堆栈。新方案：`code` 从 `message` 里提取（若有），否则显示通用文案。

---

## 9. 响应式总表

| 页面 | ≥1440 | 1024–1439 | 768–1023 | <768 |
|---|---|---|---|---|
| `/` | 8+4 双栏 | 8+4 | 单列，3D 320 | 单列，3D 280 |
| `/galaxy` | 7+5 | 7+5 | 上下堆叠 | 单列 |
| `/system` | 8+4 | 8+4 | 上下堆叠 | 单列 |
| `/planet` | 5+7 | 上下堆叠 | 上下堆叠 | 单列，子标签横滚 |
| `/multiverse` | 4 列 | 3 列 | 2 列 | 1 列 |
| `/universe-faq` | 目录+正文 | 目录+正文 | 单列 | 单列 |
| `/onboarding` | 居中 480 | 居中 480 | 居中 480 | 全宽 -32 |

---

## 10. 验收（本文件）

- [ ] 每页滚动到任意位置，TopRail/NavRail/StatusBar 不重叠内容
- [ ] 行星页 3D 容器在 375 / 768 / 1024 / 1440 四档下均不溢出、不失真
- [ ] 行星页 3D 渲染进程在打开任意经济面板后**仍持续运行**（不黑屏、不重载纹理）
- [ ] 所有页面无整屏渐变背景
- [ ] 每页都有明确 empty / error / loading 三态
