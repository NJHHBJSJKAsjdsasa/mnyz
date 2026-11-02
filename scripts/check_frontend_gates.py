#!/usr/bin/env python
"""Front-end gates from ``docs/frontend-redesign/07-frozen-contract.md`` §5.

Two checks that used to be copy-pasted ``grep`` pipelines in the doc, now in one
place so the numbers cannot drift:

1. **No direct ``/api/v1`` calls outside ``ServerApi.tsx``.** Everything must go
   through the wrapper, otherwise it loses 401 retry, base URL and the
   ``If-Match`` / ``Idempotency-Key`` headers.
2. **Legacy ``/api/*`` calls stay on the frozen list.** These are the 3D data
   plane and the pre-server endpoints; they are allowed, but an *extra* one is a
   new coupling that nobody signed off on.
3. **Shell components never fetch.** ``Shell/**`` reads data through
   ``ShellProvider`` only (05 §5.1). A ``fetch(`` in that directory means a region
   just grew its own poller, which is exactly the drift the provider exists to
   prevent.

The looping-animation count is reported but never fails the build: the target
(§P4) is a design cleanup, measured by whoever does P4, not a merge gate.

Usage::

    python scripts/check_frontend_gates.py           # human output
    python scripts/check_frontend_gates.py --quiet   # exit code only
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS = ROOT / "atlas-ui" / "react" / "static" / "js"

#: The single file allowed to talk to ``/api/v1`` directly.
SERVER_API = "Utils/ServerApi.tsx"

#: Directories exempt from the backdrop-blur budget (rendering spectacle, 07 §1).
BLUR_EXEMPT_DIRS = ("3DComponents/", "3DEffects/")
#: Half-frozen files (07 §1.3) — counted in the denominator but not the budget.
BLUR_EXEMPT_FILES = ("StarfieldWarpReveal", "PlanetVisualizationUniversal", "MultiverseTransitionCanvas")

#: Hard cap from 01 §5.2 / T-66. Blur is a full-screen GPU pass; only overlay hosts
#: (Modal / Drawer / CommandPalette / Select) may use it, and they do it through the
#: `.surface-overlay` token class rather than a Tailwind utility. The remaining sites
#: counted here are the 3D viewer overlays, which belong to the frozen render plane.
BLUR_BUDGET = 12

#: Directory whose components must read data through the provider, never fetch.
SHELL_PREFIX = "Shell/"

#: Non-rendering files have no reason to pass this many lines. The 2026-10-29
#: refactor split `LifeAreciboTranslator` (4,515) into eight modules and cut
#: `SpaceshipPanel` (907 → 224); the gate exists so that does not undo itself.
#: Rendering directories and the half-frozen overlays are exempt for the same
#: reason they are exempt from the blur budget: they are a different plane.
SIZE_BUDGET = 1200
#: Render-plane files that live outside the two 3D directories but belong to the
#: same frozen layer (they are the viewers the 07 §1 freeze is about).
SIZE_EXEMPT_NAMES = ("3DViewer",)

#: Legacy endpoints frozen by 07 §3.19. A new entry here needs a doc change.
FROZEN_LEGACY = {
    "/api/planet/",  # rendering-data (3D data plane)
    "/api/system/rendering-data",
    "/api/universe/config",
    "/api/generate-random-location",
    "/api/arecibo",
    "/api/p2p/",
    "/api/p2pv2/",
}

FETCH_ANY_CALL = re.compile(r"\bfetch\s*\(")
FETCH_V1 = re.compile(r"fetch\(\s*[`\"']/api/v1/")
FETCH_ANY = re.compile(r"fetch\(\s*[`\"'](/api/[^`\"']*)")
LOOP_ANIMATION = re.compile(r"animate-(pulse|spin|bounce|ping)\b")
FROZEN_3D_DIRS = ("3DComponents/", "3DEffects/")


def _iter_sources():
    for path in JS.rglob("*"):
        if path.suffix not in (".tsx", ".ts", ".jsx", ".js"):
            continue
        if "node_modules" in path.parts:
            continue
        yield path


def scan() -> dict:
    v1_direct: list[tuple[str, int]] = []
    shell_fetch: list[tuple[str, int]] = []
    blur_total = 0
    blur_budgeted = 0
    legacy: dict[str, list[tuple[str, int]]] = {}
    animations = 0
    animations_3d = 0
    oversized: list[tuple[str, int]] = []
    largest: list[tuple[int, str]] = []

    for path in _iter_sources():
        rel = path.relative_to(JS).as_posix()
        text = path.read_text(encoding="utf-8", errors="ignore")
        lines_count = text.count("\n") + 1
        exempt = (
            rel.startswith(FROZEN_3D_DIRS)
            or any(name in rel for name in BLUR_EXEMPT_FILES)
            or any(name in rel for name in SIZE_EXEMPT_NAMES)
        )
        if not exempt:
            largest.append((lines_count, rel))
            if lines_count > SIZE_BUDGET:
                oversized.append((rel, lines_count))

        for lineno, line in enumerate(text.splitlines(), start=1):
            if FETCH_V1.search(line) and rel != SERVER_API:
                v1_direct.append((rel, lineno))
            if rel.startswith(SHELL_PREFIX) and FETCH_ANY_CALL.search(line) and not line.strip().startswith(("//", "*")):
                shell_fetch.append((rel, lineno))
            if "backdrop-blur" in line or "backdropFilter" in line:
                blur_total += 1
                if not rel.startswith(BLUR_EXEMPT_DIRS) and not any(name in rel for name in BLUR_EXEMPT_FILES):
                    blur_budgeted += 1
            for match in FETCH_ANY.finditer(line):
                url = match.group(1)
                if url.startswith("/api/v1"):
                    continue
                key = next((prefix for prefix in FROZEN_LEGACY if url.startswith(prefix)), url)
                legacy.setdefault(key, []).append((rel, lineno))
        hits = len(LOOP_ANIMATION.findall(text))
        animations += hits
        if rel.startswith(FROZEN_3D_DIRS):
            animations_3d += hits

    return {
        "v1_direct": v1_direct,
        "shell_fetch": shell_fetch,
        "blur_total": blur_total,
        "blur_budgeted": blur_budgeted,
        "legacy": legacy,
        "animations": animations,
        "animations_frozen": animations_3d,
        "oversized": oversized,
        "largest": sorted(largest, reverse=True)[:3],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    if not JS.exists():
        print(f"[fail] 找不到前端目录：{JS}")
        return 1

    result = scan()
    problems: list[str] = []

    for rel, lineno in result["v1_direct"]:
        problems.append(f"直连 /api/v1：{rel}:{lineno}（应走 ServerApi.request）")

    for rel, lineno in result["shell_fetch"]:
        problems.append(f"外壳里出现 fetch(：{rel}:{lineno}（数据必须走 ShellProvider）")

    if result["blur_budgeted"] > BLUR_BUDGET:
        problems.append(
            f"backdrop-blur 超预算：{result['blur_budgeted']} > {BLUR_BUDGET}（只允许 .surface-overlay 宿主）"
        )

    unknown = {key: rows for key, rows in result["legacy"].items() if key not in FROZEN_LEGACY}
    for key, rows in unknown.items():
        for rel, lineno in rows:
            problems.append(f"未登记的旧接口 {key}：{rel}:{lineno}（如确需保留，先改 07 §3.19）")

    for rel, lines_count in result["oversized"]:
        problems.append(f"文件过长：{rel} {lines_count} 行 > {SIZE_BUDGET}（拆分职责，别加注释糊过去）")

    if not args.quiet:
        legacy_total = sum(len(rows) for rows in result["legacy"].values())
        merged = result["animations"] - result["animations_frozen"]
        top = "、".join(f"{rel} {n}" for n, rel in result["largest"])
        print(f"v1 直连           {len(result['v1_direct'])}（要求 0）")
        print(f"Shell 内 fetch    {len(result['shell_fetch'])}（要求 0）")
        print(f"backdrop-blur     {result['blur_total']} 处，计入约束 {result['blur_budgeted']}（上限 {BLUR_BUDGET}，见 T-66）")
        print(f"旧 /api/* 直连    {legacy_total}（全部命中冻结清单 {len(result['legacy'])}/{len(FROZEN_LEGACY)} 项）")
        print(f"循环动画          {result['animations']} 处，排除 3D 冻结区后 {merged} 处（源码计数；运行时稳态见 16 §4 P4）")
        print(f"最大非冻结文件    {top}（上限 {SIZE_BUDGET} 行）")
        for problem in problems:
            print(f"[fail] {problem}")
        if not problems:
            print("[ok] 前端闸门通过")

    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
