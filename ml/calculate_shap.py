"""SHAP global (Subbab 3.6.5) pada data uji: rata-rata |SHAP| per kategori dan rata-rata antarkelas, kolom one-hot dijumlahkan ke fitur asal,
beserta arah kontribusi (ordinal/numerik: korelasi Spearman nilai-SHAP; nominal: rata-rata SHAP per kategori). Hasil: model/global-shap.json.
Mesin: pustaka shap resmi bila terpasang, jika tidak implementasi internal (treeshap.py; algoritma sama, diuji terhadap Shapley eksak).
Contoh: python ml/calculate_shap.py --run ml/reports/v1.0.0"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from scipy.stats import spearmanr

import config as C
import instrument as I
import treeshap as TS

FEATS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7']
ORDINAL = {'F1', 'F2', 'F5', 'F6', 'F7'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', required=True)
    ap.add_argument('--engine', choices=['auto', 'shap', 'internal'], default='auto')
    ap.add_argument('--model-dir', default=str(C.ROOT / 'model'))
    a = ap.parse_args()
    run, mdir = Path(a.run), Path(a.model_dir)
    S = json.loads((run / 'train_summary.json').read_text(encoding='utf-8'))
    if S['synthetic'] and mdir.resolve() == (C.ROOT / 'model').resolve():
        sys.exit('DITOLAK: model dilatih dari data SINTETIS dan tidak boleh menulis ke folder model/ yang dipakai website.')
    model = joblib.load(run / 'model.joblib')
    cols = I.FEATURE_COLUMNS
    X = pd.read_csv(run / 'private' / 'test.csv', index_col=0)[cols].to_numpy(float)

    engine = a.engine
    if engine == 'auto':
        try:
            import shap  # noqa: F401
            engine = 'shap'
        except ImportError:
            engine = 'internal'
    if engine == 'shap':
        phi = TS.shap_official(model, X)
    else:
        tree = TS.tree_arrays(model)
        phi = np.stack([TS.explain(tree, x, X.shape[1])[0] for x in X])

    idx = {f: [j for j, c in enumerate(cols) if I.FEATURE_GROUP[c] == f] for f in FEATS}
    g = np.stack([phi[:, idx[f], :].sum(axis=1) for f in FEATS], axis=1)  # (n, 7, 3): one-hot dijumlahkan ke fitur asal
    cls = I.CATEGORIES
    mean_abs = np.abs(g).mean(axis=0)
    out = {'format': 1, 'version': S['version'], 'engine': engine, 'n_samples': int(len(X)), 'synthetic': S['synthetic'],
           'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'classes': cls, 'features': FEATS,
           'mean_abs': {c: {f: float(mean_abs[i, k]) for i, f in enumerate(FEATS)} for k, c in enumerate(cls)}, 'direction': {},
           'note': 'Satuan probabilitas. Kontribusi terhadap prediksi model, bukan hubungan sebab-akibat.'}
    out['mean_abs']['mean'] = {f: float(mean_abs[i].mean()) for i, f in enumerate(FEATS)}
    for i, f in enumerate(FEATS):
        if f in ORDINAL:
            x, rho = X[:, idx[f][0]], {}
            for k, c in enumerate(cls):
                y = g[:, i, k]
                r = spearmanr(x, y)[0] if np.unique(x).size > 1 and np.unique(y).size > 1 else float('nan')
                rho[c] = None if np.isnan(r) else float(r)
            out['direction'][f] = {'kind': 'ordinal', 'spearman': rho}
        else:
            names = [cols[j].split('_', 1)[1] for j in idx[f]]
            which = np.argmax(X[:, idx[f]], axis=1)
            cat = {nm: {'n': int((which == m).sum()), **{c: float(g[which == m, i, k].mean()) for k, c in enumerate(cls)}}
                   for m, nm in enumerate(names) if (which == m).any()}
            out['direction'][f] = {'kind': 'nominal', 'mean_by_category': cat}
    mdir.mkdir(parents=True, exist_ok=True)
    (mdir / 'global-shap.json').write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding='utf-8')
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        order = sorted(FEATS, key=lambda f: out['mean_abs']['mean'][f])
        plt.figure(figsize=(7, 3.8))
        plt.barh(order, [out['mean_abs']['mean'][f] for f in order])
        plt.xlabel('Rata-rata |SHAP| (probabilitas, rata-rata tiga kategori)')
        plt.tight_layout()
        plt.savefig(run / 'shap_global.png', dpi=150)
        plt.close()
    except ImportError:
        pass
    top = sorted(FEATS, key=lambda f: -out['mean_abs']['mean'][f])[:3]
    print('SHAP global pada %d data uji | mesin: %s | tiga fitur terbesar: %s | ditulis ke %s' % (len(X), engine, ', '.join(top), mdir / 'global-shap.json'))


if __name__ == '__main__':
    main()
