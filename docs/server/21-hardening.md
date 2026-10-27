# 21 · 硬化、灰度与接入（实现记录）

> 对应 14/15 的工程化部分。记录已落地的开关、影子写、前端桥、Redis 榜单、邀请码、攻城规则、saga 步骤、CI/k6，以及仍需人工执行的 PITR/压测/灰度演练。

## 1. 灰度开关

- `feature_flags(name, mode, rollout_pct)`，`mode ∈ local|shadow|server`。
- `player_flag_overrides` 支持按玩家强制指定，24h 过期。
- 分桶：`sha1(player_id + ":" + flag)[:8] % 100 < rollout_pct`。
- 接口：`GET /api/v1/features` 返回每个域的实际 mode/enabled/bucket。
- 运营命令：

```bash
python -m server.cli flag-set domain.explore --mode shadow --pct 10
python -m server.cli flag-set domain.explore --mode server --pct 100
python -m server.cli flag-set domain.explore --mode local --pct 0
```

## 2. 影子写（M1）

- `POST /api/v1/shadow/state` 把前端 `_atlas*` 键原样存入 `player_shadow_state`（≤256KB）。
- `GET /api/v1/shadow/state` 用于对账/客服。
- 前端 `ServerApi.snapshot()` 扫描 localStorage 中所有 `_atlas*` / `__atlas*` 键（含 b64 编码键），不依赖硬编码 26 键清单，避免漏键。
- 只在浏览器 `localStorage._atlasServerMode` 为 `shadow` 或 `server` 时启用；默认 `off`，对现有玩家零影响。

## 3. 前端接入

新增 `atlas-ui/react/static/js/Utils/ServerApi.tsx` 与 `ServerBridge.tsx`：

- `_atlasServerBase`：API 根（默认 `http://127.0.0.1:8000`）。
- `_atlasServerMode`：`off|shadow|server`。
- 设备 ID 存 `_atlasDeviceId`，`POST /api/v1/session` 换 access token；15 分钟过期后先试 cookie refresh，失败则重新 `session`（同一 device_id 仍绑定同一 player）。
- `shadow`：本地采集照旧，1.5s 去抖后推送快照；`resources_updated` 与 60s 心跳触发。
- `server`：`ResourceCollectionButton` 改调 `POST /planets/{key}/collect`，用服务端 `gained` 入账并标记本地冷却；失败不偷偷回落本地，避免双写。
- CORS 需服务端 `ATLAS_CORS_ORIGINS` 包含前端源（示例已给 `http://127.0.0.1:6424`）。
- 已切到服务端写入的探索动作：采集、扫描、地表取样、星区解锁（`ResourceCollectionButton` / `ScanTab` / `SurfaceSurvey` / `StationTab`）。`server` 模式下这些动作不再调用本地计算，服务端结果回写本地冷却/次数/许可缓存；失败不回落本地，避免双写。
- 经济域已切：`TradeTab` 在 `server` 模式走 `/market` + `/market/buy|sell`，服务端报价/库存/余额回写本地缓存；`ContractTab` 走 `/contracts` + `/accept|claim`，服务端合同映射为本地卡片，放弃按钮仅本地合同可用。
- 资产域已切：`StationTab` 在 `server` 模式读 `/assets`、建站/模块/领取走服务端；`FleetPanel` 招募/任务/领取走服务端；`ShipyardTab` 改装/超频/维修与 `TechTab` 科技解锁走服务端。本地缓存用 `applyServerRefit/Overclock/Hull/Unlock` 回写。
- 飞船等级升级 `SpaceshipPanel` 也走 `POST /ship/upgrade`，`UnifiedSpaceshipStorage.applyServerLevel` 回写本地属性；本地无资源时不再禁用按钮，由服务端校验。
- 战斗 `CombatPanel` 在 `server` 模式改走 `/combat/start` + `/combat/{id}/action`，服务端 HP/护盾/回合/战利品映射为现有 UI；挑战赛仍用本地算法。
- 攻城新增 `SiegePanel`（挂在 `StationTab`）：`GET /world-planets/{key}`、占领、宣战、加入、领取战利品。
- 改装券服务端化：`POST /ship/modules/{code}/refit` 接受 `{use_voucher:true}`，成本 ×0.5、扣 `player_flags.vouchers`；无券返回 422，响应 `applied.voucher_used/vouchers`。
- 战斗护航：开局把至多 2 艘 `idle` 舰队快照进 `combat_sessions.escorts`，开火时叠加火力，敌方 35% 概率打护航舰；每回合 `log` 返回 `escort_hit`，前端展示剩余舰名/HP。
- 攻城详情：`GET /sieges/{id}` 返回 `resolve_at / attacker_power / defender_power / participants`；`SiegePanel` 每秒倒计时并列出参战玩家与舰队 power。
- 残骸：新增 `GET /wrecks`，`ScanTab` 在 `server` 模式读取服务端残骸并调用 `POST /planets/{key}/salvage`，奖励入本地资源。
- 图鉴：新增 `POST /planets/{key}/visit`（记录 planet type + elements），`PlanetInfo` 在 `server` 模式改为调用它；`CodexTab` 从 `GET /codex` 读取并映射到 planets/elements/lifeForms 三栏，未发现项仍隐藏。
- 挑战码服务端化（`0105_challenge`）：
  - `POST /challenges` 由服务端按当前飞船等级/船体/武器/护盾签发 `ATL1-…`，存 `challenge_codes`（30 天有效、记录被挑战次数）。
  - `GET /challenges/{code}` 校验并返回快照；`POST /challenges/{code}/fight` 创建 `mode='challenge'` 的战斗会话，敌方 HP/护盾/火力来自签发快照。
  - 挑战战斗不产生战利品、不扣船体、不写残骸/合同击杀；`CombatPanel` 在 `server` 模式走 `challengeStart`，`ResidentsTab` 生成/输入挑战码都改走服务端。旧本地 `ATL1-` 码在服务端不存在，会返回 404。
