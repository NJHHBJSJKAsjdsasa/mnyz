"""Redis facade: rate-limit buckets, short-lived locks and caches.

Redis is *not* a source of truth. If it is unreachable the facade transparently
falls back to an in-process token bucket so writes keep working, and reports
``degraded`` for /health/deep. Production startup still refuses a dead Redis.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from typing import Any

log = logging.getLogger(__name__)

_BUCKET_LUA = """
local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(b[1]) or tonumber(ARGV[1])
local ts = tonumber(b[2]) or tonumber(ARGV[3])
local delta = math.max(0, tonumber(ARGV[3]) - ts)
tokens = math.min(tonumber(ARGV[1]), tokens + delta * tonumber(ARGV[2]))
if tokens < tonumber(ARGV[4]) then
  redis.call('HMSET', KEYS[1], 'tokens', tokens, 'ts', ARGV[3])
  redis.call('PEXPIRE', KEYS[1], 120000)
  return -1
end
tokens = tokens - tonumber(ARGV[4])
redis.call('HMSET', KEYS[1], 'tokens', tokens, 'ts', ARGV[3])
redis.call('PEXPIRE', KEYS[1], 120000)
return math.floor(tokens)
"""


class _MemoryBucket:
    """Per-process fallback; each worker gets its own budget."""

    def __init__(self) -> None:
        self._data: dict[str, tuple[float, float]] = {}
        self._lock = threading.Lock()

    def take(self, key: str, capacity: int, refill_per_ms: float, cost: int) -> int:
        now_ms = time.monotonic() * 1000
        with self._lock:
            tokens, stamp = self._data.get(key, (float(capacity), now_ms))
            tokens = min(float(capacity), tokens + max(0.0, now_ms - stamp) * refill_per_ms)
            if tokens < cost:
                self._data[key] = (tokens, now_ms)
                return -1
            tokens -= cost
            self._data[key] = (tokens, now_ms)
            return int(tokens)


class RedisFacade:
    def __init__(self, url: str, *, required: bool = False) -> None:
        self.url = url
        self.required = required
        self.degraded = False
        self._client: Any = None
        self._memory = _MemoryBucket()
        self._script = None
        self._connect()

    def _connect(self) -> None:
        if self.url.startswith("memory://"):
            self._client = None
            self.degraded = True
            return
        try:
            import redis

            self._client = redis.Redis.from_url(
                self.url, decode_responses=True, socket_connect_timeout=1, socket_timeout=1
            )
            self._client.ping()
            self._script = self._client.register_script(_BUCKET_LUA)
            self.degraded = False
        except Exception as exc:  # noqa: BLE001 - degrade on any redis failure
            self._client = None
            self.degraded = True
            level = logging.ERROR if self.required else logging.WARNING
            log.log(level, "redis unavailable (%s): falling back to in-process", type(exc).__name__)

    def ping(self) -> bool:
        if self._client is None:
            return False
        try:
            return bool(self._client.ping())
        except Exception:  # noqa: BLE001
            self.degraded = True
            return False

    def take_token(self, key: str, capacity: int, per_seconds: int, cost: int = 1) -> int:
        """Return remaining tokens, or -1 when the bucket is empty."""
        refill = capacity / max(1, per_seconds) / 1000.0
        if self._client is not None:
            try:
                result = self._script(
                    keys=[key],
                    args=[capacity, refill, int(time.time() * 1000), cost],
                )
                return int(result)
            except Exception:  # noqa: BLE001
                self.degraded = True
        return self._memory.take(key, capacity, refill, cost)

    def delete(self, key: str) -> None:
        if self._client is None:
            return
        try:
            self._client.delete(key)
        except Exception:  # noqa: BLE001
            self.degraded = True

    def get_json(self, key: str) -> Any | None:
        if self._client is None:
            return None
        try:
            raw = self._client.get(key)
            return json.loads(raw) if raw else None
        except Exception:  # noqa: BLE001
            return None

    def set_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        if self._client is None:
            return
        try:
            self._client.set(key, json.dumps(value), ex=ttl_seconds)
        except Exception:  # noqa: BLE001
            self.degraded = True

    def acquire_lock(self, name: str, ttl_seconds: int) -> str | None:
        """Best-effort lock; returns a holder id when acquired."""
        if self._client is None:
            return uuid.uuid4().hex
        holder = uuid.uuid4().hex
        try:
            ok = self._client.set(f"lock:{name}", holder, nx=True, ex=ttl_seconds)
            return holder if ok else None
        except Exception:  # noqa: BLE001
            self.degraded = True
            return holder

    def release_lock(self, name: str, holder: str) -> None:
        if self._client is None:
            return
        try:
            if self._client.get(f"lock:{name}") == holder:
                self._client.delete(f"lock:{name}")
        except Exception:  # noqa: BLE001
            pass
