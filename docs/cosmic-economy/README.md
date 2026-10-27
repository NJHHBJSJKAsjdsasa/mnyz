# 宇宙经济系统文档

本目录是“宇宙货币 / 宇宙银行 / 商业中心 / 股票 K 线 / 产权 / AI 玩家”的详细设计分册。

## 阅读顺序

| 文档 | 内容 |
|---|---|
| [00-architecture-and-actors.md](00-architecture-and-actors.md) | 总体架构、经济主体、货币账本、与现有系统的边界 |
| [01-currency.md](01-currency.md) | 九级宇宙货币、发行/回收、兑换算法 |
| [02-bank.md](02-bank.md) | 中央银行、商业银行、AI 银行、存贷/储备/利率 |
| [03-commerce-center.md](03-commerce-center.md) | 宇宙商业管理中心、公司、许可、税费、指数、IPO 审核 |
| [04-property.md](04-property.md) | 行星与小星系产权、估值、挂牌、拍卖、托管 |
| [05-stock-kline.md](05-stock-kline.md) | 股票、订单簿、撮合、K 线、分红、熔断 |
| [06-ai-players.md](06-ai-players.md) | AI 玩家 = 玩家、persona、决策循环、同权与审计 |
| [07-implementation-testing.md](07-implementation-testing.md) | 迁移拆分、模块/API 清单、测试、上线顺序 |
| [08-company-law-bankruptcy.md](08-company-law-bankruptcy.md) | 完整公司治理、商业法院、破产/重整/清算 |
| [09-cross-region-2pc.md](09-cross-region-2pc.md) | 跨区 2PC、协调者、恢复、与 saga 的边界 |
| [10-ai-decision-engine.md](10-ai-decision-engine.md) | 确定性策略引擎 + 内部外部 LLM 适配器 |

[design.md](design.md) 是拆分前的完整总设计，保留作历史参考；新开发以分册为准。

## 最重要的一条原则

**AI 玩家就是玩家。**

- AI 有正式 `players` 行和 `economic_actors` 行；
- 真人能做的采集、交易、合同、银行、公司、IPO、股票、做空、产权、议会、联盟、攻城、主权战争、经营交易所，AI 都能做；
- 真人受的费率、税率、冷却、持仓、反垄断、法律限制，AI 也一样受；
- AI 不享受零手续费、优先撮合、私有数据或特殊权限；
- `ai_agents` 只是自动化配置，不是另一种玩家身份。

## 已定关键决策

| # | 决策 |
|---|---|
| 1 | Q4-Q9 高阶货币允许玩家间直接转账 |
| 2 | 向上兑换 6% 起，按金额阶梯下降；关系费/贿赂默认关闭，开启后上限 2×base fee，有审计/罚款风险 |
| 3 | 定期存款可转让 |
| 4 | 银行间拆借市场首版开放 |
| 5 | 存款保险基金由央行 + CCMC 共同管理 |
| 6 | 贷款利率浮动（固定需审批） |
| 7 | 允许一人/一个 actor 持有多家公司，关联交易合并披露 |
| 8 | 证券公司/交易所可由玩家经营；首版 1 个官方交易所 + 玩家子交易所；需牌照、央行总行/官方/CCMC 审查 |
| 9 | 关税上限动态调整（5%-15%） |
| 10 | 小星系允许“主权战争” |
| 11 | 行星建筑随产权自动转移 |
| 12 | 产权持有税按月征收，欠税可 lien/拍卖 |
| 13 | T+0 与 T+1 同时支持，按 listing 配置 |
| 14 | 允许做空，但必须有保证金/借券，禁止裸卖空 |
| 15 | 玩家可经营子交易所/专业板，受官方清算/监管 |
| 16 | 零价退市/清算完整设计（拍卖、索赔权、空头结算） |
| 17 | 法院保留一次玩家合议庭上诉 |
| 18 | 不允许个人破产，只处理公司/银行 |
| 19 | 跨区判决需被请求区法院确认，不自动承认 |
| 20 | 破产管理人由 CCMC 指派 |
| 21 | 跨区 2PC Coordinator：3 副本 + 控制库租约，发起区优先，故障接管 |
| 22 | unknown 事务 SLA：10s 告警、15min 值班、1h 决定、4h 升级 |
| 23 | 首版拒绝 >5s 的跨区 2PC |
| 24 | 跨区手续费显式计入 all-in 价格；延迟通过真实网络/做市点差体现，不付费插队 |

