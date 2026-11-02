# 12 · 后端清单（第二遍：服务端自身完整性）

> 直接回答「写完了吗」：**没有。**
> 前面两遍是**从外部需求倒推**（[10](10-backend-requirements.md) 前端需要什么接口、[11](11-server-authority.md) 裁决权该放哪）。
> 这一遍换成**从服务端内部往外看**：抛开前端，这套后端自己还有哪些洞。
> 还差第四遍「运营视角」，本文 §5 只列范围，没写细。

---

## 1. 先纠错：我上一遍说错了 3 条

写文档最怕留错账，先自己认。

| # | 我上次说 | 实测 | 结论 |
|---|---|---|---|
| 1 | 「幂等表会无限增长」 | `server/jobs/tasks.py:65 cleanup()` 已清：幂等键 24h、outbox 7d、登录尝试 30d | **我错了**，机制健全 |
| 2 | 「429 缺 `Retry-After`」 | `errors.py:145` 的 `RateLimited(retry_after_ms)` 会把 `retry_after_ms` 放进 **响应体**；成功响应还有 `RateLimit-Limit/Remaining/Reset` 三个头 | **半错**：数据有，缺的是 **HTTP 头 `Retry-After`**（浏览器/网关只认头，不认 body） |
| 3 | 「可观测性缺失」 | `server/infra/metrics.py` + `GET /metrics` + `X-Request-Id` + 结构化 `log_event` + 两个指标（请求数/耗时，带 route 标签） | **我错了**，基础可观测性在 |

> 为什么重要：这三条如果被当成任务派下去，会白干 1–2 天。**先删假任务，再谈真任务。**

---

## 2. 这一遍新发现的（按证据强度排）

### A. 证券正确性：分红没有除权

| 项 | 内容 |
|---|---|
| 现象 | `stock_service` 的分红流程只做"现金入账 + 记录"，**没有调整 `prev_close` / 参考价** |
| 证据 | `grep -n "prev_close\|除权" server/domain/stock_service.py` 在分红相关函数里 0 命中；<br>对比：拆股（0124）会同时改 `last_price/prev_close/holders.avg_cost/candles`，分红不会 |
| 后果 | ① 分红后股价不下跌 → **总市值凭空增加**；② 指数（`market_index`）把分红当"上涨"，长期虚增；③ K 线出现"无缺口"的假象，技术指标失真 |
| 建议 | 除息日把 `prev_close` 下调 `每股分红`（`prev_close -= dps`），并让 `adjustment-factors` 覆盖分红事件（现在只覆盖拆股） |
| 优先级 | **P1**（不是 P2：它在污染指数，而指数是玩家判断市场的唯一公共信号） |
| 工作量 | 1 天 |

### B. 安全响应头一个都没有

| 项 | 内容 |
|---|---|
| 现象 | 只有 CORS（`__init__.py:129`）和 `X-Request-Id`、`Cache-Control: no-store` |
| 证据 | `grep -rn "Content-Security-Policy\|X-Content-Type-Options\|Referrer-Policy\|X-Frame-Options\|Strict-Transport-Security" server/ pymodules/` = **0 命中** |
| 后果 | ① 无 CSP → XSS 一旦注入，能读 token（token 存在 localStorage）；② 无 `X-Content-Type-Options` → MIME 嗅探；③ 无 `X-Frame-Options` → 可被内嵌钓鱼 |
| 建议 | `after_request` 里统一加 4 个头；CSP 从 `default-src 'self'` 起，逐步放开 inline（Vite dev 需 `'unsafe-inline'` 例外） |
| 优先级 | **P1**（成本极低，收益高） |
| 工作量 | 0.3 天 |

### C. 211 个端点没有机器可读 schema —— 🟡 大部分已闭合（2026-10-28 15:5x）

> **现状**：`scripts/gen_api_docs.py` 已产出 `docs/api/endpoints.md` + `docs/api/openapi.json`
> （**OpenAPI 3.1 / 204 path / 218 operation / 81 schema**），`--check` 进 CI 防漂移（`server.yml` 的
> `boundaries` job）。
>
> **2026-10-28 阶段 6 补充（请求体覆盖已量化）**：生成器现在给每个写操作打 `x-atlas-body`，
> 并在 `x-atlas-coverage` 里给出统计 —— **138 个写操作：88 个有 pydantic schema、0 个手工校验、50 个确实无请求体**，
> 且 `unresolved` 必须为空（视图里 `parse_model(Typo)` 会被记为未解析并在 md 里标 **未解析**）。
> `LOOSE_BODY` 已清空（market 全部迁到 pydantic）。剩余缺口只有**响应 schema** 与前端手写类型。

