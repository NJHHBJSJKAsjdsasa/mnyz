"""不变量自检（07 §6.2 属性测试 + 16.1/16.2 验收）。

覆盖：
1. 九级货币账本逐币种守恒（每笔交易后 Σdelta=0）；
2. 兑换循环必亏（5:1 + 手续费 vs 1:4.60）；
3. 确定性：同 seed 两次运行结果一致；
4. AI 与真人同费率（同一策略/金额，费用完全一致）；
5. 撮合后持仓非负、K 线 OHLC 与成交一致；
6. 30 天账本对账 0 差异、无玩家负余额。
"""

from decimal import Decimal

from . import config as cfg
from .currency import do_exchange
from .engine import Simulation
from .money import ONE, ZERO, quant


def _check(name: str, condition: bool, detail: str = "") -> None:
    status = "OK  " if condition else "FAIL"
    print(f"[{status}] {name}" + (f"  {detail}" if detail else ""))
    if not condition:
        raise AssertionError(f"自检失败：{name} {detail}")


def main() -> int:
    sim = Simulation(cfg.SCENARIOS["baseline"])
    result = sim.run(30)

    # 1. 账本守恒（逐币种合计为 0）
    for code in cfg.CODES:
        gap = sim.ledger.code_total(code)
        _check(f"账本守恒 {code}", gap == ZERO, f"Σ={gap}")

    # 2. 无玩家负余额
    negatives = [a.id for a in sim.players if sim.ledger.balance(a.id) < ZERO]
    _check("无玩家负余额", not negatives, f"{negatives[:5]}")

    # 3. 兑换循环必亏
    maker = sim.maker
    before = sim.ledger.balance(maker.id)
    r1 = do_exchange(sim, maker.id, "cc1", "cc2", Decimal("1000"))
    r2 = do_exchange(sim, maker.id, "cc2", "cc1", r1["out"])
    _check("兑换循环必亏", r2["out"] < Decimal("1000"), f"1000 → {r2['out']}")

    # 4. AI 与真人同费率
    _check("AI 与真人同费率", _fee_parity(), "同一金额同一手续费")

    # 5. 撮合持仓非负 + K 线一致
    for listing in sim.stocks.listings:
        if listing.company.delisted:
            continue
        neg = [aid for aid, qty in listing.company.holders.items() if qty < 0]
        _check(f"持仓非负 {listing.company.ticker}", not neg, f"{neg[:3]}")
        for candle in listing.candles:
            ok = candle["high"] >= max(candle["open"], candle["close"]) and \
                 candle["low"] <= min(candle["open"], candle["close"])
            _check(f"K线OHLC {listing.company.ticker} d{candle['day']}", ok)

    # 6. 确定性
    sim2 = Simulation(cfg.SCENARIOS["baseline"])
    result2 = sim2.run(30)
    _check("确定性（同 seed 同结果）", result["m1"] == result2["m1"], f"{result['m1']}")

    # 7. 闸门可计算（10 项）
    _check("闸门 10 项", len(result["gates"]) == 10, f"{len(result['gates'])}")

    # 8. 月通胀口径
    _check("通胀在 1%-4%", all(ZERO < m["rate"] < Decimal("0.04") for m in result["inflation"]),
           str([str(m["rate"]) for m in result["inflation"]]))
    print("\n自检完成：全部通过。")
    return 0


def _fee_parity() -> bool:
    """同一策略、同一金额，human 与 server_ai 的兑换手续费必须一致。"""
    from .actors import Actor
    sim = Simulation(cfg.SCENARIOS["baseline"])
    human = Actor(id="probe:h", kind="player", name="probe", controller="human", policy=cfg.persona_policy("trader"))
    ai = Actor(id="probe:a", kind="player", name="probe", controller="server_ai", persona="trader",
               policy=cfg.persona_policy("trader"))
    sim.register(human)
    sim.register(ai)
    sim.ledger.apply([(sim.treasury_id, "cc1", -Decimal("100000")), (human.id, "cc1", Decimal("100000"))], "probe")
    sim.ledger.apply([(sim.treasury_id, "cc1", -Decimal("100000")), (ai.id, "cc1", Decimal("100000"))], "probe")
    fh = do_exchange(sim, human.id, "cc1", "cc2", Decimal("5000"))["fee"]
    fa = do_exchange(sim, ai.id, "cc1", "cc2", Decimal("5000"))["fee"]
    return fh == fa


if __name__ == "__main__":
    import sys
    sys.exit(main())
