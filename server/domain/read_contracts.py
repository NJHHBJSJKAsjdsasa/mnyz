"""Cross-module **read** contracts (rule R5 in docs/architecture/module-dependencies.md).

Composers (``domain/state.py``, ``domain/dashboard.py``) must not reach into a repo
they do not own. These ``Protocol`` classes are the shapes they may rely on; the
concrete implementations live in the owning module and remain free to change
their SQL without touching callers.

Typing only — nothing here imports an implementation, so this module can never
create an import cycle.

Note: ``server/domain/contracts.py`` is the *gameplay* contract generator, not
this file. Names were left alone to avoid a rename across the codebase.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class WalletReader(Protocol):
    def wallet(self, conn, actor_id: str) -> dict:
        """``{actor_id, currencies: [...], q1_total}`` — currency module."""


@runtime_checkable
class PortfolioReader(Protocol):
    def portfolio(self, conn, actor: dict) -> dict:
        """``{positions, shorts, market_value, cash}`` — stock module."""


@runtime_checkable
class TaxBillReader(Protocol):
    def bills_of(self, conn, actor_id: str) -> list[dict]:
        """``[{id, asset_key, period, amount, due_at, status}]`` — property module."""


@runtime_checkable
class LoanReader(Protocol):
    def loans(self, conn, actor_id: str) -> list[dict]:
        """``[{id, bank_id, currency_code, outstanding, accrued_interest, due_at, status}]``."""


__all__ = ["WalletReader", "PortfolioReader", "TaxBillReader", "LoanReader"]
