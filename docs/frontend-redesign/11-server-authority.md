# 11 · 服务器权威与客户端预测

> 路线：**渲染在浏览器，裁决在服务器。**
> 判定标准只有一句：**玩家改本地存储、改内存、重放请求，都不能获得任何游戏优势。**
> 实测基线：2026-10-28 12:40。

---

## 1. 现状：权威是错位的（不是"都在前端"，也不是"都在后端"）

| 领域 | 现状裁决位置 | 证据 | 可篡改性 |
|---|---|---|---|
| **航行燃料** | **100% 前端** | `Utils/SpaceshipTravelCosts.tsx:25 executeTravel()` 本地算 + `SpaceshipResourceManager.consumeResources()` 写 localStorage；`/navigate`（`pymodules/__universe_routes_pages.py:129`）**只跳转，不校验、不扣** | 🔴 改成 99999 可无限飞 |
| **舰船船体** | 服务端有字段，前端也能写 | 服务端 `ship flags.hull`；前端 `HullSystem` 本地 `save()`，只在 `ServerBridge.hydrateFromServer()` 时被覆盖 | 🟠 刷新前可伪造 100 |
| **资源** | 服务端（已被覆盖） | `ServerBridge.tsx:69` 注释明确 "replace local gameplay caches, never merge" | 🟢 刷新即回滚 |
| **采集收益** | 服务端 ✅ | `domain/collect.py:36 collect()` 服务端算 `compute()` + 冷却 + 入账 | 🟢 |
| **行星市场** | 服务端有端点，前端有本地回退 | `TradeTab.tsx:81` 先走 `ServerApi.marketBuy`，失败回落 `TradeSystem.buy()`（本地） | 🟠 回退分支可刷 |
| **扫描** | 混合 | 服务端有 `/planets/<k>/scan`；前端 `PlanetScanSystem` 自己算冷却与加成 | 🟠 冷却可改 |
| **战斗** | 服务端 ✅ | `combat/start`、`combat/<id>/action` 会话制 | 🟢 |
| **股票 / 银行 / 产权 / 法院 / 破产** | 服务端 ✅ | 全部走 `db().transaction()` + 复式账本 | 🟢 |

**结论**：经济侧已经是服务器权威，**移动与舰船状态是裸的**。
而这恰好是玩家每天操作最多、也最容易作弊的两块。

---

## 2. 权威分级（先分类，再谈实现）

| 级 | 定义 | 内容 | 客户端能做什么 |
|---|---|---|---|
| **A · 服务端唯一** | 客户端**没有任何写权限**，本地值只作显示 | 货币与账本、股票撮合、产权、公司、法院、破产、战斗结算、**航行燃料**、**船体/护盾**、采集收益、冷却、任务奖励 | 只能发意图；本地值必须可被服务端覆盖 |
| **B · 服务端权威 + 客户端预测** | 客户端可**临时**显示预期结果，但以服务端裁决为准 | 航行位移、下单、采集、建造、改装 | 乐观展示 + 校正/回滚 |
| **C · 纯表现** | 与游戏状态无关 | 相机、行星自转、动画、Tab 选中、排序筛选、面板展开 | 完全自由 |

**判定规则**（写进 code review checklist）：

> 任何会改变 A / B 级状态的本地写入，都必须能在**下一次服务端快照**里被纠正。
> 纠正不了 → 说明它偷偷成了权威 → 打回。

---

## 3. 预测-校正协议

### 3.1 渲染公式

```
渲染值 = 服务端基线 snapshot(state_version)  ⊕  待确认意图队列 pending[]
```

- **基线**：`GET /state` 的 `data` + `ETag: "state_version"`（已有）。
- **待确认队列**：只存在内存 + `sessionStorage`（**不进 localStorage**，刷新即丢，避免"伪造历史"）。
- **合成**：`selectors` 在读取时把 pending 叠加到基线上（例如 `fuel - pending.travel.cost`）。
- **基线更新**：任何响应的 `state_version` 大于当前基线才接受；小则丢弃（乱序保护）。

### 3.2 三种结局

| 结局 | 触发 | UI 行为 |
|---|---|---|
| `confirmed` | 服务端结果 == 预测 | 静默：pending 移除，基线替换，**不动画** |
| `adjusted` | 服务端结果 != 预测（价格变动、部分成交、收益浮动） | 数字从预测值**过渡到**服务端值（240ms），旁边一个 `info` 小标"已按结算价成交" |
| `rejected` | 4xx（余额不足、冷却中、状态已变） | pending 弹出 → 值**回滚**（240ms）→ Toast 说明 → **保留用户输入**供重试 |

### 3.3 三条硬规则

1. **本地不持久化权威数值**。
   `localStorage` 只允许存：登录态、UI 偏好（导航展开、上次 Tab、主题）、未发送的草稿表单。
   现有 `SpaceshipResources` / `HullSystem` / `PlanetScanSystem` 的 `save()` **必须降级为只读缓存**（见 §5）。
