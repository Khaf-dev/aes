# apps/game

Aplikasi game AES: hanggar 3D (React Three Fiber) + overlay UI (React).

```bash
pnpm --filter @aes/game dev        # server dev (atau dari root: pnpm dev)
pnpm --filter @aes/game test       # unit test logika mode rakit
pnpm --filter @aes/game build      # build produksi ke dist/
```

Tambahkan `?debug` di URL untuk kait uji otomatis (`window.__aes`).

## Isi irisan pertama (mode rakit, magneto kiri)

- Hanggar malam dengan lampu satuan fisik (lumen, lux, decay 2) dan headlamp mekanik di kamera.
- Kamera orbit berbatas ruangan, tidak menembus benda padat.
- Ambil magneto dari meja part, pasang ke pad lewat bayangan pemasangan, pasang ring & mur di stud.
- Mode kunci torsi (T) dan close-up hybrid: kunci 3D dari asset pipeline + skala mikrometer di kaca pembesar.
- Keadaan rakitan diterjemahkan ke `AssemblyLog` sim-core (torsi per mur), defect tersembunyi sampai tes.

Belum diporting dari prototipe (irisan berikutnya): lensa x-ray, tag inspeksi, shadow board,
meja kerja + task card fisik, papan tulis, starter, putar otomatis kamera.

## Struktur

```
src/data/       definisi part + pad (posisi stud dari model hasil pipeline)
src/logic/      aturan murni tanpa three.js: kunci klik, aturan fisik rakit, jembatan ke sim-core (diuji vitest)
src/state/      store zustand + aksi tarik gagang
src/scene/      komponen R3F: hanggar, mesin, part Tier 2, kunci torsi + kamera close-up, lampu, kamera
src/ui/         overlay DOM: strip task card, HUD, close-up kunci torsi
```

Aset GLB disajikan langsung dari `packages/content/assets` (lihat `vite.config.ts`).
