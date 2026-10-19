"""Tes tahap Tier 2 dengan fixture sintetis.

Fixture meniru bentuk magneto: poros kecil di ujung -X, flange lebar, lalu badan.
Tekstur dibuat dua warna (merah di sisi poros, biru di sisi belakang), supaya
hasil bake bisa dicek warnanya tanpa menyimpan file mentah besar di repo.
"""

import json
from pathlib import Path

import numpy as np
import pygltflib
import pytest
import trimesh
from PIL import Image

from aes_assets.spec import SpecError
from aes_assets.tier2 import (
    TRIANGLE_BUDGET,
    SimplificationError,
    bake_lod,
    build_tier2,
    detect_mount,
    load_tier2_spec,
)

REPO_SPECS = Path(__file__).resolve().parent.parent / "specs" / "tier2"

# Ukuran fixture dalam satuan mentah (tanpa skala nyata, seperti output AI)
SHAFT_LEN, FLANGE_LEN, BODY_LEN = 0.10, 0.05, 0.60
SHAFT_R, FLANGE_R, BODY_R = 0.06, 0.35, 0.27
X0 = -0.5  # ujung poros


def _cyl(radius, length, x_start):
    c = trimesh.creation.cylinder(radius=radius, height=length, sections=64)
    c.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    c.apply_translation([x_start + length / 2, 0, 0])
    return c


def _fixture_mesh() -> trimesh.Trimesh:
    parts = [
        _cyl(SHAFT_R, SHAFT_LEN, X0),
        _cyl(FLANGE_R, FLANGE_LEN, X0 + SHAFT_LEN),
        _cyl(BODY_R, BODY_LEN, X0 + SHAFT_LEN + FLANGE_LEN),
    ]
    mesh = trimesh.util.concatenate(parts)
    mesh = mesh.subdivide().subdivide()  # cukup padat supaya ada yang dikurangi
    total = SHAFT_LEN + FLANGE_LEN + BODY_LEN
    u = (mesh.vertices[:, 0] - X0) / total  # 0 di ujung poros, 1 di belakang
    ang = np.arctan2(mesh.vertices[:, 2], mesh.vertices[:, 1])
    uv = np.stack([u, (ang + np.pi) / (2 * np.pi)], axis=1)

    tex = np.zeros((128, 128, 3), np.uint8)
    tex[:, :64] = (220, 30, 30)   # u < 0.5: merah
    tex[:, 64:] = (30, 30, 220)   # u >= 0.5: biru
    mr = np.full((128, 128, 3), (0, 128, 255), np.uint8)
    mat = trimesh.visual.material.PBRMaterial(
        baseColorTexture=Image.fromarray(tex), metallicRoughnessTexture=Image.fromarray(mr)
    )
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv, material=mat)
    return mesh


@pytest.fixture(scope="module")
def raw_mesh():
    return _fixture_mesh()


@pytest.fixture
def repo(tmp_path, raw_mesh):
    raw_path = tmp_path / "assets-src" / "fixture-raw.glb"
    raw_path.parent.mkdir(parents=True)
    raw_mesh.export(str(raw_path))
    return tmp_path


def _write_spec(folder: Path, **overrides) -> Path:
    spec = {
        "id": "acc.fixture",
        "name": "Fixture",
        "kind": "magneto",
        "tier": 2,
        "source": {"raw": "assets-src/fixture-raw.glb"},
        "mount": {"axis": "-x", "flangeRadiusRatio": 0.75},
        "scale": {"overallLengthMm": None, "placeholderLengthMm": 150},
        "lod0": {"targetTriangles": 4000, "textureSize": 256},
        "credits": ["kredit uji"],
    }
    for key, value in overrides.items():
        spec[key] = value
    path = folder / "fixture.json"
    path.write_text(json.dumps(spec), encoding="utf-8")
    return path


# ---------- Spesifikasi ----------

REPO_SPEC_FILES = sorted(REPO_SPECS.glob("*.json"))


@pytest.mark.parametrize("path", REPO_SPEC_FILES, ids=lambda p: p.stem)
def test_spesifikasi_tier2_di_repo_valid(tmp_path, path):
    spec = load_tier2_spec(path, tmp_path)
    assert spec.target_triangles <= TRIANGLE_BUDGET
    assert spec.credits, "tiap aset AI wajib mencantumkan kredit generator"
    if spec.scale_basis == "placeholder":
        assert spec.scale_source is None


def test_id_tier2_di_repo_unik(tmp_path):
    ids = [load_tier2_spec(p, tmp_path).id for p in REPO_SPEC_FILES]
    assert len(ids) == len(set(ids))


def test_panjang_bersumber_wajib_punya_url(repo):
    path = _write_spec(repo, scale={"overallLengthMm": 160, "source": {}})
    with pytest.raises(SpecError, match="source.url"):
        load_tier2_spec(path, repo)


def test_tanpa_panjang_sama_sekali_ditolak(repo):
    path = _write_spec(repo, scale={"overallLengthMm": None})
    with pytest.raises(SpecError, match="placeholder"):
        load_tier2_spec(path, repo)


def test_target_segitiga_di_atas_anggaran_ditolak(repo):
    path = _write_spec(repo, lod0={"targetTriangles": TRIANGLE_BUDGET + 1})
    with pytest.raises(SpecError, match="targetTriangles"):
        load_tier2_spec(path, repo)


