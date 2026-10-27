# Atlas 玩法清单与技术说明

> 写给下一次会话：这份文档只描述「可以加什么、怎么加」，不含实现。
> 最后更新：2026-10-24

---

## 0. 现在有什么

| 系统 | 位置 | 数据 |
|---|---|---|
| 行星扫描（确定性结果、冷却、采集加成） | `Components/ScanTab.tsx` | `_atlasScans` |
| 星际贸易（每日行情、低买高卖） | `Components/TradeTab.tsx` | `_atlasTrade` |
| 飞船改装（4 模块 × 999 级，成本指数、收益 √） | `Components/ShipyardTab.tsx` | `u.mds` |
| 远征合同（3 份/天、2 槽位、12h、地点绑定、距离倍率） | `Components/ContractTab.tsx` | `_atlasContracts` |
| 改装券 | `Utils/RefitVoucher.tsx` | `_atlasVouchers` |
| 飞船等级（1–999，四属性逐级增长） | `Components/SpaceshipPanel.tsx` | `u.l` |
| 同行者足迹（确定性 NPC 采样痕迹、每周轮换） | `Utils/Residents.tsx` → `Components/PlanetInfo.tsx` | 无存储（seed + 周键派生） |
| 同行者名册与排行榜（24 舰长、去中心化排名） | `Components/ResidentsTab.tsx` | `_atlasEncounters` |
| 图鉴（27 行星类型 / 118 元素 / 10 生命形式，集齐发奖） | `Components/CodexTab.tsx` + `Utils/CodexSystem.tsx` | `_atlasCodex` |
| 模块超频（Lv10 起，每模块 3 次 +5% 效果，成本 ×2/×4/×8） | `Components/ShipyardTab.tsx` + `Utils/ShipModules.tsx` | `u.mds[].oc` |
| 周目标（探索 / 改装总等级 / 图鉴条目，每周结算） | `Components/WeeklyTab.tsx` + `Utils/WeeklyChallenges.tsx` | `_atlasWeekly` |
| 遭遇与交易（每日 5% 偶遇、好感降价） | `Components/NpcEncounterCard.tsx` + `Utils/NpcEncounters.tsx` | `_atlasNPC` |
| 遗迹档案（5 段程序化日志，集齐发奖） | `Utils/RelicLore.tsx` → `Components/ScanTab.tsx` | `_atlasRelics` |
| 空间站（3 座、三舱室、15 分钟 tick / 离线封顶 4 小时） | `Components/StationTab.tsx` + `Utils/StationSystem.tsx` | `_atlasStations` |
| 星区许可（10×10×10 分区，解锁后本区采集/扫描 +20%） | `Utils/SectorSystem.tsx`（UI 在空间站页签） | `_atlasSectors` |
| 市场被搜刮（有痕迹的行星库存 −20%、价格 +8%） | `Utils/TradeSystem.getMarket` | 无（派生） |
| 合同被接走（每日最多 1 份显示已被接取、不可接） | `Utils/ContractSystem.markTaken` → `Components/ContractTab.tsx` | 合同字段 `takenBy` |
| 武器/护盾模块（火力 6+4Lv、护盾 4+3Lv） | `Utils/ShipModules.tsx` | `u.mds` |
| 船体与维修（采集 ×(0.5+0.5·hull%)、航行成本 ×(2−factor)） | `Utils/HullSystem.tsx` → `ShipyardTab.tsx` | `_atlasHull` |
| 遭遇战（每日 5%/行星，回合制 开火/护盾/规避/撤离） | `Utils/CombatSystem.tsx` + `Components/CombatPanel.tsx` | `_atlasCombat`（当天已战列表） |
| 宇宙事件（6 小时窗口、seed 派生、采集/扫描/卖价/燃料四类） | `Utils/CosmicEvents.tsx` + `Components/CosmicBanner.tsx` | 无（派生） |
| 生产线（三条配方、独立冷却、中级料→稀有料） | `Components/FabricatorTab.tsx` + `Utils/FabricatorSystem.tsx` | `_atlasCraft` |
| 残骸打捞（胜利留残骸，占用一次扫描冷却） | `Utils/WreckSystem.tsx` → `Components/ScanTab.tsx` | `_atlasWrecks` |
| 战斗合同（清剿航道，`kills` 指标） | `Utils/ContractSystem.tsx` 模板 + `CombatSystem.settle` | 合同字段 `progress` |
| 空间站访客（每日 45% 概率停靠，产出 +5%） | `Utils/StationSystem.visitor` | 无（派生） |
| 对手舰（weekly 标记 12% 行星，产出 −15%） | `Utils/Rival.tsx` → 采集 + `PlanetInfo` 提示 | 无（派生） |
| 敌对势力声望（每星区一个势力，击杀改变声望） | `Utils/FactionSystem.tsx` → 遭遇率 / 买价 | `_atlasFactions` |
| 异步 PvP 挑战码（`ATL1-` base64 + 校验和） | `Utils/ChallengeSystem.tsx` + 同行者页签 | 无（字符串） |
| 科技树（4 支 × 4 级，接采集/航行/观测/贸易） | `Components/TechTab.tsx` + `Utils/TechSystem.tsx` | `_atlasTech` |
| 舰队（3 艘、每 30 分钟 tick、离线 6 小时封顶） | `Components/FleetPanel.tsx` + `Utils/FleetSystem.tsx` | `_atlasFleet` |
| 地表探索（8×8 丰度图 Canvas，每日 3 次） | `Components/SurfaceSurvey.tsx` + `Utils/SurfaceSystem.tsx` | `_atlasSurface` |
| 购买情报（后端 `/api/system-intel` 真实行星数据） | `Components/IntelPanel.tsx` + `Utils/IntelSystem.tsx` | `_atlasIntel` |
| 联盟（离线邀请码、成员共享采集加成） | `Components/AllySection.tsx` + `Utils/AllySystem.tsx` | `_atlasAllies` |
| 舰队护航（待命舰加火力、替旗舰挨打） | `Utils/CombatSystem.tsx`（`escorts`） | 无（战斗中临时） |

