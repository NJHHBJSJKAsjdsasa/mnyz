# 05 · 股票与 K 线

> 分册：证券  
> 关联：[03-commerce-center.md](03-commerce-center.md)、[06-ai-players.md](06-ai-players.md)

---

## 1. 市场结构

- 首版 1 个官方“宇宙联合交易所”，由 CCMC/央行监管；
- **玩家/AI/公司可经营子交易所/专业板**，需 Q6 资本金 + 议会动议 + 央行/官方审查，接受直接检查/停牌/接管；
- 报价货币：**Q4 银核币 `cc4`**；
- 订单类型：限价、市价（市价最多吃 5 档）；
- 撮合：价格优先、时间优先；
- **T+0 与 T+1 同时支持**：按 listing/交易所配置，上市时披露，不得混用；
- **允许做空**：必须有足够保证金/可借股票，禁止裸卖空；
- 最小价格变动：0.0001 cc4；
- 最小交易单位：1 股；
- 手续费：买 0.1%，卖 0.1% + 印花税 0.1%，最低 0.0001 cc4；子交易所可在监管上限内自定。 
- 官方交易所与子交易所共享清算/行情/监管报送；子交易所不能歧视性拒绝结算。

### 1.1 结算模式

| 模式 | 规则 | 适用 |
|---|---|---|
| T+0 | 成交即时交割，可当日卖出 | 高流动性主板 |
| T+1 | 买入股份锁定至下一交易日；现金可用 | IPO/高波动/专业板 |

- `stock_listings.settlement_mode` 明确；
- T+1 只锁股份，不锁现金（首版）；
- 跨区交易按 [09-cross-region-2pc.md](09-cross-region-2pc.md) 结算，额外费用见 09；
- T+0/T+1 都遵守同一熔断/持仓/反操纵规则。

### 1.2 做空（有钱就行）

- 必须开通保证金账户；
- 初始保证金 ≥ 150%，维持保证金 ≥ 130%；
- 可借股票来自券商/做市商/其他持有人；
- 借券费按日计；
- 保证金不足 → 强制补足/平仓；
- 禁止裸卖空；
- 单票空头持仓 ≤ 流通 10%；
- 交割 T+0/T+1 按 listing 规则。

---

## 2. 数据模型

```text
stock_listings
  id uuid pk
  exchange_id uuid
  company_id uuid
  ticker text
  currency_code text default 'cc4'
  total_shares bigint
  free_float bigint
  status text check ('pending','listed','suspended','delisted')
  ipo_price numeric(30,4)
  listed_at
  settlement_mode text check ('t0','t1') default 't0'
  circuit_breaker_pct numeric(5,4) default 0.20
  shortable boolean default true

stock_orders
  id uuid pk
  listing_id uuid
  actor_id uuid
  side text check ('buy','sell')
  type text check ('limit','market')
  price numeric(30,4) null
  quantity bigint
  filled bigint default 0
  status text check ('open','partial','filled','cancelled','rejected')
  created_at
  updated_at

stock_trades
  id uuid pk
  listing_id uuid
  buy_order_id uuid
  sell_order_id uuid
  buyer_actor_id uuid
  seller_actor_id uuid
  price numeric(30,4)
  quantity bigint
  fee_buy numeric(30,4)
  fee_sell numeric(30,4)
  tax numeric(30,4)
  executed_at

stock_candles
  listing_id uuid
  interval text check ('1m','5m','15m','1h','1d')
  bucket_start timestamptz
  open numeric(30,4)
  high numeric(30,4)
  low numeric(30,4)
  close numeric(30,4)
  volume bigint
  quote_volume numeric(30,4)
  trades integer
  primary key (listing_id, interval, bucket_start)

stock_holders
  actor_id uuid
  listing_id uuid
  shares bigint
  locked_shares bigint default 0   -- T+1/质押/冻结
  avg_cost numeric(30,4)
  primary key (actor_id, listing_id)

margin_accounts
  actor_id uuid
  currency_code text default 'cc4'
  cash numeric(30,4)
  collateral jsonb
  status text check ('active','margin_call','liquidating','closed')
  primary key (actor_id, currency_code)

short_positions
  id uuid pk
  actor_id uuid
  listing_id uuid
  quantity bigint
  entry_price numeric(30,4)
  borrowed_from uuid
  margin numeric(30,4)
  status text check ('open','covered','forced','closed')
  opened_at
  closed_at

securities_lending
  id uuid pk
  listing_id uuid
  lender_actor_id uuid
  borrower_actor_id uuid
  quantity bigint
  fee_bps integer
  status text check ('open','returned','defaulted')
  due_at

delisting_cases
  id uuid pk
  listing_id uuid
  reason text
  status text check ('triggered','auction','settled','cancelled')
  last_price numeric(30,4)
  triggered_at
  settled_at

dividends
  id uuid pk
  company_id uuid
  per_share numeric(30,4)
  record_at timestamptz
  pay_at timestamptz
  status text check ('announced','paid')
```

