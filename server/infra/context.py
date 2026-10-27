"""Typed accessors for the objects created by ``create_app``."""

from __future__ import annotations

from flask import current_app

from .db import Database
from .redis import RedisFacade
from .security import KeyRing


def db() -> Database:
    return current_app.extensions["db"]


def cache() -> RedisFacade:
    return current_app.extensions["redis"]


def keys() -> KeyRing:
    return current_app.extensions["keys"]
