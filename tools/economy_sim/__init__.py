"""宇宙经济离线模拟器（docs/cosmic-economy 的 30 天上线闸门）。

设计原则：
- 零第三方依赖、纯标准库、Decimal 计价（01 §2.2）；
- 双分录货币账本，每笔交易 delta 之和必须为 0（01 §3.2）；
- 确定性：同一 (scenario, seed) 必得同一结果，用于参数对比；
- AI 与真人走同一套费率/税率/限额代码路径，不存在 `if is_ai` 特权分支。

入口：
    python -m tools.economy_sim                 # 基准场景 30 天
    python -m tools.economy_sim --all           # 低/基准/高三场景
    python -m tools.economy_sim --days 90 --seed 7
    python -m tools.economy_sim.selfcheck       # 不变量自检
"""

__all__ = ["__version__"]
__version__ = "0.1.0"
