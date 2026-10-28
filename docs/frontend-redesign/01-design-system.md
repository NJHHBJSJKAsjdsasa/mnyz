# 01 · 设计系统

> 目标：把「组件各自发明样式」变成「组件只能从 token 里取」。
> 落地物：`tailwind.config.js`（重写 `theme.extend`）+ `css/tokens.css`（新增，CSS 自定义属性）+ `css/global.css`（腰斩）。
> 本文所有色值/尺寸均为**最终定稿**，前端按此实现，不再二次决策。

---

## 1. 设计原则

| 原则 | 具体含义 | 反例（现状） |
|---|---|---|
| **一个信号色** | 全站只有一个品牌色 `signal`，其余颜色全部带语义 | 标题用蓝→紫→粉三色渐变 |
| **材质分层** | 三种表面材质，语义固定，不允许混用 | 所有卡片都是 `bg-white/5 backdrop-blur-lg` |
| **数字优先** | 一切数值用等宽字体，右对齐，定宽 | 资源数用 `text-xs font-bold` 无对齐 |
| **发丝而非阴影** | 用 1px 半透明线条建立层级，不用大阴影 | `shadow-2xl` × 29 处 |
| **状态可见** | hover / focus / active / disabled / loading / empty / error 七态齐备 | 多数按钮只有 hover |

---

## 2. 色彩

### 2.1 中性色阶（12 阶，唯一灰源）

| token | hex | 用途 |
|---|---|---|
| `n-000` | `#05070C` | 页面底色（void） |
| `n-050` | `#070A10` | 页面底（次级区域） |
| `n-100` | `#0B1018` | 面板底（plate） |
| `n-200` | `#0F1620` | 面板内凹区 |
| `n-300` | `#141D28` | 抬升面（raised） |
| `n-400` | `#1B2634` | hover 面 |
| `n-500` | `#26333F` | 强边界 |
| `n-600` | `#384857` | 弱文本 / 图标静默 |
| `n-700` | `#54677A` | 占位符 |
| `n-800` | `#7C8FA3` | 次级文本（对比 6.1:1 on `n-100`） |
| `n-900` | `#B3C1D1` | 主文本（对比 11.8:1 on `n-100`） |
| `n-950` | `#E9F0F7` | 标题 / 强调文本 |

> 为什么不用 `slate-*`：Tailwind 默认色板带蓝偏，叠在深空底上会发灰紫。
> 自建中性色阶去掉蓝偏，保留冷调，让信号色更"跳"。

### 2.2 品牌与语义色

| token | hex | 用途 | 硬规则 |
|---|---|---|---|
| `signal` | `#3DDCFF` | 品牌色、主操作、焦点环、当前选中 | 全站唯一品牌色 |
| `signal-weak` | `rgba(61,220,255,.14)` | 选中项背景、焦点底 | — |
| `signal-line` | `rgba(61,220,255,.38)` | 选中边框 | — |
| `up` | `#FF5C6C` | **涨**、盈利、正现金流 | 沿用 `StockMarketPanel` 现有 `#f87171` 的邻近值，提亮以过 4.5:1 |
| `down` | `#3FD68C` | **跌**、亏损、负现金流 | 同上（原 `#4ade80`） |
| `warn` | `#FFB020` | 警告、临界库存、待处理 | — |
| `danger` | `#FF4D4F` | 危险操作、冻结、破产 | 只用于不可逆动作 |
| `info` | `#6FA8FF` | 信息提示、中立链接 | — |
| `aurora` | `#8B7CFF` | **仅**「远程/多元宇宙」语义 | 不出现在常规 UI |
| `relic` | `#E8A33D` | 成就、遗物、稀有掉落 | 只出现在奖励场景 |

> **涨红跌绿**：符合国内约定，且与现有 `StockMarketPanel` 的 `UP/DOWN` 常量一致。
> 所有涉及价格、成本、盈亏的地方强制使用 `up`/`down`，禁止用 `signal` 表示涨跌。

### 2.3 禁止项

- ❌ 任何三色以上渐变作为背景或标题文字（`bg-clip-text` 全站最多保留 1 处：导航页主标题）。
- ❌ 组件内出现 hex / `rgb()` / `rgba()` 字面量（3D 冻结区除外）。所有颜色走 `var(--*)` 或 Tailwind token。
- ❌ 使用 `white/5`、`white/10` 这类裸透明度做背景。改用 `--surface-*` 变量。

---

## 3. 字体

