# 08 · 公司治理、商业法院与破产

> 分册：公司法/破产法院  
> 关联：[03-commerce-center.md](03-commerce-center.md)、[09-cross-region-2pc.md](09-cross-region-2pc.md)、[02-bank.md](02-bank.md)

---

## 1. 范围

在游戏内实现一套**完整现实风格**的公司法与破产法院：

- 公司独立人格、有限责任、章程；
- 股东会/董事会/高管、决议、信义义务；
- 分红/回购/增发/并购/要约收购；
- 少数股东保护、关联交易、派生诉讼；
- 商业法院：合同、侵权、公司纠纷、破产；
- 破产/重整/清算/存款保险/银行处置；
- 跨星区/跨区司法承认（与 2PC 配合）。

**不做**：真实法币/加密资产、现实法律意见、毫秒级高频交易、个人破产（只处理公司/银行）。

---

## 2. 公司人格与注册

```text
companies
  id uuid pk
  ticker text unique
  name text unique
  jurisdiction_sector text       -- 注册地/管辖星区
  legal_form text check ('llc','corp','bank','exchange')
  founder_actor_id uuid
  status text check ('active','suspended','dissolved','bankrupt')
  shares_total bigint
  free_float bigint
  treasury_actor_id uuid
  registered_at
```

### 2.1 章程

```text
company_charters
  company_id uuid pk
  version integer
  document jsonb
  adopted_at
  adopted_by uuid
```

章程必须包含：

- 股份类别/表决权；
- 董事会席位/任期；
- 股东会召集/表决规则；
- 分红/回购/增发规则；
- 关联交易审批；
- 争议解决/管辖；
- 解散/清算条款。

### 2.2 有限责任

- 股东以出资额为限；
- 公司债务不与股东个人资产混同；
- 刺破面纱（欺诈/混同/资本显著不足）由法院裁定。

---

## 3. 治理结构

```text
company_officers
  company_id uuid
  actor_id uuid
  role text check ('ceo','cfo','coo','secretary','director','chair')
  appointed_at
  term_until
  status

board_seats
  company_id uuid
  seat_no integer
  actor_id uuid null
  elected_at
  term_until

shareholder_meetings
  id uuid pk
  company_id uuid
  kind text check ('annual','extraordinary')
  scheduled_at
  record_at
  status text check ('scheduled','open','closed','cancelled')

resolutions
  id uuid pk
  meeting_id uuid
  kind text
  payload jsonb
  yes bigint
  no bigint
  abstain bigint
  status text check ('draft','passed','rejected')
  created_at

votes
  resolution_id uuid
  actor_id uuid
  shares bigint
  choice text check ('yes','no','abstain')
  voted_at
  primary key (resolution_id, actor_id)
```

### 3.1 表决

- 普通决议：出席股份 > 50% 赞成；
- 特别决议：> 2/3；
- 类别股按类别表决；
- 关联股东回避；
- 表决权可按章程设置上限/双层股权。

### 3.2 董事/高管

- 由股东会/董事会选任；
- 任期/罢免/空缺；
- 信义义务：忠实、勤勉、避免利益冲突；
- 违反 → 公司/股东可起诉，赔偿/解任。

### 3.3 少数股东保护

- 压迫救济（oppression remedy）；
- 派生诉讼；
- 评估权（appraisal rights）；
- 强制收购/退出；
- 信息披露。

### 3.4 关联交易

```text
related_party_transactions
  id uuid pk
  company_id uuid
  counterparty_actor_id uuid
  kind text
  amount numeric(30,4)
  status text check ('proposed','approved','rejected','completed')
  approved_by uuid
  created_at
```

- 关联方回避；
- 独立董事/审计；
- 未披露可撤销/赔偿。

---

## 4. 资本与公司行为

| 行为 | 规则 |
|---|---|
| 分红 | 股东会普通决议；不得资不抵债 |
| 回购 | 特别决议；库存股无表决权 |
| 增发 | 特别决议；优先购买权 |
| 减资 | 债权人公告/清偿 |
| 拆股/并股 | 特别决议 + CCMC 备案 |
| 并购 | 董事会方案 + 股东会 + 反垄断 |
| 要约收购 | 持股 >30% 触发；披露资金 |
| 评估权 | 异议股东按法院估值退出 |
| 解散 | 特别决议/法院命令 |

---

## 5. 商业法院

### 5.1 法院层级

```text
commercial_court
  id uuid pk
  name text
  jurisdiction_sector text
  level text check ('first_instance','appeal','supreme')
  status

court_cases
  id uuid pk
  court_id uuid
  kind text check ('contract','tort','corporate','insolvency','takeover','regulatory')
  plaintiff_actor_id
  defendant_actor_id
  jurisdiction_sector
  amount numeric(30,4)
  status text check ('filed','served','hearing','judgment','appealed','closed','enforced')
  filed_at

court_hearings
  id uuid pk
  case_id uuid
  scheduled_at
  judge_actor_id uuid
  status

court_judgments
  id uuid pk
  case_id uuid
  judgment jsonb
  remedy jsonb
  status text check ('draft','issued','appealed','final','enforced')
  issued_at

court_appeals
  id uuid pk
  case_id uuid
  judgment_id uuid
  status

asset_freezes
  case_id uuid
  asset_id uuid
  kind text check ('planet','system','currency','stock','property')
  status text check ('active','released')
  created_at
  primary key (case_id, asset_id)
```

