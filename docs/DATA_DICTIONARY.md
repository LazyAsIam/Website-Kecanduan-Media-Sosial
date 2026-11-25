# Kamus data

Sheet `Responses` memiliki 42 kolom dengan urutan tetap, sama dengan `HEADERS` di `backend/Code.gs` dan `SHEET_COLUMNS` di `ml/preprocess.py` (dicek oleh `tests/test_ml_pipeline.py`). Jawaban mentah tidak pernah diubah setelah tersimpan.

## Kolom
| Kolom | Nilai | Keterangan |
|---|---|---|
| `submission_id` | UUID v4 | ID unik per pengiriman; kunci idempotensi |
| `timestamp` | ISO 8601, UTC | Dibuat oleh server |
| `language_preference` | `id`, `en` | Bahasa yang dipakai saat mengirim |
| `instrument_version` | `1.0.0` | Versi instrumen (`instrument.js`) |
| `duration_seconds` | detik, bilangan bulat | Dari klien sejak persetujuan; kosong bila tidak masuk akal |
| `consent` | `TRUE` | Persetujuan responden |
| `model_status_at_submission` | `not_trained`, `in_development`, `ready:versi`, `needs_reevaluation`, `unknown` | Status model saat responden mengisi; `ready…` berarti responden pasca-rilis (dikecualikan dari dataset skripsi secara bawaan) |
| `S1`, `S2`, `S3` | `ya`; `ya`; `belum` | Hanya responden yang lolos penyaring yang tersimpan |
| `D1` | bilangan bulat 16–60 | Usia |
| `D2` | `laki_laki`, `perempuan`, `tidak_menjawab` | Jenis kelamin |
| `D3` | tahun 2015–2026 | Angkatan |
| `D4`, `D4_other` | `s1_kewirausahaan`, `s1_bisnis_digital`, `s1_informatika`, `d3_kebidanan`, `s1_agribisnis`, `s1_manajemen_hutan`, `lainnya` | `D4_other` terisi hanya jika `lainnya` (maks. 100 karakter) |
| `F1` | jam per hari, 0–24, desimal | Durasi penggunaan media sosial |
| `F2` | 1 (<5 kali), 2 (5–10), 3 (11–20), 4 (21–40), 5 (>40) | Frekuensi membuka per hari |
| `F3`, `F3_other` | `instagram`, `tiktok`, `whatsapp`, `youtube`, `facebook`, `x`, `lainnya` | Platform paling sering |
| `F4`, `F4_other` | `hiburan`, `komunikasi`, `informasi`, `belajar_tugas`, `konten_berjualan`, `lainnya` | Tujuan utama |
| `F5` | 1 tidak pernah, 2 jarang, 3 kadang-kadang, 4 sering, 5 selalu | Penggunaan menjelang tidur |
| `F6` | 1 semua dimatikan, 2 sebagian aktif, 3 semua aktif | Pengaturan notifikasi |
| `F7` | jam, 0–24, desimal | Rata-rata jam tidur; aturan: `F1 + F7 ≤ 24` |
| `B1`–`B6` | 1 sangat jarang … 5 sangat sering | BSMAS, nilai mentah |
| `P1` | 1 (<1 jam), 2 (1–<2), 3 (2–<3), 4 (3–<4), 5 (≥4 jam) | Jam belajar mandiri per hari |
| `P2`–`P7` | 1 sangat jarang … 5 sangat sering | Nilai mentah; **P5–P7 belum dibalik** |
| `bsmas_score` | 6–30 | B1+B2+B3+B4+B5+B6 (dihitung server) |
| `bsmas_category` | `rendah` 6–18, `sedang` 19–23, `tinggi` 24–30 | Kategori operasional, bukan diagnosis |
| `productivity_score` | 7–35 | P1+P2+P3+P4+(6−P5)+(6−P6)+(6−P7); tanpa kategori |
| `save_status` | `saved` | Baris hanya ada bila penyimpanan berhasil |
| `row_hash` | SHA-256 heksadesimal | Hash dari nilai kolom 1–41 (masing-masing diubah menjadi teks) digabung dengan `\|`; untuk mendeteksi penyuntingan manual |

## Peran variabel dalam model
- **Fitur (18 kolom, urutan tetap):** `F1_durasi_jam`, `F2_frekuensi_buka`, `F3_instagram`, `F3_tiktok`, `F3_whatsapp`, `F3_youtube`, `F3_facebook`, `F3_x`, `F3_lainnya`, `F4_hiburan`, `F4_komunikasi`, `F4_informasi`, `F4_belajar_tugas`, `F4_konten_berjualan`, `F4_lainnya`, `F5_menjelang_tidur`, `F6_notifikasi`, `F7_jam_tidur`.
- **Label:** 0 rendah, 1 sedang, 2 tinggi, dari `bsmas_score`.
- **Bukan fitur:** S, D, B, P, dan skor produktivitas (dianalisis terpisah).
- Pada SHAP, kolom `F3_*` dan `F4_*` dijumlahkan kembali ke fitur asal F3 dan F4.
