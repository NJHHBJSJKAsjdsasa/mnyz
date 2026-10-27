"""商品市场（03 §6.4 指数 + 交易税）。

模型：每日结算一次，价格在基准价附近做均值回归的 AR(1) 扰动；
供给与需求按比例撮合，成交量 = min(供给额, 需求额)，价格固定于当日 index。
钱只在玩家之间流动（清算池当日归零），税从成交量里抽走，避免凭空造币。
"""

from decimal import Decimal

from . import config as cfg
from .money import ONE, ZERO, quant, rand_dec


class CommodityMarket:
    def __init__(self, sim) -> None:
        self.sim = sim
        self.price = cfg.AM_PRICE_Q1
        self.index = ONE
        self.volume = ZERO
        self.consumed = ZERO
        self.supply_value = ZERO

    # --- 对外 ---------------------------------------------------------------
    def tick(self, day: int) -> None:
        self._update_price()
        offers = self._offers()
        budgets = self._budgets()
        self._clear(offers, budgets)

    # --- 价格 ---------------------------------------------------------------
    def _update_price(self) -> None:
        shock = rand_dec(self.sim.rng, "-0.015", "0.015")
        drift = (ONE - self.index) * Decimal("0.15")
        self.index = max(Decimal("0.6"), self.index * (ONE + shock + drift))
        self.price = quant(cfg.AM_PRICE_Q1 * self.index)

    # --- 供给 ---------------------------------------------------------------
    def _offers(self):
        offers = []
        total = ZERO
        for actor in self.sim.producers:
            noise = rand_dec(self.sim.rng, "0.85", "1.15")
            output = actor.production * actor.skill * noise * actor.policy.get("income", ONE)
            actor.goods += output
            quantity = actor.goods * cfg.MARKET.sell_ratio
            value = quant(quantity * self.price)
            if value <= ZERO:
                continue
            offers.append((actor, quantity, value))
            total += value
        self.supply_value = total
        return offers

    # --- 需求 ---------------------------------------------------------------
    def _budgets(self):
        """消费预算 = 当日产出价值 × consume 比例（受现金约束），保证成交量不逐日衰减。"""
        budgets = []
        total = ZERO
        for actor in self.sim.producers:
            output_value = actor.production * actor.skill * actor.policy.get("income", ONE) * self.price
            desired = output_value * actor.policy.get("consume", Decimal("0.55"))
            budget = quant(min(desired, self.sim.ledger.balance(actor.id) * Decimal("0.8")))
            if budget <= ZERO:
                continue
            budgets.append((actor, budget))
            total += budget
        return budgets, total

    # --- 撮合 ---------------------------------------------------------------
    def _clear(self, offers, budget_pair) -> None:
        budgets, demand_total = budget_pair
        supply_total = sum((v for _, _, v in offers), ZERO)
        volume = min(supply_total, demand_total)
        if volume <= ZERO or not budgets:
            return
        pool = self.sim.pool_id
        seller_proceeds = self._settle_supply(offers, volume)
        buyer_cost = self._settle_demand(budgets, volume)
        self.volume = volume
        self._collect_tax(pool, buyer_cost, seller_proceeds)

    def _settle_supply(self, offers, volume):
        ledger = self.sim.ledger
        total = sum((v for _, _, v in offers), ZERO)
        proceeds = ZERO
        for actor, quantity, value in offers:
            share = value / total
            sold = quantity * share * (volume / total)
            amount = quant(volume * share * (ONE - cfg.MARKET.commodity_tax / 2))
            actor.goods = max(ZERO, actor.goods - sold)
            if amount <= ZERO:
                continue
            ledger.transfer(self.sim.pool_id, actor.id, "cc1", amount, "commodity_sell")
            actor.last_income = amount
            self.sim.record_volume(actor.id, amount)
            proceeds += amount
        return proceeds

    def _settle_demand(self, budgets, volume):
        ledger = self.sim.ledger
        total = sum((b for _, b in budgets), ZERO)
        cost = ZERO
        for actor, budget in budgets:
            share = budget / total
            amount = quant(volume * share * (ONE + cfg.MARKET.commodity_tax / 2))
            amount = min(amount, ledger.balance(actor.id))
            if amount <= ZERO:
                continue
            bought = amount / max(self.price, ONE)
            self.consumed += bought
            ledger.transfer(actor.id, self.sim.pool_id, "cc1", amount, "commodity_buy")
            self.sim.record_volume(actor.id, amount)
            cost += amount
        return cost

    def _collect_tax(self, pool, cost, proceeds):
        """清算池当日必归零：收到的差额即交易税，按 03 §6.3 平分给议会基金与星区。"""
        tax = self.sim.ledger.balance(pool)
        if tax <= ZERO:
            return
        half = quant(tax / 2)
        self.sim.ledger.transfer(pool, self.sim.council_id, "cc1", half, "commodity_tax")
        self.sim.ledger.transfer(pool, self.sim.sector_id, "cc1", tax - half, "commodity_tax")
        self.sim.stats["commodity_tax"] += tax
