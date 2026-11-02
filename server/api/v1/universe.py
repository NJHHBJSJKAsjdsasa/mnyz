"""Read-only world geometry: what is in a galaxy, and what it is called.

Why this endpoint exists
------------------------
A galaxy here holds anywhere from a few thousand to hundreds of millions of
systems, served 150 at a time. The rail in the shell
(docs/frontend-redesign/16-shell-unification.md §4 P3) could only filter the page
already loaded, because a system's *name* was only ever computed while rendering
a page of systems. Finding one system meant paging through tens of thousands of
screens.

The name is cheap, the system is not
------------------------------------
``SolarSystem.__init__`` does a lot: star type, stars, 1–10 planets with
atmospheres and surfaces. Building a galaxy to read its names would take minutes
and gigabytes.

But the name is one line — ``generate_name(system_seed + index, "system")`` — and
``system_seed`` is a sha256 of the galaxy seed, a salt and the index. So scanning
names costs one hash and one string pick per system, with nothing materialised.

Galaxies are uncapped, so search is streamed, not indexed
---------------------------------------------------------
An earlier version built the full name index up front. That worked at 8k systems
and took **4.5 seconds** at 800k, and it cannot work at all for a galaxy that
declares 10^11. Since the world is allowed to keep growing, search scans lazily
inside a wall-clock budget and reports how far it got:

* a plain number (``#4213``) is answered in O(1) — no scan at all;
* a name query stops as soon as it has ``limit`` hits;
* otherwise it stops at ``_SCAN_BUDGET_MS`` and returns ``complete: false`` with
  the number of systems actually scanned, so the UI can state its coverage
  honestly instead of implying the galaxy is smaller than it is.
"""

from __future__ import annotations

import threading
import time

from flask import Blueprint, request

from pymodules.__atlas_config import config
from pymodules.__universe_base import Universe
from pymodules.__universe_constants import PhysicalConstants
from pymodules.__universe_name_generator import generate_name

from ...infra.errors import InvalidArgument
from ..deps import rate_limit, success

bp = Blueprint("universe", __name__)

# Constructing `Universe` is cheap (it only holds the seed), but the galaxy object
# it hands back caches its own solar systems, so one instance is worth keeping.
_UNIVERSE = None
_UNIVERSE_LOCK = threading.Lock()

# Two characters is the shortest query that is actually a filter; below it the
# whole galaxy matches and the caller should be paging instead.
_MIN_QUERY = 2
_DEFAULT_LIMIT = 50
_MAX_LIMIT = 200

# Wall clock per query. 600ms covers ~60–100k name generations on the dev box,
# which is enough for common fragments to fill the response several times over.
_SCAN_BUDGET_MS = 600

# Check the clock once every this many names — `time.monotonic()` per iteration
# costs more than the hash it is guarding.
_TIME_CHECK_EVERY = 512


def _universe():
    global _UNIVERSE
    if _UNIVERSE is None:
        with _UNIVERSE_LOCK:
            if _UNIVERSE is None:
                # `pymodules` keeps its world parameters in a process-global that
                # only the page entrypoint initialises. The API is a separate
                # process and has never called it, so `config.seed` would be None
                # and every galaxy lookup would fail on
                # `cosmic_origin_time - time.time()`. `initialize()` is idempotent
                # and reads `atlas.ini` from the working directory.
                if not config.initialize():
                    raise InvalidArgument("宇宙配置未初始化（缺少 atlas.ini）")

                # Same cache-backed galaxy the page process uses.
                #
                # The page renders through `CachedGalaxy`, which reads a galaxy's
                # scalars (type, num_systems, base_max, …) from Postgres. The API
                # was constructing the plain `Galaxy` and recomputing them, so the
                # two processes answered differently for the same coordinates —
                # the page said 11,038 systems, this endpoint said 793,416, and
                # both were "right" for their own arithmetic. Patching here makes
                # one of them the truth.
                from pymodules.__atlas_cache_proxy import patch_universe_get_galaxy

                patch_universe_get_galaxy()
                _UNIVERSE = Universe(config.seed, PhysicalConstants())
    return _UNIVERSE


def _name_at(galaxy, index: int) -> str:
    return generate_name(galaxy.get_solar_system_seed(index) + index, "system")


@bp.get("/universe/systems")
@rate_limit("system_search", 60, 60)
def search_systems():
    """Find systems by name or number inside the galaxy at ``x,y,z``.

    Query params: ``x``, ``y``, ``z`` (required, the galaxy), ``q`` (search text),
    ``limit`` (default 50, max 200).

    Unauthenticated on purpose: names are public world geometry, carry no player
    data, and the guest sessions that browse the map have no token. Cost is
    bounded by ``_SCAN_BUDGET_MS`` and the rate limit above.
    """
    coordinates = []
    for axis in ("x", "y", "z"):
        raw = request.args.get(axis)
        try:
            coordinates.append(int(raw))
        except (TypeError, ValueError):
            raise InvalidArgument(f"缺少或非法坐标 {axis}")

    query = (request.args.get("q") or "").strip()
    limit = request.args.get("limit", type=int) or _DEFAULT_LIMIT
    limit = max(1, min(limit, _MAX_LIMIT))

    galaxy = _universe().get_galaxy(*coordinates)
    total = int(galaxy.num_systems)

    if len(query) < _MIN_QUERY:
        return success(
            {
                "query": query,
                "total": total,
                "scanned": 0,
                "matched": 0,
                "systems": [],
                "complete": False,
                "reason": "query_too_short",
            }
        )

    needle = query.lower()
    # A bare number is a system number, not a name fragment — players copy "#4213"
    # out of a coordinate readout and expect it to land. Answered without a scan.
    as_number = needle.lstrip("#")
    if as_number.isdigit():
        index = int(as_number) - 1
        if 0 <= index < total:
            return success(
                {
                    "query": query,
                    "total": total,
                    "scanned": 1,
                    "matched": 1,
                    "systems": [{"index": index, "number": index + 1, "name": _name_at(galaxy, index)}],
                    "complete": True,
                }
            )
        return success(
            {
                "query": query,
                "total": total,
                "scanned": total,
                "matched": 0,
                "systems": [],
                "complete": True,
            }
        )

    deadline = time.monotonic() + _SCAN_BUDGET_MS / 1000.0
    matches: list[dict[str, object]] = []
    matched = 0
    scanned = 0
    complete = False

    for index in range(total):
        if index % _TIME_CHECK_EVERY == 0 and time.monotonic() > deadline:
            break
        name = _name_at(galaxy, index)
        scanned = index + 1
        if needle in name.lower():
            matched += 1
            if len(matches) < limit:
                matches.append({"index": index, "number": index + 1, "name": name})
                if len(matches) == limit:
                    # Enough to fill the response; stop paying for the hash.
                    break
    else:
        complete = True

    return success(
        {
            "query": query,
            "total": total,
            "scanned": scanned,
            "matched": matched,
            "systems": matches,
            "complete": complete,
            "truncated": matched > len(matches) or not complete,
        }
    )