四个玩法都挂在行星页的「星舰实验舱」（`Components/ExplorationLab.tsx`），页签切换零侵入。**新玩法优先往这里挂**，不碰主布局。

---

## 1. 玩法清单

标注：**S** ≈ 半天内、**M** ≈ 1–2 天、**L** ≈ 3 天以上（含验证）。

### A. 成长线（解决「只有改装一条路」）

| # | 玩法 | 核心循环 | 实现要点 | 量 |
|---|---|---|---|---|
| A1 | **空间站/基地** | 在访问过的行星建造（上限 3 座）→ 三种舱室升级 → 离线产出、扫描冷却、卖出加成 | 新 `Utils/StationSystem.tsx` + 页签；建筑效果接 `scanCooldownMs` / `TradeSystem.sell`；进入页面结算离线产出（上限 16 个 tick 防挂机） | M |
| A2 | **舰队** | 造第 2、3 艘船 → 分别派去「自动采集 / 自动扫描 / 自动贸易」 → 你亲自探索时它们在跑 | 数据 `u.fleet[]`，每艘存 `{type, level, task, lastTick}`；后端无需改（纯前端模拟）；难点是 UI 与资源上限共享 | L |
| A3 | **船员/指挥官** | 招募（消耗资源 + 稀有材料）→ 每人一个被动（+采集%、+扫描产出、-冷却）→ 可派往空间站 | 新 `_atlasCrew`；被动用乘法叠加，注意与改装上限冲突 | M |
| A4 | **科技树** | 消耗资源+研究成果解锁节点（采集/航行/观测/贸易四条）→ 提供乘法加成 | 新 `_atlasTech`；节点表用 `Record<id, {cost, requires[], effect}>`，效果接现有 `miningMultiplier` 等 | L |
| A5 | **超频** | 模块满 10 级后可超频（每模块 3 次，+5%/次，成本递增） | `u.mds[i].overclock`；`ShipModuleSystem` 里给效果加一乘项 | S |

### B. 收集与图鉴（低成本、高留存）

| # | 玩法 | 核心循环 | 实现要点 | 量 |
|---|---|---|---|---|
| B1 | **行星图鉴** | 发现过的 26 种类型点亮，集齐给奖励 | `_atlasCodex`，存 `Set<planet_type>`；行星页/系统页顺手记录 | S |
| B2 | **元素图鉴** | 收集全部 118 种元素样本（每种至少 1 次采集） | `_atlasCodex.elements`；`collectResources` 时记录 `planetData.elements` | S |
| B3 | **生命形式图鉴** | 10 种生命形式各遇到一次 | 同上，读 `planet.life_forms` | S |
| B4 | **遗迹档案** | 扫描出遗迹时生成一段日志残片（程序化文本）→ 集齐 5 段解锁一次性大奖 | 新 `Utils/RelicLore.tsx`；模板 = 前缀 + 中段 + 尾句，用 `SeededRandom(planetKey)` 选，保证同行星稳定；`ScanTab` 结果区展示 | M |
| B5 | **星图成就** | 发现类成就：100 星系 / 1000 行星 / 首个黑洞 / 首个异常行星 | 复用 `DailyChallenges.getCurrentStats()` 的位图统计 | S |
| B6 | **星门收藏** | 保存别人的星门链接，形成个人航线集 | 已有 `_atlasLocations`，只需 UI 分组 | S |

### C. 事件与叙事（给宇宙「活着」的感觉）

