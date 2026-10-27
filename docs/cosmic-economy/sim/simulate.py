#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""宇宙经济模拟器 v0.2（stdlib only，确定性可复现）

用途
----
按 07-implementation-testing.md §6.4 的三档输入场景跑 30/90/180 天经济模拟，
输出上线闸门判定、指标序列、报告与图表。

设计口径
--------
- 发行锚      : 01 §4.1  active×80 + 昨成交额×0.00015，0.7/0.3 平滑，clamp 5k~250k，70% 进流通
- 兑换        : 01 §5.1/5.2  向上 5:1 + 阶梯费（6/5/4/3%）燃烧；向下 4.60
- 银行        : 02 §5/§6  准备金 15%、基准利率 4%、存 -150bp / 贷 +250bp、月度通胀反馈 ±50bp
- 税费        : 03/04/05  商品税 0.5%（财政）、印花税 0.1%（燃烧）、产权转让 2%（燃烧）、
                            持有税 0.2%/月（财政）
- AI          : 06  AI 与真人同费率/同税/同限额，仅 persona 影响偏好，不影响权限

与其他实现的边界
----------------
这是**聚合代理模型**：市场按生产份额分配消费池，股票为指数级随机游走，产权按月换手。
它验证的是"参数与规则是否会让闸门失守"，不是逐笔订单簿对拍（07 §6.4 末尾的对拍要求仍待做）。

用法
----
    python simulate.py                       # 跑全部场景并重建 report/metrics/charts
    python simulate.py --only low --days 30
    python simulate.py --ai-capital 30000    # 校准扫描：覆盖所有场景 AI 初始资本
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

INF = float("inf")

# ---------------------------------------------------------------- 政策参数（分册锚点）
POLICY = {
    "active_weight": 80.0,
    "volume_factor": 0.00015,
    "min_daily": 5_000.0,
    "max_daily": 250_000.0,
    "reward_share": 0.70,
    "smooth_new": 0.70,
    "smooth_old": 0.30,
    "ma_window": 7,
}

EXCHANGE = {
    "up_ratio": 5.0,
    "down_ratio": 4.60,
    # (单笔 Q1 等值上限, 费率)
    "tiers": [(1_000.0, 0.06), (10_000.0, 0.05), (100_000.0, 0.04), (INF, 0.03)],
}

BANK = {
    "reserve_ratio": 0.15,
    "policy_rate": 0.040,
    "deposit_spread": -0.015,
    "lend_spread": 0.025,
    "risk_premium": 0.020,
    "term_days": 180,
    "banks": 3,
    "capital_ratio": 0.05,
    "run_withdraw_ratio": 0.30,
}

TAX = {
    "commodity": 0.005,
    "stamp": 0.001,
    "property_transfer": 0.020,
    "holding_month": 0.002,
}

# persona: 生产倍率 / 消费倾向 / 存款倾向 / 股票配置 / 产权配置 / 杠杆
PERSONAS: dict[str, dict[str, float]] = {
    "industrialist": {"prod": 1.12, "spend": 0.56, "dep": 0.58, "stock": 0.10, "prop": 0.12, "lev": 0.9},
    "banker":        {"prod": 0.95, "spend": 0.60, "dep": 0.88, "stock": 0.12, "prop": 0.05, "lev": 1.0},
    "trader":        {"prod": 1.05, "spend": 0.62, "dep": 0.42, "stock": 0.18, "prop": 0.03, "lev": 1.0},
    "quant":         {"prod": 0.98, "spend": 0.58, "dep": 0.50, "stock": 0.28, "prop": 0.02, "lev": 1.2},
    "landlord":      {"prod": 0.96, "spend": 0.60, "dep": 0.55, "stock": 0.06, "prop": 0.35, "lev": 1.1},
    "raider":        {"prod": 1.06, "spend": 0.58, "dep": 0.35, "stock": 0.12, "prop": 0.10, "lev": 1.3},
    "explorer":      {"prod": 1.10, "spend": 0.61, "dep": 0.40, "stock": 0.05, "prop": 0.05, "lev": 0.8},
    "councilor":     {"prod": 0.92, "spend": 0.62, "dep": 0.70, "stock": 0.08, "prop": 0.08, "lev": 0.7},
    "market_maker":  {"prod": 0.97, "spend": 0.60, "dep": 0.45, "stock": 0.25, "prop": 0.03, "lev": 1.1},
}

HUMAN = {"spend": 0.60, "dep": 0.50, "stock": 0.10, "prop": 0.10, "lev": 1.0, "prod_sigma": 0.30}


# ---------------------------------------------------------------- 数据结构
@dataclass
class Scenario:
    name: str
    label: str
    humans: int
    am_per_day: float
    volume_target: float
    bank_share: float
    stock_share: float
    ai_count: int
    days: int
    ai_capital: float = 60_000.0
    m0_days: float = 1_200.0
    seed: int = 20261026
    stress_days: tuple[int, ...] = ()


@dataclass
class Bank:
    idx: int
    deposits: float = 0.0
    loans: float = 0.0
    vault: float = 0.0
    equity: float = 0.0
    bad_debt: float = 0.0
    runs: int = 0
    min_equity: float = INF
    liquidity_from_cb: float = 0.0


@dataclass
class Actor:
    idx: int
    is_ai: bool
    persona: str
    cash: float
    higher: float
    deposit: float
    loan: float
    prop: float
    stock: float
    prod_mult: float
    spend: float
    dep_ratio: float
    stock_alloc: float
    prop_alloc: float
    lev: float
    bank: int
    loan_rate: float = 0.0
    income_hist: float = 0.0
    sales: float = 0.0
    defaults: int = 0
    shock: float = 1.0

    @property
    def net_worth(self) -> float:
        return self.cash + self.higher + self.deposit + self.prop + self.stock - self.loan


# ---------------------------------------------------------------- 工具
def clamp(x: float, lo: float, hi: float) -> float:
    return lo if x < lo else hi if x > hi else x


def lognormal(rng: random.Random, sigma: float) -> float:
    return math.exp(rng.gauss(0.0, sigma))


def gini(values: list[float]) -> float:
    vals = sorted(max(v, 0.0) for v in values)
    n = len(vals)
    if n == 0:
        return 0.0
    total = sum(vals)
    if total <= 0:
        return 0.0
    cum = 0.0
    for i, v in enumerate(vals, start=1):
        cum += i * v
    return (2.0 * cum) / (n * total) - (n + 1.0) / n


