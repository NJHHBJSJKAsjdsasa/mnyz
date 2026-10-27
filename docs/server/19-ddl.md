# 19 · DDL 与迁移切分（详细设计）

> 对应主文档附录 B。本篇给出：11 个 revision 的完整切分、核心表 DDL、分区与预建、权限矩阵、库内不变量、可回滚要求、大表变更规则、评审清单。
> 全文 DDL 的唯一来源仍是主文档附录 B；本篇补充**顺序、依赖、权限与运维细节**。

---

## 1. Revision 总表

| # | Revision | 依赖 | 内容 | 回滚方式 |
|---|---|---|---|---|
| 1 | `0001_core` | — | accounts, players, sessions, universes | 删表（有外部数据需备份） |
| 2 | `0002_reference` | 0001 | resource_types, module_definitions, tech_nodes, contract_templates, structure_definitions, game_config | 删表 + 删播种 |
| 3 | `0003_economy` | 0001,0002 | wallets, system_accounts, ledger_transactions, ledger_entries(分区) | 删表；分区一并删 |
| 4 | `0004_progress` | 0001,0002 | ships, ship_modules, fleet_ships, planet_scans, codex_entries, sector_licenses, discoveries, surface_samples, cooldowns, collections | 删表 |
| 5 | `0005_market_contracts` | 0001,0002 | market_days, market_quotes, trade_orders, contracts, contract_events, player_tasks | 删表 |
| 6 | `0006_assets_social` | 0001,0002 | stations, station_modules, fabrication_cooldowns, npc_residents, npc_relations, faction_reputation, alliances, alliance_members, alliance_invites, wrecks | 删表 |
| 7 | `0007_combat` | 0001 | combat_sessions, combat_turns, combat_loot | 删表 |
| 8 | `0008_platform` | 0001 | outbox_events(分区), idempotency_keys, audit_log(分区), login_attempts, job_runs | 删表 |
| 9 | `0100_universe_cache` | 0001 | schema `universe_cache` + galaxies/systems/planets/cache_meta | `DROP SCHEMA CASCADE` |
| 10 | `0101_planet_data` | 0001,0002 | planet_claims/modifiers/structures/deposits/audit(分区)/events + 配额触发器 | 删表（**先备份**） |
| 11 | `0102_world_planets` | 0001,0101 | world_shards/world_planets/…/sieges/loot_escrow/world_events | 删表（**先备份**） |

顺序原则：身份 → 参考数据（被外键依赖）→ 经济 → 业务 → 缓存/行星扩展。
`0003_economy` 必须在任何「会写钱」的域之前完成。

---

## 2. 核心 DDL（节选，完整见主文档附录 B）

### 2.1 `0001_core`

```sql
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE universes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_name text NOT NULL UNIQUE,
  seed bigint NOT NULL,
  cosmic_origin_time bigint NOT NULL,
  world_mode text NOT NULL DEFAULT 'private' CHECK (world_mode IN ('private','shared')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext,
  password_hash text,
  email_verified_at timestamptz,
  status text NOT NULL DEFAULT 'guest' CHECK (status IN ('guest','active','locked','deleted')),
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('player','ops','admin')),
  failed_logins smallint NOT NULL DEFAULT 0 CHECK (failed_logins >= 0),
  locked_until timestamptz,
  token_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT active_requires_password CHECK (status <> 'active' OR password_hash IS NOT NULL)
);
CREATE UNIQUE INDEX accounts_email_uq ON accounts (email) WHERE email IS NOT NULL;
CREATE INDEX accounts_status_idx ON accounts (status) WHERE status <> 'active';

CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  universe_id uuid NOT NULL REFERENCES universes(id) ON DELETE RESTRICT,
  slot smallint NOT NULL DEFAULT 1,
  display_name text NOT NULL DEFAULT '舰长',
  timezone text NOT NULL DEFAULT 'Asia/Shanghai',
  state_version bigint NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  last_settled_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  locked_reason text,
  UNIQUE (account_id, universe_id, slot)
);
CREATE INDEX players_seen_idx ON players (last_seen_at DESC);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  refresh_hash text NOT NULL UNIQUE,
  rotated_from uuid REFERENCES sessions(id),
  user_agent text,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text
);
CREATE INDEX sessions_account_idx ON sessions (account_id, revoked_at);
```

### 2.2 `0003_economy`

```sql
CREATE TABLE wallets (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  resource_code text NOT NULL REFERENCES resource_types(code),
  balance numeric(20,4) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, resource_code)
);

CREATE TABLE system_accounts (
  code text PRIMARY KEY,
  description text
);

CREATE TABLE ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref_type text,
  ref_id text,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_tx_player_idx ON ledger_transactions (player_id, created_at DESC);

CREATE TABLE ledger_entries (
  id bigserial,
  transaction_id uuid NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  wallet_id uuid,
  system_account_code text REFERENCES system_accounts(code),
  resource_code text NOT NULL REFERENCES resource_types(code),
  delta numeric(20,4) NOT NULL CHECK (delta <> 0),
  balance_after numeric(20,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entry_party_exclusive CHECK ((wallet_id IS NULL) <> (system_account_code IS NULL))
) PARTITION BY RANGE (created_at);
CREATE INDEX ledger_entries_tx_idx ON ledger_entries (transaction_id);
CREATE INDEX ledger_entries_wallet_idx ON ledger_entries (wallet_id, created_at);
```

