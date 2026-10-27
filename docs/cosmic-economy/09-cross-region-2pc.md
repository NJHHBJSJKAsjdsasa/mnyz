# 09 · 跨区 2PC

> 分册：跨区事务  
> 关联：[00-architecture-and-actors.md](00-architecture-and-actors.md)、[08-company-law-bankruptcy.md](08-company-law-bankruptcy.md)

---

## 1. 范围与边界

### 1.1 目标

为跨区/分库的经济事务提供**两阶段提交（2PC）**：

- 跨区货币转账/兑换；
- 跨区股票/产权交割；
- 跨区法院冻结/划扣；
- 银行/公司跨区资产转移。

### 1.2 非目标

- 真实法币/加密资产；
- 毫秒级高频撮合；
- 用 2PC 承载所有通知/K 线/索引（这些走 outbox/saga）。

---

## 2. 拓扑与数据归属

```text
Region A（玩家/银行/产权）     Region B（股票/公司/法院）
        │                               │
        └────────── Coordinator ────────┘
                       │
                 transaction log
```

- 每个 actor 有 home region；
- 货币账户按 actor home region 分片；
- 股票撮合在 listing home region；
- 产权登记在资产 home region；
- 法院在管辖 region；
- Coordinator 全局，负责 2PC 决策。

### 2.1 Coordinator 设计

- 服务名 `dt-coordinator`，3 副本；
- 状态存全局控制库（PostgreSQL），服务本身无状态；
- 每笔事务有一个 **owner coordinator**：默认交易发起区，故障时切换；
- `distributed_transactions` 行上有 `coordinator_id` + `lease_until`；
- 副本每 1s 续租，租约 3s；租约过期可被其他副本接管；
- 接管流程：读事务日志 → 判断 `PREPARED/COMMITTING` → 继续 commit/abort；
- Coordinator 只做决策，不执行业务；业务由 participant 的 domain service 执行；
- Coordinator 不调用外部网络/LLM；
- 多活区：控制库跨区同步，写主在控制区；灾备切换需人工确认。

```text
dt_coordinator_lease
  tx_id uuid pk
  coordinator_id text
  region text
  lease_until timestamptz
```

### 2.2 单库阶段

当前单库：

- 先落 `distributed_transactions` / `dt_participants` 表和协调器接口；
- 单库事务直接 commit，2PC 逻辑作为 no-op/单参与者；
- 分库后切换为真实 2PC，不改业务调用方。

---

## 3. 协议

### 3.1 状态机

```text
INIT
 → PREPARING
 → PREPARED (all yes) → COMMITTING → COMMITTED
 → ABORTING → ABORTED
任何阶段失败 → ABORTING
超时 → 由协调器恢复决定
```

### 3.2 流程

1. Coordinator 生成 `tx_id`，写 `INIT`；
2. 向各 participant 发 `prepare`：
   - 锁定账户/资产/订单；
   - 校验余额/许可/幂等；
   - 写 undo/redo 日志；
   - 返回 `yes/no`；
3. 全部 yes → 写 `COMMITTING`，发 `commit`；
4. 任一 no/超时 → 写 `ABORTING`，发 `abort`；
5. Participant 执行 commit/abort，写结果；
6. Coordinator 收齐/超时后标记 `COMMITTED/ABORTED`；
7. 清理锁，写 outbox。

### 3.3 幂等

- `tx_id` 全局唯一；
- Participant 以 `(tx_id, participant_id)` 幂等；
- 重复 commit 返回上次结果；
- 客户端 `Idempotency-Key` 映射到 `tx_id`；
- 决策日志只追加。

### 3.4 超时与恢复

- **总预算 5s**：`prepare 2s + commit 2s + 1s 缓冲`；
- 超过 5s 未完成 prepare → abort；**首版拒绝 >5s 的跨区事务**；
- 已经发出 commit 后超时，不能回滚，只能重试；
- Coordinator 崩溃：恢复 job 扫描 `PREPARING/PREPARED/COMMITTING`；
- Participant 崩溃：重启后按日志重放；
- 网络分区：Coordinator 只能重试，不能假设失败；
- 启发式决策（heuristic）只允许人工/运维介入，写入审计；
- 长时间阻塞：告警 + 只读/暂停相关市场。

### 3.5 unknown 事务 SLA

