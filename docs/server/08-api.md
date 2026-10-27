# 08 · API 契约（详细设计）

> 对应主文档 §12。本篇给出：通用约定、响应包络、错误码全表、幂等与并发算法、分页游标格式、核心端点逐字段规格、其余端点索引、契约治理与测试。
> 原则：**客户端只发意图，服务端返回结果与 `state_version`；所有写接口必须带幂等键。**

---

## 1. 通用约定

| 项 | 值 |
|---|---|
| Base | `https://{host}/api/v1` |
| 编码 | JSON UTF-8；请求 `Content-Type: application/json` |
| 认证 | `Authorization: Bearer <access>`（refresh 只走 Cookie） |
| 命名 | `snake_case`；枚举值小写 |
| 时间 | ISO-8601 UTC，毫秒精度 |
| 数字 | 整数用 number（≤2^53）；金额用整数最小单位 |
| 追踪 | 响应带 `X-Request-Id`（客户端可传，缺省服务端生成） |
| 幂等 | 写接口头 `Idempotency-Key: <uuid4>`，24h 内生效 |
| 并发 | 响应 `ETag: "<state_version>"`；写请求可带 `If-Match` |
| 限流 | `RateLimit-Limit/Remaining/Reset`，超限 `Retry-After` |
| 分页 | 游标：`?limit=50&cursor=<base64url>` |

### 1.1 成功包络

```json
{
  "ok": true,
  "state_version": 43,
  "data": { },
  "request_id": "9f2c…"
}
```

### 1.2 失败包络（RFC 9457）

```json
{
  "type": "https://atlas.local/errors/cooldown",
  "title": "冷却中",
  "status": 429,
  "detail": "扫描阵列冷却中，还需 184 秒",
  "instance": "/api/v1/planets/planet_1,2,3_0_x/scan",
  "code": "cooldown",
  "retry_after_ms": 184000,
  "request_id": "9f2c…"
}
```

---

## 2. 状态与并发

### 2.1 `state_version`

- 每次成功写操作 `players.state_version += 1`（同一事务）。
- 响应 `ETag: "43"`。
- 客户端保存版本；下次写请求带 `If-Match: "43"`。
- 不匹配 → `412 stale_state`，客户端重拉 `/state` 后重试一次。

### 2.2 幂等算法

```
1. 取 header Idempotency-Key（缺失 → 400 missing_idempotency_key）
2. key 作用域 = account_id + key（防跨账号碰撞）
3. 查 idempotency_keys：
   ├ 命中且 request_hash 相同 → 返回缓存 response（加 Idempotent-Replay: true）
   ├ 命中且 request_hash 不同 → 409 idempotency_conflict
   └ 未命中 → 执行业务
4. 业务提交后（同一事务）INSERT idempotency_keys(key, account_id, route, request_hash, response, status)
5. TTL 24h，Celery 每小时清理
```

`request_hash = sha256(method + path + canonical_json(body))`。
**不把 access token 纳入 hash**（避免刷新后重试被判冲突）。

---

## 3. 错误码全表

| HTTP | code | 触发 | 客户端建议 |
|---|---|---|---|
| 400 | `invalid_argument` | 参数缺失/类型错 | 修正后重试 |
| 400 | `missing_idempotency_key` | 写接口缺键 | 生成 UUID 重试 |
| 401 | `unauthenticated` | 无/坏令牌 | 刷新或登录 |
| 401 | `token_expired` | access 过期 | 静默刷新 |
| 401 | `session_revoked` / `session_reuse_detected` | 会话失效 | 强制登录 |
| 403 | `forbidden` | 管理接口越权 | 提示 |
| 404 | `not_found` | 资源不存在或非本人 | 返回上一级 |
| 409 | `insufficient_funds` | 余额不足 | 提示 |
| 409 | `out_of_stock` | 库存不足 | 刷新行情 |
| 409 | `idempotency_conflict` | 同键不同请求 | 视为错误 |
| 409 | `planet_quota_exceeded` | 行星配额满 | 先放弃 |
| 409 | `queue_busy` | 建造队列占用 | 等待完成 |
| 409 | `siege_in_progress` | 已有攻城 | 查看战报 |
| 412 | `stale_state` | `If-Match` 不匹配 | 重拉后重试一次 |
| 422 | `unprocessable` | 语义不可达（如等级已满） | 提示 |
| 422 | `deposit_exhausted` | 储量不足 | 换矿点 |
| 423 | `account_locked` | 账号锁定 | 等待解锁 |
| 429 | `cooldown` | 冷却中 | 按 `retry_after_ms` 倒计时 |
| 429 | `rate_limited` | 限流 | 按 `Retry-After` 退避 |
| 503 | `storage_offline` | 数据库不可用 | 只读模式提示 |
| 503 | `dependency_down` | 下游熔断 | 稍后重试 |
| 503 | `region_unavailable` | 行星区不可用 | 切换视图 |

