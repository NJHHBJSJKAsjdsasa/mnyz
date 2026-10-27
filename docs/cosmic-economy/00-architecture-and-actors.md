# 00 · 总体架构与经济主体

> 分册：总体设计  
> 依赖：现有 PG 账本/钱包、市场/合同、`world_planets`、宇宙议会（`0109`）、NPC/势力、jobs/outbox。  
> 目标：定义所有分册共用的主体、账本、权限和集成边界，避免各模块各造一套。

---

## 1. 产品目标与非目标

### 1.1 目标

把当前“资源采集 + 单行星市场 + 玩家占领”扩展为完整宇宙经济：

- 九级宇宙货币；
- 中央银行 + 商业银行 + AI 银行；
- 公司、商业许可、价格指数、IPO、税务；
- 完整公司治理、商业法院、破产/重整/清算；
- 股票、订单簿、K 线、分红；
- 行星/小星系产权交易；
- 跨区 2PC（单库阶段先保留协议/表，分库后启用）；
- AI 玩家与真人玩家同权参与全部玩法；
- 确定性 AI 策略引擎；外部 LLM 只做**内部可选适配器**，默认关闭。

### 1.2 非目标

- 真实法币/加密资产出入金；
- 毫秒级高频撮合。

> 完整现实风格的公司法/破产法院、跨区 2PC、确定性策略引擎均纳入设计范围；外部 LLM 仅作为内部扩展点，不改变 AI 玩家的同权规则。

---

## 2. 总体架构

```text
React 经济中心
  ├─ 银行 / 商业 / 股票 / 产权 / AI 玩家
  └─ /api/v1
        │
        ├─ CurrencyService ── Currency Ledger（actor + currency）
        ├─ BankService
        ├─ CompanyService / CommerceService
        ├─ StockService ────── 订单簿 / 成交 / K 线
        ├─ PropertyService ─── deed / listing / escrow
        └─ AiEconomy ───────── 与真人相同的 domain service
                │
        PostgreSQL（单库事务）
                │
        Jobs：利率、K 线、估值、AI tick、贷款清算
```

### 2.1 两条账本

| 账本 | 用途 | 主体 |
|---|---|---|
| 商品账本 `wallets/ledger_*` | 反物质、氘、合金等 12 种资源 | `player_id + resource_code` |
| 货币账本 `currency_*` | 九级宇宙货币 | `economic_actor + currency_code` |

**不要**把九级货币直接塞进 `wallets`。货币有发行、银行负债、汇率、托管，必须走独立双分录账本。

### 2.2 桥接

商品换货币、货币换商品必须：

- 同一数据库事务内完成两边；
- 记录 `exchange_rate_snapshot`；
- 任一边失败全部回滚；
- 写 outbox 事件，便于对账。

---

## 3. 经济主体

### 3.1 `players.controller`

```text
players
  controller text check in ('human','server_ai') default 'human'
```

- `human`：真人；
- `server_ai`：AI 玩家，由服务端调度器驱动；
- **只用于调度/审计，不参与权限、费用、税率、订单优先级判断**。

### 3.2 `economic_actors`

```text
economic_actors
  id uuid pk
  kind text check in ('player','company','bank','bank_officer','treasury','council_fund','system')
  controller text check in ('human','server_ai','system')
  player_id uuid null references players
  company_id uuid null references companies
  bank_id uuid null references banks
  display_name text
  status text check in ('active','frozen','closed')
  created_at
```

- 真人/AI 都是 `kind='player'`；
- 公司、银行、国库、议会基金各自是 actor；
- `bank_officer` 是银行柜员/经理的**职位 actor**，不是玩家；
- 唯一约束：`player_id`、`company_id`、`bank_id` 各自最多一个 actor。

### 3.2.1 `bank_officer` actor

```text
bank_officers
  id uuid pk
  actor_id uuid unique references economic_actors
  bank_id uuid references banks
  post_code text unique       -- 例如 guild-hq-teller-01
  display_name text
  corruption_risk numeric(5,4) default 0.05
  status text check ('active','suspended','removed')
  created_at
```

