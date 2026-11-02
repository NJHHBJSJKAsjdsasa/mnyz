"""Brokerage: firm licensing, venue membership, client accounts, agency commission (05 §9).

Rules
-----
* A broker is a licensed securities firm (``securities_firms``) that has been
  admitted to a venue (``broker_memberships``). A firm may join several venues,
  each with its own commission cap; the venue's cap always wins over what the
  client and broker agreed.
* A client may hold **one** active broker account. While it is active, every
  trade that clears on a venue where the broker is a member pays an agency
  commission, charged on top of the exchange fee and paid to the broker.
* Without an account (or when the broker lost membership) the client trades
  directly: no commission, no broker in the ledger.
"""

from __future__ import annotations

from decimal import Decimal

from ..infra.serialize import ts
from ..infra.errors import Forbidden, InvalidArgument, NotFound, Unprocessable
from ..repo import brokers as broker_repo
from ..repo import stocks as stock_repo
from . import currency_service
from .currency_service import Move, q4

FIRM_LICENCE_FEE = Decimal("2000")     # 05 §9.1: securities firm licence
MEMBERSHIP_FEE = Decimal("500")        # 05 §9.2: admission to one venue
MAX_COMMISSION_BPS = 100               # 1 % is the ceiling for retail agency


def _treasury(conn) -> dict:
    return currency_service.system_actor(conn, currency_service.TREASURY)


def register_firm(conn, *, actor: dict, capital: Decimal = Decimal(0)) -> dict:
    actor_id = str(actor["id"])
    existing = conn.execute(
        "SELECT id, status, capital FROM securities_firms WHERE actor_id = %s", (actor_id,)
    ).fetchone()
    if existing is not None:
        raise Unprocessable("该主体已经是证券公司")
    amount = q4(Decimal(str(capital)))
    if amount < 0:
        raise InvalidArgument("注册资本不能为负")
    treasury = _treasury(conn)
    currency_service.post(
        conn,
        kind="broker_licence",
        moves=[Move(actor_id, "cc4", -FIRM_LICENCE_FEE),
               Move(str(treasury["id"]), "cc4", FIRM_LICENCE_FEE)],
        ref_type="securities_firm",
        ref_id=actor_id,
        memo="securities firm licence",
    )
    row = conn.execute(
        "INSERT INTO securities_firms (actor_id, capital, status) VALUES (%s, %s, 'active') "
        "RETURNING id, actor_id, capital, status, created_at",
        (actor_id, amount),
    ).fetchone()
    return {
        "firm_id": str(row["id"]),
        "status": row["status"],
        "capital": str(Decimal(row["capital"])),
        "licence_fee": str(FIRM_LICENCE_FEE),
    }


def firm_of(conn, actor_id: str) -> dict | None:
    return conn.execute(
        "SELECT id, actor_id, capital, status FROM securities_firms WHERE actor_id = %s",
        (actor_id,),
    ).fetchone()


def join_venue(conn, *, actor: dict, exchange_code: str,
               commission_bps: int = 5) -> dict:
    firm = firm_of(conn, str(actor["id"]))
    if firm is None:
        raise Forbidden("需要先取得证券公司牌照")
    if firm["status"] != "active":
        raise Unprocessable("证券公司已停业")
    if not 0 <= int(commission_bps) <= MAX_COMMISSION_BPS:
        raise InvalidArgument(f"佣金率必须在 0-{MAX_COMMISSION_BPS}bp 之间")
    exchange = stock_repo.exchange_by_code(conn, exchange_code.strip().upper())
    if exchange is None:
        raise NotFound("交易所不存在")
    if exchange["status"] != "active":
        raise Unprocessable("该交易所未处于营业状态")
    if broker_repo.membership(conn, str(actor["id"]), str(exchange["id"])) is not None:
        raise Unprocessable("已经是该交易所会员")

    treasury = _treasury(conn)
    payee = str(exchange["operator_actor_id"] or treasury["id"])
    currency_service.post(
        conn,
        kind="broker_membership",
        moves=[Move(str(actor["id"]), exchange["currency_code"], -MEMBERSHIP_FEE),
               Move(payee, exchange["currency_code"], MEMBERSHIP_FEE)],
        ref_type="exchange",
        ref_id=str(exchange["id"]),
        memo=f"broker membership {exchange['code']}",
    )
    row = broker_repo.upsert_membership(
        conn,
        firm_actor_id=str(actor["id"]),
        exchange_id=str(exchange["id"]),
        commission_bps=int(commission_bps),
        admitted_by=str(actor["id"]),
    )
    return {
        "membership_id": str(row["id"]),
        "exchange": exchange["code"],
        "commission_bps": int(row["commission_bps"]),
        "fee": str(MEMBERSHIP_FEE),
    }


