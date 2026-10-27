# 03 · 宇宙商业管理中心（CCMC）

> 分册：商业中心  
> 关联：[02-bank.md](02-bank.md)、[04-property.md](04-property.md)、[05-stock-kline.md](05-stock-kline.md)

---

## 1. 定位

CCMC 是宇宙的商业规则与数据机构，不是银行：

- 公司注册与披露；
- 商业许可；
- 关税/税费；
- 价格指数；
- IPO/并购/反垄断审核；
- 商业纠纷仲裁；
- 公开商业数据。

真人玩家、AI 玩家、公司、银行都走同一套 CCMC 规则。

---

## 2. 公司

### 2.1 数据模型

```text
companies
  id uuid pk
  ticker text unique
  name text unique
  founder_actor_id uuid
  jurisdiction_sector text
  status text check ('private','public','suspended','liquidated')
  shares_total bigint
  free_float bigint
  book_value numeric(30,4)
  treasury_actor_id uuid
  created_at
  listed_at

share_holdings
  actor_id uuid
  company_id uuid
  shares bigint
  locked_until timestamptz null
  primary key (actor_id, company_id)

company_financials
  company_id uuid
  period date
  revenue numeric(30,4)
  cost numeric(30,4)
  profit numeric(30,4)
  assets numeric(30,4)
  liabilities numeric(30,4)
  published_at

company_actions
  id uuid pk
  company_id uuid
  kind text check ('dividend','split','buyback','merger')
  payload jsonb
  status text check ('pending','approved','done','rejected')
  effective_at
```

### 2.2 注册

- 费用 Q3；
- 名称/ticker 唯一；
- 需要商业许可；
- 公司自动获得 `economic_actor(kind='company')`；
- 公司可以开银行（额外牌照）、买行星、上市；
- **允许一人/一个 actor 持有多家公司**，但需合并披露关联交易/控制关系；
- 同一控制人合并计算反垄断/持仓/市场份额。

### 2.3 股权

- 非上市股权可转让，锁定期由章程决定；
- 公司章程写入 `companies.charter jsonb`；
- 增发/回购需股东会（持股 ≥ 50% 同意）；
- 公司破产时股东仅承担出资额。

### 2.4 财报

- 按月；
- 收入/成本/利润/资产/负债；
- 连续 3 个月不披露 → 交易所停牌；
- 造假 → 罚款/退市/责任人禁入。

---

## 3. 商业许可

| 许可 | 费用 | 作用 |
|---|---|---|
| 跨区贸易 | Q3/月 | 跨星区市场交易 |
| 银行 | Q5 资本金 + 议会 | 吸储/放贷 |
| 证券公司 | Q5 资本金 + CCMC | 经纪/承销/做市 |
| 交易所（含子交易所） | Q6 资本金 + 议会 + 央行/官方审查 | 股票/产权撮合 |
| 房产经纪 | Q4/月 | 挂牌/带看/成交 |
| 港口经营 | Q5 + 星区主权者同意 | 停靠/仓储/关税代收 |

- 许可有有效期/年检；
- 违规可暂停/吊销；
- AI 公司同样需要许可，不豁免；
- **交易所/子交易所可以由玩家/AI/公司经营**，但必须：
  - 牌照 + 议会动议 + **央行总行/官方交易所/CCMC 联合审查**；
  - 接受央行总行/官方交易所/CCMC 的直接检查、数据报送、停牌/接管；
  - 不得歧视性拒绝结算/操纵费率；
  - 首版保留 1 个官方交易所，玩家交易所作为子交易所/专业板。

### 3.1 证券公司/交易所

```text
exchanges
  id uuid pk
  code text unique
  name text
  kind text check ('official','sub')
  operator_actor_id uuid
  parent_exchange_id uuid null
  license_motion_id uuid
  fee_bps integer
  status text check ('pending','active','suspended','closed')
  created_at

securities_firms
  id uuid pk
  name text
  operator_actor_id uuid
  license_motion_id uuid
  capital numeric(30,4)
  status text check ('pending','active','suspended','closed')
```

- 官方交易所：系统初始 1 个，负责主市场/清算/行情；
- 子交易所：玩家经营，接入官方清算/K 线/监管报送；
- 证券公司：经纪、承销、做市、研究；不得挪用客户资产；
- 客户资产隔离托管；
- 交易所/券商破产 → 客户资产优先返还，进入破产法院程序（见 08）。

---

## 4. 税费