### 2.3 `0100_universe_cache`

```sql
CREATE SCHEMA IF NOT EXISTS universe_cache;
CREATE TABLE universe_cache.cache_meta (
  universe_id uuid PRIMARY KEY,
  generator_version integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE universe_cache.planets (
  id bigserial PRIMARY KEY,
  universe_id uuid NOT NULL,
  x integer NOT NULL, y integer NOT NULL, z integer NOT NULL,
  system_index integer NOT NULL,
  planet_name text NOT NULL,
  data jsonb NOT NULL,
  generator_version integer NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (universe_id, x, y, z, system_index, planet_name)
) WITH (fillfactor = 85);
```

### 2.4 `0101_planet_data`（要点）

```sql
CREATE TABLE planet_claims (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  planet_key text NOT NULL,
  universe_id uuid NOT NULL REFERENCES universes(id) ON DELETE RESTRICT,
  display_name text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  generator_version_at_claim integer NOT NULL,
  state_version bigint NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','abandoned')),
  PRIMARY KEY (player_id, planet_key)
);
CREATE TABLE planet_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL, planet_key text NOT NULL,
  target text NOT NULL, op text NOT NULL CHECK (op IN ('add','mul','set')),
  value numeric(20,4) NOT NULL,
  source text NOT NULL,
  generator_version integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, planet_key, target),
  FOREIGN KEY (player_id, planet_key) REFERENCES planet_claims(player_id, planet_key) ON DELETE CASCADE
);
```

配额触发器：

```sql
CREATE OR REPLACE FUNCTION planet_claims_quota() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM planet_claims
       WHERE player_id = NEW.player_id AND state='active') >= 10 THEN
    RAISE EXCEPTION 'planet_claim_quota_exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER planet_claims_quota_trg BEFORE INSERT ON planet_claims
FOR EACH ROW EXECUTE FUNCTION planet_claims_quota();
```

### 2.5 `0102_world_planets`（要点）

```sql
CREATE TABLE world_planets (
  universe_id uuid NOT NULL REFERENCES universes(id) ON DELETE RESTRICT,
  planet_key text NOT NULL,
  shard_id text NOT NULL REFERENCES world_shards(shard_id),
  owner_kind text NOT NULL DEFAULT 'none' CHECK (owner_kind IN ('none','player','alliance')),
  owner_id uuid,
  claim_version bigint NOT NULL DEFAULT 0 CHECK (claim_version >= 0),
  state text NOT NULL DEFAULT 'neutral'
    CHECK (state IN ('neutral','claimed','vulnerable','besieged','derelict')),
  claimed_at timestamptz, shield_until timestamptz,
  last_contested_at timestamptz, upkeep_due_at timestamptz,
  generator_version integer NOT NULL,
  PRIMARY KEY (universe_id, planet_key),
  CONSTRAINT owner_consistency CHECK (owner_kind='none' OR owner_id IS NOT NULL)
);

CREATE TABLE sieges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  universe_id uuid NOT NULL, planet_key text NOT NULL, shard_id text NOT NULL,
  attacker_id uuid NOT NULL, defender_id uuid,
  attacker_fleet_id uuid, defender_fleet_id uuid,
  seed bigint NOT NULL,
  state text NOT NULL DEFAULT 'declared'
    CHECK (state IN ('declared','locked','resolving','resolved','aborted')),
  declare_at timestamptz NOT NULL DEFAULT now(),
  lock_at timestamptz,
  resolve_at timestamptz NOT NULL,
  outcome text CHECK (outcome IN ('attacker_won','defender_held','draw','aborted')),
  report jsonb,
  FOREIGN KEY (universe_id, planet_key) REFERENCES world_planets(universe_id, planet_key) ON DELETE CASCADE
);
CREATE INDEX sieges_due_idx ON sieges (state, resolve_at)
  WHERE state IN ('declared','locked','resolving');
```

---

## 3. 分区与预建

| 表 | 分区键 | 预建 | 归档 |
|---|---|---|---|
| `ledger_entries` | `created_at` 月 | 提前 3 个月 | 24 个月后 DETACH + 冷存 |
| `audit_log` | `created_at` 月 | 提前 3 个月 | 24 个月 |
| `planet_audit` | `created_at` 月 | 提前 3 个月 | 24 个月 |
| `planet_ownership_history` | `at` 月 | 提前 3 个月 | 36 个月 |
| `outbox_events` | `created_at` 月 | 提前 2 个月 | 7 天 |