# ---------- Geometri ----------

def test_muka_flange_terdeteksi(raw_mesh):
    point, length = detect_mount(raw_mesh, "-x", 0.75)
    assert length == pytest.approx(SHAFT_LEN + FLANGE_LEN + BODY_LEN, rel=1e-6)
    assert point[0] == pytest.approx(X0 + SHAFT_LEN, abs=0.01 * length)
    assert point[1:] == pytest.approx([0, 0], abs=1e-3)


def test_muka_flange_manual_menang_atas_deteksi(raw_mesh):
    point, length = detect_mount(raw_mesh, "-x", 0.75, face_from_tip=0.5)
    assert point[0] == pytest.approx(X0 + 0.5 * length, abs=1e-9)


def test_face_from_tip_di_luar_rentang_ditolak(repo):
    path = _write_spec(repo, mount={"axis": "-x", "faceFromTip": 1.2})
    with pytest.raises(SpecError, match="faceFromTip"):
        load_tier2_spec(path, repo)


def test_bake_memindahkan_warna_tekstur(raw_mesh):
    low, uvs, base, mr, _, stats = bake_lod(raw_mesh, 4000, 256, 35)
    assert len(low.faces) <= 4000 * 1.02
    assert stats["coverage"] > 0.3

    tex = np.asarray(base)
    px = np.clip((uvs[:, 0] * 255).astype(int), 0, 255)
    py = np.clip(((1 - uvs[:, 1]) * 255).astype(int), 0, 255)
    colors = tex[py, px].astype(int)
    shaft_side = low.vertices[:, 0] < X0 + 0.2
    back_side = low.vertices[:, 0] > 0.05  # u > 0.73, jauh dari batas merah-biru di u = 0.5
    assert colors[shaft_side, 0].mean() > colors[shaft_side, 2].mean() + 100, "sisi poros harus merah"
    assert colors[back_side, 2].mean() > colors[back_side, 0].mean() + 100, "sisi belakang harus biru"


def test_simplifikasi_yang_menghilangkan_poros_ditolak(raw_mesh):
    # Di 2000 segitiga, poros kecil fixture ikut lenyap. Pipeline harus menolak, bukan diam-diam lolos.
    with pytest.raises(SimplificationError, match="targetTriangles"):
        bake_lod(raw_mesh, 2000, 256, 35)


# ---------- Ekspor ----------

def test_build_tier2_skala_titik_asal_dan_metadata(repo):
    spec = load_tier2_spec(_write_spec(repo), repo)
    out = repo / "out"
    meta = build_tier2(spec, out)

    loaded = trimesh.load(str(out / "acc.fixture.glb")).to_geometry()
    lo, hi = loaded.bounds
    assert hi[0] - lo[0] == pytest.approx(0.150, rel=0.005), "panjang = placeholder 150 mm"
    shaft_mm = SHAFT_LEN / (SHAFT_LEN + FLANGE_LEN + BODY_LEN) * 150
    assert lo[0] == pytest.approx(-shaft_mm / 1000, abs=0.002), "titik asal di muka flange"

    assert meta["boundingBox"]["min"] == pytest.approx(list(lo), abs=1e-5)
    assert meta["boundingBox"]["max"] == pytest.approx(list(hi), abs=1e-5)
    assert meta["triangles"] <= 4000 * 1.02
    assert meta["scale"] == {
        "basis": "placeholder", "overallLengthMm": 150, "verified": False, "source": None,
    }
    assert meta["attachPoints"]["mountFace"] == {"position": [0.0, 0.0, 0.0], "normal": [-1.0, 0.0, 0.0]}
    assert meta["credits"] == ["kredit uji"]

    gltf = pygltflib.GLTF2().load(str(out / "acc.fixture.glb"))
    assert [img.mimeType for img in gltf.images] == ["image/jpeg", "image/jpeg"]
    assert not gltf.extensionsRequired, "GLB harus bisa dimuat tanpa ekstensi tambahan"


def test_mesh_mentah_hilang_memberi_error_jelas(repo):
    spec = load_tier2_spec(_write_spec(repo, source={"raw": "assets-src/tidak-ada.glb"}), repo)
    with pytest.raises(FileNotFoundError, match="mesh mentah"):
        build_tier2(spec, repo / "out")


# ---------- Aset nyata (lambat, opt-in: pytest -m slow) ----------

REPO_ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.slow
@pytest.mark.parametrize("path", REPO_SPEC_FILES, ids=lambda p: p.stem)
def test_aset_tier2_nyata_lolos_anggaran(tmp_path, path):
    spec = load_tier2_spec(path, REPO_ROOT)
    if not spec.raw.exists():
        pytest.skip(f"mesh mentah tidak ada: {spec.raw}")
    meta = build_tier2(spec, tmp_path)
    axis = {"x": 0, "y": 1, "z": 2}[spec.mount_axis[1]]
    length_m = meta["boundingBox"]["max"][axis] - meta["boundingBox"]["min"][axis]
    assert meta["triangles"] <= TRIANGLE_BUDGET
    assert length_m == pytest.approx(spec.effective_length_mm / 1000, rel=0.01)
    assert meta["shapeDrift"] < 0.02