| 税种 | 税率 | 归属 |
|---|---|---|
| 商品交易税 | 0.5% | 50% 星区主权者 / 50% 议会基金 |
| 股票印花税 | 0.1% | CCMC |
| 产权转让税 | 2% | 星区/CCMC |
| 关税 | 动态 0-15% | 星区主权者 |
| 银行服务费 | 按产品 | 银行 |

- 关税上限**动态调整**：
  ```text
  cap = clamp(8% + traffic_index × 2% + strategic_factor × 3%, 5%, 15%)
  ```
  - 星区主权者在 cap 内设定；
  - CCMC 审核是否歧视性/违反条约；
  - 议会可对极端关税（>12%）要求复核；
- 税费由成交方承担，订单/合同明确展示；
- 欠税锁产权/股票/账户。

---

## 5. 价格指数

### 5.1 表

```text
commerce_price_index
  sector_key text
  category text check ('commodity','stock','property','freight','wage')
  day date
  index_value numeric(30,4)
  sample_size integer
  primary key (sector_key, category, day)
```

### 5.2 计算

- 每日 00:10 UTC；
- 商品：成交价加权中位数；
- 股票：流通市值加权；
- 产权：最近评估/成交；
- 运费：航道距离/风险；
- 异常（单日 ±15%）触发调查，暂停相关做市。

指数用于：

- 合同基准；
- 银行贷款抵押；
- AI 决策；
- 产权估值；
- 通胀统计。

---

## 6. IPO / 并购 / 反垄断

### 6.1 IPO 条件

- 公司成立 ≥ 7 天；
- 净资产 ≥ 50,000 cc4；
- 连续 2 季度盈利或营收 ≥ 100,000 cc4；
- 自由流通 ≥ 20%；
- CCMC 审核 + 议会 4 票。

### 6.2 并购

- 持股 > 30% 触发要约；
- 同一控制人合并计算；
- 市场份额 > 40% 需 CCMC 反垄断审查；
- 恶意收购允许，但需披露资金来源。

### 6.3 反垄断执行算法

#### 指标

按 `(market, sector, 30d)` 计算：

```text
share_i = actor_i 的 30 日成交额 / 市场总成交额
HHI = Σ share_i² × 10000
top3 = 前三大 actor 份额之和
```

#### 触发

满足任一：

- 单 actor/公司/联盟 `share > 40%`；
- `top3 > 70%`；
- `HHI > 2500`；
- 关联方合并后超过上述阈值；
- 连续 3 个月份额上升 >10 个百分点。

#### 执行阶梯

1. **观察**：书面问询/数据报送（7 天）；
2. **警告**：公开公告 + 整改计划（30 天）；
3. **行为救济**：费率/结算/准入非歧视承诺；
4. **罚款**：`1-3 × excess_profit`，或 Q4 固定罚金；

```text
benchmark_margin = 同 market/sector 30 日营业利润率中位数
excess_profit = max(0, profit - revenue × benchmark_margin)
fine = clamp(1-3 × excess_profit,
             0,
             min(20% × capital, 10% × annual_revenue))

if 数据不足:
    fine = 10,000 cc4（首犯）/ 30,000 cc4（累犯）
```

- `profit/revenue` 取 CCMC 审计后的月报；
- 资本按最近季度净资产；
- 罚款上限防止直接没收；
- 被处罚方可申请听证/上诉；
- 固定罚金用于无法可靠计算超额利润的情形；
5. **结构救济**：强制拆分/剥离业务/限制并购；
6. **市场禁入**：严重/重复违规，最长 180 天。

#### 计算与申诉

- 每月 1 日 `antitrust_scan` job；
- 关联方（同一控制人/联盟/公司集团）合并计算；
- AI 与真人同一公式、同一阈值；
- 处罚前听证；可向商业法院上诉一次（见 08）；
- 误判可撤销/赔偿。

#### AI 同质化

- AI persona 配额：单一 persona ≤ 40% AI 数量；
- 同策略相关性 >0.8 的 AI 不超过 3 个；
- 单一 AI 同方向订单 ≤ 市场 20%；
- 强制探索/随机扰动，禁止共享私有信号；
- 监控 AI 协同报价/对倒，按反垄断/操纵处理。

#### 监控指标

- 市场份额/HHI/top3；
- 关联交易比例；
- 同向订单相关性；
- AI 策略收益相关性；
- 价格离散度/流动性。

### 6.4 公司法与破产法院

CCMC 只负责商业登记/披露/许可/指数；公司治理、股东诉讼、商业法院、破产/重整/清算的完整规则见：

- [08-company-law-bankruptcy.md](08-company-law-bankruptcy.md)

已定：

