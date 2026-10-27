"""模拟引擎：日循环编排（发行 → 商品 → 银行 → 股票 → 产权 → 月末政策）。"""

import random
from collections import defaultdict
from dataclasses import asdict
from decimal import Decimal

from . import config as cfg
from . import metrics, world
from .banking import BankingSystem
from .currency import fund
from .ledger import Ledger
from .market import CommodityMarket
from .money import ONE, ZERO, clamp, dec, quant
from .property import PropertyMarket
from .stocks import StockMarket


class Simulation:
    def __init__(self, scenario, policy_rate_bps: int | None = None) -> None:
        self.sc = scenario
        self.rng = random.Random(scenario.seed)
        self.ledger = Ledger()
        self.players: list = []
        self.humans: list = []
        self.ais: list = []
        self.banks: list = []
        self.maker = None
        self._actors: dict = {}
        self.stats = defaultdict(lambda: ZERO)
        self.series: list = []
        self.raw_history: list = []
        self.banks_policy_rate = policy_rate_bps or cfg.BANK.policy_rate_bps
        self.bribe_enabled = False
        self.policy_id = cfg.policy_id()
        self.day_issuance = ZERO
        self.day_burn = ZERO
        self.prev_volume = ZERO
        self.market = CommodityMarket(self)
        self.banking = BankingSystem(self)
        self.stocks = StockMarket(self)
        self.property = PropertyMarket(self)
        self.treasury_id = "treasury"
        self.burn_id = "burn"
        self.pool_id = "pool"
        self.council_id = "council_fund"
        self.sector_id = "sector_sovereign"
        self.insurance_id = "insurance"
        world.build(self)

    # --- 注册与查询 ---------------------------------------------------------
    def register(self, actor) -> None:
        self._actors[actor.id] = actor
        guarded = actor.kind in ("player", "company") or (actor.kind == "bank" and not actor.id.endswith(":credit"))
        if guarded:
            self.ledger.guarded.add(actor.id)

    def actor(self, actor_id: str):
        return self._actors.get(actor_id)

    @property
    def producers(self) -> list:
        """当日仍参与生产与消费的主体（破产者退出循环）。"""
        return [actor for actor in self.players if not actor.bankrupt]

    def net_worth(self, actor) -> Decimal:
        return metrics.net_worth(self, actor)

    def fund_cc5(self, actor, amount):
        return fund(self, actor, "cc5", amount)

    def book_shares(self, actor_id: str, ticker: str, delta: int) -> None:
        actor = self.actor(actor_id)
        if actor is None:
            return
        actor.shares[ticker] = max(0, actor.shares.get(ticker, 0) + delta)
        listing = self.stocks.by_ticker.get(ticker)
        if listing is not None and delta != 0:
            listing.company.holders[actor_id] = max(0, listing.company.holders.get(actor_id, 0) + delta)

    def record_volume(self, actor_id: str, amount: Decimal) -> None:
        actor = self.actor(actor_id)
        if actor is not None:
            actor.volume += amount

    # --- 主循环 -------------------------------------------------------------
    def run(self, days: int | None = None) -> dict:
        total = days or self.sc.days
        self.series = [metrics.snapshot(self, 0)]
        for day in range(1, total + 1):
            self.tick(day)
            self.series.append(metrics.snapshot(self, day))
        return self.result(total)

    def tick(self, day: int) -> None:
        burn_mark = self.ledger.balance(self.burn_id)
        self.market.tick(day)
        self._issue(day)
        self._fiscal()
        self.banking.tick(day)
        self.banking.maybe_run(day)
        self._fund_wallets(day)
        self.stocks.tick(day)
        self.property.tick(day)
        self._growth()
        if day % 30 == 0:
            self._monthly(day)
        self.day_burn = self.ledger.balance(self.burn_id) - burn_mark
        self.prev_volume = self.market.volume

    # --- 发行（01 §4.1）-----------------------------------------------------
    def _issue(self, day: int) -> None:
        policy = cfg.POLICY
        active = dec(len(self.players))
        raw = active * policy.active_weight + self.prev_volume * policy.volume_factor
        self.raw_history.append(raw)
        window = self.raw_history[-7:]
        average = sum(window, ZERO) / dec(len(window))
        smoothed = policy.smoothing * raw + (ONE - policy.smoothing) * average
        issued = clamp(smoothed, policy.min_daily, policy.max_daily)
        reward = quant(issued * policy.reward_share)
        weights = {}
        for actor in self.players:
            base = actor.last_income if actor.last_income > ZERO else actor.production * self.market.price * Decimal("0.3")
            weights[actor.id] = max(base, Decimal("0.0001"))
        self._distribute(reward, weights, "issuance")
        self.day_issuance = reward
        self.stats["issuance"] += reward

    def _fiscal(self) -> None:
        """议会把当日税入的 80% 以公共建设形式返还给玩家，避免税收单向抽干 M1。"""
        balance = self.ledger.balance(self.council_id)
        spend = quant(balance * Decimal("0.8"))
        if spend <= ZERO:
            return
        weights = {a.id: max(a.last_income, Decimal("0.0001")) for a in self.players}
        self._distribute(spend, weights, "public_spending", src=self.council_id)
        self.stats["public_spending"] += spend

    def _distribute(self, amount: Decimal, weights: dict, kind: str, src: str = "treasury") -> None:
        total = sum(weights.values(), ZERO)
        if total <= ZERO or amount <= ZERO:
            return
        items = sorted(weights.items())
        entries, given = [], ZERO
        for index, (actor_id, weight) in enumerate(items):
            if index == len(items) - 1:
                share = amount - given
            else:
                share = quant(amount * weight / total)
            given += share
            if share > ZERO:
                entries.append((src, "cc1", -share))
                entries.append((actor_id, "cc1", share))
        if entries:
            self.ledger.apply(entries, kind)

    # --- 月末政策 -----------------------------------------------------------
    def _monthly(self, day: int) -> None:
        rate = self._inflation_30d(day)
        step = cfg.BANK.penalty_bps
        if rate > Decimal("0.03"):
            self.banks_policy_rate = min(1500, self.banks_policy_rate + step)
        elif rate < Decimal("0.01"):
            self.banks_policy_rate = max(0, self.banks_policy_rate - step)
        self.stats["policy_rate_end"] = dec(self.banks_policy_rate)
        self.property.monthly_tax()
        self._insurance_premium()

    def _inflation_30d(self, day: int) -> Decimal:
        if day < 30 or len(self.series) <= day - 30:
            return ZERO
        before = self.series[day - 30]["m1"]
        now = self.series[day - 1]["m1"]
        return quant(now / before - ONE) if before > ZERO else ZERO

    def _insurance_premium(self) -> None:
        rate = Decimal(cfg.BANK.insurance_bps) / Decimal(10000)
        for bank in self.banks:
            premium = quant(bank.total_deposits() * rate)
            if premium <= ZERO or self.ledger.balance(bank.id) < premium:
                continue
            self.ledger.transfer(bank.id, self.insurance_id, "cc1", premium, "insurance")
            self.stats["insurance_premium"] += premium

    # --- 股票钱包与增长 -----------------------------------------------------
    def _fund_wallets(self, day: int) -> None:
        if day % 5 != 0:
            return
        for actor in self.players:
            if actor.policy.get("stock", ZERO) < Decimal("0.3") or actor.bankrupt:
                continue
            if self.ledger.balance(actor.id, "cc4") > Decimal("50"):
                continue
            cash = self.ledger.balance(actor.id)
            if cash < Decimal("20000"):
                continue
            fund(self, actor, "cc4", quant(cash * Decimal("0.06") / cfg.BASE_VALUE["cc4"]))

    def _growth(self) -> None:
        for actor in self.players:
            if actor.persona == "industrialist":
                actor.production *= ONE + Decimal("0.002")

    # --- 结果 ---------------------------------------------------------------
    def result(self, days: int) -> dict:
        return {
            "scenario": asdict(self.sc),
            "days": days,
            "policy_id": self.policy_id,
            "series": self.series,
            "gates": metrics.evaluate_gates(self, self.series),
            "inflation": metrics.monthly_inflation(self.series),
            "ai": metrics.ai_stats(self),
            "bank": metrics.bank_stats(self),
            "stats": {key: str(value) for key, value in self.stats.items()},
            "m1": self.series[-1]["m1"],
            "burn_total": self.ledger.balance(self.burn_id),
            "tx": self.ledger.tx_total(),
        }