索引：

- `(listing_id, status, side, price, created_at)` 盘口；
- `(listing_id, interval, bucket_start)` K 线；
- `(actor_id, listing_id)` 持仓。

---

## 3. IPO

### 3.1 条件

- 公司成立 ≥ 7 天；
- 净资产 ≥ 50,000 cc4；
- 连续 2 季度盈利或营收 ≥ 100,000 cc4；
- 自由流通 ≥ 20%；
- CCMC 审核 + 议会 4 票。

### 3.2 发行

- 新增股份卖给市场；
- 募资进公司 treasury actor；
- 老股东稀释；
- IPO 价格由簿记/询价或固定价；
- 首日集合竞价，之后连续竞价。

---

## 4. 撮合算法

### 4.1 限价单

```python
def place_order(actor, listing, side, type, price, qty):
    validate_funds_or_shares(actor, side, qty, price)
    order = insert_order(...)
    while order.remaining > 0:
        book = best_opposite(listing, side)
        if not book or not crossed(order, book):
            break
        fill = min(order.remaining, book.remaining)
        trade = settle_trade(order, book, fill)
        update_order(order, fill)
        update_order(book, fill)
        upsert_candles(trade)
    if type == "market" and order.remaining:
        cancel_remaining(order)
    return order
```

- `crossed`：买价 ≥ 卖价；
- 同价按 `created_at, id` 排序；
- 成交与账本/持仓/K 线同事务；
- 订单簿按 `listing_id` 行锁；
- 部分成交保留剩余。

### 4.2 市价单

- 最多吃 5 档；
- 剩余撤销；
- 需要预估滑点并二次确认。

### 4.3 结算

```text
buyer:  -price×qty - fee_buy
seller: +price×qty - fee_sell - tax
CCMC:   +fee_buy +fee_sell +tax
```

- 买方 Q4 不足 → 拒单；
- 卖方持仓不足 → 拒单/冻结；
- 成交后更新 `stock_holders.avg_cost`；
- 失败整笔回滚。

### 4.4 T+0 / T+1

- `settlement_mode='t0'`：买入立即入 `shares`，可当日卖出；
- `settlement_mode='t1'`：买入入 `shares`，同时 `locked_shares += qty`，下一交易日 00:00 UTC 解锁；
- 卖出时只能卖 `shares - locked_shares`；
- T+1 现金不锁定（首版）；
- 分红/拆股按结算后持仓；
- 跨区交易按 09 的额外结算延迟，但不改变 listing 的 T+0/T+1 规则。

### 4.5 做空

```text
POST /stocks/{ticker}/orders
  { "side": "short", "type": "limit", "price": "...", "quantity": 100 }
```

流程：

1. 开通保证金账户；
2. 借券（`securities_lending`）或券商池；
3. 初始保证金 ≥ 150%；维持 ≥ 130%；
4. 卖出所得冻结，作为担保；
5. 每日借券费；
6. 买入还券（`cover`）；
7. 保证金不足 → margin call → 强制平仓。

