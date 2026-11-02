# 07 · 冻结契约

> 本文件是重设计的**护栏**。任何改动落在本文标红的位置，就是越界。
> 三块冻结：**① 行星/星系渲染代码 ② 服务端注入的数据契约 ③ `/api/v1` 全量端点**。

---

## 1. 冻结区 · 渲染代码

### 1.1 文件清单（78 个，40,124 行，占全站 55.3%）

```
atlas-ui/react/static/js/3DComponents/          6 文件   5,662 行
atlas-ui/react/static/js/3DEffects/            56 文件  25,161 行
atlas-ui/react/static/js/Config/UniversalRenderer.ts      169 行
atlas-ui/react/static/js/Components/
    Galaxy3DViewer.tsx                        1,451
    Galaxy3DViewerFullscreen.tsx              1,194
    SolarSystem3DViewerLeft.tsx                 824
    SolarSystem3DViewer.tsx                     630
    SolarSystem3DViewerFullscreen.tsx           415
    Universe3DViewer.tsx                        445
    Universe3DViewerFullscreen.tsx              378
    GalaxyVisualization.tsx                     190
    SystemVisualizationUniversal.tsx            263
    PlanetVisualizationUniversal.tsx            263   ← 半冻结
    CoordinateViewer3D.tsx                      302
    MultiverseTransitionCanvas.tsx              985   ← 半冻结
    StarfieldWarpReveal.tsx                     779   ← 半冻结
    UniverseAnimationCanvas.tsx                 753
    AdaptivePreloadCanvas.tsx                   260
```

### 1.2 判定方法（改之前先跑）

```bash
# 1. 该文件是否直接用了 three / @react-three
grep -l "from \"three\|@react-three" js/**/*.tsx

# 2. 该文件是否被 3D 组件导入（反向依赖）
grep -rn "from \"./\(ModularPlanetRenderer\|EffectRegistry\|PlanetLayerSystem\|MoonSystem\)" js

# 3. 该文件是否产出 canvas / WebGL
grep -l "createElement(\"canvas\")\|new WebGLRenderer\|getContext(\"webgl" js/**/*.tsx
```

任一条命中 → **A 组，不改**。

### 1.3 半冻结的三个文件

| 文件 | 允许的改动 | 禁止的改动 |
|---|---|---|
| `PlanetVisualizationUniversal.tsx` | ① 外层容器 `className`（尺寸/边框/圆角/背景）② 删除英文标题与副标 ③ 按钮位置与样式 | 三个 state 的时序、`setTimeout(...,800)`、`ModularPlanetRendererWrapper` 的 props、`planetData` 字段、`planetRendererRef` 的调用点 |
| `StarfieldWarpReveal.tsx` | ① 何时挂载/卸载 ② 跳过逻辑（`Esc` / 点击）③ 与 `fetch` 解耦 | 内部 canvas 绘制、时长常量 |
| `MultiverseTransitionCanvas.tsx` | ① 从"常驻背景"改为"点击后播放一次" ② 播放完成后卸载 | 内部 canvas 绘制 |

### 1.4 硬性行为要求

> **打开/关闭任何经济面板，3D 场景不得重新初始化。**

现状 `PlanetVisualizationUniversal` 在挂载时 `setTimeout(800)` 后 `setCanvasHidden(true)`，
一旦组件被卸载重挂，行星纹理会重新生成（1–3 秒黑屏 + GPU 峰值）。

因此 `PanelHost` 必须用：

```tsx
// ✅ 保活：仍占布局位置，但不可见不可交互
<div style={{ visibility: active ? "visible" : "hidden" }} aria-hidden={!active}>
  {children}
</div>

// ❌ 三种都会卸载或销毁 canvas
{active && children}
<div style={{ display: active ? "block" : "none" }}>{children}</div>
<Activity mode={active ? "visible" : "hidden"}>{children}</Activity>
```

> `display: none` 会让 `<canvas>` 丢失 WebGL context（浏览器回收），重新显示时 Three.js 需要重建。
> `visibility: hidden` 保留 context，但**保留渲染开销** —— 因此面板打开时对 3D 容器加
> `frameloop` 降频由现有 `decelerateRef` 机制处理，不引入新逻辑。

### 1.5 diff 审查规则

