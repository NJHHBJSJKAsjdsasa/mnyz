# Atlas 生产级服务端与 PostgreSQL 15 设计（v2）

> 写给下一次会话：这是**生产架构与数据库设计**文档，不含业务实现代码。附录 B 的 DDL 属于数据库设计产物（schema 定义），可直接作为迁移脚本初稿。
> v1 被否，原因见第 0.2 节；本版按生产标准重写。
> 最后更新：2026-10-25

## 分册索引（每个章节都有独立的详细文档）

主文档保留结论与交叉引用；**细节、流程、验收与反模式在 `docs/server/` 下**，按主题各自成册。

| 分册 | 覆盖主文档章节 |
|---|---|
| [docs/server/README.md](server/README.md) | 导航、阅读顺序、术语表 |
| [01-scope-and-slo.md](server/01-scope-and-slo.md) | §0、§1（环境、SLO、容量） |
| [02-architecture.md](server/02-architecture.md) | §2、§3（拓扑、分层、请求生命周期、运行时） |
| [03-auth.md](server/03-auth.md) | §4（账号、令牌、授权、限流） |
| [04-data-model.md](server/04-data-model.md) | §5、§6、§7.1–7.9（原则、领域、表清单） |
| [05-economy-ledger.md](server/05-economy-ledger.md) | §8（双分录、对账、反作弊） |
| [06-time-and-concurrency.md](server/06-time-and-concurrency.md) | §9、§10（时钟、锁、隔离级别、幂等、outbox） |
| [07-cache-and-jobs.md](server/07-cache-and-jobs.md) | §11（Redis、Celery、降级） |
| [08-api.md](server/08-api.md) | §12（契约、错误、分页、端点全表） |
| [09-server-compute.md](server/09-server-compute.md) | §13（必须下沉的计算、对拍） |
| [10-security.md](server/10-security.md) | §14（威胁模型、权限、RLS、审计） |
| [11-observability.md](server/11-observability.md) | §15（日志/指标/追踪/告警） |
| [12-backup-dr.md](server/12-backup-dr.md) | §16（PITR、演练、故障恢复） |
| [13-testing.md](server/13-testing.md) | §17（测试金字塔、属性测试、压测） |
| [14-migration-rollout.md](server/14-migration-rollout.md) | §18（strangler 五阶段、灰度、回滚） |
| [15-milestones-and-risks.md](server/15-milestones-and-risks.md) | §19、§20（里程碑、人力、风险） |
| [16-planet-cache.md](server/16-planet-cache.md) | §7.10（行星缓存迁 PG） |
| [17-player-planets.md](server/17-player-planets.md) | §7.11（玩家改造星球） |
| [18-world-planets.md](server/18-world-planets.md) | §7.12（共享行星、攻城、跨区 saga） |
| [19-ddl.md](server/19-ddl.md) | 附录 B（迁移切分、不变量、权限） |
| [20-repo-and-checklist.md](server/20-repo-and-checklist.md) | 附录 A、C（结构、边界、开工清单） |

---

## 0. 范围与版本说明

### 0.1 目标环境

| 项 | 值 |
|---|---|
| 数据库 | PostgreSQL 15（生产：主库 + 流复制只读副本） |
| 连接 | `127.0.0.1:5432`，开发账号 `postgres` / `123456`，库名 `atlas` |
| 生产连接 | **必须**经 pgbouncer（transaction pooling），应用不直连主库 |
| 应用 | Flask 3.1.3（应用工厂 + Blueprint）+ Gunicorn/Uvicorn 多 worker |
| 队列/缓存 | Redis 7（限流、分布式锁、缓存、任务队列 broker） |
| 任务 | Celery worker（独立进程），不与 web 进程混跑 |

> 密码 `123456` 只用于本机开发。生产凭据走环境变量或密钥管理服务，**不入库、不入仓库、不写日志**。

### 0.2 v1 为什么被否（不再重复的错误）

| v1 做法 | 问题 | v2 结论 |
|---|---|---|
| 匿名令牌 = 身份 | 无账号、无吊销、无爆破防护，换浏览器即丢，无法做客服与封禁 | 真实账号体系：邮箱+Argon2id，JWT access + 轮换 refresh，会话表可吊销 |
| 每域一大块 `jsonb` | 无法索引/排序/校验，schema 随代码漂移，并发写覆盖 | 3NF 建模；`jsonb` 仅用于不参与查询的扩展字段 |
| 可变余额列 | 无审计、可被并发写覆盖、无法对账 | **双分录账本**（ledger）+ 物化余额缓存 + 对账任务 |
| 请求内结算离线产出 | 长事务、写放大、多实例下竞争 | `last_settled_at` + 行锁 + 幂等；定时任务做后台物化 |
| 单进程内存限流 | 多实例失效 | Redis 令牌桶（按 token/IP/接口） |
| 无后台任务 | 行情刷新、合同过期、清理靠“有人访问” | Celery 周期任务 + outbox 中继 |
| 保留 localStorage 可写 | 客户端仍可改状态，“权威”名不副实 | 客户端降级为**只读缓存**；离线只读，不允许离线写 |
| 手写 SQL 迁移 | 无回滚、无校验、多人协作冲突 | Alembic（autogenerate + 手写混合，含 downgrade 与 CI 校验） |
| 无 SLO/容量/演练 | 谈不上生产 | 明确 SLO、容量模型、PITR 与恢复演练 |

---

## 1. 非功能目标

### 1.1 SLO

| 指标 | 目标 |
|---|---|
| 可用性 | 99.9%/月（API） |
| API 延迟 | p50 < 40ms，p95 < 120ms，p99 < 300ms（写操作 p95 < 200ms） |
| 峰值吞吐 | 300 RPS（10k DAU，峰值系数 8） |
| 错误率 | 5xx < 0.1% |
| RPO | ≤ 5 分钟（WAL 归档） |
| RTO | ≤ 30 分钟（主库故障切换 + 应用重连） |
| 数据一致性 | 账本每笔交易借贷平衡；余额缓存与账本偏差为 0（每小时对账） |

### 1.2 容量模型

| 维度 | 估算 |
|---|---|
| 玩家 | 首年 50k 注册、10k DAU |
| 每玩家状态 | 规范化后约 60–120 行（船/模块/站/扫描/合同/日志） |
| 热表规模 | `ledger_entries` 约 5k 万行/年（按玩家动作 ~50 次/日），必须分区 |
| 数据库 | 4 vCPU / 16 GB / 200 GB SSD（热数据 ~40 GB/年） |
| 连接数 | 应用 4 worker × 8 = 32；经 pgbouncer 收敛到主库 40 |

### 1.3 本期的非目标（后续阶段的目标，见 v3）

以下三项**不在 v2 范围内**，但已在 `docs/PVPVE_MULTIREGION_MICROSERVICE.md`（v3）给出目标架构与演进路线。v2 的作用是先把「单区域、权威、可对账」的地基打好——没有它，v3 的这三项都无法安全落地。

- 实时 PvPvE（v3 P1，独立 Go 战斗服务 + Agones）
- 跨区多活（v3 P3，玩家分片单写，不做钱包多主）
- 微服务拆分（v3 P2，只拆 8 个有界上下文）

P2P 协议本身仍不改：联盟保持邀请码语义，成员关系入库可查询。

---

## 2. 生产架构

### 2.1 拓扑

```
                          ┌────────────┐
   Browser ──HTTPS──▶     │  Nginx/TLS │  HSTS, gzip, 静态资源, /api 反代
                          └─────┬──────┘
                                │ keep-alive 200
                    ┌───────────▼────────────┐
                    │ Gunicorn (uvicorn) × N │  无状态：不存会话、不存缓存
                    │  app factory + 蓝图     │
                    └───┬───────────┬────────┘
                        │           │
              ┌─────────▼──┐   ┌────▼─────────┐
              │  Redis 7   │   │  pgbouncer   │
              │ 限流/锁/缓存│   │ transaction  │
              └─────┬──────┘   └────┬─────────┘
                    │               │
              ┌─────▼──────┐   ┌────▼─────────────────────┐
              │ Celery × 2 │   │ PostgreSQL 15 主库        │
              │ 周期任务    │──▶│  + 流复制只读副本(排行/报表)│
              └────────────┘   └──────────────────────────┘
```

### 2.2 分层与职责（强约束，代码评审按此把关）

| 层 | 目录（建议） | 允许做什么 | 禁止 |
|---|---|---|---|
| 接口层 | `server/api/v1/*.py` | 参数校验（pydantic）、鉴权、限流、调 service、序列化 | 写 SQL、写业务流程 |
| 领域服务 | `server/domain/*.py` | 业务规则、事务边界、锁顺序、幂等、事件入 outbox | 直接操作 `request`/`session` |
| 仓储层 | `server/repo/*.py` | 参数化 SQL、行映射、批量查询 | 业务判断、跨域事务控制 |
| 基础设施 | `server/infra/*.py` | 连接池、Redis、日志、指标、配置 | 业务逻辑 |
| 任务 | `server/jobs/*.py` | 周期与异步任务，复用 domain 服务 | 被 web 请求同步调用（除 outbox 中继延迟容忍） |

**事务规则**：一个 API 请求 = 一个数据库事务（`SERIALIZABLE` 仅用于账本写入；其余 `READ COMMITTED`）。事务内禁止外部 HTTP/IO；需要外部调用时改为 outbox + worker。

### 2.3 请求生命周期（写操作）

1. Nginx 注入 `X-Request-Id`（或应用生成）。
2. 鉴权中间件校验 JWT（本地验签，不查库）→ 注入 `player_id`。
3. Redis 限流（key: `rl:{player_id}:{route}`）。
4. pydantic 校验入参 + `Idempotency-Key` 去重查询。
5. 开事务：`SELECT ... FOR UPDATE` 锁玩家聚合根（`players` 行）→ 锁钱包行（按 resource_code 升序，防死锁）。
6. 结算离线产出（幂等，基于 `last_settled_at`）→ 执行动作 → 写账本 → 更新物化余额 → 写 outbox → `UPDATE players SET state_version = state_version + 1`。
7. 提交后返回 `200 + X-State-Version`；幂等键记录响应。

---

## 3. 运行时与部署

### 3.1 进程模型

| 组件 | 配置 | 说明 |
|---|---|---|
| Nginx | 2 worker | TLS 终止、HTTP/2、静态资源、`/api` 反代、`client_max_body_size 1m` |
| App | Gunicorn `-w 4 -k uvicorn.workers.UvicornWorker --max-requests 2000 --max-requests-jitter 200` | 无状态，可水平扩 |
| Celery | `-c 2`，独立容器 | beat 单独一个实例（避免多实例重复调度） |
| pgbouncer | `pool_mode=transaction`, `default_pool_size=25`, `max_client_conn=300` | 应用连接数不随 worker 线性增长 |
| PG 主 | 4C16G，`max_connections=200`, `shared_buffers=4GB`, `effective_cache_size=10GB`, `work_mem=16MB`, `maintenance_work_mem=512MB`, `wal_level=replica`, `archive_mode=on` | 15 默认 `max_wal_senders=10` 足够 |
| PG 备 | 同上，`hot_standby=on` | 只服务只读查询（排行榜、报表） |
| Redis | 1C2G，`maxmemory-policy allkeys-lru` | 只放可重建数据 |

### 3.2 环境与配置

