"""Loan delinquency ladder (02 §3.3 / T-13 steps 1–4).

``bank_loans.status`` already carries the whole ladder
(``active → overdue → defaulted → liquidated``); what was missing is the clock
that moves a loan *down* it, and what happens to the collateral when it gets
there. This module is both.

Thresholds
----------
* ``due_at`` passes → ``active`` becomes ``overdue`` (no grace period: the due
  date is the contract).
* ``due_at + 7 days`` passes → ``overdue`` becomes ``defaulted``.
* A defaulted loan's pledged deeds move ``pledged → seized`` and each becomes a
  three-day auction whose reserve is the debt (principal + accrued interest).
* When that auction settles, the bank takes interest first, then principal, and
  the borrower gets the surplus (02 §4.3). That is ``settle_liquidation``.

Two design choices worth stating:

1. **The tick only ever moves down, and only one step per run.** A loan that is
   three weeks overdue jumps from ``active`` to ``overdue`` here and will become
   ``defaulted`` on a later run — that keeps each run a single, trivially
   auditable transition instead of a multi-hop surprise.
2. **Seizure transfers the deed, it does not just freeze it.** The bank becomes
   the owner before the auction, so the eventual sale records ``bank → buyer``
   instead of pretending the borrower sold it. A lien stays on the asset until
   the auction settles, which is what stops the borrower from listing it in the
   meantime (``property_service.buy`` refuses assets with open encumbrances).
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from ..repo import banks as bank_repo
from ..repo import players as player_repo
from ..repo import properties as property_repo
from . import currency_service, events
from .currency_service import Move, q4

OVERDUE_GRACE_DAYS = 7
#: Liquidation auctions run for three days — long enough for a bid, short enough
#: that a defaulted loan does not sit in limbo for a week.
AUCTION_DAYS = 3
#: Minimum bid step on a liquidation auction (1% of the reserve).
AUCTION_INCREMENT_BPS = 100


def overdue_tick(conn) -> dict:
    """Advance the delinquency ladder one step for every loan that crossed a line."""
    now = _now(conn)

    overdue = conn.execute(
        """
        UPDATE bank_loans
           SET status = 'overdue'
         WHERE status = 'active'
           AND due_at < %s
        RETURNING id, actor_id, bank_id, principal, outstanding
        """,
        (now,),
    ).fetchall()

    # A loan that *just* became overdue this run must not also default this run:
    # the ladder is one step per run (see module docstring). Excluding the ids we
    # returned above keeps the two UPDATEs from chaining within one transaction.
    fresh_overdue = [str(row["id"]) for row in overdue]
    if fresh_overdue:
        defaulted = conn.execute(
            """
            UPDATE bank_loans
               SET status = 'defaulted'
             WHERE status = 'overdue'
               AND due_at < %s - make_interval(days => %s)
               AND NOT (id = ANY(%s::uuid[]))
            RETURNING id, actor_id, bank_id, outstanding, accrued_interest
            """,
            (now, OVERDUE_GRACE_DAYS, fresh_overdue),
        ).fetchall()
    else:
        defaulted = conn.execute(
            """
            UPDATE bank_loans
               SET status = 'defaulted'
             WHERE status = 'overdue'
               AND due_at < %s - make_interval(days => %s)
            RETURNING id, actor_id, bank_id, outstanding, accrued_interest
            """,
            (now, OVERDUE_GRACE_DAYS),
        ).fetchall()

    for row in overdue:
        _bump(conn, str(row["actor_id"]))
        events.publish(
            conn,
            type="loan.overdue",
            aggregate=str(row["id"]),
            payload={
                "loan_id": str(row["id"]),
                "bank_id": str(row["bank_id"]),
                "outstanding": str(row["outstanding"]),
            },
            actor_id=str(row["actor_id"]),
        )

    seized_total = 0
    for row in defaulted:
        _bump(conn, str(row["actor_id"]))
        seized = seize(conn, row)
        seized_total += seized["seized"]
        events.publish(
            conn,
            type="loan.defaulted",
            aggregate=str(row["id"]),
            payload={
                "loan_id": str(row["id"]),
                "bank_id": str(row["bank_id"]),
                "outstanding": str(row["outstanding"]),
                "accrued_interest": str(row["accrued_interest"]),
                "collateral_seized": seized["seized"],
            },
            actor_id=str(row["actor_id"]),
        )

    return {
        "overdue": len(overdue),
        "defaulted": len(defaulted),
        "seized": seized_total,
        "grace_days": OVERDUE_GRACE_DAYS,
    }


# ------------------------------------------------------- step 2/3: seize & list


def seize(conn, loan: dict) -> dict:
    """Move a defaulted loan's pledged deeds to the bank and put them up for auction.

    Idempotent: only ``pledged`` rows are touched, so a second run (or a retry
    after a crash) creates no duplicate listings.
    """
    bank = bank_repo.by_id(conn, str(loan["bank_id"]))
    if bank is None:  # pragma: no cover - FK guarantees it
        return {"seized": 0}

    pledged = bank_repo.collaterals_of(conn, str(loan["id"]), status="pledged")
    if not pledged:
        return {"seized": 0}

    reserve = q4(Decimal(loan["outstanding"]) + Decimal(loan["accrued_interest"]))
    if reserve <= 0:  # pragma: no cover - a defaulted loan always owes something
        reserve = Decimal("1")
    increment = q4(reserve * AUCTION_INCREMENT_BPS / Decimal(10_000))
    now = _now(conn)

    seized = 0
    for row in pledged:
        asset_id = str(row["asset_id"])
        # Repossess first: the sale that follows must read `bank → buyer`.
        property_repo.transfer_owner(conn, asset_id, str(bank["actor_id"]), Decimal(row["pledged_value"]))
        listing = property_repo.create_listing(
            conn,
            asset_id=asset_id,
            seller_actor_id=str(bank["actor_id"]),
            kind="auction",
            price=reserve,
            min_increment=increment,
            expires_at=now + timedelta(days=AUCTION_DAYS),
        )
        property_repo.set_status(conn, asset_id, "auction")
        bank_repo.seize_collateral(conn, str(row["id"]), str(listing["id"]))
        events.publish(
            conn,
            type="collateral.seized",
            aggregate=str(listing["id"]),
            payload={
                "loan_id": str(loan["id"]),
                "asset_id": asset_id,
                "asset_key": row["asset_key"],
                "reserve": str(reserve),
                "auction_ends_at": listing["expires_at"].isoformat(),
            },
            actor_id=str(loan["actor_id"]),
        )
        seized += 1
    return {"seized": seized}


# ---------------------------------------------------- step 4: split the proceeds


def settle_liquidation(conn, *, listing_id: str, seller_net: Decimal) -> dict | None:
    """Apply auction proceeds to a defaulted loan: interest → principal → borrower.

    ``seller_net`` is what the bank received after the 2% transfer tax and 1%
    commission that ``property_service._settle`` already deducted — 02 §4.3 puts
    "费用" first, and those two are the fees.

    Returns ``None`` when the listing was not a liquidation, so the caller can
    stay a plain sale path.
    """
    row = bank_repo.collateral_by_listing(conn, listing_id, for_update=True)
    if row is None:
        return None

    loan = bank_repo.loan(conn, str(row["loan_id"]), for_update=True)
    if loan is None:  # pragma: no cover - FK guarantees it
        return None
    bank = bank_repo.by_id(conn, str(loan["bank_id"]))

    interest = Decimal(loan["accrued_interest"])
    principal = Decimal(loan["outstanding"])
    pay_interest = min(seller_net, interest)
    rest = seller_net - pay_interest
    pay_principal = min(rest, principal)
    surplus = q4(rest - pay_principal)

    if surplus > 0:
        # The bank keeps only the debt; the remainder belongs to the borrower.
        currency_service.post(
            conn,
            kind="loan_surplus",
            moves=[
                Move(str(bank["actor_id"]), loan["currency_code"], -surplus),
                Move(str(loan["actor_id"]), loan["currency_code"], surplus),
            ],
            ref_type="bank_loan",
            ref_id=str(loan["id"]),
            memo="collateral auction surplus returned to borrower",
        )

    bank_repo.adjust_vault(conn, str(bank["id"]), loan["currency_code"], q4(pay_interest + pay_principal))
    covered = pay_interest >= interest and pay_principal >= principal
    if covered:
        updated = bank_repo.liquidate(conn, str(loan["id"]), principal=pay_principal, written_off=Decimal("0"))
    else:
        updated = bank_repo.write_down(conn, str(loan["id"]), principal=pay_principal, interest=pay_interest)

    bank_repo.settle_collateral(conn, str(row["id"]), "sold")
    if row["encumbrance_id"]:
        property_repo.release_encumbrance(conn, str(row["encumbrance_id"]))

    _bump(conn, str(loan["actor_id"]))
    events.publish(
        conn,
        type="collateral.sold",
        aggregate=str(listing_id),
        payload={
            "loan_id": str(loan["id"]),
            "asset_id": str(row["asset_id"]),
            "proceeds": str(seller_net),
            "paid_interest": str(pay_interest),
            "paid_principal": str(pay_principal),
            "surplus": str(surplus),
            "loan_status": updated["status"],
            "outstanding": str(Decimal(updated["outstanding"])),
        },
        actor_id=str(loan["actor_id"]),
    )
    return {
        "loan_id": str(loan["id"]),
        "asset_id": str(row["asset_id"]),
        "paid_interest": str(pay_interest),
        "paid_principal": str(pay_principal),
        "surplus": str(surplus),
        "loan_status": updated["status"],
        "outstanding": str(Decimal(updated["outstanding"])),
    }


# ----------------------------------------------------------------- internals


def _now(conn):
    return conn.execute("SELECT now() AS ts").fetchone()["ts"]


def _bump(conn, actor_id: str) -> None:
    """Players get a state bump so the shell re-reads; actor_id may be a company."""
    row = conn.execute(
        "SELECT player_id FROM economic_actors WHERE id = %s AND player_id IS NOT NULL",
        (actor_id,),
    ).fetchone()
    if row is not None:
        player_repo.bump_state(conn, str(row["player_id"]))
