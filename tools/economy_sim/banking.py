"""宇宙银行（02）：活期计息、贷款、准备金、挤兑、坏账。

账务口径：
- 银行 `id` 账户 = 库存现金（vault，非负）；
- 银行 `<id>:credit` 账户 = 放贷创造的货币（允许为负，与 vault 一起构成权益）；
- 存款是玩家在银行的金库托管 + 一条债权记录，提现时金库现金回到玩家账户；
- 权益 = vault + 未偿贷款 + credit − 央行拆借。
"""

from dataclasses import dataclass, field
from decimal import Decimal

from . import config as cfg
from .money import ONE, ZERO, quant, rand_dec
from .metrics import net_worth


@dataclass
class Loan:
    loan_id: str
    bank_id: str
    borrower_id: str
    principal: Decimal
    outstanding: Decimal
    rate_bps: int
    term_days: int
    opened_day: int
    due_day: int
    collateral_value: Decimal = ZERO
    overdue_days: int = 0
    status: str = "active"
    interest_paid: Decimal = ZERO

    @property
    def daily_rate(self) -> Decimal:
        return Decimal(self.rate_bps) / Decimal(10000) / Decimal(365)


@dataclass
class Bank:
    id: str
    name: str
    kind: str = "commercial"
    owner_id: str = ""
    deposits: dict = field(default_factory=dict)
    loans: list = field(default_factory=list)
    borrowed: Decimal = ZERO
    bad_debt: Decimal = ZERO
    runs: int = 0
    interest_income: Decimal = ZERO
    interest_expense: Decimal = ZERO
    refinances: int = 0

    @property
    def credit_id(self) -> str:
        return f"{self.id}:credit"

    def total_deposits(self) -> Decimal:
        return sum(self.deposits.values(), ZERO)

    def loans_outstanding(self) -> Decimal:
        return sum((loan.outstanding for loan in self.loans if loan.status == "active"), ZERO)

    def required_reserve(self) -> Decimal:
        return quant(self.total_deposits() * cfg.BANK.reserve_ratio)

    def equity(self, ledger) -> Decimal:
        return (ledger.balance(self.id) + self.loans_outstanding()
                + ledger.balance(self.credit_id) - self.borrowed)

    def capacity(self) -> Decimal:
        """可新增放贷额度：存款 × (1−准备金率) − 已放贷。"""
        return max(ZERO, self.total_deposits() * (ONE - cfg.BANK.reserve_ratio) - self.loans_outstanding())


