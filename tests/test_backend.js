'use strict';
// Jalankan dari akar proyek: node tests/test_backend.js
// Backend diuji dengan TIRUAN layanan Google (bukan Apps Script asli); klien dengan fetch/storage tiruan.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), assert = require('assert');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const C = JSON.parse(read('tests/scoring-cases.json'));
let n = 0;
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };
const ok_ = ok;

function makeBackend(opt = {}) {
  const rows = [], logs = [], state = { released: 0 };
  const sheet = {
    appendRow: r => { if (opt.failAppend) throw new Error('disk penuh'); rows.push(Array.from(r)); },
    getLastRow: () => rows.length,
    deleteRow: (k) => { rows.splice(k - 1, 1); },
    getRange: (a, b, c, d) => typeof a === 'string'
      ? { createTextFinder: id => { const f = { matchEntireCell: () => f, matchCase: () => f,
          findNext: () => { const i = rows.findIndex(r => r[0] === id); return i < 0 ? null : { getRow: () => i + 1 }; } }; return f; } }
      : { getValues: () => rows.slice(a - 1, a - 1 + c).map((r) => r.slice(b - 1, b - 1 + d)), getValue: () => rows[a - 1][b - 1] }
  };
  const ss = { getSheetByName: x => x === 'Responses' ? sheet : (x === 'Log' ? { appendRow: r => logs.push(r) } : null) };
  const ctx = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (opt.props || {})[k] || null }) },
    Session: { getActiveUser: () => ({ getEmail: () => opt.me || '' }) },
    HtmlService: { createHtmlOutput: (s) => ({ text: s }), createHtmlOutputFromFile: (f) => ({ file: f, setTitle() { return this; }, addMetaTag() { return this; } }) },
    LockService: { getScriptLock: () => ({ waitLock() { if (opt.busy) throw new Error('timeout'); }, releaseLock() { state.released++; } }) },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) },
    Utilities: { DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
      computeDigest: (a, s) => Array.from(crypto.createHash('sha256').update(s).digest()).map(b => (b > 127 ? b - 256 : b)) }
  });
  vm.runInContext(read('backend/Instrument.gs'), ctx);
  vm.runInContext(read('backend/Code.gs'), ctx);
  vm.runInContext(read('backend/Admin.gs'), ctx);
  const headers = JSON.parse(JSON.stringify(vm.runInContext('HEADERS', ctx)));
  rows.push(headers.slice());
  const post = body => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent());
  return { ctx, rows, logs, state, headers, post, get: () => JSON.parse(ctx.doGet({}).getContent()),
    stats: () => JSON.parse(JSON.stringify(ctx.getStats())), admin: () => ctx.doGet({ parameter: { page: 'admin' } }) };
}
const payload = (over = {}) => Object.assign({ submission_id: crypto.randomUUID(), consent: true, language_preference: 'id',
  duration_seconds: 240, model_status: 'not_trained', answers: Object.assign({}, C.base) }, over);
const withAnswers = patch => Object.assign({}, C.base, patch);
const errs = r => r.errors.map(e => e.field + ':' + e.code);