### 补充实现约束

- Q1 发行：`active×80 + 成交额×0.00015`，上下限 5,000/250,000，30 天模拟通过才上线。
- 关系费默认关闭，上限 `2×base_fee`，开启前需模拟/审计评估。
- `bank_officer` 是独立职位 actor，不是玩家；关系费进该 actor，审计可冻结/追缴。
- 全局锁顺序见 `00 §4.4`；07/09 必须引用，不得各自定义。
- 反垄断：单 actor >40%、top3 >70%、HHI >2500 触发；AI 同一阈值。
- 破产管理人 CCMC 指派；个人不破产；跨区判决需被请求区法院确认。
- `currency_exchange_quotes` 存牌价快照；`compliance_fund` 存关系费追缴/罚款。
- 发行参数调整走 `council_motions.kind='issuance_policy'`。
- 30 天模拟闸门增加 AI 破产率 ≤20%、违约率 ≤10%。

## 九级货币

| 品质 | 名称 | code |
|---|---|---|
| Q1 | 星尘币 | `cc1` |
| Q2 | 星砂币 | `cc2` |
| Q3 | 蔚蓝币 | `cc3` |
| Q4 | 银核币 | `cc4` |
| Q5 | 金核币 | `cc5` |
| Q6 | 星辉币 | `cc6` |
| Q7 | 曲率币 | `cc7` |
| Q8 | 奇点币 | `cc8` |
| Q9 | 创世币 | `cc9` |

## 模拟与上线闸门

`sim/` 是 07 §6.4 的离线模拟，可复现：

| 文件 | 内容 |
|---|---|
| [sim/simulate.py](sim/simulate.py) | 模拟器 v0.2（stdlib only，固定 seed），三场景一键重跑 |
| [sim/simulation_report.md](sim/simulation_report.md) | 闸门判定报告（低/基准/高） |
| [sim/simulation_metrics.json](sim/simulation_metrics.json) | 每日指标序列、闸门明细 |
| [sim/charts.html](sim/charts.html) | M1 / 基尼 / AI 份额 / 银行 / 指数图表 |
| [sim/calibration_log.md](sim/calibration_log.md) | 参数调优记录（闸门要求归档） |

当前结论（v0.2）：低 30 天 / 基准 90 天 / 高 180 天 **三场景 10 项闸门全 PASS**，账本对账 0 差异。
边界：聚合代理模型，未做订单簿对拍；**通过闸门不等于可以上线**，07 §6.4 的对拍与阶段 A 验收仍需完成。

```bash
python sim/simulate.py            # 重跑并重建报告/图表
python sim/simulate.py --only low # 单场景
```

## 实现进度

| 迁移 | 状态 | 落地内容 |
|---|---|---|
| `0110_currency_bank` | ✅ 已落地 | 25 张表、`domain/currency_service.py`、`domain/bank_service.py`、`api/v1/bank.py`、3 个 job、10 个集成测试 |
| `0111_commerce_property` | ✅ 已落地 | 20 张表、`company_service`、`property_service`、`api/v1/commerce.py`、`api/v1/properties.py`、3 个集成测试 |
| `0112_stock_market` | ✅ 已落地 | 11 张表、`stock_service`、`repo/stocks.py`、`api/v1/stocks.py`、2 个 job、10 个集成测试 |
| `0113_ai_economy` | ✅ 已落地 | 2 张表 + `ai_provider`/`ai_economy`、`api/v1/admin_ai.py`、job `ai_economy_tick`、5 个集成测试 |
| `0114_company_law_court` | ✅ 已落地 | 19 张表 + `company_law`/`court_service`/`insolvency_service`、`api/v1/court.py`、`api/v1/insolvency.py`、2 个 job、7 个集成测试 |
| `0115_cross_region_2pc` | ✅ 已落地 | 6 张表 + `dt_coordinator`、`api/v1/internal_dt.py`、job `dt_recovery`/`dt_outbox_relay`、9 个集成测试 |
| `0116_ai_decision_provider` | ✅ 已落地 | `ai_decision_providers` + `ai_decisions` 审计字段、`ai_provider.LLMProvider`、管理端 provider 开关、7 个集成测试 |
| `0117_court_recognition` | ✅ 已落地 | `court_recognition` 表 + `court_service` 承认流程（8 类拒绝理由/一次上诉/执行门控）、3 个集成测试 |
| `0118_court_enforcement_2pc` | ✅ 已落地 | 承认后执行走 2PC、冲突判决自动驳回、2 个集成测试 |
| `0119_revenue_split` | ✅ 已落地 | `revenue_collections`/`revenue_split_rules`/`revenue_split_runs`、`revenue_service`、job `revenue_split_tick`、3 个集成测试 |
| `0120_price_index` | ✅ 已落地 | `price_indices`/`price_index_points`/`mm_quotes`、`market_index`（指数+报价）、`api/v1/market.py`、job `price_index_tick`、前端 `StockMarketPanel`、5 个集成测试 |
| `0121_court_panel` | ✅ 已落地 | `court_panels`/`court_panel_members`、`court_panel`（抽签/回避/表决/异议）、`api/v1/court.py` 端点、3 个集成测试 |
| `0122_liquidation_fx` | ✅ 已落地 | `insolvency_claims.paid_q1`、`insolvency_service` 多币种按 Q1 等值分配、1 个集成测试 |

