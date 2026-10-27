# 04 · 数据模型（字段级详细设计）

> 对应主文档 §5、§6、§7.1–7.9。本篇逐表给出**列名、类型、约束、含义**，是 [19-ddl.md](19-ddl.md) 与主文档附录 B 的说明书。
> 约定：`timestamptz` 一律 UTC；金额 `numeric(20,4)`；枚举用 `text + CHECK`；主键 `uuid DEFAULT gen_random_uuid()`；`created_at/updated_at` 每表必备。

---

## 1. 身份与配置域

### 1.1 `universes`（宇宙）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | 宇宙主键 |
| `seed_name` | text | NOT NULL, UNIQUE | 与前端 `getUniverseInfo().seedName` 一致 |
| `seed` | bigint | NOT NULL | 数值种子 |
| `cosmic_origin_time` | bigint | NOT NULL | 宇宙时间原点（毫秒） |
| `world_mode` | text | NOT NULL DEFAULT `'private'`, CHECK IN (`private`,`shared`) | 行星模式开关（见 18） |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | — |

索引：`UNIQUE(seed_name)`。基数：个位数。

### 1.2 `accounts`（账号）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | — |
| `email` | citext | UNIQUE, NULL 允许（guest） | 大小写不敏感 |
| `password_hash` | text | NULL 允许（guest） | Argon2id 全串 |
| `email_verified_at` | timestamptz | NULL | 未验证不许改密 |
| `status` | text | NOT NULL DEFAULT `'guest'`, CHECK IN (`guest`,`active`,`locked`,`deleted`) | 见 03 状态机 |
| `role` | text | NOT NULL DEFAULT `'player'`, CHECK IN (`player`,`ops`,`admin`) | 管理接口鉴权 |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() | — |
| `deleted_at` | timestamptz | NULL | 软删；30 天后物理删除 |

约束：`CHECK (status <> 'active' OR password_hash IS NOT NULL)`。
索引：`UNIQUE(email) WHERE email IS NOT NULL`；`(status) WHERE status <> 'active'`。
基数：与玩家 1:1 量级。

### 1.3 `players`（角色 = 聚合根）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | 全局唯一，前端持有 |
| `account_id` | uuid | NOT NULL, FK→accounts ON DELETE CASCADE | — |
| `universe_id` | uuid | NOT NULL, FK→universes ON DELETE RESTRICT | 跨宇宙不共享进度 |
| `slot` | smallint | NOT NULL DEFAULT 1 | 预留多角色 |
| `display_name` | text | NOT NULL DEFAULT `'舰长'`, len ≤ 24 | — |
| `timezone` | text | NOT NULL DEFAULT `'Asia/Shanghai'` | IANA 名，算游戏日 |
| `state_version` | bigint | NOT NULL DEFAULT 0, CHECK ≥ 0 | 每次写 +1，作 ETag |
| `last_settled_at` | timestamptz | NOT NULL DEFAULT now() | 离线结算基准 |
| `last_seen_at` | timestamptz | NOT NULL DEFAULT now() | 活跃度/预结算 |
| `locked_reason` | text | NULL | 非空时拒绝写（如 `ledger_mismatch`） |

约束：`UNIQUE(account_id, universe_id, slot)`。
索引：`(last_seen_at DESC)`（预结算扫描）、`(account_id)`。
基数：10k DAU 时约 50k 行。

### 1.4 `sessions`（会话/刷新令牌链）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | — |
| `account_id` | uuid | NOT NULL FK | — |
| `player_id` | uuid | NULL FK | 访客期可空 |
| `refresh_hash` | text | NOT NULL UNIQUE | 只存哈希 |
| `rotated_from` | uuid | NULL FK→sessions.id | 重放检测链 |
| `user_agent` | text | NULL, len ≤ 256 | — |
| `ip` | inet | NULL | — |
| `created_at` / `last_used_at` / `revoked_at` | timestamptz | — | 有效期 30 天滚动 |

索引：`(account_id, revoked_at)`。

### 1.5 参考数据（入库，带版本）

