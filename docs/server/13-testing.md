# 13 · 测试策略（详细设计）

> 对应主文档 §17。本篇给出：测试矩阵与数量目标、fixture 设计、单元/集成/迁移/属性/并发/契约/压测/混沌/前端对拍的具体做法与阈值、CI 门禁、flaky 政策。

---

## 1. 测试矩阵

| 层 | 占比 | 数量目标 | 覆盖对象 | 运行时长 |
|---|---|---|---|---|
| 单元 | 60% | ~400 | domain 纯函数（收益/成本/冷却/战斗/攻城） | < 30s |
| 集成 | 25% | ~120 | repo、事务、锁、迁移、RLS | < 5min |
| 契约 | 10% | ~40 | OpenAPI、事件 schema | < 1min |
| 端到端 | 5% | ~20 | 登录→采集→交易→领奖 | < 2min |
| 压测/混沌 | 独立 | 6 场景 | 稳态/峰值/故障注入 | 手动 |

覆盖率门槛：domain ≥ 85%，repo ≥ 60%，整体 ≥ 75%（低于则 CI 失败）。

---

## 2. Fixture

```python
@pytest.fixture
def pg():
    with PostgresContainer("postgres:15") as pg:
        run_migrations(pg.dsn())
        yield pg

@pytest.fixture
def conn(pg):
    c = pg.connect()
    c.execute("BEGIN")
    yield c                      # 测试内任意写
    c.execute("ROLLBACK")        # 每个测试回滚，库不变

@pytest.fixture
def clock():
    class C:
        now = datetime(2026,10,25,0,0,tzinfo=timezone.utc)
        def __call__(self): return self.now
        def advance(self, **kw): self.now += timedelta(**kw)
    return C()

@pytest.fixture
def player(conn):
    return make_player(conn, universe="test", tz="Asia/Shanghai")
```

规则：时间、随机、UUID 全部注入；测试间不共享状态；禁止 `sleep`。

---

## 3. 单元测试（domain）

```python
def test_collect_diminishing():
    assert reward(base=48, count=1) == 48
    assert reward(base=48, count=4) == 40      # ×0.85 → 40.8 → floor 40
    assert reward(base=48, count=9) == 19      # ×0.40 → 19.2
    assert reward(base=48, count=50) == 19     # 下限 0.40

def test_scan_cooldown_floor():
    assert cooldown(scan_lv=999, station=25, tech=20) == 30_000   # 下限 30s

def test_refit_cost_curve():
    assert cost("scanArray", 1) == 162        # 120×1.35
    assert cost("scanArray", 2) == 219        # 162×1.35 → 218.7

def test_siege_deterministic():
    a = simulate(seed=42, snapshots=FIXTURE)
    b = simulate(seed=42, snapshots=FIXTURE)
    assert a == b                              # 同输入必然同输出
```

每个公式至少一条「固定输入 → 固定期望值」测试（数值来自 [09](09-server-compute.md) 的算例）。

---

## 4. 集成测试

| 用例 | 断言 |
|---|---|
| 条件扣款 | 余额 10 扣 20 → 0 行受影响、无分录、余额 10 |
| 幂等并发 | 50 并发同键 → 1 笔 tx、49 重放 |
| 冷却并发 | 20 并发同行星扫描 → 1 成功、19 429 |
| 锁顺序 | 反序资源并发 → 无 `40P01` |
| 事务回滚 | 中途抛错 → 钱包/账本/审计均无变化 |
| 越权 | A 令牌读 B 行星 → 404 且写审计 |
| RLS | 未设 `app.player_id` → `wallets` 查询 0 行 |

```python
def test_concurrent_collect(conn, player, threads=20):
    results = run_parallel(lambda: collect(conn, player, KEY))
    assert results.count("ok") == 1
    assert ledger_count(conn, player) == 1
```

---

## 5. 迁移测试

