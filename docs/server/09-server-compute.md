# 09 · 服务端计算（逐公式详细设计）

> 对应主文档 §13。本篇把每个需要下沉的公式写到「给定输入就能算出唯一结果」的粒度，并给出边界、取整、复现方式。
> 所有常数必须来自 `game_config` 或参考数据表；文中数值是**当前基线**，改动需同步 `tools/balance_report.py`。

---

## 1. 通用约定

| 项 | 约定 |
|---|---|
| 取整 | 中间量保留 double，**最后一步** `floor`；仅当前端用 `round` 时才用 `round` |
| 哈希 | FNV-1a 32 位（与 `PlanetScanSystem.hashText` 等价：`h ^= c; h = (h * 16777619) & 0xFFFFFFFF`） |
| 随机流 | LCG：`state = (state * 16807) % 2147483647`，`next = (state-1)/2147483646` |
| 时间 | 服务端 UTC；游戏日按 `players.timezone` |
| 顺序 | 同一乘区叠乘顺序固定，避免浮点结合律差异 |

**统一收益公式**：

```
final = base × Π(multipliers)          # 各项乘数如下文
```

---

## 2. 采集（collect）

### 2.1 基础资源

```
base(resource) = Σ_element  element_value(element) × weight(resource, element)
```

- `element_value`：元素价值表（`resource_types` 同级的参考数据，范围 1–12）。
- `weight`：元素→资源映射（如 `Iron→quantum_alloy 0.4`）。
- 无元素数据时：`base = coordinate_variation(coords)`，`variation = 0.5 + hash(coords)/2^31 × 1.5`。

### 2.2 递减

```
count  = planet_scans 该玩家该行星的历史采集次数（collections 计数）
dimin  = count <= 3 ? 1 : max(0.4, 1 - (count - 3) × 0.15)
```

| count | 1 | 2 | 3 | 4 | 5 | 9 | ≥12 |
|---|---|---|---|---|---|---|---|
| dimin | 1.00 | 1.00 | 1.00 | 0.85 | 0.70 | 0.40 | 0.40 |

### 2.3 乘区（按此顺序）

| # | 乘区 | 值 | 来源 |
|---|---|---|---|
| 1 | 递减 | 见 2.2 | `collections` 计数 |
| 2 | 随机 | `0.9 + rng() × 0.2` | seed = `hash(planet_key|day|"collect")` |
| 3 | 船乘数 | `u.m`（1 + 等级成长） | `ships.level` 派生 |
| 4 | 模块 | `1 + sqrt(warpCoil.lv) × oc / 100` 上限由曲线定 | `ship_modules` |
| 5 | 船体 | `0.5 + 0.5 × hull/100` | `player_flags.hull` |
| 6 | 星区 | 已许可 `1.2`，否则 `1.0` | `sector_licenses` |
| 7 | 宇宙事件 | 采集类 ×1.30 / 其他 1.0（仅命中星区） | `CosmicEvents` |
| 8 | 对手标记 | `0.85`（该行星被标记） | 周键哈希 |
| 9 | 联盟 | `1 + min(0.10, 0.02 × 成员数)` | `alliance_members` |
| 10 | 科技 | `1 + 0.04 × mining 级数` | `tech_nodes` |

### 2.4 上限与边界

- 单次单资源产出 ≤ `storage × 0.25`（防一次爆仓）。
- 结果 < 1 且 base ≥ 1 → 取 1（避免「有的元素永远采不到」）。
- 冷却未过 → `429 cooldown`，不计算、不落账。

### 2.5 算例

输入：`base.antimatter=48`，`count=5`，`rng=0.37`，船乘数 1.15，warpCoil lv=10（+3.16%），hull=80（0.9），星区已许可 1.2，无事件，被标记 0.85，联盟 2 人（1.04），科技 2 级（1.08）。

```
48 × 0.70 × (0.9+0.074) × 1.15 × 1.0316 × 0.9 × 1.2 × 1.0 × 0.85 × 1.04 × 1.08
= 48 × 0.70 × 0.974 × 1.15 × 1.0316 × 0.9 × 1.2 × 0.85 × 1.04 × 1.08
≈ 41.6 → floor = 41
```

---

## 3. 扫描（scan）

### 3.1 结果档位

```
r = rng(hash(planet_key | planet_type | scans | "scan"))     # 0..1
kind = r < 0.06 ? 'relic' : r < 0.30 ? 'rich' : r < 0.75 ? 'normal' : 'barren'
```

