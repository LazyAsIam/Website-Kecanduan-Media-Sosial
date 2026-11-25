/*
 * TIDAK DIMUAT oleh index.html sejak halaman hasil diganti halaman terima kasih (fase pengumpulan data); disimpan untuk tahap sistem prediksi.
 * prediction-ui.js — panel "Estimasi model" (dahulu pada halaman hasil). Semua angka dihitung di browser dari model.json hasil ekspor
 * (model/prediction.js + model/shap-explainer.js). Gagal tertutup: bila ada ketidakcocokan, tidak ada prediksi atau penjelasan palsu.
 */
(function (root) {
  'use strict';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] === undefined ? '' : v[k]));
  const num = (lang, v, d) => Number(v).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: d });
  let cache = null, gcache = null;
  function loadGlobal(url) { // opsional: bila tidak ada atau gagal, bagian SHAP global tidak ditampilkan
    if (!gcache || gcache.url !== url) gcache = { url: url, promise: fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null) };
    return gcache.promise;
  }

  function loadModel(url) {
    if (!cache || cache.url !== url) {
      cache = { url: url, promise: fetch(url, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }) };
      cache.promise.catch(() => { cache = null; });
    }
    return cache.promise;
  }

  function valueText(T, lang, f, a) {
    if (f === 'F1' || f === 'F7') return num(lang, a[f], 1) + ' ' + T.ui.hoursUnit;
    return String(T.opt[f][a[f]]).replace(/:$/, '');
  }

  function draw(c) {
    const T = translations[c.lang], u = T.ui, cats = c.model.classes, lab = (i) => u.cat[cats[i]], best = c.pred.classIndex;
    const date = new Date(c.meta.trained_at).toLocaleDateString(c.lang === 'id' ? 'id-ID' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    let h = '<div class="pred"><p class="predcard"><span>' + esc(u.estimate) + '</span><span class="badge ' + cats[best] + '">' + esc(lab(best)) + '</span></p>' +
      '<p class="muted">' + esc(u.modelVersion) + ' ' + esc(c.meta.version) + ', ' + esc(u.trainedAt) + ' ' + esc(date) + '</p>' +
      '<h4>' + esc(u.probTitle) + '</h4>' + cats.map((k, i) => '<div class="prow"><span>' + esc(lab(i)) + '</span><div class="pbar"><i class="' + k +
        '" style="width:' + (c.pred.proba[i] * 100).toFixed(1) + '%"></i></div><b>' + num(c.lang, c.pred.proba[i] * 100, 1) + '%</b></div>').join('') +
      '<p class="muted">' + esc(u.probNote) + '</p>';
    if (c.bsmas && c.bsmas !== cats[best]) h += '<p class="notice" role="note">' + esc(u.differ) + '</p>';
    if (!c.res) { c.slot.innerHTML = h + '<p class="notice" role="alert">' + esc(u.shapFail) + '</p></div>'; return; }
    const top = root.ShapExplainer.top(c.res, c.sel, 5), mx = Math.max.apply(null, top.map((t) => Math.abs(t.value))) || 1;
    h += '<h4>' + esc(fmt(u.shapTitle, { cat: lab(c.sel) })) + '</h4><div class="segc" role="group">' + cats.map((k, i) =>
      '<button type="button" data-cls="' + i + '" aria-pressed="' + (i === c.sel) + '">' + esc(lab(i)) + '</button>').join('') + '</div><ol class="shaplist">';
    top.forEach((t) => {
      const up = t.value >= 0, bar = '<i style="width:' + (Math.abs(t.value) / mx * 100).toFixed(1) + '%"></i>';
      h += '<li data-f="' + t.feature + '" data-sign="' + (up ? 'up' : 'down') + '"><div class="sbar"><div class="l">' + (up ? '' : bar) + '</div><div class="r">' + (up ? bar : '') + '</div></div><div>' +
        esc(fmt(up ? u.shapUp : u.shapDown, { feature: T.feat[t.feature], value: valueText(T, c.lang, t.feature, c.a), cat: lab(c.sel) })) +
        ' <strong>' + (up ? '+' : '−') + num(c.lang, Math.abs(t.value) * 100, 1) + ' ' + esc(u.pts) + '</strong></div></li>';
    });
    c.slot.innerHTML = h + '</ol><p class="muted">' + esc(u.shapNote) + '</p>' + globalHtml(c) + '</div>';
  }

  // SHAP global (dihitung Python pada data uji): pengaruh rata-rata tiap fitur dan arah kontribusinya terhadap kategori "tinggi"
  function globalHtml(c) {
    const g = c.global;
    if (!g) return '';
    const T = translations[c.lang], u = T.ui, hi = 'tinggi', m = g.mean_abs.mean;
    const F = g.features.slice().sort((a, b) => m[b] - m[a]), mx = m[F[0]] || 1;
    const lab = (f, k) => String((T.opt[f] || {})[k] || k).replace(/:$/, '');
    function dir(f) {
      const d = g.direction[f];
      if (d.kind === 'ordinal') { const r = d.spearman[hi]; return r === null || Math.abs(r) < 0.1 ? u.dirNone : (r > 0 ? u.dirUp : u.dirDown); }
      const cats = Object.keys(d.mean_by_category).filter((k) => d.mean_by_category[k].n >= 5).sort((a, b) => d.mean_by_category[b][hi] - d.mean_by_category[a][hi]);
      return cats.length < 2 ? u.dirNone : fmt(u.dirNominal, { up: lab(f, cats[0]), down: lab(f, cats[cats.length - 1]) });
    }
    return '<details class="glob"><summary>' + esc(u.globalTitle) + '</summary><p class="muted">' + esc(u.globalNote) + '</p><table>' +
      F.map((f) => '<tr><td>' + esc(T.feat[f]) + '</td><td class="gb"><i style="width:' + (m[f] / mx * 100).toFixed(1) + '%"></i></td><td>' + num(c.lang, m[f] * 100, 1) + '</td></tr>').join('') +
      '</table><h4>' + esc(fmt(u.globalDirTitle, { cat: u.cat[hi] })) + '</h4><ul class="dirs">' +
      F.map((f) => '<li>' + esc(T.feat[f] + ': ' + dir(f)) + '</li>').join('') + '</ul><p class="muted">' + esc(fmt(u.globalMeta, { n: g.n_samples, v: g.version })) + '</p></details>';
  }

  // answers: jawaban ternormalisasi; meta: isi model-metadata.json; bsmas: kategori BSMAS langsung (untuk perbandingan)
  function renderPrediction(slot, answers, lang, meta, bsmas) {
    const u = translations[lang].ui, I = root.Instrument;
    slot.textContent = u.loading;
    Promise.all([loadModel((root.APP_CONFIG && root.APP_CONFIG.MODEL_URL) || 'model/model.json'),
      loadGlobal((root.APP_CONFIG && root.APP_CONFIG.GLOBAL_SHAP_URL) || 'model/global-shap.json')]).then(([model, glob]) => {
      if (meta.instrument_version !== I.VERSION || JSON.stringify(model.feature_columns) !== JSON.stringify(I.FEATURE_COLUMNS)) throw new Error('model tidak cocok dengan instrumen');
      const rt = root.ModelRuntime.create(model), vec = I.featureVector(answers), pred = rt.predict(vec), res = root.ShapExplainer.explain(model, vec);
      const ctx = { slot: slot, lang: lang, meta: meta, model: model, pred: pred, a: answers, bsmas: bsmas, sel: pred.classIndex,
        res: root.ShapExplainer.consistent(res, pred.proba) ? res : null,
        global: (glob && glob.version === meta.version && JSON.stringify(glob.classes) === JSON.stringify(model.classes)) ? glob : null };
      slot.onclick = (e) => { const b = e.target.closest('[data-cls]'); if (b) draw(Object.assign({}, ctx, { sel: Number(b.dataset.cls) })); };
      draw(ctx);
    }).catch(() => { slot.textContent = u.modelFail; });
  }
  root.renderPrediction = renderPrediction;
})(typeof globalThis !== 'undefined' ? globalThis : this);
