# 09 · Amber Cockpit（2026-10-30 全站换肤）

> **已被取代**：视觉条款（色彩、发光、形状、动效）由 [15-game-hud.md](15-game-hud.md) 覆盖。
> 本文保留的是当天的改动记录与**结构**部分（密度、HUD 框架、图标单色源、截图工具）。

> 触发：用户明确要求「把之前的前端全部改了，不用原本的风格，UI 与界面也不用原本的」，
> 并纠正方向 —— **这是游戏**，不是金融终端。于是没有走「纸面报表 / 瑞士极简」那一路，
> 走的是**座舱仪表**：冷金属 + 琥珀灯。

---

## 1. 身份（一条线说完）

> **机加工的冷灰金属，配一盏琥珀色的仪表灯。不是深空霓虹玻璃。**

四条约束，后面所有文件都必须遵守：

| 约束 | 含义 | 反面（旧主题） |
|---|---|---|
| **不玻璃** | 面是实色板；`backdrop-filter` 在业务 UI 里清零 | `bg-black/90 backdrop-blur-xl` |
| **不发光** | 强调靠 1px 琥珀发丝线或实色块，不靠 bloom | `shadow-[0_0_20px_#3ddcff]` |
| **切角不是胶囊** | 面板/按钮切角（`--atlas-chamfer`），圆角 ≤4px | `rounded-2xl` 半透明卡片 |
| **数字等宽** | 一切可数的东西走 `--atlas-mono` + tabular | 混排比例字体 |

配套的三条派生规则：

- **冷中性 + 暖光**：中性灰是**冷**的（`#12151b…`），琥珀是唯一暖色。暖灰叠在琥珀光下会变成泥色 —— 这是本轮返工一次的教训。
- **涨红跌绿**：中国市场惯例，`--atlas-up` 红 / `--atlas-down` 绿，不许"修正"。
- **仪表标签**：小号、大写、宽字距、等宽。`.atlas-label` / `.atlas-display` / `.atlas-tabular` 三个类覆盖 90% 的场合。

---

## 2. 机制：为什么改的不是 358 个文件

树里散着 **500+ 处 Tailwind 颜色工具类**（`text-gray-400` 183 次、`red-500` 72 次、
`blue-500` 68 次……）。逐个文件改是几个月的活，而且改完就无法 review。

真正决定观感的是**调色板本身**，所以本轮把 `tailwind.config.js` 的家族**按语义重映射**：

| 家族（语义） | 旧色 | 新色 | 说明 |
|---|---|---|---|
| `blue` / `indigo` / `sky` | 蓝紫 | **琥珀金** | 主强调色 |
| `purple` / `violet` / `fuchsia` / `pink` | 紫红 | **铜锈** | 次级强调 |
| `cyan` / `teal` | 青 | **香槟** | 只读/元信息 |
| `green` / `emerald` | 荧光绿 | **玉** | 正/跌 |
| `red` / `rose` | 荧光红 | **绯** | 负/涨/危险 |
| `gray` / `slate` | 冷灰 | **冷灰（重定标）** | 面与文字 |
| `orange` / `yellow` / `amber` | — | 余烬 / 金 | 警示与高亮 |

再加 `line` / `plate` / `plate-2` / `void` / `signal` 五个语义快捷色，
让新写的标记可以写 `bg-plate border-line` 而不是记十六进制。

这一步让**整站同时换色**，且保留了每个家族的语义（`green` 还是"正"），
所以逻辑上"红涨绿跌"之类的东西不会被打乱。

---

## 3. 结构性重写（不只是换色）

