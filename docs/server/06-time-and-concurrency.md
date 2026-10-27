# 06 · 时间、并发与一致性（详细设计）

> 对应主文档 §9、§10。本篇给出：时钟来源与偏差处理、游戏日算法、冷却表与原子占用、离线结算算法、锁协议、隔离级别与重试、幂等、outbox、冲突矩阵、测试。

---

## 1. 时间

### 1.1 唯一权威

| 来源 | 用途 | 说明 |
|---|---|---|
| PG `now()` | 事务内判定（冷却、过期、结算） | 与数据同源，避免应用机漂移 |
| 应用 `clock.now()` | 纯计算/日志 | 启动时与 DB 校正偏差，缓存 offset |
| 客户端时间 | **仅展示** | 不参与任何判定 |

启动自检：`abs(app_now - db_now) > 2s` → 拒绝启动（多实例时钟漂移会导致冷却错乱）。

### 1.2 客户端倒计时

响应统一带 `server_time` 与各冷却的 `ready_in_ms`：

```
前端剩余 = ready_in_ms - (performance.now() - response_at)
```

不读 `Date.now()` 绝对值，不依赖客户端时区。

### 1.3 游戏日/周

```sql
-- 日
(game_day)  = (now() AT TIME ZONE p.timezone)::date
-- 周（ISO，周一为起点）
(week_start) = date_trunc('week', now() AT TIME ZONE p.timezone)::date
```

规则：

1. 时区用 IANA 名（`Asia/Shanghai`），不用偏移量（夏令时）。
2. 每日刷新（合同/行情/采样）以**玩家当地时间 00:00** 为界。
3. 已存在的 `game_day` 数据不因时区变更而迁移；改时区只影响之后的新数据（防刷日界），改时区有 7 天冷却。

---

## 2. 冷却

### 2.1 表

```sql
cooldowns(
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  key text NOT NULL,              -- scan:{planet_key} / collect:{planet_key} / travel / salvage:{planet_key}
  ready_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, key)
);
CREATE INDEX ON cooldowns (ready_at);
```

### 2.2 原子占用

```sql
-- 返回 0 行 = 冷却中
UPDATE cooldowns
   SET ready_at = now() + $interval, updated_at = now()
 WHERE player_id = $1 AND key = $2 AND ready_at <= now()
 RETURNING ready_at;
```

`ready_after_ms` 由 `SELECT round(extract(epoch from (ready_at-now()))*1000)` 得到，返回给客户端。

### 2.3 时长（默认值，受加成影响）

| key | 基数 | 修正 |
|---|---|---|
| `scan:{planet}` | 480s | 模块/空间站/科技/事件，下限 30s |
| `collect:{planet}` | 15min | 星区/科技（若有） |
| `salvage:{planet}` | 与 scan 共用 | — |
| `travel` | 无 | 即时 |

### 2.4 边界

- 时间回拨（NTP 校正）不会让冷却「变短」：`ready_at` 存绝对时间，只与 `now()` 比较。
- 冷却行不存在 = 首次可用（`UPDATE` 0 行会被误判为冷却中，所以实现用 `INSERT ... ON CONFLICT DO UPDATE ... WHERE ready_at <= now()` 或先 `INSERT ON CONFLICT DO NOTHING` 再条件更新）。

---

## 3. 离线结算

### 3.1 触发点

1. 任何写操作前（统一入口 `settle_offline(player_id)`）。
2. `GET /state` 时（也是写，计限流）。
3. worker `settle_sleeping_players` 每 15 分钟处理 `last_seen_at > now()-4h` 的玩家（减少请求抖动）。

### 3.2 算法

```python
def settle_offline(conn, player_id):
    p = conn.execute("SELECT * FROM players WHERE id=%s FOR UPDATE", (player_id,)).fetchone()
    now = db_now(conn)

    for st in select_stations_for_update(conn, player_id):          # 最多 3
        ticks = floor((now - st.last_settled_at) / 15min)
        applied = min(ticks, 16)
        if applied > 0:
            post_transaction(conn, player_id, 'station_yield', 'station', st.id, yield_of(st, applied))
            st.stored += yield
        st.last_settled_at = now if ticks > 16 else st.last_settled_at + ticks*15min

    for ship in select_fleet_for_update(conn, player_id):            # 最多 3
        ticks = floor((now - ship.last_tick_at) / 30min)
        applied = min(ticks, 12)
        ship.stored += yield_of_task(ship.task, applied)
        ship.last_tick_at = now if ticks > 12 else ship.last_tick_at + ticks*30min

    conn.execute("UPDATE players SET last_settled_at=%s WHERE id=%s", (now, player_id))
```

要点：

1. **超出封顶直接丢弃**，`last_settled_at = now`，否则下次会把丢掉的部分补回来（历史 bug）。
2. 结算写账本（`station_yield` / `fleet_yield`），`stored` 只是待领取展示值。
3. 整个函数幂等：重复调用时 `ticks=0`，无写入。
4. `FOR UPDATE` 锁行，避免两个 worker 同时结算。

### 3.3 领取

```
claim(station_id):
  锁行 → 校验 stored 非空 → 账本(kind='station_claim', 从 stored 转 wallets)
  → stored = {} → state_version+1
```

---

## 4. 锁协议

### 4.1 顺序（全局唯一）

```
1. players            聚合根，所有写操作第一步
2. wallets            按 resource_code 升序（ORDER BY resource_code FOR UPDATE）
3. 业务行             ships / stations / contracts / world_planets / sieges
4. cooldowns          与业务行同事务，key 唯一
5. outbox_events      INSERT，无锁
```

### 4.2 取值