```
1. 空库 → upgrade head：所有表/索引/权限存在
2. upgrade head → downgrade base → upgrade head：通过
3. 播种跑两次：行数不翻倍
4. schema 快照：pg_dump --schema-only 与仓库快照 diff 为空
5. 大表：100 万行样本上 CREATE INDEX CONCURRENTLY 不阻塞写入（耗时记录）
```

---

## 6. 属性测试（经济不变量）

```python
@given(acts=st.lists(st.sampled_from(ACTIONS), min_size=1, max_size=200))
def test_economy(acts):
    run(acts)
    assert all_balances_non_negative()
    assert every_tx_balances()                  # Σdelta == 0
    assert wallets_equal_ledger()               # 物化 == 账本
    assert no_duplicate_reward()                # 唯一约束生效
    assert cooldowns_monotonic()                # ready_at 不回退
```

1000 组 × 200 步作为发版门禁；失败时输出最小复现序列。

---

## 7. 契约测试

1. OpenAPI 生成 → `schemathesis` 跑每个端点（合法/边界/非法）。
2. Kafka 事件 schema 兼容性：新增字段允许、删改字段失败。
3. 前端 mock server 由 OpenAPI 生成，联调不依赖后端。

---

## 8. 压测（k6）

| 场景 | 参数 | 通过标准 |
|---|---|---|
| 稳态 | 300 RPS × 10min，读写 7:3 | p95 < 120ms，5xx < 0.1% |
| 峰值 | 10min 爬升至 600 RPS | 不雪崩，恢复 < 2min |
| 尖峰 | 0→500 RPS 瞬时 | 限流生效，无 OOM |
| 长稳 | 50 RPS × 2h | 内存/连接池平稳 |
| 攻城结算 | 10k 场集中 1h | p95 < 300ms，无死锁 |
| 行星读取 | 500 并发随机 | p95 < 20ms |

脚本纳入仓库，结果存 `docs/ops/load-YYYYMM.md`。

---

## 9. 混沌

| 注入 | 期望 |
|---|---|
| 杀 Redis | 写可用、限流降级、恢复自动 |
| 暂停 PG 10s | 快速 503，不堆积 |
| 杀 worker | outbox 积压不丢，恢复清空 |
| 断跨区网络 | 本区正常，跨区降级提示 |
| 磁盘写满 | 归档告警，主库不崩 |

每次混沌后必须核对：账本偏差 0、无重复奖励。

---

## 10. 前端对拍

`tools/parity/compare.py --cases 10000`：

- 输入：`planet_key × type × scans × levels × timezone`
- 输出：JS 与 Python 的 JSON，`diff` 必须为空
- 差异案例进 `tests/parity/fixtures/`
- 前端 `npm run test:frontend`（33 项）继续跑，验证预览值一致性

---

## 11. CI 门禁

```
1. lint（ruff/black/eslint）
2. 单元（< 30s）
3. 集成（testcontainers）
4. 迁移 up/down/up + schema diff
5. 属性测试 1000 组
6. OpenAPI breaking 检测
7. 前端 tsc + test:frontend + build
8. 镜像构建 + 依赖漏洞扫描
```

任一步失败禁止合并；跳过需注明原因与负责人。

---

## 12. Flaky 政策

1. 出现 flaky 当周必须定位（记录 `issue` 与 owner）。
2. 不得用 `skip` 掩盖；必要时单独任务运行并告警。
3. 禁止依赖执行顺序或共享状态。

---

## 13. 验收

- [ ] domain 覆盖 ≥ 85%，关键路径 100%
- [ ] 属性测试 1000 组全绿
- [ ] 迁移三步通过、schema 无意外 diff
- [ ] 并发 6 类用例全绿
- [ ] k6 稳态/峰值达标
- [ ] 混沌 5 项通过且对账 0
- [ ] 对拍 10k 组 100% 一致
- [ ] 无长期 skip 的 flaky

## 14. 相关文档

- 计算口径与算例：[09-server-compute.md](09-server-compute.md)
- 账本不变量：[05-economy-ledger.md](05-economy-ledger.md)
- 灰度验收：[14-migration-rollout.md](14-migration-rollout.md)
