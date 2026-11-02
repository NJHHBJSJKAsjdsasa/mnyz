"""Property disputes and the freeze that follows them (T-18 / 04 §5).

A transfer used to be final the moment it settled. 04 §5 wants a **24-hour
dispute window**: within a day of the sale, a party to it (or the current owner)
can contest it, and a contested deed must not be listable, biddable or sellable
until the dispute is closed.

Two mechanisms do the work:

* ``property_disputes`` is the case record — who opened it, why, when it closes.
* the freeze itself is an ordinary ``property_encumbrances(kind='dispute')`` plus
  ``property_assets.status='frozen'``. Reusing the encumbrance table is what makes
  the linkage automatic: ``property_service.buy`` already refuses open
  encumbrances and ``list_asset`` already requires ``status='owned'``.

The dispute freezes are time-boxed: an open case expires on its own after
``DISPUTE_LIFETIME_HOURS`` so a forgotten dispute cannot strand a deed forever.
Upholding a dispute keeps the freeze (the court decides what happens next);
rejecting it releases everything.
"""

from __future__ import annotations

from datetime import timedelta

from ..infra.serialize import ts
from ..infra.errors import AlreadyClaimed, Forbidden, NotFound, Unprocessable
from ..repo import properties as property_repo

#: 04 §5: a sale can be contested for one day after it settles.
DISPUTE_WINDOW_HOURS = 24
#: Nobody can leave a deed frozen indefinitely: open cases lapse after three days.
DISPUTE_LIFETIME_HOURS = 72


# ------------------------------------------------------------------ freeze


def freeze(conn, asset_id: str, *, reason: str = "") -> dict:
    """Freeze a deed and pull any open listing off the market.

    Idempotent: an already-frozen deed keeps its status and gets no second
    encumbrance.
    """
    asset = property_repo.by_id(conn, asset_id, for_update=True)
    if asset is None:
        raise NotFound("产权不存在")

    cancelled = property_repo.cancel_open_listings(conn, asset_id)
    if asset["status"] in ("owned", "listed", "auction", "escrow"):
        property_repo.set_status(conn, asset_id, "frozen")
    existing = [
        row for row in property_repo.open_encumbrances(conn, asset_id) if row["kind"] in ("freeze", "dispute")
    ]
    encumbrance = existing[0] if existing else property_repo.add_encumbrance(conn, asset_id, "freeze", reason)
    return {
        "asset_id": asset_id,
        "status": "frozen",
        "encumbrance_id": str(encumbrance["id"]),
        "cancelled_listings": cancelled,
    }


def unfreeze(conn, asset_id: str) -> dict:
    """Release every freeze/dispute lien; a deed with nothing else open is sellable again."""
    asset = property_repo.by_id(conn, asset_id, for_update=True)
    if asset is None:
        raise NotFound("产权不存在")
    released = 0
    for row in property_repo.open_encumbrances(conn, asset_id):
        if row["kind"] in ("freeze", "dispute"):
            property_repo.release_encumbrance(conn, str(row["id"]))
            released += 1
    # `lien` rows belong to loans and must survive an unfreeze; only flip the
    # status when nothing is left open at all.
    remaining = property_repo.open_encumbrances(conn, asset_id)
    if not remaining and asset["status"] == "frozen":
        property_repo.set_status(conn, asset_id, "owned")
    return {
        "asset_id": asset_id,
        "released": released,
        "status": property_repo.by_id(conn, asset_id)["status"],
        "remaining_encumbrances": len(remaining),
    }


# ------------------------------------------------------------------ disputes


