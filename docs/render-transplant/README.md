# 渲染移植交接文档（3.0 realistic planet → 2.x 底座）

> 给后续会话用的单文件交接说明。**先读 §1 边界，再读 §4 契约，再动手。**
> 状态：阶段 1 ✅、阶段 2 ✅、阶段 3 ✅、阶段 4 ✅（分档 / 像素比 / 离屏暂停 / renderer 常驻 + 变体缓存）、
> 阶段 5 ✅（§10：恒星表面 / 恒星系 / 异象层）、**阶段 6 ✅（3.0 成为默认渲染；行星页与恒星系页替换原渲染）**。
> 2026-10-28 更新。
> 运行态已验证（16:0x）：API `127.0.0.1:8000`（head `0127`）+ UI `127.0.0.1:6424` + Vite `5173`（只服务 planetlab），
> 端到端冒烟通过。**2026-10-28 阶段 6 起 3.0 是默认渲染**，`?renderer=classic` 才回旧管线。
> 范围外（星系 / 恒星系 / 现象 / 超跳跃 / 多元宇宙）的可移植性判定见 **§10**。
> 最后更新：2026-10-28。

---

## 1. 目标与边界

**做什么**：把上游 Atlas 3.0 的渲染层移植到本项目 2.10.434 底座上 ——
**行星**（`Explore/planet/realistic/`）、**恒星表面**（`Explore/system/StarSurface.ts`）、
**恒星系**（`Explore/system/SystemLayer.ts`）、**星系尺度异象**（`Explore/galaxy/ExoticLayer.ts`）。
只换渲染，不动页面架构、不动游戏层、不动后端。

**不做什么**（每条都有代价理由，见 §2）：

| 不做 | 理由 |
|---|---|
| 整体 merge 上游 3.0 | 3.0 是前端推倒重写：单一 3D 探索器替代 index/galaxy/system/planet 四页，删除 `3DEffects/`、`EffectRegistry`、`PlanetLayerSystem`，并移除资源采集/每日挑战/飞船进阶 |
| 删除 2.x 的 `3DComponents/` 与 `3DEffects/`（56 文件） | 59 个文件 import `3DEffects`、15 个 import `PlanetLayerSystem`、8 个 import `Layouts/__*`，删了整站白屏 |
| 改动 `server/`（212 文件 / 255 端点 <!--fact:api.endpoints=255-->） | 它是独立 Flask app（`server/__init__.py` 只注册 health + `/api/v1`，不挂 UI），与渲染完全解耦，迁移上游无收益 |
| 修改 `realistic3/` 里 vendored 的 14 个文件 | 逐字节复制才能 `git show` 重同步；要改就改我方文件（`adapter.ts` / `systemAdapter.ts` / 各 `*View`、`*Stage`） |

**三方资产边界**

```
上游 3.0.2 ──(逐字节复制)──> realistic3/{glsl,shaders,effects,looks,rings,RealisticPlanet}.ts   行星内核，只读
                            realistic3/MoonSystem.tsx                                         卫星，只读（1 行 import）
                            realistic3/{StarSurface,SystemLayer,OrbitalMechanics,
                                        planetColors,hash}.ts                                 恒星 / 恒星系，只读
                            realistic3/{ExoticLayer,torus,GalaxyModel}.ts                     异象，只读
我方适配 ────────────────> realistic3/{adapter,systemAdapter,systemTypes,variantCache,
                                          moons,perf}.ts + 各 View/Stage 组件                  我方代码
2.x 页面/面板 ───────────> 行星页 / 恒星系页挂载点（flag 后二选一）                            我方代码
server/ ──(不动)──────────> /api/v1 255 端点                                                  后端
```

---

## 2. 上游事实（写文档/做决策时别再重新查）

| 项 | 值 |
|---|---|
| 仓库 | <https://github.com/SurceBeats/Atlas> |
| 作者 / 署名 | Claudio González（SurceBeats）/ Banshee |
| 许可 | PolyForm Noncommercial 1.0.0（非 OSI 开源；非 copyleft；衍生作品须同许可分发 + 随附许可，不得商用） |
| 本项目基线 | v2.10.434，根提交 `9576e52` |
| 上游 tip | `2a9ec243fe0366f93dba2c15e55c1e2b59ac5c8a`（v3.0.2，2026-10-23） |
| 本地 remote | `upstream` → `https://ghfast.top/https://github.com/SurceBeats/Atlas.git`（镜像，加速用；正式合并前换回官方 URL） |
| 已拉内容 | shallow `--depth=1`，331 文件，`git show FETCH_HEAD:<path>` 可完全离线读 |
| 拉取耗时 | 22.45 MiB / 48 s（官方源约 1/10 速度） |

**3.0 渲染层关键事实**：`Explore/planet/realistic/` 六个文件只依赖 `three` + 目录内相对导入，
**不依赖** Engine / Navigator / 浮动原点 / HDR 管线。这是整个移植方案成立的原因。
行星几何是单位球 + 全部细节在 fragment shader 里，所以喂任意 `radius` 都能工作。

**拉取坑**：中断会残留 `.git/shallow.lock`，`rm -f .git/shallow.lock` 后重试。
`ghproxy.net`、`gitclone.com` 实测超时；`hub.nuaa.cf` 502；`ghfast.top` 可用（`ls-remote` 2.8 s）。

---

## 3. 已落地文件（阶段 1–5）

### 3.1 vendored 内核（**禁止修改**）

`atlas-ui/react/static/js/3DComponents/realistic3/`

| 文件 | 行 | 字节 | 职责 |
|---|---:|---:|---|
| `glsl.ts` | 154 | 5,322 | simplex/fbm/ridged/cellular 噪声 + 光照工具，全部在单位球局部坐标系 |
| `shaders.ts` | 1,040 | 55,038 | surface / cloud / haze / atmosphere 四套 GLSL |
| `effects.ts` | 1,082 | 43,911 | 16 种特效（aurora / volcanic / jets / monolith / divine…） |
| `looks.ts` | 492 | 20,469 | 行星类型 → family + 调色板 + 结构参数（`planetLook(data)`） |
| `rings.ts` | 181 | 7,354 | 环带、环影、Roche 结构（`RealisticRings`） |
| `RealisticPlanet.ts` | 241 | 10,823 | 组装 surface + clouds + haze + atmosphere + rings，提供 `update(state)` |

