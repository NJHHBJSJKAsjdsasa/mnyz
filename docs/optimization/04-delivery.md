# 04 · 交付与工程流程

> 直接动因：2026-11-02 提交前，`git status` 有 **499 个变更条目、217 个未跟踪文件**——
> 整个「壳统一 P0–P6」+「迁移 0127–0140」从未入库。这是本文档最重要的背景。
> 代码没错，**是流程让它长期悬空**。

---

## 1. CI 现在漏了什么（P0）

`.github/workflows/server.yml` 有两个 job：`boundaries`（契约 + 边界）、`test`（migrate + compileall + pytest）。问题：

| 缺口 | 后果 |
|---|---|
| **前端闸门不在 CI** | `check_frontend_gates.py` 只在本地跑，等于没有。它能挡的（v1 直连、`Shell/**` 里 `fetch(`、blur 预算、单文件行数）全都能悄悄回退 |
| **`paths` 不含 `atlas-ui/**`** | 只改前端时 CI 完全不触发 |
| `npx tsc --noEmit` 不在 CI | 08 §验收要求「零错误，不得回退」，但没人守 |
| `vite build` 不在 CI | 构建坏了要等部署才发现 |
| `check:render` / `check:arecibo` 不在 CI | 3D 与 Arecibo 的指纹校验只靠自觉 |

**建议新增一个 `frontend` job**（不需要数据库，3–5 分钟）：

```yaml
frontend:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: "22", cache: npm }
    - run: npm ci
    - run: npx tsc --noEmit
    - run: python scripts/check_frontend_gates.py
    - run: npm run check:render
    - run: npm run check:arecibo
    - run: npx vite build --outDir dist_check --emptyOutDir
```

并把 `paths` 补上 `atlas-ui/**`、`scripts/**`、`package.json`、`tailwind.config.js`、`docs/api/**`。

**判据**：故意把一处 `fetch('/api/...')` 写进 `Shell/`，PR 必须变红。
**验证**：开一个测试 PR，把 `Shell/GameFrame.tsx` 加一行 `fetch(`，看 `frontend` job 是否失败。

> **实施状态（2026-11-02）：已落地，并顺带修了一个更严重的问题。**
> `frontend` job 已加入（tsc / 闸门 / test:frontend / check:render / check:arecibo / build），
> `paths` 已补 `atlas-ui/**`、`scripts/**`、`docs/**`、`package*.json`、`tailwind.config.js`。
>
> **但原来的 workflow 根本无法被 GitHub 解析**：`- name: Module boundaries (R1: no cross-module writes)`
> 里的裸 `name: value: value` 是非法 YAML（未加引号的标量中出现 `: `），
> `yaml.safe_load` 直接抛 `mapping values are not allowed here`。
> 也就是说 CI 一直是**幽灵闸门**——文件在仓库里，但从未真正跑过。
> 已给该 `name` 加引号，三个 job 现在都能被解析（`yaml.safe_load` 通过，jobs = boundaries / frontend / test）。
> 教训：**workflow 文件本身也要被校验**，建议在 PR 模板或本地钩子里跑一次 YAML 解析。

---

## 1.5 首次真正跑通的记录（2026-11-02，值得留着）

> 上面那段「幽灵闸门」的判断**是错的，已更正**：GitHub 一直能解析这个 workflow。
> 远端实际有 9 次运行记录（2026-10-27 → 10-28），**9 次全红**，全部卡在 `Install` 步。
> 真正的坑是下面这五个，修完才第一次全绿（run `41412962886`，head `2c3a23d`，三个 job 全 success）。

