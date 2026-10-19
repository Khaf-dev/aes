# @aes/content

Data konten AES dan skema validasinya. Konten adalah data, bukan kode.

```
data/packs/      part + langkah perakitan, satu file per bab ATA
data/networks/   resource network sesuai desain
data/scenarios/  skenario tes (posisi saklar, konsumen yang wajib bekerja)
```

## Dua jenis angka, dua aturan

- **Data teknis** (rentang torsi, sudut timing): wajib punya `source`. Kalau belum
  dirujuk, isi `range: null` dan `source: null`. Validasi menolak angka tanpa sumber.
- **Parameter gameplay** (`effects`, mis. hambatan tambahan akibat terminal kendor):
  mengatur seberapa parah akibat kesalahan di game. Tidak butuh sumber, tapi
  tetap harus masuk akal.

Nilai di `data/networks` saat ini ilustrasi prototipe dan ditandai di `description`.

## Validasi

`pnpm test` memvalidasi semua file di `data/`, termasuk referensi lintas file:
efek defect harus menunjuk link yang ada, skenario harus menunjuk saklar dan
konsumen yang ada, dan prasyarat langkah tidak boleh berputar.
