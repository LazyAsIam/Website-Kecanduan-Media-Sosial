"""Memeriksa ekspor model: (1) model.json = pohon pada model.joblib dan menghasilkan probabilitas yang sama dengan scikit-learn;
(2) nilai dasar + jumlah SHAP = probabilitas; (3) TreeSHAP internal (yang sama dengan di browser) sama dengan pustaka shap resmi, bila terpasang.
Contoh: python ml/verify_export.py --run ml/reports/v1.0.0   (jalankan setelah export_model.py)"""
import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np

import config as C
import treeshap as TS


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', required=True)
    ap.add_argument('--model-dir', default=str(C.ROOT / 'model'))
    ap.add_argument('--golden', default=str(C.ROOT / 'tests' / 'golden-vectors.json'))
    ap.add_argument('--tol', type=float, default=1e-9)
    a = ap.parse_args()
    model = joblib.load(Path(a.run) / 'model.joblib')
    tree = json.loads((Path(a.model_dir) / 'model.json').read_text(encoding='utf-8'))['tree']
    gold = json.loads(Path(a.golden).read_text(encoding='utf-8'))['cases']
    state = {'ok': True}

    def report(name, passed, detail=''):
        state['ok'] &= passed
        print(('LULUS  ' if passed else 'GAGAL  ') + name + (': ' + detail if detail else ''))

    report('model.json sama dengan pohon pada model.joblib', tree == TS.tree_arrays(model))
    d1 = max(float(np.abs(TS.leaf_value(tree, g['vector']) - np.array(g['proba'])).max()) for g in gold)
    report('probabilitas model.json vs scikit-learn (%d profil)' % len(gold), d1 < 1e-12, 'selisih maks %.2e' % d1)
    ex = [TS.explain(tree, g['vector'], len(g['vector'])) for g in gold]
    d2 = max(float(np.abs(b + p.sum(axis=0) - np.array(g['proba'])).max()) for (p, b), g in zip(ex, gold))
    report('nilai dasar + jumlah SHAP = probabilitas (TreeSHAP internal)', d2 < a.tol, 'selisih maks %.2e' % d2)
    try:
        import shap  # noqa: F401
    except ImportError:
        print('DILEWATI  TreeSHAP internal vs pustaka shap resmi: shap tidak terpasang. Pemeriksaan ini BELUM dilakukan; pasang shap lalu jalankan ulang.')
    else:
        X = np.array([g['vector'] for g in gold[:100]])
        off = TS.shap_official(model, X)
        mine = np.stack([p for p, _ in ex[:100]])
        d3 = float(np.abs(off - mine).max())
        report('TreeSHAP internal vs shap resmi (%d profil)' % len(X), d3 < a.tol, 'selisih maks %.2e' % d3)
        expv = np.ravel(shap.TreeExplainer(model).expected_value)
        report('nilai dasar sama dengan shap.TreeExplainer.expected_value', bool(np.allclose(expv, ex[0][1], atol=a.tol)))
    print('HASIL: ' + ('semua pemeriksaan yang dijalankan lulus' if state['ok'] else 'ADA YANG GAGAL; jangan terbitkan model ini'))
    sys.exit(0 if state['ok'] else 1)


if __name__ == '__main__':
    main()
