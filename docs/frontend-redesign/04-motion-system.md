# 04 · 动效系统

> 现状：88 个 `@keyframes`、76 处 `animation:` 声明、59 处 `animate-pulse/spin/bounce/ping`，
> 其中大量是**装饰性无限循环**；`prefers-reduced-motion` 只覆盖 8 个（且写错了 2 个）类名。
> 目标：动画从"氛围装饰"变成"状态沟通"。所有动效可被解释为以下三职能之一，否则删除。

---

## 1. 三职能分类（唯一判定标准）

| 职能 | 目的 | 时长范围 | 允许频率 | 例子 |
|---|---|---|---|---|
| **反馈 Feedback** | 确认"我点到了 / 状态变了" | 80–160 ms | 每次交互 | 按钮按下、开关切换、数值跳动 |
| **过渡 Transition** | 解释"我从哪来 / 到哪去" | 160–400 ms | 每次状态变化 | 面板切换、抽屉滑入、Tab 指示条 |
| **叙事 Narrative** | 建立世界观 / 仪式感 | 800–2400 ms | **每个会话 ≤ 3 次** | 首次 warp、进入多元宇宙、行星首次渲染完成 |

**任何动效必须能回答："删掉它，用户会丢失什么信息？"** 答不出就删。

按此标准，现状可保留的只有：`fade-in`、`scale-in`（改）、`shimmer`（改）、`spin`、
面板切换过渡、`StarfieldWarpReveal`、`MultiverseTransitionCanvas`。其余 ~70 个 keyframe 删除。

---

## 2. 时长标度（5 档，唯一来源）

```css
:root {
  --dur-instant: 80ms;   /* 按下、焦点、颜色切换 */
  --dur-fast:    160ms;  /* hover、小图标切换、Tooltip */
  --dur-base:    240ms;  /* 面板/抽屉/Tab 指示条 */
  --dur-slow:    400ms;  /* 大面积展开、页面级转场 */
  --dur-scene:   800ms;  /* 叙事层专用，禁止用于 UI */
}
```

映射到 Tailwind：`duration-instant / duration-fast / duration-base / duration-slow`（见 01 §8）。

**禁止**：`duration-200/300/500/700/1000`（现状混用 4 种）。`transition-all` **禁止**，
必须显式列出属性，避免 `all` 触发布局属性过渡。

```css
/* ✅ */
transition: background-color var(--dur-fast) var(--ease-out),
            border-color var(--dur-fast) var(--ease-out);

/* ❌ */
transition: all 0.3s ease;
```

---

## 3. 缓动（4 条曲线）

```css
:root {
  --ease-out:    cubic-bezier(0.22, 1, 0.36, 1);     /* 入场：快起慢收 */
  --ease-in:     cubic-bezier(0.5, 0, 0.75, 0);      /* 退场：慢起快收 */
  --ease-inout:  cubic-bezier(0.4, 0, 0.2, 1);       /* 位移/尺寸双向 */
  --ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);   /* 仅小元素强调，位移 ≤ 8px 或 scale ≤ 1.04 */
}
```

规则：

- 入场一律 `--ease-out`，退场一律 `--ease-in`。**不要两个都用 ease-in-out**（现状全部如此，观感"黏"）。
- `--ease-spring` 只用于：新徽章出现、数值从 0 跳到目标值、开关拨动。**不用于整块面板**（会溢出容器）。
- **禁止 `linear`**，除了：进度条、旋转 spinner、扫描线。

---

## 4. 位移规范（为什么禁用 scale 入场）

现状高频写法：`opacity-0 scale-95 translate-y-2` → `opacity-100 scale-100 translate-y-0`。

问题：`scale` 会让**文字在动画过程中重新栅格化**，中文字形尤其明显（先糊后清），
且 `scale` 会连带缩放边框粗细（1px 变 0.95px），在深色背景上闪烁。

新规范：

