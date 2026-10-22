# apps/game

Aplikasi game AES: hanggar 3D (React Three Fiber) + overlay UI (React).

```bash
pnpm --filter @aes/game dev        # server dev (atau dari root: pnpm dev)
pnpm --filter @aes/game test       # unit test logika mode rakit
pnpm --filter @aes/game build      # build produksi ke dist/
```

Tambahkan `?debug` di URL untuk kait uji otomatis (`window.__aes`).

## Isi mode rakit

- Hanggar malam dengan lampu satuan fisik (lumen, lux, decay 2) dan headlamp mekanik di kamera.
- Kamera orbit berbatas ruangan, tidak menembus benda padat. Benda yang menghalangi pandangan (firewall, engine mount, stand) jadi tembus pandang; F mendekatkan kamera ke benda yang ditunjuk.
- Klik meja kerja membuka task card (tab ke semua task card).
- Buku panduan (B): halaman per task card dengan WARNING/CAUTION/NOTE bersumber (FAA), prosedur dari data langkah, dan daftar rujukan.
- Ambil magneto atau starter dari meja part, pasang ke pad lewat bayangan pemasangan (pad lain menolak), pasang ring & mur di stud.
- Mode kunci torsi (T) dan close-up hybrid: kunci 3D dari asset pipeline + skala mikrometer di kaca pembesar.
- Tang safety wire (W): klik mur pertama lalu pasangannya, pilih arah lilitan sendiri; klik mur berkawat untuk memotong.
- Mode dokumen: klik task card di meja kerja untuk checklist (centang + paraf sendiri) dan tanda tangan. Tidak memeriksa apa pun.
- Magneto kiri & kanan, starter; P-lead magneto disambung lewat klik terminal di belakang magneto.
- FOD: alat yang belum dikembalikan ke shadow board (T/W masih aktif) saat tes dimulai jadi temuan FOD di laporan.
- Tes darat (G): ground power-up (listrik) + start mesin dan mag check (pengapian) di sim-core, hasilnya laporan kertas kuning dengan clue task card.
- Lensa x-ray (X): kulit mesin terbuka di lingkaran kursor, hanya komponen dalam yang bisa dipilih.
- Area kerja: meja kerja + task card, shadow board (kunci torsi tergantung di slotnya), papan tulis, troli, APAR,
  lampu meja; tag inspeksi gantung; putar otomatis kamera (P).
- Keadaan rakitan diterjemahkan ke `AssemblyLog` sim-core (torsi per mur), defect tersembunyi sampai tes.

Semua fitur prototipe artifact "AES Mode Rakit" sudah dipindah ke sini.

## Struktur

```
src/data/       definisi part + pad (posisi stud dari model hasil pipeline)
src/logic/      aturan murni tanpa three.js: kunci klik, aturan fisik rakit, jembatan ke sim-core (diuji vitest)
src/state/      store zustand + aksi tarik gagang
src/scene/      komponen R3F: hanggar, mesin, part Tier 2, kunci torsi + kamera close-up, lampu, kamera
src/ui/         overlay DOM: strip task card, HUD, close-up kunci torsi
```

Aset GLB disajikan langsung dari `packages/content/assets` (lihat `vite.config.ts`).