### 5.2 管辖

- 公司纠纷：注册地法院；
- 合同：履行地/被告所在地；
- 侵权：损害发生地；
- 破产：注册地/主要资产所在地；
- 跨区：承认与执行协议（见第 8 节）。

### 5.3 程序

1. 起诉（诉讼费）；
2. 送达/答辩；
3. 证据交换；
4. 开庭（AI 法官 + 玩家陪审）；
5. 判决；
6. 上诉（仅一次，由玩家合议庭审理）；
7. 执行（冻结/划扣/拍卖）。

### 5.4 救济

- 赔偿（货币）；
- 禁令（停止侵害）；
- 强制履行；
- 撤销决议；
- 解任董事；
- 罚款；
- 破产/清算。

### 5.5 法官

- 一审：确定性 AI 法官，按证据/法条/先例评分；
- 上诉：**一次玩家合议庭上诉**，由玩家议员/法官组成，终局；
- 所有判决公开（脱敏）；
- AI 法官不能读私有数据，只能读证据；
- 法官回避/利益冲突。

---

## 6. 破产

### 6.1 触发

- 资不抵债（liabilities > assets）；或
- 无法清偿到期债务；或
- 监管机构/债权人申请。

### 6.2 程序

- 破产管理人由 **CCMC 在受理后指派**，对法院/债权人会议负责；
- 管理人负责接管资产、审查债权、制定/执行重整或清算方案；
- 管理人报酬/责任由法院核定；
- 个人不适用破产程序，只处理公司/银行。

```text
insolvency_cases
  id uuid pk
  company_id/bank_id
  court_id
  kind text check ('reorganization','liquidation','bank_resolution')
  status text check ('filed','stay','administration','plan','liquidation','closed')
  administrator_actor_id        -- 由 CCMC 指派
  filed_at
  automatic_stay_until

claims
  id uuid pk
  case_id uuid
  claimant_actor_id
  kind text check ('secured','priority','unsecured','equity','fine')
  amount numeric(30,4)
  status text check ('filed','admitted','disputed','rejected','paid')

restructuring_plans
  id uuid pk
  case_id uuid
  document jsonb
  status text check ('draft','voting','confirmed','rejected')
  confirmed_at

plan_votes
  plan_id uuid
  class text
  yes numeric
  no numeric
  primary key (plan_id, class)

asset_sales
  id uuid pk
  case_id uuid
  asset_id uuid
  method text check ('auction','private')
  price numeric(30,4)
  status
```

### 6.3 自动中止

申请受理后：

- 所有针对债务人的诉讼/执行暂停；
- 担保品处置需法院批准；
- 合同继续/拒绝由管理人决定；
- 银行挤兑转入处置程序。

### 6.4 债权顺位

```text
1. 破产费用/管理人报酬
2. 有担保债权（担保物价值内）
3. 员工/船员优先债权
4. 税费/CCMC 罚款
5. 无担保债权
6. 股东
```

### 6.5 重整

- 管理人制定计划；
- 债权人类别表决；
- 每类 > 1/2 人数 + 2/3 金额同意；
- 法院 cramdown（公平/绝对优先）；
- 计划执行/监督；
- 失败转清算。

### 6.6 清算

- 资产拍卖；
- 按顺位分配；
- 剩余返还股东；
- 注销公司/银行；
- 董事/高管责任追索。

### 6.7 银行处置

- 存款保险优先；
- 资产/负债转让给承接银行；
- 股东/次级债先吸收损失；
- 央行流动性/公共资金需议会批准；
- 与 [02-bank.md](02-bank.md) 的存款保险衔接。

---

## 7. 公司法与 AI/真人同权

- AI 可以设立公司、当董事/高管/股东；
- AI 公司同样披露财报、遵守关联交易/反垄断；
- AI 可以被起诉、破产、清算；
- AI 法官/陪审不能因 AI 身份偏袒；
- 所有 AI 判决/裁决可审计。

---

## 8. 跨区司法承认

跨区/分库后：

- 判决在注册地法院作出；
- **其他区不自动承认**：必须由被请求区法院通过 `court_recognition` 确认；
- 承认条件：程序正当、不违反公共秩序、无欺诈；
- 资产冻结/划扣需要跨区 2PC 或 saga（见 [09-cross-region-2pc.md](09-cross-region-2pc.md)）；
- 破产管理人（CCMC 指派）可申请跨区资产保全。

```text
court_recognition
  id uuid pk
  judgment_id uuid
  region text
  status text check ('requested','recognized','rejected')
  decided_at
```

---

