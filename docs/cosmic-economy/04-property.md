# 04 · 行星与小星系产权

> 分册：产权  
> 关联：[03-commerce-center.md](03-commerce-center.md)、[05-stock-kline.md](05-stock-kline.md)

---

## 1. 目标

让行星和小星系成为可估值、可挂牌、可拍卖、可转让的资产，同时保持与现有 `world_planets` 攻城系统一致。

### 1.1 原则

- 行星产权以现有 `world_planets.owner_player_id` 为事实；
- 新系统只做 deed/挂牌/托管/转让，不另造归属；
- 购买产权不免疫攻城；
- AI/真人/公司都可以买卖；
- 交易税、托管、争议冻结必须原子化。

---

## 2. 产权模型

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
  status text check ('open','escrow','sold','cancelled','expired','frozen')

property_bids
  id uuid pk
  listing_id uuid
  bidder_actor_id uuid
  amount numeric(30,4)
  status text check ('active','outbid','won','cancelled')

property_transfers
  id uuid pk
  asset_id uuid
  from_actor_id uuid
  to_actor_id uuid
  price numeric(30,4)
  tax numeric(30,4)
  tx_id uuid
  created_at

property_escrow
  listing_id uuid
  buyer_actor_id uuid
  amount numeric(30,4)
  currency_code text
  status text check ('held','released','refunded')
```

### 2.1 行星

- 已有归属：自动建 deed；
- 无主：CCMC 可挂牌“开拓权”；
- 购买后 24h 护盾；仍可被攻城；
- 攻城期间 listing `frozen`；
- 攻城改变 owner → 旧 deed 关闭、新 deed 生成；
- **行星建筑随产权自动转移**，不单独结算；未领取产出归原主；
- 建筑债务/抵押随产权披露，买方承担已登记债务（未披露可撤销）。

### 2.2 小星系

```text
star_systems
  system_key text pk       -- system_{x},{y},{z}_{index}
  name text
  star_type text
  planet_count integer
  traffic_index numeric
  defense_power integer
  owner_actor_id uuid null
  jurisdiction_sector text
  discovered_at
```

系统产权给：

- 系统内行星交易/港口费征税权（≤3%）；
- 空间站/港口建设优先权；
- 系统命名权（CCMC 审核）；
- **不自动拥有**系统内行星表面。

系统价格通常是行星的 8-20 倍；购买需 Q6+，有攻城/争议时冻结。

### 2.3 主权战争

系统产权可以被“主权战争”争夺，不只是买卖。

```text
sovereignty_wars
  id uuid pk
  system_key text
  attacker_actor_id uuid
  defender_actor_id uuid
  casus_belli text
  status text check ('declared','mobilizing','active','resolved','cancelled')
  declared_at
  resolve_at
  war_score numeric
  winner_actor_id uuid null
  terms jsonb
```

规则：

- 宣战方支付 Q6 战争费 + 48h 动员期；
- 需向 CCMC/被请求区法院备案（跨区见 09）；
- 盟友可加入，按贡献分配战争分；
- 战争分来自系统内战斗/攻城/封锁；
- 7 天或一方战争分 ≥ 阈值时结算；
- 胜方获得系统 title/tax 权，但**不自动获得行星表面**；
- 行星 owner 保留产权，但需向新系统主缴税；可选择出售；
- 战败方 30 天内不能再宣战同一系统；
- AI/真人/公司同一规则。

---

---

## 3. 估值

### 3.1 行星

```text
planet_value =
  base_by_type
  × (1 + resource_score × 0.4)
  × (1 + development_level × 0.08)
  × (1 + traffic_index × 0.2)
  × (1 + recent_sale_premium × 0.15)
```

- `base_by_type`：岩石/海洋/气态/冰封等；
- `resource_score`：元素数量/稀有度；
- `development_level`：建筑/人口；
- `traffic_index`：航道/星区指数；
- `recent_sale_premium`：最近 90 天同星区成交。

### 3.2 小星系

```text
system_value =
  sum(planet_values) × 0.35
  + station_slots × 8000
  + traffic_index × 20000
  + defense_power × 30
```

### 3.3 重估

- 每 6 小时；
- 波动 > 20% 触发复核；
- 交易前实时估值一次，取较高作为参考下限；
- 估值只作参考，成交价由市场决定。

---

## 3A. 产权持有税

```text
property_tax_rates
  jurisdiction_sector text
  kind text check ('planet','system')
  rate_bps integer
  updated_at

property_tax_bills
  id uuid pk
  asset_id uuid
  period date
  amount numeric(30,4)
  currency_code text default 'cc1'
  due_at timestamptz
  status text check ('due','paid','overdue','lien','auction')
```

- 按月按估值征收，税率 0.1%-1.0%（星区主权者设定，CCMC 上限监管）；
- 系统产权也交持有税；
- 分账：70% 星区主权者/30% CCMC；
- 逾期 30 天：产权 lien，禁止转让；
- 逾期 90 天：法院拍卖（见 [08-company-law-bankruptcy.md](08-company-law-bankruptcy.md)）；
- 欠税优先于普通债权；
- AI/真人/公司同规则；
- 免税/减免需议会动议。

---

## 4. 交易流程

### 4.1 固定价

1. 卖方挂牌 → `listed`，产权冻结；
2. 买方支付到 escrow；
3. CCMC 审核（禁售/欠税/攻城）；
4. 交割：产权转移、税扣除、deed 更新；
5. 24h 争议期；
6. 放款给卖方。

### 4.2 拍卖

- 起拍价 + 最小加价；
- 结束前 5 分钟出价自动延时 5 分钟（防狙击）；
- 最高价成交；
- 流拍 → 资产恢复，可重新挂牌。

### 4.3 状态机

```text
owned → listed → escrow → sold
  ↑        ↓        ↓
  └──── cancelled ──┘
