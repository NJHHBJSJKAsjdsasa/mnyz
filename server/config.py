"""Runtime configuration for the Atlas server.

Every value comes from the environment (optionally seeded by ``.env.server``).
Missing mandatory values abort startup with the *name* of the missing item and
never echo the value, so a CI log cannot leak a DSN or a private key.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = REPO_ROOT / ".env.server"
DEFAULT_REVISION = "0114_company_law_court"

_VALID_ENVS = {"dev", "staging", "prod"}
_VALID_CACHE_BACKENDS = {"pg", "sqlite", "json"}
_ENV_LINE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$")


class ConfigError(RuntimeError):
    """Configuration is missing or unusable; the process must not start."""


def load_env_file(path: Path = ENV_FILE) -> None:
    """Load KEY=VALUE pairs without overriding real environment variables."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = _ENV_LINE.match(line)
        if not match:
            continue
        key, value = match.group(1), match.group(2)
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key, value)


def _read_key(name: str) -> str:
    """Read a PEM string either inline or from a file path."""
    value = os.getenv(name, "").strip()
    if not value:
        return ""
    if "BEGIN" in value:
        return value.replace("\\n", "\n")
    candidate = Path(value)
    if candidate.is_file():
        return candidate.read_text(encoding="utf-8")
    return ""


def _bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    env: str
    database_url: str
    redis_url: str
    secret_key: str
    jwt_private_key: str
    jwt_public_key: str
    jwt_previous_public_key: str = ""
    jwt_kid: str = "2026-10"
    cache_backend: str = "pg"
    cache_schema: str = "universe_cache"
    log_level: str = "info"
    host: str = "127.0.0.1"
    port: int = 8000
    default_timezone: str = "Asia/Shanghai"
    expected_revision: str = DEFAULT_REVISION
    self_check_on_boot: bool = True
    access_token_ttl_seconds: int = 900
    refresh_token_ttl_seconds: int = 30 * 24 * 3600
    idempotency_ttl_hours: int = 24
    db_pool_max: int = 10
    rate_limit_enabled: bool = True
    cors_origins: tuple[str, ...] = ()
    problems: list[str] = field(default_factory=list)

    @property
    def is_dev(self) -> bool:
        return self.env == "dev"

    @property
    def is_prod(self) -> bool:
        return self.env == "prod"

    @property
    def sqlalchemy_url(self) -> str:
        """Alembic needs SQLAlchemy; normalise the psycopg DSN for it."""
        url = self.database_url
        if url.startswith("postgresql://"):
            return "postgresql+psycopg://" + url[len("postgresql://") :]
        if url.startswith("postgres://"):
            return "postgresql+psycopg://" + url[len("postgres://") :]
        return url

    @classmethod
    def from_env(cls) -> "Settings":
        load_env_file()
        settings = cls(
            env=os.getenv("ATLAS_ENV", "dev").strip().lower(),
            database_url=os.getenv("ATLAS_DATABASE_URL", "").strip(),
            redis_url=os.getenv("ATLAS_REDIS_URL", "redis://127.0.0.1:6379/0").strip(),
            secret_key=os.getenv("ATLAS_SECRET_KEY", "").strip(),
            jwt_private_key=_read_key("ATLAS_JWT_PRIVATE_KEY"),
            jwt_public_key=_read_key("ATLAS_JWT_PUBLIC_KEY"),
            jwt_previous_public_key=_read_key("ATLAS_JWT_PREVIOUS_PUBLIC_KEY"),
            jwt_kid=os.getenv("ATLAS_JWT_KID", "2026-10").strip(),
            cache_backend=os.getenv("ATLAS_CACHE_BACKEND", "pg").strip().lower(),
            cache_schema=os.getenv("ATLAS_CACHE_SCHEMA", "universe_cache").strip(),
            log_level=os.getenv("ATLAS_LOG_LEVEL", "info").strip().lower(),
            host=os.getenv("ATLAS_API_HOST", "127.0.0.1").strip(),
            port=int(os.getenv("ATLAS_API_PORT", "8000")),
            default_timezone=os.getenv("ATLAS_DEFAULT_TIMEZONE", "Asia/Shanghai").strip(),
            expected_revision=os.getenv("ATLAS_EXPECTED_REVISION", DEFAULT_REVISION).strip(),
            self_check_on_boot=not _bool("ATLAS_SKIP_SELF_CHECK"),
            access_token_ttl_seconds=int(os.getenv("ATLAS_ACCESS_TTL", "900")),
            refresh_token_ttl_seconds=int(os.getenv("ATLAS_REFRESH_TTL", str(30 * 24 * 3600))),
            idempotency_ttl_hours=int(os.getenv("ATLAS_IDEMPOTENCY_TTL_HOURS", "24")),
            db_pool_max=int(os.getenv("ATLAS_DB_POOL_MAX", "10")),
            rate_limit_enabled=os.getenv("ATLAS_RATE_LIMIT", "on").strip().lower() not in {"off", "0", "false"},
            cors_origins=tuple(
                item.strip()
                for item in os.getenv("ATLAS_CORS_ORIGINS", "").split(",")
                if item.strip()
            ),
        )
        return settings.with_problems(settings.validate())

    def with_problems(self, problems: list[str]) -> "Settings":
        return Settings(**{**self.__dict__, "problems": problems})

    def validate(self) -> list[str]:
        problems: list[str] = []
        if self.env not in _VALID_ENVS:
            problems.append(f"ATLAS_ENV must be one of {sorted(_VALID_ENVS)}")
        if not self.database_url:
            problems.append("ATLAS_DATABASE_URL is required")
        elif not self.database_url.startswith(("postgresql://", "postgres://")):
            problems.append("ATLAS_DATABASE_URL must be a postgresql:// DSN")
        if not self.jwt_private_key:
            problems.append("ATLAS_JWT_PRIVATE_KEY is required (PEM or path)")
        if not self.jwt_public_key:
            problems.append("ATLAS_JWT_PUBLIC_KEY is required (PEM or path)")
        if len(self.secret_key) < 32:
            problems.append("ATLAS_SECRET_KEY must be at least 32 bytes")
        if self.cache_backend not in _VALID_CACHE_BACKENDS:
            problems.append(f"ATLAS_CACHE_BACKEND must be one of {sorted(_VALID_CACHE_BACKENDS)}")
        if self.access_token_ttl_seconds <= 0:
            problems.append("ATLAS_ACCESS_TTL must be positive")
        if not 0 < self.port < 65536:
            problems.append("ATLAS_API_PORT must be 1-65535")
        return problems

    def require_valid(self) -> None:
        if self.problems:
            raise ConfigError("invalid configuration: " + "; ".join(self.problems))


def get_settings() -> Settings:
    """Settings for the current app, falling back to the environment."""
    from flask import current_app

    app = current_app._get_current_object() if current_app else None  # type: ignore[attr-defined]
    if app is not None and "SETTINGS" in app.config:
        return app.config["SETTINGS"]
    return Settings.from_env()