**阶段 2 追加 vendored**：`MoonSystem.tsx`（1,804 行 / 65,140 字节），唯一偏差是
`import { NOISE } from "../Explore/planet/realistic/glsl.ts"` → `"./glsl.ts"`。
**不要**用 2.x 本地那份（1,672 行，已被本仓库改过）。

**阶段 5 追加 vendored（§10 三项，同 commit / 同许可）**：

| 文件 | 行 | 字节 | 职责 | 偏差 |
|---|---:|---:|---|---|
| `StarSurface.ts` | 247 | 10,657 | 恒星表面：米粒组织、临边昏暗、黑子、色球、日冕 billboard | NOISE import → `./glsl.ts` |
| `SystemLayer.ts` | 426 | 18,090 | 恒星系：AU 真实尺度、椭圆轨道、倾角/升交点、恒星光晕与点光 | 4 条 import（见 VENDOR.md） |
| `OrbitalMechanics.ts` | 37 | 1,482 | 椭圆位置 / 倾角 / 升交点哈希（3.0 新增，2.x 没有） | 无 |
| `planetColors.ts` | 123 | 3,829 | 行星类型 → 回退调色板（恒星系里的球体贴图用） | 无 |
| `hash.ts` | 79 | 2,064 | `hashString` / `SeededRng` | 无 |
| `ExoticLayer.ts` | 658 | 28,915 | 黑洞吸积盘、脉冲星、类星体喷流、奇点环面 | 3 条 import |
| `torus.ts` | 166 | 7,043 | 原初环面几何与材质 | 无 |
| `GalaxyModel.ts` | 540 | 21,843 | 星系模型（`ExoticLayer` 只用它的 `PointOfInterest` 类型，整文件搬省得拆） | 1 条 import |

出处见同目录 `VENDOR.md`（含 commit、源路径、许可、每个文件的偏差与重同步脚本）。

### 3.2 我方适配层

| 文件 | 行 | 职责 |
|---|---:|---|
| `realistic3/adapter.ts` | 85 | 2.x `planetData` → `LookInput`；seed 稳定性；`sampleRings()`（仅实验页） |
| `realistic3/RealisticPlanetView.tsx` | 384 | 自包含宿主：canvas、相机、OrbitControls、星向光、环、卫星 + 条件灯光、每帧状态、ResizeObserver、离屏暂停、完整 dispose。**runtime（renderer/scene/camera）常驻，content 按行星重建** —— 见 §5.1 |
| `realistic3/variantCache.ts` | 248 | 阶段 4：16 个 family 探针 → 空闲时 `renderer.compileAsync` 预热程序缓存；`createProbe()` 可无 GPU 单测 |
| `realistic3/moons.ts` | 177 | 合成 `MoonSystemData`（count + seed → 稳定卫星系），后端有真实卫星数据后替换调用点 |
| `realistic3/perf.ts` | 54 | 质量分档 → `maxOctaves` / `maxPixelRatio`，支持 `?quality=low\|mid\|high` |
| `Components/RealisticPlanetStage.tsx` | 204 | 行星页落点：拉 `rendering-data` 取 `rings`、渲染、FPS/档位角标、切回旧渲染 |
| `realistic3/systemAdapter.ts` | 175 | 2.x `/api/system/rendering-data` → 3.0 `SystemDetail` + `Timing`（补 `index`、`Size` 转数字、timing 兜底、暴露 `starTint`） |
| `realistic3/systemTypes.ts` | 63 | 上游 `Explore/api.ts` 的类型部分（避免把 explorer 的 fetch 层搬进来） |
| `Components/RealisticStarStage.tsx` | 145 | 单颗恒星的独立展台（恒星类型 / 颜色 / 半径 / seed / 日冕强度） |
| `Components/RealisticSystemStage.tsx` | 273 | 恒星系页落点：拉数据 → 适配 → `SystemLayer`、速度档、行星显示放大、切回旧渲染、失败回落 |
| `Components/ExoticShowcase.tsx` | 263 | 星系尺度四类天体的独立展品（黑洞 / 脉冲星 / 类星体 / 奇点环面），可聚焦单件 |
| `Utils/RendererFlag.tsx` | 39 | `?renderer=realistic\|classic` + `localStorage[atlas.renderer]`，默认 classic |

### 3.3 实验页（dev-only，不参与生产构建）

| 文件 | 行 | 说明 |
|---|---:|---|
| `planetlab.html`（仓库根） | 26 | 入口页，`npm run dev` 后访问 `/planetlab.html`；**未加入 `vite.config.mjs` 的 build input** |
| `atlas-ui/react/static/js/PlanetLab/main.tsx` | 225 | 控制面板：31 类型 × 18 大气 × 温度 × seed × 转速 × octaves × 环开关 × 卫星 0–8 × **warm shader cache 开关**，右下角实时显示 `programs / warmed / ms` |
| `systemlab.html`（仓库根） | 26 | 恒星 / 恒星系 / 异象 三个 tab 的实验页，`/systemlab.html`；同样不进 build input |
| `atlas-ui/react/static/js/SystemLab/main.tsx` | 215 | 三个 tab 的控制面板；恒星系 tab 用 fixture 走**真实适配链**，右侧显示适配结果 |
| `atlas-ui/react/static/js/SystemLab/fixture.ts` | 109 | 三套合成 `/api/system/rendering-data`（类太阳 6 行星 / 双恒星 4 行星 / 红矮星紧凑 3 行星） |
| `scripts/shader_variants_check.ts` | 145 | 无 GPU 校验 16 个探针：定义正确、程序不重复、dispose 后场景为空。`npm run check:shaders` |
| `scripts/system_variants_check.ts` | 156 | 无 GPU 校验 §10 三项：适配角度与后端公式逐颗对齐、6 种恒星、3 个系统与 4 件异象的构建/更新/dispose。`npm run check:system` |