| 表 | 关键列 | 说明 |
|---|---|---|
| `resource_types` | `code` PK, `name`, `category`(`base/mid/rare/artifact`), `is_tradable` | 12 行；前端 `ResourceLabels` 与之对齐 |
| `game_config` | `key` PK, `value jsonb`, `data_version int`, `updated_at` | 成本曲线参数、封顶值、开关 |
| `module_definitions` | `code` PK, `name`, `max_level`, `cost_curve jsonb`, `effect_curve jsonb` | 6+2 个模块 |
| `tech_nodes` | `code` PK, `branch`, `tier`, `requires` FK→self, `cost jsonb` | 4×4=16 |
| `contract_templates` | `code` PK, `metric`, `requires_module`, `reward_formula jsonb` | 5 类 |
| `structure_definitions` | `code` PK, `kind`(`station/planet`), `max_level`, `cost_curve jsonb`, `yield_formula jsonb` | 舱室/建筑共用 |

规则：**代码里不得硬编码以上数值**，启动时加载并缓存（key 含 `data_version`）。

---

## 2. 经济域（账本）

### 2.1 `wallets`（物化余额）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `player_id` | uuid | NOT NULL FK CASCADE | — |
| `resource_code` | text | NOT NULL FK→resource_types | — |
| `balance` | numeric(20,4) | NOT NULL DEFAULT 0, CHECK ≥ 0 | **唯一读入口** |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() | — |

PK `(player_id, resource_code)`。基数：玩家 × 12。行宽 ~80B。
写：只在账本事务内 `UPDATE ... WHERE balance + delta >= 0`。

### 2.2 `system_accounts`（系统对手账户）

| 列 | 类型 | 说明 |
|---|---|---|
| `code` | text PK | `market/quest/loot/sink/escrow/migration` |
| `description` | text | 报表用 |

规则：每个 `(system_account, resource)` 的余额是**负的玩家侧镜像**；对账时纳入总量。

### 2.3 `ledger_transactions`（交易头）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | — |
| `player_id` | uuid | NOT NULL FK CASCADE | 归属玩家 |
| `kind` | text | NOT NULL, CHECK in 枚举 | 见 2.5 |
| `ref_type` / `ref_id` | text | NULL | 关联对象（planet/contract/siege/order） |
| `idempotency_key` | text | UNIQUE, NULL | 幂等 |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | 分区未用（量小），索引用 |

索引：`(player_id, created_at DESC)`、`(kind, created_at DESC)`。

### 2.4 `ledger_entries`（分录，只 INSERT）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | bigserial | — | 分区表不能做 PK（用 `(id, created_at)` 唯一） |
| `transaction_id` | uuid | NOT NULL FK RESTRICT | — |
| `wallet_id` | uuid | NULL | 玩家侧：`players.id` |
| `system_account_code` | text | NULL FK→system_accounts | 系统侧 |
| `resource_code` | text | NOT NULL FK | — |
| `delta` | numeric(20,4) | NOT NULL, CHECK `<> 0` | 正负 |
| `balance_after` | numeric(20,4) | NOT NULL | 便于审计复原 |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | 分区键 |

约束：`CHECK ((wallet_id IS NULL) <> (system_account_code IS NULL))`（二选一）。
分区：按月 `RANGE(created_at)`，预建 3 个月；索引 `(transaction_id)`、`(wallet_id, created_at)`。
权限：`atlas_app` 只有 INSERT/SELECT。

### 2.5 交易类型（kind）与分录模板

| kind | 触发 | 分录（玩家侧 → 系统侧） |
|---|---|---|
| `collect` | 采集 | +资源 / loot −资源 |
| `scan` | 扫描产出 | +资源 / loot −资源 |
| `surface_sample` | 地表采样 | +资源 / loot −资源 |
| `trade_buy` | 市场买入 | −货币 +货物 / market 反向 |
| `trade_sell` | 市场卖出 | −货物 +货币 / market 反向 |
| `contract_reward` | 合同领奖 | +奖励 / quest −奖励 |
| `refit` / `overclock` / `ship_upgrade` | 改装 | −成本 / sink +成本 |
| `station_build` / `station_yield` / `station_upgrade` | 空间站 | 支出/产出 |
| `fleet_yield` | 舰队 | +产出 / loot −产出 |
| `tech_unlock` / `sector_unlock` | 成长 | −成本 / sink +成本 |
| `hull_repair` | 维修 | −成本 / sink +成本 |
| `craft_in` / `craft_out` | 生产线 | 投入/产出 |
| `wreck_salvage` | 打捞 | +资源 / loot −资源 |
| `combat_loot` | 战斗战果 | +战利品 / loot −战利品 |
| `siege_cost` / `siege_loot` | 攻城 | 支出/战利品 |
| `planet_build` / `planet_yield` | 行星改造 | 支出/产出 |
| `migration` | 存档导入 | +客户端余额 / migration − |
| `correction` | 人工补偿 | 任意，必须带 `ref_id=原 tx` |

