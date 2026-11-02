# Atlas 剩余任务清单

> 生成：2026-10-28 16:5x；**最后更新：2026-11-02 13:5x**（基线复测：把「基线（实测）」四行按代码重算，补 0127–0140；上一轮：壳统一 P0–P6 全完成 + 上游 3.0.2 移植）。上一轮：账本安全轮（T-32 冲正分录落地 0138 + 3 个 admin 端点）。上上轮：真重构第二轮（`FuelBars` 306 → 76 + `fuel/`；`PlanetInfo` 432 → 270 + `planet/` 三块；`Arecibo` **4,515 → 113 + 8 模块**，22 组指纹逐位一致；删死文件 `ResourceStatusBar`）。依据：`docs/` 全量 58 篇 + 代码交叉核对（凡标「已核」的都对过源码，不是抄文档）。
> 用法：勾选推进；每项带出处，改完回填对应分册。

---

## 0. 基线（实测）

| 项 | 值 |
|---|---|
| 后端 | **26 子蓝图 <!--fact:api.blueprints=26--> / 255 端点 <!--fact:api.endpoints=255--> / head `0141_job_catch_up` <!--fact:migrations.head=0141_job_catch_up-->**（0128–0140 全部为本次新增；2026-11-01 新增 `api/v1/universe.py` 跨星系系统搜索） |
| 前端 | **368 文件 <!--fact:frontend.ts_files=368--> / 89,738 行 <!--fact:frontend.ts_lines=89,738-->**（`ts/tsx` 实测，2026-11-02）；`ui/` **24 文件** = 11 基础控件（`Badge`/`Button`/`Checkbox`/`IconButton`/`Input`/`NumberInput`/`Progress`/`Select`/`Switch`/`Tabs`/`Tooltip`）+ 11 复合件（`Panel`/`Table`/`Modal`/`Drawer`/`Toast`/`EmptyState`/`Skeleton`/`CandleChart`/`Sparkline`/`Money`/`Status`）+ `api`/`index`；**`Shell/` 18 文件 / 2,060 行**（16 号壳统一后：`GameFrame`/`GameRouter`/`ShellProvider`/`GameTopBar`/`LevelStepper`/`RailPager`/`RailSearch`/`RailNote`/`Breadcrumb`/`BackLinks`/`CommandPalette`/`InfoDrawer`/`StageHeading`/`GameAtoms`/`AtlasShell` + `railFilter`/`viewData`/`ShellRouter`）+ **`panels/` 38 文件 / 6,106 行**——6 主面板（资产/银行/市场/公司/法务/活动）+ `PanelHost` + **26 子分区**（市场 10 / 银行 7 / 公司 6 / 法务 3）+ `OrderTicket` + `_shared`(3)；`economy/` 旧面板已删空，只剩 `EconomyShell.tsx` **81 行**在用 |
| 样式 | **现行 = 15 号 Game HUD**（2026-10-30 同日两轮：Amber Cockpit → Game HUD，14 号的视觉条款已作废）：深空海军蓝底 + 电光青 `#2ee6ff` / 等离子紫 / 金 `#ffc53d`，切角 + 四角括号 + 辉光 + 扫描线 + boot 动效；`tokens.css` / `global.css` / `components.css` 全量重写，`tailwind.config.js` 调色板按语义重映射（blue/indigo→等离子青蓝、purple/violet→紫、cyan→青、green→酸绿、red→绯红、amber→琥珀、gray/slate→深空冷灰）；`backdrop-blur` **21 → 11 处**（计入约束 **12 → 2**） |
| 服务端权威 | 21 个 `_atlas*` 键中 **18 个已是服务端真源**（§9），仅剩纯展示缓存 |
| 已全绿 | ROADMAP 26 项玩法、0110–0140 迁移、REVIEW §0.1 的 P0+P1 全关闭、T-01~T-06 / T-12 / T-15 / T-15b / T-17 / T-19 / T-22 / T-23 / T-24 / T-32 / T-69 / T-62~T-65 / T-13① / T-66 / T-67a–g / T-68 / T-70~T-72 / T-79b / T-80~T-86 / T-21 |

**一句话**：玩法层和数据库层基本满了；**前端重设计 P0–P6 已于 2026-11-01 全部完成**（壳统一、零刷新导航、跨星系搜索、层级返回、动画收口）。剩下的是「服务端对玩家的裁决权」「经济系统的二级市场规则」，以及前端三块未动的内容（8 页重排、旧 `Components/*Tab.tsx` 重写、`statusBus`）。

---

## 1. P0 · 正在流血（≤2 天，先做）

| # | 任务 | 现状 | 依据 | 量 |
|---|---|---|---|---|
| T-01 | **航行权威**：`POST /travel/quote` + `/travel/commit` | ✅ **已落地 0128**：`domain/travel.py` + `repo/travel.py` + `api/v1/travel.py`（3 端点）；前端 `SpaceshipTravelManager.chargeTravel` 在 `server` 模式改走 quote→commit，本地钱包用账本余额覆盖；8 项集成测试全绿 | 11 §4.1 | 1.5d |
| T-02 | `GET /state` 补 `in_flight[]` | ✅ 已落地（`travel_log` 未到达记录，最多 5 条） | 11 §4.4 | 0.5d |
| T-03 | `GET /ship` + 服务端派生 `status[]` | ✅ 已落地（`domain/ship_state.py`；id 严格取 09 词表，空油箱复用 `fuel.low`+`reason`）；`/state.ship` 同步补 `shield`/`shield_max` | 11 §4.2 / 10 P0-6 / 09 §3.1 | 1d |
| T-04 | `If-Match` 统一：转账/下单/投标/拆股/存款/还款/动议 | ✅ **已落地**：`bank/stocks/market/properties/council` 五个蓝图的 `_write` 在**事务内**取最新行再校验（`council` 从 `current_player()` 缓存改为事务内行）；前端 `ServerApi` 记 `state_version`，只对 7 条读改写危险路由带 `If-Match`，412 → 清版本 + 抛「已有更新，请刷新后重试」。无 header 时放行（渐进启用，旧客户端不受影响）。4 项测试 | 10 P1-2 | 1d（含前端） |
| T-05 | 金额统一字符串 + 时间统一 ISO8601Z（按蓝图灰度 + 快照测试） | ✅ **时间全量收口**：`server/api/**` + `server/domain/**` 的 `.isoformat()` **108 → 9**，其余走 `ts()`/`day()`；保留的 9 处全部带注释（4 处分区 DDL 边界、3 处确定性种子、2 处错误文案）。金额：业务端点本就是 `str(Decimal)`，`/state.resources` 保留 number 作首屏例外。回归 32 项全绿（council/2pc/ai/api_surface/auth） | 10 P1-4 + 12 §G | 3d |
| T-01b | `/navigate` 要求 `travel_ticket`（服务端 commit 后写入 session） | 🟡 **2026-11-01 做了前置一半**：`/travel/commit` 的响应现在带 `destination {x,y,z}`（原来只有 travel_id/status/时间/成本，前端只能拿自己猜的坐标去跳）。**ticket 本身没做** —— API 走 token、页面走 Flask session，两者不共享，得走无状态 HMAC 签名；且强制后会挡住未接线的跳转，需要先埋点观察一轮。踩坑：`insert_log` 返回的 travel_log 行不含 `to_x/y/z`（在 quote 行上），要显式搬过去 | 11 §4.1 | 1d |
| T-64 | `global.css` 2209 → ≤400 行 | ✅ **已落地**：按块解析 + 全仓子串搜 + 白名单（id/vendor/html 钩子）级联删除 55 个块，再把 `@keyframes`/`animate-*` 拆到 `animations.css`（1161）、具名组件类拆到 `components.css`（391）→ **global.css 219 行**；删除清单与复核方法见 `13-css-cleanup.md` | 1d |
| T-06 | REVIEW 遗留三小事：OpenAPI body schema、`/state.ship.shield`、动画闸门改白名单计数 | ✅ **三条全部关闭**：① `gen_api_docs.py` 产出 `x-atlas-body` 覆盖全部写端点（现 242 操作）；② `/state.ship.shield`+`shield_max` 已补；③ 新增 `scripts/check_frontend_gates.py`：v1 直连必须 0、旧 `/api/*` 必须在冻结清单、循环动画只计数（62 / 排除 3D 后 60） | REVIEW §0.1 | 0.9d |

