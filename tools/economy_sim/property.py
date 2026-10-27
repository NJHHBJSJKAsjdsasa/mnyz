"""行星与产权（04）：估值、挂牌、成交、持有税。

估值沿用 04 §7.5 的连乘公式；成交以 cc5 计价（准入门槛 Q5），
买方需要经银行逐级兑换，手续费全额燃烧，这是高阶货币的主要回收口。
"""

from dataclasses import dataclass, field
from decimal import Decimal

from . import config as cfg
from .money import ONE, ZERO, quant, rand_dec


@dataclass
class Property:
    asset_key: str
    kind: str
    owner_id: str
    base: Decimal
    resource_score: Decimal
    development: Decimal
    traffic: Decimal
    valuation: Decimal
    ask: Decimal = ZERO
    status: str = "owned"
    deed_no: str = ""
    price_paid: Decimal = ZERO
    sales: int = 0


class PropertyMarket:
    def __init__(self, sim) -> None:
        self.sim = sim
        self.assets: dict[str, Property] = {}
        self.sold_today = 0
        self.volume = ZERO

    def add(self, prop: Property) -> None:
        prop.valuation = self.appraise(prop)
        prop.deed_no = f"DEED-{len(self.assets) + 1:04d}"
        self.assets[prop.asset_key] = prop

    # --- 估值 ---------------------------------------------------------------
    def appraise(self, prop: Property) -> Decimal:
        value = prop.base
        value *= ONE + prop.resource_score * Decimal("0.4")
        value *= ONE + prop.development * Decimal("0.08")
        value *= ONE + prop.traffic * Decimal("0.2")
        value *= ONE + Decimal(prop.sales) * Decimal("0.02")
        return quant(value)

    def tick(self, day: int) -> None:
        self.sold_today = 0
        self._revalue()
        self._list(day)
        self._trade(day)

    def _revalue(self) -> None:
        for prop in self.assets.values():
            noise = rand_dec(self.sim.rng, "-0.01", "0.01")
            prop.valuation = quant(self.appraise(prop) * (ONE + noise))

    def _list(self, day: int) -> None:
        for prop in self.assets.values():
            owner = self.sim.actor(prop.owner_id)
            if owner is None or prop.status != "owned":
                continue
            if owner.policy.get("property", ZERO) < Decimal("0.3"):
                continue
            if rand_dec(self.sim.rng, "0", "1") > Decimal("0.02"):
                continue
            prop.status = "listed"
            prop.ask = quant(prop.valuation * rand_dec(self.sim.rng, "1.05", "1.35"))

    def _trade(self, day: int) -> None:
        for prop in list(self.assets.values()):
            if prop.status != "listed":
                continue
            buyer = self._find_buyer(prop)
            if buyer is None:
                continue
            self._settle(prop, buyer, day)

    def _find_buyer(self, prop: Property):
        candidates = [a for a in self.sim.players
                      if a.id != prop.owner_id and not a.bankrupt
                      and a.policy.get("property", ZERO) >= Decimal("0.3")]
        candidates.sort(key=lambda a: -self.sim.net_worth(a))
        for actor in candidates[:8]:
            if self.sim.net_worth(actor) < prop.ask * Decimal("3"):
                continue
            if rand_dec(self.sim.rng, "0", "1") < actor.policy["property"] * Decimal("0.5"):
                return actor
        return None

    def _settle(self, prop: Property, buyer, day: int) -> None:
        seller = self.sim.actor(prop.owner_id)
        gross = quant(prop.ask)
        tax = quant(gross * cfg.MARKET.property_tax)
        if self.sim.fund_cc5(buyer, gross + tax) is None:
            return
        self._transfer_payment(seller, buyer, gross, tax)
        self._move(prop, buyer)
        prop.price_paid = quant(gross * cfg.BASE_VALUE["cc5"])
        prop.sales += 1
        prop.status = "owned"
        prop.ask = ZERO
        self.sold_today += 1
        self.volume += prop.price_paid
        self.sim.stats["property_sales"] += 1
        self.sim.stats["property_volume"] += prop.price_paid
        self.sim.stats["property_tax"] += quant(tax * cfg.BASE_VALUE["cc5"])
        buyer.remember(day, "buy_property", f"{prop.asset_key} @ {gross} cc5", gross)

    def _transfer_payment(self, seller, buyer, gross: Decimal, tax: Decimal) -> None:
        """买方 cc5 已兑换到位：货款给卖方、2% 转让税燃烧。"""
        ledger = self.sim.ledger
        if ledger.balance(buyer.id, "cc5") < gross + tax:
            raise RuntimeError("cc5 余额不足")
        ledger.apply([(buyer.id, "cc5", -(gross + tax)), (seller.id, "cc5", gross),
                      (self.sim.burn_id, "cc5", tax)], "property_transfer")

    def _move(self, prop: Property, buyer) -> None:
        old = self.sim.actor(prop.owner_id)
        if old and prop in old.properties:
            old.properties.remove(prop)
        prop.owner_id = buyer.id
        buyer.properties.append(prop)

    def repossess(self, prop: Property, new_owner_id: str) -> None:
        old = self.sim.actor(prop.owner_id)
        if old and prop in old.properties:
            old.properties.remove(prop)
        prop.owner_id = new_owner_id
        prop.status = "owned"
        prop.ask = ZERO
        new_owner = self.sim.actor(new_owner_id)
        if new_owner:
            new_owner.properties.append(prop)

    def monthly_tax(self) -> Decimal:
        total = ZERO
        rate = cfg.MARKET.holding_tax_month
        for prop in self.assets.values():
            owner = self.sim.actor(prop.owner_id)
            if owner is None or owner.kind != "player":
                continue
            due = quant(prop.valuation * rate)
            if due <= ZERO:
                continue
            available = self.sim.ledger.balance(owner.id)
            pay = min(due, available)
            if pay <= ZERO:
                continue
            self.sim.ledger.transfer(owner.id, self.sim.burn_id, "cc1", pay, "holding_tax")
            total += pay
        self.sim.stats["holding_tax"] += total
        return total
