"""Uji pipeline ML dengan data SINTETIS (hanya menguji kode). Jalankan dari akar proyek: python3 tests/test_ml_pipeline.py"""
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'ml'))
import instrument as I  # noqa: E402
import preprocess as P  # noqa: E402
sys.path.insert(0, str(ROOT / 'ml' / 'tools'))
import make_synthetic_data as M  # noqa: E402

n = 0


def ok(c, m=''):
    global n
    assert c, m
    n += 1


def run(script, *args, expect_fail=False):
    r = subprocess.run([sys.executable, str(ROOT / 'ml' / script), *map(str, args)], capture_output=True, text=True)
    if expect_fail:
        ok(r.returncode != 0, script + ' seharusnya ditolak: ' + r.stdout)
    else:
        ok(r.returncode == 0, script + ' gagal: ' + r.stderr + r.stdout)
    return r


def walk(tree, x):  # pencocok independen: float32 -> double lalu bandingkan dengan ambang (seperti scikit-learn)
    node = 0
    while tree['children_left'][node] != -1:
        go_left = float(np.float32(x[tree['feature'][node]])) <= tree['threshold'][node]
        node = tree['children_left'][node] if go_left else tree['children_right'][node]
    return tree['value'][node]


# 1. skema CSV = header backend
code = (ROOT / 'backend' / 'Code.gs').read_text(encoding='utf-8')
hdr = re.findall(r"'([^']+)'", re.search(r'const HEADERS = \[(.*?)\];', code, re.S).group(1))
ok(hdr == P.SHEET_COLUMNS, 'SHEET_COLUMNS harus sama dengan HEADERS di Code.gs')

tmp = Path(tempfile.mkdtemp()); __import__('atexit').register(__import__('shutil').rmtree, tmp, True)
df = M.make(1200)
df.to_csv(tmp / 'syn.csv', index=False)
real_model_json = ROOT / 'model' / 'model.json'
ok(not real_model_json.exists(), 'folder model/ harus belum berisi model')

# 2. praproses: kekeliruan sengaja disisipkan harus tertangkap
raw = P.load_csv(tmp / 'syn.csv')  # semua teks, seperti CSV unduhan Sheets
extra = pd.DataFrame([raw.iloc[0].to_dict() | {'submission_id': 'SYN-DUP-ID', 'F1': '24', 'F7': '5'},  # jumlah > 24 jam
                      raw.iloc[1].to_dict(),  # ID ganda
                      raw.iloc[3].to_dict() | {'submission_id': 'SYN-UJI', 'D4': 'lainnya', 'D4_other': ' uji '}])  # baris uji
bad = pd.concat([raw, extra], ignore_index=True)
bad.loc[2, 'F1'] = '3,5'  # desimal koma tetap sah
clean_df, rep = P.clean(bad)
ok(rep['duplicate_submission_id_removed'] == 1 and rep['invalid_removed'] == 1 and rep['test_rows_excluded'] == 1 and rep['invalid_reasons'] == {'F7:sum_exceeds_24': 1}, str(rep))
ok(rep['synthetic'] and rep['score_mismatch_vs_backend'] == 0, 'skor backend sintetis harus cocok dengan hitung ulang')
X, y = P.make_xy(clean_df)
ok(list(X.columns) == I.FEATURE_COLUMNS and X.shape[1] == 18 and not any(c[0] in 'BPDS' for c in X.columns), 'tanpa kebocoran fitur')
ok(abs(X.iloc[2]['F1_durasi_jam'] - 3.5) < 1e-12, 'koma desimal dibaca 3.5')
counts = y.value_counts().sort_index().tolist()
ok(len(counts) == 3 and min(counts) >= 150, 'tiap kategori >= 150 pada data uji pipeline: ' + str(counts))

