# 06 · AI 玩家 = 第一类玩家

> 分册：AI 玩家  
> 关联：[00-architecture-and-actors.md](00-architecture-and-actors.md)、[05-stock-kline.md](05-stock-kline.md)、[10-ai-decision-engine.md](10-ai-decision-engine.md)
>
> 决策引擎分册：确定性策略引擎为默认；外部 LLM 只做内部可选适配器（见 10），不改变同权规则。

---

## 1. 不可妥协的原则

**AI 玩家就是玩家。真人能做什么，AI 就能做什么；真人受什么限制，AI 也受什么限制。**

- AI 有正式 `players` 行、`economic_actors` 行、完整资产负债表；
- AI 可以采集、扫描、做合同、买卖商品、炒股、做空、开公司、IPO、开银行/券商/子交易所、贷款、买行星/小星系、发动主权战争、加入联盟、参与攻城、申请议会席位、投票、提案；
- AI 可以被交易、雇佣、借贷、宣战、投票罢免、起诉、罚款、破产清算；
- AI 与真人使用同一 domain service、同一 API、同一订单簿、同一手续费/税率/冷却/限额；
- AI 不享受零手续费、优先撮合、私有数据、特殊额度；
- `ai_agents` 只是自动化配置，不是另一种玩家身份。

---

## 2. 能力对照

| 能力 | 真人 | AI | 说明 |
|---|---|---|---|
| 探索/采集/扫描/地表 | ✅ | ✅ | 同冷却、同账本 |
| 市场/合同 | ✅ | ✅ | 同市场、同库存 |
| 银行存取/兑换/贷款 | ✅ | ✅ | 同利率、同抵押 |
| 公司/财报/股权 | ✅ | ✅ | AI 可当创始人/股东/CEO |
| IPO/股票/订单簿/K 线 | ✅ | ✅ | AI 可发行/做市/交易/做空 |
| 银行/券商/交易所经营 | ✅ | ✅ | 同牌照/资本/审查/接管 |
| 行星/小星系产权 | ✅ | ✅ | 同估值/税/托管/攻城 |
| 主权战争 | ✅ | ✅ | 同宣战/动员/战争分/结算 |
| 议会席位/投票/提案 | ✅ | ✅ | AI 议员是正式玩家议员 |
| 联盟/外交/战争/攻城 | ✅ | ✅ | 同冷却/等级保护 |
| 破产/违约/清算/法院 | ✅ | ✅ | 同法律流程；个人不破产 |
| 被举报/审计/处罚 | ✅ | ✅ | 同规则 |

> 唯一“不同”是 AI 由服务端调度器驱动，而不是浏览器输入；这是实现方式，不是游戏身份。

---

## 3. 创建 AI 玩家

1. 创建隐藏 `account`（`email NULL`、`password_hash NULL`、status `active`，不可登录）；
2. 创建正常 `player`（`controller='server_ai'`）；
3. 创建 `economic_actor(kind='player', controller='server_ai')`；
4. 创建 `ai_agents` 自动化配置（1:1）；
5. 初始资本按模拟参数注入（一次性）；之后与真人一样靠经营。

### 3.1 `ai_agents`

```text
ai_agents
  id uuid pk
  code text unique
  name text
  persona text
  player_id uuid unique references players
  actor_id uuid unique references economic_actors
  faction_code text null
  capital_seed numeric(30,4)
  risk_profile jsonb
  config jsonb
  status text check ('active','paused','bankrupt')
  last_tick_at
  created_at

ai_decisions
  id bigserial
  agent_id uuid
  tick_at timestamptz
  action text
  inputs jsonb        -- 公开市场快照摘要
  score numeric
  reason text
  result jsonb
  created_at
```

`players.controller` 只影响调度/审计，不参与权限判断。

---

## 4. Persona

| persona | 目标 | 主要行为 | 风险 |
|---|---|---|---|
| `industrialist` 实业家 | 长期产能 | 买行星、建站、生产、卖商品 | 中 |
| `banker` 银行家 | 利差/稳定 | 吸储、放贷、兑换、抵押管理 | 低-中 |
| `trader` 商人 | 价差 | 跨区套利、库存周转 | 中 |
| `quant` 量化 | 统计收益 | 股票动量/均值回归、做市 | 中-高 |
| `landlord` 地主 | 租金/升值 | 买行星/系统、出租、挂牌 | 中 |
| `raider` 掠夺者 | 战争收益 | 攻城、战后资产、黑市 | 高 |
| `explorer` 探索者 | 发现溢价 | 新行星首占、卖探索数据 | 高 |
| `councilor` 议员 | 政策影响 | 投票、提案、公共投资 | 低 |
| `market_maker` 做市商 | 流动性 | 双边报价、库存中性 | 中 |