`0110` 已实现的能力：

- 九级货币、`economic_actors`、复式账本（每笔 tx 逐币种或 Q1 等值平衡）；
- 玩家间转账（仅 Q4-Q9，决策 1）、逐级兑换（向上 5:1 + 阶梯费燃烧，向下 1:4.60 + 8% 点差归市场账户）；
- 存取款、贷款发放/计息/还款、准备金约束；
- 每日发行（clamp 5k-250k，70% 财政奖励预算 / 30% 央行储备）、利率记录；
- `bank_interest_tick` / `currency_issuance_tick` / `reconcile_currency` 三个 job。

`0110` 的存单/存单报价、同业拆借、存款保险、关系费/合规基金已全部接上服务与接口。
仍未实现：银行牌照（玩家/AI 开银行）、浮动利率自动重定价、发行奖励的发放任务（`grant_reward` 有接口，无调度）、
存单/贷款的逾期处置（逾期 7 天清算、lien/拍卖）。

`0111` 已实现的能力：

- 公司注册（Q3 费用）、股本与股权转让、控股股东财报披露、book value 更新；
- 产权登记、04 §3.1 估值公式、固定价挂牌、拍卖出价（最小加价）、托管结算（2% 转让税燃烧 + 1% 佣金进财政）、
  月度持有税单（0.1%-1%）与缴税。

`0111` 只建表、未接服务：商业许可的申请/审批 API（`commerce_licenses` 有 repo，无接口）、价格指数计算任务、
商业争议、交易所/券商、小星系与主权战争、反垄断快照。未实现：24h 争议期（当前即时交割）、
持有税逾期 30 天 lien / 90 天拍卖、持有税 70/30 分账（当前 100% 进财政）。

`0112` 已实现的能力：

- IPO（成立满 7 天 + 净资产 ≥ 5 万 cc4 + 自由流通 ≥ 20% + 控股 50% 审批），新增股份进公司 treasury actor 并挂卖单；
  IPO 时把老股东的公司股份同步成可交易股票（否则盘口只有 treasury 单边）；
- 撮合：限价/市价、价格优先 + 时间优先、市价最多吃 5 档、部分成交、剩余撤销、自成交不进撮合；
- 结算：买卖各 0.1% 手续费 + 卖方 0.1% 印花税（最低 0.0001），全部进财政；成交/成交表/持仓/K 线同事务；
- 持仓：`stock_holders.shares/locked_shares/avg_cost`，T+0 即时可卖、T+1 锁到次日 UTC 00:00；
- K 线：1m/5m/15m/1h/1d 五周期 upsert，空桶不补，日线汇总写 `stock_daily_summary`；
- 风控：±20% 熔断 15 分钟、±30% 停牌至次日、单账户持仓 ≤ 流通 10%（发起人股份豁免）、
  1 分钟内同价买卖各 ≥3 笔判对倒、单票空头 ≤ 流通 15%；
- 做空：保证金账户（150% 初始/130% 维持/105% 强平线）、借券池（1%-10% 年化、可拆分撮合）、
  开空走市场卖单、还券走市场买单、借券费日计；
- 分红（控股 50% 宣布，按登记持仓派发）、退市触发（连续 20 日最低价/连续 10 日无成交/净资产为负）与结案。

