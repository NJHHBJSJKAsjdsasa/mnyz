# 15 · Game HUD（2026-10-30，第二次换肤）

> **覆盖声明**：本文覆盖 `14-amber-cockpit.md` 的**视觉条款**。14 仍然有效的是**结构契约**——
> 外壳四区、面板职责、冻结契约（`07`）、验收命令。视觉上「冷金属 + 琥珀 + 不发光 + 不模糊」
> 的那一套已经退役，改成本文的「深空 + 霓虹青 + 发光 + 角标 + 动效」。

## 1. 为什么改

用户原话：「现在前端与界面与 ui 不像游戏」→「界面不要分成一块一块的」。

第一条是**目标**：之前那版是「座舱仪表」，精确、克制、可读，但它像**工业监控软件**，不像游戏。
第二条是**症状**：每个面板都是独立的圆角/直角卡片 + 12px 空气，屏幕读起来是「一堆盒子」，
而游戏 HUD 是**一整块屏幕上的模块**。

## 2. 设计系统

| 维度 | 座舱（旧） | 游戏 HUD（现） |
|---|---|---|
| 底色 | 冷石墨 `#06080a` | 深空海军蓝 `#04060f` + 星云径向光 |
| 主光 | 琥珀 `#e8951d` | **电光青 `#2ee6ff`** |
| 次光 | 铜锈 | **等离子紫 `#a06bff`** |
| 货币 | 琥珀 | **金 `#ffc53d`** |
| 强调 | 1px 发丝线，**不发光** | **辉光**（`--glow-*` / `textShadow` / `drop-shadow`） |
| 形状 | 切角、圆角 0 | 切角 + **四角括号**（`.hud-corners` / `.atlas-hud::before`） |
| 动效 | 只保留 loading 扫光 | 扫描线、模块 boot-in、状态灯 ping、悬停辉光、滑杆光点 |
| 布局 | 卡片 + 12px gap | **deck**：1px 发光接缝，模块拼成一整块 |

颜色语义没变：`green` 仍是「跌/正」，`red` 仍是「涨/危险」（中国习惯）。

## 3. 换肤机制（唯一入口）

500+ 处 Tailwind 工具类已经写死在页面里，**改调色板而不是改文件**：

`tailwind.config.js` 里按语义重映射色族：

```
blue / indigo / sky / violet   → 电光青（主光）
purple / fuchsia / pink        → 等离子紫（次光）
cyan / teal                    → 水青（信息）
lime / green / emerald         → 酸绿（正 / 跌）
red / rose                     → 绯红（危 / 涨）
amber / orange / yellow        → 金（货币）
gray / slate / zinc            → 深空海军蓝（中性）
```

外加语义快捷色：`bg-plate` `bg-plate-2` `border-line` `border-line-strong` `text-signal`
`text-plasma` `text-gold` `bg-void`。

`tokens.css` 提供真正的视觉词汇：

- `.atlas-page`：星云 + 导航网格 + 屏幕内框
- `.atlas-plate`：面板板面（渐变 + 内高光 + 边框）
- `.atlas-hud`：游戏页机框（边框 + 顶部青色亮边 + 外辉光 + **四角括号**）
- `.hud-corners`：给任意块加四角括号（一个伪元素，8 条渐变）
- `.hud-titlebar`：面板标题条（向右淡出）
- `.hud-btn[data-variant]`：切角按钮（primary 发光青板 / secondary 釉面板 / danger 红板）
- `.hud-tab[data-selected]`：标签片
- `.hud-bar`：能量条
- `.hud-lamp`：脉冲状态灯
- `.hud-frame-corners` / `.hud-shell-scan`：外壳四角括号 + 缓慢下扫光带

## 4. 「不要分成一块一块」怎么做的

`AtlasShell` 的主区变成 `.hud-deck`：

1. **外壳是一整块**：`AtlasShell` 根节点自己就是边框 + 内辉光，四区（顶栏 / 导航 / 主区 / 状态栏）
   在里面用 1px 线分隔，不再各带边距。
2. **面板拼成一块**：所有经济面板的根都是 `<div style="display:grid;gap:12px">`。
   `.hud-deck section[data-panel] > div { gap: 1px !important; background: var(--atlas-line) }`
   —— 12px 的空气变成 **1px 发光接缝**。`!important` 是必须的：inline style 的 `gap` 只能这样盖。
3. **模块不上边框**：deck 内的 `.atlas-plate` 去掉左右边框、圆角、外阴影，只保留板面与接缝。
4. **deck 是一块屏幕**：主区背景是星云 + 47px 导航网格，短页面不会变成一片死黑。

## 5. 动效清单（都在 `prefers-reduced-motion` 下关闭）

| 名字 | 用在哪 | 时长 |
|---|---|---|
| `hud-scan` | 顶栏光带、外壳扫光 | 6–9s 循环 |
| `hud-boot` | deck 内每个模块入场（40ms 递进） | 220ms |
| `hud-breathe` | 空态准星 | 2.8s 循环 |
| `hud-ping` | `.hud-lamp` 状态灯 | 2.4s 循环 |
| 悬停 | 按钮辉光、标签片、模块接缝变青、箭头位移 | 90–130ms |
| `atlas-spin` | 按钮 loading | 700ms |