- NPC：新增 `POST /residents/{id}/meet`（`npc_relations` upsert、`last_met_at`），`GET /residents` 返回 `met/favor/trades/last_met_at`；`ResidentsTab` 在 `server` 模式用服务端名册，未相遇居民可“打招呼”。
- 每日任务（`0106_tasks`）：`task_definitions` 播种 3 个任务，`player_tasks` 按 game_day 懒建；`GET /tasks`、`POST /tasks/{code}/claim`；采集推进 `antimatterCollected/planetsDiscovered`，行星访问推进 `planetsDiscovered`，星区解锁推进 `galaxiesVisited`；奖励走 `task_reward`(quest) 账本。
- 图鉴奖励（`0107_codex_claims`）：`GET /codex` 返回 `sections(found/total/complete/claimed)`；`POST /codex/{section}/claim` 集齐后发奖（planets/elements/lifeForms），一次领取；`CodexTab` 在 server 模式显示领取按钮。
- 势力声望：`GET /factions` 返回 `factions + reputation{sector_key:rep}`；战斗胜利按 `faction_service.record_kill` 更新 `faction_reputation`（掠夺者 -1、巡逻队 +1、无主 0，夹在 -10..10）；`ServerBridge` 每 60s 拉取并 `FactionSystem.applyServerRep`，StationTab/TradeSystem 直接读到服务端声望。
- 排行榜：`ResidentsTab` 在 `server` 模式读 `GET /leaderboard`（船级 Top50），标题改为“舰船等级排行”；本地模式仍用探索量派生。
- 宇宙对齐（`0108_universe_seed_numeric`）：旧 Atlas 的 `seed` 是 `int(sha256(seed_str),16)`（最多 78 位），`bigint` 放不下。把 `universes.seed` 改为 `numeric(80,0)`，新增 `python -m server.cli universe-align --atlas-ini atlas.ini --seed-name atlas-main`，把服务端宇宙种子对齐到旧应用；之后旧页面的 `planet_key` 在服务端可解析，`server` 模式不再 404。前端 `ServerApi` 对本地宇宙固定使用 `atlas-main`（远程 multiverse 保留 seed_name），并支持 `/?server=server` 一次性切到服务端模式。

## 4. 已补的规则/内容

