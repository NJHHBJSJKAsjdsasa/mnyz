"""Company law: charter, officers, shareholder meetings and resolutions (08 §2/§3).

Votes are weighted by ``share_holdings``; ordinary resolutions need > 50 % of the
shares actually voted, special ones > 2/3. A shareholder who is a party to the
transaction abstains automatically (08 §3.4).
"""

from __future__ import annotations

from decimal import Decimal

from ..infra.serialize import ts
from ..infra.errors import Forbidden, InvalidArgument, NotFound, Unprocessable
from ..repo import companies as company_repo
from ..repo import company_governance as gov_repo
from ..repo import legal
from ..repo import stocks as stock_repo
from . import capital_actions, stock_service
from .currency_service import q4

ORDINARY = Decimal("0.5")
SPECIAL = Decimal("0.666666")
MIN_MEETING_SHARES = Decimal("0.10")
SPECIAL_KINDS = {"charter_amendment", "buyback", "issuance", "reduction", "dissolution"}
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
    row = gov_repo.upsert_charter(conn, str(company["id"]), document, str(actor["id"]))
    return {
        "ticker": company["ticker"],
        "version": int(row["version"]),
        "adopted_at": ts(row["adopted_at"]),
    }


def officers(conn, company_id: str, *, status: str = "active") -> list[dict]:
    """Read API for other modules (e.g. ``court_panel``).

    Cross-module readers must not query ``company_officers`` themselves — R1/R2 in
    docs/architecture/module-dependencies.md.
    """
    return gov_repo.officers_of(conn, company_id, status=status)


def related_parties(conn, company_id: str, limit: int = 20) -> list[dict]:
    """Read API for ``court_service`` (related-party transactions of one company)."""
    return gov_repo.related_parties(conn, company_id, limit=limit)