| 场景 | 变换 | 说明 |
|---|---|---|
| 面板/卡片入场 | `translateY(8px)` + `opacity 0→1` | 位移 8px 一档，不缩放 |
| 抽屉入场 | `translateX(100%)` → `0` | 320ms `--ease-out` |
| 对话框入场 | `translateY(8px) scale(0.98)` + `opacity` | **唯一允许 scale 的场景**，且 0.98 极轻微，240ms |
| 列表项 stagger | `translateY(8px)` + `opacity`，每项延迟 40ms | 最多 6 项，第 7 项起不再延迟（避免长尾） |
| Toast | `translateY(-8px)` + `opacity` | 160ms |
| Tab 指示条 | `translateX` + `width` | 240ms `--ease-inout`，用 `transform` + `scaleX` 避免重排 |

**禁止**：`hover:scale-105`（现状 ≥ 20 处）、`hover:-translate-y-1`（卡片悬浮）。
hover 只改 `background-color` / `border-color` / `color` / `box-shadow`。

---

## 5. 运行时预算（硬约束）

### 5.1 全局规则

| 规则 | 值 | 原因 |
|---|---|---|
| 同屏无限循环动画 | **≤ 2** | 现状 59 处，移动端掉帧 |
| 单元素同时过渡属性 | ≤ 3 | 减少 style recalc |
| 允许动画的属性 | `opacity` / `transform` / `background-color` / `border-color` / `color` / `box-shadow` | 全部可合成或低成本 |
| **禁止动画的属性** | `width` / `height` / `top` / `left` / `margin` / `padding` / `filter: blur` / `backdrop-filter` | 触发布局或高成本重绘 |
| `will-change` | 仅在实际动画前 1 帧加，动画结束后移除 | 常驻 `will-change` 会占显存 |
| canvas/rAF 循环 | 必须在 `visibilitychange` 隐藏时暂停 | 现状无一处暂停 |

### 5.2 例外与处理

- **高度展开**（折叠面板）：不能过渡 `height`。改用：

```css
.collapsible {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--dur-base) var(--ease-inout);
}
.collapsible[data-open="true"] { grid-template-rows: 1fr; }
.collapsible > * { overflow: hidden; min-height: 0; }
```

- **骨架屏**：不做 `shimmer` 扫光（现状 `animate-shimmer` 3s infinite × 多处），改为
  `opacity: .55 ↔ .75` 呼吸 **1.6s**，`animation-timing-function: var(--ease-inout)`。
  一屏最多 1 个在呼吸（多个骨架块同步相位，不要各自起跳）。

- **"进行中"状态**：`animate-pulse` 全部替换为 `.pulse-opacity`（1.6s，`opacity .6↔1`），
  且必须带文案（"处理中…"），不能只靠闪烁表意（现状多处只有闪烁）。

- **移出视口即停**：

```ts
// Hooks/useInViewPause.ts —— 任何循环动画的宿主元素必须使用
const io = new IntersectionObserver(([e]) => {
  el.style.animationPlayState = e.isIntersecting ? "running" : "paused";
}, { threshold: 0 });
```

### 5.3 性能预算

| 指标 | 预算 | 检测 |
|---|---|---|
| 主线程每帧脚本时间 | ≤ 8 ms（60fps 下） | Performance 面板 5s 录制 |
| 布局偏移（CLS） | ≤ 0.05 | Lighthouse |
| 同屏 canvas 数量 | ≤ 2（3D 视图本身 + 最多 1 个叙事层） | 运行时断言 |
| 首个动画启动前阻塞 | ≤ 500 ms | Lighthouse TBT |

---

## 6. 叙事层（唯一允许超 400ms 的地方）

| 场景 | 时长 | 可跳过 | 只播一次 | 阻塞内容 |
|---|---|---|---|---|
| 首次进入 `StarfieldWarpReveal` | 2 400 ms | ✅ `Esc` / 点击任意处 → 立刻结束 | ✅ `atlasIntroSeen` | **❌ 不阻塞**（见下） |
| 进入多元宇宙节点 | 800 ms | ❌ | 每次跳转 | ✅ 短暂 |
| 行星 3D 首次渲染完成 | 600 ms（模糊 → 清晰） | ❌ | 每颗行星一次 | ❌ |
| 矿石采集完成 | 900 ms | ❌ | 每次 | ❌（叠加在 3D 上，可交互） |

### 6.1 `StarfieldWarpReveal` 修正（重要）

现状：`MainLayout` 在 `fetch("/api/universe/config")` 返回后才 `setShowWarpReveal(true)`，
且 warp 组件全屏不透明覆盖 → **LCP 被网络往返 + 2.4s 动画完全吞掉**。

