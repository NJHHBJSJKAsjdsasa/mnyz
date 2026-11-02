"""Capital actions: buyback, issuance and reduction (T-16 / 08 §4).

The governance side already existed — ``company_law.propose`` accepts ``buyback``
and ``issuance`` resolutions and tallies them with the special majority. What was
missing is the money: ``_apply`` had a branch for dividends and nothing else, so a
passed resolution changed no balances. This module is that branch.

Rules implemented (08 §4 / 03 §5)

* **Buyback** — pro-rata from the register at a fixed price, paid by the company
  treasury. Listed companies keep the shares as treasury stock (they stay in the
  trading register, so they can be sold later); private companies cancel them.
  Treasury stock carries no vote because voting reads ``share_holdings`` and only
  the private path touches it.
* **Issuance** — two shapes:
  - private placement (``buyer_actor_id`` given): the buyer pays the treasury at
    the issue price and receives the new shares — this is how a private company
    raises money, and how a listed company does a block deal;
  - public offering (no buyer): shares are minted to the treasury and a resting
    sell order is placed at the issue price, exactly like the IPO path. Cash
    arrives when buyers lift the offer.
* **Reduction** — pro-rata cancellation paid at a fixed price. Guarded by "no
  active bank loan": 08 §4 wants a creditor notice period, and an outstanding
  loan is the only creditor the game actually models.

Voting vs trading registers
---------------------------
``share_holdings`` is the governance register (who votes), ``stock_holders`` is
the trading register (who can sell). For a listed company they diverge after the
first secondary trade — a pre-existing split, not introduced here. Capital
actions therefore move *both* books when the company is listed: the trading side
so the float stays right, the governance side so the percentage held by the
controller keeps meaning something.
"""

from __future__ import annotations

from decimal import Decimal

from ..infra.errors import InvalidArgument, Unprocessable
from ..repo import banks as bank_repo
from ..repo import companies as company_repo
from ..repo import stocks as stock_repo
from . import currency_service
from .currency_service import Move, q4

#: Private companies raise and return Q3; listed ones use the listing currency.
PRIVATE_CURRENCY = "cc3"


def _listing(conn, company: dict) -> dict | None:
    return stock_repo.listing_by_ticker(conn, str(company["ticker"]))


def _currency(company: dict, listing: dict | None) -> str:
    return str(listing["currency_code"]) if listing is not None else PRIVATE_CURRENCY


def _treasury_actor(company: dict) -> str:
    actor_id = company["treasury_actor_id"]
    if actor_id is None:  # pragma: no cover - created with the company
        raise Unprocessable("公司金库不存在")
    return str(actor_id)


def _balance(conn, actor_id: str, code: str) -> Decimal:
    row = conn.execute(
        "SELECT balance FROM currency_accounts WHERE actor_id = %s AND currency_code = %s",
        (actor_id, code),
    ).fetchone()
    return Decimal(row["balance"]) if row else Decimal(0)


def _pro_rata(entries: list[tuple[str, int]], target: int) -> list[tuple[str, int]]:
    """Split ``target`` across holders by weight; dust goes to the largest first.

    Returns a list sorted by actor id so callers (and the ledger) are stable.
    """
    total = sum(qty for _, qty in entries)
    if total <= 0 or target <= 0:
        return []
    take = min(target, total)
    plan: dict[str, int] = {}
    for actor_id, qty in entries:
        share = take * qty // total
        if share > 0:
            plan[actor_id] = plan.get(actor_id, 0) + share
    # Flooring loses up to len(entries)-1 shares; hand the remainder to the
    # biggest holders so the total is exact.
    leftover = take - sum(plan.values())
    for actor_id, qty in sorted(entries, key=lambda row: (-row[1], row[0])):
        if leftover <= 0:
            break
        if plan.get(actor_id, 0) >= qty:
            continue
        plan[actor_id] = plan.get(actor_id, 0) + 1
        leftover -= 1
    return sorted(plan.items())


# ------------------------------------------------------------------ entries


