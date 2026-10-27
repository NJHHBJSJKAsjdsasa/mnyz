"""AI-majority cosmic council: motions, votes and universe-wide decisions."""

from __future__ import annotations

from ..infra.errors import AlreadyClaimed, NotFound, Unprocessable
from ..repo import council as council_repo
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo
from ..repo import sectors as sector_repo
from ..repo import ships as ship_repo
from ..repo import tech as tech_repo
from ..repo import wallets as wallet_repo
from . import task_service
from .ledger import TxRef, post_transaction
from .rng import SeededRandom, hash_text
from .sector_service import quote as sector_quote

AI_SEATS = 5
PASS_YES = 4
MOTION_MINUTES = 2
SEED_SEATS = [
    (1, "守望者·奥罗拉", "keepers", True, "稳定与遗迹"),
    (2, "会计官·塞勒斯", "guild", True, "贸易与财富"),
    (3, "监察官·萨布尔", "wardens", True, "安全与边境"),
    (4, "观测员·伊里斯", "chorus", True, "研究与深空"),
    (5, "ATLAS-9", None, True, "全宇宙均衡"),
    (6, "开放席位", None, False, "玩家席位"),
    (7, "开放席位", None, False, "玩家席位"),
]


def _ensure_seats(conn) -> None:
    for seat in SEED_SEATS:
        council_repo.ensure_seat(conn, *seat)


def ensure_seats(conn) -> None:
    """Public alias: other subsystems (AI bootstrap) need the seats to exist."""
    _ensure_seats(conn)


def view(conn, player: dict) -> dict:
    _ensure_seats(conn)
    resolve_due(conn)
    seats = [
        {
            "seat_no": int(row["seat_no"]),
            "name": row["player_name"] or row["name"],
            "faction_code": row["faction_code"],
            "is_ai": bool(row["is_ai"]),
            "focus": row["focus"],
            "player_id": str(row["player_id"]) if row["player_id"] else None,
        }
        for row in council_repo.seats(conn)
    ]
    mine = council_repo.seat_for_player(conn, player["id"])
    motions = [_motion_payload(conn, row, mine) for row in council_repo.recent(conn, player["id"])]
    return {
        "seats": seats,
        "my_seat": int(mine["seat_no"]) if mine else None,
        "motions": motions,
        "rules": {
            "seats": 7,
            "ai_seats": AI_SEATS,
            "player_seats": 2,
            "pass_yes": PASS_YES,
            "review_minutes": MOTION_MINUTES,
        },
    }


def apply_sector(conn, player: dict, sector_key: str) -> dict:
    _ensure_seats(conn)
    if council_repo.open_motion_for(conn, player["id"], "sector_license", sector_key):
        raise AlreadyClaimed("该星区已在审核中")
    quoted = sector_quote(conn, player, sector_key)
    cost = {"antimatter": int(quoted["cost"])}
    post_transaction(
        conn,
        player["id"],
        {"antimatter": -cost["antimatter"]},
        TxRef("sector_apply", "sector", sector_key),
    )
    motion = council_repo.create_motion(
        conn, "sector_license", player["id"], sector_key, cost, MOTION_MINUTES
    )
    _ai_vote(conn, motion, player)
    version = player_repo.bump_state(conn, player["id"])
    outbox_repo.add(
        conn,
        aggregate_type="player",
        aggregate_id=player["id"],
        event_type="council.motion",
        payload={"motion_id": str(motion["id"]), "sector_key": sector_key},
    )
    return {"motion": _motion_payload(conn, motion, council_repo.seat_for_player(conn, player["id"])), "state_version": version}


def apply_seat(conn, player: dict) -> dict:
    _ensure_seats(conn)
    if council_repo.seat_for_player(conn, player["id"]):
        raise AlreadyClaimed("你已经是委员会成员")
    if council_repo.open_motion_for(conn, player["id"], "membership"):
        raise AlreadyClaimed("入会申请正在审核")
    motion = council_repo.create_motion(conn, "membership", player["id"], None, {}, MOTION_MINUTES)
    _ai_vote(conn, motion, player)
    version = player_repo.bump_state(conn, player["id"])
    return {"motion": _motion_payload(conn, motion, None), "state_version": version}


def vote(conn, player: dict, motion_id: str, choice: str) -> dict:
    if choice not in {"yes", "no"}:
        raise Unprocessable("vote 必须是 yes/no")
    seat = council_repo.seat_for_player(conn, player["id"])
    if seat is None:
        raise Unprocessable("只有委员会成员可以投票")
    motion = council_repo.get_motion(conn, motion_id, for_update=True)
    if motion is None:
        raise NotFound("动议不存在")
    if motion["status"] != "open":
        raise AlreadyClaimed("动议已结束")
    council_repo.add_vote(conn, motion_id, int(seat["seat_no"]), choice, "玩家议员投票")
    version = player_repo.bump_state(conn, player["id"])
    return {"motion": _motion_payload(conn, motion, seat), "state_version": version}


def leave(conn, player: dict) -> dict:
    if not council_repo.vacate_player(conn, player["id"]):
        raise Unprocessable("你不在委员会中")
    version = player_repo.bump_state(conn, player["id"])
    return {"left": True, "state_version": version}


