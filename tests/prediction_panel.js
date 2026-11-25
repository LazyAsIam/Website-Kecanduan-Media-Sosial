'use strict';
// NODE_PATH=/opt/npm-tools/node_modules node tests/prediction_panel.js
// Panel prediksi/SHAP global TIDAK dimuat index.html selama pengumpulan data. Modulnya disimpan untuk tahap berikutnya dan diuji terisolasi di sini,
// dengan data sintetis SEMENTARA (python3 tests/make_fixture.py atau tests/run_all.py membuatnya di tests/.generated/ lalu menghapusnya).
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('Panel prediksi dilewati: Playwright tidak tersedia'); process.exit(0); }
const root = path.join(__dirname, '..'), fx = path.join(root, 'tests', '.generated', 'synthetic');
if (!fs.existsSync(path.join(fx, 'model.json'))) { console.error('Data sintetis sementara belum dibuat. Jalankan: python3 tests/make_fixture.py (atau python3 tests/run_all.py)'); process.exit(1); }
const I = require(path.join(root, 'instrument.js')), TR = require(path.join(root, 'translations.js'));
const { create } = require(path.join(root, 'model', 'prediction.js')), SX = require(path.join(root, 'model', 'shap-explainer.js'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

(async () => {
  let browser; try { browser = await chromium.launch(); } catch (e) { console.log('Panel prediksi dilewati: Chromium tidak tersedia'); process.exit(0); }
  const srv = require('http').createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const site = 'http://127.0.0.1:' + srv.address().port;
  const model = JSON.parse(fs.readFileSync(path.join(fx, 'model.json'))), G = JSON.parse(fs.readFileSync(path.join(fx, 'global-shap.json')));
  const answers = I.normalize(JSON.parse(fs.readFileSync(path.join(root, 'tests', 'scoring-cases.json'))).base);
  const vec = I.featureVector(answers), pr = create(model).predict(vec), top = SX.top(SX.explain(model, vec), pr.classIndex, 5);
  const META = { status: 'ready', version: G.version, trained_at: '2026-11-01T00:00:00+00:00', instrument_version: I.VERSION };
  let n = 0; const ok = (c, m) => { if (!c) throw new Error('GAGAL: ' + m); n++; };
  try {
    for (const bad of [false, true]) { // bad: berkas SHAP global berversi lain harus tidak ditampilkan (gagal tertutup)
      const page = await browser.newPage(), errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.route('**/model/model.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(model) }));
      await page.route('**/model/global-shap.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(bad ? Object.assign({}, G, { version: 'versi-lain' }) : G) }));
      await page.goto(site + '/index.html');
      ok((await page.evaluate(() => typeof window.renderPrediction)) === 'undefined', 'index.html tidak memuat modul prediksi');
      for (const f of ['model/prediction.js', 'model/shap-explainer.js', 'prediction-ui.js']) await page.addScriptTag({ url: site + '/' + f });
      await page.evaluate(() => { const d = document.createElement('div'); d.id = 'slot'; document.body.appendChild(d); });
      const show = (lang) => page.evaluate(([a, l, m]) => window.renderPrediction(document.getElementById('slot'), a, l, m, 'rendah'), [answers, lang, META]);
      await show('id'); await page.waitForSelector('#slot .pred');
      ok((await page.textContent('.predcard .badge')) === TR.id.ui.cat[pr.label], 'kategori estimasi sama dengan hitungan Node');
      const probs = await page.$$eval('.prow b', (els) => els.map((e) => parseFloat(e.textContent.replace(',', '.'))));
      ok(probs.length === 3 && Math.abs(probs.reduce((a, b) => a + b, 0) - 100) < 0.3 && probs.every((p, i) => Math.abs(p - pr.proba[i] * 100) < 0.06), 'probabilitas di panel = model');
      ok(JSON.stringify(await page.$$eval('.shaplist li', (els) => els.map((e) => e.dataset.f + ':' + e.dataset.sign))) === JSON.stringify(top.map((t) => t.feature + ':' + (t.value >= 0 ? 'up' : 'down'))), 'lima fitur teratas dan arah sama dengan TreeSHAP');
      if (bad) ok((await page.$$('.glob')).length === 0, 'SHAP global berversi lain tidak ditampilkan');
      else {
        await page.click('.glob summary');
        const order = G.features.slice().sort((a, b) => G.mean_abs.mean[b] - G.mean_abs.mean[a]), r1 = G.direction.F1.spearman.tinggi;
        ok((await page.$$('.glob table tr')).length === 7 && (await page.textContent('.glob table tr:first-child td:first-child')) === TR.id.feat[order[0]], 'SHAP global: tujuh fitur terurut');
        const dirs = await page.$$eval('.dirs li', (els) => els.map((e) => e.textContent));
        ok(dirs.length === 7 && dirs[order.indexOf('F1')].includes(TR.id.ui[Math.abs(r1) < 0.1 ? 'dirNone' : (r1 > 0 ? 'dirUp' : 'dirDown')]), 'arah F1 sesuai korelasi Spearman');
      }
      await page.click('[data-cls="2"]');
      ok((await page.textContent('.pred > h4:nth-of-type(2)')).includes('Tinggi') && (await page.getAttribute('[data-cls="2"]', 'aria-pressed')) === 'true', 'memilih kategori lain mengganti penjelasan');
      await show('en'); await page.waitForSelector('#slot .pred');
      ok((await page.textContent('.shaplist')).includes('contribut'), 'penjelasan berganti ke English');
      if (!bad) ok((await page.textContent('.glob summary')).includes('Features'), 'SHAP global berganti ke English');
      ok(errors.length === 0, 'tanpa galat JavaScript: ' + errors.join(' | '));
      await page.close();
    }
    console.log('Panel prediksi (terisolasi): ' + n + ' pemeriksaan lulus');
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally { srv.close(); await browser.close(); }
})();
