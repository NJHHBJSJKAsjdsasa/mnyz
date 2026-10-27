# 01 · 九级宇宙货币

> 分册：货币  
> 关联：[00-architecture-and-actors.md](00-architecture-and-actors.md)、[02-bank.md](02-bank.md)

---

## 1. 设计目标

1. 九种**品质**，不是九种普通资源；
2. 有发行纪律、回收机制、兑换点差；
3. 品质决定准入资格（股票 Q4、行星 Q5、小星系 Q6）；
4. 通胀可控，不能被无限刷；
5. AI 与真人使用同一套货币规则。

---

## 2. 货币定义

| 品质 | code | 名称 | 定位 | 相对 Q1 基准 | 发行来源 |
|---|---|---|---|---|---|
| Q1 | `cc1` | 星尘币 | 日常流通/工资/小额 | 1 | 任务/合同/采集/央行 |
| Q2 | `cc2` | 星砂币 | 中级贸易/站内结算 | 5 | 兑换/商业收入 |
| Q3 | `cc3` | 蔚蓝币 | 跨区贸易/合同保证金 | 25 | 兑换/公司营收 |
| Q4 | `cc4` | 银核币 | 股票报价/商业贷款 | 125 | 兑换/IPO/银行 |
| Q5 | `cc5` | 金核币 | 行星产权/银行资本 | 625 | 兑换/大额结算 |
| Q6 | `cc6` | 星辉币 | 小星系产权/跨区投资 | 3,125 | 兑换/央行拍卖 |
| Q7 | `cc7` | 曲率币 | 大型并购/战略储备 | 15,625 | 央行/议会财政 |
| Q8 | `cc8` | 奇点币 | 顶级资产/主权结算 | 78,125 | 央行拍卖/特别发行 |
| Q9 | `cc9` | 创世币 | 宇宙级储备 | 390,625 | 仅央行/议会特别发行 |

### 2.1 展示规则

- 图标：Q1 灰、Q2 青、Q3 蓝、Q4 银、Q5 金、Q6 紫、Q7 橙、Q8 红、Q9 虹彩；
- 余额：Q1-Q3 2 位，Q4-Q9 4 位；
- API 一律返回字符串 decimal，避免 JS 精度问题。

### 2.2 精度

- 数据库：`numeric(30,4)`；
- 最小单位：0.0001；
- Python：`Decimal`；
- 前端：字符串解析，禁止 `parseFloat` 后直接做金额运算。

---

## 3. 货币账本

### 3.1 表

```text
currencies
  code text pk
  quality smallint check 1..9
  name text
  base_value numeric(30,4)
  decimals smallint default 4
  status text check ('active','frozen','retired')
  issuer_actor_id uuid
  created_at

currency_accounts
  actor_id uuid
  currency_code text
  balance numeric(30,4) check >= 0
  frozen numeric(30,4) check >= 0
  updated_at
  primary key (actor_id, currency_code)

currency_ledger_transactions
  id uuid pk
  kind text   -- issuance/burn/exchange/deposit/withdraw/loan/interest/trade/tax/transfer
  ref_type text
  ref_id text
  memo text
  created_at

currency_ledger_entries
  id bigserial pk
  tx_id uuid
  actor_id uuid
  currency_code text
  delta numeric(30,4)
  balance_after numeric(30,4)

currency_exchange_quotes
  id uuid pk
  from_code text
  to_code text
  source_bank_id uuid null
  mid numeric(30,4)
  spread_bps integer
  bank_buy numeric(30,4)
  bank_sell numeric(30,4)
  quoted_at timestamptz
  expires_at timestamptz
  unique (from_code, to_code, source_bank_id, quoted_at)

currency_issuance_policy
  id uuid pk
  active_weight numeric(30,4) default 80
  volume_factor numeric(10,6) default 0.00015
  min_daily numeric(30,4) default 5000
  max_daily numeric(30,4) default 250000
  reward_share numeric(5,4) default 0.70
  bribe_enabled boolean default false
  effective_at timestamptz
  approved_by uuid

currency_issuance
  id uuid pk
  day date
  raw_amount numeric(30,4)
  emitted_amount numeric(30,4)
  policy_id uuid
  created_at

bribe_events
  id uuid pk
  actor_id uuid
  officer_actor_id uuid
  currency_code text
  amount_src numeric(30,4)
  base_fee_q1 numeric(30,4)
  bribe_q1 numeric(30,4)
  audit_probability numeric(5,4)
  recovered_q1 numeric(30,4) default 0
  frozen_at timestamptz null
  status text check ('accepted','audited','fined','void')
  created_at
```

### 3.2 守恒

