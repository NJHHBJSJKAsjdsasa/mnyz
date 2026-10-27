"""Company law: charter, officers, shareholder meetings and resolutions (08 §2/§3).

Votes are weighted by ``share_holdings``; ordinary resolutions need > 50 % of the
shares actually voted, special ones > 2/3. A shareholder who is a party to the
transaction abstains automatically (08 §3.4).
"""

from __future__ import annotations

from decimal import Decimal

from ..infra.errors import Forbidden, InvalidArgument, NotFound, Unprocessable
from ..repo import companies as company_repo
from ..repo import legal
from ..repo import stocks as stock_repo
from . import stock_service
from .currency_service import q4

ORDINARY = Decimal("0.5")
SPECIAL = Decimal("0.666666")
MIN_MEETING_SHARES = Decimal("0.10")
SPECIAL_KINDS = {"charter_amendment", "buyback", "issuance", "dissolution"}
OFFICER_ROLES = ("ceo", "cfo", "coo", "secretary", "director", "chair")
MAX_SEATS = 15


def _company(conn, ticker: str, *, for_update: bool = False) -> dict:
    company = company_repo.by_ticker(conn, ticker.strip().upper(), for_update=for_update)
    if company is None:
        raise NotFound("公司不存在")
    return company


def _stake(conn, actor_id: str, company: dict) -> int:
    row = company_repo.holding(conn, actor_id, str(company["id"]))
    return int(row["shares"]) if row else 0


def _is_controller(conn, actor_id: str, company: dict) -> bool:
    return Decimal(_stake(conn, actor_id, company)) * 2 >= Decimal(company["shares_total"])


def _assert_tradable(company: dict) -> None:
    if company["status"] in ("bankrupt", "liquidated"):
        raise Unprocessable("公司已进入破产/清算，治理动作冻结")


# ------------------------------------------------------------------ charter
def submit_charter(conn, *, actor: dict, ticker: str, document: dict) -> dict:
    company = _company(conn, ticker, for_update=True)
    _assert_tradable(company)
    if not _is_controller(conn, str(actor["id"]), company):
        raise Forbidden("需要控股 50% 才能提交章程")
    if not isinstance(document, dict):
        raise InvalidArgument("章程必须是 JSON 对象")
    required = {"share_classes", "board", "meetings", "capital", "related_party", "dispute"}
    missing = sorted(required - set(document))
    if missing:
        raise InvalidArgument("章程缺少条款：" + "、".join(missing))
    row = legal.upsert_charter(conn, str(company["id"]), document, str(actor["id"]))
    return {
        "ticker": company["ticker"],
        "version": int(row["version"]),
        "adopted_at": row["adopted_at"].isoformat(),
    }


def governance(conn, ticker: str) -> dict:
    company = _company(conn, ticker)
    company_id = str(company["id"])
    charter = legal.charter(conn, company_id)
    return {
        "ticker": company["ticker"],
        "status": company["status"],
        "shares_total": int(company["shares_total"]),
        "charter": {
            "version": int(charter["version"]),
            "document": charter["document"],
            "adopted_at": charter["adopted_at"].isoformat(),
        }
        if charter
        else None,
        "officers": [
            {
                "actor_id": str(row["actor_id"]),
                "display_name": row["display_name"],
                "role": row["role"],
                "appointed_at": row["appointed_at"].isoformat(),
                "term_until": row["term_until"].isoformat() if row["term_until"] else None,
            }
            for row in legal.officers_of(conn, company_id)
        ],
        "board": [
            {
                "seat_no": int(row["seat_no"]),
                "actor_id": str(row["actor_id"]) if row["actor_id"] else None,
                "display_name": row["display_name"],
                "elected_at": row["elected_at"].isoformat() if row["elected_at"] else None,
            }
            for row in legal.board_of(conn, company_id)
        ],
        "resolutions": [_resolution_payload(row) for row in legal.resolutions_of(conn, company_id)],
        "related_parties": [
            {
                "id": str(row["id"]),
                "counterparty_actor_id": str(row["counterparty_actor_id"]),
                "kind": row["kind"],
                "amount": str(Decimal(row["amount"])),
                "status": row["status"],
                "created_at": row["created_at"].isoformat(),
            }
            for row in legal.related_parties(conn, company_id)
        ],
        "active_insolvency": (
            str(case["id"])
            if (case := legal.open_insolvency_for(conn, company_id))
            else None
        ),
    }


def _resolution_payload(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "meeting_id": str(row["meeting_id"]),
        "kind": row["kind"],
        "special": bool(row["special"]),
        "payload": row["payload"],
        "yes": int(row["yes"]),
        "no": int(row["no"]),
        "abstain": int(row["abstain"]),
        "status": row["status"],
        "created_at": row["created_at"].isoformat(),
        "decided_at": row["decided_at"].isoformat() if row["decided_at"] else None,
    }


