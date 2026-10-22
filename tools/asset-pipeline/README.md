# AES asset pipeline

Dua jalur, satu format hasil (GLB dalam meter, Y-up, plus `<id>.meta.json`):

```
Tier 3  specs/hardware/*.json -> CadQuery (B-rep) ------------------> packages/content/assets/hardware/
Alat    specs/tools/*.json    -> CadQuery (B-rep) ------------------> packages/content/assets/tools/
Tier 2  specs/tier2/*.json    -> mesh AI mentah (assets-src/) -> bake -> packages/content/assets/tier2/
Sementara specs/placeholder/*.json -> CadQuery (bentuk dasar) -------> packages/content/assets/tier2/
```

`specs/placeholder/` dipakai untuk part Tier 2 yang mesh AI-nya belum ada (misalnya kuota generator
habis). Konvensinya sama dengan Tier 2 (titik asal di muka flange, metadata `attachPoints.mountFace`),
jadi game tidak perlu diubah saat mesh asli menggantikannya. Ukurannya hanya visual: spesifikasi
boleh tanpa `source.url` asal ada `"placeholder": true`, dan metadata menandai `source.kind = "placeholder"`.

- **Tier 3** (baut, mur, ring, nanti pipa, bracket, klem): model parametrik dari
  dimensi bersumber.
- **Tier 2** (magneto, starter, karburator, dll.): mesh hasil AI image-to-3D yang
  dirampingkan dan di-bake ulang teksturnya supaya ringan di web.

## Kenapa parametrik, bukan modeling manual

- **Dimensi bisa dilacak.** Setiap angka berasal dari `specs/*.json` yang wajib
  punya `source.url`. Kalau sumber direvisi, cukup ubah angka lalu build ulang.
- **Satu generator, banyak varian.** AN3-10 dan AN4-12 memakai kode yang sama;
  yang berbeda hanya file spesifikasinya.
- **Tes otomatis.** Ukuran geometri hasil ekspor dicek terhadap spesifikasi,
  termasuk orientasi dan satuan setelah dimuat sebagai GLB.

Sesuai GDD, ulir tidak dimodelkan. Bagian berulir dipisah sebagai mesh `thread`
supaya game bisa memberi normal map ulir di situ.

## Konvensi

| Hal | Nilai |
|---|---|
| Satuan GLB dan metadata | meter |
| Sumbu atas | +Y (glTF / Three.js) |
| Sumbu part | sumbu panjang part sejajar Y |
| Titik asal | permukaan tumpu: bawah kepala baut, muka bawah mur dan ring |
| Nilai yang dimodelkan | nominal = nilai tengah rentang min–maks dari sumber |
| Anggaran segitiga | ≤ 3000 per part (dirender ratusan kali lewat instancing) |
| Anggaran segitiga alat | ≤ 8000 (cuma satu instance di layar) |
| Titik asal alat | pusat square drive kunci torsi |

Writer glTF OpenCascade sudah mengubah Z-up (CAD) ke Y-up. Pipeline hanya
menambah node akar berskala 0,001 (mm ke m), **tanpa rotasi tambahan**.
Tes `test_baut_berdiri_tegak_kepala_di_atas` menjaga hal ini.

## Metadata (`<id>.meta.json`)

- `attachPoints`: titik pasang (posisi dalam meter, plus `normal` atau `axis`),
  dipakai mode rakit untuk snap part, misalnya `headBearing`, `tip`, `cotterHole`.
- `dimensions`: rentang min–maks dan nominal dalam satuan asli, untuk handbook.
- `source.verified`: `false` sampai angka dicek ke dokumen standar resmi.
  Game boleh menampilkan tanda "data belum diverifikasi" berdasarkan field ini.

## Tier 2: dari mesh AI ke aset game

Mesh dari generator AI biasanya ratusan ribu segitiga dengan atlas UV yang
terpecah-pecah. Simplifier biasa tidak bisa menembus sambungan UV, jadi kalau
dipaksa, teksturnya rusak. Pipeline ini memakai alur bake:

1. Las vertex, kurangi polygon hanya berdasarkan bentuk (`fast-simplification`).
2. Normal halus dengan sudut patah (`creaseAngleDeg`), supaya tepi tajam tetap tajam.
3. Atlas UV baru (`xatlas`).
4. Bake tekstur base color dan metallic-roughness dari mesh mentah ke atlas baru
   (texel dicocokkan ke titik terdekat di permukaan mesh mentah).
