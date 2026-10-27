# 宇宙经济系统设计文档（归档总设计）

> **归档说明：本文件是拆分前的总设计，保留作历史参考。新开发请看 README 中的分册 `00`–`10`。**
>
> **注意：本文件中的具体规则可能已被分册覆盖或推翻（做空、T+0/T+1、玩家交易所、关税、破产法院、2PC、LLM 接口等）；实现以分册为准，不要直接按本文件编码。**
>
> 状态：设计稿（未实现）  
> 适用代码：`d:/mni/moni-repo`  
> 现有基础：服务端 `0109_cosmic_council`、PG 账本/钱包、市场/合同、行星/小行星系统、宇宙议会、AI 议员、NPC/势力。  
> 本文目标：给另一个开发会话一份可直接拆任务的实现蓝图，先做 MVP，再扩展。

---

## 1. 产品目标

把当前“资源采集 + 单行星市场 + 玩家占领”扩展为完整的宇宙经济：

1. **九级宇宙货币**：有品质、有兑换、有发行纪律，不是简单地再加 9 种资源。
2. **宇宙银行**：存取、兑换、贷款、储备、利息、托管、保险箱；中央银行 + 商业银行 + AI 银行。
3. **宇宙商业管理中心**：公司注册、商业许可、关税、价格指数、反垄断、IPO 审核、商业纠纷。
4. **股票与 K 线**：公司上市、订单簿、成交、K 线、分红、持仓；AI 与真人同一套规则。
5. **星球 / 小星系产权**：可估值、挂牌、拍卖、转让；与现有 `world_planets` 攻城系统兼容。
6. **AI 玩家 = 第一类玩家**：AI 有正式 `players` 行、完整资产/负债/公司/银行/产权，能投票、能攻城、能被罢免；不是脚本 NPC，也不是受限账号。
7. **真人 + AI 同场同权**：同一价格、同一订单簿、同一产权登记、同一手续费/税率/冷却；任何玩家都不能读他人私有数据，不能绕过校验。

### 1.1 非目标（首版不做）

- 真实法币/加密资产出入金。
- 高频做市/毫秒级撮合。

> 归档说明：完整公司/破产法院、跨区 2PC、确定性策略引擎已纳入新分册；外部 LLM 仅作为内部可选适配器，默认关闭。详见 `README` 的 `08`–`10`。

---

## 2. 总体架构

```text
                       ┌──────────────────────────────┐
                       │  Web / React 经济中心 UI      │
                       │ 银行 商业 股票 房产 AI 玩家   │
                       └──────────────┬───────────────┘
                                      │ /api/v1
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
┌───────▼────────┐          ┌─────────▼─────────┐         ┌─────────▼─────────┐
│ CurrencyService│          │  CommerceService  │         │   StockService    │
│ BankService    │          │  CompanyService   │         │   PropertyService │
└───────┬────────┘          └─────────┬─────────┘         └─────────┬─────────┘
        │                             │                             │
        └──────────────┬──────────────┴──────────────┬──────────────┘
                       │                             │
              ┌────────▼────────┐          ┌─────────▼─────────┐
              │ Currency Ledger │          │ Commodity Ledger  │
              │ actor/currency  │          │ 现有 wallets/ledger│
              └────────┬────────┘          └─────────┬─────────┘
                       │                             │
              ┌────────▼─────────────────────────────▼─────────┐
              │              PostgreSQL (单库事务)              │
              │  actors / companies / banks / stocks / deeds   │
              └──────────────────────┬──────────────────────────┘
                                     │
                     ┌───────────────▼────────────────┐
                     │ Jobs: interest / candles / AI  │
                     │ ai_economy_tick / appraisal    │
                     └────────────────────────────────┘
```

### 2.1 关键边界

- **商品资源**（反物质、氘、合金等）继续走现有 `wallets` / `ledger_transactions`，不改成货币。
- **宇宙货币**走独立的 `currency_ledger_*` 双分录账本，避免把货币混进“资源库存”。
- 所有经济主体（真人、AI、公司、银行、国库、议会基金）统一为 `economic_actors`；货币账户挂在 actor 上。
- 商品与货币之间通过“市场/银行兑换”桥接；桥接交易必须同时写商品账本和货币账本，或明确只走一边并记录汇率快照。
- 现有 `world_planets` 是行星产权的事实表；新房产系统只做**挂牌/估值/托管/转让**，不另建一套行星归属。

---

## 3. 九级宇宙货币

### 3.1 货币定义

| 品质 | code | 名称 | 定位 | 相对 Q1 基准值 | 主要来源 |
|---|---|---|---|---|---|
| Q1 | `cc1` | 星尘币 | 日常流通、工资、小额交易 | 1 | 任务/采集/合同/银行发行 |
| Q2 | `cc2` | 星砂币 | 中级贸易、站内结算 | 5 | 银行兑换/商业收入 |
| Q3 | `cc3` | 蔚蓝币 | 跨星区贸易、合同保证金 | 25 | 兑换/公司营收 |
| Q4 | `cc4` | 银核币 | 股票报价、商业贷款 | 125 | 兑换/IPO/银行 |
| Q5 | `cc5` | 金核币 | 行星产权、银行资本 | 625 | 兑换/大额结算 |
| Q6 | `cc6` | 星辉币 | 小星系产权、跨区投资 | 3,125 | 兑换/央行拍卖 |
| Q7 | `cc7` | 曲率币 | 大型并购、战略储备 | 15,625 | 央行/议会财政 |
| Q8 | `cc8` | 奇点币 | 顶级资产、主权级结算 | 78,125 | 央行拍卖/创世发行 |
| Q9 | `cc9` | 创世币 | 宇宙级储备、极端稀缺 | 390,625 | 仅央行/议会特别发行 |

> 基准值是**会计参考值**，不是固定汇率；实际兑换由银行牌价 + 手续费 + 市场深度决定。

### 3.2 数值与精度

