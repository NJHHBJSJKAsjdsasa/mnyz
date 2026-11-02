# 00 · 现状审计

> 审计对象：`atlas-ui/react/static/`（239 个文件）、`atlas-ui/template/*.html`（11 个）、
> `tailwind.config.js`、`vite.config.mjs`。  
> 审计时间：2026-10-28。以下数字均为实测，非估算。

---

## 1. 技术栈实况

| 层 | 现状 |
|---|---|
| 构建 | Vite 7.3 + `@vitejs/plugin-react`，8 个 entry（`__main__` / `__galaxy__` / `__system__` / `__planet__` / `__onboarding__` / `__error__` / `__faq__` / `__multiverse__`） |
| UI | React 19.2（函数组件 + `lazy`/`Suspense`），无一状态库、无一组件库、无路由库 |
| 样式 | Tailwind 3.4 + `css/global.css`（2,209 行手写 keyframes/工具类）+ `css/preloader.css` |
| 3D | Three.js 0.183 原生（非 react-three-fiber），自研 `EffectRegistry` 驱动行星效果 |
| 数据 | `Utils/ServerApi.tsx`（653 行，单例类）+ `Utils/ServerBridge.tsx`；其余玩法状态在 `localStorage` |
| 服务端渲染 | Jinja2 输出 `<script type="application/json" id="...">` 数据岛，挂载点 `#atlas-react-root` |

页面（Flask 路由，**不可改**）：

```
/                      index.html      MainLayout            导航 / 坐标选择
/onboarding            onboarding.html OnboardingLayout      首次配置
/universe-faq          faq.html        FaqLayout             文档
/multiverse            multiverse.html MultiverseLayout      节点网格
/navigate (POST)       —               服务端跳转             
/galaxy[/<page>]       galaxy.html     GalaxyLayout          星系列表 + 3D
/system/<int>          system.html     SystemLayout          轨道 + 行星列表
/planet/<name>         planet.html     PlanetLayout          行星主视图
/stargate/<encoded>    —               重定向
```

---

## 2. 代码量分布（72,614 行）

| 目录 | 行数 | 占比 | 性质 |
|---|---:|---:|---|
| `js/3DEffects/` | 25,161 | 34.7% | **冻结**（行星效果注册表、56 个效果组件） |
| `js/Components/` | 21,136 | 29.1% | 混合：UI 面板 + 3D Viewer + Overlay |
| `js/Utils/` | 15,005 | 20.7% | 混合：纯前端玩法状态机 + API 客户端 |
| `js/3DComponents/` | 5,662 | 7.8% | **冻结**（行星渲染核心） |
| `js/Layouts/` | 2,423 | 3.3% | 8 个页面布局 —— **重设计主战场** |
| `css/` | 2,310 | 3.2% | 全站样式 |
| `js/Icons/` | 385 | 0.5% | 20 个手写 SVG 图标 |
| `js/Hooks` + `js/MountPoints` | 363 | 0.5% | 挂载与单 hook |

**关键结论**：3D 相关代码（`3DEffects` + `3DComponents` + `Config`）= 30,992 行 ≈ **42.7%**，
全部冻结。真正的 UI/样式/交互代码只有 **≈ 41,400 行**，其中可复用的新设计骨架约需 6,000–8,000 行。
换句话说：**冻结区比要改的部分还大**，重设计必须严格贴着边界做，不能"顺手重构"。

---

## 3. 接口使用率

后端已注册 **218 个** `/api/v1` 操作（21 个蓝图；权威清单见 `docs/api/endpoints.md`，由
`scripts/gen_api_docs.py` 从路由生成，不再手抄），另有 **22 条** `/api/*` 旧端点
（9 条玩法数据面 + 3 条 3D `rendering-data` + 10 条 p2p/p2pv2；前端实际调用 9 条）。
前端 `ServerApi.tsx` 实际封装 **57** 条 v1 路径，全站组件共 **63** 条。

