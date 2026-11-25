"""Konfigurasi pelatihan (Subbab 3.6.3). Ubah hanya dengan persetujuan peneliti."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = 42
TEST_SIZE = 0.2
CV_FOLDS = 5
PARAM_GRID = {'max_depth': [3, 4, 5, 6], 'min_samples_split': [10, 20, 40],
              'min_samples_leaf': [5, 10, 20], 'class_weight': [None, 'balanced']}
MIN_PER_CLASS = 150  # batas bawah Subbab 3.3 (di skripsi masih bertanda [KONFIRMASI])