| 位置 | 变化 |
|---|---|
| `css/tokens.css` | 全量重写：冷灰面、琥珀信号、切角变量、`.atlas-page` / `.atlas-chamfer` / `.atlas-grid` / `.atlas-scanlines` / `.atlas-label` / `.atlas-display` |
| `css/global.css` | 重写：body 光晕降到 4.5%、滚动条/滑杆/进度条换成发丝金属、`h1–h4` 走 display 字面 |
| `css/components.css` | nprogress、采矿特效、三轴滑杆全部换琥珀/铜/香槟 |
| `Shell/TopRail` | 52 → 44px 指令条：顶部 2px 琥珀线、`ATLAS` 宽字距、`DAY 000` 等宽 |
| `Shell/NavRail` | 菜单 → **分区索引**：两位序号 + 大写标签 + 选中行左侧琥珀栏 |
| `Shell/StatusBar` | 徽章 → **账簿页脚**：标签暗等宽、数值亮等宽、发丝分隔 |
| `Shell/AtlasShell` | 启动器改切角芯片；工作区背景 48px 仪表网格 |
| `ui/Button` | 方形、大写、字距 0.1em；primary = 实色琥珀 + 石墨字 |
| `ui/Panel` | 切角板 + 「琥珀刻度 + 大写 mono 标题」标题栏 |
| `ui/Badge` / `ui/Tabs` / `ui/Switch` | 去圆角，选中/激活靠实色块与底边琥珀 |
| `ui/Modal` | `.surface-overlay` 不再模糊：实色板 + 切角 + 顶部琥珀边 |
| `Components/Header` | 方形灰度 logo + 琥珀竖条 + `ATLAS` / 阿特拉斯双行名plate |
| `Components/CoordinateSelector` | 坐标卡：实色板 + 顶边轴色、`X-AXIS` 等宽标签、方形滑杆、实色琥珀「初始化跳跃」+ 描边铜「随机位置」 |
| `Layouts/*`（8 页） | 页面根渐变 `from-slate-900 via-purple-900` → `.atlas-page`（石墨 + 48px 网格 + 顶部微光）；14 处渐变文字标题 → 实色白 / 琥珀等宽数字 |
| 全站 | 清除装饰性 `backdrop-blur`：计入约束 **12 → 2**（总量 21 → 11） |

---

## 4. 验收

```bash
npx tsc --noEmit                                    # 0 错
node tools/frontend_smoke.mjs                       # 34/34
npx vite build                                     # 通过
python scripts/check_frontend_gates.py              # 6 项通过
# backdrop-blur 11 处，计入约束 2（上限 12）；循环动画 50 / 排除 3D 48
```

