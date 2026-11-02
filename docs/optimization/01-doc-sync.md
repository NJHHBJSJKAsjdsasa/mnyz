# 01 · 文档与代码一致性自动化

> 现状：**代码全对，文档靠人肉对齐。** 2026-11-02 手工交叉核对，在 6 份文档里发现 12 处漂移
> （迁移 head、迁移表缺 14 条、蓝图数、前端文件/行数、样式方案、已删组件）。
> 已有的三个闸门（契约 / 模块边界 / 前端规则）**都不检查「文档里写的数字」**，所以这类错误只能靠人。

> **实施状态（2026-11-02）：已落地。**
> `scripts/doc_facts.py` 有 `--list` / `--write` / `--check` 三种模式，注册 10 个事实，
> 6 份文档已加锚点，`--check` 已进 `boundaries` job。
> 闭环验证：把 `374` 改写成 `370`（锚点与可见文字同时改）→ `--check` 退出 1 并指出 `TASK-BACKLOG.md:13`；
> `--write` 自动改回 374，`diff` 与改前完全一致。
> 反向验证（只改可见文字、锚点不动）→ `--check` 报 `anchor ok, visible text missing it`，
> `--write` 拒绝假装成功，提示需要人工。

---

## 1. 问题拆解

漂移不是「忘了改」，而是**同一个事实存在多份手抄副本**：

| 事实 | 现在写在哪 | 手抄份数 |
|---|---|---|
| 迁移 head | `server/config.py`（真源）| README ×2、TASK-BACKLOG、frontend-redesign/README、render-transplant/README |
| 端点 / 蓝图数 | `docs/api/endpoints.md`（已生成）| README、frontend-redesign/README、10 / 08、render-transplant |
| 前端文件 / 行数 | 无真源，谁算谁写 | TASK-BACKLOG、frontend-redesign/README、05、00 |
| 测试数 | 无真源 | README ×2 |
| 模块数 / 基线越界数 | `ownership.py` / `boundaries_baseline.json`（真源）| module-dependencies |

**成功案例已经有了**：`docs/api/endpoints.md` 由 `scripts/gen_api_docs.py` 生成、`--check` 进 CI、
运行 `--check` 会报 `[ok] api docs match the code`。它从来没有漂移过。
**把它复制到其他事实，就是本文的全部内容。**

---

## 2. 三条规则

### R1 文档分级

| 级别 | 定义 | 谁来改 | 怎么守 |
|---|---|---|---|
| **L1 生成物** | 内容完全由脚本产出 | 谁都不许手改 | 头部写「本文件由 X 生成，不要手改」，CI `--check` |
| **L2 事实型** | 正文叙述 + 少量**可校验数字** | 人写，数字由脚本核对 | `<!--fact:key-->` 标记，CI 校验 |
| **L3 叙述型** | 设计、复盘、踩坑记录 | 人自由写 | 不校验，但**必须带日期**、过期要标「已被 X 取代」 |

现在只有 L1（`endpoints.md` / `openapi.json`）和事实上的全 L3。**缺 L2。**

### R2 L2 用标记，不用猜

在 Markdown 里给需要校验的数字加**行内标记**，脚本只认标记过的：

```markdown
当前迁移 head：`0140_investor_protection` <!--fact:migrations.head-->
后端 **26 个**蓝图 / **255 个**端点 <!--fact:api.blueprints--> <!--fact:api.endpoints-->
前端 **374 文件 / 91,307 行** <!--fact:frontend.ts_files--> <!--fact:frontend.ts_lines-->
```

标记语义：**「此处展示的值必须等于真源算出来的值」**。渲染时标记不可见（HTML 注释），
`--check` 时逐条比对，不等就打印 `文件:行: 期望 255，实际 256` 并退出 1。

> 为什么不用模板变量整页渲染：文档是人读的，通篇占位符会毁掉可读性；行内标记只覆盖真正会变的数字。

### R3 历史快照必须带日期

「239 个文件的处置清单」「2026-10-28 实测」这类**故意保留历史值**的叙述，
**禁止加 fact 标记**，但必须写日期（如 `（2026-10-28 基线）`）。
否则半年后没人分得清这是当前值还是考古现场——这正是 `05-component-inventory.md` 现在的状态。

---

## 3. 事实注册表

