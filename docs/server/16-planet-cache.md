# 16 · 行星缓存迁 PG（详细设计）

> 对应主文档 §7.10。本篇给出：现有实现盘点、目标表字段、读写算法与 SQL、版本失效、淘汰、四步迁移、故障矩阵、测试。
> 结论先说：缓存是**派生数据**，允许整表清空；不允许承载任何玩家改动（见 17）。

---

## 1. 现有实现盘点

| 组件 | 文件 | 结构 | 方法 |
|---|---|---|---|
| SQLite | `pymodules/__atlas_sqlite_cache.py` | `galaxies(id,x,y,z,data TEXT)`、`systems(...,system_index)`、`planets(...,system_index,planet_name)`，各自 `UNIQUE` | `save_*/get_*/ *_exists/get_cache_stats` |
| JSON | `pymodules/__atlas_permanent_cache.py` | `internal_data/cache/{galaxies,systems,planets}/*.json` | 同名方法，一对象一文件 |
| Redis | `__atlas_redis_cache.py` | `galaxy:{x}:{y}:{z}` 摘要 | `get/set` |
| 接入 | `__atlas_cache_proxy.py` | `CachedGalaxy`、`CachedSolarSystem`、`patch_universe_get_galaxy()` | 命中只回填标量；`planets` 永远重建 |

关键行为：

```python
class CachedSolarSystem(SolarSystem):
    def __init__(self, seed, index, constants, galaxy_coordinates):
        cached = sqlite_cache.get_system(x, y, z, index)
        if cached:
            self.seed = cached["seed"]; self.name = cached["name"]
            self.num_planets = cached["num_planets"]
            self.stars = cached.get("stars") or []
            self.planets = {}
            self._build_planets(self.num_planets)      # ← 行星永远由 seed 重建
            return
```

因此：**`num_planets` 缺失 = 命中后系统是空壳**（历史 bug），迁移必须保证该列存在。

---

## 2. 目标表（字段级）

```sql
universe_cache.galaxies(
  id bigserial PK, universe_id uuid NOT NULL,
  x int, y int, z int,
  data jsonb NOT NULL,                 -- 完整摘要（seed/name/num_systems/...）
  generator_version int NOT NULL,
  hit_count int NOT NULL DEFAULT 0,
  created_at/updated_at timestamptz,
  UNIQUE(universe_id, x, y, z)
) WITH (fillfactor=85);
```

`systems` 同理 + `system_index`；`planets` 再加 `planet_name`。
`cache_meta(universe_id PK, generator_version, updated_at)`：版本号唯一来源。

字段规则：

| 字段 | 规则 |
|---|---|
| `data` | `json.dumps(obj, sort_keys=True, ensure_ascii=False)`；读回不做补全 |
| `generator_version` | 写入时的全局版本；命中时 `!= cache_meta.generator_version` 即 miss |
| `hit_count` | 不逐次写；1/64 概率 `+1`（或 Redis 计数异步落库） |
| `universe_id` | 从 `config.seed_name` 派生，调用方无感 |

---

## 3. 读算法

```python
def get_planet(universe_id, x, y, z, sys_idx, name):
    row = q("""SELECT data, generator_version FROM universe_cache.planets
                WHERE universe_id=%s AND x=%s AND y=%s AND z=%s
                  AND system_index=%s AND planet_name=%s""",
            (universe_id, x, y, z, sys_idx, name))
    if row and row.generator_version == current_version(universe_id):
        maybe_touch(row)               # 1/64 采样
        return json.loads(row.data)
    if row:                            # 版本过期：覆盖
        delete(row)
    obj = generate(x, y, z, sys_idx, name)     # 纯函数
    upsert(obj)                                 # ON CONFLICT DO NOTHING
    return obj
```

写：

```sql
INSERT INTO universe_cache.planets(...)
VALUES (...)
ON CONFLICT (universe_id, x, y, z, system_index, planet_name) DO NOTHING;
```

要点：

1. **首写胜出**：生成确定性，后写覆盖只会掩盖漂移。
2. 命中后不做字段补全（补全逻辑只允许在新数据生成时存在）。
3. PG 不可用 → 直接返回生成结果，**不写盘、不 5xx**，并加 WARN 日志。

---

## 4. 版本失效

| 场景 | 行为 |
|---|---|
| 生成逻辑发布 | 部署时 `UPDATE cache_meta SET generator_version = generator_version + 1` |
| 命中旧版本 | 视为 miss，覆盖该行（或先删后写） |
| 新宇宙 | `cache_meta` 无行 → 首次写入时创建 |
| 误发版本（回滚） | 版本号只增不减；回滚代码时**不要**回退版本号，靠兼容读取 |

兼容读取：若 `data` 缺新字段，按默认值补齐**仅用于返回**，不写回。

---

## 5. 淘汰与容量

| 项 | 值 |
|---|---|
| 上限 | galaxies 50 万 / systems 200 万 / planets 500 万（`ATLAS_CACHE_MAX_ROWS`） |
| 单行 | galaxy 0.4KB / system 1KB / planet 2–4KB |
| 淘汰 | `DELETE FROM ... WHERE ctid IN (SELECT ctid FROM ... ORDER BY updated_at LIMIT 10000)` 循环 |
| 顺序 | planets → systems → galaxies（先删叶子） |
| 频率 | Celery 每小时 |
| 备份 | 不做 PITR；仅可选逻辑备份 |

```sql
-- 淘汰（分批，避免长事务）
WITH victims AS (
  SELECT ctid FROM universe_cache.planets ORDER BY updated_at ASC LIMIT 10000
)
DELETE FROM universe_cache.planets p USING victims v WHERE p.ctid = v.ctid;
```