```sql
-- 建分区（脚本每月跑，或 pg_partman）
CREATE TABLE ledger_entries_2026_11 PARTITION OF ledger_entries
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
```

规则：

1. **分区缺失 = 插入失败**（`no partition of relation found`），必须提前建 + 告警。
2. 分区名统一 `{table}_{YYYY_MM}`。
3. 归档：`ALTER TABLE ... DETACH PARTITION` → `pg_dump` 该分区 → `DROP`。
4. 不对分区做 `TRUNCATE`（长锁）。

---

## 4. 权限矩阵

| 角色 | public | universe_cache | ledger/audit | DDL |
|---|---|---|---|---|
| `atlas_app` | SELECT/INSERT/UPDATE/DELETE | SELECT/INSERT/UPDATE + TRUNCATE | INSERT/SELECT only | 否 |
| `atlas_readonly` | SELECT | SELECT | SELECT | 否 |
| `atlas_migrator` | ALL | ALL | ALL | 是 |

```sql
GRANT USAGE ON SCHEMA public TO atlas_app, atlas_readonly;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO atlas_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO atlas_app;
REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries, planet_audit, audit_log FROM atlas_app;
GRANT TRUNCATE ON ALL TABLES IN SCHEMA universe_cache TO atlas_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO atlas_readonly;
```

**新表默认不继承权限**：每个 revision 末尾必须显式 `GRANT`，否则上线即 500。

---

## 5. 库内不变量

| 不变量 | 实现 |
|---|---|
| 余额 ≥ 0 | `CHECK (balance >= 0)` + 条件 UPDATE |
| 分录非零 | `CHECK (delta <> 0)` |
| 分录二选一 | `CHECK ((wallet_id IS NULL) <> (system_account_code IS NULL))` |
| 幂等唯一 | `UNIQUE(idempotency_key)` |
| 冷却单一 | PK`(player_id, key)` |
| 库存 ≥ 0 | `CHECK (stock >= 0)` |
| 行星单主 | PK`(universe_id, planet_key)` + `owner_consistency` |
| 认领上限 | 触发器（10） |
| 结构上限 | 触发器（6/行星） |
| 联盟上限 | 触发器（5） |
| 战利品唯一 | `UNIQUE(siege_id, target_player_id)` |
| 审计不可改 | 权限撤销 |

原则：**能交给数据库的，不要只写在代码里**。

---

## 6. 大表变更规则

| 操作 | 规则 |
|---|---|
| 加列 | `ADD COLUMN ... NULL`（不设默认）→ 回填 → 再设默认/非空 |
| 加索引 | `CREATE INDEX CONCURRENTLY`（迁移中 `SET statement_timeout=0`，且不能包在事务里） |
| 改类型 | 新增列 + 双写 + 回填 + 切换读 + 删旧列 |
| 删列 | 先停止读写 30 天，再删 |
| 加约束 | `NOT VALID` → `VALIDATE CONSTRAINT` |
| 回填 | 分批 5000 行 + 睡眠，可中断续跑 |

禁止：一次性 `UPDATE` 全表、一次性 `ALTER TYPE` 改写大表、无 `CONCURRENTLY` 建索引。

---

## 7. 回滚要求

每个 revision 必须提供 `downgrade()`：

| 情况 | 回滚策略 |
|---|---|
| 只加表 | 删表 |
| 只加列 | 删列 |
| 加了索引 | 删索引 |
| 改了数据（播种） | 删除播种行（按 code 列表） |
| 删了列（破坏性） | **不允许在同一 revision**；分两次发布 |

生产执行顺序：`backup → upgrade → 验证 → 保留 downgrade 窗口 24h`。

---

## 8. 评审清单

- [ ] 每表有 PK 与 `created_at`
- [ ] 金额 `numeric(20,4)`，无 `float`
- [ ] 枚举 `text + CHECK`
- [ ] 外键有 `ON DELETE` 策略 + 索引
- [ ] 唯一约束覆盖业务幂等键
- [ ] 大表分区 + 预建 3 个月 + 归档任务
- [ ] 权限显式授予（含新表）
- [ ] `downgrade()` 可执行
- [ ] 大表变更使用 `CONCURRENTLY` / `NOT VALID`
- [ ] 参考数据播种幂等（跑两次结果一致）

---

## 9. 验收

```text
T1  upgrade head → downgrade base → upgrade head 三步通过
T2  pg_dump --schema-only 与仓库快照无意外 diff
T3  atlas_app 无法 UPDATE/DELETE ledger_entries / planet_audit
T4  新表权限正确（应用可写、只读只读）
T5  分区提前 3 个月存在；删掉下月分区后插入报错并触发告警
T6  播种跑两次，行数不翻倍
T7  100 万行样本上 CREATE INDEX CONCURRENTLY 不阻塞写入
```

## 10. 相关文档

- 字段级表结构：[04-data-model.md](04-data-model.md)
- 账本语义：[05-economy-ledger.md](05-economy-ledger.md)
- 迁移与灰度：[14-migration-rollout.md](14-migration-rollout.md)
