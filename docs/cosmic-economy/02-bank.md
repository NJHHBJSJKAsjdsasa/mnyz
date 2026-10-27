# 02 · 宇宙银行

> 分册：银行  
> 关联：[01-currency.md](01-currency.md)、[03-commerce-center.md](03-commerce-center.md)

---

## 1. 银行层级

| 类型 | 数量 | 所有者 | 职能 |
|---|---|---|---|
| 宇宙中央银行 `central` | 1 | 系统/议会 | 发行 Q1、基准利率、最后贷款人、储备管理 |
| 商业银行 `commercial` | ≤ 12 | 玩家/AI/公司 | 吸储、放贷、兑换、托管、保险箱 |
| 议会基金 | 1 | 议会 | 公共建设、稳定基金 |

> **AI 银行就是 AI 玩家持有的商业银行**，不是特殊 `kind`。AI 银行与真人银行同资本、同监管、同存款保险。

---

## 2. 数据模型

```text
banks
  id uuid pk
  code text unique
  name text
  kind text check ('central','commercial')
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
  term_days integer default 0       -- 0=活期
  transferable boolean default false
  certificate_no text null
  accrued_interest numeric(30,4) default 0
  opened_at
  status text check ('active','closed','frozen')
  unique (bank_id, actor_id, currency_code, term_days)

bank_reserves
  bank_id uuid
  currency_code text
  balance numeric(30,4)
  primary key (bank_id, currency_code)

bank_loans
  id uuid pk
  bank_id uuid
  borrower_actor_id uuid
  currency_code text
  principal numeric(30,4)
  outstanding numeric(30,4)
  interest_bps integer
  rate_type text check ('fixed','floating') default 'floating'
  spread_bps integer default 0
  reset_day integer default 1
  next_reset_at timestamptz
  term_days integer
  collateral jsonb
  status text check ('active','repaid','defaulted','liquidated')
  due_at timestamptz
  created_at

interbank_loans
  id uuid pk
  lender_bank_id uuid
  borrower_bank_id uuid
  currency_code text
  principal numeric(30,4)
  rate_bps integer
  term_days integer
  collateral jsonb
  status text check ('open','matched','settled','defaulted')
  created_at

deposit_certificate_quotes
  id uuid pk
  account_id uuid
  bank_id uuid
  bid numeric(30,4)
  ask numeric(30,4)
  market_yield_bps integer
  expires_at timestamptz
  created_at

deposit_insurance_fund
  id uuid pk
  currency_code text
  balance numeric(30,4)
  central_bank_share numeric(5,4)
  ccmc_share numeric(5,4)
  target_amount numeric(30,4)
  per_actor_cap_q1_equiv numeric(30,4) default 10000
  updated_at

deposit_insurance_claims
  id uuid pk
  bank_id uuid
  actor_id uuid
  currency_code text
  amount numeric(30,4)
  cap_applied numeric(30,4)
  status text check ('filed','approved','paid','rejected')
  approved_by jsonb
  created_at

compliance_fund
  id uuid pk
  currency_code text
  balance numeric(30,4)
  owner text check ('ccmc','central_bank')
  updated_at

compliance_fund_entries
  id uuid pk
  fund_id uuid
  tx_id uuid
  source text check ('bribe_recovery','fine','penalty','other')
  amount numeric(30,4)
  memo text
  created_at

bank_interest_runs
  id uuid pk
  bank_id uuid
  day date
  total_deposits numeric(30,4)
  total_interest numeric(30,4)
  created_at

bank_rate_history
  id bigserial
  bank_id uuid
  currency_code text
  policy_rate_bps integer
  deposit_rate_bps integer
  lend_rate_bps integer
  effective_at timestamptz
```

### 2.1 账户层级

- `currency_accounts`：现金钱包；
- `bank_accounts`：银行存款（银行负债）；
- 存款不计入现金余额，但可用于支付时先扣存款；
- 银行储备是银行在央行的 `currency_accounts`。

---

## 3. 存款产品

