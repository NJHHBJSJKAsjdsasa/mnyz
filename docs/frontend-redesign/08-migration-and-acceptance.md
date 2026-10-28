# 08 · 实施计划与验收

> 目标：可分阶段合并、每阶段可独立上线、任一步可 60 秒回滚。
> 总工作量 ≈ 24 人日（单人）。5 个阶段，每阶段都有明确"改完能看见什么"。

---

## 1. 阶段总览

| 阶段 | 内容 | 可见变化 | 风险 | 人日 |
|---|---|---|---|---|
| **P0 基座** | token 层 + `ui/` 11 个基础控件 + `global.css` 腰斩 | 几乎无（颜色微调） | 中：全局样式回归 | 3 |
| **P1 外壳** | `shell/` 7 个 + 8 个 Layout 接入 | **大幅**（全新导航结构） | 高：布局冲击 | 4 |
| **P2 页面** | 8 页重排 + B 组 12 个换壳 + 行星页 4 组标签 | **大幅** | 中 | 6 |
| **P3 面板** | `panels/` 7 个 + 12 个 Tab 重写 | **功能增量**（经济系统上线） | 中：接口联调 | 8 |
| **P4 动效** | 删旧动画 + 新动效标定 + 性能调优 | 中（质感） | 低 | 3 |

**顺序不可换**：P0 的 token 是 P1–P4 的前提；P1 的 `ShellProvider` 是 P3 的面板宿主前提。
P4 必须最后做——旧动画在新结构里会被自然淘汰一部分，先删会做无用功。

---

## 2. P0 · 基座（3 人日）

### 2.1 任务

| # | 任务 | 产出 |
|---|---|---|
| 1 | 新建 `css/tokens.css`（`:root` 下全部 token） | 01 §2/§3/§5 的变量 |
| 2 | 重写 `tailwind.config.js`（`theme.extend` 全量替换） | 01 §8 |
| 3 | `global.css` 从 2,209 → ≤ 400 行 | 01 §9 |
| 4 | 建 `js/ui/` 11 个基础控件 | 05 §5.2 |
| 5 | 建 `Hooks/useReducedMotion.ts` / `useInViewPause.ts` | 04 §5/§7 |
| 6 | 全局 `focus-visible` 规则 + 滚动条改色 | 01 §7 |
| 7 | 全局 `prefers-reduced-motion` 规则 | 04 §7 |

### 2.2 关键风险：全局样式回归

`global.css` 有 88 个 keyframe 和 ~120 个工具类，被 34 个组件的 `className` 直接引用。
一次性删空会导致大面积视觉塌陷（元素失去动画但保留 `opacity-0` 起始态 → **内容永久不可见**）。

**安全做法**（必须遵守）：

1. 先 `grep -rn "animate-[a-zA-Z-]*" js --include=*.tsx` 生成**被引用清单**；
2. 对每个待删类，先删**类定义**，跑一遍页面，确认没有 `opacity: 0` 残留；
3. `animate-*` 类若配合 `forwards` 起止态（如 `fadeIn` / `slideUp`），
   **删除时必须同时改组件**（去掉 `opacity-0` 初值），否则元素永久不可见；
4. 每删 10 个类提交一次，便于定位。

> 已知高风险类：`animate-slideUp` / `animate-slideInRight` / `animate-materializeHologram` /
> `animate-phaseSlideUpFadeIn` —— 它们都用于"入场后保持可见"，删类会留下不可见元素。

### 2.3 完成判据

- [ ] 8 个页面视觉与 P0 前截图对比，仅颜色/圆角/间距有差异，**无元素消失**
- [ ] `npx tsc --noEmit` = 0
- [ ] `npm run test:frontend` 通过
- [ ] `grep -c "@keyframes" css/global.css` ≤ 30（P0 不强求 ≤ 16，P4 收口）

---

## 3. P1 · 外壳（4 人日）

