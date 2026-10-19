"""Ekspor part ke GLB siap pakai di Three.js, plus file metadata terpisah.

Konversi satuan dan sumbu:
- Z-up (CAD) ke Y-up (glTF / Three.js) sudah dilakukan writer glTF OpenCascade:
  (x, y, z) -> (x, z, -y). Pipeline tidak boleh memutar lagi.
- milimeter (CAD) ke meter (Three.js): skala 0,001 di node akar GLB.
Metadata titik pasang dikonversi dengan transformasi yang sama, jadi
koordinatnya langsung cocok dengan model yang dimuat di game.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import cadquery as cq
import pygltflib

from . import __version__
from .generators import Generated
from .spec import PartSpec

MM_TO_M = 0.001


def to_runtime(v: list[float], is_point: bool) -> list[float]:
    """Koordinat part (mm, Z-up) ke koordinat runtime (m, Y-up)."""
    x, y, z = v
    out = [x, z, -y]
    if is_point:
        out = [c * MM_TO_M for c in out]
    return [round(c + 0.0, 6) for c in out]


def _wrap_root(path: Path, root_name: str) -> dict[str, Any]:
    gltf = pygltflib.GLTF2().load(str(path))
    scene = gltf.scenes[gltf.scene or 0]
    root = pygltflib.Node(
        name=root_name,
        children=list(scene.nodes),
        scale=[MM_TO_M] * 3,
    )
    gltf.nodes.append(root)
    scene.nodes = [len(gltf.nodes) - 1]
    gltf.save_binary(str(path))

    triangles = 0
    for mesh in gltf.meshes:
        for prim in mesh.primitives:
            if prim.indices is not None:
                triangles += gltf.accessors[prim.indices].count // 3
    return {"triangles": triangles}


def export_part(
    spec: PartSpec,
    generated: Generated,
    out_dir: Path,
    tolerance: float = 0.01,
    angular_tolerance: float = 0.15,
) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    glb_path = out_dir / f"{spec.id}.glb"

    assy = cq.Assembly(name=spec.id)
    for mesh in generated.meshes:
        assy.add(mesh.shape, name=mesh.name, color=cq.Color(*mesh.color))
    assy.export(str(glb_path), "GLTF", tolerance=tolerance, angularTolerance=angular_tolerance)
    stats = _wrap_root(glb_path, spec.id)

    bb = assy.toCompound().BoundingBox()
    corners = [to_runtime(p, True) for p in ([bb.xmin, bb.ymin, bb.zmin], [bb.xmax, bb.ymax, bb.zmax])]
    bbox = {
        "min": [min(a, b) for a, b in zip(*corners)],
        "max": [max(a, b) for a, b in zip(*corners)],
    }

    attach: dict[str, dict[str, list[float]]] = {}
    for name, point in generated.attach.items():
        attach[name] = {
            key: to_runtime(value, is_point=(key == "position"))
            for key, value in point.items()
        }

    meta = {
        "id": spec.id,
        "standard": spec.standard,
        "name": spec.name,
        "kind": spec.kind,
        "tier": spec.tier,
        "model": glb_path.name,
        "units": "m",
        "upAxis": "Y",
        "meshes": [m.name for m in generated.meshes],
        "triangles": stats["triangles"],
        "boundingBox": bbox,
        "attachPoints": attach,
        "dimensions": {
            k: {"min": d.min, "max": d.max, "nominal": round(d.nominal, 4), "unit": spec.units}
            for k, d in spec.dims.items()
        },
        "source": {
            "url": spec.source.url,
            "kind": spec.source.kind,
            "verified": spec.source.verified,
            "note": spec.source.note,
        },
        "generator": f"aes-asset-pipeline {__version__}",
    }
    (out_dir / f"{spec.id}.meta.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return meta
