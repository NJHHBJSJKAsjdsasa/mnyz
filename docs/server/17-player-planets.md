# 17 · 玩家改造星球（详细设计）

> 对应主文档 §7.11。本篇给出：数据边界、字段级表结构、`materialize` 算法、写入事务、产出结算、配额、错误码、迁移、测试。
> 一句话：**base 可重建，delta 不可重建；两者永不混表。**

---

## 1. 数据边界

| 判定 | 缓存（16） | 本篇 |
|---|---|---|
| 清空后玩家是否丢东西 | 否 | 是 |
| schema | `universe_cache` | `public` |
| TRUNCATE | 允许 | 禁止（`REVOKE`） |
| 备份 | 可不进 PITR | 必须 PITR + 每日逻辑备份 |
| 审计 | 无 | `planet_audit` 只 INSERT |
| 资金 | 无关 | 全部经 `ledger_*` |
| 保留 | TTL / 行数上限 | 永久 |

---

## 2. 表结构（字段级）

### 2.1 `planet_claims`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `player_id` | uuid | FK players CASCADE | — |
| `planet_key` | text | len ≤ 120 | `planet_{x},{y},{z}_{sys}_{name}` |
| `universe_id` | uuid | FK universes RESTRICT | 防跨宇宙串数据 |
| `display_name` | text | len ≤ 24, NULL | 玩家命名 |
| `claimed_at` | timestamptz | DEFAULT now() | 迁移时用于「最早者胜」 |
| `generator_version_at_claim` | int | NOT NULL | 判断是否需要兼容映射 |
| `state_version` | bigint | DEFAULT 0 | ETag |
| `state` | text | CHECK (`active`,`abandoned`) | 放弃后 24h 冷却 |

PK `(player_id, planet_key)`；索引 `(player_id, state)`；触发器：`count(active) < 10`。

### 2.2 `planet_modifiers`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | — |
| `player_id` / `planet_key` | uuid/text | FK→claims CASCADE | 复合外键 |
| `target` | text | NOT NULL | 稳定标识，见 2.6 |
| `op` | text | CHECK (`add`,`mul`,`set`) | — |
| `value` | numeric(20,4) | NOT NULL | — |
| `source` | text | NOT NULL | `structure:<code>` / `terraform` / `event` |
| `generator_version` | int | NOT NULL | 写入时版本 |
| `updated_at` | timestamptz | DEFAULT now() | — |

`UNIQUE(player_id, planet_key, target)`：同目标只保留一条，更新即覆盖（覆盖历史进审计）。

### 2.3 `planet_structures`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid PK | — | — |
| `player_id` / `planet_key` | FK→claims | — | — |
| `structure_code` | text | FK→structure_definitions | 参考数据 |
| `level` | smallint | CHECK 1..10 | — |
| `hp` | int | CHECK ≥0, DEFAULT 100 | 损坏后产出下降 |
| `status` | text | CHECK (`building`,`active`,`damaged`) | — |
| `started_at` | timestamptz | DEFAULT now() | — |
| `completes_at` | timestamptz | NULL | 建造/升级完成时间 |
| `last_settled_at` | timestamptz | DEFAULT now() | 产出结算基准 |

`UNIQUE(player_id, planet_key, structure_code)`；索引 `(completes_at) WHERE status='building'`；每行星 ≤6（触发器）；建造队列 ≤1（同玩家 `status='building'` 计数）。

### 2.4 `planet_deposits`

| 列 | 类型 | 约束 |
|---|---|---|
| `player_id` / `planet_key` / `element` | — | PK 三列 |
| `remaining` | numeric(20,4) | CHECK ≥0 |
| `regen_per_hour` | numeric(20,4) | DEFAULT 0 |
| `updated_at` | timestamptz | 结算基准 |

规则：`remaining` 只在这个玩家视角下递减（私有模式）；共享模式见 18。

### 2.5 `planet_audit` / `planet_events`

| 表 | 列 | 说明 |
|---|---|---|
| `planet_audit` | `id bigserial`, `player_id`, `planet_key`, `action`, `before jsonb`, `after jsonb`, `request_id`, `created_at` | 月分区，只 INSERT |
| `planet_events` | `id bigserial`, `player_id`, `planet_key`, `event_type`, `payload jsonb`, `created_at` | 供 outbox/成就/通知 |

