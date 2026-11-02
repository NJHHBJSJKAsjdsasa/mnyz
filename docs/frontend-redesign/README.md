# 前端 / UI / 动效重设计

> **2026-10-30 覆盖声明（当天两轮）**：01–13 描述的是「轨道仪表台 Orbital Instrument」。
> 第一轮换成 **[14-amber-cockpit.md](14-amber-cockpit.md)**（冷金属 + 琥珀、零模糊、不发光）；
> 第二轮换成 **[15-game-hud.md](15-game-hud.md)**（深空 + 霓虹青 + 辉光 + 角标 + 动效 + deck 化布局），
> **当前视觉权威是 15**。01–14 仍然有效的是**结构契约**（外壳分区、面板职责、冻结契约、验收命令）。

> 范围：`atlas-ui/react/static/` 的**表现层**。  
> 三条硬约束：**只动前端**、**不改任何接口**、**不碰星球与星系渲染**。  
> 状态：设计定稿（可实施）。

---

## 1. 一句话结论

把现在「赛博霓虹 + 玻璃卡片 + 12 标签平铺 + 五层全屏遮罩」的界面，改造成
**「轨道仪表台（Orbital Instrument）」**：单一信号色、三层材质、功能化动效、
资产/市场/银行/公司/法务五个**已有后端但无入口**的经济界面补齐。

后端 **255 个** `/api/v1` 端点（26 个子蓝图）<!--fact:api.endpoints=255--> <!--fact:api.blueprints=26-->，前端 `ServerApi.tsx` 里 **63 处** v1 调用（2026-11-02 实测），
对 255 个端点覆盖约 1/4。这次重设计的最大增量不是"换个皮"，
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

> **例外记录（2026-10-31）**：用户明确授权「现在可以动 该动就动」之后，16 号文档 P1c 修改了星系/恒星系的
> 相机距离、点尺寸与 `STAR_SCALE`，并修复了 `galaxyType` 大小写比较的真 bug。逐条见
> [16-shell-unification.md](16-shell-unification.md) §4 P1c。除该次授权外，本约束仍然有效。

---

## 3. 文档索引

| 文件 | 内容 | 读者 |
|---|---|---|
| [00-audit.md](00-audit.md) | 现状审计：代码量分布、8 类问题、量化证据 | 全体 |
| [01-design-system.md](01-design-system.md) | 设计 token：色彩/字体/间距/圆角/材质/层级 | 设计 + 前端 |
| [02-shell-and-ia.md](02-shell-and-ia.md) | 应用外壳与信息架构（**结构契约**）；文中 `TopRail`/`NavRail`/`StatusBar` 三件已删，现行实现是 16 号 `GameFrame` 四区 + 右侧经济坞 | 前端 + 产品 |
| [03-page-specs.md](03-page-specs.md) | 8 个页面的逐页规格与布局栅格 | 前端 |
| [04-motion-system.md](04-motion-system.md) | 动效分层、时长标度、编排、性能与降级 | 前端 |
| [05-component-inventory.md](05-component-inventory.md) | 239 个文件的 A/B/C/D 处置清单（2026-10-28 基线；当前 374 个 `ts/tsx`） | 前端 |
| [06-economy-surfaces.md](06-economy-surfaces.md) | 银行/公司/产权/法院/破产 5 个新界面蓝图 | 前端 + 后端确认 |
| [07-frozen-contract.md](07-frozen-contract.md) | 冻结区清单 + 契约规范（端点清单以 `docs/api/endpoints.md` 为准）+ 请求体实测 | 全体 |
| [08-migration-and-acceptance.md](08-migration-and-acceptance.md) | 4 阶段实施计划、验收标准、性能预算、回滚 | 全体 |
| [09-state-and-context.md](09-state-and-context.md) | **状态一致性**：共享容器 / 语境化面板 / 信息桥 / 状态词表 | 前端 + 设计 |
| [10-backend-requirements.md](10-backend-requirements.md) | **后端改造清单**（P0 阻塞 / P1 正确性 / P2 功能缺口） | 后端 + 决策者 |
| [11-server-authority.md](11-server-authority.md) | **服务器权威 + 客户端预测**：权威分级 / 预测-校正协议 / 迁移路线 | 全体 |
| [12-backend-second-pass.md](12-backend-second-pass.md) | **后端第二遍**（服务端自身完整性）+ 对 10 的 3 条勘误 | 后端 + 决策者 |
| [13-css-cleanup.md](13-css-cleanup.md) | CSS 清理：删除清单与复核方法 | 前端 |
| [14-amber-cockpit.md](14-amber-cockpit.md) | 第一轮换肤（冷金属 + 琥珀）——**视觉条款已被 15 取代**，仅留结构记录 | 前端 |
| [15-game-hud.md](15-game-hud.md) | **当前视觉权威**：深空 HUD 皮肤、首页重做、经济坞常驻 | 全体 |
| [REVIEW-2026-10-28.md](REVIEW-2026-10-28.md) | **文档 ↔ 代码一致性复核**（13:0x 审 + 15:5x 关闭状态，只看 §0.1） | 全体 |
| [16-shell-unification.md](16-shell-unification.md) | **统一外壳**：8 页共享 `GameFrame`、列表进左轨、世界内移动零刷新（P0–P6 已完成） | 前端 + 产品 |