- 配置单一来源：`ATLAS_ENV`（dev/staging/prod）+ `.env`（dev）+ 环境变量/密钥管理（prod）。
- 必填：`ATLAS_DATABASE_URL`、`ATLAS_REDIS_URL`、`ATLAS_JWT_PRIVATE_KEY`、`ATLAS_JWT_PUBLIC_KEY`、`ATLAS_SECRET_KEY`。
- 行星缓存（§7.10）：`ATLAS_CACHE_BACKEND`（`pg|sqlite|json`，默认 `pg`）、`ATLAS_CACHE_SCHEMA`（默认 `universe_cache`）、`ATLAS_CACHE_MAX_ROWS`（三表上限，逗号分隔）。未配置 `ATLAS_DATABASE_URL` 时自动回落 `sqlite`。
- 启动自检（fail fast）：迁移版本 = 代码期望版本；Redis 可达；JWT 密钥可解析；时钟偏差 < 2s。
- 容器：`Dockerfile` 多阶段（前端构建 → 运行镜像），`HEALTHCHECK` 打 `/api/v1/health/ready`。

### 3.3 健康检查

| 端点 | 含义 |
|---|---|
| `/api/v1/health/live` | 进程存活，不查依赖 |
| `/api/v1/health/ready` | DB ping < 50ms、Redis ping、迁移版本匹配；不满足返回 503 |

---

## 4. 认证与授权

### 4.1 账号模型

- `accounts`：`id`、`email citext unique`、`password_hash`（Argon2id，内存 64MB/t=3/p=4）、`email_verified_at`、`status`（active/locked/deleted）、`created_at`。
- `players`：游戏内角色，1 个 account 在 1 个 universe 下可有 1 个 player（预留多角色：`UNIQUE(account_id, universe_id, slot)`）。
- 访客升级：首次进入创建 `accounts.status='guest'`（email 为空）+ player；登录后 `UPDATE accounts SET email=?, password_hash=?, status='active'`，**player_id 不变**，进度无损。

### 4.2 令牌

| 令牌 | 形式 | 有效期 | 存储 | 说明 |
|---|---|---|---|---|
| Access | JWT RS256，`sub=player_id`、`sid`、`ver` | 15 分钟 | 仅内存 | 不落 localStorage；页面刷新用 refresh 换 |
| Refresh | 256bit 随机串 | 30 天，滚动 | `sessions.refresh_hash`（Argon2id 哈希） | **一次性使用**，检测重放即吊销整条会话链 |

- 会话表 `sessions(id, account_id, player_id, refresh_hash, user_agent, ip inet, created_at, last_used_at, revoked_at, rotated_from)`。
- 重放检测：刷新时若 `refresh_hash` 不存在但能匹配 `rotated_from` 链 → 判定被盗 → 吊销该 account 全部会话并告警。
- 登出 = 吊销当前 session；「登出所有设备」= 吊销 account 全部 session。

### 4.3 授权

- 玩家只能访问自己的资源：所有查询带 `player_id = current_player_id`，由 repo 层强制注入（禁止 service 手写拼接）。
- 管理接口 `/api/v1/admin/*` 独立前缀 + `role` 字段（`player/ops/admin`），单独限流与审计。
- 可选：PG 行级安全（RLS）作为第二道防线——`atlas_app` 角色设置 `app.player_id` 会话变量，策略 `USING (player_id = current_setting('app.player_id')::uuid)`。**建议在 P3 之后加**，避免早期调试困难。

### 4.4 限流与防爆破

| 对象 | 策略 |
|---|---|
| `/auth/login` | IP 5 次/分 + 账号 10 次/小时，失败 5 次锁 15 分钟（`login_attempts` 表） |
| `/api/v1/*` 写操作 | token 60 次/分，突发 20 |
| `/api/v1/collect` 等高频 | 附加服务端冷却校验（即使限流放行也会因冷却被拒） |
| `/health` | 不限流，但仅内网可达 |

实现：Redis + Lua 令牌桶（原子），返回 `RateLimit-*` 头与 `429 + Retry-After`。

---

## 5. 数据库设计原则

1. **3NF 优先**：每个事实只存一次；`jsonb` 只用于「不查询、不排序、不参与约束」的扩展字段（如飞船外观、战斗动画帧数据）。
2. **约束在库内**：`NOT NULL`、`CHECK`、`UNIQUE`、`FK` 是最后防线，不能只靠应用校验。金额类列 `CHECK (delta <> 0)`。
3. **不可变账本**：`ledger_entries` 只能 INSERT，禁止 UPDATE/DELETE（用触发器 + 只给 app 角色 INSERT 权限）。
4. **参考数据入库**：资源类型、模块定义、科技节点、合同模板、势力、船型都进表并带 `data_version`，由 Alembic 播种；代码只读不硬编码（避免平衡性改动要发版）。
5. **时间戳统一 `timestamptz`**，全部 UTC 存储；业务「日/周」由玩家时区计算。
6. **软删仅 `accounts.status='deleted'`**，其余按 FK 级联真删。
7. **大表分区**：日志类按月 `RANGE` 分区（`ledger_entries`、`combat_turns`、`audit_log`、`outbox_events` 归档）。
8. **索引随查询设计**：先列查询模式再建索引；每个索引在文档里注明服务哪条查询。
9. **迁移可回滚**：Alembic 每个 revision 必须有 `downgrade()`；DDL 大表变更用 `CONCURRENTLY` 并在迁移中 `SET statement_timeout=0`。

---

## 6. 领域模型（逻辑）

```
accounts 1─1 players 1─* ships 1─* ship_modules
                   │             └─* fleet_ships
                   ├─* wallets *─1 resource_types
                   ├─* ledger_entries *─1 ledger_transactions
                   ├─* planet_scans
                   ├─* collections
                   ├─* contracts *─1 contract_templates
                   ├─* stations 1─* station_modules
                   ├─* codex_entries
                   ├─* tech_unlocks *─1 tech_nodes
                   ├─* sector_licenses *─1 sectors
                   ├─* npc_relations *─1 npc_residents
                   ├─* faction_reputation
                   ├─* combat_sessions 1─* combat_turns
                   ├─* alliance_members *─1 alliances
                   └─* outbox_events / idempotency_keys / audit_log
```

**聚合根 = `players`**：所有会互相影响状态的写操作先锁这一行，天然串行化同一玩家的动作（玩家级操作 QPS 很低，锁争用可忽略）。

---

## 7. 物理模型（表清单）

> 完整 DDL 见附录 B（核心表）；下表给出全部表、职责与关键索引。

### 7.1 身份与配置

| 表 | 职责 | 关键索引/约束 |
|---|---|---|
| `accounts` | 账号、凭据、状态 | `UNIQUE(email)`；`status` 部分索引 |
| `players` | 角色、所属宇宙、版本号 | `UNIQUE(account_id, universe_id, slot)`；`state_version` |
| `sessions` | refresh 令牌链 | `(account_id)`、`refresh_hash` 唯一 |
| `universes` | seed 与宇宙时间原点 | `UNIQUE(seed_name)` |
| `game_config` | 可调数值（系数/上限），带版本 | `UNIQUE(key)` |
| `resource_types` | 12 种资源元数据 | `UNIQUE(code)` |
| `module_definitions` | 模块与效果曲线参数 | `UNIQUE(code)` |
| `tech_nodes` | 科技树节点与前置 | `UNIQUE(code)`；自引用 `requires` |
| `contract_templates` | 合同模板与指标 | `UNIQUE(code)` |

### 7.2 经济（账本）

| 表 | 职责 | 关键索引 |
|---|---|---|
| `wallets` | 每玩家每资源的**物化余额**（`balance numeric(20,4)`） | PK`(player_id, resource_code)`；`CHECK(balance>=0)` |
| `ledger_transactions` | 一次业务动作 | PK`id`；`(player_id, created_at desc)`；`UNIQUE(idempotency_key)` |
| `ledger_entries` | 借贷分录（含系统账户），按月分区 | `(transaction_id)`；`(wallet_id, created_at)`；`CHECK(delta<>0)` |
| `system_accounts` | 系统侧对手账户（市场/任务/掉落） | `UNIQUE(code)` |
| `collections` | 采集流水（奖励明细，jsonb 仅存展示用明细） | `(player_id, planet_key, created_at desc)` |

**借贷规则**：玩家获得资源 = 玩家钱包 `+x`、系统账户 `-x`；消耗则相反。任何交易 `SUM(delta)=0`，由对账任务每小时校验（发现不平即熔断写入并告警）。

### 7.3 航行与探索

| 表 | 职责 | 关键索引 |
|---|---|---|
| `ships` | 旗舰属性、外观 | `(player_id)` |
| `ship_modules` | 模块等级 + 超频次数 | PK`(ship_id, module_code)` |
| `fleet_ships` | 僚舰、任务、离线累计起点 | `(player_id)` |
| `planet_scans` | 每行星扫描次数/最近结果/富集加成剩余 | PK`(player_id, planet_key)` |
| `codex_entries` | 图鉴（kind: planet/element/life/relic） | PK`(player_id, kind, entry_key)` |
| `sector_licenses` | 星区许可 | PK`(player_id, sector_key)` |
| `discoveries` | 已探索星系（按星系一行位图，或按行星一行） | PK`(player_id, galaxy_hash)` |
| `surface_samples` | 地表采样次数（按玩家+日期+行星） | PK`(player_id, planet_key, game_day)` |
| `cooldowns` | 通用冷却（`key` 语义：scan/collect:planet_key/salvage） | PK`(player_id, key)`；`ready_at` |

### 7.4 经济与市场

| 表 | 职责 | 关键索引 |
|---|---|---|
| `market_days` | 每行星每日行情头 | PK`(planet_key, game_day)` |
| `market_quotes` | 商品报价与库存 | PK`(market_day_id, resource_code)`；`CHECK(stock>=0)` |
| `trade_orders` | 买卖流水（含单价、数量、税） | `(player_id, created_at desc)` |

### 7.5 合同与任务

| 表 | 职责 | 关键索引 |
|---|---|---|
| `contracts` | 每日合同（含 `taken_by`、进度、TTL） | PK`(player_id, id)`；`(player_id, game_day)`；`(expires_at) WHERE NOT claimed` |
| `contract_events` | 进度变更流水（追加） | `(contract_id, created_at)` |
| `player_tasks` | 任务系统进度 | PK`(player_id, task_code)` |

### 7.6 空间站与生产

| 表 | 职责 | 关键索引 |
|---|---|---|
| `stations` | 站、坐标、模块等级、`last_settled_at` | PK`(id)`；`UNIQUE(player_id, planet_key)`；`(player_id)` |
| `station_modules` | 舱室等级 | PK`(station_id, module_code)` |
| `fabrication_cooldowns` | 生产线冷却 | PK`(player_id, recipe_code)` |

### 7.7 社交

| 表 | 职责 | 关键索引 |
|---|---|---|
| `npc_residents` | 24 位舰长（per universe） | `UNIQUE(universe_id, code)` |
| `npc_relations` | 好感/成交/最近相遇 | PK`(player_id, resident_id)` |
| `faction_reputation` | 每星区声望 | PK`(player_id, sector_key)` |
| `alliances` | 联盟 | `UNIQUE(name)` |
| `alliance_members` | 成员与角色 | PK`(alliance_id, player_id)`；触发器限制 ≤5 |
| `alliance_invites` | 邀请码（TTL、一次性） | `UNIQUE(code)`；`(expires_at)` |
| `wrecks` | 残骸（可打捞一次） | PK`(player_id, planet_key)` |

### 7.8 战斗

| 表 | 职责 | 关键索引 |
|---|---|---|
| `combat_sessions` | 战斗状态机（回合、双方 HP/护盾、种子、状态） | PK`id`；`(player_id, status)`；`(expires_at) WHERE status='active'` |
| `combat_turns` | 每回合动作与结果（追加，可复盘） | `(session_id, turn_no)` |
| `combat_loot` | 战果发放记录（与账本 tx 关联） | `(session_id)` 唯一 |