新增 `scripts/doc_facts.py`，只做「算」这一件事；`scripts/check_doc_facts.py` 做「比」。

| key | 真源 / 算法 | 注意 |
|---|---|---|
| `migrations.head` | `server/config.py::DEFAULT_REVISION` | 权威，别读目录名排序 |
| `migrations.count_versioned` | `server/migrations/versions/0*.py` 计数 | 排除 `__pycache__` |
| `api.blueprints` | `ls server/api/v1/*.py` 减 `__init__` | 26 |
| `api.endpoints` | **复用 `gen_api_docs` 的已注册表**，不要重写扫描逻辑 | 两条路径必须同源，否则又是新副本 |
| `modules.count` | `len(infra.ownership.MODULES)` | 14 |
| `boundaries.baseline` | `len(boundaries_baseline.json)` | 7 |
| `jobs.count` | `len(jobs.beat_schedule.SCHEDULE)` | 34 |
| `frontend.ts_files` | `find atlas-ui/react/static/js -name '*.ts' -o -name '*.tsx' \| wc -l` | 374 |
| `frontend.ts_lines` | 同上 `-print0 \| xargs -0 cat \| wc -l` | 91,307；**必须** `xargs -0 cat`，`-exec wc -l {} +` 只取最后一批 |
| `tests.functions` | `grep -rho 'def test_[a-z_0-9]*' tests \| wc -l` | 323，参数化未展开 |

**判据**：新增一个迁移，只改代码 + 跑 `python scripts/doc_facts.py --write`，
6 份文档里的 fact 标记全部对齐；`--check` 在 CI 里是红的如果没跑。

---

## 4. 接入点

```bash
# 生成（本地，改完代码后跑一次）
python scripts/doc_facts.py --write

# 校验（CI，失败即阻断）
python scripts/doc_facts.py --check
```

CI 放在已有的 `boundaries` job 里（它已经装了 Python、不需要数据库、几秒就跑完）：

```yaml
- name: API docs are generated, not hand-edited
  run: python scripts/gen_api_docs.py --check
- name: Doc facts match the code          # 新增
  run: python scripts/doc_facts.py --check
```

**验收（必须做）**：故意把 `README.md` 的 `255` 改成 `256`，本地跑 `--check` 必须退出码 1 并指出行号。
不改这一步，就等于没做。

---

## 5. 顺带解决的三件事

### 5.1 取代关系登记（`docs/INDEX.md`）

现在「哪份文档是权威」散落在各文档头部的引言里：15 取代 14、16 取代 02 的壳结构、01–13 只剩结构契约。
建议新增 **一页 `docs/INDEX.md`**，只列三列：`文档 / 状态（现行·已取代·历史）/ 取代者`。

判据：新人（或未来的你）打开 `docs/`，30 秒内知道该读哪份、哪份别看。

### 5.2 死文件检测

这次发现 `15-game-hud.md` 声称 `HeroPanel.tsx`（212 行）已删，实际还在磁盘上、零 import。
建议纳入 CI：`npx ts-prune` 或 `knip` 扫零引用导出，输出到 artifact，**先只报告不阻断**，
积累一轮再决定是否阻断。

### 5.3 文档里的「完成状态」不许裸写

TASK-BACKLOG 之外的文档里出现过「结构方案，不改任何代码」这种**写于开工前、完成后没回填**的声明。
规则：**任何方案文档在开写时就加一行 `状态：方案 / 进行中 / 已实施（日期）`**，实施完成后改这一行。
16 号文档这次就是靠人工发现的。

---

## 6. 判据汇总

| # | 判据 | 验证 |
|---|---|---|
| 1 | `scripts/doc_facts.py` 存在，`--write` / `--check` 两个模式可用 | 本地跑通 |
| 2 | 至少 6 个 key 覆盖（head / 蓝图 / 端点 / 前端文件 / 前端行数 / 测试数） | 注册表 |
| 3 | 6 份文档里的当前值都带 fact 标记 | `grep -c 'fact:' docs/**/*.md` |
| 4 | CI 里 `--check` 失败会阻断 | 故意改错一个数字，PR 变红 |
| 5 | 历史快照全部带日期，且不带 fact 标记 | 抽查 05 / 10 / 08 |
| 6 | `docs/INDEX.md` 存在，取代关系可查 | 人工 |
