"""JSON encoding: ISO-8601 timestamps, integers for integral Decimals."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from flask.json.provider import DefaultJSONProvider


class AtlasJSONProvider(DefaultJSONProvider):
    ensure_ascii = False
    sort_keys = False

    def default(self, obj):  # noqa: ANN001
        if isinstance(obj, datetime):
            moment = obj if obj.tzinfo else obj.replace(tzinfo=timezone.utc)
            return moment.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        if isinstance(obj, date):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return int(obj) if obj == obj.to_integral_value() else float(obj)
        if isinstance(obj, UUID):
            return str(obj)
        return super().default(obj)