// ---- Backend ----
{
  const b = makeBackend(), p = payload(), r = b.post(p);
  const col = k => b.rows[1][b.headers.indexOf(k)];
  eq([r.ok, r.status, r.bsmas_score, r.bsmas_category, r.productivity_score], [true, 'saved', 13, 'rendah', 24], 'simpan valid');
  eq([b.headers.length, b.rows.length, b.rows[1].length], [42, 2, 42], 'satu baris, 42 kolom');
  eq([col('submission_id'), col('F1'), col('B3'), col('P5'), col('save_status'), col('consent')], [p.submission_id, 3.5, 2, 1, 'saved', true], 'isi kolom');
  ok(/^[0-9a-f]{64}$/.test(col('row_hash')), 'row_hash SHA-256');
  ok(!b.headers.some(h => /^(nama|nim|email|ip)$/i.test(h)), 'tanpa kolom identitas');

  const r2 = b.post(payload({ submission_id: p.submission_id, answers: withAnswers({ F1: 9 }) }));
  eq([r2.ok, r2.status, r2.bsmas_score], [true, 'duplicate', 13], 'ID ganda dibalas duplicate');
  eq([b.rows.length, col('F1')], [2, 3.5], 'tidak ada baris ganda dan baris lama tidak berubah');

  const bad = b.post(payload({ answers: withAnswers({ F1: 24, F7: 1 }) }));
  eq([bad.ok, bad.error, errs(bad)], [false, 'validation', ['F7:sum_exceeds_24']], 'TC-04 ditolak backend');
  eq(errs(b.post(payload({ answers: withAnswers({ F1: 25 }) }))), ['F1:range'], 'TC-03 ditolak backend');
  eq(errs(b.post(payload({ consent: false }))), ['consent:required'], 'tanpa persetujuan');
  eq(errs(b.post(payload({ submission_id: 'abc' }))), ['submission_id:format'], 'ID tidak valid');
  eq(errs(b.post(payload({ language_preference: 'fr' }))), ['language_preference:invalid_option'], 'bahasa tidak valid');
  eq(b.post('{').error, 'bad_request', 'JSON rusak');
  eq(b.rows.length, 2, 'permintaan tidak valid tidak menulis apa pun');

  b.post(payload({ model_status: 'ready:v1.0.0' })); b.post(payload({ model_status: '<script>' }));
  eq([b.rows[2][b.headers.indexOf('model_status_at_submission')], b.rows[3][b.headers.indexOf('model_status_at_submission')]], ['ready:v1.0.0', 'unknown'], 'status model disaring');
  const g = b.get(); eq([g.ok, Object.keys(g).includes('rows')], [true, false], 'GET tidak membuka data');
  const before = b.rows.length, dr = b.post(payload({ dry_run: true }));
  eq([dr.ok, dr.status, dr.bsmas_score, dr.instrument_version, b.rows.length], [true, 'dry_run', 13, '1.0.0', before], 'dry_run: skor dihitung, tidak menulis');
  eq(errs(b.post(payload({ dry_run: true, answers: withAnswers({ F1: 24, F7: 1 }) }))), ['F7:sum_exceeds_24'], 'dry_run tetap divalidasi');
}
// ---- Dashboard peneliti: hanya agregat, hanya pemilik ----
{
  const OWNER = 'peneliti@contoh.id', b = makeBackend({ props: { OWNER_EMAIL: OWNER }, me: OWNER });
  const B = (arr) => { const o = {}; arr.forEach((v, i) => { o['B' + (i + 1)] = v; }); return o; };
  const subs = [['s1_informatika', 2023, [3, 3, 3, 3, 3, 3]], ['s1_informatika', 2023, [4, 3, 3, 3, 3, 3]], ['s1_agribisnis', 2022, [5, 5, 5, 5, 5, 5]],
    ['d3_kebidanan', 2024, [3, 3, 3, 3, 3, 3]], ['s1_informatika', 2022, [3, 3, 3, 3, 3, 3]], ['s1_informatika', 2023, [3, 3, 3, 3, 3, 3]]]; // baris 1 dan 6 identik
  let firstId = null;
  subs.forEach(([d4, d3, bs]) => { const p = payload({ answers: withAnswers(Object.assign({ D4: d4, D3: d3 }, B(bs))) }); firstId = firstId || p.submission_id; ok_(b.post(p).ok); });
  [1, 2].forEach(() => ok_(b.post(payload({ answers: withAnswers({ D4: 'lainnya', D4_other: 'UJI' }) })).ok)); // dua baris uji
  const st = b.stats();
  eq([st.n, st.n_test_rows], [6, 2], 'baris uji (UJI) tidak dihitung');
  eq(st.prodi, { s1_informatika: 4, s1_agribisnis: 1, d3_kebidanan: 1 }, 'sebaran program studi');
  eq(st.angkatan, { 2023: 3, 2022: 2, 2024: 1 }, 'sebaran angkatan');
  eq(st.bsmas.cats, { rendah: 4, sedang: 1, tinggi: 1 }, 'kategori BSMAS');
  assert.ok(Math.abs(st.bsmas.stats.mean - 121 / 6) < 1e-9 && st.productivity.mean === 24, 'rata-rata skor'); n++;
  eq([st.quality.identical_answer_rows, st.quality.invalid_rows, st.quality.score_mismatch], [2, 0, 0], 'kualitas data');
  eq([st.items.F2.counts['3'], st.items.F1.stats.median, st.gate.ok, st.gate.min_per_class], [6, 3.5, false, 1], 'butir dan gerbang kelayakan');
  ok_(!JSON.stringify(st).includes(firstId) && !JSON.stringify(st).includes('UJI'), 'tanpa baris mentah, ID, atau teks bebas');
  fs.mkdirSync(path.join(__dirname, '.generated'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '.generated', 'admin-stats.json'), JSON.stringify(st)); // sementara, untuk tests/admin_page.js
  eq(b.admin().file, 'Admin', 'pemilik memperoleh halaman dashboard');
  ['orang@lain.id', ''].forEach((me) => {
    const x = makeBackend({ props: { OWNER_EMAIL: OWNER }, me });
    assert.throws(() => x.stats(), /Akses ditolak/); n++;
    ok_(x.admin().file === undefined && /Akses ditolak/.test(x.admin().text), 'bukan pemilik ditolak: ' + JSON.stringify(me));
  });
}
{ const b = makeBackend({ busy: true }), r = b.post(payload());
  eq([r.ok, r.error, r.retry, b.rows.length, b.state.released], [false, 'busy', true, 1, 0], 'lock sibuk -> retry, tanpa tulis'); }
{ const b = makeBackend({ failAppend: true }), r = b.post(payload());
  eq([r.ok, r.error, r.retry, b.rows.length, b.state.released], [false, 'server', true, 1, 1], 'gagal tulis -> retry, lock dilepas');
  ok(b.logs.length === 1 && !JSON.stringify(b.logs).includes('tiktok'), 'log hanya berisi galat, bukan jawaban'); }