### 7.9 基础设施表

| 表 | 职责 | 说明 |
|---|---|---|
| `outbox_events` | 领域事件外发（P2P 广播、分析、通知） | 分区；`published_at IS NULL` 部分索引 |
| `idempotency_keys` | 幂等（key + 请求指纹 + 响应） | PK`key`；24h 清理 |
| `audit_log` | 敏感操作审计 | 分区；只 INSERT |
| `login_attempts` | 登录失败计数 | `(identifier, created_at)` |
| `job_runs` | 定时任务执行记录（防重复、可观测） | PK`(job_name, run_date)` |
| `schema_migrations` | Alembic 版本 | Alembic 自带 |

### 7.10 行星缓存 schema：`universe_cache`（SQLite/JSON → PostgreSQL）

行星/星系/恒星系是**派生数据**：给定 `seed + cosmic_origin_time + 坐标` 可完全重建。它不需要账本级严格性，但需要「一套引擎、一套备份、可并发读」。本节定义迁移设计；与玩家状态（§7.1–7.9）完全隔离，可独立上线。

#### 7.10.1 现状与问题

| 现状 | 位置 | 问题 |
|---|---|---|
| SQLite 缓存 | `pymodules/__atlas_sqlite_cache.py` → `internal_data/cache/atlas_cache.db`，表 `galaxies/systems/planets`，坐标 3 列 + `data TEXT(JSON)` | 单写者；gunicorn 多 worker 并发写会 `database is locked`，目前靠单进程规避 |
| JSON 文件缓存 | `pymodules/__atlas_permanent_cache.py` → `internal_data/cache/{galaxies,systems,planets}/*.json` | 一对象一文件；无并发控制、无淘汰、无命中统计 |
| 命中回填 | `pymodules/__atlas_cache_proxy.py` 的 `CachedGalaxy` / `CachedSolarSystem` + `patch_universe_get_galaxy()` | 只回填标量字段；`planets` 永远由 `_build_planets(num_planets)` 重建 |
| Redis 摘要 | `__atlas_redis_cache.py`（可选） | 与上述两套口径并存 |

**目标**：删掉 SQLite 与 JSON 两套落盘，统一进 PG 的 `universe_cache` schema；Redis 只做热点摘要。

#### 7.10.2 目标表

| 表 | 列 | 约束 / 索引 |
|---|---|---|
| `universe_cache.galaxies` | `id bigserial`, `universe_id uuid`, `x,y,z int`, `data jsonb`, `generator_version int`, `created_at`, `updated_at`, `hit_count int` | `UNIQUE(universe_id, x, y, z)` |
| `universe_cache.systems` | 同上 + `system_index int` | `UNIQUE(universe_id, x, y, z, system_index)` |
| `universe_cache.planets` | 同上 + `system_index int`, `planet_name text` | `UNIQUE(universe_id, x, y, z, system_index, planet_name)` |
| `universe_cache.cache_meta` | `universe_id uuid pk`, `generator_version int`, `updated_at` | 生成器版本变更时整库失效的依据 |

三条硬性设计：

1. **`universe_id` 进唯一键**。历史上踩过「缓存跨宇宙串数据」：不同 seed 共用同一坐标时会读到别人的星系。缓存层从 `config` 取当前宇宙标识，调用方无需改动签名。
2. **存储仍用 `jsonb`，不拆列**。这是派生缓存，字段集合随生成器演进；访问只按坐标键，不做字段过滤——3NF 的要求只适用于玩家数据。
3. **`generator_version`**。生成逻辑一旦改动（例如修 `surface_elements` 翻译），旧行必须失效：命中时比对版本，不匹配即视为 miss 并覆盖。版本号由 `cache_meta` 维护，随代码版本递增。

#### 7.10.3 一致性不变量（必须逐条验收）

1. 任意一行可删除并由 seed 重建，**删除不得改变游戏结果**。
2. 命中结果必须与「fresh 生成」逐字段相等；比较前统一 `json.dumps(sort_keys=True, ensure_ascii=False)`。
3. 系统行必须存全 `seed / index / name / num_planets / stars / star_system_type`——少了 `num_planets` 就会出现「命中后系统是空壳、`planets={}`」的老问题（`_build_planets` 无参可依）。
4. 命中行的 `universe_id`、`coordinates` 必须与请求上下文一致，不一致按 miss 处理。
5. 写入用 `INSERT ... ON CONFLICT DO NOTHING`：生成是确定性的，「首写胜出」；后写覆盖只会掩盖漂移。
6. PG 不可用时回落「直接生成、不落盘」+ 告警，**不允许 500**。

#### 7.10.4 读写路径与代码落点

| 层 | 现状 | 迁移后 |
|---|---|---|
| 管理器 | `SQLiteCacheManager`（接口：`save_* / get_* / *_exists / get_cache_stats`） | 新增 `PgCacheManager`，**接口完全一致**，便于互换 |
| 门面 | 直接 `from ... import sqlite_cache` | 新增 `pymodules/__atlas_cache.py` 暴露 `cache` 单例，按 `ATLAS_CACHE_BACKEND`（`pg\|sqlite\|json`）选择，启动探测失败自动回落并 WARN |
| 业务接入 | `__atlas_cache_proxy.py` 引用 `sqlite_cache` | 改成引用 `cache`（行为不变，`CachedGalaxy/CachedSolarSystem` 逻辑一行不改） |
| 测试 | `test_fix.py` 直接改 `sqlite_cache.db_path` | 改为 `cache.use_backend("sqlite", db_path=tmp)` 或注入 fake；SQLite 实现保留用于测试 |
| JSON 缓存 | `permanent_cache` 双写 | 迁移期只读兜底，切读后停止写入，最后归档目录 |

读路径（单次命中）：`pgbouncer` → `SELECT data FROM universe_cache.planets WHERE universe_id=$1 AND x=$2 AND y=$3 AND z=$4 AND system_index=$5 AND planet_name=$6`，命中即 `json.loads`，**不做任何字段补全**。
写路径：单条 autocommit `INSERT ... ON CONFLICT DO NOTHING`，不进长事务（transaction 模式下 pgbouncer 安全）。

#### 7.10.5 淘汰与容量

| 项 | 方案 |
|---|---|
| 单行体积 | galaxy ≈ 0.4 KB；system ≈ 1 KB；planet ≈ 2–4 KB（含 `elements`、大气、轨道字段） |
| 规模上限 | 星系 50 万 / 系统 200 万 / 行星 500 万（可配置），超出按 `updated_at` 最旧批删（1 万/批） |
| 淘汰任务 | Celery 每小时；先删行星再删系统/星系（FK 或手动顺序），避免长事务 |
| 分区 | 不分区（按坐标分布均匀，分区无收益）；行星表 >1000 万行再按 `x` 十段 hash 分区 |
| 膨胀控制 | `fillfactor=85`；`hit_count/last_hit_at` **不逐次写**（1/64 概率采样或 Redis 计数异步落库），否则每次读都变写，autovacuum 追不上 |
| autovacuum | `autovacuum_vacuum_scale_factor=0.02`、`autovacuum_analyze_scale_factor=0.01` |
| 备份 | 缓存 schema 可不进 PITR：单独逻辑备份（`pg_dump -n universe_cache`）或直接排除；丢了可重建 |

#### 7.10.6 灰度迁移（四步，每步可回滚）

| 步骤 | 动作 | 观察指标 | 回滚 |
|---|---|---|---|
| 1 建表 | Alembic `0100_universe_cache`：schema + 三表 + `cache_meta`；授予 `atlas_app` SELECT/INSERT/UPDATE | 迁移耗时、锁等待 | `downgrade` 删 schema（无数据依赖） |
| 2 双写 | miss 时同时写 PG 与 SQLite，PG 失败仅告警；**读仍走 SQLite** | 写失败率、写入 p95 | `ATLAS_CACHE_BACKEND=sqlite` |
| 3 回填 | 一次性脚本导入 `atlas_cache.db` 三表 + `internal_data/cache/**/*.json`（`ON CONFLICT DO NOTHING`）；抽样 1% 比对 `data` 全等 | 导入行数、校验差异数（必须 0） | 清空 `universe_cache` 重导 |
| 4 切读 | `ATLAS_CACHE_BACKEND=pg`；SQLite 只读兜底 7 天；随后关双写；JSON 目录移到 `internal_data/cache_backup/` | 命中率、读 p95、错误率 | 改回 `sqlite`（双写期内数据完整） |

#### 7.10.7 验收标准

| 项 | 阈值 |
|---|---|
| 命中率（同宇宙二次访问） | > 95% |
| 读延迟 | 本机 p95 < 8ms；生产（经 pgbouncer）p95 < 15ms |
| 一致性抽检 | 随机 1000 个 key，命中结果与 fresh 生成 `sort_keys` 后全等 |
| 故障降级 | 停 PG 后仍可生成行星、无 5xx；PG 恢复自动续写 |
| 并发 | 500 并发随机坐标读，p95 < 20ms，无死锁 |
| 多 worker | 4 个 gunicorn worker 并发写同 key，不报错、无重复行 |

#### 7.10.8 风险

| 风险 | 缓解 |
|---|---|
| 生成器改了但旧缓存仍命中 | `generator_version` + `cache_meta`；版本不符即 miss |
| 跨宇宙串数据 | `universe_id` 进唯一键；命中前二次校验 |
| 大行 TOAST 膨胀 | 单行 >8KB 时自动 TOAST；>100KB 的极端行星考虑把 `data` 拆两列（标量 + 大数组） |
| 多实例重复计算 | `ON CONFLICT DO NOTHING` + 生成耗时/重复率指标 |
| 缓存备份挤占玩家库空间 | 独立 schema + 单独逻辑备份；必要时独立表空间 |

#### 7.10.9 边界声明（与 §7.11 的分工）

`universe_cache` **只允许存放可由 `seed + 坐标 + generator_version` 完全重建的数据**。判定方法：`TRUNCATE universe_cache.<table>` 之后，任何玩家看到的结果都不允许发生变化。

一旦某张表里出现了「玩家改造过的星球」「被挖空的矿脉」「建在上面的建筑」这类**不可重建**内容，它就不再是缓存，必须迁到 §7.11 的玩家数据模型里：进账本、进审计、进 PITR、禁止 `TRUNCATE`。两者不要混在同一张表或同一个 schema 里。

---

### 7.11 玩家改造星球：不可重建的世界数据（`planet_*`）

> 本节是 §7.10 的「逃生口」：一旦行星上出现玩家留下的东西，它就从缓存升级为**玩家数据**，必须按账本/审计/备份的标准对待，且**不得**放进 `universe_cache`。

#### 7.11.1 两类数据的硬边界

| 维度 | 基础行星（§7.10 缓存） | 玩家改造（本节） |
|---|---|---|
| 可重建性 | 由 `seed + 坐标 + generator_version` 完全重建 | 玩家行为产物，重建不出来 |
| 落点 | `universe_cache.*`（独立 schema） | `public.planet_*`（玩家库） |
| 允许 `TRUNCATE` | 允许，且不得影响任何玩家可见结果 | **禁止**（撤销 app 角色 TRUNCATE/TRUNCATE 级联权限） |
| 备份 | 可不进 PITR，逻辑备份即可 | 必须进 PITR + 每日逻辑备份 + 恢复演练 |
| 审计 | 不需要 | 每次变更写 `planet_audit`（append-only） |
| 资金 | 不涉及 | 所有花费/产出走 `ledger_*` |
| 淘汰 | 有 TTL / 行数上限 | 无 TTL，永久保留 |