```css
--font-sans: "Inter var", "Inter", ui-sans-serif, system-ui, -apple-system,
             "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono",
             Consolas, "Liberation Mono", monospace;
```

- **不引入网络字体**。`Inter` / `JetBrains Mono` 若本地没有则回退系统栈，不做 FOIT/FOUT。
  如需品牌感，自托管 woff2 子集（≤ 60 KB）在阶段四再做，不进关键路径。
- 中文回退必须显式写 `Noto Sans SC / PingFang SC / Microsoft YaHei`，
  现状缺失导致 Windows 上落到 `Segoe UI` 渲染中文发虚。
- **所有数值、坐标、价格、时间、ID 一律 `font-mono`**（现状只有部分用 `font-mono`）。

### 3.1 字阶（7 级，唯一来源）

| token | size / line-height | weight | tracking | 用途 |
|---|---|---|---|---|
| `display` | 40px / 1.05 | 600 | -0.02em | 仅导航页主标题 |
| `h1` | 28px / 1.15 | 600 | -0.01em | 页面标题 |
| `h2` | 20px / 1.25 | 600 | -0.01em | 区块标题 |
| `h3` | 16px / 1.35 | 600 | 0 | 面板标题 |
| `body` | 14px / 1.55 | 400 | 0 | 正文 |
| `small` | 12px / 1.45 | 400 | 0 | 辅助说明、表格 |
| `micro` | 11px / 1.3 | 500 | **0.08em** | 仪表标签，**强制大写 + mono** |

移动端：`display → 28px`、`h1 → 22px`、`h2 → 18px`，其余不变。
**不再出现 `text-[10px]`、`text-[9px]`、`text-[8px]`**（现状 `FuelBars` 有 4 处）。

---

## 4. 间距与栅格

- 基准 **4px**，标度：`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`（8 档，即为 Tailwind 的
  `1 / 2 / 3 / 4 / 6 / 8 / 12 / 16`）。**禁止 `5`、`7`、`9`、`11`、`13` 等非标度值**。
- 12 列栅格：
  - `< 768px`：4 列，gutter 12，边距 16
  - `768–1023px`：8 列，gutter 16，边距 24
  - `1024–1439px`：12 列，gutter 24，边距 24
  - `≥ 1440px`：12 列，gutter 24，边距 32，内容最大宽 **1600px**
- 断点统一为 `480 / 768 / 1024 / 1440 / 1920`。
  覆盖 Tailwind 默认（`sm:640` `md:768` `lg:1024` `xl:1280` `2xl:1536`），消除现状 `sm:` 到处用但实际指 640px 的歧义。

---

## 5. 圆角 / 边框 / 材质

### 5.1 圆角只留 3 档

| token | 值 | 用于 |
|---|---|---|
| `--r-instrument` | `2px` | 仪表块、标签、输入框、表格单元 |
| `--r-panel` | `6px` | 面板、卡片、抽屉、对话框 |
| `--r-pill` | `999px` | 状态徽章、头像、开关 |

现状 9 种 `rounded-*` 全部映射到这三档。**不允许 `rounded-2xl` 及以上**。

### 5.2 三种材质

```css
/* L0 · plate：常规内容面板。实心，无模糊 */
.surface-plate {
  background: var(--n-100);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--r-panel);
}

/* L1 · raised：面板内的次级块、表格行 hover、可选卡片 */
.surface-raised {
  background: var(--n-300);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--r-panel);
}

/* L2 · overlay：抽屉、对话框、命令面板、下拉。允许模糊 */
.surface-overlay {
  background: rgba(15, 22, 32, 0.86);
  backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: var(--r-panel);
  box-shadow: 0 24px 64px -24px rgba(0, 0, 0, 0.9);
}
```

**使用率约束**（防止再次退化）：

- `surface-plate`：页面级容器，每屏 ≤ 6 个
- `surface-raised`：面板内分组，不限
- `surface-overlay`：由**固定 4 个宿主**使用 —— `ContextDrawer`、`Modal`、`CommandPalette`、`Select`。
  其它地方出现 `backdrop-blur` 视为缺陷。目标：全站 `backdrop-blur` 从 **84 处降到 ≤ 12 处**。

### 5.3 仪表角标（Instrument corner ticks）

替代现状的"蓝光边框 + 玻璃"的身份标识。纯 CSS，零图片：

