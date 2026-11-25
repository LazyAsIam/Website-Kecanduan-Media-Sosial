"""Menguji TreeSHAP Python, calculate_shap.py, dan verify_export.py dengan data SINTETIS. Jalankan dari akar proyek: python3 tests/test_shap_python.py"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'ml'))
sys.path.insert(0, str(ROOT / 'tests'))
import instrument as I  # noqa: E402
import make_fixture as MF  # noqa: E402
import make_synthetic_data as M  # noqa: E402,F401
import treeshap as TS  # noqa: E402

n = 0


def ok(c, m=''):
    global n
    assert c, m
    n += 1


def run(script, *args, expect_fail=False):
    r = subprocess.run([sys.executable, str(ROOT / 'ml' / script), *map(str, args)], capture_output=True, text=True)
    ok((r.returncode != 0) if expect_fail else (r.returncode == 0), script + (' seharusnya ditolak' if expect_fail else ' gagal') + ': ' + r.stdout + r.stderr)
    return r


# 1. TreeSHAP Python = Shapley eksak (fixture sintetis) dan konsisten secara lokal
FX = ROOT / 'tests' / '.generated' / 'synthetic'
if not (FX / 'model.json').exists():
    sys.exit('Data sintetis sementara belum dibuat. Jalankan: python3 tests/make_fixture.py (atau python3 tests/run_all.py)')
tree = json.loads((FX / 'model.json').read_text())['tree']
gold = json.loads((FX / 'golden-vectors.json').read_text())['cases']
ref = json.loads((FX / 'golden-shap.json').read_text())['cases']
worst = 0.0
for c in ref:
    phi, base = TS.explain(tree, gold[c['index']]['vector'], 18)
    worst = max(worst, float(np.abs(phi - np.array(c['phi'])).max()), float(np.abs(base - np.array(c['base'])).max()))
ok(worst < 1e-9, 'TreeSHAP Python vs Shapley eksak: %.2e' % worst)
loc = max(float(np.abs(TS.explain(tree, g['vector'], 18)[1] + TS.explain(tree, g['vector'], 18)[0].sum(axis=0) - np.array(g['proba'])).max()) for g in gold)
ok(loc < 1e-9, 'kekonsistenan lokal %.2e' % loc)

# 2. calculate_shap.py dan verify_export.py ujung ke ujung
tmp = Path(tempfile.mkdtemp()); __import__('atexit').register(__import__('shutil').rmtree, tmp, True)
M.make(1200).to_csv(tmp / 'syn.csv', index=False)
run('train_model.py', '--data', tmp / 'syn.csv', '--version', '0.0.1-sintetis', '--out', tmp / 'run')
run('evaluate_model.py', '--run', tmp / 'run')
run('export_model.py', '--run', tmp / 'run', '--model-dir', tmp / 'model', '--golden', tmp / 'golden.json', '--changelog', tmp / 'CL.md')
real = ROOT / 'model' / 'global-shap.json'
run('calculate_shap.py', '--run', tmp / 'run', '--engine', 'internal', expect_fail=True)  # sintetis tidak boleh ke model/
ok(not real.exists(), 'global-shap.json sintetis tidak boleh masuk model/')
run('calculate_shap.py', '--run', tmp / 'run', '--engine', 'internal', '--model-dir', tmp / 'model')
G = json.loads((tmp / 'model' / 'global-shap.json').read_text())
ok(G['features'] == ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7'] and G['classes'] == I.CATEGORIES and G['engine'] == 'internal' and G['synthetic'], 'struktur')
ok(set(G['mean_abs']) == {'rendah', 'sedang', 'tinggi', 'mean'} and all(v >= 0 for d in G['mean_abs'].values() for v in d.values()), 'mean |SHAP| tidak negatif')
ok(abs(sum(G['mean_abs']['mean'].values()) - sum(sum(G['mean_abs'][c].values()) for c in I.CATEGORIES) / 3) < 1e-12, 'rata-rata antarkelas konsisten')
ok(set(G['direction']) == set(G['features']) and G['direction']['F1']['kind'] == 'ordinal' and G['direction']['F3']['kind'] == 'nominal', 'arah per fitur')
ok(sum(v['n'] for v in G['direction']['F3']['mean_by_category'].values()) == G['n_samples'], 'kategori nominal mencakup seluruh data uji')
ok(G['direction']['F1']['spearman']['tinggi'] > 0, 'durasi lebih tinggi menaikkan estimasi "tinggi" pada data sintetis')
ok(G['mean_abs']['mean']['F1'] > 0, 'F1 berkontribusi')
ok((tmp / 'run' / 'shap_global.png').exists(), 'gambar SHAP global dibuat')
import joblib  # noqa: E402
ok(TS.tree_arrays(joblib.load(tmp / 'run' / 'model.joblib')) == json.loads((tmp / 'model' / 'model.json').read_text())['tree'], 'tree_arrays = model.json')
r = run('verify_export.py', '--run', tmp / 'run', '--model-dir', tmp / 'model', '--golden', tmp / 'golden.json')
ok('GAGAL' not in r.stdout and 'HASIL:' in r.stdout, 'verify_export: ' + r.stdout)
print(f'SHAP Python: {n} pemeriksaan lulus | {r.stdout.strip().splitlines()[-2][:110]}')
