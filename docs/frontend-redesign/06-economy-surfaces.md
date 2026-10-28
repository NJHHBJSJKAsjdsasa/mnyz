# 06 · 经济系统界面蓝图

> 后端 5 个子系统（银行 / 公司 / 产权 / 法院 / 破产）+ 市场深化，共 **74 个端点**已实现但**零 UI**。
> 本文给出 6 个面板的产品与交互规格。**全部使用现有端点，零后端改动。**

---

## 0. 通用约定

### 0.1 面板容器

所有面板统一由 `PanelHost` 渲染在 `#/<id>` hash 下：

```
┌─ 面板（surface-plate，最大宽 1440，居中，距 TopRail 32）─────────────┐
│ 面板头：标题（h1） + 一句话说明 + 右侧全局操作（刷新/筛选）             │
│ 分区导航（Tabs，2 级）：主分区 → 子分区                                │
├─────────────────────────────────────────────────────────────────────┤
│ 内容区（按分区渲染）                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

- 面板打开时**页面本体仍挂载在下方**（`display: none` 不可用，会销毁 3D canvas；
  用 `visibility: hidden + pointer-events: none + aria-hidden` 保活）。
- 关闭：`Esc` / 右上 `×` / 点击 TopRail 的当前 NavRail 项（toggle）。

### 0.2 写操作统一规范

```ts
// panels/_shared/useWrite.ts
// 所有 POST/DELETE 必须走这里，不允许面板里直接 fetch
const submit = async (path: string, body?: unknown) => {
  // 1. 幂等键：ServerApi 已内置 globalThis.crypto.randomUUID()
  // 2. 双重提交保护：inFlight 期间按钮 disabled
  // 3. 失败映射：把后端 code 翻成人话
};
```

**后端错误码 → 用户文案映射表**（必做，现状是直接 `throw new Error(code)` 弹原始英文）：

| 后端 code | 文案 | UI 表现 |
|---|---|---|
| `insufficient_funds` | 余额不足，还差 … | 表单内联（`danger` 左条），同时高亮余额字段 |
| `forbidden` | 你没有权限执行该操作 | Toast（`danger`） |
| `unprocessable` | 该操作在当前状态下不可用：… | Toast（`warn`）+ 附原因 |
| `invalid_argument` | 参数不合法：… | 字段级内联 |
| `not_found` | 对象不存在或已被移除 | Toast + 列表刷新 |
| `rate_limited` | 操作过于频繁，请稍等 | Toast（`warn`），按钮冷却 3s |
| `http_401` | 登录已过期 | 打开 `ServerAuthPanel` |
| 其它 | 操作失败（错误码：…） | Toast（`danger`）+ 可展开原始信息 |

### 0.3 货币显示组件 `Money`

```tsx
<Money value="12345.6789" currency="cc4" />   // 12,345.68 cc4
<Money value="..." currency="q1" delta="-120" />  // 带涨跌色
```

- `numeric(30,4)` → 显示保留 2 位（大额）/ 4 位（< 1）；≥ 100 万用 `1.23M`。
- 全部 `font-mono tabular-nums`，右对齐。
- 九级货币用 `text-micro` 上标标注品质（`Q1`…`Q9`），不用颜色区分币种
  （颜色留给涨跌语义，避免语义冲突）。

### 0.4 准入门槛（Q 级）可视化

九级货币是准入门槛（01 分册）：股票 Q4、行星产权 Q5、小星系 Q6。
面板必须在**进入前**就告知门槛，而不是点了才报错：

```
┌────────────────────────────────────────┐
│ 🔒 需要 Q4 银核币持仓 ≥ 1,000           │
│ 你当前：Q4 0 · Q1 12,400               │
│ [去兑换]  ← 直连 #/bank?tab=exchange    │
└────────────────────────────────────────┘
```

组件：`panels/_shared/GateNotice.tsx`，props：`required: {currency, min}`、`current`。

---

## 1. 资产面板 `#/assets`