def open_dispute(conn, *, actor: dict, asset_key: str, reason: str = "") -> dict:
    asset = property_repo.by_key(conn, asset_key.strip(), for_update=True)
    if asset is None:
        raise NotFound("产权不存在")
    transfer = property_repo.latest_transfer(conn, str(asset["id"]))
    if transfer is None:
        raise Unprocessable("该产权没有可争议的成交记录")
    if transfer["created_at"] < _now(conn) - timedelta(hours=DISPUTE_WINDOW_HOURS):
        raise Unprocessable(f"争议期已过（成交后 {DISPUTE_WINDOW_HOURS} 小时内可提出）")

    parties = {str(transfer["from_actor_id"]), str(transfer["to_actor_id"])}
    if asset["owner_actor_id"] is not None:
        parties.add(str(asset["owner_actor_id"]))
    if str(actor["id"]) not in parties:
        raise Forbidden("只有交易双方或当前持有人可以提出争议")
    if property_repo.open_dispute_of(conn, str(asset["id"])) is not None:
        raise AlreadyClaimed("该产权已有未结争议")

    encumbrance = property_repo.add_encumbrance(conn, str(asset["id"]), "dispute", reason)
    dispute = property_repo.insert_dispute(
        conn,
        asset_id=str(asset["id"]),
        transfer_id=str(transfer["id"]),
        opened_by=str(actor["id"]),
        reason=reason,
        encumbrance_id=str(encumbrance["id"]),
        closes_at=_now(conn) + timedelta(hours=DISPUTE_LIFETIME_HOURS),
    )
    frozen = freeze(conn, str(asset["id"]), reason=f"dispute {dispute['id']}")
    return {**_payload(dispute), "frozen": frozen}


def resolve_dispute(conn, *, dispute_id: str, upheld: bool, note: str = "") -> dict:
    """Close a case. Upheld keeps the freeze — only a court can undo a transfer."""
    dispute = property_repo.dispute(conn, dispute_id, for_update=True)
    if dispute is None:
        raise NotFound("争议不存在")
    if dispute["status"] != "open":
        raise Unprocessable("争议已结束")

    status = "upheld" if upheld else "rejected"
    property_repo.finish_dispute(conn, dispute_id, status=status, note=note)
    asset_id = str(dispute["asset_id"])
    if upheld:
        # The encumbrance kind moves from `dispute` to `freeze`: the case is
        # closed but the deed stays locked until the court says otherwise.
        property_repo.release_encumbrance(conn, str(dispute["encumbrance_id"]))
        property_repo.add_encumbrance(conn, asset_id, "freeze", f"dispute upheld {dispute_id}")
        return {
            "id": dispute_id,
            "status": status,
            "asset_status": property_repo.by_id(conn, asset_id)["status"],
        }

    property_repo.release_encumbrance(conn, str(dispute["encumbrance_id"]))
    outcome = unfreeze(conn, asset_id)
    return {
        "id": dispute_id,
        "status": status,
        "asset_status": outcome["status"],
        "released": outcome["released"],
        "remaining_encumbrances": outcome["remaining_encumbrances"],
    }


def expire_disputes(conn) -> dict:
    """Job: lapse open cases that outlived their window, and release their freeze."""
    expired = 0
    for row in property_repo.open_disputes(conn):
        if row["closes_at"] > _now(conn):
            continue
        property_repo.finish_dispute(conn, str(row["id"]), status="expired", note="超时未裁决，自动解除冻结")
        property_repo.release_encumbrance(conn, str(row["encumbrance_id"]))
        unfreeze(conn, str(row["asset_id"]))
        expired += 1
    return {"expired": expired, "window_hours": DISPUTE_LIFETIME_HOURS}


def disputes_of(conn, asset_key: str | None = None) -> list[dict]:
    if asset_key:
        asset = property_repo.by_key(conn, asset_key.strip())
        if asset is None:
            raise NotFound("产权不存在")
        rows = property_repo.disputes_for(conn, str(asset["id"]))
    else:
        rows = property_repo.disputes_for(conn, None)
    return [_payload(row) for row in rows]


# ------------------------------------------------------------------ internals


def _now(conn):
    return conn.execute("SELECT now() AS ts").fetchone()["ts"]


def _payload(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "asset_id": str(row["asset_id"]),
        "asset_key": row.get("asset_key"),
        "transfer_id": str(row["transfer_id"]) if row.get("transfer_id") else None,
        "opened_by": str(row["opened_by"]),
        "reason": row["reason"],
        "status": row["status"],
        "opened_at": ts(row["opened_at"]),
        "closes_at": ts(row["closes_at"]),
        "resolved_at": ts(row.get("resolved_at")),
        "resolution_note": row.get("resolution_note") or "",
    }