---

## 4. 数据契约（改任何东西前先看这节）

### 4.1 2.x 输入 → `LookInput`

路由 `PlanetLike`（`adapter.ts`）字段：`name / planet_type / surface_temperature / atmosphere / life_forms / base_color / rotation_period_seconds / seed`。

`lookInputFromPlanet()` 产出：

```ts
{
  planet_info: { name, type, base_color?, surface_temperature? },
  original_planet_data: { planet_type, surface_temperature, life_forms },
  atmosphere: { type },          // 必须是 ATMOSPHERES 的 key，否则回退密度 0（无大气）
  life_forms: { type },
  seeds: { planet_seed, shape_seed },   // 同一字符串，稳定即可
}
```

`looks.ts:119` 的实际读取顺序（写适配层时按这个对齐）：

```ts
const planet = data.original_planet_data ?? data.planet_info ?? {};
const type = data.planet_info?.type ?? planet.planet_type ?? "Rocky";   // 下划线会被换成空格
const temperature = planet.surface_temperature ?? data.planet_info?.surface_temperature ?? 15;
const life = planet.life_forms ?? data.life_forms?.type ?? "None";
const atmosphereType = data.atmosphere?.type ?? planet.atmosphere ?? "None";
const seed = data.seeds?.planet_seed ?? data.seeds?.shape_seed ?? data.planet_info?.name;
const base = data.planet_info?.base_color;   // 缺省 0x808080 灰
```

**seed 稳定性是硬要求**：所有地形结构由 seed 派生，seed 不稳 = 每次刷新行星换脸。
`PlanetLike.seed` 传 `name`/坐标/planet key 皆可，别传 `Math.random()` 或时间戳。

**类型名必须命中 31 个 case 之一**（`looks.ts`）：`Oceanic / Super Earth / Sub Earth / Forest /
Savannah / Desert / Arid / Tundra / Swamp / Cave / Rocky / Metallic / Crystalline / Diamond / Icy /
Lava / Magma / Molten Core / Toxic / Radioactive / Gas Giant / Frozen Gas Giant / Nebulous / Exotic /
Anomaly / Mirror / Super Puff / Super Ringed / Ruby Cloud / Aquifer / Carbon`。
未命中会落到默认 barren 分支（不报错，但会「长得不对」——排查时先打印 type）。
下划线形式的 `planet_type`（如 `Gas_Giant`）会被 `.replace(/_/g," ")` 自动救回。

### 4.2 环：零适配，直接透传

`pymodules/planet_renderer/rings_translator.py` 产出的结构与 3.0 `RingsData` **字段名完全相同**：

```ts
{ has_rings, inner_radius, outer_radius, planet_radius, tilt_factor, shape_seed,
  bands: [{ inner, outer }] }
```

`RealisticRings` 内部自己归一（`const unit = 1 / (data.planet_radius || 200)`），**不要在外层再换算单位**。
前端现成入口：`ModularPlanetRenderer.tsx` 已经在用 `renderingApiData.rings`（第 1038 / 1131 行）。

### 4.3 渲染器 API

```ts
new RealisticPlanet(
  look: PlanetLook,           // planetLook(lookInput)
  mesh: THREE.Mesh,           // 材质会被替换；几何应 ≥ 128×64 分段
  scene: THREE.Scene,         // clouds / haze / atmosphere / rings 会 add 进来
  radius: number,             // 单位球填 1
  rings?: RingsData | null,   // §4.2
  kinds?: Set<EffectKind>,    // effectKinds(data)
  superRings?: boolean,       // Super Ringed 专用
  hazeHeight?: number         // Super Puff 专用（半径分数，0=无）
)

realistic.update({
  lightDir,        // THREE.Vector3，指向恒星，**世界/帧空间**，内部会 normalize
  sunColor,        // THREE.Color
  camera,          // 只用 camera.position.length() 当距离、camera.fov
  viewportHeight,  // 像素（devicePixelRatio 已算进 renderer.domElement.height）
  maxOctaves,      // 噪声八度上限，低端机降到 5–6
  elapsed,         // 秒；驱动云层与特效（上游用「宇宙起源至今」）
  rotationPeriod,  // 秒；只用来自转云层相位
  galacticCore?,   // 镜面世界反射用；不在星系内传零向量 → uGalaxy.w=0，镜面行星会退化
})
```

`dispose()` 会清理 surface / rings / effects / clouds / haze / atmosphere。

---

## 5. 当前实现细节（`RealisticPlanetView.tsx`）

| 参数 | 当前值 | 说明 |
|---|---|---|
| `RADIUS` | 1 | 单位球 |
| 相机 | `PerspectiveCamera(40, …, 0.01, 200)`，初始 `(0, 0.45, 3.4)` | 必须让相机朝原点、行星在原点，`update()` 用 `camera.position.length()` 当距离 |
| 控制器 | OrbitControls，`enablePan=false`，距离 1.25–9 | |
| 色调映射 | `ACESFilmicToneMapping`，曝光 1 | **与 3.0 的 HDR 管线不一致**，见 §6 |
| 光源 | `lightDirection` prop（默认 `(0.85, 0.22, 0.5)`），每帧归一化后同时驱动 surface 与卫星的 DirectionalLight | 色固定 `0xfff3e4`；接真实恒星后只改 prop |
| 自转 | `secondsPerRotation`（默认 40 s）× `rotation_period_seconds` | 预览压缩；`elapsed` 用 `elapsedScale(300)` 让云与特效可见地动 |
| 重建条件 | **runtime**：`maxPixelRatio` / `pauseWhenHidden`；**content**：`signature = name\|type\|seed\|temperature\|rings\|moonCount` | 改 octaves / 转速 / 光照 / 星系核都**不会**重建任何东西（每帧读 ref） |