任何 PR 涉及以下路径，必须由第二人 review，且 PR 描述里说明"为什么必须改"：

```
atlas-ui/react/static/js/3DComponents/**
atlas-ui/react/static/js/3DEffects/**
atlas-ui/react/static/js/Config/UniversalRenderer.ts
atlas-ui/react/static/js/Components/{Galaxy,SolarSystem,Universe}*3D*
```

---

## 2. 冻结区 · 模板数据契约

`atlas-ui/template/*.html` 是**服务端唯一的输出面**。前端只读取，不可重命名。

### 2.1 数据岛（`<script type="application/json" id="...">`）

| id | 出现页面 | 字段 |
|---|---|---|
| `data-universe-config` | 全部 | `{ remote, seed_name, node_id, seed_str, cosmic_origin_time }` |
| `planet-data` | `/planet/<name>` | `name, planet_type, atmosphere, life_forms, mass, diameter, density, gravity, orbital_radius, orbital_period_seconds, orbital_speed, axial_tilt, rotation_period_seconds, surface_temperature, elements[], seed, orbital_radius_m, index` |
| `system-data` | `/planet/<name>` | `{ name, index, planets: [{name}] }` |
| `galaxy-data` | `/planet/<name>` | `{ name, coordinates: number[] }` |
| `meta-data` | `/planet/<name>` | `{ planet_url, version, image_url, cosmic_origin_time, initial_angle_rotation }` |

**不可改**：id 名、字段名、字段类型、JSON 结构。前端 `MountPoints/*.ts` 依赖它们。

### 2.2 挂载点

| id | 用途 |
|---|---|
| `atlas-react-root` | 所有页面的 React 根 |

### 2.3 Jinja 全局变量（模板可见）

`version`、`versionHash`、`run_mode`、`universe_config`、`planet`、`system`、`galaxy`、
`planet_url`、`cosmic_origin_time`、`initial_angle_rotation`、`planet_index`、`page`、
`error`、`message`

### 2.4 前端自定义事件（约定，不改）

| 事件 | 触发 | 监听 |
|---|---|---|
| `atlas:login-required` | `ServerApi.ensureSession()` 失败 | `ServerAuthPanel` |
| `planet-close-fullscreen` | 全屏查看器关闭 | `PlanetVisualizationUniversal` |

---

## 3. 冻结区 · `/api/v1` 全量端点（242 个操作 / 23 蓝图）

> **权威清单不再手写。** 由 `python scripts/gen_api_docs.py` 从 Flask url map 生成：
> - 机器可读：`docs/api/openapi.json`
> - 人可读：`docs/api/endpoints.md`（按蓝图分组）
>
> 本节的职责从「抄一份端点表」改成「声明哪些不许改」，因为手抄的表一定会漂移
> （197 → 211 → 218 已经漂了两次，见 12 §C）。

| 蓝图 | 操作数 | 前端 | 备注 |
|---|---:|---|---|
| `assets` | 38 | 部分 | 联盟/殖民/建造无 UI |
| `bank` | 28 | 0 | 九级货币、存贷、存单、同业、保险、合规基金 |
| `market` | 20 | 1 | 新增 `admin/stocks/{t}/halt|resume` |
| `stocks` | 16 | 6 | 无 IPO/做空/保证金/分红/退市 UI |
| `court` | 15 | 0 | 诉讼、合议庭、执行、跨区承认 |
| `commerce` | 20 | 0 | 公司注册、章程、股东会、关联交易；**新增 4**：许可目录/申请/待审/审批，反垄断快照 2 个 |
| `economy` | 12 | 9 | 行星市场、合同、飞船、科技；**新增 `GET /ship`**（hull/shield/status[]） |
| `properties` | 10 | 0 | 产权登记、挂牌、拍卖、持有税 |
| `explore` | 12 | 6 | **+3**：遗迹 2 条（0132）+ 里程碑 `GET /progress/exploration`（0133） |
| `brokers` | 9 | 0 | 券商 / 多挂牌场地 |
| `internal_dt` | 7 | 0 | **前端永不调用**，需 `ATLAS_INTERNAL_TOKEN` |
| `insolvency` | 7 | 0 | 破产/重整/清算 |
| `auth` | 7 | 6 | — |
| `ai_admin` | 6 | 0 | AI 运营（`admin_ai.py`，蓝图名 `ai_admin`） |
| `admin_ops` | 10 | 0 | `admin/audit`、`admin/jobs/runs`、`admin/dlq` + **新增 6**：封号/解封/补偿/公告 ×2/经济仪表盘 |
| `cutover` | 5 | 4 | — |
| `council` | 5 | 5 | — |
| `meta` | 1 | 0 | **新增**：`GET /meta/error-codes`（公开，错误码字典） |
| `tasks` | 4 | 2 | 每日任务 + **周目标 2 条**（0131） |
| `session_state` | 3 | 2 | 新增 `GET /events`（事件流，`?since=<seq>`） |
| `revenue` | 2 | 0 | 分账 |
| `craft` | 2 | 2 | **新增（0130）**：生产线配方/开炉，服务端扣料与冷却 |
| `travel` | 3 | 3 | **新增（0128）**：航行 `quote`/`commit`/`history`，服务端定价与扣费 |

