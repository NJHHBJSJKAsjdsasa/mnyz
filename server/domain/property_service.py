"""Property: deeds, appraisal, listings, escrow settlement and holding tax.

Rules (04):
* appraisal is a formula, the deal price is whatever the market agrees on;
* a sale moves money buyer -> escrow -> seller, burning 2% transfer tax and
  paying 1% commission to the treasury;
* holding tax is billed monthly per asset; unpaid bills block listing.
"""

from __future__ import annotations

import secrets
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from ..infra.errors import Forbidden, InvalidArgument, NotFound, Unprocessable
from ..repo import properties as property_repo
from . import currency_service
from .currency_service import Move, q4

TRANSFER_TAX_BPS = Decimal(200)
COMMISSION_BPS = Decimal(100)
MAX_LISTING_DAYS = 90


def appraise(conn, asset: dict) -> Decimal:
    """04 §3.1: base × resource × development × traffic × recent premium."""
    base = Decimal(asset["base_by_type"])
    value = (
        base
        * (Decimal(1) + Decimal(asset["resource_score"]) * Decimal("0.4"))
        * (Decimal(1) + Decimal(asset["development_level"]) * Decimal("0.08"))
        * (Decimal(1) + Decimal(asset["traffic_index"]) * Decimal("0.2"))
        * (Decimal(1) + Decimal(asset["recent_sale_premium"]) * Decimal("0.15"))
    )
    value = q4(value)
    property_repo.set_appraisal(conn, str(asset["id"]), value)
    return value


def reappraise_all(conn, limit: int = 5000) -> dict:
    """04 §3.3: every 6h, all owned deeds get a fresh appraisal."""
    total = Decimal(0)
    count = 0
    for asset in property_repo.assets_for_appraisal(conn, limit):
        total += appraise(conn, asset)
        count += 1
    return {"assets": count, "total_value": str(q4(total))}


def register_asset(
    conn,
    *,
    asset_key: str,
    kind: str,
    name: str,
    jurisdiction_sector: str,
    owner_actor_id: str | None,
    base_by_type: Decimal,
    resource_score: Decimal = Decimal(0),
    development_level: int = 0,
    traffic_index: Decimal = Decimal(0),
) -> dict:
    if kind not in ("planet", "system"):
        raise InvalidArgument("产权类型仅支持 planet/system")
    if base_by_type <= 0:
        raise InvalidArgument("基准估值必须大于 0")
    deed_no = "DEED-" + secrets.token_hex(4).upper()
    asset = property_repo.create_asset(
        conn,
        asset_key=asset_key,
        kind=kind,
        name=name,
        jurisdiction_sector=jurisdiction_sector,
        owner_actor_id=owner_actor_id,
        deed_no=deed_no,
        base_by_type=q4(base_by_type),
        resource_score=resource_score,
        development_level=development_level,
        traffic_index=traffic_index,
    )
    appraise(conn, asset)
    fresh = property_repo.by_id(conn, str(asset["id"]))
    return _payload(fresh)


def list_asset(
    conn, *, actor: dict, asset_key: str, price: Decimal, kind: str = "fixed",
    days: int = 30, min_increment: Decimal = Decimal(0),
) -> dict:
    if kind not in ("fixed", "auction"):
        raise InvalidArgument("挂牌类型仅支持 fixed/auction")
    if not 1 <= days <= MAX_LISTING_DAYS:
        raise InvalidArgument(f"挂牌有效期 1-{MAX_LISTING_DAYS} 天")
    value = q4(price)
    if value <= 0:
        raise InvalidArgument("挂牌价必须大于 0")

    asset = property_repo.by_key(conn, asset_key, for_update=True)
    if asset is None:
        raise NotFound("产权不存在")
    if asset["owner_actor_id"] is None or str(asset["owner_actor_id"]) != str(actor["id"]):
        raise Forbidden("只能挂牌自己持有的产权")
    if asset["status"] not in ("owned",):
        raise Unprocessable("该产权当前不可挂牌")
    if property_repo.open_encumbrances(conn, str(asset["id"])):
        raise Unprocessable("产权存在未解除的抵押/冻结")

    expires_at = datetime.now(timezone.utc) + timedelta(days=days)
    listing = property_repo.create_listing(
        conn,
        asset_id=str(asset["id"]),
        seller_actor_id=actor["id"],
        kind=kind,
        price=value,
        min_increment=q4(min_increment),
        expires_at=expires_at,
    )
    property_repo.set_status(conn, str(asset["id"]), "listed" if kind == "fixed" else "auction")
    return {
        "id": str(listing["id"]),
        "asset_key": asset["asset_key"],
        "kind": kind,
        "price": str(value),
        "min_increment": str(q4(min_increment)),
        "expires_at": listing["expires_at"].isoformat(),
        "appraised_value": str(Decimal(asset["appraised_value"])),
    }


