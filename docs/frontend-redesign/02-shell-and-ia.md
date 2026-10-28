# 02 · 应用外壳与信息架构

> 核心问题：8 个页面各自裸渲染，没有共享外壳；行星页 12 个平铺标签；经济系统无入口。
> 解法：引入 `AtlasShell`，用**客户端视图层**（hash）承载所有新增界面，**不新增任何后端路由**。

---

## 1. 约束推演（为什么用 hash 而不是新路由）

后端只暴露 5 个可渲染路由：`/`、`/galaxy[/n]`、`/system/<i>`、`/planet/<n>`、`/multiverse`。
「只动前端」= 不能加 `@app.route`。因此新增界面（资产/市场/银行/公司/法务）只能：

| 方案 | 可行性 | 结论 |
|---|---|---|
| 新增 Flask 路由 | ❌ 违反约束 | 否 |
| 单页应用改造（react-router 接管全部） | ❌ 需要后端 fallback 到 index.html，且破坏 `/planet/<name>` 的服务端数据岛 | 否 |
| **页面内视图层 + hash 路由** | ✅ 纯前端，URL 可分享，浏览器前进/后退可用 | **采用** |

### 1.1 视图模型

```ts
// Utils/ShellRouter.tsx
type ShellView =
  | { kind: "route" }                        // 当前 Flask 页面本身（默认）
  | { kind: "panel"; id: PanelId };          // 页面内浮层视图

type PanelId =
  | "assets"      // 资产总览（货币钱包 + 资源 + 产权 + 持仓）
  | "market"      // 市场（股票 / 指数 / 做市 / 行星市场聚合）
  | "bank"        // 银行（账户 / 存贷 / 兑换 / 存单 / 同业 / 保险）
  | "company"     // 公司（注册 / 股权 / 章程 / 股东会 / 关联交易）
  | "legal"       // 法务（诉讼 / 合议庭 / 执行 / 破产 / 跨区承认）
  | "log";        // 事件流（统一活动日志）
```

URL 形态：

```
/planet/kepler_442b            → { kind: "route" }                            行星页
/planet/kepler_442b#/bank      → { kind: "panel", id: "bank" }                银行浮层
/planet/kepler_442b#/market?tab=orderbook&ticker=ATL
/galaxy/2#/assets
```

- hash 变化 → `hashchange` 事件 → 更新 `ShellContext`；
- 浮层打开时页面本身保持挂载（**3D 渲染不卸载**，这是硬要求，见 07 §1.3）；
- 关闭浮层 → `history.back()` 或 `location.hash = ""`；
- 浮层内容 100% 由 `/api/v1/*` 现有端点驱动。

> 为什么不把经济界面塞进 `/planet/<name>` 的现有 DOM？因为它们与"当前行星"无关（银行、公司、法院是全局的）。
> 浮层形态让玩家在**任何页面**都能打开同一套经济界面，且不打断 3D 场景。

---

## 2. 外壳结构

```
┌──────────────────────────────────────────────────────────────────────┐
│ TopRail  56px                                                        │
│ ┌───┐ 面包屑：星系 › 系统 › 行星            ⌘K 搜索   钱包 12.4K  ● 在线 │
├────┬─────────────────────────────────────────────────────────────────┤
│Nav │  Content Area（页面本身，保持现状挂载）                            │
│Rail│                                                                  │
│64  │   ┌──────────────────────────────┐        ┌─────────────────┐  │
│    │   │  页面主面板 .surface-plate    │        │ ContextDrawer   │  │
│ 6  │   │                              │        │ 400px（可选）   │  │
│ 项 │   └──────────────────────────────┘        └─────────────────┘  │
├────┴─────────────────────────────────────────────────────────────────┤
│ StatusBar  32px   资源 ▮▮▮▮│ 反物质 1.2K  115 340  氘 88  │ 连接 42ms │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.1 `TopRail`（h = 56，`z-rail`）

| 区 | 内容 |
|---|---|
| 左 240px | Logo（24px）+ 产品名 `ATLAS`（`text-micro` mono tracking） |
| 中 | 面包屑，最多 4 级，用 `›` 分隔，末级不可点且 `text-n-950`。超 4 级中间折叠为 `…` |
| 右 | ① 命令面板触发（`⌘K` / `Ctrl K`，图标 + 快捷键提示）② 钱包速览（主币余额，点击开 `#/assets`）③ 连接状态点（`down`/`warn`/`danger` 三态，hover 显示延迟与 tick 时间）④ 账户菜单 |

**删除**：现状 Header 里"多元宇宙在线 / 量子导航就绪"两个装饰文案。
`aurora` 语义（远程宇宙）改为：连接状态点旁一个 `aurora` 小徽章 + tooltip，不再常驻大字。

### 2.2 `NavRail`（w = 64 收起 / 232 展开，`z-rail`）

6 个一级入口，顺序固定（按使用频率）：

