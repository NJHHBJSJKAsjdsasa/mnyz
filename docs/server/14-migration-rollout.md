# 14 · 迁移与灰度上线（详细设计）

> 对应主文档 §18。本篇给出：开关表与分桶算法、五个阶段的动作/指标/退出标准、分域切换顺序、影子写差异算法、存档导入、回滚矩阵、沟通模板、验收。

---

## 1. 开关

```sql
feature_flags(
  key text PRIMARY KEY,              -- 例如 'domain.explore'
  mode text NOT NULL,                -- local | shadow | server
  rollout_pct smallint NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

player_flag_overrides(
  player_id uuid, flag_key text, mode text, expires_at timestamptz,
  PRIMARY KEY (player_id, flag_key)
);
```

分桶：

```
bucket = int(sha1(player_id + flag_key)[:8], 16) % 100
enabled = bucket < rollout_pct
```

规则：

1. 进程内缓存 10s（避免每请求查库）。
2. 客服可按 `player_id` 强制指定（`expires_at` 24h）。
3. `mode` 三态：`local`（前端自算）、`shadow`（双算只对账）、`server`（服务端权威）。

---

## 2. 五个阶段

### M1 影子写（只写不读）

| 项 | 内容 |
|---|---|
| 前端行为 | 照旧写 localStorage；异步 `POST /shadow/state` 落库（失败静默） |
| 服务端 | 只写 `player_shadow_state`，不参与任何读 |
| 指标 | 写入成功率、字段缺失率、体积 P95 |
| 退出 | 24h 成功率 > 99.9%，缺失率 0 |

### M2 读切换

| 项 | 内容 |
|---|---|
| 前端 | 展示服务端值，本地仍写（用于对比） |
| 指标 | 差异率 = 不一致字段数 / 总字段数；p95；工单 |
| 退出 | 差异率 < 0.1%，连续 24h 无「数据丢失」工单 |
| 回滚 | `mode=local` |

差异算法：

```
for each player in sample(10%):
    local = parse(localStorage)
    server = GET /state
    diff = fieldlevel_diff(local, server, ignore=[timestamps, derived])
    record(diff)
```

### M3 分域写切换

| 顺序 | 域 | flag | 原因 |
|---|---|---|---|
| 1 | 探索 | `domain.explore` | 读多写少，易观察 |
| 2 | 经济 | `domain.economy` | 涉钱，小流量先 |
| 3 | 资产 | `domain.assets` | 状态复杂 |
| 4 | 战斗/攻城 | `domain.combat` | 依赖前面全部 |

每域：1% → 10% → 50% → 100%，每档 ≥ 24h；观察 5xx、p95、对账偏差、工单。

### M4 本地降级

| 项 | 内容 |
|---|---|
| 前端 | localStorage 变只读缓存；离线只读 |
| 风险 | 断网不能继续采集 |
| 缓解 | 明确提示「离线只读」；不假写 |
| 退出 | 无「看似成功实则丢失」的路径 |

### M5 存档导入

| 项 | 内容 |
|---|---|
| 入口 | `POST /migrations/local-save`；每账号一次 |
| 校验 | 26 键齐全、文件 SHA-256、单值 ≤ 理论上限 |
| 落账 | 每种资源一对分录（`kind='migration'`） |
| 审计 | 文件哈希 + 导入/丢弃明细，保留 30 天 |
| 退出 | 导入后对账 0；抽 20 账号人工核对 |

---

## 3. 指标与阈值（灰度期）

| 指标 | 停止扩大 | 立即回滚 |
|---|---|---|
| 5xx 率（5min） | > 0.5% | > 1% |
| p95 延迟 | > 200ms | > 400ms |
| 对账偏差 | > 0 | > 0 |
| 差异率（M2） | > 1% | > 3% |
| 「数据丢失」工单 | ≥ 3 件/日 | ≥ 5 件/日 |
| 幂等冲突率 | 翻倍 | 翻 3 倍 |

---

## 4. 回滚矩阵

| 故障 | 动作 | 数据影响 |
|---|---|---|
| 域写入异常 | 该域 `mode=local` | 服务端暂停写，本地继续 |
| 对账偏差 | 全局停写 + 冻结受影响玩家 | 补偿交易修正 |
| 性能不达标 | `rollout_pct` 回上一档 | 无 |
| 迁移失败 | Alembic `downgrade` | 依赖 revision 可逆 |
| 导入污染 | 关入口 + 按 `migration_keys` 定位 | 补偿交易，不删历史 |

原则：**不回滚数据，只回滚流量与代码**；资金修正一律走补偿交易。

---

## 5. 沟通

| 时点 | 内容 |
|---|---|
| M3 前 | 内部公告：哪些域切换、如何回滚 |
| M4 前 | 玩家公告：离线只读的说明与限制 |
| M5 前 | 玩家公告：如何导入旧存档（附步骤） |
| 每次灰度 | 变更单：flag、范围、观察指标、回滚人 |

---

## 6. 测试

```text
T1  分桶稳定：同 player_id 多次计算 bucket 不变
T2  强制指定：player_flag_overrides 生效且 24h 后失效
T3  影子写失败：不影响前端，仅告警
T4  差异率计算：构造 1% 差异 → 指标正确
T5  单域回滚：< 5 分钟内 `mode` 生效（缓存 10s）
T6  存档导入二次请求 → 409，不重复入账
T7  导入超上限 → 丢弃并记录，余额不超上限
T8  对账偏差触发停写：写接口 423/503，读正常
```

---

## 7. 验收

- [ ] 每个域有独立 flag 与强制指定能力
- [ ] 五阶段各有退出标准与记录
- [ ] 一次真实单域回滚演练 < 5 分钟
- [ ] 存档导入每账号一次、可审计
- [ ] 灰度四档均有观察结论
- [ ] 沟通模板与变更单模板就绪

## 8. 相关文档

- 服务端计算切换：[09-server-compute.md](09-server-compute.md)
- 账本导入：[05-economy-ledger.md](05-economy-ledger.md)
- 里程碑：[15-milestones-and-risks.md](15-milestones-and-risks.md)
- 硬件化/接入记录：[21-hardening.md](21-hardening.md)

## 9. 实现进度（2026-10-25）

- `0103_cutover` 已建 `feature_flags(mode/rollout_pct)`、`player_flag_overrides`、`player_shadow_state`、`factions`、`saga_steps`。
- `GET /features`、`POST/GET /shadow/state` 已上线；开关可用 `python -m server.cli flag-set` 调整。
- 前端 `ServerApi`/`ServerBridge` 已接到主布局，默认 `off`；设 `localStorage._atlasServerMode='shadow'` 即开始影子写，设 `'server'` 后采集按钮改走 `/api/v1`（其余域仍本地）。
- 未做：真实 PITR/压测/四档灰度记录；前端其余域的写切换仍按域逐步进行。