def buyback(conn, *, company: dict, price: Decimal, shares: int) -> dict:
    value = q4(price)
    quantity = int(shares)
    if value <= 0 or quantity <= 0:
        raise InvalidArgument("回购价格与股数必须大于 0")

    listing = _listing(conn, company)
    code = _currency(company, listing)
    treasury = _treasury_actor(company)

    if listing is not None:
        holders = [
            (str(row["actor_id"]), int(row["shares"]))
            for row in stock_repo.holders_of(conn, str(listing["id"]))
            if str(row["actor_id"]) != treasury
        ]
    else:
        holders = [
            (str(row["actor_id"]), int(row["shares"]))
            for row in company_repo.holdings_of(conn, str(company["id"]))
            if str(row["actor_id"]) != treasury and int(row["shares"]) > 0
        ]

    plan = _pro_rata(holders, quantity)
    bought = sum(qty for _, qty in plan)
    if bought <= 0:
        raise Unprocessable("没有可回购的股份")

    cost = q4(value * Decimal(bought))
    if _balance(conn, treasury, code) < cost:
        raise Unprocessable(f"公司金库余额不足：需要 {cost} {code}")

    moves = [Move(treasury, code, -cost)]
    moves.extend(Move(actor_id, code, q4(value * Decimal(qty))) for actor_id, qty in plan)
    tx = currency_service.post(
        conn,
        kind="company_buyback",
        moves=moves,
        ref_type="company",
        ref_id=str(company["id"]),
        memo=f"buyback {bought}@{value}",
    )
    if listing is not None:
        for actor_id, qty in plan:
            stock_repo.debit_shares(conn, actor_id=actor_id, listing_id=str(listing["id"]), quantity=qty)
        stock_repo.ensure_holder(conn, treasury, str(listing["id"]))
        stock_repo.credit_shares(
            conn, actor_id=treasury, listing_id=str(listing["id"]),
            quantity=bought, price=value, locked_until=None,
        )
        # Governance side: the controller's percentage must keep meaning something.
        for actor_id, qty in plan:
            company_repo.adjust_holding(conn, actor_id, str(company["id"]), -qty)
        company_repo.adjust_holding(conn, treasury, str(company["id"]), bought)
        new_total = int(company["shares_total"])
        new_float = int(company["free_float"])
    else:
        for actor_id, qty in plan:
            company_repo.adjust_holding(conn, actor_id, str(company["id"]), -qty)
        new_total = int(company["shares_total"]) - bought
        new_float = max(0, int(company["free_float"]) - bought)

    company_repo.update_capital(conn, str(company["id"]), shares_total=new_total, free_float=new_float)
    return {
        "action": "buyback",
        "shares": bought,
        "price": str(value),
        "cost": str(cost),
        "treasury_stock": listing is not None,
        "shares_total": new_total,
        "tx_id": tx["tx_id"],
        "holders": len(plan),
    }