| # | 玩法 | 核心循环 | 实现要点 | 量 |
|---|---|---|---|---|
| C1 | **宇宙事件** | 每 6 小时随机触发一次全局事件（超新星 / 流星雨 / 引力波）→ 影响某片星域若干小时的产出倍率 | 事件由 `cosmic_origin_time` + 时间片确定性生成（无需后端存储）；横幅展示 + 倍率接入采集 | M |
| C2 | **神秘信号** | 星系页偶发「信号」，进小游戏（阿雷西博解码）→ 解得隐藏坐标 | 复用 `Utils/LifeAreciboTranslator.tsx` 的解码逻辑，做一个输入框校验 | M |
| C3 | **前文明谜题** | 遗迹残片里藏数字，集齐按顺序输入 → 开出特殊奖励 | 依赖 B4 | M |
| C4 | **时间胶囊** | 写一条留言埋在某行星（存本地/可选 P2P 广播），日后自己或他人「挖掘」 | 本地版 S；P2P 版依赖 D4 | S/M |
| C5 | **星际广播** | 输入坐标发送信号，收到随机 NPC 回复（程序化文本） | 纯文本模板 + 冷却 | S |

### D. 社交与 P2P（已有握手基础设施）

| # | 玩法 | 核心循环 | 实现要点 | 量 |
|---|---|---|---|---|
| D1 | **信标** | 花费资源在某星系布置信标 → 广播给已连接宇宙 → 对方可见并可跳转 | 复用 `/api/p2p/message`，消息体 `{type:"beacon", coordinates, note}` | M |
| D2 | **跨宇宙贸易** | 不同 seed 的宇宙中，同一商品基准价不同 → 长途套利 | 需要真对端；先在 `TradeSystem` 里把基准价与 `config.seed` 绑定 | M |
| D3 | **排行榜** | 按「探索行星数 / 改装总等级 / 合同完成数」排名，向已连接节点广播 | 广播 + 本地聚合排序；无服务端，去中心化 | M |
| D4 | **联盟** | 2–5 个节点结成联盟，共享空间站产出（按贡献分成） | L；需要较完整的 P2P 消息协议 | L |
| D5 | **远征队** | 多人共同完成一份大合同（各刷一部分） | 同上，需要进度汇聚 | L |

### E. 风险与代价（现在只有收益，没有损失）

| # | 玩法 | 核心循环 | 实现要点 | 量 |
|---|---|---|---|---|
| E1 | **船体损伤** | 长途跳跃/极端行星有小概率损伤 → 效率下降 → 花资源维修 | `u.hull` 字段（0–100）；`calculateTravelCost` 与采集倍率按 hull 折算 | M |
| E2 | **燃料泄漏** | 随机事件：跳跃后损失一部分燃料 | 接 C1 事件系统 | S |
| E3 | **海盗/敌对信号** | 某些星系有封锁，需要绕行或支付「通行费」 | 确定性判定（`galaxy.seed`）+ 扣资源/改路线 | M |
| E4 | **货舱被盗** | 长时间不登录，稀有资源小概率丢失 | 需要「最后登录时间」字段；玩家体验需谨慎 | S |

### F. 探索玩法（让「跑」这件事更有内容）

| # | 玩法 | 核心循环 | 实现要点 | 量 |
|---|---|---|---|---|
| F1 | **星区许可** | 宇宙切成 10×10×10 星区，消耗资源解锁 → 该区内采集/扫描 +20% | `_atlasSectors`（Set）；采集时按坐标算区 | M |
| F2 | **深空航线** | 预设一条 5–8 跳的路线，每跳有事件 → 走完给大奖 | 路线由起点确定性生成；每跳 = 一次坐标跳转 + 事件 | M |
| F3 | **虫洞** | 偶发捷径，一次省 80% 燃料，但目的地随机 | 坐标哈希判定；与合同距离倍率结合 | S |
| F4 | **地表探索** | 行星页小游戏：在资源分布图上选点采样（时机/位置影响收益） | 用 `planet.elements` 生成热力图，Canvas 交互 | L |
| F5 | **扫描校准** | 扫描时有个小游戏（对齐波段），成功率高则出稀有结果概率提升 | 与现有 1.4s 动画结合，加一次点击判定 | M |

### G. 经济深化

| # | 玩法 | 核心循环 | 实现要点 | 量 |
|---|---|---|---|---|
| G1 | **生产线** | 原料 → 成品（如 量子合金 + 等离子电池 → 跃迁核心）→ 成品用于改装或卖高价 | 新 `_atlasCraft`；配方表 + 冷却 | M |
| G2 | **期货合约** | 提前锁定某商品价格，到期结算 | `_atlasFutures`；价格用现有行情公式 + 日期偏移 | M |
| G3 | **黑市** | 不定期出现，价格好但会引来「注意」（概率扣资源） | 与 C1/E 系列联动 | M |
| G4 | **星际银行** | 存资源得利息（上限），防止爆仓 | 简单利息模型；注意不要变成无限收益 | S |

### H. 飞船与外观

| # | 玩法 | 核心循环 | 实现要点 | 量 |
|---|---|---|---|---|
| H1 | **船型解锁** | 探索/采矿/贸易/科研四种船型，各有被动（`u.t` 已有字段，目前只有 explorer） | 改 `upgradeShip` 与采集/旅行公式 | M |
| H2 | **模块套装** | 同系 3 个模块达 Lv5 → 触发套装加成 | `ShipModuleSystem` 加校验 | S |
| H3 | **外观定制** | 已有 `u.app {c,p,d}`，做调色板 + 图案选择器 | 纯 UI | S |
| H4 | **舰名与徽章** | 给船命名，名字显示在面板与分享图 | 字符串存 `u.name` | S |

