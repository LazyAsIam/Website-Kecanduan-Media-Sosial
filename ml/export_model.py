"""Ekspor model ke format JSON untuk website (tanpa server ML) + metadata + catatan versi + vektor uji sintetis.
Status "ready" hanya dengan --approve dan bila gerbang kelayakan terpenuhi. Model dari data sintetis TIDAK akan ditulis ke folder model/.
Contoh: python ml/export_model.py --run ml/reports/v1.0.0 [--approve]"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np

import config as C
import instrument as I


def golden_vectors(model, n=300, seed=7):
    """Profil F1-F7 sintetis (bukan responden) beserta probabilitas dari scikit-learn, untuk uji paritas Python-JS."""
    g = np.random.default_rng(seed)
    rows = []
    for i in range(n):
        f1 = round(float(g.uniform(0, 24 if i % 2 else 10)), 1)
        rows.append({'F1': f1, 'F2': int(g.integers(1, 6)), 'F3': I.OPTIONS['F3'][int(g.integers(7))], 'F4': I.OPTIONS['F4'][int(g.integers(6))],
                     'F5': int(g.integers(1, 6)), 'F6': int(g.integers(1, 4)), 'F7': round(float(g.uniform(0, min(24 - f1, 12))), 1)})
    X = np.array([I.feature_vector(r) for r in rows])
    pr = model.predict_proba(X)
    return [{'input': r, 'vector': X[i].tolist(), 'proba': pr[i].tolist(), 'class': int(pr[i].argmax())} for i, r in enumerate(rows)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', required=True)
    ap.add_argument('--approve', action='store_true')
    ap.add_argument('--model-dir', default=str(C.ROOT / 'model'))
    ap.add_argument('--changelog', default=str(C.ROOT / 'docs' / 'MODEL_CHANGELOG.md'))
    ap.add_argument('--golden', default=str(C.ROOT / 'tests' / 'golden-vectors.json'))
    a = ap.parse_args()
    run, mdir = Path(a.run), Path(a.model_dir)
    S = json.loads((run / 'train_summary.json').read_text(encoding='utf-8'))
    if not (run / 'evaluation.json').exists():
        sys.exit('Jalankan evaluate_model.py terlebih dahulu.')
    ev = json.loads((run / 'evaluation.json').read_text(encoding='utf-8'))
    if S['synthetic'] and mdir.resolve() == (C.ROOT / 'model').resolve():
        sys.exit('DITOLAK: model dilatih dari data SINTETIS dan tidak boleh ditulis ke folder model/ yang dipakai website.')
    status = 'in_development'
    if a.approve:
        if not ev['gate']['all_ok']:
            sys.exit('DITOLAK: gerbang kelayakan belum terpenuhi: ' + json.dumps(ev['gate']))
        status = 'ready'

    model = joblib.load(run / 'model.joblib')
    t = model.tree_
    value = t.value[:, 0, :]
    value = value / value.sum(axis=1, keepdims=True)  # proporsi kelas per simpul (= predict_proba pada daun)
    payload = {'format': 1, 'classes': I.CATEGORIES, 'feature_columns': I.FEATURE_COLUMNS, 'feature_groups': I.FEATURE_GROUP,
               'tree': {'children_left': t.children_left.tolist(), 'children_right': t.children_right.tolist(), 'feature': t.feature.tolist(),
                        'threshold': t.threshold.tolist(), 'value': value.tolist(), 'cover': t.weighted_n_node_samples.tolist()}}
    meta = {'status': status, 'version': S['version'], 'trained_at': S['trained_at'], 'exported_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'instrument_version': S['instrument_version'], 'classes': I.CATEGORIES, 'n_total': S['n_total'], 'n_train': S['n_train'], 'n_test': S['n_test'],
            'class_counts': S['class_counts'], 'best_params': S['best_params'], 'cv_macro_f1': S['cv_macro_f1_mean'],
            'test': {'accuracy': ev['accuracy'], 'macro_f1': ev['macro_f1'], 'per_class': ev['per_class'], 'baseline_macro_f1': ev['baseline']['macro_f1'],
                     'baseline_accuracy': ev['baseline']['accuracy']},
            'gate': ev['gate'], 'seed': S['seed'], 'libraries': S['libraries'], 'data_sha256': S['data_sha256'], 'synthetic': S['synthetic'],
            'notes': 'Probabilitas berasal dari proporsi kategori pada daun pohon, bukan probabilitas terkalibrasi.'}
    mdir.mkdir(parents=True, exist_ok=True)
    (mdir / 'model.json').write_text(json.dumps(payload, separators=(',', ':')), encoding='utf-8')
    (mdir / 'model-metadata.json').write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding='utf-8')
    gp = Path(a.golden)
    gp.parent.mkdir(parents=True, exist_ok=True)
    gp.write_text(json.dumps({'synthetic_profiles_not_respondents': True, 'model_version': S['version'], 'cases': golden_vectors(model)}), encoding='utf-8')
    cl = Path(a.changelog)
    cl.parent.mkdir(parents=True, exist_ok=True)
    if not cl.exists():
        cl.write_text('# Catatan versi model\n\n| Versi | Dilatih | n data | F1 makro uji | F1 makro baseline | Status |\n|---|---|---|---|---|---|\n', encoding='utf-8')
    with cl.open('a', encoding='utf-8') as fh:
        fh.write(f'| {S["version"]} | {S["trained_at"][:10]} | {S["n_total"]} | {ev["macro_f1"]:.3f} | {ev["baseline"]["macro_f1"]:.3f} | {status}{" (SINTETIS)" if S["synthetic"] else ""} |\n')
    print(f'Diekspor ke {mdir} | status: {status} | simpul pohon: {len(t.feature)}')


if __name__ == '__main__':
    main()