---

## 4. 核心端点规格

### 4.1 `POST /api/v1/session`

| 项 | 值 |
|---|---|
| 认证 | 可选（带 refresh 则续用，否则新建 guest） |
| 幂等 | 不需要（本身幂等：同设备返回同一 player） |
| 限流 | IP 10/分钟 |

请求：

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `universe_seed_name` | string | 是 | ≤64，须与后端 config 一致 |
| `device_id` | string | 是 | ≤64，本地生成并持久化 |

响应 `data`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `player.id` | uuid | 角色 ID |
| `player.display_name` | string | 默认「舰长」 |
| `player.timezone` | string | IANA |
| `state_version` | int | 初始版本 |
| `access_token` / `expires_in` | string/int | 新令牌（refresh 走 Cookie） |
| `resources` | object | 12 键余额 |
| `cooldowns` | object | `{key: ready_in_ms}` |

错误：`unauthenticated`（refresh 无效时降级为新建 guest，不报错）。

---

### 4.2 `GET /api/v1/state`

| 项 | 值 |
|---|---|
| 认证 | 必需 |
| 幂等 | 只读 |
| 副作用 | 触发离线结算（写库），因此按写限流计数 |

查询参数：`?domain=all|resources|ship|progress|assets|contracts`（默认 `all`）。

响应 `data`：

| 字段 | 说明 |
|---|---|
| `resources` | 12 键余额 + `storage_cap` |
| `ship` | `level/type/appearance/modules[{code,level,overclock}]` |
| `progress` | `{planets, elements, lifeforms}` 图鉴计数、`scans` 冷却、`sectors[]` |
| `assets` | `stations[]`、`fleet[]`、`hull`、`vouchers` |
| `contracts` | 今日 3 份摘要 |
| `cooldowns` | 未到期的键 → 剩余毫秒 |
| `server_time` | 服务端时间（客户端据此刻算倒计时） |

---

### 4.3 `POST /api/v1/planets/{planet_key}/collect`

| 项 | 值 |
|---|---|
| 认证 | 必需 |
| 幂等 | **必需** |
| 并发 | 可带 `If-Match` |
| 冷却 | `collect:{planet_key}`，默认 15 分钟 |

请求：

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `coordinates` | string | 是 | `x,y,z`，0–1e7，与 `planet_key` 一致 |
| `planet_type` | string | 否 | 仅用于校验（服务端以生成结果为准） |

响应 `data`：

| 字段 | 说明 |
|---|---|
| `gained` | `{resource: amount}`（已按 §09 公式计算） |
| `diminishing` | 当前递减系数（便于前端展示） |
| `cooldown.ready_in_ms` | 下次可用时间 |
| `balances` | 变更后的余额（仅涉及的资源） |

错误：`cooldown`、`insufficient_funds`（不适用）、`invalid_argument`、`stale_state`。

---

### 4.4 `POST /api/v1/planets/{planet_key}/scan`

| 项 | 值 |
|---|---|
| 幂等 | 必需 |
| 冷却 | `scan:{planet_key}`，基数 480s × 减免，下限 30s |
| 成本 | 氘（`scanCost`）在账本内扣除 |

请求：`{ "coordinates": "x,y,z" }`

响应 `data`：

| 字段 | 说明 |
|---|---|
| `kind` | `relic`/`rich`/`normal`/`barren` |
| `yield` | 资源明细 |
| `relic` | `{index, title, text}`（仅 relic） |
| `cooldown.ready_in_ms` | — |

