"""经济主体（00 §4.1）：真人玩家、AI 玩家、公司、银行、国库、销毁科目。

AI 玩家就是玩家：`kind` 都是 `player`，`controller` 只用于调度标识，
费用/税率/限额一律由同一段代码计算，不允许 `if controller == "ai"` 的分支。
"""

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

from .money import ZERO, dec

PLAYER_KINDS = ("player",)


@dataclass
class Actor:
    id: str
    kind: str                       # player / company / bank / treasury / burn / council / sector / exchange
    name: str
    controller: str = "human"       # human / server_ai / system
    persona: str = ""
    policy: dict = field(default_factory=dict)
    skill: Decimal = dec("1")
    production: Decimal = dec("0")  # 反物质/日
    goods: Decimal = ZERO
    bank_id: Optional[str] = None
    shares: dict = field(default_factory=dict)
    properties: list = field(default_factory=list)
    loans: list = field(default_factory=list)
    last_income: Decimal = ZERO
    volume: Decimal = ZERO
    bankrupt: bool = False
    defaulted: bool = False
    decisions: list = field(default_factory=list)

    # --- 便捷属性 -----------------------------------------------------------
    @property
    def is_player(self) -> bool:
        return self.kind == "player"

    @property
    def weight(self) -> Decimal:
        return self.policy.get("income", dec("1"))

    def remember(self, day: int, action: str, reason: str, score: Decimal = ZERO) -> None:
        """AI 决策审计（10 §3.4）；真人决策不入表，但这里统一记录便于复盘。"""
        if self.controller != "server_ai":
            return
        self.decisions.append({"day": day, "action": action, "reason": reason, "score": str(score)})


def make_actor(actor_id: str, kind: str, name: str, **kwargs) -> Actor:
    actor = Actor(id=actor_id, kind=kind, name=name, **kwargs)
    if actor.policy is None:
        actor.policy = {}
    return actor
