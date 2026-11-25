/*
 * script.js — alur formulir. State disimpan di memori dan halaman dirender dari state, sehingga ganti
 * bahasa/tema tidak menghapus jawaban. Validasi memakai Instrument (sumber yang sama dengan backend).
 */
(function () {
  'use strict';
  const I = Instrument, CFG = window.APP_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const app = $('#app');
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* abaikan */ } }
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => (v[k] === undefined ? '' : v[k]));
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  const STEPS = [
    { id: 'consent' },
    { id: 'screening', items: ['S1', 'S2', 'S3'] },
    { id: 'demo', items: ['D1', 'D2', 'D3', 'D4'] },
    { id: 'habits', items: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7'] },
    { id: 'bsmas', items: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'] },
    { id: 'prod', items: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'] },
    { id: 'review' }
  ];
  const KIND = { D1: 'num', D3: 'num', F1: 'num', F7: 'num', F2: 'code', F5: 'code', F6: 'code', P1: 'code' };
  const kind = (k) => KIND[k] || (/^[BP]\d$/.test(k) ? 'likert' : 'opt');
  const retry = {}; // kebijakan percobaan ulang dapat diatur di config.js (bawaan: 6 percobaan, jeda awal 1000 ms)
  if (CFG.SUBMIT_MAX_ATTEMPTS) retry.maxAttempts = CFG.SUBMIT_MAX_ATTEMPTS;
  if (CFG.SUBMIT_BASE_DELAY_MS) retry.baseDelayMs = CFG.SUBMIT_BASE_DELAY_MS;
  const submitter = Submitter.createSubmitter(Object.assign({ url: CFG.BACKEND_URL || '' }, retry));
  const state = { lang: store.get('lang') === 'en' ? 'en' : 'id', step: 0, phase: 'form', consent: false,
    answers: {}, errors: {}, notice: '', payload: null, save: 'saving', busy: false, model: null, t0: Date.now() };
  const T = () => translations[state.lang];
  const baseKey = (f) => f.replace('_other', '');
  const errMsg = (e) => (e ? fmt(T().err[e.code], e.vars || {}) : ''); // galat disimpan sebagai kode, diterjemahkan saat render

  // ---------- render ----------
  function renderItem(k) {
    const t = T(), a = state.answers, kd = kind(k);
    const err = errMsg(state.errors[k] || state.errors[k + '_other']);
    let body;
    if (kd === 'num') {
      body = '<div class="numrow"><input class="num" id="i-' + k + '" data-k="' + k + '" inputmode="' + (k === 'F1' || k === 'F7' ? 'decimal' : 'numeric') +
        '" autocomplete="off" aria-describedby="e-' + k + '" value="' + esc(a[k] === undefined ? '' : a[k]) + '"><span>' + esc(t.unit[k]) + '</span></div>';
    } else {
      const vals = kd === 'opt' ? I.OPTIONS[k] : range(1, kd === 'likert' ? 5 : I.INT_SCALE[k]);
      const labels = kd === 'likert' ? t.opt.likert : t.opt[k];
      const numbered = kd === 'likert' || k === 'F5';
      body = '<div class="opts' + (kd === 'likert' ? ' likert' : '') + '">' + vals.map((v) =>
        '<label class="opt"><input type="radio" name="' + k + '" data-k="' + k + '" value="' + v + '"' + (String(a[k]) === String(v) ? ' checked' : '') + '>' +
        (numbered ? '<span class="n">' + v + '</span>' : '') + '<span>' + esc(labels[v]) + '</span></label>').join('') + '</div>';
      if (kd === 'opt' && a[k] === 'lainnya' && /^(D4|F3|F4)$/.test(k)) {
        body += '<input class="other" data-k="' + k + '_other" maxlength="' + I.LIMITS.OTHER_MAX + '" autocomplete="off" aria-label="' +
          esc(labels.lainnya) + '" placeholder="' + esc(t.ui.otherPh) + '" value="' + esc(a[k + '_other'] || '') + '">';
      }
    }
    return '<fieldset class="q' + (err ? ' bad' : '') + '" id="f-' + k + '"><legend><span class="code">' + k + '</span>' + esc(t.items[k]) +
      '</legend>' + body + '<p class="err" id="e-' + k + '" role="alert">' + esc(err) + '</p></fieldset>';
  }

  function consentHtml() {
    const u = T().ui;
    return '<p class="muted"><em>' + esc(u.fullTitle) + '</em></p>' + u.consent.map((p) => '<p>' + esc(p) + '</p>').join('') +
      (CFG.RESEARCHER_CONTACT ? '<p>' + esc(fmt(u.contact, { c: CFG.RESEARCHER_CONTACT })) + '</p>' : '') +
      '<label class="opt"><input type="checkbox" id="consent"' + (state.consent ? ' checked' : '') + '><span>' + esc(u.consentCheck) + '</span></label>' +
      '<p class="err" role="alert">' + esc(errMsg(state.errors.consent)) + '</p>';
  }

  function navHtml(s) {
    const u = T().ui, last = s.id === 'review';
    const back = (state.step > 0 && !(last && state.payload)) ? '<button type="button" class="btn ghost" data-act="back">' + esc(u.back) + '</button>' : '<span></span>';
    const fwd = last ? '<button type="button" class="btn" data-act="send">' + esc(state.payload ? u.retry : u.send) + '</button>'
      : '<button type="button" class="btn" data-act="next">' + esc(u.next) + '</button>';
    return '<div class="nav">' + back + fwd + '</div>';
  }

  function renderForm() {
    const t = T(), s = STEPS[state.step], sec = t.sections[s.id];
    let h = '<div class="card">' + (state.notice ? '<p class="notice" role="status">' + esc(state.notice) + '</p>' : '') +
      '<h2 id="stepTitle" tabindex="-1">' + esc(sec.title) + '</h2>' + (sec.note ? '<p class="muted">' + esc(sec.note) + '</p>' : '');
    if (s.id === 'consent') h += consentHtml();
    else if (s.id === 'review') h += '<p>' + esc(t.ui.reviewBody) + '</p>';
    else h += (sec.intro ? '<p class="intro">' + esc(sec.intro) + '</p>' : '') + s.items.map(renderItem).join('');
    app.innerHTML = h + navHtml(s) + '</div>';
  }

  // Halaman setelah menekan Kirim: hanya ucapan terima kasih dan status penyimpanan (tanpa skor, hasil klasifikasi, atau grafik).
  // Animasi memuat hanya tampil selama penyimpanan benar-benar berlangsung; tidak ada klaim bahwa model dilatih ulang.
  function renderThanks() {
    const u = T().ui, st = state.save;
    const tick = '<svg class="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>';
    let h;
    if (st === 'error') {
      h = '<h2 id="stepTitle" tabindex="-1">' + esc(u.saveFailTitle) + '</h2><p class="notice fail" role="alert">' + esc(u.saveFail) + '</p>' +
        '<div class="nav"><span></span><button type="button" class="btn" data-act="retry">' + esc(u.retry) + '</button></div>';
    } else {
      h = '<h2 id="stepTitle" tabindex="-1">' + esc(u.thanksTitle) + '</h2><p>' + esc(u.thanksP1) + '</p>' + (st === 'saving'
        ? '<p>' + esc(u.thanksWait) + '</p><div class="saving" role="status"><span class="spinner" aria-hidden="true"></span><span>' + esc(u.saving) + '</span></div>'
        : '<p class="saved" role="status">' + tick + '<strong>' + esc(u.thanksSaved) + '</strong></p>');
    }
    app.innerHTML = '<div class="card thanks">' + h + '</div>';
  }

  function render() {
    const u = T().ui, inForm = state.phase === 'form';
    document.documentElement.lang = state.lang;
    document.title = u.siteTitle;
    $('#siteTitle').textContent = u.siteTitle;
    $('#themeBtn').setAttribute('aria-label', u.themeLabel);
    $('#themeBtn').title = u.themeLabel;
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang)));
    $('#langNote').textContent = u.enNotice;
    $('#footer').textContent = u.footer;
    $('#progress').hidden = !inForm;
    if (inForm) {
      $('#stepLabel').textContent = fmt(u.progress, { n: state.step + 1, total: STEPS.length });
      $('#barFill').style.width = (state.step / (STEPS.length - 1)) * 100 + '%';
      renderForm();
    } else if (state.phase === 'ineligible') {
      app.innerHTML = '<div class="card"><h2 id="stepTitle" tabindex="-1">' + esc(u.ineligibleTitle) + '</h2><p>' + esc(u.ineligibleBody) +
        '</p><div class="nav"><span></span><button type="button" class="btn ghost" data-act="rescreen">' + esc(u.rescreen) + '</button></div></div>';
    } else renderThanks();
  }
  function show() { render(); window.scrollTo(0, 0); const h = $('#stepTitle'); if (h) h.focus({ preventScroll: true }); }

  // ---------- validasi dan alur ----------
  function check(keys) {
    const t = T(), L = I.LIMITS, out = {};
    I.validate(I.normalize(state.answers)).forEach((e) => {
      const b = baseKey(e.field);
      if (keys.indexOf(b) < 0 || e.code === 'screening_failed') return;
      const lim = b === 'D1' ? L.D1 : (b === 'D3' ? L.D3 : L.HOURS);
      out[e.field] = { code: t.err[e.code] ? e.code : 'format', vars: { lo: lim[0], hi: lim[1], max: L.OTHER_MAX } };
    });
    return out;
  }

  function next() {
    const s = STEPS[state.step];
    state.notice = '';
    if (s.id === 'consent') {
      if (!state.consent) { state.errors = { consent: { code: 'consent' } }; return render(); }
      state.errors = {}; state.t0 = Date.now(); state.step++; return show();
    }
    if (s.id === 'screening' && I.validate(I.normalize(state.answers)).some((e) => e.code === 'screening_failed')) { state.phase = 'ineligible'; return show(); }
    state.errors = check(s.items);
    if (Object.keys(state.errors).length) { render(); const f = $('.bad'); if (f) f.scrollIntoView({ block: 'center' }); return; }
    state.step++; show();
  }

  function modelStatus() {
    const m = state.model;
    return m && m.status ? m.status + (m.version ? ':' + m.version : '') : 'not_trained';
  }

  async function send() {
    const errs = I.validate(I.normalize(state.answers));
    if (errs.length) { // seharusnya tidak terjadi; kembali ke bagian yang bermasalah
      const i = STEPS.findIndex((s) => s.items && s.items.indexOf(baseKey(errs[0].field)) >= 0);
      state.step = Math.max(1, i); state.errors = check(STEPS[state.step].items); return show();
    }
    if (!CFG.BACKEND_URL) { state.notice = T().ui.noBackend; return render(); }
    if (!state.payload) {
      state.payload = submitter.buildPayload(I.normalize(state.answers),
        { language: state.lang, durationSeconds: Math.round((Date.now() - state.t0) / 1000), modelStatus: modelStatus() });
    }
    if (state.busy) return;
    state.busy = true; state.phase = 'thanks'; state.save = 'saving'; show();
    const res = await submitter.send(state.payload);
    state.busy = false;
    if (res.ok) { state.payload = null; state.save = 'saved'; return show(); } // 'saved' atau 'duplicate': keduanya berarti sudah tersimpan
    if (res.error === 'validation' || res.error === 'bad_request') {
      state.payload = null; state.phase = 'form'; state.step = STEPS.length - 1; state.notice = T().ui.validationFail; return show();
    }
    state.save = 'error'; show(); // jawaban tetap di antrean lokal; "Coba kirim ulang" memakai submission_id yang sama
  }

  function act(a) {
    if (a === 'back') { state.notice = ''; state.errors = {}; state.step--; return show(); }
    if (a === 'next') return next();
    if (a === 'send' || a === 'retry') return send();
    if (a === 'rescreen') { state.phase = 'form'; state.step = 1; return show(); }
  }

  // ---------- peristiwa ----------
  function refreshItem(k) {
    const old = $('#f-' + k);
    if (old) old.outerHTML = renderItem(k);
    const o = $('#f-' + k + ' .other');
    if (o) o.focus();
  }
  function clearErr(k) { // F1 dan F7 saling terkait (galat jumlah 24 jam), jadi dibersihkan bersama
    (k === 'F1' || k === 'F7' ? ['F1', 'F7'] : [baseKey(k)]).forEach((x) => {
      delete state.errors[x]; delete state.errors[x + '_other'];
      const m = $('#e-' + x); if (m) m.textContent = '';
      const f = $('#f-' + x); if (f) f.classList.remove('bad');
    });
  }
  app.addEventListener('input', (e) => { const k = e.target.dataset && e.target.dataset.k; if (k) { state.answers[k] = e.target.value; clearErr(k); } });
  app.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'consent') { state.consent = el.checked; return; }
    const k = el.dataset && el.dataset.k;
    if (!k || el.type !== 'radio') return;
    state.answers[k] = el.value;
    delete state.errors[k];
    if (/^(D4|F3|F4)$/.test(k)) refreshItem(k);
    else { const m = $('#e-' + k); if (m) m.textContent = ''; const f = $('#f-' + k); if (f) f.classList.remove('bad'); }
  });
  app.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act); });

  document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
    state.lang = b.dataset.lang; store.set('lang', state.lang); render();
  }));
  const setTheme = (t, manual) => { document.documentElement.dataset.theme = t; if (manual) store.set('theme', t); };
  $('#themeBtn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true));
  if (window.matchMedia) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => { if (!store.get('theme')) setTheme(e.matches ? 'dark' : 'light', false); });
  }

  window.addEventListener('beforeunload', (e) => { // jangan tutup halaman selama jawaban sedang disimpan
    if (state.phase === 'thanks' && state.save === 'saving') { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- mulai ----------
  const pend = submitter.pending(); // jawaban dari sesi sebelumnya yang belum terkonfirmasi
  if (pend && pend.answers) {
    state.payload = pend; state.answers = Object.assign({}, pend.answers); state.consent = true;
    state.step = STEPS.length - 1; state.notice = T().ui.resumeBanner;
  }
  render();
  if (CFG.MODEL_METADATA_URL) {
    fetch(CFG.MODEL_METADATA_URL, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
      .then((m) => { if (m && m.status) state.model = m; }).catch(() => { /* status model tetap "belum dilatih" */ });
  }
})();