---

## 6. 四步迁移

| 步 | 动作 | 观察指标 | 回滚 |
|---|---|---|---|
| 1 | `alembic upgrade 0100`（建 schema/表/授权/`cache_meta`） | 迁移耗时、锁等待 | `downgrade` 删 schema |
| 2 | 双写：miss 时写 PG + SQLite，读仍 SQLite | 写失败率、写 p95 | `ATLAS_CACHE_BACKEND=sqlite` |
| 3 | 回填：导入 `atlas_cache.db` 三表 + `cache/**/*.json` | 导入行数、1% 抽样差异（必须 0） | 清空重导 |
| 4 | 切读 `=pg`；SQLite 只读兜底 7 天；关双写；归档 JSON 目录 | 命中率、读 p95、5xx | 改回 `sqlite` |

回填伪代码：

```python
for row in sqlite.iter_galaxies():      # 分批 1000
    pg.upsert(universe_id, row.x, row.y, row.z, row.data)
for path in glob("internal_data/cache/planets/*.json"):
    obj = json.load(path); pg.upsert(parse_key(path), obj)
sample(1%) → compare(pg.get(k), json.loads(sqlite.get(k)))   # 必须全等
```

---

## 7. 故障矩阵

| 故障 | 行为 | 用户可见 |
|---|---|---|
| PG 连接失败 | 直接生成、不落盘、WARN | 无（略慢） |
| 表不存在（迁移未跑） | 同上 + ERROR 告警 | 无 |
| 分区/磁盘满 | 写失败被吞掉，只读缓存 | 无 |
| 版本号不一致（多实例） | 部分命中旧数据 → 视为 miss 重新生成 | 无 |
| 并发写同 key | `DO NOTHING`，无错 | 无 |
| 返回数据缺字段 | 默认值补齐 + 告警 | 无 |

---

## 8. 测试

```text
T1  同坐标两次 get_galaxy → 完全相同（含 stars 顺序）
T2  命中系统后 planets 数量 == num_planets，且与 fresh 逐字段一致
T3  删除该行后重建 → 与删除前完全一致
T4  切换 universe_id → 同坐标不命中旧宇宙
T5  连接串改错 → 请求成功、有 WARN、无 5xx
T6  8 线程并发写同 key → 表内 1 行，无异常
T7  generator_version 提升 → 旧行被覆盖，结果等于新生成
T8  淘汰 1 万行后，命中率回到 95%+（预热） 
```

---

## 9. 验收

- [ ] 命中率 > 95%（同宇宙二次访问）
- [ ] 读 p95：本机 < 8ms，prod < 15ms
- [ ] 1000 key 抽检与 fresh 全等
- [ ] 停 PG 可降级，无 5xx
- [ ] 4 worker 并发无锁冲突
- [ ] `TRUNCATE universe_cache` 不影响任何玩家可见结果

## 10. 相关文档

- 玩家改造（不可重建）：[17-player-planets.md](17-player-planets.md)
- 字段级表：[04-data-model.md](04-data-model.md)
- DDL：[19-ddl.md](19-ddl.md)

---

## 11. 实现记录（M0.5，2026-10-25）

- 迁移 `0100_universe_cache` 创建 `universe_cache.{cache_meta,galaxies,systems,planets}`、evict 索引与 `atlas_app`/`atlas_readonly` 授权；`up→down→up` 已验证。
- 门面文件是 `pymodules/__atlas_cache_facade.py`：原计划的 `pymodules/__atlas_cache.py` 已被 webp 图片缓存占用，重命名会破坏既有 import，故加 `_facade` 后缀。
- `universe_id = uuid5(NAMESPACE_URL, "atlas-universe:" + config.seed_str + "|" + cosmic_origin_time)`。每次调用解析，兼容 session 级 `remote_mode`；不用 `seed_name`（本地恒为 "Local Universe"，会撞车）。
- 开关：`ATLAS_CACHE_BACKEND=sqlite|pg`（默认 `sqlite`，未回填前不切）、`ATLAS_CACHE_DUAL_WRITE`、`ATLAS_CACHE_SQLITE_FALLBACK`（pg 模式下读不到时回落 SQLite，保留 7 天回滚窗口）。PG 故障只 WARN + 返回生成结果，不写盘、不 5xx。
- 运维命令：`python -m server.cli cache-backfill --universe-id <uuid>`（SQLite+JSON 导入并 1% 抽样全等）、`cache-inspect`、`cache-version`（版本只增不减）。
- 淘汰：`jobs/cache_evict` 每小时按 planets → systems → galaxies 删最旧行，阈值 `ATLAS_CACHE_MAX_*`。
- 代理只读写 `galaxies`/`systems`；行星权威数据由 `server/domain/planet.py` 生成后写入 `planets`，namespace 为 `uuid5("atlas-api-universe:" + universes.id)`，与旧缓存宇宙隔离。
- 行星元素不再依赖旧缓存：服务端用 `universes.seed` + `pymodules.__planet_elements` 直接生成并校验 `planet_key`，详见 [09-server-compute.md §14](09-server-compute.md)。因此即使 `planets` 被清空，接口结果也不变（仅重新物化）。
- 顺带修复一个冷热不一致缺陷：`SolarSystem._create_planet` 原先由调用方传 `is_extra`，而缓存命中的 `_build_planets` 不传，导致 `num_planets ≥ 7` 时第 7–10 颗行星名称冷/热不同。现在由 `index >= 6` 推导（基础行星数上限为 6，索引 ≥6 必为额外行星），并加回归测试。此修改不改变冷生成结果，只修正热路径。
