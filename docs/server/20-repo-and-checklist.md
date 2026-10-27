# 20 · 仓库结构、模块边界与开工清单（详细设计）

> 对应主文档附录 A、C。本篇给出：目录与文件职责、import 规则矩阵、命名与约定、配置清单、测试布局、常用命令、PR 检查单、第一周逐日计划、与现有 `pymodules` 的关系、验收。

---

## 1. 目录

```
moni-repo/
├─ server/
│  ├─ __init__.py            create_app()：配置→日志→蓝图→错误处理
│  ├─ config.py              读取/校验环境变量，启动自检
│  ├─ api/
│  │  ├─ deps.py             鉴权、限流、幂等、current_player 依赖
│  │  └─ v1/
│  │     ├─ auth.py          register/login/refresh/logout/me
│  │     ├─ session.py       /session、/state
│  │     ├─ explore.py       collect/scan/surface/sector/wreck
│  │     ├─ market.py        quotes/orders
│  │     ├─ contracts.py     list/accept/claim/abandon
│  │     ├─ ships.py         upgrade/modules/overclock
│  │     ├─ assets.py        stations/fleet/hull/fabrication
│  │     ├─ growth.py        tech/codex
│  │     ├─ social.py        npcs/factions/alliances/leaderboards
│  │     ├─ combat.py        combat sessions/turns
│  │     ├─ world.py         world planets/sieges
│  │     └─ migrations.py    local-save
│  ├─ domain/
│  │     ├─ ledger.py        唯一写钱入口 post_transaction()
│  │     ├─ gathering.py     采集奖励公式
│  │     ├─ survey.py        扫描档位/冷却
│  │     ├─ market.py        行情生成/定价
│  │     ├─ contracts.py     刷新/进度/奖励
│  │     ├─ refit.py         改装/超频
│  │     ├─ station.py       离线 tick/领取
│  │     ├─ fleet.py         任务/结算
│  │     ├─ tech.py          科技倍率
│  │     ├─ hull.py          维修
│  │     ├─ craft.py         生产线
│  │     ├─ combat.py        回合推演
│  │     ├─ planet.py        materialize + 改造事务
│  │     ├─ world.py         攻城推演/结算
│  │     └─ settlement.py    settle_offline 统一入口
│  ├─ repo/                  每域一模块，全参数化 SQL
│  ├─ infra/
│  │     ├─ db.py            连接池/tx/query
│  │     ├─ redis.py         client/锁/令牌桶
│  │     ├─ logging.py       结构化日志
│  │     ├─ metrics.py       Prometheus
│  │     ├─ security.py      JWT/Argon2/幂等键
│  │     └─ clock.py         now()（可注入）
│  ├─ jobs/
│  │     ├─ celery_app.py
│  │     ├─ tasks.py         9 个任务
│  │     └─ beat_schedule.py
│  ├─ models/                pydantic 请求/响应
│  └─ migrations/            alembic/
├─ tests/{unit,integration,contract,load,parity}
├─ tools/{frontend_smoke.mjs,parity/,balance_report.py}
├─ docker-compose.yml
└─ docs/server/              本分册
```

---

## 2. import 规则矩阵

| 从 \ 到 | api | domain | repo | infra | models | jobs |
|---|---|---|---|---|---|---|
| api | — | ✅ | ❌ | ✅(deps) | ✅ | ❌ |
| domain | ❌ | ✅(同层) | ✅ | ✅ | ✅ | ❌ |
| repo | ❌ | ❌ | ❌ | ✅ | ✅(类型) | ❌ |
| infra | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| jobs | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |

强制：

1. `domain` 不得 import `flask.request`/`session`。
2. `repo` 不得 `commit()`（事务由 domain 控制）。
3. `api` 不得出现 SQL 字面量。
4. 依赖图进 CI（`pydeps`，有环即失败）。

---

## 3. 命名与约定

| 项 | 规则 | 示例 |
|---|---|---|
| 模块 | `snake_case.py`，一域一文件 | `gathering.py` |
| 表/列 | `snake_case`，表名复数 | `planet_claims` |
| 事件 | `domain.action` | `battle.result` |
| 指标 | `atlas_{domain}_{metric}_{unit}` | `atlas_db_pool_in_use` |
| 开关 | `domain.{name}` | `domain.explore` |
| 日志字段 | 固定集合 | `request_id/route/status/duration_ms` |
| 错误码 | `snake_case` | `insufficient_funds` |

约定：

1. 时间一律 `clock.now()`（可注入），禁止 `datetime.now()`。
2. 随机一律 `random.Random(seed)`，seed 来自业务键。
3. 金额用 `Decimal`，禁止 `float`。
4. 所有公开函数写类型注解；返回值不为 `None` 时不用 Optional。

