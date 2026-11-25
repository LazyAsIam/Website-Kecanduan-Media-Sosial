'use strict';
// NODE_PATH=/opt/npm-tools/node_modules node tests/ui_smoke.js
// Alur penuh di Chromium dengan backend TIRUAN (page.route): formulir, validasi, Light/Dark, ID/EN, dan halaman terima kasih setelah mengirim.
const path = require('path'), fs = require('fs');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('UI dilewati: Playwright tidak tersedia'); process.exit(0); }
const root = path.join(__dirname, '..'), shot = process.env.SHOTS || '/tmp';
const TR = require(path.join(root, 'translations.js')), ID = TR.id.ui, EN = TR.en.ui;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const RESULT_WORDS = /skor|bsmas|estimasi|penting:|shap|decision tree|probabilitas|produktivitas|score|estimate|important:|probabilit|productivity/i;
const RESULT_CATS = /\b(Rendah|Sedang|Tinggi|Low|Moderate|High)\b/;

(async () => {
  let browser; try { browser = await chromium.launch(); } catch (e) { console.log('UI dilewati: Chromium tidak tersedia'); process.exit(0); }
  const srv = require('http').createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const site = 'http://127.0.0.1:' + srv.address().port;
  let n = 0; const ok = (c, m) => { if (!c) throw new Error('GAGAL: ' + m); n++; };
  const modelRequests = [];

  // plan: perilaku backend tiruan per permintaan: 'ok' | 'fail' (galat 500, tidak tersimpan) | 'lost' (tersimpan, tetapi balasan hilang)
  async function newPage(o) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: o.scheme || 'light' });
    const page = await context.newPage(), t = { page, context, errors: [], bodies: [], stored: new Set() };
    page.on('pageerror', (e) => t.errors.push(String(e)));
    page.on('request', (r) => { if (/\/model\/(model|global-shap)\.json/.test(r.url())) modelRequests.push(r.url()); });
    const cfg = Object.assign({ BACKEND_URL: 'https://contoh.test/exec', MODEL_METADATA_URL: 'model/model-metadata.json' }, o.cfg || {});
    await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.APP_CONFIG=' + JSON.stringify(cfg) + ';' }));
    if (o.ready) await page.route('**/model/model-metadata.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ready', version: '9.9.9', instrument_version: '1.0.0', trained_at: '2026-11-01T00:00:00+00:00' }) }));
    await page.route('https://contoh.test/exec', (r) => {
      const body = JSON.parse(r.request().postData()); t.bodies.push(body);
      const mode = (o.plan || [])[t.bodies.length - 1] || 'ok', h = { 'access-control-allow-origin': '*' };
      if (mode === 'fail') return r.fulfill({ status: 500, headers: h, body: '{}' });
      const dup = t.stored.has(body.submission_id); t.stored.add(body.submission_id);
      if (mode === 'lost') return r.fulfill({ status: 500, headers: h, body: '{}' });
      r.fulfill({ headers: h, contentType: 'application/json', body: JSON.stringify({ ok: true, status: dup ? 'duplicate' : 'saved', bsmas_score: 13, bsmas_category: 'rendah', productivity_score: 24 }) });
    });
    await page.goto(site + '/index.html');
    return t;
  }
  const next = (p) => p.click('[data-act="next"]'), radio = (p, k, v) => p.check('input[name="' + k + '"][value="' + v + '"]');
  async function fill(p, deep) {
    if (deep) { await next(p); ok((await p.textContent('.err')).length > 5, 'tanpa persetujuan tidak lanjut'); }
    await p.check('#consent'); await next(p);
    await radio(p, 'S1', 'ya'); await radio(p, 'S2', 'ya'); await radio(p, 'S3', 'belum'); await next(p);
    await p.fill('#i-D1', '20'); await radio(p, 'D2', 'perempuan'); await p.fill('#i-D3', '2023'); await radio(p, 'D4', 's1_informatika'); await next(p);
    await radio(p, 'F2', 3); await radio(p, 'F3', 'tiktok'); await radio(p, 'F4', 'hiburan'); await radio(p, 'F5', 4); await radio(p, 'F6', 2);
    if (deep) {
      await p.fill('#i-F1', '24'); await p.fill('#i-F7', '1'); await next(p);
      ok((await p.textContent('#e-F7')).length > 5, 'TC-04: durasi + tidur lebih dari 24 jam ditolak');
      await p.click('[data-lang="en"]'); ok((await p.textContent('#e-F7')).includes('cannot exceed'), 'pesan galat ikut berganti bahasa'); await p.click('[data-lang="id"]');
      await p.fill('#i-F1', '3,5'); ok((await p.textContent('#e-F7')) === '', 'galat hilang setelah diperbaiki'); await p.fill('#i-F7', '6,5');
      await p.click('[data-lang="en"]'); await p.click('#themeBtn');
      ok((await p.inputValue('#i-F1')) === '3,5' && await p.isChecked('input[name="F3"][value="tiktok"]'), 'jawaban bertahan saat ganti bahasa dan tema');
      await p.click('[data-lang="id"]'); await p.click('#themeBtn');
    } else { await p.fill('#i-F1', '3,5'); await p.fill('#i-F7', '6,5'); }
    await next(p);
    for (let i = 1; i <= 6; i++) await radio(p, 'B' + i, [3, 3, 2, 2, 1, 2][i - 1]);
    await next(p);
    const P = [3, 4, 2, 5, 1, 2, 5]; for (let i = 1; i <= 7; i++) await radio(p, 'P' + i, P[i - 1]);
    await next(p);
  }
  async function noResult(p, m) {
    const txt = await p.textContent('#app');
    ok(!RESULT_WORDS.test(txt) && !RESULT_CATS.test(txt), m + ': tanpa skor atau hasil klasifikasi');
    ok((await p.$$('#app svg')).length <= 1 && (await p.$$('#app .meter, #app .pred, #app .badge, #app .shaplist, #app canvas, #app table')).length === 0, m + ': tanpa grafik atau tabel');
  }
  const bg = (p) => p.evaluate(() => getComputedStyle(document.querySelector('.thanks')).backgroundColor);

  try {
    // A. Indonesia, Light: alur penuh + retry otomatis setelah satu kegagalan
    let t = await newPage({ plan: ['fail', 'ok'] }), p = t.page;
    const app = () => p.textContent('#app');
    await fill(p, true);
    await p.click('[data-act="send"]');
    await p.waitForSelector('.thanks .spinner');
    ok((await p.textContent('.thanks h2')) === ID.thanksTitle && (await app()).includes(ID.thanksP1) && (await app()).includes(ID.thanksWait), 'menyimpan: judul, ucapan terima kasih, dan permintaan menunggu (ID)');
    ok(await p.isVisible('.thanks .spinner') && !(await p.isVisible('[data-act="retry"]')) && (await p.$$('[data-act="send"]')).length === 0, 'indikator proses tampil; tidak ada tombol kirim ganda');
    await p.screenshot({ path: shot + '/ui-thanks-saving-light-id.png' });
    await p.waitForSelector('.thanks .saved', { timeout: 15000 });
    ok((await p.textContent('.thanks .saved')).includes(ID.thanksSaved) && !(await app()).includes(ID.thanksWait) && (await p.$$('.thanks .spinner')).length === 0, 'tersimpan: pesan berhasil tampil; loading dan permintaan menunggu hilang');
    await noResult(p, 'ID');
    ok(t.bodies.length === 2 && t.bodies[0].submission_id === t.bodies[1].submission_id && t.stored.size === 1, 'retry otomatis memakai ID yang sama; tersimpan satu kali');
    ok(t.bodies[1].answers.F1 === 3.5 && t.bodies[1].language_preference === 'id' && t.bodies[1].consent === true, 'data yang dikirim benar (3,5 menjadi 3.5)');
    const bgLight = await bg(p);
    await p.waitForFunction(() => getComputedStyle(document.querySelector('.tick')).opacity === '1'); // animasi selesai
    ok(await p.isVisible('.tick'), 'ikon berhasil tampil penuh (Light)');
    await p.screenshot({ path: shot + '/ui-thanks-saved-light-id.png' });
    ok(t.errors.length === 0, 'tanpa galat JavaScript (A): ' + t.errors.join(' | '));
    await t.context.close();

    // B. English, Dark (mengikuti sistem): dua kegagalan -> pesan galat + tombol coba lagi -> tersimpan sekali
    t = await newPage({ plan: ['fail', 'fail', 'ok'], cfg: { SUBMIT_MAX_ATTEMPTS: 2, SUBMIT_BASE_DELAY_MS: 1500 }, scheme: 'dark' }); p = t.page;
    ok((await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'mengikuti tema sistem (gelap)');
    await p.click('[data-lang="en"]'); await fill(p, false);
    await p.click('[data-act="send"]'); await p.waitForSelector('.thanks .spinner');
    ok((await p.textContent('.thanks h2')) === EN.thanksTitle && (await app()).includes(EN.thanksWait), 'menyimpan dalam English');
    await p.click('[data-lang="id"]');
    ok((await p.textContent('.thanks h2')) === ID.thanksTitle && await p.isVisible('.thanks .spinner'), 'ganti bahasa saat menyimpan: tampilan berganti, proses berlanjut');
    await p.click('[data-lang="en"]');
    await p.waitForSelector('[data-act="retry"]', { timeout: 20000 });
    ok((await p.textContent('.thanks h2')) === EN.saveFailTitle && (await app()).includes(EN.saveFail) && t.stored.size === 0 && t.bodies.length === 2, 'gagal: pesan jelas dan tombol coba lagi; belum ada yang tersimpan');
    ok((await p.$eval('.notice.fail', (e) => getComputedStyle(e).color)) !== (await p.$eval('.notice.fail', (e) => getComputedStyle(e).borderLeftColor)), 'teks pesan galat memakai warna teks biasa; hanya garis tepi berwarna galat');
    await p.screenshot({ path: shot + '/ui-thanks-error-dark-en.png' });
    await p.click('[data-act="retry"]'); await p.waitForSelector('.thanks .saved', { timeout: 15000 });
    ok((await p.textContent('.thanks .saved')).includes(EN.thanksSaved) && (await p.textContent('.thanks h2')) === EN.thanksTitle, 'tersimpan (EN)');
    ok(t.bodies.length === 3 && new Set(t.bodies.map((b) => b.submission_id)).size === 1 && t.stored.size === 1, 'coba lagi: ID sama, tersimpan satu kali');
    await noResult(p, 'EN');
    ok((await bg(p)) !== bgLight, 'halaman terima kasih mengikuti Light/Dark Mode');
    await p.waitForFunction(() => getComputedStyle(document.querySelector('.tick')).opacity === '1');
    ok((await p.$eval('.saved', (e) => getComputedStyle(e).color)) !== 'rgb(255, 138, 128)', 'teks status tidak berwarna galat');
    await p.screenshot({ path: shot + '/ui-thanks-saved-dark-en.png' });
    ok(t.errors.length === 0, 'tanpa galat JavaScript (B): ' + t.errors.join(' | '));
    await t.context.close();

    // C. Balasan hilang (data sudah tersimpan): percobaan ulang tidak membuat data ganda; model berstatus siap tidak ditampilkan
    t = await newPage({ plan: ['lost'], cfg: { SUBMIT_MAX_ATTEMPTS: 3, SUBMIT_BASE_DELAY_MS: 100 }, ready: true }); p = t.page;
    await fill(p, false); await p.click('[data-act="send"]'); await p.waitForSelector('.thanks .saved', { timeout: 15000 });
    ok(t.bodies.length === 2 && t.bodies[0].submission_id === t.bodies[1].submission_id && t.stored.size === 1, 'balasan hilang lalu dicoba ulang: tersimpan satu kali (tidak ganda)');
    ok(t.bodies[0].model_status === 'ready:9.9.9', 'status model saat mengisi tetap dicatat di data');
    await noResult(p, 'model siap');
    ok(modelRequests.length === 0, 'situs tidak memuat model.json atau global-shap.json ke peramban responden');
    await t.context.close();

    // D. Tidak memenuhi kriteria penyaring: pesan sopan, tidak ada yang dikirim
    t = await newPage({}); p = t.page;
    await p.check('#consent'); await next(p);
    await radio(p, 'S1', 'tidak'); await radio(p, 'S2', 'ya'); await radio(p, 'S3', 'belum'); await next(p);
    ok((await p.textContent('.card h2')) === ID.ineligibleTitle && t.bodies.length === 0, 'tidak memenuhi kriteria: pesan sopan, tidak ada yang dikirim');
    await p.click('[data-act="rescreen"]');
    ok((await p.textContent('.card h2')) === TR.id.sections.screening.title, 'kembali ke jawaban penyaring');
    await t.context.close();

    // E. Gagal lalu halaman dimuat ulang: jawaban ditawarkan kembali dengan ID yang sama; tema manual bertahan
    t = await newPage({ plan: ['fail', 'ok'], cfg: { SUBMIT_MAX_ATTEMPTS: 1 } }); p = t.page;
    await p.click('#themeBtn');
    await fill(p, false); await p.click('[data-act="send"]'); await p.waitForSelector('[data-act="retry"]', { timeout: 15000 });
    await p.reload();
    ok((await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'pilihan tema manual bertahan setelah muat ulang');
    ok((await p.textContent('.notice')).includes(ID.resumeBanner) && (await p.textContent('[data-act="send"]')) === ID.retry, 'jawaban belum terkirim ditawarkan lagi setelah muat ulang');
    await p.click('[data-act="send"]'); await p.waitForSelector('.thanks .saved', { timeout: 15000 });
    ok(t.bodies.length === 2 && t.bodies[0].submission_id === t.bodies[1].submission_id && t.stored.size === 1, 'kirim ulang setelah muat ulang: ID sama, tersimpan satu kali');
    ok(t.errors.length === 0, 'tanpa galat JavaScript (E): ' + t.errors.join(' | '));
    await t.context.close();
    console.log('UI: ' + n + ' pemeriksaan lulus');
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally { srv.close(); await browser.close(); }
})();
