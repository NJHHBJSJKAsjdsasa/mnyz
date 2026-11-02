#!/usr/bin/env python
"""Check that the numbers written in Markdown still match the code.

    python scripts/doc_facts.py --check    # CI: fail on any drift
    python scripts/doc_facts.py --write    # local: rewrite the anchors in place
    python scripts/doc_facts.py --list     # print every registered fact

Why this exists
---------------
`docs/api/endpoints.md` has never drifted because it is *generated* and CI runs
`gen_api_docs.py --check`. Every other number in the docs (migration head, blueprint
count, frontend size, test count) was a hand-kept copy, and on 2026-11-02 a manual
audit found twelve of them stale — some by eight migrations.

Anchors are invisible to the reader::

    后端 **26 个**蓝图 / **255 个**端点 <!--fact:api.blueprints=26--> <!--fact:api.endpoints=255-->

The value lives *inside* the anchor, and a second check requires the value to be visible
as text on the same line — so "edited the number but not the anchor" and "edited the
anchor but not the number" both fail. A sentence that spans several lines can instead put
its anchors on a line of their own; those are checked against a five-line window, which
keeps the same failure mode without forcing awkward line breaks.

Deliberately **not** a whole-page template: docs are read by humans, and a page of
placeholders destroys readability. Only facts that actually move get an anchor.
Historical snapshots ("239 files as of 2026-10-28") must NOT be anchored — they are
supposed to disagree with today.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

ANCHOR_RE = re.compile(r"<!--fact:([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)=([^>]*)-->")

# Docs that may carry anchors. Anything else is a narrative doc and is not scanned.
DOC_GLOBS = (
    "README.md",
    "README.en.md",
    "CHANGELOG.md",
    "docs/**/*.md",
)

# Never scan generated files: their content is owned by gen_api_docs.py.
SKIP_PARTS = {"node_modules", ".git", "dist", "dist_check", ".tmp", "__pycache__"}


# --------------------------------------------------------------------------- facts


def _fmt_int(value: int) -> str:
    """Thousands separators for numbers big enough that humans stop counting."""
    return f"{value:,}"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def fact_migrations_head() -> str:
    match = re.search(r'^DEFAULT_REVISION\s*=\s*"([^"]+)"', _read(ROOT / "server" / "config.py"), re.M)
    if not match:
        raise SystemExit("doc_facts: DEFAULT_REVISION not found in server/config.py")
    return match.group(1)


def fact_migrations_count() -> str:
    versions = ROOT / "server" / "migrations" / "versions"
    files = [p for p in versions.iterdir() if p.suffix == ".py" and p.stem[0].isdigit()]
    return _fmt_int(len(files))


def _endpoint_header() -> re.Match[str]:
    text = _read(ROOT / "docs" / "api" / "endpoints.md")
    match = re.search(r"共\s*\*\*(\d+)\*\*\s*个操作\s*/\s*\*\*(\d+)\*\*\s*个蓝图", text)
    if not match:
        raise SystemExit(
            "doc_facts: cannot read operation/blueprint counts from docs/api/endpoints.md "
            "(header changed? regenerate with scripts/gen_api_docs.py)"
        )
    return match


def fact_api_endpoints() -> str:
    return _endpoint_header().group(1)


def fact_api_blueprints() -> str:
    return _endpoint_header().group(2)


def fact_modules_count() -> str:
    text = _read(ROOT / "server" / "infra" / "ownership.py")
    body = text.split("MODULES", 1)[-1]
    return _fmt_int(len(re.findall(r'^ {4}"[a-z_]+":\s*\{', body, re.M)))


def fact_boundaries_baseline() -> str:
    data = json.loads(_read(ROOT / "scripts" / "boundaries_baseline.json"))
    return _fmt_int(len(data))


def fact_jobs_count() -> str:
    text = _read(ROOT / "server" / "jobs" / "beat_schedule.py")
    body = text.split("SCHEDULE", 1)[-1]
    return _fmt_int(len(re.findall(r'^ {4}"[a-z0-9_]+":\s*\d+,', body, re.M)))


def _frontend_files() -> list[Path]:
    base = ROOT / "atlas-ui" / "react" / "static" / "js"
    return sorted(p for p in base.rglob("*") if p.suffix in {".ts", ".tsx"} and p.is_file())


def fact_frontend_ts_files() -> str:
    return _fmt_int(len(_frontend_files()))


def fact_frontend_ts_lines() -> str:
    # Count newlines, not splitlines(): this mirrors `wc -l` so the number in the docs
    # is reproducible with the command printed next to it.
    total = sum(p.read_bytes().count(b"\n") for p in _frontend_files())
    return _fmt_int(total)


def fact_tests_functions() -> str:
    total = 0
    for path in (ROOT / "tests").rglob("*.py"):
        total += len(re.findall(r"^def test_[a-z0-9_]*", _read(path), re.M))
    return _fmt_int(total)


FACTS = {
    "migrations.head": fact_migrations_head,
    "migrations.count": fact_migrations_count,
    "api.endpoints": fact_api_endpoints,
    "api.blueprints": fact_api_blueprints,
    "modules.count": fact_modules_count,
    "boundaries.baseline": fact_boundaries_baseline,
    "jobs.count": fact_jobs_count,
    "frontend.ts_files": fact_frontend_ts_files,
    "frontend.ts_lines": fact_frontend_ts_lines,
    "tests.functions": fact_tests_functions,
}


def compute() -> dict[str, str]:
    return {key: fn() for key, fn in FACTS.items()}


# ------------------------------------------------------------------------ scanning


def doc_paths() -> list[Path]:
    seen: dict[Path, None] = {}
    for pattern in DOC_GLOBS:
        for path in ROOT.glob(pattern):
            if not path.is_file() or SKIP_PARTS & set(path.parts):
                continue
            seen[path] = None
    return sorted(seen)


def _scope(lines: list[str], index: int, block_level: bool) -> tuple[int, int]:
    """Line range a block-level anchor describes: the paragraph directly above it.

    Line-level anchors only govern their own line, so the scope is that line.
    """
    if not block_level:
        return index, index + 1
    end = index - 1
    while end >= 0 and not lines[end].strip():
        end -= 1
    start = end
    while start >= 0 and lines[start].strip():
        start -= 1
    if end < 0:
        return index, index + 1
    return start + 1, end + 1


def _is_block_level(line: str) -> bool:
    return re.sub(r"^[\s>*\-+|]+", "", ANCHOR_RE.sub("", line)).strip() == ""


def scan(facts: dict[str, str]) -> list[tuple[Path, int, str, str, str]]:
    """Return (path, lineno, key, anchor_value, expected) for every problem found."""
    problems: list[tuple[Path, int, str, str, str]] = []
    for path in doc_paths():
        try:
            text = _read(path)
        except OSError as exc:  # pragma: no cover - unreadable file is a real failure
            print(f"doc_facts: cannot read {path}: {exc}", file=sys.stderr)
            problems.append((path, 0, "<io>", "", ""))
            continue
        lines = text.splitlines()
        for index, line in enumerate(lines):
            lineno = index + 1
            anchors = ANCHOR_RE.findall(line)
            if not anchors:
                continue
            # Anchors on a line of their own describe the paragraph above them (English
            # sentences wrap, so a fixed-size window is not enough). Anchors are stripped
            # from the text under test: an anchor carries the expected value and would
            # otherwise always satisfy itself.
            block_level = _is_block_level(line)
            lo, hi = _scope(lines, index, block_level)
            visible = ANCHOR_RE.sub("", "\n".join(lines[lo:hi]))
            for key, value in anchors:
                if key not in facts:
                    problems.append((path, lineno, key, value, "<unknown fact key>"))
                    continue
                expected = facts[key]
                if value != expected:
                    problems.append((path, lineno, key, value, expected))
                    continue
                if expected not in visible:
                    problems.append((path, lineno, key, value, f"{expected} (anchor ok, visible text missing it)"))
    return problems


def _value_pattern(value: str) -> re.Pattern[str]:
    """Match a literal number without swallowing neighbouring digits (7 in 0710, 1 in 91,307)."""
    return re.compile(r"(?<![\d,])" + re.escape(value) + r"(?![\d,])")


def rewrite(facts: dict[str, str]) -> int:
    """Rewrite anchors (and the visible value they describe) to the computed value."""
    changed = 0
    for path in doc_paths():
        text = _read(path)
        lines = text.splitlines(keepends=True)
        dirty = False
        for index, line in enumerate(lines):
            anchors = ANCHOR_RE.findall(line)
            if not anchors:
                continue
            lineno = index + 1
            block_level = _is_block_level(line)
            lo, hi = _scope(lines, index, block_level)
            new_line = line
            for key, value in anchors:
                if key not in facts:
                    print(f"doc_facts: unknown fact key '{key}' at {path}:{lineno}", file=sys.stderr)
                    continue
                expected = facts[key]
                if value == expected:
                    continue
                new_line = new_line.replace(f"<!--fact:{key}={value}-->", f"<!--fact:{key}={expected}-->", 1)
                hits = [
                    j
                    for j in range(lo, hi)
                    if _value_pattern(value).search(ANCHOR_RE.sub("", lines[j]))
                ]
                if len(hits) == 1:
                    j = hits[0]
                    fixed = _value_pattern(value).sub(expected, new_line if j == index else lines[j], count=1)
                    if j == index:
                        new_line = fixed
                    else:
                        lines[j] = fixed
                    print(
                        f"  {path.relative_to(ROOT)}:{lineno}  {key}  {value} -> {expected}"
                        f"  (visible text line {j + 1})"
                    )
                else:
                    print(
                        f"  {path.relative_to(ROOT)}:{lineno}  {key}  {value} -> {expected}"
                        f"  (anchor only; {len(hits)} visible occurrence(s) need a human look)"
                    )
            if new_line != line:
                lines[index] = new_line
                dirty = True
        if dirty:
            path.write_text("".join(lines), encoding="utf-8", newline="")
            changed += 1
    return changed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="fail if any anchor disagrees with the code")
    group.add_argument("--write", action="store_true", help="rewrite anchors to match the code")
    group.add_argument("--list", action="store_true", help="print every registered fact")
    args = parser.parse_args(argv)

    facts = compute()

    if args.list:
        width = max(len(k) for k in facts)
        for key in sorted(facts):
            print(f"{key:<{width}}  {facts[key]}")
        return 0

    if args.write:
        changed = rewrite(facts)
        print(f"[ok] doc facts rewritten in {changed} file(s)" if changed else "[ok] no anchor value changed")
        # --write fixes "code moved, docs did not". It cannot invent a value that a human
        # typed over, so re-check and report instead of claiming success.
        leftover = scan(facts)
        if leftover:
            print("\n[FAIL] these need a human:", file=sys.stderr)
            for path, lineno, key, value, expected in leftover:
                rel = path.relative_to(ROOT) if path.is_absolute() else path
                print(f"{rel}:{lineno}: {key}: anchor '{value}' vs {expected}", file=sys.stderr)
            return 1
        return 0

    problems = scan(facts)
    if not problems:
        print(f"[ok] doc facts match the code ({len(facts)} facts, {len(doc_paths())} docs)")
        return 0

    for path, lineno, key, value, expected in problems:
        rel = path.relative_to(ROOT) if path.is_absolute() else path
        if expected == "<unknown fact key>":
            print(f"{rel}:{lineno}: unknown fact key '{key}' (registered: {', '.join(sorted(facts))})")
        elif lineno == 0:
            print(f"{rel}: unreadable")
        else:
            print(f"{rel}:{lineno}: {key}: anchor says '{value}', code says '{expected}'")
    print(
        f"\n[FAIL] {len(problems)} doc fact(s) drifted. Run `python scripts/doc_facts.py --write` "
        "and review the diff.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