- 破产管理人由 **CCMC 指派**；
- 法院保留一次玩家合议上诉；
- 个人不破产，只处理公司/银行；
- 跨区判决需被请求区法院确认后执行；
- 具体程序见 08。

跨区判决承认/资产冻结涉及 [09-cross-region-2pc.md](09-cross-region-2pc.md)。

---

## 7. 争议与处罚

```text
commerce_disputes
  id uuid pk
  claimant_actor_id
  respondent_actor_id
  kind text
  amount numeric(30,4)
  evidence jsonb
  status text check ('open','reviewing','resolved','appealed')
  decision text
  created_at
```

流程：

1. 发起（Q1 手续费）；
2. CCMC AI 初审（7 天）；
3. 玩家议员可覆核；
4. 处罚/赔偿；
5. 可上诉一次。

处罚：

- 罚款；
- 暂停许可；
- 强制平仓；
- 退市；
- 禁入市场。

---

## 8. API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/companies` | 注册公司 |
| GET | `/companies` | 公司列表/估值/财报摘要 |
| GET | `/companies/{ticker}` | 详情/股东/财报 |
| POST | `/companies/{ticker}/shares/transfer` | 非上市股权转让 |
| GET | `/commerce/licenses` | 我的许可 |
| POST | `/commerce/licenses` | 申请许可（含证券/交易所） |
| GET | `/exchanges` | 官方/子交易所列表 |
| POST | `/exchanges` | 申请子交易所牌照 |
| GET | `/securities-firms` | 证券公司列表 |
| POST | `/securities-firms` | 申请证券牌照 |
| GET | `/commerce/index?sector=...` | 价格指数 |
| POST | `/commerce/disputes` | 发起争议 |
| GET | `/commerce/disputes` | 我的争议 |

---

## 9. UI

- 商业中心首页：我的公司、许可、税费、指数；
- 公司页：股权结构、财报、章程、融资；
- 许可申请（银行/证券/交易所/子交易所）；
- 交易所/券商管理：费率、上市、监管报送；
- IPO 申请；
- 争议工单；
- 公告/处罚。

---

## 10. 测试与验收

- 公司注册/ticker 唯一/费用正确；
- 股权转让后持仓/锁定正确；
- 税费计算精确到 0.0001；
- 指数计算可复现；
- IPO 条件不足拒绝；
- 反垄断阈值触发审查；
- AI 公司与真人公司同规则；
- 一人多公司/关联交易合并披露；
- 玩家交易所/券商牌照审查/监管/停牌；
- 动态关税上限计算/复核；
- 争议流程状态机正确。

---

## 11. 已定设计

### 11.1 子交易所清算分成

- 成交执行费：子交易所自定 0.02%-0.10%，归子交易所；
- 官方清算费：统一 0.02% × 成交额，最低 0.0001 cc4；
- 清算费分账：
  - 50% 官方交易所（清算/行情/风控）；
  - 30% 子交易所（接入/客户服务）；
  - 20% 投资者保护/对账基金；
- 客户看到 all-in 费率（执行 + 清算 + 税）；
- 子交易所不得绕过官方清算；违规停牌/接管；
- 跨区清算按 [09-cross-region-2pc.md](09-cross-region-2pc.md) 加收跨区费。

### 11.2 券商客户资产隔离

- 客户现金/股票进入**中央托管机构**的客户资产账户，券商自有资产分离；
- 券商只能下单/转账，不能挪用、抵押、再质押；
- 每日对账：客户资产 ≥ 客户负债；
- 券商破产：客户资产不属于破产财产，优先返还；
- 提现只能到实名账户；大额需二次确认；
- 监管：央行总行/官方交易所/CCMC 可随时审计；
- 违规：罚款、停牌、吊销牌照、刑事/游戏封禁。

### 11.3 动态关税战略因子

```text
strategic_factor = clamp(
  0.30 × defense_normalized
  + 0.30 × rare_resource_normalized
  + 0.20 × chokepoint_normalized
  + 0.20 × political_tension_normalized,
  0, 1
)

cap = clamp(8% + traffic_index × 2% + strategic_factor × 3%, 5%, 15%)
```

- `defense_normalized`：系统防御/舰队力量；
- `rare_resource_normalized`：稀有元素/遗迹密度；
- `chokepoint_normalized`：航道节点/交通指数；
- `political_tension_normalized`：战争/冲突/议会制裁；
- 数据来自 `star_systems`、CCMC 指数、战争状态；
- 每 7 天重算 cap，公告；星区主权者在 cap 内设定税率；
- CCMC 可对歧视性关税/超过 12% 的关税复核。
