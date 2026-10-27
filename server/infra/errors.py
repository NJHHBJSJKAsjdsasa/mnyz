"""RFC 9457 problem responses with a stable machine-readable ``code``.

Domain code raises the subclasses below; the Flask error handler turns them
into ``application/problem+json``. Nothing here touches the request object, so
the domain layer can raise these without importing Flask.
"""

from __future__ import annotations

from typing import Any

ERROR_BASE = "https://atlas.local/errors/"

_TITLES = {
    "invalid_argument": "参数不合法",
    "missing_idempotency_key": "缺少幂等键",
    "unauthenticated": "未认证",
    "token_expired": "令牌已过期",
    "session_revoked": "会话已失效",
    "session_reuse_detected": "检测到令牌重放",
    "invalid_credentials": "邮箱或口令错误",
    "email_taken": "邮箱已被注册",
    "forbidden": "无权限",
    "not_found": "资源不存在",
    "insufficient_funds": "资源不足",
    "out_of_stock": "库存不足",
    "contract_expired": "合同已过期",
    "idempotency_conflict": "幂等键冲突",
    "stale_state": "客户端状态过期",
    "cooldown": "冷却中",
    "rate_limited": "请求过于频繁",
    "account_locked": "账号已锁定",
    "player_locked": "玩家已被冻结",
    "already_claimed": "已被领取",
    "daily_limit": "今日次数已用完",
    "unprocessable": "操作不可执行",
    "storage_offline": "存储暂不可用",
    "dependency_down": "依赖服务不可用",
    "lock_timeout": "资源繁忙",
    "transaction_retry_exhausted": "事务冲突，请重试",
    "internal_error": "服务器内部错误",
}


class ApiError(Exception):
    """An expected failure that maps directly onto an HTTP response."""

    status = 400
    code = "invalid_argument"

    def __init__(
        self,
        detail: str = "",
        *,
        code: str | None = None,
        status: int | None = None,
        retry_after_ms: int | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        self.code = code or self.code
        self.status = status or self.status
        self.detail = detail or _TITLES.get(self.code, "")
        self.retry_after_ms = retry_after_ms
        self.extra = extra or {}
        super().__init__(self.detail)

    @property
    def title(self) -> str:
        return _TITLES.get(self.code, "请求失败")

    def to_problem(self, instance: str, request_id: str) -> dict[str, Any]:
        body: dict[str, Any] = {
            "type": ERROR_BASE + self.code.replace("_", "-"),
            "title": self.title,
            "status": self.status,
            "detail": self.detail,
            "instance": instance,
            "code": self.code,
            "request_id": request_id,
        }
        if self.retry_after_ms is not None:
            body["retry_after_ms"] = self.retry_after_ms
        body.update(self.extra)
        return body


class InvalidArgument(ApiError):
    status, code = 400, "invalid_argument"


class MissingIdempotencyKey(ApiError):
    status, code = 400, "missing_idempotency_key"


class Unauthenticated(ApiError):
    status, code = 401, "unauthenticated"


class TokenExpired(ApiError):
    status, code = 401, "token_expired"


class SessionRevoked(ApiError):
    status, code = 401, "session_revoked"


class SessionReuse(ApiError):
    status, code = 401, "session_reuse_detected"


class InvalidCredentials(ApiError):
    status, code = 401, "invalid_credentials"


class EmailTaken(ApiError):
    status, code = 409, "email_taken"


class Forbidden(ApiError):
    status, code = 403, "forbidden"


class NotFound(ApiError):
    status, code = 404, "not_found"


class InsufficientFunds(ApiError):
    status, code = 409, "insufficient_funds"

    def __init__(self, resource_code: str, needed: float = 0) -> None:
        super().__init__(f"资源 {resource_code} 不足", extra={"resource": resource_code, "needed": needed})


class IdempotencyConflict(ApiError):
    status, code = 409, "idempotency_conflict"


class StaleState(ApiError):
    status, code = 412, "stale_state"


class RateLimited(ApiError):
    status, code = 429, "rate_limited"

    def __init__(self, retry_after_ms: int = 1000, detail: str = "") -> None:
        super().__init__(detail or "超过速率限制", retry_after_ms=retry_after_ms)


class Cooldown(ApiError):
    status, code = 429, "cooldown"

    def __init__(self, retry_after_ms: int) -> None:
        super().__init__(
            f"冷却中，还需 {max(1, retry_after_ms // 1000)} 秒",
            retry_after_ms=retry_after_ms,
            extra={"retry_after_ms": retry_after_ms},
        )


class AccountLocked(ApiError):
    status, code = 423, "account_locked"


class PlayerLocked(ApiError):
    status, code = 423, "player_locked"


class Unprocessable(ApiError):
    status, code = 422, "unprocessable"


class DailyLimit(ApiError):
    status, code = 409, "daily_limit"


class AlreadyClaimed(ApiError):
    status, code = 409, "already_claimed"


class OutOfStock(ApiError):
    status, code = 409, "out_of_stock"


class ContractExpired(ApiError):
    status, code = 409, "contract_expired"


class StorageOffline(ApiError):
    status, code = 503, "storage_offline"


class LockTimeout(ApiError):
    status, code = 503, "lock_timeout"


class TransactionRetryExhausted(ApiError):
    status, code = 503, "transaction_retry_exhausted"
