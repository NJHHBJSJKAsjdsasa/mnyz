# 前端 / UI / 动效重设计

> 范围：`atlas-ui/react/static/` 的**表现层**。  
> 三条硬约束：**只动前端**、**不改任何接口**、**不碰星球与星系渲染**。  
> 状态：设计定稿（可实施）。

---

## 1. 一句话结论

把现在「赛博霓虹 + 玻璃卡片 + 12 标签平铺 + 五层全屏遮罩」的界面，改造成
**「轨道仪表台（Orbital Instrument）」**：单一信号色、三层材质、功能化动效、
资产/市场/银行/公司/法务五个**已有后端但无入口**的经济界面补齐。

后端 197 个 `/api/v1` 端点，前端只用到 40 个。这次重设计的最大增量不是"换个皮"，
而是**把已经写好、但玩家看不见的经济系统接出来**。全部用现有端点，零后端改动。

---

## 2. 边界（不可越线）

| 约束 | 含义 | 落点 |
|---|---|---|
| 只动前端 | 不改 `server/`、`pymodules/`、`atlas-ui/template/*.html` 的变量契约 | [07-frozen-contract.md](07-frozen-contract.md) §2 |
| 不改接口 | 不新增/不修改/不重命名 `/api/v1/**`，不改请求/响应 schema | 同上 §3 |
| 不碰渲染 | `3DComponents/`、`3DEffects/`、`Config/UniversalRenderer.ts` 及所有 3D Viewer **零改动** | 同上 §1 |

3D 渲染只允许一种操作：**用外壳容器包住它**（尺寸、边框、位置、遮罩），
不改内部 props、不改相机、不改 shader、不改挂载时机。

---

## 3. 文档索引

| 文件 | 内容 | 读者 |
|---|---|---|
| [00-audit.md](00-audit.md) | 现状审计：代码量分布、8 类问题、量化证据 | 全体 |
| [01-design-system.md](01-design-system.md) | 设计 token：色彩/字体/间距/圆角/材质/层级 | 设计 + 前端 |
| [02-shell-and-ia.md](02-shell-and-ia.md) | 应用外壳（TopRail/NavRail/StatusBar/Drawer）与信息架构 | 前端 + 产品 |
| [03-page-specs.md](03-page-specs.md) | 8 个页面的逐页规格与布局栅格 | 前端 |
| [04-motion-system.md](04-motion-system.md) | 动效分层、时长标度、编排、性能与降级 | 前端 |
| [05-component-inventory.md](05-component-inventory.md) | 239 个文件的 A/B/C/D 处置清单 | 前端 |
| [06-economy-surfaces.md](06-economy-surfaces.md) | 银行/公司/产权/法院/破产 5 个新界面蓝图 | 前端 + 后端确认 |
| [07-frozen-contract.md](07-frozen-contract.md) | 冻结区清单 + 233 端点全量契约表 | 全体 |
| [08-migration-and-acceptance.md](08-migration-and-acceptance.md) | 4 阶段实施计划、验收标准、性能预算、回滚 | 全体 |

建议阅读顺序：`README → 00 → 01 → 02 → 04 → 03 → 05 → 06 → 07 → 08`。

---

## 4. 设计方向（先看这个，细则在 01）

**现在的观感**：深空紫蓝渐变底 + 到处 `bg-white/5 backdrop-blur-lg rounded-2xl border-white/10` +
全屏粒子/故障/矩阵雨 + 蓝紫粉三色渐变标题。每个组件自己发明颜色、圆角、阴影。

**目标观感**：天文台控制台。冷静、精密、可读数。

三条替换规则：

1. **颜色**：从"到处霓虹"收敛到 **1 个信号色 `#3DDCFF`** + 语义色（涨红/跌绿/警告/危险）。
   渐变只允许出现在"光"上（发光、扫描线），不允许作为大面积背景。