**冻结含义**：路径、方法、请求字段名、响应字段名不得改。新增字段必须可选（`null` 默认），
否则走 `GET /features` 灰度或开 `/api/v2`。

### 3.1 契约校验

```bash
python scripts/gen_api_docs.py --check     # 代码与文档不一致 → 退出码 1
```

### 3.19 旧 `/api/*`（非 v1，同样冻结）— 全量 22 条

**A. 页面/玩法数据面（前端在用，改一条就白屏）**

```
GET    /api/universe/config                    ← Vite 入口前置，首屏依赖
GET    /api/generate-random-location           ← CoordinateSelector 随机跃迁
GET    /api/system-intel?x=&y=&z=&system=      ← 坐标情报
POST   /api/random-jump                        ← 随机跃迁
GET    /api/arecibo                            ← 阿雷西博（当前系统）
GET    /api/arecibo/system/<int:system_index>  ← 501 桩，未实现
GET    /api/planet/<planet_name>/location-data
GET    /api/current-location
GET    /api/multiverse/peers
```

**B. 3D 数据面（前端在用，属「绝不改」）**

```
GET    /api/system/rendering-data              ← SolarSystem3DViewer(Left) 行星轨道数据
GET    /api/planet/rendering-data
GET    /api/planet/<planet_name>/rendering-data
```

> 这三条在 `pymodules/planet_renderer/api_endpoints.py`，不在 `pymodules/__*`。
> 它们服务的是冻结区 3D 组件，**任何字段改动都等于改渲染**。

**C. P2P（前端未调用，后端内部/节点间）**

```
POST   /api/p2p/handshake
POST   /api/p2p/message
GET    /api/p2p/peers
GET    /api/p2p/status
POST   /api/p2pv2/broadcast
GET    /api/p2pv2/detailed
GET    /api/p2pv2/network
GET    /api/p2pv2/peers
GET    /api/p2pv2/stats
GET    /api/p2pv2/status
```

### 3.20 分页与查询参数约定（2026-10-28 后端补齐后）

支持查询参数的端点（16 个）：

| 端点 | 参数 | 默认 / 说明 |
|---|---|---|
| `GET /stocks` | `status`、`limit`、`cursor` | `listed` / `100`（上限 200）/ keyset 游标；响应含 `total`、`has_more`、`next_cursor` |
| `GET /stocks/orders` | `ticker` | 可选 |
| `GET /stocks/<t>/candles` | `interval`、`limit`、`before` | `1m` / `300` / 可选游标 |
| `GET /market/indices/<code>/points` | `limit` | `120`（服务端 clamp 到 500） |
| `GET /properties` | `sector`、`kind`、`status` | 均可选 |
| `GET /bank/quote` | `from_code`、`to_code` | `cc1` / `cc2` |
| `GET /bank/accounts` | `bank_id` | 可选 |
| `GET /residents/offer` | `planet_key` | 必填 |
| `GET /codex` | `kind` | 可选 |
| `GET /players` | `controller` | `ai` |
| `GET /events` | `since`、`limit`、`types`、`aggregate` | `0` / `100` / 逗号分隔 / 可选 |
| `GET /admin/audit` | `actor`、`action`、`since`、`limit` | `100`（上限 500） |
| `GET /admin/jobs/runs` | `job`、`limit` | `50`（上限 300） |
| `GET /admin/dlq` | `limit` | `50`（上限 300） |

