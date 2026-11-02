"""Relic archive (B4): five fragments, one completion reward (T-63).

Determinism contract
--------------------
``fragment_index(planet_key) = FNV1a32(planet_key) % 5 + 1`` with **signed 32-bit
arithmetic**, mirroring ``hashText`` in ``Utils/Deterministic.tsx`` exactly. That
matters: the client renders the lore text from the index, so if the two hashes
disagreed, the same planet would show "残片 · 回音" while the server credited
fragment 3. ``tests/integration/test_relics.py`` pins three keys against the
JavaScript output.

The archive itself is small on purpose: discovery per index (primary key does the
dedupe) and a single "reward paid" row. Everything else — progress counts,
completion — is derived.
"""

from __future__ import annotations

from decimal import Decimal

from ..infra.errors import InvalidArgument
from ..repo import players as player_repo
from .ledger import TxRef, post_transaction

TOTAL_FRAGMENTS = 5

REWARD: dict[str, Decimal] = {
    "antimatter": Decimal(2500),
    "ancientRelic": Decimal(3),
    "alienArtifact": Decimal(2),
}

VOUCHER_REWARD = 1


def hash_text(text: str) -> int:
    """FNV-1a over UTF-16 code units, in signed 32-bit — same as the client."""
    value = 2166136261
    for char in text:
        value = _i32(value ^ ord(char))
        value = _i32(value * 16777619)
    return abs(value) % 2147483647


def fragment_index(planet_key: str) -> int:
    if not planet_key:
        raise InvalidArgument("planet_key 不能为空")
    return hash_text(planet_key) % TOTAL_FRAGMENTS + 1


def discover(conn, player: dict, planet_key: str) -> dict:
    locked = player_repo.lock(conn, player["id"])
    if locked is None:
        raise InvalidArgument("玩家不存在")

    index = fragment_index(planet_key)
    row = conn.execute(
        """
        INSERT INTO relic_fragments (player_id, fragment_index, planet_key)
        VALUES (%s, %s, %s)
        ON CONFLICT (player_id, fragment_index) DO NOTHING
        RETURNING fragment_index
        """,
        (locked["id"], index, planet_key),
    ).fetchone()
    new_fragment = row is not None

    found = _found(conn, locked["id"])
    completed = len(found) >= TOTAL_FRAGMENTS
    granted = False
    if completed and not _claimed(conn, locked["id"]):
        granted = _grant(conn, locked["id"])

    if new_fragment:
        player_repo.bump_state(conn, locked["id"])

    return {
        "fragment_index": index,
        "new_fragment": new_fragment,
        "found": found,
        "total": TOTAL_FRAGMENTS,
        "complete": len(found) >= TOTAL_FRAGMENTS,
        "reward_granted": granted,
        "reward": {code: str(amount) for code, amount in REWARD.items()},
    }


def progress(conn, player: dict) -> dict:
    found = _found(conn, player["id"])
    return {
        "found": found,
        "total": TOTAL_FRAGMENTS,
        "complete": len(found) >= TOTAL_FRAGMENTS,
        "claimed": _claimed(conn, player["id"]),
        "reward": {code: str(amount) for code, amount in REWARD.items()},
        "vouchers": VOUCHER_REWARD,
    }


# ----------------------------------------------------------------- internals


def _found(conn, player_id: str) -> list[int]:
    rows = conn.execute(
        "SELECT fragment_index FROM relic_fragments WHERE player_id = %s ORDER BY fragment_index",
        (player_id,),
    ).fetchall()
    return [int(row["fragment_index"]) for row in rows]


def _claimed(conn, player_id: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM relic_claims WHERE player_id = %s", (player_id,)
    ).fetchone() is not None


def _grant(conn, player_id: str) -> bool:
    tx = post_transaction(
        conn,
        player_id,
        dict(REWARD),
        TxRef(kind="relic_reward", ref_type="relic", ref_id="archive"),
    )
    conn.execute(
        "INSERT INTO relic_claims (player_id, tx_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
        (player_id, tx["id"]),
    )
    conn.execute(
        "UPDATE player_flags SET vouchers = vouchers + %s WHERE player_id = %s",
        (VOUCHER_REWARD, player_id),
    )
    return True


def _i32(value: int) -> int:
    value &= 0xFFFFFFFF
    return value - 0x100000000 if value >= 0x80000000 else value