**判定口诀**：把这张表清空后，玩家会不会「丢东西」？会 → 玩家数据；不会 → 缓存。

#### 7.11.2 分层模型：base + delta，而不是存整颗星球

```
planet_view(player, key) = materialize( generate(seed, key), delta(player, key) )
                           └── 可重建、可淘汰 ──┘  └── 不可重建、永久 ──┘
```

为什么**不能**在 `planet_*` 里存「整颗行星的 materialized JSON」：

1. 生成器一改（修翻译、加字段），快照就与新版生成逻辑永久分叉，越跑越偏。
2. 快照会把「玩家意图」和「生成器细节」混在一起，日后无法区分「这行是玩家加的」还是「当时生成器吐的」。
3. 存 delta 只有「玩家真正改变的东西」，体积小一个数量级，且可解释、可审计、可回滚单条。

**delta 的写法**：存**结构化修正**而非绝对数值，且引用**稳定标识**（元素符号、结构 code、特征 code），**绝不引用数组下标**——生成器调整元素顺序时，下标会指错对象。

| 类型 | 例子 | 存法 |
|---|---|---|
| 标量修正 | 地表温度 +40K、大气密度 ×0.6 | `op=add/mul/set`, `target=surface_temperature` |
| 元素增删 | 引入 `Water`、抽干 `Iron` | `target=element:Water`, `op=add`, `value=presence` |
| 元素储量 | 该玩家在此行星的 `Iron` 剩余 812 单位 | `planet_deposits.remaining` |
| 建筑/设施 | 采矿站 Lv3、轨道平台 | `planet_structures`（独立表，便于产出结算） |
| 命名/涂装 | 玩家给行星改名 | `planet_claims.display_name` |

#### 7.11.3 表设计

| 表 | 关键列 | 约束/索引 |
|---|---|---|
| `planet_claims` | `player_id`, `planet_key`, `universe_id`, `display_name`, `claimed_at`, `generator_version_at_claim`, `state_version`, `state`（active/abandoned） | PK`(player_id, planet_key)`；`(player_id, state)`；每玩家上限（触发器 ≤10） |
| `planet_modifiers` | `id`, `player_id`, `planet_key`, `target`, `op`, `value numeric`, `source`, `created_at` | `(player_id, planet_key, target)` 唯一（同目标只保留一条，更新即覆盖 + 审计） |
| `planet_structures` | `id`, `player_id`, `planet_key`, `structure_code`, `level`, `hp`, `status`, `started_at`, `completes_at`, `last_settled_at` | `UNIQUE(player_id, planet_key, structure_code)`；`(completes_at) WHERE status='building'` |
| `planet_deposits` | `player_id`, `planet_key`, `element`, `remaining numeric`, `regen_per_hour numeric`, `updated_at` | PK`(player_id, planet_key, element)`；`CHECK(remaining>=0)` |
| `planet_audit` | `id bigserial`, `player_id`, `planet_key`, `action`, `before jsonb`, `after jsonb`, `request_id`, `created_at` | 按月分区；**只 INSERT**（撤销 UPDATE/DELETE） |
| `planet_events` | `id bigserial`, `player_id`, `planet_key`, `event_type`, `payload jsonb`, `created_at` | 领域事件（完成建造、塌方、枯竭），供 outbox/通知/成就消费 |

> `planet_claims.state_version` 同时充当 ETag：客户端带 `If-Match` 提交改造，冲突 `412`，避免多端同时改造互相覆盖。

#### 7.11.4 合并（materialize）规则与版本化

- `materialize(base, deltas)` 是**纯函数**，输入只来自「基础行星 + 该玩家的 delta 行」，输出完整视图；不许读其它玩家、不许读时间随机数。
- 修正按固定顺序应用：`set` → `mul` → `add`（同一 target 内按 `source` 优先级），顺序写进文档并用黄金用例锁死。
- 每个 delta 行带 `generator_version`（写入时的版本）。合并时：
  - 版本相同 → 直接应用；
  - 版本落后 → 走**兼容映射表**（`target` 稳定所以通常无需转换）；无法映射则保留玩家意图到 `planet_migrate_queue` 并告警，绝不静默丢弃。
- 输出结果按 `(player_id, planet_key, delta_version)` 缓存在 Redis（60 秒），`delta_version` 变化即换 key，天然免失效广播。

#### 7.11.5 与经济系统的耦合（强一致）

所有涉及资源的改造，**必须在同一事务里写账本**：

```
开事务
 ├─ 锁 players 行（聚合根）→ 锁 planet_claims 行（FOR UPDATE）
 ├─ 校验：配额、等级上限、冷却、deposits 充足、建造队列未满
 ├─ UPDATE planet_structures / planet_modifiers / planet_deposits
 ├─ INSERT ledger_transactions + ledger_entries（成本扣除 / 产出入账）
 ├─ INSERT planet_audit（before/after）
 ├─ UPDATE planet_claims.state_version = state_version + 1
 └─ INSERT outbox_events（planet.modified / structure.completed）
提交
```

- 产出类结构（采矿站等）沿用空间站/舰队的结算模型：`last_settled_at` + 服务端 tick + 封顶，结算时同样走账本。
- **禁止**在 `planet_*` 里存「余额」类字段：储量（`remaining`）是物理量可以存，资源余额只存在 `wallets`。

#### 7.11.6 三种并发情形

| 情形 | 处理 |
|---|---|
| 同一玩家多端同时改造 | `state_version` 乐观锁 + `If-Match`，冲突返回 `412`，前端重拉 |
| 同一玩家同一行星的并行请求（双击） | `Idempotency-Key` + `planet_claims` 行锁，串行化 |
| 未来多玩家共享同一行星 | 见 7.11.11：需要 `world_planets` 所有权与争议规则，**本期不做** |

#### 7.11.7 读路径

1. 取 base：`universe_cache`（未命中则生成并回填，可能被淘汰）。
2. 取 delta：`planet_claims + planet_modifiers + planet_structures + planet_deposits`（一次多表查询，按 `(player_id, planet_key)` 索引）。
3. `materialize` 合并 → 写 Redis（60s，键含 `delta_version`）。
4. 返回视图 + `ETag: <state_version>`。

关键：**base 被淘汰不影响玩家资产**；delta 永远来自 PG，不走缓存。

#### 7.11.8 审计与备份

| 项 | 要求 |
|---|---|
| 审计 | 每次写入 `planet_audit`（谁、何时、改了什么、before/after、`request_id`），按月分区保留 24 个月，之后归档对象存储（仍可追溯） |
| 备份 | `planet_*` 属于玩家库：必须进 PITR（WAL 归档）+ 每日 `pg_dump`；备份策略与 `wallets/ledger` 同级 |
| 恢复演练 | 每月一次：恢复到 1 小时前 → 随机抽 100 个 claimed 行星 → 用 `materialize` 重算并与备份时快照比对哈希，必须全等 |
| 删除权 | 账号删除时 `planet_*` 随 `players` 级联删除，但 `planet_audit` 保留脱敏副本（合规需要） |
| 权限 | `REVOKE TRUNCATE, DELETE ON planet_audit FROM atlas_app`；`planet_claims/modifiers/structures/deposits` 仅允许按 `player_id` 操作（可选 RLS） |

#### 7.11.9 配额与平衡（防止无限膨胀）

| 项 | 建议值 | 说明 |
|---|---|---|
| 每玩家可认领行星 | 10 | 触发器强制；超额需先放弃（放弃有 24h 冷却） |
| 每行星结构数 | 6 | 与空间站 3 舱室区分，行星更重 |
| 建造队列 | 1 | 避免并行建造刷产出 |
| 储量再生 | 每小时恢复基线 2% | 防止「挖空即废弃」，也防止无限刷 |
| 改造成本 | 走现有指数曲线 | 与改装/空间站同一套成本范式，避免新通胀源 |

#### 7.11.10 灰度与验收

| 阶段 | 动作 | 验收 |
|---|---|---|
| 1 | 建表 + RLS + 审计触发器；功能开关关闭 | `alembic upgrade/downgrade` 通过 |
| 2 | 只读接口：认领列表、行星视图（含 delta） | `TRUNCATE universe_cache` 后视图不变（**核心用例**） |
| 3 | 写入：认领/建造/改造（每步都是「写 delta + 写账本 + 审计」） | 并发双击只成功一次；账本与审计一一对应 |
| 4 | 产出结算 + 事件 | 对账偏差 0；结算封顶生效 |
| 5 | 备份演练 + 1% 灰度 → 全量 | 恢复后 materialize 哈希全等 |

#### 7.11.11 演进到「多玩家共享行星」（已设计，见 §7.12）

如果将来要做「同一颗行星被多个玩家争夺/共同开发」，需要额外引入：

- `world_planets`（`universe_id`, `planet_key`, `owner_player_id`, `contested bool`, `version`）：唯一真相，`planet_claims` 退化为「玩家视角」。
- 争议规则：占领需要战斗结果事件（`battle.result`）+ 冷却，不得直接覆盖。
- 跨区：行星归属随玩家 `home_region`，跨区访问走只读副本，写入代理回 home。
- 这是**跨服务事务**，必须走 saga（battle → economy → planet），不能在一个 PG 事务里完成。

本期只做「每玩家私有的改造层」，为将来的共享世界留出 `owner_player_id` 语义即可，不提前实现争夺。

#### 7.11.12 风险

| 风险 | 缓解 |
|---|---|
| 生成器升级导致 delta 语义漂移 | 只存稳定标识 + `generator_version` + 兼容映射表 + 迁移队列 |
| 把 delta 写成整颗快照 | Code review 检查：`planet_*` 不允许出现 `data jsonb` 整包字段 |
| 改造绕开账本（直接改储量/余额） | 仓储层只暴露「带账本的事务方法」，禁止直接 UPDATE |
| 审计表膨胀 | 月分区 + 24 个月归档；`audit` 只存 diff，不存整颗行星 |
| 备份恢复后 delta 与 base 版本不匹配 | 恢复演练校验 materialize 哈希；版本不匹配进迁移队列 |
| 玩家把改造当成「免费仓库」 | 储量仅在结构/仓库等级上限内保存，超限部分按溢出规则丢弃 |

---

### 7.12 多玩家共享行星（`world_planets`）：所有权、争夺与跨区 saga

> §7.11 是「每玩家私有改造层」。本节把行星变成**同一宇宙内所有玩家共享的唯一真相**：一颗行星同一时间只有一个所有者，可以被争夺。
> 一个宇宙只能选一种模式（`universes.world_mode = private | shared`），两套 delta 表结构不同（player 作用域 vs planet 作用域），但 `materialize` 是同一份纯函数。

#### 7.12.1 三条不可协商的设计决定

1. **共享行星是「有状态的世界数据」，单写者**。每颗行星有一个 `claim_version`，所有变更（占领、建造、拆除、被攻陷）都在行星所属分片的一个数据库事务内完成。**不存在**「两地同时改同一颗行星」。
2. **争夺战是异步确定性推演，不是实时对战**。跨区实时攻城在延迟上不可交付，且与 §7.11 的账本强一致冲突。攻击方在 T0 提交舰队快照，服务端在 T0+12h 用 `seed = hash(siege_id)` 推演并产出战报；双方看到完全相同的结算。实时 PvPvE 仍然只为「中立空间/未占领区」提供匹配对局。
3. **行星归属决定写入区域**：`shard_id` 由 `(universe_id, sector)` 映射到区域，行星的所有写操作只在该区域执行；其他区域读复制副本（允许 ≤5s 延迟，UI 标注「同步于 N 秒前」）。

#### 7.12.2 表设计

