# 13 · global.css 清理记录（2026-10-28）

目标：`global.css` 2209 行 → ≤ 400 行，**不删除仍在使用的样式**。

## 做法

1. 把 CSS 解析成顶层块（`@keyframes` / 规则 / `@media` / 语句）。
2. 每个块的类名在 **前端源码 + 模板 + pymodules + 其它 css** 的全部文本里做子串搜索。
3. 白名单无条件保留：含 `#id`、含 `html`/`body` 钩子、第三方库运行时类（`nprogress` 等）、元素选择器。
   —— 这一条是必须的：`html.nprogress-busy` 在源码里永远搜不到，但库会在运行时加上。
4. 级联到不动点：删掉一个类后，只被它引用的 `@keyframes` 也变成孤儿。
5. 不再删除、而是**拆分**：`@keyframes` + `animate-*` → `animations.css`；具名组件类 → `components.css`。

## 结果

| 文件 | 行数 |
|---|---:|
| `global.css`（入口，只留 reset + tailwind） | 219 |
| `animations.css` | 1161 |
| `components.css` | 391 |

删除 55 个块（共约 654 行无引用规则）。

## 删除清单（供 review）

| 类型 | 选择器 / 名称 |
|---|---|
| rule | `.animate-scan-horizontal-reverse` |
| rule | `.animate-scan-vertical` |
| rule | `.animate-scan-vertical-reverse` |
| rule | `.delay-150` |
| rule | `.animate-fade-in` |
| rule | `.animate-scale-in` |
| rule | `.mining-hexagon-group` |
| rule | `.mining-hexagon` |
| rule | `.mining-hexagon-inner` |
| rule | `.perspective-1000` |
| rule | `.transform-gpu` |
| rule | `.rotate-y-1` |
| rule | `.rotate-y-2` |
| rule | `.rotate-y--2` |
| rule | `.translate-z-8` |
| rule | `.holographic-glow::after` |
| rule | `.holographic-glow:hover::after` |
| rule | `.matrix-char` |
| rule | `.quantum-field` |
| rule | `.quantum-field::before` |
| rule | `.quantum-field::after` |
| rule | `.glitch-text` |
| rule | `.glitch-text::before, .glitch-text::after` |
| rule | `.glitch-text::before` |
| rule | `.glitch-text::after` |
| rule | `.neural-bg` |
| rule | `.neural-node` |
| rule | `.energy-button:hover` |
| rule | `.particle-system` |
| rule | `.animate-factsFadeOut` |
| rule | `.animate-factsButtonPulse` |
| rule | `.animate-slideRight` |
| rule | `.animate-glitchFlicker` |
| rule | `.animate-scanLine` |
| rule | `.animate-materializeHologram` |
| rule | `.animate-float` |
| rule | `.animate-warpCharge` |
| rule | `.animate-warpReady` |
| rule | `.animate-coordinateGlitchShake` |
| rule | `.animate-holographicScanline` |
| rule | `.animate-particleFloat` |
| rule | `.animate-energySurge` |
| rule | `.animate-destinationRevealPulse` |
| rule | `.animate-dataTransfer` |
| rule | `.topbar-green-overlay` |
| rule | `.topbar-green-overlay::before` |
| rule | `.animate-greenOverlay::before` |
| rule | `.coordinate-selector-toast` |
| rule | `.coordinate-selector-icon-transition` |
| rule | `.coordinate-selector-gradient-x` |
| rule | `.coordinate-selector-gradient-y` |
| rule | `.coordinate-selector-gradient-z` |
| rule | `.coordinate-selector-glitch` |
| rule | `.animate-buttonAccordionCollapse` |
| rule | `.animate-buttonAccordionCollapse *` |

## 怎么复核

```bash
# 1. 拆分前后产物 css 体积对比（应只减小，且页面样式不变）
npx vite build && ls -la atlas-ui/react/dist/*.css
# 2. 再跑一次死代码检测（白名单规则同脚本）
python scripts/check_css_usage.py
```