# ------------------------------------------------------------------ meetings
def convene(conn, *, actor: dict, ticker: str, kind: str = "extraordinary") -> dict:
    company = _company(conn, ticker, for_update=True)
    _assert_tradable(company)
    if kind not in ("annual", "extraordinary"):
        raise InvalidArgument("会议类型仅支持 annual/extraordinary")
    shares = _stake(conn, str(actor["id"]), company)
    if Decimal(shares) < MIN_MEETING_SHARES * Decimal(company["shares_total"]):
        raise Forbidden("持股 10% 以上才能召集股东会")
    existing = legal.open_meeting(conn, str(company["id"]))
    if existing is not None:
        return _meeting_payload(existing)
    row = legal.create_meeting(conn, str(company["id"]), kind)
    return _meeting_payload(row)


def _meeting_payload(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "ticker_company_id": str(row["company_id"]),
        "kind": row["kind"],
        "scheduled_at": row["scheduled_at"].isoformat(),
        "status": row["status"],
    }


# ------------------------------------------------------------------ resolutions
def propose(conn, *, actor: dict, ticker: str, kind: str, payload: dict | None = None) -> dict:
    company = _company(conn, ticker, for_update=True)
    _assert_tradable(company)
    if kind not in ("charter_amendment", "officer_appointment", "dividend", "buyback",
                    "issuance", "related_party", "dissolution", "other"):
        raise InvalidArgument("不支持的决议类型")
    shares = _stake(conn, str(actor["id"]), company)
    if Decimal(shares) < MIN_MEETING_SHARES * Decimal(company["shares_total"]):
        raise Forbidden("持股 10% 以上才能提案")
    body = dict(payload or {})
    if kind == "officer_appointment":
        if body.get("role") not in OFFICER_ROLES:
            raise InvalidArgument("高管角色不合法")
        if not body.get("actor_id"):
            raise InvalidArgument("必须指定高管 actor")
        if int(body.get("seat_no") or 0) > MAX_SEATS:
            raise InvalidArgument("董事席位超出上限")
    if kind == "related_party" and not body.get("transaction_id"):
        raise InvalidArgument("关联交易决议必须给出 transaction_id")
    if kind == "dividend" and q4(Decimal(str(body.get("per_share", 0)))) <= 0:
        raise InvalidArgument("分红必须给出正的每股金额")

    meeting = legal.open_meeting(conn, str(company["id"]))
    if meeting is None:
        meeting = legal.create_meeting(conn, str(company["id"]), "extraordinary")
    resolution = legal.insert_resolution(
        conn,
        meeting_id=str(meeting["id"]),
        company_id=str(company["id"]),
        kind=kind,
        special=kind in SPECIAL_KINDS,
        payload=body,
        created_by=str(actor["id"]),
    )
    # the proposer's own shares count immediately
    _cast(conn, resolution, actor_id=str(actor["id"]), company=company, choice="yes")
    fresh = legal.resolution(conn, str(resolution["id"]))
    return _resolution_payload(fresh)


def vote(conn, *, actor: dict, resolution_id: str, choice: str) -> dict:
    if choice not in ("yes", "no", "abstain"):
        raise InvalidArgument("表决只能是 yes/no/abstain")
    resolution = legal.resolution(conn, resolution_id, for_update=True)
    if resolution is None:
        raise NotFound("决议不存在")
    if resolution["status"] != "draft":
        raise Unprocessable("决议已结束")
    company = company_repo.by_id(conn, str(resolution["company_id"]))
    if company is None:
        raise NotFound("公司不存在")
    result = _cast(conn, resolution, actor_id=str(actor["id"]), company=company, choice=choice)
    fresh = legal.resolution(conn, resolution_id)
    return {**_resolution_payload(fresh), "my_choice": result}


def _cast(conn, resolution: dict, *, actor_id: str, company: dict, choice: str) -> str:
    shares = _stake(conn, actor_id, company)
    related = str(resolution["payload"].get("related_actor_id") or "")
    if shares <= 0:
        raise Forbidden("只有股东可以表决")
    if related and related == actor_id:
        choice = "abstain"  # 08 §3.4 关联方回避
    legal.upsert_vote(conn, str(resolution["id"]), actor_id, shares, choice)
    _tally(conn, str(resolution["id"]))
    return choice


def _tally(conn, resolution_id: str) -> tuple[int, int, int]:
    votes = legal.votes_of(conn, resolution_id)
    yes = sum(int(row["shares"]) for row in votes if row["choice"] == "yes")
    no = sum(int(row["shares"]) for row in votes if row["choice"] == "no")
    abstain = sum(int(row["shares"]) for row in votes if row["choice"] == "abstain")
    legal.set_tally(conn, resolution_id, yes=yes, no=no, abstain=abstain)
    return yes, no, abstain


