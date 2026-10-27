"""WSGI entry point: ``gunicorn -k gthread -w 4 server.wsgi:application``."""

from __future__ import annotations

from . import create_app

application = create_app()
app = application
