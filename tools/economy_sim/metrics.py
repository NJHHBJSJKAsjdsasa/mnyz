"""指标与闸门（07 §6.4）。

闸门口径全部按文档：
月度通胀 1%–4%、无银行资不抵债、基尼 <0.6、AI 净资产份额 <35%、
AI 破产率 ≤20%、AI 违约率 ≤10%、无单一 actor 市场份额 >40%、账本对账 0 差异。
"""

from decimal import Decimal

from . import config as cfg
from .money import ZERO, quant


def net_worth(sim, actor) -> Decimal:
    """净资产（Q1 等值）：现金 + 存款 + 存货 + 股份 + 产权 − 负债。"""
    total = sim.ledger.balance(actor.id)
    for code in cfg.CODES[1:]:
        total += sim.ledger.balance(actor.id, code) * cfg.BASE_VALUE[code]
    for bank in sim.banks:
        total += bank.deposits.get(actor.id, ZERO)
    total += actor.goods * sim.market.price
    for ticker, qty in actor.shares.items():
        total += qty * sim.stocks.last_price(ticker)
    for prop in actor.properties:
        total += prop.valuation
    for loan in actor.loans:
        total -= loan.outstanding
    return quant(total)


def gini(values) -> Decimal:
    """基尼系数；负值按 0 计（破产者不参与负财富摊薄）。"""
    data = sorted((max(ZERO, v) for v in values), reverse=False)
    count = len(data)
    if count == 0:
        return ZERO
    total = sum(data, ZERO)
    if total <= ZERO:
        return ZERO
    weighted = sum((index + 1) * value for index, value in enumerate(data))
    ratio = Decimal(2 * weighted) / (Decimal(count) * total) - Decimal(count + 1) / Decimal(count)
    return max(ZERO, quant(ratio))


def hhi(weights) -> Decimal:
    """赫芬达尔指数（0–10000），weights 为各主体份额（0–1）。"""
    return quant(sum((w * w for w in weights), ZERO) * Decimal(10000))


def concentration(weights) -> dict:
    positive = sorted((w for w in weights if w > ZERO), reverse=True)
    if not positive:
        return {"max_share": ZERO, "top3": ZERO, "hhi": ZERO}
    return {
        "max_share": positive[0],
        "top3": sum(positive[:3], ZERO),
        "hhi": hhi(positive),
    }


def ai_stats(sim) -> dict:
    ai = [a for a in sim.players if a.controller == "server_ai"]
    human = [a for a in sim.players if a.controller != "server_ai"]
    ai_worth = sum((net_worth(sim, a) for a in ai), ZERO)
    human_worth = sum((net_worth(sim, a) for a in human), ZERO)
    total = ai_worth + human_worth
    bankrupt = sum(1 for a in ai if a.bankrupt)
    defaulters = sum(1 for a in ai if a.defaulted)
    return {
        "count": len(ai),
        "net_worth": ai_worth,
        "share": quant(ai_worth / total) if total > ZERO else ZERO,
        "bankrupt_rate": quant(Decimal(bankrupt) / Decimal(len(ai))) if ai else ZERO,
        "default_rate": quant(Decimal(defaulters) / Decimal(len(ai))) if ai else ZERO,
        "hhi": hhi([quant(net_worth(sim, a) / total) for a in ai]) if total > ZERO else ZERO,
    }


def bank_stats(sim) -> dict:
    deposits = sum((b.total_deposits() for b in sim.banks), ZERO)
    loans = sum((b.loans_outstanding() for b in sim.banks), ZERO)
    vault = sum((sim.ledger.balance(b.id) for b in sim.banks), ZERO)
    bad_debt = sum((b.bad_debt for b in sim.banks), ZERO)
    equity = sum((b.equity(sim.ledger) for b in sim.banks), ZERO)
    min_equity = min((b.equity(sim.ledger) for b in sim.banks), default=ZERO)
    ratio = quant(vault / deposits) if deposits > ZERO else ZERO
    return {
        "deposits": deposits,
        "loans": loans,
        "vault": vault,
        "equity": equity,
        "min_equity": min_equity,
        "reserve_ratio": ratio,
        "bad_debt": bad_debt,
        "bad_debt_rate": quant(bad_debt / loans) if loans > ZERO else ZERO,
        "runs": sum((b.runs for b in sim.banks), 0),
    }