---

## 2. 后端完整性（10 + 12 批次 D/E/F）

| # | 任务 | 依据 | 量 |
|---|---|---|---|
| T-07 | 运营视角后端：封号/解封、补偿发放、冲正分录、全服公告、经济仪表盘、AI 预算熔断 | 🟡 **5/6 已落地**：`domain/ops.py` + `admin_ops` 6 端点 + 迁移 0129 `announcements`，全部写 `audit_log`；**冲正分录已随 T-32 落地**（`domain/ledger_reversal.py`）；**只剩 AI 预算熔断** | 12 §5 | 文 1d + 码 3d |
| T-08 | 列表端点 SQL 次数 ≤5 的 CI 断言 + 联合索引 | 12 §H | 0.5d |
| T-09 | 压测基线（真实 k6 报告）+ 备份/PITR 演练记录 + 四档灰度观察结论 | 21 §6 / 14 §5 | 需环境 |
| T-10 | 测试闸门：domain 覆盖 ≥85%、属性测试 1000 组、并发 6 类、混沌 5 项、撮合对拍 10k | 13 §验收 / 07 §6.4 | 5d |

---

## 3. 经济系统二级规则（cosmic-economy 未做，均已核代码）

### 3.1 银行（`02`）

| # | 任务 | 现状 | 量 |
|---|---|---|---|
| T-11 | 银行牌照申请/审批（玩家/AI 开银行） | ⬜ `bank_service` 无 licence 相关代码 | 2d |
| T-12 | 浮动利率重定价 | ✅ **已落地（复核于 2026-10-29）**：`bank_service.reset_floating_rates`（`RESET_INTERVAL_DAYS`，按 `bank_repo.floating_due` 逐笔改 `rate_type='floating'` 的贷款利率到当期 policy rate）+ job `bank_rate_reset_tick`；`set_policy_rate` 是唯一改政策的入口 | 1.5d |
| T-13 | 逾期清算 / lien / 抵押物拍卖（逾期 7 天） | ✅ **四步全部落地**：① 阶梯 `active→overdue→defaulted`（`overdue_tick` + job，**一步/轮**，`NOT id = ANY(fresh_overdue)` 防链式）；② **抵押登记**（0134 `bank_loan_collateral` + `property_encumbrances(kind='lien')`，`POST /banks/<id>/loans` 收 `collateral_asset_ids`，覆盖率 130%、按登记时估值快照）；③ **默认扣押 + 拍卖**（`seize()`：产权过户给银行 → `status='auction'` → 3 天拍卖，底价=本金+利息、步长 1%，幂等只碰 `pledged`）；④ **清偿分配**（`property_service._settle` 末尾 `settle_liquidation`：利息→本金→余额退借款人，全额覆盖转 `liquidated`、不足 `write_down` 留 `defaulted`）。新增 `GET /bank/loans/<id>/collateral`；`GET /bank/loans` 不再只看 active（默认/已清算的贷款原来对玩家不可见）；前端 `LoansTab` 加抵押勾选与「已扣押」列。10 项新测试（含端到端拍卖成交）+ 原 7 项阶梯测试 | 3d |
| T-14 | 发行奖励发放任务 | ✅ **已落地**：`currency_service.distribute_daily_reward`（当日活跃玩家等分，余数留 treasury，`idem_key=daily_reward:{day}:{actor}` 防重）+ job `reward_distribution_tick` | 0.5d |

### 3.2 商业与公司（`03`/`08`）

| # | 任务 | 现状 | 量 |
|---|---|---|---|
| T-15b | 许可月度续费 job | ✅ **已落地（复核于 2026-10-29）**：`licensing.renew_due` + job `licence_renewal_tick`（86400s）；`TERM_DAYS=30`（审批时给 30 天，此前给 365 天导致续费 job 永不触发）；欠费**暂停不吊销**，补足余额可恢复 | 03 §3 | 0.5d |
| T-15 | 商业许可申请/审批 | ✅ **已落地**：`domain/licensing.py` 6 类许可（申请免费幂等 / 审核通过收首月费到 treasury / 资本金门槛余额校验 / 拒绝即 revoked）；4 个端点 + 7 项测试 | 1.5d |
| T-16 | 回购/增发/减资/并购/要约收购的**资金动作** | 🟡 **三/五已落地（0136）**：`domain/capital_actions.py` + `company_law._apply` 分派 + 决议 schema 扩 `reduction/merger/tender`。**回购**=按登记册比例、金库付款，上市买回作库存股（不动治理册→无表决权）、私有直接注销；**增发**=定向（认购方付款，且必须是提案人）/ 公开（铸给金库+挂卖单，与 IPO 同路）；**减资**=按比例注销+付款，有未清银行贷款则拒（债权人保护代理）。**未做**：并购与要约收购的资金动作（需要母子公司模型 + 要约托管）、增发的优先购买权、减资公告期。7 项新测试 | 3d |
| T-17 | 反垄断快照任务（>40% / top3>70% / HHI>2500） | ✅ **已落地**：`domain/antitrust.py` 按 30 日成交额算 share/HHI/top3，落 `market_share_snapshots` + job `antitrust_tick` + 2 个 admin 端点 + 4 项测试 | 1d |
| T-18 | 24h 争议期 + 产权冻结与挂牌联动 | ✅ **已落地 0137**：`property_disputes` + `domain/property_disputes.py`。成交后 24h 内交易双方/当前持有人可提争议（`POST /properties/<key>/dispute`）；受理即 `status='frozen'` + 撤销该产权全部 open 挂牌 + 写 `encumbrances(kind='dispute')` —— **拦截复用既有检查**（`list_asset` 要求 owned、`buy` 拒绝未解除负担），没有第二套状态机。72 小时未裁决自动过期解冻（job `property_dispute_tick`）；CCMC 裁决成立 → dispute 转 freeze 继续锁（等法院），驳回 → 释放并可再挂牌。3 个端点；6 项测试。**未做**：卖方放款延后到争议期结束（现在仍即时收款） | 2d |
| T-19 | 持有税 70/30 分账（现 100% 进财政） | ✅ **已落地（复核于 2026-10-29）**：`property_service.pay_tax` 缴税当场 `revenue_repo.collect(kind='property_tax')`，规则 `[treasury 0.70 keep, market 0.30]`（0119 种子），job `revenue_split_tick` 按小时把钱从 treasury 划给 market | 0.5d |
| T-20 | 评估权与压迫救济、管理人责任保险 | ⬜ | 2d |

### 3.3 证券（`05`）