def resolve_due(conn) -> dict:
    resolved = 0
    for motion in council_repo.due_motions(conn):
        votes = council_repo.votes(conn, str(motion["id"]))
        yes = sum(1 for row in votes if row["vote"] == "yes")
        no = sum(1 for row in votes if row["vote"] == "no")
        passed = yes >= PASS_YES and yes > no
        if passed and motion["kind"] == "sector_license":
            _grant_sector(conn, motion)
        elif passed and motion["kind"] == "membership":
            if not _assign_seat(conn, motion):
                passed = False
        elif not passed and motion["kind"] == "sector_license":
            _refund(conn, motion)
        status = "passed" if passed else "rejected"
        reason = (
            f"赞成 {yes} / 反对 {no}，"
            + ("达到 4 票门槛。" if passed else "未达到 4 票门槛，资源按 50% 退还。")
        )
        council_repo.finish(conn, str(motion["id"]), status, reason)
        player = player_repo.get(conn, str(motion["player_id"]))
        if player:
            player_repo.bump_state(conn, str(motion["player_id"]))
            outbox_repo.add(
                conn,
                aggregate_type="player",
                aggregate_id=str(motion["player_id"]),
                event_type="council.decided",
                payload={"motion_id": str(motion["id"]), "status": status},
            )
        resolved += 1
    return {"resolved": resolved}


def _grant_sector(conn, motion: dict) -> None:
    key = motion["sector_key"]
    if key and sector_repo.insert(conn, str(motion["player_id"]), key):
        player = player_repo.get(conn, str(motion["player_id"]))
        if player:
            task_service.advance(conn, player, "galaxiesVisited", 1)


def _refund(conn, motion: dict) -> None:
    cost = int((motion["cost"] or {}).get("antimatter", 0))
    if cost > 0:
        post_transaction(
            conn,
            str(motion["player_id"]),
            {"antimatter": max(1, cost // 2)},
            TxRef("sector_refund", "motion", str(motion["id"])),
        )


def _assign_seat(conn, motion: dict) -> bool:
    for seat in council_repo.seats(conn):
        if not seat["is_ai"] and seat["player_id"] is None:
            return council_repo.assign_player(conn, int(seat["seat_no"]), str(motion["player_id"]))
    return False


def _ai_vote(conn, motion: dict, player: dict) -> None:
    ship = ship_repo.flagship(conn, player["id"])
    level = int(ship["level"]) if ship else 1
    licenses = sector_repo.count(conn, player["id"])
    tech = len(tech_repo.unlocked(conn, player["id"]))
    balances = wallet_repo.balances(conn, player["id"])
    for seat in council_repo.seats(conn):
        if not seat["is_ai"]:
            continue
        rng = SeededRandom(hash_text(f"council|{motion['id']}|{seat['seat_no']}|{player['id']}"))
        if motion["kind"] == "sector_license":
            score = 0.30 + min(level, 999) / 999 * 0.25 + min(tech, 16) / 16 * 0.12
            score -= min(0.18, licenses * 0.002)
            faction = seat["faction_code"]
            if faction == "guild" and int(balances.get("antimatter", 0)) > 10000:
                score += 0.08
            if faction == "wardens" and level >= 10:
                score += 0.06
            if faction == "chorus" and tech >= 8:
                score += 0.06
            if faction == "keepers":
                score -= 0.03
            score += rng.next() * 0.30
        else:
            score = 0.15 + min(level, 999) / 999 * 0.35 + min(licenses, 60) / 60 * 0.15
            score += min(tech, 16) / 16 * 0.12 + rng.next() * 0.25
        vote = "yes" if score >= 0.5 else "no"
        reason = f"{seat['focus']}评估：{'支持' if vote == 'yes' else '保留'}（评分 {score:.2f}）"
        council_repo.add_vote(conn, str(motion["id"]), int(seat["seat_no"]), vote, reason)


def _motion_payload(conn, motion: dict, seat: dict | None) -> dict:
    votes = council_repo.votes(conn, str(motion["id"]))
    yes = sum(1 for row in votes if row["vote"] == "yes")
    no = sum(1 for row in votes if row["vote"] == "no")
    return {
        "id": str(motion["id"]),
        "kind": motion["kind"],
        "player_id": str(motion["player_id"]),
        "sector_key": motion["sector_key"],
        "cost": motion["cost"],
        "status": motion["status"],
        "created_at": motion["created_at"].isoformat(),
        "closes_at": motion["closes_at"].isoformat(),
        "decided_at": motion["decided_at"].isoformat() if motion.get("decided_at") else None,
        "outcome_reason": motion.get("outcome_reason"),
        "yes": yes,
        "no": no,
        "can_vote": bool(seat) and motion["status"] == "open",
        "votes": [
            {
                "seat_no": int(row["seat_no"]),
                "name": row["name"],
                "is_ai": bool(row["is_ai"]),
                "vote": row["vote"],
                "reason": row["reason"],
            }
            for row in votes
        ],
    }
