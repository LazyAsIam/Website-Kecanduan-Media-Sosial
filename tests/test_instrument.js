'use strict';
// Jalankan dari akar proyek: node tests/test_instrument.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
const I = require(path.join(root, 'instrument.js'));
const C = JSON.parse(fs.readFileSync(path.join(__dirname, 'scoring-cases.json'), 'utf8'));
let n = 0;
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const keyed = (prefix, arr) => { const a = {}; arr.forEach((v, i) => { a[prefix + (i + 1)] = v; }); return a; };

eq(I.FEATURE_COLUMNS, C.columns, 'urutan 18 kolom');
eq(I.validate(C.base), [], 'jawaban dasar valid');
C.bsmas.forEach(([b, s, cat]) => { eq(I.bsmasScore(keyed('B', b)), s, 'skor BSMAS ' + b); eq(I.bsmasCategory(s), cat, 'kategori ' + s); });
C.productivity.forEach(([p, s]) => eq(I.productivityScore(keyed('P', p)), s, 'produktivitas ' + p));
C.vectors.forEach(([f, v]) => eq(I.featureVector(Object.assign({}, C.base, f)), v, 'vektor ' + JSON.stringify(f)));
C.validation.forEach(([id, patch, exp]) => {
  const a = Object.assign({}, C.base);
  Object.keys(patch).forEach(k => { if (patch[k] === null) delete a[k]; else a[k] = patch[k]; });
  eq(I.validate(a).map(e => e.field + ':' + e.code).sort(), exp.slice().sort(), id);
});
eq(I.normalize({ F1: ' 3,5 ', F3: 'tiktok', F3_other: 'x' }), { F1: 3.5, F3: 'tiktok' }, 'normalize');

// Apps Script: Instrument.gs harus identik dan dapat dimuat tanpa objek `module`
const gs = path.join(root, 'backend', 'Instrument.gs');
assert.ok(fs.readFileSync(gs).equals(fs.readFileSync(path.join(root, 'instrument.js'))), 'Instrument.gs tidak identik dengan instrument.js'); n++;
const ctx = vm.createContext({}); vm.runInContext(fs.readFileSync(gs, 'utf8'), ctx);
eq(ctx.Instrument.bsmasScore({ B1: 5, B2: 5, B3: 5, B4: 5, B5: 5, B6: 5 }), 30, 'Instrument.gs dimuat di konteks kosong');
console.log('JS: ' + n + ' pemeriksaan lulus');
