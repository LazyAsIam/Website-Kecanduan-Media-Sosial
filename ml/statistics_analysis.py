"""Analisis statistik Subbab 3.6.6 pada SELURUH responden bersih: deskriptif, korelasi Spearman (Hipotesis 1, selang kepercayaan 95% bootstrap persentil),
Kruskal-Wallis (Hipotesis 2, epsilon-kuadrat = H/(n-1)), uji lanjut Dunn dengan penyesuaian Holm HANYA bila Kruskal-Wallis signifikan,
tiga analisis sensitivitas (tanpa indikator b dan e = P2 dan P5; tanpa butir conflict = B6), serta keandalan butir (alfa Cronbach, korelasi butir-total terkoreksi).
Hasil: statistics.json dan statistics.md (kerangka Tabel 4.4-4.6). Semua hasil ditafsirkan sebagai asosiasi, bukan sebab-akibat.
Contoh: python ml/statistics_analysis.py --data ml/data/responses.csv"""
import argparse
import json
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

import config as C
import instrument as I
import preprocess as P

ALPHA = 0.05
CATS = I.CATEGORIES
LABEL = {'rendah': 'Rendah', 'sedang': 'Sedang', 'tinggi': 'Tinggi'}


def summarize(a):
    a = np.asarray(a, float)
    return {'n': int(a.size), 'mean': float(a.mean()), 'sd': float(a.std(ddof=1)) if a.size > 1 else None, 'median': float(np.median(a)),
            'q1': float(np.percentile(a, 25)), 'q3': float(np.percentile(a, 75)), 'min': float(a.min()), 'max': float(a.max())}


def rho_rows(x, y, idx):
    """Korelasi Spearman untuk tiap baris indeks resampel (vektorisasi); sama dengan scipy.stats.spearmanr per resampel."""
    rx, ry = stats.rankdata(x[idx], axis=1), stats.rankdata(y[idx], axis=1)
    rx, ry = rx - rx.mean(axis=1, keepdims=True), ry - ry.mean(axis=1, keepdims=True)
    with np.errstate(invalid='ignore', divide='ignore'):
        return (rx * ry).sum(axis=1) / np.sqrt((rx ** 2).sum(axis=1) * (ry ** 2).sum(axis=1))


def spearman(x, y, B, seed):
    r = stats.spearmanr(x, y)
    rng, n = np.random.default_rng(seed), len(x)
    rhos = np.concatenate([rho_rows(x, y, rng.integers(0, n, size=(min(1000, B - s), n))) for s in range(0, B, 1000)])
    lo, hi = np.nanpercentile(rhos, [2.5, 97.5])
    return {'n': int(n), 'rho': float(r[0]), 'p': float(r[1]), 'ci95': [float(lo), float(hi)], 'reject_h0': bool(r[1] < ALPHA),
            'bootstrap': {'method': 'percentile, resampel responden dengan pengembalian', 'B': B, 'seed': seed}}


def holm(p):
    p = np.asarray(p, float)
    adj, run = np.empty(len(p)), 0.0
    for r, i in enumerate(np.argsort(p)):
        run = max(run, (len(p) - r) * p[i])
        adj[i] = min(1.0, run)
    return adj


def dunn(groups):
    """Uji lanjut Dunn (varians dengan koreksi ikatan) + Holm. Mengembalikan (peringkat rata-rata per kelompok, hasil per pasangan)."""
    names = list(groups)
    allv = np.concatenate([groups[k] for k in names])
    N, ranks, pos, mean_rank, size = len(allv), stats.rankdata(np.concatenate([groups[k] for k in names])), 0, {}, {}
    for k in names:
        size[k] = len(groups[k])
        mean_rank[k] = float(ranks[pos:pos + size[k]].mean())
        pos += size[k]
    sigma2 = N * (N + 1) / 12.0 * stats.tiecorrect(ranks)
    out = []
    for a, b in combinations(names, 2):
        z = (mean_rank[a] - mean_rank[b]) / np.sqrt(sigma2 * (1 / size[a] + 1 / size[b]))
        out.append({'pair': [a, b], 'z': float(z), 'p': float(2 * stats.norm.sf(abs(z)))})
    for o, q in zip(out, holm([o['p'] for o in out])):
        o['p_holm'] = float(q)
    return mean_rank, out


def kruskal(prod, cats):
    groups = {c: prod[cats == c] for c in CATS}
    if any(len(g) == 0 for g in groups.values()):
        return {'performed': False, 'reason': 'ada kategori tanpa responden'}
    H, p = stats.kruskal(*groups.values())
    n = int(sum(len(g) for g in groups.values()))
    mean_rank, pairs = dunn(groups)
    sig = bool(p < ALPHA)
    return {'performed': True, 'H': float(H), 'df': len(CATS) - 1, 'p': float(p), 'n': n, 'epsilon2': float(H / (n - 1)), 'reject_h0': sig,
            'groups': {c: {**summarize(g), 'mean_rank': mean_rank[c]} for c, g in groups.items()},
            'dunn': {'performed': sig, 'pairs': pairs if sig else [], 'note': None if sig else 'Uji lanjut tidak dilakukan karena Kruskal-Wallis tidak signifikan.'}}


