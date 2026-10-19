# AES — Aerospace Engineer Simulator

Simulator edukatif merakit sistem pesawat dari nol, mengujinya, lalu
menginvestigasi kegagalan yang lahir dari kesalahan perakitan.
Desain lengkap ada di [`docs/GDD.md`](docs/GDD.md).

## Struktur

```
docs/              GDD dan catatan desain
packages/sim-core  logika simulasi: resource network, fault, diagnosis (TS murni, tanpa UI)
packages/content   data part & prosedur + skema validasi (Zod)
                   assets/: model GLB + metadata hasil asset pipeline (hardware, tier2)
assets-src/        bahan mentah aset: gambar input dan mesh AI sebelum diproses
tools/asset-pipeline  pipeline aset: part kecil parametrik (CadQuery) + bake mesh AI Tier 2
apps/game          aplikasi game: hanggar 3D React Three Fiber + overlay UI (mode rakit)
```

## Prasyarat

- Node.js 22 atau lebih baru
- pnpm 12 (`npm install -g pnpm`)
- Python 3.11–3.13, hanya untuk membangun ulang aset (lihat [`tools/asset-pipeline`](tools/asset-pipeline/README.md))

## Mulai

```bash
pnpm install
pnpm test        # semua unit test
pnpm typecheck   # cek tipe semua paket
pnpm dev         # jalankan game (mode rakit) di browser
```

## Aturan main

- `sim-core` tidak boleh bergantung pada UI, React, atau Three.js. Semua fungsinya murni dan deterministik.
- Konten itu data, bukan kode. Part dan prosedur ditulis di `packages/content/data` dan wajib lolos validasi.
- Nilai teknis (torsi, timing, dll.) wajib punya sumber rujukan. Kalau belum ada, isi `null`, jangan dikarang.
- Fitur baru masuk tabel Roadmap di GDD dulu, dibahas, baru dikerjakan.
