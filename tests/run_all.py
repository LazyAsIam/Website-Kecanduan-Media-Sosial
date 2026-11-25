"""Menjalankan SELURUH rangkaian uji dan menampilkan ringkasan. Jalankan dari akar proyek: python3 tests/run_all.py [--keep]
Data sintetis untuk uji dibuat SEMENTARA di tests/.generated/ (di-.gitignore) dan dihapus setelah selesai (kecuali --keep),
sehingga tidak ada data dummy yang tersisa di proyek. Uji yang butuh Playwright/Chromium otomatis DILEWATI bila tidak tersedia."""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEN = ROOT / 'tests' / '.generated'
PY, NODE = sys.executable, 'node'
SUITES = [
    ('Instrumen (JS)', [NODE, 'tests/test_instrument.js']), ('Instrumen (Python)', [PY, 'tests/test_instrument.py']),
    ('Terjemahan ID/EN + teks terima kasih', [NODE, 'tests/test_translations.js']),
    ('Backend + klien + pembersihan baris uji (tiruan Google)', [NODE, 'tests/test_backend.js']),
    ('Pipeline ML (data sintetis sementara)', [PY, 'tests/test_ml_pipeline.py']), ('TreeSHAP + SHAP global (Python)', [PY, 'tests/test_shap_python.py']),
    ('Runtime model JS', [NODE, 'tests/test_model_runtime.js']), ('Analisis statistik', [PY, 'tests/test_statistics.py']),
    ('Uji beban (server tiruan)', [PY, 'tests/test_load_test.py']), ('check.html (Chromium)', [NODE, 'tests/check_page.js']),
    ('Dashboard (Chromium)', [NODE, 'tests/admin_page.js']), ('UI: formulir + halaman terima kasih (Chromium)', [NODE, 'tests/ui_smoke.js']),
    ('Panel prediksi, tidak dimuat situs (Chromium, terisolasi)', [NODE, 'tests/prediction_panel.js']),
]


def main():
    keep = '--keep' in sys.argv
    shutil.rmtree(GEN, ignore_errors=True)
    (GEN / 'tmp').mkdir(parents=True)
    env = {**os.environ, 'TMPDIR': str(GEN / 'tmp')}  # direktori sementara uji ikut dihapus
    failed, rows = False, []
    try:
        g = subprocess.run([PY, 'tests/make_fixture.py'], cwd=ROOT, capture_output=True, text=True, env=env, timeout=900)
        if g.returncode != 0:
            print('Gagal membuat data sintetis sementara:\n' + (g.stdout + g.stderr)[-1500:])
            return 1
        for name, cmd in SUITES:
            p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, env=env, timeout=900)
            out = (p.stdout + p.stderr).strip()
            m = re.search(r'(\d+) pemeriksaan lulus', out)
            status = 'DILEWATI' if 'dilewati' in out else ('LULUS' if p.returncode == 0 else 'GAGAL')
            failed |= status == 'GAGAL'
            rows.append((name, status, m.group(1) if m else '-'))
            if status == 'GAGAL':
                print('--- %s GAGAL ---\n%s\n' % (name, '\n'.join(out.splitlines()[-15:])))
    finally:
        if not keep:
            shutil.rmtree(GEN, ignore_errors=True)
    w = max(len(r[0]) for r in rows)
    for name, status, cnt in rows:
        print('%-*s  %-9s %s' % (w, name, status, cnt))
    print('\nRINGKASAN: ' + ('ADA YANG GAGAL' if failed else 'tidak ada yang gagal') + '. Pengujian fungsional sistem, BUKAN evaluasi kinerja Machine Learning (lihat evaluation.md).')
    print('Data sintetis sementara: ' + ('dipertahankan (--keep)' if keep else 'sudah dihapus') + ' (tests/.generated).')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