def governance(conn, ticker: str) -> dict:
    company = _company(conn, ticker)
    company_id = str(company["id"])
    charter = gov_repo.charter(conn, company_id)
    return {
        "ticker": company["ticker"],
        "status": company["status"],
        "shares_total": int(company["shares_total"]),
        "charter": {
            "version": int(charter["version"]),
            "document": charter["document"],
            "adopted_at": ts(charter["adopted_at"]),
        }
        if charter
        else None,
        "officers": [
            {
                "actor_id": str(row["actor_id"]),
                "display_name": row["display_name"],
                "role": row["role"],
                "appointed_at": ts(row["appointed_at"]),
                "term_until": ts(row["term_until"]),
            }
            for row in gov_repo.officers_of(conn, company_id)
        ],
        "board": [
            {
                "seat_no": int(row["seat_no"]),
                "actor_id": str(row["actor_id"]) if row["actor_id"] else None,
                "display_name": row["display_name"],
                "elected_at": ts(row["elected_at"]),
            }
            for row in gov_repo.board_of(conn, company_id)
        ],
        "resolutions": [_resolution_payload(row) for row in gov_repo.resolutions_of(conn, company_id)],
        "related_parties": [
            {
                "id": str(row["id"]),
                "counterparty_actor_id": str(row["counterparty_actor_id"]),
                "kind": row["kind"],
                "amount": str(Decimal(row["amount"])),
                "status": row["status"],
                "created_at": ts(row["created_at"]),
            }
            for row in gov_repo.related_parties(conn, company_id)
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
        "created_at": ts(row["created_at"]),
        "decided_at": ts(row["decided_at"]),
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
    existing = gov_repo.open_meeting(conn, str(company["id"]))
    if existing is not None:
        return _meeting_payload(existing)
    row = gov_repo.create_meeting(conn, str(company["id"]), kind)
    return _meeting_payload(row)


def _meeting_payload(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "ticker_company_id": str(row["company_id"]),
        "kind": row["kind"],
        "scheduled_at": ts(row["scheduled_at"]),
        "status": row["status"],
    }


# ------------------------------------------------------------------ resolutions
def propose(conn, *, actor: dict, ticker: str, kind: str, payload: dict | None = None) -> dict:
    company = _company(conn, ticker, for_update=True)
    _assert_tradable(company)
    if kind not in ("charter_amendment", "officer_appointment", "dividend", "buyback",
                    "issuance", "reduction", "related_party", "dissolution", "other"):
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
    if kind in ("buyback", "issuance", "reduction"):
        # Validate the shape now: a resolution that cannot be executed should not
        # reach a vote (the money side re-checks balances and loans at apply time).
        if q4(Decimal(str(body.get("price", 0)))) <= 0:
            raise InvalidArgument("资本动作必须给出正的每股价格")
        if int(body.get("shares") or 0) <= 0:
            raise InvalidArgument("资本动作必须给出正股数")
        if kind == "issuance" and body.get("buyer_actor_id"):
            body["buyer_actor_id"] = str(body["buyer_actor_id"])
            # The buyer is the one paying, so the buyer must be the proposer:
            # a majority holder cannot spend somebody else's balance by motion.
            if body["buyer_actor_id"] != str(actor["id"]):
                raise Forbidden("定向增发的认购方必须是提案人本人")

    meeting = gov_repo.open_meeting(conn, str(company["id"]))
    if meeting is None:
        meeting = gov_repo.create_meeting(conn, str(company["id"]), "extraordinary")
    resolution = gov_repo.insert_resolution(
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
    fresh = gov_repo.resolution(conn, str(resolution["id"]))
    return _resolution_payload(fresh)


def vote(conn, *, actor: dict, resolution_id: str, choice: str) -> dict:
    if choice not in ("yes", "no", "abstain"):
        raise InvalidArgument("表决只能是 yes/no/abstain")
    resolution = gov_repo.resolution(conn, resolution_id, for_update=True)
    if resolution is None:
        raise NotFound("决议不存在")
    if resolution["status"] != "draft":
        raise Unprocessable("决议已结束")
    company = company_repo.by_id(conn, str(resolution["company_id"]))
    if company is None:
        raise NotFound("公司不存在")
    result = _cast(conn, resolution, actor_id=str(actor["id"]), company=company, choice=choice)
    fresh = gov_repo.resolution(conn, resolution_id)
    return {**_resolution_payload(fresh), "my_choice": result}


def _cast(conn, resolution: dict, *, actor_id: str, company: dict, choice: str) -> str:
    shares = _stake(conn, actor_id, company)
    related = str(resolution["payload"].get("related_actor_id") or "")
    if shares <= 0:
        raise Forbidden("只有股东可以表决")
    if related and related == actor_id:
        choice = "abstain"  # 08 §3.4 关联方回避
    gov_repo.upsert_vote(conn, str(resolution["id"]), actor_id, shares, choice)
    _tally(conn, str(resolution["id"]))
    return choice


def _tally(conn, resolution_id: str) -> tuple[int, int, int]:
    votes = gov_repo.votes_of(conn, resolution_id)
    yes = sum(int(row["shares"]) for row in votes if row["choice"] == "yes")
    no = sum(int(row["shares"]) for row in votes if row["choice"] == "no")
    abstain = sum(int(row["shares"]) for row in votes if row["choice"] == "abstain")
    gov_repo.set_tally(conn, resolution_id, yes=yes, no=no, abstain=abstain)
    return yes, no, abstain


def close_resolution(conn, *, actor: dict, resolution_id: str) -> dict:
    resolution = gov_repo.resolution(conn, resolution_id, for_update=True)
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
    gov_repo.finish_resolution(conn, resolution_id, yes=yes, no=no, abstain=abstain, status=status)
    applied = None
    if passed:
        applied = _apply(conn, resolution, company)
    fresh = gov_repo.resolution(conn, resolution_id)
    return {
        **_resolution_payload(fresh),
        "threshold": str(threshold),
        "closed_by": str(actor["id"]),
        "applied": applied,
    }


def _apply(conn, resolution: dict, company: dict) -> dict | None:
    kind = str(resolution["kind"])
    body = resolution["payload"] or {}
    company_id = str(company["id"])
    if kind == "officer_appointment":
        if body.get("seat_no"):
            gov_repo.elect_seat(conn, company_id, int(body["seat_no"]), str(body["actor_id"]))
        gov_repo.appoint_officer(conn, company_id, str(body["actor_id"]), str(body["role"]))
    elif kind == "charter_amendment":
        document = body.get("document") or {}
        if document:
            gov_repo.upsert_charter(conn, company_id, document, str(resolution["created_by"]))
    elif kind == "related_party":
        gov_repo.set_related_party_status(
            conn, str(body["transaction_id"]), "approved", str(resolution["created_by"])
        )
    elif kind == "dissolution":
        company_repo.set_status(conn, company_id, "suspended")
    elif kind == "dividend":
        _pay_dividend(conn, company, body)
    elif kind in ("buyback", "issuance", "reduction"):
        return _apply_capital(conn, kind, company, body)
    return None


def _apply_capital(conn, kind: str, company: dict, body: dict) -> dict:
    """08 §4: the money side of a passed capital resolution (T-16)."""
    price = Decimal(str(body.get("price", 0)))
    shares = int(body.get("shares") or 0)
    if kind == "buyback":
        return capital_actions.buyback(conn, company=company, price=price, shares=shares)
    if kind == "issuance":
        return capital_actions.issuance(
            conn, company=company, price=price, shares=shares,
            buyer_actor_id=(body.get("buyer_actor_id") or None),
        )
    return capital_actions.reduction(conn, company=company, price=price, shares=shares)


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
    row = gov_repo.insert_related_party(
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
    txn = gov_repo.related_party(conn, txn_id, for_update=True)
    if txn is None or str(txn["company_id"]) != str(company["id"]):
        raise NotFound("关联交易不存在")
    if txn["status"] != "proposed":
        raise Unprocessable("该关联交易已处理")
    if not _is_controller(conn, str(actor["id"]), company):
        raise Forbidden("需要控股 50% 才能批准关联交易")
    if str(txn["counterparty_actor_id"]) == str(actor["id"]):
        raise Forbidden("关联方必须回避，不能自己批准")
    gov_repo.set_related_party_status(
        conn, txn_id, "approved" if approve else "rejected", str(actor["id"])
    )
    return {"id": txn_id, "status": "approved" if approve else "rejected"}


def void_related_party(conn, company_id: str, txn_id: str) -> None:
    """Court remedy for an undisclosed related-party deal (08 §3.4)."""
    gov_repo.set_related_party_status(conn, txn_id, "void", None)


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
