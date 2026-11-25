/*
 * submit.js — pengiriman jawaban yang tahan gangguan: antrean lokal, retry dengan backoff, dan
 * submission_id yang SAMA pada setiap percobaan (backend idempoten). Sukses hanya jika backend mengonfirmasi.
 * Content-Type text/plain sengaja dipakai agar peramban tidak melakukan preflight CORS ke Apps Script.
 */
(function (root) {
  'use strict';
  const KEY = 'kuesioner_pending_v1'; // berisi jawaban tanpa identitas; dihapus setelah terkonfirmasi

  function uuid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    const b = new Uint8Array(16); root.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
  }

  function createSubmitter(opts) {
    const o = Object.assign({ maxAttempts: 6, baseDelayMs: 1000, timeoutMs: 20000 }, opts);
    const store = o.storage || root.localStorage;
    const doFetch = o.fetch || root.fetch.bind(root);
    const sleep = o.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    const rnd = o.random || Math.random;
    const read = function () { try { return JSON.parse(store.getItem(KEY)); } catch (_) { return null; } };
    const write = function (p) { try { store.setItem(KEY, JSON.stringify(p)); } catch (_) { /* tetap lanjut */ } };
    const clear = function () { try { store.removeItem(KEY); } catch (_) { /* abaikan */ } };

    // Panggil hanya setelah responden menyatakan persetujuan.
    function buildPayload(answers, meta) {
      return { submission_id: uuid(), consent: true, language_preference: meta.language,
               duration_seconds: meta.durationSeconds, model_status: meta.modelStatus, answers: answers };
    }

    async function post(payload) {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, o.timeoutMs) : null;
      try {
        const r = await doFetch(o.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload), redirect: 'follow', signal: ctrl ? ctrl.signal : undefined });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
      } finally { if (timer) clearTimeout(timer); }
    }

    async function send(payload) {
      write(payload);
      for (let i = 0; i < o.maxAttempts; i++) {
        try {
          const res = await post(payload);
          if (res && res.ok) { clear(); return res; } // 'saved' atau 'duplicate' sama-sama berarti sudah tersimpan
          if (res && (res.error === 'validation' || res.error === 'bad_request')) { clear(); return res; }
        } catch (_) { /* jaringan/timeout: coba lagi */ }
        if (i < o.maxAttempts - 1) await sleep(o.baseDelayMs * Math.pow(2, i) * (0.5 + rnd()));
      }
      return { ok: false, error: 'pending' }; // jawaban tetap di antrean lokal; dapat dilanjutkan dengan resume()
    }

    return { buildPayload: buildPayload, send: send, pending: read,
             resume: function () { const p = read(); return p ? send(p) : Promise.resolve(null); } };
  }

  const api = { createSubmitter: createSubmitter, uuid: uuid, KEY: KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Submitter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