- 数据库：`numeric(30,4)`，Python 用 `Decimal`，禁止 `float`。
- 最小单位：`0.0001` 货币单位；所有接口返回字符串或 decimal，前端用字符串解析。
- 单一货币内余额非负；兑换/贷款/托管必须有对应负债或冻结账户，不允许凭空负数。
- 展示：Q1-Q3 保留 2 位，Q4-Q9 保留 4 位；K 线价格用 Q4 的 0.0001 单位整数化展示。

### 3.3 发行与回收

- **Q1**：由央行按“经济产出锚”发行：
  - 每日基础发行 = `clamp(活跃玩家数 × 120 + 昨日商品成交额 × 0.02%, 下限, 上限)`；
  - 通过任务、合同、首次探索奖励进入流通；
  - 不是管理员随意加余额；央行操作写 `currency_issuance` 审计。
- **Q2-Q9**：默认不直接发行，只能通过：
  1. 银行向上兑换（燃烧低阶 + 手续费）；
  2. 央行公开拍卖/储备投放；
  3. 议会财政特别动议（需 4 票 + 公示期）。
- **回收（burn）**：
  - 兑换手续费、交易税、银行服务费、IPO 承销费、产权转让税；
  - 回收销毁进入 `currency_burn` 科目，不能回到流通。
- **通胀目标**：Q1 月度净增 ≤ 3%；超过时央行自动提高兑换手续费/利率。

### 3.4 兑换规则

采用“向上 5:1 + 损耗，向下 1:4.6”的非对称设计，防止循环套利：

```text
向上：5.00 Qn + 6% 手续费（燃烧） → 1.00 Q(n+1)
向下：1.00 Q(n+1) → 4.60 Qn（银行点差 8%）
```

- 手续费按输入货币计，至少 0.0001。
- 同一 actor 同一货币对 1 分钟内只能换一次（防脚本刷点差）。
- 大额兑换（> 当日该货币池 1%）需要银行有足够储备，否则挂单/分批。
- 兑换价快照写入 `currency_exchange_quotes`，成交写 `currency_ledger`。

### 3.5 货币的用途

| 场景 | 要求 |
|---|---|
| 日常市场买卖 | Q1-Q3 |
| 合同保证金 | Q3+ |
| 股票报价/成交 | Q4（银核币） |
| 商业贷款 | Q4+ |
| 行星产权 | Q5+ |
| 小星系产权 | Q6+ |
| 银行牌照资本金 | Q5+ |
| 议会特别基金 | Q6+ |

高品质货币不是“更大面额”这么简单：它决定**准入资格**、**抵押折扣**和**银行储备层级**。

---

## 4. 经济主体与账本

### 4.1 `economic_actors`

所有能持有货币/公司/产权的主体：

```text
economic_actors
  id uuid pk
  kind text check in ('player','company','bank','treasury','council_fund','system')
  controller text check in ('human','server_ai','system')  -- 仅 player 使用 human/server_ai
  player_id uuid null references players
  company_id uuid null references companies
  bank_id uuid null references banks
  display_name text
  status text check in ('active','frozen','closed')
  created_at
```

- **AI 玩家就是玩家**：AI 使用和真人完全相同的 `players` 行与 `kind='player'` actor；唯一区别是 `players.controller='server_ai'`，用于后台调度/审计，不参与权限、费用、税率、订单优先级判断。
- 真人 `controller='human'`；公司/银行/国库 actor 的 `controller='system'`。
- 公司和银行也建 actor；公司账户、银行储备账户都挂在 actor 上。
- `ai_agents` 只是“自动化配置”，不是另一种经济主体；详细见第 9 节。
- 唯一约束：`player_id`、`company_id`、`bank_id` 各自最多一个 actor；`ai_agents.player_id` 唯一。

### 4.2 货币账本

不要复用现有商品 `ledger_entries`（它是 `player_id + resource_code` 语义）。新增：

```text
currency_ledger_transactions
  id uuid pk
  kind text            -- exchange/deposit/withdraw/loan/interest/trade/tax/transfer/issuance/burn
  ref_type text
  ref_id text
  memo text
  created_at timestamptz

currency_ledger_entries
  id bigserial pk
  tx_id uuid references ...
  actor_id uuid references economic_actors
  currency_code text references currencies
  delta numeric(30,4) not null
  balance_after numeric(30,4) not null
```

约束：

- 每笔 tx 的 `sum(delta) = 0`；发行/销毁用系统 actor `treasury` / `burn` 对冲。
- 写入时按 `(actor_id, currency_code)` 排序 `SELECT ... FOR UPDATE`，避免死锁。
- 所有余额变更必须来自 domain service；repo 只做 SQL。
- `currency_accounts(actor_id, currency_code, balance, frozen, updated_at)` 作为快照表，与账本同事务更新。

### 4.3 与现有商品账本的桥

- 商品换货币：`POST /market/sell-for-currency`，先扣商品（现有 `post_transaction`），再入货币；两步在同一事务，任何一步失败回滚。
- 货币换商品：反向；货币先冻结，商品到账后结算。
- 记录 `exchange_rate_snapshot jsonb`，避免跨账本对账时无法解释。

---

## 5. 宇宙银行

### 5.1 银行层级

| 层级 | 数量 | 职能 |
|---|---|---|
| 宇宙中央银行 `central` | 1 | 发行 Q1、设定基准利率、最后贷款人、管理储备 |
| 商业银行 `commercial` | ≤ 12 | 吸储、放贷、兑换、托管、保险箱 |
| AI 银行 | 2-4 | 与商业银行同规则，AI 经营 |
| 议会基金 | 1 | 公共建设/稳定基金，由议会动议拨款 |

玩家可以发起“银行牌照”动议加入议会审核；通过后创建商业银行，资本金 Q5 起。

### 5.2 数据模型