**分页模型**：`/stocks` 用 keyset（`next_cursor` 是不透明字符串，前端原样回传），
其余列表仍是「一次拉全量 + 前端切片」，因为它们的量级受业务限制（银行 ≤ 几十家、
产权 ≤ 几千条且默认带筛选）。不要给这些端点臆造 `page`。

`/stocks` 的 `has_more=true` 但 `next_cursor=null` 属于 bug，前端应停止翻页并上报。

### 3.21 响应字段的已知缺口（2026-10-28 复核后）

| 缺口 | 状态 | 影响 |
|---|---|---|
| `GET /stocks` 缺 `exchange_id`/`fee_bps`/`venues` | ✅ 已修（`_payload_listing`） | — |
| `GET /exchanges` 缺 `max_listings`/`listing_count` | ✅ 已修（LATERAL count + 开所可传上限） | — |
| `GET /stocks/<t>/mm-program` 忽略 `ticker` | ✅ 已修（服务端按 ticker 过滤） | — |
| `GET /market/indices` 无 `points` 内联 | 保留 | 指数卡点击展开时才拉序列 |
| `GET /stocks/orders` 只回 `venue_id`(uuid) | **未修** | 前端用 `stocks[].venues` 自建 uuid→code 映射 |
| 金额类型不统一（`/state` int/float vs stocks 字符串） | **未修** | 前端 `Money` 组件必须接受 `string \| number` |
| 无通用分页（除 `/stocks`） | 保留 | 见 §3.20 |

### 3.22 易写错的请求体（实测）

```ts
// POST /api/v1/exchanges            限流 5/小时
{ code: "ALPHA", name: "Alpha 板", fee_bps: 25,
  listing_fee: "1200.0000", max_listings: 30 }   // max_listings 可省 = 不限
// code ^[A-Z0-9]{3,8}$；name ≤ 80；fee_bps 0–100；listing_fee ≥ 0
// 固定扣 5000 cc4 牌照费（actor → treasury），currency_code 写死 cc4，勿传
// 响应：完整交易所行 + licence_fee（含 kind/status/currency_code/operator_actor_id/
//       max_listings/listing_count），开所后无需回查 /exchanges

// POST /api/v1/stocks/<t>/quote     限流 120/小时，无 body
// POST /api/v1/stocks/<t>/quotes    限流 60/小时
{ quantity: 200, refresh: true }      // 都可省
// POST /api/v1/stocks/<t>/mm-program 限流 30/小时
{ quantity: 200 }
// DELETE 同路径无 body，响应 status="paused"（是暂停，不是删除）

// POST /api/v1/stocks/<t>/split     限流 5/天
{ ratio: "2" }                        // Decimal 字符串，0.01–100 且 ≠ 1，仅控股方
// 响应：{ ticker, ratio, last_price, prev_close, cancelled_orders, cash_in_lieu, holders_rounded, adjusts }

// POST /api/v1/stocks/ipo
{ ticker, offer_shares, price, settlement_mode: "t0"|"t1", shortable: true, exchange_code?: "ALPHA" }

// POST /api/v1/admin/stocks/<t>/halt     限流 30/小时（admin/ops）
{ minutes: 60, reason: "异常波动" }
// POST /api/v1/admin/stocks/<t>/resume   无 body

// POST /api/v1/admin/market/candles/archive   { days: 30 }
// POST /api/v1/admin/market/archive/partitions { months_ahead: 3, months_back: 24 }
// POST /api/v1/admin/market/archive/cold      { keep_months: 6 }
// POST /api/v1/admin/market/archive/restore   { partition: "stock_candle_archive_202609" }
```