| # | 任务 | 现状 | 量 |
|---|---|---|---|
| T-21 | IPO 议会/CCMC 审批 + 首日集合竞价 | ✅ **三块全部落地（0135）**：① `council_motions.kind` 扩 `ipo`，`POST /council/ipo` 申请时先跑 `stock_service.precheck_ipo` 全部门槛（成立≥7 天 / 净资产≥5 万 / 控股 50% / 自由流通≥20% / 未上市），同一 ticker 只能有一份在审；② 议会 5 AI + 2 玩家席位、`PASS_YES=4`、30 分钟窗口，**通过即自动挂牌**（参数申请时冻结、执行前重新校验，执行失败则改判 rejected 并写原因）；③ **首日集合竞价**：`stock_listings.auction_ends_at/auction_cleared_at` + job `stock_call_auction_tick`（60s），窗口内只入簿不撮合、市价单拒收，到期按「最大成交量价、平局取最接近发行价、候选价限 ±20% 熔断带」定单一清算价，全部成交用该价。快速通道 `POST /stocks/ipo` 保留（`call_auction_minutes` 默认 0 = 旧行为），议会通道默认 30 分钟 | 2.5d |
| T-22 | 退市整理期拍卖 + 清算分配（依赖破产顺位） | ✅ **已落地 0139**：`delisting_cases` 加 `consolidation_ends_at/auction_ends_at/clearing_price/distributed_amount` + 新表 `stock_delisting_payouts`。三阶段状态机 `consolidation`(30 天，**照常交易**，让持有人自己走) → `auction`(3 天，停牌) → `settled`；清算价 = 整理期成交量加权均价（无成交回落到最后价/发行价）；分配顺序 **先还银行活跃贷款，余额按持股比例分**（金库股排除，余数给最大持有人），股份注销；job `delisting_tick`（3600s，三处注册）。5 项测试（含「窗口内还能卖」「到期停牌」「按比例分钱」「空金库股份照样作废」）。**未做**：非银行债权人、产权资产拍卖（属 04 模块） | 2d |
| T-23 | 投资者保护基金 | ✅ **已落地 0140**：`investor_protection_claims` + `domain/investor_protection.py` + 4 端点（`/market/protection` 看基金与我方申请、`POST /market/protection/claims` 申请、admin 列表与裁决）。资金来源就是 0119 已经把股票手续费 20% 划进去的 `insurance_fund`；**单笔赔付上限 1 万**（审批不封顶、赔付封顶，短额在 `claimed-paid` 里看得见）；一人同时只能有一笔 pending（部分唯一索引）；空基金批了也付 0（状态 rejected，不报错）；每次裁决写 `audit_log`。6 项测试 | 1.5d |
| T-24 | 手续费 50/30/20 分账 | ✅ **已落地（复核于 2026-10-29）**：`stock_service` 收佣时 `revenue_repo.collect(kind='stock_fee')`，规则 `[market 0.50, officer_pool 0.30, insurance_fund 0.20]`；`test_revenue_split` 逐分账方对平。**未做**：按交易所/券商主体真实分账（现在打给系统 actor） | 1d |
| T-25 | 同质化相关性检测（0.8 阈值，@ 06 §11） | ⬜ | 2d |
| T-26 | 多恒星/`axial_tilt` 等渲染细节见 §5 | — | — |

### 3.4 AI（`06`/`10`）

| # | 任务 | 现状 | 量 |
|---|---|---|---|
| T-27 | AI 动作集扩展：产权/公司/银行/议会/攻城 | 🟡 仅 `stock.order` / `bank.deposit`，其余 idle | 4d |
| T-28 | LLM 出网 allowlist + prompt 加密审计 + 自动熔断 | 🟡 四档模式与回退已做，安全侧未做 | 2d |

### 3.5 法院与跨区（`08`/`09`）

| # | 任务 | 现状 | 量 |
|---|---|---|---|
| T-29 | 跨区并行承认的冲突判决检测 | 🟡 `0118` 只做单区承认 | 2d |
| T-30 | 判决执行走 2PC 的**进度可查** + 费用实际划转 | 🟡 执行是异步的，无进度端点 | 2d |
| T-31 | 真实多库参与者网络调用（现单库 no-op） | ⬜ | 5d |
| T-32 | undo/redo 日志（冲正分录，不删原账） | ✅ **已落地 0138**：`currency_ledger_transactions` 加 `reversal_of` / `reversal_reason` + **部分唯一索引**（一笔交易只能被冲正一次）。`domain/ledger_reversal.py` 是唯一实现：镜像由**分录取反**算出（不重放业务，必然平衡；兑换类按 Q1 等值平衡自动识别）；余额已被花掉就 **409 拒绝**（不造负余额）；重做 = 冲正那条冲正分录。**状态派生不落库**：当前是否生效 = 镜像链后代数奇偶。3 个 `admin`/`ops` 端点（列表/详情/冲正）在 `api/v1/ledger.py`，冲正同时写 `audit_log(action='ledger.reverse')`。7 项测试；口径写进 `00 §4.2.1` | 3d |

---

## 4. 前端重设计（`08` 共 27 人日；P0 基座 + P1 外壳 + P3 面板已落地，剩页面重排与动效）