2. **前端不计算收益**。
   "这次采集会得多少""这笔成交价多少"只能是**预估**，必须带 `~` 或"预计"字样，最终值一律以响应为准。
3. **不接受"本地已到账"**。
   任何 `+128 铁` 的动画，必须在服务端 `collect` 返回之后才播；预测只能播"发送中"。

---

## 4. 后端必须先建的四件事

### 4.1 航行：`quote` + `commit`（**最高优先级**）

现在 `/navigate` 是纯页面路由，燃料扣减在前端，等于没有裁决。

```http
POST /api/v1/travel/quote
{ "target": {"x":1000182,"y":999741,"z":1000033}, "from": {"x":1000000,"y":1000000,"z":1000000} }
→ 200 { "distance": 1284, "cost": {"antimatter": 62, "cc115": 140, "deuterium": 22},
        "affordable": true, "eta_seconds": 42, "quote_id": "...", "expires_at": "..." }

POST /api/v1/travel/commit
{ "quote_id": "..." }
→ 200 { "travel_id": "...", "arrived_at": "...", "state_version": 1235,
        "balances": {"antimatter": 1178, ...} }
→ 409 insufficient_funds / 410 quote_expired
```

- 距离与消耗**只在服务端算**（现在 `__main__.tsx:188` 前端算）。
- `quote` 有 TTL（30s），防止"看到便宜价再改"。
- `commit` 原子扣燃料 + 写 `travel_log` + 返回新 `state_version`。
- `/navigate` 改为：只读 `session["travel_ticket"]`（由 `commit` 写入），**没有 ticket 直接 403**。

### 4.2 舰船：`GET /ship` + 明确的写端点

```http
GET  /api/v1/ship
→ { "hull": 62, "hull_max": 100, "shield": 0, "shield_max": 40,
    "modules": [...], "status": ["shield.offline","hull.damaged"], "state_version": 1235 }

POST /api/v1/ship/repair      （已有 /ship/repair，补 hull 变更与扣费）
POST /api/v1/ship/damage      （内部/战斗用，玩家不可直接调）
```

- `status[]` 由服务端派生（**这是 [09](09-state-and-context.md) 词表的下沉点**，见 §6）。
- 前端 `HullSystem` 变只读：`applyServerHull()` 保留，`applyDamage()/save()` 删除写路径。

### 4.3 意图幂等 + 版本（把已有机制真正接上）

- 每个写请求带 `Idempotency-Key`（= 前端 `intent_id`，重试必须复用）。
- 对"读-改-写"类带 `If-Match: "<state_version>"`；不匹配 → `412 stale_state`（`errors.py:138` 已定义，[10 §P1-2](10-backend-requirements.md) 已列）。
- 所有响应带 `state_version`（`deps.success()` 已支持，只是大部分端点没传）。

### 4.4 快照要包含"进行中"

现在 `/state` 只有静态值。预测要成立，基线必须知道"有一趟航行正在进行"：

```
in_flight: [{travel_id, from, to, depart_at, arrive_at}]     ← 否则刷新后飞船"瞬移回来"
cooldowns: {...}                                              ← 已有
pending_settlements: [{kind:"trade", ticker, qty}]            ← 可选
```

---

## 5. 前端改造：把"本地系统"降级为"只读投影"

| 现有文件 | 今天 | 改造后 |
|---|---|---|
| `Utils/SpaceshipResources.tsx` | 读写 localStorage，本地扣燃料 | **只读**：值来自 `ShellProvider`；`consumeResources()` 删除，换成 `intent("travel.commit")` |
| `Utils/SpaceshipTravelCosts.tsx` | 本地算成本 + 扣除 | 只调 `travel/quote` 展示；成本不进本地状态 |
| `Utils/HullSystem.tsx` | 本地可写 | 只读；`applyServerHull` 保留 |
| `Utils/PlanetScanSystem.tsx` | 本地算冷却/加成 | 冷却读 `/state.cooldowns`；加成读服务端 |
| `Utils/TradeSystem.tsx` | 本地市场 + 成交 | 删除本地成交路径（`TradeTab.tsx:81` 的回退分支一并删） |
| `Utils/UnifiedSpaceshipStorage.tsx` | 本地存船/模块 | 只读缓存，写入走服务端 |

**幂等键与版本放进 `ServerApi`**（只改这一处，避免每个调用点各写一遍）：

```ts
// ServerApi.request 内
const intentId = opts.intentId ?? crypto.randomUUID();
headers.set("Idempotency-Key", intentId);
if (this.stateVersion) headers.set("If-Match", `"${this.stateVersion}"`);
// 412 → 触发 shell.refresh()，并让 pending 回滚
```

---

## 6. 与 09（状态一致性）的关系：词表必须下沉

[09](09-state-and-context.md) 把 11 个 `statusId` 定义在前端，我当时建议"暂不下沉"。
**在服务器权威路线下这条不成立**，原因有三：

