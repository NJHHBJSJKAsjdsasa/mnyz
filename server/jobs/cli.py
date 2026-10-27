"""``python -m server.jobs.cli [job ...]`` — run maintenance jobs without Celery."""

from __future__ import annotations

import argparse
import json
import sys

from .. import create_app
from ..config import ConfigError
from .runner import run_all


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Atlas maintenance jobs")
    parser.add_argument("jobs", nargs="*", help="job names; default = all")
    parser.add_argument("--list", action="store_true", help="list job names")
    args = parser.parse_args(argv)

    from .tasks import JOBS

    if args.list:
        print("\n".join(sorted(JOBS)))
        return 0
    try:
        app = create_app()
    except ConfigError as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 2
    with app.app_context():
        results = run_all(args.jobs)
    print(json.dumps(results, ensure_ascii=False, indent=2, default=str))
    return 0 if all(item.get("ok") or item.get("skipped") for item in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