渲染顺序/材质要点：clouds `depthWrite:false`、haze `renderOrder=1`、atmosphere `renderOrder=2` 且
**内外自动切换 FrontSide/BackSide**（在行星内部看时反转）——这三处别乱改，否则边缘发光会穿模。

### 5.1 生命周期：为什么 renderer 必须常驻（阶段 4 的核心改动）

three.js 的**程序缓存（`WebGLPrograms`）挂在 renderer 实例上**，缓存键是
`顶点着色器 + 片元着色器 + defines + 渲染参数`（`WebGLPrograms.getProgramCacheKey`）。
旧实现把 `signature` 当作整个 effect 的依赖，切一颗行星就 `renderer.dispose()` 再 `new`：
新建 canvas → 新建 WebGL 上下文 → **程序缓存清零 → 整颗星球重编译**。这才是「切类型卡顿」的真凶，
不是 family 变体多。

现在拆成两层：

| 层 | 生命周期 | 内容 |
|---|---|---|
| **runtime** | 组件挂载期间（只有 `maxPixelRatio` / `pauseWhenHidden` 变才重建） | `WebGLRenderer`、`Scene`、`Camera`、`OrbitControls`、日月灯、ResizeObserver、IntersectionObserver、rAF 循环、程序缓存 |
| **content** | `signature` 变就重建（同一 runtime 内） | 球体 mesh + `RealisticPlanet`（surface/cloud/haze/atmosphere/rings）+ `MoonSystem` |

收益：同 family 切（Oceanic ↔ Forest ↔ Swamp）是**零编译**（defines 相同 → 命中缓存）；
跨 family 切只需要编译那一套新程序。

### 5.2 变体预热（`variantCache.ts`）

同一 family 之外的第一次仍然要编译，所以启动后（第 2 帧，画面已经出去）在空闲时间把
其余 family 各编译一遍：

- **探针**：`looks.ts` 的 14 个 family 各选一个代表类型（Oceanic / Desert / Rocky / Metallic /
  Crystalline / Diamond / Icy / Lava / Gas Giant / Mirror / Toxic / Radioactive / Exotic / Anomaly），
  外加 `Super Puff`（多一层 haze 程序）与 `Super Ringed`（surface 带 `HAS_RINGS`）= **16 个探针**。
- **做法**：每个探针造一个半径 1 的 `RealisticPlanet` + 私有 `Scene`，调
  `renderer.compileAsync(scene, camera)`（有 `KHR_parallel_shader_compile` 就不阻塞），
  然后整组 dispose。**vendored 文件一行没改**。
- **预算**：每编译完一个探针就 `requestIdleCallback` 让出主线程；`AbortSignal` 在组件卸载时中断；
  无该扩展的浏览器退化为同步编译，但因为分散在 idle 切片里，感受仍是「不卡」。
- **去重**：`WeakMap<renderer, Set<probeKey>>`，同一 renderer 每个探针只编译一次（重建 runtime 才重来）。
- **实测规模**（`npm run check:shaders`）：16 探针 → **15 个 surface 程序**（`Super Puff` 与
  `Gas Giant` 共用 `FAMILY_GAS`）+ 云/霾/大气/环 → 全量 **22 个不同程序**、33 个 shader 材质。
- **不在预热范围**：`PlanetEffects` 的 16 种特效（aurora / plumes / jets …）。每个都是小 shader，
  且只有异象类行星才挂，首次上屏时编译；要覆盖就把 `kinds` 传进 `createProbe`。
- **观测**：`onCacheStats` 回调给出 `{programs, warmed, total, warming, ms}`；行星页角标显示
  `prog N`，实验页右下角显示完整计数。

---

## 6. 已知偏差（相对 3.0 的差异清单，验收时要认）

0. **卫星数据是合成的**：2.x 后端没有卫星载荷，`moons.ts` 由 `(count, seed)` 生成
   稳定的卫星系（尺寸 5–16% 行星球半径、轨道按几何级数外推、周期用开普勒第三定律）。
   接真实数据时只换调用点，`MoonSystem` 不用改。

1. **无浮动原点**：3.0 用浮动原点避免大尺度抖动；这里行星固定在原点，无抖动问题，但也因此
   不能直接复用到「星系 → 行星连续缩放」的场景。
2. **色调映射不同**：3.0 是 HDR 深空 + 自定义 tone mapping + 眼睛适应；这里只有 `ACESFilmic` 近似。
   → 结果：暗面会更亮、边缘光更收敛。若要做 1:1，需要把 3.0 的 `Explore/engine/` 后处理链一起搬（成本陡增，不建议）。
3. **无星系上下文**：`galacticCore` 传零 → `Mirror` 类型行星不会反射银河，看起来像普通高反射球。
4. **环的 Super Ringed 分支未启用**：需要 `setRingRoche(rocheRadii)`，而 2.x 数据没有 Roche 半径。
5. **特效未预热**：`effectKinds()` 已按数据启用特效（aurora 等）；卫星已接入（阶段 2），
   但 16 种 `PlanetEffects` 的程序不在预热清单里，异象类行星首次上屏仍会编译一次。
6. **大气单次散射**是 3.0 新写的，2.x 旧渲染没有 → 落日偏红、明暗界线辉光是本次移植的可见收益之一。

---

## 7. 运行与验收

```bash
cd D:/mni/moni-repo
npm run dev                     # → http://localhost:5173/planetlab.html
node_modules/.bin/tsc --noEmit -p tsconfig.json   # 期望 0 error（当前基线就是 0）

# 沙箱里 npm 会被 safe-delete shim 打断（删 node_modules/.vite/deps_temp_* 超阈值），清掉 NODE_OPTIONS 再跑：
NODE_OPTIONS= npm run build                       # 直接用 dist 验证
npx vite build --outDir dist_check                # 不想动 dist 时用这个（跑完删掉 dist_check）
NODE_OPTIONS= npm run check:shaders               # 阶段 4：16 个探针 / 22 个程序的无 GPU 校验
NODE_OPTIONS= npm run check:system                # 阶段 5：适配器对拍 + 恒星/恒星系/异象构建
NODE_OPTIONS= npm run check:render                # 上面两个一起跑（CI 用这个）
# 实验页：/planetlab.html（行星）· /systemlab.html（恒星 / 恒星系 / 异象）
```

