"""Machine-readable error code dictionary (10 §P1-3).

The frontend used to keep a hand-written ``code → 文案`` table that drifted every
time a new ``ApiError`` subclass landed. This endpoint is the single source: it
walks the subclass tree at import time, so a new error class shows up here with
zero extra bookkeeping.

No auth: the dictionary is public API surface, and a client that cannot log in
still needs to render "令牌已过期" instead of ``token_expired``.
"""

from __future__ import annotations

from flask import Blueprint

from ...infra.errors import ApiError, title_of
from ..deps import success

bp = Blueprint("meta", __name__)


def _walk(cls: type[ApiError]) -> list[type[ApiError]]:
    found: list[type[ApiError]] = []
    for sub in cls.__subclasses__():
        if sub.__dict__.get("code"):
            found.append(sub)
        found.extend(_walk(sub))
    return found


def error_codes() -> list[dict]:
    seen: dict[str, dict] = {}
    for cls in _walk(ApiError):
        code = cls.code
        seen.setdefault(code, {"code": code, "status": cls.status, "title": title_of(code)})
    seen.setdefault(
        "internal_error",
        {"code": "internal_error", "status": 500, "title": "服务器内部错误"},
    )
    return sorted(seen.values(), key=lambda item: (item["status"], item["code"]))


@bp.get("/meta/error-codes")
def list_error_codes():
    codes = error_codes()
    return success({"codes": codes, "count": len(codes)})