- 每个银行网点/关键岗位一个 officer actor，不是每个玩家；
- 关系费进入 `bank_officer` 的 `currency_accounts`；
- 银行不能直接把 officer 余额当银行收入；审计可冻结/追缴；
- officer 被查/停职后，关系费通道关闭；
- 真人/AI 玩家都可以向同一 officer 行贿，费率/风险一致；
- 迁移 `0110` 为每家银行创建至少 1 个 officer actor。

### 3.3 AI 玩家创建

AI 不是另一种表：

1. 创建隐藏 `account`（`email NULL`、`password_hash NULL`、status `active`，不可登录）；
2. 创建正常 `player`（`controller='server_ai'`）；
3. 创建 `economic_actor`；
4. 创建 `ai_agents` 自动化配置（1:1）。

之后 AI 与真人在所有业务表里完全同构。

---

## 4. 货币账本约束

### 4.1 表

```text
currency_accounts
  actor_id uuid
  currency_code text
  balance numeric(30,4) check >= 0
  frozen numeric(30,4) check >= 0
  primary key (actor_id, currency_code)

currency_ledger_transactions
  id uuid pk
  kind text
  ref_type text
  ref_id text
  memo text
  created_at timestamptz

currency_ledger_entries
  id bigserial pk
  tx_id uuid
  actor_id uuid
  currency_code text
  delta numeric(30,4)
  balance_after numeric(30,4)
```

### 4.2 不变量

1. 每笔 tx 的 `sum(delta)=0`；发行/销毁通过 `treasury` / `burn` actor 对冲。
2. 所有余额变更必须走 domain service，repo 不直接改余额。
3. 按 `(actor_id, currency_code)` 排序加锁，避免死锁。
4. `currency_accounts.balance` 与账本最后一条 `balance_after` 必须一致。
5. 金额用 `Decimal`，禁止 float；最小单位 0.0001。
6. 所有写接口必须 `Idempotency-Key`。
7. 账本只追加，不更新/删除历史行；冲正用反向 tx。

### 4.3 对账任务

每日 job：

- 按 actor/currency 重算账本余额；
- 与 `currency_accounts` 比较；
- 差异写 `economy_reconciliation` 并告警；
- 银行/股票/产权子账本分别对账。

### 4.4 全局锁顺序

所有单库事务、2PC prepare、批量 job 必须按同一顺序加锁：

```text
1. economic_actors                (id 升序)
2. currency_accounts              (actor_id, currency_code 升序)
3. bank_accounts / bank_loans     (bank_id, actor_id, currency_code)
4. stock_listings                 (listing_id)
5. stock_orders                   (listing_id, created_at, id)
6. stock_holders / margin_accounts
7. property_assets / deeds        (asset_id)
8. property_listings / escrow     (listing_id)
9. court_cases / insolvency_cases (case_id)
10. asset_freezes                 (case_id, asset_id 升序)
```

- `asset_freezes` 是冻结事实表：`(case_id, asset_id, kind, status)`；
- 法院/破产冻结先锁 case header，再按 `(case_id, asset_id)` 锁冻结行；
- 不允许只锁 asset 跳过 case header。

规则：

- 同类型多行按主键升序；
- 先 `listing` 后 `order`，先 `asset` 后 `listing/escrow`；
- 不允许锁升级（共享→排他）；
- 不允许在持锁时调用外部网络/LLM；
- 锁等待总预算 <3s；2PC prepare 遵守同一顺序；
- 07/09 的实现必须引用本节，不得各自定义顺序。

---

## 5. 与现有系统的边界

