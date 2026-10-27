"""Currency wallet and bank endpoints (docs/cosmic-economy 01 §7, 02 §9)."""

from __future__ import annotations

from flask import Blueprint, g, request

from ...domain import bank_service, certificate_service, compliance_service, currency_service, insurance_service, interbank_service
from ...infra.context import db
from ...infra.errors import Forbidden, InvalidArgument, NotFound
from ...models.currency import (
    BankAmountRequest,
    BribeRequest,
    CertificateQuoteRequest,
    CertificateRequest,
    ExchangeRequest,
    InsuranceClaimRequest,
    InterbankOrderRequest,
    LoanRequest,
    RepayRequest,
    TransferRequest,
)
from ...repo import currency as currency_repo
from ...repo import players as player_repo
from ..deps import (
    begin_idempotency,
    finish_idempotency,
    parse_model,
    rate_limit,
    require_auth,
    success,
)

bp = Blueprint("bank", __name__)


def _write(payload: dict, action):
    with db().transaction() as conn:
        ticket = begin_idempotency(conn, g.account_id, payload)
        if ticket.replayed and ticket.cached:
            return success(ticket.cached, extra_headers={"Idempotent-Replay": "true"})
        player = player_repo.get(conn, g.player_id)
        player["account_role"] = getattr(g, "player", {}).get("account_role")
        result = action(conn, player)
        finish_idempotency(conn, ticket, 200, result)
    return success(result)


# ------------------------------------------------------------------ currency
@bp.get("/currencies")
@require_auth()
@rate_limit("currencies", 120, 60)
def list_currencies():
    with db().connection() as conn:
        rows = currency_repo.currencies(conn)
    return success({"currencies": [dict(row) for row in rows]})


@bp.get("/wallet/currencies")
@require_auth()
@rate_limit("wallet", 120, 60)
def wallet():
    with db().connection() as conn:
        actor = currency_service.actor_for_player(conn, player_repo.get(conn, g.player_id))
        data = currency_service.wallet(conn, actor["id"])
    return success(data)


@bp.get("/wallet/entries")
@require_auth()
@rate_limit("wallet_entries", 60, 60)
def wallet_entries():
    with db().connection() as conn:
        actor = currency_service.actor_for_player(conn, player_repo.get(conn, g.player_id))
        rows = currency_repo.recent_entries(conn, actor["id"], limit=50)
    return success({"entries": [dict(row) for row in rows]})


@bp.post("/wallet/transfer")
@require_auth(write=True)
@rate_limit("wallet_transfer", 30, 60)
def transfer():
    body = parse_model(TransferRequest)
    payload = {"to_actor_id": body.to_actor_id, "to_player_id": body.to_player_id,
               "currency": body.currency_code, "amount": str(body.amount), "memo": body.memo}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        if body.to_actor_id:
            target_id = body.to_actor_id
        else:
            target = currency_repo.actor_for_player(conn, body.to_player_id)
            if target is None:
                raise NotFound("收款玩家尚未开通经济主体")
            target_id = str(target["id"])
        tx = currency_service.transfer(
            conn,
            from_actor=actor,
            to_actor_id=target_id,
            currency_code=body.currency_code,
            amount=body.amount,
            memo=body.memo,
        )
        return {**tx, "wallet": currency_service.wallet(conn, actor["id"])}

    return _write(payload, action)


@bp.post("/bank/exchange")
@require_auth(write=True)
@rate_limit("bank_exchange", 30, 60)
def exchange():
    body = parse_model(ExchangeRequest)
    payload = {"from": body.from_code, "to": body.to_code, "amount": str(body.amount),
               "direction": body.direction}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        operation = currency_service.exchange if body.direction == "up" else currency_service.exchange_down
        tx = operation(
            conn,
            actor=actor,
            from_code=body.from_code,
            to_code=body.to_code,
            amount=body.amount,
        )
        return {**tx, "wallet": currency_service.wallet(conn, actor["id"])}

    return _write(payload, action)


@bp.get("/bank/quote")
@require_auth()
@rate_limit("bank_quote", 60, 60)
def bank_quote():
    from_code = (request.args.get("from_code") or "cc1").strip()
    to_code = (request.args.get("to_code") or "cc2").strip()
    if not (from_code.startswith("cc") and to_code.startswith("cc")):
        raise InvalidArgument("货币代码不合法")
    with db().transaction() as conn:
        data = currency_service.quote(conn, from_code, to_code)
    return success(data)


# ------------------------------------------------------------------ banks
@bp.get("/banks")
@require_auth()
@rate_limit("banks", 120, 60)
def banks():
    with db().connection() as conn:
        return success({"banks": bank_service.list_banks(conn)})