| # | id | 图标 | 中文 | 落到 |
|---|---|---|---|---|
| 1 | `nav` | 罗盘 | 导航 | 当前 `/` 或当前页面 |
| 2 | `assets` | 多层方块 | 资产 | `#/assets` |
| 3 | `market` | 折线 | 市场 | `#/market` |
| 4 | `bank` | 柱状金库 | 银行 | `#/bank` |
| 5 | `company` | 建筑 | 公司 | `#/company` |
| 6 | `legal` | 天平 | 法务 | `#/legal` |

交互：

- 收起态 64px：图标 20px 居中，`title` + `aria-label`；选中项左侧 2px `signal` 竖条 + `signal-weak` 底。
- hover 或 focus 时**展开为 232px**（`width` 过渡 240ms `ease-out`），显示图标 + 文字 + 可选徽章（如"3 笔待处理"）。
- 展开**不推挤内容区**（`position: fixed`，内容区 `padding-left` 固定 64px）。避免布局抖动。
- 移动端（< 768）：`NavRail` 转为**底部标签栏** h=56，只显示 5 项（`nav / assets / market / bank / more`），
  `company` 与 `legal` 收进 `more` 弹出的 sheet。

### 2.3 `StatusBar`（h = 32，`z-rail`）

替代现状 `FuelBars` 的"顶部 1px 条 hover 展开 12 格"。

| 区 | 内容 |
|---|---|
| 左 | 3 个主资源：反物质 / 元素115 / 氘。每个 = 图标 12px + `text-micro` 名称 + `text-small` mono 数值 + 2px 高的容量条 |
| 中 | 保留「揭示」手感：hover 任一资源 → 上方浮出 `surface-overlay` 迷你条，显示 12 种资源的完整列表（仍是一行 12 格，但不占位） |
| 右 | 连接延迟（mono，> 200ms 变 `warn`）、宇宙时钟（mono，`YYYY.MM.DD HH:MM:SS` 本地 tick）、页面版本号 |

**为什么迁移**：顶部 1px 条在触屏上完全不可发现（现状靠 4 秒自动隐藏 + 右下角 24px 的 `+/−` 按钮补救）；
底部状态栏是仪表台的天然位置，且与 `NavRail` 底部对齐。

**性能**：12 种资源由**一个 1s tick**（统一在 `ShellProvider` 里）驱动，`FuelBars` 自带的 5s 轮询删除。
显示值用 `tabular-nums`，避免数字跳动引起宽度变化。

### 2.4 `ContextDrawer`（w = 400 / 移动端全屏，`z-drawer`）

用途：不打断主视图的详情/确认。

- 触发：点击列表行、点击 3D 上的标签、点击"查看详情"。
- 内容：标题 + 副标题 + 分段内容 + 底部操作条（主操作 `signal` 实心，次操作描边）。
- 关闭：`ESC`、点遮罩、`×`。带 `role="dialog"` + focus trap。
- 同一时刻**只允许一个** Drawer 实例。

### 2.5 `CommandPalette`（`⌘K` / `Ctrl K`，`z-modal`）

- 输入即过滤：页面跳转、面板跳转、股票代码、行星名、动作（"存款""下单""起诉"）。
- 数据源：静态路由表 + 本地缓存的股票列表/行星列表（不额外发请求）。
- 键盘：`↑↓` 选择、`Enter` 执行、`Esc` 关闭。默认显示"最近访问 5 项"。

这是解决"12 标签找不到功能"的兜底：**任何功能都能靠搜索直达**。

---

## 3. 信息架构（新旧对照）

### 3.1 一级结构

```
旧：8 个互不相干的页面，行星页承载全部功能
新：
  Route 层（Flask，不变）               Panel 层（前端，新增）
  ├── /              导航控制台          ├── #/assets   资产
  ├── /galaxy        星图              ├── #/market   市场
  ├── /system/<i>    恒星系            ├── #/bank     银行
  ├── /planet/<n>    行星              ├── #/company  公司
  ├── /multiverse    多元宇宙           ├── #/legal    法务
  ├── /onboarding    首次配置           └── #/log      事件流
  ├── /universe-faq  文档
  └── /stargate/<e>  跳转
```

### 3.2 行星页 12 标签 → 4 组 × N

现状 12 个平铺标签按**心智模型**重组，三级结构：`组 Tab → 子 Tab → 内容`。

| 组 | 子标签 | 原标签 | 说明 |
|---|---|---|---|
| **观测** `observe` | 地质扫描 | scan | 默认组，默认子标签 |
| | 图鉴 | codex | |
| | 周目标 | weekly | 移到此处：属于"看进度" |
| **经营** `operate` | 星际贸易 | trade | |
| | 生产线 | craft | |
| | 空间站 | station | |
| | 科技树 | tech | |
| **组织** `organize` | 飞船改装 | shipyard | |
| | 远征合同 | contracts | |
| | 同行者 | crew | |
| **治理** `govern` | 宇宙议会 | council | |
| | 星际股市 | market | 与 `#/market` 共享组件，行星页里是"在此行星交易"视图 |

