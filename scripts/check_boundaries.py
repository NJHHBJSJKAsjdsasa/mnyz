#!/usr/bin/env python
"""Fail when a module writes a table it does not own.

    python scripts/check_boundaries.py            # report, exit 1 on new violations
    python scripts/check_boundaries.py --report   # report only, always exit 0
    python scripts/check_boundaries.py --write-baseline

Rules live in ``server/infra/ownership.py`` and
``docs/architecture/module-dependencies.md``. Only *writes* are enforced:
cross-module ``SELECT`` is allowed, cross-module ``INSERT/UPDATE/DELETE`` is not.

The baseline file records violations that exist today so the check can be added
to CI without a big-bang refactor. Anything not in the baseline fails the build.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server.infra.ownership import module_of, owner_of  # noqa: E402

SCAN_DIRS = ("server/repo", "server/domain", "server/api/v1")
BASELINE = Path(__file__).resolve().parent / "boundaries_baseline.json"

WRITE_RE = re.compile(
    r"\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)", re.IGNORECASE
)
SKIP_TOKENS = {"set", "skip", "only", "ignore", "conflict", "where", "if", "for", "from"}


def writes_in(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    found = set()
    for match in WRITE_RE.findall(text):
        table = match.lower()
        if table in SKIP_TOKENS:
            continue
        found.add(table)
    return found


def collect() -> tuple[list[str], list[str]]:
    violations: list[str] = []
    unmapped: list[str] = []
    for directory in SCAN_DIRS:
        for path in sorted((ROOT / directory).glob("*.py")):
            stem = path.stem
            if stem.startswith("__"):
                continue
            module = module_of(stem)
            if module is None:
                continue
            for table in sorted(writes_in(path)):
                owner = owner_of(table)
                if owner is None:
                    unmapped.append(f"{directory}/{path.name}:{table}")
                elif owner != module:
                    violations.append(f"{directory}/{path.name}:{table} (owner: {owner})")
    return violations, unmapped


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", action="store_true", help="never fail")
    parser.add_argument("--write-baseline", action="store_true")
    args = parser.parse_args()

    violations, unmapped = collect()

    if args.write_baseline:
        BASELINE.write_text(
            json.dumps(sorted(violations), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"baseline written: {len(violations)} entries -> {BASELINE.name}")
        return 0

    baseline = set()
    if BASELINE.exists():
        baseline = set(json.loads(BASELINE.read_text(encoding="utf-8")))
    new = [v for v in violations if v not in baseline]

    if unmapped:
        print(f"[info] {len(unmapped)} write(s) to unassigned tables (not enforced):")
        for item in unmapped:
            print("   ?", item)
    if baseline:
        print(f"[info] {len(violations) - len(new)} known violation(s) in baseline")
    if new:
        print(f"[fail] {len(new)} new cross-module write(s):")
        for item in new:
            print("   !", item)
        print("\nFix: move the write behind the owning module's API, or declare the")
        print("ownership edge in docs/architecture/module-dependencies.md and")
        print("server/infra/ownership.py if it is genuinely shared.")
        return 0 if args.report else 1

    print("[ok] no new cross-module writes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
