# 09 · 状态一致性、语境与信息桥

> 问题不是"界面好不好看"，而是**同一个事实在不同界面是不是同一个东西**。
> 本文件定义三层架构：**共享容器 → 语境化面板 → 跨系统信息桥**，
> 以及一套强制复用的**状态词表**。

---

## 1. 先看现状：状态是"各算各的"

同一个"燃料不足"，在现有代码里至少有 4 个独立真源：

| 位置 | 真源 | 刷新 |
|---|---|---|
| `Components/FuelBars.tsx` | 自己 `useState` 12 种资源 | 5s 轮询 + `ResourceEventManager` |
| `Layouts/__main__.tsx` | 自己算 `travelCost` / `canAfford` | 5s 轮询 |
| `Utils/SpaceshipTravelCosts.tsx` | `SpaceshipTravelManager.executeTravel` 内再判一次 | 调用时 |
| `Utils/SpaceshipResources.tsx` | `localStorage` 原始值 | 事件驱动 |

后果：

1. 三个地方**可能显示不同的数值**（不同帧的真相）；
2. "不够"的视觉表达各写一遍：有的 `text-red-400`，有的 `bg-red-500/20`，有的 `animate-pulse`；
3. 战斗里护盾归零、舰队卡片里还显示"正常"，玩家要自己去对；
4. 加一个新状态（比如"追保"）需要改 N 个组件。

**这不是样式问题，是数据归属问题。** 换皮解决不了。

---

## 2. 三层架构

```
┌─ 共享容器 Shell ────────────────────────────────────────────────┐
│  唯一状态源 · 唯一 tick · 唯一格式化 · 唯一状态词表                │
│  ┌─ 语境化面板（同一 ViewModel 的三种投影）───────────────────┐   │
│  │   Explore（慢而疏）  Combat（快而简）  Operate（密而序）    │   │
│  └───────────────────────────────────────────────────────────┘   │
│  ┌─ 跨系统信息桥 ─────────────────────────────────────────────┐  │
│  │  statusBus · 通知中心 · 引用式徽章（同一个 id）             │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

一句话：**外壳不变，只换工作区**。玩家换的是"工作模式"，不是"换了个网站"。

### 2.1 共享容器（`ShellProvider`）

| 职责 | 规则 |
|---|---|
| 状态归属 | 所有跨界面共享的状态（资源、舰船、债务、待办、连接）**只在这里** |
| 时间来源 | **全站唯一 `setInterval(1000)`**；任何组件不得自建定时器 |
| 数值格式化 | `Money` / `Number` / `Duration` / `Coordinate` 四个格式化器，唯一实现 |
| 状态词表 | `STATUS` 表（见 §3），唯一实现 |
| 缓存 | `Map<endpoint, {data, at}>`，60s；写操作后按 key 失效 |
| 事件 | 对外只暴露 `useShell()`、`useResource()`、`useStatus()` 三个 hook |

> **修订（v1.4）**：在「服务器权威」路线下（见 [11](11-server-authority.md)），
> `ShellProvider` 的职责从「状态归属」升级为「**服务端基线 + 待确认意图队列**的合成器」；
> `statusId` 的**语义与 severity 由服务端给**，前端只负责渲染成颜色 + 形状。
> 因此本文 §3 的 `STATUS` 表在前端退化为「**severity → 视觉**」映射，不再持有判定条件。

> 现状 `Utils/SpaceshipResources`、`UnifiedSpaceshipStorage`、`ResourceEventManager` 的存储与事件逻辑
> **全部上移到 `ShellProvider`**，组件只读不写（写必须走 shell 的 action）。

### 2.2 语境化面板（同一 ViewModel 的三种投影）

同一个 `ShipViewModel`，三种语境三种投影，**字段不变，只变密度与节奏**：

| | **探索 Explore** | **战斗 Combat** | **经营 Operate** |
|---|---|---|---|
| 心智 | 慢慢看，别打扰 | 现在就要决定 | 一次处理一批 |
| 一屏信息量 | 3–5 项 | **2–3 项**（只留活命相关） | 20–60 行表格 |
| 布局 | 单列 + 大留白，内容居中 | 固定 HUD 安全区（四角），中央留空 | 多栏网格 + 可停靠侧栏 |
| 主字号 | 14 / 20 / 28 | **12 / 16 / 20**（远读，字号不够大但对比要够） | 12 / 13 / 16 |
| 行高 | 1.6 | 1.3 | 1.45 |
| 动效时长 | `--dur-slow` 400ms，允许叙事层 | `--dur-instant` 80–160ms，**反馈优先** | `--dur-base` 240ms |
| 动效类型 | 入场、氛围 | 命中闪、受击抖、数值跳 | 过渡、展开 |
| 数据刷新 | 事件驱动，低频（≥ 30s） | 帧级 / 200ms | 手动 + 15s（行情） |
| 打断策略 | **不打断**，状态进通知中心 | 仅 `critical` 打断（全屏短提示） | **队列化**，绝不弹窗 |
| 面板切换 | 保留 3D 上下文 | 隐藏一切非战斗 UI | 面板常驻，可多开 |

实现方式：不用三套组件，用**密度档位**：

```css
[data-context="explore"] { --density: 1;    --gap: 24px; --row-h: 40px; --font-base: 14px; }
[data-context="combat"]  { --density: .8;   --gap: 12px; --row-h: 32px; --font-base: 12px; }
[data-context="operate"] { --density: 1.15; --gap: 8px;  --row-h: 34px; --font-base: 12.5px; }
```

`data-context` 挂在 `.content` 上，由路由/面板决定。组件内部只用 `var(--gap)` / `var(--row-h)`，
**不写死 px**。这样"密度差异化"是一个属性切换，不是三份代码。

### 2.3 跨系统信息桥

三条规则：

1. **一个事实，一个 id，多处引用**。任何界面显示"护盾离线"，引用的都是同一个
   `statusId = "shield.offline"`，不是各自判断 `shield <= 0`。
2. **通知中心是状态的聚合视图，不是另一个真源**。徽章计数 = `statusBus` 里未确认条数。
3. **信息桥只传事实与引用，不传文案**。文案在词表里，桥里只有 `{statusId, at, payload}`。

```
业务事件 ──► statusBus.publish({id:"shield.offline", at, payload:{shield:0}})
                 │
    ┌────────────┼─────────────────────────┐
    ▼            ▼                         ▼
 StatusBar   战斗 HUD                通知中心 / #/log
 (常驻一条)   (中央警示)              (历史 + 待办计数)
