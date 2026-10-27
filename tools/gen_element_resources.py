"""Regenerate pymodules/__element_resources.py from the React source.

The element → resource table is gameplay data owned by the frontend today. The
server needs the same numbers to make planet yields authoritative, so we keep a
single generated copy and fail loudly when the source stops matching.

Usage: python tools/gen_element_resources.py [--check]
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "atlas-ui/react/static/js/Utils/ElementResourceValues.tsx"
TARGET = ROOT / "pymodules/__element_resources.py"

PATTERN = re.compile(
    r'^\s*"?([A-Za-z0-9-]+)"?:\s*\{\s*antimatter:\s*(-?\d+),\s*element115:\s*(-?\d+),\s*deuterium:\s*(-?\d+)\s*\}',
    re.M,
)

HEADER = '''"""Element → resource values, generated from the React source.

Do not edit by hand: run ``python tools/gen_element_resources.py``. The server
uses these numbers to turn a planet's elements into base collection yield, so a
drift guard test compares the row count and a few anchor values.
"""

from __future__ import annotations

ELEMENT_RESOURCE_VALUES: dict[str, dict[str, int]] = {
'''

FOOTER = '''}


def element_resources(elements: list[str]) -> dict[str, int]:
    """Sum per-element values; all-zero compositions fall back to 1/1/2."""
    total = {"antimatter": 0, "element115": 0, "deuterium": 0}
    for name in elements:
        value = ELEMENT_RESOURCE_VALUES.get(name)
        if not value:
            continue
        for key in total:
            total[key] += int(value[key])
    if not any(total.values()):
        return {"antimatter": 1, "element115": 1, "deuterium": 2}
    return total
'''


def build() -> str:
    source = SOURCE.read_text(encoding="utf-8")
    rows = PATTERN.findall(source)
    if not rows:
        raise SystemExit(f"no element rows found in {SOURCE}")
    lines = [HEADER]
    for name, antimatter, element115, deuterium in rows:
        lines.append(
            f'    "{name}": {{"antimatter": {antimatter}, "element115": {element115}, "deuterium": {deuterium}}},\n'
        )
    lines.append(FOOTER)
    return "".join(lines)


def main(argv: list[str]) -> int:
    content = build()
    if "--check" in argv:
        current = TARGET.read_text(encoding="utf-8") if TARGET.exists() else ""
        if current != content:
            print("element resource table is stale; re-run the generator", file=sys.stderr)
            return 1
        print("element resource table is up to date")
        return 0
    TARGET.write_text(content, encoding="utf-8", newline="\n")
    print(f"wrote {TARGET.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