```text
currencies(code pk, quality, name, base_value, decimals, status, issuer_actor_id, created_at)

banks
  id uuid pk
  code text unique
  name text
  kind text check ('central','commercial')  -- AI 银行也是 commercial，由 AI 玩家持有
  owner_actor_id uuid null
  license_motion_id uuid null
  reserve_ratio numeric(5,4) default 0.15
  status text check ('pending','active','suspended','closed')
  created_at

bank_accounts
  id uuid pk
  bank_id uuid
  actor_id uuid
  currency_code text
  balance numeric(30,4) default 0
  frozen numeric(30,4) default 0
  interest_bps integer default 0
  status text
  unique (bank_id, actor_id, currency_code)

bank_reserves(bank_id, currency_code, balance, updated_at) pk(bank_id,currency_code)

bank_loans
  id uuid pk
  bank_id, borrower_actor_id
  currency_code
  principal, outstanding
  interest_bps, term_days
  collateral jsonb       -- {currency, planets, shares}
  status check ('active','repaid','defaulted','liquidated')
  due_at, created_at

bank_interest_runs
  id, bank_id, day, total_interest, total_deposits, created_at
```

### 5.3 产品

1. **活期存款**：随时存取；年化 `base_rate - bank_spread`；按日计息、日终入账。
2. **定期存款**：7/30/90 天；提前支取损失利息 + 1% 本金；银行可用作放贷资金。
3. **兑换**：九级货币买卖；银行牌价 = 基准中间价 × (1 ± 点差)；库存不足时拒单。
4. **贷款**：
   - 抵押品：货币、公司股份、行星产权；
   - LTV：Q1-Q3 50%，Q4-Q6 60%，Q7-Q9 70%；股票按 20 日均价 50%；行星按评估价 40%；
   - 利息按日；逾期 3 天开始罚息，7 天强制平仓抵押品。
5. **托管/保险箱**：产权、股票、货币可托管；托管凭证可交易。
6. **银行间拆借**：银行储备不足时向央行/其他银行拆借，利率由央行基准 + 风险溢价。

### 5.4 利率与央行算法

```text
target_inflation = 2% / 月
if actual_inflation > target + 1%: policy_rate += 50bp
if actual_inflation < target - 1%: policy_rate -= 50bp
clamp(policy_rate, 0, 15%)
bank_deposit_rate = policy_rate - 150bp
bank_lend_rate   = policy_rate + 250bp + risk_premium
```

- 每月 1 日央行 AI 重算；议会可 4 票否决一次，但不能连续否决两次。
- 利率变化写 `bank_rate_history`，所有贷款按“发放时利率”或“浮动利率”二选一，默认固定。

### 5.5 银行风险

- 挤兑：当某银行 24h 提现 > 存款 30%，自动暂停大额提现，央行注入流动性（计入央行资产）。
- 坏账：逾期 loan 进入 `defaulted`；抵押品拍卖所得按“费用 → 利息 → 本金 → 剩余返还借款人”顺序分配。
- 银行破产：储备不足且央行拒绝救助 → `closed`；存款保险赔付 Q1-Q4 每 actor 上限。

---

## 6. 宇宙商业管理中心（CCMC）

### 6.1 定位

CCMC 是“规则 + 数据 + 许可 + 争议”的公共机构，不是另一家银行。它管：

- 公司注册与披露
- 商业许可（跨星区贸易、银行、交易所、房产经纪）
- 关税/港口费/市场管理费
- 价格指数与参考价
- IPO/并购/反垄断审核
- 商业纠纷仲裁与罚款
- 公开商业数据（成交、财报、产权登记）

### 6.2 公司

```text
companies
  id uuid pk
  ticker text unique
  name text
  founder_actor_id uuid
  jurisdiction_sector text
  status check ('private','public','suspended','liquidated')
  shares_total bigint
  free_float bigint
  book_value numeric(30,4)
  treasury jsonb             -- 公司现金/资产快照
  created_at, listed_at

share_holdings(actor_id, company_id, shares, locked_until) pk(actor_id,company_id)
company_financials(company_id, period, revenue, cost, profit, assets, liabilities)
company_actions(id, company_id, kind, payload, status, effective_at)
```

- 注册公司：Q3 起，名称/代码唯一；需商业许可。
- 公司可以持有货币 actor、买行星、开银行（需额外牌照）、上市。
- 财报按月；不披露连续 3 个月 → 交易所停牌。

### 6.3 商业许可与税费

| 许可 | 费用 | 作用 |
|---|---|---|
| 跨区贸易 | Q3 / 月 | 跨星区市场交易 |
| 银行 | Q5 资本金 + 议会动议 | 吸储/放贷 |
| 交易所 | Q6 资本金 + 议会动议 | 股票/产权撮合 |
| 房产经纪 | Q4 / 月 | 挂牌/带看/成交 |
| 港口经营 | Q5 + 星区主权者同意 | 停靠/仓储/关税代收 |

税费：

- 商品交易税 0.5%，由 CCMC 收取，50% 进星区主权者，50% 进议会基金。
- 股票交易印花税 0.1%；产权转让税 2%。
- 关税按星区主权者设定，上限 8%；CCMC 审核是否歧视性。

### 6.4 价格指数

- `ccmc_price_index(sector_key, category, day, index_value, sample_size)`；
- 成分：商品成交价、股票指数、产权评估价、运费；
- 每日 00:10 UTC 由 job 计算；用于合同基准、银行贷款抵押、AI 决策。
- 指数异常（单日 ±15%）触发 CCMC 调查，暂停相关做市。

### 6.5 争议与处罚

- 申诉工单 `commerce_disputes`；AI 仲裁先给建议，玩家议员可覆核。
- 处罚：罚款（Q1-Q4）、暂停许可、强制平仓、退市。
- 所有处罚写审计与公告。

---

## 7. 星球与小星系产权

### 7.1 产权模型

```text
property_assets
  id uuid pk
  kind text check ('planet','system')
  asset_key text unique       -- planet_key 或 system_key
  title_owner_actor_id uuid
  jurisdiction_sector text
  valuation numeric(30,4)
  valuation_at timestamptz
  status text check ('unclaimed','owned','listed','auction','frozen')
  deed_no text unique
  created_at

property_listings
  id uuid pk
  asset_id uuid
  seller_actor_id uuid
  currency_code text           -- 仅 Q5+
  ask_price numeric(30,4)
  kind text check ('fixed','auction')
  starts_at, ends_at
  min_increment numeric(30,4)
  status text check ('open','escrow','sold','cancelled','expired')

property_bids(id, listing_id, bidder_actor_id, amount, status, created_at)
property_transfers(id, asset_id, from_actor_id, to_actor_id, price, tax, tx_id, created_at)
property_escrow(listing_id, buyer_actor_id, amount, currency_code, status)
```