| 蓝图 | 端点数 | 前端是否使用 | 说明 |
|---|---:|---|---|
| `assets` | 38 | 部分（stations/fleet/residents/wrecks/siege） | 联盟、殖民、建造无 UI |
| `bank` | 28 | **0** | 九级货币、存贷、汇率、存单、同业、保险、合规基金 —— 全部无入口 |
| `stocks` | 16 | 6 | 无 IPO / 做空 / 保证金 / 分红 / 退市 UI |
| `court` | 15 | **0** | 诉讼、合议庭、执行、跨区承认 —— 全部无入口 |
| `commerce` | 14 | **0** | 公司注册、章程、股东会、关联交易 —— 全部无入口 |
| `market` | 18 | 1 | 只有 `/market/indices` 被 `StockMarketPanel` 用到；交易所/做市/拆股/归档/复权无 UI |
| `brokers` | 9 | **0** | 券商/多挂牌场地（0125）全部无入口 |
| `economy` | 11 | 9 | 行星市场、合同、飞船、科技基本齐 |
| `explore` | 9 | 6 | — |
| `properties` | 10 | **0** | 产权登记、挂牌、拍卖、持有税 —— 全部无入口 |
| `insolvency` | 7 | **0** | 破产/重整/清算 —— 全部无入口 |
| 其余 8 个蓝图 | 36 | 部分 | auth 7 / internal_dt 7 / admin_ai 6 / council 5 / cutover 5 / revenue 2 / session 2 / tasks 2 |

**这是本次重设计的第一价值点**：`docs/cosmic-economy` 01–10 分册实现的经济系统，
玩家在界面上看不到其中 **5 个子系统（银行 / 公司 / 产权 / 法院 / 破产）**，
共 **74 个端点**沉睡。补齐这些界面不需要任何后端改动。

### 3.1 最近一轮新增能力（`20c5bbb` / 0123–0124）与前端缺口

| 能力 | 端点 | 前端现状 | 缺口 |
|---|---|---|---|
| 子交易所（牌照 5000 cc4、自定 `fee_bps` / `listing_fee` / `max_listings`） | `GET /exchanges`、`POST /exchanges` | 无 | 市场面板需增「交易所」子分区 |
| 做市程序（`mm_programs` + `mm_refresh_tick` 60s 自动重挂双边） | `GET/POST/DELETE /stocks/<t>/mm-program` | 无 | 需「做市」子分区，且必须展示 `last_run_at` / `last_error` |
| 手动双边报价 | `POST /stocks/<t>/quotes` | 无 | 与做市程序同区 |
| 拆股复权（价格/股本/持仓/成本/K 线同比例、挂单全撤） | `POST /stocks/<t>/split` | 无 | 危险操作，需影响预览 + 二次确认 |
| K 线冷归档（30 天前 1m/5m） | `POST /admin/market/candles/archive` | 无 | **不建入口**（`admin`/`ops` 专属） |
| 价格指数 | `GET /market/indices`、`/points?limit=` | **已有**（`StockMarketPanel` 顶部一行） | 只做了展示，缺指数详情序列图 |
| 玩家合议庭（3+2 抽签、回避、多数裁决） | `GET /court/panels/<id>`、`/strike`、`/vote` | 无 | 并入法务面板 |
| 多币种清算（`insolvency_claims.paid_q1`） | `POST /insolvency/<id>/liquidate` | 无 | 并入破产面板 |

### 3.2 契约缺口（**已修复** 2026-10-28 12:50）

原缺口：`GET /stocks` 与 `GET /stocks/<ticker>` 共用 `_payload_listing()`，
返回 16 个字段但**不含 `exchange_id`，也不含 `fee_bps`**，尽管 `stock_listings.exchange_id`
在库里存在（`repo/stocks.py::LISTING_COLUMNS` 一直有 select）。后果是前端
不能按交易所分组、不能在下单前显示费率、交易所清单与股票清单只能并列。