### 2.6 `target` 命名规范（**禁止数组下标**）

| 前缀 | 示例 | 含义 |
|---|---|---|
| `surface:` | `surface:temperature` | 标量 |
| `atmo:` | `atmo:density` | 标量 |
| `element:` | `element:Iron` | 元素存在/丰度 |
| `feature:` | `feature:crater_belt` | 特征开关 |
| `structure:` | `structure:mine` | 结构派生修正（由结构表生成，不手写） |

---

## 3. `materialize` 算法

```python
def materialize(base: dict, claim, modifiers, structures, deposits) -> dict:
    view = deepcopy(base)                       # 不修改 base

    # 固定顺序：set → mul → add；同 op 内按 source 字典序
    for op in ("set", "mul", "add"):
        for m in sorted([m for m in modifiers if m.op == op], key=lambda m: m.source):
            apply(view, m.target, op, m.value)

    view["structures"] = [
        {"code": s.structure_code, "level": s.level, "hp": s.hp, "status": s.status}
        for s in sorted(structures, key=lambda s: s.structure_code)
        if s.status != "destroyed"
    ]
    view["deposits"] = {d.element: float(d.remaining) for d in deposits}
    view["display_name"] = claim.display_name or base["name"]
    view["delta_version"] = claim.state_version
    return view
```

约束：

1. 纯函数：无 IO、无时间、无随机。
2. 相同输入 → 相同输出（用于哈希比对与缓存键）。
3. `apply` 的语义：

| op | 行为 |
|---|---|
| `set` | `view[target] = value` |
| `mul` | `view[target] = view.get(target, 1) × value` |
| `add` | `view[target] = view.get(target, 0) + value` |

4. 未知 `target` → 记 `warn` 并跳过（不抛错，避免旧 delta 阻塞读取）。
5. `generator_version` 落后 → 先过兼容映射表；无映射则进 `planet_migrate_queue` 并**保留 intent**，读取时按旧值近似。

哈希：`sha256(json.dumps(view, sort_keys=True, ensure_ascii=False))`，用于缓存键与恢复演练。

---

## 4. 写入事务

```sql
BEGIN;
  SELECT * FROM players WHERE id=$1 FOR UPDATE;
  SELECT * FROM planet_claims WHERE player_id=$1 AND planet_key=$2 FOR UPDATE;

  -- 校验：配额、等级上限、冷却、建造队列、deposits 充足、If-Match
  -- 变更
  UPDATE planet_structures SET level=level+1, completes_at=now()+interval '2 hours'
   WHERE player_id=$1 AND planet_key=$2 AND structure_code=$3;

  -- 账本（同一事务）
  INSERT INTO ledger_transactions(...) VALUES (...);
  INSERT INTO ledger_entries(...), (...);

  INSERT INTO planet_audit(player_id, planet_key, action, before, after, request_id)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6);
  UPDATE planet_claims SET state_version = state_version + 1 WHERE ...;
  INSERT INTO outbox_events(...);
COMMIT;
```

顺序不可调换：**先账本后审计**或反之都行，但必须在同一事务；`state_version` 最后 +1（失败则不变）。

| 动作 | 前置校验 | 账本 kind |
|---|---|---|
| 认领 | 配额、行星未被他人认领 | `planet_claim` |
| 建造/升级 | 等级 ≤10、队列空、成本 | `planet_build` |
| 拆除 | 无产出中 | `planet_demolish`（部分返还） |
| 地形改造 | 科技等级、成本 | `planet_terraform` |
| 产出领取 | `stored > 0` | `planet_yield` |

---

## 5. 产出结算

```
ticks = floor((now() - last_settled_at) / 15min)
applied = min(ticks, 16)
yield = applied × structure_yield(level) × (hp/100)      # 损坏按比例减产
if ticks > 16: last_settled_at = now()                   # 超出丢弃
INSERT ledger(kind='planet_yield', ref=planet_key)
```

- 结算在「访问该行星」时惰性触发，worker 只预结算活跃玩家（`last_seen_at > 7d`）。
- 多个结构分别结算，合并成一笔 `planet_yield` 交易（分录按资源汇总）。
- 领取与结算同一事务，避免重复计算。

---

## 6. 配额与数值

