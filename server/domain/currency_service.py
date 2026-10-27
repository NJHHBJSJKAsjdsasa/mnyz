"""Multi-currency ledger and exchange.

Rules (docs/cosmic-economy/01):
* every balance change goes through :func:`post`, which writes one balanced
  transaction plus one entry per account;
* balances may never go negative unless the actor is a system account that is
  allowed to (treasury mints by going negative, 01 §3.2);
* ledger rows are append-only; corrections are new transactions, never updates;
* exchange is adjacent-tier only: up 5:1 with a tiered fee burned, down 1:4.60
  with the 8% spread kept by the market account (01 §5.1).
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_DOWN, Decimal
from typing import Iterable
from uuid import UUID

from ..infra.errors import InsufficientFunds, InvalidArgument, NotFound, Unprocessable
from ..repo import currency as currency_repo

Q4 = Decimal("0.0001")
MIN_FEE = Decimal("0.0001")
TREASURY = "treasury"
BURN = "burn"
CB = "cb"
MARKET = "market"
BANK_EQUITY = "bank_equity"
DOWN_SPREAD_BPS = 800  # 1.00 -> 0.92, i.e. 1:4.60


@dataclass(frozen=True)
class Move:
    actor_id: str
    currency_code: str
    delta: Decimal


def q4(value: Decimal | float | int | str) -> Decimal:
    return Decimal(str(value)).quantize(Q4, rounding=ROUND_DOWN)


# ------------------------------------------------------------------ actors
def actor_for_player(conn, player: dict) -> dict:
    """Return the player's economic actor, creating it on first touch."""
    actor = currency_repo.actor_for_player(conn, player["id"])
    if actor is not None:
        return actor
    controller = player.get("controller") or "human"
    created = currency_repo.create_player_actor(
        conn, player["id"], player.get("display_name", ""), controller
    )
    if created is not None:
        return created
    actor = currency_repo.actor_for_player(conn, player["id"])
    if actor is None:  # pragma: no cover - only if the player row vanished
        raise NotFound("玩家经济主体不存在")
    return actor


def system_actor(conn, code: str) -> dict:
    actor = currency_repo.actor_by_code(conn, code)
    if actor is None:  # pragma: no cover - seeded by migration 0110
        raise Unprocessable(f"系统账户 {code} 未初始化")
    return actor


def wallet(conn, actor_id: str) -> dict:
    rows = currency_repo.balances(conn, actor_id)
    total_q1 = sum((Decimal(row["balance"]) * Decimal(row["base_value"]) for row in rows), Decimal(0))
    return {
        "actor_id": actor_id,
        "currencies": [
            {
                "code": row["currency_code"],
                "name": row["name"],
                "quality": int(row["quality"]),
                "balance": str(Decimal(row["balance"])),
                "frozen": str(Decimal(row["frozen"])),
                "q1_equiv": str(q4(Decimal(row["balance"]) * Decimal(row["base_value"]))),
            }
            for row in rows
        ],
        "q1_total": str(q4(total_q1)),
    }