### 7.2 行星

- 行星产权仍以现有 `world_planets.owner_player_id` 为事实；新增 `property_assets` 做登记/交易。
- 已有玩家/AI 占领的行星：自动建 deed，`title_owner_actor_id` 指向 actor。
- 无主行星：可由 CCMC 挂牌“开拓权”，买家支付 Q5+，获得产权；24h 护盾，仍可被攻城。
- 被攻城期间：listing 自动 `frozen`；攻城改变 owner 后，旧 deed 关闭、新 deed 生成。
- 行星上的建筑/沉积/合同不随产权自动转移？设计：**随产权转移**，但未领取产出归原主；建筑归属写入 deed 附件，避免“买房送兵”。
- 价格评估：类型、资源、建筑等级、人口、轨道位置、星区指数、最近成交。

### 7.3 小星系

- `system_key = system_{x},{y},{z}_{system_index}`；新增 `star_systems` 元数据（名称、恒星类型、行星数、交通、防御）。
- 系统产权给：
  - 对系统内行星交易/港口费征税权（上限 3%）；
  - 空间站/港口建设优先权；
  - 系统命名权（需 CCMC 审核，不得违规）；
  - 不自动拥有系统内行星表面；行星仍单独买卖/攻城。
- 系统价格通常为行星的 8-20 倍；购买需 Q6+，且不能是当前有攻城/争议的系统。
- 系统可被更高级别的“主权战争”争夺？首版不做，只做商业转让 + 现有行星攻城。

### 7.4 交易流程

1. 卖方挂牌 → 资产 `listed`，产权冻结。
2. 买方支付到 escrow（Q5+）。
3. CCMC 审核（禁售名单、未缴税、攻城状态）。
4. 交割：产权转移、税扣除、deed 更新、双方通知。
5. 争议期 24h；期间可申诉，CCMC 可冻结。
6. 流拍/取消：escrow 原路退回，资产恢复。

### 7.5 估值公式（首版）

```text
planet_value =
  base_by_type
  × (1 + resource_score × 0.4)
  × (1 + development_level × 0.08)
  × (1 + traffic_index × 0.2)
  × (1 + recent_sale_premium × 0.15)

system_value =
  sum(planet_values) × 0.35
  + station_slots × 8000
  + traffic_index × 20000
  + defense_power × 30
```

- 最终成交价由市场决定；估值只用于挂牌参考、贷款抵押和 AI 报价。
- 每 6h 重估一次；波动 >20% 触发人工/AI 复核。

---

## 8. 股票与 K 线

### 8.1 市场结构

- 交易所 `exchanges`：首版 1 个“宇宙联合交易所”，由 CCMC 监管，玩家可申请交易所牌照（后期）。
- 报价货币：Q4 银核币（`cc4`）；所有股票以 `cc4` 计价。
- 订单类型：限价、市价（市价单最多吃 5 档）；首版不支持做空/杠杆。
- 撮合：价格优先、时间优先；同一价格按订单 id 顺序；成交立即清算（T+0），后续可切 T+1。
- 最小价格变动：0.0001 cc4；最小交易单位 1 股。
- 手续费：买方 0.1%，卖方 0.1% + 印花税 0.1%；最低 0.0001 cc4。

### 8.2 数据模型

```text
stock_listings
  id uuid pk
  company_id uuid
  ticker text
  currency_code text default 'cc4'
  total_shares bigint
  free_float bigint
  status check ('pending','listed','suspended','delisted')
  ipo_price numeric(30,4)
  listed_at
  circuit_breaker_pct numeric(5,4) default 0.20

stock_orders
  id uuid pk
  listing_id uuid
  actor_id uuid
  side text check ('buy','sell')
  type text check ('limit','market')
  price numeric(30,4) null
  quantity bigint
  filled bigint default 0
  status check ('open','partial','filled','cancelled','rejected')
  created_at, updated_at

stock_trades
  id uuid pk
  listing_id uuid
  buy_order_id, sell_order_id
  buyer_actor_id, seller_actor_id
  price numeric(30,4)
  quantity bigint
  fee_buy, fee_sell, tax
  executed_at

stock_candles
  listing_id uuid
  interval text check ('1m','5m','15m','1h','1d')
  bucket_start timestamptz
  open, high, low, close numeric(30,4)
  volume bigint
  quote_volume numeric(30,4)
  trades integer
  primary key (listing_id, interval, bucket_start)
```

### 8.3 K 线规则

- 以 `stock_trades` 为唯一事实源；成交后同步 upsert 当前 1m/5m/15m/1h/1d 桶。
- 桶边界 UTC：1m 对齐分钟，1d 对齐 00:00 UTC。
- 空桶：保留前收作为 open/close，volume=0；K 线图不跳过时间轴。
- `1d` 收盘后写 `stock_daily_summary`，用于指数/估值。
- 保留：1m 30 天，5m 180 天，1h/1d 永久（冷归档可后做）。
- 前端用 `lightweight-charts`（TradingView 开源）或自绘 Canvas；首版推荐 `lightweight-charts`，支持蜡烛、成交量、十字光标。

### 8.4 IPO 与公司行为

- 上市条件：
  - 公司成立 ≥ 7 天；
  - 净资产 ≥ 50,000 cc4；
  - 连续 2 个季度盈利或营收 ≥ 100,000 cc4；
  - 自由流通 ≥ 20%；
  - CCMC 审核 + 议会简单多数（4 票）。
