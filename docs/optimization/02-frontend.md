# 02 · 前端

> 基线（2026-11-02）：**374 文件 / 91,307 行**（`ts/tsx`）<!--fact:frontend.ts_files=374--> <!--fact:frontend.ts_lines=91,307-->，`dist` 3.3 MB / 89 个 js，
> 闸门全过（`blur` 11 处计入 2、循环动画源码 38 处、最大非冻结文件 930 行）。
> 壳已统一（`Shell/GameFrame` 四区 + 经济坞），**现在的问题不再是"乱"，而是"重"**。

---

## 1. 先做减法：零引用文件

**证据**：`15-game-hud.md` 写着 `HeroPanel.tsx`（212 行）已删，实际还在磁盘上，
只有两处注释提到它，零 `import`。这类文件是「删了东西但没删干净」的残留。

**做法**
1. 接 `knip`（或 `ts-prune`）扫零引用导出，先只报告；
2. 人工确认后按批次删，每批 ≤10 个文件，删完跑 `npx tsc --noEmit` + `npm run test:frontend`；
3. 建立规则：**删除组件时同一个 PR 里物理删除文件**，不接受「先停用后清理」。

**判据**：`knip` 报告的零引用文件 = 0；`HeroPanel.tsx` 不存在。
**验证**：`npx knip --include files,exports` 输出为空。

---

## 2. 大文件：数据与绘制分离

当前最大非冻结文件（闸门 `SIZE_BUDGET=1200` 是上限，但 900 行已经很痛）：

| 文件 | 行 | 性质 | 建议 |
|---|---|---|---|
| `Utils/arecibo/data.ts` | 930 | **纯数据表**（22 组指纹） | 抽成 `.json` + `import()` 懒加载；构建期校验结构 |
| `Utils/arecibo/sections.ts` | 904 | 绘制逻辑 | 按 section 拆 3–4 个文件 |
| `Utils/arecibo/figures/lifeForm.ts` | 855 | 图形生成 | 同上，按形态拆 |

**为什么数据要挪出去**：数据文件改一行要重编 TS，进 bundle；JSON 可以 `fetch` 懒加载，
且能被 `scripts/arecibo_check.mjs` 直接读同一份——**现在是两处各存一份指纹**，这才是真正的风险。

**判据**：`data.ts` 消失，指纹只有一份（JSON），`npm run check:arecibo` 仍然逐位一致。
**验证**：`npm run check:arecibo`（22 组指纹 + golden 比对）。

---

## 3. 面板重复件：`_shared` 只有 3 个文件

**证据**：`panels/` 38 文件 / 6,106 行，26 个子分区。`_shared/` 只有 `Notice.tsx` / `errors.ts` / `useWrite.ts`。
26 个 Tab 里反复出现同样的东西：**「加载中 → 空态 → 错误条 → 确认按钮 → 写操作 loading」**。

**做法**：把重复模式抽成 4 件，放进 `_shared/`：

| 新组件 | 替代什么 | 涉及 Tab |
|---|---|---|
| `PanelSection` | 「标题 + 折叠 + 右上角操作」外壳 | 几乎全部 |
| `QueryState` | loading / empty / error 三态统一渲染 | 全部读接口的 Tab |
| `WriteButton` | `useWrite` + loading + 二次确认 + 错误提示 | 全部写接口 |
| `KeyValueGrid` | 详情型字段列（金额右对齐、单位、涨跌色） | 公司/银行/法务 |

**判据**：`panels/**` 里手写 `if (loading) return` 的地方 ≤ 3 处（现在 20+）。
**验证**：`grep -rn "loading" panels/ | wc -l` 前后对比；截图对比 6 个面板无视觉变化。

---

## 4. 循环动画：38 处 → 运行时 ≤ 2

**证据**：闸门统计源码 38 处（排除 3D 冻结区），16 号 P6 已收口过一轮，
但**「源码有几处」不等于「同屏跑几个」**。现在的判据是源码计数，不是运行时。

**做法**
1. 只保留 2 个语义循环：`hud-ping`（状态灯）、`spin`（加载）；
2. 其余循环动画改为**事件驱动**或 `animation-play-state: paused`（进入视口才 `running`）；
3. 加一个 dev-only 运行时断言：`document.getAnimations().filter(a => a.effect.getTiming().iterations === Infinity).length`，
   `?dev=1` 时打 `console.warn` 超阈值。

