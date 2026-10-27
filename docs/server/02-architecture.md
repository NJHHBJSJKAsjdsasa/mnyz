# 02 · 生产架构、分层与运行时（详细设计）

> 对应主文档 §2、§3。本篇给出：拓扑与端口、分层与 import 规则、写/读/异步三条链路的逐步说明、进程与参数、配置与自检、健康检查语义、故障域行为、反模式、验收。

---

## 1. 拓扑与端口

```
Internet
  │ 443
Nginx（TLS1.2+/HTTP2/静态/gzip）
  │ 127.0.0.1:8000（keep-alive 200）
Gunicorn + UvicornWorker × 4
  ├─ Redis 6379（限流/缓存/锁/队列）        ─┐
  ├─ pgbouncer 6432（transaction pooling）  ─┤
  └─ Celery broker（Redis db=1）            ─┘
pgbouncer ──▶ PostgreSQL 15 5432（主）
                    └── 流复制 ──▶ 5433（只读副本）
Celery worker × 2 + beat × 1
```

端口约定：应用只监听 `127.0.0.1:8000`；PG/Redis/pgbouncer 不暴露公网；`/metrics` 仅内网。

---

## 2. 分层与 import 规则

```
api ──▶ domain ──▶ repo ──▶ infra
 │        │
 └──▶ models（pydantic）
jobs ──▶ domain
```

| 层 | 目录 | 允许 | 禁止 |
|---|---|---|---|
| api | `server/api/v1/` | 鉴权、校验、限流、调 domain、序列化 | SQL、事务、业务规则、外部 IO |
| domain | `server/domain/` | 规则、事务、锁顺序、幂等、写 outbox | `flask.request`、环境变量、直接返回 HTML |
| repo | `server/repo/` | 参数化 SQL、行映射、批量 | `commit()`、业务分支、拼 SQL |
| infra | `server/infra/` | 池、Redis、日志、指标、时钟 | 业务 |
| jobs | `server/jobs/` | 周期任务、重放 | 被请求同步调用 |

CI 检查：`pydeps` 输出必须无环；`api/` 目录禁止出现 `SELECT`/`INSERT` 字面量（grep 断言）。

---

## 3. 写请求链路（12 步）

以 `POST /planets/{key}/collect` 为例：

| # | 步骤 | 失败返回 |
|---|---|---|
| 1 | Nginx 注入 `X-Request-Id`，TLS 终止 | — |
| 2 | 验 JWT（RS256 本地验签，读 `ver` 缓存 30s） | 401 |
| 3 | 限流 `rl:{player_id}:collect`（Redis Lua） | 429 |
| 4 | pydantic 校验（`coordinates` 格式、范围 0–1e7） | 400 |
| 5 | 读 `idempotency_keys`（占位 `INSERT ... ON CONFLICT DO NOTHING`） | 409 冲突 / 200 重放 |
| 6 | `BEGIN`；`SELECT ... FROM players FOR UPDATE` | 423 冻结 |
| 7 | `settle_offline(player)`（幂等，写账本） | — |
| 8 | 冷却原子占用 `UPDATE cooldowns ... WHERE ready_at <= now()` | 429 + `retry_after_ms` |
| 9 | `domain.gathering.reward()` 纯函数计算 | — |
| 10 | `post_transaction(kind='collect')`（条件更新钱包 + 分录） | 409 余额不足 |
| 11 | `INSERT outbox_events`；`state_version += 1`；写幂等响应 | — |
| 12 | `COMMIT`；返回 `200 + ETag` | 503 锁超时/序列化 |

事务预算：P95 ≤ 200ms；`lock_timeout=1s`、`statement_timeout=5s`。

---

## 4. 读请求链路（6 步）

| # | 步骤 | 说明 |
|---|---|---|
| 1 | 验 JWT + 限流（读额度 300/min） | — |
| 2 | repo 查询（强制注入 `player_id`） | 越权 → 404 |
| 3 | 单语句自动提交，不开事务 | 多表只读可用 `REPEATABLE READ` |
| 4 | 序列化（pydantic `response_model`） | — |
| 5 | 附 `ETag`、`X-Request-Id` | — |
| 6 | 缓存命中（Redis，键含版本） | miss 回源 |

只读接口**不得**触发写（唯一例外：`GET /state` 会结算离线，按写限流）。

---

## 5. 异步链路

```
事务内 INSERT outbox_events
      │ commit
      ▼
worker: SELECT ... WHERE published_at IS NULL ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED
      │
      ├─ publish(topic, payload, id)
      ├─ 成功：UPDATE published_at = now()
      └─ 失败：保留，指数退避重试；>5 次进 DLQ + 告警
```

约束：同一 `aggregate_id` 按 `id` 升序（分区 worker），消费端按 `id` 幂等。

---

