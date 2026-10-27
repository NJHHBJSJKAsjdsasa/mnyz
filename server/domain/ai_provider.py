"""Deterministic decision provider (10 §2/§3).

The provider is a pure function of ``DecisionContext``: no wall clock, no
``random()``, only ``SeededRandom`` keyed by the context. That is what makes
``replay(agent_id, tick)`` bit-identical to what actually ran.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from decimal import Decimal

from .currency_service import q4
from .rng import stream

POLICY_VERSION = "1"
FEE_RATE = Decimal("0.003")  # 0.1% buy + 0.1% sell + 0.1% stamp tax
MIN_EDGE = Decimal("0.005")
RISK_AVERSION = {
    "industrialist": Decimal("0.6"),
    "banker": Decimal("0.3"),
    "trader": Decimal("0.6"),
    "quant": Decimal("0.8"),
    "landlord": Decimal("0.5"),
    "raider": Decimal("1.0"),
    "explorer": Decimal("0.9"),
    "councilor": Decimal("0.2"),
    "market_maker": Decimal("0.4"),
}
MAX_ORDER_PCT = {
    "industrialist": Decimal("0.05"),
    "banker": Decimal("0"),
    "trader": Decimal("0.15"),
    "quant": Decimal("0.10"),
    "landlord": Decimal("0.05"),
    "raider": Decimal("0.10"),
    "explorer": Decimal("0.05"),
    "councilor": Decimal("0"),
    "market_maker": Decimal("0.10"),
}
MODE = {
    "quant": "momentum",
    "trader": "reversion",
    "market_maker": "inventory",
    "banker": "deposit",
}
BANK_MIN_DEPOSIT = Decimal(2000)
BANK_DEPOSIT_PCT = Decimal("0.50")


@dataclass(frozen=True)
class Action:
    type: str
    payload: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {"type": self.type, "payload": dict(self.payload)}


@dataclass(frozen=True)
class ActionPlan:
    actions: tuple[Action, ...]
    confidence: Decimal
    reason: str


@dataclass(frozen=True)
class DecisionContext:
    """Public market data + the agent's own state; nothing private (06 §5.1)."""

    agent_id: str
    code: str
    persona: str
    tick: int
    policy_version: str
    snapshot_hash: str
    cash: dict[str, str]
    holdings: dict[str, int]
    market: tuple[dict, ...]
    banks: tuple[dict, ...]
    risk: dict

    def to_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "code": self.code,
            "persona": self.persona,
            "tick": self.tick,
            "policy_version": self.policy_version,
            "snapshot_hash": self.snapshot_hash,
            "cash": dict(self.cash),
            "holdings": dict(self.holdings),
            "market": [dict(row) for row in self.market],
            "banks": [dict(row) for row in self.banks],
            "risk": dict(self.risk),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "DecisionContext":
        return cls(
            agent_id=str(data["agent_id"]),
            code=str(data["code"]),
            persona=str(data["persona"]),
            tick=int(data["tick"]),
            policy_version=str(data["policy_version"]),
            snapshot_hash=str(data["snapshot_hash"]),
            cash={k: str(v) for k, v in data["cash"].items()},
            holdings={k: int(v) for k, v in data["holdings"].items()},
            market=tuple(data["market"]),
            banks=tuple(data["banks"]),
            risk=dict(data["risk"]),
        )


def snapshot_hash(payload: dict) -> str:
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return "sha256:" + hashlib.sha256(body.encode("utf-8")).hexdigest()


