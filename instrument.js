/*
 * instrument.js — SUMBER TUNGGAL instrumen penelitian (Tabel 3.4–3.8 skripsi).
 * Berkas yang sama dipakai di browser (<script>), Node (uji), dan Apps Script
 * (salin persis sebagai backend/Instrument.gs; tests/ memeriksa keduanya identik).
 * Hanya memuat struktur, kode, rentang, dan aturan skor. Redaksi butir ada di
 * translations.js. Jangan ubah tanpa persetujuan peneliti.
 */
(function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const CATEGORIES = ['rendah', 'sedang', 'tinggi']; // indeks kelas model: 0, 1, 2
  const LIMITS = { D1: [16, 60], D3: [2015, 2026], HOURS: [0, 24], OTHER_MAX: 100 };
  const MAX_HOURS_SUM = 24; // F1 + F7 (Subbab 3.6.1, KF-03, TC-04)

  const OPTIONS = {
    S1: ['ya', 'tidak'], S2: ['ya', 'tidak'], S3: ['belum', 'sudah'],
    D2: ['laki_laki', 'perempuan', 'tidak_menjawab'],
    D4: ['s1_kewirausahaan', 's1_bisnis_digital', 's1_informatika', 'd3_kebidanan',
         's1_agribisnis', 's1_manajemen_hutan', 'lainnya'],
    F3: ['instagram', 'tiktok', 'whatsapp', 'youtube', 'facebook', 'x', 'lainnya'],
    F4: ['hiburan', 'komunikasi', 'informasi', 'belajar_tugas', 'konten_berjualan', 'lainnya']
  };
  const PASS = { S1: 'ya', S2: 'ya', S3: 'belum' }; // jawaban yang boleh melanjutkan
  // Kode bulat 1..n: F2, F5 (1-5), F6 (1-3), P1 (kategori jam belajar 1-5), B1-B6 dan P2-P7 (Likert 1-5)
  const INT_SCALE = { F2: 5, F5: 5, F6: 3, P1: 5 };
  ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']
    .forEach(function (k) { INT_SCALE[k] = 5; });

  // 18 kolom fitur, urutan Tabel 3.6: F1, F2, F3 (7 one-hot), F4 (6 one-hot), F5, F6, F7
  const FEATURE_COLUMNS = ['F1_durasi_jam', 'F2_frekuensi_buka']
    .concat(OPTIONS.F3.map(function (v) { return 'F3_' + v; }),
            OPTIONS.F4.map(function (v) { return 'F4_' + v; }),
            ['F5_menjelang_tidur', 'F6_notifikasi', 'F7_jam_tidur']);
  const FEATURE_GROUP = {}; // kolom -> fitur asal (untuk penjumlahan SHAP one-hot)
  FEATURE_COLUMNS.forEach(function (c) { FEATURE_GROUP[c] = c.slice(0, 2); });

  function isBlank(v) {
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  }

  // Menerima "3,5" maupun "3.5". Selain angka -> NaN.
  function toNumber(v) {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return NaN;
    const s = v.trim().replace(',', '.');
    return /^[+-]?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  }

  // Salinan bersih untuk dikirim/disimpan: angka menjadi number, teks di-trim,
  // isian "Lainnya" dibuang bila pilihan bukan "lainnya".
  function normalize(a) {
    const out = {};
    Object.keys(a).forEach(function (k) { out[k] = typeof a[k] === 'string' ? a[k].trim() : a[k]; });
    ['D1', 'D3', 'F1', 'F7'].concat(Object.keys(INT_SCALE)).forEach(function (k) {
      if (!isBlank(a[k])) { const n = toNumber(a[k]); if (Number.isFinite(n)) out[k] = n; }
    });
    ['D4', 'F3', 'F4'].forEach(function (k) { if (out[k] !== 'lainnya') delete out[k + '_other']; });
    return out;
  }

  // Mengembalikan [{field, code}]. Kode: required, format, range, invalid_option,
  // screening_failed, other_required, too_long, sum_exceeds_24 (dilaporkan pada F7).
  function validate(raw) {
    const a = raw || {}, errs = [];
    const add = function (field, code) { errs.push({ field: field, code: code }); };
    const num = function (k, lo, hi, integer) {
      if (isBlank(a[k])) { add(k, 'required'); return NaN; }
      const n = toNumber(a[k]);
      if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) { add(k, 'format'); return NaN; }
      if (n < lo || n > hi) { add(k, 'range'); return NaN; }
      return n;
    };
    Object.keys(PASS).forEach(function (k) {
      if (isBlank(a[k])) add(k, 'required');
      else if (OPTIONS[k].indexOf(a[k]) < 0) add(k, 'invalid_option');
      else if (a[k] !== PASS[k]) add(k, 'screening_failed');
    });
    ['D2', 'D4', 'F3', 'F4'].forEach(function (k) {
      if (isBlank(a[k])) { add(k, 'required'); return; }
      if (OPTIONS[k].indexOf(a[k]) < 0) { add(k, 'invalid_option'); return; }
      if (a[k] === 'lainnya') {
        const o = a[k + '_other'];
        if (isBlank(o)) add(k + '_other', 'other_required');
        else if (String(o).trim().length > LIMITS.OTHER_MAX) add(k + '_other', 'too_long');
      }
    });
    num('D1', LIMITS.D1[0], LIMITS.D1[1], true);
    num('D3', LIMITS.D3[0], LIMITS.D3[1], true);
    const f1 = num('F1', LIMITS.HOURS[0], LIMITS.HOURS[1], false);
    const f7 = num('F7', LIMITS.HOURS[0], LIMITS.HOURS[1], false);
    if (Number.isFinite(f1) && Number.isFinite(f7) && f1 + f7 > MAX_HOURS_SUM + 1e-9) add('F7', 'sum_exceeds_24');
    Object.keys(INT_SCALE).forEach(function (k) { num(k, 1, INT_SCALE[k], true); });
    return errs;
  }

  function bsmasScore(a) {
    return ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'].reduce(function (s, k) { return s + Number(a[k]); }, 0);
  }
  // Tabel 3.4: rendah 6-18, sedang 19-23, tinggi 24-30
  function bsmasCategory(score) { return score <= 18 ? 'rendah' : (score <= 23 ? 'sedang' : 'tinggi'); }
  // Tabel 3.7: P1 + P2 + P3 + P4 + (6-P5) + (6-P6) + (6-P7), rentang 7-35
  function productivityScore(a) {
    const p = function (k) { return Number(a[k]); };
    return p('P1') + p('P2') + p('P3') + p('P4') + (6 - p('P5')) + (6 - p('P6')) + (6 - p('P7'));
  }
  // Vektor 18 kolom sesuai FEATURE_COLUMNS (masukan model; a harus sudah valid)
  function featureVector(a) {
    const hot = function (k) { return OPTIONS[k].map(function (v) { return a[k] === v ? 1 : 0; }); };
    return [toNumber(a.F1), Number(a.F2)].concat(hot('F3'), hot('F4'),
      [Number(a.F5), Number(a.F6), toNumber(a.F7)]);
  }

  const api = {
    VERSION: VERSION, CATEGORIES: CATEGORIES, LIMITS: LIMITS, OPTIONS: OPTIONS, PASS: PASS,
    INT_SCALE: INT_SCALE, FEATURE_COLUMNS: FEATURE_COLUMNS, FEATURE_GROUP: FEATURE_GROUP,
    toNumber: toNumber, normalize: normalize, validate: validate, bsmasScore: bsmasScore,
    bsmasCategory: bsmasCategory, productivityScore: productivityScore, featureVector: featureVector
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Instrument = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