错误：`cooldown`、`insufficient_funds`（氘不足）。

---

### 4.5 `GET /api/v1/markets/{planet_key}`

响应 `data`：

```json
{
  "planet_key": "planet_1,2,3_0_x",
  "game_day": "2026-10-25",
  "goods": [
    { "resource": "quantum_alloy", "buy_price": 13, "sell_price": 6, "stock": 9,
      "can_buy": 9, "can_sell": 12 }
  ],
  "tax_rate": 0.05
}
```

规则：**显示价即成交价**（加成已在生成时烘焙）。

### 4.6 `POST /api/v1/markets/{planet_key}/orders`

请求：

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| `side` | enum | 是 | `buy`/`sell` |
| `resource` | string | 是 | 必须在当日行情内 |
| `quantity` | int | 是 | 1–9999；买入须 ≤ `stock`，卖出须 ≤ 玩家库存 |

响应：`{ "filled_qty", "unit_price", "total", "balances" }`
错误：`out_of_stock`、`insufficient_funds`、`invalid_argument`。

---

### 4.7 `GET /api/v1/contracts`

响应 `data.contracts[]`：

| 字段 | 说明 |
|---|---|
| `id` | `scan_2026-10-25` |
| `title` / `description` | 文案 |
| `metric` / `target` / `progress` | 进度 |
| `status` | `open/accepted/claimed/expired` |
| `taken_by` | NPC 接走则非空 |
| `reward` | `{resource: amount}` + `vouchers` |
| `expires_at` | 接受后 12h |
| `requires` | `{module, level}` 可选 |

`POST /contracts/{id}/accept`：校验 `taken_by` 为空、未过期、未接受 → `accepted_at=now()`。
`POST /contracts/{id}/claim`：校验进度达标 → 账本 `contract_reward` → `status='claimed'`（幂等键 = contract_id）。
错误：`unprocessable`（进度不足）、`not_found`（已被接走）、`stale_state`。

---

### 4.8 `POST /api/v1/ships/{id}/modules/{code}`

请求：`{ "use_voucher": false }`

响应：`{ "level", "next_cost", "can_overclock", "effect" }`
规则：成本来自 `module_definitions` 曲线；等级上限 999；余额不足 409。
`POST .../overclock`：Lv≥10、次数<3、成本 `×2^(n+1)`。

---

### 4.9 `POST /api/v1/stations` 与 `.../claim`

建站请求：`{ "planet_key", "planet_name", "coordinates", "system_index" }`
校验：≤3 座、同行星唯一、成本（400/600/800）。
`claim`：结算后把 `stored` 入账并清零，返回 `{ "claimed": {...}, "stored": {} }`。

---

### 4.10 世界行星与攻城

`GET /world/planets/{key}` → `{ owner, state, shield_until, structures[], deposits{}, synced_at }`
`POST /world/planets/{key}/claim` → `{ claim_version, shield_until }`
`POST /world/sieges` 请求：`{ "planet_key", "fleet_id" }` → `{ "siege_id", "resolve_at", "state" }`
`GET /world/sieges/{id}` → 战报（`report` 不可变）
`POST /world/sieges/{id}/fleet` → 更新快照（`state ∈ declared` 时允许）

错误：`siege_in_progress`、`planet_shielded`、`siege_cooldown`、`siege_limit`、`region_unavailable`。

---

### 4.11 `POST /api/v1/combats/{id}/turns`

请求：`{ "action": "fire|shield|evade|flee", "turn_no": 7 }`

响应：

```json
{
  "turn_no": 7, "outcome": "ongoing",
  "player": { "hp": 58, "shield": 3, "escorts": [{ "name": "远星 1", "hp": 21 }] },
  "enemy": { "hp": 12, "shield": 0 },
  "log": ["你开火，造成 23 点伤害。", "对方击中护航舰 远星 1，造成 9 点伤害。"],
  "loot": null
}
```

规则：`turn_no` 必须等于服务端当前回合（防重放）；`seed` 服务端持有；`outcome != ongoing` 时附 `loot` 并结算（幂等键 `session_id`）。

---

### 4.12 `POST /api/v1/migrations/local-save`

