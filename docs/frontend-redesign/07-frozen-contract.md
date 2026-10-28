# 07 · 冻结契约

> 本文件是重设计的**护栏**。任何改动落在本文标红的位置，就是越界。
> 三块冻结：**① 行星/星系渲染代码 ② 服务端注入的数据契约 ③ `/api/v1` 全量端点**。

---

## 1. 冻结区 · 渲染代码

### 1.1 文件清单（79 个，40,124 行，占全站 55.3%）

```
atlas-ui/react/static/js/3DComponents/          6 文件   5,662 行
atlas-ui/react/static/js/3DEffects/            57 文件  25,161 行
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

## 3. 冻结区 · `/api/v1` 全量端点（197 个）

> 前端**不得**修改请求路径、方法、body 字段名、响应字段名。
> 前端**必须**遵守：写接口带 `Idempotency-Key` 头；带 `Authorization: Bearer <token>`；
> 依赖 `ServerApi.request()` 的 401 重试逻辑。

### 3.1 `admin_ai`（6）

```
GET    /api/v1/players
GET    /api/v1/players/<player_id>
POST   /api/v1/admin/ai/tick
POST   /api/v1/admin/ai/runtime-pause
GET    /api/v1/admin/ai/providers
POST   /api/v1/admin/ai/providers/<name>
```

### 3.2 `assets`（38）

```
GET    /api/v1/assets
GET    /api/v1/leaderboard
POST   /api/v1/stations
POST   /api/v1/stations/<station_id>/modules/<module_code>
POST   /api/v1/stations/<station_id>/claim
POST   /api/v1/fleet
POST   /api/v1/fleet/<fleet_id>/task
POST   /api/v1/fleet/<fleet_id>/claim
GET    /api/v1/alliances/mine
POST   /api/v1/alliances
POST   /api/v1/alliances/join
POST   /api/v1/alliances/invites
POST   /api/v1/alliances/join-code
POST   /api/v1/alliances/leave
GET    /api/v1/factions
GET    /api/v1/residents
GET    /api/v1/residents/offer
POST   /api/v1/residents/<resident_id>/trade
POST   /api/v1/residents/<resident_id>/meet
GET    /api/v1/planets/<path:planet_key>/colony
POST   /api/v1/planets/<path:planet_key>/claim
POST   /api/v1/planets/<path:planet_key>/build
POST   /api/v1/planets/<path:planet_key>/deposits/claim
POST   /api/v1/challenges
GET    /api/v1/challenges/<path:code>
POST   /api/v1/challenges/<path:code>/fight
POST   /api/v1/combat/start
GET    /api/v1/combat
GET    /api/v1/combat/<session_id>
POST   /api/v1/combat/<session_id>/action
GET    /api/v1/wrecks
POST   /api/v1/planets/<path:planet_key>/salvage
GET    /api/v1/world-planets/<path:planet_key>
POST   /api/v1/world-planets/<path:planet_key>/claim
POST   /api/v1/world-planets/<path:planet_key>/siege
GET    /api/v1/sieges/<siege_id>
POST   /api/v1/sieges/<siege_id>/join
POST   /api/v1/sieges/loot
```

### 3.3 `auth`（7）

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
POST   /api/v1/auth/logout-all
GET    /api/v1/me
POST   /api/v1/session
```

### 3.4 `bank`（28）

```
GET    /api/v1/currencies
GET    /api/v1/wallet/currencies
GET    /api/v1/wallet/entries
POST   /api/v1/wallet/transfer
POST   /api/v1/wallet/bribe
POST   /api/v1/bank/exchange
GET    /api/v1/bank/quote
GET    /api/v1/banks
GET    /api/v1/bank/rates
POST   /api/v1/banks/<bank_id>/deposit
POST   /api/v1/banks/<bank_id>/withdraw
GET    /api/v1/bank/accounts
POST   /api/v1/banks/<bank_id>/loans
GET    /api/v1/bank/loans
POST   /api/v1/bank/loans/<loan_id>/repay
POST   /api/v1/banks/<bank_id>/certificates
GET    /api/v1/bank/certificates
GET    /api/v1/bank/certificate-quotes
POST   /api/v1/bank/certificates/<certificate_id>/quote
POST   /api/v1/bank/certificate-quotes/<quote_id>/buy
POST   /api/v1/bank/certificates/<certificate_id>/redeem
GET    /api/v1/bank/interbank
POST   /api/v1/banks/<bank_id>/interbank/orders
POST   /api/v1/bank/interbank/orders/<order_id>/accept
POST   /api/v1/bank/interbank/orders/<order_id>/repay
GET    /api/v1/bank/insurance
POST   /api/v1/bank/insurance/claims
GET    /api/v1/compliance/fund
```

