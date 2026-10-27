"""AI economy persistence: agent profiles, decision log and the runtime switch."""

from __future__ import annotations

import json
from decimal import Decimal

AGENT_COLUMNS = (
    "id, code, name, persona, player_id, actor_id, faction_code, capital_seed, "
    "risk_profile, config, status, last_tick_at, created_at"
)


def agent_by_code(conn, code: str) -> dict | None:
    return conn.execute(
        f"SELECT {AGENT_COLUMNS} FROM ai_agents WHERE code = %s", (code,)
    ).fetchone()


def agent_by_id(conn, agent_id: str, *, for_update: bool = False) -> dict | None:
    sql = f"SELECT {AGENT_COLUMNS} FROM ai_agents WHERE id = %s"
    if for_update:
        sql += " FOR UPDATE"
    return conn.execute(sql, (agent_id,)).fetchone()


def agent_by_player(conn, player_id: str) -> dict | None:
    return conn.execute(
        f"SELECT {AGENT_COLUMNS} FROM ai_agents WHERE player_id = %s", (player_id,)
    ).fetchone()


def agents(conn, *, status: str | None = "active", limit: int = 500) -> list[dict]:
    if status:
        return conn.execute(
            f"SELECT {AGENT_COLUMNS} FROM ai_agents WHERE status = %s "
            "ORDER BY code LIMIT %s",
            (status, limit),
        ).fetchall()
    return conn.execute(
        f"SELECT {AGENT_COLUMNS} FROM ai_agents ORDER BY code LIMIT %s", (limit,)
    ).fetchall()


def count_agents(conn) -> int:
    row = conn.execute("SELECT COUNT(*) AS n FROM ai_agents").fetchone()
    return int(row["n"])


def insert_agent(
    conn,
    *,
    code: str,
    name: str,
    persona: str,
    player_id: str,
    actor_id: str,
    faction_code: str | None,
    capital_seed: Decimal,
    risk_profile: dict,
    config: dict,
) -> dict:
    return conn.execute(
        f"""
        INSERT INTO ai_agents
               (code, name, persona, player_id, actor_id, faction_code, capital_seed,
                risk_profile, config)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
        RETURNING {AGENT_COLUMNS}
        """,
        (
            code,
            name,
            persona,
            player_id,
            actor_id,
            faction_code,
            capital_seed,
            json.dumps(risk_profile, default=str),
            json.dumps(config, default=str),
        ),
    ).fetchone()


def touch_agent(conn, agent_id: str, at) -> None:
    conn.execute("UPDATE ai_agents SET last_tick_at = %s WHERE id = %s", (at, agent_id))


def set_agent_status(conn, agent_id: str, status: str) -> None:
    conn.execute("UPDATE ai_agents SET status = %s WHERE id = %s", (status, agent_id))


# ------------------------------------------------------------------ decisions
def insert_decision(
    conn,
    *,
    agent_id: str,
    tick: int,
    action: str,
    inputs: dict,
    score: Decimal,
    reason: str,
    result: dict,
    status: str,
    provider: str,
    provider_version: str,
    latency_ms: int,
    fallback: bool = False,
    provider_id: str | None = None,
    token_in: int | None = None,
    token_out: int | None = None,
    shadow: bool = False,
    model: str | None = None,
    prompt_hash: str | None = None,
) -> dict:
    return conn.execute(
        """
        INSERT INTO ai_decisions
               (agent_id, tick, action, inputs, score, reason, result, status,
                provider, provider_version, latency_ms, fallback,
                provider_id, token_in, token_out, shadow, model, prompt_hash)
        VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s::jsonb, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s)
        RETURNING id, agent_id, tick, tick_at, action, score, reason, status
        """,
        (
            agent_id,
            tick,
            action,
            json.dumps(inputs, default=str),
            score,
            reason,
            json.dumps(result, default=str),
            status,
            provider,
            provider_version,
            latency_ms,
            fallback,
            provider_id,
            token_in,
            token_out,
            shadow,
            model,
            prompt_hash,
        ),
    ).fetchone()


def decision_for_tick(conn, agent_id: str, tick: int) -> dict | None:
    return conn.execute(
        "SELECT id, agent_id, tick, tick_at, action, inputs, score, reason, result, "
        "status, provider, provider_version FROM ai_decisions "
        "WHERE agent_id = %s AND tick = %s ORDER BY id DESC LIMIT 1",
        (agent_id, tick),
    ).fetchone()