截图基线：`D:\mni\.workbuddy\shots2\`（`A-home` / `A-faq` / `multi5` / `onb5`）。

**注意**：`dist` 是构建产物且服务端在启动时读一次 `.vite/manifest.json`。
换完样式必须 `rd /s /q atlas-ui\react\dist` → `npx vite build` → **重启服务**，
否则页面会加载旧哈希的 JS 而白屏（本轮踩过）。

---

## 5. 第二轮：密度 / HUD / 图标（2026-10-30 同日）

第一轮是"换色 + 换形"，第二轮补的是**节奏**——同样是换了皮，行高列宽仍是旧金融表格，
游戏页仍是圆角卡片堆，图标还挂着旧配色的十六进制。

### 5.1 经济面板密度（`ui/Table` + `ui/Panel`）

| 项 | 旧 | 新 |
|---|---|---|
| 行内边距 | `7px 8px` | `3px 8px 4px`（行高 ≈26px） |
| 表头 | 11px 灰字，无背景 | 10px **等宽**、字距 .14em、`sticky` + `--atlas-plate` 底 |
| 行分隔 | 每格 1px | 1px `line/0.7` + 偶数行 1.3% 洗色 + hover 板色 |
| 数字 | 比例字体 | 右对齐列强制 `tabular-nums` |
| 面板内距 | 12 / 12 | `10px 12px 12px`、gap 10 |
| 外壳内容区 | 16 | 12 |

结论：一屏能多放 3–4 行，扫描靠斑马纹与等宽对齐而不是网格线。

### 5.2 行星 / 系统 / 星系页 HUD

- 新增 `.atlas-hud`：实色 `--atlas-plate` + 内描边发丝线 + **顶部 1px 琥珀** + 切角。
  一条类替换掉全仓 16 处 `bg-white/5 rounded-2xl border border-white/10 shadow-2xl`。
- 三页页头统一成 HUD 头：`kicker（琥珀小字 + 两侧短线）` → 实色标题 → 等宽面包屑（发丝竖线分隔），
  标题从 3xl–5xl 降到 2xl–4xl，把版面还给正文。
- 删掉行星页那层白色点阵 overlay（`opacity-20` 的旧装饰）。
- 全仓 `rounded-2xl` / `rounded-xl` 清零。

### 5.3 图标配色

- 新增 **`Icons/palette.ts`** 作为唯一色源：`RESOURCE_COLOR`（反物质琥珀 / 115 香槟 / 氘铜）
  + `ICON_ACCENT`。SVG 本身一律默认 `currentColor`，不再散落十六进制。
- 调用点全部改走 palette（坐标控件、收集按钮、三页面包屑）。
- 燃料条重做：去掉 `glow`（`box-shadow: 0 0 20px`）与 `gradient` —— 6px 的条本来就显示不出渐变，
  十二条同时发光是整页最响的东西。改为**平色填充 + 发丝轨 + 等宽数字**，只保留 `LOW` 文字提示。
  三个 `animate-pulse` 与 `animate-shimmer` 一并删除（循环动画 50 → 45）。
- 顺带清掉 `AreciboModal` 的紫蓝 drop-shadow、`LocationBookmarks` 手写 DOM 弹窗的 slate 渐变、
  两个 dev lab（PlanetLab / SystemLab）与调试面板的旧十六进制。

### 5.4 截图工具（这轮补的基础设施）

三页游戏界面和六个经济面板**之前从未被像素验证过**：`/galaxy`、`/system/<n>`、`/planet/<name>`
必须先 `POST /navigate` 写 Flask session，而 `msedge --screenshot` 注不进 cookie；
把 HTML 落地再加载又会被 ES module 的跨源规则拦死。

新增 **`tools/shot.mjs`**（`npm run shot`）：

- 用 `playwright-core` + **系统已装的 Edge**（`channel: "msedge"`），不下载浏览器内核，只装驱动（1 包）。
- 会话走玩家同一条路：`context.request.post("/navigate", { form: { x,y,z,system } })`，
  请求上下文与页面共享 cookie。
- 行星名不猜：从服务端内嵌的 `#system-data` JSON 取第一颗行星，
  因为 `PlanetNavigation` 用 `window.location` 跳转，DOM 里没有 `<a href>` 可读。
- 单张失败只记 `[err]`/`[skip]`，不中断整批。

```bash
npm run shot -- --only game           # /galaxy /system/1 /planet/<seed 行星>
npm run shot -- --only panel          # 六个经济面板（#assets #bank #market #company #legal #log）
npm run shot -- --only public         # / /universe-faq /multiverse /onboarding
```

产物：`D:/mni/.workbuddy/shots3/01…13-*.png`。

**这一轮据此修掉的真实问题**（都是"tsc 通过但看起来是错的"）：

1. `NavRail` 132px 装不下「标签 + 提示」，中文挤成两行、断在字中间 → 改 148px，
   标签与提示分成两行、`nowrap + ellipsis`，提示分隔符从 ` / ` 换成 `·`。
2. 面板里 8 条「请先登录后操作」用告警红重复刷屏 → 新增 `panels/_shared/Notice.tsx`：
   全部是游客哨兵时收成一行「游客模式 · 登录后可读写全部经济功能」（琥珀色），
   有真错误时分开列、并标「另 N 项需登录」。
3. `bg-white/10` 在暖光背景上变成脏棕色（信息面板的字段块）→ 31 个文件统一改实色 `bg-plate-2`，
   3D viewer 类改保留半透。

### 5.5 第三轮：字体 / 渐变 / 行节奏（2026-10-30）

**5.5.1 自托管 condensed 字体**

- `static/fonts/barlow-condensed-{500,600}.woff2`（latin 子集，21 KB / 22 KB，**SIL OFL 1.1** 可随仓库分发）。
- `tokens.css` 里两个 `@font-face` 用相对 `url()` 引用，Vite 会把它发到 `dist/` 并加内容哈希 ——
  不需要额外静态路由（`/static/*` 只白名单了 favicon 之类）。
