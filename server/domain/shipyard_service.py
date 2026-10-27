"""Ship upgrade, module refit/overclock, hull repair and tech unlocks."""

from __future__ import annotations

from ..infra.errors import AlreadyClaimed, NotFound, Unprocessable
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo
from ..repo import reference as reference_repo
from ..repo import ships as ship_repo
from ..repo import tech as tech_repo
from ..repo import wallets as wallet_repo
from . import refit as refit_domain
from . import ship as ship_domain
from .ledger import TxRef, post_transaction


def upgrade_ship(conn, player: dict) -> dict:
    ship = ship_repo.flagship(conn, player["id"])
    if ship is None:
        raise NotFound("飞船不存在")
    level = int(ship["level"])
    if level >= ship_domain.MAX_LEVEL:
        raise Unprocessable("飞船已达最高等级")
    cost = ship_domain.upgrade_cost(level)
    tx = _charge(conn, player["id"], cost, "ship_upgrade", "ship", str(ship["id"]))
    ship_repo.set_level(conn, player["id"], level + 1)
    version = _finish(conn, player["id"], "ship.upgraded", {"level": level + 1})
    return _result(conn, player["id"], version, tx, cost, {"level": level + 1})


def refit_module(conn, player: dict, module_code: str, use_voucher: bool = False) -> dict:
    definition = reference_repo.module_definition(conn, module_code)
    if definition is None:
        raise NotFound("模块不存在")
    current = ship_repo.modules(conn, player["id"]).get(module_code, {"level": 0, "overclock": 0})
    level = int(current["level"])
    if level >= int(definition["max_level"]):
        raise Unprocessable("模块已达最高等级")
    cost = refit_domain.refit_cost(definition["cost_curve"], level + 1)
    voucher_used = False
    if use_voucher:
        flags = ship_repo.flags(conn, player["id"]) or {"vouchers": 0}
        if int(flags["vouchers"]) < 1:
            raise Unprocessable("没有可用的改装券")
        cost = {code: max(1, int(round(amount * 0.5))) for code, amount in cost.items()}
        voucher_used = True
    tx = _charge(conn, player["id"], cost, "refit", "module", module_code)
    if voucher_used:
        ship_repo.add_vouchers(conn, player["id"], -1)
    ship_repo.upsert_module(conn, player["id"], module_code, level + 1, int(current["overclock"]))
    version = _finish(conn, player["id"], "ship.refitted", {"module": module_code, "level": level + 1})
    applied = {"module": module_code, "level": level + 1, "voucher_used": voucher_used}
    if voucher_used:
        applied["vouchers"] = int((ship_repo.flags(conn, player["id"]) or {"vouchers": 0})["vouchers"])
    return _result(conn, player["id"], version, tx, cost, applied)


def overclock_module(conn, player: dict, module_code: str) -> dict:
    definition = reference_repo.module_definition(conn, module_code)
    if definition is None:
        raise NotFound("模块不存在")
    current = ship_repo.modules(conn, player["id"]).get(module_code, {"level": 0, "overclock": 0})
    level, overclock = int(current["level"]), int(current["overclock"])
    if level < refit_domain.OVERCLOCK_MIN_LEVEL:
        raise Unprocessable(f"模块需要 {refit_domain.OVERCLOCK_MIN_LEVEL} 级才能超频")
    if overclock >= refit_domain.MAX_OVERCLOCK:
        raise Unprocessable("超频次数已达上限")
    cost = refit_domain.overclock_cost(definition["cost_curve"], level + 1, overclock)
    tx = _charge(conn, player["id"], cost, "overclock", "module", module_code)
    ship_repo.upsert_module(conn, player["id"], module_code, level, overclock + 1)
    version = _finish(
        conn, player["id"], "ship.overclocked", {"module": module_code, "overclock": overclock + 1}
    )
    return _result(
        conn,
        player["id"],
        version,
        tx,
        cost,
        {"module": module_code, "level": level, "overclock": overclock + 1},
    )


def repair_hull(conn, player: dict) -> dict:
    flags = ship_repo.flags(conn, player["id"]) or {"hull": 100}
    missing = 100 - int(flags["hull"])
    if missing <= 0:
        raise Unprocessable("船体状态完好")
    cost = refit_domain.repair_cost(missing)
    tx = _charge(conn, player["id"], cost, "hull_repair", "ship", player["id"])
    ship_repo.set_hull(conn, player["id"], 100)
    version = _finish(conn, player["id"], "ship.repaired", {"hull": 100})
    return _result(conn, player["id"], version, tx, cost, {"hull": 100})


def unlock_tech(conn, player: dict, node_code: str) -> dict:
    node = tech_repo.node(conn, node_code)
    if node is None:
        raise NotFound("科技节点不存在")
    if node_code in tech_repo.unlocked(conn, player["id"]):
        raise AlreadyClaimed("该科技已解锁")
    if node["requires"] and node["requires"] not in tech_repo.unlocked(conn, player["id"]):
        raise Unprocessable(f"需要先解锁 {node['requires']}")
    cost = {code: int(amount) for code, amount in (node["cost"] or {}).items()}
    tx = _charge(conn, player["id"], cost, "tech_unlock", "tech", node_code)
    if not tech_repo.insert(conn, player["id"], node_code):
        raise AlreadyClaimed("该科技已解锁")
    version = _finish(conn, player["id"], "tech.unlocked", {"node": node_code})
    return _result(conn, player["id"], version, tx, cost, {"node": node_code})


def _charge(conn, player_id: str, costs: dict, kind: str, ref_type: str, ref_id: str):
    deltas = {code: -int(amount) for code, amount in costs.items() if int(amount) > 0}
    if not deltas:
        return None
    return post_transaction(conn, player_id, deltas, TxRef(kind=kind, ref_type=ref_type, ref_id=ref_id))


def _finish(conn, player_id: str, event_type: str, payload: dict) -> int:
    version = player_repo.bump_state(conn, player_id)
    outbox_repo.add(
        conn,
        aggregate_type="player",
        aggregate_id=player_id,
        event_type=event_type,
        payload=payload,
    )
    return version


def _result(conn, player_id, version, tx, costs, applied) -> dict:
    balances = wallet_repo.balances(conn, player_id)
    return {
        "applied": applied,
        "cost": costs,
        "balances": {code: int(balances.get(code, 0)) for code in set(costs)},
        "tx_id": tx["id"] if tx else None,
        "state_version": version,
    }