> 生产构建产物不含 `planetlab.html`（有意，见 §9.7）。构建完 **必须重启 Flask**，服务只在启动时读一次 Vite manifest。

验收清单（阶段 1）：

> **状态（2026-10-28 16:0x）**：下列勾选项是**视觉/体感判据**，需要人眼在浏览器里过一遍，
> 自动化只能覆盖其中 3 条（seed 一致、console 无错、FPS 归零）。已过的是类型/构建/接口层，
> 视觉项标 ⬜ 不是"没做"，是"没人看过"。

- [ ] 同一 seed 刷新页面，地形完全一致（验证 seed 稳定）
- [ ] 切换 `Oceanic` / `Gas Giant` / `Lava` / `Icy`，family 与配色明显不同
- [ ] 温度拉到 -200 / 400，极冠与植被/熔岩比例变化合理
- [ ] 大气从 `None` 换 `Nitrogen`，出现边缘辉光与落日偏红
- [ ] 拖拽越过极点不翻转、不跳变
- [ ] 连续切换类型 20 次，`performance.memory` 无单调上涨（验证 dispose）
- [ ] 控制台无 WebGL warning / shader 编译错误

阶段 2：
- [ ] 勾选 rings，出现与赤道面对齐的环带，且行星表面出现环影
- [ ] 卫星从 0 拖到 8，卫星数递增且同一 seed 下位置/大小每次刷新一致
- [ ] 卫星有明暗面（不是全黑），切到背面仍可见昼侧

阶段 3（`/planet/<name>`，2026-10-28 起为默认渲染；`?renderer=classic` 回旧）：
- [ ] 行星页 3D 区域换成真实渲染，其余面板/标签/接口行为不变
- [ ] 右上角「切回旧渲染」立即回到 2.x，且刷新后保持旧渲染
- [ ] `rings` 取自 `/api/planet/<name>/rendering-data`；该请求 404/超时时行星照常渲染（只是没有环）
- [ ] 角标显示档位与 FPS（阶段 4 对比用）

阶段 4：
- [ ] `?quality=low` 时角标显示 `low · 5 oct`，像素比上限 1.5
- [ ] 页面滚动到看不见 3D 区域时 FPS 归零（rAF 暂停），滚回来恢复
- [ ] 角标出现 `prog N`，几十秒后 `N` 稳定不再增长（预热完成）
- [ ] 实验页切 `Oceanic → Forest → Swamp`（同 family）：**无编译卡顿**，`programs` 不增加
- [ ] 实验页切 `Oceanic → Gas Giant`（跨 family）：预热后切换应≤1 帧掉帧，`programs` 只 +1~2
- [ ] 取消 `warm shader cache` 再切类型：能感到明显停顿（对照组，证明缓存真的在起作用）

阶段 5（`/systemlab.html` 与恒星系页）：
- [ ] 恒星 tab：6 种类型外观可辨（黄/红矮/红巨/蓝巨/白矮/中子星），米粒组织粗细随类型变
- [ ] 恒星 tab：`near` 拉到 0 只剩光球、拉到 1 日冕铺满；同一 seed 刷新后黑子位置不变
- [ ] 恒星系 tab：三套 fixture 都能出图，行星沿椭圆轨道走，速度档能从「实时」切到「1 年/秒」
- [ ] 恒星系 tab：行星显示放大从 1× 拉到 12×，行星与轨道比例随之变化但轨道不变
- [ ] 恒星系页：默认就是新渲染，其余面板/星门按钮/行星列表不变；`?renderer=classic` 回旧渲染
- [ ] 恒星系页：接口失败（断网或 404）时自动回落经典渲染，不白屏
- [ ] 恒星系页：每颗行星有标签，点标签或点球体都会弹出右下行星检视器（真实 3.0 行星 + 「行星页 →」）
- [ ] 恒星系页：检视器打开时该行星的替身球体隐藏（`setDetailed`），关闭后球体颜色与检视器一致（`setPlanetColor`）
- [ ] 主站进入时的超跳跃有隧道光环、速度线与轻微色散（`WarpTunnelFX`），关闭后原 `StarfieldWarpReveal` 行为不变
- [ ] 异象 tab：四个物体各自可辨（吸积盘 / 灯塔束 / 喷流 / 环面晶格），勾选框能单独关闭
- [ ] 异象 tab：点单件按钮能把镜头推近到该天体

---

## 8. 阶段 2–5 记录（全部完成）

> **2026-10-28 进展**：阶段 2、3、4、**5 全部完成**。阶段 4 的第四项（shader 变体缓存）与前三项
> （分档 / 像素比 / 离屏暂停）一起落地，见 §5.1、§5.2。**仍未做**：真机基准（需要真手机，
> 本机只能用 `?quality=low` 模拟），以及把 16 种特效纳入预热清单。

### 阶段 2：环 + 卫星 —— ✅ 已完成

1. `git show FETCH_HEAD:atlas-ui/react/static/js/3DComponents/MoonSystem.tsx > realistic3/MoonSystem.tsx`（1,804 行 / 65 KB）
2. **唯一允许的改动**：`from "../Explore/planet/realistic/glsl.ts"` → `from "./glsl.ts"`，在 `VENDOR.md` 记录
3. `RealisticPlanetView` 增加 props：`rings?: RingsData | null`、`moons?: unknown`，透传给 `RealisticPlanet`
4. 实验页加开关：环开/关、卫星数量 0–8
5. 注意：本地 2.x `MoonSystem.tsx` 是 1,672 行且被本仓库改过（中文化/时间偏移），**不要**用它替换 3.0 版

### 阶段 3：挂进真实行星页 —— ✅ 已完成（flag 默认关）

