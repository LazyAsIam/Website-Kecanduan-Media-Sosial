# Sistem Klasifikasi Kecenderungan Kecanduan Media Sosial (skripsi)

Kuesioner web, estimasi Decision Tree, dan penjelasan SHAP, seluruhnya memakai layanan gratis:
GitHub Pages (tampilan) → Google Apps Script (penerima data) → Google Sheets pribadi (data) → Python di komputer peneliti (pelatihan model).
Instrumen mengikuti Tabel 3.8 skripsi (`Skripsi_Revisi_v5.docx`); tidak ada butir, pilihan, atau skala yang diubah.

## Status
| Bagian | Keadaan |
|---|---|
| Formulir 27 butir, Light/Dark Mode, ID/EN, dan halaman terima kasih setelah mengirim (hanya ucapan terima kasih dan status penyimpanan; tanpa skor atau hasil klasifikasi) | selesai; teruji di Chromium dengan backend tiruan |
| Backend Apps Script (validasi, idempoten, LockService, backup) | selesai; teruji dengan tiruan layanan Google; **belum di-deploy** |
| Pipeline ML (praproses, latih, evaluasi, ekspor) | selesai; teruji dengan data sintetis |
| Mesin prediksi + TreeSHAP JavaScript (`model/*.js`) | selesai; **tidak dimuat situs saat ini**; cocok dengan scikit-learn dan Shapley eksak pada model uji sintetis |
| **Model sungguhan** | **belum ada** (menunggu data). Website berstatus "belum dilatih" dan tidak menampilkan prediksi |
| Uji beban bertahap (`tests/load_test.py`) | selesai; teruji terhadap server tiruan, **belum terhadap Apps Script asli** |
| Panduan pelatihan model (`docs/MODEL_TRAINING.md`) | selesai |
| Dashboard peneliti (`backend/Admin.gs`, `Admin.html`): hanya agregat, hanya pemilik | selesai; teruji dengan tiruan layanan Google; **keamanan akses belum teruji di Google asli** |
| Kamus data (`docs/DATA_DICTIONARY.md`) | selesai |
| SHAP global (`ml/calculate_shap.py`) dan `ml/verify_export.py` | selesai; teruji dengan mesin internal dan data sintetis; **belum dibandingkan dengan `shap` resmi** |
| Panel prediksi dan SHAP global (`prediction-ui.js`): **tidak dimuat situs** selama pengumpulan data; disimpan untuk tahap berikutnya | teruji terisolasi dengan data sintetis sementara |
| Skrip statistik Subbab 3.6.6 (`ml/statistics_analysis.py`) | selesai; teruji dengan data sintetis dan terhadap scipy; **uji lanjut Dunn belum dibandingkan dengan `scikit-posthocs`** |
| Panduan pengujian (`docs/TESTING.md`) dan penjalan seluruh uji (`tests/run_all.py`) | selesai |

## Mulai dari sini
1. `docs/DEPLOYMENT.md`: memasang backend dan GitHub Pages, menguji sambungan, backup.
2. `docs/LIMITATIONS.md`: batas kuota gratis dan hal yang tidak dapat dijamin. Baca sebelum mengumumkan kuesioner.
3. `docs/PRIVACY.md`: data yang dikumpulkan dan tidak dikumpulkan.

## Struktur
`index.html`, `script.js`, `style.css`, `translations.js` (formulir) · `instrument.js` (sumber tunggal butir dan skor) · `submit.js` (pengiriman tahan gangguan) ·
`prediction-ui.js` + `model/` (prediksi dan TreeSHAP) · `check.html` (uji sambungan) · `backend/` (Apps Script) · `ml/` (Python) · `tests/` · `docs/`

## Menjalankan pengujian (dari folder proyek)
```
python3 tests/run_all.py            # menjalankan SEMUA uji dan menampilkan ringkasan
node tests/test_instrument.js        # skor dan validasi instrumen (JS)
python3 tests/test_instrument.py     # hal yang sama di Python; kasus uji dibagi dengan JS
node tests/test_translations.js      # kelengkapan terjemahan ID/EN
node tests/test_backend.js           # Code.gs dengan tiruan layanan Google + klien pengiriman
python3 tests/test_ml_pipeline.py    # pipeline ML dengan data SINTETIS
node tests/test_model_runtime.js     # prediksi dan TreeSHAP JS vs scikit-learn dan Shapley eksak (model sintetis)
python3 tests/test_load_test.py      # skrip uji beban terhadap server tiruan
```
Uji UI (`tests/ui_smoke.js`, `tests/check_page.js`) membutuhkan Playwright dan Chromium. Hasil dan cakupannya ada di `docs/TESTING.md`.

## Aturan penting
- Data responden tidak boleh masuk repositori. `.gitignore` menutup `ml/data/` dan `ml/reports/*/private/`.
- Model dari data sintetis ditolak masuk `model/`. Status "siap digunakan" hanya dengan `--approve` dan gerbang kelayakan terpenuhi.
- Setelah mengirim, responden hanya melihat ucapan terima kasih dan status penyimpanan (tanpa skor atau hasil klasifikasi). Model tidak belajar otomatis dari responden; pelatihan ulang dilakukan peneliti secara berkala dan terkontrol.
- Data uji sintetis hanya dibuat sementara oleh `tests/run_all.py` di `tests/.generated/` dan dihapus setelah uji; tidak ada data dummy yang disimpan di proyek.
