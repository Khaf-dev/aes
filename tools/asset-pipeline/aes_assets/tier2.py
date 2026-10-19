"""Proses part Tier 2: mesh mentah hasil AI image-to-3D menjadi aset siap game.

Mesh dari generator AI (misalnya TRELLIS.2) biasanya ratusan ribu segitiga
dengan atlas UV yang terpecah-pecah. Mengurangi polygon langsung di mesh itu
merusak tekstur, karena simplifier tidak bisa menggabungkan vertex di sambungan
UV. Jadi alurnya:

1. Las semua vertex, lalu kurangi polygon hanya berdasarkan bentuk.
2. Hitung normal halus dengan sudut patah, supaya tepi tajam tetap tajam.
3. Buat atlas UV baru (xatlas).
4. Bake tekstur dari mesh asli ke atlas baru: tiap texel dicari titik terdekatnya
   di permukaan mesh asli, lalu warnanya diambil dari tekstur asli.
5. Pindahkan titik asal ke muka flange dudukan, lalu skalakan ke meter.

Mesh mentah tidak punya skala nyata. Skalanya diambil dari spesifikasi:
nilai bersumber kalau ada, kalau belum ada pakai placeholder yang ditandai jelas
di metadata (`scale.basis = "placeholder"`).
"""

from __future__ import annotations

import io
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import fast_simplification
import numpy as np
import trimesh
import xatlas
from PIL import Image
from scipy.ndimage import distance_transform_edt
from scipy.spatial import cKDTree

from . import __version__
from .spec import SpecError

AXES = {"+x": (0, 1.0), "-x": (0, -1.0), "+y": (1, 1.0), "-y": (1, -1.0), "+z": (2, 1.0), "-z": (2, -1.0)}
TRIANGLE_BUDGET = 30_000
SHAPE_TOLERANCE = 0.02  # pergeseran bounding box maksimal setelah simplifikasi, relatif ke diagonal


class SimplificationError(ValueError):
    """Simplifikasi mengubah bentuk terlalu jauh (misalnya poros kecil hilang)."""
SAMPLES_PER_TEXEL = 6  # kepadatan sampel permukaan mesh asli relatif terhadap jumlah texel


@dataclass(frozen=True)
class Tier2Spec:
    id: str
    name: str
    kind: str
    raw: Path
    mount_axis: str
    flange_radius_ratio: float
    face_from_tip: float | None
    length_mm: float | None
    placeholder_length_mm: float | None
    scale_source: dict[str, Any] | None
    target_triangles: int
    texture_size: int
    crease_angle_deg: float
    provenance: dict[str, Any]
    credits: list[str] = field(default_factory=list)

    @property
    def scale_basis(self) -> str:
        return "sourced" if self.length_mm is not None else "placeholder"

    @property
    def effective_length_mm(self) -> float:
        value = self.length_mm if self.length_mm is not None else self.placeholder_length_mm
        assert value is not None
        return value