- `--atlas-display` 变成 `"Barlow Condensed", "Bahnschrift", "Arial Narrow", "Noto Sans SC", …`：
  中文仍然走系统字体（不做 4 MB 的 CJK webfont），拉丁/数字在所有平台一致。
  验证：星系页标题宽度明显收窄，Windows 上不再依赖 Bahnschrift。

**5.5.2 渐变清零**

- 78 处 `bg-gradient-to-*` 用一条正则按语义降级：`bg-gradient-to-r from-A to-B` → `bg-A` +
  `hover:bg-B`（保留悬停反馈）。剩下的 `from-transparent` 扫描光带（扫描线、星际门光泽）
  是功能性的，保留 4 处。
- 坐标卡那层 `from-white via-transparent to-white **blur-sm**` 的高光带删掉（既是渐变又是模糊）。

**5.5.3 面板行节奏**

- 删掉 **`ui/bits.tsx`（186 行，全仓 0 引用）** —— 它的 `Th`/`Td` 是最后一处没跟上 26px 的表格实现，
  每次改 `ui/Table` 都要同步它，实际上没有任何文件 import。
- 新增 `.atlas-kv` / `.atlas-kv-label`：22px 行高（基线对齐）、发丝分隔、标签等宽小字，
  与 `ui/Table` 同一节奏。面板里 4 个文件的 12 处手写「标签—数值」行改成它。

## 6. 「点了没反应」：三个叠加的静默失败（2026-10-30）

玩家反馈：星系页的 `‹ ›` 切换点了没反应。用 `playwright` 逐步插桩（记录 toast、
`atlas:login-required` 次数、`[role=dialog]`、网络请求、控制台），确认不是按钮没绑事件，
而是**三条路径各自静默**，叠起来就等于"死键"：

| # | 层 | 症状 | 根因 | 修法 |
|---|---|---|---|---|
| 1 | `ui/Toast` | 失败时连提示都没有 | `toast()` 先 `createRoot().render()` 再 `dispatchEvent`，而 React 的 render 是**异步**的 → host 的监听器还没注册，**每页第一次 toast 必丢** | 加模块级 `pending` 队列；`toast()` 先入队再派发；`ToastHost` 挂载时 `drainPending()`，事件路径把同 id 从队列移除 |
| 2 | `ServerAuthPanel` | 游客点击连登录框都不弹 | 面板只在 `__main__` 声明式渲染；`/galaxy`、`/system/<n>`、`/planet/<name>` 上没有监听者，`atlas:login-required` 发出去没人接 | 新增 `ensureAuthPanel()`（自挂载，同 `ensureEconomyShell()` 模式），三个游戏页 MountPoint 各调一次 |
| 3 | CORS | 已登录也失败，控制台 `Failed to fetch` | UI 在 `:8080`，API 在 `:8000`，`.env.server` 的 `ATLAS_CORS_ORIGINS` 只放了 `6424/5173` | `.env.server` 加 `http://127.0.0.1:8080,http://localhost:8080`（本地环境文件，非代码） |

另外给 `GalaxyNavigation` 补了忙碌态：点击后按钮变 `跳跃中…` 并禁用，`finally` 复位——
慢请求也不会再像没点。

`SpaceshipTravelManager.chargeTravel` 现在会解释失败：`燃料不足：本次跳跃需要 25 AM / 20 E115 / 15 D`
或 `航行被拒绝：<服务端 detail>`。它同时覆盖全部 6 个航行调用点（galaxy ×2 / planet ×4）。

**实测**：登录 + 充燃料后点击右箭头，页面标题从 `Galaxy: Epsilontron CH-4411` 变为
`Galaxy: Vesperagrix WE-1122`；游客点击则弹出登录框并提示「航行被拒绝：请先登录后操作」。

### 6.1 还没做

1. 面板内的横排 chip（`ui/Status`、资源图标）间距仍是各面板自己定的，未抽公共行。
2. 自托管字体只到 latin 子集；若将来要统一中文标题，需要另一个子集策略（体积会大一个数量级）。