def listings(conn) -> list[dict]:
    return [
        {
            "id": str(row["id"]),
            "asset_key": row["asset_key"],
            "name": row["name"],
            "kind": row["kind"],
            "price": str(Decimal(row["price"])),
            "min_increment": str(Decimal(row["min_increment"])),
            "appraised_value": str(Decimal(row["appraised_value"])),
            "sector": row["jurisdiction_sector"],
            "expires_at": row["expires_at"].isoformat(),
        }
        for row in property_repo.open_listings(conn)
    ]


def buy(conn, *, buyer: dict, listing_id: str, idem_key: str | None = None) -> dict:
    listing = property_repo.listing(conn, currency_service.as_uuid(listing_id), for_update=True)
    if listing is None:
        raise NotFound("挂牌不存在")
    if listing["kind"] != "fixed":
        raise Unprocessable("拍卖挂牌请出价")
    if listing["status"] != "open":
        raise Unprocessable("该挂牌已成交或已撤销")
    if listing["expires_at"] <= datetime.now(timezone.utc):
        raise Unprocessable("挂牌已过期")

    asset = property_repo.by_id(conn, str(listing["asset_id"]), for_update=True)
    if asset is None:  # pragma: no cover
        raise NotFound("产权不存在")
    if str(asset["owner_actor_id"]) == str(buyer["id"]):
        raise InvalidArgument("不能购买自己的产权")
    if property_repo.open_encumbrances(conn, str(asset["id"])):
        raise Unprocessable("产权存在未解除的抵押/冻结")

    price = Decimal(listing["price"])
    return _settle(
        conn,
        listing=listing,
        asset=asset,
        buyer=buyer,
        price=price,
        idem_key=idem_key,
        bid_id=None,
    )


def bid(conn, *, bidder: dict, listing_id: str, amount: Decimal) -> dict:
    listing = property_repo.listing(conn, currency_service.as_uuid(listing_id), for_update=True)
    if listing is None:
        raise NotFound("挂牌不存在")
    if listing["kind"] != "auction":
        raise Unprocessable("该挂牌是固定价，请直接购买")
    if listing["status"] != "open":
        raise Unprocessable("拍卖已结束")
    if listing["expires_at"] <= datetime.now(timezone.utc):
        raise Unprocessable("拍卖已过期")

    value = q4(amount)
    floor = Decimal(listing["price"])
    top = property_repo.top_bid(conn, str(listing["id"]))
    if top is not None:
        floor = max(floor, Decimal(top["amount"]) + Decimal(listing["min_increment"]))
    if value < floor:
        raise InvalidArgument(f"出价必须 ≥ {floor}")

    row = property_repo.insert_bid(
        conn, listing_id=str(listing["id"]), bidder_actor_id=bidder["id"], amount=value
    )
    property_repo.outbid_others(conn, str(listing["id"]), str(row["id"]))
    return {
        "bid_id": str(row["id"]),
        "listing_id": str(listing["id"]),
        "amount": str(value),
        "status": "leading",
        "floor_next": str(value + Decimal(listing["min_increment"])),
    }


def close_auction(conn, *, listing_id: str, idem_key: str | None = None) -> dict:
    listing = property_repo.listing(conn, currency_service.as_uuid(listing_id), for_update=True)
    if listing is None:
        raise NotFound("挂牌不存在")
    if listing["kind"] != "auction" or listing["status"] != "open":
        raise Unprocessable("该拍卖不在进行中")
    asset = property_repo.by_id(conn, str(listing["asset_id"]), for_update=True)
    top = property_repo.top_bid(conn, str(listing["id"]))
    if top is None:
        property_repo.set_listing_status(conn, str(listing["id"]), "expired")
        property_repo.set_status(conn, str(asset["id"]), "owned")
        return {"listing_id": str(listing["id"]), "status": "expired"}

    buyer = {"id": str(top["bidder_actor_id"])}
    result = _settle(
        conn,
        listing=listing,
        asset=asset,
        buyer=buyer,
        price=Decimal(top["amount"]),
        idem_key=idem_key,
        bid_id=str(top["id"]),
    )
    property_repo.set_bid_status(conn, str(top["id"]), "won")
    return result


