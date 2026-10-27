"""生成 Markdown 报告（07 §6.4 要求的 simulation_report.md）。"""

from decimal import Decimal

from . import config as cfg
from .money import ZERO, fmt, pct


def render(results: list, charts_file: str = "") -> str:
    """多个场景的结果 → 一份完整报告。"""
    lines = ["# 宇宙经济模拟报告", ""]
    lines += _header(results[0])
    lines += ["---", "", "## 1. 闸门判定总表", "", "| 场景 | 天数 | 月度通胀 | 银行资不抵债 | 基尼 | AI 份额 | AI 破产 | AI 违约 | 市场份额 | 对账 |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for result in results:
        gate = {g["name"]: g for g in result["gates"]}
        lines.append(_gate_row(result, gate))
    lines.append("")
    lines += ["> 结论：**PASS** 表示通过全部 10 项上线闸门；任何一项 FAIL 都不得进入阶段 A 生产。", ""]
    for result in results:
        lines += _scenario_section(result)
    lines += _findings(results)
    if charts_file:
        lines += ["---", "", f"## 4. 图表", "", f"交互图表见 [`{charts_file}`]({charts_file})（浏览器打开）。", ""]
    return "\n".join(lines)


def _header(result: dict) -> list:
    sc = result["scenario"]
    return [
        f"> 生成时间：模拟器 v0.1 · 参数版本 `{result['policy_id']}` · 关系费默认关闭",
        "",
        "## 0. 参数口径",
        "",
        _table([
            ("发行锚（01 §4.1）", f"active×{cfg.POLICY.active_weight} + 成交额×{cfg.POLICY.volume_factor}，"
                                f"平滑 {cfg.POLICY.smoothing}，下限 {cfg.POLICY.min_daily} / 上限 {cfg.POLICY.max_daily}，"
                                f"{fmt(cfg.POLICY.reward_share * 100, 0)}% 进流通"),
            ("向上兑换（01 §5.2）", "5:1 + 阶梯手续费（≤1k 6% / ≤10k 5% / ≤100k 4% / 其余 3%），向下 1:4.60"),
            ("银行（02）", f"准备金率 {pct(cfg.BANK.reserve_ratio)}，基准利率 {cfg.BANK.policy_rate_bps/100:.1f}%，"
                        f"存贷差 {cfg.BANK.demand_spread_bps}bp / +{cfg.BANK.loan_spread_bps}bp，逾期 {cfg.BANK.default_days} 天清算"),
            ("市场费率（03/04/05）", f"商品税 {pct(cfg.MARKET.commodity_tax)}、印花税 {pct(cfg.MARKET.stamp_tax)}、"
                                 f"产权转让税 {pct(cfg.MARKET.property_tax)}、持有税 {pct(cfg.MARKET.holding_tax_month)}/月"),
            ("初始货币存量", f"`m0_days={sc['m0_days']}` × 当日基础发行量，稳态月化通胀 ≈ {fmt(Decimal(30) / cfg.SCENARIOS['baseline'].m0_days * 100, 1)}%"),
            ("AI 玩家", f"{sc['ai_count']} 名（正式 player，与真人同费率/税/限额），初始资本 {fmt(sc['ai_capital'])} Q1/人"),
        ]),
        "",
    ]


def _table(rows) -> str:
    lines = ["| 项目 | 取值 |", "|---|---|"]
    lines += [f"| {name} | {value} |" for name, value in rows]
    lines.append("")
    return "\n".join(lines)


def _gate_row(result: dict, gate: dict) -> str:
    label = result["scenario"]["label"]
    days = result["days"]
    inflation = result["inflation"]
    infl_txt = " / ".join(f"{m['rate']*100:.2f}%" for m in inflation) if inflation else "—"
    ai = result["ai"]
    ok = all(g["passed"] for g in result["gates"])
    return (f"| {label} | {days} | {infl_txt} | {'✓' if gate['银行资不抵债']['passed'] else '✗'} "
            f"| {gate['基尼系数']['value']} | {ai['share']*100:.1f}% "
            f"| {ai['bankrupt_rate']*100:.1f}% | {ai['default_rate']*100:.1f}% "
            f"| {gate['单一 actor 市场份额']['value']} | {'0' if gate['账本对账']['passed'] else '≠0'} "
            f"| {'PASS' if ok else 'FAIL'} |")


def _scenario_section(result: dict) -> list:
    sc = result["scenario"]
    last = result["series"][-1]
    bank = result["bank"]
    stats = result["stats"]
    lines = [
        f"## 2. {sc['label']}场景（{sc['name']}，{result['days']} 天）",
        "",
        f"- 玩家：真人 {sc['humans']} + AI {sc['ai_count']}；人均产出 {sc['am_per_day']} 反物质/日",
        f"- M1：{fmt(result['series'][0]['m1'], 0)} → {fmt(result['m1'], 0)} Q1",
        f"- 交易笔数：{result['tx']:,}；月末 Gini {last['gini']:.4f}",
        "",
        "| 指标 | 月末值 |",
        "|---|---:|",
        f"| 月度通胀 | {_infl(result)} |",
        f"| 银行存款 / 贷款 | {fmt(bank['deposits'], 0)} / {fmt(bank['loans'], 0)} Q1 |",
        f"| 现金/存款覆盖 / 坏账率 | {bank['reserve_ratio']*100:.1f}% / {bank['bad_debt_rate']*100:.2f}% |",
        f"| 挤兑次数 / 央行再融资 | {bank['runs']} / {fmt(stats.get('refinance', ZERO), 0)} Q1 |",
        f"| 累计发行 / 累计销毁 | {fmt(stats.get('issuance', ZERO), 0)} / {fmt(result.get('burn_total', ZERO), 0)} Q1 |",
        f"| 高阶货币兑换费（销毁） | {fmt(stats.get('exchange_fee_burn_q1', ZERO), 0)} Q1 |",
        f"| 产权成交 | {stats.get('property_sales', 0)} 笔 / {fmt(stats.get('property_volume', ZERO), 0)} Q1 |",
        f"| 熔断 / 退市 | {stats.get('circuit_breakers', 0)} 次 / {stats.get('delistings', 0)} 家 |",
        "",
        "### 闸门明细",
        "",
        "| 闸门 | 实测 | 门槛 | 结论 |",
        "|---|---:|---:|---:|",
    ]
    for gate in result["gates"]:
        lines.append(f"| {gate['name']} | {gate['value']} | {gate['threshold']} | {'✓' if gate['passed'] else '✗'} |")
    lines.append("")
    return lines


def _infl(result: dict) -> str:
    rates = [m["rate"] for m in result["inflation"]]
    if not rates:
        return "—"
    return " / ".join(f"{r*100:.2f}%" for r in rates)


def _findings(results: list) -> list:
    lines = ["---", "", "## 3. 关键发现", ""]
    for result in results:
        sc = result["scenario"]
        first = result["series"][0]["m1"]
        last = result["series"][-1]["m1"]
        stats = result["stats"]
        issued = Decimal(stats.get("issuance", "0"))
        loans = result["bank"]["loans"]
        fee_burn = Decimal(stats.get("exchange_fee_burn_q1", "0"))
        growth = (last - first) / first if first > ZERO else ZERO
        share = result["ai"]["share"]
        lines.append(f"### {sc['label']}场景（{result['days']} 天）")
        lines.append("")
        lines.append(f"- **M1 累计 +{growth*100:.2f}%**（{result['days']} 天）：发行 +{fmt(issued, 0)}、"
                     f"银行信用（净贷款）约 +{fmt(loans, 0)}、兑换/税销毁 −"
                     f"{fmt(fee_burn + Decimal(stats.get('holding_tax', '0')), 0)} Q1。"
                     f"发行锚仅贡献约 {fmt(issued/first*100, 1)}%，其余来自信用扩张与净回收。")
        lines.append(f"- 高阶货币兑换费 {fmt(fee_burn, 0)} Q1，占同期发行 {pct(fee_burn / issued if issued > ZERO else ZERO, 1)}，"
                     f"是主要的制度性回收口（产权/股票活动越多，销毁越多）。")
        if share >= Decimal("0.35"):
            lines.append(f"- **AI 净资产份额 {share*100:.1f}%，超出 35% 闸门**：低配场景下 AI 的种子行星/初始资本"
                         f"相对真人占比过高，建议减少 AI 数量或降低 AI 初始资产（见 06 §4 初始资本由模拟参数决定）。")
        else:
            lines.append(f"- AI 净资产份额 {share*100:.1f}%，未形成垄断；Gini {result['series'][-1]['gini']:.3f}，"
                         f"无单主体市场份额 >40%。")
        lines.append("")
    lines.append("> 注意：以上为离线近似，商品成交量按 `min(供给, 需求)` 撮合，未建模贸易商套利层；"
                 "上线前仍需与真实行情/订单簿对拍（07 §6.4）。")
    lines.append("")
    return lines