### I. 挑战与限时

| # | 玩法 | 核心循环 | 实现要点 | 量 |
|---|---|---|---|---|
| I1 | **周挑战** | 每周一个大目标（如「完成 20 份合同」），奖励稀有材料 | 复用 `DailyChallenges` 结构，周期改周 | S |
| I2 | **极限航行** | 从当前点出发，不加燃料走到最远，记录距离排名 | 需要燃料为 0 时禁止跳跃的判定 | M |
| I3 | **扫描马拉松** | 30 分钟内扫描最多行星，产出按排名给奖励 | 计时器 + 计数；单机版即成绩 | S |
| I4 | **黑洞边缘** | 特殊玩法：靠近黑洞采样，成功得黑洞碎片，失败损失飞船效率（临时） | 需要「临时负面状态」机制 | M |

### J. AI 玩家与宇宙居民

**要解决的空旷感**：现在整个宇宙只有玩家一艘船在动，星系里没有任何「别人来过」的痕迹。

**核心设计约束**（很重要，决定实现方式）：

1. **不做实时模拟**。不要写 `setInterval` 驱动 24 个 NPC 移动，那是性能陷阱，且刷新就乱。
2. **一切都是派生值**。NPC 的位置、状态、留言都由 `config.seed + 时间片 + 坐标` 哈希得到，刷新不变，换设备也一致。
3. **不做「抢」的设计**。NPC 不能主动拿走玩家的资源、合同或行星；竞争只通过「痕迹」和「展示」体现，负面感受要可控。
4. **进度锚定玩家**。对手舰的进度按玩家的探索量动态缩放，避免新手被碾压、老手毫无竞争感。

| # | 玩法 | 核心循环 | 实现要点 | 量 |
|---|---|---|---|---|
| J1 | **居民名册与足迹** | 宇宙里固定 20–30 位 NPC 舰长（由 seed 派生名字/舰型/性格）→ 某些行星上留有他们的采样痕迹与留言 | 新 `Utils/Residents.tsx`；`residentAt(planetKey)` 用 `hash(planetKey + residentId + weekKey) % 100 < 18` 判定；痕迹渲染在 `PlanetInfo` 的元素区下方 | S |
| J2 | **市场被搜刮** | 有 NPC 痕迹的行星，市场库存 −20%、价格 +8% | `TradeSystem.getMarket` 里调 `Residents.hasTrace(planetKey)`，只影响生成时的价格与库存初值 | S |
| J3 | **遭遇与交易** | 行星页偶发「遭遇」（比痕迹低得多的概率）→ NPC 提出一笔略优于市场的兑换 → 完成后好感 +1 | 新 `_atlasNPC`：`{ [id]: { favor, trades, lastMet } }`；交易比例 = 市场价 × (0.7 − favor×0.02)；复用 `SpaceshipResourceManager` 读写 | M |
| J4 | **购买情报** | 花资源向 NPC 买「附近 3 跳内的富集行星」坐标，得到一个临时标记 | 用 `galaxy.seed` 派生候选行星，存 `_atlasIntel`（带过期时间）；星系列表里给标记 | S |
| J5 | **合同被接走** | 每日合同生成时，25% 概率有一份显示「已被 XX 接取」而不可用 | `ContractSystem.regenerate` 里加一步：hash 判定后把该合同替换为「空缺」，UI 展示灰卡 | S |
| J6 | **排行榜** | NPC 的「已探索行星数」由天数派生（`base + days × rate`），玩家看到自己排第几 | 展示层计算，无需存储；榜单放在实验舱一个新页签 | S |
| J7 | **对手舰** | 固定一位「对手」，进度 = 玩家探索量 × 0.85 → 会抢先标记你附近的富集行星，你到达时该行星产出 −15% | 单一 NPC、单条规则，避免复杂度失控；负面必须可见（行星页提示「已被 XX 标记」） | M |
| J8 | **空间站访客** | 有空间站后，每天可能有 NPC 停靠 → 当日产出 +5% 并留一条留言 | 依赖 A1 空间站；纯展示 + 一次加成结算 | S |

**为什么这样设计**：NPC 的价值不是「陪你打」，而是让宇宙显得**有人来过**。一个痕迹、一句留言、一条被接走的合同，成本极低，但对「空旷感」的改善比一整套战斗系统更直接。

**避免的坑**：

- 不要做**实时 PvP**（需要世界状态同步）；回合制 PvE 与异步挑战码见 K 节
- 不要让 NPC 影响已接取的合同（玩家会觉得努力被抹掉）
- 不要让痕迹影响玩家的核心收益链条太多（J2 的 −20% 已经是上限）
- 不要让 NPC 进度随时间无限拉开（用锚定玩家的公式，别用固定速率）

### K. 战斗与威胁