| kind | 产出 | 额外 |
|---|---|---|
| `relic` | 1 件远古遗物 + 少量晶体 | 记录遗迹档案；`relicScans` +1 |
| `rich` | 2–3 种资源，量 ×1.6–2.2 | — |
| `normal` | 1–2 种资源，量 ×0.8–1.4 | — |
| `barren` | 无产出 | 仍消耗冷却与氘 |

### 3.2 冷却

```
reduction = min(0.90, sqrtCurve(9, scanArray.lv) × overclockFactor(scanArray) / 100)
cooldown_ms = 480_000 × (1 - reduction) × station_scan_mult × tech_survey_mult
```

- `station_scan_mult = 1 - min(0.25, 0.02 × 观测舱等级)`
- `tech_survey_mult = 1 - min(0.20, 0.03 × survey 级数)`
- 下限：`cooldown_ms ≥ 30_000`（30 秒，防刷）

算例：scanArray Lv9（sqrtCurve≈90 → 0.90 上限）、观测舱 Lv3（0.94）、科技 2 级（0.94）：

```
480000 × (1-0.90) × 0.94 × 0.94 = 48000 × 0.8836 ≈ 42_413 ms ≈ 42.4s
```

### 3.3 星区加成

```
outcome.yield[res] = max(1, round(v × sector_factor))     # sector_factor = 1.2 或 1.0
```

---

## 4. 市场（market）

### 4.1 生成（每日一次）

```
rng = LCG(hash(planet_key | game_day | "market"))
pool = 该行星可交易资源（按元素/类型）
选取 3 种：for i in 3: idx = rng.int(0, len(pool)-1); pool.splice(idx,1)
buy_price  = max(2, round(base × (0.65 + rng()×0.7) × tradeBuyMult × (raided?1.08:1) × factionMult))
sell_price = max(1, round(base × SELL_RATIO(0.45) × station_sell × cosmic_sell × tech_trade))
stock      = max(1, round((4 + hash(key)%13) × (raided?0.8:1)))
```

### 4.2 成交

```
buy:  cost = buy_price × qty;  库存条件更新：stock >= qty
sell: gain = sell_price × qty; 玩家库存条件更新
```

**显示价 = 成交价**：所有加成在生成时烘焙进 `buy_price/sell_price`，`sell()` 不得二次加价（历史 bug：显示 10 实收 10.3）。

### 4.3 边界

- `stock = 0` → `409 out_of_stock`，不生成订单。
- 数量 ≤ 9999；单价 ≤ 10^6。
- 每日首个访问触发惰性生成；worker 只预热活跃行星。

---

## 5. 合同（contracts）

### 5.1 刷新

```
today = (now() AT TIME ZONE player.timezone)::date
if contracts.game_day != today: 重新生成 3 份
候选 = 基础模板(3) + 专家模板(需模块等级满足，2 选 1)
taken_by: hash("taken|"+today) % 100 < 25 时，随机 1 份标记 NPC 接取
```

### 5.2 奖励

```
reward(res) = round(base(res) × distance_mult × module_bonus)
distance_mult = 1 + min(1.0, target_distance / 5_000_000)
module_bonus  = 1 + min(1.0, 0.02 × Σ 相关模块等级 × ocFactor)
```

| 合同 | base 资源 | 目标 metric |
|---|---|---|
| 深空巡检 | 反物质 220–380 | scans 8–14 |
| 贸易护航 | 氘 120–200 + 合金 20–36 | trades 5–9 |
| 矿脉开采 | 合金 30–60 | collections 20–40 |
| 遗迹调查 | 晶体 6–12 + 券 1 | relicScans 3–5 |
| 清剿航道 | 等离子 18–30 + 回路 10–18 | kills 2–4 |

### 5.3 进度

只在「指标匹配 + 位置匹配（若绑定）+ 状态 accepted + 未过期」时 +1；同一次动作最多推进 1 份合同（取最早接受的一份），避免一次扫描推进多份。

### 5.4 过期

`expires_at = accepted_at + 12h`；worker 每分钟置 `expired`；过期后进度保留但不给奖励。

---

## 6. 改装 / 超频 / 科技

### 6.1 改装成本

```
cost(level) = round(base_cost × GROWTH^level)     # GROWTH=1.35，base 因模块而异
```

