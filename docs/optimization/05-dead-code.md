# 05 · 零引用文件清查（2026-11-02）

> 目的不是「删得越多越好」，而是**让「这里能不能改」有答案**。
> 91k 行前端里混着没人 import 的文件，改起来心里没底；删之前也要能说清为什么敢删。

---

## 1. 方法：从入口做可达性，而不是 grep 文件名

`grep` 文件名会漏掉 `export *`、也会把注释和字符串算成引用。这里用的是**构建入口 BFS**：

- 入口 = `vite.config.mjs` 的 `input`（8 个 `MountPoints/*`）；
- 逐文件解析 `import` / `export ... from` / `import("...")` 的相对说明符；
- 按 `.ts/.tsx/.js/.jsx`、`/index.*` 规则解析成绝对路径；
- 从入口出发做图遍历，**没被走到的文件就是不可达**。

前提已核对：
- 全部导入都是相对路径或裸包名，**没有 `@/` 之类的路径别名**（`grep` 说明符已确认）；
- **没有拼接式动态 import**（`import(name)` 形式为零），所以静态分析是完备的。

结果：**378 个文件，入口可达 360，不可达 18**（约 4,410 行）。

---

## 2. A 类 · 已删除（6 个文件 / 1,569 行）

零引用、且不属于任何实验页或 3D 冻结区：

| 文件 | 行 | 说明 |
|---|---|---|
| `Layouts/main/HeroPanel.tsx` | 212 | 首页重做前的营销块，15 号文档早已标注「零 import」 |
| `3DComponents/UniversalPlanet3DWrapper.tsx` | 373 | 被 `RealisticPlanetStage` 取代的旧包装层 |
| `3DEffects/PlanetEffectsLibrary.tsx` | 727 | 未接入的旧特效库（新的在 `realistic3/effects.ts`） |
| `Utils/NavigationManager.tsx` | 217 | PJJAX-lite（`Utils/PageNavigation.ts`）实现了同一职责 |
| `Icons/PlanetIcon.tsx` | 28 | 图标已改由 `Icons/palette.ts` + 内联 SVG 提供 |
| `Components/StargateAnimation.tsx` | 12 | 空壳动画组件 |

**验证**：删除后 `npx tsc --noEmit` 零错误、`check_frontend_gates` 通过、
`npm run test:frontend` 34/34、`vite build` 成功。类型系统是这里的主要保险丝——
被删文件若仍被引用，`tsc` 会立刻报 `Cannot find module`。

---

## 3. B 类 · 保留：独立实验页（3 个文件 / 549 行）

| 文件 | 行 | 为什么不删 |
|---|---|---|
| `PlanetLab/main.tsx` | 225 | 根目录 `planetlab.html` 的入口（`<script src="/atlas-ui/.../main.tsx">`）|
| `SystemLab/main.tsx` | 215 | `systemlab.html` 的入口 |
| `SystemLab/fixture.ts` | 109 | 上面两个 lab 的夹具数据 |

它们不参与生产构建（不在 `vite.config.mjs` 的 `input` 里），只在 vite dev server 下可用。
**副作用**：`html` 直接引 `.tsx`，生产环境打开这两个页面会 404 —— 属于已知的开发工具，
不需要修，但别把它们当线上页面。

---

## 4. C 类 · 保留但要决策：异象展示链（9 个文件 / 2,841 行）

这一条链整体从入口不可达，源头是 `Components/ExoticShowcase.tsx`：

```
ExoticShowcase.tsx (263)
  └─ 3DComponents/realistic3/ExoticLayer.ts (658)
       ├─ GalaxyModel.ts (540)
       └─ torus.ts (166)
Components/CoordinateViewer3D.tsx (302)
Config/UniversalRenderer.ts (169)
Utils/NavigationHelper.tsx (157)
Utils/UniversalRendererDebug.tsx (164)
3DEffects/…（已删）           ← 原本也在这条链上
```

**为什么没删**：`ExoticLayer.ts` 里有两条**不能丢**的代码——

```ts
SystemLayer.update() 之后：root.position.set(0, 0, 0);
ExoticLayer.update() 之后：root.position.copy(camera.position);
```

这是 floating origin 抵消（见 `docs/render-transplant/`）。整条链删掉就等于把这段知识连同代码一起丢掉。

**建议**（需要产品决策，不是清理任务）：
1. **接入**：把 `ExoticShowcase` 挂到一个真实的异象视图（13 号文档的 8 页里没有它的位置，可能是遗留设想）；
2. **或固化**：把 floating origin 的两行抽成 `realistic3/floatingOrigin.ts` 并被主视图使用，然后删掉整条链。

在此之前标注为「未接入」，**不要顺手删**。

---

## 5. 结论与规则

- 已删 1,569 行；剩余不可达 549（实验页）+ 2,841（待决策）= 3,390 行。
- **规则**：新增组件时不要「先建后连」；删除组件时**同一个 PR 里物理删除文件**。
  `HeroPanel` 就是「文档写了已删、文件还在磁盘」的典型，害得两次核对都要重新确认。

**复核命令**（把 `atlas-ui/react/static/js` 可达性重算一遍）：

```bash
# 入口列表
grep -A 10 "input: {" vite.config.mjs
# 类型层保险：删了仍被引用会在这里报错
npx tsc --noEmit
```

> 想做自动化就把本文 §1 的 BFS 收成 `scripts/deadcode.mjs` 接进 `frontend` job，
> **先只报告不阻断**，稳定后再加阈值。
