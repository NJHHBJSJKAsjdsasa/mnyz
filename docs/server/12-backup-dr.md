# 12 · 备份与灾备（详细设计）

> 对应主文档 §16。本篇给出：备份矩阵与留存、PITR 步骤、四类恢复运行手册、恢复后 5 项校验、演练脚本、容量与成本、风险、验收。

---

## 1. 目标

| 指标 | 值 | 验证 |
|---|---|---|
| RPO | ≤ 5 分钟 | WAL 归档延迟监控 |
| RTO | ≤ 30 分钟 | 季度演练实测 |
| 备份成功率 | ≥ 99.9% | 每日检查 + 告警 |
| 演练频率 | 每月 1 次（含部分表恢复） | 报告归档 |

---

## 2. 备份矩阵

| 类型 | 工具/方式 | 频率 | 留存 | 覆盖 | 恢复粒度 |
|---|---|---|---|---|---|
| 物理全备 | `pg_basebackup -Ft -z` | 每日 02:00 | 7 份 | 全库 | 整库 |
| WAL 归档 | `archive_command` → 对象存储 | 持续 | 14 天 | 全库 | 任意时间点 |
| 逻辑备份 | `pg_dump -Fc -n public` | 每日 03:00 | 7 份 | 玩家库（排除 `universe_cache`） | 单表/单行 |
| 配置 | Git + 密钥库 | 变更时 | 长期 | 配置/密钥 | 文件 |
| 缓存 | 不备份 | — | — | `universe_cache` | 重建 |

```bash
# 物理全备
pg_basebackup -D /backup/base/$(date +%F) -Ft -z -P -X stream

# 逻辑备份（排除缓存 schema）
pg_dump -Fc -n public atlas > /backup/logical/atlas_$(date +%F).dump

# 归档检查（每日）
SELECT last_archived_time, now()-last_archived_time AS lag FROM pg_stat_archiver;
```

---

## 3. PITR 步骤（设计级）

| 步 | 动作 | 校验 |
|---|---|---|
| 1 | 停止应用写（开关 → 只读） | 写接口 503 |
| 2 | 选恢复点 `T`（故障前最后一个事务边界） | 与审计/日志对齐 |
| 3 | 恢复 basebackup 到新实例 | 数据目录完整 |
| 4 | 配置 `recovery_target_time='T'` + `restore_command` | 日志出现 `recovery stopping` |
| 5 | 启动并等待恢复完成 | `pg_is_in_recovery=f` |
| 6 | 跑第 4 节 5 项校验 | 全部通过 |
| 7 | 切换 DSN/DNS，恢复写 | 监控 30 分钟 |

**注意**：恢复点若落在半事务中间，PG 会回到事务边界；恢复后必须重新对账。

---

## 4. 恢复后 5 项校验

| # | 校验 | 通过条件 |
|---|---|---|
| 1 | Alembic 版本 | == 代码期望 |
| 2 | 账本对账 | 偏差 0 |
| 3 | 关键行数 | 与备份前差异 ≤ 备份间隔内增量 |
| 4 | 行星改造 | 抽 100 颗 `planet_claims`，`materialize` 哈希与备份前快照全等 |
| 5 | 端到端 | 抽 10 个玩家：登录 + 一次采集 + 一次市场查询 |

第 4 项专用 SQL：

```sql
SELECT player_id, planet_key FROM planet_claims ORDER BY random() LIMIT 100;
-- 对每行：materialize(base, deltas) → sha256(json sort_keys) 与备份快照比对
```

---

## 5. 运行手册

### 5.1 误删单表/单玩家

```
1. 临时实例恢复最近逻辑备份
2. COPY 目标行导出（按主键）
3. 主库 UPSERT（仅缺失行）
4. 若涉及钱包 → 必须用 correction 交易，不直接覆盖
```

### 5.2 整库损坏/误操作

按第 3 节 PITR，随后第 4 节校验。

### 5.3 主库宕机

```
1. 同区同步副本 pg_ctl promote（RPO 0）
2. pgbouncer 指向新主
3. 应用重连（指数退避，最多 3 次）
4. 原主修复后作为副本加入
```

### 5.4 整区故障

```
1. 提升跨区异步副本（RPO ≤ 1 分钟）
2. 更新全局路由 identity_directory.region
3. DNS 切换，客户端重连
4. 该区只读 → 恢复写；其他区不受影响
```

---

## 6. 演练

| 项 | 内容 |
|---|---|
| 频率 | 每月 1 次；每季度 1 次「区域故障」桌面演练 |
| 记录 | `docs/ops/drill-YYYYMM.md`：开始/结束时间、恢复点、耗时、失败项 |
| 必测场景 | ①PITR 整库 ②单表恢复 ③主库切换 ④行星哈希校验 |
| 通过标准 | RTO < 30 分钟；5 项校验全绿；无数据丢失超 RPO |

演练脚本：

```bash
T0=$(date -u +%FT%TZ)
# 1) 造一个已知事务点：写入一条测试记录
# 2) 在隔离环境恢复到 T-1h
# 3) 跑校验脚本 tools/restore_check.py --at "T-1h"
# 4) 记录耗时与差异
```

---

## 7. 容量与成本

| 项 | 量级 |
|---|---|
| 全备大小 | 数据量 × 0.4（压缩） |
| WAL 日增 | 10–50GB（视写入） |
| 对象存储 | 7 全备 + 14 天 WAL ≈ 2–3× 库大小 |
| 月成本 | $10–40 |

---

## 8. 风险

| 风险 | 缓解 |
|---|---|
| 备份从未验证 | 每月演练进值班清单 |
| WAL 归档中断 | 延迟告警 + 磁盘水位 |
| 恢复点在半事务 | 恢复后必须对账再开写 |
| 副本延迟过大 | 大事务拆分、`max_wal_size` 调整 |
| 演练环境规格不同 | 用同规格实例测 RTO |
| 密钥不在备份内 | 密钥独立存储 + 恢复演练包含解密 |

---

## 9. 验收

```text
T1  pg_basebackup + WAL 连续 7 天无失败
T2  一次 PITR：RTO < 30min、RPO < 5min
T3  恢复后 5 项校验全绿（含行星哈希）
T4  单表恢复实测成功
T5  主库切换演练：应用 3 分钟内恢复写
T6  区域故障桌面演练：路由切换步骤可执行
```

## 10. 相关文档

- 行星哈希校验：[17-player-planets.md](17-player-planets.md)
- 告警：[11-observability.md](11-observability.md)
- 账本对账：[05-economy-ledger.md](05-economy-ledger.md)