| 模块 | base（反物质当量） | 曲线 |
|---|---|---|
| scanArray | 120 | 1.35^n |
| cargoBay | 140 | 1.35^n |
| warpCoil | 160 | 1.35^n |
| archivist | 220 | 1.38^n |
| weaponArray | 180 | 1.36^n |
| shieldMatrix | 200 | 1.36^n |

### 6.2 效果

```
effect = sqrtCurve(cap, level) × overclockFactor      # cap 因模块而异（8/9/5…）
```

`overclockFactor = 1 + 0.05 × oc`（oc ∈ 0..3，Lv ≥ 10 才可加）。

### 6.3 超频成本

```
overclock_cost = refit_cost(next_level) × 2^(oc+1)     # ×2 / ×4 / ×8
```

### 6.4 科技

| 分支 | 效果 | 上限 |
|---|---|---|
| mining | 采集 ×(1 + 0.04×级) | 无 |
| travel | 燃料 ×(1 − 0.03×级) | −20% |
| survey | 冷却 ×(1 − 0.03×级) | −20% |
| trade | 卖价 ×(1 + 0.03×级) | 无 |

成本：T1 300 反物质；T2 800 + 20 合金；T3 2000 + 10 晶体；T4 5000 + 2 遗物。

---

## 7. 离线产出

### 7.1 空间站

```
ticks = floor((now - last_settled_at) / 15min)
applied = min(ticks, 16)
yield_am = applied × (2 + 3×√production_level)
yield_d  = applied × max(1, floor(production_level/2))
if ticks > 16: last_settled_at = now    # 超出丢弃，不顺延
```

### 7.2 舰队

```
ticks = floor(Δ / 30min); applied = min(ticks, 12)
mine   → am 3/tick, d 1/tick
survey → ex 1/tick, nd 1/tick
trade  → am 6/tick
```

### 7.3 共同约束

- 结算在写事务内进行，`SELECT ... FOR UPDATE` 锁行。
- 结算必须写账本（`station_yield` / `fleet_yield`）。
- 领取是「把 stored 转 wallets」，同样走账本并清零 `stored`。

---

## 8. 战斗与维修

### 8.1 属性

```
player.hp     = round(40 + hull × 0.6)
player.shield = 4 + 3 × shieldMatrix.lv (×oc)
player.firepower = 6 + 4 × weaponArray.lv (×oc)
enemy.scale   = 0.6 + rng() × 0.6
enemy.hp      = max(20, round(player.hp × scale))
```

### 8.2 单回合

```
raw = max(1, round(attacker.firepower × (0.8 + rng()×0.4) × mitigation))
absorbed = min(defender.shield, raw); defender.shield -= absorbed
defender.hp -= (raw - absorbed)
```

- `mitigation`：规避 0.5，其余 1.0。
- 护航舰：火力叠加；敌方 35% 概率打护航舰。

### 8.3 维修

```
missing = 100 - hull
cost = { antimatter: 4 × missing, quantum_alloy: ceil(missing / 8) }
```

---

## 9. 攻城（联动物行星，见 18）

```
seed = hash(siege_id)            # declared 时固定
power(attacker) = Σ 参战舰队 (firepower × (1 + tech/100))
outcome = power_a / (power_a + power_d) > 0.5 ? attacker_won : defender_held
losses  = 按双方 power 比例与随机因子 0.8–1.2 计算
```

规则：**快照只由服务端生成**；客户端不可提交；结算可重放（同 seed 同结果）。

---

## 10. JS ↔ Python 对拍

### 10.1 固定点（必须完全一致）

| 项 | JS | Python |
|---|---|---|
| 哈希 | `Math.imul` | `& 0xFFFFFFFF` 乘法 |
| 取整 | `Math.floor` | `math.floor` |
| 随机流 | `state * 16807 % 2147483647` | 同式，整数运算 |
| 数组取样 | 先 splice 再取 | 同序 |
| JSON 键序 | `sort_keys=True` 比较 | 同 |

### 10.2 流程

```
1. 生成 10,000 组输入（planet_key/type/level/count/timezone）
2. node 跑前端实现 → out_js.json
3. python 跑新实现 → out_py.json
4. diff 必须为空；非空则修 Python（不改 JS 迁就历史）
5. 差异案例进 tests/parity/fixtures/
```

### 10.3 切换到服务端的四步