// ---- Pembersihan baris uji: hanya yang bertanda jelas; header dan jawaban asli tidak tersentuh ----
{
  const b = makeBackend({ props: { OWNER_EMAIL: 'x@y.id' } });
  const real = [payload(), payload({ answers: withAnswers({ D4: 'lainnya', D4_other: 'Prodi Baru' }) }), payload({ answers: withAnswers({ D4: 's1_agribisnis' }) })];
  real.forEach((p) => ok_(b.post(p).ok));
  [1, 2].forEach(() => ok_(b.post(payload({ answers: withAnswers({ D4: 'lainnya', D4_other: ' uji ' }) })).ok));
  b.rows.push(b.headers.map((h) => (h === 'submission_id' ? 'SYN-00001' : ''))); // baris sintetis bertanda SYN-
  let backups = 0; b.ctx.backupNow = () => { backups++; };
  const pv = JSON.parse(JSON.stringify(b.ctx.previewTestRows()));
  eq([pv.total_data_rows, pv.test_rows, pv.kept_rows, b.rows.length], [6, 3, 3, 7], 'pratinjau: 3 baris uji (UJI x2, SYN x1) dan 3 asli; tidak mengubah apa pun');
  const del = JSON.parse(JSON.stringify(b.ctx.deleteTestRows()));
  eq([del.deleted, del.kept_rows, backups, b.rows.length], [3, 3, 1, 4], 'hapus: backup dulu, header dan 3 jawaban asli tetap');
  eq([b.rows[0][0], b.rows.slice(1).map((r) => r[0])], ['submission_id', real.map((p) => p.submission_id)], 'hanya jawaban asli yang tersisa, termasuk "Lainnya" bukan UJI');
  eq(JSON.parse(JSON.stringify(b.ctx.deleteTestRows())).deleted, 0, 'idempoten: tidak ada lagi yang dihapus');
  const c = makeBackend({ props: {} });
  ok_(c.post(payload({ answers: withAnswers({ D4: 'lainnya', D4_other: 'UJI' }) })).ok); ok_(c.post(payload()).ok);
  c.ctx.backupNow = () => { throw new Error('Drive tidak tersedia'); };
  assert.throws(() => c.ctx.deleteTestRows(), /Drive/); n++;
  eq(c.rows.length, 3, 'backup gagal: tidak ada baris yang dihapus');
}

