# 18 · 多玩家共享行星（详细设计）

> 对应主文档 §7.12。本篇给出：单写者模型、字段级表、状态机与时间参数、攻城算法、结算事务、跨区 saga 与补偿、分片、反恶意数值、迁移、错误码、测试。

---

## 1. 三条不可协商的决定

| # | 决定 | 如果违反 |
|---|---|---|
| 1 | 一颗行星只有一个写者（`shard_id` 对应区域），`claim_version` 行锁串行 | 两地写会直接产生双主人/双倍战利品 |
| 2 | 争夺 = 异步确定性推演（12h 备战 + `seed=hash(siege_id)`） | 跨区实时攻城延迟不可控，且结果不可复现 |
| 3 | 跨区只走 saga（outbox + 幂等 + escrow） | 2PC/同步链会在网络抖动时长时间持锁 |

---

## 2. 表结构（字段级）

### 2.1 `world_planets`（聚合根）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `universe_id` + `planet_key` | uuid/text | PK | — |
| `shard_id` | text | FK→world_shards | 决定写入区域 |
| `owner_kind` | text | CHECK (`none`,`player`,`alliance`) | — |
| `owner_id` | uuid | NULL | `owner_kind='none'` 时必须空 |
| `claim_version` | bigint | DEFAULT 0, CHECK ≥0 | 单调，作 ETag |
| `state` | text | CHECK (`neutral`,`claimed`,`vulnerable`,`besieged`,`derelict`) | 见 §3 |
| `claimed_at` | timestamptz | NULL | — |
| `shield_until` | timestamptz | NULL | 护盾到期 |
| `last_contested_at` | timestamptz | NULL | 攻击频率控制 |
| `upkeep_due_at` | timestamptz | NULL | 逾期 7 天转 derelict |
| `generator_version` | int | NOT NULL | base 版本 |

约束：`CHECK (owner_kind='none' OR owner_id IS NOT NULL)`。
索引：`(shard_id, state)`、`(owner_id) WHERE owner_id IS NOT NULL`。

### 2.2 世界层资产

| 表 | 关键列 | 约束 |
|---|---|---|
| `world_planet_modifiers` | `universe_id`,`planet_key`,`target`,`op`,`value`,`applied_by`,`generator_version` | PK`(universe_id,planet_key,target)` |
| `world_planet_structures` | `structure_code`,`owner_id`,`level`(1..10),`hp`,`status`,`captured_at` | PK 前三列；外键到 `structure_definitions` |
| `world_planet_deposits` | `element`,`remaining`(≥0),`regen_per_hour` | PK`(universe_id,planet_key,element)` |
| `planet_ownership_history` | `from_owner`,`to_owner`,`reason`,`siege_id`,`at` | 月分区，只 INSERT |
| `world_events` | `seq`,`event_type`,`payload` | `UNIQUE(universe_id,planet_key,seq)` |

### 2.3 `sieges`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | 兼幂等键 |
| `universe_id` / `planet_key` / `shard_id` | — | FK→world_planets | — |
| `attacker_id` | uuid | NOT NULL | — |
| `defender_id` | uuid | NULL | 无主则空 |
| `attacker_fleet_id` / `defender_fleet_id` | uuid | NULL | 服务端快照引用 |
| `seed` | bigint | NOT NULL | **declared 时固定** |
| `state` | text | CHECK (`declared`,`locked`,`resolving`,`resolved`,`aborted`) | 见 §3.2 |
| `declare_at` / `lock_at` / `resolve_at` | timestamptz | `resolve_at = declare_at + 12h` | — |
| `outcome` | text | CHECK (`attacker_won`,`defender_held`,`draw`,`aborted`) | — |
| `report` | jsonb | 战报（不可变） | — |

索引：`(state, resolve_at) WHERE state IN ('declared','locked','resolving')`；`(planet_key, declare_at DESC)`。

