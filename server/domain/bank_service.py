"""Banking: deposits, withdrawals, loans, interest and rates.

Money model (docs/cosmic-economy/02):
* a deposit moves currency from the client's wallet into the bank's vault and
  records the liability in ``bank_accounts``;
* a loan is money creation: the borrower receives new currency while the
  banking system's equity account goes negative (the mirror of the loan asset);
* repayment returns currency to the bank and reduces the loan;
* the reserve floor (15%) blocks new lending, it never blocks withdrawals.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from ..infra.serialize import ts
from ..infra.errors import Forbidden, InvalidArgument, NotFound, Unprocessable
from ..repo import banks as bank_repo
from ..repo import properties as property_repo
from . import currency_service
from .currency_service import Move, q4

DEPOSIT_SPREAD_BPS = -150
LEND_SPREAD_BPS = 250
RISK_PREMIUM_BPS = {30: 150, 90: 250, 180: 350}
DEFAULT_TERM_DAYS = 90
BANK_EQUITY = "bank_equity"
#: A pledge must cover 130% of principal at appraisal (02 §3.3). Below that the
#: collateral auction could not pay the debt even at the reserve price.
PLEDGE_COVER_BPS = 13_000


def rates(conn) -> dict:
    row = bank_repo.latest_rates(conn)
    if row is None:  # pragma: no cover - seeded by 0110
        raise Unprocessable("利率表未初始化")
    return {
        "policy_rate_bps": int(row["policy_rate_bps"]),
        "deposit_rate_bps": int(row["deposit_rate_bps"]),
        "lend_rate_bps": int(row["lend_rate_bps"]),
        "effective_at": ts(row["effective_at"]),
        "source": row["source"],
        "risk_premium_bps": RISK_PREMIUM_BPS,
    }


def list_banks(conn) -> list[dict]:
    return [
        {
            "id": str(row["id"]),
            "code": row["code"],
            "name": row["name"],
            "kind": row["kind"],
            "currency_code": row["currency_code"],
            "reserve_ratio": str(row["reserve_ratio"]),
            "accounts": int(row["accounts"]),
        }
        for row in bank_repo.list_banks(conn)
    ]


def _active_bank(conn, bank_id: str) -> dict:
    key = currency_service.as_uuid(bank_id)
    bank_repo.lock_bank(conn, key)
    bank = bank_repo.by_id(conn, key)
    if bank is None:
        raise NotFound("银行不存在")
    if bank["status"] != "active":
        raise Unprocessable("该银行当前不可办理业务")
    return bank


def _fee_account(conn, bank: dict) -> str:
    if not bank["actor_id"]:  # pragma: no cover
        raise Unprocessable("银行缺少经济主体")
    return str(bank["actor_id"])


# ------------------------------------------------------------------ deposits
def deposit(conn, *, actor: dict, bank_id: str, currency_code: str, amount: Decimal, idem_key: str | None = None) -> dict:
    bank = _active_bank(conn, bank_id)
    value = q4(amount)
    if value <= 0:
        raise InvalidArgument("存款金额必须大于 0")
    bank_actor = _fee_account(conn, bank)

    account = bank_repo.ensure_account(conn, str(bank["id"]), actor["id"], currency_code)
    if account["status"] != "active":
        raise Unprocessable("该银行账户不可用")

    tx = currency_service.post(
        conn,
        kind="deposit",
        moves=[
            Move(actor["id"], currency_code, -value),
            Move(bank_actor, currency_code, value),
        ],
        ref_type="bank_account",
        ref_id=str(account["id"]),
        idem_key=idem_key,
        memo=f"deposit into {bank['code']}",
    )
    account = bank_repo.account(conn, str(bank["id"]), actor["id"], currency_code, for_update=True)
    balance = bank_repo.adjust_account(conn, str(account["id"]), value)
    if balance is None:  # pragma: no cover - guarded by the currency debit
        raise Unprocessable("存款入账失败")
    bank_repo.reserve(conn, str(bank["id"]), currency_code)
    bank_repo.adjust_vault(conn, str(bank["id"]), currency_code, value)
    return {
        "bank": {"id": str(bank["id"]), "code": bank["code"]},
        "account_id": str(account["id"]),
        "currency_code": currency_code,
        "amount": str(value),
        "balance": str(balance),
        "tx_id": tx["tx_id"],
    }


def withdraw(conn, *, actor: dict, bank_id: str, currency_code: str, amount: Decimal, idem_key: str | None = None) -> dict:
    bank = _active_bank(conn, bank_id)
    value = q4(amount)
    if value <= 0:
        raise InvalidArgument("取款金额必须大于 0")
    bank_actor = _fee_account(conn, bank)

    account = bank_repo.account(conn, str(bank["id"]), actor["id"], currency_code)
    if account is None or account["status"] != "active":
        raise NotFound("没有该银行的存款账户")
    if Decimal(account["balance"]) < value:
        raise Unprocessable("存款余额不足")

    tx = currency_service.post(
        conn,
        kind="withdraw",
        moves=[
            Move(bank_actor, currency_code, -value),
            Move(actor["id"], currency_code, value),
        ],
        ref_type="bank_account",
        ref_id=str(account["id"]),
        idem_key=idem_key,
        memo=f"withdraw from {bank['code']}",
    )
    account = bank_repo.account(conn, str(bank["id"]), actor["id"], currency_code, for_update=True)
    if account is None or Decimal(account["balance"]) < value:  # pragma: no cover - re-checked under lock
        raise Unprocessable("存款余额不足")
    balance = bank_repo.adjust_account(conn, str(account["id"]), -value)
    if balance is None:  # pragma: no cover
        raise Unprocessable("取款失败")
    bank_repo.adjust_vault(conn, str(bank["id"]), currency_code, -value)
    return {
        "bank": {"id": str(bank["id"]), "code": bank["code"]},
        "account_id": str(account["id"]),
        "currency_code": currency_code,
        "amount": str(value),
        "balance": str(balance),
        "tx_id": tx["tx_id"],
    }


def accounts(conn, actor_id: str) -> list[dict]:
    return [
        {
            "id": str(row["id"]),
            "bank_id": str(row["bank_id"]),
            "bank_code": row["bank_code"],
            "bank_name": row["bank_name"],
            "currency_code": row["currency_code"],
            "balance": str(Decimal(row["balance"])),
        }
        for row in bank_repo.accounts_of(conn, actor_id)
    ]


# ------------------------------------------------------------------ loans
def _lend_rate_bps(conn, term_days: int) -> int:
    row = bank_repo.latest_rates(conn)
    base = int(row["lend_rate_bps"]) if row else 650
    return base + RISK_PREMIUM_BPS.get(term_days, 250)


def _reserve_ok(conn, bank: dict, currency_code: str, amount: Decimal) -> bool:
    reserves = bank_repo.reserve(conn, str(bank["id"]), currency_code, for_update=True)
    deposits = bank_repo.deposits_total(conn, str(bank["id"]), currency_code)
    required = deposits * Decimal(bank["reserve_ratio"])
    return Decimal(reserves["vault"]) - amount >= required


def open_loan(
    conn,
    *,
    actor: dict,
    bank_id: str,
    currency_code: str,
    amount: Decimal,
    term_days: int = DEFAULT_TERM_DAYS,
    collateral_asset_ids: list[str] | None = None,
    idem_key: str | None = None,
) -> dict:
    bank = _active_bank(conn, bank_id)
    value = q4(amount)
    if value <= 0:
        raise InvalidArgument("贷款金额必须大于 0")
    if term_days not in RISK_PREMIUM_BPS:
        raise InvalidArgument("贷款期限仅支持 30/90/180 天")
    if not _reserve_ok(conn, bank, currency_code, value):
        raise Unprocessable("银行超额准备金不足，暂不放款")
    # Validate the pledge before any money moves: a loan that fails cover is a
    # rejected request, not a half-open position.
    pledge = _validated_pledge(conn, actor=actor, asset_ids=collateral_asset_ids or [], principal=value)

    equity = currency_service.system_actor(conn, BANK_EQUITY)
    rate_bps = _lend_rate_bps(conn, term_days)
    due_at = datetime.now(timezone.utc) + timedelta(days=term_days)
    tx = currency_service.post(
        conn,
        kind="loan",
        moves=[
            Move(equity["id"], currency_code, -value),
            Move(actor["id"], currency_code, value),
        ],
        ref_type="bank",
        ref_id=str(bank["id"]),
        idem_key=idem_key,
        memo=f"loan {term_days}d @ {rate_bps}bps",
    )
    loan = bank_repo.insert_loan(
        conn,
        bank_id=str(bank["id"]),
        actor_id=actor["id"],
        currency_code=currency_code,
        principal=value,
        rate_bps=rate_bps,
        spread_bps=LEND_SPREAD_BPS,
        rate_type="floating",
        due_at=due_at,
    )
    for row in pledge:
        _register_lien(conn, loan_id=str(loan["id"]), asset=row)
    return _loan_payload(loan, tx_id=tx["tx_id"], collateral=_collateral_payload(conn, str(loan["id"])))


def repay(
    conn, *, actor: dict, loan_id: str, amount: Decimal, idem_key: str | None = None
) -> dict:
    value = q4(amount)
    if value <= 0:
        raise InvalidArgument("还款金额必须大于 0")
    key = currency_service.as_uuid(loan_id)
    peek = bank_repo.loan(conn, key)
    if peek is None:
        raise NotFound("贷款不存在")
    bank_repo.lock_bank(conn, str(peek["bank_id"]))
    loan = bank_repo.loan(conn, key, for_update=True)
    if loan is None:  # pragma: no cover
        raise NotFound("贷款不存在")
    if str(loan["actor_id"]) != str(actor["id"]):
        raise Forbidden("不能偿还他人的贷款")
    if loan["status"] != "active":
        raise Unprocessable("该贷款已结清")

    outstanding = Decimal(loan["outstanding"])
    interest = Decimal(loan["accrued_interest"])
    if value > outstanding + interest:
        raise InvalidArgument("还款金额超过应还总额")

    pay_interest = min(value, interest)
    pay_principal = min(value - pay_interest, outstanding)
    bank = bank_repo.by_id(conn, str(loan["bank_id"]))
    if bank is None:  # pragma: no cover
        raise NotFound("放款银行不存在")

    tx = currency_service.post(
        conn,
        kind="repay",
        moves=[
            Move(actor["id"], loan["currency_code"], -value),
            Move(str(bank["actor_id"]), loan["currency_code"], value),
        ],
        ref_type="bank_loan",
        ref_id=str(loan["id"]),
        idem_key=idem_key,
        memo=f"repay principal {pay_principal}, interest {pay_interest}",
    )
    remaining_principal = outstanding - pay_principal
    remaining_interest = interest - pay_interest
    status = "repaid" if remaining_principal <= 0 and remaining_interest <= 0 else "active"
    updated = bank_repo.apply_repayment(
        conn,
        str(loan["id"]),
        principal=pay_principal,
        interest=pay_interest,
        status=status,
    )
    bank_repo.adjust_vault(conn, str(bank["id"]), loan["currency_code"], value)
    if status == "repaid":
        _release_liens(conn, str(loan["id"]))
    return {
        "loan_id": str(loan["id"]),
        "paid_principal": str(pay_principal),
        "paid_interest": str(pay_interest),
        "outstanding": str(Decimal(updated["outstanding"])),
        "accrued_interest": str(Decimal(updated["accrued_interest"])),
        "status": updated["status"],
        "tx_id": tx["tx_id"],
    }


def loans(conn, actor_id: str) -> list[dict]:
    """Every loan the actor ever had — defaulted and liquidated ones included.

    The old version filtered ``status = 'active'``, which hid exactly the loans a
    player most needs to see: the ones that went wrong.
    """
    rows = bank_repo.loans_of(conn, actor_id, status=None)
    return [_loan_payload(row, collateral=_collateral_payload(conn, str(row["id"]))) for row in rows]


def collateral_of(conn, actor: dict, loan_id: str) -> dict:
    loan = bank_repo.loan(conn, currency_service.as_uuid(loan_id))
    if loan is None:
        raise NotFound("贷款不存在")
    if str(loan["actor_id"]) != str(actor["id"]):
        raise Forbidden("不能查看他人的抵押物")
    return {"loan_id": str(loan["id"]), "collateral": _collateral_payload(conn, str(loan["id"]))}


def _loan_payload(row: dict, tx_id: str | None = None, collateral: list[dict] | None = None) -> dict:
    payload = {
        "id": str(row["id"]),
        "bank_id": str(row["bank_id"]),
        "currency_code": row["currency_code"],
        "principal": str(Decimal(row["principal"])),
        "outstanding": str(Decimal(row["outstanding"])),
        "accrued_interest": str(Decimal(row["accrued_interest"])),
        "rate_bps": int(row["rate_bps"]),
        "status": row["status"],
        "issued_at": ts(row["issued_at"]),
        "due_at": ts(row["due_at"]),
    }
    if tx_id:
        payload["tx_id"] = tx_id
    if collateral is not None:
        payload["collateral"] = collateral
    return payload


# --------------------------------------------------------------- collateral


def _collateral_payload(conn, loan_id: str) -> list[dict]:
    return [
        {
            "id": str(row["id"]),
            "asset_id": str(row["asset_id"]),
            "asset_key": row.get("asset_key"),
            "name": row.get("name"),
            "pledged_value": str(Decimal(row["pledged_value"])),
            "status": row["status"],
            "listing_id": str(row["listing_id"]) if row.get("listing_id") else None,
        }
        for row in bank_repo.collaterals_of(conn, loan_id)
    ]


def _validated_pledge(conn, *, actor: dict, asset_ids: list[str], principal: Decimal) -> list[dict]:
    """Check ownership, encumbrances and the cover ratio; return the assets.

    Cover is 130% of principal at the *stored* appraisal — re-appraisal later
    must not retroactively change a signed loan, so the value is snapshotted onto
    the collateral row by ``_register_lien``.
    """
    if not asset_ids:
        return []
    if len(set(asset_ids)) != len(asset_ids):
        raise InvalidArgument("同一处产权不能重复抵押")

    rows: list[dict] = []
    seen: set[str] = set()
    for asset_id in asset_ids:
        asset = property_repo.by_id(conn, currency_service.as_uuid(asset_id), for_update=True)
        if asset is None:
            raise NotFound("产权不存在")
        key = str(asset["id"])
        if key in seen:
            raise InvalidArgument("同一处产权不能重复抵押")
        seen.add(key)
        if asset["owner_actor_id"] is None or str(asset["owner_actor_id"]) != str(actor["id"]):
            raise Forbidden("只能抵押自己的产权")
        if asset["status"] not in ("owned", "listed"):
            raise Unprocessable("该产权正在交易或已被冻结，无法抵押")
        if property_repo.open_encumbrances(conn, key):
            raise Unprocessable("该产权已存在未解除的抵押/冻结")
        value = Decimal(asset["appraised_value"] or 0)
        if value <= 0:
            raise Unprocessable("产权估值尚未生成，无法抵押")
        rows.append(asset)

    total = sum((Decimal(row["appraised_value"]) for row in rows), Decimal("0"))
    required = q4(principal * PLEDGE_COVER_BPS / Decimal(10_000))
    if total < required:
        raise Unprocessable(f"抵押物估值 {q4(total)} 不足覆盖额的 {required}")
    return rows


def _register_lien(conn, *, loan_id: str, asset: dict) -> dict:
    encumbrance = property_repo.add_encumbrance(
        conn, str(asset["id"]), "lien", f"loan {loan_id}"
    )
    return bank_repo.insert_collateral(
        conn,
        loan_id=loan_id,
        asset_id=str(asset["id"]),
        pledged_value=Decimal(asset["appraised_value"]),
        encumbrance_id=str(encumbrance["id"]),
    )


def _release_liens(conn, loan_id: str) -> None:
    for row in bank_repo.release_collateral_of(conn, loan_id):
        if row["encumbrance_id"]:
            property_repo.release_encumbrance(conn, str(row["encumbrance_id"]))


# ------------------------------------------------------------------ rate reset


#: 02 §3.1: floating loans reprice monthly against the policy rate.
RESET_INTERVAL_DAYS = 30


def _term_days_of(loan: dict) -> int:
    """Recover the contract term from the dates — the premium depends on it."""
    issued, due = loan["issued_at"], loan["due_at"]
    if issued is None or due is None:  # pragma: no cover - both are NOT NULL
        return DEFAULT_TERM_DAYS
    days = (due - issued).days
    return min(RISK_PREMIUM_BPS, key=lambda term: abs(term - days))


def reset_floating_rates(conn) -> dict:
    """Move every floating loan onto the current policy rate (02 §3.1).

    ``rate = policy + bank spread + term premium``. The premium is recomputed from
    the loan's own dates rather than stored: the contract term never changes, and
    a 90-day loan must not silently become a 30-day one because the policy moved.
    """
    rates = bank_repo.latest_rates(conn)
    policy = int(rates["policy_rate_bps"]) if rates else 350
    reset = 0
    for loan in bank_repo.floating_due(conn):
        term = _term_days_of(loan)
        rate = policy + int(loan["spread_bps"]) + RISK_PREMIUM_BPS.get(term, 250)
        rate = max(0, min(10_000, rate))
        bank_repo.set_loan_rate(
            conn,
            str(loan["id"]),
            rate_bps=rate,
            next_reset_at=datetime.now(timezone.utc) + timedelta(days=RESET_INTERVAL_DAYS),
        )
        reset += 1
    return {"reset": reset, "policy_rate_bps": policy, "interval_days": RESET_INTERVAL_DAYS}


# ------------------------------------------------------------------ interest
def accrue_interest(conn, run_date: date | None = None) -> dict:
    """Daily accrual: interest is capitalized onto the loan, not paid in cash."""
    day = run_date or datetime.now(timezone.utc).date()
    per_bank: dict[str, Decimal] = {}
    processed = 0
    for loan in bank_repo.active_loans(conn):
        outstanding = Decimal(loan["outstanding"])
        rate = Decimal(loan["rate_bps"]) / Decimal(10_000)
        interest = q4(outstanding * rate / Decimal(365))
        if interest <= 0:
            continue
        bank_repo.accrue(conn, str(loan["id"]), interest)
        per_bank[str(loan["bank_id"])] = per_bank.get(str(loan["bank_id"]), Decimal(0)) + interest
        processed += 1
    for bank_id, total in per_bank.items():
        bank_repo.record_interest_run(
            conn, bank_id=bank_id, run_date=day, deposit_interest=Decimal(0), loan_interest=total
        )
    return {"date": ts(day), "loans": processed, "interest": str(q4(sum(per_bank.values(), Decimal(0))))}


def set_policy_rate(conn, policy_bps: int, note: str = "") -> dict:
    """Central-bank rate move; deposit/lend rates follow the fixed spreads."""
    if not 0 <= policy_bps <= 1500:
        raise InvalidArgument("基准利率必须在 0-1500bp")
    deposit_bps = policy_bps + DEPOSIT_SPREAD_BPS
    lend_bps = policy_bps + LEND_SPREAD_BPS
    row = bank_repo.record_rates(
        conn,
        policy_bps=policy_bps,
        deposit_bps=deposit_bps,
        lend_bps=lend_bps,
        source="central_bank",
        note=note,
    )
    return {
        "policy_rate_bps": int(row["policy_rate_bps"]),
        "deposit_rate_bps": int(row["deposit_rate_bps"]),
        "lend_rate_bps": int(row["lend_rate_bps"]),
        "effective_at": ts(row["effective_at"]),
    }