| 阶段 | 任务 | 现状 | 量 |
|---|---|---|---|
| P0 | `global.css` 2,209 → ≤400 行、`@keyframes` 88 → ≤30 | ✅ **已落地 T-64**：`global.css` 219 行，`@keyframes` 拆到 `animations.css`；清单见 `13-css-cleanup.md` | 2d |
| P0 | `js/ui/` 11 个基础控件 | ✅ **已落地**：Button/IconButton/Input/NumberInput/Select/Checkbox/Switch/Badge/Tooltip/Tabs/Progress，`ui/index.ts` 统一导出 | 1d |
| P1 | `js/shell/` 7 件 + 8 Layout 接入 + 删 1s 轮询 | ✅ **三件全部落地**：shell 7 件 T-65；1s 轮询 T-71（`Utils/clock.tsx` 共享时钟，46 → 31 个定时器）；**Layout 接入 T-74**（`ensureEconomyShell()` 挂到 galaxy/system/planet 三个游戏入口，`#/assets` 等面板任何页面可达）。faq/multiverse/error/onboarding 有意不挂 | 4d |
| P2 | **全站换肤（Amber Cockpit）**：新视觉系统 + 外壳 + 基元 + 8 页根 + 坐标控件 | ✅ **已落地 2026-10-30**：详情见 `frontend-redesign/14-amber-cockpit.md`。机制是**重映射 Tailwind 调色板**（500+ 处工具类一次性换色，不逐文件改）+ 重写 tokens/global/components + 重做 `Shell/` 四区、`ui/` 基元、`Header`、`CoordinateSelector`、8 个页面根（`.atlas-page`）；14 处渐变文字标题改实色；装饰性毛玻璃清零。tsc/冒烟/构建/闸门全绿 | 3d |
| P2 | **面板密度 / 游戏页 HUD / 图标配色（换肤第二轮）** | ✅ **已落地 2026-10-30**：`ui/Table` 改遥测密度（行距 `3px 8px 4px` ≈26px、表头 10px 等宽 sticky、斑马 + hover、右对齐列 tabular-nums）；`Panel` 内距 10/12、gap 10、外壳内容区 12；新增 `.atlas-hud` 一次替换 16 处 `bg-white/5 rounded-2xl`，三页页头统一成 kicker+实色标题+等宽面包屑，删行星页点阵 overlay；`rounded-2xl/xl` 全仓清零；新增 `Icons/palette.ts` 单一色源，燃料条去 glow/gradient/3 个 pulse（循环动画 50 → 45）。口径见 `frontend-redesign/14 §5` | 1.5d |
| P3 | **可视化验收工具**：`tools/shot.mjs` + `npm run shot` | ✅ **已落地 2026-10-30**：`playwright-core` + 系统 Edge（不下载内核），`context.request.post("/navigate")` 建会话后截 `/galaxy` `/system/1` `/planet/<seed>` 与六个经济面板；行星名从 `#system-data` 取（`PlanetNavigation` 用 `window.location`，DOM 无 `<a>`）。**首次实现游戏页/面板的像素验证**，据此修掉 `NavRail` 换行、游客提示刷屏、`bg-white/10` 变脏棕三处真问题。见 `frontend-redesign/14 §5.4` | 0.5d |
| P0 | **全站游戏化（Game HUD）** | ✅ **已落地 2026-10-30 晚**：用户「不像游戏」「不要分成一块一块」。调色板按语义重映射为深空海军蓝 + 电光青 / 等离子紫 / 金；`tokens.css` 重写（`.atlas-page` 星云网格、`.atlas-plate` 板面、`.atlas-hud` 机框 + 四角括号、`.hud-btn/.hud-tab/.hud-bar/.hud-lamp`、`hud-scan/boot/breathe/ping` 关键帧）；外壳改**一整块 deck**（四区 1px 接缝、面板 gap 12→1px、模块 boot-in 递进）；`ui/{Button,Panel,Tabs,EmptyState}`、`Shell/*`、`Header`、`HeroPanel`、`CoordinateSelector` 全部重做。口径 `frontend-redesign/15-game-hud.md`。tsc/冒烟/构建/闸门全绿，13 张截图见 `.workbuddy/shots10` | 2d |
| P0 | **首页重做 + 经济常驻** | ✅ **已落地 2026-10-30 深夜**：删 `HeroPanel`(212)+`CoordinateSelector`(841)，新 `Layouts/main/HomeScreen.tsx`（顶栏 / 宇宙档案左栏 / 星图舞台 / 跳跃控制台 / 页面级 glow）；`AtlasShell` 从"启动按钮 + 全屏 dialog"改成**常驻右侧 404px 侧栏**（站点 chips、⌘K、全屏、收起到 44px 脊），`body:has(.hud-dock)` 给页面留位；删 `Shell/{NavRail,TopRail,StatusBar}`。tsc 0 / 冒烟 34/34 / 闸门 6 项通过，截图 `.workbuddy/shots13` | 1.5d |
| P2 | **换肤第三轮**：字体 / 渐变清零 / 行节奏 + 星系可发现性 | ✅ **已落地 2026-10-30**：自托管 Barlow Condensed（latin 子集 2×~22KB，OFL，Vite 发哈希资源）；78 处渐变降级为平色（`bg-A` + `hover:bg-B`），只剩 4 处功能性扫描光带；删死文件 `ui/bits.tsx`（186 行，0 引用，最后一份不合节奏的 Th/Td）；新增 `.atlas-kv` 统一面板键值行。**并修了星系可发现性**：`GalaxyNavigation` 的 `‹ ›` 一直是在切星系，但没写坐标 → 玩家读成翻页，以为「一个宇宙只有一个星系」；现在按钮直接显示目标坐标、中间标「相邻星系」，页头补一行「坐标即星系」。见 `frontend-redesign/14 §5.5` | 1d |
| P1 | **「点了没反应」三处静默失败** | ✅ **已修 2026-10-30**：① `ui/Toast` 首次 toast 必丢（render 异步 → 监听器未注册）→ 加 `pending` 队列 + 挂载时 drain；② `atlas:login-required` 在游戏页无人接（`ServerAuthPanel` 只在首页）→ 新增 `ensureAuthPanel()` 自挂载，三个 MountPoint 各调一次；③ UI `:8080` 调 API `:8000` 被 CORS 挡（`ATLAS_CORS_ORIGINS` 只放 6424/5173）→ `.env.server` 加 8080。另加按钮忙碌态与「燃料不足/航行被拒绝」提示。实测点击成功从 `Epsilontron CH-4411` 换到 `Vesperagrix WE-1122`。见 `frontend-redesign/14 §6` | 0.5d |
| P2 | 8 页重排 + B 组 12 个换壳 + 行星页 4 组标签 | 🟡 **B 组 10/12 已落地**：`Header`→令牌化仪器条（T-77）、`ServerAuthPanel`→`ui/Modal` 且不再默认弹（T-78）、`PlanetInfo` **四块全拆**（432 → 270 + `planet/` 4 文件，T-79b）、`FuelBars` 拆成三段并去掉 5s 轮询（T-83）、`ExplorationLab` 12 个标签分四组（T-86）、`VersionFooter` 图标分家 + 去掉死 prop（T-86）、`DidYouKnow` 去遮挡、`TaskPanel` 堆叠、`Pagination`/`CosmicBanner` 无需改。`SpaceshipPanel`→`ui/Drawer` **已完成**（224 → 216 行：右下浮层改右侧满高抽屉，去掉内联 `slideUpFadeIn`/`slideDownFadeOut` 与状态点 `animate-pulse`；循环动画 51 → 50（排除 3D 冻结区后 48））。**8 页重排未开始** | 6d |
| P2.5 | `statusBus` + StatusBar 接入（`ui/Status.tsx` 已有，未接总线） | ⬜ **总线未建**：`StatusBar` 目前直接读 snapshot，面板写成后再看是否需要跨组件广播 | 1.5d |
| P3 | 缺 4 个经济面板：公司 / 产权 / 法院 / 破产（已有 Assets/Bank/Market/Log/EconomyShell） | ✅ **已落地 T-67c–f**：`panels/` 6 个主面板（资产/银行/市场/公司/法务/活动）全部接线；法务面板含产权、诉讼、破产三区 | 4d |
| P3 | 12 个 Tab 重写 + 市场 10 个子分区 | 🟡 **新面板侧已完成**：`panels/Market/` 11 个子分区文件（行情/委托/持仓/指数/做市/券商/交易所/发行/两融/公司行动 + `OrderTicket`）、`panels/Bank/` 7、`panels/Company/` 6、`panels/Legal/` 3；**旧 `Components/*Tab.tsx` 的重写未动** | 5d |
| P4 | 删旧动画 + 动效标定 | 🟢 **2026-11-01 已收口（P6）**：先量再改——闸门的「42 处」是源码 class 计数，`document.getAnimations()` 实测内页稳态只有 24 个，其中 **14 个来自同一个 `EmptyState`**（经济坞每个空面板各一个 `hud-breathe` 无限呼吸）。改 `infinite` → `3` 次，内页稳态 **24 → 10**；`prefers-reduced-motion` 补齐 `atlas-stars` / `hud-shell-scan` / `atlas-jump-veil` / `atlas-view-fade`。剩下的 10 个都是语义信号（3 状态灯 + 1 加载 + 6 已结束的 `hud-boot`）。见 `frontend-redesign/16 §4 P6` | 3d |
| — | 闸门：`fetch(` 白名单化、`animate-pulse` 排除冻结区后计数、非冻结文件 ≤1200 行 | ✅ `scripts/check_frontend_gates.py` 已建：v1 直连=0、旧接口在冻结清单、Shell 禁 fetch、循环动画白名单计数、blur 计数（T-66）、**文件体积上限（新增：渲染面豁免，其余 >1200 行直接 fail）** | 0.4d |
| **P0–P6** | **壳统一（另一套编号，见 `frontend-redesign/16`）** | ✅ **2026-11-01 全部完成**：P0 四区骨架 / P1 内页并入 / P2 零刷新导航（整页跳 39 → 6）/ P3 跨星系搜索（新端点 `GET /api/v1/universe/systems`，79 万系统 7ms）+ 跳页 + LevelStepper / P4 闸门与截图基线 / P5 层级返回按钮 / P6 动画收口。**注意：本节表格里的 P0–P4 是「前端重设计」编号，与 16 号文档的「壳统一」P0–P6 不是一套，不要混读** | — |
| — | 上游 ATLAS 3.0.2 移植（2026-11-01） | ✅ 4 个「边陲世界」行星类型 + 第 11 行星槽位（含卫星规则 6 处适配与 `randrange(2,1)` 崩溃修复）、温度物理修正（开尔文计算 / 相对距离 / 2.7K 下限）、前端 9 处类型映射补全。i18n 与其余渲染内容绑在 3.0 explorer 体系上，不可移植 | — |

---

## 5. 渲染移植（路线 A 已到天花板）

| # | 任务 | 现状 | 量 |
|---|---|---|---|
| T-40 | 真机基准（低端 Android 帧时/p95） | ⬜ 需真手机 | 0.5d |
| T-41 | 恒星系：恒星 chip + `axial_tilt` 应用到替身球体 | ✅ **2026-11-01 完成**：`axial_tilt` 其实早在 `realistic3/SystemLayer.ts:234`（`mesh.rotation.z = tilt`）；本次补恒星 chip —— 单星显示「主星 · Blue Giant」，多星按 A/B/C 区分，琥珀色以区别行星的青色，且**不随选中态隐藏**（恒星是全场锚点，没有自己的详情页）。踩坑：`star.offset` 已是场景坐标，多加一次 `camera.position` 会把投影推出视锥 | 0.5d |
| T-42 | 异象：引力透镜（需 HDR 管线）、beacon 屏幕空间尺寸自适应 | ⬜ | 1.5d |
| — | 星系层 / 邻星层 | ❌ 明确不做（需浮动原点 + Worker LOD） | — |

---

## 6. 文档自身待收口

| # | 任务 | 现状 |
|---|---|---|
| T-50 | `cosmic-economy/README.md` 的「0111/0112 未做」段已过时（子交易所、券商、拆股复权、K 线归档、前端 K 线都已落） | 需改 |
| T-51 | `07-implementation-testing.md` §7 阶段 A/C 的「当前状态」注记停在 0112/0113 | 需改 |
| T-52 | `render-transplant/README.md` §11 速查里「恒星 0.3 人日（未做）」「超跳跃未做」与 §10.2 已完成的记录矛盾 | 需改 |
| T-53 | `13-operations-backend.md` 未写（T-07 的前置） | 缺文 |

---

## 7. 远期（PVPVE 路线，与上面不在同一时间尺度）