| 表 | 关键列 | 约束/索引 |
|---|---|---|
| `world_planets` | `universe_id`, `planet_key`, `shard_id`, `owner_kind`(player/alliance/none), `owner_id`, `claim_version bigint`, `state`(neutral/claimed/vulnerable/derelict/besieged), `claimed_at`, `shield_until`, `last_contested_at`, `upkeep_due_at`, `generator_version` | PK`(universe_id, planet_key)`；`(shard_id, state)`；`(owner_id)`；`CHECK(claim_version>=0)` |
| `world_planet_modifiers` | 同 §7.11 的 `planet_modifiers`，但作用域是 `(universe_id, planet_key)`，`applied_by` 记录操作者 | `UNIQUE(universe_id, planet_key, target)` |
| `world_planet_structures` | 作用域同上，`owner_id` 表示归属者，`captured_at` 表示易主 | `UNIQUE(universe_id, planet_key, structure_code)` |
| `world_planet_deposits` | 共享储量（全服唯一一份），`remaining`, `regen_per_hour` | PK`(universe_id, planet_key, element)`；`CHECK(remaining>=0)` |
| `planet_ownership_history` | `universe_id`, `planet_key`, `from_owner`, `to_owner`, `reason`(claim/siege/abandon/decay/admin), `siege_id`, `at` | 追加表，月分区；只 INSERT |
| `sieges` | `id`, `universe_id`, `planet_key`, `shard_id`, `attacker_id`, `defender_id`, `attacker_fleet`(快照引用), `defender_fleet`, `seed`, `state`(declared/locked/resolving/resolved/aborted), `declare_at`, `lock_at`, `resolve_at`, `outcome`, `report jsonb` | PK`id`；`(state, resolve_at)` 部分索引；`(planet_key, declare_at desc)` |
| `siege_participants` | `siege_id`, `player_id`, `side`, `fleet_snapshot_id`, `damage_dealt`, `losses jsonb` | PK`(siege_id, player_id)` |
| `world_shards` | `shard_id`, `region`, `planet_count`, `load_score`, `updated_at` | 控制面表；决定行星写哪个区 |
| `world_events` | `id bigserial`, `universe_id`, `planet_key`, `event_type`, `payload jsonb`, `seq`, `created_at` | 追加表，用于回放/审计/跨区对账；`UNIQUE(universe_id, planet_key, seq)` |

`world_planets` 就是这颗行星的「聚合根」：所有写操作先 `SELECT ... FOR UPDATE` 锁它，再动结构/储量/修正。

#### 7.12.3 三层视图与 `materialize`

```
planet_view = materialize(
    generate(seed, key),                       // ① base：可重建，来自 universe_cache
    world_delta(universe, key),                // ② 世界层：共享、唯一真相
    player_delta(player, key) [仅私有模式]      // ③ 私有层：仅 world_mode=private 存在
)
```

- `materialize` 是纯函数，输入两个 delta 集合，顺序固定：base → world → private（私有模式）或 base → world（共享模式）。
- 共享模式下**不允许**存在私有层：玩家在别人的行星上只能有「权限」，不能有「私有建筑」。这样才不会出现「行星易主后私人物品挂空」的状态。
- 世界层 delta 必须带 `applied_by`，审计能追到具体玩家；但**权威属于行星**，不随人走。

#### 7.12.4 所有权与生命周期

| 状态 | 含义 | 转移条件 |
|---|---|---|
| `neutral` | 无主 | 玩家/联盟支付认领成本 → `claimed`（进入建造期，12h 内不可被攻） |
| `claimed` | 有主，护盾期内 | 护盾到期 → `vulnerable`； upkeep 逾期 7 天 → `derelict` |
| `vulnerable` | 可被宣战 | 被宣战 → `besieged` |
| `besieged` | 有进行中的攻城 | 结算后：胜方获得 → `claimed`（新护盾）；防守方保住 → `vulnerable` + 24h 免疫 |
| `derelict` | 弃置 | 任何人可「清剿 NPC 守军」（PvE）后认领，避免永久占据 |

**反霸占**：`state='derelict'` 时原所有者仍可赎回（成本递增），但 14 天内无人认领则结构降级。

#### 7.12.5 争夺规则（防恶意与防碾压）

| 规则 | 取值 | 目的 |
|---|---|---|
| 宣战成本 | 反物质 + 改装券（按目标估值） | 提高骚扰成本 |
| 备战窗口 | 宣战后 12h 才结算 | 双方都有时间提交/调整舰队 |
| 舰队快照 | 只能由服务端生成（读 `ships`/`fleet_ships`），客户端不可提交 | 防伪造战力 |
| 单行星攻击频率 | 每 72h 至多 1 次 | 防车轮战 |
| 单玩家同时宣战 | ≤2 场 | 防刷 |
| 新护盾 | 易主后 24h | 防连锁崩盘 |
| 等级保护 | 防守方等级 < 攻击方 60% 时，攻击收益衰减 50% | 防高等级碾压低等级 |
| 联盟规模加权 | 联盟成员数进入宣战成本公式 | 防大联盟滚雪球 |
| 战败损失 | 结构降 1 级 + 储量 30% 被掠走（上限按仓储等级） | 有痛感但不归零 |
| 胜利战利品 | 上限为该行星 24h 产出 × 0.5 | 防越打越富 |

#### 7.12.6 结算事务（行星区域内，单库单事务）

```
BEGIN;
  SELECT * FROM world_planets WHERE universe_id=$1 AND planet_key=$2 FOR UPDATE;
  -- 校验：state='besieged' 且 siege_id 匹配且 claim_version 与快照一致
  -- 幂等：siege_id 已 resolved 则直接返回上次结果
  UPDATE world_planets
     SET owner_id=..., state='claimed', claim_version=claim_version+1, shield_until=now()+24h
   WHERE universe_id=$1 AND planet_key=$2 AND claim_version=$old;
  UPDATE world_planet_structures SET level=GREATEST(1, level-1), owner_id=... WHERE ...;
  UPDATE world_planet_deposits SET remaining=remaining*0.7 WHERE ...;
  INSERT INTO planet_ownership_history(...);
  INSERT INTO world_events(... seq = nextval);
  INSERT INTO ledger_transactions/ledger_entries(...);   -- 战利品与费用
  INSERT INTO outbox_events(...);                        -- siege.resolved
COMMIT;
```

任何一步失败整笔回滚，**不存在「行星已易主但战利品没发」的中间态**。战利品跨区转移见 7.12.7。

#### 7.12.7 跨区 saga（攻方 / 守方可能不在行星所在区）

参与者：`region_planet`（行星所在区，权威）、`region_attacker`、`region_defender`（各自 home region）。

```
T0  客户端 → region_planet: POST /world/planets/{key}/sieges
T1  region_planet: 建 siege(declared)，向两端请求「舰队快照 + 冻结」
        region_attacker/defender: 事务内写 fleet_freeze(player, siege_id)，返回快照
T2  region_planet: 存两端快照到 siege_participants，state=locked
T3  T0+12h：worker 取 seed=hash(siege_id) → 推演 → 单事务结算（7.12.6）→ state=resolved
T4  region_planet → Kafka: siege.resolved{attacker, defender, loot, losses}
T5  两端消费（幂等键 siege_id）：
        · 更新舰队损伤、释放冻结
        · 攻方入账战利品（若攻方在别的区，走「行星区扣减 → escrow → 目标区入账」）
        · 守方扣减被掠资源、结构降级同步（守方本地有只读副本时仅作展示，真相仍在行星区）
T6  任一端失败：重试 3 次（指数退避）→ DLQ → 告警；行星状态不回滚（已成事实），补偿走补偿交易
```

补偿表：

| 步骤 | 失败后果 | 补偿 |
|---|---|---|
| T1 冻结失败 | 无法开战 | 直接 `aborted`，全额退款（账本反向交易） |
| T3 结算前区故障 | 未结算 | `sieges` 保持 `locked`，恢复后重跑（seed 固定，结果可复现） |
| T4 事件丢失 | 两端未结算 | outbox 保证至少一次；消费端按 `siege_id` 幂等 |
| T5 目标区长时间不可用 | 战利品悬空 | 转入 `loot_escrow` 表，7 天内可人工/自动重放；超期按规则折算补偿 |

**不做**：跨区 2PC、跨区共享 `world_planets` 表、跨区同步调用链（行星区 → 攻方区 → 守方区串行）。

#### 7.12.8 分片与容量的具体规则

| 项 | 方案 |
|---|---|
| 分片键 | `shard_id = hash(universe_id + sector_key) % N`；`world_shards` 记录 `shard_id → region` |
| 粒度 | 一个 sector（10×10×10 之一）整体落在同一区，保证同星系竞争不需要跨区 |
| 负载 | 行星总数 / 活跃争夺数作为 `load_score`，控制面定期再平衡（冻结 → 复制 → 切换，流程同 home 迁移） |
| 热点 | 争夺是异步的，写峰值低；同一行星串行（行锁），跨行星并行 |
| 读 | 非行星区读异步副本（≤5s 延迟）；`GET` 返回 `synced_at`，UI 标注 |
| 容量 | 100 万行星 × ~0.6KB ≈ 600MB；`world_events`/`ownership_history` 按月分区，保留 24 个月 |

#### 7.12.9 从私有模式迁移到共享模式

`universes.world_mode` 一次性切换（不可逆，需维护窗口 + 公告）：

1. **预检**：统计每个 `planet_key` 被多少玩家认领（私有模式允许重叠）。冲突行星标记 `contested_migration`。
2. **抢占归属**：最早 `claimed_at` 者成为 `owner_id`；其余玩家获得补偿（按建造投入的 80% 走账本 `kind='migration_compensation'`）。
3. **数据搬迁**：`planet_modifiers/structures/deposits`（玩家作用域）→ `world_planet_*`（行星作用域），`applied_by` 保留原玩家。
4. **冲突合并**：同一目标的多条修正按「所有者优先，其余丢弃并记录」；储量取所有者那份。
5. **切换开关**：`world_mode='shared'`，旧表置只读并保留 30 天；期间玩家可申诉（走审计）。
6. **验收**：任意玩家打开任意行星，`materialize` 结果确定且无 5xx；账本补偿总额与审计条数一致。

#### 7.12.10 测试与验收

| 类型 | 用例 | 阈值 |
|---|---|---|
| 不变量 | 同一行星任意时刻 `owner_id` 唯一；`claim_version` 单调 | 属性测试 10 万次随机操作 |
| 幂等 | 同一 `siege_id` 结算 10 次 | 账本只增一次，结构只降一级 |
| 确定性 | 同 seed + 同快照，在 A/B 两区分别推演 | 战报 JSON 全等 |
| 跨区故障 | 结算瞬间强杀 `region_planet`；或断开目标区 | 恢复后结果一致，无重复发放 |
| 反作弊 | 伪造客户端舰队提交 | 全部被拒（快照只由服务端生成） |
| 负载 | 10k 场结算/日，集中 1 小时内 | p95 < 300ms，无死锁 |
| 收益守恒 | 战利品 = 被掠方扣减 - 系统损耗 | 差值进入系统账户，借贷平衡 |

#### 7.12.11 风险与「不要做」

| 风险 | 缓解 |
|---|---|
| 大联盟滚雪球、小玩家无生存空间 | 规模加权宣战成本 + 等级保护 + 新护盾 + 联盟人数上限 |
| 跨区 saga 半成功 | 单行星单事务 + outbox 至少一次 + 幂等 + escrow 表 + 人工重放工具 |
| 实时攻城的诱惑 | 明确不做：跨区实时攻城延迟不可控；实时 PvPvE 只在中立匹配实例中进行 |
| 世界数据被当缓存清理 | `world_planet_*` 与 `planet_*` 同级备份；`TRUNCATE` 权限收回；恢复演练覆盖行星重建 |
| 分片搬迁期间双写 | 搬迁用「冻结 → 复制 → 切换目录 → 解冻」，不允许双写 |
| 旧私有数据与新共享数据混用 | `world_mode` 单值开关；代码按模式选 delta 层，`materialize` 只接受一种组合 |