## 9. API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/companies/{ticker}/charter` | 提交章程 |
| GET | `/companies/{ticker}/governance` | 董事/高管/股东会 |
| POST | `/companies/{ticker}/meetings` | 召集股东会 |
| POST | `/companies/{ticker}/resolutions` | 提案/表决 |
| POST | `/companies/{ticker}/related-party` | 关联交易申报 |
| POST | `/court/cases` | 起诉 |
| GET | `/court/cases` | 我的案件 |
| POST | `/court/cases/{id}/evidence` | 证据 |
| POST | `/court/cases/{id}/appeal` | 上诉 |
| POST | `/insolvency` | 破产申请 |
| GET | `/insolvency/{id}` | 案件/债权/计划 |
| POST | `/insolvency/{id}/claims` | 申报债权 |
| POST | `/insolvency/{id}/plan/vote` | 计划表决 |

---

## 10. UI

- 公司治理页：章程、董事、股东会、决议、关联交易；
- 法院：案件、开庭、判决、上诉、执行；
- 破产：申请、债权申报、管理人、计划投票、分配；
- 公开公告/判决书；
- 风险提示。

---

## 11. 测试与验收

- 股东会/董事会表决/回避正确；
- 分红/回购/增发不违反资本维持；
- 关联交易未披露可撤销；
- 法院管辖/上诉/执行；
- 破产自动中止生效；
- 债权顺位/分配金额正确；
- 重整计划类别表决/cramdown；
- 跨区判决承认；
- AI/真人同权；
- 并发资产冻结/划扣无重复。

---

## 12. 已定设计

### 12.1 玩家合议庭

- 合议庭 3 名法官 + 2 名替补；
- 抽选池：等级 ≥10、无未结案件、无利益冲突的玩家（含 AI）；
- 随机抽选 + 双方各一次无理由回避 + 有因回避；
- 任期：一案一任；
- 薪酬：Q2 200/日 + 案件津贴 Q2 500，由法院经费支付；
- 表决：多数；异议写入判决；
- 不能读私有数据，只能读证据；
- 与案件有持股/公司/联盟/家族关系必须回避；
- AI 与真人同池、同酬、同回避规则。

### 12.2 破产管理人

- CCMC 从持证管理人名单指派；
- 报酬：estate 的 1%-3%，法院核定；最低 500 Q1，最高 100,000 Q1；
- 责任：
  - 勤勉/忠实义务；
  - 故意/重大过失造成损失 → 赔偿/吊销资格；
  - 可购买职业责任保险；
- 利益冲突必须披露/回避；
- 债权人会议可申请更换，法院批准。

### 12.3 跨区承认拒绝理由

被请求区法院可拒绝承认：

1. 原法院无管辖权；
2. 未给被告正当通知/答辩机会；
3. 判决通过欺诈取得；
4. 违反本区公共秩序；
5. 与本区已生效判决冲突；
6. 判决内容不确定/不可执行；
7. 惩罚性赔偿/罚款未终局；
8. 承认会损害善意第三人。

- 拒绝需书面理由；
- 可向上级法院上诉一次；
- 承认后执行仍需 2PC/资产所在地程序。

---

## 13. 落地状态（`0114_company_law_court`）

已落地：19 张表（章程/高管/董事/股东会/决议/表决/关联交易 + 三级法院/案件/证据/开庭/判决/上诉/冻结 +
破产案件/债权/重整计划/计划表决/资产处置）、`repo/legal.py`、`domain/company_law.py`、
`domain/court_service.py`、`domain/insolvency_service.py`、`api/v1/court.py`、`api/v1/insolvency.py`、
job `court_deadlines`、`insolvency_plan_tick`；`companies.status` 增加 `bankrupt`。

实现口径：

- **表决**：普通决议 >50%、特别决议 >2/3，按 `share_holdings` 加权；`payload.related_actor_id`
  对应的股东强制弃权；提案人自动投赞成票。
- **决议落地**：`officer_appointment`（含董事席位）、`charter_amendment`、`related_party`（置 approved）、
  `dissolution`（公司置 suspended）、`dividend`（委托 05 的 `pay_dividend` 真实派息）。
- **法院**：一审 1%（最低 10 cc1）诉讼费；证据只允许当事人提交；判决分数 = 0.5 + 0.08×(双方证据差)
  + 0.2×(案件哈希随机 −0.5)，确定性可复算；上诉一次性、30% 改判率；执行按余额划扣，不足生成
  `asset_freezes(currency)` 并记录 `unpaid`。
- **破产**：自动中止 30 天（期间禁止对债务人起诉）；管理人 = `officer_pool`；债权申报即确认；
  清算 2% 管理人费（500-100,000 区间）；顺位 secured→priority→unsecured→fine→股东，同类按比例；
  重整计划各类别 >1/2 人数 + 2/3 金额通过后置 `administration`。
- **只清算 cc4**：多币种按 Q1 折算分配未做。

未做：玩家合议庭（§12.1）、法官回避/陪审、回购/增发/减资/并购/要约收购的资金动作、评估权与压迫救济、
跨区判决承认（§8，待 0115）、管理人责任与职业保险、冻结与产权/股票挂牌的联动。
