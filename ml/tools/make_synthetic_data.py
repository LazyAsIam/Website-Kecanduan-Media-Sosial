"""Data SINTETIS hanya untuk menguji pipeline. BUKAN data penelitian: tidak boleh dipakai untuk model, laporan, atau skripsi.
ID berawalan SYN sehingga pipeline menandai hasilnya sebagai sintetis dan menolak menulisnya ke folder model/."""
import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import instrument as I  # noqa: E402
import preprocess as P  # noqa: E402


def make(n=1200, seed=1):
    g = np.random.default_rng(seed)
    clip = lambda v, lo, hi: int(np.clip(round(v), lo, hi))
    rows = []
    for i in range(n):
        z = g.normal(0.1, 1.0)  # kecenderungan laten (hanya untuk membangkitkan data tiruan)
        lik = lambda mu: clip(mu + g.normal(0, 0.9), 1, 5)
        a = {'S1': 'ya', 'S2': 'ya', 'S3': 'belum', 'D1': int(g.integers(18, 26)), 'D2': str(g.choice(I.OPTIONS['D2'])), 'D3': int(g.integers(2021, 2027)),
             'D4': str(g.choice(I.OPTIONS['D4'][:-1])), 'D4_other': '',
             'F1': float(np.clip(round(3.5 + 1.6 * z + g.normal(0, 1.2), 1), 0.5, 14)), 'F2': clip(3 + 0.9 * z + g.normal(0, 0.8), 1, 5),
             'F3': str(g.choice(I.OPTIONS['F3'][:-1])), 'F3_other': '', 'F4': str(g.choice(I.OPTIONS['F4'][:-1])), 'F4_other': '',
             'F5': lik(3 + 0.8 * z), 'F6': clip(2 + 0.5 * z + g.normal(0, 0.7), 1, 3),
             'F7': float(np.clip(round(6.8 - 0.6 * z + g.normal(0, 1.0), 1), 3, 10))}
        for k in range(1, 7):
            a[f'B{k}'] = lik(3 + 0.9 * z)
        a['P1'] = lik(3 - 0.4 * z)
        for k in range(2, 8):
            a[f'P{k}'] = lik(3 - 0.5 * z if k <= 4 else 3 + 0.5 * z)
        s = I.bsmas_score(a)
        meta = {'submission_id': f'SYN-{i:05d}', 'timestamp': f'2026-10-{1 + i % 28:02d}T08:00:00.000Z', 'language_preference': 'id',
                'instrument_version': I.VERSION, 'duration_seconds': int(g.integers(120, 600)), 'consent': 'TRUE', 'model_status_at_submission': 'not_trained'}
        res = {'bsmas_score': int(s), 'bsmas_category': I.bsmas_category(s), 'productivity_score': I.productivity_score(a), 'save_status': 'saved', 'row_hash': 'sintetis'}
        rows.append({**meta, **a, **res})
    return pd.DataFrame(rows)[P.SHEET_COLUMNS]


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--n', type=int, default=1200)
    a = ap.parse_args()
    make(a.n).to_csv(a.out, index=False)
    print('Data SINTETIS ditulis ke', a.out, '(jangan dipakai untuk penelitian)')