class BankingSystem:
    def __init__(self, sim) -> None:
        self.sim = sim
        self.all_loans: list = []

    # --- 日循环 -------------------------------------------------------------
    def tick(self, day: int) -> None:
        self._pay_deposit_interest()
        self._service_loans(day)
        self._originate(day)
        self._weekly_deposits(day)
        self._ensure_liquidity()

    def _weekly_deposits(self, day: int) -> None:
        """已开户玩家每周把现金的一小部分转存，模拟持续吸储。"""
        if day % 7 != 0:
            return
        for actor in self.sim.players:
            bank = next((b for b in self.sim.banks if b.id == actor.bank_id), None)
            if bank is None:
                continue
            amount = quant(self.sim.ledger.balance(actor.id) * Decimal("0.06"))
            if amount > ZERO and self.sim.ledger.balance(actor.id) >= amount:
                self.sim.ledger.apply([(actor.id, "cc1", -amount), (bank.id, "cc1", amount)], "deposit")
                bank.deposits[actor.id] = bank.deposits.get(actor.id, ZERO) + amount

    def open_account(self, actor, bank: Bank, amount) -> None:
        value = quant(amount)
        if value <= ZERO:
            return
        self.sim.ledger.apply([(actor.id, "cc1", -value), (bank.id, "cc1", value)], "deposit")
        bank.deposits[actor.id] = bank.deposits.get(actor.id, ZERO) + value
        actor.bank_id = bank.id

    def withdraw(self, actor, bank: Bank, amount) -> Decimal:
        claim = bank.deposits.get(actor.id, ZERO)
        value = min(quant(amount), claim, self.sim.ledger.balance(bank.id))
        if value <= ZERO:
            return ZERO
        self.sim.ledger.apply([(bank.id, "cc1", -value), (actor.id, "cc1", value)], "withdraw")
        bank.deposits[actor.id] = claim - value
        return value

    # --- 利息 ---------------------------------------------------------------
    def _pay_deposit_interest(self) -> None:
        rate = self.deposit_rate() / Decimal(365)
        for bank in self.sim.banks:
            total = ZERO
            for actor_id, claim in list(bank.deposits.items()):
                interest = quant(claim * rate)
                if interest <= ZERO:
                    continue
                self.sim.ledger.apply([(bank.credit_id, "cc1", -interest), (actor_id, "cc1", interest)],
                                      "deposit_interest")
                total += interest
            bank.interest_expense += total

    def deposit_rate(self) -> Decimal:
        bps = max(0, self.sim.banks_policy_rate + cfg.BANK.demand_spread_bps)
        return Decimal(bps) / Decimal(10000)

    def loan_rate(self) -> int:
        return self.sim.banks_policy_rate + cfg.BANK.loan_spread_bps + cfg.BANK.risk_premium_bps

    # --- 贷款服务 -----------------------------------------------------------
    def _service_loans(self, day: int) -> None:
        for bank in self.sim.banks:
            for loan in list(bank.loans):
                if loan.status != "active":
                    continue
                self._accrue(loan, bank, day)

    def _accrue(self, loan: Loan, bank: Bank, day: int) -> None:
        borrower = self.sim.actor(loan.borrower_id)
        interest = quant(loan.outstanding * loan.daily_rate)
        scheduled = quant(loan.principal / Decimal(loan.term_days))
        due = interest + scheduled
        paid = self._pay(borrower, bank, due)
        if paid < due:
            loan.overdue_days += 1
            loan.outstanding += interest - min(paid, interest)
        else:
            loan.outstanding = max(ZERO, loan.outstanding - scheduled)
            loan.interest_paid += interest
            bank.interest_income += interest
            loan.overdue_days = 0
        if loan.overdue_days >= cfg.BANK.penalty_days:
            penalty = quant(loan.outstanding * Decimal(cfg.BANK.penalty_bps) / Decimal(10000) / Decimal(365))
            loan.outstanding += penalty
        if loan.outstanding <= ZERO:
            loan.status = "repaid"
        elif loan.overdue_days >= cfg.BANK.default_days:
            self._liquidate(loan, bank, borrower)
        elif day >= loan.due_day and loan.overdue_days == 0:
            loan.overdue_days = 1

    def _pay(self, borrower, bank: Bank, amount: Decimal) -> Decimal:
        available = self.sim.ledger.balance(borrower.id)
        value = min(quant(amount), available)
        if value <= ZERO:
            return ZERO
        self.sim.ledger.transfer(borrower.id, bank.id, "cc1", value, "loan_service")
        return value

    def _liquidate(self, loan: Loan, bank: Bank, borrower) -> None:
        """逾期 7 天：处置抵押品，不足部分记坏账（02 §4.4）。"""
        recovered = self._sell_collateral(borrower, loan.outstanding)
        recovered += self._pay(borrower, bank, loan.outstanding - recovered)
        remaining = loan.outstanding - recovered
        if remaining > ZERO:
            bank.bad_debt += remaining
            borrower.defaulted = True
            self.sim.stats["bad_debt"] += remaining
        loan.outstanding = ZERO
        loan.status = "defaulted" if remaining > ZERO else "liquidated"
        if net_worth(self.sim, borrower) < ZERO and not borrower.bankrupt:
            borrower.bankrupt = True
            self.sim.stats["bankruptcies"] += 1

    def _sell_collateral(self, borrower, needed: Decimal) -> Decimal:
        """按 0.9/0.85 折价把股份和产权变现，买家是公共清算账户（treasury）。"""
        treasury = self.sim.treasury_id
        raised = ZERO
        for ticker, qty in list(borrower.shares.items()):
            if raised >= needed or qty <= 0:
                continue
            price = self.sim.stocks.last_price(ticker) * Decimal("0.9")
            chunk = min(qty, int((needed - raised) / max(price, ONE)) + 1)
            amount = quant(price * Decimal(chunk))
            self.sim.ledger.apply([(treasury, "cc1", -amount), (borrower.id, "cc1", amount)], "collateral_sale")
            borrower.shares[ticker] = qty - chunk
            self.sim.stocks.transfer_shares(borrower.id, treasury, ticker, chunk)
            raised += amount
        for prop in list(borrower.properties):
            if raised >= needed:
                break
            amount = quant(prop.valuation * Decimal("0.85"))
            self.sim.ledger.apply([(treasury, "cc1", -amount), (borrower.id, "cc1", amount)], "collateral_sale")
            self.sim.property.repossess(prop, treasury)
            raised += amount
        return raised

    # --- 放贷 ---------------------------------------------------------------
    def _originate(self, day: int) -> None:
        if day % 7 != 0:
            return
        for actor in self.sim.players:
            if actor.bankrupt or actor.policy.get("borrow", ZERO) < Decimal("0.25"):
                continue
            if any(loan.status == "active" for loan in actor.loans if loan.overdue_days > 0):
                continue
            self._try_loan(actor, day)

    def _try_loan(self, actor, day: int) -> None:
        worth = net_worth(self.sim, actor)
        if worth <= ZERO:
            return
        if any(loan.status == "active" for loan in actor.loans):
            return  # 一次只持有一笔在贷，避免同一借款人重复叠加信贷
        term = 90
        income = actor.production * actor.skill * actor.policy.get("income", ONE) * self.sim.market.price
        debt_cap = income * Decimal("0.20") * Decimal(term)          # 偿债能力：20% 收入 × 期限
        collateral = self._collateral_value(actor)                     # 抵押品价值
        rate_factor = max(ZERO, ONE - (self.loan_rate() - 400) / Decimal(1000))  # 利率越高越少借
        want = min(debt_cap, collateral, worth * actor.policy["borrow"] * Decimal("0.25"),
                   worth * cfg.BANK.max_loan_share) * rate_factor
        for bank in sorted(self.sim.banks, key=lambda b: -b.capacity()):
            amount = min(quant(want), bank.capacity(), self.sim.ledger.balance(bank.id) * 4)
            if amount < Decimal("500"):
                continue
            self._disburse(bank, actor, amount, income, term, day)
            return

    def _collateral_value(self, actor) -> Decimal:
        """抵押品价值：现金/存款 50%、股票 50%、行星 40%（02 §4.1）。"""
        value = self.sim.ledger.balance(actor.id) * cfg.BANK.ltv_cash
        for bank in self.sim.banks:
            value += bank.deposits.get(actor.id, ZERO) * cfg.BANK.ltv_cash
        for ticker, qty in actor.shares.items():
            value += qty * self.sim.stocks.last_price(ticker) * cfg.BASE_VALUE["cc4"] * cfg.BANK.ltv_stock
        for prop in actor.properties:
            value += prop.valuation * cfg.BANK.ltv_planet
        return value

    def _disburse(self, bank: Bank, actor, amount: Decimal, income: Decimal, term: int, day: int) -> None:
        loan = Loan(loan_id=f"L{day}-{len(self.all_loans) + 1}", bank_id=bank.id, borrower_id=actor.id,
                    principal=amount, outstanding=amount, rate_bps=self.loan_rate(), term_days=term,
                    opened_day=day, due_day=day + term)
        self.sim.ledger.apply([(bank.credit_id, "cc1", -amount), (actor.id, "cc1", amount)], "loan_issue")
        bank.loans.append(loan)
        actor.loans.append(loan)
        self.all_loans.append(loan)
        self.sim.stats["loans_issued"] += 1
        self.sim.stats["loan_principal"] += amount
        growth = min(Decimal("0.5"), (amount / max(income * Decimal(term), ONE)) * Decimal("0.25"))
        actor.production *= ONE + growth

    # --- 流动性 -------------------------------------------------------------
    def _ensure_liquidity(self) -> None:
        for bank in self.sim.banks:
            gap = bank.required_reserve() - self.sim.ledger.balance(bank.id)
            if gap <= ZERO:
                continue
            self.refinance(bank, quant(gap + bank.required_reserve() * Decimal("0.05")))

    def refinance(self, bank: Bank, amount: Decimal) -> None:
        value = quant(amount)
        if value <= ZERO:
            return
        self.sim.ledger.apply([(self.sim.treasury_id, "cc1", -value), (bank.id, "cc1", value)], "refinance")
        bank.borrowed += value
        bank.refinances += 1
        self.sim.stats["refinance"] += value

    def maybe_run(self, day: int) -> None:
        """挤兑：24h 提现 > 存款 30% 触发（02 §5.2）。"""
        for bank in self.sim.banks:
            if rand_dec(self.sim.rng, "0", "1") > Decimal("0.004"):
                continue
            self._run(bank, day)

    def _run(self, bank: Bank, day: int) -> None:
        bank.runs += 1
        self.sim.stats["bank_runs"] += 1
        for actor_id, claim in list(bank.deposits.items()):
            take = quant(claim * Decimal("0.4"))
            if take <= ZERO:
                continue
            if self.sim.ledger.balance(bank.id) < take:
                self.refinance(bank, take * 2)
            actor = self.sim.actor(actor_id)
            self.withdraw(actor, bank, take)
