# 模块依赖规则（后端）

> 目标：**N 个模块 = N 个 import，不存在一个负责初始化所有人的全局 DI 容器。**
> 本文是被 CI 强制的规则，不是建议。改动前先看 §4 的检查命令。

---

## 1. 分层

```
api/        HTTP 外壳：鉴权、幂等、参数校验、响应包装。不写业务规则，不写 SQL。
domain/     业务规则。只吃 conn，不 import flask。跨模块调用只走对方的读 API。
repo/       只有 SQL。一张表（或一组同源表）一个 repo 文件。
infra/      db / cache / errors / metrics / ownership。谁都可以依赖，它不依赖谁。
```

依赖方向单一：`api → domain → repo → infra`。反向 import 一律视为 bug。

---

## 2. 强规则

| # | 规则 | 检查方式 |
|---|---|---|
| R1 | 模块只能**写**自己拥有的表 | `scripts/check_boundaries.py`（CI 失败） |
| R2 | 跨模块只能**读**，且优先走对方的读 API，而不是直接 join 别人的表 | 代码评审 + R1 的表级清单 |
| R3 | 业务分支禁止跨模块直接 `join`（真的需要时，在消费方建读模型/视图，并按天对账） | 评审 |
| R4 | 跨模块同步调用必须显式、可枚举（§3 的依赖表）；不得在 `infra` 里做服务定位器 | 评审 |
| R5 | 跨模块读接口在 `server/domain/read_contracts.py` 用 `Protocol` 声明形状，调用方按协议写代码 | mypy/评审 |
| R6 | 写路径的跨模块通知走 `domain.events.publish`（同事务），不做跨模块同步回调 | 评审；事件清单见 §5 |

**R1 是硬闸门**。写别人的表 = 该表的结构变更会静默打断你，而模块“借”着用不会报错。

---

## 3. 模块清单

`owned_tables` 的机器可读版本在 `server/infra/ownership.py`（本表是它的人类可读镜像，当前 **14** 个模块）。<!--fact:modules.count=14-->

| 模块 | 拥有的表（节选） | 允许调用（同步） | 通过事件消费 |
|---|---|---|---|
| `platform` | accounts, players, sessions, idempotency_keys, outbox_events, **domain_events**, audit_log, job_runs, dlq_events, feature_flags | — | 全部 |
| `currency` | currencies, currency_*, ledger_*, economic_actors, system_accounts, wallets, resource_types | — | bank.policy_changed |
| `bank` | banks, bank_*, deposit_*, interbank_loans, compliance_fund*, bribe_events | currency | stock.dividend |
| `broker` | securities_firms, broker_*, listing_venues, securities_lending | currency, stock（读上市信息） | stock.ipo |
| `stock` | stock_*, dividends, exchanges, margin_accounts, short_positions, mm_programs, price_indices, market_*, trade_orders | currency, broker（读会籍/佣金）, commerce（读公司） | commerce.*, court.judgment |
| `protection` | investor_protection_* | currency | — |
| `commerce` | companies, company_*, share_holdings, resolutions, board_seats, commerce_*, market_share_snapshots, contracts | currency, stock（读价格） | stock.split |
| `property` | property_*, revenue_* | currency, commerce | — |
| `legal` | commercial_courts, court_*, asset_freezes, asset_sales, insolvency_* | currency, commerce, property | — |
| `dt` | distributed_transactions, dt_* | — | — |
| `ai` | ai_* | 全部只读 | 全部 |
| `assets` | stations, fleet_ships, ships, ship_modules, alliance*, player_tasks, tech_nodes, codex_* | currency | — |
| `world` | world_planets, sieges, combat_*, planet_*, faction*, npc_*, council_*, sector_licenses | currency, assets | — |
| `explore_scan` | planet_scans, surface_samples, challenge_codes, collections | currency, world | — |

> 2026-10-28 已修：`legal` 不再写任何 `company_*`。公司法 SQL 从 `repo/legal.py` 拆到
> `repo/company_governance.py`（commerce 拥有），法院侧只保留读：
> `company_law.officers()` / `company_law.related_parties()` 是对外读 API。

### 3.1 组合模块（不拥有表）

| 模块 | 职责 | 依赖 |
|---|---|---|
| `domain/state.py` | 首屏快照合成 | assets / ship / cooldown / dashboard |
| `domain/dashboard.py` | 钱包 / 持仓 / 到期事项摘要 | currency / stock / property / bank 的读 API |
| `domain/events.py` | 事件发布与读取 | repo/events |

组合模块**只准调用读 API**，不得持有自己的表。要写，回到拥有方去写。

---

## 4. 检查

