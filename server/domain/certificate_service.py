"""Deposit certificates: issuance, daily accrual, secondary-market quotes.

Pricing follows 02 §12.1::

    PV  = (principal + accrued) / (1 + market_yield × remaining_days / 365)
    ask = PV × (1 + 0.2%)
    fee = price × 0.1%   (registration fee, burned)

Certificates are claims on one bank; the principal sits in the bank's vault, so
a transfer never touches the bank — only buyer and seller exchange currency.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from ..infra.errors import Forbidden, InvalidArgument, NotFound, Unprocessable
from ..repo import banks as bank_repo
from . import currency_service
from .currency_service import Move, q4

TERM_PREMIUM_BPS = {30: 30, 90: 60, 180: 100, 365: 150}
TRANSFER_FEE_BPS = Decimal("0.001")
ASK_MARKUP = Decimal("0.002")


def issue(
    conn,
    *,
    actor: dict,
    bank_id: str,
    currency_code: str,
    principal: Decimal,
    term_days: int = 90,
    idem_key: str | None = None,
) -> dict:
    bank = bank_repo.by_id(conn, currency_service.as_uuid(bank_id))
    if bank is None:
        raise NotFound("银行不存在")
    if bank["status"] != "active":
        raise Unprocessable("该银行当前不可发行存单")
    if term_days not in TERM_PREMIUM_BPS:
        raise InvalidArgument("存单期限仅支持 30/90/180/365 天")
    value = q4(principal)
    if value <= 0:
        raise InvalidArgument("存单本金必须大于 0")

    bank_repo.lock_bank(conn, str(bank["id"]))
    rates = bank_repo.latest_rates(conn)
    rate_bps = (int(rates["deposit_rate_bps"]) if rates else 250) + TERM_PREMIUM_BPS[term_days]
    matures_at = datetime.now(timezone.utc) + timedelta(days=term_days)

    tx = currency_service.post(
        conn,
        kind="certificate_issue",
        moves=[
            Move(actor["id"], currency_code, -value),
            Move(str(bank["actor_id"]), currency_code, value),
        ],
        ref_type="bank",
        ref_id=str(bank["id"]),
        idem_key=idem_key,
        memo=f"certificate {term_days}d @ {rate_bps}bps",
    )
    bank_repo.reserve(conn, str(bank["id"]), currency_code)
    bank_repo.adjust_vault(conn, str(bank["id"]), currency_code, value)
    cert = bank_repo.insert_certificate(
        conn,
        bank_id=str(bank["id"]),
        holder_actor_id=actor["id"],
        currency_code=currency_code,
        principal=value,
        rate_bps=rate_bps,
        term_days=term_days,
        matures_at=matures_at,
    )
    return {**_payload(cert), "tx_id": tx["tx_id"]}


def accrue_all(conn) -> dict:
    """Daily accrual on outstanding certificates (02 §12.4)."""
    total = Decimal(0)
    processed = 0
    for cert in bank_repo.active_certificates(conn):
        interest = q4(
            Decimal(cert["principal"]) * Decimal(cert["rate_bps"]) / Decimal(10_000) / Decimal(365)
        )
        if interest <= 0:
            continue
        bank_repo.accrue_certificate(conn, str(cert["id"]), interest)
        total += interest
        processed += 1
    return {"certificates": processed, "interest": str(q4(total))}


def quote(conn, *, actor: dict, certificate_id: str, ask_yield_bps: int) -> dict:
    if not 0 <= ask_yield_bps <= 5000:
        raise InvalidArgument("报价收益率必须在 0-5000bp")
    cert = bank_repo.certificate(conn, currency_service.as_uuid(certificate_id), for_update=True)
    if cert is None:
        raise NotFound("存单不存在")
    if str(cert["holder_actor_id"]) != str(actor["id"]):
        raise Forbidden("只能转让自己持有的存单")
    if cert["status"] != "active":
        raise Unprocessable("该存单不可转让")

    remaining_days = max((cert["matures_at"] - datetime.now(timezone.utc)).days, 0)
    face = Decimal(cert["principal"]) + Decimal(cert["accrued_interest"])
    pv = face / (Decimal(1) + Decimal(ask_yield_bps) / Decimal(10_000) * Decimal(remaining_days) / Decimal(365))
    price = q4(pv * (Decimal(1) + ASK_MARKUP))
    if price <= 0:
        raise Unprocessable("报价计算异常")

    row = bank_repo.insert_certificate_quote(
        conn,
        certificate_id=str(cert["id"]),
        seller_actor_id=actor["id"],
        ask_yield_bps=ask_yield_bps,
        price=price,
    )
    return {
        "quote_id": str(row["id"]),
        "certificate_id": str(cert["id"]),
        "price": str(Decimal(row["price"])),
        "ask_yield_bps": ask_yield_bps,
        "expires_at": row["expires_at"].isoformat(),
        "remaining_days": remaining_days,
    }


def buy(conn, *, buyer: dict, quote_id: str, idem_key: str | None = None) -> dict:
    quote = bank_repo.certificate_quote(conn, currency_service.as_uuid(quote_id), for_update=True)
    if quote is None:
        raise NotFound("报价不存在")
    if quote["status"] != "open":
        raise Unprocessable("该报价已成交或已失效")
    if quote["expires_at"] <= datetime.now(timezone.utc):
        raise Unprocessable("该报价已过期")
    if str(quote["seller_actor_id"]) == str(buyer["id"]):
        raise InvalidArgument("不能买自己的存单")

    price = Decimal(quote["price"])
    currency = quote["currency_code"]
    fee = q4(price * TRANSFER_FEE_BPS)
    burn = currency_service.system_actor(conn, currency_service.BURN)
    tx = currency_service.post(
        conn,
        kind="certificate_transfer",
        moves=[
            Move(buyer["id"], currency, -(price + fee)),
            Move(str(quote["seller_actor_id"]), currency, price),
            Move(burn["id"], currency, fee),
        ],
        ref_type="certificate_quote",
        ref_id=str(quote["id"]),
        idem_key=idem_key,
        memo="certificate transfer, 0.1% registration fee burned",
    )
    bank_repo.fill_certificate_quote(conn, str(quote["id"]), buyer["id"])
    updated = bank_repo.transfer_certificate(conn, str(quote["certificate_id"]), buyer["id"])
    return {
        "quote_id": str(quote["id"]),
        "certificate_id": str(quote["certificate_id"]),
        "price": str(price),
        "fee": str(fee),
        "holder_actor_id": str(updated["holder_actor_id"]),
        "transfer_count": int(updated["transfer_count"]),
        "tx_id": tx["tx_id"],
    }


def redeem(conn, *, actor: dict, certificate_id: str, idem_key: str | None = None) -> dict:
    cert = bank_repo.certificate(conn, currency_service.as_uuid(certificate_id), for_update=True)
    if cert is None:
        raise NotFound("存单不存在")
    if str(cert["holder_actor_id"]) != str(actor["id"]):
        raise Forbidden("只能兑付自己持有的存单")
    if cert["status"] != "active":
        raise Unprocessable("该存单已兑付")
    if cert["matures_at"] > datetime.now(timezone.utc):
        raise Unprocessable("存单尚未到期")

    bank = bank_repo.by_id(conn, str(cert["bank_id"]))
    if bank is None:  # pragma: no cover
        raise NotFound("发行银行不存在")
    bank_repo.lock_bank(conn, str(bank["id"]))
    principal = Decimal(cert["principal"])
    interest = Decimal(cert["accrued_interest"])
    currency = cert["currency_code"]
    equity = currency_service.system_actor(conn, currency_service.BANK_EQUITY)
    tx = currency_service.post(
        conn,
        kind="certificate_redeem",
        moves=[
            Move(str(bank["actor_id"]), currency, -principal),
            Move(equity["id"], currency, -interest),
            Move(actor["id"], currency, principal + interest),
        ],
        ref_type="deposit_certificate",
        ref_id=str(cert["id"]),
        idem_key=idem_key,
        memo=f"redeem principal {principal}, interest {interest}",
    )
    bank_repo.adjust_vault(conn, str(bank["id"]), currency, -principal)
    bank_repo.close_certificate(conn, str(cert["id"]), "redeemed")
    return {
        "certificate_id": str(cert["id"]),
        "principal": str(principal),
        "interest": str(interest),
        "status": "redeemed",
        "tx_id": tx["tx_id"],
    }


def list_of(conn, actor_id: str) -> list[dict]:
    return [_payload(row) for row in bank_repo.certificates_of(conn, actor_id)]


def open_quotes(conn) -> list[dict]:
    return [
        {
            "quote_id": str(row["id"]),
            "certificate_id": str(row["certificate_id"]),
            "currency_code": row["currency_code"],
            "price": str(Decimal(row["price"])),
            "ask_yield_bps": int(row["ask_yield_bps"]),
            "principal": str(Decimal(row["principal"])),
            "accrued_interest": str(Decimal(row["accrued_interest"])),
            "expires_at": row["expires_at"].isoformat(),
        }
        for row in bank_repo.certificate_quotes(conn)
    ]


def _payload(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "bank_id": str(row["bank_id"]),
        "currency_code": row["currency_code"],
        "principal": str(Decimal(row["principal"])),
        "accrued_interest": str(Decimal(row["accrued_interest"])),
        "rate_bps": int(row["rate_bps"]),
        "term_days": int(row["term_days"]),
        "status": row["status"],
        "matures_at": row["matures_at"].isoformat(),
    }
