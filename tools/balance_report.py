"""Numeric health check for the Atlas exploration loops.

Replicates the frontend formulas (collection / survey / trade / contract / refit)
so balance changes can be compared without playing for days.

Run:  python tools/balance_report.py
"""

import random
import statistics

# --- value table used to compare different resources (antimatter = 1.0) -------
VALUE = {
    "antimatter": 1.0,
    "element115": 1 / 1.2,
    "deuterium": 1 / 0.8,
    "quantumAlloy": 6,
    "plasmaCell": 8,
    "neuralCircuit": 10,
    "exoticCrystal": 18,
    "nebulaDust": 14,
    "blackHoleFragment": 40,
    "ancientRelic": 30,
    "alienArtifact": 34,
    "dimensionalShard": 50,
}

# Typical planet: Co, Ti, H, He, O  -> 4 / 7 / 4 raw units (measured from the table)
TYPICAL_ELEMENTS = {"antimatter": 4, "element115": 7, "deuterium": 4}

SHIP_MULTIPLIER = 1.97          # level 5
SHIP_EFFICIENCY = 1.8
DISCOVERY_BONUS = [(3, 5.0), (5, 3.0), (7, 2.0), (10, 1.5)]

def cost_curve(base, level):
    return max(1, round(base * (1.35 ** (level - 1))))


def module_cost(module, level):
    if module == 'scanArray':
        cost = {'quantumAlloy': cost_curve(10, level), 'neuralCircuit': cost_curve(3, level)}
        if level >= 4:
            cost['exoticCrystal'] = cost_curve(2, level)
        if level >= 8:
            cost['ancientRelic'] = round(level / 4)
        return cost
    if module == 'cargoBay':
        cost = {'plasmaCell': cost_curve(8, level), 'quantumAlloy': cost_curve(5, level)}
        if level >= 5:
            cost['alienArtifact'] = round(level / 5)
        return cost
    if module == 'warpCoil':
        cost = {'plasmaCell': cost_curve(10, level), 'neuralCircuit': cost_curve(5, level)}
        if level >= 4:
            cost['nebulaDust'] = cost_curve(2, level)
        return cost
    cost = {'neuralCircuit': cost_curve(8, level), 'quantumAlloy': cost_curve(6, level)}
    if level >= 4:
        cost['exoticCrystal'] = cost_curve(2, level)
    return cost


MODULE_IDS = ['scanArray', 'cargoBay', 'warpCoil', 'archivist']
MAX_MODULE_LEVEL = 999

CONTRACT_BASE = {
    "scan": {"exoticCrystal": (8, 18), "nebulaDust": (3, 8), "voucher": 1},
    "trade": {"plasmaCell": (10, 22), "quantumAlloy": (6, 14), "voucher": 1},
    "mine": {"ancientRelic": (1, 2), "exoticCrystal": (6, 12), "voucher": 2},
    "survey": {"nebulaDust": (12, 26), "exoticCrystal": (10, 20), "voucher": 2},
    "haul": {"quantumAlloy": (14, 28), "exoticCrystal": (8, 16), "voucher": 1},
    "arbitrage": {"plasmaCell": (18, 34), "neuralCircuit": (8, 16), "voucher": 1},
    "relic": {"alienArtifact": (1, 2), "dimensionalShard": (1, 1), "voucher": 3},
}

TARGET_DISTANCE = 3_900_000     # average specialist destination
MODULE_BONUS = 0.02             # +5% contract payout per related module level
CONTRACT_REWARD_SCALE = 0.8
REFIT_COST_SCALE = 3.5
TRADE_SELL_RATIO = 1.0


def value(bundle):
    return sum(amount * VALUE[key] for key, amount in bundle.items())


def discovery_bonus(index):
    for limit, bonus in DISCOVERY_BONUS:
        if index <= limit:
            return bonus
    return 1.0


def collection_day(count, levels, legacy_count_bug, history=0):
    """Antimatter-equivalent from `count` planet collections in one day."""
    total = 0.0
    for index in range(1, count + 1):
        base = value(TYPICAL_ELEMENTS)
        factor = SHIP_MULTIPLIER * discovery_bonus(index)
        factor *= 1 + 0.08 * (levels["warpCoil"] ** 0.5)
        if legacy_count_bug:
            # old getCollectionCount(): every planet ever collected counts as this one
            counter = history + index
            factor *= max(0.4, 1 - (counter - 3) * 0.15) if counter > 3 else 1.0
        total += base * factor
    return total


def survey_day(count, levels):
    """Antimatter-equivalent plus consumables from `count` surveys."""
    gains = {"antimatter": 0.0, "deuterium": 0.0, "exoticCrystal": 0.0,
             "nebulaDust": 0.0, "quantumAlloy": 0.0, "ancientRelic": 0.0,
             "alienArtifact": 0.0, "dimensionalShard": 0.0}
    salvage = levels["archivist"] // 2

    for _ in range(count):
        roll = random.random()
        if roll < 0.10:
            gains["ancientRelic"] += random.randint(1, 2) + salvage
            if random.random() < 0.4:
                gains["alienArtifact"] += 1
            if random.random() < 0.15:
                gains["dimensionalShard"] += 1
        elif roll < 0.40:
            gains["exoticCrystal"] += random.randint(2, 7) + salvage
            if random.random() < 0.5:
                gains["nebulaDust"] += random.randint(1, 4)
            if random.random() < 0.3:
                gains["quantumAlloy"] += random.randint(1, 3)
        gains["deuterium"] += 2

    fuel = count * 6
    return value(gains) - fuel * VALUE["deuterium"], gains