- 发行：新增股份卖给市场，募资进公司 treasury；老股东稀释。
- 分红：公司 treasury → 持仓按登记日快照分配；除息日调整开盘参考价。
- 拆股/并股：CCMC 批准，调整订单/持仓/K 线（历史 K 线保留原始，另存复权因子）。
- 退市：连续 30 日收盘 < 0.01 cc4 或严重违规；持仓按最后价现金结算。

### 8.5 熔断与风控

- 单日 ±20% 熔断 15 分钟；±30% 停牌至次日。
- 单账户单票持仓 ≤ 流通股 10%；超过部分强制减持。
- 自成交/对倒检测：同一 actor 买卖同一票 1 分钟内 > 5 笔且价格无变化 → 标记。
- 大额订单（> 当日成交量 5%）延迟 5 秒披露，防抢跑。
- 交易所停机：只允许撤单，不允许新单。

---

## 9. AI 玩家 = 第一类玩家

### 9.1 不可妥协的原则

**AI 玩家就是玩家。真人玩家可以做什么，AI 玩家就可以做什么；反过来，真人受的限制，AI 也一样受。**

这不是“给 NPC 加一点交易行为”，而是：

- AI 有完整的 `players` 行、`economic_actors` 行、资产负债表；
- AI 可以采集、扫描、做合同、买卖商品、炒股、开公司、IPO、开银行、贷款、买行星/小星系、加入联盟、参与攻城、申请加入宇宙议会、投票、提案；
- AI 可以被其他玩家交易、雇佣、借贷、宣战、投票罢免、起诉/罚款；
- AI 与真人使用同一套 domain service、同一套 API、同一套订单簿、同一套手续费/税率/冷却/限额；
- AI 不能读取玩家私有数据，不能直接改数据库，不能跳过 `Idempotency-Key`，不能享受零手续费或优先成交。

### 9.2 能力对照

| 能力 | 真人玩家 | AI 玩家 | 说明 |
|---|---|---|---|
| 探索/采集/扫描/地表 | ✅ | ✅ | 同一冷却、同一资源账本 |
| 市场买卖/合同 | ✅ | ✅ | 同一市场、同一库存 |
| 银行存取/兑换/贷款 | ✅ | ✅ | 同一利率、同一抵押规则 |
| 公司注册/经营/财报 | ✅ | ✅ | AI 可以是创始人/股东/CEO |
| IPO/股票/订单簿/K 线 | ✅ | ✅ | AI 可以是发行人/做市商/交易员 |
| 行星/小星系产权 | ✅ | ✅ | 同一估值、税、托管、攻城风险 |
| 宇宙议会席位/投票/提案 | ✅ | ✅ | AI 议席也是玩家议席，可被罢免 |
| 联盟/外交/战争/攻城 | ✅ | ✅ | 同一宣战冷却、等级保护 |
| 破产/违约/被清算 | ✅ | ✅ | 同一法律与清算流程 |
| 被举报/审计/处罚 | ✅ | ✅ | 同一规则，不因 AI 身份豁免 |

> 唯一“不同”是 AI 由服务端调度器驱动，而不是浏览器输入；这属于实现方式，不是游戏身份。

### 9.3 AI persona 类型

| persona | 目标 | 主要行为 | 风险 |
|---|---|---|---|
| `industrialist` 实业家 | 长期产能 | 买行星、建站、生产、卖商品 | 中 |
| `banker` 银行家 | 利差/稳定 | 吸储、放贷、兑换、抵押品管理 | 低-中 |
| `trader` 商人 | 价差 | 跨星区套利、库存周转 | 中 |
| `quant` 量化 | 统计收益 | 股票动量/均值回归、做市 | 中-高 |
| `landlord` 地主 | 租金/升值 | 买行星/系统、出租、挂牌 | 中 |
| `raider` 掠夺者 | 战争收益 | 攻城、押注战后资产、黑市 | 高 |
| `explorer` 探索者 | 发现溢价 | 新行星首占、卖探索数据 | 高 |
| `councilor` 议员 | 政策影响 | 投票、提案、公共投资 | 低 |
| `market_maker` 做市商 | 流动性 | 双边报价、库存中性 | 中 |

首版建议 12-20 名 AI 玩家，每名 AI 是独立 `player`，各自 1 个 persona；初始资本/数量由经济模拟配置，之后完全靠经营结果，不享受额外补贴。

### 9.4 自动化档案与数据模型

`ai_agents` 不是“AI 玩家表”，而是玩家的**自动操作配置**：

```text
players
  controller text check in ('human','server_ai') default 'human'
  -- 现有 players 表新增；server_ai 只影响调度器，不影响任何游戏权限

ai_agents
  id uuid pk
  code text unique
  name text
  persona text
  player_id uuid unique references players
  actor_id uuid unique references economic_actors
  faction_code text null
  capital_seed numeric(30,4)  -- 仅创建时注资，之后与真人一样靠经营
  risk_profile jsonb          -- {risk, horizon, max_position_pct, ...}
  config jsonb                -- 策略权重/阈值
  status text check ('active','paused','bankrupt')
  last_tick_at
  created_at

ai_decisions
  id bigserial
  agent_id
  tick_at
  action text
  inputs jsonb                -- 公开市场快照摘要
  score numeric
  reason text
  result jsonb
  created_at
```

- 创建 AI 玩家时：系统先建隐藏 `account`（`email NULL`、`password_hash NULL`、status `active`，不可交互登录）→ 正常 `player`（`controller='server_ai'`）→ `economic_actor`；之后与真人完全同表、同权限。
- AI 的 `player`/actor/资金/持仓/产权与真人同表；`ai_agents` 只是“谁在自动操作这个玩家”的档案。
- AI 不直接写余额；调用与真人相同的 domain service（`BankService.deposit`、`StockService.place_order`）。
- 调度器使用与真人相同的业务命令、幂等键、冷却和限额；不提供“AI 专用下单通道”。
- `ai_decisions` 是审计日志，不是权限表。

### 9.5 决策循环

每 60 秒（可配置）执行 `ai_economy_tick`：

1. **观察（只读公开数据）**
   - 市场价格、盘口、K 线、指数、利率、汇率；
   - 自己库存/现金/贷款/公司/房产；
   - 星区税率、攻城状态、议会政策；
   - **不能**读其他玩家私有库存、未公开订单、贷款明细。