```bash
# 报告（不失败）
python scripts/check_boundaries.py --report

# CI 闸门（有新增越界则退出码 1）
python scripts/check_boundaries.py

# 冻结当前状态为基线（只在新模块接入时用，且必须在 PR 描述里说明原因）
python scripts/check_boundaries.py --write-baseline
```

基线文件 `scripts/boundaries_baseline.json` 记录**当前 7 条历史越界** <!--fact:boundaries.baseline=7-->（2026-10-28 冻结；
拆分 `company_governance` 后从 15 条降到 7 条）：

| 越界 | 现状 | 修法 |
|---|---|---|
| `banks/companies → economic_actors` | 冻结/解冻 actor 状态时直接 UPDATE | 走 `currency_service.set_actor_status()` |
| `stocks → securities_lending` | 借券写的是 broker 模块的表 | 由 `broker_service` 提供 `lend()` |
| `ai → feature_flags` | AI 开关直接写平台表 | 走 `cutover.set_flag()` |
| `ai_economy → players / council_seats` | AI 玩家初始化 | 初始化脚本单列，不进运行时路径 |
| `ships → player_flags` | 船体/护盾标记 | 平台提供 `player_flags.set()` |

基线只会变短：修掉一条删一条，**不允许新增**。

`--report` 还会列出「写到了未登记归属的表」—— 这些不拦，属于映射尚未覆盖的部分。

---

## 5. 事件

`domain_events`（迁移 `0127_domain_events`）是**同事务**的 append-only 日志：

```python
events.publish(conn, type=events.STOCK_SPLIT, aggregate=ticker,
               payload={"ratio": "2"}, actor_id=actor_id)
```

规则：

1. 在调用方事务内写，回滚即消失 —— 状态与事件不会互相矛盾；
2. payload 只放 id / code / 金额，**不放整对象**；需要详情去问拥有方；
3. `aggregate` 是稳定引用（ticker、case id），不是行指针；
4. 投递（outbox → 队列）是后续步骤；今天的读路径与轮询节奏见 §5.1。

已登记的事件：

| type | aggregate | 发布者 | payload |
|---|---|---|---|
| `stock.split` | ticker | `stock_corporate.split` | ticker, ratio, post_price, cancelled_orders, cash_in_lieu |
| `stock.dividend` | ticker | `stock_service.pay_dividend` | ticker, per_share, total_paid, holders, prev_close_after |
| `exchange.created` | code | `exchange_service.create_sub` | code, fee_bps, listing_fee |

新增事件时必须同时改这张表与 `server/domain/events.py` 的常量。

### 5.1 今天的轮询节奏（谁读事件、多久一次）

| 消费方 | 方式 | 节奏 | 游标 |
|---|---|---|---|
| 前端 `#/log` 面板 | `GET /events?since=<seq>&limit=100` | **打开时拉一次，之后 10s 轮询**；关闭面板即停（`visibilitychange` 隐藏时暂停） | 内存持有 `next_since`，刷新页面从 0 重拉最近 100 条 |
| 前端外壳徽章（未读计数） | 复用同一次响应，**不额外请求** | 同 `#/log` | 同上 |
| `ai_economy_tick`（每 5 分钟） | 服务端按 `seq` 读区间 | 跟随现有 job，不新增调度 | 消费位点暂不持久化：AI 只消费"上次 tick 之后"的窗口，漏读不追赶 |
| 运维 `GET /admin/audit` | 按需查询，**不轮询** | 人工 | — |

约束：

1. **除前端 10s 轮询外，今天没有任何服务端订阅者**。不要假设事件已被处理——写侧仍然同步完成全部状态变更；
2. 需要"事件驱动"的下游（结算、通知、对账）必须先落**消费位点表**，再谈投递，否则重启即重放；
3. `domain_events` 先按 90 天保留（`jobs/tasks.py::cleanup` 里加一条，与幂等键同批清理）。

---

## 6. 新增模块的清单

1. `server/repo/<name>.py` —— 只写自己的表；
2. `server/domain/<name>_service.py` —— 业务规则，不 import flask；
3. `server/models/<name>.py` —— `StrictModel` 请求体（同时被 OpenAPI 生成器读取）；
4. `server/api/v1/<name>.py` —— `require_auth(write=True)` + `_write()` 幂等助手；
5. `server/infra/ownership.py` 登记 `files` 与 `tables`；
6. 本文 §3 补一行；
7. **对外暴露读 API**：新模块必须提供只读函数（`list_*` / `get_*` / `*_of`），
   供 `ai` 与组合模块（`domain/state.py`、`domain/dashboard.py`）调用；
   返回 dict/list，不返回 repo 行对象，不暴露 `conn` 之外的实现细节；
8. 若新模块会成为事件生产者，在 §5 登记 `type` 与 `aggregate`；
9. `python scripts/check_boundaries.py` 必须绿。