**现状**（`server/domain/stock_service.py::_payload_listing()`）：新增 4 个字段，纯增量。

| 新字段 | 类型 | 含义 |
|---|---|---|
| `exchange_id` | uuid 字符串 | 主挂牌交易所 id |
| `exchange_code` | string | 主挂牌交易所代码（原 `PRIMARY` 占位符已改为真实代码） |
| `fee_bps` | int | 主场地费率（0–100） |
| `venues` | `[{exchange_id, exchange_code, exchange_name, kind, fee_bps, status}]` | 该标的**全部**挂牌场地 |

实现要点：

- 列表接口走 `repo/brokers.py::venues_for_listings()` 一次 `WHERE listing_id = ANY(...)`，
  **不产生 N+1**；`GET /stocks` 的 SQL 次数与页大小无关（每条 listing 仍各有 1 次公司查询，属既有行为）。
- `listing_venues` 无记录的老数据不返回空数组，而是回退成主交易所的合成场地
  （`_primary_venue()`，同时修掉了旧的下单响应里 `venue: "PRIMARY"` 的假代码）。
- `venues` 含 `suspended` 场地（前端可显示"已撤牌"），`_resolve_venue()` 仍只在 `active` 里路由。

前端因此**解锁**：按交易所分组、股票行交易所徽章、下单面板显示"本笔费率 / 券商佣金"、
交易所与股票清单联动。契约细节见 [06 §2.5](06-economy-surfaces.md)。

### 3.3 0125–0126 新增能力与前端缺口

| 能力 | 端点 | 响应要点 | 前端现状 | 缺口 |
|---|---|---|---|---|
| 券商会籍与经纪佣金 | `POST /brokers/firms`（2000 cc4）<br>`POST /brokers/memberships`（500/所，`commission_bps` 0–100 默认 5）<br>`POST /brokers/accounts`、`GET/DELETE /brokers/accounts/me`<br>`GET /brokers/me` | 佣金 = `min(账户, 会籍)` bp，**叠加**在交易所费之上、付给券商；`/brokers/me` 给 firm/memberships/clients/earned/recent_commissions | 无 | 06 §2.7 已定；缺 `UI`：券商视图（会员表 + 客户表 + 佣金收入） |
| 跨所路由（同一标的在多所挂牌） | `POST /stocks/<t>/orders` 增 `venue_code`；`GET/POST/DELETE /stocks/<t>/venues` | 下单响应 `venue`（代码）；订单响应只有 `venue_id`（uuid） | 无 | **残留缺口**：`_payload_order()` 的 `venue_id` 是 uuid，前端无法映射成代码 —— 需要后端补 `venue_code`（1 行）或前端用 `venues[]` 自建映射 |
| 并股碎股处理 | `POST /stocks/<t>/split`（`ratio` 0.01–100） | 反向拆并的碎股按拆后价折现，从**公司金库**支付；响应增 `cash_in_lieu`、`holders_rounded` | 无 | 影响预览必须多一行"碎股折现总额"，且金库不足会 422（文案要能解释） |
| 复权因子 | `GET /stocks/<t>/adjustment-factors` | `{last_price, cumulative_factor, splits:[{ratio, factor, executed_at}]}`，`factor` 为累计值 | 无 | K 线区需"不复权/前复权"切换；接口只给因子，序列要前端算 |
| 归档分区与冷备 | `GET/POST /admin/market/archive/partitions`<br>`POST /admin/market/archive/cold`、`/restore`<br>`POST /admin/market/candles/archive` | 分区清单、冷备分离、恢复 | 无 | **不建入口**（全部 `admin`/`ops` 门控，见 06 §2.8） |

---

## 4. 八类问题与量化证据

### 4.1 样式真源分裂（3 份，互不同步）

- `tailwind.config.js` 只定义了 5 个颜色（`atlas-dark` / `-blue` / `-accent` / `-green` / `-cyan`），
  全站几乎没人用；实际用的是 Tailwind 默认色板（`slate-900` / `purple-400` / `blue-400`）。