| 项 | 内容 |
|---|---|
| 现象 | 无 OpenAPI / JSON Schema。前端契约靠 [07](07-frozen-contract.md) 手写维护 |
| 证据 | 原始实测 `grep -rli "openapi\|swagger" server/ pymodules/` = 0 命中（已被生成器取代） |
| 后果 | ① 我这份契约表就是"唯一真源"，但它靠人读代码维护 → 必然漂移（这一轮已经从 197 漂到 211）；② 前端 TS 类型全靠手写；③ 无法做响应快照测试 |
| 建议 | 利用已有的 `models/*.py` pydantic `StrictModel` 生成 OpenAPI（pydantic v2 自带 `model_json_schema()`），路由用装饰器登记响应模型。**不需要引入 Flask-RESTX** |
| 优先级 | P2（但对"接口不再漂移"是根治） |
| 工作量 | 原估 2 天；生成器已落，剩 **0.5 天**（补 body schema，先从 40 个高频端点做起） |

### D. 审计与死信有表，但运营看不到

| 项 | 内容 |
|---|---|
| 现象 | `audit_log`、`dlq_events`、`job_runs` 三张表都在（`0008_platform.py`），但**没有任何查询端点** |
| 证据 | 三张表只在写入侧出现；`grep "audit_log" server/api/` = 0 |
| 后果 | ① 出事故（多扣钱、判决异常）时无法自助排查；② 死信里的失败 job 没人知道；③ 玩家申诉「我没收到分红」时拿不出流水 |
| 建议 | `GET /admin/audit?actor=&kind=&since=`、`GET /admin/jobs/runs`、`GET /admin/dlq`（三个只读端点，`admin`/`ops` 专属） |
| 优先级 | P1（运维刚需，且只需读） |
| 工作量 | 1 天 |

### E. 停牌/复牌没有运营入口

| 项 | 内容 |
|---|---|
| 现象 | `repo/stocks.py:148 set_halt()` 存在，但只有两处调用：熔断（`stock_service:829/832`）与退市（`:1398`） |
| 证据 | 调停牌集合 `set_halt(conn, id, None, reason)` 只出现在退市 |
| 后果 | 交易所想手动停牌某只票（异常波动、调查中）只能直接改库 |
| 建议 | `POST /admin/stocks/<ticker>/halt {minutes, reason}` + `POST .../resume` |
| 优先级 | P2 |
| 工作量 | 0.3 天 |

### F. 危险操作缺服务端侧的"第二次确认"

| 项 | 内容 |
|---|---|
| 现象 | 拆股、判决执行、关系费、冻结等不可逆操作，**单次请求即执行**；"二次确认"只存在于前端 Modal |
| 证据 | 请求体里没有 `confirm` 字段，也没有一次性 token |
| 后果 | 脚本/重放/误触都能直接触发。前端弹窗对 API 调用者没有约束力 |
| 建议 | 对 6 个不可逆操作要求请求体带 `"confirm": "<对象id>"`（必须回显目标 id，避免点错人）或先取一次性 `confirm_token` |
| 优先级 | P2（防的是脚本误操作，不是恶意——恶意的防护靠权限） |
| 工作量 | 0.5 天 |

### G. 数据层：金额类型迁移与回归

| 项 | 内容 |
|---|---|
| 现状 | [10 §P1-4](10-backend-requirements.md) 已提"金额统一字符串"，但没提**怎么迁** |
| 补充 | 不能一把改：① 先加 `to_json()` 统一序列化层；② 按蓝图灰度（先 `stocks`，再 `bank`）；③ 每个蓝图加**响应快照测试**，diff 只允许"类型变化" |
| 工作量 | 原估 2 天 → **3 天**（含快照测试基建 1 天） |

### H. 性能：新接口会踩的坑