# ------------------------------------------------------------------ posting
def post(
    conn,
    *,
    kind: str,
    moves: Iterable[Move],
    ref_type: str | None = None,
    ref_id: str | None = None,
    idem_key: str | None = None,
    memo: str = "",
    balanced_in_q1: bool = False,
) -> dict:
    """Write one balanced ledger transaction.

    ``balanced_in_q1`` is needed for exchange, where value leaves one currency
    and appears in another at a fixed ratio; the Q1-equivalent sum is zero.
    """
    aggregated: dict[tuple[str, str], Decimal] = {}
    for move in moves:
        key = (str(move.actor_id), move.currency_code)
        aggregated[key] = aggregated.get(key, Decimal(0)) + q4(move.delta)
    aggregated = {key: delta for key, delta in aggregated.items() if delta != 0}
    if not aggregated:
        raise InvalidArgument("交易没有任何金额变动")

    _assert_balanced(conn, aggregated, balanced_in_q1)

    if idem_key:
        existing = currency_repo.transaction_by_idempotency(conn, idem_key)
        if existing is not None:
            return {
                "tx_id": str(existing["id"]),
                "kind": existing["kind"],
                "entries": currency_repo.entries_for(conn, existing["id"]),
                "replayed": True,
            }

    for actor_id, code in aggregated:
        currency_repo.ensure_account(conn, actor_id, code)

    rows: dict[tuple[str, str], dict] = {}
    for key in sorted(aggregated, key=lambda item: (item[0], item[1])):
        row = currency_repo.account(conn, key[0], key[1], for_update=True)
        if row is None:  # pragma: no cover - ensure_account just created it
            raise Unprocessable("货币账户不存在")
        rows[key] = row

    tx = currency_repo.insert_transaction(
        conn,
        kind=kind,
        ref_type=ref_type,
        ref_id=ref_id,
        idempotency_key=idem_key,
        memo=memo,
    )
    actors = {actor_id: currency_repo.actor_by_id(conn, actor_id) for actor_id, _ in aggregated}
    entries = []
    for key in sorted(aggregated, key=lambda item: (item[0], item[1])):
        actor_id, code = key
        delta = aggregated[key]
        actor = actors[actor_id]
        if actor is None:  # pragma: no cover
            raise NotFound("经济主体不存在")
        if delta < 0 and not actor["allow_negative"]:
            balance = Decimal(rows[key]["balance"])
            if balance + delta < 0:
                raise InsufficientFunds(
                    f"{actor['display_name'] or actor_id} 的 {code} 余额不足："
                    f"需要 {-delta}，可用 {balance}"
                )
            after = currency_repo.adjust(conn, actor_id, code, delta)
            if after is None:
                raise InsufficientFunds("余额不足")
        else:
            after = currency_repo.force_adjust(conn, actor_id, code, delta)
        currency_repo.insert_entry(
            conn,
            tx_id=tx["id"],
            actor_id=actor_id,
            currency_code=code,
            delta=delta,
            balance_after=after,
        )
        entries.append(
            {
                "actor_id": actor_id,
                "actor_code": actor["code"],
                "currency_code": code,
                "delta": str(delta),
                "balance_after": str(after),
            }
        )
    return {"tx_id": str(tx["id"]), "kind": kind, "entries": entries, "replayed": False}


def _assert_balanced(conn, aggregated: dict[tuple[str, str], Decimal], balanced_in_q1: bool) -> None:
    values: dict[str, Decimal] = {}
    for (_, code), delta in aggregated.items():
        values[code] = values.get(code, Decimal(0)) + delta
    if balanced_in_q1:
        total = Decimal(0)
        for code, delta in values.items():
            row = currency_repo.currency(conn, code)
            if row is None:
                raise InvalidArgument(f"未知货币 {code}")
            total += delta * Decimal(row["base_value"])
        if abs(total) > Decimal("0.01"):
            raise Unprocessable(f"兑换分录不平：Q1 等值差额 {total}")
        return
    for code, delta in values.items():
        if abs(delta) > Q4:
            raise Unprocessable(f"分录不平：{code} 差额 {delta}")


# ------------------------------------------------------------------ transfers
def transfer(
    conn,
    *,
    from_actor: dict,
    to_actor_id: str,
    currency_code: str,
    amount: Decimal,
    memo: str = "",
    idem_key: str | None = None,
) -> dict:
    currency = currency_repo.currency(conn, currency_code)
    if currency is None:
        raise InvalidArgument(f"未知货币 {currency_code}")
    value = q4(amount)
    if value <= 0:
        raise InvalidArgument("转账金额必须大于 0")
    if int(currency["quality"]) < 4:
        # 决策 1：只有 Q4-Q9 允许玩家间直接转账，Q1-Q3 必须走市场/银行。
        raise InvalidArgument("Q1-Q3 不支持玩家间直接转账，请使用银行兑换或市场")
    if to_actor_id == from_actor["id"]:
        raise InvalidArgument("不能给自己转账")
    if currency_repo.actor_by_id(conn, to_actor_id) is None:
        raise NotFound("收款方不存在")

    tx = post(
        conn,
        kind="transfer",
        moves=[
            Move(from_actor["id"], currency_code, -value),
            Move(to_actor_id, currency_code, value),
        ],
        ref_type="player",
        ref_id=to_actor_id,
        idem_key=idem_key,
        memo=memo,
    )
    currency_repo.insert_transfer(
        conn,
        from_actor_id=from_actor["id"],
        to_actor_id=to_actor_id,
        currency_code=currency_code,
        amount=value,
        memo=memo,
        tx_id=tx["tx_id"],
    )
    return tx