### 2.6 `collections`（采集流水）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | bigserial PK | — |
| `player_id` | uuid | — |
| `planet_key` | text | 复合键 `planet_{x},{y},{z}_{sys}_{name}` |
| `tx_id` | uuid | 关联账本 |
| `yield` | jsonb | 展示用明细（非权威） |
| `created_at` | timestamptz | 递减计数查这里 |

索引：`(player_id, planet_key, created_at DESC)`。

---

## 3. 航行与探索域

### 3.1 `ships`

| 列 | 类型 | 约束 |
|---|---|---|
| `id` uuid PK / `player_id` FK / `level` int DEFAULT 1 CHECK 1..999 | — | — |
| `ship_type` text DEFAULT `'explorer'` / `appearance` jsonb / `is_flagship` bool | — | 同玩家仅一艘旗舰（部分唯一索引） |

索引：`UNIQUE(player_id) WHERE is_flagship`。
注：`efficiency/range/storage/multiplier` 不入库，由 `level` 计算（避免两处真相）。

### 3.2 `ship_modules`

PK `(ship_id, module_code)`；`level int DEFAULT 0 CHECK 0..999`；`overclock smallint DEFAULT 0 CHECK 0..3`；`updated_at`。

### 3.3 `fleet_ships`

| 列 | 类型 | 说明 |
|---|---|---|
| `id` uuid PK | — | — |
| `player_id` uuid FK | — | 每次最多 3 艘（触发器） |
| `name` text | — | `远星 1/2/3` |
| `task` text CHECK IN (`idle`,`mine`,`survey`,`trade`) | — | — |
| `last_tick_at` timestamptz | — | 30 分钟 tick |
| `stored` jsonb | — | 待领取产出 |

### 3.4 `planet_scans`

PK `(player_id, planet_key)`；`scans int DEFAULT 0`；`last_at timestamptz`；`bonus_kind text`；`bonus_uses smallint`；`first_scan_at`。
用途：递减计数（前 3 次满额，之后 −15%/次，下限 0.4）。

### 3.5 其他

| 表 | PK / 关键列 |
|---|---|
| `codex_entries` | PK`(player_id, kind, entry_key)`，`discovered_at` |
| `sector_licenses` | PK`(player_id, sector_key)`，`unlocked_at` |
| `discoveries` | PK`(player_id, galaxy_hash)`，`bitmap text`（每星系一行） |
| `surface_samples` | PK`(player_id, planet_key, game_day)`，`used smallint CHECK ≤3` |
| `cooldowns` | PK`(player_id, key)`，`ready_at`；`key` = `scan:{planet}` / `collect:{planet}` / `trail` |
| `wrecks` | PK`(player_id, planet_key)`，`tier smallint`，`created_at` |

---

## 4. 市场与合同域

### 4.1 `market_days`

PK `id`；`UNIQUE(planet_key, game_day)`；`generated_by text`（`job`/`lazy`）；`generated_at`。
作用：一天一个行情快照头，保证「同一天同一行星报价一致」。

### 4.2 `market_quotes`

PK `(market_day_id, resource_code)`；`buy_price int CHECK >0`；`sell_price int CHECK >0`；`stock int CHECK ≥0`；`initial_stock int`。
扣库存：`UPDATE ... SET stock = stock - $n WHERE stock >= $n RETURNING stock`。

### 4.3 `trade_orders`

`id` bigserial；`player_id`；`planet_key`；`resource_code`；`side`(`buy/sell`)；`quantity int CHECK >0`；`unit_price int`；`tax numeric(20,4)`；`tx_id uuid`；`created_at`。
索引：`(player_id, created_at DESC)`。

### 4.4 `contracts`

