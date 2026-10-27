"""AI players as first-class players (06) driven by a deterministic engine (10).

An AI player owns a real ``accounts``/``players``/``economic_actors`` triple and
acts only through the same domain services a human uses. ``ai_agents`` holds the
automation profile; ``ai_decisions`` holds one replayable row per tick.

Initial capital is injected once at bootstrap and never topped up: after that an
agent lives off its P&L like everybody else (06 §3).
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from decimal import Decimal

from ..infra.errors import ApiError, NotFound
from ..repo import accounts as account_repo
from ..repo import ai as ai_repo
from ..repo import banks as bank_repo
from ..repo import currency as currency_repo
from ..repo import players as player_repo
from ..repo import stocks as stock_repo
from ..repo import universes as universe_repo
from . import ai_provider, bank_service, council_service, currency_service, stock_service
from .ai_provider import ActionPlan, DecisionContext
from .currency_service import Move, q4

UNIVERSE_SEED = "atlas-main"
DEFAULT_AGENTS = 12
DEFAULT_CAPITAL_CC4 = Decimal("5000")
MAX_CAPITAL_CC4 = Decimal("50000")
MAX_AGENT_PCT = Decimal("0.40")  # 06 §11: one persona ≤ 40% of agents

ROSTER: tuple[tuple[str, str, str | None], ...] = (
    ("铁砧实业", "industrialist", None),
    ("星桥银行", "banker", "guild"),
    ("疾风商队", "trader", "guild"),
    ("脉冲量化", "quant", None),
    ("环带地产", "landlord", None),
    ("赤潮掠夺", "raider", "wardens"),
    ("深空测绘", "explorer", "chorus"),
    ("静默议员", "councilor", None),
    ("双子做市", "market_maker", None),
    ("熔炉工业", "industrialist", None),
    ("零度量化", "quant", "chorus"),
    ("潮汐商会", "trader", "guild"),
)
RISK_PROFILE = {
    "industrialist": {"risk_aversion": "0.6", "max_order_pct": "0.05"},
    "banker": {"risk_aversion": "0.3", "max_order_pct": "0"},
    "trader": {"risk_aversion": "0.6", "max_order_pct": "0.15"},
    "quant": {"risk_aversion": "0.8", "max_order_pct": "0.10"},
    "landlord": {"risk_aversion": "0.5", "max_order_pct": "0.05"},
    "raider": {"risk_aversion": "1.0", "max_order_pct": "0.10"},
    "explorer": {"risk_aversion": "0.9", "max_order_pct": "0.05"},
    "councilor": {"risk_aversion": "0.2", "max_order_pct": "0"},
    "market_maker": {"risk_aversion": "0.4", "max_order_pct": "0.10"},
}
PROVIDER_VERSION = ai_provider.POLICY_VERSION


# ------------------------------------------------------------------ bootstrap
def _universe(conn) -> dict:
    universe = universe_repo.by_seed_name(conn, UNIVERSE_SEED)
    if universe is not None:
        return universe
    return universe_repo.create(
        conn,
        seed_name=UNIVERSE_SEED,
        seed=universe_repo.derive_seed(UNIVERSE_SEED),
        cosmic_origin_time=0,
    )


def _roster_entry(index: int) -> tuple[str, str, str | None]:
    if index < len(ROSTER):
        return ROSTER[index]
    return (f"自动化财团-{index + 1}", ("trader", "quant", "industrialist")[index % 3], None)


def bootstrap(
    conn,
    *,
    count: int = DEFAULT_AGENTS,
    capital: Decimal = DEFAULT_CAPITAL_CC4,
    link_council: bool = True,
) -> dict:
    """Create ``count`` AI players; idempotent by agent code (``AI-001``…)."""
    count = max(1, min(int(count), len(ROSTER) * 4))
    capital = q4(capital)
    if capital <= 0 or capital > MAX_CAPITAL_CC4:
        raise ValueError("初始资本必须在 (0, 50000] cc4")
    personas = [entry[1] for entry in (_roster_entry(i) for i in range(count))]
    for persona in set(personas):
        if Decimal(personas.count(persona)) > MAX_AGENT_PCT * count:
            raise ValueError(f"persona {persona} 超出 40% 上限（06 §11）")

    universe = _universe(conn)
    treasury = currency_repo.actor_by_code(conn, "treasury")
    if treasury is None:  # pragma: no cover - seeded by 0110
        raise NotFound("系统账户 treasury 未初始化")

    created: list[dict] = []
    for index in range(count):
        code = f"AI-{index + 1:03d}"
        if ai_repo.agent_by_code(conn, code) is not None:
            continue
        name, persona, faction = _roster_entry(index)
        account = account_repo.create(
            conn, email=None, password_hash=None, status="active", role="player"
        )
        player = player_repo.create(
            conn, account_id=str(account["id"]), universe_id=str(universe["id"]),
            display_name=name,
        )
        conn.execute(
            "UPDATE players SET controller = 'server_ai' WHERE id = %s", (str(player["id"]),)
        )
        actor = currency_repo.create_player_actor(conn, str(player["id"]), name, "server_ai")
        if actor is None:  # pragma: no cover - unique player_id guarantees one row
            actor = currency_repo.actor_for_player(conn, str(player["id"]))
        if capital > 0:
            currency_repo.ensure_account(conn, str(actor["id"]), "cc4")
            currency_service.post(
                conn,
                kind="ai_capital_seed",
                moves=[
                    Move(str(treasury["id"]), "cc4", -capital),
                    Move(str(actor["id"]), "cc4", capital),
                ],
                ref_type="ai_agent",
                ref_id=code,
                idem_key=f"ai_seed:{code}",
                memo=f"AI initial capital {code}",
            )
        agent = ai_repo.insert_agent(
            conn,
            code=code,
            name=name,
            persona=persona,
            player_id=str(player["id"]),
            actor_id=str(actor["id"]),
            faction_code=faction,
            capital_seed=capital,
            risk_profile=RISK_PROFILE.get(persona, {}),
            config={
                "policy_version": PROVIDER_VERSION,
                "provider": "deterministic",
                "max_order_pct": RISK_PROFILE.get(persona, {}).get("max_order_pct", "0"),
            },
        )
        created.append(agent)

    if link_council:
        _link_council_seats(conn)
    return {"created": len(created), "total": ai_repo.count_agents(conn),
            "codes": [row["code"] for row in created]}


def _link_council_seats(conn) -> None:
    """06 §7: the five AI seats are AI players holding real seats."""
    council_service.ensure_seats(conn)
    seats = conn.execute(
        "SELECT seat_no FROM council_seats WHERE is_ai AND player_id IS NULL "
        "ORDER BY seat_no LIMIT 5 FOR UPDATE"
    ).fetchall()
    if not seats:
        return
    agents = ai_repo.agents(conn, status=None, limit=len(seats))
    for seat, agent in zip(seats, agents):
        conn.execute(
            "UPDATE council_seats SET player_id = %s, joined_at = now() WHERE seat_no = %s",
            (str(agent["player_id"]), int(seat["seat_no"])),
        )


# ------------------------------------------------------------------ context
def _market_snapshot(conn, actor_id: str, listing: dict) -> dict:
    bids = stock_repo.book_bids(conn, str(listing["id"]), limit=1)
    asks = stock_repo.book_asks(conn, str(listing["id"]), limit=1)
    held = stock_repo.holder(conn, actor_id, str(listing["id"]))
    prev = Decimal(listing["prev_close"] or 0) or Decimal(listing["ipo_price"])
    return {
        "ticker": listing["ticker"],
        "last_price": str(Decimal(listing["last_price"] or 0)),
        "prev_close": str(prev),
        "free_float": int(listing["free_float"]),
        "best_bid": str(Decimal(bids[0]["price"])) if bids else "0",
        "best_ask": str(Decimal(asks[0]["price"])) if asks else "0",
        "my_shares": int(held["shares"]) if held else 0,
        "settlement_mode": listing["settlement_mode"],
    }


def build_context(conn, agent: dict, tick: int) -> DecisionContext:
    actor_id = str(agent["actor_id"])
    balances = currency_repo.balances(conn, actor_id)
    cash = {row["currency_code"]: str(Decimal(row["balance"])) for row in balances}
    holdings: dict[str, int] = {}
    market: list[dict] = []
    for listing in stock_repo.list_listings(conn, status="listed"):
        row = _market_snapshot(conn, actor_id, listing)
        market.append(row)
        if row["my_shares"]:
            holdings[listing["ticker"]] = row["my_shares"]
    # the central bank is a system institution, not a deposit target (06 §6.2)
    banks = [
        {"id": str(row["id"]), "code": row["code"]}
        for row in bank_repo.list_banks(conn, status="active")
        if str(row["kind"]) != "central"
    ]
    payload = {
        "code": agent["code"],
        "persona": agent["persona"],
        "tick": tick,
        "cash": cash,
        "holdings": holdings,
        "market": market,
        "banks": banks,
    }
    return DecisionContext(
        agent_id=str(agent["id"]),
        code=str(agent["code"]),
        persona=str(agent["persona"]),
        tick=int(tick),
        policy_version=PROVIDER_VERSION,
        snapshot_hash=ai_provider.snapshot_hash(payload),
        cash=cash,
        holdings=holdings,
        market=tuple(market),
        banks=tuple(banks),
        risk=dict(agent["risk_profile"] or {}),
    )


# ------------------------------------------------------------------ execute
def _execute(conn, agent: dict, action, tick: int, index: int) -> dict:
    actor = currency_repo.actor_by_id(conn, str(agent["actor_id"]))
    if actor is None:  # pragma: no cover - FK guarantees the row
        raise NotFound("AI actor 不存在")
    idem = f"ai:{agent['code']}:{tick}:{index}"
    if action.type == "stock.order":
        payload = action.payload
        result = stock_service.place_order(
            conn,
            actor=actor,
            ticker=str(payload["ticker"]),
            side=str(payload["side"]),
            order_type="limit",
            quantity=int(payload["quantity"]),
            price=Decimal(str(payload["price"])),
            idem_key=idem,
        )
        return {"order_id": result["id"], "status": result["status"],
                "filled": result["filled"], "avg_price": result["avg_price"]}
    if action.type == "bank.deposit":
        payload = action.payload
        result = bank_service.deposit(
            conn,
            actor=actor,
            bank_id=str(payload["bank_id"]),
            currency_code=str(payload["currency"]),
            amount=Decimal(str(payload["amount"])),
            idem_key=idem,
        )
        return {"bank": result["bank"], "amount": str(result["amount"])}
    raise ValueError(f"未在白名单内的动作：{action.type}")


WHITELIST = ("stock.order", "bank.deposit")


def tick(conn, *, limit: int | None = None, provider_name: str | None = None) -> dict:
    """One economy heartbeat: snapshot → decide → validate → execute → audit."""
    if ai_repo.is_paused(conn):
        return {"paused": True, "agents": 0, "executed": 0, "failed": 0}
    provider = ai_provider.provider_for(provider_name)
    tick_no = ai_repo.last_tick(conn) + 1
    executed = failed = skipped = 0
    agents = ai_repo.agents(conn, status="active", limit=limit or 500)
    for agent in agents:
        started = time.perf_counter()
        ctx = build_context(conn, agent, tick_no)
        plan: ActionPlan = provider.decide(ctx)
        results: list[dict] = []
        status = "skipped"
        for index, action in enumerate(plan.actions):
            if action.type not in WHITELIST:
                results.append({"type": action.type, "ok": False, "error": "action_not_allowed"})
                failed += 1
                status = "failed"
                continue
            try:
                with conn.transaction():
                    # savepoint per action: a rejected order never aborts the tick
                    outcome = _execute(conn, agent, action, tick_no, index)
            except ApiError as exc:
                results.append({"type": action.type, "ok": False, "error": exc.code,
                                "detail": exc.detail})
                failed += 1
                status = "failed"
            else:
                results.append({"type": action.type, "ok": True, "result": outcome})
                executed += 1
                status = "executed"
        if not plan.actions:
            skipped += 1
        latency = int((time.perf_counter() - started) * 1000)
        ai_repo.insert_decision(
            conn,
            agent_id=str(agent["id"]),
            tick=tick_no,
            action=",".join(action.type for action in plan.actions) or "idle",
            inputs={"context": ctx.to_dict(), "plan": [a.as_dict() for a in plan.actions]},
            score=plan.confidence,
            reason=plan.reason,
            result={"actions": results, "provider": provider.name},
            status=status,
            provider=provider.name,
            provider_version=provider.version,
            latency_ms=latency,
        )
        ai_repo.touch_agent(conn, str(agent["id"]), datetime.now(timezone.utc))
    return {"tick": tick_no, "agents": len(agents), "executed": executed,
            "failed": failed, "skipped": skipped}


# ------------------------------------------------------------------ replay
def replay(conn, agent_id: str, tick_no: int) -> dict:
    """10 §3.4: recompute the plan from the stored context and compare."""
    row = ai_repo.decision_for_tick(conn, agent_id, tick_no)
    if row is None:
        raise NotFound("该 tick 没有决策记录")
    if str(row["provider_version"]) != PROVIDER_VERSION:
        return {"match": False, "reason": "策略版本已升级，需用旧版本回放",
                "recorded_version": str(row["provider_version"]),
                "current_version": PROVIDER_VERSION}
    inputs = row["inputs"] or {}
    context = DecisionContext.from_dict(inputs["context"])
    plan = ai_provider.provider_for(str(row["provider"])).decide(context)
    expected = [action.as_dict() for action in plan.actions]
    recorded = inputs.get("plan", [])
    return {
        "match": expected == recorded,
        "expected": expected,
        "recorded": recorded,
        "reason": plan.reason,
        "tick": int(row["tick"]),
    }


# ------------------------------------------------------------------ directory
def directory(conn, controller: str = "ai") -> list[dict]:
    wanted = "server_ai" if controller in ("ai", "server_ai") else "human"
    rows = ai_repo.players_by_controller(conn, wanted)
    return [
        {
            "id": str(row["id"]),
            "display_name": row["display_name"],
            "controller": "ai" if row["controller"] == "server_ai" else "human",
            "persona": row["persona"],
            "status": row["agent_status"] or "active",
            "created_at": row["created_at"].isoformat(),
        }
        for row in rows
    ]


def report(conn, player_id: str) -> dict:
    row = ai_repo.player_directory_row(conn, player_id)
    if row is None:
        raise NotFound("玩家不存在")
    net_worth = Decimal(0)
    if row["actor_id"]:
        for item in currency_repo.balances(conn, str(row["actor_id"])):
            net_worth += Decimal(item["balance"]) * Decimal(item["base_value"])
    agent = ai_repo.agent_by_player(conn, player_id)
    history = ai_repo.decisions(conn, agent_id=str(agent["id"]), limit=10) if agent else []
    return {
        "id": str(row["id"]),
        "display_name": row["display_name"],
        "controller": "ai" if row["controller"] == "server_ai" else "human",
        "persona": row["persona"],
        "faction_code": row["faction_code"],
        "council_seat": int(row["council_seat"]) if row["council_seat"] else None,
        "net_worth_q1": str(q4(net_worth)),
        "created_at": row["created_at"].isoformat(),
        "decisions": [
            {
                "tick": int(item["tick"]),
                "action": item["action"],
                "status": item["status"],
                "tick_at": item["tick_at"].isoformat(),
            }
            for item in history
        ],
    }


def set_pause(conn, paused: bool) -> dict:
    ai_repo.set_pause(conn, paused)
    return {"paused": bool(paused)}


def is_paused(conn) -> bool:
    return ai_repo.is_paused(conn)