def close_resolution(conn, *, actor: dict, resolution_id: str) -> dict:
    resolution = legal.resolution(conn, resolution_id, for_update=True)
    if resolution is None:
        raise NotFound("决议不存在")
    if resolution["status"] != "draft":
        raise Unprocessable("决议已结束")
    company = company_repo.by_id(conn, str(resolution["company_id"]))
    if company is None:
        raise NotFound("公司不存在")
    yes, no, abstain = _tally(conn, resolution_id)
    threshold = SPECIAL if resolution["special"] else ORDINARY
    cast = yes + no
    passed = cast > 0 and Decimal(yes) > threshold * Decimal(cast)
    status = "passed" if passed else "rejected"
    legal.finish_resolution(conn, resolution_id, yes=yes, no=no, abstain=abstain, status=status)
    if passed:
        _apply(conn, resolution, company)
    fresh = legal.resolution(conn, resolution_id)
    return {
        **_resolution_payload(fresh),
        "threshold": str(threshold),
        "closed_by": str(actor["id"]),
    }


def _apply(conn, resolution: dict, company: dict) -> None:
    kind = str(resolution["kind"])
    body = resolution["payload"] or {}
    company_id = str(company["id"])
    if kind == "officer_appointment":
        if body.get("seat_no"):
            legal.elect_seat(conn, company_id, int(body["seat_no"]), str(body["actor_id"]))
        legal.appoint_officer(conn, company_id, str(body["actor_id"]), str(body["role"]))
    elif kind == "charter_amendment":
        document = body.get("document") or {}
        if document:
            legal.upsert_charter(conn, company_id, document, str(resolution["created_by"]))
    elif kind == "related_party":
        legal.set_related_party_status(
            conn, str(body["transaction_id"]), "approved", str(resolution["created_by"])
        )
    elif kind == "dissolution":
        company_repo.set_status(conn, company_id, "suspended")
    elif kind == "dividend":
        _pay_dividend(conn, company, body)


def _pay_dividend(conn, company: dict, body: dict) -> None:
    """Delegate the actual money movement to the stock service (05 §7.1)."""
    listing = stock_repo.listing_by_ticker(conn, str(company["ticker"]))
    if listing is None:
        return
    stock_service.pay_dividend(
        conn,
        actor={"id": str(company["founder_actor_id"])},
        ticker=str(company["ticker"]),
        per_share=Decimal(str(body["per_share"])),
    )


# ------------------------------------------------------------------ related party
def declare_related_party(conn, *, actor: dict, ticker: str, counterparty_actor_id: str,
                          kind: str, amount: Decimal) -> dict:
    company = _company(conn, ticker, for_update=True)
    _assert_tradable(company)
    if not _is_controller(conn, str(actor["id"]), company) and _stake(
        conn, str(actor["id"]), company
    ) <= 0:
        raise Forbidden("只有股东可以申报关联交易")
    value = q4(amount)
    if value <= 0:
        raise InvalidArgument("金额必须大于 0")
    row = legal.insert_related_party(
        conn,
        company_id=str(company["id"]),
        counterparty_actor_id=counterparty_actor_id,
        kind=kind,
        amount=value,
    )
    return {
        "id": str(row["id"]),
        "status": row["status"],
        "amount": str(Decimal(row["amount"])),
        "require_approval": True,
    }


def decide_related_party(conn, *, actor: dict, ticker: str, txn_id: str, approve: bool) -> dict:
    company = _company(conn, ticker, for_update=True)
    txn = legal.related_party(conn, txn_id, for_update=True)
    if txn is None or str(txn["company_id"]) != str(company["id"]):
        raise NotFound("关联交易不存在")
    if txn["status"] != "proposed":
        raise Unprocessable("该关联交易已处理")
    if not _is_controller(conn, str(actor["id"]), company):
        raise Forbidden("需要控股 50% 才能批准关联交易")
    if str(txn["counterparty_actor_id"]) == str(actor["id"]):
        raise Forbidden("关联方必须回避，不能自己批准")
    legal.set_related_party_status(
        conn, txn_id, "approved" if approve else "rejected", str(actor["id"])
    )
    return {"id": txn_id, "status": "approved" if approve else "rejected"}


def void_related_party(conn, company_id: str, txn_id: str) -> None:
    """Court remedy for an undisclosed related-party deal (08 §3.4)."""
    legal.set_related_party_status(conn, txn_id, "void", None)


__all__ = [
    "submit_charter",
    "governance",
    "convene",
    "propose",
    "vote",
    "close_resolution",
    "declare_related_party",
    "decide_related_party",
    "void_related_party",
]