> **幂等（逐条实测，2026-10-28 16:0x）**：`market` + `brokers` 两个蓝图共 **19 个写端点**
> （market 13 + brokers 6，brokers 另 3 条是 GET）：
>
> | 走 `_write()` → 必须带 `Idempotency-Key` | 豁免（set-state，重放天然 no-op） |
> |---|---|
> | `quote` / `quotes` / `exchanges` / `mm-program`(POST) / `mm-program`(DELETE) / `split` | `admin/market/candles/archive`（幂等 CTE） |
> | `admin/stocks/<t>/halt` / `admin/stocks/<t>/resume` | `admin/market/archive/partitions`（ensure 幂等） |
> | `brokers/firms` / `brokers/memberships` / `brokers/accounts` / `accounts/me`(DELETE) / `stocks/<t>/venues`(POST) / `stocks/<t>/venues/<code>`(DELETE) | `admin/market/archive/cold`、`archive/restore`、`admin/market/index/publish`（重算快照） |
>
> 即 **14 条需幂等键、5 条不需要**。豁免理由写在 `market.py::_write` 与 `brokers.py::_write` 的 docstring 里。
> 前端写法统一：所有 POST/DELETE 都带键（多带给豁免端点是安全的）。

### 3.23 券商与多场地挂牌（`brokers` 蓝图 9 条，实测 2026-10-28 16:0x）

```ts
// ── 券商侧 ─────────────────────────────────────────────────────────
// POST /api/v1/brokers/firms        限流 5/天，走 _write()
{ capital: "50000.0000" }            // Decimal ≥ 0，可省 = 0；固定扣 2000 cc4 牌照费（→ treasury）
// 响应 { firm_id, status:"active", capital, licence_fee:"2000" }
// 已是持牌公司 → 422 unprocessable

// POST /api/v1/brokers/memberships  限流 10/天
{ exchange_code: "ALPHA", commission_bps: 5 }   // code 2–8 位；bps 0–100，默认 5
// 响应 { membership_id, exchange, commission_bps, fee:"500" }
// 固定扣 500（交易所的 currency_code，不一定是 cc4）→ 该所运营方；upsert 语义，重复入会即改费率

// GET  /api/v1/brokers/me           限流 60/分，需持牌
// 响应 { firm:{firm_id,status,capital}, memberships[], clients[], earned{}, recent_commissions[] }
// recent_commissions 最多 20 条：{trade_id,ticker,currency_code,notional,commission_bps,amount,at}

// ── 客户端（投资者）侧 ─────────────────────────────────────────────
// POST /api/v1/brokers/accounts     限流 20/时
{ broker_code: "ACME_FIRM", commission_bps: 3 }  // broker 可传 actor code 或 actor id；bps 可省 = 取券商上限
// 响应 { account_id, broker, commission_bps, status }
// 错误：券商不存在 404 / 给自己开户 400 / 非持牌 422 / 无会籍 422 /
//       bps>券商上限 422（先看 GET /brokers/accounts/me 拿上限，别硬试）

// GET    /api/v1/brokers/accounts/me   限流 120/分 → { account: {...} | null }（无账户返回 null，不是 404）
// DELETE /api/v1/brokers/accounts/me   限流 10/时  → { status:"closed", account_id }

// ── 多场地挂牌 ────────────────────────────────────────────────────
// GET  /api/v1/stocks/<t>/venues        限流 120/分
// 响应 { ticker, venues:[{exchange,exchange_name,kind,fee_bps,status,best_bid,best_ask}] }
// best_bid/ask 是该场地的**独立订单簿**（按 venue_id 隔离），null = 该场地无盘口

// POST /api/v1/stocks/<t>/venues        限流 10/时
{ exchange_code: "BETA", fee_bps: 20 }    // fee_bps 可省 = 沿用交易所费率；0–100
// 响应 { ticker, exchange, fee_bps, status }
// 权限：仅交易所运营方或 admin/ops；交易所非 active → 422

// DELETE /api/v1/stocks/<t>/venues/<code>  限流 10/时，无 body
// 响应 { ticker, exchange, status:"suspended" }（挂起 ≠ 删除，可再次 POST 恢复）
// 主挂牌交易所不能撤（422），要下市请用停牌/退市
```

### 3.24 航行与舰船视图（`travel` 蓝图 3 条 + `GET /ship`，0128 实测）

> 这块是 11 §4 的落地：**燃料从"前端扣"改成"服务端扣"**。前端在 `server` 模式下
> 必须先 quote 再 commit；`off` / `shadow` 模式仍走本地公式。