- 每笔 tx：`sum(delta)=0`；
- 发行：`treasury` 负数 + 玩家正数；
- 销毁：玩家负数 + `burn` 正数；
- 手续费：付款方负数 + `treasury`/`burn` 正数；
- 银行利息：银行资产/负债按双分录记，不直接改玩家余额。

---

## 4. 发行与回收

### 4.1 发行锚

Q1 每日基础发行：

```text
raw = active_players × 80
    + yesterday_commodity_volume_q1 × 0.00015

smoothed = 0.7 × raw + 0.3 × moving_average_7d(raw)

issuance = clamp(smoothed, 5_000, 250_000)
```

已定参数：

| 参数 | 值 |
|---|---|
| `active_weight` | 80 Q1/活跃玩家/日 |
| `volume_factor` | 0.00015（成交额 Q1 等值） |
| `min_daily` | 5,000 Q1 |
| `max_daily` | 250,000 Q1 |
| 平滑窗口 | 7 天，0.7/0.3 |
| 奖励预算 | 发行量的 70%，其余进央行储备 |

- 活跃玩家：过去 24h 有登录/采集/交易；
- 商品成交额：现有市场 + 合同，按 Q1 等值折算；
- 发行只能通过任务/合同/首次探索奖励进入流通，不直接打给玩家；
- 发行参数写入 `currency_issuance_policy`，每次调整走 `council_motions.kind='issuance_policy'`：央行发起、公示 24h、议会 4 票；
- 央行操作写 `currency_issuance` 审计；
- **上线门槛**：30 天模拟通过（见 [07-implementation-testing.md](07-implementation-testing.md) §6.4），否则阶段 A 不上线。

### 4.2 高阶货币

Q2-Q9 默认不直接发行，只能通过：

1. 银行向上兑换（燃烧低阶 + 手续费）；
2. 央行公开拍卖/储备投放；
3. 议会财政特别动议（4 票 + 公示期）。

### 4.3 回收

回收进入 `burn` 科目，永不回流：

- 向上兑换手续费；
- 股票交易印花税；
- 产权转让税；
- 银行服务费/贷款罚息；
- IPO 承销费。

### 4.4 通胀目标

- **上线闸门：月度净增 1%–4%**（唯一口径见 [07 §6.4](07-implementation-testing.md)，本节不再另立阈值）；
- 内部警戒线 3%：超过警戒线即启动政策工具，不等触发 4% 闸门；
- 超过 4%：央行提高兑换手续费/利率，或减少发行；
- 低于 1%：降低手续费/增加公共建设支出；
- 通胀计算：`(本月流通量 - 上月流通量) / 上月流通量`。

---

## 5. 兑换

### 5.1 非对称规则

```text
向上：5.00 Qn + 阶梯手续费（燃烧） → 1.00 Q(n+1)
向下：1.00 Q(n+1) → 4.60 Qn（银行点差 8%）
```

- 只能相邻品质兑换；跨级需多步。
- 同一 actor 同一货币对 60 秒只能换一次（防脚本）。
- 大额兑换（> 当日该货币池 1%）需银行储备足够；否则挂单/分批。

### 5.2 向上手续费阶梯

以 Q1 等值计算兑换金额，手续费率随金额下降：

| 单笔 Q1 等值 | 费率 |
|---|---|
| ≤ 1,000 | 6.00% |
| ≤ 10,000 | 5.00% |
| ≤ 100,000 | 4.00% |
| > 100,000 | 3.00% |

- 手续费最低 0.0001；不足则拒绝。
- 费率按“输入货币的 Q1 等值”查表，避免高阶层级逃避。
- 费率可由央行在 ±100bp 内调整，需公告；议会可 4 票否决一次。

```python
def q1_equivalent(amount, currency):
    return amount * Decimal(str(currency.base_value))

def tier_rate(amount_q1_equiv):
    if amount_q1_equiv <= Decimal("1000"):
        return Decimal("0.06")
    if amount_q1_equiv <= Decimal("10000"):
        return Decimal("0.05")
    if amount_q1_equiv <= Decimal("100000"):
        return Decimal("0.04")
    return Decimal("0.03")
```

### 5.3 关系费/贿赂（灰色通道，默认关闭）

> **阶段 A 默认 `bribe_enabled=false`。** 先完成货币账本/模拟，再在阶段 B 白名单开启；开启前需 30 天模拟和反洗钱评估。

玩家可以与银行柜员/经理私下打点，降低甚至免除手续费：

```text
fee_q1       = 手续费按 Q1 等值
bribe_q1     = 玩家愿意支付的关系费（Q1 等值）
reduction    = min(1, bribe_q1 / fee_q1 × 1.2)
final_fee    = fee_q1 × (1 - reduction)
```

