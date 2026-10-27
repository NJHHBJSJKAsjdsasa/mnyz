# 11 · 可观测性（详细设计）

> 对应主文档 §15。本篇给出：日志字段级规范、指标目录（名/类型/标签）、追踪 span、看板面板、告警阈值与处置、5 分钟排障流程、留存与采样、验收。

---

## 1. 日志

### 1.1 字段规范（JSON，一行一条）

| 字段 | 类型 | 必填 | 示例 | 说明 |
|---|---|---|---|---|
| `ts` | string | 是 | `2026-10-25T12:00:00.123Z` | UTC 毫秒 |
| `level` | enum | 是 | `info` | debug/info/warn/error |
| `service` | string | 是 | `api` | api/worker/beat |
| `env` | string | 是 | `prod` | — |
| `request_id` | string | 否 | `9f2c…` | 贯穿下游 |
| `trace_id` | string | 否 | `4bf9…` | OTel |
| `player_id` | uuid | 否 | … | 脱敏后可存 |
| `route` | string | 否 | `POST /api/v1/planets/{key}/collect` | 模板化，非原始路径 |
| `status` | int | 否 | 200 | — |
| `duration_ms` | int | 否 | 43 | 请求总耗时 |
| `db_time_ms` | int | 否 | 12 | DB 累计 |
| `db_rows` | int | 否 | 9 | 影响/返回行数 |
| `cache` | enum | 否 | `miss` | hit/miss/bypass |
| `event` | string | 否 | `ledger.posted` | 业务事件名 |
| `err.type` / `err.msg` / `err.stack` | string | 否 | `InsufficientFunds` | 仅 error 级 |

### 1.2 规则

1. 请求入口生成 `request_id`（或沿用 `X-Request-Id`），响应回写。
2. 任务日志带 `job_name` + `job_run_id`。
3. 禁止记录：密码、token、refresh、完整邮箱、Cookie。
4. 慢请求（> 500ms）单独 `warn`，带 SQL 指纹。
5. 日志级别：生产 `info`；排障时可临时 `debug`（10 分钟后自动回退）。

### 1.3 留存

热（可检索）14 天；冷（对象存储）90 天；审计日志另存 24 个月。

---

## 2. 指标目录

| 指标 | 类型 | 标签 | 用途 |
|---|---|---|---|
| `atlas_http_requests_total` | counter | route, method, status | RED |
| `atlas_http_request_duration_seconds` | histogram | route, method | 延迟分位 |
| `atlas_http_inflight` | gauge | — | 并发 |
| `atlas_db_pool_in_use` / `_size` | gauge | — | 池水位 |
| `atlas_db_query_duration_seconds` | histogram | fingerprint | 慢 SQL |
| `atlas_db_errors_total` | counter | code | 40001/40P01/23505 |
| `atlas_pg_replication_lag_seconds` | gauge | — | 副本延迟 |
| `atlas_pg_deadlocks_total` | counter | — | 死锁 |
| `atlas_ledger_transactions_total` | counter | kind | 经济量 |
| `atlas_ledger_reconcile_diff` | gauge | — | 必须 0 |
| `atlas_idempotent_replays_total` | counter | route | 重试风暴 |
| `atlas_cooldown_rejections_total` | counter | action | 刷子/体验 |
| `atlas_cache_hit_ratio` | gauge | cache | 缓存效率 |
| `atlas_queue_depth` | gauge | queue | 积压 |
| `atlas_job_duration_seconds` | histogram | job | 任务耗时 |
| `atlas_job_failures_total` | counter | job | 失败 |
| `atlas_job_last_success_timestamp` | gauge | job | 停摆检测 |
| `atlas_outbox_unpublished` | gauge | — | 事件积压 |
| `atlas_dlq_depth` | gauge | — | 死信 |
| `atlas_sieges_open` | gauge | state | 攻城进行中 |

命名约定：`atlas_{domain}_{metric}_{unit}`；标签基数受控（`route` 用模板，不用原始 URL）。

---

## 3. 追踪

| span | 属性 | 备注 |
|---|---|---|
| `http.request` | route, status, `player_id` | 网关/应用 |
| `service.handle` | handler 名 | 应用内部 |
| `db.query` | fingerprint, rows, dur | 一次 SQL 一个 span |
| `redis.cmd` | cmd, hit/miss | — |
| `kafka.publish` | topic, event_id | — |
| `celery.task` | job, attempt | — |

采样：正常 10%；错误 100%；慢（> 500ms）100%。`traceparent` 透传 Kafka 消息头。

---

## 4. 看板

| 面板 | 内容 |
|---|---|
| 业务 | DAU、注册、采集/扫描量、合同完成率、成交额、异常收益玩家数 |
| 接口 | RPS、p50/p95/p99、5xx、429、Top 慢路由 |
| 数据库 | 连接池、QPS、慢 SQL Top10、锁等待、复制延迟、磁盘 |
| 任务 | 队列深度、失败率、outbox、DLQ、对账偏差 |

---

## 5. 告警

| 级别 | 条件 | 通知 | 处置 |
|---|---|---|---|
| P1 | 对账偏差 > 0 | 电话 | 冻结玩家 → 定位 → 补偿（[05](05-economy-ledger.md)） |
| P1 | 5xx > 1%（5min） | 电话 | 回滚最近发布 |
| P1 | 主库不可达 / 复制中断 | 电话 | [12](12-backup-dr.md) |
| P1 | `sieges` 到期未结算 > 10 分钟 | 电话 | 检查 worker |
| P2 | p95 > 200ms（10min） | 群 | 查慢 SQL/trace |
| P2 | outbox > 1000 或最老 > 5min | 群 | 查 worker/broker |
| P2 | 任务 `last_success` > 2× 周期 | 群 | 查 beat/锁 |
| P2 | 磁盘 > 80% | 群 | 清归档/扩容 |
| P3 | 缓存命中率 < 80% | 工单 | 查版本/穿透 |
| P3 | 幂等重放 ×3 | 工单 | 客户端重试风暴 |

纪律：每条告警必须链到本文档对应小节；两周无响应则降级或删除。

---

## 6. 5 分钟排障

```
0:00 哪个接口？→ route 维度 p95/5xx
0:30 何时开始？→ 对齐发布/配置变更
1:00 全局或个别？→ player_id 分布（单点=数据，全局=依赖）
2:00 慢在哪？→ 3 条慢 trace 看 db.query
3:00 数据库？→ pg_stat_activity（长事务/锁）、pg_stat_statements
4:00 任务？→ queue_depth + last_success
5:00 结论：回滚 / 扩容 / 修数据（写下 record）
```

---

## 7. 验收

```text
T1  任意 5xx 用 request_id 能查到完整上下文（含 trace_id）
T2  慢请求 trace 定位到具体 SQL 与耗时
T3  对账偏差告警：构造 1 分偏差 → 60s 内 P1 触发
T4  任务停摆：停 worker → last_success 超期告警
T5  outbox 积压 1500 → 告警并可查最老事件时间
T6  日志中搜索 token/密码 → 零命中
```

- [ ] 指标全部注册且标签基数受控
- [ ] 四块看板可用，每块有负责人
- [ ] 告警分级与 runbook 链接齐全
- [ ] 采样策略生效（错误 100%）

## 8. 相关文档

- 备份与恢复：[12-backup-dr.md](12-backup-dr.md)
- 任务清单：[07-cache-and-jobs.md](07-cache-and-jobs.md)
- 安全审计：[10-security.md](10-security.md)
