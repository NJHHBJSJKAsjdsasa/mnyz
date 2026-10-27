# 05 · 经济系统与双分录账本（详细设计）

> 对应主文档 §8。本篇给出：账户体系、分录模板、写入算法、并发控制、对账算法、补偿流程、迁移导入、错误矩阵、测试用例。
> 一句话原则：**余额是账本的物化视图，任何「直接改余额」的代码路径都不允许存在。**

---

## 1. 账户体系

| 账户类型 | 标识 | 谁在用 | 余额语义 |
|---|---|---|---|
| 玩家钱包 | `wallets(player_id, resource_code)` | 玩家 | 正数，`CHECK ≥ 0` |
| 系统账户 | `system_accounts(code)` + `resource_code` | 系统 | 记账对手方，可为负 |
| 托管账户 | `system_accounts('escrow')` | 攻城/跨区战利品暂存 | 中间态，必须最终清零 |

系统账户编码：

| code | 用途 | 典型对应 kind |
|---|---|---|
| `loot` | 采集/扫描/打捞/战利品来源 | `collect`/`scan`/`wreck_salvage`/`combat_loot` |
| `quest` | 合同与任务奖励 | `contract_reward` |
| `market` | 市场买卖对手 | `trade_buy`/`trade_sell` |
| `sink` | 消耗（改装/科技/维修/建站） | `refit`/`tech_unlock`/`hull_repair` |
| `escrow` | 跨区/攻城暂存 | `siege_loot` |
| `migration` | 存档导入来源 | `migration` |

**不变量**：对任一 `resource_code`，玩家钱包总和 + 系统账户总和 = 0 ± 历史 sink 调整（sink 本身也记在系统侧，所以恒为 0）。

---

## 2. 分录模板

### 2.1 产出（collect / scan / surface_sample / wreck_salvage / fleet_yield / station_yield）

```
tx(kind='collect', ref_type='planet', ref_id='planet_1,2,3_0_x', idempotency_key=...)
  entry(wallet=player, resource='antimatter', delta=+42, balance_after=812)
  entry(system='loot',  resource='antimatter', delta=-42, balance_after=...)
```

### 2.2 消耗（refit / tech_unlock / hull_repair / station_build / planet_build）

```
tx(kind='refit', ref_type='module', ref_id='scanArray', ...)
  entry(wallet=player, 'antimatter',   delta=-240)
  entry(system='sink', 'antimatter',   delta=+240)
  entry(wallet=player, 'quantumAlloy', delta=-12)
  entry(system='sink', 'quantumAlloy', delta=+12)
```

### 2.3 交换（trade_buy / trade_sell）

买入：玩家货币 → 系统，系统货物 → 玩家。

```
  entry(wallet=player, 'deuterium',     delta=-30)
  entry(system='market','deuterium',    delta=+30)
  entry(wallet=player, 'quantumAlloy',  delta=+2)
  entry(system='market','quantumAlloy', delta=-2)
```

### 2.4 导入（migration）

```
  entry(wallet=player, res, delta=+客户端值)
  entry(system='migration', res, delta=-客户端值)
  audit_log(action='save_import', before=null, after={...})
```

导入时对每种资源做上限校验，超出部分**不进分录**并单独记 `discarded` 到审计。

### 2.5 补偿（correction）

```
tx(kind='correction', ref_type='ledger_transaction', ref_id='<原 tx id>')
  ...与原交易相反的分录...
```

禁止 `UPDATE`/`DELETE` 历史分录。

---

## 3. 写入算法

