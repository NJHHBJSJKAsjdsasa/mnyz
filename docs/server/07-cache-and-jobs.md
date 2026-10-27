# 07 · 缓存与后台任务（详细设计）

> 对应主文档 §11。本篇给出：Redis 键表（类型/TTL/失效）、读穿算法与防雪崩、9 个任务的周期/锁/幂等/超时/重试、beat 选主、DLQ、降级矩阵、指标、测试。

---

## 1. Redis 键表

| 键 | 类型 | 值 | TTL | 失效方式 |
|---|---|---|---|---|
| `ref:modules:{v}` | string(json) | 模块定义 | 1h | 版本号变则换键 |
| `ref:tech:{v}` | string(json) | 科技树 | 1h | 同上 |
| `ref:templates:{v}` | string(json) | 合同模板 | 1h | 同上 |
| `mkt:{planet_key}:{day}` | string(json) | 报价+库存 | 到当日 24:00 | 生成时写一次 |
| `lb:{metric}` | zset | Top100 分数 | 5min | worker 覆盖写 |
| `rl:{player}:{route}` | hash | tokens/ts | 2min | Lua 原子 |
| `lock:{job}` | string | 持有者 id | 任务超时 | `SET NX PX` |
| `revoked:{sid}` | string | `1` | access 剩余寿命 | 登出/改密 |
| `planetcache:{player}:{key}:{ver}` | string(json) | materialize 结果 | 60s | 版本变则换键 |

明确不缓存：`wallets.balance`、`cooldowns.ready_at`、`ledger_entries`、`state_version`。

---

## 2. 读穿与防雪崩

```python
def cached(key, ttl, loader):
    v = redis.get(key)
    if v is not None: return json.loads(v)
    lock = f"lock:{key}"
    if redis.set(lock, "1", nx=True, px=5000):        # 只有一个回源
        try:
            data = loader(); redis.set(key, json.dumps(data), ex=ttl)
            return data
        finally:
            redis.delete(lock)
    return loader()                                    # 抢锁失败：直接回源，不排队
```

规则：

1. TTL 加 ±10% 抖动，避免同刻雪崩。
2. 空结果缓存 30s（防穿透）。
3. 大键拆小：榜单只存 Top100；行星视图按玩家维度。
4. Redis 异常 → `loader()` 直查，不抛错。

---

## 3. 任务清单

| 任务 | 周期 | 锁 TTL | 幂等依据 | 超时 | 失败处理 |
|---|---|---|---|---|---|
| `roll_market` | 10min | 5min | `UNIQUE(planet_key, game_day)` | 60s | 重试 3 次 → DLQ |
| `expire_contracts` | 1min | 2min | `status='accepted' AND expires_at<now()` | 30s | 重试 3 次 |
| `settle_sleeping_players` | 15min | 10min | `last_settled_at` | 300s | 重试 2 次 |
| `reconcile_ledger` | 1h | 30min | 只读 + 告警 | 120s | 不重试，告警 |
| `cleanup` | 1h | 20min | 按时间删除（幂等） | 120s | 重试 3 次 |
| `refresh_leaderboards` | 5min | 4min | 全量覆盖 | 30s | 重试 2 次 |
| `archive_partitions` | 每日 03:00 | 60min | 分区名 | 600s | 告警 |
| `outbox_relay` | 1s 轮询 | 10s | `published_at IS NULL` + `SKIP LOCKED` | 5s/批 | 退避 |
| `settle_sieges` | 1min | 2min | `sieges(state='locked', resolve_at<=now())` | 120s | 重试 3 次 → P1 |

### 3.1 任务骨架

```python
@task(bind=True, max_retries=3)
def roll_market(self):
    if not acquire_lock("lock:roll_market", ttl=300): return
    try:
        for chunk in chunks(active_planets(), 200):
            with tx() as conn:
                for p in chunk: ensure_market(conn, p)      # ON CONFLICT DO NOTHING
        record_job_run("roll_market")
    except SoftTimeLimitExceeded:
        raise self.retry(countdown=60)
```

### 3.2 beat 选主

```
每 20s: SET lock:beat <id> NX PX 60000
持锁者调度；60s 未续期 → 别人接管
同一任务另有 job_runs(job_name, run_date) 唯一约束兜底
```

### 3.3 DLQ

`dlq_events(id, task, payload, error, attempts, created_at)`；提供 `replay(dlq_id)` 手工重投；积压 > 100 告警。

---

## 4. 降级矩阵

| 依赖 | 降级 | 用户可见 |
|---|---|---|
| Redis | 限流退进程内；缓存直查 | 延迟略升 |
| worker | 行情惰性生成；合同按请求校验；排行显示旧值（带 `as_of`） | 榜单延迟 |
| beat | 与 worker 同降级 | 同上 |
| 行星缓存 PG | 直接生成 | 首次访问慢 |
| 下游 HTTP | 熔断 50%/10s，返回缓存或空 | 局部不可用 |

---

## 5. 指标

| 指标 | 阈值 |
|---|---|
| `atlas_cache_hit_ratio` | < 80% 告警 |
| `atlas_queue_depth` | > 1000 告警 |
| `atlas_job_duration_seconds{job}` | P95 > 30s 告警 |
| `atlas_job_failures_total{job}` | 5 分钟内 > 3 |
| `atlas_job_last_success_timestamp` | 超 2× 周期告警 |
| `atlas_outbox_unpublished` | > 1000 或最老 > 5min |
| `atlas_dlq_depth` | > 100 |
| `atlas_redis_memory_used_ratio` | > 0.8 |

---

## 6. 测试

```text
T1  停 Redis → 写接口仍可用；恢复后限流准确（4 worker 合计阈值不变）
T2  缓存雪崩模拟（同时过期）→ 回源被锁串行，DB QPS 不超阈值
T3  任务重复触发两次 → job_runs 拦下第二次
T4  roll_market 中途崩溃 → 重跑不产生重复行情（UNIQUE）
T5  expire_contracts 漏跑 10 分钟 → 恢复后正确过期，无漏发奖
T6  outbox 积压 1000 条 → 恢复 1 分钟内清空，消费端无重复副作用
T7  beat 双实例 → 只有持锁者执行
T8  DLQ 重投 → 任务成功且指标回落
```

---

## 7. 验收

- [ ] 键表与代码一致（命名/ TTL 脚本比对）
- [ ] 每个任务有锁、幂等依据、超时、重试策略
- [ ] beat 选主演练通过
- [ ] 降级矩阵逐项演练（Redis/worker/下游）
- [ ] 指标与告警接入看板
- [ ] DLQ 有重放工具与演练

## 8. 相关文档

- 幂等与 outbox：[06-time-and-concurrency.md](06-time-and-concurrency.md)
- 告警阈值：[11-observability.md](11-observability.md)
- 里程碑：[15-milestones-and-risks.md](15-milestones-and-risks.md)