```css
.plate-ticks {
  position: relative;
}
.plate-ticks::before,
.plate-ticks::after {
  content: "";
  position: absolute;
  width: 8px;
  height: 8px;
  border-color: var(--signal-line);
  border-style: solid;
  pointer-events: none;
}
.plate-ticks::before {
  top: -1px; left: -1px;
  border-width: 1px 0 0 1px;
}
.plate-ticks::after {
  bottom: -1px; right: -1px;
  border-width: 0 1px 1px 0;
}
```

只用在**页面主面板**和**数据卡**上，一屏 ≤ 3 处，否则会变成噪音。

---

## 6. 层级（z-index 6 档，唯一）

| 层 | 值 | 内容 |
|---|---:|---|
| `base` | 0 | 页面内容 |
| `rail` | 20 | TopRail / NavRail / StatusBar |
| `sticky` | 30 | 吸顶表头、浮动操作条 |
| `drawer` | 40 | ContextDrawer |
| `modal` | 50 | Modal / 全屏查看器 |
| `toast` | 60 | 通知 |
| `boot` | 90 | 启动遮罩 / warp reveal |

现状 `z-50` 被 `FuelBars`、全屏查看器、`MultiverseBanner` 同时使用，互相遮挡随机，
重设计后必须全部走 token。

---

## 7. 状态与交互反馈

| 状态 | 视觉 |
|---|---|
| hover | 背景 `n-400`，边框透明度 +0.02，**无位移、无缩放** |
| focus-visible | `outline: 2px solid var(--signal); outline-offset: 2px`（全站强制） |
| active | 背景 `n-500`，`transform: translateY(1px)`（唯一允许的位移） |
| selected | 背景 `signal-weak`，左侧 2px `signal` 竖条 |
| disabled | 不透明度 0.4，`cursor: not-allowed`，不响应 hover |
| loading | 骨架块 `n-300` → `n-400` 呼吸 1.6s（仅 opacity，不做 shimmer 扫光） |
| empty | 居中 32px 线性图标 + 一句说明 + 一个主操作 |
| error | 左侧 2px `danger` + `n-200` 底 + 可折叠详情 |

**禁止**：`hover:scale-105`（现状出现于 Header、所有主按钮、行星卡片）。
缩放会让文字重排、边缘发虚，且移动端触发误触。改用背景/边框变化。

---