| 步 | 动作 | 观察 |
|---|---|---|
| 1 | 影子计算（只记录） | 差异率 → 0 |
| 2 | 展示切服务端值（不写回） | 用户无感知 |
| 3 | 写入切服务端（前端只发意图） | 对账 0 |
| 4 | 删除前端可写路径 | 无回归 |

---

## 11. 不可改数值

| 项 | 值 | 备注 |
|---|---|---|
| 模块等级上限 | 999 | 数字边界 |
| 扫描冷却基数 | 480,000 ms | 下限 30,000 |
| 空间站 tick / 封顶 | 15 min / 16 | 4 小时 |
| 舰队 tick / 封顶 | 30 min / 12 | 6 小时 |
| 合同 TTL | 12h | — |
| 采集递减 | 3 次后 −15%，下限 0.4 | — |
| 储物上限 | `f(level)`，≥ 任意单笔成本 | 历史坑 |

---

## 12. 验收

- [ ] 10,000 组对拍 100% 一致
- [ ] 每个公式有「算例」测试（固定输入 → 固定输出）
- [ ] 收益上限、冷却下限、封顶三项边界测试
- [ ] 前端不再有可写路径
- [ ] `balance_report.py` 结果与新实现一致

## 13. 相关文档

- 账本落账：[05-economy-ledger.md](05-economy-ledger.md)
- 时间与冷却：[06-time-and-concurrency.md](06-time-and-concurrency.md)
- 行星改造产出：[17-player-planets.md](17-player-planets.md)

---

## 14. 实现记录：行星元素权威（2026-10-25）

- 新增纯函数模块 `pymodules/__planet_elements.py`，不依赖 Flask/config，种子链与 `Planet` 完全一致：
  `galaxy_seed = sha256("{universe_seed}-{b64^12(seed)}-{x}-{y}-{z}")` →
  `system_seed = sha256("{galaxy_seed}-{b64^8(seed)}-{index}")` →
  `name_seed = sha256("{system_seed}-{b64^4(seed)}-{planet_index}")` →
  `planet_seed = sha256("{name_seed}-{name}-{b64^4(seed)}")`。
- 元素抽取按 `Planet.generate_elements_for_planet` 原样实现（先 `random.choice` 定类型，再 reseed 后 `sample(2)` + 加权补足 5–10 个）；`generate_name` 会重置全局 RNG，已加锁串行，避免并发请求互相污染。
- 元素 → 资源表不再手写：`tools/gen_element_resources.py` 从 `ElementResourceValues.tsx` 生成 `pymodules/__element_resources.py`（120 条，`--check` 可做 CI 漂移守卫）。
- 新接口 `GET /api/v1/planets/{planet_key}`（需登录、120/min）返回 `name/planet_type/elements/resources`；服务端用 `universes.seed` 重算并校验名字，名字不匹配返回 404，改客户端无法伪造元素。
- 采集改用元素求和作为 base（`CollectContext.base_resources`），无有效 key 时回落坐标公式，并在响应 `planet.source` 标注 `generated|fallback`。
- 读穿缓存：`universe_cache.planets`，namespace 为 `uuid5("atlas-api-universe:" + universes.id)`，`cache_meta.generator_version` 控制失效；运维用 `python -m server.cli planet-cache-version --universe-id <universes.id>` 提升版本。
- 对拍：`test_fix.py::PlanetElementParityTests` 用同一 universe seed 对比 `Planet.name / planet_type / elements / resources`，全部相等；服务端另有单测与接口集成测试。
- 边界：服务端宇宙 seed 与旧 `atlas.ini` 宇宙不同，旧客户端传来的 planet_key 会走 fallback；前端切到服务端宇宙（P1）后名字与元素才逐字一致。旧存档导入（M6）需要把原宇宙 seed 映射进 `universes`。

---

## 15. 实现记录：M3 探索域（2026-10-25）

本轮补齐扫描、地表取样、星区许可与图鉴；残骸打捞依赖 M6 的 `wrecks` 生成方，暂未开接口。

