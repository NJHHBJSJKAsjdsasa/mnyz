"""Daily contract generation and reward preview (docs/server/09 §5)."""

from __future__ import annotations

import math

from .rng import SeededRandom, hash_text

BASE_TEMPLATES = ["deep_patrol", "trade_escort", "vein_mining"]
EXPERT_REQUIREMENTS = {"relic_survey": "archivist", "lane_clear": "weaponArray"}
NPC_TAKE_CHANCE = 0.25


def generate(
    player_id: str,
    game_day,
    templates: dict[str, dict],
    module_levels: dict[str, int],
) -> list[dict]:
    rng = SeededRandom(hash_text(f"{player_id}|{game_day}|contracts"))
    codes = [code for code in BASE_TEMPLATES if code in templates]
    experts = [
        code
        for code, module in EXPERT_REQUIREMENTS.items()
        if code in templates and module_levels.get(module, 0) >= 1
    ]
    if experts:
        codes.append(experts[int(rng.next() * len(experts))])

    rows: list[dict] = []
    for index, code in enumerate(codes):
        template = templates[code]
        formula = template["reward_formula"]
        target_low, target_high = formula.get("target", [1, 1])
        reward = {
            resource: _randint(rng, low, high)
            for resource, (low, high) in formula.get("resources", {}).items()
        }
        rows.append(
            {
                "id": f"{game_day}-c{index + 1}",
                "template_code": code,
                "metric": template["metric"],
                "target": _randint(rng, target_low, target_high),
                "reward": reward,
                "vouchers": int(formula.get("vouchers", 0)),
                "target_distance": 0,
            }
        )

    if rows and rng.next() < NPC_TAKE_CHANCE:
        rows[int(rng.next() * len(rows))]["taken_by"] = "npc"
    return rows


def reward_preview(row: dict, requires_module: str | None, module_levels: dict[str, int]) -> dict:
    bonus = 1.0
    if requires_module:
        bonus += min(1.0, 0.02 * max(0, module_levels.get(requires_module, 0)))
    distance = 1 + min(1.0, float(row.get("target_distance") or 0) / 5_000_000)
    factor = bonus * distance
    return {
        code: max(1, _round(int(amount) * factor))
        for code, amount in (row.get("reward") or {}).items()
    }


def _randint(rng: SeededRandom, low: int, high: int) -> int:
    low, high = int(low), int(high)
    return low + int(rng.next() * (high - low + 1))


def _round(value: float) -> int:
    return int(math.floor(value + 0.5))
