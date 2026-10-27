"""Sector arithmetic shared by gathering, licenses and cosmic events."""

from __future__ import annotations

SECTOR_SPAN = 1_000_000


def sector_of(coordinates: str) -> dict:
    parts = (coordinates or "").split(",")
    axes = [max(0, min(9, int(float(part)) // SECTOR_SPAN)) if _numeric(part) else 0 for part in parts[:3]]
    while len(axes) < 3:
        axes.append(0)
    return {"key": f"{axes[0]}-{axes[1]}-{axes[2]}", "x": axes[0], "y": axes[1], "z": axes[2]}


def _numeric(part: str) -> bool:
    try:
        float(part.strip())
        return True
    except (TypeError, ValueError):
        return False


def coordinates_from_key(planet_key: str) -> str:
    parts = (planet_key or "").split("_")
    return parts[1] if len(parts) >= 2 else ""