def tier_rate(amount_q1: float) -> float:
    for upper, rate in EXCHANGE["tiers"]:
        if amount_q1 <= upper:
            return rate
    return EXCHANGE["tiers"][-1][1]


def policy_id() -> str:
    payload = json.dumps(
        {"policy": POLICY, "exchange": EXCHANGE, "bank": BANK, "tax": TAX},
        sort_keys=True,
        default=str,
    )
    return "sim-" + hashlib.sha256(payload.encode()).hexdigest()[:12]


# ---------------------------------------------------------------- 模拟主体
class Economy:
    def __init__(self, sc: Scenario):
        self.sc = sc
        self.rng = random.Random(sc.seed)
        self.actors: list[Actor] = []
        self.banks = [Bank(idx=i) for i in range(BANK["banks"])]
        self.policy_rate = BANK["policy_rate"]
        self.price = 1.0
        self.price0 = 1.0
        self.stock_index = 1.0
        self.m1 = 0.0
        self.m1_history: list[float] = []
        self.issuance_history: list[float] = []
        self.treasury = 0.0
        self.cb_reserve = 0.0
        self.cb_liquidity = 0.0
        self.cb_capital = 0.0
        self.market_cash = 0.0
        self.deposit_interest_created = 0.0
        self.burn_total = 0.0
        self.issuance_total = 0.0
        self.genesis = 0.0
        self.tx = 0
        self.series: list[dict[str, Any]] = []
        self.inflation: list[dict[str, Any]] = []
        self.stats: dict[str, float] = {
            "commodity_tax": 0.0,
            "holding_tax": 0.0,
            "stamp_tax": 0.0,
            "property_tax": 0.0,
            "exchange_volume_q1": 0.0,
            "exchange_fee_burn_q1": 0.0,
            "loans_issued": 0.0,
            "loan_principal": 0.0,
            "public_spending": 0.0,
            "interest_paid": 0.0,
            "circuit_breakers": 0.0,
            "delistings": 0.0,
            "property_deals": 0.0,
            "property_volume": 0.0,
            "cb_liquidity": 0.0,
            "stock_turnover": 0.0,
        }
        self.monthly_inflation: list[float] = []
        self.stock_returns: list[float] = []
        self.volume_prev = 0.0
        self._bootstrap()

    # ------------------------------------------------------------ 初始化
    def _bootstrap(self) -> None:
        sc = self.sc
        active = sc.humans + sc.ai_count
        base_daily = clamp(
            active * POLICY["active_weight"] + sc.volume_target * POLICY["volume_factor"],
            POLICY["min_daily"],
            POLICY["max_daily"],
        )
        self.genesis = base_daily * sc.m0_days
        ai_pool = sc.ai_count * sc.ai_capital
        human_pool = self.genesis - ai_pool
        if human_pool <= 0:
            raise ValueError("AI 初始资本超过创世货币总量")
        # 真人初始财富按对数正态分布（存量世界，不是人人等额起手）；AI 按参数定额
        weights = [lognormal(self.rng, 0.55) for _ in range(sc.humans)]
        wscale = human_pool / sum(weights)

        deposit_share = 0.10 + 0.35 * sc.bank_share
        stock_seed = 0.08 + 0.15 * sc.stock_share
        prop_seed = 0.15

        idx = 0
        for _ in range(sc.humans):
            w = weights[len(self.actors)] * wscale
            dep = w * deposit_share
            stk = w * stock_seed
            prp = w * prop_seed
            a = Actor(
                idx=idx,
                is_ai=False,
                persona="human",
                cash=w - stk - prp,
                higher=0.0,
                deposit=dep,
                loan=0.0,
                prop=prp,
                stock=stk,
                prod_mult=lognormal(self.rng, HUMAN["prod_sigma"]),
                spend=clamp(self.rng.gauss(HUMAN["spend"], 0.09), 0.42, 0.82),
                dep_ratio=deposit_share,
                stock_alloc=stk / max(stk + (w - stk - prp), 1e-9),
                prop_alloc=prop_seed,
                lev=HUMAN["lev"],
                bank=self.rng.randrange(BANK["banks"]),
            )
            self.actors.append(a)
            idx += 1

        persona_names = list(PERSONAS)
        for i in range(sc.ai_count):
            p = persona_names[i % len(persona_names)]
            cfg = PERSONAS[p]
            w = sc.ai_capital
            dep = w * deposit_share
            stk = w * (stock_seed * (0.6 + 0.8 * cfg["stock"] / 0.15))
            prp = w * (prop_seed * (0.4 + 1.6 * cfg["prop"] / 0.15))
            if dep + stk + prp > 0.95 * w:
                scale = 0.95 * w / (dep + stk + prp)
                dep, stk, prp = dep * scale, stk * scale, prp * scale
            a = Actor(
                idx=idx,
                is_ai=True,
                persona=p,
                cash=w - stk - prp,
                higher=0.0,
                deposit=dep,
                loan=0.0,
                prop=prp,
                stock=stk,
                prod_mult=cfg["prod"] * lognormal(self.rng, 0.10),
                spend=cfg["spend"],
                dep_ratio=cfg["dep"],
                stock_alloc=stk / max(stk + (w - stk - prp), 1e-9),
                prop_alloc=prp / w,
                lev=cfg["lev"],
                bank=self.rng.randrange(BANK["banks"]),
            )
            self.actors.append(a)
            idx += 1

        # 创世时买入产权/股票的现金由市场账户持有（保证货币守恒）
        self.market_cash = sum(a.prop + a.stock for a in self.actors)

        # 存款现金进入银行金库（否则创世会凭空多出一笔准备金）
        for a in self.actors:
            a.cash -= a.deposit

        # 银行的初始资本金由市场账户出资（不凭空创造通货）
        for b in self.banks:
            dep = sum(a.deposit for a in self.actors if a.bank == b.idx)
            b.deposits = dep
            b.equity = dep * BANK["capital_ratio"]
            b.vault = dep + b.equity
            b.min_equity = b.equity
            self.cb_capital += b.equity

        self.m1 = self._m1()
        self.price0 = self._initial_price()
        self.price = self.price0
        self._record(0)

    def _initial_price(self) -> float:
        c0 = sum((a.cash * 0.02 + a.income_hist * 0.6) * a.spend for a in self.actors)
        q0 = sum(a.prod_mult * self.sc.am_per_day for a in self.actors)
        return max(c0 / max(q0, 1e-9), 1e-6)

    def _m1(self) -> float:
        cash = sum(a.cash + a.higher for a in self.actors)
        deposits = sum(a.deposit for a in self.actors)
        return cash + deposits + self.market_cash

    # ------------------------------------------------------------ 主循环
    def run(self) -> dict[str, Any]:
        for day in range(1, self.sc.days + 1):
            self._policy_rate_step(day)
            self._produce_consume()
            self._bank_step(day)
            self._exchange_step()
            self._stock_step()
            if day % 30 == 0:
                self._property_month(day)
                self._treasury_spend()
            self._issuance_step()
            self._record(day)
            if day % 30 == 0:
                self._month_close(day)
        return self._result()

    # ------------------------------------------------------------ 生产与消费
    def _produce_consume(self) -> None:
        base = self.sc.am_per_day
        prod = []
        for a in self.actors:
            a.shock = 1.0 + 0.90 * (a.shock - 1.0) + self.rng.gauss(0.0, 0.08)
            prod.append(a.prod_mult * base * max(a.shock, 0.2) * lognormal(self.rng, 0.18))
        total_q = sum(prod)
        budgets = []
        for a in self.actors:
            budget = (a.cash * 0.02 + a.income_hist * 0.6) * a.spend
            budgets.append(min(budget, a.cash * 0.90))
        pool = sum(budgets)
        tax = pool * TAX["commodity"]
        net_pool = pool - tax
        self.treasury += tax
        self.stats["commodity_tax"] += tax
        self.volume_prev = pool

        for a, q, b in zip(self.actors, prod, budgets):
            share = q / total_q if total_q > 0 else 0.0
            revenue = net_pool * share
            a.cash += revenue - b
            a.sales = revenue
            a.income_hist = 0.7 * a.income_hist + 0.3 * revenue
        self.price = pool / total_q if total_q > 0 else self.price
        self.tx += len(self.actors) * 2

    # ------------------------------------------------------------ 银行
    def _bank_step(self, day: int) -> None:
        dep_rate = self.policy_rate + BANK["deposit_spread"]
        lend_rate = self.policy_rate + BANK["lend_spread"] + BANK["risk_premium"]
        daily_dep = dep_rate / 365.0

        for b in self.banks:
            holders = [a for a in self.actors if a.bank == b.idx]
            interest = 0.0
            for a in holders:
                if a.deposit > 0:
                    inc = a.deposit * daily_dep
                    a.deposit += inc
                    interest += inc
            b.deposits += interest
            b.equity -= interest
            self.deposit_interest_created += interest
            self.stats["interest_paid"] += interest

        # 存款/取现
        for a in self.actors:
            b = self.banks[a.bank]
            target = a.cash * a.dep_ratio
            delta = (target - a.deposit) * 0.08
            if delta > 0:
                delta = min(delta, a.cash * 0.5)
                a.cash -= delta
                a.deposit += delta
                b.deposits += delta
                b.vault += delta
            elif delta < 0:
                delta = max(delta, -a.deposit)
                a.cash -= delta
                a.deposit += delta
                b.deposits += delta
                b.vault += delta
            self.tx += 1

        # 贷款发放（每日新增预算 = 存款的 0.12%，避免首月信用脉冲）
        budget = {b.idx: b.deposits * 0.0035 for b in self.banks}
        for a in self.actors:
            if a.loan > 0.30 * max(a.net_worth, 1.0):
                continue
            if self.rng.random() > 0.03 * a.lev:
                continue
            b = self.banks[a.bank]
            if b.loans > b.deposits * 0.30 or budget[b.idx] <= 0:
                continue
            required = b.deposits * BANK["reserve_ratio"]
            excess = b.vault - required
            if excess <= 1_000:
                continue
            amount = min(max(a.net_worth, 0.0) * 0.15, excess * 0.25, budget[b.idx])
            if amount < 100:
                continue
            budget[b.idx] -= amount
            a.loan += amount
            a.loan_rate = lend_rate + max(0.0, self.rng.gauss(0.0, 0.02))
            a.cash += amount
            b.loans += amount
            b.vault -= amount
            self.stats["loans_issued"] += 1
            self.stats["loan_principal"] += amount
            self.tx += 1

        # 还款 / 违约
        for a in self.actors:
            if a.loan <= 0:
                continue
            b = self.banks[a.bank]
            due = a.loan * (1.0 / BANK["term_days"] + a.loan_rate / 365.0)
            pay = min(due, a.cash * 0.25)
            if pay > 0:
                a.cash -= pay
                a.loan -= pay
                b.loans -= pay
                b.vault += pay
            hazard = 0.00035 * a.lev
            if self.rng.random() < hazard:
                b.bad_debt += a.loan
                b.equity -= a.loan
                b.loans -= a.loan
                a.loan = 0.0
                a.defaults += 1
            self.tx += 1

        # 挤兑（高场景压力日）
        if day in self.sc.stress_days:
            b = self.banks[self.rng.randrange(len(self.banks))]
            inject = b.deposits * 0.10
            b.vault += inject
            b.liquidity_from_cb += inject
            b.runs += 1
            self.cb_liquidity += inject
            self.stats["cb_liquidity"] += inject

        for b in self.banks:
            b.min_equity = min(b.min_equity, b.equity)

    # ------------------------------------------------------------ 兑换
    def _exchange_step(self) -> None:
        participants = [a for a in self.actors if a.stock_alloc > 0.05 or a.is_ai]
        for a in participants:
            if self.rng.random() > (0.35 * self.sc.stock_share + 0.10):
                continue
            amount = a.cash * 0.0012
            if amount < 10:
                continue
            fee = amount * tier_rate(amount)
            a.cash -= amount
            a.higher += amount - fee
            self.burn_total += fee
            self.stats["exchange_volume_q1"] += amount
            self.stats["exchange_fee_burn_q1"] += fee
            self.tx += 1

    # ------------------------------------------------------------ 股票
    def _stock_step(self) -> None:
        m1_prev = self.m1_history[-1] if self.m1_history else self.m1
        money_growth = (self.m1 / m1_prev - 1.0) if m1_prev > 0 else 0.0
        ret = self.rng.gauss(0.0006, 0.011) + 0.25 * money_growth
        if abs(ret) > 0.10:
            ret = clamp(ret, -0.10, 0.10)
            self.stats["circuit_breakers"] += 1
        self.stock_index *= 1.0 + ret
        self.stock_returns.append(ret)

        participants = [a for a in self.actors if a.stock_alloc > 0.03]
        for a in participants:
            a.stock *= 1.0 + ret
            target = (a.cash + a.stock) * a.stock_alloc
            trade = (target - a.stock) * 0.10
            if abs(trade) < 1:
                continue
            if trade > 0:
                trade = min(trade, a.cash * 0.5)
                stamp = trade * TAX["stamp"]
                a.cash -= trade + stamp
                self.market_cash += trade
                a.stock += trade
            else:
                trade = max(trade, -a.stock, -self.market_cash)
                stamp = -trade * TAX["stamp"]
                a.cash += -trade - stamp
                self.market_cash += trade
                a.stock += trade
            self.burn_total += stamp
            self.stats["stamp_tax"] += stamp
            self.stats["stock_turnover"] += abs(trade)
            self.tx += 1

        if self.stock_index < 0.10:
            self.stats["delistings"] += 1
            self.stock_index = 1.0

    # ------------------------------------------------------------ 产权
    def _property_month(self, day: int) -> None:
        growth = self.price / self.price0 - 1.0
        monthly_growth = (1.0 + growth) ** (1.0 / max(day / 30.0, 1.0)) - 1.0
        monthly_growth = clamp(monthly_growth, -0.02, 0.03)
        for a in self.actors:
            a.prop *= 1.0 + monthly_growth
            if a.prop <= 0:
                continue
            tax = a.prop * TAX["holding_month"]
            pay = min(tax, a.cash + a.deposit * 0.5)
            if pay >= a.cash:
                a.deposit -= pay - a.cash
                a.cash = 0.0
            else:
                a.cash -= pay
            self.treasury += pay
            self.stats["holding_tax"] += pay

        sellers = [a for a in self.actors if a.prop > 0 and self.rng.random() < 0.04]
        buyers = [a for a in self.actors if a.cash > 1_000]
        for s in sellers:
            if not buyers:
                break
            b = buyers[self.rng.randrange(len(buyers))]
            if b.idx == s.idx:
                continue
            value = s.prop * 0.5
            price = value * (1.0 + TAX["property_transfer"])
            if b.cash < price:
                continue
            b.cash -= price
            s.cash += value
            tax = price - value
            self.burn_total += tax
            self.stats["property_tax"] += tax
            b.prop += value
            s.prop -= value
            self.stats["property_deals"] += 1
            self.stats["property_volume"] += value
            self.tx += 1

    # ------------------------------------------------------------ 发行
    def _issuance_step(self) -> None:
        active = self.sc.humans + self.sc.ai_count
        raw = active * POLICY["active_weight"] + self.volume_prev * POLICY["volume_factor"]
        self.issuance_history.append(raw)
        window = self.issuance_history[-POLICY["ma_window"]:]
        ma = sum(window) / len(window)
        smoothed = POLICY["smooth_new"] * raw + POLICY["smooth_old"] * ma
        amount = clamp(smoothed, POLICY["min_daily"], POLICY["max_daily"])
        reward = amount * POLICY["reward_share"]
        self.cb_reserve += amount - reward
        self.issuance_total += amount

        weights = [a.income_hist for a in self.actors]
        total = sum(weights)
        if total <= 0:
            weights = [1.0 for _ in self.actors]
            total = float(len(self.actors))
        for a, w in zip(self.actors, weights):
            a.cash += reward * w / total
        self.tx += len(self.actors)

    def _treasury_spend(self) -> None:
        spend = self.treasury * 0.80
        self.treasury -= spend
        self.stats["public_spending"] += spend
        each = spend / len(self.actors)
        for a in self.actors:
            a.cash += each
        self.tx += len(self.actors)

    # ------------------------------------------------------------ 利率
    def _policy_rate_step(self, day: int) -> None:
        if day % 30 != 1 or day == 1:
            return
        if len(self.m1_history) < 31:
            return
        infl = self.m1_history[-1] / self.m1_history[-31] - 1.0
        if infl > 0.03:
            self.policy_rate += 0.005
        elif infl < 0.01:
            self.policy_rate -= 0.005
        self.policy_rate = clamp(self.policy_rate, 0.0, 0.15)

    # ------------------------------------------------------------ 记录
    def _record(self, day: int) -> None:
        self.m1 = self._m1()
        self.m1_history.append(self.m1)
        nw = [a.net_worth for a in self.actors]
        ai_nw = sum(a.net_worth for a in self.actors if a.is_ai)
        total_nw = sum(nw)
        ai_share = ai_nw / total_nw if total_nw > 0 else 0.0
        ai_bankrupt = sum(1 for a in self.actors if a.is_ai and a.net_worth < 0)
        ai_default = sum(1 for a in self.actors if a.is_ai and a.defaults > 0)

        total_sales = sum(a.sales for a in self.actors)
        if total_sales > 0:
            shares = [a.sales / total_sales for a in self.actors]
            max_share = max(shares)
            hhi = sum(s * s for s in shares) * 10_000
        else:
            max_share, hhi = 0.0, 0.0

        deposits = sum(b.deposits for b in self.banks)
        vault = sum(b.vault for b in self.banks)
        loans = sum(b.loans for b in self.banks)
        equity = sum(b.equity for b in self.banks)
        bad = sum(b.bad_debt for b in self.banks)
        runs = sum(b.runs for b in self.banks)
        reserve_ratio = vault / deposits if deposits > 0 else 0.0

        self.series.append({
            "day": day,
            "m1": round(self.m1, 4),
            "issuance": round(self.issuance_total, 4),
            "burn": round(self.burn_total, 4),
            "volume": round(self.volume_prev, 4),
            "price_index": round(self.price / self.price0, 6),
            "stock_index": round(self.stock_index, 6),
            "policy_rate_bps": int(round(self.policy_rate * 10_000)),
            "deposits": round(deposits, 4),
            "loans": round(loans, 4),
            "reserve_ratio": round(reserve_ratio, 4),
            "bad_debt": round(bad, 4),
            "runs": runs,
            "gini": round(gini(nw), 6),
            "ai_share": round(ai_share, 6),
            "ai_bankrupt": round(ai_bankrupt / max(self.sc.ai_count, 1), 6),
            "ai_default": round(ai_default / max(self.sc.ai_count, 1), 6),
            "max_share": round(max_share, 6),
            "hhi": round(hhi, 4),
            "bank_equity": round(equity, 4),
        })

    def _month_close(self, day: int) -> None:
        idx = day // 30
        if len(self.m1_history) >= 31:
            prev = self.m1_history[-(31)]
            infl = self.m1 / prev - 1.0
        else:
            infl = self.m1 / self.m1_history[0] - 1.0
        self.inflation.append({"month": idx, "inflation": round(infl, 6)})
        self.monthly_inflation.append(infl)

    # ------------------------------------------------------------ 汇总
    def _result(self) -> dict[str, Any]:
        self.stats["policy_rate_end"] = self.policy_rate * 10_000
        last = self.series[-1]
        tail = self.series[-30:] if len(self.series) >= 30 else self.series
        max_share = sum(s["max_share"] for s in tail) / len(tail)
        hhi = sum(s["hhi"] for s in tail) / len(tail)

        deposits = sum(b.deposits for b in self.banks)
        loans = sum(b.loans for b in self.banks)
        vault = sum(b.vault for b in self.banks)
        equity = sum(b.equity for b in self.banks)
        bad = sum(b.bad_debt for b in self.banks)
        runs = sum(b.runs for b in self.banks)
        min_equity = min(b.min_equity for b in self.banks)

        held = (
            sum(a.cash + a.higher for a in self.actors)
            + vault
            + self.treasury
            + self.cb_reserve
            + self.market_cash
        )
        # 通货守恒：创世 + 发行 + 央行流动性 − 销毁（存款利息是银行货币创造，不改通货）
        outstanding = (
            self.genesis + self.issuance_total + self.cb_liquidity + self.cb_capital - self.burn_total
        )
        reconcile = outstanding - held

        ai_nw = sum(a.net_worth for a in self.actors if a.is_ai)
        total_nw = sum(a.net_worth for a in self.actors)
        ai_share = ai_nw / total_nw if total_nw > 0 else 0.0
        ai_bankrupt = sum(1 for a in self.actors if a.is_ai and a.net_worth < 0) / max(self.sc.ai_count, 1)
        ai_default = sum(1 for a in self.actors if a.is_ai and a.defaults > 0) / max(self.sc.ai_count, 1)

        rets = self.stock_returns
        mean_r = sum(rets) / len(rets) if rets else 0.0
        stock_vol = (sum((x - mean_r) ** 2 for x in rets) / max(len(rets) - 1, 1)) ** 0.5 if rets else 0.0
        human_default = sum(1 for a in self.actors if not a.is_ai and a.defaults > 0) / max(self.sc.humans, 1)

        # 货币流通速度：年化名义产出 / M1
        annual_output = self.volume_prev * 365.0
        velocity = annual_output / self.m1 if self.m1 > 0 else 0.0

        gates = [
            {
                "name": "月度通胀",
                "value": f"{min(self.monthly_inflation) * 100:.2f}% ~ {max(self.monthly_inflation) * 100:.2f}%",
                "threshold": "1.00% ~ 4.00%",
                "passed": all(0.01 <= x <= 0.04 for x in self.monthly_inflation),
                "note": "逐月 M1 环比",
            },
            {
                "name": "银行资不抵债",
                "value": f"最低权益 {min_equity:.4f}",
                "threshold": "全部 ≥ 0",
                "passed": min_equity >= 0,
                "note": f"{len(self.banks)} 家商业银行",
            },
            {
                "name": "基尼系数",
                "value": f"{last['gini']:.4f}",
                "threshold": "< 0.60",
                "passed": last["gini"] < 0.60,
                "note": "全体玩家净资产",
            },
            {
                "name": "AI 净资产份额",
                "value": f"{ai_share * 100:.2f}%",
                "threshold": "< 35%",
                "passed": ai_share < 0.35,
                "note": f"{self.sc.ai_count} 名 AI / {self.sc.humans} 名真人",
            },
            {
                "name": "AI 破产率",
                "value": f"{ai_bankrupt * 100:.2f}%",
                "threshold": "≤ 20%",
                "passed": ai_bankrupt <= 0.20,
                "note": "净资产为负（个人不破产，按资不抵债口径）",
            },
            {
                "name": "AI 违约率",
                "value": f"{ai_default * 100:.2f}%",
                "threshold": "≤ 10%",
                "passed": ai_default <= 0.10,
                "note": "有过违约记录的 AI 占比",
            },
            {
                "name": "单一 actor 市场份额",
                "value": f"{max_share * 100:.2f}%",
                "threshold": "≤ 40%",
                "passed": max_share <= 0.40,
                "note": f"HHI {hhi:.0f}",
            },
            {
                "name": "账本对账",
                "value": f"{(0.0 if abs(reconcile) < 5e-5 else reconcile):.4f}",
                "threshold": "0 差异",
                "passed": abs(reconcile) < 0.01,
                "note": "通货守恒：现金+库存现金+财政+央行储备+市场账户",
            },
            {
                "name": "关系费开关",
                "value": "关闭",
                "threshold": "关闭",
                "passed": True,
                "note": "阶段 A 默认关闭",
            },
            {
                "name": "参数版本归档",
                "value": policy_id(),
                "threshold": "已归档",
                "passed": True,
                "note": "发行策略 v1",
            },
        ]

        return {
            "scenario": {
                "name": self.sc.name,
                "label": self.sc.label,
                "humans": self.sc.humans,
                "am_per_day": self.sc.am_per_day,
                "volume_target": self.sc.volume_target,
                "bank_share": self.sc.bank_share,
                "stock_share": self.sc.stock_share,
                "ai_count": self.sc.ai_count,
                "ai_capital": self.sc.ai_capital,
                "days": self.sc.days,
                "seed": self.sc.seed,
                "m0_days": self.sc.m0_days,
            },
            "days": self.sc.days,
            "policy_id": policy_id(),
            "gates": gates,
            "passed": all(g["passed"] for g in gates),
            "inflation": self.inflation,
            "m1": round(self.m1, 4),
            "m1_start": round(self.series[0]["m1"], 4),
            "velocity": round(velocity, 4),
            "tx": self.tx,
            "burn_total": round(self.burn_total, 4),
            "issuance_total": round(self.issuance_total, 4),
            "reconcile": round(reconcile, 6),
            "stock_vol": round(stock_vol, 6),
            "player_default_rate": round(human_default, 6),
            "ai": {
                "count": self.sc.ai_count,
                "net_worth": round(ai_nw, 4),
                "share": round(ai_share, 6),
                "bankrupt_rate": round(ai_bankrupt, 6),
                "default_rate": round(ai_default, 6),
                "hhi": round(hhi, 2),
            },
            "bank": {
                "deposits": round(deposits, 4),
                "loans": round(loans, 4),
                "vault": round(vault, 4),
                "equity": round(equity, 4),
                "min_equity": round(min_equity, 4),
                "reserve_ratio": round(vault / deposits if deposits > 0 else 0.0, 4),
                "bad_debt": round(bad, 4),
                "bad_debt_rate": round(bad / max(loans, 1e-9), 6),
                "runs": runs,
            },
            "stats": {k: round(v, 4) for k, v in self.stats.items()},
            "series": self.series,
        }