def decisions(conn, *, agent_id: str | None = None, limit: int = 50) -> list[dict]:
    if agent_id:
        return conn.execute(
            "SELECT id, agent_id, tick, tick_at, action, score, reason, status "
            "FROM ai_decisions WHERE agent_id = %s ORDER BY id DESC LIMIT %s",
            (agent_id, limit),
        ).fetchall()
    return conn.execute(
        "SELECT id, agent_id, tick, tick_at, action, score, reason, status "
        "FROM ai_decisions ORDER BY id DESC LIMIT %s",
        (limit,),
    ).fetchall()


def last_tick(conn) -> int:
    row = conn.execute("SELECT COALESCE(MAX(tick), 0) AS tick FROM ai_decisions").fetchone()
    return int(row["tick"])


# ------------------------------------------------------------------ switch
PAUSE_FLAG = "ai.runtime_pause"


def set_pause(conn, paused: bool) -> None:
    conn.execute(
        """
        INSERT INTO feature_flags (name, enabled, mode, rollout_pct, description)
        VALUES (%s, %s, 'local', 0, 'AI 自动下单运维熔断（不没收资产）')
        ON CONFLICT (name) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
        """,
        (PAUSE_FLAG, paused),
    )


def is_paused(conn) -> bool:
    row = conn.execute(
        "SELECT enabled FROM feature_flags WHERE name = %s", (PAUSE_FLAG,)
    ).fetchone()
    return bool(row["enabled"]) if row else False


# ------------------------------------------------------------------ directory
def players_by_controller(conn, controller: str, limit: int = 200) -> list[dict]:
    return conn.execute(
        """
        SELECT p.id, p.display_name, p.controller, ac.created_at,
               act.code AS actor_code, ag.persona, ag.status AS agent_status
          FROM players p
          JOIN accounts ac ON ac.id = p.account_id
          LEFT JOIN economic_actors act ON act.player_id = p.id AND act.kind = 'player'
          LEFT JOIN ai_agents ag ON ag.player_id = p.id
         WHERE p.controller = %s
         ORDER BY ac.created_at, p.id
         LIMIT %s
        """,
        (controller, limit),
    ).fetchall()


def player_directory_row(conn, player_id: str) -> dict | None:
    return conn.execute(
        """
        SELECT p.id, p.display_name, p.controller, ac.created_at, p.universe_id,
               act.id AS actor_id, act.code AS actor_code, ag.persona,
               ag.status AS agent_status, ag.faction_code,
               cs.seat_no AS council_seat
          FROM players p
          JOIN accounts ac ON ac.id = p.account_id
          LEFT JOIN economic_actors act ON act.player_id = p.id AND act.kind = 'player'
          LEFT JOIN ai_agents ag ON ag.player_id = p.id
          LEFT JOIN council_seats cs ON cs.player_id = p.id
         WHERE p.id = %s
        """,
        (player_id,),
    ).fetchone()


# ------------------------------------------------------------------ providers
PROVIDER_COLUMNS = (
    "id, name, kind, version, status, endpoint, model, timeout_ms, max_actions, "
    "allowlist, config, updated_at"
)


def providers(conn) -> dict[str, dict]:
    rows = conn.execute(
        f"SELECT {PROVIDER_COLUMNS} FROM ai_decision_providers ORDER BY name"
    ).fetchall()
    return {row["name"]: row for row in rows}


def provider(conn, name: str) -> dict | None:
    return conn.execute(
        f"SELECT {PROVIDER_COLUMNS} FROM ai_decision_providers WHERE name = %s",
        (name,),
    ).fetchone()


def set_provider(conn, name: str, **fields) -> dict | None:
    allowed = {"status", "endpoint", "model", "timeout_ms", "max_actions", "allowlist", "config"}
    sets, params = [], []
    for key, value in fields.items():
        if key not in allowed or value is None:
            continue
        if key in ("allowlist", "config"):
            sets.append(f"{key} = %s::jsonb")
            params.append(json.dumps(value, default=str))
        else:
            sets.append(f"{key} = %s")
            params.append(value)
    if not sets:
        return provider(conn, name)
    params.append(name)
    conn.execute(
        f"UPDATE ai_decision_providers SET {', '.join(sets)}, updated_at = now() WHERE name = %s",
        params,
    )
    return provider(conn, name)