约束：

- 禁止裸卖空；
- 单票空头 ≤ 流通 10%；
- 借券到期必须归还/续借；
- 公司行动（分红/拆股）由空头补偿；
- 交易所可临时禁止某票做空（熔断/调查）。

### 4.6 玩家子交易所/专业板

- 官方交易所保留主市场/清算/行情；
- 玩家/AI/公司可申请子交易所：
  - Q6 资本金 + 议会动议 + 央行/官方审查；
  - 接入官方清算、K 线、监管报送；
  - 可自定上市标准/费率（监管上限内）；
  - 接受官方检查/停牌/接管；
  - 客户资产隔离托管；
  - 不得歧视性拒绝结算/操纵费率；
- 子交易所破产 → 客户资产优先返还，进入破产法院程序（见 08）。

---

## 5. K 线

### 5.1 聚合

- 以 `stock_trades` 为唯一事实源；
- 成交后 upsert 当前 1m/5m/15m/1h/1d 桶；
- 桶边界 UTC：
  - 1m 对齐分钟；
  - 1d 对齐 00:00 UTC；
- 空桶：保留前收作为 open/close，volume=0；
- 收盘价 = 最后一笔成交价。

### 5.2 保留

- 1m：30 天；
- 5m：180 天；
- 1h/1d：永久（后续冷归档）；
- 日线收盘写 `stock_daily_summary` 供指数/估值。

### 5.3 前端图表

- 推荐 `lightweight-charts`；
- 首屏 300 根，分页 500 根；
- 周期切换 1m/5m/15m/1h/1d；
- 十字光标 + OHLC 浮层 + 成交量；
- 轮询 5s 更新最后一根；WebSocket 后期；
- 涨绿跌红（可配置）。

---

## 6. 熔断与风控

- 单日 ±20% 熔断 15 分钟；
- ±30% 停牌至次日；
- 单账户单票持仓 ≤ 流通 10%；
- 自成交/对倒：同一 actor 1 分钟内 >5 笔且价格无变化 → 标记；
- 大额订单（> 当日成交量 5%）延迟 5 秒披露；
- 交易所停机只允许撤单；
- 异常波动 CCMC 调查。

---

## 7. 公司行为

### 7.1 分红

- 公司 treasury 支付；
- 登记日持仓快照；
- 除息日调整开盘参考价；
- 代扣 0% 首版（游戏税另计）。

### 7.2 拆股/并股

- CCMC 批准；
- 调整订单/持仓；
- 历史 K 线保留原始，另存复权因子。

### 7.3 零价退市/清算（完整规则）

#### 触发

满足任一：

1. 连续 20 个交易日收盘价 = 0.0001 cc4（最小报价单位，即“零价”）；
2. 连续 10 个交易日无买盘；
3. 净资产为负且无重整计划；
4. 严重违规/造假；
5. 交易所/CCMC 强制退市。

#### 流程

```text
listed
 → zero_price_warning（第 10 日）
 → suspended（第 15 日）
 → delisting_auction（5 个交易日）
 → delisted
 → liquidation_or_restructuring
 → settled
```

1. **预警**：第 10 日公告，风险提示；交易所可要求公司披露。
2. **停牌**：第 15 日停牌，禁止新开仓，只允许撤单/平仓。
3. **退市整理拍卖**：5 个交易日，官方做市商提供双边报价；涨跌幅 ±10%。
4. **退市**：拍卖结束仍无有效买盘/收盘 = 0.0001 → 退市。
5. **持仓处理**：
   - 股票转为公司清算索赔权（`claim`），不再是可交易股票；
   - 公司进入破产/清算（见 08）；
   - 清算分配按债权/股东顺位；
   - 若公司仍有净资产，按每股净资产分配；
   - 若资不抵债，股东获得 0，不承担额外责任（公司有限责任）。