---

## 4. 配置清单

| 变量 | 必填 | 默认 | 校验 |
|---|---|---|---|
| `ATLAS_ENV` | 是 | — | ∈ dev/staging/prod |
| `ATLAS_DATABASE_URL` | 是 | — | 可连接；生产非超级用户 |
| `ATLAS_REDIS_URL` | 是 | — | 可 ping |
| `ATLAS_JWT_PRIVATE_KEY` / `_PUBLIC_KEY` | 是 | — | 可解析且自签自验 |
| `ATLAS_SECRET_KEY` | 是 | — | ≥ 32 字节 |
| `ATLAS_CACHE_BACKEND` | 否 | `pg` | ∈ pg/sqlite/json |
| `ATLAS_CACHE_SCHEMA` | 否 | `universe_cache` | — |
| `ATLAS_LOG_LEVEL` | 否 | `info` | — |

自检失败 → 启动失败并打印**缺失项名称**（不打印值）。

---

## 5. 测试布局

| 目录 | 内容 | 运行 |
|---|---|---|
| `tests/unit/` | domain 纯函数、公式算例 | `pytest tests/unit -q`（<30s） |
| `tests/integration/` | repo/事务/锁/RLS（testcontainers） | `pytest tests/integration -q` |
| `tests/contract/` | OpenAPI、事件 schema | `pytest tests/contract -q` |
| `tests/load/` | k6 脚本 | `k6 run tests/load/steady.js` |
| `tests/parity/` | JS↔Python 对拍 fixture | `python tools/parity/compare.py` |

命令：

```bash
pytest tests/unit -q
pytest tests/integration -q
alembic upgrade head && alembic downgrade base && alembic upgrade head
npm run test:frontend && npx tsc --noEmit && npm run build
python -m tools.parity.compare --cases 10000
```

---

## 6. PR 检查单

- [ ] 只改一个域；跨域拆 PR
- [ ] 表/字段变更 → 更新 [04](04-data-model.md) 与 [19](19-ddl.md)
- [ ] 新增不变量 → 有测试（[13](13-testing.md)）
- [ ] 涉及资金 → 经 `domain/ledger.py`，有对账用例
- [ ] 新增接口 → OpenAPI 更新，无 breaking diff
- [ ] 新增指标/日志字段 → [11](11-observability.md) 同步
- [ ] 迁移可 `downgrade`
- [ ] 权限显式 `GRANT`（新表）
- [ ] 无 `SELECT *`、无拼接 SQL、无 `datetime.now()`
- [ ] 相关分册更新（链接可点）

---

## 7. 第一周逐日

| 日 | 目标 |
|---|---|
| D1 | 起 PG/Redis/pgbouncer；建库与三角色；`.env`；`create_app()` + `/health/*` |
| D2 | Alembic 初始化 + `0001_core`；up/down/up；CI 骨架 |
| D3 | 结构化日志 + 错误中间件 + 幂等依赖 + 限流依赖 |
| D4 | `domain/ledger.py` + `wallets/ledger_*` 迁移；单测（余额/分录平衡） |
| D5 | `POST /session` + `GET /state`（假数据）；集成测试跑通 |
| 周末 | 回顾：迁移回滚演练、日志可查、对账脚本雏形 |

> 第一周不碰任何玩法域；先把「能起、能迁、能记账、能回滚」四件事做稳。

---

## 8. 与现有代码的关系

| 现状 | 处理 |
|---|---|
| `pymodules/__universe_routes_*.py` | 逐步由 `server/api/v1` 接管；过渡期共存 |
| `__atlas_sqlite_cache.py` | 保留为测试后端；生产用 `PgCacheManager` |
| 前端 26 个 `_atlas*` 键 | 迁移期双写，最终降为只读缓存（[14](14-migration-rollout.md)） |
| `test_fix.py` / `test_p2p_redis.py` | 继续跑；与 pytest 并行 |
| `tools/frontend_smoke.mjs` | 保留，扩展为与服务端对拍 |

---

## 9. 验收

- [ ] 目录与职责一致（review 项）
- [ ] import 矩阵进 CI，无违规
- [ ] 配置缺失时启动失败且提示明确
- [ ] 测试命令在干净环境可复现
- [ ] PR 模板包含检查单
- [ ] 第一周计划完成（能起、能迁、能记账、能回滚）

## 10. 相关文档

- 里程碑与风险：[15-milestones-and-risks.md](15-milestones-and-risks.md)
- 架构分层：[02-architecture.md](02-architecture.md)
- 分册索引：[README.md](README.md)
