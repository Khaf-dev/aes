"""Generator geometri parametrik untuk hardware Tier 3.

Semua geometri dibuat dalam milimeter (satuan CAD) dan dikonversi ke meter
saat ekspor. Sesuai GDD, ulir tidak dimodelkan: bagian berulir dipisah
sebagai mesh tersendiri supaya game bisa memberi normal map ulir di situ.

Konvensi sumbu: Z adalah sumbu part. Titik asal ada di permukaan tumpu
(bawah kepala baut, muka bawah mur, muka bawah ring).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import cadquery as cq

from .spec import MM_PER_UNIT, PartSpec

STEEL = (0.62, 0.64, 0.67)
NYLON = (0.92, 0.9, 0.84)


@dataclass
class Mesh:
    name: str
    shape: cq.Workplane
    color: tuple[float, float, float]


@dataclass
class Generated:
    meshes: list[Mesh]
    # Titik pasang dalam milimeter, sistem koordinat part
    attach: dict[str, dict[str, list[float]]] = field(default_factory=dict)


def _hex(width_across_flats: float, height: float) -> cq.Workplane:
    across_corners = width_across_flats / math.cos(math.radians(30))
    return cq.Workplane("XY").polygon(6, across_corners).extrude(height)


def bolt(spec: PartSpec) -> Generated:
    d = spec.mm("threadDiameter")
    length = spec.mm("length")
    grip = spec.mm("gripLength")
    head_h = spec.mm("headHeight")
    af = spec.mm("widthAcrossFlats")

    head = _hex(af, head_h).faces(">Z").chamfer(head_h * 0.15)
    shank = cq.Workplane("XY").circle(d / 2).extrude(-grip)
    body = head.union(shank)

    thread = (
        cq.Workplane("XY")
        .workplane(offset=-grip)
        .circle(d / 2)
        .extrude(-(length - grip))
        .faces("<Z")
        .chamfer(d * 0.1)
    )

    attach = {
        "headBearing": {"position": [0, 0, 0], "normal": [0, 0, -1]},
        "tip": {"position": [0, 0, -length], "normal": [0, 0, -1]},
    }

    hole = spec.extras.get("cotterHole")
    if hole:
        unit = MM_PER_UNIT[spec.units]
        z = -float(hole["fromHead"]) * unit
        r = float(hole["diameter"]) * unit / 2
        if not (-length < z < -grip):
            raise ValueError(f"{spec.id}: lubang cotter di luar bagian berulir")
        cutter = cq.Workplane("YZ").center(0, z).circle(r).extrude(d, both=True)
        thread = thread.cut(cutter)
        attach["cotterHole"] = {"position": [0, 0, z], "axis": [1, 0, 0]}

    return Generated(
        meshes=[Mesh("body", body, STEEL), Mesh("thread", thread, STEEL)],
        attach=attach,
    )


def nut(spec: PartSpec) -> Generated:
    d = spec.mm("threadDiameter")
    af = spec.mm("widthAcrossFlats")
    h = spec.mm("height")

    # Lubang divisualkan sedikit lebih kecil dari diameter ulir (perkiraan diameter minor).
    bore = d * 0.84
    insert_depth = h * 0.3
    insert_od = d * 1.3

    body = (
        _hex(af, h)
        .edges("|Z or >Z or <Z").chamfer(h * 0.06)
        .faces(">Z").workplane().hole(insert_od, insert_depth)
        .faces("<Z").workplane().hole(bore)
    )
    insert = (
        cq.Workplane("XY")
        .workplane(offset=h - insert_depth)
        .circle(insert_od / 2 - 0.02)
        .circle(bore / 2)
        .extrude(insert_depth - 0.15)
    )
    return Generated(
        meshes=[Mesh("body", body, STEEL), Mesh("nylonInsert", insert, NYLON)],
        attach={
            "bearingFace": {"position": [0, 0, 0], "normal": [0, 0, -1]},
            "top": {"position": [0, 0, h], "normal": [0, 0, 1]},
        },
    )


def washer(spec: PartSpec) -> Generated:
    od = spec.mm("outsideDiameter")
    idia = spec.mm("insideDiameter")
    t = spec.mm("thickness")
    ring = cq.Workplane("XY").circle(od / 2).circle(idia / 2).extrude(t)
    return Generated(
        meshes=[Mesh("body", ring, STEEL)],
        attach={
            "bottom": {"position": [0, 0, 0], "normal": [0, 0, -1]},
            "top": {"position": [0, 0, t], "normal": [0, 0, 1]},
        },
    )


GENERATORS = {"bolt": bolt, "nut": nut, "washer": washer}


def generate(spec: PartSpec) -> Generated:
    return GENERATORS[spec.kind](spec)
