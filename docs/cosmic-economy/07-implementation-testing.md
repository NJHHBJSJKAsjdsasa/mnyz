# 07 · 实施、测试与上线

> 分册：工程实施  
> 关联：所有分册  
> 目标：把设计拆成可执行的迁移、模块、接口、任务和验收。

---

## 1. 迁移拆分

> 进度（2026-10-28）：`0110`–`0124` 已落地，`DEFAULT_REVISION = 0124_split_archive`。
> 落地范围与未接服务项见 [README · 实现进度](README.md#实现进度)。

### `0110_currency_bank`

- `players.controller`
- `currencies`
- `economic_actors`
- `currency_accounts`
- `currency_ledger_transactions` / `currency_ledger_entries`
- `banks` / `bank_accounts` / `bank_reserves` / `bank_loans` / `bank_interest_runs` / `bank_rate_history`
- `currency_transfers` / `exchange_fee_tiers` / `bribe_events`
- `currency_exchange_quotes`（牌价快照）
- `currency_issuance_policy` / `currency_issuance`
- `council_motions.kind` 增加 `issuance_policy`（0109 约束扩展）
- `bank_officers`（bank_officer actor；关系费对账）
- `deposit_certificates` / `deposit_certificate_quotes` / `interbank_loans` / `deposit_insurance_fund` / `deposit_insurance_claims`
- `compliance_fund` / `compliance_fund_entries`
- `bank_loans.rate_type/spread_bps/next_reset_at`
- `deposit_insurance_fund.per_actor_cap_q1_equiv`、`deposit_insurance_claims.cap_applied`
- 初始化 9 种货币、央行 actor；商业银行在业务层创建

### `0111_commerce_property`

- `companies` / `share_holdings` / `company_financials` / `company_actions`
- `commerce_licenses` / `commerce_price_index` / `commerce_disputes`
- `exchanges` / `securities_firms` / `client_asset_accounts`
- `market_share_snapshots`（反垄断/HHI）
- `property_assets` / `property_listings` / `property_bids` / `property_transfers` / `property_escrow`
- `property_tax_rates` / `property_tax_bills` / `property_encumbrances`
- `star_systems` / `sovereignty_wars`
- 动态关税上限配置

### `0112_stock_market`

- `stock_listings` / `stock_orders` / `stock_trades` / `stock_candles`
- `stock_holders` / `stock_daily_summary` / `dividends`
- `margin_accounts` / `short_positions` / `securities_lending` / `delisting_cases`
- `settlement_mode`（T+0/T+1）、`shortable`

### `0113_ai_economy`

- `ai_agents` / `ai_decisions`
- AI 玩家初始化：正式 `players` + actor + 自动化档案

### `0114_company_law_court`

- 公司章程/董事/高管/股东会/决议/关联交易
- 商业法院/案件/开庭/判决/上诉/执行
- `asset_freezes`（法院/破产冻结）
- 破产/重整/清算/债权/计划/资产处置

### `0115_cross_region_2pc`

- `distributed_transactions` / `dt_participants` / `dt_decisions` / `dt_outbox`
- `dt_coordinator_lease`（coordinator 租约/接管）
- `fee_bps/fee_amount/origin_region`、unknown SLA 配置
- 单库阶段为 no-op 单参与者；分库后启用

### `0116_ai_decision_provider`

- `ai_decision_providers` / provider 审计字段
- 默认 `deterministic`；`llm` 仅内部配置/白名单
- 不新增公开 API；provider 名称/模型不进入客户端/公开响应

每个迁移：

- 有 downgrade；
- 更新 `DEFAULT_REVISION`；
- 测试库 `_truncate` 覆盖新表；
- 不跨域塞一个迁移。

---

## 2. 服务端模块

```text
server/
  migrations/versions/0110_currency_bank.py
  migrations/versions/0111_commerce_property.py
  migrations/versions/0112_stock_market.py
  migrations/versions/0113_ai_economy.py
  migrations/versions/0114_company_law_court.py
  migrations/versions/0115_cross_region_2pc.py
  migrations/versions/0116_ai_decision_provider.py
  domain/currency_service.py
  domain/bank_service.py
  domain/company_service.py
  domain/commerce_service.py
  domain/property_service.py
  domain/stock_service.py
  domain/company_law.py
  domain/court_service.py
  domain/insolvency_service.py
  domain/dt_coordinator.py
  domain/ai_economy.py
  domain/ai_provider.py
  repo/currency.py
  repo/banks.py
  repo/companies.py
  repo/properties.py
  repo/stocks.py
  repo/court.py
  repo/distributed_tx.py
  repo/ai.py
  api/v1/bank.py
  api/v1/commerce.py
  api/v1/stocks.py
  api/v1/properties.py
  api/v1/court.py
  api/v1/insolvency.py
  api/v1/internal_dt.py
  api/v1/admin_ai.py
```

### 2.1 领域规则

- 所有余额/持仓变更走 domain；
- repo 只做 SQL；
- 写接口带幂等；
- 锁顺序统一：严格按 [00 §4.4](00-architecture-and-actors.md#44-全局锁顺序)，即 actor → currency → bank → listing → order → asset → escrow → court；
- 事务边界在 API/service，repo 不 commit。

---

## 3. API 汇总

### 3.1 货币/银行

```text
GET  /currencies
GET  /wallet/currencies
POST /wallet/transfer
GET  /bank/rates
POST /bank/exchange
GET  /banks
POST /banks/{id}/deposit
POST /banks/{id}/withdraw
POST /banks/{id}/deposits/{id}/transfer
GET  /bank/accounts
POST /banks/{id}/loans
GET  /bank/loans
POST /bank/loans/{id}/repay
GET  /bank/interbank
POST /bank/interbank/orders
POST /bank/interbank/orders/{id}/accept
GET  /bank/insurance
```

### 3.2 商业/公司

```text
POST /companies
GET  /companies
GET  /companies/{ticker}
POST /companies/{ticker}/shares/transfer
GET  /commerce/licenses
POST /commerce/licenses
GET  /exchanges
POST /exchanges
GET  /securities-firms
POST /securities-firms
GET  /commerce/index
POST /commerce/disputes
GET  /commerce/disputes
```

### 3.3 股票/K 线

```text
GET  /stocks
GET  /stocks/{ticker}
GET  /stocks/{ticker}/candles
POST /stocks/{ticker}/orders
DELETE /stocks/orders/{id}
GET  /stocks/orders
GET  /stocks/portfolio
GET  /stocks/margin
POST /stocks/{ticker}/short
POST /stocks/{ticker}/cover
POST /stocks/ipo
GET  /stocks/{ticker}/delisting
```

### 3.4 产权

```text
GET  /properties
GET  /properties/{asset_key}
POST /properties/{asset_key}/list
POST /properties/listings/{id}/buy
POST /properties/listings/{id}/bid
GET  /properties/my
POST /properties/listings/{id}/cancel
POST /properties/tax/{bill_id}/pay
GET  /sovereignty/wars
POST /sovereignty/{system_key}/war
POST /sovereignty/wars/{id}/join
POST /sovereignty/wars/{id}/resolve
```

### 3.5 AI/管理

```text
GET  /players?controller=ai
GET  /players/{id}
POST /admin/ai/tick
POST /admin/ai/runtime-pause
```

### 3.6 法院/破产/跨区事务

```text
POST /court/cases
GET  /court/cases
POST /court/cases/{id}/evidence
POST /court/cases/{id}/appeal
POST /insolvency
GET  /insolvency/{id}
POST /insolvency/{id}/claims
POST /insolvency/{id}/plan/vote
POST /internal/dt/begin
POST /internal/dt/{tx}/prepare
POST /internal/dt/{tx}/commit
POST /internal/dt/{tx}/abort
GET  /internal/dt/{tx}
```

> `/internal/dt/*` 仅内网服务认证，不暴露公网。

---

## 4. Jobs

| job | 频率 | 作用 |
|---|---|---|
| `bank_interest_tick` | 每日 | 存款利息、贷款计息 |
| `loan_liquidation` | 每小时 | 逾期/清算抵押 |
| `stock_candle_close` | 每分钟/日 | 收盘/日线汇总（落地名 `stock_daily_tick`：日线汇总 + T+1 解锁 + 退市扫描） |
| `stock_margin_tick` | 每日 | 借券费计息、维持保证金检查、强平标记 |
| `property_appraisal` | 6 小时 | 产权估值（落地名 `property_appraisal_tick`） |
| `commerce_index` | 每日 | 价格指数 |
| `antitrust_scan` | 每日 | 市场份额/HHI/关联交易扫描 |
| `court_deadlines` | 每小时 | 开庭/答辩/上诉期限（落地：判决到期案件 + 到期解除自动中止） |
| `insolvency_plan_tick` | 每小时 | 重整计划投票/执行/分配（落地：超期计划自动表决统计） |
| `dt_recovery` | 15s | 2PC 未决事务恢复/告警（落地：租约接管 + 超时推进 + unknown 标记） |
| `dt_outbox_relay` | 10s | 2PC outbox 投递 |
| `revenue_split_tick` | 每小时 | 手续费/税费分账（落地：按 `revenue_split_rules` 把归集款从 treasury 分出） |
| `price_index_tick` | 5 分钟 | 价格指数快照（落地：每分钟一个点，同分钟 upsert） |
| `mm_refresh_tick` | 60s | 做市程序自动重挂双边（落地：`mm_programs` 中 active 且 60s 未刷新的） |
| `candle_archive_tick` | 每日 | K 线冷归档（落地：把 30 天前的 1m/5m 搬进 `stock_candle_archive`） |
| `ai_economy_tick` | 60s | AI 玩家决策 |
| `economy_reconciliation` | 每日 | 账本/持仓/2PC 对账 |

- 使用现有 jobs runner/celery；
- 每个 job 有锁/幂等；
- 失败写 DLQ/告警。

---

## 5. 前端

```text
atlas-ui/react/static/js/Components/
  EconomyHub.tsx
  BankPanel.tsx
  CommercePanel.tsx
  StockMarketPanel.tsx
  PropertyPanel.tsx
  AiPlayersPanel.tsx
  StockChart.tsx
```

- `EconomyHub` 挂在 `ExplorationLab` 或主界面；
- K 线推荐 `lightweight-charts`；
- 金额用字符串/Decimal；
- 失败显示服务端 `detail`；
- AI 标签仅标识，不影响价格/排序。

---

## 6. 测试策略

### 6.1 单元

- 货币兑换/阶梯手续费/关系费/审计；
- Q4+ 直接转账；
- 存单转让/银行间拆借/浮动利率/存款保险双签；
- 利息/LTV/清算；
- 撮合/部分成交/撤单/T+0/T+1/做空/强平；
- 玩家子交易所/券商牌照；
- 零价退市/清算；
- K 线聚合；
- 估值/持有税/主权战争；
- 法院上诉/破产顺位/跨区承认；
- 2PC 预算/unknown SLA；
- AI 评分。

### 6.2 属性测试

- 任意交易序列后账本守恒；
- 任意订单序列后持仓非负；
- 兑换循环必亏；
- 产权交易后 deed/owner 一致。

### 6.3 集成

- 100 笔随机订单后订单/成交/持仓/账本对账；
- 并发兑换/下单/购买同一资产；
- 贷款逾期清算；
- 攻城期间产权冻结；
- 主权战争/持有税/破产冻结；
- 高阶转账/关系费/反洗钱；
- 玩家交易所/做空/退市；
- 跨区 2PC 失败/恢复/收费；
- AI 与真人同权接口。

### 6.4 30 天经济模拟（上线门槛）

#### 输入场景

| 参数 | 低 | 基准 | 高 |
|---|---:|---:|---:|
| 日活玩家 | 20-50 | 100-300 | 1,000-2,000 |
| 人均采集/日 | 3-5 | 5-10 | 10-20 |
| 人均反物质/日 | 20-50 | 50-120 | 120-300 |
| 商品日成交额（Q1 等值） | 50,000 | 500,000 | 5,000,000 |
| 银行存款参与率 | 20% | 40% | 60% |
| 股票参与率 | 10% | 20% | 35% |
| AI 玩家数 | 12 | 20 | 50 |
| 模拟天数 | 30 | 90 | 180 |

#### 发行参数

```text
active_weight = 80
volume_factor = 0.00015
min_daily = 5,000
max_daily = 250,000
reward_share = 0.70
```

#### 30 天必须输出

- Q1 流通量/每日发行/销毁；
- 月度通胀（目标 1%-4%）；
- 货币流通速度；
- 基尼系数；
- 银行储备率/坏账率/挤兑次数；
- 股票波动/流动性/退市数；
- AI 净资产份额/HHI；
- AI 破产率/违约率；
- 玩家破产/违约率。

#### 上线闸门

- 月度通胀 1%-4%；
- 无银行资不抵债；
- 基尼系数 <0.6；
- AI 净资产份额 <35%；
- AI 破产率 ≤20%；
- AI 违约率 ≤10%；
- 无单一 actor 市场份额 >40%；
- 30 天账本对账 0 差异；
- 关系费默认关闭；
- 参数调优记录归档。

#### 产出

- `sim/simulation_report.md`、`sim/simulation_metrics.json`、`sim/charts.html`；
- `sim/calibration_log.md`（参数调优记录归档）；
- `sim/simulate.py`（模拟器源码，固定 seed 可复现）；
- 参数版本 `currency_issuance_policy.id`；
- 未通过不得进入阶段 A 生产。

> 当前状态（v0.2）：低 30 天 / 基准 90 天 / 高 180 天三场景 10 项闸门全部 PASS，对账 0 差异。
> 但模拟为聚合代理模型，**订单簿/撮合对拍未完成**，不能据此宣布阶段 A 可上线。

---

## 7. 验收门槛

### 阶段 A 货币/银行

- 账本守恒；
- 并发无负余额；
- 兑换/存取/贷款正确；
- 银行储备监管生效；
- UI 可用。

### 阶段 B 商业/产权

- 公司/许可/税/指数；
- 产权交易与 `world_planets` 一致；
- 攻城冲突处理。

### 阶段 C 股票/K 线

- 撮合/成交/持仓/K 线对账；
- 熔断/持仓/对倒；
- UI K 线可用。

> 当前状态（`0112`）：撮合/成交/持仓/账本/K 线对账、熔断、持仓上限、自成交隔离、T+0/T+1、做空/借券/还券、
> 分红、退市触发均有集成测试；**UI K 线未做**，退市整理期拍卖与清算分配未做。

### 阶段 D AI

- AI 有正式 player/actor；
- 同权审计通过；
- AI 决策可回放；
- 运行时暂停有效。

> 当前状态（`0113`）：四项均有集成测试覆盖（正式 player/actor/account、无特权（AI 触到同一 10% 持仓上限被拒）、
> `replay` 逐 tick 比对、`ai.runtime_pause` 只停自动下单）。**动作集仅 `stock.order`/`bank.deposit`**，
> 其余 persona 记 idle，待 0114/0115 的服务落地后再扩。

### 阶段 E 公司法/法院/2PC

- 股东会/董事会/关联交易/少数股东保护；
- 破产自动中止/债权顺位/重整计划；
- 跨区 2PC 正常/异常/恢复；
- 判决跨区承认与执行。

> 当前状态（`0114` + `0115`）：股东会表决、关联交易、起诉/证据/确定性判决/一次上诉/执行冻结、
> 破产自动中止/清算顺位/重整计划均有集成测试；跨区 2PC 的协调器日志、费率、5s 预算、租约接管与
> unknown 双人决议已落地并测试（单库阶段为单参与者 no-op）。**跨区判决承认（`court_recognition`）
> 与玩家合议庭未做**；跨区判决承认（`0117`）已落地：他区需先承认、8 类拒绝理由、一次上诉、执行门控。

### 阶段 F 外部 LLM（可选）

- 内部 provider 接口、默认关闭；
- 数据最小化、schema/白名单/超时回退；
- 公开 API/客户端无 provider 泄漏；
- 审计/密钥/出网 allowlist 通过。

> 当前状态（`0116`）：`ai_decision_providers` 四档模式（disabled/shadow/canary/live），默认 `llm=disabled`；
> 输出经 schema + 动作白名单 + 数值范围校验，超时/非法输出一律回退 deterministic 并记 `fallback`；
> 影子模式只写 `shadow_plan` 不执行；灰度按 AI 白名单；token/model/prompt_hash 落 `ai_decisions`；
> 公开 `/players` 与目录不含 provider/model。**出网 allowlist 与真实网关联调未做**（密钥走
> `ATLAS_AI_LLM_API_KEY`，endpoint 存在库里，未配置时适配器直接拒绝）。

---

## 8. 上线顺序

```text
A 货币+银行（内部）
→ A 小流量玩家（只读/兑换）
→ B 公司/商业/产权（白名单）
→ C 股票（模拟盘）
→ C 实盘小流量
→ D AI 玩家（先只做市/银行，逐步开放）
→ E 公司法/法院/2PC（灰度）
→ F 外部 LLM（内部白名单，默认关闭）
```

每阶段：

- 对账；
- 监控；
- 回滚开关；
- 公告。

---

## 9. 可观测性

- 指标：货币供应、通胀、兑换量、银行储备、坏账、股票成交、K 线延迟、AI 盈亏；
- 日志：经济 tx、AI 决策、风控拒绝；
- 告警：账本不平、储备不足、异常波动、AI 亏损超阈值；
- 管理端：只读总览 + 紧急暂停。

---

## 10. 风险清单

| 风险 | 缓解 |
|---|---|
| 货币通胀失控 | 发行上限/通胀目标/回收 |
| 银行挤兑 | 储备/存款保险/央行流动性 |
| 股票操纵 | 持仓限制/熔断/对倒检测 |
| 产权纠纷 | deed/托管/争议期/冻结 |
| AI 特权 | 同 API/同规则/代码审计 |
| AI 策略 bug | 运行时暂停/回放/公告 |
| 跨区一致性 | 首版单库；后续 saga |

---

## 11. 完成定义

- 所有分册的验收项通过；
- 账本/持仓/产权对账无差异；
- AI/真人同权审计通过；
- 监控/告警/回滚可用；
- 文档与代码同步；
- `DEFAULT_REVISION` 指向最终迁移。
