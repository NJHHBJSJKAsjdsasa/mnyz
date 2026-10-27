"""Market transaction: shared daily quotes, player-adjusted prices, ledger."""

from __future__ import annotations

from ..infra.errors import NotFound, OutOfStock
from ..repo import calendar as calendar_repo
from ..repo import market as market_repo
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo
from ..repo import ships as ship_repo
from ..repo import wallets as wallet_repo
from . import contract_service, market, planet as planet_domain
from .ledger import TxRef, post_transaction


def get_market(conn, player: dict, planet_key: str) -> dict:
    planet, day, day_row, quotes = _ensure(conn, player, planet_key)
    cargo = _level(ship_repo.modules(conn, player["id"]), "cargoBay")
    trade = int(ship_repo.tech_levels(conn, player["id"]).get("trade", 0))
    balances = wallet_repo.balances(conn, player["id"])
    return {
        "planet": planet_domain.public_payload(planet),
        "game_day": day.isoformat(),
        "quotes": [
            {
                "resource_code": row["resource_code"],
                "buy_price": market.adjusted_buy(row["buy_price"], cargo),
                "sell_price": market.adjusted_sell(row["sell_price"], trade),
                "stock": int(row["stock"]),
                "initial_stock": int(row["initial_stock"]),
            }
            for row in quotes
        ],
        "balances": {
            "antimatter": int(balances.get("antimatter", 0)),
            **{code: int(balances.get(code, 0)) for code in market.GOODS_BY_CODE},
        },
    }


def buy(conn, player: dict, planet_key: str, resource_code: str, quantity: int) -> dict:
    _, _, day_row, _ = _ensure(conn, player, planet_key)
    cargo = _level(ship_repo.modules(conn, player["id"]), "cargoBay")
    quote = market_repo.quote(conn, day_row["id"], resource_code, for_update=True)
    if quote is None:
        raise NotFound("该市场今日没有此商品")

    unit_price = market.adjusted_buy(quote["buy_price"], cargo)
    total = unit_price * quantity
    if not market_repo.take_stock(conn, day_row["id"], resource_code, quantity):
        raise OutOfStock("市场库存不足")

    tx = post_transaction(
        conn,
        player["id"],
        {resource_code: quantity, "antimatter": -total},
        TxRef(kind="trade_buy", ref_type="market", ref_id=f"{planet_key}:{resource_code}"),
    )
    market_repo.insert_order(
        conn,
        player_id=player["id"],
        planet_key=planet_key,
        resource_code=resource_code,
        side="buy",
        quantity=quantity,
        unit_price=unit_price,
        tx_id=tx["id"],
    )
    contract_service.advance(conn, player["id"], ["trades"])
    version = player_repo.bump_state(conn, player["id"])
    _emit(
        conn,
        player["id"],
        "market.bought",
        {"planet_key": planet_key, "resource_code": resource_code, "quantity": quantity, "unit_price": unit_price},
    )
    return _result(conn, player["id"], version, tx["id"], resource_code, quantity, unit_price, total, "buy")


def sell(conn, player: dict, planet_key: str, resource_code: str, quantity: int) -> dict:
    _, _, day_row, _ = _ensure(conn, player, planet_key)
    trade = int(ship_repo.tech_levels(conn, player["id"]).get("trade", 0))
    quote = market_repo.quote(conn, day_row["id"], resource_code, for_update=True)
    if quote is None:
        raise NotFound("该市场今日没有此商品")

    unit_price = market.adjusted_sell(quote["sell_price"], trade)
    total = unit_price * quantity
    tx = post_transaction(
        conn,
        player["id"],
        {resource_code: -quantity, "antimatter": total},
        TxRef(kind="trade_sell", ref_type="market", ref_id=f"{planet_key}:{resource_code}"),
    )
    market_repo.add_stock(conn, day_row["id"], resource_code, quantity)
    market_repo.insert_order(
        conn,
        player_id=player["id"],
        planet_key=planet_key,
        resource_code=resource_code,
        side="sell",
        quantity=quantity,
        unit_price=unit_price,
        tx_id=tx["id"],
    )
    contract_service.advance(conn, player["id"], ["trades"])
    version = player_repo.bump_state(conn, player["id"])
    _emit(
        conn,
        player["id"],
        "market.sold",
        {"planet_key": planet_key, "resource_code": resource_code, "quantity": quantity, "unit_price": unit_price},
    )
    return _result(conn, player["id"], version, tx["id"], resource_code, quantity, unit_price, total, "sell")


def _ensure(conn, player: dict, planet_key: str):
    planet = planet_domain.resolve_planet(conn, player, planet_key)
    day = calendar_repo.game_day(conn, player["timezone"])
    day_row, created = market_repo.ensure_day(conn, planet_key, day)
    if created:
        market_repo.insert_quotes(conn, day_row["id"], market.generate_quotes(planet_key, day))
    quotes = market_repo.quotes(conn, day_row["id"])
    if not quotes:
        market_repo.insert_quotes(conn, day_row["id"], market.generate_quotes(planet_key, day))
        quotes = market_repo.quotes(conn, day_row["id"])
    return planet, day, day_row, quotes


def _level(modules: dict, code: str) -> int:
    return int(modules.get(code, {"level": 0})["level"])


def _result(conn, player_id, version, tx_id, resource_code, quantity, unit_price, total, side) -> dict:
    balances = wallet_repo.balances(conn, player_id)
    return {
        "side": side,
        "resource_code": resource_code,
        "quantity": quantity,
        "unit_price": unit_price,
        "total": total,
        "balances": {
            code: int(balances.get(code, 0)) for code in {resource_code, "antimatter"}
        },
        "tx_id": tx_id,
        "state_version": version,
    }


def _emit(conn, player_id: str, event_type: str, payload: dict) -> None:
    outbox_repo.add(
        conn,
        aggregate_type="player",
        aggregate_id=player_id,
        event_type=event_type,
        payload=payload,
    )
