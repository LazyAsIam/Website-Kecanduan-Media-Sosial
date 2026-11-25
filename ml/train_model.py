"""Pelatihan Decision Tree (Subbab 3.6.3). Tidak menyentuh data uji; evaluasi ada di evaluate_model.py.
Contoh: python ml/train_model.py --data ml/data/responses.csv --version 1.0.0"""
import argparse
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.tree import DecisionTreeClassifier

import config as C
import instrument as I
import preprocess as P


def pick_best(cv):
    """Skor CV tertinggi (dibulatkan 12 desimal); bila sama: pohon lebih dangkal, daun lebih besar, split lebih besar, tanpa class_weight."""
    r = pd.DataFrame(cv)
    r['cw'] = r['param_class_weight'].map(lambda v: 0 if v is None or (isinstance(v, float) and np.isnan(v)) else 1)
    r['s'] = r['mean_test_score'].round(12)
    return r.sort_values(['s', 'param_max_depth', 'param_min_samples_leaf', 'param_min_samples_split', 'cw'],
                         ascending=[False, True, False, False, True]).iloc[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True)
    ap.add_argument('--version', default='1.0.0')
    ap.add_argument('--out')
    ap.add_argument('--include-post-release', action='store_true')
    a = ap.parse_args()
    out = Path(a.out) if a.out else C.ROOT / 'ml' / 'reports' / ('v' + a.version)
    (out / 'private').mkdir(parents=True, exist_ok=True)

    df, rep = P.clean(P.load_csv(a.data), a.include_post_release)
    X, y = P.make_xy(df)
    counts = y.value_counts().reindex([0, 1, 2], fill_value=0)
    if counts.min() < 2 * C.CV_FOLDS:
        sys.exit('Data terlalu sedikit untuk melatih: jumlah per kategori = ' + str(counts.to_dict()))
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=C.TEST_SIZE, stratify=y, random_state=C.SEED)

    gs = GridSearchCV(DecisionTreeClassifier(criterion='gini', random_state=C.SEED), C.PARAM_GRID, scoring='f1_macro',
                      cv=StratifiedKFold(C.CV_FOLDS, shuffle=True, random_state=C.SEED), refit=False)
    gs.fit(Xtr.to_numpy(float), ytr.to_numpy())
    best = pick_best(gs.cv_results_)
    cw = best['param_class_weight']
    params = {'max_depth': int(best['param_max_depth']), 'min_samples_split': int(best['param_min_samples_split']),
              'min_samples_leaf': int(best['param_min_samples_leaf']),
              'class_weight': None if (cw is None or (isinstance(cw, float) and np.isnan(cw))) else str(cw)}
    model = DecisionTreeClassifier(criterion='gini', random_state=C.SEED, **params).fit(Xtr.to_numpy(float), ytr.to_numpy())
    assert list(model.classes_) == [0, 1, 2]

    joblib.dump(model, out / 'model.joblib')
    Xtr.assign(label=ytr).to_csv(out / 'private' / 'train.csv')
    Xte.assign(label=yte).to_csv(out / 'private' / 'test.csv')
    pd.DataFrame(gs.cv_results_).drop(columns=['params']).to_csv(out / 'cv_results.csv', index=False)
    summary = {
        'version': a.version, 'trained_at': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'seed': C.SEED,
        'best_params': params, 'cv_macro_f1_mean': float(best['mean_test_score']), 'cv_macro_f1_std': float(best['std_test_score']),
        'n_total': int(len(y)), 'n_train': int(len(ytr)), 'n_test': int(len(yte)),
        'class_counts': {'total': counts.tolist(), 'train': ytr.value_counts().reindex([0, 1, 2], fill_value=0).tolist(),
                         'test': yte.value_counts().reindex([0, 1, 2], fill_value=0).tolist()},
        'cleaning': rep, 'synthetic': rep['synthetic'], 'data_sha256': P.data_sha256(X, y), 'instrument_version': I.VERSION,
        'libraries': {'python': platform.python_version(), 'scikit-learn': sklearn.__version__, 'numpy': np.__version__, 'pandas': pd.__version__}}
    (out / 'train_summary.json').write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding='utf-8')
    print('Pelatihan selesai ->', out)
    print('Data bersih:', summary['n_total'], '| latih', summary['n_train'], '| uji', summary['n_test'], '(belum dievaluasi)')
    print('Parameter terbaik:', params, '| F1 makro CV: %.3f ± %.3f' % (summary['cv_macro_f1_mean'], summary['cv_macro_f1_std']))
    if rep['synthetic']:
        print('PERINGATAN: data SINTETIS. Hasil ini hanya untuk menguji pipeline, bukan hasil penelitian.')


if __name__ == '__main__':
    main()