# 3. latih, evaluasi sekali, ekspor
out = tmp / 'v0'
run('train_model.py', '--data', tmp / 'syn.csv', '--version', '0.0.1-sintetis', '--out', out)
S = json.loads((out / 'train_summary.json').read_text())
tr, te = pd.read_csv(out / 'private' / 'train.csv', index_col=0), pd.read_csv(out / 'private' / 'test.csv', index_col=0)
ok(not (set(tr.index) & set(te.index)), 'data latih dan uji tidak beririsan')
ok((S['n_train'], S['n_test']) == (len(tr), len(te)) and abs(len(te) / (len(tr) + len(te)) - 0.2) < 0.005, 'pembagian 80/20')
ok(all(abs(te['label'].eq(k).mean() - tr['label'].eq(k).mean()) < 0.02 for k in (0, 1, 2)), 'pembagian berstrata')
ok(set(S['best_params']) == {'max_depth', 'min_samples_split', 'min_samples_leaf', 'class_weight'} and S['best_params']['max_depth'] in (3, 4, 5, 6), 'parameter dari grid')
ok(S['synthetic'] and 0 < S['cv_macro_f1_mean'] <= 1, 'ringkasan pelatihan')
ok(not (out / 'evaluation.json').exists(), 'pelatihan tidak boleh menyentuh data uji')
run('evaluate_model.py', '--run', out)
ev = json.loads((out / 'evaluation.json').read_text())
ok(len(ev['confusion_matrix']['matrix']) == 3 and sum(map(sum, ev['confusion_matrix']['matrix'])) == S['n_test'], 'confusion matrix 3x3')
ok(set(ev['per_class']) == set(I.CATEGORIES) and 'macro_f1' in ev and ev['baseline']['strategy'] == 'most_frequent', 'metrik lengkap + baseline')
run('evaluate_model.py', '--run', out, expect_fail=True)   # data uji hanya sekali
run('evaluate_model.py', '--run', out, '--force')
ok(json.loads((out / 'evaluation.json').read_text())['runs'] == 2, 'penjalanan ulang tercatat')

# 4. ekspor: sintetis ditolak ke model/, boleh ke folder uji
run('export_model.py', '--run', out, expect_fail=True)
ok(not real_model_json.exists(), 'model sintetis tidak boleh masuk model/')
md = tmp / 'model'
run('export_model.py', '--run', out, '--model-dir', md, '--changelog', tmp / 'CL.md', '--golden', tmp / 'golden.json')
meta = json.loads((md / 'model-metadata.json').read_text())
ok(meta['status'] == 'in_development' and meta['synthetic'] is True, 'tanpa --approve status tetap in_development')
if ev['gate']['all_ok']:
    run('export_model.py', '--run', out, '--model-dir', tmp / 'm2', '--changelog', tmp / 'CL.md', '--golden', tmp / 'g2.json', '--approve')
    ok(json.loads((tmp / 'm2' / 'model-metadata.json').read_text())['status'] == 'ready', 'approve + gerbang terpenuhi -> ready')

# 5. kebenaran ekspor: pencocok independen = predict_proba; cover konsisten (syarat TreeSHAP)
M_ = json.loads((md / 'model.json').read_text())
tree = M_['tree']
ok(M_['feature_columns'] == I.FEATURE_COLUMNS and M_['classes'] == I.CATEGORIES, 'metadata fitur dan kelas')
G = json.loads((tmp / 'golden.json').read_text())['cases']
worst = max(max(abs(a - b) for a, b in zip(walk(tree, c['vector']), c['proba'])) for c in G)
ok(len(G) == 300 and worst < 1e-12, 'pohon ekspor memberi proba yang sama dengan scikit-learn, selisih maks %.2e' % worst)
ok(len({c['class'] for c in G}) >= 2, 'vektor uji mencakup lebih dari satu kelas')
L, Rt, cov, val = tree['children_left'], tree['children_right'], tree['cover'], tree['value']
ok(all(abs(cov[i] - cov[L[i]] - cov[Rt[i]]) < 1e-9 for i in range(len(L)) if L[i] != -1), 'cover induk = jumlah cover anak')
ok(all(abs(sum(v) - 1) < 1e-12 for v in val), 'tiap simpul berjumlah probabilitas 1')
print(f'Pipeline ML: {n} pemeriksaan lulus')
