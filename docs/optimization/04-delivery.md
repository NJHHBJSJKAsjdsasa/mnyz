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