2. **生成候选动作**
   - 买/卖商品、股票、产权；
   - 存款/贷款/兑换；
   - 建站/生产/雇工；
   - 提案/投票（当选议员后，和真人议员完全一样）。
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
   - 每个 persona 有不同权重；例如 quant 更看重波动率，industrialist 更看重长期现金流。
5. **选择与执行**
   - 取 top-k，按确定性 RNG 在边际动作中扰动；
   - 逐笔调用 domain service；失败记录原因，不重试超过 2 次。
6. **写审计**
   - `ai_decisions` 记录 inputs 摘要/score/reason/result，便于复盘。

### 9.6 AI 做市与稳定机制

- `market_maker` AI 在股票/产权市场提供双边报价：
  ```text
  mid = 指数/最近成交加权
  spread = max(0.2%, volatility × 0.5)
  bid = mid × (1 - spread/2) - inventory_skew
  ask = mid × (1 + spread/2) - inventory_skew
  ```
- 库存偏离目标时调整报价；单日最大库存 ≤ 流通 5%。
- 央行 AI 按第 5.4 节利率规则运行；不直接买股票。
- 极端行情（指数 ±10%）AI 做市商可以撤单，但不能关闭市场。

### 9.7 公平与反作弊（对所有玩家一致）

- AI 与真人使用同一套费用、税率、冷却、订单簿；AI 不享受零手续费或优先撮合。
- 任何玩家（含 AI）都不能访问他人私有库存、未公开订单、贷款明细；只能读公开盘口/指数/公告。
- 任何玩家（含 AI）都不能绕过 `Idempotency-Key`、资金校验、许可校验、持仓上限。
- 关联交易/对倒/垄断的判定对 AI 与真人一致；同一控制人（公司/联盟）合并计算。
- 不设“AI 专属净资产上限”。需要防止单一主体过大时，使用**对所有玩家一致**的反垄断/持仓/市场份额规则。
- `AI_RUNTIME_PAUSE` 只是运维熔断（例如策略 bug），不是游戏规则；触发时只暂停自动下单，不改变 AI 的资产/席位/合同，恢复后继续。
- 所有 AI 决策可回放；每日生成“经济行为摘要”，真人与 AI 均可被审计。

### 9.8 AI 与议会、法律

- 现有 5 个 AI 议员就是 5 名 AI 玩家议员，占的是正式议席，不是“系统席位”；可被同样的罢免动议移除。
- 新 AI 玩家要当议员，和真人一样走“申请入会 → 议会投票”，没有自动席位。
- AI 可以提案、投票、被质询、被罚款、被破产清算；AI 银行/公司同样披露公开报表。
- 真人玩家可以对 AI 议员/银行/公司发起同样的不信任案、诉讼或收购。

---

## 10. API 设计（首版）

统一前缀 `/api/v1`，写接口要求 `Idempotency-Key`，错误沿用现有 `{type,title,status,detail,code,request_id}`。

### 10.1 货币与银行

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/currencies` | 九级货币定义/基准值/状态 |
| GET | `/wallet/currencies` | 我的各币种余额 |
| POST | `/bank/exchange` | `{from,to,amount}` 兑换 |
| GET | `/banks` | 银行列表/利率/储备率 |
| POST | `/banks/{id}/deposit` | `{currency,amount}` |
| POST | `/banks/{id}/withdraw` | 同上 |
| POST | `/banks/{id}/loans` | `{currency,principal,term_days,collateral}` |
| GET | `/bank/accounts` | 我的存款/贷款 |
| POST | `/bank/loans/{id}/repay` | 还款 |
| GET | `/bank/rates` | 央行基准/银行牌价 |

### 10.2 商业中心

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/companies` | 注册公司 |
| GET | `/companies` | 公司列表/财报摘要 |
| GET | `/companies/{ticker}` | 详情/股东/财报 |
| POST | `/companies/{ticker}/shares/transfer` | 非上市股权转让 |
| GET | `/commerce/licenses` | 我的许可 |
| POST | `/commerce/licenses` | 申请许可 |
| GET | `/commerce/index` | 价格指数 |
| POST | `/commerce/disputes` | 发起争议 |

### 10.3 股票与 K 线

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/stocks` | 上市列表/最新价/涨跌幅 |
| GET | `/stocks/{ticker}` | 详情/盘口/公司 |
| GET | `/stocks/{ticker}/candles?interval=1m&limit=300` | K 线 |
| POST | `/stocks/{ticker}/orders` | `{side,type,price,quantity}` |
| DELETE | `/stocks/orders/{id}` | 撤单 |
| GET | `/stocks/orders` | 我的委托 |
| GET | `/stocks/portfolio` | 持仓/成本/盈亏 |
| POST | `/stocks/ipo` | 申请 IPO（CCMC） |

### 10.4 产权

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/properties?kind=planet|system` | 挂牌列表 |
| POST | `/properties/{asset}/list` | 挂牌 |
| POST | `/properties/listings/{id}/buy` | 买入 |
| POST | `/properties/listings/{id}/bid` | 拍卖出价 |
| GET | `/properties/{asset}` | 产权/估值/历史 |
| GET | `/properties/my` | 我的产权 |

### 10.5 AI（公开/管理）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/players?controller=ai` | 公开 AI 玩家列表（与真人同一套玩家目录） |
| GET | `/players/{id}` | 公开玩家报表（真人/AI 同结构） |
| POST | `/admin/ai/tick` | 管理触发一次 tick（仅 dev/admin） |
| POST | `/admin/ai/runtime-pause` | 运维暂停自动下单（不是游戏封禁） |

> 管理端不要暴露在公网；`/admin/*` 需独立角色 `admin`。

---

## 11. 数据库迁移拆分

建议按四步落地，不要一个大迁移：

### `0110_currency_bank`