- 扫描 `POST /api/v1/planets/{key}/scan`：
  - 结果档位严格按 §3.1：`r < 0.06 relic`、`< 0.30 rich`、`< 0.75 normal`，其余 `barren`；RNG = `LCG(hash(planet_key|planet_type|scans|scan))`，`scans` 为含本次的 1-based 计数。
  - `relic` 固定 1 远古遗物 + 2–5 晶体；`rich` 2–3 种、`normal` 1–2 种，数量按档位系数缩放；星区已许可 ×1.2。
  - 冷却 = `base × (1 - min(0.90, round(9√lv × oc)/100)) × (1 - min(0.20, 0.03×survey))`，`base/floor` 取自 `game_config`（480000/30000ms）。
  - 氘消耗 `max(2, 6 - scanArray.lv)`，先记 `scan_cost`（sink）再记 `scan`（loot），两笔同事务；氘不足整笔回滚，冷却不落库。
  - 每次扫描写入 `planet_scans`（scans/last_at），图鉴写 `planet` + 前 3 个 `element`，`state_version++`，outbox 事件 `planet.scanned`。
- 地表 `GET /api/v1/planets/{key}/surface` 与 `POST .../surface/sample`：
  - 8×8 网格值 = `(hash("surface|planet_key|cell") % 1000)/1000`；前端渲染网格，服务端用同一函数复算所选格。
  - 产出 `antimatter=round(10+value×60)`、`deuterium=round(2+value×6)`，`value>0.9` 额外晶体；每日每行星 3 次，`surface_samples` 条件 upsert（`used < 3`）保证并发不超发。
  - 幂等键重放返回原结果，不重复消耗次数。
- 星区 `POST /api/v1/sectors/{x-y-z}/unlock`：
  - 费用 `400 + 已解锁数×120`，上限 60 个；`sector_licenses` 插入 + `sector_unlock`（sink）账本同事务；重复解锁 409，格式非法 400。
  - 采集/扫描读取 `sector_licenses` 得 ×1.2，已由集成测试验证。
- 图鉴 `GET /api/v1/codex?kind=`：返回 counts 与最近 200 条，kind 仅允许 planet/element/lifeform。
- 偏差记录：文档 §3.2 的算例写「scanArray Lv9（sqrtCurve≈90）」，但公式 `round(9×√9)=27`，两者矛盾；实现以公式为准（Lv9 −27%，Lv100 才到 −90% 上限）。文档数值待维护时修正。
- 测试：`tests/unit/test_scan_surface.py`、`tests/integration/test_m3_explore.py`；服务端 81 项全绿，旧应用 12 项全绿。

---

## 16. 实现记录：M4 经济域（2026-10-25）

- 行情 `GET /planets/{key}/market` + `POST .../market/buy|sell`：
  - 报价按 `(planet_key, game_day)` 生成一次、全服共享；商品池 9 种（合金/电池/回路/晶体/星尘/黑洞碎片/遗物/造物/维度碎片），每日取 3 种。
  - 生成公式：`buy=max(2, round(base×(0.65+rng×0.7)))`、`sell=max(1, round(base×0.45))`、`stock=max(1, round(4+hash(planet:code)%13))`；买卖时再乘玩家 `cargoBay` 折扣 / `trade` 科技卖价，**展示价=成交价**。
  - 表里存的是全局基准价，玩家系数不写入行，避免把市场做成“每人一套价”；`trade_orders` 记录每一笔。
  - 买入先条件扣库存再落账，任一步失败整笔回滚；卖出先扣玩家库存（不足即 409 `insufficient_funds`），成功后回补库存。
  - 成交端点不涉及 `resource_code=antimatter`（商品池不含它），避免“用反物质买反物质”。
- 合同 `GET /contracts` + `POST /contracts/{id}/accept|claim`：
  - 每日 3 份基础（巡检/护航/开采）+ 1 份专家（遗物需 archivist≥1、清剿需 weaponArray≥1），ID 为 `{game_day}-cN`，NPC 接取概率 25%。
  - 生成时把 `target` 与 `reward` 快照写进 `contracts.reward`（迁移 `0100b`）；接受后 12h 过期，worker `expire_contracts` 每分钟置 expired。
  - 进度只在「metric 匹配 + accepted + 未过期 + 未完成」时 +1，同一次动作最多推进**最早接受的一份**（`metric = ANY(...)` 单行 `FOR UPDATE`）；采集/扫描/买卖已接入。
  - 领取奖励 = 快照 × `1 + min(1.0, 0.02×相关模块等级)` × 距离系数（当前绑定距离为 0）；遗物合同额外给 1 张改装券。