- 落点：`Layouts/__planet__.tsx` 的 3D 区域；现有 `UniversalPlanet3DWrapper` 保持不动
- feature flag：URL `?renderer=realistic` 或 localStorage 键 `atlas.renderer`，默认仍走旧渲染（可回退是硬要求）
- 数据源改造：`lightDir` 改为「恒星位置 − 行星位置」归一；`elapsed` 改为 cosmic 时钟；`secondsPerRotation` 移除
- 观测埋点：首帧耗时、稳态 FPS，便于阶段 4 对比

### 阶段 4：性能对齐 —— ✅ 完成

- octaves 分档：低端 5 / 中 6.5 / 高 7.5（`maxOctaves`）—— `perf.ts`，`?quality=` 可覆盖
- `renderer.setPixelRatio` 上限 2 → 低端机 1.5 —— `QualityProfile.maxPixelRatio`
- 离屏/不可见时暂停 rAF（IntersectionObserver）—— `pauseWhenHidden`
- **shader 变体缓存** —— 两件事：
  1. *同 family 复用*：renderer 常驻（§5.1）。旧实现在 `signature` 变化时把 renderer 一起重建，
     缓存随之清零；这是卡顿的主因，比变体数量本身更重要。
  2. *跨 family 预热*：`variantCache.ts` 用 16 个探针在 idle 里 `compileAsync`（§5.2），
     并把 `programs / warmed / ms` 暴露给角标。
- **没有纹理缓存这回事**：行星/云/环/大气全是程序化 GLSL，一张贴图都不用；唯一有纹理的是卫星
  （`MoonSystem` 里 `CanvasTexture` 程序化画出来的月面，每颗卫星一次，创建即定型，无需复用）。

---

### 阶段 6：3.0 成为默认渲染 + 恒星系交互 + 超跳跃换皮 —— ✅ 完成

| 项 | 做法 | 影响面 |
|---|---|---|
| 默认渲染切换 | `Utils/RendererFlag.tsx::readRenderer()` 默认返回 `realistic`；`?renderer=classic` 与 localStorage 仍可回旧 | 行星页 / 恒星系页同时生效；两页都保留各自失败回落 |
| 恒星系交互 | 标签 / 点选 / 行星检视器 / `setDetailed` / `setPlanetColor`（见 §10.2） | `Components/RealisticSystemStage.tsx` |
| 超跳跃换皮 | 新增 `Components/WarpTunnelFX.tsx`（2D overlay），挂在 `__main__.tsx` 的 `showWarpReveal` 生命周期里 | 原 `StarfieldWarpReveal` 一行未改，删掉新层即回原样 |

**为什么超跳跃是"加一层"而不是改 `StarfieldWarpReveal`**：那 779 行是 three.js 场景 + 自家 shader 链，
改它等于动渲染架构；三项要求（隧道体积光 / 径向色散 / 速度线）在 2D 合成层里都能做到，且 `prefers-reduced-motion`
下只画一帧静止画面。代价是它**叠在**原演出之上，不是替代 — 想要"3.0 的虫洞"仍然只有路线 B。

---

### 阶段 5：恒星 / 恒星系 / 异象（§10）—— ✅ 完成

| 子项 | 落点 | 与 3.0 的差异 |
|---|---|---|
| 恒星表面 | `realistic3/StarSurface.ts` + `Components/RealisticStarStage.tsx` | 无（仅 import 路径） |
| 恒星系 | `realistic3/SystemLayer.ts` + `systemAdapter.ts` + `Components/RealisticSystemStage.tsx` | 取消浮动原点、行星 4× 显示放大 |
| 异象层 | `realistic3/ExoticLayer.ts` + `Components/ExoticShowcase.tsx` | 独立展品、无引力透镜 |

**没做也不打算做**：星系层（需浮动原点 + Worker）、邻星层（大坐标抖动）、超跳跃（74 KB 状态机，另立项换皮）、
多元宇宙面板（2.x 的 p2pv2 已够用）、3.0 的 i18n（我方中文化已落地 53 文件）。

---

## 9. 禁止事项与坑

1. **不要 `git merge upstream/main`**，也不要 `--allow-unrelated-histories`（两库历史无关，会制造上万个冲突）。
   只允许按路径 `git show` 取文件。
2. **不要删 `3DEffects/`、`EffectRegistry`、`PlanetLayerSystem`**——上游 3.0 删了，我们没删，59 个文件依赖它们。
3. **不要给 vendored 文件加 import、加日志、改缩进**。要调试就在 `RealisticPlanetView` 里包一层。
4. **不要把 `server/` 的 `/api/v1` 数据当渲染数据**。渲染数据走的是 pymodules 的 `/api/...`（`rendering-data`），
   两套 JSON 形状完全不同。
5. **`effectKinds(data)` 与 `planetLook(data)` 必须吃同一个 data 对象**，否则特效与表面类型会不一致。
6. **工作区本来就脏**（41 M / 47 D / 35 ??，含 `atlas-ui/react/dist/` 被删）。做任何 `git checkout` /
   `git stash` 前先确认不会把这些既有改动一起卷进去。
7. **实验页不在 build input 里**：`npm run build` 不会产出 `planetlab.html`，这是有意的（不进生产包）。
   若要单独构建，在 `vite.config.mjs` 的 `rollupOptions.input` 手动加一条。
8. `tsc --noEmit` 目前项目级 0 error，**保持这个基线**；引入新错就不要声称「类型通过」。
9. **不要把 `maxPixelRatio` / `pauseWhenHidden` 之外的东西加进 runtime effect 的依赖**。
   那条 effect 一旦重跑就等于换 renderer，程序缓存全丢，「同 family 零编译」立刻失效。
   需要每帧可变的东西（octaves、转速、光照、星系核）都走 `latest` ref。
10. **预热只能跑在 idle 切片里**。`warmShaderVariants` 自己会 `yieldToMain()` 并在
   `AbortSignal` 上中断；不要为了「预热快一点」去掉这两者，那会把不卡顿换成首屏卡顿。
11. `createProbe()` 必须能独立 dispose（`scene.children` 归零）。新增探针前先跑
   `npm run check:shaders`，它会验证 family define 正确、程序不重复、dispose 干净。