| 项 | 值 | 推导 |
|---|---|---|
| 认领上限 | 10 | 单玩家 10 × 6 结构 = 60 行，规模可控 |
| 每行星结构 | 6 | 与空间站 3 舱形成「广 vs 深」取舍 |
| 建造队列 | 1 | 防并行建造刷产出 |
| 建造成本 | `base × 1.6^level` | 与改装同范式 |
| 产出（采矿站） | `2 + 3×√level` 反物质/tick | 与空间站同量级 |
| 储量再生 | 基线 2%/h | 不能挖空即弃，也不能无限刷 |
| 放弃冷却 | 24h | 防「占位-放弃」刷 |
| 命名长度 | ≤ 24 | 防注入与 UI 溢出 |

---

## 7. 读路径

```
1. base   ← universe_cache（miss 则生成回填，可被淘汰）
2. delta  ← 一次查询：claims + modifiers + structures + deposits（按 (player_id, planet_key) 索引）
3. merge  → materialize
4. cache  → Redis 60s，key = planet:{player}:{planet_key}:{delta_version}
5. 返回   → view + ETag(state_version)
```

要点：delta 永不进长期缓存；base 被淘汰只影响一次生成耗时。

---

## 8. 错误码

| 场景 | HTTP | code |
|---|---|---|
| 配额已满 | 409 | `planet_quota_exceeded` |
| 已被他人认领（共享模式） | 409 | `planet_already_claimed` |
| 建造队列占用 | 409 | `queue_busy` |
| 结构已达上限 | 422 | `level_cap_reached` |
| 储量不足 | 422 | `deposit_exhausted` |
| `If-Match` 不匹配 | 412 | `stale_state` |
| 冷却中 | 429 | `cooldown` |
| 余额不足 | 409 | `insufficient_funds` |

---

## 9. 审计与备份

| 项 | 要求 |
|---|---|
| 内容 | 动作、before/after 全量、`request_id`、来源 IP |
| 保留 | 24 个月在线，之后归档对象存储 |
| 备份 | 与 `wallets/ledger` 同级（PITR + 每日逻辑） |
| 演练 | 每月：恢复后抽 100 颗行星，`materialize` 哈希与备份前一致 |
| 删除 | 账号级联删除；审计保留脱敏副本 |
| 权限 | `REVOKE TRUNCATE, DELETE ON planet_audit`；`planet_*` 建议 RLS |

---

## 10. 灰度

| 阶段 | 动作 | 验收 |
|---|---|---|
| 1 | 建表 + RLS + 触发器，功能开关关 | 迁移 up/down 通过 |
| 2 | 只读：列表 + 视图 | `TRUNCATE universe_cache` 后视图不变 |
| 3 | 写入：认领/建造/改造 | 并发双击只生效一次；账本与审计一一对应 |
| 4 | 产出结算 | 对账 0；封顶生效 |
| 5 | 备份演练 + 1%→100% | 恢复哈希全等 |

---

## 11. 测试用例

```text
T1  materialize 两次调用 → 哈希相同
T2  删除全部 modifier → 视图 == base（除 display_name）
T3  TRUNCATE universe_cache → 视图与清空前完全一致
T4  并发两请求改同一 target（If-Match 相同）→ 一条 200，一条 412
T5  储量扣到 0 → 后续采集 422，永不出现负数
T6  建造完成时间到 → 结算一次；重复触发不重复发钱
T7  结构 hp=50 → 产出减半
T8  generator_version 落后且无映射 → 进迁移队列，读取不 500
T9  配额 10 → 第 11 颗拒绝
T10 账本失败（余额不足）→ 结构变更回滚，审计无记录
```

---

## 12. 常见错误

1. 在 `planet_*` 存整颗行星 JSON（等于做快照）。
2. `target` 用数组下标。
3. 直接改 `deposits` 而不写账本（玩家白拿资源）。
4. 把 delta 结果长期缓存（版本变更后读到旧资产）。
5. 恢复演练只比行数，不比 `materialize` 哈希。
6. 审计里存整颗行星（膨胀），应存 diff。

---

## 13. 相关文档

- 缓存：[16-planet-cache.md](16-planet-cache.md)
- 共享模式：[18-world-planets.md](18-world-planets.md)
- 账本：[05-economy-ledger.md](05-economy-ledger.md)
- 字段级表：[04-data-model.md](04-data-model.md)