```text
0s      开始；deadline = now + 5s
2s      prepare 未完成 → abort
5s      预算耗尽；若已 commit 决策则进入重试，否则 abort
8s      协调器仍无法判定 → 标记 unknown
10s     P1 告警；冻结相关账户/资产；禁止新交易
1min    自动对账任务启动
15min   值班工程师介入（SLA）
1h      人工给出 commit/abort/补偿决定（SLA）
4h      未解决 → 升级到经济系统负责人 + 公告
```

- `unknown` 不是终态；不允许长期停留；
- 冻结只影响相关 actor/资产，不影响全市场；
- 人工决定需双人复核；
- 客户补偿/退款由 CCMC/央行按规则处理；
- 每笔 unknown 写事故报告。

### 3.6 拒绝规则

- 预估跨区延迟 >5s → 下单/转账前直接拒绝；
- 参与区不可用 → 拒绝，不进入 prepare；
- 锁等待 >1s → 放弃该参与者；
- 大额/复杂交易拆成多个 ≤5s 子事务，不允许超时提交。

---

## 4. 数据模型

```text
distributed_transactions
  id uuid pk
  kind text
  status text check ('init','preparing','prepared','committing','committed','aborting','aborted','unknown')
  coordinator_id text
  coordinator_region text
  origin_region text
  payload jsonb
  fee_bps integer default 0
  fee_amount numeric(30,4) default 0
  created_at
  decided_at
  deadline_at

dt_participants
  tx_id uuid
  participant_id text
  region text
  status text check ('pending','prepared','committed','aborted','failed')
  prepared_at
  committed_at
  last_error text
  primary key (tx_id, participant_id)

dt_decisions
  id bigserial
  tx_id uuid
  decision text check ('commit','abort','heuristic_commit','heuristic_abort')
  reason text
  decided_by text
  created_at

dt_outbox
  id bigserial
  tx_id uuid
  event_type text
  payload jsonb
  published_at
```

---

## 5. 隔离与锁

- prepare 阶段锁定：
  - 货币账户行；
  - 股票持仓/订单；
  - 产权 deed；
  - 法院/破产冻结：先锁 `court_cases/insolvency_cases` header，再按 `(case_id, asset_id)` 锁 `asset_freezes` 行；
