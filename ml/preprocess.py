"""Praproses (Subbab 3.6.1): muat CSV dari Google Sheets, bersihkan, hitung ulang skor, bentuk 18 fitur dan label."""
import hashlib

import numpy as np
import pandas as pd

import instrument as I

SHEET_COLUMNS = [  # harus identik dengan HEADERS di backend/Code.gs (diuji di tests/test_ml_pipeline.py)
    'submission_id', 'timestamp', 'language_preference', 'instrument_version', 'duration_seconds', 'consent',
    'model_status_at_submission', 'S1', 'S2', 'S3', 'D1', 'D2', 'D3', 'D4', 'D4_other',
    'F1', 'F2', 'F3', 'F3_other', 'F4', 'F4_other', 'F5', 'F6', 'F7',
    'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7',
    'bsmas_score', 'bsmas_category', 'productivity_score', 'save_status', 'row_hash']
ANSWER_COLS = SHEET_COLUMNS[7:37]  # S1 ... P7


def load_csv(path):
    df = pd.read_csv(path, dtype=str, keep_default_na=False)  # semua teks; "3,5" dan "3.5" ditangani I.to_number
    missing = [c for c in SHEET_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError('Kolom CSV kurang: ' + ', '.join(missing))
    return df


def clean(df, include_post_release=False):
    """Mengembalikan (data bersih, laporan). Baris tidak dibuang diam-diam: setiap alasan dihitung."""
    rep = {'rows_raw': int(len(df)), 'synthetic': bool(df['submission_id'].str.startswith('SYN').any())}
    n0 = len(df)
    df = df.drop_duplicates('submission_id', keep='first')
    rep['duplicate_submission_id_removed'] = int(n0 - len(df))
    is_test = df['D4_other'].str.strip().str.upper().eq('UJI').to_numpy()  # baris uji yang lupa dihapus dari Sheet
    rep['test_rows_excluded'] = int(is_test.sum())
    df = df[~is_test]
    post = df['model_status_at_submission'].str.startswith('ready').to_numpy()
    rep['post_release_rows'] = int(post.sum())
    if not include_post_release:  # responden setelah model dirilis tidak masuk dataset skripsi
        df = df[~post]
    reasons, keep = {}, []
    for rec in df.to_dict('records'):
        errs = I.validate(rec)
        keep.append(not errs)
        for f, c in errs:
            reasons[f + ':' + c] = reasons.get(f + ':' + c, 0) + 1
    df = df[np.array(keep, dtype=bool)].copy()
    rep['invalid_removed'] = int(len(keep) - sum(keep))
    rep['invalid_reasons'] = reasons
    recs = df.to_dict('records')
    df['bsmas_score_recalc'] = [I.bsmas_score(r) for r in recs]
    df['productivity_recalc'] = [I.productivity_score(r) for r in recs]
    rep['score_mismatch_vs_backend'] = int(((df['bsmas_score_recalc'] != pd.to_numeric(df['bsmas_score'], errors='coerce')) |
                                            (df['productivity_recalc'] != pd.to_numeric(df['productivity_score'], errors='coerce'))).sum())
    rep['suspect_duplicates_flagged'] = int(df.duplicated(subset=ANSWER_COLS, keep=False).sum())  # hanya ditandai, tidak dibuang
    rep['rows_clean'] = int(len(df))
    return df, rep


def make_xy(df):
    """X = 18 kolom F1-F7 (urutan Tabel 3.6); y = indeks kategori BSMAS (0 rendah, 1 sedang, 2 tinggi)."""
    recs = df.to_dict('records')
    idx = pd.Index(df['submission_id'].to_numpy(), name='submission_id')
    X = pd.DataFrame([I.feature_vector(r) for r in recs], columns=I.FEATURE_COLUMNS, index=idx)
    y = pd.Series([I.CATEGORIES.index(I.bsmas_category(I.bsmas_score(r))) for r in recs], index=idx, name='label')
    assert X.shape[1] == 18 and all(c.startswith('F') for c in X.columns), 'kebocoran fitur: hanya F1-F7 yang boleh masuk'
    return X, y


def data_sha256(X, y):
    return hashlib.sha256(pd.util.hash_pandas_object(pd.concat([X, y], axis=1), index=True).to_numpy().tobytes()).hexdigest()