- `players.controller`（`human|server_ai`；只影响调度，不影响权限）
- `currencies`
- `economic_actors`
- `currency_accounts`
- `currency_ledger_transactions` / `currency_ledger_entries`
- `banks` / `bank_accounts` / `bank_reserves` / `bank_loans` / `bank_interest_runs`
- 初始化 9 种货币、央行 actor；商业银行/AI 银行在业务层创建（AI 银行是 AI 玩家持有的 commercial bank）。

### `0111_commerce_property`

- `companies` / `share_holdings` / `company_financials`
- `commerce_licenses` / `commerce_price_index` / `commerce_disputes`
- `property_assets` / `property_listings` / `property_bids` / `property_transfers` / `property_escrow`
- `star_systems`（若现有世界表没有系统元数据）

### `0112_stock_market`

- `stock_listings` / `stock_orders` / `stock_trades` / `stock_candles`
- `stock_daily_summary` / `stock_holders` / `dividends`
- 索引：`(listing_id, bucket_start)`、`(listing_id, status, price, created_at)`

### `0113_ai_economy`

- `ai_agents`（`player_id` 1:1；只存自动化配置，不存游戏权限）
- `ai_decisions`（审计）
- AI 玩家初始化：先建正式 `players` 行，再建 `ai_agents` 档案；不得创建特殊 `ai` actor

> 迁移后 `DEFAULT_REVISION` 逐级更新；每个迁移都要有 downgrade 与测试库清理规则。

---

## 12. 核心算法伪代码

### 12.1 货币兑换

```python
def exchange(actor, src, dst, amount):
    quote = bank_quote(src, dst)          # 中间价 + 点差
    if amount <= 0: error
    if src.quality + 1 == dst.quality:
        gross = amount / 5.0
        fee = gross * 0.06
        out = gross - fee
    elif src.quality == dst.quality + 1:
        out = amount * 4.60
    else:
        error("只能相邻品质兑换")
    lock_accounts(actor, [src, dst], sorted=True)
    debit(actor, src, amount)
    credit(actor, dst, out)
    credit(TREASURY, src, fee)
    write_currency_ledger(...)
    return {out, fee, rate}
```

### 12.2 股票撮合

```python
def place_order(actor, listing, side, type, price, qty):
    validate_session_and_funds(actor, listing, side, qty, price)
    order = insert_order(...)
    while order.remaining > 0:
        book = best_opposite(listing, side)
        if not crossed(order, book): break
        fill = min(order.remaining, book.remaining)
        trade = settle_trade(order, book, fill)
        update_order(order, fill)
        upsert_candle(trade)
    if order.remaining and type == "market":
        cancel_remaining(order)
    return order
```

- 同一 `listing_id` 的撮合按 `SELECT ... FOR UPDATE` 锁定盘口；成交与账本/持仓同事务。
- 订单/成交/K 线在同一事务写入；K 线 upsert 失败不得吞掉成交。

### 12.3 产权估值

```text
value = base × resource × development × traffic × market
```

- 所有因子来自公开/该资产自身数据；不使用买家私有资产。
- 每 6h 批量重估；交易前再实时估值一次，取两者较高作为参考下限（防止低估）。

### 12.4 AI 评分

```text
candidates = generate_actions(agent)
for action in candidates:
    if not constraints_ok(action): continue
    score = (
        expected_return(action)
        - agent.risk * volatility(action)
        - fees(action)
        - tax(action)
        - liquidity_penalty(action)
        + persona_bias(agent.persona, action)
    )
pick = weighted_top_k(candidates, k=3, rng=deterministic(agent.id, tick))
for action in pick:
    execute_via_domain_service(action)
```

---

## 13. 前端信息架构

新增一个“宇宙经济中心”入口（建议在 `ExplorationLab` 增加 `economy` tab，或在主界面加独立按钮）：

```text
经济中心
├── 概览：净资产、现金、负债、今日盈亏、指数
├── 宇宙银行
│   ├── 我的账户 / 存取 / 兑换
│   ├── 贷款 / 抵押品 / 还款
│   └── 银行列表 / 利率 / 储备
├── 商业中心
│   ├── 公司注册 / 我的公司 / 财报
│   ├── 商业许可 / 税费
│   ├── 价格指数
│   └── 争议/公告
├── 证券交易所
│   ├── 行情列表 / 搜索
│   ├── K 线（1m/5m/15m/1h/1d）
│   ├── 盘口 / 下单 / 撤单
│   ├── 持仓 / 盈亏 / 分红
│   └── IPO 申购
├── 产权市场
│   ├── 行星 / 小星系
│   ├── 估值 / 挂牌 / 拍卖
│   ├── 我的产权 / 税单
│   └── 交易历史
└── AI 玩家
    ├── AI 列表 / persona / 公开资产
    ├── AI 银行 / 做市商
    └── 决策摘要
```

### 13.1 K 线组件

- 推荐 `lightweight-charts`；如果不想加依赖，用 Canvas 自绘蜡烛 + 成交量。
- 功能：
  - 周期切换 1m/5m/15m/1h/1d；
  - 十字光标、OHLC 浮层；
  - 成交量柱；
  - 缩放/拖动；
  - 空数据 skeleton；
  - 涨绿跌红（或按用户偏好）。
- 性能：首屏 300 根，滚动分页 500 根；WebSocket/SSE 可选，首版轮询 5s。

### 13.2 交互原则

- 所有金额显示货币品质图标 + 代码；高品质量级用颜色区分（Q1 灰、Q5 金、Q9 虹彩）。
- 下单/购买/贷款必须二次确认，展示手续费/税费/滑点。
- 失败提示直接显示服务端 `detail`，不显示 `http_422`。
- AI 与真人视觉上区分（AI 标签），但价格/订单不区分。

---

## 14. 与现有系统的集成点

