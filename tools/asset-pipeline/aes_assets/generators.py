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
SATIN = (0.55, 0.57, 0.6)
RUBBER = (0.08, 0.08, 0.09)


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


def torque_wrench(spec: PartSpec) -> Generated:
    """Kunci torsi tipe klik, gagang mikrometer (bentuk mengikuti referensi fwild, Sketchfab).

    Bersumber: panjang total, tinggi kepala, ukuran square drive. Proporsi lain (`extras.design`)
    adalah nilai desain visual dalam fraksi panjang total, bukan data teknis.
    Titik asal = pusat square drive di muka kepala. Sumbu panjang = -Z (gagang ke bawah),
    square drive menonjol ke +Y.
    """
    length = spec.mm("overallLength")
    head_h = spec.mm("headHeight")  # tebal kepala, searah sumbu drive
    drive = spec.mm("driveSize")
    d = spec.extras["design"]
    f = lambda key: d[key] * length  # noqa: E731 - fraksi panjang -> mm

    head_top = f("headTop")              # ujung kepala di atas pusat drive
    head_w = f("headWidth")
    neck_z, tube_z, barrel_z, ring_z, grip_z = (-f(k) for k in ("neckEnd", "tubeEnd", "barrelEnd", "ringEnd", "gripEnd"))
    bottom = head_top - length           # ujung tutup gagang
    r_tube, r_barrel, r_grip = f("tubeRadius"), f("barrelRadius"), f("gripRadius")

    # Kepala ratchet: blok membulat, square drive keluar dari muka +Y
    head = (
        cq.Workplane("XZ").center(0, (head_top + neck_z) / 2)
        .rect(head_w, head_top - neck_z).extrude(head_h / 2, both=True)
        .edges("|Y").fillet(head_w * 0.45)
        .edges(">Y or <Y").chamfer(head_h * 0.08)
    )
    lever = cq.Workplane("XZ").workplane(offset=head_h / 2).center(0, head_top * 0.15).circle(head_w * 0.16).extrude(-1.2)
    tube = (
        cq.Workplane("XY").workplane(offset=neck_z).circle(r_tube * 0.85)
        .workplane(offset=tube_z - neck_z).circle(r_tube).loft()
    )
    body = head.union(tube).union(cq.Workplane("XY").workplane(offset=tube_z).circle(r_tube).extrude(barrel_z - tube_z))
    badge = cq.Workplane("YZ").workplane(offset=r_tube - 0.4).center(0, f("badgeAt") * -1).circle(r_tube * 0.45).extrude(1.0)

    square = (
        cq.Workplane("XZ").workplane(offset=-head_h / 2).rect(drive, drive).extrude(-drive * 0.95)
        .edges("|Y").chamfer(drive * 0.08)
    )
    barrel = cq.Workplane("XY").workplane(offset=ring_z).circle(r_barrel).extrude(barrel_z - ring_z)
    ring = cq.Workplane("XY").workplane(offset=grip_z).circle(r_grip * 0.9).extrude(ring_z - grip_z)
    grip = cq.Workplane("XY").workplane(offset=bottom + f("capLength")).circle(r_grip).extrude(grip_z - bottom - f("capLength")).edges().chamfer(1.2)
    cap = cq.Workplane("XY").workplane(offset=bottom).circle(r_grip * 0.85).extrude(f("capLength")).faces("<Z").chamfer(1.0)

    return Generated(
        meshes=[
            Mesh("body", body.union(lever), STEEL),
            Mesh("badge", badge, (0.55, 0.12, 0.1)),
            Mesh("drive", square, STEEL),
            Mesh("barrel", barrel, SATIN),   # area skala mikrometer (tekstur skala dari game)
            Mesh("lockRing", ring, RUBBER),
            Mesh("grip", grip, RUBBER),      # knurl via normal map
            Mesh("endCap", cap, RUBBER),
        ],
        attach={
            "drive": {"position": [0, head_h / 2 + drive * 0.95, 0], "axis": [0, 1, 0]},
            "gripCenter": {"position": [0, 0, (grip_z + bottom) / 2], "axis": [0, 0, -1]},
            "scaleEdge": {"position": [0, 0, ring_z], "axis": [0, 0, -1]},
        },
    )


def alternator(spec: PartSpec) -> Generated:
    """Alternator penggerak gear, bentuk dasar sementara (placeholder) sampai mesh Tier 2 tersedia.

    Konvensi sama dengan part Tier 2: titik asal = pusat muka flange, poros penggerak ke +X (masuk ke mesin),
    badan ke -X, telinga flange di ±Y (CAD) = ±Z runtime, terminal output di atas (+Z CAD = +Y runtime).
    """
    length, dia = spec.mm("bodyLength"), spec.mm("bodyDiameter")
    flange_d, flange_t = spec.mm("flangeDiameter"), spec.mm("flangeThickness")
    ear_y, ear_r = spec.mm("earSpacing") / 2, spec.mm("earRadius")
    shaft_d, shaft_l = spec.mm("shaftDiameter"), spec.mm("shaftLength")
    x_axis = lambda: cq.Workplane("YZ")  # noqa: E731 - normal +X

    flange = x_axis().circle(flange_d / 2).extrude(-flange_t)
    ears = x_axis().pushPoints([(-ear_y, 0), (ear_y, 0)]).circle(ear_r).extrude(-flange_t)
    web = x_axis().rect(2 * ear_y, ear_r * 1.6).extrude(-flange_t)
    holes = x_axis().pushPoints([(-ear_y, 0), (ear_y, 0)]).circle(ear_r * 0.45).extrude(-flange_t)
    flange = flange.union(ears).union(web).cut(holes)

    body = x_axis().workplane(offset=-flange_t).circle(dia / 2).extrude(-(length - flange_t)).edges("<X").chamfer(6)
    for i in range(5):  # sirip pendingin
        x0 = -flange_t - 18 - i * 14
        body = body.cut(x_axis().workplane(offset=x0).circle(dia / 2 + 1).circle(dia / 2 - 3).extrude(-4))
    shaft = x_axis().circle(shaft_d / 2).extrude(shaft_l).faces(">X").chamfer(1.5)
    term_x = -length + 22
    terminal = cq.Workplane("XY").workplane(offset=dia / 2 - 2).center(term_x, 0).circle(5).extrude(16)

    return Generated(
        meshes=[
            Mesh("flange", flange, SATIN),
            Mesh("body", body, (0.22, 0.24, 0.27)),
            Mesh("driveShaft", shaft, STEEL),
            Mesh("outputTerminal", terminal, (0.69, 0.55, 0.34)),
        ],
        attach={
            "mountFace": {"position": [0, 0, 0], "normal": [1, 0, 0]},
            "shaftTip": {"position": [shaft_l, 0, 0], "normal": [1, 0, 0]},
            "outputTerminal": {"position": [term_x, 0, dia / 2 + 14], "normal": [0, 0, 1]},
        },
    )


GENERATORS = {"bolt": bolt, "nut": nut, "washer": washer, "torque_wrench": torque_wrench, "alternator": alternator}


def generate(spec: PartSpec) -> Generated:
    return GENERATORS[spec.kind](spec)
