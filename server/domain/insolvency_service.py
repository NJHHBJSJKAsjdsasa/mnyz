"""Insolvency: automatic stay, administrator, claims, plans and liquidation (08 §6).

Only companies go through this; players never do (08 §1). Liquidation follows the
statutory order — fees → secured → priority → unsecured → fines → equity — and
pays pro rata inside a class when the estate runs out.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from ..infra.errors import Forbidden, InvalidArgument, NotFound, Unprocessable
from ..repo import companies as company_repo
from ..repo import currency as currency_repo
from ..repo import legal
from ..repo import stocks as stock_repo
from . import currency_service
from .currency_service import Move, q4

SETTLEMENT_CURRENCY = "cc4"
STAY_DAYS = 30
ADMIN_FEE_BPS = Decimal(200)   # 08 §12.2: 1 %-3 %, 2 % here
ADMIN_FEE_MIN = Decimal(500)
ADMIN_FEE_MAX = Decimal(100_000)
CLAIM_CLASSES = ("secured", "priority", "unsecured", "fine")
PLAN_CLASSES = ("secured", "priority", "unsecured", "equity")
PLAN_COUNT_PASS = Decimal("0.5")
PLAN_AMOUNT_PASS = Decimal("0.666666")


def _company(conn, ticker: str, *, for_update: bool = False) -> dict:
    company = company_repo.by_ticker(conn, ticker.strip().upper(), for_update=for_update)
    if company is None:
        raise NotFound("公司不存在")
    return company


# ------------------------------------------------------------------ money helpers
def _holdings(conn, actor_id: str) -> dict[str, Decimal]:
    rows = conn.execute(
        "SELECT currency_code, balance FROM currency_accounts "
        "WHERE actor_id = %s AND balance > 0 ORDER BY currency_code",
        (actor_id,),
    ).fetchall()
    return {row["currency_code"]: Decimal(row["balance"]) for row in rows}


def _base_values(conn) -> dict[str, Decimal]:
    rows = conn.execute("SELECT code, base_value FROM currencies").fetchall()
    return {row["code"]: Decimal(row["base_value"]) for row in rows}


def _q1(holdings: dict[str, Decimal], base: dict[str, Decimal]) -> Decimal:
    return sum((balance * base.get(code, Decimal(1)) for code, balance in holdings.items()),
               Decimal(0))


def _pay_q1(conn, *, treasury: str, claimant: str, want_q1: Decimal,
            holdings: dict[str, Decimal], base: dict[str, Decimal], kind: str,
            case_id: str, memo: str) -> Decimal:
    """Pay ``want_q1`` out of every currency proportionally to its Q1 share."""
    total_q1 = _q1(holdings, base)
    if want_q1 <= 0 or total_q1 <= 0:
        return Decimal(0)
    paid_q1 = Decimal(0)
    for code in list(holdings):
        balance = holdings[code]
        if balance <= 0:
            continue
        unit = base.get(code, Decimal(1))
        share_q1 = balance * unit
        take = min(balance, q4(want_q1 * share_q1 / total_q1 / unit))
        if take <= 0:
            continue
        currency_service.post(
            conn,
            kind=kind,
            moves=[Move(treasury, code, -take), Move(claimant, code, take)],
            ref_type="insolvency",
            ref_id=case_id,
            memo=f"{memo} ({code})",
        )
        holdings[code] = balance - take
        paid_q1 += take * unit
    return paid_q1


def _balance(conn, actor_id: str, currency_code: str = SETTLEMENT_CURRENCY) -> Decimal:
    row = currency_repo.account(conn, actor_id, currency_code)
    return Decimal(row["balance"]) if row else Decimal(0)


def _first_instance(conn, sector: str) -> dict:
    from . import court_service

    court_service.ensure_courts(conn)
    courts = legal.courts(conn, level="first_instance", sector=sector) or legal.courts(
        conn, level="first_instance", sector="core"
    )
    if not courts:  # pragma: no cover
        raise Unprocessable("没有可用的破产法院")
    return courts[0]


# ------------------------------------------------------------------ filing
def file_case(conn, *, actor: dict, ticker: str, kind: str = "liquidation",
              reason: str = "", idem_key: str | None = None) -> dict:
    if kind not in ("reorganization", "liquidation"):
        raise InvalidArgument("破产类型仅支持 reorganization/liquidation")
    company = _company(conn, ticker, for_update=True)
    if company["status"] in ("liquidated", "bankrupt"):
        raise Unprocessable("公司已处于破产/清算状态")
    open_case = legal.open_insolvency_for(conn, str(company["id"]))
    if open_case is not None:
        raise Unprocessable("该公司已有进行中的破产程序")

    stake = company_repo.holding(conn, str(actor["id"]), str(company["id"]))
    shares = int(stake["shares"]) if stake else 0
    creditor = shares == 0
    insolvent = Decimal(company["book_value"]) < 0
    if creditor and not insolvent:
        raise Forbidden("非股东债权人需在公司资不抵债后才能申请破产")
    if shares and not insolvent and kind == "liquidation":
        raise Unprocessable("公司仍有净资产，只能申请重整")

    court = _first_instance(conn, company["jurisdiction_sector"] or "core")
    administrator = currency_service.system_actor(conn, "officer_pool")
    stay_until = datetime.now(timezone.utc) + timedelta(days=STAY_DAYS)
    case = legal.insert_insolvency(
        conn,
        company_id=str(company["id"]),
        court_id=str(court["id"]),
        kind=kind,
        administrator_actor_id=str(administrator["id"]),
        filed_by_actor_id=str(actor["id"]),
        reason=reason[:1000],
        stay_until=stay_until,
    )
    legal.set_insolvency_status(conn, str(case["id"]), "stay")
    company_repo.set_status(conn, str(company["id"]), "bankrupt")
    del idem_key
    return {
        "case_id": str(case["id"]),
        "ticker": company["ticker"],
        "kind": kind,
        "status": "stay",
        "administrator_actor_id": str(administrator["id"]),
        "automatic_stay_until": stay_until.isoformat(),
        "court": court["code"],
    }


def detail(conn, case_id: str) -> dict:
    case = legal.insolvency_by_id(conn, case_id)
    if case is None:
        raise NotFound("破产案件不存在")
    claims = legal.claims_of(conn, case_id)
    plan = legal.plan_by_case(conn, case_id)
    company = company_repo.by_id(conn, str(case["company_id"])) if case["company_id"] else None
    return {
        "id": str(case["id"]),
        "ticker": company["ticker"] if company else None,
        "kind": case["kind"],
        "status": case["status"],
        "administrator_actor_id": str(case["administrator_actor_id"])
        if case["administrator_actor_id"]
        else None,
        "automatic_stay_until": case["automatic_stay_until"].isoformat()
        if case["automatic_stay_until"]
        else None,
        "filed_at": case["filed_at"].isoformat(),
        "closed_at": case["closed_at"].isoformat() if case["closed_at"] else None,
        "claims": [
            {
                "id": str(row["id"]),
                "claimant_actor_id": str(row["claimant_actor_id"]),
                "kind": row["kind"],
                "amount": str(Decimal(row["amount"])),
                "paid": str(Decimal(row["paid"])),
                "status": row["status"],
            }
            for row in claims
        ],
        "plan": {
            "id": str(plan["id"]),
            "status": plan["status"],
            "document": plan["document"],
            "votes": [
                {
                    "class": row["class"],
                    "yes_amount": str(Decimal(row["yes_amount"])),
                    "no_amount": str(Decimal(row["no_amount"])),
                    "yes_count": int(row["yes_count"]),
                    "no_count": int(row["no_count"]),
                }
                for row in legal.plan_votes_of(conn, str(plan["id"]))
            ],
        }
        if plan
        else None,
    }


# ------------------------------------------------------------------ claims
def file_claim(conn, *, actor: dict, case_id: str, kind: str, amount: Decimal) -> dict:
    case = legal.insolvency_by_id(conn, case_id)
    if case is None:
        raise NotFound("破产案件不存在")
    if case["status"] in ("closed",):
        raise Unprocessable("案件已结案")
    if kind not in ("secured", "priority", "unsecured", "equity", "fine"):
        raise InvalidArgument("债权类型不合法")
    value = q4(amount)
    if value <= 0:
        raise InvalidArgument("债权金额必须大于 0")
    row = legal.insert_claim(
        conn, case_id=case_id, claimant_actor_id=str(actor["id"]), kind=kind, amount=value
    )
    # MVP: the administrator's review is a single step, so a filed claim is admitted
    # unless an ops reviewer rejects it later.
    legal.admit_claim(conn, str(row["id"]))
    return {
        "id": str(row["id"]),
        "kind": kind,
        "amount": str(value),
        "status": "admitted",
    }


def reject_claim(conn, case_id: str, claim_id: str) -> dict:
    conn.execute(
        "UPDATE insolvency_claims SET status = 'rejected' WHERE id = %s AND case_id = %s",
        (claim_id, case_id),
    )
    return {"claim_id": claim_id, "status": "rejected"}


# ------------------------------------------------------------------ plan
def create_plan(conn, *, actor: dict, case_id: str, document: dict) -> dict:
    case = legal.insolvency_by_id(conn, case_id, for_update=True)
    if case is None:
        raise NotFound("破产案件不存在")
    if case["kind"] != "reorganization":
        raise Unprocessable("只有重整案件需要计划")
    if case["status"] not in ("stay", "administration"):
        raise Unprocessable("当前状态不能提交重整计划")
    if not document:
        raise InvalidArgument("重整计划不能为空")
    plan = legal.insert_plan(conn, case_id, document)
    legal.set_insolvency_status(conn, case_id, "plan")
    return {"plan_id": str(plan["id"]), "status": plan["status"]}


def vote_plan(conn, *, actor: dict, case_id: str, plan_id: str, cls: str, choice: str) -> dict:
    if choice not in ("yes", "no"):
        raise InvalidArgument("表决只能是 yes/no")
    if cls not in PLAN_CLASSES:
        raise InvalidArgument("债权类别不合法")
    plan = legal.plan_by_id(conn, plan_id, for_update=True)
    if plan is None or str(plan["case_id"]) != case_id:
        raise NotFound("重整计划不存在")
    if plan["status"] != "voting":
        raise Unprocessable("计划不在表决期")
    claims = [
        row for row in legal.claims_of(conn, case_id, status="admitted")
        if str(row["claimant_actor_id"]) == str(actor["id"]) and row["kind"] == cls
    ]
    if not claims:
        raise Forbidden("你在这个类别没有已确认债权")
    amount = sum((Decimal(row["amount"]) for row in claims), Decimal(0))
    legal.upsert_plan_vote(conn, plan_id, cls, choice, amount)
    return {"plan_id": plan_id, "class": cls, "amount": str(q4(amount)), "choice": choice}


def confirm_plan(conn, case_id: str, plan_id: str) -> dict:
    plan = legal.plan_by_id(conn, plan_id, for_update=True)
    if plan is None or str(plan["case_id"]) != case_id:
        raise NotFound("重整计划不存在")
    if plan["status"] != "voting":
        raise Unprocessable("计划不在表决期")
    votes = legal.plan_votes_of(conn, plan_id)
    if not votes:
        raise Unprocessable("尚未有任何类别投票")
    results = {}
    for row in votes:
        yes_amount = Decimal(row["yes_amount"])
        no_amount = Decimal(row["no_amount"])
        total_amount = yes_amount + no_amount
        yes_count = int(row["yes_count"])
        total_count = yes_count + int(row["no_count"])
        passed = (
            total_count > 0
            and Decimal(yes_count) > PLAN_COUNT_PASS * Decimal(total_count)
            and total_amount > 0
            and yes_amount >= PLAN_AMOUNT_PASS * total_amount
        )
        results[row["class"]] = {
            "passed": passed,
            "yes_amount": str(q4(yes_amount)),
            "no_amount": str(q4(no_amount)),
        }
    confirmed = all(item["passed"] for item in results.values())
    legal.set_plan_status(conn, plan_id, "confirmed" if confirmed else "rejected",
                          confirmed=confirmed)
    legal.set_insolvency_status(conn, case_id, "administration" if confirmed else "liquidation")
    return {"plan_id": plan_id, "confirmed": confirmed, "classes": results}


# ------------------------------------------------------------------ liquidation
def liquidate(conn, *, actor: dict, case_id: str) -> dict:
    case = legal.insolvency_by_id(conn, case_id, for_update=True)
    if case is None:
        raise NotFound("破产案件不存在")
    if case["kind"] != "liquidation" and case["status"] != "liquidation":
        raise Unprocessable("该案件不进入清算")
    if case["status"] == "closed":
        raise Unprocessable("案件已结案")
    company = company_repo.by_id(conn, str(case["company_id"]))
    if company is None:
        raise NotFound("公司不存在")
    treasury = str(company["treasury_actor_id"])
    holdings = _holdings(conn, treasury)
    base = _base_values(conn)
    unit = base[SETTLEMENT_CURRENCY]
    estate_q1 = _q1(holdings, base)
    if estate_q1 <= 0:
        raise Unprocessable("公司没有可分配财产")

    admin = str(case["administrator_actor_id"]) if case["administrator_actor_id"] else None
    estate_cc4 = estate_q1 / unit
    fee = min(estate_cc4, max(ADMIN_FEE_MIN, q4(estate_cc4 * ADMIN_FEE_BPS / Decimal(10_000))))
    fee = min(fee, ADMIN_FEE_MAX, estate_cc4)
    payments: list[dict] = []
    if fee > 0 and admin:
        paid_fee = _pay_q1(
            conn, treasury=treasury, claimant=admin, want_q1=fee * unit,
            holdings=holdings, base=base, kind="insolvency_admin_fee",
            case_id=case_id, memo="administrator fee",
        )
        payments.append({"claimant": "administrator",
                         "amount": str(q4(paid_fee / unit)), "q1": str(q4(paid_fee))})

    claims = [
        row for row in legal.claims_of(conn, case_id)
        if row["status"] in ("admitted", "filed") and row["kind"] in CLAIM_CLASSES
    ]
    for cls in CLAIM_CLASSES:
        group = [row for row in claims if row["kind"] == cls]
        outstanding = {
            str(row["id"]): Decimal(row["amount"]) * unit - Decimal(row["paid_q1"] or 0)
            for row in group
        }
        total_q1 = sum(outstanding.values(), Decimal(0))
        remaining_q1 = _q1(holdings, base)
        if total_q1 <= 0 or remaining_q1 <= 0:
            continue
        ratio = min(Decimal(1), remaining_q1 / total_q1)
        for row in group:
            want = outstanding[str(row["id"])] * ratio
            paid = _pay_q1(
                conn, treasury=treasury, claimant=str(row["claimant_actor_id"]),
                want_q1=want, holdings=holdings, base=base, kind="insolvency_distribution",
                case_id=case_id, memo=f"{cls} distribution",
            )
            if paid <= 0:
                continue
            new_paid_q1 = Decimal(row["paid_q1"] or 0) + paid
            new_paid = q4(new_paid_q1 / unit)
            legal.pay_claim_q1(
                conn, str(row["id"]), paid_q1=new_paid_q1, paid=new_paid,
                fully=new_paid_q1 >= Decimal(row["amount"]) * unit,
            )
            payments.append({"claimant": str(row["claimant_actor_id"]), "class": cls,
                             "amount": str(new_paid), "q1": str(q4(new_paid_q1))})

    # residual goes to shareholders pro rata (equity is last in the order)
    remaining_q1 = _q1(holdings, base)
    if remaining_q1 > 0:
        rows = conn.execute(
            "SELECT actor_id, shares FROM share_holdings WHERE company_id = %s AND shares > 0",
            (str(company["id"]),),
        ).fetchall()
        total_shares = sum(int(row["shares"]) for row in rows) or 1
        for row in rows:
            want = remaining_q1 * Decimal(int(row["shares"])) / Decimal(total_shares)
            paid = _pay_q1(
                conn, treasury=treasury, claimant=str(row["actor_id"]), want_q1=want,
                holdings=holdings, base=base, kind="insolvency_residual",
                case_id=case_id, memo="residual to shareholders",
            )
            if paid <= 0:
                continue
            payments.append({"claimant": str(row["actor_id"]), "class": "equity",
                             "amount": str(q4(paid / unit)), "q1": str(q4(paid))})

    for row in claims:
        if row["status"] == "admitted" and Decimal(row["paid"]) < Decimal(row["amount"]):
            conn.execute("UPDATE insolvency_claims SET status = 'rejected' WHERE id = %s",
                         (str(row["id"]),))
    listing = stock_repo.listing_by_ticker(conn, str(company["ticker"]))
    if listing is not None:
        stock_repo.set_listing_status(conn, str(listing["id"]), "delisted")
    company_repo.set_status(conn, str(company["id"]), "liquidated")
    legal.set_insolvency_status(conn, case_id, "closed", closed=True)
    return {
        "case_id": case_id,
        "distributed": str(q4(sum(Decimal(p["amount"]) for p in payments))),
        "payments": payments,
        "status": "closed",
        "closed_by": str(actor["id"]),
    }


# ------------------------------------------------------------------ jobs
def plan_tick(conn, hours: int = 24) -> dict:
    """Confirm plans whose voting window closed, then report open cases."""
    confirmed, rejected = [], []
    rows = conn.execute(
        "SELECT p.id, p.case_id FROM restructuring_plans p "
        "WHERE p.status = 'voting' AND p.created_at < now() - (%s || ' hours')::interval",
        (hours,),
    ).fetchall()
    for row in rows:
        result = confirm_plan(conn, str(row["case_id"]), str(row["id"]))
        (confirmed if result["confirmed"] else rejected).append(str(row["id"]))
    open_cases = conn.execute(
        "SELECT COUNT(*) AS n FROM insolvency_cases WHERE status <> 'closed'"
    ).fetchone()
    return {"confirmed": len(confirmed), "rejected": len(rejected),
            "open_cases": int(open_cases["n"])}


def stays_expired(conn) -> int:
    row = conn.execute(
        "UPDATE insolvency_cases SET automatic_stay_until = NULL "
        "WHERE automatic_stay_until IS NOT NULL AND automatic_stay_until <= now() "
        "RETURNING id"
    ).fetchall()
    return len(row)


__all__ = [
    "file_case",
    "detail",
    "file_claim",
    "reject_claim",
    "create_plan",
    "vote_plan",
    "confirm_plan",
    "liquidate",
    "plan_tick",
    "stays_expired",
]