def open_account(conn, *, actor: dict, broker_code: str, commission_bps: int | None = None) -> dict:
    """A client appoints a broker; the rate is capped by the broker's venue terms."""
    # players carry no actor code, so accept either the code or the actor id
    raw = broker_code.strip()
    broker = conn.execute(
        "SELECT id, code, display_name FROM economic_actors "
        " WHERE code = %s OR id::text = %s",
        (raw.upper(), raw.lower()),
    ).fetchone()
    if broker is None:
        raise NotFound("券商不存在")
    if str(broker["id"]) == str(actor["id"]):
        raise InvalidArgument("不能给自己开户")
    if firm_of(conn, str(broker["id"])) is None:
        raise Unprocessable("该主体不是持牌证券公司")
    memberships = conn.execute(
        "SELECT exchange_id, commission_bps FROM broker_memberships "
        "WHERE firm_actor_id = %s AND status = 'active'",
        (str(broker["id"]),),
    ).fetchall()
    if not memberships:
        raise Unprocessable("该券商尚未在任一交易所取得会籍")
    cap = min(int(row["commission_bps"]) for row in memberships)
    bps = cap if commission_bps is None else int(commission_bps)
    if not 0 <= bps <= MAX_COMMISSION_BPS:
        raise InvalidArgument(f"佣金率必须在 0-{MAX_COMMISSION_BPS}bp 之间")
    if bps > cap:
        raise Unprocessable(f"该券商在交易所的佣金上限为 {cap}bp")
    row = broker_repo.open_account(
        conn,
        client_actor_id=str(actor["id"]),
        broker_actor_id=str(broker["id"]),
        commission_bps=bps,
    )
    return {
        "account_id": str(row["id"]),
        "broker": broker["code"],
        "commission_bps": int(row["commission_bps"]),
        "status": row["status"],
    }


def close_account(conn, *, actor: dict) -> dict:
    row = broker_repo.account_of_client(conn, str(actor["id"]))
    if row is None or row["status"] != "active":
        raise NotFound("没有生效中的经纪账户")
    broker_repo.close_account(conn, str(actor["id"]))
    return {"status": "closed", "account_id": str(row["id"])}


def my_account(conn, *, actor: dict) -> dict:
    row = broker_repo.account_of_client(conn, str(actor["id"]))
    if row is None:
        return {"account": None}
    broker = conn.execute(
        "SELECT code, display_name FROM economic_actors WHERE id = %s",
        (str(row["broker_actor_id"]),),
    ).fetchone()
    return {
        "account": {
            "account_id": str(row["id"]),
            "broker_actor_id": str(row["broker_actor_id"]),
            "broker": (broker["code"] or broker["display_name"]) if broker else None,
            "commission_bps": int(row["commission_bps"]),
            "status": row["status"],
        }
    }


def broker_book(conn, *, actor: dict) -> dict:
    """What a broker sees: its memberships, clients and commission earned so far."""
    firm = firm_of(conn, str(actor["id"]))
    if firm is None:
        raise Forbidden("需要证券公司牌照")
    memberships = conn.execute(
        """
        SELECT m.id, m.commission_bps, m.status, e.code, e.name
          FROM broker_memberships m JOIN exchanges e ON e.id = m.exchange_id
         WHERE m.firm_actor_id = %s ORDER BY e.code
        """,
        (str(actor["id"]),),
    ).fetchall()
    clients = broker_repo.clients_of_broker(conn, str(actor["id"]))
    earned: dict[str, str] = {}
    for row in conn.execute(
        "SELECT currency_code, SUM(amount) AS total FROM broker_commissions "
        "WHERE broker_actor_id = %s GROUP BY currency_code",
        (str(actor["id"]),),
    ).fetchall():
        earned[row["currency_code"]] = str(Decimal(row["total"]))
    recent = broker_repo.commissions_of_broker(conn, str(actor["id"]), limit=20)
    return {
        "firm": {"firm_id": str(firm["id"]), "status": firm["status"],
                 "capital": str(Decimal(firm["capital"]))},
        "memberships": [
            {"membership_id": str(row["id"]), "exchange": row["code"],
             "exchange_name": row["name"], "commission_bps": int(row["commission_bps"]),
             "status": row["status"]}
            for row in memberships
        ],
        "clients": [
            {"account_id": str(row["id"]), "client": row["code"],
             "commission_bps": int(row["commission_bps"]), "status": row["status"]}
            for row in clients
        ],
        "earned": earned,
        "recent_commissions": [
            {"trade_id": str(row["trade_id"]), "ticker": row["ticker"],
             "currency_code": row["currency_code"], "notional": str(Decimal(row["notional"])),
             "commission_bps": int(row["commission_bps"]),
             "amount": str(Decimal(row["amount"])), "at": ts(row["created_at"])}
            for row in recent
        ],
    }