```

禁止：任何面板自己 `if (hp / max < 0.3) showRedBadge()`。必须 `if (hasStatus("hull.damaged"))`。

---

## 3. 状态词表（唯一真源）

五个严重度，**颜色 + 形状双编码**（色盲/低对比屏可用）：

| severity | 色 token | 形状 | 含义 | 例子 |
|---|---|---|---|---|
| `nominal` | `--down` `#3FD68C` | ● 圆 | 正常运行 | 自动采集运行中 |
| `caution` | `--warn` `#FFB020` | ▲ 三角 | 需关注，不影响操作 | 燃料不足、货舱将满 |
| `degraded` | `--relic` `#E8A33D` | ◆ 菱形 | 能力下降 | 船体受损、做市已暂停 |
| `critical` | `--danger` `#FF4D4F` | ⬢ 六边 | 已失效，需立即处理 | **护盾离线**、追保 |
| `offline` | `--n-600` `#4E6175` | ▨ 斜框 | 系统关闭 | 主动关闭的模块 |

### 3.1 首批状态键（前端定义，映射现有字段）

| statusId | 中文（唯一文案） | severity | 数据来源 |
|---|---|---|---|
| `shield.offline` | 护盾离线 | critical | `ship.shield <= 0` |
| `hull.damaged` | 船体受损 {pct}% | degraded | `hull / hull_max` |
| `fuel.low` | 燃料不足 | caution | 三种燃料任一 < 单次最远航程所需 |
| `cargo.full` | 货舱已满 | caution | `used / cap >= 0.95` |
| `task.running` | 自动采集运行中 | nominal | `fleet_task != null` |
| `market.margin_call` | 追保通知 | critical | `margin_ratio < 1.3` |
| `market.mm_paused` | 做市已暂停 | degraded | `mm_program.status == "paused"` |
| `property.tax_due` | 持有税 {days} 天到期 | caution | `tax_bill.due_at` |
| `court.deadline` | 应诉剩余 {hh:mm} | critical | `case.deadline` |
| `contract.expiring` | 合同 {hh}h 后到期 | caution | `contract.expires_at` |
| `company.no_quorum` | 股东会未达法定人数 | degraded | `meeting.votes < quorum` |