建议阅读顺序：`README → 00 → 01 → 02 → 04 → 03 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 15 → 16 → REVIEW §0.1`。

> **09 是横切约束**：它规定的状态词表与 `<Status>` 组件，是所有面板必须遵守的写法，
> 与 01 的 token 同级 —— 违反它的 PR 等同于硬编码颜色。

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
| 同屏无限循环动画 | 68 处 `animate-*` 中多数无节制 | ≤ 2 | 人工 + 运行时断言 |
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

---

## 8. 变更记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-10-28 | v1.7 | **文档收口（15:5x 复测，只改文档）**：<br>· 复核报告 4 条 P0 硬错全部关闭，`REVIEW-2026-10-28.md` 增 §0.1 关闭状态表<br>· 数字对齐：README §1 端点 197→**218**、前端用量 40→57/63、复核脚本注头改 218/21 蓝图/264 文件 80,312 行/`0127`；05 增 §附录 基线→现值拆解（+25 文件 / +7,698 行）<br>· 12-C 部分关闭：`docs/api/openapi.json` 已由生成器产出（OpenAPI 3.1 / 204 path / 218 op / 81 schema）<br>· `render-transplant/README.md` 端点 211→218、补运行态与本机构建命令；阶段 4 完成（renderer 常驻 + 16 探针预热，前端 264→265 文件 / 80,312→80,764 行）<br>· 07 新增 **§3.23 券商与多场地挂牌**（`brokers` 9 条请求体/响应/错误码/限流）；07 §3.22 幂等口径改成逐条实测（market 13 写 + brokers 6 写 = 19，其中 14 需键 / 5 豁免）<br>· 08 新增 §12「三条线边界」：后端零改动闸门只约束 A 线 |
| 2026-10-28 | v1.0 | 初版 10 篇 |
| 2026-10-28 | v1.1 | 对齐后端 0123–0124（`20c5bbb`）：<br>· 00 新增 §3.1 增量登记、§3.2 契约缺口（`/stocks` 不返回 `exchange_id`/`fee_bps`）<br>· 06 市场面板由 3 tab → **9 个子分区**（新增 做市 / 交易所 / 拆股 / 指数 / 两融 / 发行 / 分红），补 §2.1–§2.7 实现级规格<br>· 06 §10 修正：子交易所**当前实现为付费即开**（5,000 cc4 牌照费），无议会动议校验<br>· 07 §3.20 查询参数表实测化（仅 10 个端点支持）、新增 §3.21 响应缺口、§3.22 新端点请求体<br>· 05 统计口径重算（A 79 / B 13 / C 33 / 保留 109 / E 5 = 239 文件）、D 组细化为 48 个<br>· 08 P3 由 8 → 9 人日，总计 24 → 25 人日 |
| 2026-10-28 | v1.6 | **后端补齐 + 契约去手抄 + 前端 P0 落地**：<br>· 07 §3 改为「生成式清单」：权威来源 `docs/api/endpoints.md` / `openapi.json`，由 `scripts/gen_api_docs.py` 生成，`--check` 进 CI<br>· 端点 211 → **218 / 21 蓝图**（+halt/resume、admin_ops×3、meta/error-codes、events），迁移 head `0127_domain_events`<br>· 10 的 P0-2/P0-3/P0-4/P0-5、P1-1/P1-3/P1-5/P1-6 与 12-A/B/D/E 落地（详见 10 §2 实施状态表）<br>· 07 §3.19 旧 `/api/*` 补全 22 条（含 3 条 3D `rendering-data`）<br>· 新增 `docs/architecture/module-dependencies.md`：模块所有权 + 事件表 + 边界 CI；`legal` 不再写 `company_*`<br>· 前端首个切片：`js/ui/*` + `js/economy/*`（资产/银行/市场/活动四面板）接真实接口，挂在主页右下角 |
| 2026-10-28 | v1.5 | 后端清单**第二遍**（服务端视角）：<br>· 新增 **12**：勘误 3 条（幂等清理/可观测性/Retry-After 表述）、8 项新发现（分红不除权污染指数、零安全响应头、无 OpenAPI、审计表无查询端点、停牌无运营入口、危险操作无服务端 confirm、金额迁移缺快照测试、新接口 N+1）<br>· 10 顶部加勘误指引，P1-6 表述修正<br>· 三遍合并总量 ≈ 29.5 人日，其中 A+B+C 9.7 人日为硬门槛 |
| 2026-10-28 | v1.4 | 确立「**服务器权威 + 客户端预测**」路线：新增 **11**（权威分级 A/B/C、预测-校正协议、`travel/quote\|commit` 与 `/ship` 设计、S1–S4 共 11 人日）；**推翻 10 P0-6**（状态派生改为必做下沉）；09 修订（`ShellProvider` = 基线 + 意图队列合成器） |
| 2026-10-28 | v1.3 | 对齐工作区 0125–0126（券商/多挂牌场地/归档分区/并股碎股）：<br>· 07 端点全量更新 197 → **211 / 20 蓝图**，新增 §3.4b `brokers`（9）、market 13 → 18（+复权与归档 ×5）<br>· 00 蓝图表补 `brokers`，market 计数修正<br>· 06 市场面板 9 → **10 子分区**，新增 §2.7 券商与场地（firm / membership / account / venue 四角色 + 路由规则）<br>· **新增 10 后端改造清单**：P0 ×6（阻塞前端）、P1 ×6（幂等缺失/并发空转/类型混乱/无事件流）、P2 ×18 |
| 2026-10-28 | v1.2 | · 新增 **09 状态一致性**（共享容器 / 三语境密度 / 信息桥 / 11 个 statusId）<br>· 01 中性色阶整体提亮（原 `n-700` 仅 3.27:1，不达 4.5:1），字号下限规则化<br>· 预览 `preview/planet.html` 同步提亮，并用同一个 `<Status>` 渲染三处「护盾离线」 |

