# 10 · 后端改造清单（前端需求驱动）

> 定位：**这不是前端重设计的一部分**。前端重设计仍严格零后端改动（约束见 [07](07-frozen-contract.md)）。
> 本文是另一条独立立项线：**如果要把前端做到位，后端必须动哪些地方**。
> 覆盖「之前积累的」（§2–§3，已存在的问题）+「之后的」（§4，功能缺口）。
> 实测基线：2026-10-28 12:25。

---

> **勘误与第二遍**：本文有三条判断在复测后被推翻（幂等表清理、可观测性、Retry-After 表述），
> 见 [12 §1](12-backend-second-pass.md)。以 12 为准，本文保留原始判断以便追溯。

## 0. 一句话结论

| 类别 | 数量 | 结论 |
|---|---:|---|
| **P0 阻塞前端** | 6 项 → **5 项**（P0-1 已完成） | 不改，市场/资产面板只能做"半成品" |
| **P1 一致性与正确性** | 6 项 | 不改，会出现「重复扣费」「多标签页互相覆盖」这类真事故 |
| **P2 功能缺口** | 18 项 | 不改，对应 UI 做不出来（或做出来是骗玩家的） |
| P3 明确不做 | 4 项 | 避免范围膨胀 |

> 2026-10-28 12:50：**P0-1 已落地**（`_payload_listing` 补场地与费率 + 批量查询），
> 市场面板不再需要"绕开"设计，见 [00 §3.2](00-audit.md) / [06 §2.5](06-economy-surfaces.md)。

**如果只做 1 天**：先修 P1-1（market 写接口无幂等，会重复扣费）+ P0-3（做市列表忽略 ticker，是明显的 bug 感）。

---

## 1. 实测基线（截至 12:25）

| 项 | 值 | 说明 |
|---|---|---|
| 蓝图 | **21 个** | +`meta`（错误码字典）、+`admin_ops`（审计/任务/死信） |
| 端点 | **218 个** | 211 + halt/resume 2 + admin_ops 3 + meta 1 + events 1 |
| 迁移 head | `0127_domain_events` | 新增 append-only 事件日志（同事务发布） |
| 前端使用 | 57 / 63 条路径 | 使用率 ~30% |
| 前端规模 | 239 文件 / 72,614 行（15:5x 复测 **264 / 80,312**，增量见 05 §附录） | 本次未改 |

**尚在工作区、未提交的新能力**（`git status` 可见）：

```
新增  server/api/v1/brokers.py            9 端点  券商 / 会员 / 账户 / 多挂牌场地
新增  server/domain/broker_service.py             开户、会员、场地挂摘牌、经纪簿
新增  server/repo/brokers.py
新增  server/models/broker.py                     FirmRequest / MembershipRequest /
                                                  BrokerAccountRequest / VenueRequest
改    server/domain/stock_service.py              _resolve_venue()：下单按场地选价/选费率
改    server/api/v1/market.py                     +5：adjustment-factors、archive ×4
新增  0125_broker_venue.py / 0126_split_cold.py
```

> 这批改动把「一只股票只能在一个交易所挂牌」改成了**多场地挂牌 + 智能路由**。
> 前端的市场面板设计（[06 §2](06-economy-surfaces.md)）因此需要一节新的「券商与场地」。

---

## 2. P0 · 阻塞前端（不改就做不出来）

