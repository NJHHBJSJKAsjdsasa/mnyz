"""Player appellate panel (08 §12.1).

Five members are drawn from the eligible pool — three serving, two alternates.
Each side may strike one member without cause, so two strikes are enough to
consume both alternates. The majority decides; a tie upholds the judgment.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from ..infra.errors import Forbidden, InvalidArgument, NotFound, Unprocessable
from ..repo import legal
from . import court_service

PANEL_SIZE = 5
SERVING = 3
POOL_EXCLUDE_ROLES = ("judge",)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _pool(conn, case: dict, seed: str) -> list[dict]:
    """Eligible actors: everyone but the parties and the company's officers.

    Deterministic ordering (``md5(seed||actor)``) keeps a re-draw reproducible,
    which is what lets a panel be audited later.
    """
    blocked = {str(case["plaintiff_actor_id"]), str(case["defendant_actor_id"])}
    if case["company_id"]:
        for row in legal.officers_of(conn, str(case["company_id"])):
            blocked.add(str(row["actor_id"]))
    rows = conn.execute(
        """
        SELECT a.id, a.code, a.display_name, a.controller
          FROM economic_actors a
          JOIN players p ON p.id = a.player_id
         WHERE a.kind = 'player'
           AND p.controller IN ('human','server_ai')
           AND NOT (a.id = ANY(%s))
         ORDER BY md5(a.id::text || %s)
         LIMIT %s
        """,
        (list(blocked), seed, PANEL_SIZE * 4),
    ).fetchall()
    return rows


def draw(conn, *, case_id: str, appeal_id: str | None = None) -> dict:
    case = legal.case_by_id(conn, case_id, for_update=True)
    if case is None:
        raise NotFound("案件不存在")
    if legal.panel_of_case(conn, case_id) is not None:
        raise Unprocessable("该案件已有合议庭")
    pool = _pool(conn, case, str(case_id))
    if len(pool) < PANEL_SIZE:
        raise Unprocessable(f"合议庭候选不足（需要 {PANEL_SIZE} 名，当前 {len(pool)} 名）")
    panel = legal.insert_panel(conn, case_id=case_id, appeal_id=appeal_id)
    for index, actor in enumerate(pool[:PANEL_SIZE], start=1):
        legal.insert_panel_member(
            conn,
            panel_id=str(panel["id"]),
            actor_id=str(actor["id"]),
            slot=index,
            role="judge" if index <= SERVING else "alternate",
            status="serving" if index <= SERVING else "drawn",
        )
    return detail(conn, str(panel["id"]))


def detail(conn, panel_id: str) -> dict:
    panel = legal.panel_by_id(conn, panel_id)
    if panel is None:
        raise NotFound("合议庭不存在")
    members = legal.panel_members(conn, panel_id)
    return {
        "id": str(panel["id"]),
        "case_id": str(panel["case_id"]),
        "status": panel["status"],
        "verdict": panel["verdict"],
        "dissent": panel["dissent"],
        "created_at": panel["created_at"].isoformat(),
        "decided_at": panel["decided_at"].isoformat() if panel["decided_at"] else None,
        "members": [
            {
                "actor_id": str(row["actor_id"]),
                "code": row["code"],
                "display_name": row["display_name"],
                "slot": int(row["slot"]),
                "role": row["role"],
                "status": row["status"],
                "controller": row["controller"],
                "vote": row["vote"],
                "reason": row["reason"],
            }
            for row in members
        ],
        "votes": {
            "upheld": sum(1 for row in members if row["vote"] == "upheld"),
            "overturned": sum(1 for row in members if row["vote"] == "overturned"),
            "needed": SERVING // 2 + 1,
        },
    }


def strike(conn, *, panel_id: str, actor: dict, member_actor_id: str,
           for_cause: bool = False) -> dict:
    panel = legal.panel_by_id(conn, panel_id, for_update=True)
    if panel is None:
        raise NotFound("合议庭不存在")
    if panel["status"] != "serving":
        raise Unprocessable("合议庭已结束")
    case = legal.case_by_id(conn, str(panel["case_id"]))
    actor_id = str(actor["id"])
    parties = {str(case["plaintiff_actor_id"]), str(case["defendant_actor_id"])}
    if actor_id not in parties and not for_cause:
        raise Forbidden("只有当事人可以无理由回避")
    if actor_id == member_actor_id:
        raise Forbidden("不能回避自己")

    members = legal.panel_members(conn, panel_id)
    target = next((row for row in members if str(row["actor_id"]) == member_actor_id), None)
    if target is None:
        raise NotFound("该成员不在合议庭")
    if target["status"] not in ("serving", "drawn"):
        raise Unprocessable("该成员已被回避")
    if not for_cause and actor_id in parties:
        already = sum(
            1 for row in members
            if row["status"] == "struck" and row["reason"] == f"strike_by:{actor_id}"
        )
        if already >= 1:
            raise Unprocessable("每方仅有 1 次无理由回避")

    legal.set_panel_member(
        conn, panel_id, member_actor_id, status="struck",
        reason=f"strike_by:{actor_id}" if not for_cause else f"strike_for_cause:{actor_id}",
    )
    if target["status"] == "serving":
        alternate = next(
            (row for row in members if row["status"] == "drawn" and row["role"] == "alternate"),
            None,
        )
        if alternate is not None:
            legal.set_panel_member(
                conn, panel_id, str(alternate["actor_id"]), status="serving", role="judge",
            )
    return detail(conn, panel_id)


def vote(conn, *, panel_id: str, actor: dict, choice: str, reason: str = "") -> dict:
    if choice not in ("upheld", "overturned"):
        raise InvalidArgument("裁决只能是 upheld/overturned")
    panel = legal.panel_by_id(conn, panel_id, for_update=True)
    if panel is None:
        raise NotFound("合议庭不存在")
    if panel["status"] != "serving":
        raise Unprocessable("合议庭已结束")
    members = legal.panel_members(conn, panel_id)
    mine = next((row for row in members if str(row["actor_id"]) == str(actor["id"])), None)
    if mine is None:
        raise Forbidden("你不在这个合议庭")
    if mine["status"] != "serving":
        raise Unprocessable("你当前不是审理成员")
    legal.set_panel_member(
        conn, panel_id, str(actor["id"]), status="voted", vote=choice, reason=reason[:300],
    )
    members = legal.panel_members(conn, panel_id)
    served = [row for row in members if row["role"] == "judge" and row["status"] == "voted"]
    if len(served) < SERVING:
        return detail(conn, panel_id)
    return _decide(conn, panel, members)


def _decide(conn, panel: dict, members: list[dict]) -> dict:
    votes = [row for row in members if row["status"] == "voted"]
    yes = sum(1 for row in votes if row["vote"] == "overturned")
    no = sum(1 for row in votes if row["vote"] == "upheld")
    verdict = "overturned" if yes > no else "upheld"     # a tie upholds the judgment
    dissent = [
        {"actor_id": str(row["actor_id"]), "vote": row["vote"], "reason": row["reason"]}
        for row in votes
        if row["vote"] != verdict
    ]
    legal.finish_panel(conn, str(panel["id"]), verdict=verdict, dissent=dissent)
    case_id = str(panel["case_id"])
    judgment = legal.judgment_of_case(conn, case_id)
    if judgment is not None:
        if verdict == "overturned":
            remedy = dict(judgment["remedy"])
            remedy["pay"] = "0"
            conn.execute(
                "UPDATE court_judgments SET remedy = %s::jsonb, status = 'final' WHERE id = %s",
                (json.dumps(remedy), str(judgment["id"])),
            )
        else:
            legal.set_judgment_status(conn, str(judgment["id"]), "final")
    appeal_id = panel["appeal_id"]
    if appeal_id:
        legal.decide_appeal(conn, str(appeal_id), verdict,
                            {"result": verdict, "source": "player_panel",
                             "dissent": len(dissent)})
    legal.set_case_status(conn, case_id, "closed" if verdict == "overturned" else "judgment")
    return detail(conn, str(panel["id"]))


__all__ = ["draw", "detail", "strike", "vote", "court_service"]
