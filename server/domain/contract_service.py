"""Daily contracts: generation, acceptance, progress and reward claims."""

from __future__ import annotations

from ..infra.clock import db_now
from ..infra.errors import AlreadyClaimed, ContractExpired, NotFound, Unprocessable
from ..repo import calendar as calendar_repo
from ..repo import contracts as contract_repo
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo
from ..repo import ships as ship_repo
from ..repo import wallets as wallet_repo
from . import contracts as contract_domain
from .ledger import TxRef, post_transaction

TTL_HOURS = 12


def ensure_daily(conn, player: dict) -> tuple[list[dict], dict]:
    day = calendar_repo.game_day(conn, player["timezone"])
    rows = contract_repo.for_day(conn, player["id"], day)
    if rows:
        return rows, contract_repo.templates(conn)

    templates = contract_repo.templates(conn)
    levels = {code: int(row["level"]) for code, row in ship_repo.modules(conn, player["id"]).items()}
    generated = contract_domain.generate(player["id"], day, templates, levels)
    contract_repo.insert_many(conn, player["id"], day, generated)
    return contract_repo.for_day(conn, player["id"], day), templates


def list_contracts(conn, player: dict) -> list[dict]:
    rows, templates = ensure_daily(conn, player)
    levels = _levels(conn, player["id"])
    result: list[dict] = []
    for row in rows:
        template = templates.get(row["template_code"], {})
        result.append(
            {
                "id": row["id"],
                "template": row["template_code"],
                "name": template.get("name", row["template_code"]),
                "metric": row["metric"],
                "target": int(row["target"]),
                "progress": int(row["progress"]),
                "status": row["status"],
                "taken_by": row["taken_by"],
                "expires_at": row["expires_at"],
                "reward": contract_domain.reward_preview(
                    row, template.get("requires_module"), levels
                ),
                "vouchers": int((template.get("reward_formula") or {}).get("vouchers", 0)),
            }
        )
    return result


def accept(conn, player: dict, contract_id: str) -> dict:
    row = contract_repo.get(conn, player["id"], contract_id, for_update=True)
    if row is None:
        raise NotFound("合同不存在")
    if row["status"] != "open":
        raise Unprocessable("合同不可接取")
    if row["taken_by"]:
        raise Unprocessable("该合同已被 NPC 接取")
    accepted = contract_repo.accept(conn, player["id"], contract_id)
    if accepted is None:
        raise Unprocessable("合同已被抢走")
    version = player_repo.bump_state(conn, player["id"])
    outbox_repo.add(
        conn,
        aggregate_type="player",
        aggregate_id=player["id"],
        event_type="contract.accepted",
        payload={"contract_id": contract_id},
    )
    return {
        "id": contract_id,
        "status": "accepted",
        "expires_at": accepted["expires_at"],
        "state_version": version,
    }


def claim(conn, player: dict, contract_id: str) -> dict:
    row = contract_repo.get(conn, player["id"], contract_id, for_update=True)
    if row is None:
        raise NotFound("合同不存在")
    if row["status"] == "claimed":
        raise AlreadyClaimed("合同奖励已领取")
    if row["status"] != "accepted":
        raise Unprocessable("合同尚未接取")
    if row["expires_at"] and row["expires_at"] <= db_now(conn):
        raise ContractExpired("合同已过期")
    if int(row["progress"]) < int(row["target"]):
        raise Unprocessable(f"进度不足：{row['progress']}/{row['target']}")

    template = contract_repo.templates(conn).get(row["template_code"], {})
    levels = _levels(conn, player["id"])
    reward = contract_domain.reward_preview(row, template.get("requires_module"), levels)
    vouchers = int((template.get("reward_formula") or {}).get("vouchers", 0))
    if vouchers:
        ship_repo.add_vouchers(conn, player["id"], vouchers)

    tx = post_transaction(
        conn,
        player["id"],
        reward,
        TxRef(kind="contract_reward", ref_type="contract", ref_id=contract_id),
    )
    if contract_repo.claim(conn, player["id"], contract_id) is None:
        raise Unprocessable("合同状态已变化")
    version = player_repo.bump_state(conn, player["id"])
    outbox_repo.add(
        conn,
        aggregate_type="player",
        aggregate_id=player["id"],
        event_type="contract.claimed",
        payload={"contract_id": contract_id, "reward": reward, "vouchers": vouchers},
    )
    balances = wallet_repo.balances(conn, player["id"])
    return {
        "id": contract_id,
        "reward": reward,
        "vouchers": vouchers,
        "balances": {code: int(balances.get(code, 0)) for code in reward},
        "tx_id": tx["id"],
        "state_version": version,
    }


def advance(conn, player_id: str, metrics: list[str]) -> dict | None:
    return contract_repo.advance(conn, player_id, metrics)


def _levels(conn, player_id: str) -> dict[str, int]:
    return {code: int(row["level"]) for code, row in ship_repo.modules(conn, player_id).items()}
