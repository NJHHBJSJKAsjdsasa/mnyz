"""Server-side production line (G1 §1).

Crafting converts mid-tier stock into rare goods on a per-recipe cooldown. Three
design points that keep it honest:

* **Recipes are reference data.** They are seeded by migration, not by the client,
  so a recipe cannot be invented or repriced in a browser tab.
* **The ledger settles both sides in one transaction.** ``craft_in`` burns the
  inputs, ``craft_out`` mints the output; a crash between them is impossible.
* **Cooldown is derived from the last run row**, not a separate timer table —
  one row per craft doubles as the production history.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from ..infra.clock import iso, ms_until, now
from ..infra.errors import Cooldown, InvalidArgument, NotFound
from ..repo import players as player_repo
from ..repo import wallets as wallet_repo
from .ledger import TxRef, balances_after, post_transaction

_RECIPES_SQL = """
SELECT code, name, cost, output, cooldown_seconds
  FROM craft_recipes ORDER BY code
"""

_LAST_RUN_SQL = """
SELECT ready_at FROM craft_runs
 WHERE player_id = %s AND recipe_code = %s
 ORDER BY created_at DESC LIMIT 1
"""


def recipes(conn) -> list[dict]:
    return conn.execute(_RECIPES_SQL).fetchall()


def view(conn, player: dict) -> dict:
    balances = wallet_repo.balances(conn, player["id"])
    items = []
    for row in recipes(conn):
        remaining = _remaining_ms(conn, player["id"], row["code"])
        items.append(
            {
                "code": row["code"],
                "name": row["name"],
                "cost": row["cost"],
                "output": row["output"],
                "cooldown_ms": int(row["cooldown_seconds"]) * 1000,
                "cooldown_remaining_ms": remaining,
                "affordable": _affordable(row["cost"], balances),
                "can_run": remaining == 0 and _affordable(row["cost"], balances),
            }
        )
    return {"recipes": items}


def run(conn, player: dict, recipe_code: str) -> dict:
    locked = player_repo.lock(conn, player["id"])
    if locked is None:
        raise InvalidArgument("玩家不存在")

    row = conn.execute(
        "SELECT code, name, cost, output, cooldown_seconds FROM craft_recipes WHERE code = %s",
        (recipe_code,),
    ).fetchone()
    if row is None:
        raise NotFound("配方不存在")

    remaining = _remaining_ms(conn, locked["id"], recipe_code)
    if remaining > 0:
        raise Cooldown(remaining)

    cost = {code: Decimal(str(amount)) for code, amount in (row["cost"] or {}).items()}
    output = {code: Decimal(str(amount)) for code, amount in (row["output"] or {}).items()}
    balances = wallet_repo.balances(conn, locked["id"])
    missing = {
        code: str(amount - balances.get(code, Decimal(0)))
        for code, amount in cost.items()
        if balances.get(code, Decimal(0)) < amount
    }
    if missing:
        raise InvalidArgument(f"原料不足：{', '.join(sorted(missing))}")

    burned = post_transaction(conn, locked["id"], {code: -amount for code, amount in cost.items()},
                              TxRef(kind="craft_in", ref_type="recipe", ref_id=recipe_code))
    minted = post_transaction(conn, locked["id"], output,
                              TxRef(kind="craft_out", ref_type="recipe", ref_id=recipe_code))

    ready_at = now() + timedelta(seconds=int(row["cooldown_seconds"]))
    conn.execute(
        """
        INSERT INTO craft_runs (player_id, recipe_code, ready_at, tx_in, tx_out)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (locked["id"], recipe_code, ready_at, burned["id"], minted["id"]),
    )
    version = player_repo.bump_state(conn, locked["id"])

    after = balances_after(minted["entries"], locked["id"])
    return {
        "recipe": row["name"],
        "gained": {code: str(amount) for code, amount in output.items()},
        "spent": {code: str(amount) for code, amount in cost.items()},
        "balances": {code: str(value) for code, value in after.items()},
        "cooldown_remaining_ms": ms_until(ready_at),
        "ready_at": iso(ready_at),
        "tx_in": burned["id"],
        "tx_out": minted["id"],
        "state_version": version,
    }


# ----------------------------------------------------------------- internals


def _remaining_ms(conn, player_id: str, recipe_code: str) -> int:
    row = conn.execute(_LAST_RUN_SQL, (player_id, recipe_code)).fetchone()
    if row is None:
        return 0
    return ms_until(row["ready_at"])


def _affordable(cost: dict, balances: dict[str, Decimal]) -> bool:
    return all(balances.get(code, Decimal(0)) >= Decimal(str(amount)) for code, amount in (cost or {}).items())