### 3.1 任务

| # | 任务 |
|---|---|
| 1 | `shell/ShellProvider.tsx`：状态 + **唯一 1s tick** + 端点缓存 |
| 2 | `shell/ShellRouter.tsx`：hash ↔ `ShellView`，监听 `hashchange` |
| 3 | `shell/TopRail.tsx`：面包屑（从当前 Layout 传入）+ 钱包速览 + 连接状态 |
| 4 | `shell/NavRail.tsx`：6 项 + 展开/收起 + 移动端底部栏 |
| 5 | `shell/StatusBar.tsx`：3 主资源 + 12 资源浮层 + 时钟 |
| 6 | `shell/CommandPalette.tsx`：⌘K |
| 7 | `shell/AtlasShell.tsx`：组装 |
| 8 | 8 个 Layout 各改 2–5 行接入（去掉自带背景与 `Header`） |
| 9 | **删除** `Header.tsx` 的 1s 轮询、`__main__` 的 4 个 `setInterval`、`FuelBars` 的 5s 轮询 |

### 3.2 关键风险：3D 重挂载

`AtlasShell` 改变了 Layout 的 DOM 层级（外层多了一层 `div` 和 `main`）。
React 的 reconciliation 若因 key/结构变化判定子树不同，会卸载重挂 `PlanetVisualizationUniversal`。

**验证方法**（P1 必做）：

```
1. 打开 /planet/<任意>
2. 在 ModularPlanetRenderer.tsx 的 useEffect(() => {...}, []) 里 console.count("mount")
3. 打开 #/bank → 关闭
4. 期望：count 仍为 1
```

若变为 2，说明保活失败，必须检查 `PanelHost` 的实现（见 07 §1.4）。

### 3.3 完成判据

- [ ] 8 页共享同一外壳，视觉一致
- [ ] `#/bank` 等 6 个面板路由可打开/关闭，浏览器前进后退正确
- [ ] 行星页打开面板后 `ModularPlanetRenderer` mount 次数 = 1
- [ ] 单页 `setInterval` 实例 = 1（DevTools Performance 面板验证）
- [ ] 移动端 375px 宽无横向滚动

---

## 4. P2 · 页面（6 人日）

### 4.1 任务

| # | 任务 | 文件 |
|---|---|---|
| 1 | 导航页重排（8+4 栅格，标题常驻） | `__main__.tsx` |
| 2 | 星系列表卡片化 | `__galaxy__.tsx`、`SystemsList`、`GalaxyInfo`、`GalaxyNavigation`、`Pagination` |
| 3 | 恒星系行星列表卡片化 | `__system__.tsx`、`PlanetsList`、`SystemInfo`、`SystemNavigation` |
| 4 | **行星页 4 组标签** | `ExplorationLab.tsx`（12 个 Tab 组件零改动） |
| 5 | 行星页拆 `PlanetInfo` → 4 组件 | `PlanetOverview` / `PlanetEffectsControl` / `PlanetActions` / `PlanetMoons` |
| 6 | 多元宇宙节点网格 | `__multiverse__.tsx` |
| 7 | FAQ 文档排版 | `__faq__.tsx` |
| 8 | Onboarding 三步向导 | `__onboarding__.tsx` |
| 9 | Error 页 | `__error__.tsx` |
| 10 | 坐标选择器瘦身（830 → ≈280 行） | `CoordinateSelector.tsx` |
| 11 | 删除 5 个死代码文件 | 05 §6.1 |

### 4.2 坐标选择器瘦身的边界

这是 P2 里唯一"行数大减"的组件。**逻辑清单（必须原样保留）**：

- `onCoordinateChange(coords, isUserInteraction)` 的调用时机与参数
- `travelCost` / `canAfford` 的展示（数值来源在父组件）
- `efficiency` 参数展示
- 随机坐标（`/api/generate-random-location`）
- `window.setRandomLocationActive` 的副作用（父组件依赖它）

