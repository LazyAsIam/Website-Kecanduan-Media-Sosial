'use strict';
// Jalankan dari akar proyek: node tests/test_model_runtime.js   (memakai fixture SINTETIS dari tests/make_fixture.py)
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..'), fx = path.join(__dirname, '.generated', 'synthetic');
const { create } = require(path.join(root, 'model', 'prediction.js'));
const S = require(path.join(root, 'model', 'shap-explainer.js'));
if (!fs.existsSync(path.join(fx, 'model.json'))) { console.error('Data sintetis sementara belum dibuat. Jalankan: python3 tests/make_fixture.py (atau python3 tests/run_all.py)'); process.exit(1); }
const load = (f) => JSON.parse(fs.readFileSync(path.join(fx, f), 'utf8'));
const model = load('model.json'), golden = load('golden-vectors.json').cases, ref = load('golden-shap.json').cases;
const rt = create(model);
let n = 0, worstP = 0, worstS = 0, worstL = 0;

golden.forEach((c) => {
  const r = rt.predict(c.vector);
  r.proba.forEach((p, i) => { worstP = Math.max(worstP, Math.abs(p - c.proba[i])); });
  assert.strictEqual(r.classIndex, c.class, 'kategori sama dengan scikit-learn'); n++;
  const e = S.explain(model, c.vector); // kekonsistenan lokal untuk SEMUA kasus: nilai dasar + jumlah SHAP = probabilitas
  [0, 1, 2].forEach((k) => { worstL = Math.max(worstL, Math.abs(e.base[k] + e.phi.reduce((a, row) => a + row[k], 0) - c.proba[k])); });
  assert.ok(S.consistent(e, r.proba), 'consistent()'); n++;
  const g = Object.keys(e.groups).reduce((a, f) => a + e.groups[f][0], 0), col = e.phi.reduce((a, row) => a + row[0], 0);
  assert.ok(Math.abs(g - col) < 1e-12, 'penjumlahan one-hot ke fitur asal tidak mengubah total'); n++;
});
assert.ok(worstP < 1e-12, 'selisih probabilitas maks ' + worstP); n++;
assert.ok(worstL < 1e-9, 'kekonsistenan lokal maks ' + worstL); n++;

ref.forEach((c) => { // terhadap Shapley eksak (brute force Python)
  const e = S.explain(model, golden[c.index].vector);
  e.phi.forEach((row, j) => row.forEach((v, k) => { worstS = Math.max(worstS, Math.abs(v - c.phi[j][k])); }));
  c.base.forEach((b, k) => { assert.ok(Math.abs(b - e.base[k]) < 1e-12, 'nilai dasar'); });
});
assert.ok(worstS < 1e-9, 'SHAP JS vs Shapley eksak, selisih maks ' + worstS); n++;

const e0 = S.explain(model, golden[0].vector), t5 = S.top(e0, golden[0].class, 5);
assert.ok(t5.length === 5 && t5.every((v, i) => i === 0 || Math.abs(t5[i - 1].value) >= Math.abs(v.value)), 'top-5 terurut menurut |SHAP|'); n++;
assert.throws(() => rt.predict([1, 2, 3]), /jumlah fitur/, 'masukan salah ditolak'); n++;
const bad = JSON.parse(JSON.stringify(e0)); bad.phi[0][0] += 0.01;
assert.ok(!S.consistent(bad, golden[0].proba), 'ketidakkonsistenan terdeteksi (gagal tertutup)'); n++;
console.log('Runtime model: ' + n + ' pemeriksaan lulus | maks selisih: proba ' + worstP.toExponential(1) + ', SHAP vs eksak ' + worstS.toExponential(1) + ', kekonsistenan lokal ' + worstL.toExponential(1));