## 6. 进程与参数

| 组件 | 参数 | 理由 |
|---|---|---|
| Gunicorn | `-w 4 -k uvicorn.workers.UvicornWorker --max-requests 2000 --max-requests-jitter 200 --timeout 30` | 定期回收 worker |
| Celery worker | `-c 2 --max-tasks-per-child 500 --prefetch-multiplier 1` | 防长任务污染、均衡 |
| Celery beat | 单实例 + Redis 锁 `lock:beat`（TTL 60s，心跳 20s） | 多实例会重复调度 |
| pgbouncer | `pool_mode=transaction`, `default_pool_size=25`, `max_client_conn=300`, `server_reset_query=DISCARD ALL` | 连接复用 |
| PG | `shared_buffers=4GB`, `work_mem=16MB`, `maintenance_work_mem=512MB`, `statement_timeout=5s`, `idle_in_transaction_session_timeout=10s`, `lock_timeout=1s` | 防拖垮 |
| Nginx | `client_max_body_size 1m`, `proxy_read_timeout 35s`, gzip, 静态缓存 1y | — |

---

## 7. 配置与启动自检

| 变量 | 必填 | 说明 |
|---|---|---|
| `ATLAS_ENV` | 是 | dev/staging/prod |
| `ATLAS_DATABASE_URL` | 是 | 经 pgbouncer |
| `ATLAS_REDIS_URL` | 是 | — |
| `ATLAS_JWT_PRIVATE_KEY`/`PUBLIC_KEY` | 是 | PEM 或路径 |
| `ATLAS_SECRET_KEY` | 是 | 游标签名等 |
| `ATLAS_CACHE_BACKEND` | 否 | 默认 `pg`，缺失回落 `sqlite` |
| `ATLAS_LOG_LEVEL` | 否 | 默认 `info` |

自检失败即拒绝启动：

1. Alembic 版本 == 代码期望；
2. Redis `PING`；
3. JWT 自签自验；
4. 应用与 DB 时钟偏差 ≤ 2s；
5. 必需参考数据行数（`resource_types=12`、`tech_nodes=16`）。

---

## 8. 健康检查语义

| 端点 | 检查 | 失败动作 |
|---|---|---|
| `/health/live` | 进程存活（不查依赖） | 容器重启 |
| `/health/ready` | DB `SELECT 1` < 50ms、Redis `PING`、迁移版本 | 从 LB 摘除（不重启） |
| `/health/deep`（内网） | 副本延迟、outbox 积压、队列深度 | 告警 |

`ready` 超时 2s；连续 3 次失败摘除，恢复 2 次后加回。

---

## 9. 故障域

| 故障 | 影响 | 行为 |
|---|---|---|
| 单 worker 崩溃 | 无 | 进程管理器重启，LB 摘除 5s |
| Redis 不可用 | 限流/缓存失效 | 退回进程内令牌桶 + 直查 DB，`503` 仅限写 |
| pgbouncer 不可用 | 全部写失败 | 3s 超时快速失败 `503 storage_offline` |
| 主库不可用 | 写失败、读降级 | 提升副本 → 改 DSN → 重连 |
| Celery 不可用 | 任务停摆 | 请求不阻塞；outbox 积压告警；恢复后自动追平 |
| 单 AZ 故障 | 无（同区副本） | 副本提升，RPO 0 |
| 整区故障 | 该区不可写 | 全局路由切换（见 12） |

---

## 10. 反模式（评审直接打回）

1. 路由里 `conn.execute(...)`。
2. `domain` import `flask.request`。
3. `repo` 里 `commit()`。
4. 请求内 `requests.post` 调外部。
5. `SELECT *` 取大表。
6. 事务里 `sleep`、重试、等锁 > 1s。
7. 把业务开关写死在代码（应进 `game_config`/`feature_flags`）。

---

## 11. 测试与验收

```text
T1  4 worker 并发写同一玩家 → 无死锁、无重复记账
T2  停 Redis → 写接口仍可用（降级），恢复后限流生效
T3  `/health/ready` 在 DB 断开 3s 内 503
T4  事务内外部 IO 断言（monkeypatch 抛错）
T5  import 依赖图无环；api/ 无 SQL 字面量
T6  配置缺失（DSN）→ 启动失败且日志明确
T7  beat 双实例 → 只有持锁者执行任务
```

- [ ] 拓扑端口与本文一致
- [ ] 分层规则进 CI
- [ ] 健康检查三档语义正确
- [ ] 故障域表格逐项演练过（至少 Redis/PG/Celery）

## 12. 相关文档

- 认证：[03-auth.md](03-auth.md)
- 并发与幂等：[06-time-and-concurrency.md](06-time-and-concurrency.md)
- 任务：[07-cache-and-jobs.md](07-cache-and-jobs.md)