| 现有模块 | 处理 |
|---|---|
| `wallets` / `ledger_*` | 商品继续走原账本；货币新账本；兑换桥接 |
| `market_service` | 商品市场可增加 Q1-Q3 结算；保留反物质市场 |
| `world_planets` | 行星产权事实表；产权系统只做 deed/挂牌/托管 |
| `planet_ownership_history` | 转让/攻城追加历史 |
| `council` | 银行/交易所牌照、IPO、系统交易走 `council_motions` |
| `factions` | 银行/公司/产权挂 faction/sector；声望影响关税/利率 |
| NPC 居民 | 内容 NPC，不是经济 AI |
| 经济 AI | 正式 `player`，使用同一 domain service |
| jobs / outbox | 利率、K 线、估值、AI tick、清算、公告 |

### 5.1 议会扩展

当前 `council_motions.kind` 只有 `sector_license|membership`，需扩展：

```text
bank_license
exchange_license
ipo
system_sale
emergency_rate
issuance_policy
```

新增 `payload jsonb`；通过后由对应 service 执行。AI 议员是正式玩家议员，规则不特殊。

`issuance_policy`：

- 由央行发起，payload 含 `policy_id` 与完整参数；
- 公示 24h；
- 议会 4 票通过后生效；
- `currency_issuance_policy.approved_by` 记录 motion_id；
- 紧急调整走 `emergency_rate`，24h 内议会追认，不与发行参数混用。

---

## 6. 横切约定

- **认证**：现有 access token；AI 调度器使用内部 actor 上下文，但不能绕过 domain service。
- **幂等**：所有写操作带 `Idempotency-Key`；股票/产权/银行都必须可重放。
- **限流**：真人/AI 同一限流键规则；AI 不享受更高配额。
- **隐私**：公开接口只能返回公开盘口/指数/公告；任何玩家不能读他人私有库存/贷款/订单。
- **审计**：银行、股票、产权、AI 决策写审计/outbox。
- **错误**：沿用 `{type,title,status,detail,code,request_id}`；前端显示 `detail`。
- **金额展示**：货币品质 + code + 图标；Q1-Q3 2 位，Q4-Q9 4 位。

---

## 7. 迁移顺序

| 迁移 | 内容 |
|---|---|
| `0110_currency_bank` | `players.controller`、货币、actor、账本、银行 |
| `0111_commerce_property` | 公司、许可、指数、产权、deed |
| `0112_stock_market` | 上市、订单、成交、K 线、分红 |
| `0113_ai_economy` | `ai_agents`、`ai_decisions`、AI 玩家初始化 |
| `0114_company_law_court` | 公司章程、董事/高管、股东会、商业法院、破产/重整 |
| `0115_cross_region_2pc` | 分布式事务协调器、参与者、决策日志 |
| `0116_ai_decision_provider` | 决策提供者配置、LLM 适配器审计（默认关闭） |

每个迁移：

- 有 downgrade；
- 测试库清理规则同步；
- 更新 `DEFAULT_REVISION`；
- 不把多个域塞进一个迁移。

---

## 8. 术语

| 术语 | 含义 |
|---|---|
| actor | 能持有货币/资产的经济主体 |
| deed | 产权凭证 |
| Q1-Q9 | 九级货币品质 |
| CCMC | 宇宙商业管理中心 |
| 央行 | 宇宙中央银行 |
| AI 玩家 | `controller='server_ai'` 的正式玩家 |
| K 线 | OHLC + 成交量蜡烛 |
| LTV | 贷款价值比 |
| 熔断 | 股票/市场异常时暂停交易 |

---

## 9. 分册索引

- 货币：[01-currency.md](01-currency.md)
- 银行：[02-bank.md](02-bank.md)
- 商业中心：[03-commerce-center.md](03-commerce-center.md)
- 产权：[04-property.md](04-property.md)
- 股票/K 线：[05-stock-kline.md](05-stock-kline.md)
- AI 玩家：[06-ai-players.md](06-ai-players.md)
- 公司/破产法院：[08-company-law-bankruptcy.md](08-company-law-bankruptcy.md)
- 跨区 2PC：[09-cross-region-2pc.md](09-cross-region-2pc.md)
- AI 决策引擎/LLM 接口：[10-ai-decision-engine.md](10-ai-decision-engine.md)
- 实施/测试：[07-implementation-testing.md](07-implementation-testing.md)
