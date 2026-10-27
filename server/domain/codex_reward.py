"""Codex completion totals/rewards and one-time server-side claim."""

from __future__ import annotations

from ..infra.errors import AlreadyClaimed, Unprocessable
from ..repo import codex as codex_repo
from ..repo import codex_claims as claim_repo
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo
from ..repo import wallets as wallet_repo
from .ledger import TxRef, post_transaction

KINDS = {"planets": "planet", "elements": "element", "lifeForms": "lifeform"}
TOTALS = {"planets": 27, "elements": 120, "lifeForms": 10}
REWARDS = {
    "planets": {"antimatter": 4000, "exoticCrystal": 25, "alienArtifact": 2},
    "elements": {"antimatter": 8000, "quantumAlloy": 60, "ancientRelic": 5},
    "lifeForms": {"antimatter": 3000, "blackHoleFragment": 2, "dimensionalShard": 1},
}


def status(conn, player: dict) -> dict[str, dict]:
    claimed = set(claim_repo.claimed(conn, player["id"]))
    result: dict[str, dict] = {}
    for section, kind in KINDS.items():
        found = len(codex_repo.list_entries(conn, player["id"], kind, limit=1000))
        result[section] = {
            "found": found,
            "total": TOTALS[section],
            "complete": found >= TOTALS[section],
            "claimed": section in claimed,
        }
    return result


def claim(conn, player: dict, section: str) -> dict:
    if section not in KINDS:
        raise Unprocessable("section 必须是 planets/elements/lifeForms")
    found = len(codex_repo.list_entries(conn, player["id"], KINDS[section], limit=1000))
    if found < TOTALS[section]:
        raise Unprocessable("图鉴尚未集齐")
    if not claim_repo.claim(conn, player["id"], section):
        raise AlreadyClaimed("图鉴奖励已领取")
    reward = REWARDS[section]
    tx = post_transaction(
        conn, player["id"], reward, TxRef("codex_reward", "codex", section)
    )
    version = player_repo.bump_state(conn, player["id"])
    outbox_repo.add(
        conn,
        aggregate_type="player",
        aggregate_id=player["id"],
        event_type="codex.claimed",
        payload={"section": section},
    )
    balances = wallet_repo.balances(conn, player["id"])
    return {
        "section": section,
        "reward": reward,
        "balances": {key: int(balances.get(key, 0)) for key in reward},
        "tx_id": tx["id"],
        "state_version": version,
    }