> ### 实施状态（2026-10-28 13:5x）
>
> **已落地**：P0-1、P0-2、P0-3、P0-4、P0-5、P1-1、P1-3、P1-5、P1-6，以及 12-A（分红除权）、
> 12-B（安全响应头）、12-D（审计只读端点）、12-E（停牌/复牌）。
> **未做**：P1-2（`If-Match` 统一，方案 A 需前端配合）、P1-4（金额/时间类型统一，面广）、
> P2 全部、以及 12 的 C/G/H（OpenAPI 已用生成器替代一半）。
>
> | 项 | 落点 | 验证 |
> |---|---|---|
> | P0-2 交易所容量 | `exchange_service.list_exchanges()` 加 `max_listings` + `listing_count`（LATERAL）；`POST /exchanges` 可传 `max_listings` | `GET /exchanges` 两个字段非空 |
> | P0-3 做市按 ticker | `repo/indices.programs_of_actor(..., ticker=)` + `market.py` 透传 | 对未持有标的返回 `[]` |
> | P0-4 分页 | `stock_service.list_stocks_page()` keyset + `total/has_more/next_cursor`；`/stocks?limit&cursor` | 翻页无重复、`has_more=true` 时必有 `next_cursor` |
> | P0-5 首屏摘要 | `domain/dashboard.py`（只调 owner 读 API）→ `/state.wallet_summary / portfolio_summary / obligations` | 首屏只发 `/state` |
> | P1-1 幂等 | `market.py` 统一 `_write()`；`/admin/**` 显式豁免并注释原因 | 同 key 连发 split 只落一行 |
> | P1-3 错误码字典 | `GET /meta/error-codes`（遍历 `ApiError` 子类，无需鉴权） | 前端 `errorText()` 不再露英文 |
> | P1-5 事件流 | `0127_domain_events` + `domain/events.publish` + `GET /events?since=` | 拆股/分红/开所后能读到事件 |
> | P1-6 `Retry-After` | 复核发现 `server/__init__._problem()` **早已设置**该头（12 §1 第 2 条的部分结论需再修） | `curl -D- /api/v1/exchanges` 触发 429 后可见 |
> | 12-A 分红除权 | `pay_dividend()` 下调 `prev_close`，响应回 `prev_close_before/after` | 分红后市值不再虚增 |
> | 12-B 安全头 | `create_app` 新增 `_security_headers`（CSP 仅非 dev 下下发） | 5 个头齐全 |
> | 12-D 审计 | `admin_ops` 蓝图 3 个只读端点 | `GET /admin/audit` |
> | 12-E 停牌 | `POST /admin/stocks/{t}/halt|resume` | `halted_until` 生效 |

### P0-1 股票列表不返回挂牌场地与费率 —— ✅ 已完成（2026-10-28）

| 项 | 内容 |
|---|---|
| 现象 | `GET /stocks` 与 `GET /stocks/<t>` 的 payload 里没有 `exchange_code` / `fee_bps` / `venues` |
| 证据 | `server/domain/stock_service.py::_payload_listing()` 返回 16 个字段，无场地信息；<br>场地只能通过 `GET /stocks/<ticker>/venues` **逐只**查 |
| 影响 | 市场面板要显示"这只票在 ALPHA 和 CSX 都挂牌、费率 25bp vs 10bp"，就得对 N 只股票发 N 次请求。100 只 ≈ 100 RTT |
| **已做** | `_payload_listing` 增 `exchange_id` / `exchange_code` / `fee_bps` / `venues[]`；<br>`GET /stocks` 用 `repo/brokers.py::venues_for_listings()` 一次 `= ANY(%s)` 批量拉全，**无 N+1** |
| 兼容性 | **纯新增字段**，旧前端忽略即可 |
| 验收 | ✅ `tests/integration/test_broker_venue.py::test_listing_trades_on_two_venues_with_its_own_fee` 断言 `venues` 含 `CUEX 10bp` + `XVEX 20bp`，且 detail 与列表一致 |
| 备注 | 顺手修掉一个隐性 bug：老数据（`listing_venues` 无记录）的下单响应曾返回 `venue: "PRIMARY"` 这个不存在的代码，现回退为真实交易所代码 |

**残留（新发现，1 行修复）**：`_payload_order()` 只返回 `venue_id`（uuid），不返回场地代码。
下单响应里有 `venue`（代码），但 `GET /stocks/orders` 没有 —— 订单列表无法显示"在哪块板成交"。
建议补 `venue_code`，或前端用 `stocks[].venues` 自建 uuid→code 映射（可接受，但要多拉一次全市场）。

### P0-2 交易所缺容量信息

| 项 | 内容 |
|---|---|
| 现象 | `GET /exchanges` 返回 `id/code/name/kind/currency_code/status/fee_bps/listing_fee/operator_actor_id`，**无 `max_listings`，无当前挂牌数** |
| 证据 | `server/domain/exchange_service.py::list_exchanges()`；`max_listings` 列在 0123 已建但未 select |
| 影响 | 交易所列表无法显示「已挂牌 12 / 上限 30」，开所时也无法预判容量 |
| 建议 | 加 `max_listings` + `listing_count`（`LEFT JOIN LATERAL count`） |
| 工作量 | 0.2 天 |
| 验收 | 两个上市场地各有 `max_listings: 30, listing_count: 7` 这类值 |

### P0-3 做市程序列表忽略 `ticker`

