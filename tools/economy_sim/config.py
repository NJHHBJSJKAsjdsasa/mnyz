"""参数集中管理。每一项都标注了出处分册，改数值前请同步文档。

模拟口径（文档未定死、由模拟器约定的部分）：
- 1 单位反物质折 20 Q1（AM_PRICE_Q1），使商品日成交额落在 07 §6.4 的场景区间；
- 初始货币存量 = `m0_days` × 当日基础发行量，按活跃玩家均分（含 AI 的初始资本）；
  固定 `m0_days` 时，稳态月度通胀 ≈ 30 / m0_days，因此 1200 天 ≈ 2.5%，落在 1%–4% 闸门内；
- 存款是「余额内的计息托管」，不搬动货币；贷款创造存款（M1 上升），还款消灭存款；
- 股票/产权/兑换的税费按 01 §4.3 计入 burn 科目，商品交易税按 03 分给议会基金与星区主权者。
"""

from dataclasses import asdict, dataclass, field
from decimal import Decimal
import hashlib
import json

from .money import ZERO, dec

# --- 九级货币（01 §2）------------------------------------------------------
CURRENCIES = (
    ("cc1", 1, "星尘币", "1"),
    ("cc2", 2, "星砂币", "5"),
    ("cc3", 3, "蔚蓝币", "25"),
    ("cc4", 4, "银核币", "125"),
    ("cc5", 5, "金核币", "625"),
    ("cc6", 6, "星辉币", "3125"),
    ("cc7", 7, "曲率币", "15625"),
    ("cc8", 8, "奇点币", "78125"),
    ("cc9", 9, "创世币", "390625"),
)
CODES = tuple(c[0] for c in CURRENCIES)
QUALITY = {c[0]: c[1] for c in CURRENCIES}
NAME = {c[0]: c[2] for c in CURRENCIES}
BASE_VALUE = {c[0]: dec(c[3]) for c in CURRENCIES}

AM_PRICE_Q1 = dec("20")

# 向上兑换阶梯手续费（01 §5.2）：按输入货币的 Q1 等值查表
EXCHANGE_TIERS = ((dec("1000"), dec("0.06")), (dec("10000"), dec("0.05")), (dec("100000"), dec("0.04")))
EXCHANGE_TOP_RATE = dec("0.03")
DOWN_RATIO = dec("4.60")
EXCHANGE_SPREAD = dec("0.08")


@dataclass(frozen=True)
class IssuancePolicy:
    """Q1 发行锚（01 §4.1）。"""

    active_weight: Decimal = dec("80")
    volume_factor: Decimal = dec("0.00015")
    min_daily: Decimal = dec("5000")
    max_daily: Decimal = dec("250000")
    reward_share: Decimal = dec("0.70")
    smoothing: Decimal = dec("0.7")
    version: int = 1


@dataclass(frozen=True)
class BankParams:
    """银行（02）。"""

    policy_rate_bps: int = 400
    reserve_ratio: Decimal = dec("0.15")
    demand_spread_bps: int = -150
    loan_spread_bps: int = 250
    risk_premium_bps: int = 150
    penalty_days: int = 3
    penalty_bps: int = 200
    default_days: int = 7
    insurance_bps: int = 5
    insurance_cap_q1: Decimal = dec("10000")
    bank_capital: Decimal = dec("1500000")
    ltv_cash: Decimal = dec("0.50")
    ltv_stock: Decimal = dec("0.50")
    ltv_planet: Decimal = dec("0.40")
    run_threshold: Decimal = dec("0.30")
    max_loan_share: Decimal = dec("0.35")  # 单笔贷款 ≤ 借款人净资产 × 该比例


@dataclass(frozen=True)
class MarketParams:
    """商品/股票/产权（03 §6.3、05 §5、04 §7.5）。"""

    commodity_tax: Decimal = dec("0.005")
    stock_fee: Decimal = dec("0.001")
    stamp_tax: Decimal = dec("0.001")
    property_tax: Decimal = dec("0.02")
    holding_tax_month: Decimal = dec("0.002")
    circuit_breaker: Decimal = dec("0.20")
    max_position_pct: Decimal = dec("0.10")
    sell_ratio: Decimal = dec("0.75")
    exchange_spread: Decimal = dec("0.01")
    ipo_book_multiple: Decimal = dec("1.20")