# ------------------------------------------------------------------ venue side
def join_listing(conn, *, actor: dict, ticker: str, exchange_code: str,
                 fee_bps: int | None = None) -> dict:
    """A venue admits a listing it does not already trade (03 §5)."""
    listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
    if listing is None:
        raise NotFound("该股票未上市")
    exchange = stock_repo.exchange_by_code(conn, exchange_code.strip().upper())
    if exchange is None:
        raise NotFound("交易所不存在")
    if exchange["status"] != "active":
        raise Unprocessable("该交易所未处于营业状态")
    operator = exchange["operator_actor_id"]
    role = conn.execute(
        "SELECT role FROM accounts WHERE id = (SELECT account_id FROM players WHERE id = "
        "(SELECT player_id FROM economic_actors WHERE id = %s))",
        (str(actor["id"]),),
    ).fetchone()
    is_admin = bool(role and role["role"] in ("admin", "ops"))
    if operator is None and not is_admin:
        raise Forbidden("只有交易所运营方或运维可以引入挂牌")
    if operator is not None and str(operator) != str(actor["id"]) and not is_admin:
        raise Forbidden("只有该交易所运营方可以引入挂牌")
    rate = int(fee_bps if fee_bps is not None else exchange["fee_bps"])
    if not 0 <= rate <= 100:
        raise InvalidArgument("手续费率必须在 0-100bp 之间")
    row = broker_repo.add_venue(
        conn,
        listing_id=str(listing["id"]),
        exchange_id=str(exchange["id"]),
        fee_bps=rate,
        admitted_by=str(actor["id"]),
    )
    return {
        "ticker": listing["ticker"],
        "exchange": exchange["code"],
        "fee_bps": int(row["fee_bps"]),
        "status": row["status"],
    }


def leave_listing(conn, *, actor: dict, ticker: str, exchange_code: str) -> dict:
    listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
    if listing is None:
        raise NotFound("该股票未上市")
    exchange = stock_repo.exchange_by_code(conn, exchange_code.strip().upper())
    if exchange is None:
        raise NotFound("交易所不存在")
    if str(listing["exchange_id"]) == str(exchange["id"]):
        raise Unprocessable("主挂牌交易所不能撤下，请改用停牌/退市")
    row = broker_repo.venue(conn, str(listing["id"]), str(exchange["id"]))
    if row is None:
        raise NotFound("该标的未在此交易所挂牌")
    broker_repo.set_venue_status(conn, str(listing["id"]), str(exchange["id"]), "suspended")
    return {"ticker": listing["ticker"], "exchange": exchange["code"], "status": "suspended"}


def listing_venues(conn, ticker: str) -> dict:
    listing = stock_repo.listing_by_ticker(conn, ticker.strip().upper())
    if listing is None:
        raise NotFound("该股票未上市")
    rows = broker_repo.venues_of_listing(conn, str(listing["id"]))
    books = []
    for row in rows:
        best_bid = stock_repo.book_bids(conn, str(listing["id"]), limit=1,
                                        venue_id=str(row["exchange_id"]))
        best_ask = stock_repo.book_asks(conn, str(listing["id"]), limit=1,
                                        venue_id=str(row["exchange_id"]))
        books.append({
            "exchange": row["code"],
            "exchange_name": row["name"],
            "kind": row["kind"],
            "fee_bps": int(row["fee_bps"]),
            "status": row["status"],
            "best_bid": str(Decimal(best_bid[0]["price"])) if best_bid else None,
            "best_ask": str(Decimal(best_ask[0]["price"])) if best_ask else None,
        })
    return {"ticker": listing["ticker"], "venues": books}


__all__ = [
    "register_firm", "firm_of", "join_venue", "open_account", "close_account",
    "my_account", "broker_book", "join_listing", "leave_listing", "listing_venues",
    "FIRM_LICENCE_FEE", "MEMBERSHIP_FEE",
]