**端点**：`GET /assets`、`GET /wallet/currencies`、`GET /stocks/portfolio`、`GET /properties/my`、`GET /bank/accounts`、`GET /bank/loans`、`GET /fleet`(via /assets)、`GET /leaderboard`

### 布局

```
┌─ 净资产 大字（display mono） + 24h 变化（up/down）──────────────────┐
├─ 4 格指标：可用现金 / 银行存额 / 股票市值 / 产权估值 ─────────────────┤
├─ 主分区 Tabs：货币 | 资源 | 股票持仓 | 产权 | 负债 | 排名 ────────────┤
│                                                                     │
│ 货币：9 行表格（品质/代码/名称/余额/可用/冻结/折 Q1 等值）              │
│ 资源：12 种资源 + 容量条                                             │
│ 股票持仓：代码/股数/成本/现价/浮盈/占比（涨红跌绿）                    │
│ 产权：资产键/类型/估值/持有税/状态                                    │
│ 负债：贷款/利率/剩余期数/下次还款/存单质押                             │
│ 排名：全服 Top 20（GET /leaderboard）+ 我的名次                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 关键交互

- 净资产数字变化时 `color` 闪 `up`/`down` 160ms（见 04 §8.3）。
- 每行右侧 `→` 跳到对应面板（货币 → `#/bank`，股票 → `#/market?tab=portfolio`，产权 → `#/legal?tab=property`）。
- 面板顶部固定一个"资产负债一览"横向堆叠条（净资产 = 资产 − 负债），不可点击，纯可视化。

---

## 2. 市场面板 `#/market`

**端点**：`GET /stocks`、`GET /stocks/<t>`、`GET /stocks/<t>/candles`、`GET /stocks/orders`、
`POST /stocks/<t>/orders`、`DELETE /stocks/orders/<id>`、`GET /stocks/portfolio`、`GET /stocks/margin`、
`POST /stocks/<t>/short|cover|lend|margin`、`POST /stocks/ipo`、`POST /stocks/<t>/dividends`、
`GET /stocks/<t>/dividends`、`GET /stocks/<t>/delisting`、
`GET /market/indices`、`GET /market/indices/<code>/points`、`GET /stocks/<t>/quote`、`POST /stocks/<t>/quotes`、
`GET /exchanges`、`GET /stocks/<t>/mm-program`

### 布局（三栏，≥1280px）

```
┌─ 左 280 ──────────┬─ 中 flex ─────────────────────┬─ 右 360 ──────────┐
│ 指数区             │ 标的名 + 最新价 + 涨跌         │ 下单面板            │
│  指数卡 × N        │ 周期切换 1m 5m 15m 1h 1d       │  买/卖 分段          │
│  ├ 代码 · 值 · 涨跌│ CandleChart（SVG，h 320）      │  价格（mono + 步进） │
│  ├ Sparkline      │ 成交量条（下方 64 高）          │  数量                │
│ 股票列表           │                               │  预估金额 / 手续费   │
│  搜索框            │ 五档盘口（买卖各 5 档，表格）    │  [确认买入]          │
│  行：代码/价/涨跌   │ 最近成交（20 条，滚动）         │  保证金/做空入口      │
│  选中行左 2px signal│                              │                     │
└───────────────────┴───────────────────────────────┴─────────────────────┘
```

`1024–1279`：左右栏折叠为顶部横向滚动条 + 下单面板改 `ContextDrawer`。
`< 768`：单栏，列表 → 详情 → 下单 三段式（点击进入下一段，面包屑可回）。

### 涨跌色（强制）

```ts
// panels/Market/_constants.ts —— 唯一真源
export const UP = "var(--up)";     // #FF5C6C 涨 = 红
export const DOWN = "var(--down)"; // #3FD68C 跌 = 绿
```

现状 `StockMarketPanel` 里是硬编码 `#f87171` / `#4ade80`，改为引用 token（值近似，视觉可接受）。