12. **`SystemLayer.update()` 之后那行 `root.position.set(0, 0, 0)` 不能删**。它是把 explorer 的
   浮动原点（相机在原点）抵消成「相机绕系统转」，删了整页会飘走。`ExoticLayer` 同理，用的是
   `root.position.copy(camera.position)`。
13. **恒星系页必须保留回落**：`RealisticSystemStage` 在接口失败 / 无 WebGL 时回调 `onFallback`，
   父组件据此切回 `SolarSystem3DViewerLeft`。删掉这条等于让 2.x 的一个页面白屏。
14. **`starTint()` 的颜色表要和 vendored `SystemLayer` 里的 `STAR_TINTS` 保持一致**（现在两处各有一份，
   因为 vendored 文件不许导入我方模块）。改一处要改两处，否则单颗恒星展台与恒星系里的同一颗星颜色不同。

---

## 10. 其他子系统（星系 / 恒星系 / 现象 / 超跳跃 / 多元宇宙）

范围外的问题一律先看这一节。**结论：近景可移植且已移植；远景与演出不可移植。**

3.0 的远景全部建立在同一个前提上：单一连续 3D + 浮动原点 + 相机距离分级 LOD + Web Worker。
`GalaxyLayer` 直接 `import { GLOW_LAYER } from "../engine/Engine.ts"`，而 Engine 就是浮动原点与 HDR 的宿主。
拆其中任何一件，都得连带拆整条链 —— 那就是路线 B（30–40 人日），不是路线 A 的增量。

### 10.1 依赖实测与现状

| 模块 | 3.0 文件（字节） | 外部依赖 | 判定 |
|---|---|---|---|
| 行星表面 | `planet/realistic/*` 143 KB | three + NOISE | ✅ 已移植（阶段 1–4） |
| **恒星表面** | `system/StarSurface.ts` 10,428 | three + NOISE（已 vendor） | ✅ **已移植**（`realistic3/StarSurface.ts`，0 改动除 import） |
| **恒星系** | `system/SystemLayer.ts` 17,681 | `api.ts` 类型 · `Utils/OrbitalMechanics.ts` 1,482 · `planet/planetColors.ts` 3,829 · `core/hash.ts` 2,064 · StarSurface | ✅ **已移植**（类型拆到 `systemTypes.ts`，其余 4 个文件整搬） |
| **异象现象** | `galaxy/ExoticLayer.ts` 28,287 | GalaxyModel 类型 + `core/hash.ts` + `core/torus.ts` 7,043 + NOISE | ✅ **已移植**（做成独立展品，不放进星系） |
| 星系数据 | `galaxy/GalaxyModel.ts` 21,309 | 仅 `core/hash.ts` | ✅ 整文件搬了（`ExoticLayer` 要它的 `PointOfInterest`）；渲染未做 |
| 星系层 | `GalaxyLayer.ts` + `GalaxyLod.ts` + `SpatialIndex.ts` + `galaxy.worker.ts` | **`engine/Engine.ts::GLOW_LAYER`** + Worker | ❌ 焊死在浮动原点 |
| 邻星层 | `galaxy/NeighborLayer.ts` 20,423 | three + hash + `api.ts` Coordinates | ❌ 坐标量级需浮动原点，否则抖动 |
| 超空间跳跃 | `engine/Navigator.ts` + `Engine.ts` + `ShipView.ts` | explorer 状态机 | ❌ 不移植，自研换皮（未做） |
| 多元宇宙面板 | `ui/MultiversePanel.tsx` 14,812 | ContentFilter / SeedSanitizer / ui/kit / ui/universe / i18n | 🟡 功能已有，收益低 |

### 10.2 已做：落点、接口、与 3.0 的三处偏差

**恒星表面** —— `realistic3/StarSurface.ts`（vendored）+ `Components/RealisticStarStage.tsx`（我方）

- 导出照旧：`starLook(type, tint): StarLook`、`class StarSurface`（`.surface` 材质、`.corona` billboard、`.update(time, near)`、`.dispose()`）。
- 挂载点：`RealisticStarStage` 是独立展台（类型 / 颜色 / 半径 / seed / 日冕强度可调），可用于恒星系页的「看恒星」tab、坐标详情页展品或 `systemlab.html`。
- 数据缺口（**仍在**）：2.x 只有 `stars[].{Type,Color,Size}`，没有 3.0 的 `tint`。`starTint()` 用 3.0 同一张颜色表（red/yellow/blue/orange/white/purple）兜底。

**恒星系** —— `realistic3/SystemLayer.ts`（vendored）+ `systemAdapter.ts` + `Components/RealisticSystemStage.tsx`

- **数据契约几乎现成**：2.x 的 `GET /api/system/rendering-data` 已经给 AU 轨道、`initial/current_orbital_angle`、`eccentricity_factor`、`surface_temperature` 和 `timing`。缺的只是簿记 —— `system.index`、`planets[].index`、`stars[].Size` 是字符串 → 数字、`elements`/`stargate_url` 缺失。`systemAdapter.ts` 就是这层。
- **适配器的正确性已对拍**：`npm run check:system` 用三套 fixture 逐颗行星复算后端的
  `initial + ω·(current_time − cosmic_origin_time)`，与 payload 里的 `current_orbital_angle` 差 < 1e-9（13 颗）。
- **落点**：`SystemVisualizationUniversal` 里按 `?renderer=realistic` 二选一，替换 `SolarSystem3DViewerLeft`；经典渲染下方加「试用真实渲染 →」。失败（接口 404 / 无 WebGL）自动回落经典渲染。
- **三处刻意偏差**（都要在验收时认）：
  1. **取消浮动原点**：`SystemLayer.update` 会把 `root.position` 设成 `-cameraLocal`（explorer 的相机在原点）。页面里是一次 `layer.root.position.set(0,0,0)` 抵消，于是 OrbitControls 正常绕系统转。
  2. **行星额外放大 4×**（`planetScale`，可调）：上游本身已放大 80×，但在 1.9×外轨半径的取景下行星只有 4 px。放大同时改 `body.radius`，保持点选一致。
  3. **恒星 `near` 由相机距离决定**（上游逻辑），远景时只剩光晕、日冕淡出 —— 这正是 3.0 的行为，不是 bug。