def trade_day(visits, levels):
    """Arbitrage margin: buy only goods priced under the base sell price."""
    margin = 0.0
    discount = 1 - 0.06 * levels["cargoBay"]
    for _ in range(visits):
        for _ in range(3):
            base = random.choice([6, 8, 10, 18, 14, 40, 30, 34, 50])
            price = max(2, round(base * random.uniform(0.65, 1.35) * discount))
            sell = max(1, round(base * TRADE_SELL_RATIO))
            if sell > price:
                margin += sell - price
                break
    return margin


def contract_day(kinds, levels):
    """Antimatter-equivalent from finished contracts (reward x distance x modules)."""
    multiplier = 1 + TARGET_DISTANCE / 4_000_000
    bonus = 1 + min(1.0, MODULE_BONUS * (levels["scanArray"] + levels["archivist"] + levels["cargoBay"] + levels["warpCoil"]))
    total = 0.0
    vouchers = 0
    for kind in kinds:
        spec = CONTRACT_BASE[kind]
        bundle = {k: random.uniform(*v) for k, v in spec.items() if k != "voucher"}
        total += value(bundle) * multiplier * CONTRACT_REWARD_SCALE * bonus
        vouchers += max(1, round(spec["voucher"] * (multiplier ** 0.5)))
    return total, vouchers


def refit_cost(levels, horizon=6):
    """Antimatter-equivalent still required for the next horizon levels."""
    cost = 0.0
    for module in MODULE_IDS:
        for level in range(levels[module] + 1, min(MAX_MODULE_LEVEL, levels[module] + horizon) + 1):
            cost += value(module_cost(module, level)) * REFIT_COST_SCALE
    return cost


def travel_cost(distance):
    return (round(distance / 15000) * VALUE["antimatter"]
            + round(distance / 30000) * VALUE["element115"]
            + round(distance / 22000) * VALUE["deuterium"]) / SHIP_EFFICIENCY


def simulate(days=365, level_up=True, legacy_count_bug=False):
    levels = {"scanArray": 2, "cargoBay": 1, "warpCoil": 1, "archivist": 1}
    rows = []
    wallet = 0.0
    maxed_on = None

    for day in range(1, days + 1):
        collections = collection_day(12, levels, legacy_count_bug, history=(day - 1) * 12)
        surveys, _ = survey_day(12, levels)
        trades = trade_day(6, levels)
        contracts, vouchers = contract_day(["arbitrage", "scan"], levels)
        travel = travel_cost(TARGET_DISTANCE) * 2
        income = collections + surveys + trades + contracts - travel

        rows.append({"day": day, "collections": collections, "surveys": surveys,
                     "trades": trades, "contracts": contracts, "travel": travel,
                     "net": income, "vouchers": vouchers})

        wallet += income

        # buy the cheapest available refit, keeping a 40% cash buffer
        if level_up:
            while True:
                module = min(levels, key=lambda name: levels[name])
                if levels[module] >= MAX_MODULE_LEVEL:
                    break
                step = module_cost(module, levels[module] + 1)
                price = value(step) * REFIT_COST_SCALE
                if price > wallet * 0.6:
                    break
                levels[module] += 1
                wallet -= price

            if maxed_on is None and all(level >= MAX_MODULE_LEVEL for level in levels.values()):
                maxed_on = day

    return rows, levels, maxed_on


def report(rows, levels, title):
    totals = {key: sum(row[key] for row in rows) for key in
              ("collections", "surveys", "trades", "contracts", "travel", "net")}
    total_income = sum(sum(row[k] for k in ("collections", "surveys", "trades", "contracts")) for row in rows)

    print(f"\n=== {title} ===")
    print(f"{'source':<14}{'total':>12}{'share':>9}{'/day':>10}")
    for key in ("collections", "surveys", "trades", "contracts"):
        total = totals[key]
        print(f"{key:<14}{total:>12.0f}{(total / total_income * 100 if total_income else 0):>8.1f}%{total / len(rows):>10.1f}")
    print(f"{'travel':<14}{-totals['travel']:>12.0f}{'':>9}{-totals['travel'] / len(rows):>10.1f}")
    print(f"{'NET':<14}{totals['net']:>12.0f}{'':>9}{totals['net'] / len(rows):>10.1f}")
    print(f"modules at day {len(rows)}: {levels}")
    print(f"next 6 levels cost: {refit_cost(levels):.0f}")


if __name__ == "__main__":
    random.seed(7)
    rows_legacy, levels_legacy, _ = simulate(level_up=False, legacy_count_bug=True)
    report(rows_legacy, levels_legacy, "before: legacy collection-count bug, no refits")

    random.seed(7)
    rows_fixed, levels_fixed, maxed_on = simulate(level_up=True, legacy_count_bug=False)
    report(rows_fixed, levels_fixed, "after: count fix + endless refit curve")

    first = statistics.mean(row["collections"] for row in rows_legacy[:5])
    later = statistics.mean(row["collections"] for row in rows_legacy[-5:])
    print(f"\ncollection income day1-5: {first:.1f} -> day26-30: {later:.1f} "
          f"({later / first * 100:.0f}% of early game)")
    print(f"contract/collection ratio: {sum(r['contracts'] for r in rows_legacy) / sum(r['collections'] for r in rows_legacy):.1f}x")