@bp.get("/bank/rates")
@require_auth()
@rate_limit("bank_rates", 120, 60)
def bank_rates():
    with db().connection() as conn:
        return success(bank_service.rates(conn))


@bp.post("/banks/<bank_id>/deposit")
@require_auth(write=True)
@rate_limit("bank_deposit", 60, 60)
def deposit(bank_id: str):
    body = parse_model(BankAmountRequest)
    payload = {"bank": bank_id, "currency": body.currency_code, "amount": str(body.amount)}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return bank_service.deposit(
            conn,
            actor=actor,
            bank_id=bank_id,
            currency_code=body.currency_code,
            amount=body.amount,
        )

    return _write(payload, action)


@bp.post("/banks/<bank_id>/withdraw")
@require_auth(write=True)
@rate_limit("bank_withdraw", 60, 60)
def withdraw(bank_id: str):
    body = parse_model(BankAmountRequest)
    payload = {"bank": bank_id, "currency": body.currency_code, "amount": str(body.amount)}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return bank_service.withdraw(
            conn,
            actor=actor,
            bank_id=bank_id,
            currency_code=body.currency_code,
            amount=body.amount,
        )

    return _write(payload, action)


@bp.get("/bank/accounts")
@require_auth()
@rate_limit("bank_accounts", 120, 60)
def bank_accounts():
    with db().connection() as conn:
        actor = currency_service.actor_for_player(conn, player_repo.get(conn, g.player_id))
        return success({"accounts": bank_service.accounts(conn, actor["id"])})


# ------------------------------------------------------------------ loans
@bp.post("/banks/<bank_id>/loans")
@require_auth(write=True)
@rate_limit("bank_loan", 20, 60)
def open_loan(bank_id: str):
    body = parse_model(LoanRequest)
    payload = {"bank": bank_id, "currency": body.currency_code, "amount": str(body.amount),
               "term": body.term_days}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return bank_service.open_loan(
            conn,
            actor=actor,
            bank_id=bank_id,
            currency_code=body.currency_code,
            amount=body.amount,
            term_days=body.term_days,
        )

    return _write(payload, action)


@bp.get("/bank/loans")
@require_auth()
@rate_limit("bank_loans", 120, 60)
def list_loans():
    with db().connection() as conn:
        actor = currency_service.actor_for_player(conn, player_repo.get(conn, g.player_id))
        return success({"loans": bank_service.loans(conn, actor["id"])})


@bp.post("/bank/loans/<loan_id>/repay")
@require_auth(write=True)
@rate_limit("bank_repay", 20, 60)
def repay(loan_id: str):
    body = parse_model(RepayRequest)
    payload = {"loan": loan_id, "amount": str(body.amount)}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return bank_service.repay(conn, actor=actor, loan_id=loan_id, amount=body.amount)

    return _write(payload, action)


# ------------------------------------------------------------------ certificates
@bp.post("/banks/<bank_id>/certificates")
@require_auth(write=True)
@rate_limit("certificate_issue", 20, 60)
def issue_certificate(bank_id: str):
    body = parse_model(CertificateRequest)
    payload = {"bank": bank_id, "currency": body.currency_code,
               "amount": str(body.amount), "term": body.term_days}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return certificate_service.issue(
            conn,
            actor=actor,
            bank_id=bank_id,
            currency_code=body.currency_code,
            principal=body.amount,
            term_days=body.term_days,
        )

    return _write(payload, action)


@bp.get("/bank/certificates")
@require_auth()
@rate_limit("certificates", 60, 60)
def list_certificates():
    with db().connection() as conn:
        actor = currency_service.actor_for_player(conn, player_repo.get(conn, g.player_id))
        return success({"certificates": certificate_service.list_of(conn, actor["id"])})


@bp.get("/bank/certificate-quotes")
@require_auth()
@rate_limit("certificate_quotes", 60, 60)
def list_certificate_quotes():
    with db().connection() as conn:
        return success({"quotes": certificate_service.open_quotes(conn)})


@bp.post("/bank/certificates/<certificate_id>/quote")
@require_auth(write=True)
@rate_limit("certificate_quote", 20, 60)
def quote_certificate(certificate_id: str):
    body = parse_model(CertificateQuoteRequest)
    payload = {"certificate": certificate_id, "ask_yield_bps": body.ask_yield_bps}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return certificate_service.quote(
            conn, actor=actor, certificate_id=certificate_id, ask_yield_bps=body.ask_yield_bps
        )

    return _write(payload, action)


