# Atlas · 宇宙探索与经济模拟（mnyz 分支）

**简体中文** | [English](README.en.md)

一个可探索的程序化宇宙，叠加了一套**权威服务端 + 多货币经济系统**：货币发行、银行、公司、产权、股票、
AI 玩家、商业法院与破产跑在 PostgreSQL 上，AI 与真人走同一套规则。

> **本项目基于开源项目 [SurceBeats/Atlas](https://github.com/SurceBeats/Atlas) 二次开发。**
> 上游是一个程序化宇宙生成引擎（React + TypeScript + Three.js 前端，Python + Flask 后端，灵感来自《无人深空》），
> 提供星系/恒星/行星生成、3D 渲染、采集与星门链接等基础玩法。
> 本分支在上游基础上新增**独立的权威后端 `server/`** 与**宇宙经济子系统**，并保留上游的游戏入口与渲染层。

---

## 1. 与上游的关系

| 维度 | 上游 SurceBeats/Atlas | 本分支（mnyz） |
|---|---|---|
| 定位 | 程序化宇宙生成引擎 / 探索游戏 | 在其之上做**服务端权威化 + 经济模拟** |
| 前端 | React + TypeScript + Three.js | 沿用（新增经济、议会、任务等面板） |
| 后端 | Flask 单体（`pymodules/`，无状态、以缓存为主） | 新增 `server/`：Flask + pydantic + psycopg3 + Alembic + PostgreSQL + Redis |
| 存档 | 浏览器 localStorage / 本地缓存 | 服务端账户、JWT、幂等写接口、账本与持仓落库 |
| 经济 | 无 | 九级货币、复式账本、银行、公司、产权、股票、AI 玩家、法院/破产 |
| 许可 | PolyForm Noncommercial License 1.0.0 | 相同（见 [`LICENSE.md`](LICENSE.md)） |

上游项目：<https://github.com/SurceBeats/Atlas>

---

## 2. 本分支新增了什么

### 2.1 权威服务端 `server/`

- **分层**：`api/v1/*`（Flask Blueprint）→ `domain/*`（业务规则）→ `repo/*`（纯 SQL）→ PostgreSQL；
  请求模型用 pydantic `StrictModel`，错误统一成 RFC 9457 problem+json。
- **写入纪律**：写接口强制 `Idempotency-Key` 与 `require_auth(write=True)`；余额与持仓只能通过
  `currency_service.post` 这一条复式记账入口变更，逐币种或 Q1 等值平衡。
- **并发**：锁顺序固定（actor → currency → bank → listing → order → asset → escrow → court），
  撮合按 listing 行锁串行化，撤单与成交以订单状态 CAS 为准。
- **运维**：`job_runs` 审计、Redis 锁、DLQ、灰度开关（`feature_flags`）、`/health/deep` 自检。

### 2.2 宇宙经济系统（迁移 0110 → 0140）

迁移链共 **50** 个版本，当前 head 是 `0140_investor_protection`；`api/v1` 对外 **26** 个蓝图、**255** 个端点
（权威清单 [`docs/api/endpoints.md`](docs/api/endpoints.md)，由代码生成）。

<!--fact:migrations.count=50--> <!--fact:migrations.head=0140_investor_protection--> <!--fact:api.blueprints=26--> <!--fact:api.endpoints=255-->

| 迁移 | 能力 | 集成测试 |
|---|---|---|
| `0110_currency_bank` | 九级货币、复式账本、Q4+ 转账、逐级兑换（上 5:1 / 下 1:4.60）、存取款、贷款计息、发行与利率、存单/转让/兑付、同业拆借、存款保险、关系费与合规基金 | 14 |
| `0111_commerce_property` | 公司注册与股权、财报与 book value、产权登记与估值、固定价/拍卖、托管结算（2% 税 + 1% 佣金）、月度持有税 | 3 |
| `0112_stock_market` | IPO、限价/市价撮合（5 档）、双边手续费 + 卖方印花税、持仓 avg_cost、T+0/T+1、五周期 K 线、熔断与持仓上限、对倒检测、做空/借券/保证金、分红、退市触发 | 10 |
| `0113_ai_economy` | AI 玩家的正式账户/角色/档案、确定性决策引擎（可回放）、`ai_decisions` 审计、运维暂停开关、公开玩家目录 | 5 |
| `0114_company_law_court` | 章程/高管/股东会/决议表决（普通 >50%、特别 >2/3、关联方回避）、关联交易审批、商业法院（起诉/证据/确定性判决/一次上诉/执行/冻结）、破产自动中止/债权顺位清算/重整计划类别表决 | 7 |
| `0115_cross_region_2pc` | 跨区 2PC：协调者事务日志、参与者、决策与 outbox、租约接管、5s 预算拒绝、跨区费率（基础+风险+拥堵，4:3:2:1 分账）、unknown SLA 与双人决议；单库阶段为单参与者 no-op | 9 |
| `0116_ai_decision_provider` | 决策 provider 注册表与四档模式（disabled/shadow/canary/live）：默认关闭、影子只审计不执行、灰度按 AI 白名单、输出 schema+动作白名单校验、超时回退、token/provider 审计字段；不新增公开 API | 7 |
| `0117_court_recognition` | 跨区判决承认：他区不自动承认，需被请求区裁定（8 类拒绝理由 + 书面理由），拒绝可上诉一次，未获承认不得在他区执行 | 3 |
| `0118_court_enforcement_2pc` | 他区执行走 2PC（`court_enforcement`，承认记录带 `dt_tx_id`）；同一对当事人的相反裁决在同区自动判为 `conflicting_judgment` 并记录冲突来源 | 2 |
| `0119_revenue_split` | 费用/税费归集与分账：股票手续费 50/30/20（交易所/券商/投资者保护）、持有税 70/30（中央留存/地方），规则化分账 + 每小时 job + 管理端触发 | 3 |
| `0120_price_index` | 市值加权指数（`price_indices`/`price_index_points`，每分钟一个点，可复算）+ 做市商报价（`mm_quotes` 存档，mid/波动率/库存偏移），公开 `/market/indices`、`/stocks/{ticker}/quote`；`POST /stocks/{ticker}/quotes` 双边挂单（点差按波动率、库存偏移平移整条带、不穿价、单侧 ≤ 盘口 25%） | 8 |
| `0121_court_panel` | 玩家合议庭上诉：抽 5 人（3 审理 + 2 替补，AI 与真人同池同规则），每方一次无理由回避，多数裁决，异议写入判决 | 3 |
| `0122_liquidation_fx` | 多币种清算：按 Q1 等值计量 estate，按顺位与比例从各币种余额中按 Q1 占比划付，`paid_q1` 记录实际受偿 | 1 |
| `0123_exchange_matching` | 子交易所：牌照费 5,000 cc4、自定义手续费与上市费、`exchange_code` 挂牌后撮合按该所费率结算；`mm_programs` 让做市程序常驻，job `mm_refresh_tick`（60s）自动重挂双边 | 5 |
| `0124_split_archive` | 拆股复权（价格/持仓/成本/K 线同比调整、挂单撤销、`stock_splits` 留痕）+ K 线冷归档（`stock_candle_archive`，job 每日搬 30 天前的 1m/5m） | 4 |
| `0125_broker_venue` | 券商会籍与经纪佣金：券商牌照 2,000 cc4、入会费 500 cc4/所、客户经纪账户（每个客户一个，佣金受交易所会籍上限约束）、成交时按 bp 划付券商并落 `broker_commissions`；同一标的多所挂牌（`listing_venues`），订单带 `venue_id`、不指定时按最优盘口路由，撮合与费率按所隔离 | 4 |
| `0126_split_cold` | 并股碎股折现（不足一股按并股后价格由公司金库付现，`cash_in_lieu`/`holders_rounded` 留痕）+ 复权因子接口 + 归档按月 RANGE 分区（`candle_archive_partitions`，job 预建/冷备 detach/可 restore） | 3 |
| `0127_domain_events` | 同事务 append-only 事件日志 `domain_events`：`domain.events.publish` 与状态变更写在同一事务（回滚即消失），payload 只放 id/code/金额；`GET /events?since=` 增量读取 | 2 |
| `0128_travel_authority` | 航行权威：`POST /travel/quote` 服务端算距离/燃料，`/travel/commit` 服务端扣费并落 `travel_log`；`GET /state` 补 `in_flight[]`（最多 5 条未到达）、`GET /ship` 服务端派生 `status[]` | 8 |
| `0129_announcements` | 全服公告 `announcements`：无受众分段，`starts_at`/`ends_at` 界定展示窗口，severity 复用 09 词表四级让外壳直接渲染；全部写 `audit_log` | 6 |
| `0130_crafting` | 生产线搬上服务端：配方为种子数据（不属玩家数据），冷却记在最后一次运行的 `ready_at` 而不是独立计时器——手改存档不再能凭空产出稀有材料 | 6 |
| `0131_weekly_claims` | 周挑战领奖事实：目标（探索/改装等级/图鉴）本就派生，只有「是否已领」需要落库，每 `(player, week)` 一行 + 付款账本 tx | 4 |
| `0132_relics` | 遗迹档案：行星→碎片索引由 FNV-1a 与客户端同哈希，只存「哪颗行星出了第几段 + 完成奖是否已发」；lore 文本仍留在客户端 | 4 |
| `0133_planet_visits` | 行星足迹日志：`(player, planet_key)` 主键即去重，`coords`/`sector_key` 冗余存储让「今日探索星系/系统/行星」变成单次索引聚合，替代扫客户端存档计数 | 4 |
| `0134_loan_collateral` | 抵押登记与清算（T-13 步骤 2–4）：`(loan_id, asset_id)` 唯一防一契两押，`pledged_value` 固定为登记时估值快照，`status` 走 `pledged→seized→sold`（还清 `released`） | 10 |
| `0135_ipo_auction` | IPO 上议会（`council_motions.kind` 加 IPO 类）+ 首日集合竞价：`auction_ends_at` 窗口内只收单不撮合，`auction_cleared_at` 记录单一清算价，部分索引让清算 job 幂等 | 8 |
| `0136_resolution_kinds` | `resolutions.kind` 补齐减资，并预留合并/要约收购，避免下一批 M&A 只为存一条决议再开迁移 | 7 |
| `0137_property_disputes` | 产权争议 + 24 小时异议期（T-18）：冻结**不新造状态机**，复用 `property_encumbrances(kind='dispute')` + `status='frozen'`；`encumbrance_id` 保证解冻只解自己那条，不误伤银行 `lien` | 6 |
| `0138_ledger_reversal` | 账本冲正：`reversal_of`/`reversal_reason` 两列 + 部分唯一索引「一笔至多冲正一次」，冲正冲正行即 redo；账本本身仍 append-only，纠错不改旧行 | 7 |
| `0139_delisting_consolidation` | 退市三阶段（T-22）：`consolidation` 30 天照常交易让持有人有出口 → `auction` 3 天停牌、清算价取整理期 VWAP → 先还银行再按股分 | 5 |
| `0140_investor_protection` | 投资者保护基金理赔（T-23）：0119 已把股票手续费 20% 划入 `insurance_fund`，本迁移补索赔窗口；每人同时最多一条未决 + 单笔上限 1 万，`pending`→`approved`/`partial` | 6 |

当前 head 与 `server/config.py::DEFAULT_REVISION` 同步（启动自检，不匹配时 `/health/ready` 报错）。

> 「集成测试」列 = 对应 `tests/integration/test_*.py` 里的测试函数数
> （`grep -c 'def test_' <file>`，2026-11-02 复测）；一个测试文件覆盖多个迁移时归主迁移。
> 全仓测试函数共 **323** 个（含 unit 与参数化未展开部分）。<!--fact:tests.functions=323-->

### 2.3 测试

集成测试跑真实 PostgreSQL（`atlas_test`），覆盖账本守恒、撮合与持仓对账、K 线聚合、做空与强平、
AI 回放与同权、股东会与法院流程、破产清算顺位等。

```bash
ATLAS_TEST_DATABASE_URL="postgresql://postgres:***@127.0.0.1:5432/atlas_test" \
  python -m pytest tests -q      # 323 个测试函数，约 30 分钟
```

---

## 3. 架构

```
浏览器
  └─ React + TypeScript + Three.js（atlas-ui/react）
       ├─ /api/*      → pymodules/（上游：宇宙生成、行星渲染、采集、P2P、星门）
       └─ /api/v1/*   → server/  （本分支：账户、货币、银行、公司、产权、股票、AI、法院）
                           ├─ domain/    业务规则与不变量
                           ├─ repo/      只写 SQL
                           ├─ migrations/versions/   0110 → 0140
                           └─ jobs/      定时任务（计息、发行、税收、K 线、AI tick、法院期限）

PostgreSQL（账户 / 账本 / 订单 / 持仓 / 案件）    Redis（缓存 / 锁 / 限流）
```

## 4. 目录结构

```
server/                权威后端（本分支核心）
  api/v1/              接口：蓝图与端点清单见 docs/api/endpoints.md（由代码生成）
                         · 身份与世界：auth、session、meta、universe、travel、assets、explore、tasks
                         · 经济：economy、ledger、bank、stocks、brokers、market、revenue、
                           commerce、properties、protection
                         · 治理与裁决：council、court、insolvency
                         · 玩法与运维：crafting、admin_ai、admin_ops、cutover、internal_dt
  domain/              领域服务：currency、bank、company、property、stock、ai_*、court、insolvency
  repo/                纯 SQL 数据访问
  models/              请求模型（pydantic StrictModel）
  migrations/versions/ 0110 → 0140
  jobs/                定时任务与 worker
pymodules/             上游游戏后端（宇宙生成、行星渲染、P2P、缓存）
atlas-ui/react/        前端（React + Three.js）
docs/cosmic-economy/   经济系统设计分册（00 架构 … 10 AI 决策引擎）
docs/server/           服务端设计文档
tests/                 单元 + 集成测试
```

---

## 5. 快速开始

### 5.1 依赖

Python 3.13、Node 22、PostgreSQL 16、Redis 7。

### 5.2 后端

```bash
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-server.txt

# 生成开发密钥与 .env.server（DSN 换成你自己的库）
python -m server.cli init-dev --dsn "postgresql://postgres:***@127.0.0.1:5432/atlas"
python -m server.cli migrate          # alembic upgrade head → 0114
python -m server.cli check            # 启动自检（库版本、密钥、缓存）
python -m server.run                  # 127.0.0.1:8000
```

生产用 `gunicorn -k gthread -w 4 server.wsgi:application`，或：

```bash
docker compose -f docker-compose.server.yml up -d
```

### 5.3 前端与上游游戏入口

```bash
npm install && npm run dev            # Vite 开发前端
python __main__.py                    # 上游单体入口（宇宙生成 + 游戏 API）
```

> 两套后端可以并存：`__main__.py` 提供程序化宇宙与渲染数据，`server.run` 提供账户与经济；
> 只跑经济功能时不需要启动上游单体。

---

## 6. 设计文档

| 文档 | 内容 |
|---|---|
| [`docs/cosmic-economy/00`](docs/cosmic-economy/00-architecture-and-actors.md) | 架构与 actor 模型、全局锁顺序 |
| [`01`](docs/cosmic-economy/01-currency.md) / [`02`](docs/cosmic-economy/02-bank.md) | 九级货币与发行、银行与准备金 |
| [`03`](docs/cosmic-economy/03-commerce-center.md) / [`04`](docs/cosmic-economy/04-property.md) | 商业中心、产权与估值 |
| [`05`](docs/cosmic-economy/05-stock-kline.md) | 股票、撮合、K 线、做空 |
| [`06`](docs/cosmic-economy/06-ai-players.md) / [`10`](docs/cosmic-economy/10-ai-decision-engine.md) | AI 玩家同权、确定性决策引擎 |
| [`07`](docs/cosmic-economy/07-implementation-testing.md) | 迁移拆分、job、测试与上线闸门 |
| [`08`](docs/cosmic-economy/08-company-law-bankruptcy.md) / [`09`](docs/cosmic-economy/09-cross-region-2pc.md) | 公司法/法院/破产、跨区 2PC |
| [`ATLAS_PROJECT_DOCUMENTATION.md`](ATLAS_PROJECT_DOCUMENTATION.md) | 上游引擎的模块级技术说明 |

---

## 7. 状况与路线

- 已完成：0110–0119（货币银行、商业产权、股票、AI 玩家、公司法/法院/破产、跨区 2PC、AI provider、
  跨区判决承认与 2PC 执行、费用分账），172 个集成测试通过。
- 前端：新增「星际股市」面板（盘口 / K 线 / 持仓，涨红跌绿），挂在星舰实验舱；`vite build` 与前端冒烟测试通过。
- 待办：跨所路由的智能拆单（一笔单拆到多个所）、券商的客户资产托管与融资融券、归档冷备的异地导出（pg_dump/S3）。
- 各迁移的已知缺口记录在对应分册的「落地状态」小节（如股票子交易所接入、玩家合议庭、清算多币种折算）。

---

## 8. 许可证与署名

- 本项目与上游 [SurceBeats/Atlas](https://github.com/SurceBeats/Atlas) 使用同一份许可：
  **PolyForm Noncommercial License 1.0.0**，全文见 [`LICENSE.md`](LICENSE.md)（与上游完全一致）。
- 该许可仅允许**非商业用途**：可以阅读、修改、分发，但不得用于商业目的；分发时需保留许可与署名。
- 上游版权归原作者所有，本仓库保留全部上游署名；本分支新增的 `server/`、`tests/` 与
  `docs/cosmic-economy/` 由本仓库维护者编写，同样按上述许可发布。