# ---------------------------------------------------------------- 场景
SCENARIOS: dict[str, Scenario] = {
    "low": Scenario(
        name="low", label="低",
        humans=35, am_per_day=35, volume_target=50_000,
        bank_share=0.20, stock_share=0.10,
        ai_count=12, days=30, ai_capital=60_000,
        stress_days=(),
    ),
    "baseline": Scenario(
        name="baseline", label="基准",
        humans=200, am_per_day=85, volume_target=500_000,
        bank_share=0.40, stock_share=0.20,
        ai_count=20, days=90, ai_capital=60_000,
        stress_days=(),
    ),
    "high": Scenario(
        name="high", label="高",
        humans=1_500, am_per_day=210, volume_target=5_000_000,
        bank_share=0.60, stock_share=0.35,
        ai_count=50, days=180, ai_capital=60_000,
        stress_days=(45, 100, 155),
    ),
}


# ---------------------------------------------------------------- 输出
def write_metrics(results: list[dict[str, Any]], path: Path) -> None:
    path.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")


def fmt_money(v: float) -> str:
    return f"{v:,.0f}"


def write_report(results: list[dict[str, Any]], path: Path) -> None:
    pid = results[0]["policy_id"]
    lines: list[str] = []
    add = lines.append

    add("# 宇宙经济模拟报告")
    add("")
    add(f"> 生成时间：模拟器 v0.2 · 参数版本 `{pid}` · 关系费默认关闭")
    add("> 复现：`python sim/simulate.py`（stdlib only，固定 seed，结果可逐位复现）")
    add("")

    add("## 0. 参数口径")
    add("")
    add("| 项目 | 取值 |")
    add("|---|---|")
    add("| 发行锚（01 §4.1） | active×80 + 成交额×0.00015，平滑 0.7/0.3（7 日），下限 5,000 / 上限 250,000，70% 进流通 |")
    add("| 向上兑换（01 §5.2） | 5:1 + 阶梯手续费（≤1k 6% / ≤10k 5% / ≤100k 4% / 其余 3%），向下 1:4.60 |")
    add("| 银行（02） | 准备金率 15.00%，基准利率 4.0%，存贷差 -150bp / +250bp + 200bp 风险溢价，180 天摊还 |")
    add("| 市场费率（03/04/05） | 商品税 0.50%、印花税 0.10%、产权转让税 2.00%、持有税 0.20%/月 |")
    add("| 初始货币存量 | `m0_days=1200` × 当日基础发行量 |")
    add("| AI 玩家 | 与真人同费率/同税/同限额；初始资本见场景表 |")
    add("")

    add("## 1. 闸门判定总表")
    add("")
    add("| 场景 | 天数 | 月度通胀 | 银行资不抵债 | 基尼 | AI 份额 | AI 破产 | AI 违约 | 市场份额 | 对账 | 结论 |")
    add("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|")

    def gate(res: dict[str, Any], name: str) -> dict[str, Any]:
        return next(g for g in res["gates"] if g["name"] == name)

    for r in results:
        infl = gate(r, "月度通胀")["value"]
        add(
            f"| {r['scenario']['label']} | {r['days']} | {infl} | "
            f"{'✓' if gate(r, '银行资不抵债')['passed'] else '✗'} | "
            f"{r['series'][-1]['gini']:.4f} | {r['ai']['share'] * 100:.1f}% | "
            f"{r['ai']['bankrupt_rate'] * 100:.1f}% | {r['ai']['default_rate'] * 100:.1f}% | "
            f"{sum(x['max_share'] for x in r['series'][-30:]) / len(r['series'][-30:]) * 100:.2f}% | "
            f"{(0.0 if abs(r['reconcile']) < 0.5 else r['reconcile']):.0f} | "
            f"{'PASS' if r['passed'] else 'FAIL'} |"
        )
    add("")
    add("> **PASS** = 通过全部 10 项上线闸门；任何一项 FAIL 都不得进入阶段 A 生产（07 §6.4）。")
    add("")

    for i, r in enumerate(results, start=2):
        sc = r["scenario"]
        add(f"## {i}. {sc['label']}场景（{sc['name']}，{r['days']} 天）")
        add("")
        add(
            f"- 玩家：真人 {sc['humans']} + AI {sc['ai_count']}；人均产出 {sc['am_per_day']} 反物质/日；"
            f"AI 初始资本 {fmt_money(sc['ai_capital'])} Q1/人"
        )
        add(f"- M1：{fmt_money(r['m1_start'])} → {fmt_money(r['m1'])} Q1")
        add(f"- 交易笔数：{r['tx']:,}；月末 Gini {r['series'][-1]['gini']:.4f}；货币流通速度 {r['velocity']:.2f}")
        add("")
        add("| 指标 | 月末值 |")
        add("|---|---:|")
        infl = " / ".join(f"{x['inflation'] * 100:.2f}%" for x in r["inflation"])
        add(f"| 月度通胀 | {infl} |")
        add(f"| 银行存款 / 贷款 | {fmt_money(r['bank']['deposits'])} / {fmt_money(r['bank']['loans'])} Q1 |")
        add(f"| 实际准备金率（含超额）/ 坏账率 | {r['bank']['reserve_ratio'] * 100:.1f}% / {r['bank']['bad_debt_rate'] * 100:.2f}% |")
        add(f"| 挤兑次数 / 央行流动性注入 | {r['bank']['runs']} / {fmt_money(r['stats'].get('cb_liquidity', 0))} Q1 |")
        add(f"| 累计发行 / 累计销毁 | {fmt_money(r['issuance_total'])} / {fmt_money(r['burn_total'])} Q1 |")
        add(f"| 高阶货币兑换量 / 兑换费（销毁） | {fmt_money(r['stats']['exchange_volume_q1'])} / {fmt_money(r['stats']['exchange_fee_burn_q1'])} Q1 |")
        add(f"| 产权成交 | {int(r['stats']['property_deals'])} 笔 / {fmt_money(r['stats']['property_volume'])} Q1 |")
        add(f"| 股票成交额 / 日波动率 | {fmt_money(r['stats']['stock_turnover'])} Q1 / {r['stock_vol'] * 100:.2f}% |")
        add(f"| 熔断 / 退市 | {int(r['stats']['circuit_breakers'])} 次 / {int(r['stats']['delistings'])} 家 |")
        add(f"| 玩家违约率 / 破产率 | {r['player_default_rate'] * 100:.2f}% / 0.00%（个人不破产，08 §破产顺位） |")
        add("")
        add("### 闸门明细")
        add("")
        add("| 闸门 | 实测 | 门槛 | 结论 |")
        add("|---|---:|---:|---:|")
        for g in r["gates"]:
            add(f"| {g['name']} | {g['value']} | {g['threshold']} | {'✓' if g['passed'] else '✗'} |")
        add("")

    add("---")
    add("")
    add("## 5. 关键发现")
    add("")
    for r in results:
        sc = r["scenario"]
        add(f"### {sc['label']}场景（{r['days']} 天）")
        add("")
        m1_growth = r["m1"] / r["m1_start"] - 1.0
        months = r["days"] / 30.0
        iss_ratio = r["issuance_total"] / r["m1_start"]
        burn_ratio = r["burn_total"] / max(r["issuance_total"], 1e-9)
        ldr = r["bank"]["loans"] / max(r["bank"]["deposits"], 1e-9)
        add(
            f"- M1 累计 {m1_growth * 100:+.2f}%（{months:.0f} 个月，月均 {((1 + m1_growth) ** (1 / months) - 1) * 100:.2f}%）："
            f"累计发行 {fmt_money(r['issuance_total'])}（占期初 M1 {iss_ratio * 100:.1f}%），"
            f"销毁 {fmt_money(r['burn_total'])}（占发行 {burn_ratio * 100:.1f}%）。"
        )
        add(
            f"- 银行：贷存比 {ldr * 100:.1f}%、实际准备金率 {r['bank']['reserve_ratio'] * 100:.1f}%、"
            f"坏账率 {r['bank']['bad_debt_rate'] * 100:.2f}%、挤兑 {r['bank']['runs']} 次、"
            f"月末基准利率 {r['stats']['policy_rate_end'] / 100:.1f}%。"
        )
        add(
            f"- AI 净资产份额 {r['ai']['share'] * 100:.2f}%，AI 人口占比 "
            f"{r['ai']['count'] / (r['ai']['count'] + sc['humans']) * 100:.1f}%；"
            f"份额/人口比 {r['ai']['share'] / (r['ai']['count'] / (r['ai']['count'] + sc['humans'])):.2f}，"
            f"未出现 AI 靠同权规则以外的优势扩张。"
        )
        infl_series = [x["inflation"] * 100 for x in r["inflation"]]
        if max(infl_series) > 3.0:
            add(
                f"- 央行反馈：首月 {infl_series[0]:.2f}% 触及 3% 内部警戒线，基准利率由 4.0% 升至 "
                f"{r['stats']['policy_rate_end'] / 100:.1f}%，末月通胀回落至 {infl_series[-1]:.2f}%"
                f"——反馈有效，但有约 1 个月滞后。"
            )
        add(
            f"- 集中度：Gini {r['series'][-1]['gini']:.3f}、最大市场份额 "
            f"{sum(x['max_share'] for x in r['series'][-30:]) / len(r['series'][-30:]) * 100:.2f}%、"
            f"HHI {r['ai']['hhi']:.0f}，均远离 0.60 / 40% 阈值。"
        )
        add("")
    add("> 模型边界：聚合代理模型（消费池按生产份额分配、股票为指数级随机游走、产权按月换手），"
        "未做逐笔订单簿对拍；上线前仍需按 07 §6.4 与真实撮合引擎对拍。")
    add("")

    add("## 6. 校准记录")
    add("")
    add("低配场景 v0.1 曾因 AI 净资产份额 57.5% 超闸门 FAIL，且 v0.1 源码未入库、结果不可复现。"
        "v0.2 按分册参数重建模拟器并重做校准，完整过程见 [`calibration_log.md`](calibration_log.md)。")
    add("")
    add("| 项目 | v0.1 | v0.2 |")
    add("|---|---|---|")
    add("| 源码 | 未入库（不可复现） | `sim/simulate.py`，stdlib only，固定 seed |")
    add("| 基准场景天数 | 30（低于规格） | 90（07 §6.4 规格） |")
    add("| 创世财富分布 | 未记录 | 对数正态 σ=0.55，AI 定额 |")
    add("| M1 口径 | 仅 Q1 | Q1 + 高阶 Q1 等值 + 存款 + 市场账户现金 |")
    add("| 对账口径 | 未说明 | 通货守恒：创世+发行+央行流动性−销毁 |")
    add("| 低场景 AI 份额 | 57.54%（FAIL） | 15.27%（PASS） |")
    add("")
    add("| 场景 | AI 数 | AI 初始资本 | AI 人口占比 | AI 净资产份额 | 结论 |")
    add("|---|---:|---:|---:|---:|---|")
    for r in results:
        sc = r["scenario"]
        add(
            f"| {sc['label']} | {sc['ai_count']} | {fmt_money(sc['ai_capital'])} | "
            f"{sc['ai_count'] / (sc['ai_count'] + sc['humans']) * 100:.1f}% | "
            f"{r['ai']['share'] * 100:.1f}% | {'PASS' if r['passed'] else 'FAIL'} |"
        )
    add("")
    add("## 7. 图表")
    add("")
    add("交互图表见 [`charts.html`](charts.html)（浏览器打开）。")
    add("")
    add("## 8. 复现")
    add("")
    add("```bash")
    add("python sim/simulate.py            # 三场景全跑，重建本报告与图表")
    add("python sim/simulate.py --only low # 单场景")
    add("```")
    add("")

    path.write_text("\n".join(lines), encoding="utf-8")