首版 12-20 名 AI 玩家，每名独立 `player`；数量/初始资本由模拟参数决定，不能靠降低 AI 权限来平衡。

---

## 5. 决策循环

每 60 秒（可配置）执行 `ai_economy_tick`；决策由 `DecisionProvider` 提供，默认 `deterministic`，外部 LLM 见 [10-ai-decision-engine.md](10-ai-decision-engine.md)：

1. **观察（只读公开数据）**
   - 市场价格、盘口、K 线、指数、利率、汇率；
   - 自己的库存/现金/贷款/公司/房产；
   - 星区税率、攻城状态、议会政策；
   - 不能读其他玩家私有库存、未公开订单、贷款明细。
2. **生成候选动作**
   - 买/卖商品、股票、产权；
   - 存款/贷款/兑换；
   - 建站/生产/雇工；
   - 提案/投票（当选议员后）。
3. **约束过滤**
   - 现金、库存、持仓上限、冷却、许可、税率、风险预算；
   - 不允许自成交、对倒、超限持仓。
4. **评分**
   ```text
   score = expected_return
         - risk_aversion × volatility
         - fees
         - tax
         - opportunity_cost
         + persona_bias
   ```
5. **选择与执行**
   - 取 top-k，按确定性 RNG 在边际动作中扰动；
   - 逐笔调用 domain service；失败记录，不重试超过 2 次。
6. **写审计**
   - `ai_decisions` 记录 inputs 摘要/score/reason/result。

---

## 6. 做市与央行

### 6.1 做市商

`market_maker` 可以是 AI 玩家，也可以是真人（同一规则）：

```text
mid = 指数/最近成交加权
spread = max(0.2%, volatility × 0.5)
bid = mid × (1 - spread/2) - inventory_skew
ask = mid × (1 + spread/2) - inventory_skew
```

- 库存偏离目标时调价；
- 单日最大库存 ≤ 流通 5%；
- 极端行情可撤单，但不能关闭市场；
- 不享受零手续费/优先成交。

### 6.2 央行

央行是系统机构，利率算法由服务端执行，不是 AI 玩家的特权。AI 玩家可以经营商业银行，但不能直接改基准利率。

---

## 7. 议会与法律

- 现有 5 个 AI 议员就是 5 名 AI 玩家议员，占正式议席，可被罢免；
- 新 AI 玩家当议员，与真人一样“申请入会 → 议会投票”；
- AI 可以提案、投票、被质询、被罚款、被破产清算；
- AI 银行/公司同样披露公开报表；
- 真人可以对 AI 议员/银行/公司发起不信任案、诉讼、收购。

---

## 8. 公平与反作弊

- AI 与真人同费用、税率、冷却、订单簿；
- 任何玩家（含 AI）不能读他人私有数据；
- 任何玩家不能绕过 `Idempotency-Key`、资金、许可、持仓校验；
- 关联交易/对倒/垄断判定对 AI/真人一致；
- 不设 AI 专属净资产上限；用对所有玩家一致的反垄断/持仓/份额规则；
- `AI_RUNTIME_PAUSE` 只是运维熔断（策略 bug），不没收资产/不取消席位/不改合同；
- 所有 AI 决策可回放；每日“经济行为摘要”。

---

