# Instalasi dari nol (urutan kerja)

## 0. Yang perlu disiapkan (semua gratis)
- Akun Google (untuk Sheets, Apps Script, Drive) dan akun GitHub.
- Komputer dengan Python 3.10+ (hanya untuk melatih model nanti). Node.js hanya bila ingin menjalankan uji otomatis.
- Berkas proyek: ekstrak `questionnaire-website.zip`.

## 1. Sesuaikan sebelum memasang
1. `translations.js`: teks persetujuan (`ui.consent`) adalah **draf**; sesuaikan dengan naskah etik Anda.
2. `config.js`: isi `RESEARCHER_CONTACT` (opsional, tampil di halaman persetujuan).
3. Tinjau terjemahan English. Selama belum Anda tinjau, situs menampilkan catatan bahwa terjemahan itu menunggu tinjauan peneliti.
4. Butir, pilihan jawaban, dan skala **jangan diubah** (mengikuti Tabel 3.8). Jika perlu mengubah, ubah `instrument.js` dan `translations.js` bersama-sama, salin ulang ke `backend/Instrument.gs`, dan perbarui skripsi.

## 2. Urutan pemasangan
| Langkah | Panduan |
|---|---|
| 1. Backend Apps Script dan Google Sheet privat | `backend/README.md` |
| 2. GitHub dan GitHub Pages | `docs/DEPLOYMENT.md` bagian B dan C |
| 3. Uji sambungan (`check.html`, harus 8 ✓) | bagian D |
| 4. Uji pengiriman nyata (D4 = "Lainnya" → `UJI`), uji gangguan koneksi, hapus baris uji | bagian E |
| 5. Backup dan dashboard peneliti, termasuk uji akses 4 langkah | bagian F dan I |
| 6. Uji beban pada deployment uji terpisah | bagian H |
| 7. Pengumuman bertahap | bagian H |

## 3. Menyiapkan komputer untuk pelatihan (nanti, setelah data terkumpul)
`docs/MODEL_TRAINING.md` bagian 1 (Python dan pustaka). Tidak diperlukan untuk menjalankan situs.

## 4. Daftar periksa sebelum pengumuman
- [ ] `check.html` menampilkan 8 baris ✓.
- [ ] Setelah mengirim muncul halaman terima kasih dengan "Jawaban Anda berhasil disimpan"; satu baris uji muncul di sheet `Responses`; baris uji sudah dihapus (`previewTestRows` lalu `deleteTestRows`).
- [ ] Uji mode pesawat: tetap satu baris setelah "Coba kirim ulang".
- [ ] Folder `Backup Kuesioner` terbentuk di Drive; unduhan CSV mingguan terjadwal.
- [ ] Dashboard lulus uji akses a–d; Google Sheet tidak dibagikan ke siapa pun.
- [ ] Teks persetujuan sesuai naskah etik; kontak peneliti terisi.
- [ ] Repositori tidak berisi data responden. `model/model-metadata.json` masih berstatus `not_trained` dan tidak ada `model/model.json` sebelum evaluasi.
- [ ] Tautan dibagikan bertahap, bukan serentak.

## 5. Bila ada masalah
| Gejala | Tindakan |
|---|---|
| `check.html`: baris "Backend menjawab" gagal | Periksa deployment: Execute as "Me", akses "Anyone"; buka alamat `/exec` langsung di peramban |
| `check.html`: versi instrumen berbeda | Salin ulang `Instrument.gs` ke Apps Script, deploy versi baru |
| Galat CORS di Console (F12) | Catat pesan lengkapnya dan laporkan; jangan umumkan situs dulu |
| Banyak "belum terkirim" saat ramai | Sebar pembagian tautan; lihat Apps Script → Executions; `docs/LIMITATIONS.md` |
| Dashboard "Akses ditolak" untuk akun Anda | Jalankan `saveOwner`; buka alamat dashboard (deployment kedua) dengan `?page=admin` |
