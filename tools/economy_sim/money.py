"""Decimal 计价工具（01-currency.md §2.2：最小单位 0.0001，禁用 float）。"""

from decimal import Decimal, ROUND_HALF_UP, getcontext

getcontext().prec = 40

MIN_UNIT = Decimal("0.0001")
ZERO = Decimal("0")
ONE = Decimal("1")


def dec(value) -> Decimal:
    """把 int / str / Decimal 转成 Decimal；float 一律走字符串，避免二进制误差。"""
    if isinstance(value, Decimal):
        return value
    if isinstance(value, int):
        return Decimal(value)
    return Decimal(str(value))


def quant(value) -> Decimal:
    """按最小货币单位四舍五入。"""
    return dec(value).quantize(MIN_UNIT, rounding=ROUND_HALF_UP)


def clamp(value, low, high):
    return max(low, min(high, value))


def fmt(value, digits: int = 2) -> str:
    """报告用的千分位格式化。"""
    return f"{dec(value):,.{digits}f}"


def pct(value, digits: int = 2) -> str:
    return f"{dec(value) * 100:.{digits}f}%"


def rand_dec(rng, low, high) -> Decimal:
    """在 [low, high] 上取确定性随机 Decimal。"""
    span = float(dec(high) - dec(low))
    return dec(low) + dec(rng.random() * span)


def rand_spread(rng, center, half_width) -> Decimal:
    """中心值 ± half_width 的确定性扰动。"""
    return dec(center) * (ONE + rand_dec(rng, -half_width, half_width))


def rand_normal(rng) -> Decimal:
    """标准正态（Box-Muller 由 random.gauss 提供，转 Decimal）。"""
    return dec(rng.gauss(0.0, 1.0))