**明确不做**：跨区多主写同一颗行星；用 CRDT 解决所有权冲突；把 `world_planets` 放进 `universe_cache`；用实时 PvP 结果直接决定行星归属（必须走异步推演 + 单事务结算）。

---

## 8. 经济系统（核心）

### 8.1 双层结构

```
业务动作 ──▶ ledger_transactions (1 行)
                    │
                    ├─ ledger_entries: 玩家钱包  +120 antimatter
                    └─ ledger_entries: 系统账户  -120 antimatter   ← SUM = 0
                                   │
                                   ▼
                    触发器/服务层同步 wallets.balance（物化，供快速读取）
```

- **读余额只读 `wallets`**（O(1)），账本用于审计与对账。
- `wallets.balance` 由同一事务内 `UPDATE wallets SET balance = balance + :delta`（配合 `CHECK (balance >= 0)` 兜底），**不是**每次 SUM 账本。
- 每小时对账任务：`SUM(ledger_entries.delta) GROUP BY wallet_id` 与 `wallets.balance` 比对，偏差 > 0 告警并冻结该玩家写操作。

### 8.2 必须走账本的动作

采集、扫描产出、买卖、合同领奖、改装/升级扣费、空间站/舰队领取、图鉴达成奖励、残骸打捞、战斗战利品、维修、星区解锁、科技解锁、生产线投入与产出、NPC 交易、周/日奖励。

> 任何「直接改余额」的代码路径都不允许存在；code review 检查点。

### 8.3 反作弊与不变量

| 不变量 | 校验点 |
|---|---|
| 余额不为负 | `CHECK(balance>=0)` + 服务端预检 |
| 单笔交易借贷平衡 | 应用层断言 + 每小时对账 |
| 冷却未过 | `cooldowns.ready_at <= now()`，`UPDATE ... WHERE ready_at <= now()` 原子占用 |
| 库存充足 | `UPDATE market_quotes SET stock=stock-:n WHERE stock>=:n RETURNING` |
| 成本不超储物上限 | 服务端读取 `ships.level` 派生的上限再判（历史踩坑：造价 > 上限导致永远买不起） |
| 每玩家上限 | 空间站 ≤3、舰队 ≤3、合同同时 ≤2、联盟 ≤5（DB 约束或触发器） |

---

## 9. 时间与周期

- 全库 `timestamptz`，UTC。
- 玩家时区：`players.timezone text DEFAULT 'Asia/Shanghai'`（IANA 名，比 offset 更稳，自动处理夏令时）。
- 游戏日：`game_day = (now() AT TIME ZONE p.timezone)::date`，由服务端计算，写入相关表（`contracts.game_day`、`market_days.game_day`、`surface_samples.game_day`）。
- 周：ISO 周（`date_trunc('week', ...)::date`）。
- 冷却：`cooldowns(player_id, key, ready_at)`；`key` 规范：`scan:{planet_key}`、`collect:{planet_key}`、`salvage:{planet_key}`、`travel`。
- 离线累计：以 `last_settled_at` + 服务端 `now()` 计算 tick 数，封顶值存 `game_config`：
  - 空间站 16 tick × 15 分钟 = 4 小时；舰队 12 tick × 30 分钟 = 6 小时。
- 禁止：客户端上传时间戳参与计算（只允许作为日志元数据）。

---

## 10. 并发与一致性

### 10.1 锁协议

统一顺序，避免死锁：

1. `players` 行（`SELECT ... FOR UPDATE`，聚合根）
2. `wallets`（按 `resource_code` 字典序）
3. 业务表行（`ships`/`stations`/`contracts`…）
4. `outbox_events`（INSERT，无锁）

### 10.2 隔离级别

| 场景 | 级别 | 理由 |
|---|---|---|
| 账本写入、库存扣减 | `SERIALIZABLE`（或 `READ COMMITTED` + 显式行锁） | 防幻读导致超卖；捕获 `40001` 后重试 2 次（指数退避 20/60ms） |
| 其余读写 | `READ COMMITTED` | 性能 |
| 报表/排行 | 只读副本 + `REPEATABLE READ` | 一致性快照 |

### 10.3 幂等

- `idempotency_keys(key, account_id, route, request_hash, response jsonb, status, created_at)`，键由客户端生成 UUID。
- 命中且 `request_hash` 相同 → 直接返回缓存响应；`request_hash` 不同 → `409 idempotency_conflict`。
- TTL 24 小时，Celery 每小时清理。

### 10.4 事件外发（outbox）

业务事务内 `INSERT INTO outbox_events(...)`；Celery 每秒轮询未发布事件 → 推 P2P 广播/分析 → 标记 `published_at`。保证「状态提交即事件不丢」，且不阻塞请求。

---

## 11. 缓存与异步

### 11.1 Redis 用途（仅可重建数据）

| 用途 | Key | TTL | 失效 |
|---|---|---|---|
| 参考数据缓存（模块/科技/模板） | `ref:{table}:{version}` | 1h | 版本号变化自动换 key |
| 行情读缓存 | `mkt:{planet_key}:{game_day}` | 至当日结束 | 生成时写一次 |
| 排行榜 | `lb:{metric}` | 5 分钟 | worker 定时重算（源：只读副本 SQL） |
| 限流 | `rl:{player}:{route}` | 窗口 | Lua 原子 |
| 分布式锁（任务） | `lock:{job}` | 任务超时 | `SET NX PX` |

**不缓存**：钱包余额、冷却（一致性优先，直接查库，索引已覆盖）。

### 11.2 Celery 任务清单

| 任务 | 周期 | 说明 |
|---|---|---|
| `roll_market` | 每 10 分钟 | 为“即将被访问”的恒星系预生成当日行情（按访问热度队列），其余惰性生成 |
| `expire_contracts` | 每分钟 | `UPDATE contracts SET status='expired' WHERE expires_at<now() AND ...` |
| `settle_sleeping_players` | 每 15 分钟 | 对 4 小时内有活动的玩家预结算空间站/舰队（减少请求时计算） |
| `reconcile_ledger` | 每小时 | 对账；不平则告警 + 冻结 |
| `cleanup` | 每小时 | 幂等键、过期情报、过期邀请码、`job_runs` 旧记录 |
| `refresh_leaderboards` | 5 分钟 | 从只读副本聚合写 Redis + 物化视图 |
| `archive_partitions` | 每日 | 90 天前日志分区 DETACH + 归档到对象存储 |
| `outbox_relay` | 持续（1s 轮询） | 外发事件 |

---

## 12. API 契约

- 风格：REST + JSON；`/api/v1`；版本只增不改（破坏性变更升 v2）。
- 文档：OpenAPI 3.1 由代码注解生成，CI 校验 diff（防止忘记更新契约）。
- 错误：RFC 9457 `application/problem+json`
  ```json
  { "type": "https://atlas.local/errors/cooldown", "title": "冷却中", "status": 429,
    "detail": "扫描阵列冷却中", "retry_after_ms": 184000, "request_id": "..." }
  ```
- 并发：响应带 `ETag: "<state_version>"`；写请求可带 `If-Match`，不匹配返回 `412`。
- 分页：`?cursor=...&limit=50`（游标分页，不用 OFFSET）。
- 幂等：写操作 `Idempotency-Key` 必填；重复返回首次响应 + `Idempotent-Replay: true`。

### 12.1 端点分组（完整表见 v1 附录，此处只列分组与变更）

| 分组 | 前缀 | 说明 |
|---|---|---|
| 认证 | `/auth/*` | register/login/refresh/logout/verify |
| 会话与状态 | `/api/v1/me`、`/api/v1/state` | 首屏聚合（单请求返回资源/船/冷却概要） |
| 探索 | `/planets/{key}/collect`、`/scan`、`/surface/sample` | 服务端算奖励 |
| 市场 | `/markets/{planet_key}`、`/orders` | 报价只读，下单服务端结算 |
| 合同 | `/contracts`、`/contracts/{id}/accept|claim|abandon` | |
| 改装 | `/ships/{id}/modules/{code}`、`/overclock` | |
| 资产 | `/stations`、`/fleet` | |
| 成长 | `/tech/{code}`、`/sectors/{key}`、`/codex` | |
| 社交 | `/npcs`、`/alliances`、`/leaderboards` | |
| 战斗 | `/combats`、`/combats/{id}/turns` | 服务端状态机 |
| 世界行星 | `/world/planets/{key}`、`/world/planets/{key}/claim|abandon`、`/world/sieges`、`/world/sieges/{id}` | 归属写入只打行星所在区；攻城为异步推演（§7.12） |
| 存档迁移 | `/migrations/local-save` | 一次性导入 v3 存档（限流 + 审计） |

---

## 13. 必须下沉到服务端的计算（与前端公式对齐）

| 计算 | 前端现状 | 服务端落点 | 注意 |
|---|---|---|---|
| 采集奖励 | `SpaceshipResourceCollection.calculateReward` | `domain/gathering.py` | 递减计数改查 `collections` 的历史计数（前 3 次满额，之后 -15%/次，下限 0.4） |
| 扫描结果 | `PlanetScanSystem.rollOutcome`（哈希） | 同样的 FNV-1a 算法搬到 Python，输入 `planet_key|type|name|scans` | 必须逐字节复现，否则历史存档结果会变 |
| 市场行情 | `TradeSystem.getMarket` | `domain/market.py` + `market_days/market_quotes` | 同一 `planet_key|game_day` 只生成一次（`INSERT ... ON CONFLICT DO NOTHING`） |
| 合同刷新 | `ContractSystem.regenerate` | `contracts` + 模板表 | 当地日期分桶；`taken_by` 由服务端 roll（每日最多 1 份） |
| 改装成本/效果 | `ShipModules` 曲线 | `game_config` + `domain/refit.py` | 成本指数、收益 √；999 级上限 |
| 战斗 | `CombatSystem`（纯函数） | `combat_sessions` 状态机 | RNG 种子入库，回合可重放，防重滚 |
| 离线产出 | `Station/Fleet.settle` | 同上 + `last_settled_at` | 封顶值进 `game_config` |
| 排行 | `Residents.leaderboard` | 只读副本 SQL + Redis | 榜单 5 分钟延迟可接受 |

**不变量清单**（改任何一条都要同步 `tools/balance_report.py`）：成本指数 / 收益 √；模块 999；扫描冷却 8 分钟基数；空间站 4h；舰队 6h；合同 12h TTL；储物上限 = f(level) 且 ≥ 任何单笔成本。

---

## 14. 安全

| 面 | 措施 |
|---|---|
| 传输 | TLS 1.2+，HSTS；内网 PG 连接 `sslmode=require`（生产） |
| 凭据 | Argon2id；JWT RS256；私钥仅在 app 容器内存；refresh 哈希存储 |
| 数据库账号 | `atlas_migrator`（DDL）、`atlas_app`（DML，无 DDL，仅 `public` 授权）、`atlas_readonly`（副本） |
| 注入 | 全参数化；禁止 f-string 拼 SQL（CI 用正则扫描） |
| 越权 | repo 层强制 `player_id`；`wallets` / `planet_*` 建议强制启用 RLS（这两类数据一旦串号就是资金或资产损失） |
| 上传/输入 | `client_max_body_size 1m`；pydantic 强类型 + 长度/范围约束；拒绝 NaN/Inf |
| 审计 | `audit_log` 记录登录、领奖、存档导入、管理操作（含 IP、UA、player_id） |
| 隐私 | 提供账号删除（软删 + 30 天后物理删除 + 日志脱敏）；导出个人数据接口 |
| 防刷 | 全局限流 + 冷却 + 幂等；异常模式告警（同一玩家 1 分钟 100 次采集） |

