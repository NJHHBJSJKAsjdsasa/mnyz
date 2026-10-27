"""Structured JSON logs with a stable field set.

Fixed fields (docs/server/20 §3): ``request_id/route/status/duration_ms``.
Anything else is dropped so log volume stays predictable.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

_ALLOWED_EXTRA = {
    "request_id",
    "route",
    "method",
    "status",
    "duration_ms",
    "player_id",
    "account_id",
    "code",
    "event",
    "job",
    "count",
    "detail",
}


class JsonFormatter(logging.Formatter):
    def __init__(self, service: str) -> None:
        super().__init__()
        self.service = service

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "level": record.levelname.lower(),
            "service": self.service,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key in _ALLOWED_EXTRA:
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def setup_logging(level: str = "info", service: str = "atlas-api") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter(service))
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    logging.getLogger("psycopg").setLevel(logging.WARNING)


def log_event(logger: logging.Logger, msg: str, **fields: Any) -> None:
    """Emit a line with only whitelisted extra fields."""
    logger.info(msg, extra={key: value for key, value in fields.items() if key in _ALLOWED_EXTRA})