| 产品 | 期限 | 利率 | 提前支取 |
|---|---|---|---|
| 活期 | 0 | `policy_rate - 150bp` | 随时 |
| 7 天 | 7 | `policy_rate - 50bp` | 损失利息 + 1% 本金 |
| 30 天 | 30 | `policy_rate + 50bp` | 损失利息 + 2% 本金 |
| 90 天 | 90 | `policy_rate + 150bp` | 损失利息 + 3% 本金 |

- 按日计息，日终 `bank_interest_runs`；
- 利息进入存款余额，不直接铸币；
- 定期存款**可转让**：持有人可把存单整体转让给另一 actor，未到期利息按持有天数拆分；
- 转让需银行登记，受让方通过 KYC/限额；
- 转让价格由双方协商，银行只收 0.1% 登记费；
- 存单转让不改变银行负债规模，只更换债权人。

### 3.1 存单转让

```text
POST /banks/{id}/deposits/{account_id}/transfer
  { "to_actor_id": "...", "price": "..." }
```

- 仅 `transferable=true` 的定期存单；
- 冻结原存单 → 新持有人登记 → 解冻；
- 未到期提前支取规则由受让方继承；
- 银行可拒绝高风险受让方（需披露理由）。

---

## 4. 贷款

### 4.1 抵押品与 LTV

| 抵押品 | LTV |
|---|---|
| Q1-Q3 货币 | 50% |
| Q4-Q6 货币 | 60% |
| Q7-Q9 货币 | 70% |
| 股票（20 日均价） | 50% |
| 行星估值 | 40% |
| 小星系估值 | 35% |

### 4.2 额度

```text
max_principal = sum(collateral_value × LTV) × bank_risk_factor
bank_risk_factor = 1 - bank.reserve_ratio
```

- 首版只允许单一抵押品类型；
- 抵押品锁定，不能同时挂牌/出售；
- 贷款发放进借款人的 `currency_accounts`，同时记银行资产。

### 4.3 浮动利率与逾期

- 默认**浮动利率**：`interest_bps = policy_rate + bank_spread_bps + risk_premium_bps`；
- 每月 1 日重定价，按重定价日央行基准 + 银行点差；
- 借款人可选择固定利率，但需银行审批且加 50bp；
- 利息 = `outstanding × current_rate_bps / 10000 × days / 365`；
- 逾期 3 天：罚息 +2%；
- 逾期 7 天：抵押品进入拍卖；
- 拍卖款顺序：费用 → 利息 → 本金 → 剩余返还借款人；
- 不足部分记为坏账，银行资本扣减。

### 4.4 抵押品清算

```text
if overdue_days >= 7:
    lock collateral
    create property/stock liquidation order
    repay loan in order
    if surplus: credit borrower
    if deficit: write bad_debt
```

---

## 5. 储备与流动性

### 5.1 准备金

```text
required_reserve = deposits × reserve_ratio
excess_reserve = bank_reserves - required_reserve
```

- `excess_reserve < 0` → 禁止新增贷款；
- 连续 24h 低于监管线 → 央行警告；
- 连续 72h → 暂停业务/接管。

### 5.2 挤兑

当某银行 24h 提现 > 存款 30%：

- 暂停大额提现（单笔 > 存款 5%）；
- 央行注入流动性（计入央行资产）；
- 公告；
- 若仍不足 → 存款保险赔付。

### 5.3 存款保险（央行 + CCMC 共同管理）

- Q1-Q4 每 actor 上限 10,000 Q1 等值；
- 由银行按存款规模缴纳保险基金；
- 基金由**央行 + CCMC 共同管理**：
  - 理事会 4 席：央行 2、CCMC 2；
  - 赔付需 3/4 同意；
  - 央行负责流动性/清算，CCMC 负责规则/审计/处罚；
- 银行破产时赔付，不赔股东/高管；
- 基金不足时央行提供临时流动性，需议会追认。

### 5.4 银行处置

- 存款保险优先；
- 资产/负债转让给承接银行；
- 股东/次级债先吸收损失；
- 央行流动性/公共资金需议会批准；
- 破产/重整/债权顺位/法院程序详见 [08-company-law-bankruptcy.md](08-company-law-bankruptcy.md)。

### 5.5 银行间拆借市场（首版开放）