### 复核命令（每次后端有新增时跑一遍）

```bash
# 端点总数（权威清单见 docs/api/endpoints.md；实测值见本节末）
grep -rh "^\s*@bp\.\(get\|post\|put\|delete\|patch\|route\)" server/api/v1/*.py | wc -l
ls server/api/v1/*.py | grep -v __init__ | wc -l

# 契约一致性（生成的 openapi.json / endpoints.md 与代码是否同步）
python scripts/gen_api_docs.py --check

# 前端规模（实测值见本节末）
find atlas-ui/react/static -type f | wc -l
find atlas-ui/react/static -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.css" \) -print0 | xargs -0 cat | wc -l
find atlas-ui/react/static/js \( -name "*.ts" -o -name "*.tsx" \) -print0 | xargs -0 cat | wc -l

# 迁移 head（必须与 server/config.py 的 DEFAULT_REVISION 一致）
grep DEFAULT_REVISION server/config.py
```

> 行数统计用 `xargs -0 cat | wc -l`（`-exec wc -l {} + | tail -1` 只取到最后一个 `total`，会严重偏小）。
>
> **2026-11-02 实测**：端点 **255** 个 / 蓝图 **26** 个、`ts/tsx` **368** 文件 / **89,738** 行
> （全量含 js/css 为 387 文件 / 94,659 行）、迁移 head `0141_job_catch_up`。
>
> <!--fact:api.endpoints=255--> <!--fact:api.blueprints=26--> <!--fact:frontend.ts_files=368--> <!--fact:frontend.ts_lines=89,738--> <!--fact:migrations.head=0141_job_catch_up-->
