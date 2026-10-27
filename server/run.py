"""Dev runner: binds 127.0.0.1:8000 (docs/server/02 §1).

Production uses gunicorn with ``server.wsgi:application`` behind Nginx.
"""

from __future__ import annotations

from . import create_app
from .config import Settings


def main() -> None:
    settings = Settings.from_env()
    app = create_app(settings)
    app.run(host=settings.host, port=settings.port, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()
