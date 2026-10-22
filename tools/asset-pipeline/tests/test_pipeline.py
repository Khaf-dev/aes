import json
from pathlib import Path

import pygltflib
import pytest
import trimesh

from aes_assets.export import MM_TO_M, export_part, to_runtime
from aes_assets.generators import generate
from aes_assets.spec import Dimension, SpecError, load_spec, load_specs

SPECS = Path(__file__).resolve().parent.parent / "specs" / "hardware"
TOOL_SPECS = Path(__file__).resolve().parent.parent / "specs" / "tools"
TOL_MM = 0.02
TRIANGLE_BUDGET = 3000  # part Tier 3 dirender ratusan kali lewat instancing
TOOL_TRIANGLE_BUDGET = 8000  # alat cuma satu salinan di scene, boleh lebih detail


def spec(part_id: str):
    return next(s for s in load_specs(SPECS) if s.id == part_id)


def extents(generated):
    import cadquery as cq

    compound = cq.Compound.makeCompound([m.shape.val() for m in generated.meshes])
    bb = compound.BoundingBox()
    return bb.xlen, bb.ylen, bb.zlen, bb


# ---------- Spesifikasi ----------

def test_semua_spesifikasi_di_repo_valid():
    specs = load_specs(SPECS)
    assert {s.id for s in specs} == {"hw.bolt.an3-10", "hw.nut.ms21044n3", "hw.washer.an960-10"}
    assert all(s.source.url for s in specs)


def test_nominal_adalah_nilai_tengah_rentang():
    assert Dimension(0.365, 0.377).nominal == pytest.approx(0.371)
    assert Dimension.parse("x", {"value": 0.19}).nominal == 0.19


def test_rentang_terbalik_ditolak():
    with pytest.raises(SpecError, match="lebih besar"):
        Dimension.parse("x", {"min": 2, "max": 1})


def test_spesifikasi_tanpa_sumber_ditolak(tmp_path):
    raw = json.loads((SPECS / "an960-10.json").read_text(encoding="utf-8"))
    raw["source"]["url"] = ""
    path = tmp_path / "x.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(SpecError, match="sumber"):
        load_spec(path)


# ---------- Geometri sesuai dimensi ----------

def test_baut_an3_10_sesuai_spesifikasi():
    s = spec("hw.bolt.an3-10")
    g = generate(s)
    _, y, z, bb = extents(g)
    assert y == pytest.approx(s.mm("widthAcrossFlats"), abs=TOL_MM)
    assert z == pytest.approx(s.mm("headHeight") + s.mm("length"), abs=TOL_MM)
    assert bb.zmin == pytest.approx(-s.mm("length"), abs=TOL_MM)
    assert [m.name for m in g.meshes] == ["body", "thread"]
    assert "cotterHole" in g.attach


def test_mur_ms21044n3_sesuai_spesifikasi():
    s = spec("hw.nut.ms21044n3")
    g = generate(s)
    _, y, z, _ = extents(g)
    assert y == pytest.approx(s.mm("widthAcrossFlats"), abs=TOL_MM)
    assert z == pytest.approx(s.mm("height"), abs=TOL_MM)
    assert [m.name for m in g.meshes] == ["body", "nylonInsert"]


def test_ring_an960_10_sesuai_spesifikasi():
    s = spec("hw.washer.an960-10")
    x, y, z, _ = extents(generate(s))
    assert x == pytest.approx(s.mm("outsideDiameter"), abs=TOL_MM)
    assert y == pytest.approx(s.mm("outsideDiameter"), abs=TOL_MM)
    assert z == pytest.approx(s.mm("thickness"), abs=TOL_MM)


def test_baut_masuk_ke_mur_dan_ring():
    bolt, nut, washer = spec("hw.bolt.an3-10"), spec("hw.nut.ms21044n3"), spec("hw.washer.an960-10")
    assert bolt.mm("threadDiameter") < washer.mm("insideDiameter")
    assert bolt.mm("threadDiameter") == pytest.approx(nut.mm("threadDiameter"))


# ---------- Ekspor ----------

def test_konversi_koordinat_runtime():
    assert to_runtime([0, 0, 10], is_point=True) == [0, 0.01, 0]
    assert to_runtime([0, 1, 0], is_point=False) == [0, 0, -1]