def load_tier2_spec(path: Path, repo_root: Path) -> Tier2Spec:
    raw = json.loads(path.read_text(encoding="utf-8"))
    for key in ("id", "name", "kind", "tier", "source", "mount", "scale", "lod0"):
        if key not in raw:
            raise SpecError(f"{path.name}: field '{key}' wajib ada")
    if raw["tier"] != 2:
        raise SpecError(f"{path.name}: hanya untuk part Tier 2")

    mount = raw["mount"]
    if mount.get("axis") not in AXES:
        raise SpecError(f"{path.name}: mount.axis harus salah satu dari {', '.join(AXES)}")

    scale = raw["scale"]
    length = scale.get("overallLengthMm")
    placeholder = scale.get("placeholderLengthMm")
    if length is not None and not scale.get("source", {}).get("url"):
        raise SpecError(f"{path.name}: overallLengthMm wajib punya scale.source.url")
    if length is None and placeholder is None:
        raise SpecError(f"{path.name}: isi overallLengthMm (bersumber) atau placeholderLengthMm")
    for name, value in (("overallLengthMm", length), ("placeholderLengthMm", placeholder)):
        if value is not None and value <= 0:
            raise SpecError(f"{path.name}: {name} harus positif")

    lod0 = raw["lod0"]
    target = int(lod0.get("targetTriangles", TRIANGLE_BUDGET))
    if not 0 < target <= TRIANGLE_BUDGET:
        raise SpecError(f"{path.name}: targetTriangles harus 1..{TRIANGLE_BUDGET}")

    source = raw["source"]
    if not source.get("raw"):
        raise SpecError(f"{path.name}: source.raw (mesh mentah) wajib ada")

    return Tier2Spec(
        id=raw["id"],
        name=raw["name"],
        kind=raw["kind"],
        raw=(repo_root / source["raw"]).resolve(),
        mount_axis=mount["axis"],
        flange_radius_ratio=float(mount.get("flangeRadiusRatio", 0.75)),
        face_from_tip=_fraction(path, mount.get("faceFromTip")),
        length_mm=length,
        placeholder_length_mm=placeholder,
        scale_source=scale.get("source"),
        target_triangles=target,
        texture_size=int(lod0.get("textureSize", 1024)),
        crease_angle_deg=float(lod0.get("creaseAngleDeg", 35)),
        provenance=source,
        credits=list(raw.get("credits", [])),
    )


def _fraction(path: Path, value: Any) -> float | None:
    if value is None:
        return None
    value = float(value)
    if not 0.0 <= value < 1.0:
        raise SpecError(f"{path.name}: mount.faceFromTip harus 0..1 (fraksi panjang dari ujung poros)")
    return value


def load_tier2_specs(folder: Path, repo_root: Path) -> list[Tier2Spec]:
    if not folder.exists():
        return []
    return [load_tier2_spec(p, repo_root) for p in sorted(folder.glob("*.json"))]


# ---------- Geometri ----------

def _load_textured(path: Path) -> trimesh.Trimesh:
    mesh = trimesh.load(str(path), force="scene").to_geometry()
    if not isinstance(mesh.visual, trimesh.visual.TextureVisuals) or mesh.visual.uv is None:
        raise ValueError(f"{path.name}: mesh mentah harus punya UV dan tekstur")
    return mesh


def detect_mount(
    mesh: trimesh.Trimesh,
    axis: str,
    ratio: float,
    face_from_tip: float | None = None,
    slices: int = 200,
) -> tuple[np.ndarray, float]:
    """Cari pusat muka flange dudukan.

    Otomatis: berjalan dari ujung poros (arah `axis`) ke belakang. Muka flange adalah
    irisan pertama yang jari-jarinya mencapai `ratio` x jari-jari terbesar part.
    Cara ini gagal kalau ada tonjolan lain yang lebih lebar dari flange (misalnya stud
    terminal starter); untuk part seperti itu spesifikasi mengisi `face_from_tip`
    (fraksi panjang dari ujung poros) hasil pengamatan visual.
    Pusat sumbu diambil dari rata-rata vertex di ujung poros.
    Mengembalikan (titik muka flange, panjang total sepanjang sumbu).
    """
    i, sign = AXES[axis]
    v = mesh.vertices
    t = v[:, i] * sign  # makin besar = makin ke arah ujung poros
    lo, hi = t.min(), t.max()
    length = hi - lo
    others = [k for k in range(3) if k != i]

    tip = v[t >= hi - 0.05 * length]
    center = tip[:, others].mean(axis=0)

    if face_from_tip is not None:
        point = np.zeros(3)
        point[i] = (hi - face_from_tip * length) * sign
        point[others] = center
        return point, float(length)

    edges = np.linspace(hi, lo, slices + 1)
    radii = np.zeros(slices)
    for n in range(slices):
        band = (t <= edges[n]) & (t > edges[n + 1])
        if band.any():
            radii[n] = np.linalg.norm(v[band][:, others] - center, axis=1).max()
    threshold = ratio * radii.max()
    hit = int(np.argmax(radii >= threshold))
    face_t = edges[hit]

    point = np.zeros(3)
    point[i] = face_t * sign
    point[others] = center
    return point, float(length)


