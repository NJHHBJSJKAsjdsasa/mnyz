"""Interbank lending: named bilateral orders (02 §5.5, §12.2).

A lender bank posts an order; a borrower bank accepts it, which moves vault cash
between the two banks' currency accounts. Repayment returns principal plus
simple interest. Orders are named — no anonymous matching in the first version.
"""

from __future__ import annotations

from decimal import Decimal

from ..infra.errors import Forbidden, InvalidArgument, NotFound, Unprocessable
from ..repo import banks as bank_repo
from . import currency_service
from .currency_service import Move, q4

TERMS = (1, 7, 30)
MAX_RATE_BPS = 2000


def post_order(
    conn,
    *,
    lender_bank_id: str,
    currency_code: str,
    principal: Decimal,
    rate_bps: int,
    term_days: int = 7,
) -> dict:
    bank = bank_repo.by_id(conn, currency_service.as_uuid(lender_bank_id))
    if bank is None:
        raise NotFound("银行不存在")
    if bank["status"] != "active":
        raise Unprocessable("该银行当前不可拆出")
    if term_days not in TERMS:
        raise InvalidArgument("拆借期限仅支持 1/7/30 天")
    if not 0 <= rate_bps <= MAX_RATE_BPS:
        raise InvalidArgument(f"拆借利率必须在 0-{MAX_RATE_BPS}bp")
    value = q4(principal)
    if value <= 0:
        raise InvalidArgument("拆借金额必须大于 0")

    reserve = bank_repo.reserve(conn, str(bank["id"]), currency_code, for_update=True)
    if Decimal(reserve["vault"]) < value:
        raise Unprocessable("拆出银行库存现金不足")

    row = bank_repo.insert_interbank(
        conn,
        lender_bank_id=str(bank["id"]),
        borrower_bank_id=None,  # 接受方在 accept() 时写入
        currency_code=currency_code,
        principal=value,
        rate_bps=rate_bps,
        term_days=term_days,
    )
    return _payload(row)


def accept(conn, *, borrower_bank_id: str, order_id: str, idem_key: str | None = None) -> dict:
    borrower = bank_repo.by_id(conn, currency_service.as_uuid(borrower_bank_id))
    if borrower is None:
        raise NotFound("银行不存在")
    if borrower["status"] != "active":
        raise Unprocessable("该银行当前不可拆入")

    order = bank_repo.interbank(conn, currency_service.as_uuid(order_id), for_update=True)
    if order is None:
        raise NotFound("拆借订单不存在")
    if order["status"] != "open":
        raise Unprocessable("该订单已成交或已失效")
    if str(order["lender_bank_id"]) == str(borrower["id"]):
        raise InvalidArgument("不能接受自己挂出的订单")

    lender = bank_repo.by_id(conn, str(order["lender_bank_id"]))
    principal = Decimal(order["principal"])
    tx = currency_service.post(
        conn,
        kind="interbank_lend",
        moves=[
            Move(str(lender["actor_id"]), order["currency_code"], -principal),
            Move(str(borrower["actor_id"]), order["currency_code"], principal),
        ],
        ref_type="interbank_loan",
        ref_id=str(order["id"]),
        idem_key=idem_key,
        memo=f"{lender['code']} -> {borrower['code']} {order['term_days']}d @ {order['rate_bps']}bps",
    )
    bank_repo.adjust_vault(conn, str(lender["id"]), order["currency_code"], -principal)
    bank_repo.adjust_vault(conn, str(borrower["id"]), order["currency_code"], principal)
    conn.execute(
        "UPDATE interbank_loans SET borrower_bank_id = %s WHERE id = %s",
        (str(borrower["id"]), str(order["id"])),
    )
    updated = bank_repo.set_interbank_status(conn, str(order["id"]), "accepted", accepted=True)
    return {
        **_payload(order),
        "borrower_bank_id": str(borrower["id"]),
        "status": updated["status"],
        "matures_at": updated["matures_at"].isoformat(),
        "tx_id": tx["tx_id"],
    }


def repay(conn, *, borrower_bank_id: str, order_id: str, idem_key: str | None = None) -> dict:
    order = bank_repo.interbank(conn, currency_service.as_uuid(order_id), for_update=True)
    if order is None:
        raise NotFound("拆借订单不存在")
    if str(order["borrower_bank_id"]) != str(borrower_bank_id):
        raise Forbidden("只有借款银行可以还款")
    if order["status"] != "accepted":
        raise Unprocessable("该拆借不在待偿还状态")

    borrower = bank_repo.by_id(conn, str(order["borrower_bank_id"]))
    lender = bank_repo.by_id(conn, str(order["lender_bank_id"]))
    principal = Decimal(order["principal"])
    interest = q4(
        principal * Decimal(order["rate_bps"]) / Decimal(10_000) * Decimal(order["term_days"]) / Decimal(365)
    )
    total = principal + interest
    tx = currency_service.post(
        conn,
        kind="interbank_repay",
        moves=[
            Move(str(borrower["actor_id"]), order["currency_code"], -total),
            Move(str(lender["actor_id"]), order["currency_code"], total),
        ],
        ref_type="interbank_loan",
        ref_id=str(order["id"]),
        idem_key=idem_key,
        memo=f"repay {principal} + {interest}",
    )
    bank_repo.adjust_vault(conn, str(borrower["id"]), order["currency_code"], -total)
    bank_repo.adjust_vault(conn, str(lender["id"]), order["currency_code"], total)
    bank_repo.set_interbank_status(conn, str(order["id"]), "repaid")
    return {
        "id": str(order["id"]),
        "principal": str(principal),
        "interest": str(interest),
        "total": str(total),
        "status": "repaid",
        "tx_id": tx["tx_id"],
    }


def orders(conn, status: str = "open") -> list[dict]:
    return [
        {
            **_payload(row),
            "lender_bank_id": str(row["lender_bank_id"]),
            "borrower_bank_id": str(row["borrower_bank_id"]) if row["borrower_bank_id"] else None,
            "lender_code": row["lender_code"],
            "borrower_code": row["borrower_code"],
            "matures_at": row["matures_at"].isoformat() if row["matures_at"] else None,
        }
        for row in bank_repo.interbank_orders(conn, status=status)
    ]


def _payload(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "currency_code": row["currency_code"],
        "principal": str(Decimal(row["principal"])),
        "rate_bps": int(row["rate_bps"]),
        "term_days": int(row["term_days"]),
        "status": row["status"],
        "created_at": row["created_at"].isoformat(),
    }