6. **空头**：
   - 退市前必须平仓/还券；
   - 无法还券 → 按最后价现金结算 + 借券费；
   - 保证金不足 → 强制平仓；
   - 空头不获得清算分配。
7. **T+0/T+1**：退市整理期按 listing 的结算模式；T+1 未解锁股份在退市后自动解锁为索赔权。
8. **跨区**：退市清算涉及跨区资产/现金 → 2PC/saga（见 09）；无法 2PC 时进入人工对账。
9. **重新上市**：完成重整/连续 2 年盈利/CCMC 批准，可重新申请 IPO；旧股东按重整计划处理。

#### 清算顺序

```text
破产费用 → 担保债权 → 优先债权 → 普通债权 → 股东
```

- 交易所/券商客户资产隔离，不进入公司破产财产；
- 投资者保护基金可垫付部分经纪客户损失（上限）；
- 退市不豁免造假责任，董事/高管/审计机构可被追偿。

#### `delisting_cases`

- `status`: `triggered/auction/settled/cancelled`
- `last_price`、`triggered_at`、`settled_at`
- 关联 `insolvency_cases`（08）

---

## 8. API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/stocks` | 上市列表/最新价/涨跌幅 |
| GET | `/stocks/{ticker}` | 详情/盘口/公司 |
| GET | `/stocks/{ticker}/candles?interval=1m&limit=300` | K 线 |
| GET | `/exchanges` | 官方/子交易所 |
| POST | `/exchanges` | 申请子交易所牌照 |
| POST | `/stocks/{ticker}/orders` | `{side,type,price,quantity}`；`side=short/cover` |
| DELETE | `/stocks/orders/{id}` | 撤单 |
| GET | `/stocks/orders` | 我的委托 |
| GET | `/stocks/portfolio` | 持仓/成本/盈亏/空头 |
| GET | `/stocks/margin` | 保证金/借券 |
| POST | `/stocks/{ticker}/short` | 开空/借券 |
| POST | `/stocks/{ticker}/cover` | 买券还券 |
| POST | `/stocks/ipo` | 申请 IPO |
| GET | `/stocks/{ticker}/dividends` | 分红记录 |
| GET | `/stocks/{ticker}/delisting` | 退市/清算状态 |

---

## 9. UI

- 行情列表：ticker、最新价、涨跌幅、成交量、T+0/T+1 标记；
- 个股页：K 线、盘口、公司信息、公告、空头/借券；
- 下单面板：买入/卖出/做空/还券、限价/市价、数量、手续费、滑点、保证金；
- 持仓：成本、市值、盈亏、分红、锁定股份；
- 子交易所/券商入口；
- IPO 申购；
- 风险提示/熔断/退市预警/清算状态。

---

## 10. 并发与一致性

- 同一 listing 撮合串行化（行锁/队列）；
- 订单/成交/持仓/账本/K 线同事务；
- 幂等键防重复下单；
- 撤单与成交竞争：以订单状态 CAS 为准；
- K 线 upsert 失败不得吞成交；
- 日终对账：订单成交量 = 成交表 = 持仓变动。

---

## 11. 测试与验收

- 100 笔随机订单后订单/成交/持仓/账本对账；
- 部分成交/撤单/市价单；
- K 线 OHLC 与成交一致，跨周期聚合正确；
- 熔断期间拒绝新单；
- 自成交/对倒被拒；
- T+0 即时可卖 / T+1 锁定次日解锁；
- 做空保证金/借券/强平/还券；
- 玩家子交易所牌照/清算/监管；
- 零价退市/拍卖/索赔权/空头结算；
- 分红/拆股后持仓正确；
- AI 做市商与真人同费率/同撮合；
- 并发下单无超卖/负余额。

---

## 12. 已定设计
### 12.1 子交易所清算分成

与 [03-commerce-center.md](03-commerce-center.md) 11.1 一致：

