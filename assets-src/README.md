# assets-src

Bahan mentah aset yang tidak dipakai langsung oleh game: gambar input dan mesh
hasil AI image-to-3D sebelum diproses pipeline. Hasil siap pakai ada di
`packages/content/assets/`.

```
tier2/<part>/
  input-*.png        gambar input image-to-3D
  <generator>-raw.glb  mesh mentah dari generator (misalnya TRELLIS.2)
```

Asal-usul, lisensi, dan kredit tiap part dicatat di
`tools/asset-pipeline/specs/tier2/<part>.json` (field `source` dan `credits`).
Jangan edit file mentah. Kalau mau hasil lain, generate ulang dan simpan sebagai file baru.