2. **材质**：玻璃拟态从"所有卡片"降级为"浮层专用"。常规内容用**实心面板 + 1px 发丝边框 + 角标刻度**。
3. **动效**：删掉一切"装饰性无限循环"。动画只承担三个职能：**反馈 / 过渡 / 叙事**，
   并且全站同时运行的循环动画 ≤ 2 个。

一个可视对照（左旧右新，非最终稿，仅示意结构）：

```
旧                                  新
┌──────────────────────────┐        ┌──────────────────────────────────────┐
│ 渐变紫蓝底 + 星点噪点      │        │ 深空底 #06080D + 极淡星尘            │
│ ┌──────────────────────┐ │        │ ┌─ TopRail 56 ─────────────────────┐ │
│ │ 玻璃卡 rounded-2xl    │ │   →    │ └──────────────────────────────────┘ │
│ │ blur-lg border-white │ │        │ ┌Rail┐ ┌─ Plate ─────────────────┐   │
│ │ 12 个 emoji 标签平铺   │ │        │ │ 72 │ │ 4 组 × N 个二级标签      │   │
│ └──────────────────────┘ │        │ │    │ │ 实心面板 + 发丝边框 + 角标 │   │
└──────────────────────────┘        │ └────┘ └─────────────────────────┘   │
                                    │ ┌─ StatusBar 32 ───────────────────┐ │
                                    │ └──────────────────────────────────┘ │
                                    └──────────────────────────────────────┘
```

---

## 5. 量化目标

| 指标 | 现状 | 目标 | 检测方式 |
|---|---|---|---|
| 首屏 JS（gzip） | 未测（8 入口 + 大量 3D chunk） | ≤ 250 KB（首屏页面，不含 3D） | `vite build` 产物 + `size-limit` |
| LCP（行星页，移动 4G） | 未测，串行 5 层遮罩 | ≤ 2.5 s | Lighthouse CI |
| CLS | 未测 | ≤ 0.05 | Lighthouse CI |
| 同屏无限循环动画 | 59 处 `animate-*` 中多数无节制 | ≤ 2 | 人工 + 运行时断言 |
| `setInterval` 数量（单页） | 最多 5 个（1s × 3） | ≤ 1（统一 tick） | 代码审查 |
| 样式真源 | 组件内联 + global.css + tailwind 三份 | 单一 token 层 | 审查：组件内 0 个 hex |
| `rounded-*` 种类 | 9 种 | 3 种 | grep |
| 键盘可达率（核心路径） | 大量 `div onClick` | 100% | axe + 手工 |
| 全站 `prefers-reduced-motion` | 覆盖 8 个类名 | 100% | 手工 |

---

## 6. 不做的事

- 不换框架（继续 React 19 + Vite 7 + Tailwind 3.4），不引入组件库（MUI/Antd/shadcn 均不引入）。
- 不引入 GSAP / framer-motion / zustand / immer —— `vite.config.mjs` 的 `manualChunks`
  里虽然给它们留了位置，但 `package.json` 并没有装。动效全部用 CSS + Web Animations API 实现。
- 不引入图表库。现有 `StockMarketPanel` 的手写 SVG K 线已经够用，重设计只改外观与交互。
- 不改 `atlas-ui/template/*.html` 的 Jinja 变量名（`planet`、`system`、`galaxy`、
  `meta-data`、`data-universe-config` 等 id 是前端唯一数据入口）。
- 不做暗/亮双主题。全站唯一主题（深空），线程更短、一致性更高。

---

## 7. 落地前置条件

1. `npm run build` 后**必须重启 Flask 进程**——服务启动时只读一次 Vite manifest
   （见 `docs/ROADMAP.md` 运维备注）。
2. 每次提交前必须通过：`npx tsc --noEmit`（当前零错误，不得回退）、
   `npm run test:frontend`、`python test_fix.py`。
3. 阶段一之后引入 `docs/frontend-redesign` 配套的视觉回归基线截图（见 08 §7.4）。
