"""Companies: registration, shares, financials (03 §2).

Registration burns one Q3 licence fee into the treasury. A company is a real
``economic_actor`` so it can hold currency, property and bank accounts later.
Share transfer is off-chain: a holding row moves, no currency changes hands
until the two parties settle privately (or via the future equity market).
"""

from __future__ import annotations

import re
from datetime import date, datetime, timezone
from decimal import Decimal

from ..infra.errors import Forbidden, InvalidArgument, NotFound, Unprocessable
from ..repo import companies as company_repo
from ..repo import currency as currency_repo
from . import currency_service
from .currency_service import Move, q4

REGISTER_FEE_CC3 = Decimal(1)
TICKER_RE = re.compile(r"^[A-Z][A-Z0-9]{2,7}$")
MIN_SHARES = 1_000
MAX_SHARES = 10_000_000_000


def register(
    conn,
    *,
    actor: dict,
    ticker: str,
    name: str,
    shares_total: int = 1_000_000,
    jurisdiction_sector: str = "core",
    charter: dict | None = None,
    idem_key: str | None = None,
) -> dict:
    ticker = ticker.strip().upper()
    if not TICKER_RE.match(ticker):
        raise InvalidArgument("ticker 需 3-8 位大写字母/数字，且以字母开头")
    if not MIN_SHARES <= shares_total <= MAX_SHARES:
        raise InvalidArgument("股本必须在 1,000 - 100 亿股之间")
    if company_repo.by_ticker(conn, ticker):
        raise InvalidArgument("ticker 已被占用")

    treasury = currency_service.system_actor(conn, currency_service.TREASURY)
    tx = currency_service.post(
        conn,
        kind="company_register",
        moves=[
            Move(actor["id"], "cc3", -REGISTER_FEE_CC3),
            Move(treasury["id"], "cc3", REGISTER_FEE_CC3),
        ],
        ref_type="company",
        ref_id=ticker,
        idem_key=idem_key,
        memo="company registration fee (Q3)",
    )
    company = company_repo.create(
        conn,
        ticker=ticker,
        name=name.strip(),
        founder_actor_id=actor["id"],
        shares_total=shares_total,
        jurisdiction_sector=jurisdiction_sector,
        charter=charter,
    )
    company_repo.ensure_holding(conn, actor["id"], str(company["id"]), shares_total)
    return {**_payload(company), "founder_shares": shares_total, "tx_id": tx["tx_id"]}


def list_companies(conn, status: str | None = None) -> list[dict]:
    return [_payload(row) for row in company_repo.list_companies(conn, status=status)]


def detail(conn, ticker: str) -> dict:
    company = company_repo.by_ticker(conn, ticker.upper())
    if company is None:
        raise NotFound("公司不存在")
    holdings = company_repo.holdings_of(conn, str(company["id"]))
    return {
        **_payload(company),
        "holdings": [
            {
                "actor_id": str(row["actor_id"]),
                "display_name": row["display_name"],
                "shares": int(row["shares"]),
                "locked_until": row["locked_until"].isoformat() if row["locked_until"] else None,
            }
            for row in holdings
        ],
        "financials": [
            {
                "period": row["period"].isoformat(),
                "revenue": str(Decimal(row["revenue"])),
                "cost": str(Decimal(row["cost"])),
                "profit": str(Decimal(row["profit"])),
                "assets": str(Decimal(row["assets"])),
                "liabilities": str(Decimal(row["liabilities"])),
            }
            for row in company_repo.financials(conn, str(company["id"]))
        ],
    }


def transfer_shares(
    conn, *, actor: dict, ticker: str, to_actor_id: str, shares: int
) -> dict:
    if shares <= 0:
        raise InvalidArgument("转让股数必须大于 0")
    company = company_repo.by_ticker(conn, ticker.upper(), for_update=True)
    if company is None:
        raise NotFound("公司不存在")
    if currency_repo.actor_by_id(conn, to_actor_id) is None:
        raise NotFound("受让方不存在")

    holding = company_repo.holding(conn, actor["id"], str(company["id"]), for_update=True)
    if holding is None or int(holding["shares"]) < shares:
        raise Unprocessable("持股不足")
    if holding["locked_until"] is not None and holding["locked_until"] > datetime.now(timezone.utc):
        raise Unprocessable("股份仍在锁定期")

    company_repo.ensure_holding(conn, to_actor_id, str(company["id"]), 0)
    company_repo.adjust_holding(conn, actor["id"], str(company["id"]), -shares)
    remaining = company_repo.adjust_holding(conn, to_actor_id, str(company["id"]), shares)
    return {
        "company_id": str(company["id"]),
        "ticker": company["ticker"],
        "from_actor_id": str(actor["id"]),
        "to_actor_id": to_actor_id,
        "shares": shares,
        "to_balance": remaining,
    }


def publish_financials(
    conn,
    *,
    actor: dict,
    ticker: str,
    period: date,
    revenue: Decimal,
    cost: Decimal,
    assets: Decimal,
    liabilities: Decimal,
) -> dict:
    company = company_repo.by_ticker(conn, ticker.upper(), for_update=True)
    if company is None:
        raise NotFound("公司不存在")
    holding = company_repo.holding(conn, actor["id"], str(company["id"]))
    owned = int(holding["shares"]) if holding else 0
    if owned * 2 < int(company["shares_total"]):
        raise Forbidden("只有控股 50% 以上的股东可以披露财报")
    if revenue < 0 or cost < 0 or assets < 0 or liabilities < 0:
        raise InvalidArgument("财报数值不能为负")

    row = company_repo.upsert_financials(
        conn,
        company_id=str(company["id"]),
        period=period,
        revenue=q4(revenue),
        cost=q4(cost),
        assets=q4(assets),
        liabilities=q4(liabilities),
    )
    book_value = q4(assets - liabilities)
    conn.execute("UPDATE companies SET book_value = %s WHERE id = %s", (book_value, str(company["id"])))
    return {
        "ticker": company["ticker"],
        "period": row["period"].isoformat(),
        "revenue": str(Decimal(row["revenue"])),
        "cost": str(Decimal(row["cost"])),
        "profit": str(Decimal(row["profit"])),
        "book_value": str(book_value),
    }


def _payload(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "ticker": row["ticker"],
        "name": row["name"],
        "status": row["status"],
        "shares_total": int(row["shares_total"]),
        "free_float": int(row["free_float"]),
        "book_value": str(Decimal(row["book_value"])),
        "created_at": row["created_at"].isoformat(),
    }