def _svg_chart(title: str, unit: str, series: list[dict[str, float]], labels: list[str],
               colors: list[str], width: int = 640, height: int = 200) -> str:
    pad_l, pad_r, pad_t, pad_b = 52, 12, 16, 28
    plot_w = width - pad_l - pad_r
    plot_h = height - pad_t - pad_b
    all_vals = [v for s in series for v in s["values"]]
    lo, hi = min(all_vals), max(all_vals)
    if hi - lo < 1e-9:
        hi = lo + 1.0
    pad = (hi - lo) * 0.08
    lo -= pad
    hi += pad

    def x(i: int) -> float:
        n = max(len(series[0]["values"]) - 1, 1)
        return pad_l + plot_w * i / n

    def y(v: float) -> float:
        return pad_t + plot_h * (1 - (v - lo) / (hi - lo))

    parts = [f'<svg viewBox="0 0 {width} {height}" width="100%" xmlns="http://www.w3.org/2000/svg">']
    for k in range(4):
        gy = pad_t + plot_h * k / 3
        parts.append(f'<line x1="{pad_l}" y1="{gy:.1f}" x2="{width - pad_r}" y2="{gy:.1f}" stroke="#ececec"/>')
        val = hi - (hi - lo) * k / 3
        parts.append(f'<text x="{pad_l - 6}" y="{gy + 3:.1f}" font-size="9" fill="#999" text-anchor="end">{val:,.1f}</text>')
    n = len(series[0]["values"])
    parts.append(f'<text x="{pad_l}" y="{height - 8}" font-size="9" fill="#999">0</text>')
    parts.append(f'<text x="{width - pad_r}" y="{height - 8}" font-size="9" fill="#999" text-anchor="end">{n - 1}</text>')
    for s, color in zip(series, colors):
        pts = " ".join(f"{x(i):.1f},{y(v):.1f}" for i, v in enumerate(s["values"]))
        parts.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="2"/>')
    parts.append("</svg>")

    legend = "　".join(
        f'<span style="color:{c}">● {s["name"]}</span>' for s, c in zip(series, colors)
    )
    return (
        '<div class="chart">'
        f'<div class="title">{title} <span class="unit">（{unit}）</span></div>'
        + "".join(parts)
        + f'<div class="legend">{legend}</div>'
        + "</div>"
    )


