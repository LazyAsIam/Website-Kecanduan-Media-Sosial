# Pengujian

Ada dua hal yang berbeda dan tidak boleh dicampur:
1. **Pengujian fungsional sistem** (dokumen ini): apakah kode bekerja sesuai rancangan.
2. **Evaluasi kinerja Machine Learning** (`ml/reports/vX.Y.Z/evaluation.md`): seberapa baik model memprediksi. **Belum ada**, karena data penelitian dan model sungguhan belum ada. Angka apa pun dari data sintetis tidak boleh dikutip.

## Menjalankan
```
pip install -r ml/requirements.txt     # pustaka Python
python3 tests/run_all.py               # menjalankan semua uji; berhenti dengan kode 1 bila ada yang gagal
```
Butuh Node.js 18+ dan Python 3.10+. Uji di peramban (UI, `check.html`, dashboard, panel prediksi) butuh Playwright dan Chromium (`npm install playwright`, lalu `npx playwright install chromium`; atur `NODE_PATH` bila dipasang global). Tanpa itu, uji tersebut ditandai DILEWATI, bukan lulus.

**Data dummy:** uji membuat data sintetis **sementara** di `tests/.generated/` (di-`.gitignore`) dan direktori sementara sistem, lalu menghapusnya setelah selesai (`--keep` untuk mempertahankan). Proyek tidak menyimpan data dummy. Uji tidak pernah menyentuh Google Sheet Anda.

## Hasil terakhir (dijalankan saat dokumen ini dibuat, lingkungan pengembangan)
| Rangkaian | Hasil | Cakupan |
|---|---|---|
| Instrumen (JS / Python) | 41 / 38 lulus | Skor BSMAS dan produktivitas, 18 kolom fitur, validasi (rentang, F1+F7 ≤ 24, penyaring, "Lainnya"); kasus uji dibagi JS dan Python; `Instrument.gs` identik dengan `instrument.js` |
| Terjemahan ID/EN + teks terima kasih | 136 lulus | Kunci sama; seluruh butir, pilihan, galat; teks halaman terima kasih ID persis sesuai permintaan; teks persetujuan tidak lagi menjanjikan skor |
| Backend + klien + pembersihan baris uji (tiruan Google) | 61 lulus | `Code.gs` asli di VM dengan tiruan layanan: simpan, duplikat, validasi, lock sibuk, gagal tulis, dry-run, dashboard, pembersihan baris uji (hanya yang bertanda; header dan jawaban asli tetap; backup gagal = tidak ada yang dihapus); klien: retry, ID tetap, antrean |
| Pipeline ML (data sintetis sementara) | 31 lulus | Skema = header backend, pembersihan, tanpa kebocoran fitur, split 80/20 berstrata, evaluasi sekali, gerbang kelayakan, ekspor, model sintetis ditolak masuk `model/` |
| TreeSHAP + SHAP global (Python) | 19 lulus | Sama dengan Shapley eksak, konsistensi lokal, struktur dan arah SHAP global |
| Runtime model JS | 906 lulus | Probabilitas sama dengan scikit-learn (300 profil), TreeSHAP sama dengan Shapley eksak |
| Analisis statistik | 16 lulus | Holm, Dunn (z² = H untuk dua kelompok), bootstrap vektorisasi = scipy, alfa Cronbach, hasil ujung ke ujung = scipy |
| Uji beban (server tiruan) | 7 lulus | Logika skrip: kering vs tulis, konfirmasi, retry tanpa data ganda, kegagalan dilaporkan |
| `check.html` (Chromium) | 3 skenario lulus | Sambungan dan ketidakcocokan versi terdeteksi terhadap `Code.gs` asli |
| Dashboard (Chromium) | 13 lulus | Statistik `Admin.gs` asli ditampilkan; baris uji tidak dihitung; teks bebas tidak muncul |
| UI: formulir + halaman terima kasih (Chromium) | 37 lulus | Lima skenario: ID/Light dengan retry otomatis, EN/Dark dengan galat lalu tombol coba lagi, balasan hilang (tersimpan sekali), tidak memenuhi kriteria, muat ulang setelah gagal; halaman setelah kirim tanpa skor, grafik, atau tabel; model tidak dimuat ke peramban |
| Panel prediksi, tidak dimuat situs (terisolasi) | 18 lulus | Modul prediksi/SHAP global yang disimpan untuk tahap berikutnya tetap benar dan gagal tertutup |