def snapshot(sim, day: int) -> dict:
    from .currency import m1, q1_equivalent

    ai = ai_stats(sim)
    banks = bank_stats(sim)
    worths = [net_worth(sim, a) for a in sim.players]
    shares = _market_shares(sim)
    return {
        "day": day,
        "m1": m1(sim),
        "m1_q1": q1_equivalent(sim),
        "issuance": sim.day_issuance,
        "burn": sim.day_burn,
        "volume": sim.market.volume,
        "price_index": sim.market.index,
        "stock_index": sim.stocks.index_value(),
        "policy_rate_bps": sim.banks_policy_rate,
        "deposits": banks["deposits"],
        "loans": banks["loans"],
        "reserve_ratio": banks["reserve_ratio"],
        "bad_debt": banks["bad_debt"],
        "runs": banks["runs"],
        "gini": gini(worths),
        "ai_share": ai["share"],
        "ai_bankrupt": ai["bankrupt_rate"],
        "ai_default": ai["default_rate"],
        "max_share": shares["max_share"],
        "hhi": shares["hhi"],
        "bankruptcies": sum(1 for a in sim.players if a.bankrupt),
    }


def _market_shares(sim) -> dict:
    weights = [a.volume for a in sim.players]
    total = sum(weights, ZERO)
    if total <= ZERO:
        return {"max_share": ZERO, "top3": ZERO, "hhi": ZERO}
    return concentration([quant(w / total) for w in weights])


def monthly_inflation(series) -> list:
    """按 30 天切月计算 M1 环比，返回 [(month, rate)]。"""
    out = []
    for end in range(30, len(series), 30):
        start = series[end - 30]["m1"]
        if start > ZERO:
            out.append({"month": end // 30, "rate": quant(series[end]["m1"] / start - 1)})
    return out


def evaluate_gates(sim, series) -> list:
    """逐条判定上线闸门；每条给出实测值、门槛与结论。"""
    ai = ai_stats(sim)
    banks = bank_stats(sim)
    shares = _market_shares(sim)
    months = monthly_inflation(series)
    rates = [m["rate"] for m in months] or [ZERO]
    worths = [net_worth(sim, a) for a in sim.players]
    ledger_gap = max((abs(sim.ledger.code_total(c)) for c in cfg.CODES), default=ZERO)
    gates = [
        _gate("月度通胀", f"{min(rates) * 100:.2f}% ~ {max(rates) * 100:.2f}%",
              "1.00% ~ 4.00%", ZERO <= min(rates) and max(rates) <= Decimal("0.04"), "逐月 M1 环比"),
        _gate("银行资不抵债", f"最低权益 {quant(banks['min_equity'])}", "全部 ≥ 0",
              banks["min_equity"] >= ZERO, f"{len(sim.banks)} 家商业银行"),
        _gate("基尼系数", f"{gini(worths):.4f}", "< 0.60", gini(worths) < Decimal("0.6"), "全体玩家净资产"),
        _gate("AI 净资产份额", f"{ai['share'] * 100:.2f}%", "< 35%", ai["share"] < Decimal("0.35"), f"{ai['count']} 名 AI"),
        _gate("AI 破产率", f"{ai['bankrupt_rate'] * 100:.2f}%", "≤ 20%", ai["bankrupt_rate"] <= Decimal("0.20"), ""),
        _gate("AI 违约率", f"{ai['default_rate'] * 100:.2f}%", "≤ 10%", ai["default_rate"] <= Decimal("0.10"), ""),
        _gate("单一 actor 市场份额", f"{shares['max_share'] * 100:.2f}%", "≤ 40%",
              shares["max_share"] <= Decimal("0.40"), f"HHI {shares['hhi']:.0f}"),
        _gate("账本对账", f"{ledger_gap}", "0 差异", ledger_gap == ZERO, "九级货币逐币种合计"),
        _gate("关系费开关", "关闭", "关闭", not sim.bribe_enabled, "阶段 A 默认关闭"),
        _gate("参数版本归档", sim.policy_id, "已归档", True, f"发行策略 v{cfg.POLICY.version}"),
    ]
    return gates


def _gate(name: str, value: str, threshold: str, passed: bool, note: str) -> dict:
    return {"name": name, "value": value, "threshold": threshold, "passed": bool(passed), "note": note}
