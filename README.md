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

### 2.2 宇宙经济系统（迁移 0110 → 0114）

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

当前迁移 head：`0117_court_recognition`（与 `server/config.py::DEFAULT_REVISION` 同步）。

### 2.3 测试

集成测试跑真实 PostgreSQL（`atlas_test`），覆盖账本守恒、撮合与持仓对账、K 线聚合、做空与强平、
AI 回放与同权、股东会与法院流程、破产清算顺位等。

```bash
ATLAS_TEST_DATABASE_URL="postgresql://postgres:***@127.0.0.1:5432/atlas_test" \
  python -m pytest tests -q      # 167 passed，约 18 分钟
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
                           ├─ migrations/versions/   0110 → 0114
                           └─ jobs/      定时任务（计息、发行、税收、K 线、AI tick、法院期限）

PostgreSQL（账户 / 账本 / 订单 / 持仓 / 案件）    Redis（缓存 / 锁 / 限流）
```

## 4. 目录结构

```
server/                权威后端（本分支核心）
  api/v1/              接口：bank、commerce、properties、stocks、admin_ai、court、insolvency
  domain/              领域服务：currency、bank、company、property、stock、ai_*、court、insolvency
  repo/                纯 SQL 数据访问
  models/              请求模型（pydantic StrictModel）
  migrations/versions/ 0110 → 0114
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

- 已完成：0110–0117（货币银行、商业产权、股票、AI 玩家、公司法/法院/破产、跨区 2PC、AI provider、跨区判决承认），167 个集成测试通过。
- 待办：经济前端图表（K 线/盘口/持仓）、多币种清算折算、玩家合议庭、子交易所接入撮合、
  手续费/税费分账（当前全额进 treasury）。
- 各迁移的已知缺口记录在对应分册的「落地状态」小节（如股票子交易所接入、玩家合议庭、清算多币种折算）。

---

## 8. 许可证与署名

- 本项目与上游 [SurceBeats/Atlas](https://github.com/SurceBeats/Atlas) 使用同一份许可：
  **PolyForm Noncommercial License 1.0.0**，全文见 [`LICENSE.md`](LICENSE.md)（与上游完全一致）。
- 该许可仅允许**非商业用途**：可以阅读、修改、分发，但不得用于商业目的；分发时需保留许可与署名。
- 上游版权归原作者所有，本仓库保留全部上游署名；本分支新增的 `server/`、`tests/` 与
  `docs/cosmic-economy/` 由本仓库维护者编写，同样按上述许可发布。
