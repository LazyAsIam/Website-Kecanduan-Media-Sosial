'use strict';
// Jalankan dari akar proyek: node tests/test_translations.js
const path = require('path'), assert = require('assert');
const I = require(path.join(__dirname, '..', 'instrument.js'));
const T = require(path.join(__dirname, '..', 'translations.js'));
let n = 0;
const paths = (o, p = '') => Object.keys(o).flatMap((k) => (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? paths(o[k], p + k + '.') : [p + k]));
assert.deepStrictEqual(paths(T.id).sort(), paths(T.en).sort(), 'kunci id dan en harus sama'); n++;
['id', 'en'].forEach((l) => {
  const t = T[l];
  ['S1', 'S2', 'S3', 'D1', 'D2', 'D3', 'D4', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']
    .forEach((k) => { assert.ok(t.items[k] && t.items[k].length > 5, l + ' butir ' + k); n++; });
  Object.keys(I.OPTIONS).forEach((k) => { assert.deepStrictEqual(Object.keys(t.opt[k]).sort(), I.OPTIONS[k].slice().sort(), l + ' opsi ' + k); n++; });
  ['F2', 'F5', 'F6', 'P1'].forEach((k) => { assert.deepStrictEqual(Object.keys(t.opt[k]).map(Number), Array.from({ length: I.INT_SCALE[k] }, (_, i) => i + 1), l + ' kode ' + k); n++; });
  assert.deepStrictEqual(Object.keys(t.opt.likert), ['1', '2', '3', '4', '5'], l + ' skala Likert'); n++;
  ['required', 'format', 'range', 'invalid_option', 'other_required', 'too_long', 'sum_exceeds_24', 'consent'].forEach((c) => { assert.ok(t.err[c], l + ' pesan ' + c); n++; });
  assert.ok(t.ui.warn1.length > 400 && t.ui.warn2 && t.ui.consult, l + ' peringatan wajib'); n++;
  ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7'].forEach((f) => { assert.ok(t.feat[f], l + ' nama fitur ' + f); n++; });
  ['not_trained', 'in_development', 'needs_reevaluation'].forEach((s) => { assert.ok(t.ui.modelState[s], l + ' status model ' + s); n++; });
  ['shapUp', 'shapDown', 'shapTitle'].forEach((k) => { assert.ok(/\{cat\}/.test(t.ui[k]) && (k === 'shapTitle' || /\{feature\}/.test(t.ui[k])), l + ' templat ' + k); n++; });
});
assert.ok(T.id.ui.warn1.startsWith('PENTING: Hasil ini merupakan estimasi berdasarkan model Machine Learning Decision Tree'), 'redaksi peringatan ID'); n++;
const REQ = { // teks halaman terima kasih harus persis sesuai permintaan peneliti (ID); EN setara makna
  thanksTitle: 'Terima Kasih Telah Berpartisipasi!',
  thanksP1: 'Terima kasih telah membantu mengisi data untuk melatih dan mengembangkan sistem klasifikasi ini. Jawaban Anda sangat berarti bagi penelitian kami.',
  thanksWait: 'Mohon tunggu sampai sistem selesai memproses dan menyimpan data Anda. Silakan tidak menutup halaman ini selama proses berlangsung.',
  thanksSaved: 'Jawaban Anda berhasil disimpan. Terima kasih atas kontribusi Anda dalam penelitian ini!' };
Object.keys(REQ).forEach((k) => { assert.strictEqual(T.id.ui[k], REQ[k], 'teks ID ' + k); assert.ok(T.en.ui[k] && T.en.ui[k] !== REQ[k], 'teks EN ' + k); n += 2; });
['saving', 'saveFailTitle', 'saveFail'].forEach((k) => { assert.ok(T.id.ui[k] && T.en.ui[k], 'teks ' + k); n++; });
assert.ok(!/skor|estimasi/i.test(T.id.ui.consent.join(' ')) && !/score|estimate/i.test(T.en.ui.consent.join(' ')), 'teks persetujuan tidak lagi menjanjikan skor atau estimasi'); n++;
console.log('Terjemahan: ' + n + ' pemeriksaan lulus');