| 项 | 内容 |
|---|---|
| 现状 | [10 §P0-1](10-backend-requirements.md) 要求 `/stocks` 内联 `venues`，这是典型的 **N+1 陷阱** |
| 补充 | ① `stock_listings(exchange_id)`、`listing_venues(listing_id, exchange_id)` 需联合索引；② `/stocks` 一次 `WHERE listing_id = ANY($1)` 批量取；③ 加一条 CI 断言：列表端点 SQL 次数 ≤ 5 |
| 顺带 | `GET /state` 加 `wallet_summary` 后，它会被**每次进入面板**调用 → 必须走缓存或单次 CTE，不能变成 9 次查询 |
| 工作量 | 0.5 天（含索引迁移） |

---

## 3. 合并总表（10 + 11 + 12 一页看完）

| 批次 | 内容 | 来源 | 人日 |
|---|---|---|---:|
| **A 修 bug 级** | market 幂等缺失 · 做市忽略 ticker · 429 补 `Retry-After` 头 · 安全响应头 | 10 P1-1/P0-3/P1-6 + 12-B | 1.3 |
| **B 解阻塞** | 列表 venues · 交易所容量 · 分页 · `/state` 摘要 · 错误码清单 | 10 P0-1~5、P1-3 | 3.4 |
| **C 补裁决权** | `travel/quote|commit` · `GET /ship` · `in_flight` · 状态下沉 | 11 §4 | 5 |
| **D 一致性** | 金额/时间统一（含快照测试）· `If-Match` 统一 | 10 P1-2/P1-4 + 12-G | 5.5 |
| **E 正确性** | 分红除权 · 审计查询 · 运营停牌 · 危险操作 confirm | 12-A/D/E/F | 2.8 |
| **F 治理** | 事件流 · OpenAPI · 压测基线 · 备份演练 | 10 P1-5 + 12-C | 6.5 |
| **G 前端配套** | S1/S3 前端部分（只读化 + 预测层） | 11 §9 | 5 |
| 合计 | | | **≈ 29.5 人日** |

> 其中 **A+B+C = 9.7 人日**是"让前端不撒谎"的最小集合；
> D/E 是"让数字不出错"；F 是"让自己将来不加班"。

---

## 4. 建议的执行顺序（有依赖）

```
A（1.3d）──┬─→ B（3.4d）──┬─→ C（5d）──→ G（5d）
           │              │
           └──────────────┴─→ D（5.5d）──→ E（2.8d）──→ F（6.5d）
```

- **A 必须先做**：market 缺幂等是"正在流血"（重复拆股/重复扣牌照费）。
- **B 与 C 可并行**：B 是接口补字段，C 是新增裁决端点，互不依赖。
- **D 必须在 G 之前**：预测层要算 `~金额`，金额类型不统一会算错。
- **F 最后**：治理类不阻塞任何东西。

---

## 5. 还差第四遍：运营视角（我没写）

现在的 211 个端点几乎全是"玩家视角"。缺的是**你自己作为运营者**的能力：

| 能力 | 现状 | 需要什么 |
|---|---|---|
| 封号/解封 | `players.locked_reason` 有字段，无端点 | `POST /admin/players/<id>/lock|unlock` |
| 补偿发放（丢單/事故） | 无 | `POST /admin/players/<id>/grant {currency, amount, reason}`（必进审计） |
| 回滚单笔交易 | 无（[10 §P2-17](10-backend-requirements.md) undo/redo） | 冲正分录，不删原账 |
| 全服公告 | 无 | `GET/POST /admin/announcements` |
| 经济仪表盘 | 只有 `GET /admin/economy/revenue` | 货币总量、M2、基尼系数、破产率时间序列 |
| AI 预算与熔断 | `admin_ai` 有 tick/pause/providers | 成本上限、自动降级（`07` 分册） |

这一块要单独一篇 `13-operations-backend.md`，本文不展开——因为它需要先定"运营权限模型"（谁是 `admin`、谁是 `ops`、能否双人复核）。

---

## 6. 一句话

**没写完。** 三遍各自的结论是：

1. 第一遍（10）：前端缺接口 → 6 个 P0；
2. 第二遍（11）：缺裁决权 → 航行燃料裸奔；
3. 第三遍（12）：服务端自己的洞 → 分红不除权、零安全头、审计看不到。

三遍合起来 **≈ 29.5 人日**，其中 **9.7 人日**是"不做前端就在骗玩家"的硬门槛。
第四遍（运营后台）还没开始，要不要做取决于你是否打算长期运营。