### 3.5 `commerce`（14）

```
GET    /api/v1/companies
GET    /api/v1/companies/<ticker>
POST   /api/v1/companies
POST   /api/v1/companies/<ticker>/shares/transfer
POST   /api/v1/companies/<ticker>/financials
GET    /api/v1/commerce/licenses
POST   /api/v1/companies/<ticker>/charter
GET    /api/v1/companies/<ticker>/governance
POST   /api/v1/companies/<ticker>/meetings
POST   /api/v1/companies/<ticker>/resolutions
POST   /api/v1/companies/resolutions/<resolution_id>/vote
POST   /api/v1/companies/resolutions/<resolution_id>/close
POST   /api/v1/companies/<ticker>/related-party
POST   /api/v1/companies/<ticker>/related-party/<txn_id>/decide
```

### 3.6 `council`（5）

```
GET    /api/v1/council
POST   /api/v1/council/sector-license
POST   /api/v1/council/seat
POST   /api/v1/council/motions/<motion_id>/vote
POST   /api/v1/council/leave
```

### 3.7 `court`（15）

```
GET    /api/v1/court/cases
POST   /api/v1/court/cases
GET    /api/v1/court/cases/<case_id>
POST   /api/v1/court/cases/<case_id>/evidence
POST   /api/v1/court/cases/<case_id>/appeal
POST   /api/v1/court/cases/<case_id>/enforce
GET    /api/v1/court/panels/<panel_id>
POST   /api/v1/court/panels/<panel_id>/strike
POST   /api/v1/court/panels/<panel_id>/vote
POST   /api/v1/court/judgments/<judgment_id>/recognition
POST   /api/v1/court/recognition/<recognition_id>/appeal
POST   /api/v1/admin/court/recognition/<recognition_id>/decide
POST   /api/v1/admin/court/cases/<case_id>/judge
POST   /api/v1/admin/court/cases/<case_id>/freeze
POST   /api/v1/admin/court/cases/<case_id>/release
```

### 3.8 `cutover`（5）

```
GET    /api/v1/features
GET    /api/v1/shadow/state
POST   /api/v1/shadow/state
GET    /api/v1/migrations/local-save
POST   /api/v1/migrations/local-save
```

### 3.9 `economy`（11）

```
GET    /api/v1/planets/<path:planet_key>/market
POST   /api/v1/planets/<path:planet_key>/market/buy
POST   /api/v1/planets/<path:planet_key>/market/sell
GET    /api/v1/contracts
POST   /api/v1/contracts/<contract_id>/accept
POST   /api/v1/contracts/<contract_id>/claim
POST   /api/v1/ship/upgrade
POST   /api/v1/ship/modules/<module_code>/refit
POST   /api/v1/ship/modules/<module_code>/overclock
POST   /api/v1/ship/repair
POST   /api/v1/tech/<node_code>/unlock
```

### 3.10 `explore`（9）

```
GET    /api/v1/planets/<path:planet_key>
POST   /api/v1/planets/<path:planet_key>/scan
GET    /api/v1/planets/<path:planet_key>/surface
POST   /api/v1/planets/<path:planet_key>/surface/sample
POST   /api/v1/planets/<path:planet_key>/visit
POST   /api/v1/planets/<path:planet_key>/collect
POST   /api/v1/sectors/<sector_key>/unlock
GET    /api/v1/codex
POST   /api/v1/codex/<section>/claim
```

### 3.11 `insolvency`（7）

```
POST   /api/v1/insolvency
GET    /api/v1/insolvency/<case_id>
POST   /api/v1/insolvency/<case_id>/claims
POST   /api/v1/insolvency/<case_id>/plan
POST   /api/v1/insolvency/<case_id>/plan/vote
POST   /api/v1/insolvency/<case_id>/plan/confirm
POST   /api/v1/insolvency/<case_id>/liquidate
```

