"""Alliances: create, join, leave and roster (M5)."""

from __future__ import annotations

import secrets

from ..infra.errors import AlreadyClaimed, InvalidArgument, NotFound, Unprocessable
from ..repo import alliances as alliance_repo
from ..repo import outbox as outbox_repo
from ..repo import players as player_repo


def view(conn, player: dict) -> dict:
    mine = alliance_repo.mine(conn, player["id"])
    if mine is None:
        return {"alliance": None, "members": []}
    return {
        "alliance": {"id": str(mine["id"]), "name": mine["name"], "role": mine["role"]},
        "members": [
            {
                "player_id": str(row["player_id"]),
                "name": row["display_name"],
                "role": row["role"],
            }
            for row in alliance_repo.members(conn, str(mine["id"]))
        ],
    }


def create(conn, player: dict, name: str) -> dict:
    name = (name or "").strip()
    if not 3 <= len(name) <= 24:
        raise InvalidArgument("联盟名长度需在 3–24 之间")
    if alliance_repo.mine(conn, player["id"]):
        raise AlreadyClaimed("已加入联盟")
    if alliance_repo.by_name(conn, name):
        raise AlreadyClaimed("联盟名已被占用")
    alliance = alliance_repo.create(conn, name, player["id"])
    version = _finish(conn, player["id"], "alliance.created", {"alliance_id": str(alliance["id"])})
    return {"alliance": {"id": str(alliance["id"]), "name": alliance["name"]}, "state_version": version}


def join(conn, player: dict, alliance_id: str) -> dict:
    if alliance_repo.mine(conn, player["id"]):
        raise AlreadyClaimed("已加入联盟")
    members = alliance_repo.members(conn, alliance_id)
    if not members:
        raise NotFound("联盟不存在")
    if len(members) >= 5:
        raise Unprocessable("联盟最多 5 位成员")
    alliance_repo.add_member(conn, alliance_id, player["id"])
    version = _finish(conn, player["id"], "alliance.joined", {"alliance_id": alliance_id})
    return {"alliance_id": alliance_id, "state_version": version}


def create_invite(conn, player: dict) -> dict:
    mine = alliance_repo.mine(conn, player["id"])
    if mine is None or mine["role"] != "leader":
        raise Unprocessable("只有盟主可以生成邀请码")
    code = secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8]
    invite = alliance_repo.create_invite(conn, str(mine["id"]), code)
    version = _finish(conn, player["id"], "alliance.invite", {"code": code})
    return {
        "code": invite["code"],
        "expires_at": invite["expires_at"],
        "state_version": version,
    }


def join_code(conn, player: dict, code: str) -> dict:
    if alliance_repo.mine(conn, player["id"]):
        raise AlreadyClaimed("已加入联盟")
    invite = alliance_repo.find_invite(conn, (code or "").strip())
    if invite is None or invite["used_at"] is not None:
        raise NotFound("邀请码无效或已使用")
    members = alliance_repo.members(conn, str(invite["alliance_id"]))
    if len(members) >= 5:
        raise Unprocessable("联盟最多 5 位成员")
    if not alliance_repo.use_invite(conn, code):
        raise NotFound("邀请码已过期")
    alliance_repo.add_member(conn, str(invite["alliance_id"]), player["id"])
    version = _finish(conn, player["id"], "alliance.joined", {"alliance_id": str(invite["alliance_id"])})
    return {
        "alliance_id": str(invite["alliance_id"]),
        "state_version": version,
    }


def leave(conn, player: dict) -> dict:
    if alliance_repo.leave(conn, player["id"]) == 0:
        raise NotFound("尚未加入联盟")
    version = _finish(conn, player["id"], "alliance.left", {})
    return {"left": True, "state_version": version}


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
