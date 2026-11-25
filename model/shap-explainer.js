/*
 * shap-explainer.js — TreeSHAP eksak (path-dependent; Lundberg dkk., 2018, Algorithm 2) untuk pohon hasil ekspor.
 * Keluaran dalam satuan probabilitas per kategori. Nilai dasar = nilai simpul akar (rata-rata terbobot cover).
 * Kolom one-hot dijumlahkan kembali ke fitur asal (Subbab 3.6.5). Ini BUKAN peringkat feature importance.
 */
(function (root) {
  'use strict';
  const copy = function (path) { return path.map(function (e) { return { d: e.d, z: e.z, o: e.o, w: e.w }; }); };

  function extend(path, pz, po, pi) {
    const p = copy(path), d = p.length;
    p.push({ d: pi, z: pz, o: po, w: d === 0 ? 1 : 0 });
    for (let i = d - 1; i >= 0; i--) {
      p[i + 1].w += po * p[i].w * (i + 1) / (d + 1);
      p[i].w = pz * p[i].w * (d - i) / (d + 1);
    }
    return p;
  }
  function unwind(path, idx) {
    const p = copy(path), d = p.length - 1, o = p[idx].o, z = p[idx].z;
    let next = p[d].w;
    for (let i = d - 1; i >= 0; i--) {
      if (o !== 0) {
        const tmp = p[i].w;
        p[i].w = next * (d + 1) / ((i + 1) * o);
        next = tmp - p[i].w * z * (d - i) / (d + 1);
      } else {
        p[i].w = p[i].w * (d + 1) / (z * (d - i));
      }
    }
    for (let i = idx; i < d; i++) { p[i].d = p[i + 1].d; p[i].z = p[i + 1].z; p[i].o = p[i + 1].o; }
    p.pop();
    return p;
  }
  function unwoundSum(p, idx) {
    const d = p.length - 1, o = p[idx].o, z = p[idx].z;
    let next = p[d].w, total = 0;
    if (o !== 0) {
      for (let i = d - 1; i >= 0; i--) {
        const tmp = next * (d + 1) / ((i + 1) * o);
        total += tmp;
        next = p[i].w - tmp * z * (d - i) / (d + 1);
      }
    } else {
      for (let i = d - 1; i >= 0; i--) total += (p[i].w / z) / ((d - i) / (d + 1));
    }
    return total;
  }

  // Mengembalikan { base[c], phi[kolom][c], groups: { F1..F7: [c] } }
  function explain(model, vec) {
    const T = model.tree, nOut = model.classes.length, nCols = model.feature_columns.length;
    const phi = Array.from({ length: nCols }, function () { return new Array(nOut).fill(0); });
    function recurse(node, parent, pz, po, pi) {
      const path = extend(parent, pz, po, pi);
      if (T.children_left[node] === -1) {
        for (let i = 1; i < path.length; i++) {
          const el = path[i], s = unwoundSum(path, i) * (el.o - el.z);
          for (let c = 0; c < nOut; c++) phi[el.d][c] += s * T.value[node][c];
        }
        return;
      }
      const f = T.feature[node], left = Math.fround(vec[f]) <= T.threshold[node];
      const hot = left ? T.children_left[node] : T.children_right[node];
      const cold = left ? T.children_right[node] : T.children_left[node];
      let iz = 1, io = 1, p = path;
      const k = path.findIndex(function (e) { return e.d === f; });
      if (k >= 0) { iz = path[k].z; io = path[k].o; p = unwind(path, k); }
      recurse(hot, p, iz * T.cover[hot] / T.cover[node], io, f);
      recurse(cold, p, iz * T.cover[cold] / T.cover[node], 0, f);
    }
    recurse(0, [], 1, 1, -1);
    const groups = {};
    model.feature_columns.forEach(function (col, j) {
      const g = model.feature_groups[col];
      if (!groups[g]) groups[g] = new Array(nOut).fill(0);
      for (let c = 0; c < nOut; c++) groups[g][c] += phi[j][c];
    });
    return { base: T.value[0].slice(), phi: phi, groups: groups };
  }

  // k fitur asal dengan |kontribusi| terbesar untuk kategori classIndex
  function top(res, classIndex, k) {
    return Object.keys(res.groups).map(function (f) { return { feature: f, value: res.groups[f][classIndex] }; })
      .sort(function (a, b) { return Math.abs(b.value) - Math.abs(a.value); }).slice(0, k || 5);
  }
  // Pemeriksaan "gagal tertutup": nilai dasar + jumlah SHAP harus sama dengan probabilitas model
  function consistent(res, proba, tol) {
    return proba.every(function (p, c) {
      let s = res.base[c];
      res.phi.forEach(function (row) { s += row[c]; });
      return Math.abs(s - p) <= (tol || 1e-9);
    });
  }

  const api = { explain: explain, top: top, consistent: consistent };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ShapExplainer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
