# 03 · 后端

> 基线（2026-11-02）：**26 蓝图 / 255 端点 / 14 模块 / 34 个定时任务 / 50 个迁移文件**<!--fact:api.blueprints=26--> <!--fact:api.endpoints=255--> <!--fact:modules.count=14--> <!--fact:jobs.count=34--> <!--fact:migrations.count=50-->，
> 契约、边界、迁移链全部一致。结构没问题，**问题是「错了没人知道」**。

---

## 1. 7 条历史越界清零（P1）

`scripts/boundaries_baseline.json` 冻结了 7 条跨模块写。冻结的意思是「不阻断」，不是「不用修」：

| 越界 | 现状 | 修法 | 难度 |
|---|---|---|---|
| `repo/banks.py` → `economic_actors` | 冻结/解冻 actor 时直接 UPDATE | 走 `currency_service.set_actor_status()` | 低 |
| `repo/companies.py` → `economic_actors` | 同上 | 同上（两个调用点合并） | 低 |
| `repo/ai.py` → `feature_flags` | AI 开关直接写平台表 | 走 `cutover.set_flag()` | 低 |
| `repo/stocks.py` → `securities_lending` | 借券写的是 broker 的表 | `broker_service.lend()` 提供入口 | 中 |
| `repo/ships.py` → `player_flags` | 船体/护盾标记 | 平台提供 `player_flags.set()` | 低 |
| `domain/ai_economy.py` → `players` | AI 玩家初始化 | 初始化脚本单列，不进运行时 | 中 |
| `domain/ai_economy.py` → `council_seats` | 同上 | 同上 | 中 |

**顺序**：先做 4 个「低」（半天到一天），再处理 3 个「中」。
**判据**：`scripts/boundaries_baseline.json` 内容为空数组，`check_boundaries.py` 仍退出 0。
**验证**：`python scripts/check_boundaries.py` 输出 `[info] 0 known violation(s)`。
**注意**：每修一条就把基线里的那条删掉——**基线只会变短**，这条规则本身要写进 CI 注释。

---

## 2. 34 个定时任务的可靠性（P1）

现在每个 job 都写 `job_runs` 审计，但缺三件事：

| 缺口 | 后果 | 做法 |
|---|---|---|
| **失败没人知道** | `stock_call_auction_tick` 挂一天，IPO 就永远开不了盘 | `/health/jobs` 返回每个 job 的 `last_ok_at` / `last_error` / 连续失败次数；超过 N 次暴露为非 200 |
| **错过窗口无补偿** | 进程重启跨过 `bank_interest_tick` 的 24h 窗口，当天不结息 | 记 `last_run_at`，启动时补跑一次并标记 `catch_up: true` |
| **执行时间无上限** | 一个大表全扫的 `reconcile_*` 拖住整个 beat | 每个 job 记 `duration_ms`，超阈值打 warning；`/metrics` 里出直方图 |

**判据**
- `/health/jobs` 存在，返回 34 条记录，任一 job 连续失败 3 次 → 该端点返回 503；
- `job_runs` 表新增 `catch_up` 标记，重启后有补偿记录；
- `/metrics` 里每个 job 有 `atlas_job_duration_ms`。

**验证**：手动 kill 一个 job 的执行（或注入异常），确认 503 + 告警路径。

---

## 3. 迁移：可逆、可测、可回滚（P1–P2）

50 个迁移，全部是「向上加」。风险点：

| 风险 | 现状 | 建议 |
|---|---|---|
| `downgrade()` 是空实现或 `pass` | 回滚只能靠恢复备份 | 至少对**本批**新迁移写真实 downgrade；老迁移标注「不可逆」 |
| 大表 DDL 锁 | `ALTER TABLE stock_candles` 这类会锁表 | 迁移前跑一次「预计行数 + 锁级别」检查，超过阈值要求人工确认 |
| 迁移耗时未知 | `migrate` 在部署时同步跑 | CI 里对空库 + 有数据快照各跑一次，记录耗时 |
| 版本不匹配的自检 | `/health/ready` 已有 `expected_revision` | 保留，且**部署脚本必须先 migrate 再切流量** |