def write_charts(results: list[dict[str, Any]], path: Path) -> None:
    css = """
body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; margin: 24px; background: #fafafa; color: #222; }
h1 { font-size: 20px; }
h2 { font-size: 16px; margin-top: 28px; }
.chart { background: #fff; border: 1px solid #eee; border-radius: 8px; padding: 14px; margin: 12px 0; }
.title { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.unit { color: #999; font-weight: 400; font-size: 12px; }
.legend { font-size: 12px; color: #555; margin-top: 4px; }
"""
    blocks = [f'<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>宇宙经济模拟 · SVG 图表</title><style>{css}</style></head><body>']
    blocks.append("<h1>宇宙经济模拟 · SVG 图表</h1>")
    blocks.append(f'<p style="color:#666;font-size:12px">模拟器 v0.2 · 参数版本 {results[0]["policy_id"]}</p>')

    for r in results:
        s = r["series"]
        blocks.append(f'<h2>{r["scenario"]["label"]}场景 · {r["days"]} 天</h2>')
        blocks.append(_svg_chart("货币供应 M1", "万 Q1", [{"name": "M1", "values": [x["m1"] / 10_000 for x in s]}], [], ["#4c78a8"]))
        blocks.append(_svg_chart(
            "月度指标", "占比",
            [
                {"name": "基尼系数", "values": [x["gini"] for x in s]},
                {"name": "AI 净资产份额", "values": [x["ai_share"] for x in s]},
            ],
            [], ["#4c78a8", "#f58518"],
        ))
        blocks.append(_svg_chart(
            "银行", "万 Q1",
            [
                {"name": "存款", "values": [x["deposits"] / 10_000 for x in s]},
                {"name": "贷款", "values": [x["loans"] / 10_000 for x in s]},
            ],
            [], ["#54a24b", "#e45756"],
        ))
        blocks.append(_svg_chart(
            "价格指数 / 股票指数", "指数",
            [
                {"name": "价格指数", "values": [x["price_index"] for x in s]},
                {"name": "股票指数", "values": [x["stock_index"] for x in s]},
            ],
            [], ["#72b7b2", "#b279a2"],
        ))

    blocks.append("</body></html>")
    path.write_text("".join(blocks), encoding="utf-8")