| # | 症状 | 真因 | 修法 |
|---|---|---|---|
| 1 | 9 次运行全挂在 `Install` | `redis==8.1.0` 与 `celery[redis]<6` 互斥（celery 要求 `redis<6`），pip `ResolutionImpossible` | `redis>=5.0,<6` |
| 2 | `frontend` 的 Logic smoke 红 | `node_modules/esbuild/bin/esbuild` 在 Linux 是**原生 ELF**，被 `node` 执行报 `Invalid or unexpected token`（Windows 上是 JS shim，本地永远绿）| 改用 esbuild JS API，并把 esbuild 写进 devDependencies |
| 3 | `api docs drift`（本地却绿）| 4 个**重名请求模型**（`SplitRequest` ×2、`ClaimRequest` ×2）用类名做 schema key，后加载覆盖先加载；**覆盖方向取决于 `glob()` 顺序，Windows 与 Linux 不同** | 改名 4 个类 + `_import_models` 加重名检测 |
| 4 | 25 个集成测试 setup 就失败 | `.env.server` 在 .gitignore 里，CI 没有 JWT 密钥 | conftest 会话级生成 RSA 密钥 |
| 5 | 4 个 antitrust 测试红，端点 500 | `domain/antitrust.py` 漏 `from ..infra.serialize import day` | 补导入 |

**方法论沉淀（比这 5 个修复更值钱）**

1. **远端日志匿名用户 403** —— 但 `GET /repos/{o}/{r}/check-runs/{id}/annotations` 是公开的。
   所以把失败步骤包一层，用 `::error title=xxx::$MSG` 把日志转成 annotation，就能远程定位。
   workflow 里 API docs / doc facts / frontend smoke / pytest 四处都这么做。
2. **本地绿 + CI 红，先怀疑环境差异，不要怀疑逻辑**：文件系统顺序、行尾、`bin` 是 JS 还是 ELF、
   有没有本地才存在的 dotfile。这次 3 个问题里有 2 个属于这一类。
3. **集合类的东西要用「同名冲突」检测兜住**：schema/注册表按名字做 key 时，重名不会报错，只会静默覆盖。
4. **不要在同一个测试库上并发跑两个 pytest**：会因事务重试耗尽返回 503，看起来像业务 bug。

---

## 2. `dist` 该不该入库（P1，最影响历史可读性）

**现状**：`atlas-ui/react/dist` 在版本库里，3.3 MB / 89 个 js。
每次 `vite build` 后文件名带 hash 全变——这次就是 **176 个 dist 条目**混在源码提交里，
`git log` 再也看不出「哪个提交改了什么功能」。

**三个选项**

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| **A（推荐）** | `dist/` 移出库，加 `.gitignore`；Docker 多阶段构建里跑 `vite build` | 历史干净、无二进制 diff | 本地跑页面要先 build；部署链路必须能构建 |
| B | 保留入库，但加 CI 校验：`dist/.vite/manifest.json` 与源码 mtime/hash 一致，不一致就失败 | 改动小 | 每次改前端都要提交 176 文件 |
| C | 保留但单独 commit（`chore(dist): rebuild`） | 源码 diff 干净 | 仍是噪音，只是被分隔 |

**为什么推荐 A**：`Dockerfile.server` 已经存在，加一个 `node:22` 的 build stage 即可；
而「服务启动只读一次 manifest」这个坑，在多阶段构建下反而消失（构建与启动同镜像）。

**迁移步骤**
1. `git rm -r --cached atlas-ui/react/dist`，`.gitignore` 加 `atlas-ui/react/dist/`；
2. `Dockerfile.server` 加 build stage，产物拷进 runtime 镜像；
3. `README` 补一句「本地跑页面：`npx vite build` 后重启 Flask（manifest 只在启动时读）」；
4. 保留 `dist_check/`（已在 `.gitignore`）用于构建校验。

**判据**：`git ls-files | grep dist/` 为空；`docker build -f Dockerfile.server .` 成功且镜像内含 manifest。

> **实施状态（2026-11-04）：按方案 A 落地，并顺带发现镜像一直是坏的。**
>
> 1. `.gitignore` 加 `/atlas-ui/react/dist/`，`git rm -r --cached` 移出 97 个文件（磁盘保留）。
> 2. **`Dockerfile` 原本就构建不出能跑页面的镜像**：`.dockerignore` 里写着
>    `atlas-ui/react/dist`（`ea8eedd` 那次一起加的），于是 `COPY . /app_defaults` 永远拷不到产物，
>    容器里没有 `.vite/manifest.json`，页面直接白屏。也就是说「dist 入库」这件事
>    一直只是在给**本地开发**供血，Docker 那条路其实是断的。
>    现在加了 `node:22-slim` 的 `ui` 阶段（先 `COPY package*.json` 再 `npm ci`，保住依赖层缓存），
>    产物用 `COPY --from=ui` 注入 `/app_defaults/atlas-ui/react/dist`。
> 3. `README` §5.3 补了两句：新克隆要先 `npx vite build`；Flask 只在启动时读 manifest，
>    重建后必须重启。
> 4. 验证：`git ls-files | grep dist` = 0；本地 `dist` 仍完整（93 条 manifest、94 个资源引用、0 缺失），
>    页面不受影响；`dist_check/` 仍是 CI 的构建校验目录。
>
> **未验证**：`docker build` 本身——本机 Docker daemon 没起。这条要等有 Docker 的环境确认。

