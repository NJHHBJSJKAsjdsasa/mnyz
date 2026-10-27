"""Deterministic NPC residents and faction reference content (M5)."""

from __future__ import annotations

from ..repo import calendar as calendar_repo
from ..repo import residents as resident_repo
from ..repo import wallets as wallet_repo
from .ledger import TxRef, post_transaction
from .rng import SeededRandom, hash_text

NAMES = [
    ("Vela", "织星者", "trader"),
    ("Orin", "拾荒者", "scavenger"),
    ("Sable", "航线守望", "patrol"),
    ("Iris", "遗迹抄写员", "archivist"),
    ("Kestrel", "炉火工程师", "engineer"),
    ("Nox", "深空信使", "courier"),
]


def ensure(conn, universe: dict) -> None:
    for index, (base, callsign, trait) in enumerate(NAMES):
        resident_repo.ensure_resident(
            conn,
            str(universe["id"]),
            f"resident-{index + 1}",
            f"{base} {chr(65 + index)}",
            callsign,
            trait,
        )


def view(conn, player: dict, universe: dict) -> dict:
    ensure(conn, universe)
    relations = resident_repo.relations(conn, player["id"])
    rows = resident_repo.residents(conn, str(universe["id"]))
    return {
        "factions": [
            {
                "code": row["code"],
                "name": row["name"],
                "description": row["description"],
                "color": row["color"],
            }
            for row in resident_repo.factions(conn)
        ],
        "residents": [
            {
                "id": str(row["id"]),
                "code": row["code"],
                "name": row["name"],
                "callsign": row["callsign"],
                "trait": row["trait"],
                "favor": int(relations.get(str(row["id"]), {}).get("favor", 0)),
                "trades": int(relations.get(str(row["id"]), {}).get("trades", 0)),
                "met": str(row["id"]) in relations,
                "last_met_at": relations.get(str(row["id"]), {}).get("last_met_at"),
            }
            for row in rows
        ],
    }


GIVE = [("exoticCrystal", 3, 8), ("nebulaDust", 2, 5), ("ancientRelic", 1, 2), ("alienArtifact", 1, 2)]
WANT = [("quantumAlloy", 16, 36), ("plasmaCell", 14, 32), ("neuralCircuit", 12, 28), ("deuterium", 24, 60)]
MAX_FAVOR = 10


def offer(conn, player: dict, universe: dict, planet_key: str, resident_id: str | None = None) -> dict | None:
    residents = resident_repo.residents(conn, str(universe["id"]))
    if not residents:
        return None
    day = calendar_repo.game_day(conn, player["timezone"])
    seed = hash_text(f"npc|{universe['id']}|{day}|{planet_key}|{player['id']}")
    if seed % 100 >= 5 and not resident_id:
        return None
    resident = next((row for row in residents if str(row["id"]) == resident_id), None)
    if resident is None:
        resident = residents[seed % len(residents)]
    relations = resident_repo.relations(conn, player["id"])
    favor = int(relations.get(str(resident["id"]), {}).get("favor", 0))
    ratio = max(0.3, 0.7 - favor * 0.02)
    rng = SeededRandom(hash_text(f"offer|{resident['id']}|{day}|{planet_key}"))
    give = GIVE[rng.randint(0, len(GIVE) - 1)]
    want = WANT[rng.randint(0, len(WANT) - 1)]
    return {
        "resident": {
            "id": str(resident["id"]),
            "name": resident["name"],
            "callsign": resident["callsign"],
            "ship": resident["trait"],
            "trait": resident["trait"],
        },
        "favor": favor,
        "give": {give[0]: rng.randint(give[1], give[2])},
        "want": {want[0]: max(1, round(rng.randint(want[1], want[2]) * ratio))},
        "ratio": ratio,
        "planet_key": planet_key,
    }


def trade(conn, player: dict, universe: dict, resident_id: str, planet_key: str) -> dict:
    current = offer(conn, player, universe, planet_key, resident_id)
    if current is None:
        raise Unprocessable("这里今天没有可交易的居民")
    deltas = {code: -int(amount) for code, amount in current["want"].items()}
    deltas.update({code: int(amount) for code, amount in current["give"].items()})
    tx = post_transaction(
        conn, player["id"], deltas, TxRef("npc_trade", "resident", resident_id)
    )
    relation = resident_repo.record_trade(conn, player["id"], resident_id)
    balances = wallet_repo.balances(conn, player["id"])
    return {
        "gained": current["give"],
        "spent": current["want"],
        "favor": int(relation["favor"]),
        "trades": int(relation["trades"]),
        "balances": {code: int(balances.get(code, 0)) for code in set(deltas)},
        "tx_id": tx["id"],
    }


def meet(conn, player: dict, universe: dict, resident_id: str) -> dict:
    from ..infra.errors import NotFound
    from ..repo import residents as resident_repo

    if resident_repo.get(conn, str(universe["id"]), resident_id) is None:
        raise NotFound("居民不存在")
    row = resident_repo.meet(conn, player["id"], resident_id)
    return {
        "resident_id": resident_id,
        "favor": int(row["favor"]),
        "trades": int(row["trades"]),
        "last_met_at": row["last_met_at"],
    }
