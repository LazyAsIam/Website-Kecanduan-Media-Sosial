"""TreeSHAP eksak (path-dependent; Lundberg dkk., 2018, Algorithm 2) untuk pohon hasil ekspor. Algoritmanya sama dengan model/shap-explainer.js.
Dipakai sebagai cadangan bila pustaka shap tidak terpasang, dan sebagai pembanding pustaka shap di verify_export.py."""
import numpy as np


def tree_arrays(model):
    """Larik pohon dari DecisionTreeClassifier terlatih; value = proporsi kelas per simpul (sama dengan model.json)."""
    t = model.tree_
    v = t.value[:, 0, :]
    v = v / v.sum(axis=1, keepdims=True)
    return {'children_left': t.children_left.tolist(), 'children_right': t.children_right.tolist(), 'feature': t.feature.tolist(),
            'threshold': t.threshold.tolist(), 'value': v.tolist(), 'cover': t.weighted_n_node_samples.tolist()}


def leaf_value(tree, x):
    """Probabilitas dari pohon ekspor: nilai dibulatkan ke float32 lalu dibandingkan dengan ambang, seperti scikit-learn."""
    n = 0
    while tree['children_left'][n] != -1:
        n = tree['children_left'][n] if float(np.float32(x[tree['feature'][n]])) <= tree['threshold'][n] else tree['children_right'][n]
    return np.array(tree['value'][n])


def _extend(path, pz, po, pi):
    p = [dict(e) for e in path]
    d = len(p)
    p.append({'d': pi, 'z': pz, 'o': po, 'w': 1.0 if d == 0 else 0.0})
    for i in range(d - 1, -1, -1):
        p[i + 1]['w'] += po * p[i]['w'] * (i + 1) / (d + 1)
        p[i]['w'] = pz * p[i]['w'] * (d - i) / (d + 1)
    return p


def _unwind(path, idx):
    p = [dict(e) for e in path]
    d, o, z = len(p) - 1, p[idx]['o'], p[idx]['z']
    nxt = p[d]['w']
    for i in range(d - 1, -1, -1):
        if o != 0:
            tmp = p[i]['w']
            p[i]['w'] = nxt * (d + 1) / ((i + 1) * o)
            nxt = tmp - p[i]['w'] * z * (d - i) / (d + 1)
        else:
            p[i]['w'] = p[i]['w'] * (d + 1) / (z * (d - i))
    for i in range(idx, d):
        p[i]['d'], p[i]['z'], p[i]['o'] = p[i + 1]['d'], p[i + 1]['z'], p[i + 1]['o']
    p.pop()
    return p


def _unwound_sum(p, idx):
    d, o, z = len(p) - 1, p[idx]['o'], p[idx]['z']
    nxt, total = p[d]['w'], 0.0
    for i in range(d - 1, -1, -1):
        if o != 0:
            tmp = nxt * (d + 1) / ((i + 1) * o)
            total += tmp
            nxt = p[i]['w'] - tmp * z * (d - i) / (d + 1)
        else:
            total += (p[i]['w'] / z) / ((d - i) / (d + 1))
    return total


def explain(tree, x, n_cols):
    """Mengembalikan (phi[n_cols, n_kelas], nilai dasar[n_kelas]); satuan probabilitas."""
    L, R, F, TH, V, CV = (tree[k] for k in ('children_left', 'children_right', 'feature', 'threshold', 'value', 'cover'))
    phi = np.zeros((n_cols, len(V[0])))
    xs = [float(np.float32(v)) for v in x]

    def rec(node, parent, pz, po, pi):
        path = _extend(parent, pz, po, pi)
        if L[node] == -1:
            for i in range(1, len(path)):
                el = path[i]
                phi[el['d']] += _unwound_sum(path, i) * (el['o'] - el['z']) * np.array(V[node])
            return
        f = F[node]
        hot, cold = (L[node], R[node]) if xs[f] <= TH[node] else (R[node], L[node])
        iz = io = 1.0
        p = path
        k = next((i for i, e in enumerate(path) if e['d'] == f), -1)
        if k >= 0:
            iz, io, p = path[k]['z'], path[k]['o'], _unwind(path, k)
        rec(hot, p, iz * CV[hot] / CV[node], io, f)
        rec(cold, p, iz * CV[cold] / CV[node], 0.0, f)

    rec(0, [], 1.0, 1.0, -1)
    return phi, np.array(V[0])


def shap_official(model, X):
    """Nilai SHAP dari pustaka shap resmi sebagai larik (n, fitur, kelas); toleran terhadap perbedaan bentuk keluaran antarversi."""
    import shap
    sv = shap.TreeExplainer(model).shap_values(X)
    sv = np.stack(sv, axis=-1) if isinstance(sv, list) else np.asarray(sv)
    if sv.shape != (X.shape[0], X.shape[1], len(model.classes_)):
        raise ValueError('Bentuk keluaran shap tidak dikenali: %s' % (sv.shape,))
    return sv