- **交互（阶段 6 已接）**：
  - **行星标签**：每颗行星一个绝对定位 chip，每帧 `Vector3.project` 后改 `transform`（不经过 React，不触发重渲染），背向/出框自动淡出。
  - **点选**：`pointerup` 位移 < 6px 才算点击，交给 `SystemLayer.pickBody()`；命中行星则打开右下的**行星检视器** —— 里面是真正的 `RealisticPlanetView`，并给「行星页 →」链接（`/planet/<name 小写>`）。
  - **`setDetailed([index])`**：检视器打开时把该行星的替身球体隐藏，避免"两个行星"叠在一起。
  - **`setPlanetColor(index, color)`**：点选时拉一次 `/api/planet/<name>/rendering-data`，用 `planet_info.base_color` 重绘替身球体，关闭检视器后不会"变色"。
- **仍缺**：多恒星系统的标签只标行星（恒星没有 chip）、行星自转轴倾角未按 `axial_tilt` 应用到替身球体。

**异象现象** —— `realistic3/ExoticLayer.ts`（vendored）+ `Components/ExoticShowcase.tsx`（我方）

- 四类物体全保留：黑洞吸积盘（相对论集束）、脉冲星（灯塔束 + 风星云体积光 + 磁层）、类星体双极喷流、奇点环面的原初环面 + 3×3×3 晶格回响。
- **不放进星系**：3.0 用星系点坐标放置，2.x 没有等价坐标系。这里手写 4 个 POI 位置做成「天体展品」，可单选聚焦，间距与聚焦距离是手调的艺术参数。
- 同样的浮动原点抵消：`update()` 把物体摆到 `poi − camera`，之后 `root.position.copy(camera)` 还原成绝对坐标。
- **未做**：引力透镜（3.0 在 tonemap pass 里做，需要 HDR 管线）、beacon 的屏幕空间尺寸自适应（用了上游默认）。

**共享的方向**：`RealisticStarStage` / `RealisticSystemStage` / `ExoticShowcase` 都复用 `perf.ts` 的像素比上限；
恒星系与异象各自持有一个长期存活的 renderer（同 §5.1 的理由），只有卸载才 dispose。

### 10.3 路线 A 的天花板（已达成）

| 增量 | 人日 | 累计 | 状态 |
|---|---:|---:|---|
| 行星表面（阶段 1–4 含缓存） | 4–6 | 4–6 | ✅ |
| 恒星表面 + 恒星系 | 3.5–5.5 | 8–11.5 | ✅ |
| 异象层（脉冲星/吸积盘/类星体/环面） | 2–3 | 10–14.5 | ✅ |

10–14.5 人日换到的是**近中景质感**。拿不到的是：从星系俯冲进行星的连续镜头、数十亿可拾取恒星的星系、
超跳跃的完整演出 —— 因为路线 A 保留了 2.x 的「换页」模型。要那个体验只有路线 B，没有中间路线。

---

---

## 11. 一页速查

```
上游 tip          2a9ec243 (v3.0.2)
基线              9576e52 (v2.10.434)
内核              realistic3/ 六件套（禁改，3,190 行）
适配              realistic3/adapter.ts + RealisticPlanetView.tsx（禁删，384 行）
缓存              realistic3/variantCache.ts · 16 探针 / 22 程序 · 第 2 帧后 idle 预热
程序缓存键        shader 源码 + defines（three 的 WebGLPrograms，挂在 renderer 上）
性能实测          npm run check:shaders（无 GPU，验 16 探针/dispose/定义）
实验页            npm run dev → /planetlab.html（环 / 卫星已可调）
渲染开关          默认 realistic（阶段 6）· ?renderer=classic 回旧 · localStorage[atlas.renderer]
恒星系交互        标签 + 点选 → 行星检视器（RealisticPlanetView）+ setDetailed / setPlanetColor
超跳跃            Components/WarpTunnelFX.tsx（2D overlay，叠在原演出上，可单独删）
质量分档          ?quality=low|mid|high · 默认按 cores/DPR 自动
类型检查          tsc --noEmit -p tsconfig.json → 0 error
环                直接透传 planetData.rings，不要换算单位
卫星              ✅ 已 vendor（1 行 import 改动）+ moons.ts 合成数据
恒星              3.0 StarSurface 只依赖已 vendor 的 NOISE → 0.3 人日（未做）
恒星系            需另搬 OrbitalMechanics + planetColors + hash，3–5 人日
星系/邻星         不做（需浮动原点 + Worker LOD）
超跳跃            不移植，改 2.x 的 warp 美术，0.5–1 人日
天花板            路线 A ≈ 10–14.5 人日，拿不到连续宇宙
恒星表面          realistic3/StarSurface.ts + Components/RealisticStarStage.tsx（可调类型/色/日冕）
恒星系            realistic3/SystemLayer.ts + systemAdapter.ts + RealisticSystemStage.tsx
恒星系数据        /api/system/rendering-data（已够用）→ 补 index / Size 数字 / timing 兜底
恒星系偏差        取消浮动原点（root.position=0）· 行星 4× 显示放大 · 未接点选与标签
异象层            realistic3/ExoticLayer.ts + torus.ts + GalaxyModel.ts → Components/ExoticShowcase.tsx
异象取舍          独立展品（手写 POI 位置）· 无引力透镜（要 HDR tonemap）
实验页            /systemlab.html（恒星 / 恒星系 / 异象）
校验              npm run check:render（适配器对拍 13 颗行星 + 三层构建/更新/dispose）
不要做            整体 merge 3.0 / 删 3DEffects / 改 server/ / 改 vendored 文件
                  也别把 renderer 塞回 signature 依赖（会毁掉程序缓存）
```