新流程：

```
1. 立即渲染 AtlasShell + 页面骨架（可交互的静态内容，无数据）
2. 并行 fetch config；同时启动 warp（不等 fetch）
3. warp 结束 or 用户跳过 → 淡出 400ms
4. 若 config 仍未返回，页面显示骨架态；返回后填充
```

- warp 层 `z-boot`（90），`pointer-events: none` 在最后 400ms 淡出阶段，让用户能提前点击跳过。
- 动画只动 `opacity` 与 canvas 内部（canvas 由 Three.js 自绘，不参与 CSS 合成）。
- `prefers-reduced-motion: reduce` → **完全不播**，直接显示内容。

### 6.2 页面级转场

现状：`/navigate` 是服务端表单 POST → 整页刷新（白屏 → preloader）。
这是服务端行为，**不改**（改了就要动后端）。前端只做两件事：

1. 提交前在按钮上显示 `loading` 态并禁用，避免重复提交；
2. 在 `<body>` 上挂 `data-leaving` → 内容区 `opacity: 1 → 0`（160ms），让白屏前有个收束。
   **不要加全屏遮罩**（现状 `preloader.css` 120 行会盖住新页面首帧）。

---

## 7. `prefers-reduced-motion` 全站策略

一条全局规则，替代现状 8 个类名的硬编码列表：

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  /* 保留必要的状态可见性：不做位移，只做显隐 */
  .motion-safe-only { display: none !important; }
}
```

- 所有"位移 + 淡入"降级为纯显隐（`0.01ms` 使位移瞬间完成，视觉上等同直接出现）。
- 叙事层（warp / multiverse 转场）走 `useReducedMotion()` hook 判断，**直接跳过整个阶段**。
- 3D 场景（冻结区）**不受此规则影响** —— 它由 Three.js 控制，不在 CSS 管辖内。
  行星自转等 3D 动画保持现状（这是内容本身，不是 UI 动效）。

```ts
// Hooks/useReducedMotion.ts
export const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
};
```

---

## 8. 交互 → 动效对照表（实现清单）

### 8.1 通用

| 交互 | 属性 | 时长 | 缓动 |
|---|---|---|---|
| 按钮 hover | `background-color`, `border-color` | `fast` | `out` |
| 按钮 active | `transform: translateY(1px)` | `instant` | `out` |
| 按钮 disabled | 无过渡（直接生效） | — | — |
| 输入框 focus | `border-color`, `box-shadow: 0 0 0 3px signal-weak` | `fast` | `out` |
| 复选框/开关 | `transform: translateX(16px)`, `background-color` | `base` | `spring` |
| Tooltip | `opacity`, `translateY(4px)` | `fast` | `out` |
| Toast 进/出 | `opacity`, `translateY(∓8px)` | `fast` | `out` / `in` |

### 8.2 结构

| 交互 | 规格 |
|---|---|
| **Tab 切换（含实验舱组/子标签）** | 指示条 `translateX + scaleX` `base`；内容 `opacity 0→1` `fast`，**无位移**（内容区高度会变，位移会产生跳动） |
| **Drawer 打开** | `translateX(100%→0)` `base` `out`；遮罩 `opacity 0→.6` `base` |
| **Drawer 关闭** | `translateX(0→100%)` `base` `in` |
| **Modal** | `opacity` + `translateY(8px)` + `scale(.98→1)` `base` `out` |
| **Accordion** | `grid-template-rows 0fr↔1fr` `base` `inout` |
| **列表首屏** | stagger `translateY(8px)+opacity`，每项 +40ms，最多 6 项 |
| **列表追加项** | 单项 `translateY(8px)+opacity` `fast`，不 stagger |
| **骨架 → 内容** | 骨架 `opacity 1→0` `fast`；内容 `opacity 0→1` `fast`，延迟 80ms（交叉不重叠） |
| **空态出现** | `opacity 0→1` `base`，图标 `translateY(-4px→0)` |

### 8.3 数据

| 交互 | 规格 |
|---|---|
| 数值变化（余额、价格） | 数字用 `tabular-nums`；变化时 `color` 闪一下目标色（涨 `up` / 跌 `down`）160ms 后回 `n-900`。**不做滚动数字**（现状无，也不要加，长列表会卡） |
| 涨跌箭头 | 静态图标，不旋转 |
| 进度条 | `transform: scaleX()` `base` `inout`；不用 `width` |
| 图表（K 线） | 首帧 `opacity 0→1` `base`；不做逐根生长动画 |
| 实时数据刷新 | **不做**闪烁提示。用右上角一个 4px 圆点，刷新瞬间 `opacity 1→.4→1`（`base`），其余不动 |

### 8.4 玩法反馈

| 交互 | 规格 |
|---|---|
| 采集成功 | 3D 容器上叠加一层 `signal` 径向脉冲：`scale(.6→1.4)` + `opacity .5→0`，900ms `out`，`pointer-events: none`，单次。**替代**现状 `MiningAnimationOverlay` 的 4 层光束 + 六边形 + 粒子（`global.css` 里 30+ 个 `mining-*` 类） |
| 资源入账 | StatusBar 对应资源数值 `color` 闪 `down`（绿=收入）160ms |
| 操作失败 | 目标元素 `translateX(±2px)` 抖动 3 次（共 240ms）`inout`，同时 Toast 显示原因 |
| 危险操作确认 | 无动画（立即响应），靠 `danger` 边框传达 |

---

## 9. 实现方式（不引入动画库）

| 场景 | 方式 |
|---|---|
| hover / focus / active / 简单显隐 | CSS `transition` |
| 入场 stagger | CSS `animation` + `animation-delay`（内联 `style={{ "--i": index }}`） |
| Tab 指示条跟随 | WAAPI `element.animate()`，因为需要读取实时 `offsetLeft/offsetWidth` |
| Drawer 开关 | CSS class 切换 + `transition`（不用 WAAPI，避免与 focus trap 竞争） |
| 需要中途打断 | WAAPI + `animation.cancel()` |
| 滚动驱动 | `IntersectionObserver` + class 切换（**不用** `animation-timeline`，Safari 支持不全） |

不使用 `framer-motion` / `gsap` / `react-spring`：
`package.json` 未安装，且 `vite.config.mjs` 里为它们预留的 `manualChunks` 分支是死代码
（可作为后续清理项，但**不在本次范围**——改 `vite.config.mjs` 属于构建配置，风险高于收益）。

---

## 10. 删除清单（逐条）

| 类别 | 具体 | 数量 |
|---|---|---|
| `global.css` keyframes | 88 → 保留 ≤ 16 | 删 ~72 |
| `animate-pulse` 装饰性使用 | 全部 | 59 处中的 ~50 |
| 全屏循环背景动画 | `digital-rain` / `matrix-char` / `neural-*` / `particle-drift` / `scan-horizontal*` / `scan-vertical*` / `holographic-shimmer` / `quantum-field::before/after` | 8 类 |
| 故障效果常驻 | `cyberpunk-glitch` / `glitchFlicker` / `coordinateGlitchShake` / `coordinate-selector-glitch` | 4 类 |
| 采矿旧动效 | `mining-*` 全部 30+ 类 + `MiningAnimationOverlay` 重写 | 1 组件 |
| hover 缩放 | `hover:scale-105` 全部 | ~20 处 |
| `backdrop-blur` 非浮层 | 84 → ≤ 12 | 删 ~72 |
| 双 `@keyframes` 重名 | `slideUpFadeIn` / `slideDownFadeOut` / `slideInRight` / `slideOutLeft` | 4 对 |

---

## 11. 验收（本文件）

- [ ] Performance 面板录制 5s（行星页 + 打开股市面板）：无 > 50ms 长任务，掉帧 < 3 帧
- [ ] `grep -c "animate-pulse" js/**/*.tsx` = 0
- [ ] `grep -c "hover:scale" js/**/*.tsx` = 0
- [ ] `grep -c "@keyframes" css/global.css` ≤ 16
- [ ] 系统设置开启"减少动态效果"后：无任何位移/缩放，页面功能完整
- [ ] 页面切到后台标签 10s，CPU 占用回落至 < 5%（验证循环动画已暂停）
- [ ] 每屏可见区域内的循环动画 ≤ 2 个（人工点检 8 个页面）
