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

from ..infra.errors import Forbidden, InvalidArgument, NotFound, Unprocessable
from ..repo import banks as bank_repo
from . import currency_service
from .currency_service import Move, q4

DEPOSIT_SPREAD_BPS = -150
LEND_SPREAD_BPS = 250
RISK_PREMIUM_BPS = {30: 150, 90: 250, 180: 350}
DEFAULT_TERM_DAYS = 90
BANK_EQUITY = "bank_equity"


def rates(conn) -> dict:
    row = bank_repo.latest_rates(conn)
    if row is None:  # pragma: no cover - seeded by 0110
        raise Unprocessable("利率表未初始化")
    return {
        "policy_rate_bps": int(row["policy_rate_bps"]),
        "deposit_rate_bps": int(row["deposit_rate_bps"]),
        "lend_rate_bps": int(row["lend_rate_bps"]),
        "effective_at": row["effective_at"].isoformat(),
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
    return _loan_payload(loan, tx_id=tx["tx_id"])


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
    return [_loan_payload(row) for row in bank_repo.loans_of(conn, actor_id)]


def _loan_payload(row: dict, tx_id: str | None = None) -> dict:
    payload = {
        "id": str(row["id"]),
        "bank_id": str(row["bank_id"]),
        "currency_code": row["currency_code"],
        "principal": str(Decimal(row["principal"])),
        "outstanding": str(Decimal(row["outstanding"])),
        "accrued_interest": str(Decimal(row["accrued_interest"])),
        "rate_bps": int(row["rate_bps"]),
        "status": row["status"],
        "issued_at": row["issued_at"].isoformat(),
        "due_at": row["due_at"].isoformat(),
    }
    if tx_id:
        payload["tx_id"] = tx_id
    return payload


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
    return {"date": day.isoformat(), "loans": processed, "interest": str(q4(sum(per_bank.values(), Decimal(0))))}


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
        "effective_at": row["effective_at"].isoformat(),
    }