@dataclass(frozen=True)
class Scenario:
    name: str
    label: str
    humans: int
    am_per_day: Decimal
    bank_share: Decimal
    stock_share: Decimal
    ai_count: int
    days: int
    seed: int
    m0_days: Decimal = dec("1200")
    volume_target: Decimal = ZERO
    ai_capital: Decimal = dec("60000")


POLICY = IssuancePolicy()
BANK = BankParams()
MARKET = MarketParams()

SCENARIOS = {
    "low": Scenario("low", "低", 35, dec("35"), dec("0.20"), dec("0.10"), 12, 30, 11, volume_target=dec("50000")),
    "baseline": Scenario("baseline", "基准", 200, dec("85"), dec("0.40"), dec("0.20"), 20, 30, 20261026,
                         volume_target=dec("500000")),
    "high": Scenario("high", "高", 1500, dec("210"), dec("0.60"), dec("0.35"), 50, 180, 77,
                     volume_target=dec("5000000")),
}

DEFAULT_POLICY = {
    "income": dec("1.00"),
    "borrow": dec("0.15"),
    "deposit": dec("0.35"),
    "stock": dec("0.20"),
    "property": dec("0.15"),
    "consume": dec("0.55"),
    "risk": dec("0.45"),
}

# persona 权重（06 §4、10 §3.3）；真人使用 DEFAULT_POLICY，AI 使用 persona 覆盖
PERSONAS = {
    "industrialist": {"income": "1.35", "borrow": "0.55", "deposit": "0.20", "stock": "0.15", "property": "0.30",
                      "consume": "0.45", "risk": "0.35"},
    "banker": {"income": "1.25", "borrow": "0.10", "deposit": "0.05", "stock": "0.10", "property": "0.10",
               "consume": "0.35", "risk": "0.20"},
    "trader": {"income": "1.20", "borrow": "0.25", "deposit": "0.25", "stock": "0.30", "property": "0.10",
               "consume": "0.55", "risk": "0.50"},
    "quant": {"income": "1.10", "borrow": "0.30", "deposit": "0.20", "stock": "0.85", "property": "0.05",
              "consume": "0.40", "risk": "0.65"},
    "landlord": {"income": "1.15", "borrow": "0.45", "deposit": "0.20", "stock": "0.10", "property": "0.85",
                 "consume": "0.40", "risk": "0.40"},
    "raider": {"income": "1.30", "borrow": "0.65", "deposit": "0.10", "stock": "0.35", "property": "0.35",
               "consume": "0.60", "risk": "0.85"},
    "explorer": {"income": "1.40", "borrow": "0.30", "deposit": "0.15", "stock": "0.10", "property": "0.20",
                 "consume": "0.50", "risk": "0.70"},
    "councilor": {"income": "1.00", "borrow": "0.10", "deposit": "0.45", "stock": "0.15", "property": "0.15",
                  "consume": "0.35", "risk": "0.15"},
    "market_maker": {"income": "1.10", "borrow": "0.20", "deposit": "0.30", "stock": "0.95", "property": "0.05",
                     "consume": "0.35", "risk": "0.30"},
}

AI_PERSONA_MIX = (
    "industrialist", "trader", "quant", "landlord", "market_maker", "industrialist",
    "trader", "banker", "raider", "explorer", "councilor", "quant", "trader",
    "landlord", "industrialist", "quant", "trader", "raider", "landlord", "councilor",
)


def persona_policy(persona: str) -> dict:
    """把 persona 字面量权重展开成 Decimal 策略表。"""
    base = dict(DEFAULT_POLICY)
    for key, value in PERSONAS.get(persona, {}).items():
        base[key] = dec(value)
    return base


def policy_id() -> str:
    """参数版本号（对应 07 §6.4 要求的 currency_issuance_policy.id 归档）。"""
    payload = {
        "issuance": asdict(POLICY),
        "bank": asdict(BANK),
        "market": asdict(MARKET),
        "scenarios": {k: asdict(v) for k, v in SCENARIOS.items()},
    }
    blob = json.dumps(payload, sort_keys=True, default=str).encode()
    return "sim-" + hashlib.sha256(blob).hexdigest()[:12]