class DeterministicProvider:
    name = "deterministic"
    version = POLICY_VERSION

    def decide(self, ctx: DecisionContext) -> ActionPlan:
        rng = stream(ctx.agent_id, ctx.tick, ctx.snapshot_hash, ctx.policy_version)
        mode = MODE.get(ctx.persona, "idle")
        if mode == "deposit":
            return self._deposit(ctx)
        if mode == "idle":
            return ActionPlan((), Decimal(0), "该 persona 暂无可用动作类型（等待 0114/0115 服务）")
        return self._stock(ctx, mode, rng)

    # -- stock -----------------------------------------------------------
    def _stock(self, ctx: DecisionContext, mode: str, rng) -> ActionPlan:
        cash = Decimal(ctx.cash.get("cc4", "0"))
        budget = q4(cash * MAX_ORDER_PCT.get(ctx.persona, Decimal(0)))
        risk = RISK_AVERSION.get(ctx.persona, Decimal("0.7"))
        jitter = Decimal(str(round(rng.next() * 0.004, 6)))
        threshold = MIN_EDGE + jitter
        best: tuple[Decimal, dict, str] | None = None

        for row in ctx.market:
            last = Decimal(str(row.get("last_price") or "0"))
            prev = Decimal(str(row.get("prev_close") or "0"))
            if last <= 0 or prev <= 0:
                continue
            change = (last - prev) / prev
            ticker = str(row["ticker"])
            shares = int(ctx.holdings.get(ticker, 0))
            if mode == "inventory":
                target = int(Decimal(str(row.get("free_float") or 0)) * Decimal("0.02"))
                if target <= 0:
                    continue
                if shares == 0 and change > -Decimal("0.05"):
                    side, edge = "buy", abs(change) + Decimal("0.002")
                elif shares > target:
                    side, edge = "sell", Decimal("0.002")
                else:
                    continue
            elif mode == "momentum":
                if change > threshold:
                    side, edge = "buy", change
                elif change < -threshold:
                    side, edge = "sell", -change
                else:
                    continue
            else:  # reversion
                if change < -threshold:
                    side, edge = "buy", -change
                elif change > threshold:
                    side, edge = "sell", change
                else:
                    continue

            price = self._price(row, side)
            if price <= 0:
                continue
            if side == "buy":
                quantity = int(budget / price)
                if quantity <= 0:
                    continue
            else:
                quantity = min(shares, int(budget / price)) or shares
                if quantity <= 0:
                    continue
            score = edge - FEE_RATE - risk * abs(change)
            if score <= 0:
                continue
            candidate = (score, {"ticker": ticker, "side": side, "price": str(price),
                                 "quantity": quantity}, side)
            if best is None or candidate[0] > best[0] or (
                candidate[0] == best[0] and ticker < best[1]["ticker"]
            ):
                best = candidate

        if best is None:
            return ActionPlan((), Decimal(0), "没有满足边际收益的标的")
        score, payload, side = best
        confidence = min(Decimal(1), q4(score * 10))
        reason = (
            f"{ctx.persona} {mode}：{payload['ticker']} {side} "
            f"{payload['quantity']}@{payload['price']}，评分 {q4(score)}"
        )
        return ActionPlan((Action("stock.order", payload),), confidence, reason)

    @staticmethod
    def _price(row: dict, side: str) -> Decimal:
        if side == "buy":
            book = Decimal(str(row.get("best_ask") or "0"))
        else:
            book = Decimal(str(row.get("best_bid") or "0"))
        if book > 0:
            return q4(book)
        last = Decimal(str(row.get("last_price") or "0"))
        if last <= 0:
            return Decimal(0)
        return q4(last * Decimal("1.001") if side == "buy" else last * Decimal("0.999"))

    # -- bank ------------------------------------------------------------
    def _deposit(self, ctx: DecisionContext) -> ActionPlan:
        cash = Decimal(ctx.cash.get("cc4", "0"))
        if cash <= BANK_MIN_DEPOSIT or not ctx.banks:
            return ActionPlan((), Decimal(0), "现金不足或没有可用银行")
        bank = min(ctx.banks, key=lambda row: str(row["code"]))
        amount = q4(cash * BANK_DEPOSIT_PCT)
        if amount <= 0:
            return ActionPlan((), Decimal(0), "可存金额为 0")
        payload = {
            "bank_id": str(bank["id"]),
            "bank_code": str(bank["code"]),
            "currency": "cc4",
            "amount": str(amount),
        }
        return ActionPlan(
            (Action("bank.deposit", payload),),
            Decimal("0.2"),
            f"banker：闲置 cc4 {cash} 存入 {bank['code']} {amount}",
        )


PROVIDERS = {"deterministic": DeterministicProvider()}


def provider_for(name: str | None = None):
    return PROVIDERS.get((name or "deterministic").strip().lower(), PROVIDERS["deterministic"])