def _settle(
    conn,
    *,
    listing: dict,
    asset: dict,
    buyer: dict,
    price: Decimal,
    idem_key: str | None,
    bid_id: str | None,
) -> dict:
    seller_id = str(listing["seller_actor_id"])
    tax = q4(price * TRANSFER_TAX_BPS / Decimal(10_000))
    commission = q4(price * COMMISSION_BPS / Decimal(10_000))
    seller_net = q4(price - tax - commission)
    if seller_net < 0:  # pragma: no cover
        raise Unprocessable("成交价不足以覆盖税费")

    escrow = property_repo.create_escrow(
        conn, listing_id=str(listing["id"]), buyer_actor_id=buyer["id"], amount=price
    )
    escrow_actor = currency_service.system_actor(conn, "escrow")
    burn = currency_service.system_actor(conn, currency_service.BURN)
    treasury = currency_service.system_actor(conn, currency_service.TREASURY)

    hold = currency_service.post(
        conn,
        kind="property_escrow",
        moves=[
            Move(buyer["id"], "cc1", -price),
            Move(escrow_actor["id"], "cc1", price),
        ],
        ref_type="property_listing",
        ref_id=str(listing["id"]),
        idem_key=f"{idem_key}:hold" if idem_key else None,
        memo="property escrow hold",
    )
    settle = currency_service.post(
        conn,
        kind="property_sale",
        moves=[
            Move(escrow_actor["id"], "cc1", -price),
            Move(seller_id, "cc1", seller_net),
            Move(burn["id"], "cc1", tax),
            Move(treasury["id"], "cc1", commission),
        ],
        ref_type="property_listing",
        ref_id=str(listing["id"]),
        idem_key=f"{idem_key}:settle" if idem_key else None,
        memo=f"property sale, tax {tax}, commission {commission}",
    )
    property_repo.set_escrow_status(conn, str(escrow["id"]), "released")
    property_repo.transfer_owner(conn, str(asset["id"]), buyer["id"], price)
    property_repo.set_listing_status(conn, str(listing["id"]), "sold")
    transfer = property_repo.insert_transfer(
        conn,
        asset_id=str(asset["id"]),
        from_actor_id=seller_id,
        to_actor_id=buyer["id"],
        price=price,
        transfer_tax=tax,
        commission=commission,
        tx_id=settle["tx_id"],
    )
    return {
        "transfer_id": str(transfer["id"]),
        "asset_key": asset["asset_key"],
        "buyer_actor_id": buyer["id"],
        "seller_actor_id": seller_id,
        "price": str(price),
        "transfer_tax": str(tax),
        "commission": str(commission),
        "seller_net": str(seller_net),
        "tx_ids": [hold["tx_id"], settle["tx_id"]],
        "bid_id": bid_id,
    }


# ------------------------------------------------------------------ tax
def issue_tax_bills(conn, period: date | None = None) -> dict:
    """Monthly holding tax; 04 §3A says 0.1%-1.0% of appraised value."""
    period = period or date.today().replace(day=1)
    due_at = datetime.now(timezone.utc) + timedelta(days=30)
    issued = 0
    total = Decimal(0)
    for asset in property_repo.assets_for_tax(conn):
        rate_bps = property_repo.tax_rate(conn, asset["jurisdiction_sector"], asset["kind"])
        amount = q4(Decimal(asset["appraised_value"]) * Decimal(rate_bps) / Decimal(10_000))
        if amount <= 0:
            continue
        property_repo.upsert_bill(
            conn,
            asset_id=str(asset["id"]),
            period=period,
            amount=amount,
            currency_code="cc1",
            due_at=due_at,
        )
        issued += 1
        total += amount
    return {"period": period.isoformat(), "bills": issued, "total": str(q4(total))}


def bills_of(conn, actor_id: str) -> list[dict]:
    return [
        {
            "id": str(row["id"]),
            "asset_key": row["asset_key"],
            "period": row["period"].isoformat(),
            "amount": str(Decimal(row["amount"])),
            "due_at": row["due_at"].isoformat(),
            "status": row["status"],
        }
        for row in property_repo.bills_of(conn, actor_id)
    ]


def pay_tax(conn, *, actor: dict, bill_id: str, idem_key: str | None = None) -> dict:
    bill = property_repo.bill(conn, currency_service.as_uuid(bill_id), for_update=True)
    if bill is None:
        raise NotFound("税单不存在")
    if str(bill["owner_actor_id"]) != str(actor["id"]):
        raise Forbidden("只能缴纳自己产权的税单")
    if bill["status"] != "due":
        raise Unprocessable("该税单已结清或已进入处置流程")

    amount = Decimal(bill["amount"])
    treasury = currency_service.system_actor(conn, currency_service.TREASURY)
    tx = currency_service.post(
        conn,
        kind="property_tax",
        moves=[
            Move(actor["id"], bill["currency_code"], -amount),
            Move(treasury["id"], bill["currency_code"], amount),
        ],
        ref_type="property_tax_bill",
        ref_id=str(bill["id"]),
        idem_key=idem_key,
        memo=f"holding tax {bill['period']}",
    )
    property_repo.mark_bill_paid(conn, str(bill["id"]), tx["tx_id"])
    return {"bill_id": str(bill["id"]), "paid": str(amount), "status": "paid", "tx_id": tx["tx_id"]}


def _payload(asset: dict) -> dict:
    return {
        "id": str(asset["id"]),
        "asset_key": asset["asset_key"],
        "kind": asset["kind"],
        "name": asset["name"],
        "sector": asset["jurisdiction_sector"],
        "owner_actor_id": str(asset["owner_actor_id"]) if asset["owner_actor_id"] else None,
        "deed_no": asset["deed_no"],
        "appraised_value": str(Decimal(asset["appraised_value"])),
        "status": asset["status"],
    }