@bp.post("/bank/certificate-quotes/<quote_id>/buy")
@require_auth(write=True)
@rate_limit("certificate_buy", 20, 60)
def buy_certificate(quote_id: str):
    payload = {"quote": quote_id}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return certificate_service.buy(conn, buyer=actor, quote_id=quote_id)

    return _write(payload, action)


@bp.post("/bank/certificates/<certificate_id>/redeem")
@require_auth(write=True)
@rate_limit("certificate_redeem", 20, 60)
def redeem_certificate(certificate_id: str):
    payload = {"certificate": certificate_id}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return certificate_service.redeem(conn, actor=actor, certificate_id=certificate_id)

    return _write(payload, action)


# ------------------------------------------------------------------ interbank
@bp.get("/bank/interbank")
@require_auth()
@rate_limit("interbank", 60, 60)
def interbank_orders():
    with db().connection() as conn:
        return success({"orders": interbank_service.orders(conn, status="open")})


@bp.post("/banks/<bank_id>/interbank/orders")
@require_auth(write=True)
@rate_limit("interbank_post", 20, 60)
def post_interbank_order(bank_id: str):
    body = parse_model(InterbankOrderRequest)
    payload = {"bank": bank_id, "currency": body.currency_code, "amount": str(body.amount),
               "rate": body.rate_bps, "term": body.term_days}

    def action(conn, player):
        _require_admin(player)
        return interbank_service.post_order(
            conn,
            lender_bank_id=bank_id,
            currency_code=body.currency_code,
            principal=body.amount,
            rate_bps=body.rate_bps,
            term_days=body.term_days,
        )

    return _write(payload, action)


@bp.post("/bank/interbank/orders/<order_id>/accept")
@require_auth(write=True)
@rate_limit("interbank_accept", 20, 60)
def accept_interbank_order(order_id: str):
    payload = {"order": order_id}

    def action(conn, player):
        bank_id = _require_bank_id(player)
        _require_admin(player)
        return interbank_service.accept(conn, borrower_bank_id=bank_id, order_id=order_id)

    return _write(payload, action)


@bp.post("/bank/interbank/orders/<order_id>/repay")
@require_auth(write=True)
@rate_limit("interbank_repay", 20, 60)
def repay_interbank_order(order_id: str):
    payload = {"order": order_id}

    def action(conn, player):
        bank_id = _require_bank_id(player)
        _require_admin(player)
        return interbank_service.repay(conn, borrower_bank_id=bank_id, order_id=order_id)

    return _write(payload, action)


# ------------------------------------------------------------------ insurance
@bp.get("/bank/insurance")
@require_auth()
@rate_limit("insurance", 60, 60)
def insurance_fund():
    with db().connection() as conn:
        return success(insurance_service.fund(conn))


@bp.post("/bank/insurance/claims")
@require_auth(write=True)
@rate_limit("insurance_claim", 10, 60)
def file_insurance_claim():
    body = parse_model(InsuranceClaimRequest)
    payload = {"bank": body.bank_id, "currency": body.currency_code, "amount": str(body.amount)}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return insurance_service.file_claim(
            conn, actor=actor, bank_id=body.bank_id, currency_code=body.currency_code, amount=body.amount
        )

    return _write(payload, action)


# ------------------------------------------------------------------ compliance
@bp.get("/compliance/fund")
@require_auth()
@rate_limit("compliance_fund", 60, 60)
def compliance_fund():
    with db().connection() as conn:
        return success(compliance_service.fund_balance(conn))


@bp.post("/wallet/bribe")
@require_auth(write=True)
@rate_limit("bribe", 10, 60)
def pay_bribe():
    body = parse_model(BribeRequest)
    payload = {"officer": body.officer_actor_id, "currency": body.currency_code,
               "amount": str(body.amount), "base_fee": str(body.base_fee_q1)}

    def action(conn, player):
        actor = currency_service.actor_for_player(conn, player)
        return compliance_service.pay_bribe(
            conn,
            actor=actor,
            officer_actor_id=body.officer_actor_id,
            currency_code=body.currency_code,
            bribe_amount=body.amount,
            base_fee_q1=body.base_fee_q1,
        )

    return _write(payload, action)


def _require_admin(player) -> None:
    role = str(player.get("account_role") or player.get("role") or "")
    if role not in ("admin", "ccmc", "central_bank"):
        raise Forbidden("需要央行/CCMC 管理权限")


def _require_bank_id(player) -> str:
    bank_id = (request.args.get("bank_id") or "").strip()
    if not bank_id:
        raise Forbidden("请通过 ?bank_id= 指定银行")
    return bank_id