| 项 | 值 | 理由 |
|---|---|---|
| `lock_timeout` | 1s | 等锁超时快速失败，避免请求堆积 |
| `statement_timeout` | 5s | 单语句上限 |
| `idle_in_transaction_session_timeout` | 10s | 防事务悬挂 |
| 事务总预算 | 200ms（P95） | 超过即视为慢请求，告警 |

### 4.3 死锁规避

- 多钱包：`ORDER BY resource_code`。
- 多业务行（跨区/批量）：`ORDER BY id`。
- 禁止「先锁子行再锁父行」。
- 死锁日志 `40P01` → 告警 + 定位（正常应为 0）。

---

## 5. 隔离级别与重试

| 场景 | 级别 | 重试 |
|---|---|---|
| 单玩家写（有行锁） | `READ COMMITTED` | 幂等重放，不自动重试业务 |
| 跨行不变量（如全服库存） | `SERIALIZABLE` | 捕获 `40001`，重试 2 次（20ms/60ms + 抖动） |
| 只读列表 | `READ COMMITTED` | 不重试 |
| 报表 | 副本 + `REPEATABLE READ` | 不重试 |

重试实现：

```python
for attempt, delay in enumerate([0.02, 0.06]):
    try:
        return run()
    except SerializationFailure:
        if attempt == 1: raise
        sleep(delay + random()*0.02)
```

**不允许**在重试里重复发外部请求；重试只在 DB 层。

---

## 6. 幂等

### 6.1 表

```sql
idempotency_keys(
  key text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  route text NOT NULL,
  request_hash text NOT NULL,
  response jsonb,
  status smallint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON idempotency_keys (created_at);
```

### 6.2 算法

```
1. 计算 request_hash = sha256(method|path|canonical(body))
2. INSERT ... ON CONFLICT (key) DO NOTHING RETURNING key
   ├ 插入成功 → 本请求是首个，继续执行业务
   └ 插入失败 → SELECT 现有行
        ├ hash 相同 → 返回缓存响应（Idempotent-Replay: true）
        └ hash 不同 → 409 idempotency_conflict
3. 业务成功后 UPDATE 该行 response/status（同一事务）
4. 业务失败 → DELETE 该行（允许客户端重试）
```

关键：**占位与业务在同一事务**；若业务回滚，占位也回滚，客户端可安全重试。

### 6.3 清理

`DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'` 每小时分批 1000 条。

---

## 7. outbox

### 7.1 表（要点，完整见 04）

`outbox_events(id bigserial, aggregate_type, aggregate_id, event_type, payload jsonb, created_at, published_at)`
索引：`(created_at) WHERE published_at IS NULL`。

### 7.2 中继

```
loop:
  rows = SELECT * FROM outbox_events
          WHERE published_at IS NULL
          ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED
  for r in rows:
      try: publish(topic(r.event_type), r.payload, id=r.id)
      except: mark retry_count++ ; break
      UPDATE outbox_events SET published_at=now() WHERE id=r.id
  COMMIT
```

要点：

1. `SKIP LOCKED` 支持多 worker 并行且不重复。
2. 同一 `aggregate_id` 的顺序：以 `id` 升序发布（单 worker 时天然有序；多 worker 分区按 `hash(aggregate_id)`）。
3. 消费端按 `r.id`（事件 ID）去重，至少一次投递。
4. 7 天后删除已发布行（或分区归档）。

---

## 8. 冲突 → 返回码

| 冲突 | HTTP | code | 客户端动作 |
|---|---|---|---|
| 余额不足 | 409 | `insufficient_funds` | 提示 |
| 冷却中 | 429 | `cooldown` + `retry_after_ms` | 倒计时 |
| `If-Match` 不匹配 | 412 | `stale_state` | 重拉后重试一次 |
| 幂等键冲突 | 409 | `idempotency_conflict` | 提示 |
| 锁等待超时 | 503 | `lock_timeout` | 稍后重试 |
| 序列化失败 | 503 | `transaction_retry_exhausted` | 稍后重试 |
| 唯一约束（并发领取） | 409 | `already_claimed` | 刷新状态 |
| 玩家冻结 | 423 | `player_locked` | 联系客服 |

---

## 9. 测试

```text
T1  客户端时区改为 UTC-8，日刷新仍按账号时区发生
T2  时间回拨 10 分钟后，冷却不会提前结束
T3  20 并发采集 → 1 成功、19 个 429/幂等重放
T4  两笔交易反序锁钱包 → 无 40P01（代码排序生效）
T5  锁等待 1.5s → 503 lock_timeout，不留脏数据
T6  序列化冲突 → 自动重试 2 次后成功
T7  同幂等键并发 50 次 → 1 笔 tx，49 次重放
T8  离线 10 小时 → 只结算 16 tick；再次结算不增加
T9  worker 重复结算 → 幂等，无重复入账
T10 停 worker 5 分钟 → outbox 积压但不阻塞请求，恢复后清空
```

---

## 10. 验收清单

- [ ] 应用与 DB 时钟偏差 < 2s（启动自检）
- [ ] 所有冷却用条件 `UPDATE ... WHERE ready_at <= now()`
- [ ] 离线结算「超出即丢弃」，有测试
- [ ] 锁顺序在代码中显式排序（review 项）
- [ ] 幂等占位与业务同事务
- [ ] outbox 中继使用 `SKIP LOCKED`
- [ ] 死锁与锁超时指标接入告警

## 11. 相关文档

- 账本事务：[05-economy-ledger.md](05-economy-ledger.md)
- 任务调度：[07-cache-and-jobs.md](07-cache-and-jobs.md)
- 存储字段：[04-data-model.md](04-data-model.md)
