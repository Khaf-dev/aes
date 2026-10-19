"""Spesifikasi part hardware: dimensi bersumber, dimuat dari JSON.

Dimensi ditulis dalam satuan aslinya (inci untuk hardware AN/MS) beserta
rentang min–maks dari sumber. Model 3D memakai nilai nominal: nilai tengah
rentang, atau nilai tunggal bila sumber hanya memberi satu angka.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

MM_PER_UNIT = {"in": 25.4, "mm": 1.0}
KINDS = {"bolt", "nut", "washer"}


class SpecError(ValueError):
    """Spesifikasi part tidak valid."""


@dataclass(frozen=True)
class Dimension:
    """Satu dimensi dalam satuan asli spesifikasi."""

    min: float
    max: float

    @property
    def nominal(self) -> float:
        return (self.min + self.max) / 2

    @staticmethod
    def parse(name: str, raw: Any) -> "Dimension":
        if isinstance(raw, (int, float)):
            return Dimension(float(raw), float(raw))
        if isinstance(raw, dict):
            if "value" in raw:
                v = float(raw["value"])
                return Dimension(v, v)
            if "min" in raw and "max" in raw:
                lo, hi = float(raw["min"]), float(raw["max"])
                if lo > hi:
                    raise SpecError(f"Dimensi {name}: min ({lo}) lebih besar dari max ({hi})")
                return Dimension(lo, hi)
        raise SpecError(f"Dimensi {name}: format tidak dikenal {raw!r}")


@dataclass(frozen=True)
class Source:
    url: str
    kind: str
    verified: bool
    note: str


@dataclass(frozen=True)
class PartSpec:
    id: str
    standard: str
    kind: str
    name: str
    tier: int
    units: str
    dims: dict[str, Dimension]
    extras: dict[str, Any]
    source: Source

    def mm(self, key: str) -> float:
        """Nilai nominal sebuah dimensi dalam milimeter."""
        if key not in self.dims:
            raise SpecError(f"{self.id}: dimensi '{key}' tidak ada di spesifikasi")
        return self.dims[key].nominal * MM_PER_UNIT[self.units]


def load_spec(path: Path) -> PartSpec:
    raw = json.loads(path.read_text(encoding="utf-8"))
    for key in ("id", "standard", "kind", "name", "tier", "units", "dims", "source"):
        if key not in raw:
            raise SpecError(f"{path.name}: field '{key}' wajib ada")
    if raw["kind"] not in KINDS:
        raise SpecError(f"{path.name}: kind '{raw['kind']}' tidak didukung ({', '.join(sorted(KINDS))})")
    if raw["units"] not in MM_PER_UNIT:
        raise SpecError(f"{path.name}: satuan '{raw['units']}' tidak didukung")
    src = raw["source"]
    if not src.get("url"):
        raise SpecError(f"{path.name}: dimensi wajib punya sumber (source.url)")

    dims = {k: Dimension.parse(k, v) for k, v in raw["dims"].items()}
    return PartSpec(
        id=raw["id"],
        standard=raw["standard"],
        kind=raw["kind"],
        name=raw["name"],
        tier=int(raw["tier"]),
        units=raw["units"],
        dims=dims,
        extras=raw.get("extras", {}),
        source=Source(
            url=src["url"],
            kind=src.get("kind", ""),
            verified=bool(src.get("verified", False)),
            note=src.get("note", ""),
        ),
    )


def load_specs(folder: Path) -> list[PartSpec]:
    specs = [load_spec(p) for p in sorted(folder.glob("*.json"))]
    seen: set[str] = set()
    for s in specs:
        if s.id in seen:
            raise SpecError(f"ID part duplikat: {s.id}")
        seen.add(s.id)
    return specs