- 锁顺序：严格按 [00 §4.4](00-architecture-and-actors.md#44-全局锁顺序)，即 actor → currency → bank → listing → order → asset → escrow → court；
- 锁持有时间目标 < 3s；
- 隔离级别 READ COMMITTED；
- 不允许在 2PC 中做外部网络调用；
- 大事务拆分为多个小 2PC/saga。

---

## 6. 2PC vs Saga

| 场景 | 方案 |
|---|---|
| 货币转账 | 2PC |
| 股票/现金交割 | 2PC |
| 产权/现金交割 | 2PC |
| 法院冻结跨区资产 | 2PC + 法院命令 |
| K 线/指数/公告 | outbox + saga |
| 邮件/通知 | saga |
| 银行利息批量 | 单区批处理 + outbox |

- 2PC 只保证核心资产原子；
- 非核心副作用最终一致；
- 不允许用 saga 替代资金/产权原子性。

---

## 7. 失败矩阵

| 故障 | 处理 |
|---|---|
| Participant prepare 失败 | abort 全部 |
| Coordinator 在 prepare 后崩溃 | 恢复 job 读日志，继续 commit/abort |
| Participant commit 后崩溃 | 重启按日志确认；重复 commit 幂等 |
| Commit 阶段网络分区 | 重试；不可回滚已 commit participant |
| 超时未知 | 标记 `unknown`，人工/自动对账；禁止新交易 |
| 重复客户端请求 | 幂等键返回同一结果 |
| 锁超时 | abort，释放锁 |

---

## 7A. 跨区手续费与延迟定价

### 手续费

```text
fee_bps = base_fee(region_pair) + risk_premium(asset_class)
         + congestion_premium(current_2pc_load)
clamp(fee_bps, 5, 30)          -- 0.05% - 0.30%
fee = notional × fee_bps / 10000
```

- 由买方/发起方承担；
- 报价/下单前展示 all-in：价格 + 手续费 + 税；
- 成交后手续费分账：
  - 40% Coordinator/控制区；
  - 30% 发起区；
  - 20% 资产所在区；
  - 10% 保险/对账基金；
- 事务 abort → 手续费全额退回；commit 后不退；
- 费率公开，不针对 AI/真人差异定价。

### 延迟

- 跨区交易标记 `settlement_class='cross_region'`；
- 市场做市商对跨区订单使用更宽点差（公开报价）；
- 不人为注入延迟；延迟来自真实网络/2PC；
- 总预算 5s；超过则拒绝，不允许“付费插队”；
- 跨区费用/延迟不改变 T+0/T+1 的 listing 规则，只增加结算成本；
- 大额跨区交易可拆单，每笔 ≤5s。

### 数据

- `distributed_transactions.fee_bps/fee_amount/origin_region`；
- 报价接口返回 `cross_region_fee` 与 `estimated_settlement_ms`；
- 前端必须展示，不得隐藏。

---

## 8. 跨区司法/产权

- 法院判决/冻结：Coordinator 发起 2PC，参与者为资产所在区；
- 破产管理人跨区保全：先 2PC 冻结，再走处置；
- 产权交割：资产区 + 货币区 + 登记区；
- 判决承认：`court_recognition` 成功后，执行阶段才 2PC 划扣。

---

## 9. API/内部接口

```text
POST /internal/dt/begin
POST /internal/dt/{tx}/prepare
POST /internal/dt/{tx}/commit
POST /internal/dt/{tx}/abort
GET  /internal/dt/{tx}
```

- 仅内网/服务间认证；
- 不暴露公网；
- 管理端只读/人工决策需双人审批。

---

## 10. 监控

- 2PC 成功率/延迟/阻塞数；
- `unknown` 事务数（必须 0 或人工清零）；
- prepare 锁等待；
- 对账差异；
- 告警：>5s 未决、>3 次重试、unknown。

---

## 11. 测试

- 正常 commit/abort；
- Coordinator 崩溃/租约接管；
- Participant 崩溃恢复；
- commit 阶段网络分区；
- 重复 commit/abort；
- 总预算 5s 拒绝；
- unknown SLA/冻结/人工决策；
- 手续费分账/abort 退款；
- 并发锁顺序/死锁；
- 跨区股票/产权/法院冻结；
- 混沌测试（chaos）。

---

## 12. 分库迁移路径

1. 单库：建表/接口，单参与者 no-op；
2. 读写分离：仍单库事务；
3. 按域拆库：货币/股票/产权独立；
4. 开启 2PC：跨区交易走协调器；
5. 混沌/对账稳定后全量。

---

## 13. 已定设计

### 13.1 区域对基础费率

| 区域关系 | base_fee_bps |
|---|---|
| 同区 | 0（不收跨区费） |
| 相邻区 | 5 |
| 跨区 | 10 |
| 远端区 | 20 |
| 特殊/高风险区 | 25 |

```text
fee_bps = base_fee(region_pair)
        + risk_premium(asset_class)
        + congestion_premium
clamp(fee_bps, 0, 30)
```

- `risk_premium`：普通资产 0，股票/产权 2，法院冻结/高风险 5；
- 同区不受 5bp 下限；
- 费率表由控制区维护，变更提前 7 天公告。

### 13.2 拥堵溢价

```text
utilization = pending_2pc / capacity
congestion_premium =
  0                         if utilization <= 0.5
  ceil(10 × utilization²)   if utilization > 0.5
```

- 单位 bp；上限 10；
- `capacity` 按 Coordinator 副本/区域配置；
- 拥堵下降后 1 分钟内恢复；
- 不用于“付费插队”，只补偿系统成本。

### 13.3 手续费分账

- 40% Coordinator/控制区；
- 30% 发起区；
- 20% 资产所在区；
- 10% 保险/对账基金；
- 分账在 commit 后同事务写 outbox；
- abort 全额退回，分账不执行。

### 13.4 Coordinator 灾备演练

- 控制库跨区同步，RPO=0；
- Coordinator 故障接管 RTO ≤5 分钟；
- 每季度全链路演练：主库切换、租约接管、未决事务恢复；
- 每月混沌：副本 kill/网络分区/时钟漂移；
- 演练报告/问题清单归档；
- 未通过演练不得开启新区域 2PC。

### 13.5 延迟展示

- 报价返回 `estimated_settlement_ms`；
- 5s 上限；超过拒绝；
- 做市商对跨区订单可加宽点差，但必须公开；
- 不隐藏费用/延迟，不按 AI/真人差异定价。