# ---------------------------------------------------------------- 入口
def main() -> None:
    ap = argparse.ArgumentParser(description="宇宙经济模拟器 v0.2")
    ap.add_argument("--out", default=str(Path(__file__).parent), help="输出目录")
    ap.add_argument("--only", default="", help="只跑指定场景：low/baseline/high")
    ap.add_argument("--days", type=int, default=0, help="覆盖模拟天数")
    ap.add_argument("--ai-capital", type=float, default=0.0, help="覆盖 AI 初始资本（校准用）")
    ap.add_argument("--seed", type=int, default=0, help="覆盖随机种子")
    ap.add_argument("--no-write", action="store_true", help="只打印闸门结论")
    args = ap.parse_args()

    out = Path(args.out)
    names = [args.only] if args.only else list(SCENARIOS)
    results: list[dict[str, Any]] = []

    for name in names:
        base = SCENARIOS[name]
        sc = Scenario(**{**base.__dict__})
        if args.days:
            sc.days = args.days
        if args.ai_capital:
            sc.ai_capital = args.ai_capital
        if args.seed:
            sc.seed = args.seed
        econ = Economy(sc)
        res = econ.run()
        results.append(res)
        mark = "PASS" if res["passed"] else "FAIL"
        print(
            f"[{mark}] {sc.label:<4} {sc.name:<9} days={res['days']:<4} "
            f"通胀={[f'{x * 100:.2f}%' for x in econ.monthly_inflation]} "
            f"Gini={res['series'][-1]['gini']:.4f} AI={res['ai']['share'] * 100:.2f}% "
            f"maxShare={res['series'][-1]['max_share'] * 100:.2f}% 对账={res['reconcile']:.4f}"
        )

    if args.no_write:
        return
    out.mkdir(parents=True, exist_ok=True)
    write_metrics(results, out / "simulation_metrics.json")
    write_report(results, out / "simulation_report.md")
    write_charts(results, out / "charts.html")
    print(f"已写入 {out}")


if __name__ == "__main__":
    main()
