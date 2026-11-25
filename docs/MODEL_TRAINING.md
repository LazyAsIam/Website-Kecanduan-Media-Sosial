# Panduan melatih model (di komputer Anda)

Dikerjakan **setelah** data terkumpul. Semua perintah dijalankan dari folder proyek.

## 1. Menyiapkan Python (sekali saja)
1. Pasang Python 3.10 atau lebih baru dari python.org (Windows: centang "Add Python to PATH").
2. Buka Terminal (Mac/Linux) atau Command Prompt (Windows) di folder proyek, lalu:
```
python -m venv .venv                    # membuat lingkungan terpisah agar pustaka tidak bercampur
.venv\Scripts\activate                  # Windows (Mac/Linux: source .venv/bin/activate)
pip install -r ml/requirements.txt      # memasang pustaka yang dibutuhkan
```
Jika `shap` gagal terpasang, pelatihan dan evaluasi tetap berjalan; `shap` baru dipakai pada langkah SHAP.

## 2. Menyiapkan data
Google Sheet `Responses` → File → Download → CSV. Simpan sebagai `ml/data/responses.csv` (buat foldernya). **Folder ini tidak boleh diunggah ke GitHub.** Desimal berkoma ("3,5") dan baris uji (`D4_other` = UJI) ditangani otomatis.

## 3. Melatih
```
python ml/train_model.py --data ml/data/responses.csv --version 1.0.0
```
Membersihkan data, membagi 80/20 berstrata (seed 42), Grid Search 72 kombinasi dengan validasi silang 5 lipatan (F1 makro), lalu melatih ulang pada seluruh data latih. **Belum menyentuh data uji.** Hasil di `ml/reports/v1.0.0/`:
- `train_summary.json`: jumlah data, jumlah dibuang per alasan (bahan Subbab 4.1.1), distribusi kelas, parameter terbaik, F1 makro validasi silang.
- `cv_results.csv`: seluruh kombinasi parameter.

Periksa distribusi kelas: gerbang kelayakan butuh **minimal 150 responden per kategori**.

## 4. Mengevaluasi (satu kali)
```
python ml/evaluate_model.py --run ml/reports/v1.0.0
```
Menguji pada data uji dan menulis `evaluation.md`, `evaluation.json`, `confusion_matrix.csv`. Cara membaca:
- Bandingkan **F1 makro** dengan baseline kelas mayoritas. Akurasi saja menyesatkan karena kelas tidak seimbang.
- Lihat recall tiap kategori dan kesalahan berjauhan (rendah tertukar tinggi).
- Jika model tidak melampaui baseline, laporkan apa adanya (Subbab 1.5) dan jangan menandainya siap. Jangan menyetel parameter ulang berdasarkan data uji.

Menjalankan ulang ditolak kecuali dengan `--force` (dicatat sebagai penjalanan ke-2, dst.).

## 5. Mengekspor
```
python ml/export_model.py --run ml/reports/v1.0.0
```
Menulis `model/model.json`, `model/model-metadata.json` (status `in_development`), `tests/golden-vectors.json`, dan menambah baris di `docs/MODEL_CHANGELOG.md`. Untuk status **siap digunakan**, tambahkan `--approve`. Ini hanya diterima jika gerbang kelayakan terpenuhi (≥ 150 per kategori dan F1 makro melampaui baseline), dan keputusannya tetap ada pada Anda setelah membaca `evaluation.md`. Model dari data sintetis ditolak.

## 5b. SHAP global dan pemeriksaan ekspor
```
python ml/calculate_shap.py --run ml/reports/v1.0.0   # SHAP global pada data uji → model/global-shap.json dan gambar shap_global.png
python ml/verify_export.py --run ml/reports/v1.0.0    # membuktikan model.json sama dengan scikit-learn dan TreeSHAP sama dengan pustaka shap resmi
```
`calculate_shap.py` memakai pustaka `shap` bila terpasang; jika tidak, memakai implementasi internal dengan algoritma yang sama dengan di browser (teruji terhadap perhitungan Shapley eksak). Nilainya dijumlahkan kembali ke fitur asal, dan arah kontribusinya dihitung per fitur. Ini menjelaskan cara model bekerja, bukan sebab-akibat. `verify_export.py` hanya membandingkan dengan `shap` resmi jika pustakanya terpasang; baris "DILEWATI" berarti pemeriksaan itu **belum** dilakukan. Jika ada baris "GAGAL", jangan terbitkan model dan laporkan hasilnya.

## 6. Memperbarui website
Unggah `model/model.json`, `model/model-metadata.json`, dan `model/global-shap.json` ke GitHub (timpa berkas lama), tunggu build Pages, lalu buka `check.html` untuk melihat status model. Situs **tidak menampilkan** prediksi, skor, atau SHAP kepada responden (halaman setelah mengirim hanya ucapan terima kasih), dan tidak memuat berkas model ke peramban responden. Berkas model disimpan untuk tahap sistem prediksi berikutnya; status model hanya dicatat pada kolom `model_status_at_submission`.

## 7. Pelatihan ulang
Gunakan nomor versi baru (`--version 1.1.0`). Angka di skripsi hanya merujuk pada v1.0.0. Responden yang mengisi **setelah** model dirilis (`model_status_at_submission` berawalan `ready`) dikecualikan secara bawaan; `--include-post-release` hanya bila disengaja. Model tidak pernah berubah sendiri.

## 7b. Analisis statistik (Subbab 3.6.6)
```
python ml/statistics_analysis.py --data ml/data/responses.csv   # Spearman, Kruskal–Wallis, Dunn–Holm, sensitivitas, keandalan
```
Memakai **seluruh** responden bersih (bukan hanya data uji). Hasil: `ml/reports/statistics/statistics.md` (kerangka Tabel 4.4–4.6) dan `statistics.json`. Selang kepercayaan Spearman memakai bootstrap persentil 10.000 resampel dengan seed 42 (ubah dengan `--bootstrap` dan `--seed`). Skripsi tidak menyebut jumlah resampel, jadi ini default saya dan perlu Anda setujui. Uji lanjut Dunn hanya dilakukan bila Kruskal–Wallis signifikan. Skrip hanya menyatakan H0 ditolak atau tidak ditolak; penafsiran arah dan kekuatan asosiasi (dari |ρ| dan selang kepercayaannya) Anda tulis sendiri, dan hasilnya asosiasi, bukan sebab-akibat.

## Jangan pernah diunggah
`ml/data/`, `ml/reports/*/private/`, `ml/reports/*/model.joblib`.

## Pesan galat umum
- "Kolom CSV kurang": header sheet diubah. Jangan mengganti nama kolom.
- "Data terlalu sedikit untuk melatih": satu kategori terlalu sedikit untuk validasi silang; kumpulkan lebih banyak data.
- "Evaluasi sudah pernah dijalankan": perilaku yang disengaja (lihat langkah 4).
