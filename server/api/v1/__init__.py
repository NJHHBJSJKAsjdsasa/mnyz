"""API v1 blueprint aggregation."""

from __future__ import annotations

from flask import Blueprint

from . import (
    admin_ai,
    assets,
    auth,
    bank,
    commerce,
    council,
    court,
    cutover,
    economy,
    explore,
    insolvency,
    properties,
    session,
    stocks,
    tasks,
)

api_bp = Blueprint("api_v1", __name__)

api_bp.register_blueprint(auth.bp)
api_bp.register_blueprint(session.bp)
api_bp.register_blueprint(explore.bp)
api_bp.register_blueprint(economy.bp)
api_bp.register_blueprint(assets.bp)
api_bp.register_blueprint(cutover.bp)
api_bp.register_blueprint(tasks.bp)
api_bp.register_blueprint(council.bp)
api_bp.register_blueprint(bank.bp)
api_bp.register_blueprint(commerce.bp)
api_bp.register_blueprint(properties.bp)
api_bp.register_blueprint(stocks.bp)
api_bp.register_blueprint(admin_ai.bp)
api_bp.register_blueprint(court.bp)
api_bp.register_blueprint(insolvency.bp)