```python
def post_transaction(conn, player_id, kind, ref_type, ref_id, deltas, idem_key=None):
    """
    deltas: dict[resource_code -> Decimal]（玩家侧增减，正负均可）
    调用方必须在同一事务内，且已锁定 players 行。
    """
    # 1) 幂等短路
    if idem_key:
        row = conn.execute(
            "SELECT id FROM ledger_transactions WHERE idempotency_key=%s", (idem_key,)).fetchone()
        if row:
            return conn.execute(
                "SELECT * FROM ledger_entries WHERE transaction_id=%s", (row[0],)).fetchall()

    # 2) 头
    tx_id = uuid4()
    conn.execute("""
        INSERT INTO ledger_transactions(id, player_id, kind, ref_type, ref_id, idempotency_key)
        VALUES (%s,%s,%s,%s,%s,%s)
    """, (tx_id, player_id, kind, ref_type, ref_id, idem_key))

    # 3) 玩家侧：按 resource_code 升序锁 + 条件更新
    for code in sorted(deltas):
        delta = deltas[code]
        if delta == 0:
            continue
        cur = conn.execute("""
            UPDATE wallets
               SET balance = balance + %s, updated_at = now()
             WHERE player_id=%s AND resource_code=%s AND balance + %s >= 0
            RETURNING balance
        """, (delta, player_id, code, delta))
        row = cur.fetchone()
        if row is None:
            raise InsufficientFunds(code, delta)     # 整笔事务回滚

        # 4) 玩家分录
        conn.execute("""
            INSERT INTO ledger_entries(transaction_id, wallet_id, resource_code, delta, balance_after)
            VALUES (%s,%s,%s,%s,%s)
        """, (tx_id, player_id, code, delta, row[0]))

        # 5) 系统对向分录（同资源、相反数）
        conn.execute("""
            INSERT INTO ledger_entries(transaction_id, system_account_code, resource_code, delta, balance_after)
            VALUES (%s,%s,%s,%s,%s)
        """, (tx_id, account_for(kind), code, -delta, system_balance_after(conn, account_for(kind), code)))

    return load_entries(conn, tx_id)
```

要点：

1. **先锁聚合根**（`players`），再按 `resource_code` 字典序更新钱包——避免两笔并发交易交叉等待。
2. 条件 `UPDATE ... WHERE balance + delta >= 0` 同时完成「校验 + 扣减」，无读-改-写竞态。
3. 余额不足时段更新 0 行 → 抛异常 → 整笔回滚，**不留半条分录**。
4. `balance_after` 让审计可不依赖累计求和即可复原。

---

## 4. 并发

| 场景 | 机制 | 结果 |
|---|---|---|
| 同一玩家并发两笔采集 | 锁 `players` 行 | 串行执行，都成功（若冷却允许） |
| 同一玩家并发买同一货物，库存 1 | 库存条件更新 | 一个成功，一个 `out_of_stock` |
| 两玩家互相转账（未来功能） | 按 `player_id` 排序加锁 | 不死锁 |
| 幂等键重复 | `UNIQUE` 约束 | 第二次读回首次结果 |
| 序列化失败（SERIALIZABLE） | 捕获 `40001` | 重试 2 次（20/60ms） |

隔离级别：账本写 `READ COMMITTED` + 条件更新即可；涉及「跨行不变量」时才用 `SERIALIZABLE`。

---

## 5. 对账

### 5.1 每小时任务

```sql
-- A. 每笔交易必须平衡
SELECT transaction_id, SUM(delta) AS total
  FROM ledger_entries
 WHERE created_at >= now() - interval '2 hours'
 GROUP BY transaction_id
HAVING SUM(delta) <> 0;

-- B. 物化余额 = 账本累计
SELECT w.player_id, w.resource_code, w.balance, COALESCE(SUM(e.delta), 0) AS ledger
  FROM wallets w
  LEFT JOIN ledger_entries e
         ON e.wallet_id = w.player_id AND e.resource_code = w.resource_code
 GROUP BY 1,2,3
HAVING w.balance <> COALESCE(SUM(e.delta), 0);
```

### 5.2 偏差处置（P1 事故）

```
1. 立即告警（电话）+ 冻结该玩家写：UPDATE players SET locked_reason='ledger_mismatch'
2. 导出该玩家全部分录（按 created_at 排序）与钱包当前值
3. 定位：并发 bug / 迁移导入 / 手工改库 / 分区丢失
4. 修复代码或数据
5. 用 correction 交易调平（不改历史）
6. 解冻，记录到事故库
```

**禁止**：`UPDATE wallets SET balance = ...` 直接修——会永久破坏可审计性。

---