## 6. 改动文件

- `tailwind.config.js`（调色板 + `boxShadow.atlas-glow*` + `keyframes.hud-*`）
- `static/css/{tokens,global}.css`（全量重写）
- `static/js/Shell/{AtlasShell,TopRail,NavRail,StatusBar}.tsx`
- `static/js/ui/{Button,Panel,Tabs,EmptyState}.tsx`
- `static/js/Components/{Header,CoordinateSelector}.tsx`
- `static/js/Layouts/main/HeroPanel.tsx`
- `tools/shot.mjs`（跳过光敏倒计时 + 首页 warp 等待，否则截图永远是星尘）

## 7. 验收

```
npx tsc --noEmit                              0 错
node tools/frontend_smoke.mjs                 34/34
npx vite build                                ✓
python scripts/check_frontend_gates.py        v1 直连 0 / Shell fetch 0 /
                                              blur 11（计入约束 2）/ 循环动画 45
npm run shot -- --only public,game,panel      13 张，产物 .workbuddy/shots10
```

## 7.5 第三轮：首页重做 + 经济系统常驻（同日）

用户两条要求：「把首页全部改造」「经济系统不要藏在按钮后面，直接住在页面里」。

### 7.5.1 首页整屏重做（`Layouts/main/HomeScreen.tsx`）

**停用的**：`Layouts/main/HeroPanel.tsx`（212 行）、`Components/CoordinateSelector.tsx`（841 行）。
它们就是「现在的界面」——居中营销块 + 底部表单。两个文件不再被任何代码引用：
`CoordinateSelector.tsx` 已物理删除，`HeroPanel.tsx` **截至 2026-11-02 仍在磁盘上**（212 行、零 import，
`HomeScreen.tsx` 与 `Layouts/__main__.tsx` 只有注释提到它），属未清理的残留文件，可随时删除。

新的桥段布局（一整屏，无滚动也能操作）：

```
┌ 顶栏  品牌 · 当前坐标 · 宇宙模式 · 账户 ──────────────────────────────┐
├ 左：宇宙档案 (264px) ─┬ 中：星图舞台 (flex) ────────────┬ 右：经济侧栏 ┤
│ 种子 / 大爆炸 / 年龄   │ 巨型标题（三层辉光）或 3D 视图    │ 常驻 404px  │
│ 宇宙发展 / 坐标即星系  │ 跳跃控制台：X Y Z + 起跳 + 随机    │ 见 7.5.2    │
└───────────────────────┴──────────────────────────────────┴─────────────┘
```

- 坐标输入从「滑杆 + 小输入框」改成 **三块轴面板**（等宽 15px 数字、轴色顶边、发光标签），
  直接用键盘输入。随机跳跃改成控制台里的按钮，不再藏在表单角落。
- 燃料预估 / 效率 / 是否可以起跳并排显示在起跳按钮上方，燃料不足时整行变红。
- 3D 视图与标题仍然是 cross-fade 两层（`showNavigationText` / `show3DViewer` 语义不变），
  渲染组件 `CoordinateViewer3D` 没动。

### 7.5.2 经济系统常驻（`Shell/AtlasShell.tsx` 重写）

- **启动按钮删了**。原来是「右上角一个『经济』按钮 → 全屏 dialog」，现在是一个 **fixed 右侧栏**
  （`width: 404px`，`top: 96px → bottom: 112px`，底部 100px 留给飞船/任务浮钮）。
- 顶部是站点 chips（资产/银行/市场/公司/法务/活动），点一下换面板；`#hash` 仍是唯一状态源，
  无 hash 时默认第一个站点。
- 三个窗口按钮：`⌘K` 搜索、`⤢` 全屏展开（`inset: 8px`）、`⟩` 收起到 44px 竖排脊（显示额度）。
- 面板区仍是 `PanelHost` keep-alive + `.hud-deck`，所以切换站点不重建 3D/图表。
- **页面必须给侧栏让位**：`body:has(.hud-dock) .atlas-page { padding-right: 424px }`，
  收起时 64px、展开时 0。用 `:has` 是为了不把「侧栏是否打开」这个 prop 穿透 8 个布局。
- 一并删除 `Shell/NavRail.tsx` / `TopRail.tsx` / `StatusBar.tsx`（站点 chips 与遥测页脚已并入侧栏）。

## 8. 还没做

1. **图标**：`Icons/` 仍是实心单色 SVG，游戏化后可以加双色描边 + 发光，但那是 30+ 文件的逐个人工活。
2. **星球/星系页的浮层**：`SpaceshipPanel`、`TreasureChest`、`DidYouKnow` 还是旧圆形/胶囊底，
   现在与 HUD 方角语言不一致。
3. **面板内自定义块**：`ui/Table` 之外的键值块已走 `.atlas-kv`，但横排 chip 仍各写各的间距。
4. `backdrop-blur` 还剩 11 处（3D 层），够用但没清干净。