## 9. API / 管理端

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/players?controller=ai` | 公开 AI 玩家列表（与真人同一目录） |
| GET | `/players/{id}` | 公开玩家报表（同结构） |
| POST | `/admin/ai/tick` | 触发一次 tick（dev/admin） |
| POST | `/admin/ai/runtime-pause` | 暂停自动下单（运维，不是封禁） |

---

## 10. 测试与验收

- 每个 AI 有正式 `players`/actor；真人能调用的业务接口 AI 都能调用；
- 代码审计确认没有 `if is_ai` 给特权；
- AI 不能读私有接口；
- AI 决策有 `ai_decisions` 记录；
- AI 破产/违约/被罢免流程与真人一致；
- 暂停开关只暂停自动下单；
- AI 银行/公司/议员与真人同规则。

---

## 11. 风险与已定控制

| 风险 | 已定控制 |
|---|---|
| AI 策略同质化 | 单一 persona ≤40% AI 数量；同策略相关性 >0.8 的 AI ≤3 个；单 AI 同向订单 ≤市场 20%；强制探索/随机扰动 |
| AI 资本过大 | 全局反垄断（03 §6.3）：share>40%、top3>70%、HHI>2500 触发；不使用 AI 专属上限 |
| 策略 bug | `AI_RUNTIME_PAUSE` + 回放 + 公告；只停自动下单，不没收资产/席位 |
| AI/真人共谋 | 关联交易/对倒/同向订单相关性检测；同一控制人合并计算 |
| 市场操纵 | 与真人同一规则：自成交/对倒/虚假挂单/拉抬打压；罚款/停牌/禁入 |
| 数据泄漏 | 只读公开数据；不读私有库存/订单/贷款；出网审计 |
| 模型漂移 | 确定性回放 + 版本化策略；外部 LLM 只做候选，默认关闭 |

反垄断/同质化的具体阈值与执行阶梯见 [03-commerce-center.md](03-commerce-center.md) §6.3。

---

## 12. 落地状态（`0113_ai_economy`）

已落地：`ai_agents`、`ai_decisions`（含 10 §4.6 的 provider 审计字段）、`repo/ai.py`、`domain/ai_provider.py`、
`domain/ai_economy.py`、`api/v1/admin_ai.py`、job `ai_economy_tick`（60s，首跑自动建 12 名 AI）。

- **身份**：`accounts`（`email`/`password_hash` NULL、`status='active'`）+ `players.controller='server_ai'`
  + `economic_actors` + `ai_agents`。为了让隐藏账号能是 `active`，0113 把 `active_requires_password`
  放宽为「active 必须有密码，或没有 email」；登录按 email 查账号，因此 AI 账号永不可登录。
- **初始资本**：bootstrap 一次性从 treasury 注入（默认 5,000 cc4，上限 50,000），记账 `ai_capital_seed`，之后不再补。
- **名册**：12 人，persona 覆盖 9 类，bootstrap 校验单一 persona ≤ 40%；议会 5 个 AI 席位挂到对应 AI 玩家（§7）。
- **决策**：`DeterministicProvider`（`name=deterministic`, `version=1`），`seed=hash(agent|tick|snapshot_hash|policy_version)`；
  白名单 `stock.order` / `bank.deposit`；每个 tick 一条 `ai_decisions`，`replay()` 可逐字复算。
- **暂停**：`feature_flags.ai.runtime_pause`，只停自动下单；恢复后从下一 tick 继续，资产/席位不变。

未做：AI 在产权/公司/银行/议会/攻城的动作、做市商双边报价、同质化相关性检测、
`llm_shadow`/`llm_canary`/`llm_live`（留给 0116）、`/players` 分页筛选。


---

## 落地状态（`0120_price_index`）

- `price_indices`：`CSX` 宇宙股票综合指数，`cap_weighted`，`base_value=1000`；首次计算时把当时的
  `Σ(last_price × free_float)` 记为 `base_cap`，此后 `value = 1000 × cap / base_cap`，新宇宙一定从 1000 起。
- `price_index_points`：每分钟一个快照（同分钟 upsert），`components` 存权重前 5，可从当时行情复算。
- `mm_quotes`：做市商报价审计，记录 mid / bid / ask / 点差 bp / 波动率 bp / 库存偏移 bp。
- 报价公式（06 §6.1）：`mid = 最近成交或买一卖一中价`，`spread = clamp(max(0.2%, 0.5×近 20 日平均振幅), 5%)`，
  库存偏移按 `(持仓 − 目标)/目标` 计算并夹在 ±100bp，**整条报价带平移**（`quoted_mid`），保证 `bid < quoted_mid < ask`。
- 端点：`GET /market/indices`、`GET /market/indices/{code}/points`、`GET/POST /stocks/{ticker}/quote`、
  `POST /admin/market/index/publish`；job `price_index_tick` 每 5 分钟发布。
- 前端：星舰实验舱新增「星际股市」标签，盘口 / K 线（纯 SVG，无图表库）/ 持仓，涨红跌绿。
- 未做：成分股调整与除权、指数期货、做市商双边自动挂单（当前只出报价与存档）。