**判据**：`?dev=1` 打开 6 个面板，运行时无限循环动画 ≤ 2；CPU 空闲态下降可测（DevTools Performance 对比）。
**注意**：这条要改 `check_frontend_gates.py` 的口径说明，否则闸门永远显示 38 而实际上没问题——**文档和闸门要同时改**。

---

## 5. 五个 HTML 文档：值不值得合

**现状**：`atlas-ui/template/` 仍是 `index` / `galaxy` / `system` / `planet` / `multiverse` 五份，
五份各有 MountPoint；跨层跳转已由 `Utils/PageNavigation.ts` 的 PJJAX-lite 接管。

**代价（真实可测的那部分）**
- 每次 `navigate()` 拉回**整页 HTML**（含已经存在的顶栏/经济坞标记），再 `DOMParser` 解析、取数据岛；
- 三份数据岛解析逻辑此前各写一遍（已收进 `Shell/viewData.ts`，缓解了一半）；
- 整页 HTML 无法被 CDN 缓存为「一个 SPA 外壳」。

**分期方案**

| 阶段 | 做什么 | 风险 | 收益 |
|---|---|---|---|
| **A（低）** | 保留 5 文档，给 `navigate()` 加**视图级缓存**（已有 12 条 LRU）+ 只取 `<main>` 片段（服务端加 `X-Atlas-Fragment: 1`）| 低 | 传输量降一个数量级 |
| **B（中）** | 单入口 `index.html` + 所有层共用一棵 React 树，服务端只出 JSON | 中（首次进入深层要 session 预取）| 无白屏、可做预渲染 |
| **C（高）** | SSR / 预渲染首屏 | 高 | 首屏 LCP |

**建议现在只做 A**，B/C 等玩法稳定后再评估——现在做 B 会和还在演进的 3D 舞台打架。

**判据（A）**：`/galaxy` → `/system/3` → `/planet/7` 连点，Network 面板里每次导航的 HTML 响应体
≤ 当前值的 40%，且无白屏、经济坞不重挂。

---

## 6. 首屏预算与懒加载

**证据**：16 号 P2 记录「三个 Layout 静态 import 进同一个入口，最大 chunk 从 343 KB 涨到 **439 KB（gzip 125 KB）**」。

**做法**：`PlanetLayout` 改 `React.lazy`（行星页不是首屏），首页只留 `HomeScreen` + `GameFrame`。
**判据**：首屏最大 chunk ≤ 350 KB（未压缩）；`vite build` 输出的 chunk 表可查。
**验证**：`npx vite build` 看 size 报告；`npm run shot -- --only game` 冒烟不缺页。

---

## 7. 可访问性与动效降级

- `prefers-reduced-motion` 覆盖率：现在按 08 的验收表要求 100%，实际未测；
- 键盘可达：核心路径（顶栏导航、经济坞 chips、下单表单）必须 Tab 可达，禁止裸 `div onClick`；
- 新增闸门规则（低成本）：`grep -rn "<div onClick" ` 命中数只能下降不能上升。

**判据**：axe 扫描 5 个页面 critical = 0；`prefers-reduced-motion: reduce` 下无循环动画。

---

## 8. 视觉回归基线

**现状**：`npm run shot` 能截图（playwright-core + 系统 Edge + `POST /navigate` 建会话），但**只出图不比对**。
**做法**：首轮跑一遍存 `tools/baselines/*.png`，之后每次截图做像素 diff，阈值 0.5%，输出到 artifact。
**判据**：改 CSS 后意外影响别的页面能被 CI 抓到；`npm run shot -- --baseline` 存在且可用。

---

## 9. 状态总线（TASK-BACKLOG P2.5，未做）

`ui/Status.tsx` 有，`StatusBar` 却直接读 snapshot，面板各自算状态——同一个 `fuel.low` 可能三处不一致。
**做法**：`Shell/statusBus.ts`（订阅-发布），面板只 `publish`，状态条只 `subscribe`。
**判据**：`Shell/GameFrame` 的状态条不再 import 任何面板模块；同一状态在顶栏/左轨/坞内显示一致。