**可以删的**：所有 `coordinate-selector-*` 动画类包裹层、三轴渐变条、glitch 文案、
`animate-particleFloat` 粒子、`toastSlideIn` 提示。

### 4.3 完成判据

- [ ] 行星页 4 组 × 3–4 子标签全部可达，`?lab=operate.craft` 可直达
- [ ] 12 个 Tab 组件 `git diff` 为空
- [ ] 5 个死文件已删，`tsc` = 0
- [ ] 8 页在 375 / 768 / 1024 / 1440 四档下无溢出
- [ ] 行星页 3D 在四档下均不溢出容器（`overflow: hidden` + `aspect-square`）

---

## 5. P3 · 经济面板（8 人日）

### 5.1 顺序

按 [06 §9](06-economy-surfaces.md)：`Assets → Market → Log → Bank → Company → Legal(产权) → Legal(诉讼/破产)`。

每个面板的 DoD：

- [ ] 全部只读视图可用（列表 + 详情 + 空态 + 错误态）
- [ ] 写操作走 `useWrite`，有 `inFlight` / 幂等键 / 错误文案映射
- [ ] 金额 `font-mono tabular-nums` 右对齐
- [ ] 涨跌色用 `--up` / `--down`
- [ ] 键盘可完成一次完整操作
- [ ] 打开/关闭不影响 3D 渲染

### 5.2 联调注意

- 后端 `require_auth(write=True)` + `begin_idempotency` 已在实现里；
  若前端漏传 `Idempotency-Key`，后端行为取决于 `deps.begin_idempotency` 实现 —— **不要依赖其容错**，一律传。
- 金额一律传字符串。现状 `marketBuy` 传 `quantity` 数字没问题，但 `amount` 类字段必须字符串。
- 时间字段（`expires_at`、`created_at`）是 UTC，前端 `new Date(str)` 后按本地时区显示。

### 5.3 完成判据

- [ ] 6 个面板可打开，NavRail 徽章显示待办数
- [ ] 74 个原沉睡端点中，至少 60 个有 UI 入口（其余为 admin/internal，本就不该有 UI）
- [ ] 无英文错误码泄漏到界面

---

## 6. P4 · 动效收口（3 人日）

### 6.1 任务

| # | 任务 |
|---|---|
| 1 | `global.css` 从 ≤ 400 行收到 ≤ 250 行，keyframe ≤ 16 |
| 2 | 全站 `animate-pulse` / `hover:scale-*` 清零 |
| 3 | 统一 stagger 入场（列表类组件） |
| 4 | Tab 指示条 WAAPI 实现 |
| 5 | `StarfieldWarpReveal` 与 fetch 解耦 + 可跳过 |
| 6 | `MultiverseTransitionCanvas` 改按需播放 |
| 7 | `MiningAnimationOverlay` 重写为单层径向脉冲 |
| 8 | `useInViewPause` 接入所有循环动画宿主 |
| 9 | 性能调优：Chrome Performance 5s 录制，消除 > 50ms 长任务 |

### 6.2 完成判据

见 [04 §11](04-motion-system.md)。
额外：`prefers-reduced-motion: reduce` 下全站可正常使用，无内容因动画被跳过而缺失。

---

## 7. 验收标准（全部阶段完成后）

### 7.1 契约（硬闸门，不过不能合并）

```bash
# 全绿才算通过（6 条命令见 07 §5）
git diff --name-only origin/main...HEAD -- 'server/**' 'pymodules/**' 'atlas-ui/template/**' \
  'atlas-ui/react/static/js/3DComponents/**' 'atlas-ui/react/static/js/3DEffects/**'
npx tsc --noEmit
npm run test:frontend
python test_fix.py
```

### 7.2 性能预算