```ts
// POST /api/v1/travel/quote        限流 240/分，无需幂等键（只写一条报价）
{ kind: "galaxy"|"system"|"planet",
  origin: { x: 1000000, y: 1000000, z: 1000000 },
  target: { x: 1000400, y: 1000000, z: 1000000 } }   // 坐标 0–10,000,000，越界 → 400
// 响应 { quote_id, kind, distance, cost:{antimatter:"100",element115:"80",deuterium:"60"},
//        affordable:false, shortfall:{antimatter:"100"}, eta_seconds, expires_at,
//        expires_in_ms:30000, range:500, in_range:true }
// 付不起**不是错误**：照常返回报价 + shortfall，让 UI 显示"还差多少"
// 公式 = 基础(kind) × max(1, distance/100) × 船体因子 × 科技因子 ÷ 飞船效率，全部服务端算

// POST /api/v1/travel/commit       限流 60/分，**必须带 Idempotency-Key**
{ quote_id: "…36 位…" }
// 响应 { travel_id, status:"in_flight", depart_at, arrived_at, cost, balances, replayed, state_version }
// 错误：报价不属于本玩家 404 / 已过期 410 quote_expired / 燃料不足 409 insufficient_funds /
//       超出射程 400 / 同一报价重复提交 → 200 + replayed:true（不二次扣费）

// GET  /api/v1/travel/history?limit=20   限流 120/分
// 响应 { travels:[{travel_id,kind,distance,cost,status,depart_at,arrive_at}] }

// GET  /api/v1/state  新增 in_flight:[{travel_id,kind,from,to,distance,depart_at,arrive_at}]
// 只返回 arrive_at 还在未来的记录，最多 5 条；首版**不阻塞**二次跳跃（只是"不瞬移回来"）
// GET  /api/v1/state.ship 新增 shield / shield_max（常驻值；战斗中请读 GET /ship）

// GET  /api/v1/ship    限流 120/分
// 响应 { id, level, type, hull, hull_max, shield, shield_max, stats, modules,
//        cargo:{used,cap}, fuel:{balances,floors,can_jump,empty}, status[], state_version }
// status[] 的 id 严格取 09 §3.1 词表：shield.offline / hull.damaged / fuel.low / cargo.full
// ⚠️ 没有 fuel.empty：空油箱是 fuel.low + payload.reason="empty"，severity 升为 critical
// shield 在战斗中读 activity session 的实时值，否则等于 shield_max
```

### 3.25 序列化约定（10 §P1-4 / 12 §G，2026-10-28 起）

| 类型 | 出参 | 工具 | 备注 |
|---|---|---|---|
| 时间戳（`timestamptz`） | ISO-8601 **UTC + `Z`**，毫秒 | `infra/serialize.py::ts` | 不要用 `.isoformat()`：aware 会给 `+00:00`，naive 干脆没有时区 |
| 日历日（`date`） | `YYYY-MM-DD` | `day` | 游戏日、账期、`run_date` |
| 金额（`numeric`） | 十进制字符串 | `money` / `str(Decimal)` | 不做二次 quantize，舍入只发生在 `q4` / ledger |

**已收口（2026-10-28 全量）**：`server/api/**` + `server/domain/**` 的 `.isoformat()` 从 **108 处降到 9 处**，
其余全部走 `ts()` / `day()`。**刻意保留的 9 处**，每处都在代码里写了理由：

| 文件 | 处数 | 理由 |
|---|---:|---|
| `stock_corporate.py` | 4 | `ATTACH PARTITION ... FOR VALUES FROM ('…')` 的分区边界，必须是裸时间戳 |
| `stock_service.py` | 2 | 1 处错误文案（`熔断中…恢复时间`），1 处 **listing id 确定性种子** |
| `ai_economy.py` | 1 | 决策种子 `f"{created_at}|{id}"`，改格式等于改所有 AI 决策 |
| `commerce.py` | 1 | 幂等键种子里的 `period`（date） |
| `auth.py` | 1 | 错误文案（`已锁定至 …`） |

**金额**：`stocks` / `bank` / `properties` / `commerce` 等业务端点早已是 `str(Decimal)`；
`InsufficientFunds` 的 `needed` 仍是 float（错误详情契约，不改）；
`/state.resources` 仍是 number（首屏渲染例外，见下）。