### 子分区 Tabs

| Tab | 内容 | 端点 |
|---|---|---|
| 行情 `quotes` | 上述三栏 | stocks + candles + quote |
| 我的委托 `orders` | 表格：时间/标的/方向/价/量/已成交/状态 + 撤单 | `/stocks/orders`、`DELETE` |
| 持仓 `portfolio` | 表格 + 汇总 | `/stocks/portfolio` |
| 融资融券 `margin` | 保证金账户、维持担保比例（低于 130% 标 `danger`）、可平仓提示 | `/stocks/margin`、`short`、`cover`、`lend`、`margin` |
| 发行 `ipo` | 表单：代码/名称/发行价/股数/募资额预览 + 门槛提示（Q4） | `POST /stocks/ipo` |
| 做市 `mm` | 我的做市程序：标的、双边报价、剩余额度、开关 | `mm-program` GET/POST/DELETE |
| 分红 `dividends` | 历史分红表 + 发起（仅发行人） | `dividends` GET/POST |

### 下单交互细节

1. 价格输入框旁显示 `±1 档` 快捷按钮（点击 = 当前对手价）。
2. 数量输入框下方显示"≈ 金额"和"手续费"，实时计算（前端算，服务端为准）。
3. **提交前二次确认**（金额 > 账户 10% 时）：`Modal` 列出 方向/价/量/金额/手续费，`danger` 描边确认按钮。
4. 提交后按钮进入 `loading`，成功后 3s 轮询一次 `portfolio` + `orders` 刷新（不用长连接）。
5. 熔断中（±20%/±30%）时，下单区显示 `warn` 横幅并禁用市价单。

---

## 3. 银行面板 `#/bank`

**端点**：`GET /currencies`、`GET /wallet/currencies`、`GET /wallet/entries`、`POST /wallet/transfer`、
`POST /bank/exchange`、`GET /bank/quote`、`GET /banks`、`GET /bank/rates`、
`POST /banks/<id>/deposit|withdraw`、`GET /bank/accounts`、`POST /banks/<id>/loans`、`GET /bank/loans`、
`POST /bank/loans/<id>/repay`、`POST /banks/<id>/certificates`、`GET /bank/certificates`、
`GET /bank/certificate-quotes`、`POST /bank/certificates/<id>/quote`、
`POST /bank/certificate-quotes/<id>/buy`、`POST /bank/certificates/<id>/redeem`、
`GET /bank/interbank`、`POST /banks/<id>/interbank/orders`、
`POST /bank/interbank/orders/<id>/accept|repay`、`GET /bank/insurance`、`POST /bank/insurance/claims`、
`GET /compliance/fund`、`POST /wallet/bribe`

这是 5 个新面板里最重的（28 个端点）。分 7 个子分区：

| # | 子分区 | 核心内容 |
|---|---|---|
| 1 | 钱包 `wallet` | 9 币种余额 + 折 Q1 总额 + 流水（`/wallet/entries` 分页表格：时间/类型/币种/金额/余额后/对手方） |
| 2 | 兑换 `exchange` | 从/到 币种选择 + 数量 + 实时报价（`GET /bank/quote`，输入 400ms 防抖）+ 点差显示 + 到账额 |
| 3 | 银行 `banks` | 银行列表（`/banks`）：名称/类型徽章(central/commercial)/资本/存款利率/贷款利率/我在此行的账户 |
| 4 | 存贷 `deposit-loan` | 存款：选行 → 币种 → 金额 → 期限 → 利率预览。贷款：额度/用途/期限/利率/总还款（明细表：本金+利息+期数） |
| 5 | 存单 `cd` | 我持有的存单（编号/面额/利率/到期/状态）+ 二级市场报价列表 + 「买入报价」「报价出售」「到期兑付」 |
| 6 | 同业 `interbank` | 挂单列表（行/方向/金额/利率/期限）+ 我的挂单 + 接受/还款 |
| 7 | 保障 `safety` | 存款保险（覆盖额度、我的保单、理赔申请）+ 合规基金余额 + 关系费入口 |