**先说清楚边界**：这里的战斗是**回合制 PvE**，不是实时 PvP。原因不是技术懒，而是这个项目没有服务器、没有世界状态同步——实时对战必须有一方权威，一旦引入就要推翻「纯确定性 + localStorage」的地基。

回合制则完全适配：战斗过程是一次纯函数推演，双方配置都由 seed 派生，随时可以复现、可以审阅、可以离线跑。

| # | 玩法 | 核心循环 | 实现要点 | 量 |
|---|---|---|---|---|
| K1 | **遭遇战** | 进入行星/系统时 5% 概率遭遇敌对目标 → 全屏战面板 → 回合制（开火 / 护盾 / 规避 / 撤离） | `Utils/CombatSystem.tsx` 提供 `createEncounter(seed)` 与 `resolveTurn(state, action)` 两个纯函数；`Components/CombatPanel.tsx` 只做展示与输入；战斗状态放 `useState`，**不持久化**（刷新 = 撤离） | M |
| K2 | **武器与护盾模块** | 改装面板新增 `weaponArray`（火力）与 `shieldMatrix`（护盾）两个模块，沿用现有的成本指数曲线 | 直接进 `ShipModules.tsx` 的 `SHIP_MODULES`，战斗属性从模块等级派生，**不新增存储字段** | S |
| K3 | **船体与维修** | 战败或撤退失败 → `u.hull` 下降 → 效率与采集倍率按比例降低 → 花资源维修 | `u.hull`（0–100）新增字段，`expandData` 补默认值；`miningMultiplier` / `calculateTravelCost` 乘以 `0.5 + 0.5 × hull/100` | S |
| K4 | **战斗合同** | 合同池新增「清剿」类：在指定星区击败 N 个目标 | 复用 `ContractSystem` 的多键 `requirements`，进度键 `kills`；目标星区复用 `targetGalaxy` | M |
| K5 | **敌对势力声望** | 每个星区归属一个势力（掠夺者 / 巡逻队 / 无主），反复击杀会降低声望 → 该区域遭遇率上升、市场变差 | 声望按「星区 + 势力」存 `_atlasFactions`；影响遭遇概率与 `TradeSystem` 折扣 | M |
| K6 | **残骸打捞** | 战斗胜利后留下残骸，可花一次扫描动作打捞（获得对方的一部分装备材料） | 复用扫描的冷却与动画，产出表按敌人类型给 | S |
| K7 | **舰队战** | 后期：玩家 3 艘船 vs NPC 小队，逐回合选目标 | 依赖 A2 舰队；战斗状态从单体扩展为数组 | L |
| K8 | **异步 PvP（挑战码）** | 把自己的舰队配置编码成一串「挑战码」分享出去 → 对方输入后与你的**配置快照**打一场 → 双方各自看到结果 | 这是唯一兼容无服务器的 PvP：不联网、不同步，只是把配置当种子；编码可复用 `__atlas_stargate.py` 的 base64 + 校验思路（前端实现一份） | M |

**战斗数值建议**（保持与前文曲线一致：成本指数、收益 √）：

```
火力  = 6 + weaponArray.Lv × 4          （Lv1 = 10，Lv20 = 86）
护盾  = 4 + shieldMatrix.Lv × 3         （伤害先扣护盾，再扣装甲）
装甲  = 40 + hull × 0.6
机动  = 0.2 + efficiency × 0.05         （决定撤离成功率与闪避）
伤害  = max(1, 火力 × U(0.8, 1.2) − 对方护盾)
撤离成功率 = min(0.9, 0.35 + 机动 × 0.1)
```

敌人强度锚定玩家：`enemyPower = playerPower × (0.6 ~ 1.2)`，星级只影响战利品，不影响「打不打得过」——避免玩家因为运气差被卡死。

**奖惩原则**：

- 胜利：资源 + 概率稀有材料 + 战斗券；**不**给装备（装备只从改装来，保持单一成长线）
- 失败：`hull −20`、损失 **5%** 货物、被迫撤离；**不**损失改装等级或合同进度
- 撤离：无奖励，扣一次燃料；这是「打不过就跑」的常规出口，不要设计成惩罚

**为什么不建议做实时 PvP**：需要权威服务器、反作弊、断线重连、延迟补偿，任何一项都与当前架构冲突；而 K8 的异步挑战码能给出 80% 的 PvP 快感，成本却只有 5%。

---

## 2. 推荐落地顺序

**第一批（解决「宇宙太空」的感知，全是 S 级）**

1. ✅ **J1 居民名册与足迹**——已完成：`Utils/Residents.tsx`（seed 派生 24 位舰长，18% 行星留痕，周更）+ `Components/ResidentsTab.tsx`（名册，相遇记录 `_atlasEncounters`）
2. ✅ **J6 排行榜**——已完成：排行榜并在同行者页签，NPC 探索量 = base + 天数 × rate
3. ✅ B1 + B2 + B3 三张图鉴——已完成：`Utils/CodexSystem.tsx` + `Components/CodexTab.tsx`，集齐各发一次性奖励
4. ✅ A5 超频——已完成：`ShipModuleSystem.canOverclock/applyOverclock`，`u.mds[].oc`
5. ✅ I1 周挑战——已完成：`Utils/WeeklyChallenges.tsx` + `Components/WeeklyTab.tsx`（探索 / 改装总等级 / 图鉴条目）