def reliability(M):
    k, tot = M.shape[1], M.sum(axis=1)
    alpha = k / (k - 1) * (1 - M.var(axis=0, ddof=1).sum() / tot.var(ddof=1))
    itc = [float(np.corrcoef(M[:, j], tot - M[:, j])[0, 1]) for j in range(k)]
    mean_r = float(np.corrcoef(M, rowvar=False)[np.triu_indices(k, 1)].mean())
    return {'n': int(M.shape[0]), 'k': k, 'cronbach_alpha': float(alpha), 'corrected_item_total': itc, 'mean_inter_item_r': mean_r}


def run_analyses(df, B, seed):
    recs = df.to_dict('records')
    num = lambda r, k: float(r[k])
    bs = np.array([I.bsmas_score(r) for r in recs], float)
    pr = np.array([I.productivity_score(r) for r in recs], float)
    bs5 = np.array([sum(num(r, 'B%d' % i) for i in range(1, 6)) for r in recs])
    pr5 = np.array([num(r, 'P1') + num(r, 'P3') + num(r, 'P4') + (6 - num(r, 'P6')) + (6 - num(r, 'P7')) for r in recs])
    cat = np.array([I.bsmas_category(s) for s in bs])
    cnt = lambda k: {str(v): int(c) for v, c in pd.Series([r[k] for r in recs]).value_counts().sort_index().items()}
    kw = kruskal(pr, cat)
    return {
        'n': len(recs), 'categories': {c: {'n': int((cat == c).sum()), 'pct': float((cat == c).mean() * 100)} for c in CATS},
        'bsmas': summarize(bs), 'productivity': summarize(pr),
        'characteristics': {'age': summarize([I.to_number(r['D1']) for r in recs]), 'gender': cnt('D2'), 'cohort': cnt('D3'), 'program': cnt('D4')},
        'h1': spearman(bs, pr, B, seed), 'h2': kw,
        'sensitivity': [
            {'label': 'Spearman: produktivitas lima indikator (a, c, d, f, g) dengan skor BSMAS', **spearman(bs, pr5, B, seed)},
            {'label': 'Spearman: produktivitas tujuh indikator dengan BSMAS lima butir (tanpa butir conflict, B6)', **spearman(bs5, pr, B, seed)},
            {'label': 'Kruskal-Wallis: produktivitas lima indikator antarkategori', **{k: v for k, v in kruskal(pr5, cat).items() if k != 'dunn'}}],
        'reliability': {
            'bsmas': reliability(np.array([[num(r, 'B%d' % i) for i in range(1, 7)] for r in recs])),
            'productivity_7': reliability(np.array([[num(r, 'P1'), num(r, 'P2'), num(r, 'P3'), num(r, 'P4'), 6 - num(r, 'P5'), 6 - num(r, 'P6'), 6 - num(r, 'P7')] for r in recs]))}}


def f(x, d=2):
    return 'NA' if x is None or (isinstance(x, float) and np.isnan(x)) else ('%.*f' % (d, x)).replace('.', ',')


def fp(p):
    return '< 0,001' if p < 0.001 else f(p, 3)