### 关键设计

- **兑换点差必须可视化**：

```
兑换 1,000 Q1 → Q4
  参考价   1 Q4 = 812.40 Q1
  点差     0.8%
  实得     1.2198 Q4
  到账     1.2198 Q4  （≈ 990.4 Q1 等值）
```

不显示点差是最容易招致"系统黑我钱"投诉的地方。

- **流水表格必须有"余额后"列**，否则玩家无法对账。
- 存款/贷款表单里，利率与期限是从 `/bank/rates` 读的，**不要前端写死**。
- `POST /wallet/bribe`（关系费）必须放在"保障"分区最底部，`danger` 描边，二次确认文案明确：
  "该操作不可撤销，且会被记入合规记录。"

---

## 4. 公司面板 `#/company`

**端点**：`GET /companies`、`GET /companies/<ticker>`、`POST /companies`、
`GET /companies/<ticker>/governance`、`POST /companies/<ticker>/charter`、
`POST /companies/<ticker>/meetings`、`POST /companies/<ticker>/resolutions`、
`POST /companies/resolutions/<id>/vote|close`、`POST /companies/<ticker>/shares/transfer`、
`POST /companies/<ticker>/financials`、`POST /companies/<ticker>/related-party`、
`POST /companies/<ticker>/related-party/<txn>/decide`、`GET /commerce/licenses`

### 布局

```
┌─ 公司列表（左 320）────────┬─ 公司详情（右）───────────────────────────┐
│ 搜索 + [注册公司] 主按钮    │ 头部：代码/名称/状态徽章/我的持股比例       │
│ 行：代码 · 名称 · 状态      │ 子 Tabs：概览 | 股权 | 治理 | 财报 | 关联交易 | 许可 │
└────────────────────────────┴──────────────────────────────────────────┘
```

| 子 Tab | 内容 | 写操作 |
|---|---|---|
| 概览 | 注册资本、股份总数、股价（若有上市）、员工、成立时间 | — |
| 股权 | 股东表格：股东/股数/占比/类型（真人/AI/公司）；我的转让入口 | `shares/transfer` |
| 治理 | 章程摘要（可编辑，仅 owner）、高管列表、股东会记录、动议列表 | `charter`、`meetings`、`resolutions`、`vote`、`close` |
| 财报 | 期间选择 + 三表（资产/负债/权益；收入/成本/净利；现金流）+ 提交披露 | `financials` |
| 关联交易 | 表格：对方/类型/金额/状态（待审/通过/驳回）；审批按钮 | `related-party`、`.../decide` |
| 许可 | 我持有的商业许可（代码/类别/生效/到期） | 只读（`/commerce/licenses`） |

### 治理交互（关键）

01–10 分册的规则是：**普通决议 > 50%，特别决议 > 2/3，关联方必须弃权**。
UI 必须把这三条**在投票界面上显式呈现**：

```
动议 #A-12  特别决议 · 修改章程
当前：赞成 61.2% / 反对 12.4% / 弃权 26.4%   通过线 66.7%
[赞成] [反对] [弃权]        ← 若我是关联方，三键全禁用 + 提示"关联方须弃权"
剩余时间 02:14:30
```

百分比条用三段水平条（`down` / `up` / `n-600`），通过线用一条 2px `signal` 竖虚线标出。

### 相关禁区

**不要在 UI 里做**：回购、增发、并购的资金动作 —— 后端没有对应端点（见 08 分册缺口）。
按钮不出现，比出现了点不动要好。

---

## 5. 产权面板 `#/legal?tab=property`

**端点**：`GET /properties`、`GET /properties/my`、`GET /properties/listings`、`POST /properties`、
`GET /properties/tax`、`POST /properties/tax/<bill>/pay`、`POST /properties/<asset_key>/list`、
`POST /properties/listings/<id>/buy|bid|close`

