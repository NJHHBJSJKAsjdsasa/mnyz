"""Operator actions: lock, compensate, announce, and see the economy (12 §5).

Everything here is ``admin``/``ops`` only and every mutation writes an
``audit_log`` row in the same transaction — the point of an operations surface
is that a later reviewer can answer "who did this, to whom, and why".

Two things are deliberately *not* here:

* refunding a single trade — that needs a reversing entry that points back at
  the original ``tx_id``, which lives in ``ledger_reversal`` (T-32) so that the
  ledger, not the ops surface, owns the undo semantics;
* deleting anything. Locks are reversible, grants are additive, announcements
  are deactivated rather than removed.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from ..infra.clock import iso, now
from ..infra.context import request_id
from ..infra.errors import InvalidArgument, NotFound
from ..repo import audit as audit_repo
from ..repo import ledger as ledger_repo
from ..repo import players as player_repo
from .ledger import TxRef, balances_after, post_transaction

SEVERITIES = ("info", "caution", "degraded", "critical")
MAX_GRANT = Decimal("10000000")


def lock_player(conn, *, player_id: str, reason: str, actor: str) -> dict:
    player = player_repo.lock(conn, player_id)
    if player is None:
        raise NotFound("玩家不存在")
    before = player.get("locked_reason")
    conn.execute("UPDATE players SET locked_reason = %s WHERE id = %s", (reason, player_id))
    player_repo.bump_state(conn, player_id)
    audit_repo.write(
        conn,
        audit_repo.AuditEvent(
            action="player.lock",
            actor=actor,
            target=player_id,
            before={"locked_reason": before},
            after={"locked_reason": reason},
            request_id=request_id(),
        ),
    )
    return {"player_id": player_id, "locked": True, "reason": reason}


def unlock_player(conn, *, player_id: str, actor: str) -> dict:
    player = player_repo.lock(conn, player_id)
    if player is None:
        raise NotFound("玩家不存在")
    before = player.get("locked_reason")
    conn.execute("UPDATE players SET locked_reason = NULL WHERE id = %s", (player_id,))
    player_repo.bump_state(conn, player_id)
    audit_repo.write(
        conn,
        audit_repo.AuditEvent(
            action="player.unlock",
            actor=actor,
            target=player_id,
            before={"locked_reason": before},
            after={"locked_reason": None},
            request_id=request_id(),
        ),
    )
    return {"player_id": player_id, "locked": False, "reason": before or ""}


def grant(conn, *, player_id: str, resource_code: str, amount: Decimal, reason: str, actor: str) -> dict:
    """Compensate a player. Additive only: the ledger gets a ``correction`` tx."""
    if amount <= 0 or amount > MAX_GRANT:
        raise InvalidArgument(f"补偿金额需在 0 与 {MAX_GRANT} 之间")
    player = player_repo.lock(conn, player_id)
    if player is None:
        raise NotFound("玩家不存在")

    tx = post_transaction(
        conn,
        player_id,
        {resource_code: amount},
        TxRef(kind="correction", ref_type="ops_grant", ref_id=player_id),
    )
    player_repo.bump_state(conn, player_id)
    audit_repo.write(
        conn,
        audit_repo.AuditEvent(
            action="player.grant",
            actor=actor,
            target=player_id,
            after={
                "resource": resource_code,
                "amount": str(amount),
                "reason": reason,
                "tx_id": tx["id"],
            },
            request_id=request_id(),
        ),
    )
    return {
        "player_id": player_id,
        "tx_id": tx["id"],
        "resource": resource_code,
        "amount": str(amount),
        "balance": str(balances_after(tx["entries"], player_id).get(resource_code, 0)),
        "reason": reason,
    }


def announce(conn, *, title: str, body: str, severity: str, actor: str, hours: int | None = None) -> dict:
    if severity not in SEVERITIES:
        raise InvalidArgument(f"severity 必须是 {', '.join(SEVERITIES)}")
    ends_at = now() + timedelta(hours=hours) if hours else None
    row = conn.execute(
        """
        INSERT INTO announcements (title, body, severity, ends_at, created_by)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, title, body, severity, active, starts_at, ends_at, created_at
        """,
        (title, body, severity, ends_at, actor),
    ).fetchone()
    audit_repo.write(
        conn,
        audit_repo.AuditEvent(
            action="announcement.publish",
            actor=actor,
            target=str(row["id"]),
            after={"title": title, "severity": severity},
            request_id=request_id(),
        ),
    )
    return _announcement(row)


def deactivate(conn, *, announcement_id: str, actor: str) -> dict:
    row = conn.execute(
        """
        UPDATE announcements SET active = false
         WHERE id = %s
        RETURNING id, title, body, severity, active, starts_at, ends_at, created_at
        """,
        (announcement_id,),
    ).fetchone()
    if row is None:
        raise NotFound("公告不存在")
    audit_repo.write(
        conn,
        audit_repo.AuditEvent(
            action="announcement.deactivate",
            actor=actor,
            target=announcement_id,
            request_id=request_id(),
        ),
    )
    return _announcement(row)


def active_announcements(conn, limit: int = 10) -> dict:
    rows = conn.execute(
        """
        SELECT id, title, body, severity, active, starts_at, ends_at, created_at
          FROM announcements
         WHERE active
           AND starts_at <= now()
           AND (ends_at IS NULL OR ends_at > now())
         ORDER BY starts_at DESC
         LIMIT %s
        """,
        (limit,),
    ).fetchall()
    return {"announcements": [_announcement(row) for row in rows]}


def dashboard(conn) -> dict:
    """One screen an operator can trust during an incident.

    Deliberately cheap: every number is a single aggregate, no joins fan out.
    Time series live in the jobs tables; this is "what does the world look like
    right now".
    """
    row = conn.execute(
        """
        SELECT
          (SELECT count(*) FROM players) AS players_total,
          (SELECT count(*) FROM players WHERE last_seen_at > now() - interval '24 hours') AS active_24h,
          (SELECT count(*) FROM players WHERE locked_reason IS NOT NULL) AS locked,
          (SELECT count(*) FROM companies WHERE status = 'bankrupt') AS bankrupt_companies,
          (SELECT count(*) FROM insolvency_cases WHERE status <> 'closed') AS open_insolvency,
          (SELECT count(*) FROM court_cases WHERE status <> 'closed') AS open_cases,
          (SELECT count(*) FROM commerce_licenses WHERE status = 'pending') AS pending_licences
        """
    ).fetchone()

    currency = conn.execute(
        """
        SELECT currency_code, sum(balance) AS total, count(*) FILTER (WHERE balance > 0) AS holders
          FROM currency_accounts
         GROUP BY currency_code
         ORDER BY currency_code
        """
    ).fetchall()

    resources = conn.execute(
        """
        SELECT resource_code, sum(balance) AS total
          FROM wallets
         GROUP BY resource_code
         ORDER BY resource_code
        """
    ).fetchall()

    imbalance = ledger_repo.unbalanced_transactions(conn, hours=24)

    return {
        "players": {
            "total": int(row["players_total"]),
            "active_24h": int(row["active_24h"]),
            "locked": int(row["locked"]),
        },
        "risk": {
            "bankrupt_companies": int(row["bankrupt_companies"]),
            "open_insolvency": int(row["open_insolvency"]),
            "open_court_cases": int(row["open_cases"]),
            "pending_licences": int(row["pending_licences"]),
            "unbalanced_transactions_24h": len(imbalance),
        },
        "currency": [
            {"code": item["currency_code"], "total": str(item["total"] or 0), "holders": int(item["holders"])}
            for item in currency
        ],
        "resources": [{"code": item["resource_code"], "total": str(item["total"] or 0)} for item in resources],
        "server_time": iso(),
    }


def _announcement(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "title": row["title"],
        "body": row["body"],
        "severity": row["severity"],
        "active": bool(row["active"]),
        "starts_at": iso(row["starts_at"]),
        "ends_at": iso(row["ends_at"]) if row["ends_at"] else None,
        "created_at": iso(row["created_at"]),
    }