| 项 | 实现 |
|---|---|
| Redis 榜单 | `GET /leaderboard` 先读 `lb:{universe}:{limit}`（15s TTL），未命中回 PG；Redis 掉线自动回源 |
| 联盟邀请码 | `POST /alliances/invites`（仅盟主）、`POST /alliances/join-code`；24h 过期、一次性 |
| NPC/势力 | 迁移种子 4 个势力；`GET /residents` 按宇宙幂等播种 6 名居民并返回好感/交易次数 |
| 攻城冷却 | 同一攻击者对同一行星 72h 内只能宣战一次（`429 cooldown`） |
| 等级保护 | 目标 `world_planets.level` 高出攻击者飞船等级 ≥5 时拒绝 |
| 舰队快照 | 宣战/参战按当前非 idle 舰队数×50 计入 `siege_participants.fleet_power` 与 `attacker_power` |
| 跨区 saga | `saga_steps(saga_id, step, status, attempts)` 记录 `transfer_ownership / escrow_loot / close_siege`；单库仍是一笔事务，跨库时按步骤幂等重放 |

## 4.1 本地存档导入（M5）

- `0104_local_save_import` 建 `local_save_imports(player_id PK, payload_hash, keys_count, imported)`；每角色只能成功一次。
- `POST /api/v1/migrations/local-save`：`{keys: {name: decoded_text}}`，可带 `sha256`；服务端按规范 JSON 重算并校验。
- 识别并导入：`_atlasSpaceShip.r` → 12 资源（走 `migration` 账本，幂等键 = 玩家）、`u.l` → 飞船等级、`u.mds` → 模块等级（校验 `module_definitions`）、`_atlasHull.hull`、`_atlasSectors.unlocked`、`_atlasTech.unlocked`。
- 返回 `imported` 摘要；`GET /api/v1/migrations/local-save` 查状态。未识别的键只参与哈希/计数，不落库。
- 前端 `ServerApi.importLocalSave()` 用 `b64.decodeStoredValue` 解码后提交；`SpaceshipPanel` 数据导出区在非 `off` 模式出现「服务器」按钮。

## 5. CI 与压测

- `.github/workflows/server.yml`：Postgres 15 service → 建库 → `server.cli migrate` → `compileall` → `pytest`。
- `ops/k6/collect.js`：

```bash
k6 run -e BASE_URL=http://127.0.0.1:8000 -e VUS=50 -e DURATION=2m ops/k6/collect.js
```

阈值：`http_req_failed < 1%`、`p95 < 300ms`。压测数据只用于容量评估，不写入生产。

## 6. PITR / 回滚演练（人工执行）

1. 确认 `archive_mode=on`、`archive_command` 已配置，`pg_stat_archiver` 无失败。
2. 每日全量 + WAL 归档到对象存储；保留 ≥7 天。
3. 演练：新实例 `restore_command` 拉 WAL，`recovery_target_time` 指到故障前 1 分钟，`promote` 后跑 `reconcile_ledger`，偏差必须为 0。
4. 回滚矩阵按 14 §4：域写入异常 → 该域 `flag-set ... local`；对账偏差 → 全局停写 + 补偿交易；迁移失败 → `alembic downgrade`。

**未做**：自动 PITR 脚本、真实 k6 报告、生产灰度观察结论、跨区 2PC（单库用事务 + saga 步骤代替）。这些需要真实环境执行，代码侧不伪造结果。

## 7. 验收对照

- [x] 每域独立 flag + 玩家强制指定
- [x] 影子写接口与前端桥（默认 off）
- [x] Redis 榜单、邀请码、NPC/势力种子、攻城冷却/等级保护/舰队快照
- [x] CI 工作流与 k6 脚本
- [ ] 真实 PITR 演练、k6 报告、四档灰度观察（需环境）
- [x] 探索域（采集/扫描/地表/星区）server 写入切换
- [x] 经济域（行情/买卖、合同接取/结算）server 写入切换
- [x] 资产域（空间站/舰队/改装/超频/维修/科技）server 接入
- [x] 飞船升级、战斗、攻城 server 接入
- [x] 改装券、战斗护航/日志、攻城倒计时/参战列表
- [x] 改装券、护航、攻城详情、残骸、图鉴访问/奖励、挑战码、NPC 相遇、每日任务
- [x] NPC 交易、势力声望、服务端排行榜
- [x] 服务端宇宙 seed 对齐（旧 planet_key 可解析）
- [ ] 图鉴 lifeForms 来源、真实 PITR/k6/灰度记录
