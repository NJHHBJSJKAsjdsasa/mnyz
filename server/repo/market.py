"""Market day rows and quote stock updates."""

from __future__ import annotations


def ensure_day(conn, planet_key: str, game_day) -> tuple[dict, bool]:
    row = conn.execute(
        """
        INSERT INTO market_days (planet_key, game_day) VALUES (%s, %s)
        ON CONFLICT (planet_key, game_day) DO NOTHING
        RETURNING id, planet_key, game_day
        """,
        (planet_key.lower(), game_day),
    ).fetchone()
    if row:
        return row, True
    existing = conn.execute(
        "SELECT id, planet_key, game_day FROM market_days WHERE planet_key = %s AND game_day = %s",
        (planet_key.lower(), game_day),
    ).fetchone()
    return existing, False


def insert_quotes(conn, market_day_id, quotes: list[dict]) -> None:
    for quote in quotes:
        conn.execute(
            """
            INSERT INTO market_quotes
                   (market_day_id, resource_code, buy_price, sell_price, stock, initial_stock)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (market_day_id, resource_code) DO NOTHING
            """,
            (
                market_day_id,
                quote["resource_code"],
                quote["buy_price"],
                quote["sell_price"],
                quote["stock"],
                quote["stock"],
            ),
        )


def quotes(conn, market_day_id) -> list[dict]:
    return conn.execute(
        """
        SELECT resource_code, buy_price, sell_price, stock, initial_stock
          FROM market_quotes WHERE market_day_id = %s ORDER BY resource_code
        """,
        (market_day_id,),
    ).fetchall()


def quote(conn, market_day_id, resource_code: str, for_update: bool = False) -> dict | None:
    suffix = " FOR UPDATE" if for_update else ""
    return conn.execute(
        f"""
        SELECT resource_code, buy_price, sell_price, stock, initial_stock
          FROM market_quotes WHERE market_day_id = %s AND resource_code = %s{suffix}
        """,
        (market_day_id, resource_code),
    ).fetchone()


def take_stock(conn, market_day_id, resource_code: str, quantity: int) -> dict | None:
    return conn.execute(
        """
        UPDATE market_quotes SET stock = stock - %s
         WHERE market_day_id = %s AND resource_code = %s AND stock >= %s
        RETURNING stock
        """,
        (quantity, market_day_id, resource_code, quantity),
    ).fetchone()


def add_stock(conn, market_day_id, resource_code: str, quantity: int) -> None:
    conn.execute(
        """
        UPDATE market_quotes SET stock = stock + %s
         WHERE market_day_id = %s AND resource_code = %s
        """,
        (quantity, market_day_id, resource_code),
    )


def insert_order(
    conn,
    *,
    player_id: str,
    planet_key: str,
    resource_code: str,
    side: str,
    quantity: int,
    unit_price: int,
    tx_id: str,
) -> None:
    conn.execute(
        """
        INSERT INTO trade_orders
               (player_id, planet_key, resource_code, side, quantity, unit_price, tx_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (player_id, planet_key.lower(), resource_code, side, quantity, unit_price, tx_id),
    )