规则：

1. 组 Tab 4 个（`text-h3`，横排，选中态下划线 2px `signal`），子 Tab 用 `text-small` 胶囊。
2. 组与子标签状态写入 URL：`?lab=operate.craft`（query 而非 hash，避免与 panel hash 冲突）。
3. **默认打开 `observe.scan`**，因为它是唯一与"你刚到这颗行星"直接相关的动作。
4. 子标签数 ≤ 4，移动端单行可容（`overflow-x: auto` + 滚动阴影，不换行）。
5. 面板切换用 `key={group}.{tab}` 强制重挂载 + `fade-in 160ms`（现状 `key={planetKey}-{tab}` 已在做，保留思路）。

> 这是本次改动里对"玩法"影响最大的一处，但**不改任何面板内部逻辑**——
> `ScanTab` / `TradeTab` / … 12 个组件一行不动，只改 `ExplorationLab` 的容器与导航结构。

### 3.3 页面 → 面板的交叉入口

| 页面 | 内联入口 | 说明 |
|---|---|---|
| 导航页 `/` | StatusBar 资源 → `#/assets`；钱包 → `#/assets` | |
| 星系页 `/galaxy` | 行星卡片右键/长按 → ContextDrawer"产权" | 直连 `#/legal` 的产权子页 |
| 系统页 `/system` | 行星行 → Drawer（占领/攻城/产权） | |
| 行星页 `/planet` | 实验舱 4 组；顶部"这颗行星的产权"链接 → `#/legal?tab=property` | |
| 任意页面 | `⌘K` 搜索、NavRail、StatusBar | |

---

## 4. `AtlasShell` 实现骨架

```tsx
// Components/Shell/AtlasShell.tsx
export const AtlasShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ShellProvider>
    <div className="min-h-screen bg-n-0 starfield-bg text-n-900 font-sans">
      <TopRail />
      <NavRail />
      <main className="pt-14 pb-8 pl-16 max-w-content mx-auto px-6">
        {children}          {/* 各 Layout 原样传入，内部结构不动 */}
      </main>
      <StatusBar />
      <PanelHost />          {/* 按 hash 渲染 #/bank 等浮层 */}
      <CommandPalette />
    </div>
  </ShellProvider>
);
```

接入方式（8 个 Layout 各改 2 行）：

```tsx
// 旧
return <div className="w-full min-h-screen bg-gradient-to-br ...">...</div>;

// 新
return <AtlasShell>{/* 原内容，去掉外层背景与 Header */}</AtlasShell>;
```

**注意**：`AtlasShell` 必须挂在 `Suspense` **内部**、`StarfieldWarpReveal` **外部**。
3D 相关组件作为 `children` 传入时保持同一父链，**不触发重挂载**（否则行星会重新生成纹理）。

### 4.1 `ShellProvider` 职责（唯一状态源）

```ts
interface ShellState {
  view: ShellView;
  drawer: { id: string; payload: unknown } | null;
  pending: Record<string, number>;   // 各面板待处理计数（徽章）
  session: { playerId: string | null; accountStatus: string };
}
```

- **唯一的 tick**：`setInterval(1000)` 驱动宇宙时钟 + 资源刷新（替代现状 5 个定时器）。
- **唯一的数据缓存**：`Map<endpoint, { data, at }>`，面板切走再切回 60s 内不发请求。
- 网络错误统一进 `toast`，不再各组件 `console.error`。

---

## 5. 导航状态持久化

| 键 | 内容 | 位置 |
|---|---|---|
| `#/<panel>` | 当前面板 | URL hash（可分享） |
| `?lab=group.tab` | 行星页实验舱位置 | URL query |
| `navRailExpanded` | 是否展开 | `localStorage` |
| `viewHistory` | 最近 5 个面板/页面 | `localStorage`（供 ⌘K 默认列表） |
| `labLastTab` | 每个 group 上次停留的子标签 | `localStorage` |

---

## 6. 验收（本文件）

- [ ] 8 个页面均渲染在同一个 `AtlasShell` 内，TopRail/NavRail/StatusBar 视觉完全一致
- [ ] 打开 `#/bank`→ 关闭 → 再打开，行星 3D **不重新初始化**（在 `ModularPlanetRenderer` 挂载处打断点验证）
- [ ] 浏览器后退/前进可正确开关面板
- [ ] `?lab=operate.craft` 直接可进入对应子标签
- [ ] 移动端 (< 768px) 无横向滚动，NavRail 为底部栏
- [ ] 单页 `setInterval` 实例数 = 1
- [ ] `⌘K` 可键盘全程操作，`Esc` 关闭后焦点回到触发元素