| 项 | 内容 |
|---|---|
| 现象 | `GET /stocks/<ticker>/mm-program` 收了 `ticker` 却**没用**，返回该 actor 的**全部**做市程序 |
| 证据 | `server/api/v1/market.py:123` → `market_maker.programs(conn, str(actor["id"]))`，`ticker` 未传入 |
| 影响 | 前端在 ATL 的做市页里切到 VEGA，列表不变 —— 玩家会当成 bug 提单 |
| 建议 | `programs(conn, actor_id, ticker=None)`，路由传 `ticker` |
| 工作量 | 0.2 天 |
| 验收 | 对未持仓标的返回 `{"programs": []}` |

### P0-4 无分页 + 隐性截断

| 项 | 内容 |
|---|---|
| 现象 | 所有列表端点无 `page/limit/cursor`；`GET /stocks` 在 repo 层硬限 200 条且**不告知客户端** |
| 证据 | `server/repo/stocks.py:74 list_listings(..., limit: int = 200)`；响应无 `total` |
| 影响 | 第 201 只股票**静默消失**；前端无法判断"是真的只有 37 只"还是"被截断了" |
| 建议 | **最小改动**：响应加 `total` 与 `has_more`；<br>**完整方案**：`?cursor=&limit=`（游标用 `listed_at,id`） |
| 工作量 | 0.5 天（最小）/ 1.5 天（完整，需前端配合） |
| 验收 | `GET /stocks?limit=50` 返回 `has_more: true`，第 2 页无重复无遗漏 |

### P0-5 `/state` 缺经济摘要 —— 前端首屏要 4 次串行请求

| 项 | 内容 |
|---|---|
| 现状 | `GET /state` 已聚合：`player / resources / ship / progress / assets(stations,fleet,hull,vouchers) / contracts / cooldowns / server_time / game_day`，并带 `ETag` |
| 缺什么 | 九币钱包余额、股票持仓市值、贷款与到期账单、待办（税单/案件/动议） |
| 影响 | 前端外壳（`ShellProvider`）必须再发 `/wallet/currencies`、`/stocks/portfolio`、`/bank/loans`、`/properties/tax` 四个请求才能渲染状态栏与徽章 —— 首屏多 3 个 RTT |
| 建议 | `/state` 增三段**摘要**（不是明细）：<br>`wallet_summary: {cc1: "124806.42", ..., total_q1}`<br>`portfolio_summary: {market_value, unrealized_pnl, positions: n}`<br>`obligations: [{kind:"tax", due_at, amount, currency}, ...]`（上限 5 条） |
| 工作量 | 1 天 |
| 验收 | 首屏只调 `/state` 即可渲染 StatusBar + NavRail 徽章 + 通知计数 |

### P0-6 状态派生**必须下沉到服务端**（原判断已推翻）

> 原因：[11](11-server-authority.md) 定下「服务器权威」。状态一旦影响**裁决**
> （「护盾离线不能进战斗」），判定就不能在前端；且 AI 要读同一套语义。
> 前端只保留「severity → 颜色/形状」的**表现映射**。

| 项 | 内容 |
|---|---|
| 现状 | [09](09-state-and-context.md) 的 11 个 `statusId` 全在前端由现有字段派生 |
| 风险 | ① AI 与真人对「燃料不足」判定不一致；② 状态与裁决脱节（前端说离线、后端照常开战）；③ 无法审计玩家当时看到了什么 |
| 建议 | 服务端派生 `status: [{key, severity, since, payload}]`，放进 `GET /state` 与 `GET /ship`；<br>文案与配色仍在前端 `ui/Status`，**不重复判断** |
| 工作量 | 1 天（派生逻辑从 `HullSystem`/`FuelBars` 的判定条件移植 + 测试） |
| 依赖 | 需先有 `GET /ship`（见 [11 §4.2](11-server-authority.md)） |

---

## 3. P1 · 一致性与正确性（不改会出真事故）

### P1-1 `market.py` 的 11 个写接口没有幂等（**最该修**）

