/*
 * prediction.js — menjalankan pohon Decision Tree hasil ekspor Python (model.json). Tidak belajar apa pun.
 * Aturan sama dengan scikit-learn: nilai fitur dibulatkan ke float32, lalu "x <= ambang" ke kiri;
 * probabilitas = proporsi kelas pada daun; kategori = probabilitas terbesar (seri: indeks terkecil).
 */
(function (root) {
  'use strict';
  function create(model) {
    if (!model || model.format !== 1) throw new Error('format model tidak dikenal');
    const T = model.tree, nOut = model.classes.length, nCols = model.feature_columns.length;
    function leafOf(vec) {
      let n = 0;
      while (T.children_left[n] !== -1) {
        n = Math.fround(vec[T.feature[n]]) <= T.threshold[n] ? T.children_left[n] : T.children_right[n];
      }
      return n;
    }
    function predict(vec) {
      if (!Array.isArray(vec) || vec.length !== nCols) throw new Error('jumlah fitur harus ' + nCols);
      const proba = T.value[leafOf(vec)].slice();
      let best = 0;
      for (let i = 1; i < nOut; i++) if (proba[i] > proba[best]) best = i;
      return { proba: proba, classIndex: best, label: model.classes[best] };
    }
    return { model: model, predict: predict, leafOf: leafOf };
  }
  const api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ModelRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
