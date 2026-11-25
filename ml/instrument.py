"""Cermin Python dari instrument.js (Tabel 3.4-3.8). Jangan ubah salah satu tanpa
yang lain; tests/test_instrument.js dan tests/test_instrument.py memakai kasus uji yang sama."""
import math
import re

VERSION = '1.0.0'
CATEGORIES = ['rendah', 'sedang', 'tinggi']  # indeks kelas model: 0, 1, 2
LIMITS = {'D1': (16, 60), 'D3': (2015, 2026), 'HOURS': (0, 24), 'OTHER_MAX': 100}
MAX_HOURS_SUM = 24
OPTIONS = {
    'S1': ['ya', 'tidak'], 'S2': ['ya', 'tidak'], 'S3': ['belum', 'sudah'],
    'D2': ['laki_laki', 'perempuan', 'tidak_menjawab'],
    'D4': ['s1_kewirausahaan', 's1_bisnis_digital', 's1_informatika', 'd3_kebidanan',
           's1_agribisnis', 's1_manajemen_hutan', 'lainnya'],
    'F3': ['instagram', 'tiktok', 'whatsapp', 'youtube', 'facebook', 'x', 'lainnya'],
    'F4': ['hiburan', 'komunikasi', 'informasi', 'belajar_tugas', 'konten_berjualan', 'lainnya'],
}
PASS = {'S1': 'ya', 'S2': 'ya', 'S3': 'belum'}
INT_SCALE = {'F2': 5, 'F5': 5, 'F6': 3, 'P1': 5,
             **{f'B{i}': 5 for i in range(1, 7)}, **{f'P{i}': 5 for i in range(2, 8)}}
FEATURE_COLUMNS = (['F1_durasi_jam', 'F2_frekuensi_buka']
                   + ['F3_' + v for v in OPTIONS['F3']] + ['F4_' + v for v in OPTIONS['F4']]
                   + ['F5_menjelang_tidur', 'F6_notifikasi', 'F7_jam_tidur'])
FEATURE_GROUP = {c: c[:2] for c in FEATURE_COLUMNS}  # kolom -> fitur asal
_NUM = re.compile(r'^[+-]?\d+(\.\d+)?$')


def is_blank(v):
    return v is None or (isinstance(v, str) and v.strip() == '')


def to_number(v):
    """Menerima "3,5" maupun "3.5". Selain angka -> NaN."""
    if isinstance(v, bool):
        return math.nan
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip().replace(',', '.')
        if _NUM.match(s):
            return float(s)
    return math.nan


def validate(a):
    """Daftar (field, kode); kode sama dengan instrument.js."""
    errs = []

    def num(k, lo, hi, integer):
        if is_blank(a.get(k)):
            errs.append((k, 'required')); return math.nan
        n = to_number(a[k])
        if not math.isfinite(n) or (integer and not n.is_integer()):
            errs.append((k, 'format')); return math.nan
        if n < lo or n > hi:
            errs.append((k, 'range')); return math.nan
        return n

    for k, ok in PASS.items():
        v = a.get(k)
        if is_blank(v): errs.append((k, 'required'))
        elif v not in OPTIONS[k]: errs.append((k, 'invalid_option'))
        elif v != ok: errs.append((k, 'screening_failed'))
    for k in ('D2', 'D4', 'F3', 'F4'):
        v = a.get(k)
        if is_blank(v): errs.append((k, 'required')); continue
        if v not in OPTIONS[k]: errs.append((k, 'invalid_option')); continue
        if v == 'lainnya':
            o = a.get(k + '_other')
            if is_blank(o): errs.append((k + '_other', 'other_required'))
            elif len(str(o).strip()) > LIMITS['OTHER_MAX']: errs.append((k + '_other', 'too_long'))
    num('D1', *LIMITS['D1'], True)
    num('D3', *LIMITS['D3'], True)
    f1 = num('F1', *LIMITS['HOURS'], False)
    f7 = num('F7', *LIMITS['HOURS'], False)
    if math.isfinite(f1) and math.isfinite(f7) and f1 + f7 > MAX_HOURS_SUM + 1e-9:
        errs.append(('F7', 'sum_exceeds_24'))
    for k, hi in INT_SCALE.items():
        num(k, 1, hi, True)
    return errs


def bsmas_score(a):
    return sum(float(a[f'B{i}']) for i in range(1, 7))


def bsmas_category(score):  # Tabel 3.4
    return 'rendah' if score <= 18 else ('sedang' if score <= 23 else 'tinggi')


def productivity_score(a):  # Tabel 3.7: rentang 7-35
    p = lambda k: float(a[k])
    return p('P1') + p('P2') + p('P3') + p('P4') + (6 - p('P5')) + (6 - p('P6')) + (6 - p('P7'))


def feature_vector(a):
    """18 nilai sesuai FEATURE_COLUMNS (a harus sudah valid)."""
    hot = lambda k: [1 if a[k] == v else 0 for v in OPTIONS[k]]
    return ([to_number(a['F1']), to_number(a['F2'])] + hot('F3') + hot('F4')
            + [to_number(a['F5']), to_number(a['F6']), to_number(a['F7'])])
