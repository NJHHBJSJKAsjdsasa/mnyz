"""命令行入口。

用法：
    python -m tools.economy_sim                 # 基准场景 30 天
    python -m tools.economy_sim --all           # 低 / 基准 / 高三场景
    python -m tools.economy_sim --days 90 --seed 7
    python -m tools.economy_sim --scenario high --days 180
    python -m tools.economy_sim.selfcheck       # 不变量自检
"""

import argparse
import json
import sys
from pathlib import Path

from . import config as cfg
from . import report
from .charts import render_html
from .engine import Simulation
from .money import ZERO, fmt, pct


def _jsonable(value):
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if hasattr(value, "is_finite") and not isinstance(value, str):
        return str(value)
    return value


def run_scenario(name: str, days: int | None, seed: int | None) -> dict:
    scenario = cfg.SCENARIOS[name]
    if seed is not None:
        from dataclasses import replace
        scenario = replace(scenario, seed=seed)
    sim = Simulation(scenario)
    return sim.run(days)


def print_gates(results: list) -> None:
    print("\n闸门判定总表")
    print("-" * 78)
    for result in results:
        label = result["scenario"]["label"]
        ok = all(g["passed"] for g in result["gates"])
        infl = " / ".join(f"{m['rate']*100:.2f}%" for m in result["inflation"]) or "—"
        print(f"{label:<4} 天数 {result['days']:<4} 通胀 {infl:<16} {'PASS' if ok else 'FAIL'}")
        for gate in result["gates"]:
            if not gate["passed"]:
                print(f"        ✗ {gate['name']}: 实测 {gate['value']}，门槛 {gate['threshold']}")
    print("-" * 78)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="宇宙经济离线模拟器")
    parser.add_argument("--scenario", choices=["low", "baseline", "high"], default="baseline")
    parser.add_argument("--all", action="store_true", help="跑低/基准/高三场景")
    parser.add_argument("--days", type=int, default=None)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--out", default="docs/cosmic-economy/sim")
    parser.add_argument("--no-charts", action="store_true")
    args = parser.parse_args(argv)

    names = ["low", "baseline", "high"] if args.all else [args.scenario]
    results = [run_scenario(name, args.days, args.seed) for name in names]
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    charts_file = "charts.html"
    if not args.no_charts:
        (out_dir / charts_file).write_text(render_html(results), encoding="utf-8")
    report_text = report.render(results, charts_file if not args.no_charts else "")
    report_path = out_dir / "simulation_report.md"
    report_path.write_text(report_text, encoding="utf-8")
    (out_dir / "simulation_metrics.json").write_text(
        json.dumps(_jsonable(results), ensure_ascii=False, indent=2), encoding="utf-8")

    print_gates(results)
    print(f"\n报告已写入：{report_path.resolve()}")
    print(f"指标 JSON ：{out_dir.resolve() / 'simulation_metrics.json'}")
    print(f"参数版本  ：{results[0]['policy_id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
