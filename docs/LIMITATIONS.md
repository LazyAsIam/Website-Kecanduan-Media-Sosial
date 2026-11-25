# Keterbatasan dan batas layanan gratis

## Kuota (diperiksa dari dokumentasi resmi pada 21 November 2026; dapat berubah tanpa pemberitahuan)
**Google Apps Script, akun Gmail pribadi**
- Waktu satu eksekusi: 6 menit.
- Eksekusi bersamaan: 30 per pengguna (1.000 per skrip).
- Total waktu pemicu: 90 menit per hari (relevan hanya untuk backup harian, yang sangat singkat).
- Baca/tulis Properties: 50.000 per hari (backend membaca satu kali per pengiriman).
- Kuota direset 24 jam setelah permintaan pertama.

**GitHub Pages**
- Situs terbit maksimal 1 GB (situs ini kurang dari 1 MB).
- Batas lunak bandwidth 100 GB per bulan dan 10 build per jam (relevan bila Anda sering commit). Bila terkena pembatasan laju, pengunjung menerima HTTP 429.
- Pada paket Free, repositori harus Public.

Sumber: developers.google.com/apps-script/guides/services/quotas dan docs.github.com/pages/getting-started-with-github-pages/github-pages-limits.

## Artinya untuk 1.000+ responden
- Volume total kecil: sekitar 1.000 baris × 42 kolom. Google Sheets tidak menjadi masalah.
- Titik rawan adalah **lonjakan serentak**. Penulisan diurutkan oleh LockService (menunggu hingga 25 detik per permintaan). Lama satu penulisan **belum saya ukur**, jadi jumlah pengiriman serentak yang aman belum diketahui. Pengiriman yang gagal karena sibuk diulang otomatis (jeda 1, 2, 4, 8 detik dan seterusnya) dengan ID yang sama, sehingga tidak membuat data ganda.
- Mitigasi gratis: sebar tautan, uji kecil dahulu, pantau Executions, backup harian dan mingguan.
- **Saya tidak menjanjikan bahwa 1.000+ responden pasti tertangani tanpa uji beban di deployment Anda.**

## Yang tidak dapat dijamin
- **Duplikasi lintas perangkat.** S3 adalah laporan diri dan tidak ada identitas. ID unik hanya mencegah kirim ulang teknis. Dugaan duplikat hanya ditandai di praproses.
- **Pengiriman palsu.** Siapa pun yang tahu alamat `/exec` dapat mengirim data yang valid. Backend memeriksa kewajaran nilai, bukan keaslian responden.
- **Perilaku CORS Apps Script** hanya dapat dibuktikan di deployment Anda (`check.html`). Belum teruji di layanan Google yang asli.
- **Prediksi (saat ini tidak ditampilkan kepada responden).** Hasilnya estimasi, bukan diagnosis. Probabilitas berasal dari proporsi daun pohon dan tidak terkalibrasi. Model tidak belajar otomatis, kualitasnya bergantung pada data, dan bisa keliru.
- **Versi English** adalah terjemahan yang belum divalidasi dan tidak dapat dianggap setara secara psikometrik.
- **SHAP.** TreeSHAP di JavaScript cocok dengan perhitungan Shapley eksak dan scikit-learn pada model uji sintetis. Kecocokan dengan pustaka `shap` resmi belum diuji.
- **Dashboard peneliti**: hanya agregat dan hanya untuk akun Google pemilik. Keamanannya bergantung pada pemeriksaan identitas Google dan **belum teruji di layanan Google asli**. Jalankan uji akses 4 langkah di `docs/DEPLOYMENT.md` bagian I sebelum dipakai.