---

## 3. 提交粒度与分支（P0）

**现状**：一次补提交 4 个 commit、499 条目。说明平时**攒着不提交**。
这带来的不是「不好看」，而是：
- 出问题无法 `git bisect`（一个 commit 里塞了半个季度的东西）；
- 回滚只能整块回滚；
- 文档与代码的对齐在提交那一刻已经无法还原（这次就是靠人肉重新核对）。

**建议**
1. **trunk-based**：小步提交到 `main`，功能大改才开 `feat/*` 分支；
2. **一个 T-xx 一个 commit**，commit message 首行带编号（`feat(ui): T-67a 面板骨架`）；
3. 每完成一个迁移批次就提交一次，不要等「全部做完」；
4. PR 模板加三行检查：跑过闸门 / 文档数字是否受影响 / 是否新增零引用文件。

**判据**：单次提交的文件数 ≤ 50（dist 除外）；`git log --oneline | wc -l` 与本季度任务数同量级。

---

## 4. 版本、tag 与 CHANGELOG（P2）

**现状**：`package.json` 是上游的 `2.10.434`，`CHANGELOG.md` 顶部补了 `[Unreleased] — mnyz 分支`。
后端没有自己的版本号。

**建议**
1. 本分支独立版本线：`mnyz-0.x.y`，与上游 `2.10.x` 分开，避免合并上游时冲突；
2. 每个里程碑打 tag（如 `mnyz-0.4.0 / 0110-0140 经济系统完成`）；
3. `CHANGELOG` 的 `Unreleased` 段在发版时改名，不删内容；
4. 迁移 head 写进 release note——部署时一眼知道要跑哪些迁移。

**判据**：`git tag` 有里程碑 tag；每个 tag 的 CHANGELOG 段落完整，且 head 与 `config.py` 一致。

---

## 5. 部署与回滚（P2）

**现状**：`docker-compose.server.yml` + `entrypoint.sh` + `koyeb_init.sh`。
已知的坑：**manifest 只在进程启动时读**，构建完不重启就是白屏。

**建议写进运维脚本，别靠记忆**
1. `entrypoint.sh` 顺序固定：`migrate` → 自检 `/health/ready`（版本匹配）→ 启动；
2. 回滚 = 「镜像回退 + 迁移不动」还是「迁移回退」要**明确写下来**：
   加了列的迁移通常向后兼容，建议**只回滚镜像、不回滚迁移**；
3. 发布前跑一次 `ops/k6/collect.js` 基线，记录 p95，异常就不发。

**判据**：`docs/optimization/runbook.md` 存在，含「发布 / 回滚 / 迁移失败 / 白屏」四个场景的逐步操作。

---

## 6. 环境与配置（P3，容易反复咬人）

| 坑 | 现状 | 做法 |
|---|---|---|
| 两个进程、两个端口 | 页面 `__main__.py`（默认 6424，取自 `ATLAS_PORT`）、API `python -m server.run`（8000）| 写进 README 的「本地起服务」一节，含端口探测命令 |
| CORS 静默失败 | `.env.server` 的 `ATLAS_CORS_ORIGINS` 必须含实际 origin | 启动时打印实际 origin 白名单；不匹配时 `/health/deep` 给 warning |
| 前端 404 静默 | `static/*` 只白名单 favicon，新目录不加白名单就 404 | 字体已走 Vite 发哈希规避；新静态资源优先走 import |

**判据**：新人按 README 从零到能打开首页 ≤ 15 分钟，不需要问人。