- 子交易所执行费 0.02%-0.10%，归子交易所；
- 官方清算费 0.02%，最低 0.0001 cc4；
- 清算费 50% 官方、30% 子交易所、20% 投资者保护/对账基金；
- 客户看到 all-in；跨区按 09 加收。

### 12.2 借券池/券源

- 券源：
  - 长期持有人自愿出借；
  - 券商自营池；
  - 官方做市商库存；
  - 公司 treasury 库存股（需披露）；
- 借券费 1%-10% 年化，按券源/期限；
- 抵押 150%，每日盯市；
- 出借人可 T+1 召回（除退市/冻结）；
- 单票借券池 ≤ 流通 15%；
- AI/真人同一券池、同一费率；
- 券商不得挪用客户股票出借（需单独授权）。

### 12.3 投资者保护基金

- 目标规模：`max(20,000,000 cc4, 2% × 30 日日均总市值)`；
- 来源：清算费 20%、交易所罚款、政府拨款；
- 赔付上限：每客户 `min(10,000 cc4, 50% × 净损失)`；
- 仅覆盖券商挪用/清算故障，不覆盖市场亏损；
- 赔付需 CCMC/央行联合批准；
- 基金不足时官方交易所垫付，后续追偿。

### 12.4 退市拍卖做市商参数

- 做市商资本 ≥ 5,000 cc4；
- 双边报价，最大点差 2%；
- 每日报价时间 ≥ 80% 交易时段；
- 库存上限 5% 流通股；
- 价格区间 ±10%，最小报价 0.0001；
- 禁止最后 5 分钟拉抬/打压；
- 官方交易所在做市商不足时提供 backstop；
- 做市亏损可申请保护基金补偿（上限）。

---

## 13. 落地状态（`0112_stock_market`）

已落地：`stock_listings`（+ `last_price`/`prev_close`/`halted_until`/`halt_reason` 四个撮合所需字段）、
`stock_orders`、`stock_trades`、`stock_candles`、`stock_holders`（+ `locked_until`）、`stock_daily_summary`、
`dividends`、`margin_accounts`、`securities_lending`、`short_positions`、`delisting_cases`；
`repo/stocks.py`、`domain/stock_service.py`、`api/v1/stocks.py`；job `stock_daily_tick`、`stock_margin_tick`。

实现口径与本文的差异：

- 手续费与印花税 **100% 进 treasury**（CCMC），子交易所 50/30/20 分账未做；
- 市价单只按深度的 5 档成交，**不预估滑点、不二次确认**（滑点提示留给前端）；
- 单账户持仓上限只约束二级市场累计买入：内幕股东（公司 `share_holdings` 持有人）豁免；
- 自成交在撮合层过滤（永不成交）；对倒检测为「1 分钟内同价买卖各 ≥3 笔即拒单」；
- 做空的开空/还券都走「借券 + 市价单」路径，交割与股票同一套结算；
- IPO 不设集合竞价，直接挂 treasury 卖单开始连续竞价。

未做：CCMC 审核与议会 4 票、玩家子交易所/券商接入撮合、拆股并股复权、退市整理期拍卖与做市商、
清算分配（依赖 08）、投资者保护基金、K 线保留/冷归档、前端图表。

---

## 14. 费用归集与分账（`0119_revenue_split`）

- 成交时手续费与印花税仍**即时全额进 treasury**（不改热路径），同时写一条
  `revenue_collections(kind='stock_fee')`。
- `revenue_split_tick`（每小时）或管理端 `POST /admin/economy/revenue/split` 按
  `revenue_split_rules` 把归集款分出：交易所 `market` 50% / 券商池 `officer_pool` 30% /
  投资者保护 `insurance_fund` 20%；分账后 collection 标记 `split_run_id`，可审计到每一笔。
- 规则比例之和必须为 1，否则 422；分区/税费（`property_tax` 70/30）用同一套表，`keep` 腿留在 treasury。
- 未做：券商/交易所作为真实公司主体（当前映射到系统 actor）、按区费率差异化、退款冲正。