| 阶段 | 内容 | 门槛 |
|---|---|---|
| P0 | 单区域 300 RPS、账本 0 偏差（= 本清单 T-01~T-32） | 6–7 周 |
| P1 | 抽 `battle` 服务（Go + Agones），2–8 人 PvPvE 最小闭环 | 8–10 周 |
| P2 | 8 个微服务拆分 + Kafka/outbox 全量 | 10–12 周 |
| P3 | 玩家分片跨区多活，RPO ≤1min | 8–10 周 |
| P4 | 第三区域 + home 迁移（冻结 <30s） | 6–8 周 |
| P5 | 成本与容量优化 | 持续 |

---

## 8. 建议执行顺序

**已完成的一轮**（2026-10-28，见 T-01~T-06 / T-62~T-64）：航行权威 → `/ship` 与状态词表 → If-Match →
序列化统一 → 里程碑/遗迹/生产线/周目标上服务端 → CSS 瘦身。

**下一轮**（按依赖排序，不是按大小）：

```
✅ ① T-65a~g 外壳 7 件（665 行；EconomyShell 299 → 57 行）                     2.5d
✅ ② T-67a~g 面板（34 文件 / 5,799 行：6 主面板 + 26 子分区 + OrderTicket）     3d
✅ ③ T-66 backdrop-blur（91 → 计入约束 12，已进硬门禁）                        1d
✅ ④ 删 1s 轮询（`Utils/clock.tsx` 共享时钟；setInterval 46 → 31）              1d
✅ ⑤ 外壳接入全部游戏页（`ensureEconomyShell()` 三个入口 + launcher 挪位）      1d
✅ ⑦ T-13 逾期清算四步（lien / 扣押 / 拍卖 / 清偿分配，0134）                     3d
✅ ⑧ T-21 IPO 审批 + 集合竞价（后端独立，但要先扩 motion kind）              2.5d
✅ ⑨ T-32 冲正分录（0138；账本可撤销但不可改写，审计口径独立）                 3d
✅ ⑪ T-22 退市整理期 + 清算分配（0139）/ T-23 投资者保护基金（0140）            3.5d
✅ ⑫ T-69 `ui/Drawer` + `SpaceshipPanel` 换抽屉（B 组末项清零）                0.5d
   → ⑩ P2 8 页重排（要逐页动布局，必须单开一轮 + 截图对比）                     6d
```

**2026-10-29 晚这一轮做了什么**：T-32 冲正分录（见 §3.5）。选它而不是继续前端，是因为
`ops.py` 里那句「refunding a single trade … tracked as T-32」已经挂了三轮：运营面缺的
不是又一个仪表盘，而是**能动一笔错账而不伪造历史**。附带收益是复核 §3 时发现
T-12 / T-15b / T-19 / T-24 四行「⬜」与源码矛盾（都在，且都有测试或 job），已按实测改掉——
这类陈旧标记比缺功能更贵，会让人重做一遍。

同一轮顺手收掉一处分散：`_require_admin()` 原本在 5 个蓝图里各写一遍（字面相同的 4 份），
统一为 `deps.require_admin()`；`court`/`properties` 因为允许 `ccmc`/`central_bank` 保留各自版本。

**同夜第二轮（T-32 之后接着做）**：⑪ 的两项一次做完 —— T-22 退市整理期 + 清算分配（0139）、
T-23 投资者保护基金（0140）；⑩ 里唯一还能闭环的 B 组末项也收了（T-69 `ui/Drawer` +
`SpaceshipPanel` 改右侧抽屉）。**8 页重排仍未动**：它要逐页改布局 + 截图对比，
和上面三条不同性质，混在一起做只会把"能验证的改动"和"说不清有没有变差的改动"混成一锅。

**为什么是这个顺序**

- `ShellProvider`/`ShellRouter` 是**唯一有状态的**两个；先写它们，后面 5 个外壳组件才是"纯展示 + 用控件"，
  否则会重演现在 `SpaceshipPanel` 那种一个文件 900 行、状态、样式、数据三合一的写法。
- ~~`backdrop-blur` 放在搬面板之前~~ ——**实测结论相反，且无害**：`panels/` 34 个文件里 `backdrop-blur`
  出现 **0 次**（面板在 shell 内是实色版面，不是浮层），先搬面板并没有产生新的模糊债务。
  剩下 82 处全在旧 `Layouts/`、`Components/` 的浮动层里，T-66 因此变成一次**独立的遗留清理**，不再阻塞功能。
- 先搬 `MarketPanel` 而不是最小的面板：控件缺什么，只有最复杂的界面才能暴露出来。最小面板会把缺口藏起来。
  这条已兑现 —— `ui/` 为此补了 `Panel`/`Table`/`Modal`/`Toast`/`EmptyState`/`Skeleton`/`CandleChart`/`Sparkline` 8 个。

**为什么 T-13/T-21 可以并行**：两者都在 `server/**`，与前端零交叉，而且各自的表/状态机已核实存在
（`bank_loans.status` 三态、`property_encumbrances`、`council_motions`），不需要等前端。

---

## 9. 本地权威盘点（localStorage → 服务端）

> 2026-10-28 二次收口。判据不是"有没有 `_atlas*` 键"——**缓存是允许的**——而是
> 「这个值最终由谁决定」。下表逐键标注当前真源；`server` 表示服务端已是唯一写入方，
> 本地只剩渲染缓存。

| localStorage 键 | 内容 | 真源 | 备注 |
|---|---|---|---|
| `_atlasSpaceShip` | 资源 / 模块等级 / 外观 | ✅ server | `ServerBridge` 回写，写入走 `/ship/*`、`/planets/*/collect` |
| `_atlasHull` | 船体值 | ✅ server | 维修走 `/ship/repair`；**T-61 已把 `HullSystem.damage()` 改成 no-op + warn**，受损只由 `/combat/*` 结算后经 `applyServerHull` 回写 |
| `_atlasTech` | 科技解锁 | ✅ server | `/tech/<node>/unlock` |
| `_atlasSectors` | 星区许可 | ✅ server | `SectorSystem.applyServerUnlock` |
| `_atlasCodex` | 图鉴 | ✅ server | `/codex` + `/planets/<k>/visit` |
| `_atlasScans` / `_atlasSurface` | 冷却 / 地表次数 | ✅ server | `cooldowns` + `/surface/sample` |
| `_atlasStations` / `_atlasFleet` | 空间站 / 舰队 | ✅ server | `/assets`、`/stations/*`、`/fleet/*` |
| `_atlasContracts` | 合同 | ✅ server | `/contracts`、`/accept`、`/claim` |
| `_atlasTrade` | 行情 / 成交 | ✅ server | `/market`、`/market/buy|sell` |
| `_atlasNPC` | NPC 好感 | ✅ server | `npc_relations`、`/residents/<id>/meet` |
| `_atlasFactions` | 势力声望 | ✅ server | `faction_reputation` |
| `_atlasVouchers` | 改装券 | ✅ server | `player_flags.vouchers` |
| `_atlasWrecks` | 残骸 | ✅ server | `/wrecks`、`/salvage` |
| `_atlasCombat` | 当日已战 | ✅ server | `/combat/*`；挑战码 `/challenges/*` |
| `_atlasCraft` | 生产线冷却 | ✅ **server（0130）** | `GET /craft` + `POST /craft/<r>/run` |
| `_atlasWeekly` | 周目标 / 已领 | ✅ **server（0131）** | `GET /weekly` + `POST /weekly/claim` |
| `_atlasDailyChallenges` | 探索里程碑 | ✅ **server（0133）** | `GET /progress/exploration`；本地仅渲染缓存，不再扫 archive |
| `_atlasRelics` | 遗迹残片 | ✅ **server（0132）** | `GET /relics` + `POST /relics/<key>`，碎片由服务端哈希决定 |
| `_atlasIntel` | 情报有效期 | 🟡 本地缓存 | 购买扣费已走 `/system-intel`，缓存可接受 |
| `_atlasLocations` / `_atlasAllies` | 收藏 / 联盟 | 🟡 个人数据 | 联盟成员关系已在 `alliances`；收藏属本地偏好 |
| `atlasIntroSeen` / `atlasFactsShow` / `renderer` | 界面偏好 | ✅ 本地（设计如此） | 与玩法无关 |