| 子分区 | 内容 |
|---|---|
| 我的产权 `mine` | 表格：资产键（行星/小星系）/类型/估值/登记时间/持有税状态/操作（挂牌、缴税） |
| 市场 `listings` | 挂牌列表：资产/卖家/形式（固定价 or 拍卖）/价格 or 当前最高价/剩余时间/操作 |
| 税单 `tax` | 未缴税单：账期/金额/滞纳金/最后期限（`danger` 高亮）/缴税按钮 |
| 登记 `register` | 为新资产登记产权（表单：资产键 + 声明价值 + 上传凭证？——后端无上传，去掉） |

### 交易确认必须显示费用拆解

```
挂牌价        12,000 Q5
交易税 2%       -240 Q5
佣金 1%         -120 Q5
卖家实收       11,640 Q5
──────────────
买家支付       12,000 Q5
```

（依据 03 §托管结算：2% 税 + 1% 佣金。前端只展示，不计算权威值 ——
以后端返回的结算明细为准；若响应无明细，前端展示"以成交结果为准"。）

---

## 6. 法务面板 `#/legal?tab=court` / `?tab=insolvency`

### 6.1 诉讼 `court`

**端点**：`GET /court/cases`、`POST /court/cases`、`GET /court/cases/<id>`、
`POST /court/cases/<id>/evidence|appeal|enforce`、`GET /court/panels/<id>`、
`POST /court/panels/<id>/strike|vote`、`POST /court/judgments/<id>/recognition`、
`POST /court/recognition/<id>/appeal`

```
┌─ 案件列表（左 360）──────────┬─ 案件详情（右）───────────────────────┐
│ 筛选：我发起/我被诉/全部      │ 头部：案号 · 类型 · 状态徽章 · 剩余时限   │
│ 行：案号/类型/对方/状态/时限  │ 时间线（纵向，每次状态变更一条）          │
│ [发起诉讼] 主按钮             │ 证据区：列表 + [提交证据]                │
│                              │ 合议庭区（若已组成）：5 席，投票进度      │
│                              │ 判决区：主文 + 上诉入口 + 执行入口        │
│                              │ 跨区承认区（若需）：申请/异议/结果         │
└──────────────────────────────┴──────────────────────────────────────┘
```

- **计时器**：案件有 30 天中止期、上诉期等时限。列表与详情都显示倒计时（`font-mono`），
  剩余 < 24h 时 `warn`，< 1h 时 `danger` 并呼吸（唯一允许的列表内循环动画）。
- 合议庭 5 席（3+2 抽签）用 5 个座位圈，已投票填 `signal`，回避的座位显示 `n-600` + "回避"。
- `POST /court/cases/<id>/enforce` 按钮：仅在 `judgment` 状态出现，二次确认，
  文案说明"将通过跨区 2PC 执行划扣"。

### 6.2 破产 `insolvency`

**端点**：`POST /insolvency`、`GET /insolvency/<id>`、`POST /insolvency/<id>/claims|plan|plan/vote|plan/confirm|liquidate`

```
头部：案件号 · 状态（中止期 / 申报 / 表决 / 确认 / 清算）
区块 1  资产与负债总览（两个数字 + 差额）
区块 2  债权申报（表格：债权人/金额/币种/优先级/状态；[申报债权]）
区块 3  重整计划（计划摘要 + 类别表决进度：每类别一条进度条 + 通过阈值）
区块 4  清算（顺位表 1–N，每一顺位：应偿/实偿/清偿率）
```

- **清算顺位表是核心可视化**：用堆积条表现优先级，每段标 `n-700` → `signal` 渐变深度，
  已清偿打勾。
- 多币种清算（`paid_q1` 字段）：所有金额同时显示原币种与折算 Q1，折算率来源标注。

---

## 7. 事件流 `#/log`