**判据**：`python -m server.cli migrate` 在「0140 库 + 空库」两种起点都能到 head；
`downgrade -1 → upgrade` 对本批迁移可用；CI 记录每次迁移耗时。

---

## 4. 指标与告警（P1）

**已有**：`server/infra/metrics.py` + `GET /metrics`（Prometheus 文本格式）+ `infra/logging.py`。
**缺**：谁来消费它。

**建议的最小组合**
1. `docker-compose.server.yml` 加 `prometheus` + `grafana` 两个服务（复用现有 compose）；
2. 三个面板：**撮合**（成交笔数/延迟/撤单率）、**账本**（`reconcile_ledger` 差异数）、**job**（成功/失败/耗时）；
3. 四条告警：`reconcile` 差异 ≠ 0、job 连续失败 3 次、`/health/deep` 非 200 持续 5 分钟、2PC 租约接管次数突增。

**判据**：账本不平（人为造一笔）能在 1 分钟内触发告警。
**为什么值得做**：`reconcile_ledger` / `reconcile_currency` 这两个 job 已经在跑，**差异数现在只写日志，没人看**——
这是经济系统最重要的一条防线，接个面板成本极低。

---

## 5. 并发控制覆盖度（P2）

**现状**：`If-Match` 只对 7 条「读改写」危险路由启用，无 header 时放行（渐进启用）；
101 个写操作有 pydantic schema，0 个手工校验（这是好事）。

**问题**：剩下的写端点里，「先读后写」但不是 7 条的（如部分 admin / council 操作）仍有丢失更新窗口。

**做法**：不改行为，先**枚举**——把所有「事务内先 SELECT 再 UPDATE 同一行」的端点列出来，
标「已有 If-Match / 有行锁 / 无保护」三档，放进 `docs/api/concurrency.md`。
**判据**：清单覆盖率 100%（255 个端点逐个归类），标「无保护」的每一条都要有理由（如纯追加写）。

---

## 6. 经济平衡回归（P2）

**已有**：`docs/cosmic-economy/sim/simulate.py`（stdlib，三场景 PASS）+ `simulation_metrics.json`。

**问题**：模拟器跑的是**合成数据**，真实库里跑久了会出现模拟器看不到的漂移（分账比例、指数权重、持仓集中度）。

**做法**
1. 每周从生产库导一份脱敏快照，跑 `simulate.py` 的指标计算，与 `simulation_metrics.json` 的基线比；
2. 关键指标设阈值：基尼系数、单一标的持仓占比、手续费分账比例偏差、`insurance_fund` 支出率；
3. 超过阈值出报告，**不自动干预**（经济系统不该有自动调节器，除非设计上要求）。

**判据**：`docs/optimization/metrics-baseline.md` 存在，含 5 个指标的当前值与阈值；
每月有一份对比记录。

---

## 7. 查询性能（P2，原 T-08）

**现状**：列表端点 SQL 次数没有约束。`database_stats` 有没有先不看——
**最简单的一步先做**：dev 环境加一个请求级 SQL 计数中间件，返回头里带 `X-DB-Queries: N`，
超过 5 打 warning 并记 `metrics.observe`。

**判据**：6 个主面板的首屏请求，`X-DB-Queries` 全部 ≤ 5；超标的端点进 TASK-BACKLOG 逐条优化。

---

## 8. 能力上限（P3，明确写在最后）

| 项 | 现状 | 前置条件 |
|---|---|---|
| 真实多库 2PC | 单库单参与者 no-op | 先把 `dt_*` 日志与租约做故障注入演练（不改多库） |
| 真实 LLM 网关 | `ai_decision_providers` 默认 `disabled`，确定性 provider 可回放 | 先在 `shadow` 档跑一周，比对 deterministic 决策差异率 |
| 银行牌照 / 评估权 / 相关性检测 | 未做（T-11 / T-20 / T-25） | 属功能，见 TASK-BACKLOG，不在本文档 |

**判据（LLM）**：`shadow` 档连续 7 天，`ai_decisions` 里 provider=llm 的比例、超时率、回退率有数据，
且**没有**任何一次 llm 决策直接落了资金动作。