| 项 | 内容 |
|---|---|
| 现象 | `market.py` 连 `begin_idempotency` 都没 import；11 个 POST 全部裸 `db().transaction()` |
| 证据 | `server/api/v1/market.py:14` 只 import `rate_limit, require_auth, success` |
| 对比 | 其余蓝图都走 `_write()` 助手（`assets.py:44`），内部已 `begin_idempotency` |
| 风险 | 网络抖动下重复提交 `POST /stocks/<t>/split` → **重复拆股**；重复 `POST /exchanges` → 重复扣 5,000 cc4；重复 `/stocks/ipo` → 重复发行 |
| 建议 | 抽一个与 `assets._write` 同构的助手，`market.py` 全部改走；`admin_*` 与 `internal_*` 可豁免但要在注释里写明理由 |
| 工作量 | 0.5 天 |
| 验收 | 同一 `Idempotency-Key` 连发两次 split，第二次返回 `Idempotent-Replay: true` 且 `stock_splits` 只有一行 |

### P1-2 乐观并发半启用：`ETag` 发了，`If-Match` 没人用

| 项 | 内容 |
|---|---|
| 现状 | `deps.success(..., state_version)` 会设 `ETag: "<n>"`（`deps.py:157`）；`check_if_match()`（`:170`）抛 `StaleState` 412（`errors.py:138`） |
| 覆盖 | **只有** `assets / council / economy / explore / tasks` 调了 `check_if_match`；<br>`bank / commerce / court / market / stocks / properties / brokers / insolvency` **一个都没调** |
| 前端 | `grep "If-Match" atlas-ui/` = **0 命中**，机制完全空转 |
| 风险 | 多标签页 / 手机 + 桌面同时操作时，"读-改-写"会覆盖：典型如投标（`/properties/listings/<id>/bid`）、转账、拆股 |
| 方案 A（推荐） | 只对**读-改-写危险操作**启用：转账、下单、投标、拆股、存款、还款、动议投票。前端在响应里存 `state_version`，写时回传 `If-Match`；收到 412 提示"数据已更新，请刷新" |
| 方案 B | 删掉 `check_if_match` 与 `ETag`，明确不支持并发保护 |
| 工作量 | 后端 0.5 天 + 前端 0.5 天（方案 A） |
| 验收 | 两个标签页同时投标，后者收到 `412 stale_state` 且不产生第二笔出价 |

### P1-3 错误码字典需要机读清单

| 项 | 内容 |
|---|---|
| 现状 | `server/infra/errors.py` 里约 20 个 `ApiError` 子类，每个带 `status + code`；前端 [06 §0.2](06-economy-surfaces.md) 手写映射表，**靠人肉同步** |
| 风险 | 后端加一个新 code，前端显示 `操作失败（unknown_code）`，玩家看到英文 |
| 建议 | 加 `GET /api/v1/meta/error-codes`（无需鉴权），返回 `[{code, status, zh}]`；或构建期导出 `error-codes.json` |
| 工作量 | 0.2 天，收益很高 |
| 验收 | 前端 CI 校验：映射表缺失的 code = 0 |

### P1-4 金额与时间类型不统一

| 项 | 内容 |
|---|---|
| 现状 | `/state` 的余额用 `_number()` 返回 **int 或 float**（`state.py:61`）；`stocks` 全用 `str(Decimal)`；`bank` / `properties` 未统一 |
| 风险 | float 在 JS 里是 IEEE754，`0.1+0.2` 类问题会在前端"≈金额"里显形；前端拿到 `int` 和 `str` 混用要写两套格式化 |
| 建议 | **所有金额一律字符串**（`numeric(30,4)` → `"1234.5600"`）；<br>**所有时间一律 ISO8601 + `Z`**（现在混用 `iso()` 与 `.isoformat()`，前者带时区后者不带） |
| 工作量 | 2 天（面广但机械，按蓝图分批 + 快照测试） |
| 验收 | 全量响应里金额字段类型 = string；时间字段以 `Z` 或 `+08:00` 结尾 |

### P1-5 事件流无接口

| 项 | 内容 |
|---|---|
| 现状 | 只有 `GET /wallet/entries`（资金流水）。前端 `#/log` 要做"全部活动流"，只能靠本地缓存，**换设备就没了** |
| 建议 | `GET /events?since=<iso>&types=stock,court,property&limit=100`；数据源可先用现有 `outbox` / `idempotency` 记录拼，再考虑独立 `events` 表 |
| 工作量 | 1.5 天（含索引） |
| 验收 | 换浏览器登录后仍能看到昨天的成交与判决 |

### P1-6 `429` 缺 `Retry-After` 响应头