请求：`{ "file_hash": "sha256…", "keys": { "_atlasSpaceShip": "…", ... } }`
校验：每账号一次、12 资源齐全、上限、文件哈希匹配。
响应：`{ "imported": {...}, "discarded": {...}, "tx_id" }`
错误：`unprocessable`（超上限部分记 discarded，不报错）、`conflict`（已导入过）。

---

## 5. 其余端点索引

| 方法 | 路径 | 幂等 | 说明 |
|---|---|---|---|
| POST | `/planets/{key}/surface/sample` | 是 | 每日 3 次 |
| POST | `/sectors/{key}/unlock` | 是 | 星区许可 |
| POST | `/ships/{id}/upgrade` | 是 | 飞船升级 |
| POST | `/ships/{id}/modules/{code}/overclock` | 是 | 超频 |
| POST | `/fleet`、`/fleet/{id}/task`、`/fleet/{id}/claim` | 是 | 舰队 |
| POST | `/tech/{code}` | 是 | 科技 |
| POST | `/hull/repair` | 是 | 维修 |
| POST | `/fabrication/{recipe}` | 是 | 生产线 |
| POST | `/stations/{id}/modules/{code}` | 是 | 空间站舱室 |
| GET/POST | `/npcs`、`/npcs/{id}/trade` | POST 是 | NPC |
| POST | `/alliances`、`/alliances/{id}/join` | 是 | 联盟 |
| GET | `/leaderboards/{metric}` | — | 5 分钟延迟 |
| POST | `/combats` | 是 | 开战 |
| POST | `/wrecks/{key}/salvage` | 是 | 打捞 |
| GET | `/health/live`、`/health/ready` | — | 运维 |

---

## 6. 分页

游标格式：`base64url({"k": <排序键>, "id": <主键>, "s": <签名>})`

- 排序：`ORDER BY created_at DESC, id DESC`（稳定）。
- 查询：`WHERE (created_at, id) < ($k, $id) LIMIT n+1`。
- `has_more` 由多取一条判断；`next_cursor` 只返回签名过的游标。
- 签名：`HMAC(secret, k|id)`，防客户端伪造越界。

---

## 7. 版本与废弃

| 变更 | 允许 | 做法 |
|---|---|---|
| 加字段 | 是（v1 内） | 客户端忽略未知字段 |
| 加枚举值 | 是（需客户端容错） | 文档标注 |
| 删字段/改类型/改必填 | 否 | 升 v2 |
| 废弃字段 | 是 | 先双写 30 天，标注 `deprecated`，再删 |

破坏性变更检测进 CI（OpenAPI diff）。

---

## 8. 契约治理

1. OpenAPI 3.1 由注解生成，提交即更新 `openapi.json`。
2. CI：`breaking` 标记必须人工确认，否则失败。
3. 前端 mock server 由 OpenAPI 生成（本地开发不依赖后端）。
4. 每个端点在本文档有：请求字段表、响应字段表、错误码。

---

## 9. 测试用例

```text
T1  写接口缺 Idempotency-Key → 400 missing_idempotency_key
T2  同键同体重放 → 200 + Idempotent-Replay: true，账本只 1 笔
T3  同键不同体 → 409 idempotency_conflict
T4  If-Match 过期 → 412，重拉后成功
T5  冷却中 → 429 + retry_after_ms，客户端倒计时正确
T6  越权访问他人 planet_key → 404
T7  分页：100 条数据 25/页，无重复无遗漏
T8  篡改 cursor → 400 invalid_argument
T9  行情显示价 = 成交价（买入 2 件扣款 = 单价×2）
T10 OpenAPI 生成无 breaking diff
```

---

## 10. 验收清单

- [ ] 所有写接口强制幂等键
- [ ] 所有响应带 `state_version` 与 `X-Request-Id`
- [ ] 错误体符合 RFC 9457 且含 `code`
- [ ] 429/503 带 `Retry-After`
- [ ] 越权统一 404
- [ ] 游标签名防篡改
- [ ] 端点表与 OpenAPI 一致（脚本比对）

## 11. 相关文档

- 认证头与令牌：[03-auth.md](03-auth.md)
- 计算口径：[09-server-compute.md](09-server-compute.md)
- 账本与错误语义：[05-economy-ledger.md](05-economy-ledger.md)