- `bribe_q1` 进入 `bank_officer` actor，不进入 burn；
- **上限**：`bribe_q1 ≤ 2 × base_fee_q1`，超过直接拒绝；防止“用贿赂替代正常手续费”成为普遍策略；
- 当 `bribe_q1 ≥ fee_q1 / 1.2`，手续费可降为 0；
- 关系费不开发票、不进公开流水，但写内部审计；
- 风控：
  - 审计概率 = `min(85%, 3% + bribe_q1/max(1,银行日兑换额) × 30 + suspicious_flags × 5%)`；
  - 被查：罚款 = `max(2×原手续费, 1.5×关系费)`，银行/柜员声望下降，严重者停职；
  - 同一柜员/玩家高频打点触发反洗钱标记；
- `bribe_enabled=false` 时 API 拒绝任何 `bribe_q1>0`；
- 真人/AI 同一规则；AI 也可以选择行贿并承担同样风险。

> 设计意图：给高额兑换一个“制度外成本”，不是无风险免费通道。银行/CCMC 的审计与声誉系统是平衡器。

### 5.4 报价

```text
mid = base_value[to] / base_value[from]
bank_buy  = mid × (1 - spread)
bank_sell = mid × (1 + spread)
```

实际成交以银行牌价为准；牌价写入 `currency_exchange_quotes` 快照。

### 5.5 伪代码

```python
def exchange(actor, src, dst, amount, bribe_q1=Decimal("0")):
    assert amount > 0
    assert abs(src.quality - dst.quality) == 1
    bribe_enabled = policy.bribe_enabled
    assert bribe_enabled or bribe_q1 == 0
    lock_accounts([actor, TREASURY, BURN, bank_officer], sorted=True)

    if dst.quality == src.quality + 1:
        q1_amount = amount * src.base_value
        rate = tier_rate(q1_amount)
        base_fee_src = (amount * rate).quantize(MIN_UNIT)
        base_fee_q1 = base_fee_src * src.base_value
        assert bribe_q1 <= 2 * base_fee_q1  # 上限

        reduction = min(Decimal("1"), bribe_q1 / max(base_fee_q1, MIN_UNIT) * Decimal("1.2"))
        fee_src = (base_fee_src * (1 - reduction)).quantize(MIN_UNIT)
        net_src = amount - fee_src
        out = (net_src / Decimal("5")).quantize(MIN_UNIT)

        debit(actor, src, amount)
        if bribe_q1 > 0:
            debit(actor, "cc1", bribe_q1)
            credit(bank_officer, "cc1", bribe_q1)
        credit(actor, dst, out)
        credit(BURN, src, fee_src)
    else:
        out = (amount * Decimal("4.60")).quantize(MIN_UNIT)
        debit(actor, src, amount)
        credit(actor, dst, out)

    write_ledger(...)
    audit_bribe_if_needed(...)
```

> 示例：Q1 输入 5.00，费率 6%，手续费 0.30 Q1，净 4.70 / 5 = 0.94 Q2；手续费从源货币燃烧，不再用目标货币对冲。

### 5.6 防套利

- 向上 5:1 + 阶梯手续费 vs 向下 4.6:1，循环亏损；
- 同一 actor 冷却；
- 银行库存/深度限制；
- 大额滑点；
- 监控同 actor 循环兑换；
- 关系费不改变兑换比例，只影响手续费，不能套利。

---

## 5A. 玩家间直接转账

### 5A.1 范围

- **Q4-Q9 高阶货币支持钱包到钱包直接转账**；
- Q1-Q3 仍以银行转账为主（反洗钱/限额）；
- 公司/银行/AI actor 同规则；
- 直接转账不产生货币，只做账本双边。

### 5A.2 费率

| 币种 | 费率 | 最低 |
|---|---|---|
| Q4-Q6 | 0.05% | 0.0001 |
| Q7-Q9 | 0.02% | 0.0001 |

- 手续费从发送方扣，进入 CCMC/银行监管账户；
- 单笔/日限额按 actor 等级/银行关系；
- 大额转账触发来源审查，可延迟 1 个区块/1 分钟。

### 5A.3 API

```text
POST /wallet/transfer
  { "to_actor_id": "...", "currency": "cc5", "amount": "100.0000" }
```

- 需要 `Idempotency-Key`；
- 校验 Q4+、余额、限额、反洗钱；
- 返回 tx_id/balances；
- 收款方不在线也可入账。

### 5A.4 风险

- 洗钱/逃税：大额/高频/环形转账标记；
- 诈骗：大额二次确认、延时撤回转账（可选 60 秒）；
- 银行/CCMC 可冻结涉案账户；
- AI 与真人同一风控。