def _simplify(mesh: trimesh.Trimesh, target: int, crease_deg: float) -> trimesh.Trimesh:
    welded = trimesh.Trimesh(mesh.vertices.copy(), mesh.faces.copy(), process=True)
    welded.merge_vertices()
    reduction = max(0.0, 1.0 - target / len(welded.faces))
    v, f = fast_simplification.simplify(
        welded.vertices.astype(np.float32), welded.faces.astype(np.int32), target_reduction=reduction
    )
    low = trimesh.Trimesh(v.astype(np.float64), f, process=True)
    return trimesh.graph.smooth_shade(low, angle=np.radians(crease_deg))


def _sample_texture(tex: np.ndarray, uv: np.ndarray) -> np.ndarray:
    # Wrap hanya untuk UV di luar [0, 1]. Nilai tepat 1.0 harus tetap di tepi kanan/atas,
    # bukan terlipat ke 0 (bug klasik: tepi tekstur ikut warna sisi seberang).
    uv = np.where((uv < 0.0) | (uv > 1.0), uv % 1.0, uv)
    h, w = tex.shape[:2]
    x = np.clip((uv[:, 0] * (w - 1)).round(), 0, w - 1).astype(int)
    y = np.clip(((1.0 - uv[:, 1]) * (h - 1)).round(), 0, h - 1).astype(int)
    return tex[y, x]


def _rasterize_positions(uvs: np.ndarray, faces: np.ndarray, verts: np.ndarray, size: int):
    """Posisi 3D untuk tiap texel yang tertutup segitiga di ruang UV."""
    pos = np.zeros((size, size, 3), np.float32)
    mask = np.zeros((size, size), bool)
    tri_uv = uvs[faces] * size
    tri_p = verts[faces]
    for k in range(len(faces)):
        a, b, c = tri_uv[k]
        det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(det) < 1e-12:
            continue
        x0, y0 = np.floor(np.minimum(np.minimum(a, b), c)).astype(int)
        x1, y1 = np.ceil(np.maximum(np.maximum(a, b), c)).astype(int)
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        px, py = xs.ravel() + 0.5, ys.ravel() + 0.5
        l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / det
        l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / det
        l3 = 1.0 - l1 - l2
        inside = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
        X, Y = xs.ravel()[inside], ys.ravel()[inside]
        ok = (X >= 0) & (X < size) & (Y >= 0) & (Y < size)
        if not ok.any():
            continue
        bary = np.stack([l1, l2, l3], 1)[inside][ok]
        row = size - 1 - Y[ok]
        pos[row, X[ok]] = bary @ tri_p[k]
        mask[row, X[ok]] = True
    return pos, mask


def bake_lod(raw: trimesh.Trimesh, target: int, texture_size: int, crease_deg: float, seed: int = 1):
    """Mesh ringan + tekstur hasil bake dari mesh mentah. Deterministik untuk seed yang sama."""
    material = raw.visual.material
    base_img = getattr(material, "baseColorTexture", None)
    if base_img is None:
        raise ValueError("mesh mentah tidak punya baseColorTexture")
    base = np.asarray(base_img.convert("RGB"))
    mr_img = getattr(material, "metallicRoughnessTexture", None)
    mr = np.asarray(mr_img.convert("RGB")) if mr_img is not None else None

    low = _simplify(raw, target, crease_deg)
    drift = np.abs(low.bounds - raw.bounds).max() / np.linalg.norm(raw.extents)
    if drift > SHAPE_TOLERANCE:
        raise SimplificationError(
            f"bentuk berubah {drift:.1%} setelah simplifikasi ke {target} segitiga "
            f"(batas {SHAPE_TOLERANCE:.0%}); naikkan lod0.targetTriangles"
        )
    normals = low.vertex_normals.copy()
    vmap, faces, uvs = xatlas.parametrize(low.vertices, low.faces)
    out = trimesh.Trimesh(low.vertices[vmap], faces, vertex_normals=normals[vmap], process=False)

    pos, mask = _rasterize_positions(uvs, faces, out.vertices, texture_size)

    count = SAMPLES_PER_TEXEL * int(mask.sum())
    points, face_idx = trimesh.sample.sample_surface(raw, count, seed=seed)
    bary = trimesh.triangles.points_to_barycentric(raw.triangles[face_idx], points)
    uv_hi = (raw.visual.uv[raw.faces[face_idx]] * bary[:, :, None]).sum(axis=1)
    tree = cKDTree(points)
    _, nearest = tree.query(pos[mask], k=4)

    _, (iy, ix) = distance_transform_edt(~mask, return_indices=True)

    def bake(tex: np.ndarray) -> Image.Image:
        colors = _sample_texture(tex, uv_hi)
        img = np.zeros((texture_size, texture_size, 3), np.uint8)
        img[mask] = colors[nearest].mean(axis=1).round().astype(np.uint8)
        return Image.fromarray(img[iy, ix])  # perlebar tepi pulau UV supaya tidak ada garis hitam

    baked_base = bake(base)
    baked_mr = bake(mr) if mr is not None else None
    stats = {"coverage": float(mask.mean()), "shapeDrift": float(drift)}
    return out, uvs, baked_base, baked_mr, material, stats


