"""Deterministic decision provider (10 §2/§3).

The provider is a pure function of ``DecisionContext``: no wall clock, no
``random()``, only ``SeededRandom`` keyed by the context. That is what makes
``replay(agent_id, tick)`` bit-identical to what actually ran.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

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


# ------------------------------------------------------------------ validation
ACTION_WHITELIST = ("stock.order", "bank.deposit")
MAX_NOTIONAL = Decimal("1000000000")
MAX_PRICE = Decimal("1000000")


class PlanValidationError(ValueError):
    """A provider returned something the whitelist cannot accept (10 §4.5)."""


def prompt_payload(ctx: DecisionContext, max_actions: int = 5) -> dict:
    """Minimal, public-only payload. Never includes ids, emails or other players'
    private state (10 §4.4); the prompt template is fixed and never concatenates
    player-authored text."""
    return {
        "schema": "atlas.ai.plan.v1",
        "max_actions": max_actions,
        "agent": {"code": ctx.code, "persona": ctx.persona},
        "market": [
            {
                "ticker": row["ticker"],
                "last_price": row["last_price"],
                "prev_close": row["prev_close"],
                "best_bid": row["best_bid"],
                "best_ask": row["best_ask"],
            }
            for row in ctx.market
        ],
        "banks": [{"bank_id": row["id"], "code": row["code"]} for row in ctx.banks],
        "self": {"cash_cc4": ctx.cash.get("cc4", "0"), "holdings": dict(ctx.holdings)},
    }


def prompt_hash(payload: dict) -> str:
    body = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return "sha256:" + hashlib.sha256(body.encode("utf-8")).hexdigest()[:32]


def validate_plan(raw: dict, ctx: DecisionContext, max_actions: int = 5) -> ActionPlan:
    if not isinstance(raw, dict):
        raise PlanValidationError("response_not_object")
    actions_raw = raw.get("actions")
    if not isinstance(actions_raw, list):
        raise PlanValidationError("actions_not_list")
    if len(actions_raw) > max_actions:
        raise PlanValidationError("too_many_actions")
    tickers = {str(row["ticker"]) for row in ctx.market}
    banks = {str(row["id"]) for row in ctx.banks}
    actions: list[Action] = []
    for item in actions_raw:
        if not isinstance(item, dict):
            raise PlanValidationError("action_not_object")
        kind = str(item.get("type") or "")
        if kind not in ACTION_WHITELIST:
            raise PlanValidationError(f"action_not_allowed:{kind}")
        payload = item.get("payload") if isinstance(item.get("payload"), dict) else item
        try:
            if kind == "stock.order":
                ticker = str(payload.get("ticker") or "").upper()
                side = str(payload.get("side") or "")
                price = Decimal(str(payload.get("price")))
                quantity = int(payload.get("quantity"))
                if ticker not in tickers:
                    raise PlanValidationError(f"unknown_ticker:{ticker}")
                if side not in ("buy", "sell"):
                    raise PlanValidationError(f"bad_side:{side}")
                if not Decimal(0) < price <= MAX_PRICE:
                    raise PlanValidationError("price_out_of_range")
                if not 0 < quantity <= MAX_NOTIONAL:
                    raise PlanValidationError("quantity_out_of_range")
                actions.append(Action("stock.order", {
                    "ticker": ticker, "side": side, "price": str(q4(price)),
                    "quantity": quantity,
                }))
            else:  # bank.deposit
                bank_id = str(payload.get("bank_id") or "")
                amount = Decimal(str(payload.get("amount")))
                if bank_id not in banks:
                    raise PlanValidationError(f"unknown_bank:{bank_id}")
                if not Decimal(0) < amount <= MAX_NOTIONAL:
                    raise PlanValidationError("amount_out_of_range")
                actions.append(Action("bank.deposit", {
                    "bank_id": bank_id, "currency": "cc4", "amount": str(q4(amount)),
                }))
        except (InvalidOperation, TypeError, ValueError) as exc:
            if isinstance(exc, PlanValidationError):
                raise
            raise PlanValidationError(f"bad_number:{exc}") from None
    try:
        confidence = min(Decimal(1), max(Decimal(0), Decimal(str(raw.get("confidence", 0)))))
    except (InvalidOperation, TypeError, ValueError):
        confidence = Decimal(0)
    reason = str(raw.get("reason") or "模型返回的动作计划")[:280]
    return ActionPlan(tuple(actions), q4(confidence), reason)


# ------------------------------------------------------------------ llm adapter
_transport = None


def set_transport(fn) -> None:
    """Test/ops hook: ``fn(spec, payload) -> dict``. ``None`` restores the default."""
    global _transport
    _transport = fn


def _default_transport(spec: dict, payload: dict) -> dict:
    """Real HTTP call, only when an endpoint is configured and a key is present.

    Deliberately strict: without both, it refuses instead of guessing, so a
    half-configured deployment falls back to deterministic rather than hanging.
    """
    endpoint = (spec.get("endpoint") or "").strip()
    api_key = os.getenv("ATLAS_AI_LLM_API_KEY", "").strip()
    if not endpoint:
        raise PlanValidationError("endpoint_not_configured")
    if not api_key:
        raise PlanValidationError("api_key_missing")
    import urllib.error
    import urllib.request

    body = json.dumps({"model": spec.get("model"), "input": payload}).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=int(spec.get("timeout_ms", 800)) / 1000) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise PlanValidationError(f"transport_error:{type(exc).__name__}") from None


def _call_with_timeout(fn, timeout_ms: int):
    pool = ThreadPoolExecutor(max_workers=1)
    future = pool.submit(fn)
    try:
        return future.result(timeout=max(0.05, timeout_ms / 1000))
    except FutureTimeout:
        raise PlanValidationError("timeout") from None
    finally:
        pool.shutdown(wait=False)


class LLMProvider:
    """Internal adapter (10 §4). Never decides legality; only proposes actions."""

    name = "llm"

    def __init__(self, spec: dict) -> None:
        self.spec = spec
        self.version = str(spec.get("version") or "1")
        self.last_meta: dict = {}

    def decide(self, ctx: DecisionContext) -> ActionPlan:
        plan, _ = self.decide_with_meta(ctx)
        return plan

    def decide_with_meta(self, ctx: DecisionContext) -> tuple[ActionPlan, dict]:
        payload = prompt_payload(ctx, int(self.spec.get("max_actions") or 5))
        transport = _transport or _default_transport
        started = time.perf_counter()
        raw = _call_with_timeout(lambda: transport(self.spec, payload),
                                 int(self.spec.get("timeout_ms") or 800))
        latency = int((time.perf_counter() - started) * 1000)
        plan = validate_plan(raw, ctx, int(self.spec.get("max_actions") or 5))
        usage = raw.get("usage") if isinstance(raw.get("usage"), dict) else {}
        self.last_meta = {
            "latency_ms": latency,
            "token_in": int(usage.get("input", 0) or 0),
            "token_out": int(usage.get("output", 0) or 0),
            "prompt_hash": prompt_hash(payload),
            "model": self.spec.get("model"),
        }
        return plan, self.last_meta