def issuance(
    conn, *, company: dict, price: Decimal, shares: int, buyer_actor_id: str | None = None
) -> dict:
    value = q4(price)
    quantity = int(shares)
    if value <= 0 or quantity <= 0:
        raise InvalidArgument("发行价格与股数必须大于 0")

    listing = _listing(conn, company)
    code = _currency(company, listing)
    treasury = _treasury_actor(company)
    new_total = int(company["shares_total"]) + quantity
    new_float = int(company["free_float"]) + quantity

    if buyer_actor_id:
        # Private placement: cash now, shares now.
        amount = q4(value * Decimal(quantity))
        if _balance(conn, buyer_actor_id, code) < amount:
            raise Unprocessable(f"认购方余额不足：需要 {amount} {code}")
        tx = currency_service.post(
            conn,
            kind="company_placement",
            moves=[Move(buyer_actor_id, code, -amount), Move(treasury, code, amount)],
            ref_type="company",
            ref_id=str(company["id"]),
            memo=f"placement {quantity}@{value}",
        )
        if listing is not None:
            stock_repo.ensure_holder(conn, buyer_actor_id, str(listing["id"]))
            stock_repo.credit_shares(
                conn, actor_id=buyer_actor_id, listing_id=str(listing["id"]),
                quantity=quantity, price=value, locked_until=None,
            )
            stock_repo.adjust_listing_shares(
                conn, str(listing["id"]), total_delta=quantity, float_delta=quantity
            )
        company_repo.ensure_holding(conn, buyer_actor_id, str(company["id"]), 0)
        company_repo.adjust_holding(conn, buyer_actor_id, str(company["id"]), quantity)
        company_repo.update_capital(conn, str(company["id"]), shares_total=new_total, free_float=new_float)
        return {
            "action": "issuance",
            "mode": "placement",
            "shares": quantity,
            "price": str(value),
            "raised": str(amount),
            "buyer_actor_id": buyer_actor_id,
            "shares_total": new_total,
            "tx_id": tx["tx_id"],
        }

    if listing is None:
        raise Unprocessable("未上市公司增发请指定认购方")

    # Public offering: mint to treasury and rest an ask, same shape as the IPO.
    stock_repo.ensure_holder(conn, treasury, str(listing["id"]))
    stock_repo.credit_shares(
        conn, actor_id=treasury, listing_id=str(listing["id"]),
        quantity=quantity, price=value, locked_until=None,
    )
    stock_repo.adjust_listing_shares(
        conn, str(listing["id"]), total_delta=quantity, float_delta=quantity
    )
    company_repo.adjust_holding(conn, treasury, str(company["id"]), quantity)
    company_repo.update_capital(conn, str(company["id"]), shares_total=new_total, free_float=new_float)
    order = stock_repo.insert_order(
        conn,
        listing_id=str(listing["id"]),
        actor_id=treasury,
        side="sell",
        order_type="limit",
        price=value,
        quantity=quantity,
        venue_id=str(listing["exchange_id"]),
    )
    return {
        "action": "issuance",
        "mode": "offering",
        "shares": quantity,
        "price": str(value),
        "raised": "0.0000",
        "offer_order_id": str(order["id"]),
        "shares_total": new_total,
    }


def reduction(conn, *, company: dict, price: Decimal, shares: int) -> dict:
    value = q4(price)
    quantity = int(shares)
    if value <= 0 or quantity <= 0:
        raise InvalidArgument("减资价格与股数必须大于 0")

    treasury = _treasury_actor(company)
    if bank_repo.loans_of(conn, treasury, status="active"):
        raise Unprocessable("减资前需清偿全部银行贷款（08 §4 债权人保护）")

    listing = _listing(conn, company)
    code = _currency(company, listing)
    if listing is not None:
        holders = [
            (str(row["actor_id"]), int(row["shares"]))
            for row in stock_repo.holders_of(conn, str(listing["id"]))
            if str(row["actor_id"]) != treasury
        ]
    else:
        holders = [
            (str(row["actor_id"]), int(row["shares"]))
            for row in company_repo.holdings_of(conn, str(company["id"]))
            if str(row["actor_id"]) != treasury and int(row["shares"]) > 0
        ]

    plan = _pro_rata(holders, quantity)
    cancelled = sum(qty for _, qty in plan)
    if cancelled <= 0:
        raise Unprocessable("没有可注销的股份")
    cost = q4(value * Decimal(cancelled))
    if _balance(conn, treasury, code) < cost:
        raise Unprocessable(f"公司金库余额不足：需要 {cost} {code}")

    moves = [Move(treasury, code, -cost)]
    moves.extend(Move(actor_id, code, q4(value * Decimal(qty))) for actor_id, qty in plan)
    tx = currency_service.post(
        conn,
        kind="company_reduction",
        moves=moves,
        ref_type="company",
        ref_id=str(company["id"]),
        memo=f"reduction {cancelled}@{value}",
    )

    for actor_id, qty in plan:
        company_repo.adjust_holding(conn, actor_id, str(company["id"]), -qty)
        if listing is not None:
            stock_repo.debit_shares(conn, actor_id=actor_id, listing_id=str(listing["id"]), quantity=qty)

    new_total = int(company["shares_total"]) - cancelled
    new_float = max(0, int(company["free_float"]) - cancelled)
    if listing is not None:
        stock_repo.adjust_listing_shares(
            conn, str(listing["id"]), total_delta=-cancelled, float_delta=-cancelled
        )
    company_repo.update_capital(conn, str(company["id"]), shares_total=new_total, free_float=new_float)
    return {
        "action": "reduction",
        "shares": cancelled,
        "price": str(value),
        "paid_out": str(cost),
        "shares_total": new_total,
        "tx_id": tx["tx_id"],
        "holders": len(plan),
    }