`0112` 未做：玩家子交易所/券商牌照接入撮合（`exchanges`/`securities_firms` 只有表）、IPO 的 CCMC 审核与议会 4 票、
首日集合竞价、退市整理期拍卖与做市商双边报价、清算分配（依赖 08 破产顺位）、拆股/并股的复权因子、
投资者保护基金、`stock_candle_close` 独立任务（当前随成交即时聚合，日线由 `stock_daily_tick` 汇总）、
K 线冷归档（1m 30 天 / 5m 180 天保留策略未跑）、前端 `StockMarketPanel`/`StockChart`。

`0113` 已实现的能力：

- AI 是正式玩家：隐藏 `accounts`（`email`/`password_hash` 为 NULL、`status='active'`，登录路径按 email 查找所以永不可登录）
  + `players.controller='server_ai'` + `economic_actors` + `ai_agents` 四件套，一次性注入初始资本（`ai_capital_seed`）后不再补；
- 9 种 persona 的 12 人名册（`AI-001`…），单一 persona ≤ 40% 强制校验；同时把议会 5 个 AI 席位挂到对应 AI 玩家；
- 确定性决策引擎 `ai_provider.DeterministicProvider`：`seed=hash(agent|tick|snapshot_hash|policy_version)`，
  不使用墙钟/`random()`；白名单动作 `stock.order`、`bank.deposit`，其余 persona 记 idle；
- 每个 tick 写一条 `ai_decisions`（含上下文与 plan），`replay(agent_id, tick)` 重算并逐字比对；
- `AI_RUNTIME_PAUSE` 走 `feature_flags.ai.runtime_pause`，只停自动下单，不动资产/席位；
- 管理端 `POST /admin/ai/tick`、`POST /admin/ai/runtime-pause`、公开 `GET /players?controller=ai`、`GET /players/{id}`
  （响应不含 provider/model/prompt）。

`0113` 未做：AI 参与产权/公司/银行/议会/攻城的动作类型（对应 0114/0115 服务尚未落地）、
做市商双边报价与库存中性（当前只有 inventory 单向补仓）、同质化相关性检测（06 §11 的 0.8 阈值）、
`llm_shadow`/`llm_canary`/`llm_live` 模式与 `0116` provider 表、对外 `/players` 分页与筛选。

`0114` 已实现的能力：

- 治理：章程（六类必备条款校验）、高管任免、董事席位、股东会召集、决议提案/表决/关闭；
  普通决议 >50%、特别决议 >2/3，按 `share_holdings` 加权，关联方自动弃权；
  决议通过后自动落地（任命高管、改章程、批关联交易、解散、分红走 05 的派息）；
- 关联交易：申报 → 控股股东批准（关联方本人回避）→ 未披露的可由法院判决撤销；
- 商业法院：三级法院 seed 在 core 区；起诉收 1%（最低 10）诉讼费进财政；证据双方各提交；
  一审为确定性 AI 法官（证据数量 + 案件哈希扰动，可复算）；每案一次上诉（30% 改判）；
  执行时按被告余额划扣，不足则生成 `asset_freezes`；
- 破产：资不抵债或债权人申请 → 自动中止 30 天（期间禁止起诉）；管理人由 CCMC 的 `officer_pool` 担任；
  债权申报即确认（管理人复核为简化版）；清算按 破产费用 → 担保 → 优先 → 无担保 → 罚款 → 股东 顺位，
  同类按比例分配；重整计划按类别投票（>1/2 人数 + 2/3 金额）后确认；
- 数据：`companies.status` 增加 `bankrupt`；法院开庭与计划投票由 `court_deadlines` / `insolvency_plan_tick` 推进。

`0114` 未做：玩家合议庭上诉（08 §12.1）、AI 法官回避/陪审、回购/增发/减资/并购/要约收购的实际资金动作、
评估权与压迫救济、跨区判决承认（09）、多币种清算折算（当前只清算 cc4 余额）、
管理人赔偿责任与职业保险、`asset_freezes` 与产权/股票挂牌的联动冻结。

## 建议开发顺序

1. `0110_currency_bank` + 货币/银行 MVP
2. `0111_commerce_property` + 公司/商业中心/产权
3. `0112_stock_market` + 股票/K 线
4. `0113_ai_economy` + AI 玩家同权经济

先只做阶段 A，货币账本对账通过后再叠股票和产权。
