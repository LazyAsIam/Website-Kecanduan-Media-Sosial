"""Menguji statistics_analysis.py dengan data SINTETIS dan terhadap definisi/pustaka acuan. Jalankan dari akar proyek: python3 tests/test_statistics.py"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy import stats

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'ml'))
sys.path.insert(0, str(ROOT / 'ml' / 'tools'))
import make_synthetic_data as M  # noqa: E402
import statistics_analysis as SA  # noqa: E402

n = 0


def ok(c, m=''):
    global n
    assert c, m
    n += 1


rng = np.random.default_rng(3)
# 1. Holm (contoh hitung manual: terurut 0,01 0,03 0,04 dikali 3, 2, 1 lalu maksimum kumulatif)
ok(np.allclose(SA.holm([0.01, 0.04, 0.03]), [0.03, 0.06, 0.06]) and np.allclose(SA.holm([0.5, 0.9, 0.7]), [1, 1, 1]), 'Holm')
# 2. Dunn untuk dua kelompok dengan ikatan: z kuadrat = H Kruskal-Wallis (koreksi ikatan sama)
a, b = rng.integers(1, 8, 60), rng.integers(2, 9, 45)
_, pairs = SA.dunn({'a': a, 'b': b})
ok(abs(pairs[0]['z'] ** 2 - stats.kruskal(a, b).statistic) < 1e-9, 'Dunn z^2 = H')
# 3. Spearman bootstrap vektorisasi = scipy per resampel
x = rng.integers(1, 30, 80).astype(float)
y = x + rng.normal(0, 4, 80)
idx = rng.integers(0, 80, size=(25, 80))
ok(np.allclose(SA.rho_rows(x, y, idx), [stats.spearmanr(x[i], y[i])[0] for i in idx], atol=1e-12), 'rho_rows = spearmanr')
r1, r2 = SA.spearman(x, y, 300, 5), SA.spearman(x, y, 300, 5)
ok(r1 == r2 and r1['ci95'][0] <= r1['rho'] <= r1['ci95'][1] and abs(r1['rho'] - stats.spearmanr(x, y)[0]) < 1e-12, 'bootstrap deterministik dan memuat rho')
# 4. Alfa Cronbach
M5 = rng.integers(1, 6, size=(200, 5)).astype(float)
manual = 5 / 4 * (1 - M5.var(axis=0, ddof=1).sum() / M5.sum(axis=1).var(ddof=1))
same = np.tile(rng.integers(1, 6, size=(100, 1)), (1, 4)).astype(float)
ok(abs(SA.reliability(M5)['cronbach_alpha'] - manual) < 1e-12 and abs(SA.reliability(same)['cronbach_alpha'] - 1) < 1e-12, 'alfa Cronbach')

# 5. ujung ke ujung (data sintetis: produktivitas dibangkitkan menurun terhadap BSMAS)
tmp = Path(tempfile.mkdtemp()); __import__('atexit').register(__import__('shutil').rmtree, tmp, True)
df = M.make(1200)
df.to_csv(tmp / 'syn.csv', index=False)
p = subprocess.run([sys.executable, str(ROOT / 'ml' / 'statistics_analysis.py'), '--data', str(tmp / 'syn.csv'), '--out', str(tmp / 'out'), '--bootstrap', '400'], capture_output=True, text=True)
ok(p.returncode == 0, p.stdout + p.stderr)
S = json.loads((tmp / 'out' / 'statistics.json').read_text())
bs, pr = df['bsmas_score'].astype(float).to_numpy(), df['productivity_score'].astype(float).to_numpy()
cat = np.array(df['bsmas_category'])
pr5 = (df.P1 + df.P3 + df.P4 + (6 - df.P6) + (6 - df.P7)).astype(float).to_numpy()
bs5 = df[['B1', 'B2', 'B3', 'B4', 'B5']].sum(axis=1).astype(float).to_numpy()
ok(S['n'] == 1200 and S['synthetic'] and sum(v['n'] for v in S['categories'].values()) == 1200, 'jumlah responden dan tanda sintetis')
ok(abs(S['h1']['rho'] - stats.spearmanr(bs, pr)[0]) < 1e-12 and S['h1']['rho'] < 0 and S['h1']['reject_h0'], 'H1 = scipy; arah negatif pada data tiruan')
kw = S['h2']
ref = stats.kruskal(*[pr[cat == c] for c in ('rendah', 'sedang', 'tinggi')])
ok(abs(kw['H'] - ref.statistic) < 1e-9 and kw['df'] == 2 and abs(kw['epsilon2'] - kw['H'] / (kw['n'] - 1)) < 1e-12, 'Kruskal-Wallis = scipy; epsilon-kuadrat = H/(n-1)')
ok(kw['dunn']['performed'] and len(kw['dunn']['pairs']) == 3 and all(q['p_holm'] >= q['p'] - 1e-15 for q in kw['dunn']['pairs']), 'Dunn-Holm dilakukan karena signifikan')
s1, s2, s3 = S['sensitivity']
ok(abs(s1['rho'] - stats.spearmanr(bs, pr5)[0]) < 1e-12 and abs(s2['rho'] - stats.spearmanr(bs5, pr)[0]) < 1e-12, 'sensitivitas Spearman (tanpa P2, P5; tanpa B6)')
ok(abs(s3['H'] - stats.kruskal(*[pr5[cat == c] for c in ('rendah', 'sedang', 'tinggi')]).statistic) < 1e-9 and 'dunn' not in s3, 'sensitivitas Kruskal-Wallis')
ok(S['reliability']['bsmas']['k'] == 6 and S['reliability']['productivity_7']['k'] == 7, 'keandalan')
md = (tmp / 'out' / 'statistics.md').read_text()
ok('Tabel 4.4' in md and 'Tabel 4.5' in md and 'Tabel 4.6' in md and 'DATA SINTETIS' in md, 'laporan memuat tabel dan penanda sintetis')

# 6. tanpa pembeda (produktivitas konstan antarkategori) -> Kruskal-Wallis tidak signifikan: uji lanjut tidak dilakukan
flat = df.copy()
for k, v in zip(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'], rng.integers(1, 6, size=(7, 1200))):
    flat[k] = v
flat['productivity_score'] = [SA.I.productivity_score(r) for r in flat.to_dict('records')]
flat.to_csv(tmp / 'flat.csv', index=False)
p = subprocess.run([sys.executable, str(ROOT / 'ml' / 'statistics_analysis.py'), '--data', str(tmp / 'flat.csv'), '--out', str(tmp / 'flat'), '--bootstrap', '200'], capture_output=True, text=True)
ok(p.returncode == 0, p.stdout + p.stderr)
F = json.loads((tmp / 'flat' / 'statistics.json').read_text())
ok((not F['h2']['reject_h0']) == (not F['h2']['dunn']['performed']) and (F['h2']['reject_h0'] or F['h2']['dunn']['pairs'] == []), 'Dunn hanya bila Kruskal-Wallis signifikan')
print(f'Statistik: {n} pemeriksaan lulus')
