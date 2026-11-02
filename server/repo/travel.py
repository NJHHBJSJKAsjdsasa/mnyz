"""Travel quotes and jump history (0128).

Both tables are write-once from the domain's point of view: a quote is
``consumed_at``-stamped and never repriced, a log row never changes status back
to ``in_flight``. Reads here are deliberately narrow — ``in_flight`` is called
by ``GET /state`` on every first paint, so it must stay a single indexed query.
"""

from __future__ import annotations

import json


def insert_quote(conn, quote: dict) -> dict:
    return conn.execute(
        """
        INSERT INTO travel_quotes (
          id, player_id, kind, from_x, from_y, from_z, to_x, to_y, to_z,
          distance, cost, affordable, eta_seconds, expires_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s)
        RETURNING id, expires_at
        """,
        (
            quote["id"],
            quote["player_id"],
            quote["kind"],
            quote["from"][0],
            quote["from"][1],
            quote["from"][2],
            quote["to"][0],
            quote["to"][1],
            quote["to"][2],
            quote["distance"],
            json.dumps(quote["cost"]),
            quote["affordable"],
            quote["eta_seconds"],
            quote["expires_at"],
        ),
    ).fetchone()


def lock_quote(conn, quote_id: str) -> dict | None:
    return conn.execute(
        "SELECT * FROM travel_quotes WHERE id = %s FOR UPDATE", (quote_id,)
    ).fetchone()


def consume_quote(conn, quote_id: str, travel_id: str) -> None:
    conn.execute(
        "UPDATE travel_quotes SET consumed_at = now(), travel_id = %s WHERE id = %s",
        (travel_id, quote_id),
    )


def insert_log(conn, travel: dict) -> dict:
    return conn.execute(
        """
        INSERT INTO travel_log (
          id, player_id, quote_id, ship_id, kind,
          from_x, from_y, from_z, to_x, to_y, to_z,
          distance, cost, status, arrive_at, tx_id
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s)
        RETURNING id, kind, status, depart_at, arrive_at, cost
        """,
        (
            travel["id"],
            travel["player_id"],
            travel.get("quote_id"),
            travel.get("ship_id"),
            travel["kind"],
            travel["from"][0],
            travel["from"][1],
            travel["from"][2],
            travel["to"][0],
            travel["to"][1],
            travel["to"][2],
            travel["distance"],
            json.dumps(travel["cost"]),
            travel.get("status", "in_flight"),
            travel["arrive_at"],
            travel.get("tx_id"),
        ),
    ).fetchone()


def travel_of_quote(conn, quote_id: str) -> dict | None:
    return conn.execute(
        "SELECT * FROM travel_log WHERE quote_id = %s", (quote_id,)
    ).fetchone()


def in_flight(conn, player_id: str) -> list[dict]:
    """Rows still flying as of now, newest first (``GET /state.in_flight``)."""
    return conn.execute(
        """
        SELECT id, kind, from_x, from_y, from_z, to_x, to_y, to_z,
               distance, depart_at, arrive_at
          FROM travel_log
         WHERE player_id = %s AND status = 'in_flight' AND arrive_at > now()
         ORDER BY depart_at DESC
         LIMIT 5
        """,
        (player_id,),
    ).fetchall()


def recent(conn, player_id: str, limit: int = 20) -> list[dict]:
    return conn.execute(
        """
        SELECT id, kind, distance, cost, status, depart_at, arrive_at
          FROM travel_log
         WHERE player_id = %s
         ORDER BY depart_at DESC
         LIMIT %s
        """,
        (player_id, limit),
    ).fetchall()
