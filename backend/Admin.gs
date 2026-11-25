/*
 * Admin.gs — dashboard peneliti. HANYA agregat (jumlah, rata-rata, sebaran); tidak pernah mengirim baris mentah atau submission_id.
 * Akses: halaman ini hanya dibuka untuk akun Google pemilik (OWNER_EMAIL, diisi otomatis oleh setup()).
 * Disajikan dari deployment TERPISAH ("Execute as: User accessing the web app"); lihat docs/DEPLOYMENT.md bagian I.
 */
function isOwner_() {
  const me = Session.getActiveUser().getEmail();
  const owner = PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL');
  return !!me && !!owner && String(me).toLowerCase() === String(owner).toLowerCase();
}

function adminPage_() {
  if (!isOwner_()) return HtmlService.createHtmlOutput('<p style="font:16px sans-serif">Akses ditolak. Dashboard hanya untuk akun Google pemilik.</p>');
  return HtmlService.createHtmlOutputFromFile('Admin').setTitle('Dashboard peneliti').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getStats() { // dipanggil dari Admin.html lewat google.script.run; identitas diperiksa pada setiap panggilan
  if (!isOwner_()) throw new Error('Akses ditolak');
  const sh = getSheet_(), last = sh.getLastRow();
  return computeStats_(last < 2 ? [] : sh.getRange(2, 1, last - 1, HEADERS.length).getValues());
}

function computeStats_(rows) {
  const recs = rows.map(function (r) { const o = {}; HEADERS.forEach(function (h, i) { o[h] = r[i]; }); return o; });
  const saved = recs.filter(function (o) { return o.save_status === 'saved'; });
  const data = saved.filter(function (o) { return !isTestRow_(o); }); // baris uji/sintetis tidak dihitung
  const count = function (k) { const c = {}; data.forEach(function (o) { const v = String(o[k]); c[v] = (c[v] || 0) + 1; }); return c; };
  const col = function (k) {
    return data.map(function (o) { return o[k]; }).filter(function (v) { return v !== '' && v !== null && isFinite(Number(v)); })
      .map(Number).sort(function (a, b) { return a - b; });
  };
  const q = function (a, p) { if (!a.length) return null; const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
  const describe = function (a) {
    const n = a.length, mean = n ? a.reduce(function (s, v) { return s + v; }, 0) / n : null;
    const sd = n > 1 ? Math.sqrt(a.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / (n - 1)) : null;
    return { n: n, min: n ? a[0] : null, q1: q(a, 0.25), median: q(a, 0.5), q3: q(a, 0.75), max: n ? a[n - 1] : null, mean: mean, sd: sd };
  };
  const items = {};
  ANSWER_KEYS.forEach(function (k) {
    if (/_other$/.test(k)) return; // teks bebas tidak pernah ditampilkan
    items[k] = (k === 'D1' || k === 'F1' || k === 'F7') ? { stats: describe(col(k)) } : { counts: count(k) };
  });
  const keyOf = function (o) { return ANSWER_KEYS.map(function (k) { return o[k]; }).join('|'); };
  const seen = {};
  data.forEach(function (o) { seen[keyOf(o)] = (seen[keyOf(o)] || 0) + 1; });
  const dur = col('duration_seconds'), days = {}, c = count('bsmas_category');
  data.forEach(function (o) { const d = String(o.timestamp).slice(0, 10); days[d] = (days[d] || 0) + 1; });
  const cats = { rendah: c.rendah || 0, sedang: c.sedang || 0, tinggi: c.tinggi || 0 };
  const minCat = Math.min(cats.rendah, cats.sedang, cats.tinggi);
  return {
    generated_at: new Date().toISOString(), site_url: SITE_URL, n: data.length, n_test_rows: saved.length - data.length,
    last_submission: data.map(function (o) { return String(o.timestamp); }).sort().pop() || null,
    by_day: Object.keys(days).sort().slice(-14).map(function (d) { return { d: d, n: days[d] }; }),
    prodi: count('D4'), angkatan: count('D3'), gender: count('D2'), language: count('language_preference'), model_status: count('model_status_at_submission'),
    bsmas: { stats: describe(col('bsmas_score')), cats: cats }, productivity: describe(col('productivity_score')),
    gate: { target: 150, min_per_class: minCat, ok: minCat >= 150 },
    quality: {
      identical_answer_rows: data.filter(function (o) { return seen[keyOf(o)] > 1; }).length,
      fast_under_60s: dur.filter(function (v) { return v < 60; }).length, median_duration_s: q(dur, 0.5),
      invalid_rows: data.filter(function (o) { return Instrument.validate(o).length > 0; }).length,
      score_mismatch: data.filter(function (o) { return Instrument.bsmasScore(o) !== Number(o.bsmas_score) || Instrument.productivityScore(o) !== Number(o.productivity_score); }).length
    },
    items: items
  };
}