**新增待办**

| # | 任务 | 说明 | 量 |
|---|---|---|---|
| T-61 | 移除 `HullSystem.damage()` 的本地写路径 | 改为只增 `applyServerHull`；战斗受损由 `/combat/*` 结算 | 0.3d |
| T-62 | `DailyChallenges` 与 `/tasks` 合并或降级为纯展示 | ✅ **已落地**（迁移 `0133_planet_visits`）：服务端按 distinct planet/system/sector 计里程碑，目标随账号年龄缩放；`GET /progress/exploration`；前端不再扫 `_atlasArchive*`（删了 90 行 pako 解码），文案改「探索里程碑 · 不发奖励」；4 项测试 | 0.5d |
| T-63 | 遗迹档案（`_atlasRelics`）上服务端 | ✅ **已落地**（迁移 `0132_relics`）：服务端 FNV-1a 定碎片（与前端 `hashText` 逐 key 对齐，测试钉了 3 个 key），集齐 5 段一次性发奖 + 1 券；`GET /relics` + `POST /relics/<key>`；4 项测试 | 1d |

---

## 10. 前端 P0 收尾（外壳 + 面板）· 主体已完成

> **状态（2026-10-29 实测）**：`ui/` **24 文件**（11 基础控件 + 8 结构/数据控件 + 5 支撑）、
> `Shell/` **7 件 665 行**、`panels/` **34 文件 5,799 行**（6 主面板 + 26 子分区 + `OrderTicket` + `_shared`），
> `global.css` 219 行。**P0 收尾已全部清零**：T-65（外壳）· T-66（blur 82→12）· T-67（面板）·
> T-71（1s 定时器收口）· T-72（Toast 自挂载）· T-74（外壳接入全部游戏页）均已完成。
> 下一阶段是 P2 页面重排与 B 组换壳（要动布局，建议单独一轮 + 截图对比）。

### 10.1 T-65 外壳 7 个（05 §5.1）· ✅ 已落地 2026-10-28

> 拆的是已有的 `economy/EconomyShell.tsx`（299 行 → **57 行**，现为 6 个面板的注册表），不是新建平行体系。
> `Shell/*` 7 个合计 **665 行**；含 `panels/PanelHost.tsx`（39 行）共 **704 行**。
> 顺手把 `ui/bits.tsx` 的 `Btn`/`Tabs`/`Field` 改成委托 `ui/Button`/`ui/Tabs`/`ui/Input`
> —— "ui/ 之外没有自造按钮"从此可执行；面板调用点一行未改。
> **闸门**：`check_frontend_gates.py` 新增 `Shell/**` 禁 `fetch(`（当前 0）。

| # | 组件 | 职责 | 前置 | 验收 |
|---|---|---|---|---|
| T-65a | `Shell/ShellProvider.tsx` | 唯一状态源 + 唯一 tick + 数据缓存 | ✅ 99 行：`useShell()` + 15s tick + 隐藏标签页不轮询 + 可见时立即补拉 | 无 | 组件里 `fetch(` 为 0（已进闸门） |
| T-65b | `Shell/ShellRouter.tsx` | hash ↔ view | ✅ 49 行：hash 即状态，无第二份 `useState`；close 用 `replaceState` 不回退一步 | T-65a | 三种入口同 view |
| T-65c | `Shell/AtlasShell.tsx` | 外壳容器四区 + launcher | ✅ 173 行：Provider → Router → 四区，组合顺序即依赖顺序 | T-65a/b | 内容区不抖动 |
| T-65d | `Shell/TopRail.tsx` | 顶栏 | ✅ 78 行：`ui/Status` + `ui/Money` + `ui/Button`，⌘K 入口 | T-65c | 只用 ui/ 控件 |
| T-65e | `Shell/NavRail.tsx` | 左侧导航 118px | ✅ 71 行：badge 由 snapshot 派生，不自己取数 | T-65c | 480px 无横向滚动 |
| T-65f | `Shell/StatusBar.tsx` | 底部状态带 30px | ✅ 38 行：只读 snapshot，零计算 | T-65c | 徽章只用 `ui/Status` |
| T-65g | `Shell/CommandPalette.tsx` | ⌘K 面板 | ✅ 157 行：⌘K/Ctrl+K、子串过滤、↑↓、Esc、点遮罩关闭 | T-65a | focus/Esc 正确 |

**硬约束**：外壳组件**不许自己发请求**。所有数据经 `ShellProvider`；这一条决定了后面 7 个面板好不好写。
反例就在眼前：`Components/SpaceshipPanel.tsx` 900+ 行，状态、样式、数据三合一，搬的时候要拆。

### 10.2 T-66 `backdrop-blur` 收口：91 → 计入约束 **12** · ✅ 已落地 2026-10-29

**现状（实测）**：`backdrop-blur` / `backdropFilter` 共 **91 处**，冻结区 + 半冻结区豁免后**计入约束 82 处**。

**已建（本轮）**：

- `tokens.css` 补上缺失的 `.surface-overlay` 令牌类（01 §5.2 规定、之前一直没落地）—— 这是"只允许 4 个宿主"的物质基础。
- `scripts/check_frontend_gates.py` 新增 blur 计数：按 07 §1 豁免 `3DComponents/**`、`3DEffects/**` 与
  `StarfieldWarpReveal` / `PlanetVisualizationUniversal` / `MultiverseTransitionCanvas`，其余计入约束（当前 82，目标 ≤12）。
- `AtlasShell` 拆壳时已顺手去掉全屏面板那条无意义的 `blur(6px)`（改为实色渐变，背后本就不透出）。

**结果（2026-10-29 实测）**

| 指标 | 开工前 | 现在 |
|---|---:|---:|
| `backdrop-blur` / `backdropFilter` 总处数 | 91 | **21** |
| 冻结区豁免后计入约束 | 82 | **12**（= 上限） |
| 3D 叠加层（已豁免） | 9 | 9 |

**做法**：把 blur 分三类处理，不一刀切。

1. **纯浪费 → 直接删**（48 处）：元素自身背景已 ≥90% 不透明（`bg-black/95`、`bg-black/90`、
   `bg-gradient` 按钮），或身后是静态渐变（`__faq__` 全页）。这类 blur 本来就没有可见效果，
   只是在付一次全屏 GPU pass 的钱。
2. **浮层宿主 → 用 `.surface-overlay`**（`ui/Modal`、`ui/Toast`、`CommandPalette`）：
   模糊本身是对的，但必须走令牌类，不再散落 Tailwind 工具类。
3. **3D 叠加层 → 保留并豁免**（9 处，`StarfieldWarpReveal` 6 + `PlanetVisualizationUniversal` 3）；
   剩余计入约束的 12 处全在 `*3DViewer*` / `RealisticSystemStage` 这类渲染层组件里。

**已进硬门禁**：`check_frontend_gates.py` 新增 `BLUR_BUDGET = 12`，超出直接 fail —— 从此不会再涨回去。

**没做**：`Components/CoordinateSelector.tsx` 里还有一段 60 行手写 DOM toast（含 createRoot 两次），
与 `ui/Toast` 重复 → 记为 **T-73**，等有截图对比再换。

### 10.3 T-67 面板搬迁（7 个 + 市场子分区）· ✅ 已落地 2026-10-28/29