**第二批（让居民「可交互」，再加结构性玩法）**

6. ✅ **J3 遭遇与交易**——已完成：`Utils/NpcEncounters.tsx`（每日 5% 偶遇、报价 = 基准 × (0.7 − 好感×0.02)、`_atlasNPC` 存好感）+ `Components/NpcEncounterCard.tsx`；好感显示在同行者名册
7. ⏸ **J4 购买情报**——**暂缓**：前端拿不到任意坐标的真实行星内容（`/api/planet/*` 只按当前行星名取渲染数据），seed 派生的坐标无法保证「富集」为真，做了就是骗玩家。要做需要新增后端接口（按坐标返回行星类型/元素），或改成「当前星系内已生成行星」的真实标记
8. ✅ B4 遗迹档案——已完成：`Utils/RelicLore.tsx`（前缀+中段+尾句，planetKey 决定第几段），扫描出遗迹时记录并在 `ScanTab` 展示，集齐 5 段发奖 + 1 张改装券
9. ✅ A1 空间站——已完成：`Utils/StationSystem.tsx` + `Components/StationTab.tsx`。上限 3 座（本星球可建），三舱室（生产/观测/商贸）；生产舱 15 分钟 1 tick、离线最多 16 tick（4 小时）且超时部分直接丢弃，领取时入账；观测舱 -2%/级（全舰，上限 25%，接 `ShipModuleSystem.scanCooldownMs`）、商贸舱 +1%/级（上限 20%，接 `TradeSystem.getMarket` 的报价，显示价即成交价）；建站成本 400/600/800 反物质递增（刻意压在 1000 储物上限以下）
10. ✅ F1 星区许可——已完成：`Utils/SectorSystem.tsx`，10×10×10 分区，解锁费 400 + 120×已解锁数（上限 60 个），本区采集（`collectResources`）与扫描产出（`scan` 的 `scaleYield`）+20%；入口在空间站页签顶部

**第三批（世界开始有代价，战斗开门）**

11. ✅ **J2 市场被搜刮 + J5 合同被接走**——已完成：「有痕迹」的行星库存 ×0.8、买价 ×1.08；每天最多 1 份合同被某位舰长接走（灰卡、`canAccept` 直接拒绝），保证不会出现整天空板
12. ✅ **K2 武器与护盾模块 + K3 船体与维修**——已完成：`weaponArray`（火力 6+4Lv）、`shieldMatrix`（护盾 4+3Lv）进 `SHIP_MODULES`；`Utils/HullSystem.tsx` 存 `_atlasHull`（有意偏离原设计的 `u.hull`：不动飞船存档结构，避免 `expandData` 兼容问题），船体按 `0.5+0.5·hull%` 折算采集、航行成本反向 ×(2−factor)，改装页签顶部可维修
13. ✅ **K1 遭遇战**——已完成：`Utils/CombatSystem.tsx`（纯函数 `resolveTurn`）+ `Components/CombatPanel.tsx`；每日每行星 5%、当天已战记录在 `_atlasCombat`（刷新不会重掷）；胜利给资源 + 速胜改装券，战败船体 −20 且货舱被抢 5%，撤离扣 20 氘
14. ✅ C1 宇宙事件——已完成：`Utils/CosmicEvents.tsx`，6 小时一个窗口、由 seed+窗口号派生（全宇宙一致、刷新不可重掷）；采集/扫描类只影响某一个星区，集市/燃料类全局；横幅常驻实验舱顶部并显示「覆盖本星区 / 仅在 x-y-z 生效」与剩余时间
15. ✅ E1 燃料泄漏——已完成：作为 C1 的事件类型落地（`leak`，航行燃料 ×1.35，正向的 `gravity` ×0.8），接入 `calculateTravelCost` 与 `ContractSystem.travelCost`
16. ✅ G1 生产线——已完成：`Utils/FabricatorSystem.tsx` + `Components/FabricatorTab.tsx`，三条配方（合金压铸 2h / 神经蚀刻 3h / 尘埃压缩 4h），独立冷却，只在中级与稀有资源之间转换，不新增资源类型

**第四批（战斗长成系统）**