| 指标 | 预算 | 测量条件 | 工具 |
|---|---|---|---|
| 首屏 JS（gzip，不含 3D chunk） | ≤ 250 KB | `/` 页 | `vite build` + `size-limit` |
| 3D chunk 独立加载 | 是（不影响首屏） | — | build manifest 检查 |
| LCP | ≤ 2.5 s | 移动 4G，冷缓存，`/planet/<name>` | Lighthouse CI |
| INP | ≤ 200 ms | 同上 | Lighthouse CI |
| CLS | ≤ 0.05 | 同上 | Lighthouse CI |
| 同屏循环动画 | ≤ 2 | 8 页逐页点检 | 人工 + 运行时断言 |
| 后台标签 CPU | < 5% | 切走 10s 后 | Chrome Task Manager |
| 单页 `setInterval` | = 1 | 8 页 | 运行时断言 |

### 7.3 可访问性

| 项 | 标准 |
|---|---|
| 键盘可达 | 所有交互元素可 Tab 到，`focus-visible` 可见 |
| 对比度 | 正文 ≥ 4.5:1，大字 ≥ 3:1 |
| 语义 | 标签组 `role="tablist"` + `aria-selected`；抽屉 `role="dialog"` + focus trap |
| 图标 | 所有装饰性 SVG `aria-hidden`；功能性图标有 `aria-label` |
| 动效 | `prefers-reduced-motion` 全站生效 |
| 截图水印 | `CopyrightWatermark` 保留（在 3D 截图导出里） |

自动化：`axe-core` 扫 8 页，**0 个 serious/critical**。

### 7.4 视觉回归

基线截图规格（P1 完成后建立，之后每阶段比对）：

```
8 个页面 × 4 个视口（375×812 / 768×1024 / 1024×768 / 1440×900）= 32 张
+ 行星页 4 个标签组 = 4 张
+ 6 个经济面板 = 6 张
共 42 张
冻结区处理：截图时对 3D 区域打码（或对 `/planet` 页固定种子 + 固定时间）
```

工具：不引入新依赖，用 `tools/` 下已有 node 脚本 + Playwright（若未安装则改用人工比对清单）。

> 3D 区域逐帧不同（行星在自转），**不能直接像素比对**。对比时只比 `canvas` 之外的区域。

### 7.5 功能回归（人工清单）

| # | 场景 | 期望 |
|---|---|---|
| 1 | 首次访问 `/` | warp 可跳过，2.4s 内看到可交互导航页 |
| 2 | 输入坐标 → 看到 3D 预览 → 启程 | 扣燃料、整页跳转、落到 `/planet` |
| 3 | 行星页采集 | 有反馈、资源增加、StatusBar 更新 |
| 4 | 行星页 4 组标签逐一切换 | 内容正确，URL 反映位置 |
| 5 | 打开 `#/market` 下单 | 成交后持仓/委托刷新 |
| 6 | 打开 `#/bank` 兑换 | 点差显示正确，余额更新 |
| 7 | 打开经济面板后返回行星 3D | 3D 未重载，仍在自转 |
| 8 | 断网后点任意写操作 | 有明确 Toast，不白屏 |
| 9 | 刷新页面 | 登录态保持，回到上次页面（不含面板） |
| 10 | 系统开"减少动态效果" | 全站可用，无动画 |

---

## 8. 回滚方案

### 8.1 逐阶段回滚（推荐）

每阶段独立 commit + 独立 PR。回滚 = `git revert <merge-commit>`。
由于 P0–P4 依赖递进，回滚必须在**最末阶段开始向前**。

### 8.2 运行时开关（P1 引入，P4 移除）

前端独有的灰度能力，不依赖后端：

```ts
// Utils/UiFlags.ts
export const uiV2 = (): boolean => {
  const q = new URLSearchParams(location.search).get("ui");
  if (q === "v2") return true;
  if (q === "legacy") return false;
  return localStorage.getItem("_atlasUiV2") !== "0";
};
```