**唯一例外**：`GET /state.resources` 仍是 number。首屏要直接渲染数字，权威金额在
`/wallet` 与各业务端点为字符串；前端改动写界面时不要依赖 `/state` 做算术。

## 4. 写接口调用规范（强制）

```ts
// ✅ 唯一允许的写法
await ServerApi.request(`/api/v1/banks/${id}/deposit`, {
  method: "POST",
  headers: { "Idempotency-Key": crypto.randomUUID() },
  body: JSON.stringify({ currency: "cc1", amount: "5000.0000" }),
});

// ❌ 禁止：绕过 ServerApi（丢失 401 重试、baseUrl、token 注入）
await fetch("/api/v1/...", { ... });
```

约定：

| 项 | 规则 |
|---|---|
| 金额 | 一律传**字符串**（保留 4 位小数），不传 `number`（避免浮点误差） |
| 数量 | 整数传 `number` |
| 时间 | ISO 8601 字符串 |
| 幂等键 | 每个写请求新建，**同一逻辑操作的重试必须复用同一个键** |
| 401 | `ServerApi` 自动重试一次，失败后触发 `atlas:login-required` |
| 429 | 前端冷却：按钮禁用 `Retry-After`（无该头时默认 3s） |
| 响应包 | 统一 `{ data: ... }`，`ServerApi.request` 已解包；面板只拿 `data` |

---

## 5. 契约验证（改完跑这几条）

```bash
# 1. 冻结区零改动（应输出空）
git diff --name-only origin/main...HEAD -- \
  'atlas-ui/react/static/js/3DComponents/**' \
  'atlas-ui/react/static/js/3DEffects/**' \
  'atlas-ui/react/static/js/Config/UniversalRenderer.ts'

# 2. 半冻结区只有薄 diff（应 < 40 行）
git diff --stat origin/main...HEAD -- \
  'atlas-ui/react/static/js/Components/PlanetVisualizationUniversal.tsx' \
  'atlas-ui/react/static/js/Components/StarfieldWarpReveal.tsx' \
  'atlas-ui/react/static/js/Components/MultiverseTransitionCanvas.tsx'

# 3. 模板未改（应输出空）
git diff --name-only origin/main...HEAD -- 'atlas-ui/template/**'

# 4. 前端闸门（v1 直连必须 0；旧 /api/* 必须全在冻结清单内）
python scripts/check_frontend_gates.py

# 5. 后端零改动（应输出空）—— 唯一例外：本仓已把权威下沉到 server/**，见 11 §4
git diff --name-only origin/main...HEAD -- 'pymodules/**'

# 6. 类型零错误
npx tsc --noEmit

# 7. 生成器指纹（改了 Arecibo 绘制代码才需要，脚本会自动判定）
npm run check:arecibo
```

> 第 4 条以前是一条 `grep fetch(`，在有 10 处合法的 3D 数据面调用时**永远为红**。
> 现在由 `scripts/check_frontend_gates.py` 判定：`/api/v1` 直连数必须为 0（`ServerApi.tsx` 除外），
> 旧 `/api/*` 只允许出现在 §3.19 的冻结清单里，新增一处就失败。
> 循环动画数只打印不计分（P4 收口目标；当前 51 处，排除 3D 冻结区 49 处）。
> 同一脚本还带两条硬上限：`backdrop-blur` 计入约束 ≤12、**非渲染面单文件 ≤1200 行**
> （渲染面 = `3DComponents/`、`3DEffects/`、`*3DViewer*`、半冻结三件，豁免理由同 §1）。

---

## 6. 越界的典型征兆

| 征兆 | 说明 |
|---|---|
| PR 里出现 `server/` 或 `pymodules/` 的改动 | 越界（除破坏性 bug 修复，需单独立项） |
| PR 里出现 `atlas-ui/template/` 改动 | 越界（Jinja 变量名是契约） |
| PR 里 `3DEffects/` 有 diff | 越界 |
| PR 里出现 `fetch("/api/...")` 而非 `ServerApi.request` | 越界 |
| 为了"统一风格"给冻结组件加 className 参数 | 越界（除本文件 §1.3 允许的 3 个文件） |
| 新增了 `/api/v1/xxx` 调用但后端没有 | 越界（会 404） |
