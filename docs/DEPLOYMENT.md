# Panduan deployment (semua gratis, tanpa kartu kredit)

Urutan: A Google Sheet + Apps Script → B GitHub → C hubungkan → D uji sambungan → E uji pengiriman nyata → F backup → G pembaruan → H pengumpulan data.

## A. Google Sheet dan Apps Script
Ikuti `backend/README.md` (8 langkah). Hasil akhirnya: alamat Web App berakhiran `/exec`. Sheet **tidak boleh dibagikan** (jangan klik Share).

## B. GitHub dan GitHub Pages
1. Daftar di github.com. Pada paket Free, GitHub Pages hanya untuk repositori **Public**: semua berkas kode dapat dilihat orang lain. Itu aman karena data responden tidak pernah ada di repositori (hanya di Google Sheets Anda). **Jangan pernah mengunggah CSV data, folder `ml/data`, atau `ml/reports/.../private`.**
2. New repository → nama misalnya `kuesioner-media-sosial` → Public → buat.
3. Add file → Upload files → tarik **isi** folder proyek, sehingga `index.html` berada di akar repositori (bukan di dalam subfolder) → Commit changes.
4. Settings → Pages → Build and deployment → Source: *Deploy from a branch* → Branch `main`, folder `/ (root)` → Save.
5. Tunggu 1–3 menit. Alamat situs muncul di halaman Pages: `https://USERNAME.github.io/kuesioner-media-sosial/`.

## C. Menghubungkan situs ke backend
Di repositori buka `config.js` → ikon pensil → isi `BACKEND_URL` dengan alamat `/exec` (dan `RESEARCHER_CONTACT` bila perlu) → Commit changes → tunggu build ulang 1–2 menit.

## D. Uji sambungan (tidak menyimpan data)
Buka `https://USERNAME.github.io/kuesioner-media-sosial/check.html`. Harus tampil 8 baris "✓ Berhasil". Bila ada "✗ Gagal", petunjuk perbaikannya tertulis di bawah barisnya. Jika muncul galat CORS, tekan F12 → Console, salin pesannya, dan laporkan.

## E. Uji pengiriman nyata
1. Isi kuesioner sebagai responden uji. **Pada D4 pilih "Program studi lainnya" dan tulis `UJI`.**
2. Setelah halaman terima kasih menampilkan "Jawaban Anda berhasil disimpan", buka sheet `Responses`: harus ada satu baris baru dengan `bsmas_score` dan `productivity_score` terisi. (Responden tidak melihat skor; skor hanya ada di Sheet.)
3. Uji gangguan: nyalakan mode pesawat sebelum menekan "Kirim jawaban" → pesan "belum terkirim" → matikan mode pesawat → "Coba kirim ulang" → harus tetap **satu** baris.
4. Coba di ponsel, di Light dan Dark Mode, dan dalam ID dan EN.
5. Hapus baris uji dengan aman: di Apps Script jalankan `previewTestRows` (hanya melaporkan nomor baris uji), lalu `deleteTestRows` (membuat backup lebih dulu, lalu hanya menghapus baris bertanda uji: D4 "Lainnya" = `UJI` atau ID berawalan `SYN-`; header dan jawaban asli tidak disentuh). Baris tanpa penanda itu tidak pernah dihapus otomatis; hapus manual bila perlu. Dashboard dan `preprocess.py` tetap mengecualikan baris bertanda uji yang terlewat.

## F. Backup
`setup()` memasang pemicu harian (sekitar pukul 02.00) yang menyalin Sheet ke folder Drive `Backup Kuesioner` (14 salinan terbaru). Periksa di Apps Script → ikon jam (Triggers): harus ada `backupNow`. Jalankan `backupNow` sekali secara manual dan pastikan foldernya terbentuk. Tambahan yang saya sarankan: tiap minggu unduh CSV (File → Download → CSV) ke komputer Anda sebagai cadangan di luar akun Google.

## G. Memperbarui
- Situs: edit berkas di GitHub → Commit changes.
- Backend: ubah kode di Apps Script → Deploy → Manage deployments → pensil → Version: New version → Deploy (alamat tidak berubah).
- Jika `instrument.js` diubah, salin isinya persis ke `Instrument.gs` dan deploy ulang. `check.html` akan menandai bila versinya tidak cocok.

## H. Mengumpulkan lebih dari 1.000 responden
- Bagikan tautan bertahap (per kelas atau program studi), jangan ke seluruh kampus pada menit yang sama.
- Pantau Apps Script → Executions. Jika banyak eksekusi gagal atau sering "busy", sebarkan pembagian tautan lebih lebar.
- **Uji beban bertahap** (`tests/load_test.py`), hanya pada **Sheet dan deployment uji terpisah** (salin Sheet beserta skripnya, deploy ulang, pakai alamat `/exec` yang baru), bukan pada Sheet penelitian:
  - `python3 tests/load_test.py --url ALAMAT_UJI` (di Windows `python`): mengirim uji kering bertahap 5, 10, 20, 40 pengiriman serentak tanpa menulis apa pun, lalu menampilkan waktu respons dan jumlah percobaan ulang.
  - Tambahkan `--write` untuk uji penulisan sungguhan (menguji antrean lock). Baris uji ditandai `UJI` dan harus dihapus. Skrip meminta Anda mengetik `UJI` sebelum menulis.
  - Skrip berhenti di tahap pertama yang ada kegagalannya. Hasilnya hanya ukuran untuk deployment Anda pada saat uji, bukan jaminan kapasitas; ulangi pada jam berbeda.

## I. Dashboard peneliti (hanya agregat, hanya pemilik)
Dashboard menampilkan jumlah responden, program studi, angkatan, kategori BSMAS, rata-rata skor, sebaran tiap butir, indikator kualitas data, dan status model. **Tidak ada baris mentah, ID, atau teks bebas.** Baris uji (`UJI`) tidak dihitung.

1. Di Apps Script tambahkan file Script `Admin` (isi `Admin.gs`) dan file HTML `Admin` (isi `Admin.html`). Di `Code.gs` isi `SITE_URL` dengan alamat GitHub Pages Anda agar status model tampil.
2. Jalankan fungsi `saveOwner` sekali (menyimpan email akun Anda di Script Properties, bukan di JavaScript situs). Jika `setup()` baru dijalankan, langkah ini sudah otomatis.
3. Deploy → New deployment → Web app → deskripsi "Dashboard peneliti" → Execute as: **User accessing the web app** → Who has access: **Anyone with Google account** → Deploy → setujui izin → salin alamatnya. Ini deployment **kedua**, terpisah dari deployment publik untuk responden.
4. Buka alamat dashboard tersebut ditambah `?page=admin`.

**Uji akses wajib sebelum dipakai (belum teruji di layanan Google asli):**
- a. Jendela privat tanpa login Google: harus diminta login, bukan menampilkan dashboard.
- b. Login dengan akun Google lain: harus tampil "Akses ditolak".
- c. Akun pemilik: dashboard muncul.
- d. Alamat **publik** (untuk responden) ditambah `?page=admin` di jendela privat: harus tampil "Akses ditolak".

Jika a, b, atau d menampilkan dashboard, hentikan: Deploy → Manage deployments → Archive pada deployment tersebut, lalu laporkan.