# ------------------------------------------------------------------ exchange
def tier_rate(conn, amount_q1: Decimal) -> Decimal:
    for row in currency_repo.fee_tiers(conn):
        upper = row["max_q1_equiv"]
        if upper is None or amount_q1 <= Decimal(upper):
            return Decimal(row["rate"])
    return Decimal("0.03")


def quote(conn, from_code: str, to_code: str, bank_id: str | None = None) -> dict:
    src = currency_repo.currency(conn, from_code)
    dst = currency_repo.currency(conn, to_code)
    if src is None or dst is None:
        raise InvalidArgument("未知货币")
    if abs(int(src["quality"]) - int(dst["quality"])) != 1:
        raise InvalidArgument("只能相邻品质兑换，跨级需要多步")
    mid = Decimal(dst["base_value"]) / Decimal(src["base_value"])
    spread = Decimal(DOWN_SPREAD_BPS) / Decimal(10_000)
    bank_buy = (mid * (1 - spread)).quantize(Decimal("0.00000001"))
    bank_sell = (mid * (1 + spread)).quantize(Decimal("0.00000001"))
    currency_repo.insert_quote(
        conn,
        from_code=from_code,
        to_code=to_code,
        mid=mid,
        spread_bps=DOWN_SPREAD_BPS,
        bank_buy=bank_buy,
        bank_sell=bank_sell,
        source_bank_id=bank_id,
    )
    return {
        "from_code": from_code,
        "to_code": to_code,
        "mid": str(mid),
        "spread_bps": DOWN_SPREAD_BPS,
        "bank_buy": str(bank_buy),
        "bank_sell": str(bank_sell),
        "expires_in": 60,
    }


def exchange(
    conn,
    *,
    actor: dict,
    from_code: str,
    to_code: str,
    amount: Decimal,
    idem_key: str | None = None,
) -> dict:
    src = currency_repo.currency(conn, from_code)
    dst = currency_repo.currency(conn, to_code)
    if src is None or dst is None:
        raise InvalidArgument("未知货币")
    if int(dst["quality"]) - int(src["quality"]) != 1:
        raise InvalidArgument("只能逐级向上兑换（Qn → Qn+1）")
    value = q4(amount)
    if value <= 0:
        raise InvalidArgument("兑换金额必须大于 0")

    amount_q1 = value * Decimal(src["base_value"])
    fee = q4(value * tier_rate(conn, amount_q1))
    if fee < MIN_FEE:
        raise InvalidArgument("兑换金额过小，手续费不足 0.0001")
    net = value - fee
    out = (net / Decimal("5")).quantize(Q4, rounding=ROUND_DOWN)
    if out <= 0:
        raise InvalidArgument("兑换后金额为 0")

    burn = system_actor(conn, BURN)
    tx = post(
        conn,
        kind="exchange",
        moves=[
            Move(actor["id"], from_code, -value),
            Move(burn["id"], from_code, fee),
            Move(actor["id"], to_code, out),
        ],
        ref_type="exchange",
        ref_id=f"{from_code}->{to_code}",
        idem_key=idem_key,
        memo=f"{value} {from_code} -> {out} {to_code}, fee {fee}",
        balanced_in_q1=True,
    )
    return {
        **tx,
        "from_code": from_code,
        "to_code": to_code,
        "amount": str(value),
        "fee": str(fee),
        "received": str(out),
        "rate": "5:1",
        "effective_q1_cost": str(q4(value * Decimal(src["base_value"]))),
    }


