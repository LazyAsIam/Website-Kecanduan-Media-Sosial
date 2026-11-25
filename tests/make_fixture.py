"""Membuat data uji SINTETIS SEMENTARA (tests/.generated/synthetic/, di-.gitignore, dihapus run_all.py): model, vektor uji, dan nilai SHAP rujukan dari
perhitungan Shapley eksak (brute force, definisi nilai path-dependent). BUKAN model penelitian.
Jalankan dari akar proyek: python3 tests/make_fixture.py"""
import json
import subprocess
import sys
import tempfile
from math import factorial
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
FX = ROOT / 'tests' / '.generated' / 'synthetic'
sys.path.insert(0, str(ROOT / 'ml' / 'tools'))
sys.path.insert(0, str(ROOT / 'ml'))
import make_synthetic_data as M  # noqa: E402


def shapley(tree, vec):
    L, R, F, TH, V, CV = (tree[k] for k in ('children_left', 'children_right', 'feature', 'threshold', 'value', 'cover'))
    x = [float(np.float32(v)) for v in vec]
    used = sorted({f for f in F if f >= 0})

    def ev(node, known):
        if L[node] == -1:
            return np.array(V[node])
        f = F[node]
        if f in known:
            return ev(L[node] if x[f] <= TH[node] else R[node], known)
        return (CV[L[node]] * ev(L[node], known) + CV[R[node]] * ev(R[node], known)) / CV[node]

    m = len(used)
    vals = [ev(0, frozenset(used[i] for i in range(m) if mask >> i & 1)) for mask in range(1 << m)]
    phi = np.zeros((len(vec), 3))
    for i, f in enumerate(used):
        for mask in range(1 << m):
            if mask >> i & 1:
                continue
            s = bin(mask).count('1')
            phi[f] += factorial(s) * factorial(m - s - 1) / factorial(m) * (vals[mask | 1 << i] - vals[mask])
    return phi, np.array(V[0])


if __name__ == '__main__':
    FX.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp()); __import__('atexit').register(__import__('shutil').rmtree, tmp, True)
    M.make(1200).to_csv(tmp / 'syn.csv', index=False)
    py = lambda s, *a: subprocess.run([sys.executable, str(ROOT / 'ml' / s), *map(str, a)], check=True)
    py('train_model.py', '--data', tmp / 'syn.csv', '--version', '0.0.1-sintetis', '--out', tmp / 'run')
    py('evaluate_model.py', '--run', tmp / 'run')
    py('export_model.py', '--run', tmp / 'run', '--model-dir', FX, '--golden', FX / 'golden-vectors.json', '--changelog', tmp / 'CL.md')
    py('calculate_shap.py', '--run', tmp / 'run', '--engine', 'internal', '--model-dir', FX)  # global-shap.json sintetis untuk uji UI
    tree = json.loads((FX / 'model.json').read_text())['tree']
    cases = json.loads((FX / 'golden-vectors.json').read_text())['cases']
    out = []
    for i in range(0, 300, 30):  # 10 kasus
        phi, base = shapley(tree, cases[i]['vector'])
        out.append({'index': i, 'phi': phi.tolist(), 'base': base.tolist()})
    (FX / 'golden-shap.json').write_text(json.dumps({'synthetic': True, 'method': 'exact Shapley, path-dependent value function', 'cases': out}), encoding='utf-8')
    print('Fixture SINTETIS ditulis ke', FX)