17. ✅ K6 残骸打捞 + K4 战斗合同——已完成：`Utils/WreckSystem.tsx`（`_atlasWrecks`，战利品按战斗回合数分档），打捞占用一次扫描冷却（`PlanetScanSystem.markUsed`）；合同池新增「清剿航道」（`kills` 指标，`CombatSystem.settle` 里 `ContractSystem.increment("kills")`）
18. ✅ **J7 对手舰 + J8 空间站访客**——已完成：`Utils/Rival.tsx`（固定一位对手，每周标记 12% 行星，产出 −15%，行星页有可见提示）；空间站每天 45% 概率有访客停靠，当日 tick 产出 +5% 并在卡片上署名
19. ✅ K5 敌对势力声望——已完成：`Utils/FactionSystem.tsx`（每星区按哈希归属掠夺者/巡逻队/无主，`_atlasFactions` 存声望）；掠夺者声望为负时该区遭遇率最高 +10%，巡逻队声望为正时买价最低 ×0.9，声望显示在空间站页签
20. ✅ K8 异步 PvP 挑战码——已完成：`Utils/ChallengeSystem.tsx` 把改装编码成 `ATL1-<base64>` 并带校验和，同行者页签可生成/输入，`CombatSystem.createFromChallenge` 用快照当对手；模拟战不产生残骸、不计合同与声望

**第五批（原「不建议现在做」的 L 级，2026-10-25 已补完）**

21. ✅ A2 舰队——`Utils/FleetSystem.tsx` + `Components/FleetPanel.tsx`（在空间站页签）：最多 3 艘，30 分钟 1 tick、离线 6 小时封顶；任务为待命/采集/扫测/贸易，各自产出不同资源，逐船领取
22. ✅ A4 科技树——`Utils/TechSystem.tsx` + `Components/TechTab.tsx`：采集/航行/观测/贸易四支各 4 级，逐级前置，效果分别接采集倍率、跳跃成本、扫描冷却、卖价
23. ✅ D4 联盟——`Utils/AllySystem.tsx` + `Components/AllySection.tsx`（同行者页签）：**离线邀请码**形式，最多 5 位成员，每位 +2% 采集（上限 +10%）。与原设计的差别：不做实时多节点同步（那需要完整的 P2P 消息协议与多机联调），本地联盟先把「归属感」做出来
24. ✅ F4 地表探索——`Utils/SurfaceSystem.tsx` + `Components/SurfaceSurvey.tsx`：8×8 丰度图由 planetKey 派生，Canvas 点选采样，丰度越高收益越大、热点出异星晶体；每行星每日 3 次
25. ✅ K7 舰队战——`CombatSystem` 增加 `escorts`：**待命**的舰船自动护航，叠加火力并有 35% 概率替旗舰挨打。与原设计的差别：不做「逐回合选目标」的三对三面板，先用低风险方式让舰队在战斗里有存在感

26. ✅ J4 购买情报（原暂缓项）——新增后端 `/api/system-intel`（按坐标 + 系统索引返回**真实**行星类型/元素/生命形式），前端 `Utils/IntelSystem.tsx` + `Components/IntelPanel.tsx`（空间站页签）：花 200 反物质买 45 分钟有效的附近星系情报

**排序理由**：

- 用户提出的是「空」，所以 J1/J6 排最前——不改任何经济数值，只增加存在感，风险最低、感知最强
- 交互（J3/J4）放第二批，因为要先把「有人」立住，「能说话」才有意义
- 战斗必须**从 K2/K3 开始**，不能直接做 K1：没有武器、护盾、船体，遭遇战就只剩「点一下扣血」，既不好玩也没法平衡
- 真正的战斗（K4/K5/K7/K8）全放最后，因为它是**可选深度**，不能阻塞主循环；玩家不打架也应该能完整玩下去

---

## 3. 已知技术债

2026-10-25 一轮清偿：除「纯前端可篡改」作为设计取舍保留外，其余全部修完。

| 问题 | 位置 | 状态 |
|---|---|---|
| 存档导出只含 4 个旧 key | `Utils/DataExportImport.tsx` | ✅ **已修**：改为导出所有 `_atlas*` 键（v3：encodedKey → 值 + 逐键 SHA-256 校验），旧 v2 存档仍可导入；面板显示真实 key 数与体积（实测 10 个键） |
| 旅行成本有两套 | `ContractSystem.travelCost` / 导航 | ✅ **已修**：统一到 `SpaceshipResourceManager.calculateJumpCost(distance)`，手动跳跃（≥1000 单位）与合同走同一函数；顺带修掉导航预览 efficiency 被除两次、`canAffordTravel` 恒 true、`executeTravel` 返回值被当布尔用三处问题 |
| 连击倍率恒为 1.0 | `getCollectionStreakInfo` | ✅ **已修**：连续天数每级 +3%，上限 +30% |
| 采集递减失效 | `getCollectionCount` | ✅ **已修**：新增 `data.n` 计数表（随存档 compact/expand 保留），前 3 次满额、之后每次 −15%、下限 0.4；旧存档按 1 次计 |
| 合同按 UTC 刷新 | `ContractSystem.today()` | ✅ **已修**：改为本地日期 `dayKey()`，每日挑战同步修正 |
| 扫描/贸易纯前端 | `PlanetScanSystem` / `TradeSystem` | ⏸ **保留（设计取舍）**：无服务端权威，本地结果天然可改；已用 planetKey + 日期派生保证跨设备一致，不引入服务端校验 |
| 新玩法无自动化测试 | `tools/frontend_smoke.mjs` | ✅ **已修**：`npm run test:frontend` 用 esbuild 打包纯逻辑模块 + localStorage 垫片跑 23 项断言（确定性 / 比率 / 上限 / 守卫 / 挑战码 / 导出覆盖率） |
| 遗留 TS 类型错误 | 全仓 | ✅ **已修**：`npx tsc --noEmit` 零错误（three 纹理编码误用、`displayStars` 先用后声明、`tr` 结构缺字段、`SystemProps` 形状） |