---

## 15. 可观测性

| 类别 | 方案 |
|---|---|
| 日志 | 结构化 JSON：`ts, level, request_id, player_id, route, status, duration_ms, db_time_ms`；不记录 token/密码/邮箱明文 |
| 指标 | Prometheus：RED（rate/errors/duration）、DB 池使用率、慢查询数、Celery 队列长度与任务耗时、账本对账偏差、outbox 积压 |
| 追踪 | OpenTelemetry：请求 → SQL → Redis → Celery（`traceparent` 透传） |
| 告警 | p95 > 200ms（5min）、5xx > 0.5%、对账偏差 > 0、outbox 积压 > 1000、复制延迟 > 30s、磁盘 > 80% |
| 看板 | 4 块：业务（DAU/留存/经济产出）、接口健康、数据库（连接/锁/慢 SQL/复制）、任务 |

---

## 16. 备份与灾备

| 项 | 方案 |
|---|---|
| 物理备份 | `pg_basebackup` 每日 + WAL 连续归档（`archive_command` 到对象存储）→ PITR |
| 逻辑备份 | 每日 `pg_dump -Fc`（保留 7 天），用于误删单表恢复 |
| 演练 | 每月一次：在临时实例上 `restore + recovery_target_time` 到「1 小时前」，校验账本对账为 0，并抽查 100 颗 `planet_claims` 用 `materialize` 重算后与备份快照哈希全等（§7.11.8） |
| 主库故障 | 提升备库（`pg_ctl promote`）→ pgbouncer 重连 → 应用重试；目标 30 分钟内恢复 |
| 数据损坏 | 账本不可变 + 每小时对账 → 定位到具体 tx 与玩家，人工补偿走新的补偿交易（不改历史） |
| 迁移回滚 | Alembic `downgrade`；大表变更先在 staging 演练并测耗时 |

---

## 17. 测试策略

| 层 | 手段 | 覆盖目标 |
|---|---|---|
| 单元 | pytest，domain 服务纯函数化，时间与随机数注入 | 分支覆盖 ≥ 80% |
| 集成 | testcontainers 起 PG15 + Redis；每测试用事务回滚隔离 | 仓储与事务/锁行为 |
| 迁移 | 空库 → head；head → base → head；每步校验表结构快照 | 可回滚 |
| 契约 | 对 OpenAPI 做 schema 校验；前端 mock server 由 OpenAPI 生成 | 前后端不漂移 |
| 经济不变量 | 属性测试（Hypothesis）：随机动作序列后「余额 ≥0」「每 tx 平衡」「冷却单调」 | 资金安全 |
| 并发 | 并发 50 请求打同一采集接口，断言只成功 1 次（幂等+冷却） | 防双发 |
| 压测 | k6：300 RPS × 10 分钟，混合读写 7:3 | 达标 SLO |
| 故障注入 | 杀 Redis、暂停 PG、断网 30s | 降级与恢复 |
| 前端 | 现有 `npm run test:frontend`（33 项）保留，改为 mock fetch | 纯逻辑不回归 |

---

## 18. 迁移与灰度（strangler）

**原则**：服务端上线期间，旧前端必须一直可用；任何一步都能单独回滚。

| 阶段 | 做法 | 回滚 |
|---|---|---|
| M1 影子写 | 前端按现状本地写，同时异步 `POST /shadow/state` 落库（只写不读，失败静默） | 关开关即可 |
| M2 读切换 | `/state` 返回服务端数据，前端只读展示；本地仍写 | 开关回本地 |
| M3 写切换（分域） | 先换「探索/采集」，再「市场/合同」，再「资产/成长」，最后「战斗」；每域独立开关 | 单域回滚 |
| M4 本地降级 | localStorage 变纯缓存（只读）；离线时只读，禁止离线写 | — |
| M5 存档导入 | `/migrations/local-save` 接收 v3 导出文件（含 26 键 + 校验），生成首笔账本交易（`kind='migration'`），审计留痕 | 可重放（幂等） |

灰度对象：按 `player_id` 哈希分桶（1% → 10% → 50% → 100%），每档观察 24 小时：错误率、p95、对账偏差、客服工单。

---

## 19. 里程碑（M0–M6，另含 M0.5 行星缓存 / M5.5 玩家改造星球）

| 里程碑 | 交付 | 退出标准 | 估算 |
|---|---|---|---|
| M0 | 仓库内 `server/` 骨架（应用工厂、分层目录、配置、日志、健康检查）、Docker Compose（PG15/Redis/pgbouncer）、Alembic 初始化、CI（lint+test+migration check） | `curl /health/ready` 200；空库迁移到 head 并可 downgrade | 3–4 天 |
| M0.5 | 行星缓存迁 PG（§7.10）：`universe_cache` schema + `PgCacheManager` + 门面 + 双写/回填/切读 | 抽检 1000 key 与 fresh 生成全等；停 PG 可降级；4 worker 并发无锁冲突 | 2–3 天 |
| M1 | 账号/会话/令牌全套 + 限流 + 审计；`players`、`universes`、`resource_types` 播种 | 注册/登录/刷新/登出/重放检测通过；限流命中符合预期 | 4–5 天 |
| M2 | 账本 + 钱包 + 对账任务 + 幂等；`/me`、`/state` 读接口；影子写 | 对账偏差 0；并发采集只成功一次 | 5–6 天 |
| M3 | 探索域（采集/扫描/地表/星区/冷却/图鉴）权威化 | 改本地存储无效；p95 < 150ms | 6–8 天 |
| M4 | 经济域（市场/订单/合同/改装/生产线）+ 定时任务 | 行情/合同跨设备一致；过期任务准点 | 6–8 天 |
| M5 | 资产与成长（船/空间站/舰队/科技/维修）+ 社交（NPC/势力/联盟/排行） | 上限约束在库内生效；排行榜基于副本 | 6–8 天 |
| M5.5 | 玩家改造星球（§7.11）：`planet_*` 表 + 纯函数 `materialize` + 账本耦合 + 审计/配额 + 恢复演练 | `TRUNCATE universe_cache` 后玩家视图不变；并发双击只生效一次；恢复后 materialize 哈希全等 | 6–8 天 |
| M6 | 战斗状态机 + 存档导入 + 压测 + 灾备演练 + 全量灰度 | k6 300 RPS 达标；PITR 演练成功；灰度 100% | 6–8 天 |
| M6.5 | 多玩家共享行星（§7.12）：`world_planets/sieges` + 异步攻城推演 + 跨区 saga + escrow | 同 seed 跨区战报全等；结算 10 次只生效一次；跨区故障无重复发放 | 10–12 天 |

**总估**：约 6–7 周单人节奏（含测试与灰度），不可压缩到几天；任何「一周做完」的方案都会在数据一致性上翻车。

---

## 20. 风险登记册

| 风险 | 概率/影响 | 缓解 |
|---|---|---|
| 前端公式与 Python 复现不一致（扫描/采集结果漂移） | 高/高 | 先写「双跑对拍」脚本：同 1 万个输入，比对 JS 与 Python 输出，必须全等才切 |
| 账本与物化余额不一致 | 中/高 | 每事务同步更新 + 每小时对账 + 偏差即冻结 |
| 长事务拖垮连接池 | 中/中 | `statement_timeout=5s`、`idle_in_transaction=10s`、事务内禁止外部 IO |
| 迁移期间双写冲突 | 中/中 | 单向权威（M2 前只影子写，不读）；分域灰度；`state_version` 冲突即回退读本地 |
| 分区表自动维护缺失导致写入失败 | 低/高 | `archive_partitions` 提前建 3 个月分区；缺失即告警 |
| 单实例 beat 挂了任务不跑 | 中/中 | beat 用 Redis 锁选主 + 心跳告警；`job_runs` 记录可查漏 |
| 存档导入被滥用（伪造资源） | 中/中 | 导入仅允许一次/账号；上限校验（资源不得超过该等级理论上限）；审计 + 人工复核 |

---

## 附录 A · 仓库结构（建议）

```
moni-repo/
├─ server/
│  ├─ __init__.py            # create_app() 应用工厂
│  ├─ config.py              # 环境配置与自检
│  ├─ api/v1/                # 蓝图：auth, me, explore, market, contracts, ships, assets, growth, social, combat, migrations
│  ├─ domain/                # 业务规则（gathering, survey, market, contract, refit, station, fleet, tech, combat, ledger）
│  ├─ repo/                  # SQL 仓储（每域一个模块，全参数化）
│  ├─ infra/                 # db.py(pool), redis.py, logging.py, metrics.py, security.py
│  ├─ jobs/                  # celery_app.py, tasks.py, beat_schedule.py
│  ├─ models/                # pydantic 请求/响应模型
│  └─ migrations/            # alembic/
├─ tests/                    # unit / integration / contract / load
├─ docker-compose.yml        # pg15, redis, pgbouncer, app, worker, beat
└─ docs/SERVER_PG_DESIGN.md  # 本文档
```

## 附录 B · 核心表参考 DDL（草案）

```sql
-- 0001_core.up.sql（节选，Alembic revision 内容）
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE,
  password_hash text,
  email_verified_at timestamptz,
  status text NOT NULL DEFAULT 'guest' CHECK (status IN ('guest','active','locked','deleted')),
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('player','ops','admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_without_password CHECK (status <> 'active' OR password_hash IS NOT NULL)
);

CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  universe_id uuid NOT NULL REFERENCES universes(id) ON DELETE RESTRICT,
  slot smallint NOT NULL DEFAULT 1,
  display_name text NOT NULL DEFAULT '舰长',
  timezone text NOT NULL DEFAULT 'Asia/Shanghai',
  state_version bigint NOT NULL DEFAULT 0,
  last_settled_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, universe_id, slot)
);

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
  revoked_at timestamptz
);

CREATE TABLE wallets (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  resource_code text NOT NULL REFERENCES resource_types(code),
  balance numeric(20,4) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, resource_code)
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

CREATE TABLE ledger_entries (
  id bigserial,
  transaction_id uuid NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  wallet_id uuid,                       -- NULL 表示系统账户
  system_account_code text REFERENCES system_accounts(code),
  delta numeric(20,4) NOT NULL CHECK (delta <> 0),
  balance_after numeric(20,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((wallet_id IS NULL) <> (system_account_code IS NULL))
) PARTITION BY RANGE (created_at);

CREATE TABLE cooldowns (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  key text NOT NULL,
  ready_at timestamptz NOT NULL,
  PRIMARY KEY (player_id, key)
);
CREATE INDEX ON cooldowns (ready_at);

CREATE TABLE market_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_key text NOT NULL,
  game_day date NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (planet_key, game_day)
);

CREATE TABLE market_quotes (
  market_day_id uuid NOT NULL REFERENCES market_days(id) ON DELETE CASCADE,
  resource_code text NOT NULL REFERENCES resource_types(code),
  buy_price integer NOT NULL CHECK (buy_price > 0),
  sell_price integer NOT NULL CHECK (sell_price > 0),
  stock integer NOT NULL CHECK (stock >= 0),
  initial_stock integer NOT NULL,
  PRIMARY KEY (market_day_id, resource_code)
);

CREATE TABLE contracts (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  id text NOT NULL,
  template_code text NOT NULL REFERENCES contract_templates(code),
  metric text NOT NULL,
  target integer NOT NULL CHECK (target > 0),
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','claimed','expired')),
  taken_by text,
  target_galaxy point,
  target_distance integer,
  reward_multiplier numeric(6,2),
  accepted_at timestamptz,
  expires_at timestamptz,
  game_day date NOT NULL,
  PRIMARY KEY (player_id, id)
);

CREATE TABLE combat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  planet_key text,
  seed bigint NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','won','lost','fled','expired')),
  turn_no integer NOT NULL DEFAULT 1,
  state jsonb NOT NULL,      -- 仅战斗演示数据；HP/护盾/火力等判定字段另列
  player_hp integer NOT NULL,
  player_shield integer NOT NULL,
  enemy_hp integer NOT NULL,
  enemy_shield integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours'
);

CREATE TABLE idempotency_keys (
  key text PRIMARY KEY,
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  route text NOT NULL,
  request_hash text NOT NULL,
  response jsonb,
  status smallint NOT NULL DEFAULT 200,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox_events (
  id bigserial,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
) PARTITION BY RANGE (created_at);
CREATE INDEX ON outbox_events (created_at) WHERE published_at IS NULL;

-- 只 INSERT 的账本：撤销 app 角色的 UPDATE/DELETE
REVOKE UPDATE, DELETE ON ledger_entries FROM atlas_app;
```