- 改装/科技/维修：
  - `POST /ship/upgrade` 用 `ships.level` 曲线；`POST /ship/modules/{code}/refit` 用 `module_definitions.cost_curve`（`base × 1.35^(n-1) × 3.5`）；超频要求 Lv≥10、oc<3，成本 `refit_cost(next)×2^(oc+1)`。
  - `POST /tech/{node}/unlock` 校验前置节点与 `tech_nodes.cost`，写 `player_tech`；`POST /ship/repair` 按 `4×missing` 反物质 + `ceil(missing/8)` 合金修复到 100。
  - 所有消耗走 `sink` 账户，响应返回新等级/余额/`state_version`。
- 偏差记录：前端 `TradeSystem` 的卖价是 `base × 1.0`，本文档 §4.1 规定 `0.45`；服务端按文档执行（买卖价差作为资源回收口）。改装成本用参考数据里的扁平 `base`，未实现前端按等级解锁的晶体/遗物门槛，后续 `cost_curve` 可加 `gates`。
- 未做：`roll_market` 预热 job（当前惰性生成已满足正确性）、合同位置绑定（`target_galaxy`/距离）、押金/违约。
- 测试：`tests/integration/test_market_contracts.py`、`test_shipyard_tech.py`；服务端 88 项、旧应用 12 项全绿。

---

## 17. 实现记录：M5/M5.5/M6/M6.5（2026-10-25）

剩余域已一次性铺通，均为**可运行的服务端首版**，不是最终平衡与灾备形态。

- M5 资产与社交：
  - 空间站：`POST /stations`（3 座上限制由 DB 触发器兜底）、`POST /stations/{id}/modules/{code}`、`POST /stations/{id}/claim`；产出按 15min/tick、16 tick 封顶写入 `stations.stored`，领取才走 `station_claim` 账本。
  - 舰队：`POST /fleet`（≤3）、`POST /fleet/{id}/task`（idle/mine/survey/trade）、`POST /fleet/{id}/claim`；30min/tick、12 tick 封顶，`stored` 与账本同样分离。
  - 联盟：`POST /alliances`、`/alliances/join`、`/alliances/leave`、`GET /alliances/mine`，5 人上限制由 DB 触发器兜底。
  - 排行：`GET /leaderboard` 直接按飞船等级 + 反物质余额取 Top50；未接 Redis 榜单缓存。
- M5.5 行星改造（`0101_planet_data`）：
  - `POST /planets/{key}/claim`（每玩家 ≤10，500 反物质）、`POST .../build`（每行星 ≤6 种，`structure_definitions` 成本曲线）、`POST .../deposits/claim`、`GET .../colony`。
  - 采集时若已改造，10% 产出进入 `planet_deposits`，领取走 `planet_yield` 账本；所有写操作写 `planet_audit` 与 `planet_events`，并 `state_version++`。
  - `materialize` 以 colony 视图返回 base 行星 + 建筑/沉积，派生数据可清空、delta 不可丢。
- M6 战斗（复用 `0007` 表）：
  - `POST /combat/start`、`GET /combat`、`GET /combat/{id}`、`POST /combat/{id}/action`（fire/shield/evade/flee）。
  - 敌人强度与每回合伤害由 session seed + turn 的 LCG 决定，可重放；胜利发 `combat_loot` 并推进 `kills` 合同，失败扣 20 船体并生成 `wrecks` 行。
  - `POST /planets/{key}/salvage` 消耗残骸，5 分钟冷却，收益走 `wreck_salvage` 账本。
- M6.5 共享行星（`0102_world_planets`）：
  - `GET /world-planets/{key}`、`POST .../claim`（1000 反物质，24h 护盾）、`POST .../siege`（2000 反物质，12h 后结算）、`POST /sieges/{id}/join`、`POST /sieges/loot`。
  - `jobs/resolve_sieges` 每分钟取到期攻城，按 `attacker_power/(attacker+defender)` 判定，胜方转移所有权、写 `planet_ownership_history`，并给攻方 50 合金 escrow；领取走 `siege_loot`。
- 迁移：`0101_planet_data`、`0102_world_planets`；服务端自检版本改为 `0102_world_planets`。
- 明确未做（属于原计划的工程化，不是漏接口）：跨区 saga/2PC、玩家舰队快照参与攻城、72h 宣战冷却与等级差保护、Redis 排行榜、PITR/k6/灰度、前端 26 个 `_atlas*` 键快照迁移、NPC/势力内容填充（表已存在但无播种）。
- 测试：`tests/integration/test_endgame_domains.py` 覆盖资产/改造/战斗/联盟/攻城；服务端 93 项、旧应用 12 项全绿。