### 2.4 `siege_participants` / `loot_escrow` / `world_shards`

| 表 | 关键列 | 说明 |
|---|---|---|
| `siege_participants` | `siege_id`,`player_id`,`side`,`fleet_snapshot_id`,`damage_dealt`,`losses` | PK`(siege_id,player_id)` |
| `loot_escrow` | `siege_id`,`target_player_id`,`target_region`,`payload`,`state`,`delivered_at` | `UNIQUE(siege_id,target_player_id)` |
| `world_shards` | `shard_id` PK,`region`,`planet_count`,`load_score` | 控制面维护 |

---

## 3. 状态机

### 3.1 行星

| 当前 | 事件 | 下一状态 | 附带动作 |
|---|---|---|---|
| `neutral` | 认领（付费） | `claimed` | `shield_until = now()+12h`（建造期） |
| `claimed` | 护盾到期（worker 每分钟） | `vulnerable` | — |
| `claimed`/`vulnerable` | upkeep 逾期 7 天 | `derelict` | 结构 hp −20% |
| `vulnerable` | 宣战 | `besieged` | `sieges` 新建，`last_contested_at=now()` |
| `besieged` | 结算：攻方胜 | `claimed` | 易主，`shield_until=now()+24h` |
| `besieged` | 结算：守方守 | `vulnerable` | `shield_until=now()+24h`（免战） |
| `besieged` | 结算：draw | `vulnerable` | 双方各损失部分 |
| `derelict` | PvE 清剿成功 | `neutral` | 结构清零 |
| 任意 | 主动弃置 | `derelict` | 24h 内不可认领 |

### 3.2 攻城

| 状态 | 进入条件 | 允许操作 | 超时 |
|---|---|---|---|
| `declared` | 攻方支付成本，seed 已定 | 双方提交/更新快照 | 12h |
| `locked` | `resolve_at - 1h` 或双方确认 | 只读 | 至 `resolve_at` |
| `resolving` | worker 抢占（`FOR UPDATE SKIP LOCKED`） | 内部 | 5 分钟（失败回 locked） |
| `resolved` | 结算成功 | 只读 | — |
| `aborted` | 冻结失败/区域不可用超 30 分钟 | 只读 | — |

**seed 必须在 `declared` 时写入并固定**，否则重放结果不同。

---

## 4. 攻城算法

```
# 输入：两端舰队快照（服务端生成）、tech/模块、行星防御加成
pa = Σ_attacker (firepower_i × (1 + tech_attack) × (0.9 + rng_i×0.2))
pd = Σ_defender (firepower_j × (1 + tech_defense) × (1 + structure_defense) × (0.9 + rng_j×0.2))

ratio = pa / (pa + pd)
outcome = ratio > 0.55 ? attacker_won : ratio < 0.45 ? defender_held : draw
losses  = round(snapshot_value × (0.1 + 0.3×|ratio-0.5|×2) × rng_loss)

战利品 = min(行星24h产出 × 0.5, 被掠储量 × 0.3)
```

规则：

1. 快照只能由服务端从 `ships`/`fleet_ships` 生成；客户端提交的任何数值都丢弃。
2. `rng` 由 `seed` 派生，顺序固定（先攻方后守方，按 `player_id` 排序）。
3. 推演是纯函数：`result = simulate(seed, snapshots, planet_defense)`，可离线重放。

---

## 5. 结算事务（行星区，单库单事务）