5. Titik asal dipindah ke muka flange dudukan (`attachPoints.mountFace`), lalu diskalakan ke meter.

Pengaman: kalau simplifikasi menggeser bounding box lebih dari 2% (misalnya poros
kecil hilang), build gagal dengan pesan untuk menaikkan `targetTriangles`.
Anggaran Tier 2: maksimal 30.000 segitiga per part, tekstur JPEG 1024 px.

### Skala

Mesh AI tidak punya ukuran nyata. `scale.overallLengthMm` wajib bersumber
(`scale.source.url`). Selama belum ada, isi `placeholderLengthMm`; metadata akan
menandai `scale.basis = "placeholder"` dan `verified: false`.

### Alur membuat part Tier 2 baru

1. Gambar input: foto sendiri, gambar CC0, atau hasil generate sendiri (aturan GDD).
   Saran: [FLUX.1 schnell](https://huggingface.co/spaces/black-forest-labs/FLUX.1-schnell)
   (Apache 2.0, tanpa kewajiban kredit). Meshy Free hanya memberi sedikit jatah gambar.
2. Generate 3D di [TRELLIS.2](https://huggingface.co/spaces/microsoft/TRELLIS.2)
   (login Hugging Face untuk kuota GPU), lalu Extract GLB.
3. Simpan gambar dan GLB mentah di `assets-src/tier2/<part>/`.
4. Buat `specs/tier2/<part>.json` (salin `magneto.json`), isi `mount.axis`
   (arah poros/muka dudukan di mesh mentah) dan `credits`. Kalau deteksi muka
   flange otomatis meleset (ada tonjolan lain yang lebih lebar dari flange, seperti
   stud terminal di starter), isi `mount.faceFromTip` hasil pengamatan visual.
5. `aes-assets --only <id>` lalu cek hasilnya.

## Setup (Windows)

Butuh Python 3.11–3.13. CadQuery 2.7 belum mendukung 3.14.

```powershell
cd D:\AES\tools\asset-pipeline
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -e ".[dev]"
```

Unduhan wheel OCP sekitar 100 MB. Kalau `pip` gagal dengan *hash mismatch*,
unduhannya terpotong. Ulangi dengan `pip install --no-cache-dir --retries 5 -e ".[dev]"`.

## Pemakaian

```powershell
# Bangun semua part ke packages/content/assets/hardware
aes-assets

# Satu part saja
aes-assets --only hw.bolt.an3-10

# Hardware saja (cepat, tanpa bake Tier 2)
aes-assets --skip-tier2

# Tes cepat (fixture sintetis)
pytest

# Tes aset nyata Tier 2 (sekitar 1 menit)
pytest -m slow
```

## Menambah part

1. Buat `specs/hardware/<nama>.json`. Salin yang sudah ada sebagai contoh.
2. Isi dimensi dari sumber dengan rentang `{min, max}` bila sumber memberi
   toleransi. `source.url` wajib. Biarkan `verified: false` sampai dicek.
3. Jalankan `aes-assets --only <id>` lalu `pytest`.
4. Kalau `kind` baru (misalnya `clamp`), tambah generator di
   `aes_assets/generators.py` beserta tesnya.

## Status data

| Part | Sumber | Terverifikasi |
|---|---|---|
| `hw.bolt.an3-10` | katalog distributor | belum |
| `hw.nut.ms21044n3` | katalog distributor | belum |
| `hw.washer.an960-10` | katalog distributor | belum |
| `acc.magneto.mk1` | TRELLIS.2 dari gambar Meshy (CC BY 4.0) | skala placeholder 180 mm |
| `acc.starter.mk1` | TRELLIS.2 dari gambar Meshy (CC BY 4.0) | skala placeholder 200 mm |
| `tool.torque-wrench.40-200` | dimensi katalog distributor; bentuk mengikuti referensi visual, bukan salinan model | belum |

Catatan: GLB mur (`hw.nut.ms21044n3`) tidak identik byte-per-byte antar build,
walau geometrinya sama. Kalau git menandainya berubah setelah build ulang, abaikan.