- `css/global.css` 手写 88 个 `@keyframes`、76 处 `animation:` 声明、~120 个工具类。
  其中 **4 个 keyframe 名字重复定义两次**：`slideUpFadeIn`、`slideDownFadeOut`、`slideInRight`、`slideOutLeft`
  （后者定义在文件尾部，覆盖前面的版本 —— 行为依赖声明顺序）。
- 组件内联色值：`#0ff`、`rgba(96,165,250,.8)`、`from-blue-400 via-purple-400 to-pink-400` 等散落各处。
- 同类工具名并存：`animate-fade-in` 与 `animate-fadeIn`、`animate-slideUp` 与 `animate-slideUpFadeIn`。

### 4.2 圆角与材质失序

```
rounded-lg   144 次
rounded-full  95 次
rounded-xl    40 次
rounded-2xl   29 次
rounded-md    19 次
rounded-3xl    1 次（+ 各种 rounded-t/tr/bl）
```

9 种圆角并存，没有语义。同一层级的卡片在行星页是 `rounded-2xl`，在实验舱内是 `rounded-lg`，
在按钮上是 `rounded-lg`，在工具栏是 `rounded`。

材质同理：`backdrop-blur` 出现 **84 次**、`bg-white/` 出现 **162 次**。
"玻璃卡片"从一种设计语言退化成默认填空 —— 所有东西都浮起来，等于没有层级。

### 4.3 信息架构崩塌（最严重）

`Components/ExplorationLab.tsx`（126 行）把行星页全部功能塞进一个面板的 **12 个平铺标签**：

```
🔍 地质扫描  🛰 星际贸易  🛠 飞船改装  📜 远征合同  🏗 空间站  🏭 生产线
🧪 科技树    🧭 同行者    📖 图鉴      🎯 周目标    🏛 宇宙议会  📈 星际股市
```

问题：

1. 12 个标签用 emoji 当图标，无分组、无层级、无使用频率排序；
2. `flex flex-wrap` 在 375px 宽屏上折成 4–5 行，占掉半屏；
3. 标签状态只在组件内 `useState`，刷新即丢，无法分享/回退；
4. 12 个面板共享一个容器，任何一个面板的加载态都会拖住整块；
5. **经济系统 5 大子系统在这里连标签位都没有**。

### 4.4 首屏五层遮罩串行

导航页首次进入的渲染链：

```
preloader.html（120 行 HTML）
  → StarfieldWarpReveal（779 行，全屏 canvas + 逐帧动画）
    → MatrixTextReveal（486 行，逐字符 terminal 打字）
      → MultiverseTransitionCanvas（985 行，全屏 canvas）
        → AdaptivePreloadCanvas（260 行，第二层预载 canvas）
          → 实际内容
```

且 `MainLayout` 在 `useEffect` 里 `fetch("/api/universe/config")` 之后才 `setShowWarpReveal(true)` ——
**首屏 LCP 被一次网络往返 + 若干秒动画锁死**。`localStorage.getItem("atlasIntroSeen")` 只是把它降为"第二次不看"，
新用户 100% 命中。

### 4.5 定时器泛滥

全站 `setInterval` 共 **40 处**，间隔分布：

```
1000ms × 15    5000ms × 4    15000ms × 2    30000ms × 3    60ms × 2（轮询式自旋）
```

同一次页面停留中同时运行的定时器，`/` 页最多 5 个：

| 组件 | 间隔 | 目的 |
|---|---|---|
| `Header` | 1000ms | 轮询 `UniverseDetection.isRemoteUniverse()` |
| `__main__` | 1000ms | 反复 `JSON.parse` 同一个 `<script>` 数据岛 |
| `__main__` | 1000ms | 刷新宇宙年龄（秒级显示） |
| `__main__` | 5000ms | 重算航行票价 |
| `FuelBars` | 5000ms | 重读 12 种资源 |