## 8. `tailwind.config.js` 目标版本

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./atlas-ui/template/**/*.html",
    "./atlas-ui/react/static/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    screens: {
      xs: "480px",
      sm: "768px",
      lg: "1024px",
      xl: "1440px",
      "2xl": "1920px",
    },
    extend: {
      colors: {
        n: {
          0: "#05070C", 50: "#070A10", 100: "#0B1018", 200: "#0F1620",
          300: "#141D28", 400: "#1B2634", 500: "#26333F", 600: "#384857",
          700: "#54677A", 800: "#7C8FA3", 900: "#B3C1D1", 950: "#E9F0F7",
        },
        signal: { DEFAULT: "#3DDCFF", weak: "rgba(61,220,255,0.14)", line: "rgba(61,220,255,0.38)" },
        up: "#FF5C6C",
        down: "#3FD68C",
        warn: "#FFB020",
        danger: "#FF4D4F",
        info: "#6FA8FF",
        aurora: "#8B7CFF",
        relic: "#E8A33D",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      fontSize: {
        micro: ["11px", { lineHeight: "1.3", letterSpacing: "0.08em" }],
        small: ["12px", { lineHeight: "1.45" }],
        body: ["14px", { lineHeight: "1.55" }],
        h3: ["16px", { lineHeight: "1.35" }],
        h2: ["20px", { lineHeight: "1.25", letterSpacing: "-0.01em" }],
        h1: ["28px", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        display: ["40px", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
      },
      borderRadius: {
        instrument: "2px",
        panel: "6px",
      },
      spacing: {
        4.5: "18px", // 仅此一个例外，用于 TopRail 内元素垂直居中
      },
      transitionDuration: {
        instant: "80ms",
        fast: "160ms",
        base: "240ms",
        slow: "400ms",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
        in: "cubic-bezier(0.5, 0, 0.75, 0)",
        inout: "cubic-bezier(0.4, 0, 0.2, 1)",
        spring: "cubic-bezier(0.34, 1.4, 0.64, 1)",
      },
      zIndex: {
        rail: "20", sticky: "30", drawer: "40", modal: "50", toast: "60", boot: "90",
      },
      maxWidth: {
        content: "1600px",
      },
    },
  },
  plugins: [],
};
```

### 8.1 迁移映射表（旧 → 新）

| 旧 | 新 |
|---|---|
| `bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900` | `bg-n-0` + `.starfield-bg`（单层静态 SVG 噪点，见 03 §1） |
| `bg-white/5 backdrop-blur-lg border-white/10 rounded-2xl shadow-2xl` | `.surface-plate` |
| `bg-white/5 border-white/10 rounded-lg` | `.surface-raised` |
| `text-gray-400` | `text-n-800` |
| `text-gray-300` | `text-n-900` |
| `text-white` | `text-n-950` |
| `from-blue-400 via-purple-400 to-pink-400 bg-clip-text` | 仅保留导航页主标题，改 `text-n-950` + `signal` 下划线（见 03 §1） |
| `hover:scale-105` | `hover:bg-n-400` |
| `rounded-xl` / `rounded-2xl` / `rounded-3xl` | `rounded-panel` |
| `rounded-lg` / `rounded-md` | `rounded-instrument` |
| `animate-pulse`（装饰） | 删除；若表"进行中"用 `opacity` 呼吸 1.6s |
| `text-[10px]` 等任意值字号 | `text-micro` / `text-small` |

---

## 9. `css/global.css` 处置

**从 2,209 行裁到 ≤ 400 行**，只保留：

1. `@tailwind` 三条指令；
2. token 定义（`tokens.css`，独立文件，`:root` 下 CSS 自定义属性）；
3. 三种材质、仪表角标、星尘底 4 个 utility class；
4. 滚动条（保留，改为 `n-500`/`n-600`）；
5. `focus-visible` 全局规则；
6. `prefers-reduced-motion` 全局规则（一条，见 04 §5）。

**删除清单**（88 个 keyframe 中保留 14 个，其余全删）：

| 保留 | 理由 |
|---|---|
| `fade-in` / `fade-out` | 基础过渡 |
| `slide-up-4` / `slide-down-4`（重命名，位移统一 4px→8px 两档） | 面板入场 |
| `scale-in-98`（重命名，`scale(0.98)`） | 对话框入场 |
| `pulse-opacity`（重命名，替代 `animate-pulse`） | loading / 进行中 |
| `scan-line-y`（重命名，1 条就够） | 数据加载指示 |
| `spin` | spinner |
| `shimmer` | 仅骨架屏，改成 opacity 呼吸后可直接删 |
| `stagger-in`（新增） | 列表编排，见 04 §4 |
| `warp-*` 4 个 | 叙事层专用，见 04 §6 |

删除的典型：`digital-rain`、`cyberpunk-glitch`、`holographic-shimmer`、`matrix-char`、
`neural-*`、`particle-*`、`hexagon*`、`extraction*`、`mining-*`、`quantum-*`、`energy*`、
`scan-horizontal*`、`scan-vertical*`、`drill-hammer`、`auto-mining`、`processing-dots`、
`blink`、`factsButtonPulse`、`didYouKnowCircle*`、`coordinateGlitchShake`、`materializeHologram`、
`warpCharge`、`warpReady`、`destinationRevealPulse`、`buttonParticleFloat`、`iconTransition`、
`toastSlideIn`（并入统一 `slide-up-4`）、`accordionCollapse` / `buttonAccordionCollapse`（改用
`grid-template-rows: 0fr → 1fr` 过渡，见 04 §3）。

> 特别注意：`MiningAnimationOverlay`、`ExtractionBeam` 等"采矿动画"属于**玩法反馈层**，
> 不在冻结区（冻结区只有行星/星系的 3D 渲染）。它们由 `global.css` 的 `mining-*` 类驱动，
> 重设计时随 `global.css` 一起删除，并在阶段三用新反馈组件重建（见 05 §D 组）。

---

## 10. 验收（本文件）

- [ ] `grep -rn "#[0-9a-fA-F]\{3,8\}" js --include=*.tsx | grep -v "3DEffects\|3DComponents"` 结果为空
- [ ] `grep -rho "rounded-[a-z0-9]*" js --include=*.tsx | sort -u` 结果 ⊆ `{rounded-instrument, rounded-panel, rounded-full, rounded-t-*, rounded-b-*}`
- [ ] `grep -rn "backdrop-blur" js --include=*.tsx | wc -l` ≤ 12
- [ ] `wc -l css/global.css` ≤ 400
- [ ] `grep -c "@keyframes" css/global.css` ≤ 16
- [ ] 任意页面 Tab 键遍历，每个可聚焦元素都有可见焦点环