def exchange_down(
    conn,
    *,
    actor: dict,
    from_code: str,
    to_code: str,
    amount: Decimal,
    idem_key: str | None = None,
) -> dict:
    src = currency_repo.currency(conn, from_code)
    dst = currency_repo.currency(conn, to_code)
    if src is None or dst is None:
        raise InvalidArgument("未知货币")
    if int(src["quality"]) - int(dst["quality"]) != 1:
        raise InvalidArgument("只能逐级向下兑换（Qn → Qn-1）")
    value = q4(amount)
    if value <= 0:
        raise InvalidArgument("兑换金额必须大于 0")

    out = (value * Decimal("4.60")).quantize(Q4, rounding=ROUND_DOWN)
    spread = value * Decimal(DOWN_SPREAD_BPS) / Decimal(10_000)
    market = system_actor(conn, MARKET)
    tx = post(
        conn,
        kind="exchange_down",
        moves=[
            Move(actor["id"], from_code, -value),
            Move(market["id"], from_code, spread),
            Move(actor["id"], to_code, out),
        ],
        ref_type="exchange",
        ref_id=f"{from_code}->{to_code}",
        idem_key=idem_key,
        memo=f"{value} {from_code} -> {out} {to_code}, spread {spread}",
        balanced_in_q1=True,
    )
    return {
        **tx,
        "from_code": from_code,
        "to_code": to_code,
        "amount": str(value),
        "received": str(out),
        "spread": str(q4(spread)),
        "rate": "1:4.60",
    }


# ------------------------------------------------------------------ issuance
def issue_daily(
    conn,
    *,
    day,
    active_players: int,
    volume_q1: Decimal = Decimal(0),
    idem_key: str | None = None,
) -> dict:
    """Compute and book one day of Q1 issuance (01 §4.1).

    70% is credited to treasury as the reward budget, 30% to the central bank.
    Paying a player later uses :func:`grant_reward`, which drives treasury
    negative — that negative is the mint (01 §3.2).
    """
    policy = currency_repo.active_policy(conn)
    if policy is None:
        raise Unprocessable("没有生效的发行策略")

    raw = (
        Decimal(active_players) * Decimal(policy["active_weight"])
        + Decimal(volume_q1) * Decimal(policy["volume_factor"])
    )
    history = currency_repo.raw_history(conn, limit=7)
    window = history + [raw]
    moving_average = sum(window) / Decimal(len(window))
    smoothed = Decimal("0.7") * raw + Decimal("0.3") * moving_average
    emitted = min(max(smoothed, Decimal(policy["min_daily"])), Decimal(policy["max_daily"]))
    emitted = q4(emitted)
    reward = q4(emitted * Decimal(policy["reward_share"]))
    reserve = emitted - reward

    treasury = system_actor(conn, TREASURY)
    cb = system_actor(conn, CB)
    tx = post(
        conn,
        kind="issuance",
        moves=[
            Move(treasury["id"], "cc1", -emitted),
            Move(treasury["id"], "cc1", reward),
            Move(cb["id"], "cc1", reserve),
        ],
        ref_type="issuance",
        ref_id=str(day),
        idem_key=idem_key,
        memo=f"day {day}: raw {q4(raw)}, emitted {emitted}, reward {reward}",
    )
    record = currency_repo.issuance_for_day(conn, day)
    if record is None:
        record = currency_repo.record_issuance(
            conn, day=day, raw_amount=q4(raw), emitted_amount=emitted, policy_id=policy["id"]
        )
    return {
        "tx": tx,
        "day": str(day),
        "raw": str(q4(raw)),
        "emitted": str(emitted),
        "reward_budget": str(reward),
        "central_bank_reserve": str(reserve),
        "policy": "0.7*raw + 0.3*MA7",
    }


def grant_reward(
    conn,
    *,
    actor_id: str,
    amount: Decimal,
    ref_type: str,
    ref_id: str | None = None,
    idem_key: str | None = None,
    currency_code: str = "cc1",
) -> dict:
    value = q4(amount)
    if value <= 0:
        raise InvalidArgument("奖励金额必须大于 0")
    treasury = system_actor(conn, TREASURY)
    return post(
        conn,
        kind="reward",
        moves=[
            Move(treasury["id"], currency_code, -value),
            Move(actor_id, currency_code, value),
        ],
        ref_type=ref_type,
        ref_id=ref_id,
        idem_key=idem_key,
        memo="issuance reward",
    )


def entry_count(conn, actor_id: str) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM currency_ledger_entries WHERE actor_id = %s", (actor_id,)
    ).fetchone()
    return int(row["n"])


def as_uuid(value: str) -> str:
    """Validate an external id before it reaches SQL (defensive)."""
    try:
        return str(UUID(value))
    except (ValueError, AttributeError, TypeError) as exc:
        raise InvalidArgument("id 格式不合法") from exc
