'use strict';
// NODE_PATH=/opt/npm-tools/node_modules node tests/check_page.js
// Menguji check.html di Chromium terhadap Code.gs ASLI (layanan Google ditiru). Dilewati bila Playwright tidak ada.
const fs = require('fs'), path = require('path'), vm = require('vm');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('check.html dilewati: Playwright tidak tersedia'); process.exit(0); }
const root = path.join(__dirname, '..'), read = (p) => fs.readFileSync(path.join(root, p), 'utf8'), URL_OK = 'https://script.google.com/macros/s/UJI/exec';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function backend() {
  const ctx = vm.createContext({ ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }) } });
  vm.runInContext(read('backend/Instrument.gs'), ctx); vm.runInContext(read('backend/Code.gs'), ctx);
  return ctx;
}
async function scenario(browser, site, cfgUrl, tweak) {
  const page = await browser.newPage(), ctx = backend();
  await page.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.APP_CONFIG={BACKEND_URL:' + JSON.stringify(cfgUrl) + ',MODEL_METADATA_URL:"model/model-metadata.json"};' }));
  await page.route(URL_OK, (r) => {
    const q = r.request(), post = q.method() === 'POST';
    const body = post ? ctx.doPost({ postData: { contents: q.postData() } }).getContent() : ctx.doGet({}).getContent();
    r.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: tweak ? tweak(body, post) : body });
  });
  await page.goto(site + '/check.html');
  await page.waitForFunction(() => /pemeriksaan/.test(document.getElementById('summary').textContent), null, { timeout: 15000 });
  const items = await page.$$eval('#list li', (els) => els.map((e) => e.textContent));
  await page.close();
  return { items, fails: items.filter((t) => t.startsWith('✗')) };
}

(async () => {
  let browser; try { browser = await chromium.launch(); } catch (e) { console.log('check.html dilewati: Chromium tidak tersedia'); process.exit(0); }
  const srv = require('http').createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const site = 'http://127.0.0.1:' + srv.address().port;
  let n = 0; const ok = (c, m) => { if (!c) throw new Error('GAGAL: ' + m); n++; };
  try {
    let r = await scenario(browser, site, URL_OK);
    ok(r.items.length === 8 && r.fails.length === 0, 'semua pemeriksaan lulus terhadap Code.gs asli: ' + r.fails.join(' | '));
    r = await scenario(browser, site, URL_OK, (b, post) => (post ? b : b.replace('"instrument_version":"1.0.0"', '"instrument_version":"0.9.0"')));
    ok(r.fails.length === 1 && r.fails[0].includes('Versi instrumen'), 'ketidakcocokan versi instrumen terdeteksi');
    r = await scenario(browser, site, '');
    ok(r.fails.length === 1 && r.fails[0].includes('BACKEND_URL') && r.items.length === 3, 'BACKEND_URL kosong terdeteksi, pemeriksaan backend dilewati');
    console.log('check.html: ' + n + ' pemeriksaan lulus');
  } catch (e) { console.error(e.message); process.exitCode = 1; } finally { srv.close(); await browser.close(); }
})();