@pytest.mark.parametrize("part_id", ["hw.bolt.an3-10", "hw.nut.ms21044n3", "hw.washer.an960-10"])
def test_ekspor_glb_meter_y_up(tmp_path, part_id):
    s = spec(part_id)
    meta = export_part(s, generate(s), tmp_path)

    gltf = pygltflib.GLTF2().load(str(tmp_path / f"{part_id}.glb"))
    root = gltf.nodes[gltf.scenes[gltf.scene or 0].nodes[0]]
    assert root.name == part_id
    assert root.scale == [MM_TO_M] * 3
    assert root.rotation in (None, [0, 0, 0, 1])

    # Geometri yang dimuat harus cocok dengan bounding box di metadata (meter, Y-up).
    loaded = trimesh.load(str(tmp_path / f"{part_id}.glb")).to_geometry()
    assert loaded.bounds[0] == pytest.approx(meta["boundingBox"]["min"], abs=2e-5)
    assert loaded.bounds[1] == pytest.approx(meta["boundingBox"]["max"], abs=2e-5)

    assert 0 < meta["triangles"] <= TRIANGLE_BUDGET
    assert meta["units"] == "m" and meta["upAxis"] == "Y"
    assert meta["source"]["verified"] is False

    saved = json.loads((tmp_path / f"{part_id}.meta.json").read_text(encoding="utf-8"))
    assert saved == meta


def test_baut_berdiri_tegak_kepala_di_atas(tmp_path):
    s = spec("hw.bolt.an3-10")
    export_part(s, generate(s), tmp_path)
    loaded = trimesh.load(str(tmp_path / "hw.bolt.an3-10.glb")).to_geometry()
    lo, hi = loaded.bounds
    size = hi - lo
    assert size[1] == max(size), "sumbu panjang baut harus Y (tegak)"
    assert hi[1] == pytest.approx(s.mm("headHeight") * MM_TO_M, abs=2e-5), "kepala di atas"
    assert lo[1] == pytest.approx(-s.mm("length") * MM_TO_M, abs=2e-5), "ujung baut di bawah"


def test_metadata_ring_dalam_meter(tmp_path):
    s = spec("hw.washer.an960-10")
    meta = export_part(s, generate(s), tmp_path)
    height_m = meta["boundingBox"]["max"][1] - meta["boundingBox"]["min"][1]
    width_m = meta["boundingBox"]["max"][0] - meta["boundingBox"]["min"][0]
    assert height_m == pytest.approx(s.mm("thickness") * MM_TO_M, abs=1e-5)
    assert width_m == pytest.approx(s.mm("outsideDiameter") * MM_TO_M, abs=1e-5)
    assert meta["attachPoints"]["top"]["position"][1] == pytest.approx(s.mm("thickness") * MM_TO_M, abs=1e-6)
    assert meta["attachPoints"]["top"]["normal"] == [0, 1, 0]


# ---------- Alat: kunci torsi ----------

def test_kunci_torsi_sesuai_dimensi_bersumber(tmp_path):
    s = load_specs(TOOL_SPECS)[0]
    g = generate(s)
    x, y, z, bb = extents(g)
    assert z == pytest.approx(s.mm("overallLength"), abs=TOL_MM)
    drive = next(m for m in g.meshes if m.name == "drive").shape.val().BoundingBox()
    assert drive.xlen == pytest.approx(s.mm("driveSize"), abs=TOL_MM)
    body = next(m for m in g.meshes if m.name == "body").shape.val().BoundingBox()
    assert body.ylen == pytest.approx(s.mm("headHeight"), abs=0.5), "tebal kepala = tinggi kepala katalog"
    assert {"body", "drive", "barrel", "grip"} <= {m.name for m in g.meshes}

    meta = export_part(s, g, tmp_path)
    loaded = trimesh.load(str(tmp_path / f"{s.id}.glb")).to_geometry()
    size = loaded.bounds[1] - loaded.bounds[0]
    assert size[1] == pytest.approx(s.mm("overallLength") * MM_TO_M, abs=1e-4), "sumbu panjang = Y"
    assert meta["attachPoints"]["drive"]["axis"] == [0, 0, -1], "square drive mengarah -z (masuk ke mur)"
    assert 0 < meta["triangles"] <= TOOL_TRIANGLE_BUDGET


def test_alternator_placeholder_siap_dipasang_seperti_part_tier2(tmp_path):
    spec = load_spec(Path(__file__).resolve().parent.parent / "specs" / "placeholder" / "alternator.json")
    meta = export_part(spec, generate(spec), tmp_path)
    mount = meta["attachPoints"]["mountFace"]
    assert mount == {"position": [0.0, 0.0, 0.0], "normal": [1.0, 0.0, 0.0]}
    bb = meta["boundingBox"]
    assert bb["min"][0] == pytest.approx(-0.150, abs=1e-3)  # badan ke -x, poros ke +x
    assert bb["max"][0] == pytest.approx(0.018, abs=1e-3)
    assert meta["attachPoints"]["outputTerminal"]["position"][1] > 0.055  # terminal di atas badan (+Y)
    assert bb["max"][2] == pytest.approx(0.062, abs=1e-3)  # telinga flange di ±Z runtime, sejajar stud pad
    assert meta["source"]["kind"] == "placeholder" and meta["source"]["verified"] is False
    assert meta["triangles"] <= 30000