owned → auction → sold / expired
任何状态 → frozen（攻城/争议/欠税）
```

---

## 5. 税费与托管

- 产权转让税 2%；
- 拍卖佣金 1%（CCMC）；
- 托管资金在 `currency_accounts` 冻结，不进入卖方余额；
- 交易取消/流拍原路退回；
- 欠税优先从成交款扣除。

---

## 6. 与攻城的关系

| 事件 | 处理 |
|---|---|
| 宣战 | listing 自动 frozen |
| 攻城进行中 | 不允许挂牌/成交 |
| 攻城胜利 | transfer ownership，旧 deed 关闭 |
| 攻城失败 | listing 解冻 |
| 新 owner 护盾 | 24h，仍可被宣战（护盾期除外） |

- 产权交易不改变 `sieges` 的 defender；若交易后攻城结算，按结算时 owner 处理；
- 交易前必须提示“该行星可能被攻城”；
- 产权作为破产财产/抵押物时，处置顺序与法院冻结见 [08-company-law-bankruptcy.md](08-company-law-bankruptcy.md)；
- 跨区产权/现金交割走 [09-cross-region-2pc.md](09-cross-region-2pc.md)。

---

## 7. API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/properties?kind=planet|system` | 挂牌/拍卖列表 |
| GET | `/properties/{asset_key}` | 产权/估值/历史/攻城状态 |
| POST | `/properties/{asset_key}/list` | 挂牌 |
| POST | `/properties/listings/{id}/buy` | 固定价买入 |
| POST | `/properties/listings/{id}/bid` | 拍卖出价 |
| GET | `/properties/my` | 我的产权/税单 |
| POST | `/properties/listings/{id}/cancel` | 取消（未成交） |
| POST | `/properties/tax/{bill_id}/pay` | 缴纳持有税 |
| GET | `/sovereignty/wars` | 主权战争列表/战争分 |
| POST | `/sovereignty/{system_key}/war` | 宣战 |
| POST | `/sovereignty/wars/{id}/join` | 盟友加入 |
| POST | `/sovereignty/wars/{id}/resolve` | 结算（满足条件） |

---

## 8. UI

- 产权市场列表：行星/小星系、价格、估值、税、攻城状态；
- 详情：deed、资源、建筑（随产权转移）、历史、风险提示；
- 挂牌/拍卖表单；
- 我的产权/持有税/欠税；
- 交易历史/税单；
- 拍卖倒计时/出价；
- 主权战争：宣战、动员、盟友、战争分、结算/terms。

---

## 9. 边界与安全

- 产权转移与 `world_planets` 同事务；
- 同一资产并发购买：行锁 + escrow 唯一；
- 交易税精度 0.0001；
- 欠税/抵押/冻结资产不可卖；
- 攻城/争议期间不可成交；
- AI 与真人同价同税；
- 反洗钱：大额交易来源审查。

---

## 10. 测试与验收

- 行星交易后 owner 与 deed 一致；
- 小星系交易不自动获得行星；
- 攻城期间 listing 冻结；
- 拍卖延时/最高价正确；
- 取消/流拍退款；
- 税费/佣金/持有税精确；
- 行星建筑随产权自动转移；
- 主权战争宣战/动员/盟友/战争分/结算；
- 欠税 lien/拍卖；
- AI 买家/卖家同规则；
- 并发购买只有一个成功。

---

## 11. 已定设计

### 11.1 主权战争战争分/盟友分配

```text
war_score = 100 × (
  0.40 × control_time
  + 0.30 × battle_score
  + 0.20 × blockade_score
  + 0.10 × diplomacy_score
)
```

- `control_time`：控制系统核心节点/港口的时间比例；
- `battle_score`：系统内战斗/攻城胜利；
- `blockade_score`：封锁航道/港口；
- `diplomacy_score`：盟友支持/议会承认；
- 结算：7 天或一方 ≥60 分；
- 盟友按战争贡献分分配：
  - 指挥官 60%；
  - 盟友 40%，按贡献比例；
- 胜方获得系统 title/tax 权，不自动获得行星表面；
- 战败方 30 天冷却；可谈判 terms（赔款/通行权/税收分成）。

### 11.2 持有税税率与减免

- 年税率：0.5%-2.0%（按估值），按月账单 = 年税率/12；
- 行星上限 2.0%，小星系上限 1.5%；
- 减免：
  - 新产权 30 天免；
  - 战争损坏 90 天减半；
  - 公共基础设施/议会项目 50%-100%；
  - 欠税/争议资产不减免；
- 欠税 30 天 lien，90 天法院拍卖；
- 税率调整需提前 30 天公告，CCMC 上限监管。

### 11.3 建筑债务/披露

- deed 附件必须列明：
  - 抵押/ lien；
  - 未付工程款/工资；
  - 租约/港口协议；
  - 环境/战争修复责任；
- 卖方保证条款；买方尽调期 7 天；
- escrow 扣留成交价 10%，7 天披露期后释放；
- 未披露债务：买方可向卖方/经纪追偿，CCMC 可撤销交易；
- 已披露债务随产权转移，买方承担；
- 建筑本身随产权自动转移，不单独结算。
