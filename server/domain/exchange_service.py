"""Sub-exchanges: someone other than the official exchange can run a venue (03 §5).

Matching itself is per listing, so a listing carries its venue. What a sub-exchange
buys is its own fee schedule and listing fee, plus the ability to attract issuers.
"""

from __future__ import annotations

import re
from decimal import Decimal

from ..infra.errors import Forbidden, InvalidArgument, NotFound, Unprocessable
from ..repo import stocks as stock_repo
from . import currency_service
from .currency_service import Move, q4

SUB_EXCHANGE_FEE = Decimal("5000")   # 03 §5: 交易所牌照成本
CODE_RE = re.compile(r"^[A-Z0-9]{3,8}$")


def list_exchanges(conn) -> dict:
    rows = conn.execute(
        "SELECT id, code, name, kind, currency_code, status, fee_bps, listing_fee, "
        "operator_actor_id FROM exchanges ORDER BY kind DESC, code"
    ).fetchall()
    return {
        "exchanges": [
            {
                "id": str(row["id"]),
                "code": row["code"],
                "name": row["name"],
                "kind": row["kind"],
                "currency_code": row["currency_code"],
                "status": row["status"],
                "fee_bps": int(row["fee_bps"]),
                "listing_fee": str(Decimal(row["listing_fee"])),
                "operator_actor_id": str(row["operator_actor_id"])
                if row["operator_actor_id"] else None,
            }
            for row in rows
        ]
    }


def by_code(conn, code: str) -> dict | None:
    return stock_repo.exchange_by_code(conn, code.strip().upper())


def create_sub(conn, *, actor: dict, code: str, name: str, currency_code: str = "cc4",
               fee_bps: int = 10, listing_fee: Decimal = Decimal(0)) -> dict:
    code = (code or "").strip().upper()
    if not CODE_RE.match(code):
        raise InvalidArgument("交易所代码需为 3-8 位大写字母或数字")
    if stock_repo.exchange_by_code(conn, code) is not None:
        raise Unprocessable("该交易所代码已被占用")
    if not 0 <= int(fee_bps) <= 100:
        raise InvalidArgument("手续费率必须在 0-100bp 之间")
    fee = q4(Decimal(str(listing_fee)))
    if fee < 0:
        raise InvalidArgument("上市费不能为负")

    treasury = currency_service.system_actor(conn, currency_service.TREASURY)
    currency_service.post(
        conn,
        kind="exchange_license",
        moves=[Move(str(actor["id"]), "cc4", -SUB_EXCHANGE_FEE),
               Move(str(treasury["id"]), "cc4", SUB_EXCHANGE_FEE)],
        ref_type="exchange",
        ref_id=code,
        memo="sub-exchange licence",
    )
    row = conn.execute(
        """
        INSERT INTO exchanges (code, name, kind, operator_actor_id, currency_code,
                               status, fee_bps, listing_fee)
        VALUES (%s, %s, 'sub', %s, %s, 'active', %s, %s)
        RETURNING id, code, name, kind, currency_code, status, fee_bps, listing_fee,
                  operator_actor_id
        """,
        (code, name[:80], str(actor["id"]), currency_code, int(fee_bps), fee),
    ).fetchone()
    return {
        "id": str(row["id"]),
        "code": row["code"],
        "name": row["name"],
        "fee_bps": int(row["fee_bps"]),
        "listing_fee": str(Decimal(row["listing_fee"])),
        "licence_fee": str(SUB_EXCHANGE_FEE),
    }


def require_active(conn, code: str) -> dict:
    row = by_code(conn, code)
    if row is None:
        raise NotFound("交易所不存在")
    if row["status"] != "active":
        raise Unprocessable("该交易所未处于营业状态")
    return row


def operator_or_treasury(conn, exchange: dict) -> str:
    if exchange["operator_actor_id"]:
        return str(exchange["operator_actor_id"])
    return str(currency_service.system_actor(conn, currency_service.TREASURY)["id"])


def ensure_listing_room(conn, exchange: dict) -> None:
    cap = exchange.get("max_listings")
    if not cap:
        return
    used = conn.execute(
        "SELECT COUNT(*) AS n FROM stock_listings WHERE exchange_id = %s", (str(exchange["id"]),)
    ).fetchone()["n"]
    if int(used) >= int(cap):
        raise Unprocessable("该交易所挂牌数量已达上限")


__all__ = ["list_exchanges", "by_code", "create_sub", "require_active",
           "operator_or_treasury", "ensure_listing_room", "Forbidden"]