def _jpeg(img: Image.Image, quality: int = 90) -> Image.Image:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality, optimize=True)
    buf.seek(0)
    return Image.open(buf)


def build_tier2(spec: Tier2Spec, out_dir: Path) -> dict[str, Any]:
    if not spec.raw.exists():
        raise FileNotFoundError(f"{spec.id}: mesh mentah tidak ditemukan di {spec.raw}")
    raw = _load_textured(spec.raw)

    mount_point, raw_length = detect_mount(
        raw, spec.mount_axis, spec.flange_radius_ratio, spec.face_from_tip
    )
    scale = spec.effective_length_mm / 1000.0 / raw_length

    low, uvs, base, mr, src_mat, stats = bake_lod(
        raw, spec.target_triangles, spec.texture_size, spec.crease_angle_deg
    )
    low.vertices = (low.vertices - mount_point) * scale

    material = trimesh.visual.material.PBRMaterial(
        name=spec.id,
        baseColorTexture=_jpeg(base),
        metallicRoughnessTexture=_jpeg(mr) if mr is not None else None,
        metallicFactor=float(getattr(src_mat, "metallicFactor", None) or 1.0),
        roughnessFactor=float(getattr(src_mat, "roughnessFactor", None) or 1.0),
    )
    low.visual = trimesh.visual.TextureVisuals(uv=uvs, material=material)

    out_dir.mkdir(parents=True, exist_ok=True)
    glb_path = out_dir / f"{spec.id}.glb"
    trimesh.Scene({spec.id: low}).export(str(glb_path), include_normals=True)

    i, sign = AXES[spec.mount_axis]
    axis = [0.0, 0.0, 0.0]
    axis[i] = sign
    tip = np.zeros(3)
    tip[i] = (low.vertices[:, i] * sign).max() * sign

    bb_min, bb_max = low.bounds
    meta = {
        "id": spec.id,
        "name": spec.name,
        "kind": spec.kind,
        "tier": 2,
        "model": glb_path.name,
        "units": "m",
        "upAxis": "Y",
        "triangles": int(len(low.faces)),
        "boundingBox": {"min": _r(bb_min), "max": _r(bb_max)},
        "attachPoints": {
            "mountFace": {"position": [0.0, 0.0, 0.0], "normal": axis},
            "shaftTip": {"position": _r(tip), "normal": axis},
        },
        "scale": {
            "basis": spec.scale_basis,
            "overallLengthMm": spec.effective_length_mm,
            "verified": spec.scale_basis == "sourced",
            "source": spec.scale_source,
        },
        "texture": {"size": spec.texture_size, "coverage": round(stats["coverage"], 3)},
        "shapeDrift": round(stats["shapeDrift"], 4),
        "provenance": spec.provenance,
        "credits": spec.credits,
        "generator": f"aes-asset-pipeline {__version__}",
    }
    (out_dir / f"{spec.id}.meta.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return meta


def _r(v) -> list[float]:
    return [round(float(c) + 0.0, 6) for c in v]