用法：`AtlasShell` 内判断 `uiV2()`，假则渲染旧 Layout（P1–P3 期间两套 Layout 并存）。

- 灰度：给部分玩家 `?ui=v2` 链接；
- 紧急下线：`localStorage.setItem("_atlasUiV2", "0")`（可远程下发到公告里让玩家执行）；
- P4 结束时删除旧 Layout，开关失效（不再保留双份代码）。

> **注意**：双 Layout 并存期间，旧 Layout 不能删 `global.css` 的旧动画类。
> 这也是为什么 P0 只"减半"而非"清零"。

### 8.3 部署回滚

```
npm run build → 重启 Flask 进程
```

服务启动时只读一次 Vite manifest（`docs/ROADMAP.md` 已记录）。
**改前端不重启服务 = 页面白屏或加载旧 chunk**。回滚同样需要重启。

---

## 9. 风险登记

| # | 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|---|
| 1 | 删旧动画导致元素永久不可见 | 高 | 高 | P0 §2.2 的四步安全做法；每 10 个类提交一次 |
| 2 | `AtlasShell` 导致 3D 重挂载 | 中 | 高 | P1 的 mount 计数验证（§3.2）；`PanelHost` 用 `visibility` |
| 3 | 双 Layout 并存期间样式冲突 | 高 | 中 | 新样式全部走 `.surface-*` / token，不复用旧类名；旧类名保持原样不删 |
| 4 | `tailwind.config.js` 改断点导致现有 `sm:` 语义偏移 | 高 | 中 | P0 一次性全量替换；替换后逐页目检 768–1024 区间 |
| 5 | 面板打开后 3D 显存溢出（多 canvas） | 低 | 高 | 面板内**不渲染任何 3D**；同屏 canvas ≤ 2 |
| 6 | 后端返回结构与文档假设不符 | 中 | 中 | P3 每日联调；以实际响应为准，文档回填 |
| 7 | `tsc --noEmit` 因新增 `.tsx` 的 `verbatimModuleSyntax` 报错 | 中 | 低 | 沿用现有文件的 import 风格（含扩展名、显式 `type`） |
| 8 | 移动端底部 NavRail 与 StatusBar 争位 | 中 | 中 | 移动端 StatusBar 合并进底部栏的第二个横条（h 24） |

---

## 10. 立刻可以做的 5 件事（零风险、当天见效）

如果只能投入 1 天，按此顺序做，收益/风险比最高：

1. **删 5 个死文件**（904 行）：`MatrixTextReveal` / `NavigationForm` / `StorageDebug` /
   `SystemVisualization` / `PlanetVisualization` 的 import。零视觉变化，减少编译体积。
2. **把 `PlanetInfo` 的 535 行拆成 4 个**，不改样式。可维护性立刻提升。
3. **`ExplorationLab` 加 4 个组 Tab**，不动 12 个面板。信息架构改善最大、代码改动最小（~40 行）。
4. **删 `global.css` 里 4 个重名 keyframe** + 4 类全屏循环动画
   （`digital-rain` / `neural-*` / `particle-drift` / `scan-*`）。CPU 立刻下降。
5. **`focus-visible` 一条全局规则** + 把 `FuelBars` 的 `<div onClick>` 改成 `<button>`。
   a11y 最低限达标。

---

## 11. 验收签字表

| 项 | 责任 | 产物 |
|---|---|---|
| 契约闸门全绿 | 前端 | `check-contract.sh` 输出 |
| 类型零错误 | 前端 | `tsc --noEmit` 输出 |
| 性能预算达标 | 前端 | Lighthouse 报告 |
| a11y 0 serious | 前端 | axe 报告 |
| 视觉基线 42 张 | 设计 | 截图目录 |
| 功能回归 10 项 | 测试 | 清单勾选 |
| 后端零改动确认 | 后端 | `git diff --stat server/ pymodules/` 为空 |