> 表里出现的 `{pct}` `{days}` 是**文案占位符**，由词表统一插值。
> 组件不得自己拼字符串，否则同一状态会出现"船体 62%"和"船体受损 62%"两种写法。

### 3.2 唯一组件 `<Status statusId size dense />`

```tsx
// ui/Status.tsx —— 全站唯一允许渲染状态徽章的组件
<Status statusId="shield.offline" size="sm" />        // ⬢ 护盾离线
<Status statusId="hull.damaged" payload={{pct:62}} /> // ◆ 船体受损 62%
```

| 参数 | 值 |
|---|---|
| `size` | `xs`(18px) / `sm`(20px) / `md`(24px) |
| `dense` | 战斗 HUD 用，去掉文案只留图标 + `title` |
| `onlyDot` | 表格行内用，只留 8px 形状点 |

**禁止**：
- 任何地方直接写 `bg-red-500/20` / `text-red-400` 表达状态；
- 复制粘贴徽章样式；
- 自己定义第二个 severity 集合；
- 用颜色单独表达状态（必须同时有形状）。

---

## 4. 一致性验收（可自动化）

| # | 检查 | 方式 |
|---|---|---|
| 1 | 状态色只来自 token | `grep -rn "red-\(400\|500\)\|#FF4D4F" js --include=*.tsx \| grep -v ui/Status` 为空 |
| 2 | 每个 `statusId` 有且仅有一份文案 | 单元测试遍历词表，断言无重复 label |
| 3 | 同一状态三处同色 | 注入 `shield:0` → 截图 StatusBar / 飞船改装 / 通知中心，取色必须一致 |
| 4 | 无面板自建定时器 | `grep -c "setInterval" js/panels` = 0（shell 除外） |
| 5 | 语境密度切换无布局崩坏 | 同一页面切 `data-context` 三档，无水平溢出 |
| 6 | 形状可辨 | 灰度截图下仍可区分 5 种 severity |

### 4.1 状态注入测试（建议纳入 `npm run test:frontend`）

```js
// tools/frontend_smoke.mjs 里加一条
// 把 ship.shield 置 0，断言三处出现同一文案
assert(badgeIn("statusbar").includes("护盾离线"));
assert(badgeIn("shipyard").includes("护盾离线"));
assert(badgeIn("notify").includes("护盾离线"));
```

---

## 5. 与其它分册的关系

| 分册 | 关系 |
|---|---|
| [01](01-design-system.md) | 提供 severity 用的四个语义色；本文件不改色值，只规定用法 |
| [02](02-shell-and-ia.md) | `ShellProvider` 是本文件 §2.1 的落地位置；NavRail 徽章读 `statusBus` 计数 |
| [04](04-motion-system.md) | §2.2 的三种节奏对应 04 的 `--dur-*` 标度，不新增时长 |
| [06](06-economy-surfaces.md) | `market.mm_paused` / `market.margin_call` / `property.tax_due` 三个状态来自经济面板 |
| [07](07-frozen-contract.md) | 状态全部由现有响应字段派生，**不新增接口**；派生逻辑在 `ShellProvider` 的 selector 里 |

---

## 6. 落地顺序（插入到 08 的 P1 与 P3 之间）

| 步骤 | 内容 | 依赖 |
|---|---|---|
| 1 | 建 `STATUS` 词表 + `ui/Status.tsx`（纯展示，可先用 mock） | P0 |
| 2 | `ShellProvider` 加 `statusBus` + selector（从现有字段派生 11 个键） | P1 |
| 3 | `StatusBar` 接入（常驻 2 条：最严重的两个） | P1 |
| 4 | 通知中心 `#/log` 的 status 聚合视图 | P3 |
| 5 | 各面板改用 `<Status>`，删掉自有徽章样式 | P3–P4 |
| 6 | 状态注入测试 | P4 |

工作量：约 **2 人日**（不计入原 25 人日，建议作为 P2.5 独立排期）。