- 银行可发布拆借订单：金额/币种/期限/利率/抵押；
- 对手方银行接受后，央行清算账户实时划转；
- 期限 1/7/30 天；利率由市场决定，央行设上下限；
- 抵押品：国债/高等级货币/央行准备金；
- 违约：罚息 + 央行流动性支持 + 信用评级下调；
- 单家银行拆借敞口 ≤ 资本 20%；
- 拆借交易不进入公开市场行情，只向监管报送。

```text
interbank_loans
  lender_bank_id, borrower_bank_id, currency_code,
  principal, rate_bps, term_days, collateral, status
```

### 5.6 利率传导

- 央行基准 → 银行间利率 → 存贷款利率；
- 银行间利率异常（>基准+500bp）触发央行公开市场操作；
- 存贷利率偏离监管区间 → CCMC 审查。

---

## 6. 央行利率算法

```text
target_inflation = 2% / 月
if inflation > target + 1%: policy_rate += 50bp
if inflation < target - 1%: policy_rate -= 50bp
clamp(policy_rate, 0, 15%)

deposit_rate = policy_rate - 150bp
lend_rate = policy_rate + 250bp + risk_premium
```

- 每月 1 日 00:00 UTC 由央行 AI 计算；
- 议会可 4 票否决一次，不能连续否决两次；
- 利率历史写入 `bank_rate_history`；
- 紧急情况（市场 ±20%）可临时调整，需 24h 内议会追认。

---

## 7. 银行牌照

- 玩家/AI/公司向宇宙议会提交 `bank_license` 动议；
- 资本金：Q5 等值 ≥ 50,000；
- 需要商业中心的反洗钱/信用审查；
- 议会 4 票通过；
- 牌照可被吊销（严重违规/储备长期不足）。

---

## 8. 会计示例

### 8.1 存款

玩家存入 100 cc1：

```text
Dr 玩家现金账户 100
Cr 银行存款负债 100
Dr 银行储备（央行账户）100
Cr 银行库存现金 100
```

简化实现：`currency_accounts` 扣现金，`bank_accounts` 加存款，`bank_reserves` 加储备，三边同事务。

### 8.2 贷款

发放 1,000 cc4：

```text
Dr 银行贷款资产 1,000
Cr 借款人现金 1,000
```

抵押品只锁定，不过户。

---

## 9. API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/banks` | 银行列表/利率/储备率/状态 |
| GET | `/banks/{id}` | 详情/产品/评级 |
| POST | `/banks/{id}/deposit` | `{currency,amount,term_days}` |
| POST | `/banks/{id}/withdraw` | 同上 |
| POST | `/banks/{id}/deposits/{account_id}/transfer` | 转让定期存单 |
| GET | `/bank/accounts` | 我的存款 |
| POST | `/banks/{id}/loans` | `{currency,principal,term_days,collateral,rate_type}` |
| GET | `/bank/loans` | 我的贷款/抵押/到期/浮动利率 |
| POST | `/bank/loans/{id}/repay` | 还款 |
| GET | `/bank/interbank` | 银行间拆借行情 |
| POST | `/bank/interbank/orders` | 发布拆借订单 |
| POST | `/bank/interbank/orders/{id}/accept` | 接受拆借 |
| GET | `/bank/insurance` | 存款保险基金/理赔 |
| GET | `/bank/rates` | 央行基准/银行牌价 |

写接口统一 `Idempotency-Key`，金额字符串。

---

## 10. UI

- 银行列表：利率、储备率、评级、AI/真人标签（仅标识，不影响价格）；
- 我的账户：活期/定期、利息、到期日、存单转让；
- 兑换器/关系费风险提示；
- 贷款申请：抵押品选择、LTV、浮动/固定利率、还款计划；
- 银行间拆借（银行 actor）；
- 存款保险基金/理赔；
- 风险提示：挤兑/清算/罚息；
- 央行面板：基准利率、通胀、货币供应。

---

## 11. 测试与验收

- 存款/取款/利息前后账本守恒；
- 并发存取无负余额；
- 贷款 LTV 超限拒绝；
- 逾期 7 天清算顺序正确；
- 储备不足禁止新增贷款；
- 银行破产赔付上限正确；
- 定期存单转让后债权人/利息归属正确；
- 银行间拆借撮合/清算/违约正确；
- 浮动利率重定价/罚息正确；
- 存款保险双签赔付/上限正确；
- AI 银行与真人银行同费率/同监管。

