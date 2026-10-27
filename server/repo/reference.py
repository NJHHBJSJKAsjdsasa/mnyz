"""Reference data readers (values must never be hard-coded in domain logic)."""

from __future__ import annotations


def resource_codes(conn) -> list[str]:
    rows = conn.execute("SELECT code FROM resource_types ORDER BY sort_order").fetchall()
    return [row["code"] for row in rows]


def counts(conn) -> dict[str, int]:
    rows = conn.execute(
        """
        SELECT 'resource_types' AS name, count(*) AS n FROM resource_types
        UNION ALL SELECT 'module_definitions', count(*) FROM module_definitions
        UNION ALL SELECT 'tech_nodes', count(*) FROM tech_nodes
        UNION ALL SELECT 'contract_templates', count(*) FROM contract_templates
        UNION ALL SELECT 'structure_definitions', count(*) FROM structure_definitions
        """
    ).fetchall()
    return {row["name"]: int(row["n"]) for row in rows}


def game_config(conn) -> dict[str, object]:
    rows = conn.execute("SELECT key, value FROM game_config").fetchall()
    return {row["key"]: row["value"] for row in rows}


def structure_definition(conn, code: str, kind: str) -> dict | None:
    return conn.execute(
        """
        SELECT code, kind, name, max_level, cost_curve, yield_formula
          FROM structure_definitions WHERE code = %s AND kind = %s
        """,
        (code, kind),
    ).fetchone()


def module_definition(conn, code: str) -> dict | None:
    return conn.execute(
        """
        SELECT code, name, max_level, cost_curve, effect_curve
          FROM module_definitions WHERE code = %s
        """,
        (code,),
    ).fetchone()