| 列 | 类型 | 说明 |
|---|---|---|
| `player_id` + `id` | PK | `id` 形如 `scan_2026-10-25` |
| `template_code` | text FK | — |
| `metric` | text CHECK (`scans`,`trades`,`collections`,`relicScans`,`kills`) | — |
| `target` | int CHECK >0 | — |
| `progress` | int DEFAULT 0 CHECK ≥0 | — |
| `status` | text CHECK (`open`,`accepted`,`claimed`,`expired`) | — |
| `taken_by` | text NULL | NPC 接走则不可接 |
| `target_galaxy` | point NULL | 专家合同绑定目的地 |
| `target_distance` | int NULL | 用于成本计算 |
| `reward_multiplier` | numeric(6,2) | 距离倍率 |
| `accepted_at` / `expires_at` | timestamptz | TTL 12h |
| `game_day` | date | 当地日 |

索引：`(player_id, game_day)`；`(player_id, expires_at) WHERE status='accepted'`。
约束：`CHECK (status <> 'accepted' OR accepted_at IS NOT NULL)`。

### 4.5 其他

`contract_events(contract_id, at, delta, source)` 追加；`player_tasks` PK`(player_id, task_code)`。

---

## 5. 资产与社交域

| 表 | 关键列 | 约束 |
|---|---|---|
| `stations` | `id` uuid, `player_id`, `planet_key`, `coordinates point`, `modules jsonb`, `last_tick_at`, `stored jsonb` | `UNIQUE(player_id, planet_key)`；≤3 座触发器 |
| `station_modules` | `station_id`, `module_code`, `level` | PK`(station_id, module_code)` |
| `fabrication_cooldowns` | `player_id`, `recipe_code`, `ready_at` | PK`(player_id, recipe_code)` |
| `npc_residents` | `universe_id`, `code`, `name`, `callsign`, `trait` | `UNIQUE(universe_id, code)` |
| `npc_relations` | `player_id`, `resident_id`, `favor smallint`, `trades int`, `last_met_at` | PK`(player_id, resident_id)` |
| `faction_reputation` | `player_id`, `sector_key`, `rep smallint CHECK -10..10` | PK`(player_id, sector_key)` |
| `alliances` | `id`, `name citext UNIQUE`, `created_at` | — |
| `alliance_members` | `alliance_id`, `player_id`, `role`, `joined_at` | PK`(alliance_id, player_id)`；≤5 触发器 |
| `alliance_invites` | `code` PK, `alliance_id`, `expires_at`, `used_at` | 一次性 + TTL |
| `wrecks` | `player_id`, `planet_key`, `tier`, `created_at` | PK`(player_id, planet_key)` |

---

## 6. 战斗域

### 6.1 `combat_sessions`

| 列 | 类型 | 说明 |
|---|---|---|
| `id` uuid PK | — | — |
| `player_id` | uuid FK | — |
| `planet_key` | text NULL | 挑战码对战为空 |
| `mode` | text CHECK (`pve`,`challenge`) | — |
| `seed` | bigint NOT NULL | **必须落库**，用于重放 |
| `status` | text CHECK (`active`,`won`,`lost`,`fled`,`void`) | — |
| `turn_no` | int DEFAULT 1 | — |
| `player_hp/shield`、`enemy_hp/shield`、`escorts jsonb` | — | 判定用列，非 JSONB 大包 |
| `expires_at` | timestamptz DEFAULT now()+2h | 过期作废 |

索引：`(player_id, status) WHERE status='active'`。

### 6.2 其他

`combat_turns(session_id, turn_no, action, damage, log jsonb)` 追加；`combat_loot UNIQUE(session_id)`，含 `tx_id`。

---

## 7. 基础设施域

| 表 | 列 | 说明 |
|---|---|---|
| `outbox_events` | `id bigserial`, `aggregate_type`, `aggregate_id`, `event_type`, `payload jsonb`, `created_at`, `published_at` | 分区；`(created_at) WHERE published_at IS NULL` |
| `idempotency_keys` | `key` PK, `account_id`, `route`, `request_hash`, `response jsonb`, `status smallint`, `created_at` | TTL 24h |
| `audit_log` | `id`, `actor`, `action`, `target`, `before`, `after`, `ip`, `request_id`, `created_at` | 分区，只 INSERT |
| `login_attempts` | `id`, `identifier`, `ip`, `success bool`, `created_at` | 防爆破 |
| `job_runs` | `job_name`, `run_date`, `started_at`, `finished_at`, `ok bool`, `detail jsonb` | PK`(job_name, run_date)` |