## 6. 业务侧接入规范

| 动作 | 必须做的事 |
|---|---|
| 任何产出 | 先算收益（domain 纯函数）→ `post_transaction(kind=...)` |
| 任何消耗 | 先算成本 → 条件更新失败即返回 `insufficient_funds` |
| 任何奖励 | 幂等键 = 业务主键（`contract_id`/`session_id`/`siege_id`） |
| 任何「补偿/退款」 | `kind='correction'` + `ref_id=原 tx` |
| 任何「按时间产出」 | 结算区间 = `[last_settled_at, now]`，封顶后**丢弃**超出部分 |

---

## 7. 迁移导入（v3 存档）

| 步骤 | 规则 |
|---|---|
| 入口 | `POST /migrations/local-save`，每账号一次（`migration_keys UNIQUE(account_id)`） |
| 校验 | 12 种资源齐全；单值 ≤ 该等级理论上限；总量 ≤ 上限总和 |
| 写入 | 每种资源一对分录；超出上限部分记录 `discarded` |
| 审计 | 文件 SHA-256 + 导入前后余额 |
| 失败 | 整笔回滚；已存在的导入不允许覆盖（需人工） |

理论上限（示例，随 `game_config` 调整）：`antimatter ≤ storage × 10`，稀有资源 ≤ 9999。

---

## 8. 错误矩阵

| 错误 | HTTP | code | 客户端行为 |
|---|---|---|---|
| 余额不足 | 409 | `insufficient_funds` | 提示，不重试 |
| 库存不足 | 409 | `out_of_stock` | 刷新行情 |
| 幂等键冲突（不同请求） | 409 | `idempotency_conflict` | 提示重试 |
| 幂等重放（同请求） | 200 | — | 当成功 |
| 数据库不可用 | 503 | `storage_offline` | 稍后重试 |
| 序列化失败（重试耗尽） | 503 | `transaction_retry_exhausted` | 提示重试 |
| 玩家被冻结 | 423 | `player_locked` | 提示联系客服 |

---

## 9. 测试用例（必须全部有）

```text
T1  余额 10 扣 20 → 409，无分录落库，余额仍 10
T2  同一幂等键并发 50 次 → 1 笔 tx，49 次重放，余额只扣一次
T3  采集 1000 次随机 → 每种资源余额 = 初始 + Σdelta（对账 0）
T4  两笔交易反序资源（A: [AM,QA] / B: [QA,AM]）并发 → 无死锁
T5  迁移导入超上限 → 超出部分不进分录，审计有 discarded
T6  correction 交易后 → 对账 0，历史 tx 未被修改
T7  UPDATE ledger_entries → 数据库拒绝（权限）
T8  分区缺失（删掉下月分区）→ 插入报错，任务告警
T9  停库 10 秒 → 请求 503，恢复后无脏数据
T10 玩家冻结后 → 423，读取仍可用
```

---

## 10. 报表口径（避免各系统各算各的）

| 指标 | 口径 |
|---|---|
| 日产出 | `SUM(delta) WHERE wallet_id IS NOT NULL AND delta > 0 GROUP BY date, resource` |
| 日消耗 | 同上 `delta < 0` |
| 通胀率 | (产出 − 消耗) / 期初总量 |
| 人均余额 | 按 `wallets` 直接聚合 |
| 异常收益 | 单玩家单日产出 > 99 分位 × 3 |

报表**只读副本**执行，禁止在主库跑全表聚合。

---

## 11. 验收清单

- [ ] 每种 `kind` 都有分录模板与测试
- [ ] 所有写路径经 `post_transaction`（CI 检查禁止直写 `wallets`）
- [ ] 对账连续 7 天为 0
- [ ] 冻结/解冻流程演练过
- [ ] 补偿交易可追溯到原 tx
- [ ] 报表口径与 `tools/balance_report.py` 一致

## 12. 相关文档

- 表结构：[04-data-model.md](04-data-model.md)
- 并发与幂等：[06-time-and-concurrency.md](06-time-and-concurrency.md)
- 计算口径：[09-server-compute.md](09-server-compute.md)