**Alembic `0100_universe_cache`（行星缓存，见 §7.10）**

```sql
CREATE SCHEMA IF NOT EXISTS universe_cache;

CREATE TABLE universe_cache.cache_meta (
  universe_id uuid PRIMARY KEY,
  generator_version integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE universe_cache.galaxies (
  id bigserial PRIMARY KEY,
  universe_id uuid NOT NULL,
  x integer NOT NULL, y integer NOT NULL, z integer NOT NULL,
  data jsonb NOT NULL,
  generator_version integer NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (universe_id, x, y, z)
) WITH (fillfactor = 85);

CREATE TABLE universe_cache.systems (
  id bigserial PRIMARY KEY,
  universe_id uuid NOT NULL,
  x integer NOT NULL, y integer NOT NULL, z integer NOT NULL,
  system_index integer NOT NULL,
  data jsonb NOT NULL,
  generator_version integer NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (universe_id, x, y, z, system_index)
) WITH (fillfactor = 85);

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

-- 淘汰扫描：按 updated_at 最旧批删
CREATE INDEX ON universe_cache.galaxies (updated_at);
CREATE INDEX ON universe_cache.systems (updated_at);
CREATE INDEX ON universe_cache.planets (updated_at);

-- 缓存只给应用读写，不给删表权限（DDL 归 migrator）
GRANT USAGE ON SCHEMA universe_cache TO atlas_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA universe_cache TO atlas_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA universe_cache TO atlas_app;
```

**Alembic `0101_planet_data`（玩家改造星球，见 §7.11；与 `universe_cache` 严格分离）**

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
CREATE INDEX ON planet_claims (player_id, state);

CREATE TABLE planet_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL,
  planet_key text NOT NULL,
  target text NOT NULL,            -- surface_temperature / atmosphere / element:Iron ...
  op text NOT NULL CHECK (op IN ('add','mul','set')),
  value numeric(20,4) NOT NULL,
  source text NOT NULL,            -- structure_code / terraform / event
  generator_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, planet_key, target),
  FOREIGN KEY (player_id, planet_key) REFERENCES planet_claims(player_id, planet_key) ON DELETE CASCADE
);

CREATE TABLE planet_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL,
  planet_key text NOT NULL,
  structure_code text NOT NULL REFERENCES structure_definitions(code),
  level smallint NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 10),
  hp integer NOT NULL DEFAULT 100 CHECK (hp >= 0),
  status text NOT NULL DEFAULT 'building' CHECK (status IN ('building','active','damaged')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completes_at timestamptz,
  last_settled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, planet_key, structure_code),
  FOREIGN KEY (player_id, planet_key) REFERENCES planet_claims(player_id, planet_key) ON DELETE CASCADE
);
CREATE INDEX ON planet_structures (completes_at) WHERE status = 'building';

CREATE TABLE planet_deposits (
  player_id uuid NOT NULL,
  planet_key text NOT NULL,
  element text NOT NULL,
  remaining numeric(20,4) NOT NULL DEFAULT 0 CHECK (remaining >= 0),
  regen_per_hour numeric(20,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, planet_key, element),
  FOREIGN KEY (player_id, planet_key) REFERENCES planet_claims(player_id, planet_key) ON DELETE CASCADE
);

CREATE TABLE planet_audit (
  id bigserial,
  player_id uuid NOT NULL,
  planet_key text NOT NULL,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);

CREATE TABLE planet_events (
  id bigserial PRIMARY KEY,
  player_id uuid NOT NULL,
  planet_key text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON planet_events (player_id, created_at DESC);

-- 配额：每玩家最多 10 颗（示意触发器）
CREATE OR REPLACE FUNCTION planet_claims_quota() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM planet_claims WHERE player_id = NEW.player_id AND state = 'active') >= 10 THEN
    RAISE EXCEPTION 'planet_claim_quota_exceeded';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER planet_claims_quota_trg BEFORE INSERT ON planet_claims
  FOR EACH ROW EXECUTE FUNCTION planet_claims_quota();

-- 审计只追加
REVOKE UPDATE, DELETE, TRUNCATE ON planet_audit FROM atlas_app;
```

**Alembic `0102_world_planets`（共享行星与攻城，见 §7.12）**

```sql
CREATE TABLE world_shards (
  shard_id text PRIMARY KEY,
  region text NOT NULL,
  planet_count integer NOT NULL DEFAULT 0,
  load_score numeric(10,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE world_planets (
  universe_id uuid NOT NULL REFERENCES universes(id) ON DELETE RESTRICT,
  planet_key text NOT NULL,
  shard_id text NOT NULL REFERENCES world_shards(shard_id),
  owner_kind text NOT NULL DEFAULT 'none' CHECK (owner_kind IN ('none','player','alliance')),
  owner_id uuid,
  claim_version bigint NOT NULL DEFAULT 0 CHECK (claim_version >= 0),
  state text NOT NULL DEFAULT 'neutral'
    CHECK (state IN ('neutral','claimed','vulnerable','besieged','derelict')),
  claimed_at timestamptz,
  shield_until timestamptz,
  last_contested_at timestamptz,
  upkeep_due_at timestamptz,
  generator_version integer NOT NULL,
  PRIMARY KEY (universe_id, planet_key),
  CHECK (owner_kind = 'none' OR owner_id IS NOT NULL)
);
CREATE INDEX ON world_planets (shard_id, state);
CREATE INDEX ON world_planets (owner_id) WHERE owner_id IS NOT NULL;

CREATE TABLE world_planet_modifiers (
  universe_id uuid NOT NULL,
  planet_key text NOT NULL,
  target text NOT NULL,
  op text NOT NULL CHECK (op IN ('add','mul','set')),
  value numeric(20,4) NOT NULL,
  applied_by uuid NOT NULL,
  generator_version integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (universe_id, planet_key, target),
  FOREIGN KEY (universe_id, planet_key) REFERENCES world_planets(universe_id, planet_key) ON DELETE CASCADE
);

CREATE TABLE world_planet_structures (
  universe_id uuid NOT NULL,
  planet_key text NOT NULL,
  structure_code text NOT NULL REFERENCES structure_definitions(code),
  owner_id uuid,
  level smallint NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 10),
  hp integer NOT NULL DEFAULT 100 CHECK (hp >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('building','active','damaged')),
  captured_at timestamptz,
  last_settled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (universe_id, planet_key, structure_code),
  FOREIGN KEY (universe_id, planet_key) REFERENCES world_planets(universe_id, planet_key) ON DELETE CASCADE
);

CREATE TABLE world_planet_deposits (
  universe_id uuid NOT NULL,
  planet_key text NOT NULL,
  element text NOT NULL,
  remaining numeric(20,4) NOT NULL DEFAULT 0 CHECK (remaining >= 0),
  regen_per_hour numeric(20,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (universe_id, planet_key, element),
  FOREIGN KEY (universe_id, planet_key) REFERENCES world_planets(universe_id, planet_key) ON DELETE CASCADE
);

CREATE TABLE planet_ownership_history (
  id bigserial,
  universe_id uuid NOT NULL,
  planet_key text NOT NULL,
  from_owner uuid,
  to_owner uuid,
  reason text NOT NULL CHECK (reason IN ('claim','siege','abandon','decay','admin','migration')),
  siege_id uuid,
  at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (at);

CREATE TABLE sieges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  universe_id uuid NOT NULL,
  planet_key text NOT NULL,
  shard_id text NOT NULL,
  attacker_id uuid NOT NULL,
  defender_id uuid,
  attacker_fleet_id uuid,
  defender_fleet_id uuid,
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
CREATE INDEX ON sieges (state, resolve_at) WHERE state IN ('declared','locked','resolving');
CREATE INDEX ON sieges (planet_key, declare_at DESC);

CREATE TABLE loot_escrow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siege_id uuid NOT NULL REFERENCES sieges(id),
  target_player_id uuid NOT NULL,
  target_region text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','delivered','refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE (siege_id, target_player_id)
);

CREATE TABLE world_events (
  id bigserial PRIMARY KEY,
  universe_id uuid NOT NULL,
  planet_key text NOT NULL,
  seq bigint NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (universe_id, planet_key, seq)
);

REVOKE UPDATE, DELETE, TRUNCATE ON planet_ownership_history FROM atlas_app;
```

**索引清单（按查询设计，迁移时一并建）**

| 查询 | 索引 |
|---|---|
| 某玩家最近采集 | `ledger_transactions(player_id, created_at DESC)` 部分索引 `WHERE kind='collect'` |
| 对账 | `ledger_entries(transaction_id)`、`ledger_entries(wallet_id, created_at)` |
| 合同列表 | `contracts(player_id, game_day)`、`contracts(player_id, expires_at) WHERE status='accepted'` |
| 排行 | `players` + 聚合视图；副本上 `CREATE MATERIALIZED VIEW leaderboard_planets` + `REFRESH ... CONCURRENTLY` |
| 战斗未完成 | `combat_sessions(player_id, status) WHERE status='active'` |
| outbox 中继 | `outbox_events(created_at) WHERE published_at IS NULL` |

## 附录 C · 下一会话开工清单

1. 起 PG15（Docker `postgres:15` 或本机），建库 `atlas`，确认 `SELECT version();` 为 15.x。
2. 建三个角色：`atlas_migrator`（DDL）、`atlas_app`（DML）、`atlas_readonly`（副本只读）。
3. 落地 M0：`server/` 骨架 + compose + Alembic + CI + 健康检查。**M0 不写业务逻辑。**
4. 接着做 M0.5 行星缓存迁移（§7.10）：它与玩家状态正交，可独立验收、独立回滚，是唯一「不需要等账号体系就能先上线」的数据库改动。顺序：建 schema → 双写 → 回填 → 切读。
5. 每次只推进一个里程碑；每个里程碑结束跑：`pytest`、`alembic upgrade head && alembic downgrade base && alembic upgrade head`、`k6 smoke`、现有 `npm run test:frontend`、`npx tsc --noEmit`、`python test_fix.py`、`python test_p2p_redis.py`。
6. 切任何前端读写之前，先跑「JS ↔ Python 对拍」（同输入同输出），不一致不许切。
7. 密码 `123456` 只出现在本机 `.env`；提交前用 `git diff --cached | grep -i "123456"` 自查。
