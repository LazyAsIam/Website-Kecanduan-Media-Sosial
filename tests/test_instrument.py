"""Jalankan dari akar proyek: python3 tests/test_instrument.py"""
import json
import os
import sys

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, os.path.join(root, 'ml'))
import instrument as I  # noqa: E402

C = json.load(open(os.path.join(root, 'tests', 'scoring-cases.json'), encoding='utf-8'))
n = 0


def eq(a, b, m=''):
    global n
    assert a == b, f'{m}: {a!r} != {b!r}'
    n += 1


keyed = lambda prefix, arr: {f'{prefix}{i + 1}': v for i, v in enumerate(arr)}
eq(I.FEATURE_COLUMNS, C['columns'], 'urutan 18 kolom')
eq(I.validate(C['base']), [], 'jawaban dasar valid')
for b, s, cat in C['bsmas']:
    eq(I.bsmas_score(keyed('B', b)), s, f'skor BSMAS {b}')
    eq(I.bsmas_category(s), cat, f'kategori {s}')
for p, s in C['productivity']:
    eq(I.productivity_score(keyed('P', p)), s, f'produktivitas {p}')
for f, v in C['vectors']:
    eq(I.feature_vector({**C['base'], **f}), v, f'vektor {f}')
for id_, patch, exp in C['validation']:
    a = dict(C['base'])
    for k, v in patch.items():
        a.pop(k, None) if v is None else a.__setitem__(k, v)
    eq(sorted(f'{f}:{c}' for f, c in I.validate(a)), sorted(exp), id_)
print(f'Python: {n} pemeriksaan lulus')