| 项 | 内容 |
|---|---|
| 现状 | `RateLimited(retry_after_ms)` 把等待时间放在**响应体** `retry_after_ms`；`RateLimit-Limit/Remaining/Reset` 只在成功响应里。**没有 HTTP 头 `Retry-After`** |
| 影响 | 前端只能写死冷却 3s（[06 §0.2](06-economy-surfaces.md) 就是这么写的），限流 5/小时 的接口会被反复撞 |
| 建议 | 统一带 `Retry-After: <秒>`；`rate_limit` 装饰器里已算过窗口，取剩余时间即可 |
| 工作量 | 0.2 天 |

---

## 4. P2 · 功能缺口（做 UI 的前提）

> 来源：`docs/cosmic-economy` 各分册「未做」项 + 本次前端发现的。**只列与界面有关的**。

### 4.1 银行（`02` 分册）

| # | 缺口 | 为什么 UI 需要 | 估时 |
|---|---|---|---|
| 1 | 银行牌照申请/审批 | 现在只有 `GET /banks`，玩家无法开银行；UI 只能看不能开 | 2 天 |
| 2 | 浮动利率重定价 | 存单/贷款的利率是固定值，UI 无法展示"按基准利率浮动" | 1.5 天 |
| 3 | 逾期清算 / lien / 抵押物拍卖 | 坏账只能靠人工；UI 的"逾期"状态没有落地动作 | 3 天 |

### 4.2 商业与公司（`03` / `08` 分册）

| # | 缺口 | 为什么 UI 需要 | 估时 |
|---|---|---|---|
| 4 | 许可申请/审批 | 只有 `GET /commerce/licenses` 只读；UI 的"申请许可"按钮无接口 | 1.5 天 |
| 5 | 回购 / 增发 / 并购的资金动作 | `company_law` 有决议类型，但无资金划转；UI 不能放按钮（放了就是骗） | 3 天 |
| 6 | 反垄断快照 + 24h 争议期 | 产权/并购的争议窗口；UI 缺"争议中"状态 | 2 天 |

### 4.3 证券（`05` 分册）

| # | 缺口 | 为什么 UI 需要 | 估时 |
|---|---|---|---|
| 7 | IPO 的议会审批与集合竞价 | 现在 `POST /stocks/ipo` 直接上市；UI 无法体现"审核中" | 2.5 天 |
| 8 | 退市拍卖与清算分配 | `GET /stocks/<t>/delisting` 只读触发条件，无后续流程 | 2 天 |
| 9 | 投资者保护基金 | 前端"保障"区只能显示合规基金，缺保护基金 | 1.5 天 |
| 10 | 手续费分账比例（50/30/20） | 现在是固定进 treasury；UI 无法解释"钱去哪了" | 1 天 |

### 4.4 产权与法务（`04` / `08` / `09` 分册）

| # | 缺口 | 为什么 UI 需要 | 估时 |
|---|---|---|---|
| 11 | 跨区并行承认的冲突检测 | `0117` 只做了单区承认；UI 的"多区同时申请"会打起来 | 2 天 |
| 12 | 判决执行与 2PC 实际划扣联动 | UI 点"执行"后结果是异步的，现在没有进度可查 | 2 天 |

### 4.5 AI 与运营（`06` / `10` 分册）

| # | 缺口 | 为什么 UI 需要 | 估时 |
|---|---|---|---|
| 13 | AI 的产权/公司/银行/议会/攻城动作 | AI 玩家只会交易与投标；UI 的"AI 对手"看起来很笨 | 4 天 |
| 14 | `GET /players` 分页 | ✅ **已完成（2026-10-28 阶段 6）**：keyset 分页，`limit`(≤200，默认 50) + `cursor`，响应 `{players, limit, has_more, next_cursor}`；游标非法 → 400。`ai_economy.directory()` 由"返回列表"改为"返回一页" | 0.5 天 |
| 15 | 同质化相关性检测 | 指数成分相关性；UI 的"指数"面板无法解释权重 | 2 天 |

### 4.6 平台与跨区（`07` / `09` 分册）

| # | 缺口 | 为什么 UI 需要 | 估时 |
|---|---|---|---|
| 16 | 真实多库参与者网络调用 | 现在单库 no-op；跨区 UI 的"执行中"永远秒完成 | 5 天 |
| 17 | undo/redo 日志 | 误操作无法回滚；UI 不敢做强确认以外的保护 | 3 天 |
| 18 | LLM 出网 allowlist + prompt 加密审计 + 自动熔断 | `admin/ai/providers` 面板缺"安全"信息 | 2 天 |

---

## 5. P3 · 明确不做