**端点**：`GET /wallet/entries`（财务事件）+ 本地缓存的操作记录

统一活动流，解决"我刚点了什么、钱去哪了"这个基本问题（现状只能靠刷新页面猜）。

```
┌ 筛选：[全部] [资金] [交易] [诉讼] [治理] [产权] ── 时间范围 ──┐
│ ● 10:24:11  买入 ATL 100 股 @ 812.40        -81,240 Q4       │
│ ● 10:22:03  银行存款 Q1 5,000 → 宇宙第一银行                    │
│ ● 09:58:47  动议 A-12 投票：赞成                                 │
│ ● 昨天      持有税账单生成 240 Q5（12 天后到期）  [去缴纳]      │
└─────────────────────────────────────────────────────────────────┘
```

- 每行左侧状态点：成功 `down`、失败 `danger`、待处理 `warn`、信息 `n-600`。
- 行尾带**可执行链接**（"去缴纳"直接跳对应表单）。
- 顶部一个"待办徽章"汇总（NavRail 上也显示同一个数字）。

---

## 8. 数据刷新策略（关键，避免又把轮询做滥）

| 场景 | 策略 |
|---|---|
| 打开面板 | 一次性拉取当前分区所需端点，写入 `ShellProvider` 缓存 |
| 切分区回来 | 60s 内用缓存，超时后台静默刷新 |
| 面板打开期间 | **不做定时轮询**。只在用户触发写操作后刷新受影响的分区 |
| 计时类（案件倒计时、拍卖剩余） | 用**已有的全局 1s tick** 做纯客户端倒计时，不发请求 |
| 行情类（价格） | 面板打开时每 15s 静默刷新（唯一允许的轮询），且切到后台时暂停 |
| 手动刷新 | 每个面板头部一个刷新图标按钮（带 `loading` 态） |

现状 `StockMarketPanel` 用 `useEffect` + 定时，新面板统一走 `usePanelData(keys, { poll?: number })` hook。

---

## 9. 实施顺序（按价值/成本比）

| 序 | 面板 | 端点 | 理由 |
|---|---|---|---|
| 1 | `#/assets` | 7 | 一切的基础，玩家最先需要"我有多少" |
| 2 | `#/market` | 16 | 已有 `StockMarketPanel` 可改造，增量最小 |
| 3 | `#/log` | 1 | 成本最低，解决"钱去哪了"，先上线先受益 |
| 4 | `#/bank` | 28 | 依赖最多，但货币系统是经济地基 |
| 5 | `#/company` | 14 | 依赖 bank（注册资本需 Q 级） |
| 6 | `#/legal`（产权） | 10 | 依赖 company（可卖给公司） |
| 7 | `#/legal`（诉讼/破产） | 22 | 最复杂，最后做 |

---

## 10. 明确不做

- **不做**玩家间即时聊天/私信（后端无端点）。
- **不做**公司回购/增发/并购按钮（后端无端点）。
- **不做**银行牌照申请 UI（08 分册标注为缺口）。
- **不做**子交易所创建 UI（`POST /exchanges` 存在但需要议会动议，前端只读列表）。
- **不做**任何前端的金额/份额计算结果作为权威值 —— 一律提交后以响应为准。

---

## 11. 验收（本文件）

- [ ] 6 个面板全部可用键盘完成核心路径（Tab → 输入 → Enter 提交）
- [ ] 每个写操作都有：`inFlight` 禁用、幂等键、错误文案映射、成功 Toast
- [ ] 错误码映射表 8 条全部有中文文案，无英文 code 泄漏到界面
- [ ] 所有金额 `font-mono tabular-nums` 右对齐
- [ ] 涨跌色 100% 使用 `--up` / `--down`（红涨绿跌）
- [ ] 面板打开/关闭不触发页面 3D 重载
- [ ] 面板打开后 60s 内无任何 `setInterval` 新建（除行情 15s 一项）