| 现有模块 | 集成方式 |
|---|---|
| `wallets` / `ledger` | 商品继续走原账本；货币新账本；兑换桥接 |
| `market_service` | 商品市场增加“以 Q1-Q3 结算”选项；保留原反物质市场 |
| `world_planets` | 行星产权事实表；房产系统只做登记/交易 |
| `planet_ownership_history` | 房产转让追加历史；攻城沿用 |
| `council` | 银行牌照/IPO/系统交易可扩展 `council_motions.kind`；AI 议员已存在 |
| `factions` | 银行/公司/产权挂 faction/sector；关税/声望影响 |
| `ai` NPC | 现有居民是内容 NPC；经济 AI 是正式 `player`，不是 NPC 表 |
| `jobs` | 新增利率、K 线、AI tick、估值、贷款清算 job |
| `outbox` | 所有经济事件写 outbox，供公告/审计/前端事件 |

### 14.1 议会扩展

`council_motions.kind` 当前只允许 `sector_license|membership`。新增：

```text
bank_license
exchange_license
ipo
system_sale
emergency_rate
```

- 每种动议有 `payload jsonb`；投票通过后由对应 service 执行。
- 银行/交易所牌照需 Q5/Q6 资本金证明。
- 紧急利率动议由央行 AI 发起，议会只能否决，不能直接设利率。

---

## 15. MVP 范围与里程碑

### 阶段 A：货币 + 银行（1-2 周）

- 9 种货币定义、兑换、账户、账本；
- 1 央行 + 2 商业银行（1 个 AI）；
- 存取/兑换/简单贷款；
- UI：钱包 + 银行页；
- 测试：兑换守恒、余额非负、手续费燃烧。

### 阶段 B：商业中心 + 公司（1-2 周）

- 公司注册、许可、税费、价格指数；
- 公司账户、财报；
- UI：商业中心；
- 测试：注册/许可/税/指数。

### 阶段 C：股票 + K 线（2 周）

- 公司 IPO、订单簿、撮合、持仓、K 线；
- 1 个 AI 做市商 + 2 个 AI 交易员；
- UI：行情/K 线/下单/持仓；
- 测试：撮合、部分成交、撤单、K 线聚合、熔断。

### 阶段 D：产权（1-2 周）

- 行星/小星系估值、挂牌、托管、转让；
- 与 `world_planets`/攻城兼容；
- UI：产权市场；
- 测试：产权转移、税、攻城冲突、AI 买卖。

### 阶段 E：AI 经济（持续）

- 12-20 名 AI 玩家（正式 `player`，不是特殊 actor）、多 persona、资产负债表；
- 做市/央行/公司/房产；
- 同权审计、运行时暂停开关、日报；
- 参数调优。

---

## 16. 验收标准

### 16.1 货币/银行

- 任意兑换交易前后，全系统各币种 `sum(balance) + burned` 守恒。
- 并发兑换同一账户 20 次，无负余额、无丢失更新。
- 贷款逾期 7 天自动清算抵押品，分配顺序正确。
- 银行储备率低于监管线时禁止新增贷款。

### 16.2 股票

- 100 笔随机订单撮合后，订单/成交/持仓/账本完全对账。
- K 线 OHLC 与成交明细一致；跨周期聚合正确。
- 熔断触发后 15 分钟内拒绝新单，只允许撤单。
- 自成交/对倒被拒绝或标记。

### 16.3 产权

- 行星交易后 `world_planets.owner_player_id` 与新 deed 一致。
- 攻城期间 listing 冻结；攻城结束旧 deed 关闭。
- 交易税/托管退款金额精确到 0.0001。
- AI 与真人同一价格、同一手续费。

### 16.4 AI 同权验收

- 每个 AI 都有正式 `players` 行和 `kind='player'` actor；真人能调用的业务接口，AI 都能调用，反之亦然。
- AI 与真人使用同一套费率/税率/限额/冷却/订单优先级；代码审计确认没有 `if is_ai` 分支给特权。
- AI 不能读取玩家私有接口数据；真人接口同样不能读他人私有数据。
- AI 每笔决策有 `ai_decisions` 记录，可回放；真人不需要该表也能正常游戏。
- AI 破产/违约/被罢免/被罚款的流程与真人完全一致。
- 运行时暂停开关只暂停自动下单，不没收资产、不取消席位、不改变合同。

---

## 17. 风险与待决策

1. **货币与反物质的关系**：首版建议宇宙货币独立，反物质仍是商品；是否允许反物质直接锚定 Q1？建议不允许，避免双货币锚定。
2. **股票 T+0 vs T+1**：首版 T+0 简化；若出现过度投机再切 T+1。
3. **AI 玩家数量与初始资本**：由模拟参数决定；不能用“降低 AI 权限/费率”来平衡，只能用对所有玩家一致的反垄断、持仓和市场份额规则。
4. **行星产权与现有“占领”冲突**：必须明确“占领 ≠ 绝对产权”，攻城仍可转移；购买者需承担被攻城风险。
5. **跨星区 2PC**：仍单库；未来分库时货币账本/股票撮合需要 saga。
6. **合规/命名**：股票、银行、货币名称避免现实金融误导；游戏内明确“虚拟经济”。

---

## 18. 给实现会话的起点

建议按以下顺序读/改：

1. 读现有账本：`server/domain/ledger.py`、`server/repo/wallets.py`、`server/migrations/versions/0003_economy.py`。
2. 读市场/合同：`server/domain/market_service.py`、`server/domain/contract_service.py`。
3. 读产权/攻城：`server/domain/world_service.py`、`server/repo/world.py`。
4. 读议会：`server/domain/council_service.py`、`server/api/v1/council.py`。
5. 新建：
   - `server/migrations/versions/0110_currency_bank.py`
   - `server/domain/currency_service.py`
   - `server/domain/bank_service.py`
   - `server/repo/currency.py`
   - `server/repo/banks.py`
   - `server/api/v1/bank.py`
6. 前端新建：
   - `atlas-ui/react/static/js/Components/EconomyHub.tsx`
   - `BankPanel.tsx` / `CommercePanel.tsx` / `StockMarketPanel.tsx` / `PropertyPanel.tsx` / `AiPlayersPanel.tsx`
   - `atlas-ui/react/static/js/Utils/StockChart.tsx`

先只做阶段 A 的数据库/领域/接口/测试，不要同时开股票和产权；货币账本正确后再往上叠。