| # | 面板 | 来源 | 注意 |
|---|---|---|---|
| T-67a | `panels/PanelHost.tsx` | 新写 | ✅ **已落地**（39 行）：keep-alive（`visibility` 切换，隐藏面板绝对定位零高、不占滚动高度）；**没有**懒加载与错误边界——面板都是同步 import，懒加载会把首屏抖动换回来，错误边界等真有异步面板再加 |
| T-67b | `panels/MarketPanel.tsx` | `economy/` 5 面板拆分 | ✅ **已落地 2026-10-28**：`panels/MarketPanel.tsx`（269）+ `panels/Market/` 10 个子分区（行情/委托/持仓/两融/发行/做市/交易所/公司行动/指数/券商）+ `OrderTicket.tsx`；写操作统一走 `panels/_shared/useWrite`。`economy/` 旧面板保留未删，`EconomyShell` 已把六个面板全部指向 `panels/*` |
| T-67c | `panels/AssetsPanel.tsx` | `assets` 蓝图 38 端点，目前 UI 只覆盖少数 | ✅ **已落地**：6 分区（概览/货币/持仓/产权/负债/排名）+ 空间站/舰队领取与任务；表格用 `ui/Table` |
| T-67d | `panels/BankPanel.tsx` | `bank` 28 端点，UI 覆盖 0 | ✅ **已落地**：7 分区（钱包/兑换/银行/存贷/存单/同业/保障）；同业与理赔审批只读 |
| T-67e | `panels/CompanyPanel.tsx` | `commerce` 20 端点，UI 覆盖 0 | ✅ **已落地**：列表 + 6 分区（概览/股权/治理/财报/关联交易/许可） |
| T-67f | `panels/LegalPanel.tsx` | `court` 15 + `insolvency` 7，UI 覆盖 0 | ✅ **已落地**：产权/诉讼/破产三区；合议庭按 panel_id 查询 |
| T-67g | `panels/LogPanel.tsx` | `/events` 事件流 | ✅ **已落地**：`?since=<seq>` 增量拉取 + 类型筛选 + 隐藏页暂停 |

**结构控件缺口**（05 §5.3，搬面板时会立刻需要）：`Panel`、`Table`、`Drawer`、`Modal`、`Toast`、`EmptyState`、`Skeleton`。
建议在 T-67b 期间按需建，不要预先全建 —— `Table` 的列宽策略只有真实数据能定。

> **T-67b 已按需建**：`ui/Panel`（56）、`ui/Table`（119）、`ui/EmptyState`（28）、`ui/Skeleton`（28）、
> `ui/Modal`（139，`.surface-overlay` 宿主）、`ui/Toast`（118，单例 `ToastHost` 挂在 `AtlasShell`）、
> `ui/CandleChart`（102）、`ui/Sparkline`（47）。`Drawer` 未建：本次三栏布局在 1280/768 两档用
> CSS 网格折叠（`.market-quotes`，tokens.css），下单票移到 K 线下方，没有必须用抽屉的交互。
> **blur 未减少**：本轮没有删旧浮层，`backdrop-blur` 仍是 91 处 / 计入约束 82；T-66 目标
>（≤12、只剩 4 个宿主）不变，留给后续按宿主逐个归并。
>
> **T-67c–g 落地后的覆盖口径**：普通玩家可用的读写面已接完；以下 admin/机构专属端点**有意不做入口**：
> 产权登记、拍卖关闭、法院开庭/冻结/承认裁决、破产清算、反垄断快照、许可待审/审批、同业挂单/接受/还款、关系费。
> 合议庭与破产案件没有列表端点，分别用 `panel_id` / `case_id` 查询。

**T-67 收尾的遗留（新增）**

| # | 任务 | 现状 | 量 |
|---|---|---|---|
| T-68 | 删除 `economy/` 旧面板死代码 | ✅ **已落地 2026-10-29**：`AssetsPanel` 108 / `BankPanel` 261 / `LogPanel` 105 / `MarketPanel` 348 = **822 行已删**，只留 `EconomyShell.tsx`（57 行，6 个面板的注册表） | 0.3d |
| T-69 | `ui/Drawer.tsx` | ✅ **已落地 2026-10-29**：`ui/Drawer` 是**纯展示**的侧栏（不 portal、不持状态）—— 宿主通常自己管 open 与 click-outside，portal 会让宿主的 `ref.contains(target)` 判断失效（`SpaceshipPanel` 正好是这种宿主）。用 `--atlas-deep` 实色，不新增 blur | 0.5d |
| T-70 | 删除 E 组 5 个死文件（05 §6.1） | ✅ **已落地 2026-10-29**：904 行已删（`MatrixTextReveal` 486 / `PlanetVisualization` 194 / `SystemVisualization` 118 / `StorageDebug` 60 / `NavigationForm` 46），并清掉 `__planet__.tsx` 里那条未使用的 import；tsc 0 错 | 0.2d |
| T-71 | 1s 定时器收口到共享时钟 | ✅ **已落地**：新增 `Utils/clock.tsx`（单例，首个订阅者启动、最后一个退订停止、`visibilityState !== visible` 时跳过 tick）；8 个组件（`Contract/Fabricator/Scan/Siege/ResourceCollectionButton/GalaxyInfo/PlanetInfo/SystemInfo`）+ `__main__` 宇宙年龄全部改接；`UniverseDetection` 的 4 处 1s 轮询直接删（`#data-universe-config` 是服务端静态元素）。全站 `setInterval` 46 → **31** | 1d |
| T-72 | Toast 宿主改自挂载 | ✅ **已落地**：原先 `<ToastHost/>` 只在 `AtlasShell` 里，非经济外壳的 7 个 Layout 调 `toast()` 时**没有任何监听者**（消息直接丢失）。改为首次 `toast()` 时挂到 `document.body`，并移掉 `AtlasShell` 里的重复实例 | 0.3d |
| T-74 | 经济外壳接入全部游戏页 | ✅ **已落地 2026-10-29**：`ensureEconomyShell()` 在 `MountPoints/{__galaxy__,__system__,__planet__}.ts` 各调一次，`document.body` 挂载；faq/multiverse/error/onboarding 有意不挂。**顺手修了个真 bug**：launcher 原在 `bottom:18 right:18`，被 `SpaceshipPanel`（`bottom-6 right-6`，z-50 vs z-40）压住一半点不到，已挪到 `top:88 right:18` | 1d |
| T-73 | `CoordinateSelector` 的手写 DOM toast | ✅ **2026-11-01 随组件一并消失**：`CoordinateSelector` 在首页重做时已删除（`16 §4`），该 toast 不再存在 | **保留动画，修了真 bug（2026-10-29）**：那张卡片每次随机跳跃都会 **leak 两个 React root + 一个永不移除的 `<div>`**（POST 失败/页面不跳走时一直挂在 body 上）。已补 `iconRoot.unmount()` / `contentRoot.unmount()` / `toast.remove()`。**不替换成 `toast()`**：四段式变形（坐标→星系→恒星系→行星）本身就是信息呈现，换成 4 条堆叠 toast 更差 | 0.5d |
| T-75 | `animations.css` 缺 `prefers-reduced-motion` | ✅ **已落地 2026-10-29**：`components.css` 早就把自己的装饰性循环关掉了，但 `animations.css` 里 27 个 `animate-*` 和 Tailwind 的 `pulse/ping/bounce` 完全没有降级。新增规则：无限循环停止、`animate-spin` 放慢到 2.4s（冻住的 spinner 等于"卡死"）、`scroll-behavior: auto` | 0.3d |
| T-81 | `SpaceshipPanel` 拆分 | ✅ **已落地 2026-10-29**：**907 → 224 行**。两刀：① 逻辑层（15 个 `useState` + 6 个 effect + 5 个 handler）→ `spaceship/useSpaceshipPanel.ts`；② 三个 tab 的标记 → `spaceship/{StatsTab,ShipTab,SavedTab}.tsx`（175/147/247），各自只声明自己读的字段（`Pick<PanelBag, …>`），父组件 `<XTab {...panel} />`。**标记逐字搬运，未改一行**。顺手发现 `currentLocation` 这个 prop 从声明起就没被读过（6 个调用点白传），已从签名移除。总行数增加（793）是拆分文件的头注释成本，换来的是每个文件单一职责 | 1d |
| T-82 | `formatResource` 去重 | ✅ **已落地**：`FuelBars` / `ResourceStatusBar` / 布局各有一份**逐字相同**的实现 → 抽到 `Utils/format.ts`（含 `formatCosmicTime`）；grep 复核「全仓 1 处定义」 | 0.2d |
| T-80 | **首页布局重构（`__main__.tsx`）** | ✅ **已落地 2026-10-29**：462 → **152 行**，只留组合顺序。拆出 `Layouts/main/`：`useUniverseBootstrap`（87，存储迁移/ServerBridge/配置/首次入场）、`useCosmicClock`（58，宇宙年龄走共享时钟）、`useTravelCost`（66，燃料报价，**改为订阅 `resources_updated` 取代 5s 轮询**）、`useViewerStage`（107，两层切换状态机 + `window.setRandomLocationActive` 兼容桥）、`HeroPanel`（179，两层叠放）、`format`（34）。**渲染结果逐像素不变**（改前/改后截图对比） | 1d |
| T-77 | `Header` 换壳（B 组） | ✅ **已落地 2026-10-29**：改为令牌化仪器条（`--atlas-deep` + 发丝线 + mono 小字），内容不变；去掉 3 个无限循环。**顺手修了隐藏前提**：`tokens.css` 原来只由 `AtlasShell` 引入，非经济外壳的 5 个页面没有令牌 → Header 自己引入，否则 `var(--atlas-*)` 全失效、内边距变 0（FAQ 页实测被压扁）。登录按钮经 `trailing` 插槽进顶栏，不再与「多元宇宙在线」重叠 | 1d |
| T-78 | `ServerAuthPanel` 换 `ui/Modal` | ✅ **已落地**：原来 `useState(!loggedIn)`，**每个游客一进首页就被登录框盖住坐标控件**；改为默认关闭 + `ui/Modal`（Esc/焦点陷阱/`.surface-overlay`），写操作仍由 `atlas:login-required` 强制弹出 | 0.5d |
| T-79 | 游客不该被 401 打断 | ✅ **已落地**：`ServerApi.ensureSession()` 原来**任何请求**（含后台 `/state` 轮询）都 dispatch `atlas:login-required` —— 这才是登录框反复弹的真正来源。改为 `ensureSession(notify)`，只有非 GET 才提示；`ShellProvider` 对 guest 直接跳过轮询（否则每分钟 4 次 401） | 0.5d |
| T-76 | 右下角浮层堆叠契约 | ✅ **已落地 2026-10-29**：`SpaceshipPanel`（bottom-6）与 `TaskPanel`（bottom-4）**完全重叠**，此前互相遮挡。约定自下而上 `SpaceshipPanel → TreasureChest(24) → TaskPanel(44)`，并在代码里写死注释。`DidYouKnow` 的容器改 `pointer-events-none`（大于 56px 的透明区域原本在吞点击），去掉两个纯装饰的无限循环 | 0.3d |
| T-79b | `PlanetInfo` 余下三块 | ✅ **已落地 2026-10-29**：`planet/PlanetOwnership`（归属卡 + 游客提示，54）、`planet/PlanetMoonCard`（月球卡，101，`MoonData` 类型随组件走）、`planet/PlanetTechData`（技术数据六格，48）；`PlanetInfo` 432 → **270**，顺手删掉 3 个零引用的 import（`PeriodicElement` / `AreciboMessage` / 四个 formatter，历史残留） | 0.5d |
| T-83 | `FuelBars` 拆分 + 去掉 5s 轮询 | ✅ **已落地 2026-10-29**：306 → **76**（容器）+ `fuel/FuelBar.tsx`（116，单段填充与悬浮层，标记逐字搬）+ `fuel/resourceConfig.tsx`（54，12 种资源；死字段 `color` 删除）。轮询改订阅：`Hooks/useShipResources.ts` 统一 wallet + 容量，`UnifiedSpaceshipStorage.upgradeShip/applyServerLevel` 补发 `resources_updated`（这两个路径原来不发事件，才是 5s 轮询存在的唯一理由）+ 跨标签页 `storage` 监听 | 0.5d |
| T-84 | 删除死文件 `Components/ResourceStatusBar.tsx` | ✅ **已落地**：127 行，全仓 0 引用（连 import 都没有）；内部还有 `isExpanded` 永不变、`efficiency`/`getTravelCostPreview` 算完不用 | 0.1d |
| T-85 | `LifeAreciboTranslator` 拆分（4,515 行） | ✅ **已落地 2026-10-29**：→ **113 行编排 + 8 模块**（primitives 130 / data 929 / sections 903 / structures 495 / figures 468·854·61·475）。脚本按花括号匹配逐字搬运、`this.foo(` 改 `foo(`、导入按调用关系生成；**22 组指纹逐位一致**（`npm run check:arecibo`，golden 在 `scripts/arecibo_golden.txt`） | 1d |
| T-86 | `ExplorationLab` 分组 + `VersionFooter` 图标分家 | ✅ **已落地**：12 个标签从单排改成「勘探/经营/成长/势力」四簇（125 → 150，768px 不再挤成一排）；`VersionFooter` 115 → 91 + `footer/icons.tsx` 48，删掉声明后从未被读的 `showBadge` prop | 0.3d |