## Pemetaan 20 skenario pengujian
"Otomatis (tiruan)" berarti diuji terhadap tiruan layanan atau data sintetis sementara, **bukan** terhadap Google, GitHub, atau data penelitian.

| # | Skenario | Status |
|---|---|---|
| 1 | Tidak memberi persetujuan | Otomatis (UI) |
| 2 | Tidak memenuhi penyaring | Otomatis (instrumen, backend, dan layar penolakan di UI: tidak ada yang dikirim) |
| 3 | Butir wajib belum dijawab | Aturan diuji otomatis; UI sebagian (persetujuan, F1/F7) |
| 4–5 | Durasi / jam tidur di luar rentang | Otomatis (instrumen, backend) |
| 6 | Durasi + tidur > 24 jam | Otomatis (instrumen, backend, UI, `check.html`) |
| 7 | Semua valid dan terkirim | Otomatis (tiruan), termasuk halaman terima kasih dengan konfirmasi. **Backend Google asli belum** |
| 8 | Kirim ulang saat koneksi putus | Otomatis (klien; UI: gagal lalu tombol coba lagi; muat ulang lalu ditawarkan lagi dengan ID sama). Jaringan sungguhan belum |
| 9 | Penyimpanan ganda akibat retry | Otomatis (balasan hilang lalu retry = tersimpan satu kali; backend tiruan; uji beban tiruan). Google asli belum |
| 10–12 | Prediksi rendah / sedang / tinggi | **Tidak lagi ditampilkan kepada responden** (permintaan peneliti). Mesin prediksi tetap diuji pada model sintetis (runtime JS, panel terisolasi) |
| 13 | Probabilitas = Python | Otomatis (selisih ~10⁻¹⁶, model sintetis) |
| 14 | SHAP = Python | Sama dengan Shapley eksak (sintetis). **Dengan `shap` resmi belum**: jalankan `ml/verify_export.py` |
| 15–17 | Light/Dark, ID/EN, jawaban tidak hilang | Otomatis (UI), termasuk halaman terima kasih dan galat |
| 18 | Smartphone | Viewport 390×844 di Chromium. **Perangkat nyata belum** |
| 19 | Model belum tersedia | Halaman setelah kirim sama untuk semua status model. Diuji: status model hanya dicatat di data dan berkas model tidak dimuat ke peramban |
| 20 | Backend gagal menyimpan | Otomatis (backend tiruan; UI: pesan galat jelas dan tombol coba lagi dengan ID sama) |

## Pemeriksaan perubahan halaman terima kasih dan pembersihan data
| Pemeriksaan | Bukti |
|---|---|
| Data dummy dibersihkan | `tests/fixtures/` dihapus; data uji kini sementara dan dihapus `run_all.py`. Google Sheet Anda **belum dapat saya periksa**: gunakan `previewTestRows` lalu `deleteTestRows` |
| Data responden asli aman | Tidak ada data asli di proyek. Uji: baris "Lainnya" bukan `UJI` dan jawaban asli tetap setelah pembersihan; backup gagal membatalkan penghapusan |
| Dashboard tidak menghitung data dummy | Uji backend dan dashboard (baris `UJI` dan `SYN-` tidak dihitung) |
| Jawaban baru tetap tersimpan | Backend tiruan (bukan Sheets asli) |
| Setelah kirim hanya terima kasih dan status | Uji UI: tanpa skor, kategori, grafik, atau tabel |
| Tidak ada pengiriman ganda | Uji UI, klien, dan uji beban tiruan |
| Bahasa Indonesia dan English | Uji UI dan uji terjemahan |
| Light dan Dark Mode | Uji UI (warna kartu berbeda) dan pemeriksaan visual tangkapan layar |

## Belum teruji sama sekali (harus dilakukan di lingkungan Anda)
- Google Apps Script asli: deploy, izin, CORS, LockService, pemicu backup, dan fungsi `previewTestRows` / `deleteTestRows` pada Sheet sungguhan (`docs/DEPLOYMENT.md` bagian D–F).
- Keamanan akses dashboard (uji akses 4 langkah, bagian I). Kapasitas serentak (`tests/load_test.py` pada deployment uji).
- GitHub Pages, perangkat nyata, Safari dan Firefox; kontras warna dan pembaca layar dengan alat.
- Kecocokan TreeSHAP dengan pustaka `shap` resmi (`ml/verify_export.py`) dan Dunn dengan `scikit-posthocs`.
- Seluruh kinerja ML pada data sungguhan.