---

## 4. 数值基线

`python tools/balance_report.py`（365 天，12 采集 + 12 扫描 + 6 贸易 + 2 合同/天）：

```
collections 27.4%   surveys 25.5%   trades 2.7%   contracts 44.4%
日净收入约 3,700 反物质当量
第 365 天  scanArray 19 / cargoBay 18 / warpCoil 18 / archivist 18
```

参数都在脚本顶部（`CONTRACT_REWARD_SCALE` / `REFIT_COST_SCALE` / `TRADE_SELL_RATIO` / `MODULE_BONUS`）。**改前端公式后必须同步脚本**，否则数据失真。

---

## 5. 设计约定

- **成本指数、收益平方根**：本项目的成长曲线范式，新系统沿用
- **等级不设人为墙**：999 是数字边界，不是玩法终点，属性每级都要涨
- **确定性优先**：随机结果必须由 `planetKey` / 日期派生，禁止 `Math.random()`
- **资源出口闭环**：新资源必须同时有产出与消耗
- **新玩法挂「星舰实验舱」**：加页签即可，不改主布局
- **改前端必须 `npm run build` 再重启服务**（服务启动时只读一次 manifest）
- **改完跑**：`python test_fix.py`、`python test_p2p_redis.py`、`python tools/balance_report.py`、`npm run test:frontend`（纯前端玩法冒烟）、`npx tsc --noEmit`（现在应为零错误）

---

## 6. 服务端化（下一阶段）

玩法层已到「纯前端可篡改」的天花板，继续加 L 级玩法的收益低于把状态变权威。

- 设计文档：**[`docs/SERVER_PG_DESIGN.md`](SERVER_PG_DESIGN.md)**（v2 生产版：分层架构 + pgbouncer + Celery + Redis、账号/JWT 轮换、双分录账本、3NF 模型、分区与索引、SLO 与容量、备份与 PITR、测试与灰度、M0–M6 里程碑）
- 分册（每主题一份，细节/流程/验收/反模式）：**[`docs/server/README.md`](server/README.md)**，共 20 篇，覆盖 01 环境与 SLO、02 架构分层、03 认证、04 数据模型、05 账本、06 时间与并发、07 缓存与任务、08 API、09 计算下沉、10 安全、11 可观测、12 备份、13 测试、14 灰度、15 里程碑与风险、16 行星缓存、17 玩家改造星球、18 共享行星、19 DDL、20 仓库结构与清单
- 一句话结论：服务端已经对「宇宙」权威，缺的是对「玩家」权威。玩家状态必须从 localStorage 变成「服务端唯一真相 + 客户端只读缓存」，余额必须是账本派生的物化值，而不是可覆盖的数字列。
- 本期不动 P2P 协议本身（联盟仍是邀请码语义，但成员关系入库）；账号体系是**真实**的：邮箱 + Argon2id + JWT access（15 分钟）+ 一次性轮换 refresh（30 天）。
- 后续目标架构：**[`docs/PVPVE_MULTIREGION_MICROSERVICE.md`](PVPVE_MULTIREGION_MICROSERVICE.md)**（v3：实时 PvPvE 战斗服务、玩家分片跨区多活、8 个有界上下文的微服务，含 P0–P5 演进路线）。三者**必须分阶段**：先把 v2 的单区域权威地基做完（P0），再抽 `battle` 服务（P1），再拆服务（P2），最后才上多区（P3–P4）。
- 行星缓存（`internal_data/cache/atlas_cache.db` + `cache/**/*.json`）迁 PostgreSQL 的完整设计在 v2 文档 **§7.10**，作为独立里程碑 **M0.5**：与玩家状态正交，可先于账号体系上线（建 schema → 双写 → 回填 → 切读，全程可回滚）。
- **玩家改造星球**（不可重建的世界数据）在 v2 文档 **§7.11**，里程碑 **M5.5**：`base + delta` 分层（`universe_cache` 存可重建基础行星，`planet_claims/modifiers/structures/deposits/audit` 存玩家改造），禁止把改造混进缓存表；写入必须「同事务 + 账本 + 审计」，进 PITR，禁止 TRUNCATE。
- **多玩家共享行星**在 v2 文档 **§7.12**，里程碑 **M6.5**：`world_planets` 为唯一真相（单写者 + `claim_version`），归属按 sector 分片到区域；争夺是**异步确定性攻城推演**（宣战后 12h、`seed=hash(siege_id)`、服务端快照），不是实时对战；跨区结算走 outbox + 幂等 + `loot_escrow` 补偿，明确不做 2PC 与跨区多主写。实时 PvPvE 只在中立匹配实例中进行（见 v3 §3.1 的补充说明）。