| 不做 | 理由 |
|---|---|
| 改 `/api/v1` 前缀或 `{ok, request_id, data}` 外壳 | 前端 653 行 `ServerApi` 全依赖它，收益为零 |
| GraphQL / BFF 聚合层 | 端点 218 个但前端只用 57/63，聚合层解决的不是真问题 |
| WebSocket 推送 | 除行情外没有实时需求；1s tick 全是**客户端时钟**，不需要服务端推。真要推也先做 SSE，成本更低 |
| 服务端渲染（SSR） | Jinja 数据岛已经够用，3D 组件无法 SSR |

---

## 6. 接口变更的兼容规则（所有 P0/P1 必须遵守）

1. **只加不改**：新增字段默认 `null`，不改名、不删、不改类型。
2. **前端必须容忍缺字段**：新前端代码写 `data.venues ?? []`。
3. 破坏性变更走 `GET /api/v1/features`（`cutover` 蓝图已有）做灰度，或开 `/api/v2`。
4. 每次改 schema 必须同步：`docs/frontend-redesign/07-frozen-contract.md` §3 + `docs/cosmic-economy` 对应分册。
5. 迁移与 `server/config.py::DEFAULT_REVISION` 同步（当前 `0126_split_cold`），否则 `/health/ready` 会报版本不符。

---

## 7. 排期建议（按依赖排序）

| 迭代 | 内容 | 人日 | 产出 |
|---|---|---:|---|
| **A** | ~~P0-1~~（已完成）/ P0-2 / P0-3 / P0-4（最小版） + P1-1 + P1-6 | 2.0 | 市场面板可做完整版；重复提交不再扣两次钱 |
| **B** | P0-5（`/state` 摘要）+ P1-3（错误码清单） | 1.2 | 前端首屏 1 个请求；错误文案不再漏 |
| **C** | P1-4（金额/时间统一）+ P1-2（并发保护） | 2.5 | 多端不再互相覆盖；金额不再有 float |
| **D** | P1-5（事件流）| 1.5 | `#/log` 跨设备可用 |
| **E** | P2 按产品优先级挑 3–5 项 | 5–8 | 对应 UI 才敢放按钮 |

总计 **A+B 约 4 人日**即可解开前端 90% 的阻塞。C/D 是质量线，E 是内容线。

---

## 8. 逐项验收命令（可直接粘）

```bash
# P0-1 列表含场地（已完成，用于回归）
curl -s -H "Authorization: Bearer $T" localhost:8000/api/v1/stocks \
  | jq '.data.stocks[0] | {exchange_code, fee_bps, venues}'

# P0-2 交易所容量
curl -s -H "Authorization: Bearer $T" localhost:8000/api/v1/exchanges | jq '.data.exchanges[0] | {max_listings, listing_count}'

# P0-3 做市按标的过滤
curl -s -H "Authorization: Bearer $T" localhost:8000/api/v1/stocks/ATL/mm-program | jq '.data.programs[].ticker'

# P0-4 分页信息
curl -s -H "Authorization: Bearer $T" "localhost:8000/api/v1/stocks?limit=50" | jq '{total, has_more}'

# P0-5 state 摘要
curl -s -H "Authorization: Bearer $T" localhost:8000/api/v1/state | jq '.data | {wallet_summary, portfolio_summary, obligations}'

# P1-1 幂等（split 连发两次）
K=$(uuidgen)
for i in 1 2; do
  curl -s -X POST -H "Authorization: Bearer $T" -H "Idempotency-Key: $K" \
    -H 'Content-Type: application/json' -d '{"ratio":"2"}' \
    localhost:8000/api/v1/stocks/ATL/split -D - -o /dev/null | grep -i idempotent-replay
done

# P1-2 并发保护
curl -s -X POST -H "Authorization: Bearer $T" -H 'If-Match: "1"' \
  -H 'Content-Type: application/json' -d '{"amount":"1"}' \
  localhost:8000/api/v1/wallet/transfer -w '%{http_code}\n'   # 期望 412

# P1-6 限流头
curl -s -D - -o /dev/null localhost:8000/api/v1/exchanges | grep -i retry-after
```

---

## 9. 一句话给决策者

前端的 10 篇文档已经把"能靠前端解决的"全部榨干了。
剩下的事，**每一条都必须动后端**，而且 A 迭代只要 **4 人日** 就能解开九成阻塞 —— 
比在前端继续做妥协方案便宜得多。
