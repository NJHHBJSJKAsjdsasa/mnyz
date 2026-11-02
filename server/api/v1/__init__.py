"""API v1 blueprint aggregation."""

from __future__ import annotations

from flask import Blueprint

from . import (
    admin_ai,
    admin_ops,
    assets,
    auth,
    bank,
    brokers,
    commerce,
    council,
    court,
    crafting,
    cutover,
    economy,
    explore,
    insolvency,
    internal_dt,
    ledger,
    market,
    meta,
    properties,
    protection,
    revenue,
    session,
    stocks,
    tasks,
    travel,
    universe,
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
api_bp.register_blueprint(internal_dt.bp)
api_bp.register_blueprint(revenue.bp)
api_bp.register_blueprint(market.bp)
api_bp.register_blueprint(brokers.bp)
api_bp.register_blueprint(meta.bp)
api_bp.register_blueprint(admin_ops.bp)
api_bp.register_blueprint(travel.bp)
api_bp.register_blueprint(universe.bp)
api_bp.register_blueprint(crafting.bp)
api_bp.register_blueprint(ledger.bp)
api_bp.register_blueprint(protection.bp)