其中 3 个是"读同一个只读常量"，本可以一次性读取 + 1 个 tick 统一驱动。

### 4.6 动效无纪律

- `animate-pulse` / `animate-spin` / `animate-bounce` / `animate-ping` 直接引用 **68 处**
  （pulse 40 / spin 18 / ping 8 / bounce 2，15:5x 复测；12:00 基线为 60，增量来自 `realistic3/` 与 `economy/` 面板），
  多数是装饰性、无限循环；
- 全屏级无限动画：`digital-rain`（`matrix-char` 5s linear infinite）、
  `scan-horizontal/vertical`（4 条）、`particle-drift`（4s infinite）、`holographic-shimmer`（3s）、
  `shimmer`（3s）、`neural-pulse`、`warpCharge`/`warpReady`（1s/2s）……；
- `prefers-reduced-motion: reduce` 只关掉了 8 个类名，且写错了两个不存在的类
  （`holographic-shimmer` / `digital-rain` 是 keyframe 名不是类名）；
- 时长混用 `duration-200/300/500/700`，没有标度；缓动只有 `ease-out`/`ease-in-out`/`ease-in` 三种，
  入场动画普遍用线性或 `ease-out` 加 `scale(0.95)`，文字在缩放过程中会重排发虚。

### 4.7 可访问性缺失

- `FuelBars` 的展开按钮是 `<div onClick>`（无 `role`、无 `tabIndex`、无键盘事件）；
- `ExplorationLab` 的 12 个标签是裸 `<button>`，无 `aria-selected` / `role="tablist"`；
- 全站无 `:focus-visible` 样式（Tailwind 默认 `outline` 被 `global.css` 的自定义滚动条与背景覆盖后不可见）；
- 主要文本色 `text-gray-400`（#9CA3AF）叠在 `bg-white/5` + `from-slate-900` 之上，
  实测对比度 ≈ 4.1:1，低于 4.5:1；
- 12 个 emoji 图标无 `aria-label`，屏幕阅读器读作"放大镜""卫星"等无关词。

### 4.8 响应式靠双写 DOM

`__main__.tsx` 里宇宙信息块写了两遍（`hidden sm:flex` 桌面版 + `flex sm:hidden` 移动版，各 ~30 行），
同样模式在 `FuelBars`（两套内层结构）、`PlanetVisualizationUniversal`（全屏面板页头两套）重复出现。
改一处文案要改两处，已经出现"桌面显示远程种子 / 移动漏掉远程比特大爆炸"的不一致。

---

## 5. 值得保留的东西（不要推倒重来）

| 资产 | 评价 |
|---|---|
| `ServerApi` 单例 + `Idempotency-Key` 生成 | 契约清晰，幂等头统一，直接复用 |
| `StockMarketPanel` 的手写 SVG K 线 | 零依赖、可打印、涨红跌绿已正确，只改皮 |
| `Icons/` 20 个手写 SVG | 风格统一，扩展到 40 个即可覆盖新导航 |
| `EffectRegistry` 的注册表模式 | 冻结，但它的"注册-消费"思路可复用到 UI 面板注册 |
| `data-universe-config` 数据岛 | 避免了一次网络请求，保留 |
| 坐标选择器的"输入即预览 3D"交互 | 交互创意好，保留行为，只换外观与信息密度 |

---

## 6. 审计结论

1. **不要重写**。72,614 行里 43% 是冻结的 3D，29% 的 `Components` 里一半是 3D 外壳。
   可行的路径是"**换壳 + 换皮 + 加面板**"，而非重写。
2. **优先级不是视觉，是入口**。74 个经济端点没有 UI，这是产品级缺口，视觉再美也补不上。
3. **样式必须先收口**。在 token 层建立之前改任何组件，都会把 9 种圆角变成 12 种。
4. **动效必须先定纪律**。否则新组件会继承旧的"到处脉冲"习惯。