```sql
BEGIN;
  SELECT * FROM sieges WHERE id=$1 FOR UPDATE;
  -- 幂等：state='resolved' → 返回旧 report
  SELECT * FROM world_planets WHERE universe_id=$2 AND planet_key=$3 FOR UPDATE;
  -- 校验：state='besieged' AND claim_version=$4 AND seed 匹配

  UPDATE world_planets
     SET owner_kind='player', owner_id=$5, state='claimed',
         claim_version=claim_version+1,
         shield_until=now()+interval '24 hours',
         last_contested_at=now()
   WHERE universe_id=$2 AND planet_key=$3 AND claim_version=$4;

  UPDATE world_planet_structures SET level=GREATEST(1, level-1), owner_id=$5,
         captured_at=now();
  UPDATE world_planet_deposits  SET remaining=remaining*0.7;
  INSERT INTO planet_ownership_history(...);
  INSERT INTO world_events(seq=nextval, ...);
  INSERT INTO ledger_transactions(...);  -- siege_cost / siege_loot
  INSERT INTO ledger_entries(...);
  INSERT INTO outbox_events('siege.resolved', ...);
  UPDATE sieges SET state='resolved', outcome=$6, report=$7 WHERE id=$1;
COMMIT;
```

失败语义：任一步失败整笔回滚；`sieges` 保持 `resolving`，worker 重试（幂等）。

---

## 6. 跨区 saga

### 6.1 时序

| 步 | 执行者 | 动作 | 幂等键 | 超时 |
|---|---|---|---|---|
| T1 | 攻方请求 | `POST /world/sieges` → 行星区建 `declared`（seed 固定） | `siege_id` | — |
| T2 | 行星区→两端 | 请求快照 + 冻结舰队（写 `fleet_freeze`） | `siege_id` | 10s |
| T3 | 行星区 | 存快照，`state=locked` | — | — |
| T4 | worker | 到点推演 + 单事务结算 | `siege_id` | 5 min |
| T5 | 行星区 | 发 `siege.resolved`（outbox） | event_id | — |
| T6 | 两端 | 更新舰队损伤、释放冻结、入账战利品 | `siege_id` | 3 次重试 |
| T7 | 任一端失败 | 进 DLQ + 告警；战利品入 `loot_escrow` | — | 7 天重放 |

### 6.2 补偿矩阵

| 失败点 | 状态 | 补偿 |
|---|---|---|
| T2 一端冻结失败 | `aborted` | 全额退款（`correction`） |
| T4 结算前区域故障 | `locked` | 恢复后重跑（seed 固定） |
| T5 事件未发出 | `resolved` | outbox 保证至少一次 |
| T6 目标区不可用 | `resolved` | `loot_escrow` 暂存，7 天内自动重试 |
| T6 重复投递 | — | 幂等键 + `UNIQUE(siege_id,target)` |

**不做**：2PC、跨区共享表、跨区同步调用链、CRDT 所有权。

---

## 7. 分片与读一致性

```
shard_id = hash(universe_id || sector_key) % N
world_shards(shard_id → region)
```

| 项 | 规则 |
|---|---|
| 粒度 | 一个 sector 全部行星在同一区（同星系竞争不跨区） |
| 写 | 只打行星区 |
| 读 | 非行星区读异步副本，响应带 `synced_at`；超过 30s 未同步则降级为「请稍后」 |
| 再平衡 | 冻结 sector → 复制 → 切换目录 → 解冻（不双写） |
| 热点 | 攻城异步，写峰值低；单行星行锁串行 |

---

## 8. 反恶意数值

| 规则 | 值 | 理由 |
|---|---|---|
| 宣战成本 | `600 + 200×目标已建结构数`，联盟规模 ×(1+0.1×成员数) | 让骚扰有成本 |
| 备战窗口 | 12h | 双方都能反应 |
| 单行星攻击 | 72h 1 次 | 防车轮战 |
| 单玩家同时宣战 | ≤2 | 防多线骚扰 |
| 易主护盾 | 24h | 防连锁崩盘 |
| 等级保护 | 防守方等级 < 攻击方 60% → 战利品 −50% | 防碾压新玩家 |
| 战败损失 | 结构 −1 级、储量 −30% | 有痛感不归零 |
| 战利品上限 | 24h 产出 × 0.5 | 防越打越富 |
| 不活跃 | 14 天 → `derelict` | 防永久霸占 |
| 联盟上限 | 5 人 | 与现有联盟设计一致 |

