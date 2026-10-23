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
- Kamera badan engineer (first person): klik layar untuk mengunci kursor, mouse menoleh, bidik dan klik pakai titik tengah layar (Esc melepas kursor, klik kanan menaruh part kembali); WASD/panah jalan, C jongkok, Q/E turun/naik (tinggi mata 0,55–1,8 m), Shift cepat. Badan tidak menembus benda padat.
- F: mode fokus (orbit) di sekitar benda yang ditunjuk; benda yang menghalangi (firewall, engine mount, stand) jadi tembus pandang. WASD kembali jalan, P putar otomatis memutari mesin, R kembali ke posisi awal.
- Klik meja kerja membuka task card (tab ke semua task card).
- Buku panduan (B): halaman per task card dengan WARNING/CAUTION/NOTE bersumber (FAA), prosedur dari data langkah, dan daftar rujukan.
- Ambil magneto, starter, atau alternator dari meja part, pasang ke pad lewat bayangan pemasangan (pad lain menolak), pasang ring & mur di stud.
- Mode kunci torsi (T) dan close-up hybrid: kunci 3D dari asset pipeline + skala mikrometer di kaca pembesar.
- Tang safety wire (K): klik mur pertama lalu pasangannya, pilih arah lilitan sendiri; klik mur berkawat untuk memotong.
- Mode dokumen: klik task card di meja kerja untuk checklist (centang + paraf sendiri) dan tanda tangan. Tidak memeriksa apa pun.
- Magneto kiri & kanan, starter, alternator, karburator (dua terakhir mesh placeholder CadQuery); P-lead magneto, kabel output alternator, dan selang bahan bakar karburator disambung lewat klik terminal di part.
- Karburator dipasang di pad bawah bak oli (4 mur). Tanpa karburator atau selang bahan bakar, mesin berputar tapi tidak hidup saat tes.
- FOD: alat yang belum dikembalikan ke shadow board (T/W masih aktif) saat tes dimulai jadi temuan FOD di laporan.
- Torsi mur klem bersumber (AC 43.13-1B Tabel 7-1, 100–140 in-lb); setelah tes, inspektur mengecek torsi mur klem dan menemukan mur yang kurang torsi.
- Tes darat (G): ground power-up (listrik) + start mesin dan mag check (pengapian) + pengisian alternator di sim-core, hasilnya laporan kertas kuning dengan clue task card.
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