// ---- Klien pengiriman ----
const { createSubmitter } = require(path.join(root, 'submit.js'));
const mem = () => { const s = {}; return { s, getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = v; }, removeItem: k => { delete s[k]; } }; };
const resp = (data, httpOk = true) => ({ ok: httpOk, status: httpOk ? 200 : 500, json: async () => data });
function client(script, extra = {}) {
  const calls = [], sleeps = [], storage = mem();
  const fetch = async (url, init) => { calls.push(init); const step = script.shift(); if (step instanceof Error) throw step; return step; };
  const s = createSubmitter(Object.assign({ url: 'https://contoh.test/exec', storage, fetch, random: () => 0.5, maxAttempts: 4,
    sleep: async ms => { sleeps.push(ms); } }, extra));
  return { s, calls, sleeps, storage };
}
const meta = { language: 'id', durationSeconds: 200, modelStatus: 'not_trained' };
const ids = calls => calls.map(c => JSON.parse(c.body).submission_id);

(async () => {
  let t = client([resp({ ok: true, status: 'saved' })]);
  let res = await t.s.send(t.s.buildPayload(C.base, meta));
  eq([res.status, t.calls.length, Object.keys(t.storage.s).length, t.calls[0].headers['Content-Type']], ['saved', 1, 0, 'text/plain;charset=utf-8'], 'sukses langsung; tanpa preflight; antrean bersih');

  t = client([new Error('offline'), new Error('timeout'), resp({ ok: true, status: 'saved' })]);
  res = await t.s.send(t.s.buildPayload(C.base, meta));
  eq([res.ok, t.calls.length, new Set(ids(t.calls)).size, t.sleeps], [true, 3, 1, [1000, 2000]], 'retry dengan ID sama dan backoff');

  t = client([resp({ ok: false, error: 'busy', retry: true }), resp({}, false), resp({ ok: true, status: 'duplicate' })]);
  res = await t.s.send(t.s.buildPayload(C.base, meta));
  eq([res.ok, res.status, t.calls.length], [true, 'duplicate', 3], 'busy/HTTP 500 diulang; duplicate dianggap sukses');

  t = client([resp({ ok: false, error: 'validation', errors: [{ field: 'F1', code: 'range' }] })]);
  res = await t.s.send(t.s.buildPayload(C.base, meta));
  eq([res.error, t.calls.length, Object.keys(t.storage.s).length], ['validation', 1, 0], 'validasi gagal: tidak diulang');

  t = client([1, 2, 3, 4].map(() => new Error('offline')));
  const p = t.s.buildPayload(C.base, meta);
  res = await t.s.send(p);
  eq([res.error, t.s.pending().submission_id, t.sleeps.length], ['pending', p.submission_id, 3], 'semua percobaan gagal: jawaban tetap di antrean');
  const t2 = client([resp({ ok: true, status: 'saved' })], { storage: t.storage });
  res = await t2.s.resume();
  eq([res.ok, ids(t2.calls)[0], t2.s.pending()], [true, p.submission_id, null], 'resume memakai ID semula lalu membersihkan antrean');

  console.log('Backend + klien: ' + n + ' pemeriksaan lulus');
})().catch(e => { console.error(e); process.exit(1); });
