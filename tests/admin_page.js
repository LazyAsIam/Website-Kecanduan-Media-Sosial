'use strict';
// NODE_PATH=/opt/npm-tools/node_modules node tests/admin_page.js   (jalankan setelah tests/test_backend.js yang membuat fixture statistik)
// Menguji backend/Admin.html di Chromium dengan statistik dari Admin.gs ASLI (layanan Google ditiru); google.script.run ditiru.
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('Dashboard dilewati: Playwright tidak tersedia'); process.exit(0); }
const root = path.join(__dirname, '..'), MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
(async () => {
  let browser; try { browser = await chromium.launch(); } catch (e) { console.log('Dashboard dilewati: Chromium tidak tersedia'); process.exit(0); }
  const srv = require('http').createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'text/plain', 'access-control-allow-origin': '*' }); res.end(fs.readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const site = 'http://127.0.0.1:' + srv.address().port, stats = JSON.parse(fs.readFileSync(path.join(__dirname, '.generated', 'admin-stats.json')));
  stats.site_url = site + '/'; // metadata model asli (belum dilatih) dibaca dari server statis
  let n = 0; const ok = (c, m) => { if (!c) throw new Error('GAGAL: ' + m); n++; };
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript((s) => {
      const run = { withSuccessHandler(f) { this.ok = f; return this; }, withFailureHandler(f) { this.fail = f; return this; }, getStats() { Promise.resolve().then(() => this.ok(s)); } };
      window.google = { script: { run } };
    }, stats);
    await page.goto(site + '/backend/Admin.html');
    await page.waitForSelector('#out:not([hidden])');
    ok((await page.textContent('#n')) === '6' && (await page.textContent('#ntest')) === '2', 'jumlah responden dan baris uji');
    ok((await page.$$('#prodi tr')).length === 3 && (await page.$$('#cats tr')).length === 3, 'tabel program studi dan kategori');
    ok((await page.textContent('#gate')).includes('belum terpenuhi'), 'gerbang 150 per kategori belum terpenuhi');
    ok((await page.textContent('#quality')).includes('persis sama: 2'), 'penanda jawaban identik');
    await page.waitForFunction(() => /Status: not_trained/.test(document.getElementById('model').textContent), null, { timeout: 8000 });
    for (const id of ['items', 'prodi', 'angkatan', 'gender', 'language', 'cats', 'day', 'quality']) {
      ok(!(await page.textContent('#' + id)).includes('UJI'), 'teks bebas tidak muncul di bagian data #' + id);
    }
    ok(errors.length === 0, 'tanpa galat JavaScript: ' + errors.join(' | '));
    console.log('Dashboard: ' + n + ' pemeriksaan lulus');
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally { srv.close(); await browser.close(); }
})();
