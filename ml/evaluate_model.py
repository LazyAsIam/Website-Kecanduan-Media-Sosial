"""Evaluasi pada data uji (Subbab 3.6.4). Data uji dipakai SATU kali: menjalankan ulang ditolak kecuali --force.
Contoh: python ml/evaluate_model.py --run ml/reports/v1.0.0"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_recall_fscore_support

import config as C
import instrument as I


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', required=True)
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    run = Path(a.run)
    ev_path = run / 'evaluation.json'
    runs = 1
    if ev_path.exists():
        if not a.force:
            sys.exit('Evaluasi sudah pernah dijalankan untuk versi ini. Data uji hanya dipakai sekali; pakai --force hanya bila disengaja (akan dicatat).')
        runs = json.loads(ev_path.read_text(encoding='utf-8')).get('runs', 1) + 1
    S = json.loads((run / 'train_summary.json').read_text(encoding='utf-8'))
    model = joblib.load(run / 'model.joblib')
    tr = pd.read_csv(run / 'private' / 'train.csv', index_col=0)
    te = pd.read_csv(run / 'private' / 'test.csv', index_col=0)
    cols = I.FEATURE_COLUMNS
    Xte, yte = te[cols].to_numpy(float), te['label'].to_numpy(int)
    pred = model.predict(Xte)
    p, r, f, s = precision_recall_fscore_support(yte, pred, labels=[0, 1, 2], zero_division=0)
    cm = confusion_matrix(yte, pred, labels=[0, 1, 2])
    base = DummyClassifier(strategy='most_frequent').fit(tr[cols].to_numpy(float), tr['label'].to_numpy(int))
    bp = base.predict(Xte)
    macro, bmacro = float(f1_score(yte, pred, average='macro', labels=[0, 1, 2], zero_division=0)), float(f1_score(yte, bp, average='macro', labels=[0, 1, 2], zero_division=0))
    names = [I.CATEGORIES[i] for i in range(3)]
    gap = np.abs(yte - pred)
    gate = {'min_per_class_ok': bool(min(S['class_counts']['total']) >= C.MIN_PER_CLASS), 'beats_baseline': bool(macro > bmacro)}
    gate['all_ok'] = gate['min_per_class_ok'] and gate['beats_baseline']
    ev = {'version': S['version'], 'evaluated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'runs': runs, 'n_test': int(len(yte)),
          'accuracy': float(accuracy_score(yte, pred)), 'macro_f1': macro,
          'per_class': {names[i]: {'precision': float(p[i]), 'recall': float(r[i]), 'f1': float(f[i]), 'support': int(s[i])} for i in range(3)},
          'confusion_matrix': {'rows_true_cols_pred': names, 'matrix': cm.tolist()},
          'baseline': {'strategy': 'most_frequent', 'class': names[int(bp[0])], 'accuracy': float(accuracy_score(yte, bp)), 'macro_f1': bmacro},
          'errors': {'adjacent': int((gap == 1).sum()), 'distant': int((gap == 2).sum())}, 'gate': gate}
    ev_path.write_text(json.dumps(ev, indent=2, ensure_ascii=False), encoding='utf-8')
    pd.DataFrame(cm, index=['benar_' + n for n in names], columns=['prediksi_' + n for n in names]).to_csv(run / 'confusion_matrix.csv')
    verdict = ('Model melampaui baseline pada F1 makro data uji.' if gate['beats_baseline'] else
               'Model TIDAK melampaui baseline kelas mayoritas pada F1 makro. Hasil dilaporkan apa adanya; model belum layak dipakai untuk prediksi.')
    rows = ''.join(f'| {n} | {ev["per_class"][n]["precision"]:.3f} | {ev["per_class"][n]["recall"]:.3f} | {ev["per_class"][n]["f1"]:.3f} | {ev["per_class"][n]["support"]} |\n' for n in names)
    (run / 'evaluation.md').write_text(
        f'# Evaluasi model v{S["version"]}\n\nData uji: {len(yte)} responden (dipakai satu kali). {"**DATA SINTETIS: hanya uji pipeline.**" if S["synthetic"] else ""}\n\n'
        f'| Kategori | Presisi | Recall | F1 | n uji |\n|---|---|---|---|---|\n{rows}\n'
        f'F1 makro **{macro:.3f}**; akurasi {ev["accuracy"]:.3f} (jangan dibaca sendirian karena kelas tidak seimbang).\n'
        f'Baseline kelas mayoritas ({ev["baseline"]["class"]}): F1 makro {bmacro:.3f}, akurasi {ev["baseline"]["accuracy"]:.3f}.\n'
        f'Kesalahan berdekatan: {ev["errors"]["adjacent"]}; berjauhan (rendah dan tinggi tertukar): {ev["errors"]["distant"]}.\n\n'
        f'Syarat kelayakan: setiap kategori ≥ {C.MIN_PER_CLASS} responden = {gate["min_per_class_ok"]}; melampaui baseline = {gate["beats_baseline"]}.\n\n{verdict}\n', encoding='utf-8')
    print('F1 makro %.3f | baseline %.3f | akurasi %.3f | gerbang kelayakan: %s' % (macro, bmacro, ev['accuracy'], gate))
    print('Laporan:', run / 'evaluation.md')


if __name__ == '__main__':
    main()
