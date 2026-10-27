"""A tiny Prometheus registry.

Only what the API actually emits is here: request counts/latency, ledger and
collect counters, and job outcomes. No third-party dependency so the server can
boot in a bare container.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from contextlib import contextmanager
from typing import Iterator

_LOCK = threading.Lock()
_COUNTERS: dict[tuple[str, tuple[tuple[str, str], ...]], float] = defaultdict(float)
_BUCKETS = (5, 10, 25, 50, 100, 250, 500, 1000, 5000)
# bucket counts + total count + sum (ms)
_HISTO: dict[tuple[str, tuple[tuple[str, str], ...]], list[float]] = defaultdict(
    lambda: [0] * (len(_BUCKETS) + 2)
)


def _key(labels: dict[str, str] | None) -> tuple[tuple[str, str], ...]:
    return tuple(sorted((labels or {}).items()))


def _render_labels(labels: tuple[tuple[str, str], ...]) -> str:
    if not labels:
        return ""
    body = ",".join(f'{k}="{v}"' for k, v in labels)
    return "{" + body + "}"


def inc(name: str, labels: dict[str, str] | None = None, amount: float = 1.0) -> None:
    with _LOCK:
        _COUNTERS[(name, _key(labels))] += amount


def observe(name: str, value_ms: float, labels: dict[str, str] | None = None) -> None:
    with _LOCK:
        hist = _HISTO[(name, _key(labels))]
        for position, bound in enumerate(_BUCKETS):
            if value_ms <= bound:
                hist[position] += 1
                break
        hist[len(_BUCKETS)] += 1
        hist[-1] += value_ms


@contextmanager
def timer(name: str, labels: dict[str, str] | None = None) -> Iterator[None]:
    started = time.perf_counter()
    try:
        yield
    finally:
        observe(name, (time.perf_counter() - started) * 1000, labels)


def render() -> str:
    lines: list[str] = ['# TYPE atlas_api_info gauge', 'atlas_api_info{service="atlas-api"} 1']
    with _LOCK:
        for (name, labels), value in sorted(_COUNTERS.items()):
            lines.append(f"# TYPE {name} counter")
            lines.append(f"{name}{_render_labels(labels)} {value:g}")
        for (name, labels), hist in sorted(_HISTO.items()):
            base = name.removesuffix("_ms") + "_ms"
            cumulative = 0
            for position, bound in enumerate(_BUCKETS):
                cumulative += hist[position]
                bucket_labels = labels + (("le", str(bound)),)
                lines.append(f"{base}_bucket{_render_labels(bucket_labels)} {cumulative}")
            total = hist[len(_BUCKETS)]
            lines.append(f'{base}_bucket{_render_labels(labels + (("le", "+Inf"),))} {total}')
            lines.append(f"{base}_sum{_render_labels(labels)} {hist[-1] / 1000:.6f}")
            lines.append(f"{base}_count{_render_labels(labels)} {total}")
    return "\n".join(lines) + "\n"
