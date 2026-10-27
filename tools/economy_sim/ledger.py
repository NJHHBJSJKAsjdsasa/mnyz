"""双分录货币账本（01-currency.md §3.2）。

约定：
- 每个 `(actor_id, code)` 一个余额；对玩家/公司强制非负，对国库/银行/交易所允许为负；
- 每笔 `apply` 在**每个币种**内 delta 之和必须为 0（九级货币单位不同，不能跨币种合计）；
- 手续费/销毁用 `burn` 系统账户对冲，发行与兑换的铸币/销币用 `treasury` 系统账户对冲。
"""

from collections import Counter, defaultdict
from decimal import Decimal

from .money import ZERO, quant


class LedgerError(RuntimeError):
    """账本不平或账户被透支。"""


class InsufficientFunds(LedgerError):
    """玩家/公司余额不足。"""


class Ledger:
    def __init__(self) -> None:
        self._bal: dict[tuple[str, str], Decimal] = {}
        self.guarded: set[str] = set()
        self.tx_by_kind: Counter = Counter()
        self.tx_by_code: Counter = Counter()

    # --- 读 -----------------------------------------------------------------
    def balance(self, actor_id: str, code: str = "cc1") -> Decimal:
        return self._bal.get((actor_id, code), ZERO)

    def all_balances(self) -> dict[tuple[str, str], Decimal]:
        return dict(self._bal)

    def code_total(self, code: str) -> Decimal:
        """单币种全账户合计，恒为 0（对账口径，07 §6.4）。"""
        return sum((v for (_, c), v in self._bal.items() if c == code), ZERO)

    def tx_total(self) -> int:
        return sum(self.tx_by_kind.values())

    # --- 写 -----------------------------------------------------------------
    def apply(self, entries, kind: str = "transfer") -> None:
        net: dict[tuple[str, str], Decimal] = defaultdict(lambda: ZERO)
        for actor_id, code, delta in entries:
            net[(actor_id, code)] += delta
        by_code: dict[str, Decimal] = defaultdict(lambda: ZERO)
        for (_, code), delta in net.items():
            by_code[code] += delta
        bad = {c: s for c, s in by_code.items() if s != ZERO}
        if bad:
            raise LedgerError(f"{kind}: 分录不平 {bad}")
        for key, delta in net.items():
            if key[0] in self.guarded and self.balance(*key) + delta < ZERO:
                raise InsufficientFunds(f"{key[0]} 余额不足：{self.balance(*key)} + {delta}")
        for key, delta in net.items():
            self._bal[key] = self.balance(*key) + delta
            self.tx_by_code[key[1]] += 1
        self.tx_by_kind[kind] += 1

    def transfer(self, src: str, dst: str, code: str, amount, kind: str = "transfer") -> Decimal:
        """等额转账，返回实际入账金额（已按最小单位取整）。"""
        value = quant(amount)
        if value <= ZERO:
            return ZERO
        self.apply([(src, code, -value), (dst, code, value)], kind)
        return value

    def transfer_with_fee(self, src: str, dst: str, fee_to: str, code: str, gross, fee,
                          kind: str = "trade") -> tuple[Decimal, Decimal]:
        """gross 从 src 扣除，fee 进 fee_to，其余进 dst；三者精确闭合。"""
        total = quant(gross)
        if total <= ZERO:
            return ZERO, ZERO
        charge = min(quant(fee), total)
        net = total - charge
        self.apply([(src, code, -total), (dst, code, net), (fee_to, code, charge)], kind)
        return net, charge