---

## 8. 规模与容量

| 表 | 单玩家行数 | 10k DAU 规模 | 备注 |
|---|---|---|---|
| `wallets` | 12 | 120k | 热 |
| `ledger_entries` | 50/日 | 1.8 亿/年 | 分区 + 归档 |
| `planet_scans` | 50–400 | 400 万 | 大玩家多 |
| `contracts` | 3/日 | 1000 万/年 | 过期归档 |
| `planet_*` | 0–60 | 60 万 | 改造行星 |
| `world_planet_*` | 全服共享 | 100 万 | 见 18 |

---

## 9. 字段级验收

- [ ] 每张表 `information_schema.columns` 与本文件一致（用脚本比对）
- [ ] 所有枚举列有 `CHECK`，无裸 `text`
- [ ] 所有 FK 有对应索引
- [ ] `numeric` 无 `float`；时间全 `timestamptz`
- [ ] 账本/审计表权限正确（只 INSERT）
- [ ] 参考数据表有 `data_version`，业务代码无硬编码

## 10. 实现补充（M0–M3，2026-10-25）

开工时发现四处「按本文无法落地」的缺口，已在迁移 `0001`/`0004` 中补齐，均为**新增表/新增约束**，不改既有列语义：

| 补充 | 原因 | 迁移 |
|---|---|---|
| `guest_devices(device_hash PK, account_id, player_id)` | `/session` 承诺「同设备同 player」，但原表清单没有设备绑定存储 | `0001_core` |
| `player_flags(player_id PK, hull, vouchers)` | 09 §2.3 用 `player_flags.hull`、08 暴露 `vouchers`，原表清单缺表 | `0004_progress` |
| `player_tech(player_id, node_code)` | 科技解锁进度无表（`player_tasks` 是每日任务），A4 无法落库 | `0004_progress` |
| `idempotency_keys.key` 实际存 `{account_id}:{key}` | 文档要求「键作用域 = account + key」，但 PK 只有 `key`；拼接后一个 PK 同时表达作用域与唯一性 | `0008_platform` |

三条命名/实现约定：

1. `resource_types.code` 使用前端 camelCase（`quantumAlloy`、`plasmaCell`…），与 `Utils/ResourceLabels.tsx` 逐字对齐；本文 SQL 示例里的 `quantum_alloy` 仅作示意。若改成 snake_case，前端每次调用都要做映射，反而制造第二份真相。
2. Refresh Token 形式为 `<session_id>.<secret>`：Argon2id 是加盐哈希，无法按哈希查行，只有先用 id 定位、再验 secret，才能同时满足「只存哈希」与 O(1) 查找。
3. 迁移进度：`0001`–`0008`、`0100_universe_cache`、`0100b_contract_reward`、`0101_planet_data`、`0102_world_planets`、`0103_cutover`、`0104_local_save_import`、`0105_challenge`、`0106_tasks`、`0107_codex_claims` 已全部落地。`0100b` 给 `contracts` 增加 `reward jsonb`（模板只给区间，必须存当日快照）；`0101` 为玩家改造行星（claims/structures/deposits/modifiers/audit/events）；`0102` 为共享行星与攻城（world_planets/history/sieges/participants/loot_escrow）；`0103` 为灰度/接入（feature_flags 扩列、player_flag_overrides、player_shadow_state、factions、saga_steps）。
4. 行星元素权威：`server/domain/planet.py` 用 `universes.seed` + `pymodules/__planet_elements.py` 重新推导 `name/planet_type/elements`，校验 `planet_key` 后写入 `universe_cache.planets`（namespace = `uuid5("atlas-api-universe:" + universes.id)`）。名字不匹配或旧客户端 key 会返回 404；采集随后回落坐标公式并在响应标注 `planet.source=fallback`。

## 11. 相关文档

- DDL 与迁移切分：[19-ddl.md](19-ddl.md)
- 账本语义：[05-economy-ledger.md](05-economy-ledger.md)
- 行星三张：[16](16-planet-cache.md)、[17](17-player-planets.md)、[18](18-world-planets.md)