---

## 9. 从私有模式迁移

`universes.world_mode: private → shared`（不可逆，需维护窗口 + 公告）

| 步 | 动作 | 校验 |
|---|---|---|
| 1 | 统计每 `planet_key` 的认领人数 | 冲突行星数 |
| 2 | 最早 `claimed_at` 者为 owner | 时间戳无并列；并列按 `player_id` 排序 |
| 3 | 其余玩家按投入 80% 补偿（`correction`） | 补偿总额 = 审计条数 |
| 4 | `planet_*` 迁 `world_planet_*`，保留 `applied_by` | 行数一致 |
| 5 | 冲突 target 以 owner 为准，其余记 `discarded` | 差异清单 |
| 6 | 切开关，旧表只读 30 天 | 申诉通道 |
| 7 | 全量回归 | `materialize` 确定、无 5xx |

回滚：30 天内可切回 `private`（旧表未删），此后不可逆。

---

## 10. 错误码

| 场景 | HTTP | code |
|---|---|---|
| 已有进行中攻城 | 409 | `siege_in_progress` |
| 目标在护盾期 | 422 | `planet_shielded` |
| 攻击频率超限 | 429 | `siege_cooldown` |
| 同时宣战超限 | 422 | `siege_limit` |
| 快照缺失 | 409 | `fleet_snapshot_missing` |
| 区域不可用 | 503 | `region_unavailable` |
| `If-Match` 不匹配 | 412 | `stale_state` |
| 非所有者操作 | 403 | `not_owner` |

---

## 11. 测试

```text
T1  同 seed + 同快照，两区分别推演 → report JSON 全等
T2  同 siege_id 结算 10 次 → 账本 1 笔、结构只降 1 级
T3  结算时杀行星区 → 恢复后结果一致，无重复发放
T4  并发两玩家宣战同一行星 → 一成一败（行锁 + 状态校验）
T5  客户端伪造快照 → 拒绝（快照只由服务端生成）
T6  目标区宕机 20 分钟 → escrow 暂存，恢复后自动入账
T7  10k 场/日集中 1 小时 → p95 < 300ms，无死锁
T8  战利品 = 被掠扣减 − 系统损耗（借贷平衡）
T9  不活跃 14 天 → derelict；PvE 清剿后可被认领
T10 私有→共享迁移 → 补偿总额与审计一致，视图确定
```

---

## 12. 风险与「不要做」

| 风险 | 缓解 |
|---|---|
| 大联盟垄断 | 规模加权成本 + 等级保护 + 新护盾 + 人数上限 |
| saga 半成功 | 单行星单事务 + outbox + escrow + 重放工具 |
| 世界数据被当缓存清 | 与 `planet_*` 同级备份；撤销 TRUNCATE；演练覆盖 |
| 分片搬迁双写 | 冻结 → 复制 → 切目录 → 解冻 |
| 实时攻城诱惑 | 明确不做；实时 PvPvE 只在中立实例 |

---

## 13. 待确认（开工前）

1. 联盟与个人共有：是「联盟持有、成员共享」还是「个人持有、联盟支援」？（影响 `owner_kind` 的收益归属）
2. 攻城期间守方能否补充舰队？（当前设计：`locked` 前可改，`locked` 后不可）
3. `derelict` 的 PvE 清剿强度锚定谁？（建议锚定原主人的历史战力 ×0.8）
4. 跨区观战是否实时？（当前：只提供战报与重放，不提供直播）

---

## 14. 相关文档

- 私有改造层：[17-player-planets.md](17-player-planets.md)
- 账本：[05-economy-ledger.md](05-economy-ledger.md)
- 跨区与实时战斗：[../PVPVE_MULTIREGION_MICROSERVICE.md](../PVPVE_MULTIREGION_MICROSERVICE.md)
- 字段级表：[04-data-model.md](04-data-model.md)