---

## 6. 用途与准入

| 场景 | 最低品质 |
|---|---|
| 日常市场/工资 | Q1 |
| 跨区贸易保证金 | Q3 |
| 股票报价/成交 | Q4 |
| 商业贷款 | Q4 |
| 行星产权 | Q5 |
| 小星系产权 | Q6 |
| 银行资本金 | Q5 |
| 交易所资本金 | Q6 |
| 议会特别基金 | Q6 |

高品质货币同时影响：

- 抵押折扣（Q7-Q9 可 70% LTV）；
- 银行储备层级；
- 跨境结算限额；
- 公司信用评级。

---

## 7. API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/currencies` | 九级定义、基准值、状态 |
| GET | `/wallet/currencies` | 我的各币种余额/冻结 |
| GET | `/bank/rates?from=cc1&to=cc2` | 银行牌价/阶梯手续费/关系费预估 |
| POST | `/bank/exchange` | `{from,to,amount,bribe_q1?}` |
| POST | `/wallet/transfer` | Q4+ 玩家间直接转账 |
| GET | `/ledger/currencies?limit=50` | 我的货币流水 |

响应金额用字符串：

```json
{
  "from": "cc1",
  "to": "cc2",
  "amount": "5.0000",
  "out": "0.9400",
  "fee": "0.0600",
  "rate": "0.1880"
}
```

---

## 8. UI

- 钱包页：九种货币卡片、余额、冻结、最近流水、直接转账（Q4+）；
- 兑换器：源/目标、数量、牌价、阶梯手续费、关系费、到账、确认；
- 关系费风险提示：可能被审计/罚款，不保证成功；
- 品质颜色/图标；
- 大额二次确认；
- 失败显示服务端 `detail`。

---

## 9. 边界与测试

### 9.1 边界

- 余额不足（含冻结）；
- 银行储备不足；
- 价格变动导致滑点；
- 并发兑换同一账户；
- 精度四舍五入；
- 发行上限/通胀超限；
- 央行/议会权限。

### 9.2 验收

- 任意兑换 tx 守恒；
- 并发 20 次无负余额/丢失更新；
- 循环兑换必亏；
- 手续费进入 burn，不回流；
- 阶梯费率/关系费/审计罚款正确；
- Q4+ 直接转账守恒、限额/冻结正确；
- 九级货币展示/精度正确；
- AI 与真人兑换费率一致。

---

## 10. 已定参数

### 10.1 不与反物质锚定

Q1 不与反物质固定锚定：

- 反物质仍是商品，价格由市场/合同决定；
- Q1 发行锚是活跃玩家 + 商品成交额，不是反物质库存；
- 商品换 Q1 走市场/银行桥接，汇率快照；
- 禁止“反物质 1:1 铸币”，避免双锚和套利。

### 10.2 关系费审计与罚款

```text
audit_p = min(0.85,
  0.03
  + bribe_q1 / max(1, bank.daily_exchange_volume_q1) × 30
  + suspicious_flags × 0.05
)

fine = max(2 × base_fee_q1, 1.5 × bribe_q1)
```

- `suspicious_flags`：同一玩家/柜员高频、环形转账、拆分规避；
- 被查：
  - 罚款进入 `compliance_fund`（CCMC/央行共同管理）；
  - 柜员停职/冻结/追缴，银行声望 -2；
  - 同一玩家 30 天内第 3 次 → 账户冻结 7 天；
- 关系费本身不退；
- **默认关闭**：`bribe_enabled=false`，阶段 A 不开；阶段 B 白名单 + 模拟后开启；
- **上限**：`bribe_q1 ≤ 2 × base_fee_q1`；超过拒绝；
- AI/真人同规则；
- 参数每季度用模拟调参，公告变更。

### 10.3 Q4+ 直接转账限额

按 Q1 等值计算，单日/单笔：

| 币种 | 单日上限（Q1 等值） | 单笔上限 |
|---|---|---|
| Q4 | 10,000 | 2,500 |
| Q5 | 50,000 | 12,500 |
| Q6 | 250,000 | 62,500 |
| Q7 | 1,000,000 | 250,000 |
| Q8 | 5,000,000 | 1,250,000 |
| Q9 | 25,000,000 | 6,250,000 |

- 新账户前 30 天按 20% 限额；
- 银行 VIP/合规等级可 ×1.5 或 ×2，需 KYC/资产证明；
- 超过单日 80% 触发人工/自动复核；
- 拆分转账规避限额 → 标记/冻结；
- 限额由央行 + CCMC 每季度复核。