---

## 12. 已定设计

### 12.1 存单二级市场/报价

- 做市方：发卡银行 + 官方授权存单经纪 + 玩家券商（需牌照）；
- 每日 09:00/15:00 报价，报价写入 `deposit_certificate_quotes`；
- 定价：

```text
PV = (principal + accrued_interest)
     / (1 + market_yield × remaining_days / 365)

bid = PV × (1 - 0.2%) - accrued_interest × 0.1%
ask = PV × (1 + 0.2%)
```

- `market_yield` 取同期限银行间利率 + 银行信用利差；
- 报价有效期 30 分钟；
- 转让登记费 0.1%，由买方承担；
- 银行可拒绝高风险受让方，但需书面理由；
- 不做空存单，不允许杠杆。

### 12.2 银行间拆借：实名 + 信用

- 首版**实名双边**：订单显示银行代码/评级/资本/历史违约，不显示个人玩家；
- 匿名撮合后期再做；
- 信用评级：

| 评级 | 储备率 | 单笔上限 | 需要抵押 |
|---|---|---|---|
| AAA | ≥15% | 资本 20% | 否 |
| AA | ≥12% | 资本 12% | 是 |
| A | ≥10% | 资本 6% | 是 |
| B | <10% | 禁止拆入 | — |

- 违约：罚息 + 评级下调 + 央行流动性支持；
- 拆借利率公开（银行代码可脱敏），但交易对手实名可查。

### 12.3 存款保险基金

- 目标规模：`max( insured_deposits × 2%, 100,000 Q1 等值 )`；
- 缴费率：10-30bp/年，按银行风险评级浮动；
- 初始资金：央行 20% 目标 + CCMC 10% 目标，其余由银行缴费；
- 治理：央行 2 席 + CCMC 2 席，赔付需 3/4；
- 单 actor 赔付上限 10,000 Q1 等值；
- 每年压力测试；基金不足时央行临时流动性需议会追认；
- 银行破产/接管流程见 [08-company-law-bankruptcy.md](08-company-law-bankruptcy.md)。

### 12.4 浮动利率

- 默认浮动；每月 1 日按 `policy_rate + spread + risk_premium` 重定价；
- 固定利率需银行审批 + 50bp 溢价；
- 提前还款罚息 1%-3%（按剩余期限）；
- 重定价前 7 天通知借款人。

### 12.5 关系费审计、冻结、追缴

#### 冻结

- 审计立案后：
  - `bank_officers.status='suspended'`；
  - `economic_actors.status='frozen'`（仅 officer，不影响玩家）；
  - officer 的 `currency_accounts.frozen = balance`；
  - `bribe_events.frozen_at=now()`；
- 冻结不等于定罪；调查期最长 14 天，可延长一次。

#### 追缴顺序

```text
1. officer 被冻结的 bribe 余额
2. officer 的其他货币余额
3. 行贿玩家账户（罚款）
4. 银行（仅限有管理过失/共谋）
5. 不足部分记坏账/合规基金
```

- 先追缴 bribe 本金，再追缴罚款 `max(2×base_fee, 1.5×bribe)`；
- 追缴款进入 `compliance_fund`（CCMC/央行共同管理）；
- 玩家罚款不得导致负余额；不足则冻结/扣后续收入；
- officer 被移除后，actor 余额在 180 天索赔期后转入 `compliance_fund`；
- 银行无过失不承担 officer 私人贿赂债务。

#### 合规基金

- `compliance_fund` 用于反洗钱、审计、举报奖励、受害者补偿；
- 央行/CCMC 各 2 席，支出需 3/4；
- 每季度公开审计；
- 与存款保险基金分账，不混用。

#### 内部接口

```text
POST /internal/compliance/officers/{id}/freeze
POST /internal/compliance/officers/{id}/seize
POST /internal/compliance/officers/{id}/remove
GET  /internal/compliance/fund
```

- 仅内网/合规角色；
- 冻结/追缴需双人复核；
- 全程审计。