1. 状态影响**裁决**（比如"护盾离线时不能进入战斗"），判定必须在服务端；
2. AI 玩家要读同一套状态做决策（`06` 分册"AI 与真人同权"）；
3. 玩家看到的状态若与服务器判定不一致，就是**假信息**，比不显示更糟。

修订后的分工：

| 层 | 职责 |
|---|---|
| 服务端 | 派生 `status: [{key, severity, since, payload}]`，放进 `GET /state` 与 `GET /ship` |
| 前端 | **只渲染**，文案与 severity→颜色/形状的映射留在前端（`ui/Status`），不重复判断 |

> 也就是说：**"是不是护盾离线"由服务端说；"护盾离线长什么样"由前端定。**

---

## 7. 延迟与体验预算

| 往返耗时 | 交互策略 |
|---|---|
| < 100ms | 乐观应用，**不显示任何 loading**（否则会闪） |
| 100–300ms | 乐观应用，不显示 loading；数字用 `tabular-nums` 避免抖动 |
| 300ms–2s | 乐观应用 + 行内 6px 圆点"确认中"（不阻塞其它操作） |
| > 2s | 显示"处理中…" + 禁用本次重复提交；超过 10s 允许取消并标记"结果未知" |
| 失败 | 回滚 240ms + Toast + **保留输入** |
| 断线 | 顶部 `danger` 条"离线 · 只读"，**禁止提交**；队列留在 sessionStorage，重连后按 `state_version` 重放（幂等键保证不重复） |

**关键取舍**：航行这种 1–3 秒的操作，**不做乐观位移**（飞船不会先飞过去再飞回来），
只做"燃料预估 + 按钮 loading"，等服务端 `commit` 返回后才切页面。
理由：位移不可回滚，一旦预测错误，视觉上就是"传送失败"，比等待更糟。

---

## 8. 反作弊收益（这就是为什么要做）

改 `localStorage` 后能做到的事，逐条对照：

| 今天可以 | 改造后 |
|---|---|
| `_atlasSpaceshipResources` 改 99999 → **无限航行** | 服务端扣，本地值刷新即回滚 |
| `_atlasHull` 改 100 → 无损战斗 | 服务端 `hull` 唯一，本地只读 |
| `PlanetScanSystem` 改冷却 → 连扫 | 冷却在 `cooldowns` 表 |
| `TradeSystem` 本地成交 → 白拿货 | 本地成交路径删除 |
| 重放 `POST /collect` → 重复领取 | 已有冷却 + 幂等，保持 |

---

## 9. 迁移路线（4 步，不碰 3D 渲染）

| 步 | 内容 | 影响面 | 人日 |
|---|---|---|---:|
| **S1 只读化** | 前端 6 个 `Utils/*` 的写路径改为只读；`ServerApi` 统一带 `Idempotency-Key` | 前端 | 2 |
| **S2 补裁决端点** | `travel/quote`、`travel/commit`、`/ship`（含 `status`）、`/state` 加 `in_flight` | 后端 | 4 |
| **S3 预测层** | `ShellProvider` 拆 `baseline + pending`；`<Pending>` 组件；412/409 回滚 | 前端 | 3 |
| **S4 收口** | 删除 `consumeResources` / `TradeSystem.buy` / `HullSystem.save`；加篡改测试 | 前后端 | 2 |

总计 **11 人日**。S1+S2 必须一起上（只读化之后没端点会直接坏功能），S3 可独立。

---

## 10. 验收（可自动化，建议进 CI）

| # | 测试 | 期望 |
|---|---|---|
| 1 | 改 `localStorage` 燃料为 99999 后刷新 | 回落为服务端值 |
| 2 | 直接 `POST /navigate`（无 `travel_ticket`） | 403 |
| 3 | `commit` 两次同一 `intent_id` | 第二次 `Idempotent-Replay`，只扣一次 |
| 4 | 两台设备同时发起同一趟航行 | 后者 `412` 或 `409`，不出现"扣两次" |
| 5 | 断网点"采集" | 离线条 + 禁止提交，不产生本地入账 |
| 6 | 乱序响应（旧的 `state_version` 后到） | 被丢弃，界面不回退 |
| 7 | `GET /state` 的 `status[]` 与 `GET /ship` 一致 | 完全一致 |
| 8 | 前端 `grep -r "localStorage.setItem" Utils/` | 只剩连接态与 UI 偏好，无权威数值 |

---

## 11. 对既有文档的修订

| 文档 | 修订 |
|---|---|
| [10 P0-6](10-backend-requirements.md) | 从"建议暂不做"**升级为 P0 必做**：状态必须服务端派生，前端只渲染 |
| [09 §2.1](09-state-and-context.md) | `ShellProvider` 的职责从"状态归属"改为"**基线与意图队列的合成器**"；状态语义来源改为服务端 |
| [07](07-frozen-contract.md) | 新增 `travel/*`、`/ship`、`/state.in_flight` 后，需补入契约表 |
| [08 P3 之后](08-migration-and-acceptance.md) | 新增 **S1–S4 权威迁移**作为独立阶段（约 11 人日），排在 P4 之后 |