### 10.4 验收命令（每轮跑）

```bash
# 类型 / 冒烟 / 构建
npx tsc --noEmit
node tools/frontend_smoke.mjs          # 当前 34 项
npx vite build --outDir dist_check --emptyOutDir   # 直接 build 到 dist 会被 safe-delete 拦（要清空 50 个文件）

# 前端闸门（一次跑完 6 项，blur 与文件体积已内置）
python scripts/check_frontend_gates.py
# 实测 2026-10-30：v1 直连 0 / Shell 内 fetch 0 / blur 11(约束 2) / 旧接口 10 全在冻结清单 / 循环动画 45 / 最大非冻结文件 arecibo/data.ts 930 行

# Arecibo 生成器指纹（拆分/改绘制后必跑）
npm run check:arecibo                  # 22 组 SHA-1 与 scripts/arecibo_golden.txt 比对
```

**Definition of Done（P0 收尾）**

- [x] `Shell/` 7 个（665 行）+ `panels/` 7 个（34 文件 / 5,799 行）
- [x] `ShellProvider` 是唯一数据入口（`Shell/**` 内 `fetch(` = 0，已进闸门）
- [x] `ui/` 之外没有自造按钮/输入框（`bits.tsx` 已委托 `ui/Button`/`ui/Tabs`/`ui/Input`）
- [x] 四条命令全绿（tsc 0 错 / 冒烟 34/34 / `vite build` / 闸门 6 项）
- [x] `backdrop-blur` ≤12 且只剩 4 个宿主 —— **11 处 / 计入约束 2**（T-66 已进硬门禁；换肤后进一步清零装饰性模糊）
- [x] 8 个 Layout 接入（T-74）+ 删 1s 轮询（T-71）
- [x] B 组 12 个换壳清零（末项 `SpaceshipPanel`→`ui/Drawer`，T-69 + 本轮）
- [ ] 8 页重排（P2，未开始）

---

## 11. 视觉基线（做布局改动前必跑）

P2 / B 组剩下的几项都会改页面结构，`tsc` 和冒烟只能保证"不报错"，保证不了"没漏东西"。
2026-10-29 建立了一条可复现的基线流程：

```bash
# 1) 起完整前端（不是 server/run.py —— 那个只有 API，页面全部 404）
ATLAS_PORT=8080 python __main__.py

# 2) Edge headless 截图（仓库里没有 playwright/puppeteer，但 Edge 自带 --screenshot）
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --headless=new --disable-gpu --hide-scrollbars --no-first-run \
  --user-data-dir=/d/mni/.workbuddy/edge-profile \
  --window-size=1440,900 --virtual-time-budget=10000 \
  --screenshot=shots/faq.png "http://127.0.0.1:8080/universe-faq"
```

**已拍的基线**（`D://mni//.workbuddy//shots//`）：`00-home`（首页，停在超空间入场动画里，正常）·
`01-faq` · `02-galaxy`（实为主坐标页，带服务端登录弹窗）· `03-multiverse` · `04-onboarding`。
**改版后**：`05-home-after`（登录框已去掉）· `07-home-v3` / `09-home`（登录按钮收进顶栏）· `08-faq-v2` / `10-faq`。

**注意**：

- `/planet/<name>` 与 `/system/<n>` 需要会话里已有坐标，直接访问会 302 回 `/galaxy`；
  要截这两页得先用 `curl -c cookies` 走一遍 `/navigate`。
- 首页首帧只有星空是**预期行为**（`StarfieldWarpReveal` 入场动画），不是渲染失败。
- 截图里能直接看到两个待办：顶栏还是旧 `Header`（`登录/注册` + `量子导航就绪`），
  主坐标页默认弹出 `ServerAuthPanel` 登录框挡住内容。