### 3.12 `internal_dt`（7）— 前端不直接调用

```
POST   /api/v1/internal/dt/begin
GET    /api/v1/internal/dt/stats
GET    /api/v1/internal/dt/<tx_id>
POST   /api/v1/internal/dt/<tx_id>/prepare
POST   /api/v1/internal/dt/<tx_id>/commit
POST   /api/v1/internal/dt/<tx_id>/abort
POST   /api/v1/internal/dt/<tx_id>/resolve
```

> 需要 `ATLAS_INTERNAL_TOKEN`，fail-closed。**前端永不调用**，仅列此以免误接。

### 3.13 `market`（13）

```
GET    /api/v1/market/indices
GET    /api/v1/market/indices/<code>/points
GET    /api/v1/stocks/<ticker>/quote
POST   /api/v1/stocks/<ticker>/quote
POST   /api/v1/stocks/<ticker>/quotes
GET    /api/v1/exchanges
POST   /api/v1/exchanges
GET    /api/v1/stocks/<ticker>/mm-program
POST   /api/v1/stocks/<ticker>/mm-program
DELETE /api/v1/stocks/<ticker>/mm-program
POST   /api/v1/stocks/<ticker>/split
POST   /api/v1/admin/market/index/publish
POST   /api/v1/admin/market/candles/archive
```

### 3.14 `properties`（10）

```
GET    /api/v1/properties
GET    /api/v1/properties/my
GET    /api/v1/properties/listings
POST   /api/v1/properties
GET    /api/v1/properties/tax
POST   /api/v1/properties/tax/<bill_id>/pay
POST   /api/v1/properties/<path:asset_key>/list
POST   /api/v1/properties/listings/<listing_id>/buy
POST   /api/v1/properties/listings/<listing_id>/bid
POST   /api/v1/properties/listings/<listing_id>/close
```

### 3.15 `revenue`（2）

```
GET    /api/v1/admin/economy/revenue
POST   /api/v1/admin/economy/revenue/split
```

### 3.16 `session`（2）

```
GET    /api/v1/state
GET    /api/v1/session
```

### 3.17 `stocks`（16）

```
GET    /api/v1/stocks
GET    /api/v1/stocks/orders
GET    /api/v1/stocks/portfolio
GET    /api/v1/stocks/margin
GET    /api/v1/stocks/<ticker>
GET    /api/v1/stocks/<ticker>/candles
GET    /api/v1/stocks/<ticker>/dividends
GET    /api/v1/stocks/<ticker>/delisting
POST   /api/v1/stocks/<ticker>/orders
DELETE /api/v1/stocks/orders/<order_id>
POST   /api/v1/stocks/<ticker>/short
POST   /api/v1/stocks/<ticker>/cover
POST   /api/v1/stocks/<ticker>/lend
POST   /api/v1/stocks/<ticker>/margin
POST   /api/v1/stocks/ipo
POST   /api/v1/stocks/<ticker>/dividends
```

### 3.18 `tasks`（2）

```
GET    /api/v1/tasks
POST   /api/v1/tasks/<task_code>/claim
```

### 3.19 旧 `/api/*`（非 v1，前端在用，同样冻结）

```
GET    /api/universe/config
GET    /api/generate-random-location
GET    /api/system-intel
POST   /api/random-jump
GET    /api/arecibo
GET    /api/arecibo/system/<int:system_index>
GET    /api/planet/<planet_name>/location-data
GET    /api/current-location
GET    /api/multiverse/peers
```

### 3.20 分页与筛选约定

现状所有列表端点**都不支持分页参数**。前端不得臆造 `?page=&limit=`（后端会忽略或报 422）。
客户端分页规则：一次性拉全量 → `Pagination` 组件在内存切片。
当某端点返回条数 > 500 时，在面板上提示"数据量较大，建议使用筛选"。

---

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

# 4. 前端没有新增直连 fetch（应输出空，ServerApi.tsx 除外）
grep -rn "fetch(" atlas-ui/react/static/js --include=*.tsx | grep -v "Utils/ServerApi.tsx"

# 5. 后端零改动（应输出空）
git diff --name-only origin/main...HEAD -- 'server/**' 'pymodules/**'

# 6. 类型零错误
npx tsc --noEmit
```

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
