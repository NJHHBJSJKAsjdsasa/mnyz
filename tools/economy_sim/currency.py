"""九级货币的铸造/销毁与兑换（01 §4、§5）。

兑换是「销毁源货币 + 铸造目标货币」，不是同一账本内的等额转移，
因此必须显式经过 `treasury`（发行方）与 `burn`（销毁方）两个系统账户。
"""

from decimal import Decimal

from . import config as cfg
from .money import ZERO, quant


def tier_rate(amount_q1_equiv: Decimal) -> Decimal:
    """向上兑换的阶梯手续费率（01 §5.2）。"""
    for cap, rate in cfg.EXCHANGE_TIERS:
        if amount_q1_equiv <= cap:
            return rate
    return cfg.EXCHANGE_TOP_RATE


def do_exchange(sim, actor_id: str, src: str, dst: str, amount) -> dict:
    """相邻品质兑换；返回成交明细，供审计/报告使用。"""
    value = quant(amount)
    if value <= ZERO:
        raise ValueError("兑换金额必须为正")
    if abs(cfg.QUALITY[src] - cfg.QUALITY[dst]) != 1:
        raise ValueError("只能相邻品质兑换")
    ledger = sim.ledger
    treasury, burn = sim.treasury_id, sim.burn_id
    q1_equiv = value * cfg.BASE_VALUE[src]
    if cfg.QUALITY[dst] == cfg.QUALITY[src] + 1:
        fee = quant(value * tier_rate(q1_equiv))
        net = value - fee
        out = quant(net / Decimal("5"))           # 相邻品质固定 5:1
        ledger.apply([(actor_id, src, -value), (burn, src, fee), (treasury, src, net),
                      (treasury, dst, -out), (actor_id, dst, out)], "exchange_up")
    else:
        out = quant(value * cfg.DOWN_RATIO)       # 相邻品质固定 1:4.60
        ledger.apply([(actor_id, src, -value), (treasury, src, value),
                      (treasury, dst, -out), (actor_id, dst, out)], "exchange_down")
        fee = ZERO
    sim.stats["exchange_volume_q1"] += q1_equiv
    sim.stats["exchange_fee_burn_q1"] += fee * cfg.BASE_VALUE[src]
    return {"src": src, "dst": dst, "amount": value, "out": out, "fee": fee}


def to_q1(amount, code: str) -> Decimal:
    return quant(Decimal(str(amount)) * cfg.BASE_VALUE[code])


def fund(sim, actor, target_code: str, target_amount) -> Decimal | None:
    """把 cc1 逐级兑换到 target_code，直到持有量 ≥ target_amount；钱不够返回 None。"""
    ledger = sim.ledger
    goal = quant(target_amount)
    if goal <= ZERO:
        return ledger.balance(actor.id, target_code)
    quality = cfg.QUALITY[target_code]
    for _ in range(3):
        have = ledger.balance(actor.id, target_code)
        if have >= goal:
            return have
        need_q1 = (goal - have) * cfg.BASE_VALUE[target_code]
        rate = tier_rate(need_q1)
        budget = quant(need_q1 / (1 - rate) ** (quality - 1) * Decimal("1.03"))
        if ledger.balance(actor.id) < budget:
            return None
        _chain_up(sim, actor.id, quality, budget)
    have = ledger.balance(actor.id, target_code)
    return have if have >= goal else None


def _chain_up(sim, actor_id: str, quality: int, budget: Decimal) -> None:
    code = "cc1"
    amount = budget
    for step in range(2, quality + 1):
        dst = f"cc{step}"
        amount = do_exchange(sim, actor_id, code, dst, amount)["out"]
        code = dst


def m1(sim) -> Decimal:
    """M1 = 公众持有的现金 + 银行存款（存款是玩家余额之外的债权）。"""
    public = sum((sim.ledger.balance(a.id) for a in sim.players), ZERO)
    deposits = sum((b.total_deposits() for b in sim.banks), ZERO)
    return public + deposits


def supply_by_currency(sim) -> dict:
    """各币种的公众持有量（现金 + 存款，只有 cc1 有存款）。"""
    out = {code: ZERO for code in cfg.CODES}
    for actor in sim.players:
        for code in cfg.CODES:
            out[code] += sim.ledger.balance(actor.id, code)
    for bank in sim.banks:
        out["cc1"] += bank.total_deposits()
    return out


def q1_equivalent(sim) -> Decimal:
    """按基准值折算的总货币量，用于基尼/份额等横向比较。"""
    total = ZERO
    for code, amount in supply_by_currency(sim).items():
        total += amount * cfg.BASE_VALUE[code]
    return total
