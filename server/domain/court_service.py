"""Commercial courts: filing, evidence, deterministic judgment, appeal, enforcement (08 §5).

The first-instance judge is deterministic: the same case id and evidence set
always produce the same verdict, so a judgment can be audited and replayed.
Appeals run once; the appellant cannot appeal twice.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from ..infra.errors import Forbidden, InsufficientFunds, InvalidArgument, NotFound, Unprocessable
from ..repo import companies as company_repo
from ..repo import currency as currency_repo
from ..repo import legal
from . import currency_service, dt_coordinator
from .currency_service import Move, q4
from .rng import stream

CASE_KINDS = ("contract", "tort", "corporate", "insolvency", "takeover", "regulatory")
MIN_FEE = Decimal("10.0000")
FEE_BPS = Decimal(100)  # 1 % of the claim
HEARING_DELAY = timedelta(hours=1)
STAY_BLOCKED = ("filed", "stay", "administration", "plan")
COURT_SEEDS = (
    ("CC-CORE-1", "宇宙商业法院（一审）", "core", "first_instance"),
    ("CC-CORE-2", "宇宙商业法院（上诉）", "core", "appeal"),
    ("CC-SUPREME", "最高商业法院", "core", "supreme"),
)


def ensure_courts(conn) -> None:
    """Migration seeds them; a truncated test database needs them again."""
    for code, name, sector, level in COURT_SEEDS:
        conn.execute(
            """
            INSERT INTO commercial_courts (code, name, jurisdiction_sector, level)
            VALUES (%s, %s, %s, %s) ON CONFLICT (code) DO NOTHING
            """,
            (code, name, sector, level),
        )


def _first_instance(conn, sector: str) -> dict:
    ensure_courts(conn)
    courts = legal.courts(conn, level="first_instance", sector=sector)
    if not courts:
        courts = legal.courts(conn, level="first_instance", sector="core")
    if not courts:  # pragma: no cover - ensure_courts just inserted one
        raise Unprocessable("没有可用的一审法院")
    return courts[0]


def _balance(conn, actor_id: str, currency_code: str) -> Decimal:
    row = currency_repo.account(conn, actor_id, currency_code)
    return Decimal(row["balance"]) if row else Decimal(0)


def _fee(amount: Decimal) -> Decimal:
    return max(q4(amount * FEE_BPS / Decimal(10_000)), MIN_FEE)


# ------------------------------------------------------------------ filing
def file_case(
    conn,
    *,
    actor: dict,
    kind: str,
    defendant_actor_id: str,
    amount: Decimal,
    claim: str = "",
    currency_code: str = "cc1",
    sector: str = "core",
    company_ticker: str | None = None,
) -> dict:
    if kind not in CASE_KINDS:
        raise InvalidArgument("案件类型不合法")
    if str(defendant_actor_id) == str(actor["id"]):
        raise InvalidArgument("不能起诉自己")
    defendant = currency_repo.actor_by_id(conn, defendant_actor_id)
    if defendant is None:
        raise NotFound("被告不存在")
    stayed = legal.open_case_against(conn, str(defendant_actor_id))
    if stayed is not None:
        raise Unprocessable("被告已进入破产程序，自动中止期间不得起诉（08 §6.3）")

    company = None
    if company_ticker:
        company = company_repo.by_ticker(conn, company_ticker.strip().upper())
        if company is None:
            raise NotFound("公司不存在")
        sector = company["jurisdiction_sector"] or sector

    value = q4(amount)
    if value < 0:
        raise InvalidArgument("标的金额不能为负")
    fee = _fee(value)
    if _balance(conn, str(actor["id"]), currency_code) < fee:
        raise InsufficientFunds(f"诉讼费不足：需要 {fee} {currency_code}")

    treasury = currency_service.system_actor(conn, currency_service.TREASURY)
    currency_service.post(
        conn,
        kind="court_filing_fee",
        moves=[
            Move(str(actor["id"]), currency_code, -fee),
            Move(treasury["id"], currency_code, fee),
        ],
        ref_type="court_case",
        ref_id=str(actor["id"]),
        memo="court filing fee",
    )
    court = _first_instance(conn, sector)
    case = legal.insert_case(
        conn,
        court_id=str(court["id"]),
        kind=kind,
        plaintiff_actor_id=str(actor["id"]),
        defendant_actor_id=str(defendant_actor_id),
        company_id=str(company["id"]) if company else None,
        jurisdiction_sector=sector,
        amount=value,
        currency_code=currency_code,
        claim=claim[:2000],
        filing_fee=fee,
    )
    hearing_at = datetime.now(timezone.utc) + HEARING_DELAY
    legal.set_case_status(conn, str(case["id"]), "served", served_at=datetime.now(timezone.utc),
                          hearing_at=hearing_at)
    legal.insert_hearing(conn, str(case["id"]), hearing_at)
    fresh = legal.case_by_id(conn, str(case["id"]))
    return {
        **_case_payload(fresh),
        "court": {"id": str(court["id"]), "code": court["code"], "level": court["level"]},
        "filing_fee": str(fee),
    }


def _case_payload(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "kind": row["kind"],
        "status": row["status"],
        "plaintiff_actor_id": str(row["plaintiff_actor_id"]),
        "defendant_actor_id": str(row["defendant_actor_id"]),
        "company_id": str(row["company_id"]) if row["company_id"] else None,
        "sector": row["jurisdiction_sector"],
        "amount": str(Decimal(row["amount"])),
        "currency_code": row["currency_code"],
        "claim": row["claim"],
        "filed_at": row["filed_at"].isoformat(),
        "hearing_at": row["hearing_at"].isoformat() if row["hearing_at"] else None,
    }


def case_detail(conn, case_id: str) -> dict:
    case = legal.case_by_id(conn, case_id)
    if case is None:
        raise NotFound("案件不存在")
    judgment = legal.judgment_of_case(conn, case_id)
    appeal = legal.appeal_of_case(conn, case_id)
    return {
        **_case_payload(case),
        "evidence": [
            {
                "id": str(row["id"]),
                "side": row["side"],
                "summary": row["summary"],
                "created_at": row["created_at"].isoformat(),
            }
            for row in legal.evidence_of(conn, case_id)
        ],
        "hearings": [
            {
                "id": str(row["id"]),
                "scheduled_at": row["scheduled_at"].isoformat(),
                "status": row["status"],
            }
            for row in legal.hearings_of(conn, case_id)
        ],
        "judgment": {
            "id": str(judgment["id"]),
            "judgment": judgment["judgment"],
            "remedy": judgment["remedy"],
            "status": judgment["status"],
            "issued_at": judgment["issued_at"].isoformat(),
        }
        if judgment
        else None,
        "appeal": {
            "id": str(appeal["id"]),
            "status": appeal["status"],
            "outcome": appeal["outcome"],
            "filed_at": appeal["filed_at"].isoformat(),
        }
        if appeal
        else None,
        "freezes": [
            {"kind": row["asset_kind"], "asset_id": row["asset_id"], "status": row["status"]}
            for row in legal.freezes_of_case(conn, case_id)
        ],
        "recognitions": [
            _recognition_payload(row) for row in legal.recognitions_of_case(conn, case_id)
        ],
    }


def my_cases(conn, actor: dict) -> list[dict]:
    return [_case_payload(row) for row in legal.cases_for(conn, str(actor["id"]))]


# ------------------------------------------------------------------ evidence
def add_evidence(conn, *, actor: dict, case_id: str, summary: str, payload: dict | None = None) -> dict:
    case = legal.case_by_id(conn, case_id)
    if case is None:
        raise NotFound("案件不存在")
    actor_id = str(actor["id"])
    if actor_id == str(case["plaintiff_actor_id"]):
        side = "plaintiff"
    elif actor_id == str(case["defendant_actor_id"]):
        side = "defendant"
    else:
        raise Forbidden("只有当事人可以提交证据")
    if case["status"] in ("closed", "enforced"):
        raise Unprocessable("案件已结案")
    if legal.judgment_of_case(conn, case_id) is not None:
        raise Unprocessable("判决已作出，不能再提交证据")
    row = legal.insert_evidence(
        conn, case_id=case_id, actor_id=actor_id, side=side,
        summary=summary[:1000], payload=payload or {},
    )
    return {"id": str(row["id"]), "side": side, "summary": row["summary"]}


# ------------------------------------------------------------------ judgment
def _verdict(conn, case: dict) -> tuple[dict, dict]:
    evidence = legal.evidence_of(conn, str(case["id"]))
    p_count = sum(1 for row in evidence if row["side"] == "plaintiff")
    d_count = sum(1 for row in evidence if row["side"] == "defendant")
    rng = stream(str(case["id"]), "judgment", p_count, d_count)
    score = 0.5 + (p_count - d_count) * 0.08 + (rng.next() - 0.5) * 0.2
    score = max(Decimal("0"), min(Decimal("1"), q4(Decimal(str(score)))))
    plaintiff_wins = score >= Decimal("0.5")
    amount = Decimal(case["amount"])
    remedy: dict = {"pay": "0", "currency_code": case["currency_code"]}
    if plaintiff_wins and amount > 0:
        remedy["pay"] = str(amount)
    if case["kind"] == "corporate" and plaintiff_wins and case["company_id"]:
        remedy["corporate_remedy"] = "void_unapproved_related_party"
    judgment = {
        "verdict": "plaintiff" if plaintiff_wins else "defendant",
        "score": str(score),
        "evidence": {"plaintiff": p_count, "defendant": d_count},
        "reason": "证据数量与法定评分为主，随机扰动来自案件哈希（确定性）",
    }
    return judgment, remedy


def hold_hearing(conn, case_id: str) -> dict:
    """Judge an overdue (or explicitly requested) case."""
    case = legal.case_by_id(conn, case_id, for_update=True)
    if case is None:
        raise NotFound("案件不存在")
    if case["status"] not in ("served", "hearing"):
        raise Unprocessable(f"案件状态 {case['status']} 不能开庭")
    if legal.judgment_of_case(conn, case_id) is not None:
        raise Unprocessable("本案已作出判决")
    judgment, remedy = _verdict(conn, case)
    row = legal.insert_judgment(conn, case_id, judgment, remedy)
    legal.set_case_status(conn, case_id, "judgment")
    if remedy.get("corporate_remedy") == "void_unapproved_related_party" and case["company_id"]:
        from . import company_law

        for txn in legal.related_parties(conn, str(case["company_id"])):
            if txn["status"] == "proposed":
                company_law.void_related_party(conn, str(case["company_id"]), str(txn["id"]))
    return {
        "case_id": case_id,
        "judgment_id": str(row["id"]),
        "judgment": judgment,
        "remedy": remedy,
    }


# ------------------------------------------------------------------ appeal
def appeal(conn, *, actor: dict, case_id: str, panel: bool = False) -> dict:
    case = legal.case_by_id(conn, case_id, for_update=True)
    if case is None:
        raise NotFound("案件不存在")
    actor_id = str(actor["id"])
    if actor_id not in (str(case["plaintiff_actor_id"]), str(case["defendant_actor_id"])):
        raise Forbidden("只有当事人可以上诉")
    judgment = legal.judgment_of_case(conn, case_id)
    if judgment is None:
        raise Unprocessable("尚未作出判决")
    if legal.appeal_of_case(conn, case_id) is not None:
        raise Unprocessable("每案仅可上诉一次（08 §5.5）")
    if judgment["status"] not in ("issued",):
        raise Unprocessable("该判决不可上诉")

    fee = _fee(Decimal(case["amount"]))
    treasury = currency_service.system_actor(conn, currency_service.TREASURY)
    currency_service.post(
        conn,
        kind="court_appeal_fee",
        moves=[
            Move(actor_id, case["currency_code"], -fee),
            Move(treasury["id"], case["currency_code"], fee),
        ],
        ref_type="court_case",
        ref_id=case_id,
        memo="court appeal fee",
    )
    row = legal.insert_appeal(
        conn, case_id=case_id, judgment_id=str(judgment["id"]), appellant_actor_id=actor_id
    )
    if panel:
        # 08 §12.1: a player panel hears it; the verdict arrives with the votes
        from . import court_panel

        drawn = court_panel.draw(conn, case_id=case_id, appeal_id=str(row["id"]))
        legal.set_case_status(conn, case_id, "appealed")
        return {
            "case_id": case_id,
            "appeal_id": str(row["id"]),
            "fee": str(fee),
            "panel": drawn,
            "outcome": {"result": "pending_panel", "reason": "合议庭审理中"},
        }
    # one-shot appellate review, deterministic per case
    rng = stream(case_id, "appeal", actor_id)
    overturned = rng.next() < 0.30
    outcome = {
        "result": "overturned" if overturned else "upheld",
        "reason": "上诉庭按案件哈希复核，一次性终局",
    }
    legal.decide_appeal(conn, str(row["id"]), "overturned" if overturned else "upheld", outcome)
    if overturned:
        remedy = dict(judgment["remedy"])
        remedy["pay"] = "0"
        conn.execute(
            "UPDATE court_judgments SET remedy = %s::jsonb, status = 'final' WHERE id = %s",
            (json.dumps(remedy), str(judgment["id"])),
        )
    else:
        legal.set_judgment_status(conn, str(judgment["id"]), "final")
    legal.set_case_status(conn, case_id, "closed" if overturned else "judgment")
    return {
        "case_id": case_id,
        "appeal_id": str(row["id"]),
        "outcome": outcome,
        "fee": str(fee),
    }


# ------------------------------------------------------------------ enforcement
def enforce(conn, *, actor: dict, case_id: str, region: str = "") -> dict:
    case = legal.case_by_id(conn, case_id, for_update=True)
    if case is None:
        raise NotFound("案件不存在")
    judgment = legal.judgment_of_case(conn, case_id, for_update=True)
    if judgment is None:
        raise Unprocessable("尚未作出判决")
    require_recognition(conn, str(judgment["id"]), region)
    if judgment["status"] == "enforced":
        raise Unprocessable("判决已执行")
    amount = Decimal(str(judgment["remedy"].get("pay", "0")))
    recognition = legal.recognition_for(conn, str(judgment["id"]), region.strip().lower()) \
        if region.strip().lower() not in ("", HOME_REGION) else None
    dt_tx_id = _enforce_settlement(conn, case, judgment, amount, region)
    if amount <= 0:
        legal.set_judgment_status(conn, str(judgment["id"]), "final")
        legal.set_case_status(conn, case_id, "closed")
        return {"case_id": case_id, "paid": "0", "status": "no_payment", "freeze": None}

    plaintiff = str(case["plaintiff_actor_id"])
    defendant = str(case["defendant_actor_id"])
    currency = case["currency_code"]
    available = _balance(conn, defendant, currency)
    pay = min(amount, available)
    if pay > 0:
        currency_service.post(
            conn,
            kind="court_enforcement",
            moves=[Move(defendant, currency, -pay), Move(plaintiff, currency, pay)],
            ref_type="court_case",
            ref_id=case_id,
            memo="judgment enforcement",
        )
    freeze = None
    if pay < amount:
        freeze = legal.insert_freeze(conn, case_id=case_id, asset_kind="currency",
                                     asset_id=defendant)
    remedy = dict(judgment["remedy"])
    remedy["paid"] = str(pay)
    remedy["unpaid"] = str(q4(amount - pay))
    conn.execute(
        "UPDATE court_judgments SET remedy = %s::jsonb WHERE id = %s",
        (json.dumps(remedy), str(judgment["id"])),
    )
    legal.set_judgment_status(conn, str(judgment["id"]), "enforced", enforced=True)
    legal.set_case_status(conn, case_id, "enforced", closed_at=datetime.now(timezone.utc))
    if recognition is not None and dt_tx_id:
        legal.set_recognition_dt(conn, str(recognition["id"]), dt_tx_id)
    return {
        "case_id": case_id,
        "paid": str(pay),
        "unpaid": str(q4(amount - pay)),
        "status": "enforced",
        "freeze": bool(freeze),
        "enforced_by": str(actor["id"]),
        "dt_tx_id": dt_tx_id,
    }


def freeze_asset(conn, *, case_id: str, asset_kind: str, asset_id: str) -> dict:
    case = legal.case_by_id(conn, case_id)
    if case is None:
        raise NotFound("案件不存在")
    if asset_kind not in ("currency", "stock", "property", "company"):
        raise InvalidArgument("资产类型不合法")
    row = legal.insert_freeze(conn, case_id=case_id, asset_kind=asset_kind, asset_id=asset_id)
    return {
        "case_id": case_id,
        "asset_kind": asset_kind,
        "asset_id": asset_id,
        "created": row is not None,
    }


def release_asset(conn, *, case_id: str, asset_kind: str, asset_id: str) -> dict:
    legal.release_freeze(conn, case_id, asset_kind, asset_id)
    return {"case_id": case_id, "asset_kind": asset_kind, "asset_id": asset_id,
            "status": "released"}


def judge_due_cases(conn, limit: int = 100) -> dict:
    """Job body: every hearing whose time has come gets its judgment."""
    judged = []
    for case in legal.cases_ready_for_judgment(conn, limit):
        result = hold_hearing(conn, str(case["id"]))
        judged.append({"case_id": str(case["id"]), "verdict": result["judgment"]["verdict"]})
    return {"judged": len(judged), "cases": judged}


# ------------------------------------------------------------------ recognition
HOME_REGION = "core"
REJECTION_CODES = {
    "no_jurisdiction": "原法院无管辖权",
    "no_notice": "未给被告正当通知或答辩机会",
    "fraud": "判决通过欺诈取得",
    "public_policy": "违反本区公共秩序",
    "conflicting_judgment": "与本区已生效判决冲突",
    "uncertain_remedy": "判决内容不确定或不可执行",
    "punitive_not_final": "惩罚性赔偿或罚款未终局",
    "third_party_harm": "承认会损害善意第三人",
}
APPEAL_OVERTURN = 0.35


def _recognition_payload(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "judgment_id": str(row["judgment_id"]),
        "case_id": str(row["case_id"]),
        "region": row["region"],
        "status": row["status"],
        "reason_code": row["reason_code"],
        "reason_label": REJECTION_CODES.get(str(row["reason_code"] or ""), ""),
        "reason": row["reason"],
        "decided_by": row["decided_by"],
        "decided_at": row["decided_at"].isoformat() if row["decided_at"] else None,
        "dt_tx_id": str(row["dt_tx_id"]) if row["dt_tx_id"] else None,
        "conflict_with": str(row["conflict_with"]) if row["conflict_with"] else None,
        "created_at": row["created_at"].isoformat(),
    }


def request_recognition(conn, *, actor: dict, judgment_id: str, region: str) -> dict:
    judgment = legal.judgment_by_id(conn, judgment_id)
    if judgment is None:
        raise NotFound("判决不存在")
    case = legal.case_by_id(conn, str(judgment["case_id"]))
    if case is None:
        raise NotFound("案件不存在")
    actor_id = str(actor["id"])
    if actor_id not in (str(case["plaintiff_actor_id"]), str(case["defendant_actor_id"])):
        raise Forbidden("只有当事人可以申请承认")
    if judgment["status"] in ("draft",):
        raise Unprocessable("判决尚未作出")
    if judgment["status"] == "enforced":
        raise Unprocessable("该判决已执行完毕")
    target = (region or "").strip().lower()
    if not target:
        raise InvalidArgument("必须指定被请求承认的区域")
    if target == HOME_REGION:
        raise InvalidArgument("本区判决无需承认")
    existing = legal.recognition_for(conn, judgment_id, target)
    if existing is not None:
        return {**_recognition_payload(existing), "duplicate": True}
    row = legal.insert_recognition(
        conn, judgment_id=judgment_id, case_id=str(case["id"]),
        region=target, requested_by=actor_id,
    )
    if row is None:  # pragma: no cover - unique guard races
        row = legal.recognition_for(conn, judgment_id, target)
    return _recognition_payload(row)


def decide_recognition(conn, recognition_id: str, *, recognize: bool, reason_code: str | None,
                       reason: str, decided_by: str) -> dict:
    row = legal.recognition_by_id(conn, recognition_id, for_update=True)
    if row is None:
        raise NotFound("承认申请不存在")
    if row["status"] != "requested":
        raise Unprocessable("该承认申请已处理")
    if recognize:
        conflict = legal.conflicting_recognition(conn, str(row["judgment_id"]), row["region"])
        if conflict is not None:
            # 08 §12.3 (5): a contradictory verdict already recognized here wins
            legal.decide_recognition(
                conn, recognition_id, status="rejected",
                reason_code="conflicting_judgment",
                reason=("与本区已承认的判决 %s 冲突，需上级法院协调"
                        % conflict["judgment_id"]),
                decided_by=decided_by,
            )
            legal.set_recognition_conflict(conn, recognition_id, str(conflict["id"]))
            return _recognition_payload(legal.recognition_by_id(conn, recognition_id))
        legal.decide_recognition(conn, recognition_id, status="recognized", reason_code=None,
                                 reason=reason[:500], decided_by=decided_by)
    else:
        code = (reason_code or "").strip()
        if code not in REJECTION_CODES:
            raise InvalidArgument("拒绝必须给出 08 §12.3 中的理由代码")
        if not reason.strip():
            raise InvalidArgument("拒绝必须给出书面理由")
        legal.decide_recognition(conn, recognition_id, status="rejected", reason_code=code,
                                 reason=reason[:500], decided_by=decided_by)
    return _recognition_payload(legal.recognition_by_id(conn, recognition_id))


def appeal_recognition(conn, *, actor: dict, recognition_id: str) -> dict:
    row = legal.recognition_by_id(conn, recognition_id, for_update=True)
    if row is None:
        raise NotFound("承认申请不存在")
    case = legal.case_by_id(conn, str(row["case_id"]))
    if case is None:
        raise NotFound("案件不存在")
    if str(actor["id"]) not in (str(case["plaintiff_actor_id"]),
                                str(case["defendant_actor_id"])):
        raise Forbidden("只有当事人可以上诉")
    if row["status"] != "rejected":
        raise Unprocessable("只有被拒绝的承认可以上诉")
    rng = stream(str(row["id"]), "recognition_appeal")
    overturned = rng.next() < APPEAL_OVERTURN
    legal.decide_recognition(
        conn, recognition_id,
        status="recognized" if overturned else "final",
        reason_code=None if overturned else row["reason_code"],
        reason=("上级法院撤销拒绝，予以承认" if overturned else "上级法院维持拒绝"),
        decided_by="appeal-court",
    )
    return {**_recognition_payload(legal.recognition_by_id(conn, recognition_id)),
            "appeal_result": "overturned" if overturned else "upheld"}


def require_recognition(conn, judgment_id: str, region: str) -> dict | None:
    """None means home-region enforcement (no recognition needed)."""
    target = (region or "").strip().lower()
    if not target or target == HOME_REGION:
        return None
    row = legal.recognition_for(conn, judgment_id, target)
    if row is None:
        raise Unprocessable(f"该判决尚未在 {target} 区获得承认（08 §8）")
    if row["status"] not in ("recognized",):
        raise Unprocessable(f"该判决在 {target} 区未被承认（{row['status']}）")
    return row


def _enforce_settlement(conn, case: dict, judgment: dict, amount: Decimal,
                        region: str) -> str | None:
    """Asset movement for a judgment runs as a 2PC transaction (09 §8).

    Single-database stage: the coordinator commits inline, but the attempt is
    logged with its fee and outbox event, so splitting regions later needs no
    change here.
    """
    if amount <= 0:
        return None
    target = (region or "").strip().lower() or HOME_REGION
    tx = dt_coordinator.begin(
        conn,
        kind="court_enforcement",
        participants=[{"participant_id": f"assets:{target}", "region": target}],
        payload={"case_id": str(case["id"]), "judgment_id": str(judgment["id"]),
                 "amount": str(amount)},
        origin_region=HOME_REGION,
        coordinator_id="court",
        idempotency_key=f"court_enforce:{case['id']}:{target}",
        notional=amount,
        currency_code=case["currency_code"],
        asset_class="court_freeze",
    )
    if tx["status"] != "committed":
        raise Unprocessable("跨区执行事务未提交（09 §3.4）")
    return str(tx["tx_id"])