def report(S):
    h1, kw = S['h1'], S['h2']
    dec = lambda r: 'ditolak' if r else 'tidak ditolak'
    L = ['# Analisis statistik (Subbab 3.6.6)', '', 'Responden bersih: %d.%s' % (S['n'], ' **DATA SINTETIS: hanya uji skrip, bukan hasil penelitian.**' if S['synthetic'] else ''), '',
         '## Deskriptif', '', '| Kategori BSMAS | n | % |', '|---|---|---|'] + ['| %s | %d | %s |' % (LABEL[c], v['n'], f(v['pct'], 1)) for c, v in S['categories'].items()] + ['',
         '| Skor | Rerata | SD | Median | Q1-Q3 | Min | Maks |', '|---|---|---|---|---|---|---|']
    for nm, k in (('BSMAS (6-30)', 'bsmas'), ('Produktivitas (7-35)', 'productivity')):
        s = S[k]
        L.append('| %s | %s | %s | %s | %s-%s | %s | %s |' % (nm, f(s['mean']), f(s['sd']), f(s['median'], 1), f(s['q1'], 1), f(s['q3'], 1), f(s['min'], 0), f(s['max'], 0)))
    a = S['characteristics']['age']
    L += ['', 'Usia: rerata %s (SD %s), median %s, rentang %s-%s. Jenis kelamin: %s. Angkatan: %s. Program studi: %s.' % (
        f(a['mean']), f(a['sd']), f(a['median'], 1), f(a['min'], 0), f(a['max'], 0), S['characteristics']['gender'], S['characteristics']['cohort'], S['characteristics']['program']), '',
        '## Hipotesis 1: korelasi Spearman', '', 'rho = %s (selang kepercayaan 95%% bootstrap: %s hingga %s; p dua arah = %s; n = %d). H0 %s pada alfa = 0,05. '
        'Bootstrap persentil, B = %d, seed = %d.' % (f(h1['rho'], 3), f(h1['ci95'][0], 3), f(h1['ci95'][1], 3), fp(h1['p']), h1['n'], dec(h1['reject_h0']), h1['bootstrap']['B'], h1['bootstrap']['seed']), '',
        '## Hipotesis 2: Kruskal-Wallis', '']
    if not kw['performed']:
        L.append('Tidak dapat dihitung: %s.' % kw['reason'])
    else:
        L += ['H = %s, derajat kebebasan %d, p = %s, epsilon-kuadrat = %s (n = %d). H0 %s pada alfa = 0,05.' % (f(kw['H'], 3), kw['df'], fp(kw['p']), f(kw['epsilon2'], 3), kw['n'], dec(kw['reject_h0'])), '',
              '**Tabel 4.4** | Kategori | n | Median (Q1-Q3) | Peringkat rata-rata |', '|---|---|---|---|']
        L += ['| %s | %d | %s (%s-%s) | %s |' % (LABEL[c], g['n'], f(g['median'], 1), f(g['q1'], 1), f(g['q3'], 1), f(g['mean_rank'], 1)) for c, g in kw['groups'].items()]
        if kw['dunn']['performed']:
            L += ['', '**Tabel 4.5** Dunn dengan penyesuaian Holm', '', '| Pasangan | Statistik z | p (Holm) | Keterangan |', '|---|---|---|---|']
            for o in kw['dunn']['pairs']:
                x, y = o['pair']
                up = x if kw['groups'][x]['mean_rank'] > kw['groups'][y]['mean_rank'] else y
                L.append('| %s-%s | %s | %s | %s |' % (LABEL[x], LABEL[y], f(o['z'], 3), fp(o['p_holm']),
                         ('Berbeda; peringkat rata-rata produktivitas lebih tinggi pada kategori ' + LABEL[up]) if o['p_holm'] < ALPHA else 'Tidak berbeda'))
            L += ['', 'Median hanya dibandingkan bila bentuk sebaran antarkategori serupa; bila tidak, bandingkan sebarannya.']
        else:
            L += ['', kw['dunn']['note']]
    L += ['', '## Analisis sensitivitas (Tabel 4.6)', '', '| Analisis | Statistik | p | Ukuran efek / selang kepercayaan 95% |', '|---|---|---|---|']
    for s in S['sensitivity']:
        if 'rho' in s:
            L.append('| %s | rho = %s | %s | %s hingga %s |' % (s['label'], f(s['rho'], 3), fp(s['p']), f(s['ci95'][0], 3), f(s['ci95'][1], 3)))
        else:
            L.append('| %s | H = %s | %s | epsilon-kuadrat = %s |' % (s['label'], f(s['H'], 3), fp(s['p']), f(s['epsilon2'], 3)))
    L += ['', '## Keandalan butir (Subbab 2.1.3)', '', '| Skala | k | Alfa Cronbach | Rerata korelasi antarbutir | Korelasi butir-total terkoreksi |', '|---|---|---|---|---|']
    for nm, k in (('BSMAS B1-B6', 'bsmas'), ('Produktivitas P1-P7 (setelah pembalikan)', 'productivity_7')):
        r = S['reliability'][k]
        L.append('| %s | %d | %s | %s | %s |' % (nm, r['k'], f(r['cronbach_alpha'], 3), f(r['mean_inter_item_r'], 3), ', '.join(f(v, 2) for v in r['corrected_item_total'])))
    L += ['', 'Catatan: semua hasil adalah asosiasi, bukan bukti pengaruh. Kekuatan asosiasi dibaca dari besar |rho| beserta selang kepercayaannya, bukan hanya dari nilai p. '
          'Kuartil dihitung dengan interpolasi linear (numpy). Korelasi antarbutir memakai Pearson.']
    return '\n'.join(L) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True)
    ap.add_argument('--out', default=str(C.ROOT / 'ml' / 'reports' / 'statistics'))
    ap.add_argument('--bootstrap', type=int, default=10000)
    ap.add_argument('--seed', type=int, default=C.SEED)
    ap.add_argument('--include-post-release', action='store_true')
    a = ap.parse_args()
    raw = P.load_csv(a.data)
    df, rep = P.clean(raw, a.include_post_release)
    if len(df) < 30:
        raise SystemExit('Data bersih terlalu sedikit (%d) untuk dianalisis.' % len(df))
    S = run_analyses(df, a.bootstrap, a.seed)
    S.update({'synthetic': rep['synthetic'], 'cleaning': rep, 'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds')})
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'statistics.json').write_text(json.dumps(S, indent=2, ensure_ascii=False), encoding='utf-8')
    (out / 'statistics.md').write_text(report(S), encoding='utf-8')
    h1, kw = S['h1'], S['h2']
    print('n = %d | rho = %.3f (CI95 %.3f hingga %.3f, p = %s) | Kruskal-Wallis H = %s, p = %s | laporan: %s' % (
        S['n'], h1['rho'], h1['ci95'][0], h1['ci95'][1], fp(h1['p']), f(kw.get('H'), 3), fp(kw['p']) if kw['performed'] else 'NA', out / 'statistics.md'))


if __name__ == '__main__':
    main()
