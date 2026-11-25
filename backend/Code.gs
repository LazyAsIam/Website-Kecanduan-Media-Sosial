/*
 * Code.gs — backend penerima jawaban (Google Apps Script Web App, skrip terikat ke Google Sheets PRIVAT).
 * Membutuhkan Instrument.gs (salinan persis ../instrument.js).
 * Prinsip: klien tidak dipercaya (validasi ulang dan skor dihitung di sini), penulisan lewat LockService,
 * idempoten menurut submission_id, baris tersimpan tidak pernah diubah, tanpa identitas pribadi.
 */
const SHEET_NAME = 'Responses';
const LOG_NAME = 'Log';
const BACKUP_FOLDER = 'Backup Kuesioner';
const BACKUP_KEEP = 14;
const LOCK_WAIT_MS = 25000;
const SITE_URL = ''; // isi dengan alamat GitHub Pages Anda (publik), mis. https://username.github.io/kuesioner-media-sosial/
const MAX_BODY = 20000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODEL_STATUS_RE = /^(not_trained|in_development|ready|needs_reevaluation)(:[A-Za-z0-9._-]{1,20})?$/;
const HEADERS = [
  'submission_id', 'timestamp', 'language_preference', 'instrument_version', 'duration_seconds', 'consent',
  'model_status_at_submission',
  'S1', 'S2', 'S3', 'D1', 'D2', 'D3', 'D4', 'D4_other',
  'F1', 'F2', 'F3', 'F3_other', 'F4', 'F4_other', 'F5', 'F6', 'F7',
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7',
  'bsmas_score', 'bsmas_category', 'productivity_score', 'save_status', 'row_hash'
];
const ANSWER_KEYS = HEADERS.slice(7, 37); // S1 ... P7

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_() {
  const sh = getSpreadsheet_().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('Sheet "' + SHEET_NAME + '" belum ada: jalankan setup()');
  return sh;
}

function log_(err) { // hanya pesan galat; tidak pernah mencatat jawaban responden
  try {
    const sh = getSpreadsheet_().getSheetByName(LOG_NAME);
    if (sh) sh.appendRow([new Date().toISOString(), String((err && err.message) || err)]);
  } catch (_) { /* pencatatan tidak boleh menggagalkan permintaan */ }
}

function hash_(row) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, row.map(String).join('|'), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b & 0xff) + 0x100).toString(16).slice(1); }).join('');
}

function checkPayload_(b) {
  if (!b || typeof b !== 'object') return [{ field: 'body', code: 'format' }];
  const errs = [];
  if (!UUID_RE.test(String(b.submission_id))) errs.push({ field: 'submission_id', code: 'format' });
  if (b.consent !== true) errs.push({ field: 'consent', code: 'required' });
  if (b.language_preference !== 'id' && b.language_preference !== 'en') errs.push({ field: 'language_preference', code: 'invalid_option' });
  if (!b.answers || typeof b.answers !== 'object') errs.push({ field: 'answers', code: 'required' });
  return errs;
}

function buildRow_(b, a, s) {
  const dur = Number(b.duration_seconds);
  const model = MODEL_STATUS_RE.test(String(b.model_status)) ? b.model_status : 'unknown';
  const meta = [b.submission_id, new Date().toISOString(), b.language_preference, Instrument.VERSION,
    (isFinite(dur) && dur >= 0 && dur <= 86400) ? Math.round(dur) : '', true, model];
  const answers = ANSWER_KEYS.map(function (k) { return a[k] === undefined ? '' : a[k]; });
  const row = meta.concat(answers, [s.bsmas_score, s.bsmas_category, s.productivity_score, 'saved']);
  row.push(hash_(row));
  return row;
}

function storedScores_(sheet, rowNumber) {
  const v = sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0];
  const at = function (k) { return v[HEADERS.indexOf(k)]; };
  return { bsmas_score: at('bsmas_score'), bsmas_category: at('bsmas_category'), productivity_score: at('productivity_score') };
}

function doGet(e) { // tanpa parameter: pemeriksaan hidup (tidak membuka data); ?page=admin: dashboard peneliti (hanya pemilik)
  if (e && e.parameter && e.parameter.page === 'admin') return adminPage_();
  return json_({ ok: true, service: 'kuesioner-backend', instrument_version: Instrument.VERSION });
}

function doPost(e) {
  let lock = null;
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > MAX_BODY) return json_({ ok: false, error: 'bad_request' });
    let body;
    try { body = JSON.parse(raw); } catch (_) { return json_({ ok: false, error: 'bad_request' }); }

    const a = (body && body.answers && typeof body.answers === 'object') ? Instrument.normalize(body.answers) : {};
    const errors = checkPayload_(body).concat(Instrument.validate(a));
    if (errors.length) return json_({ ok: false, error: 'validation', errors: errors });

    if (body.dry_run === true) { // uji sambungan: validasi dan hitung skor saja, tanpa menulis apa pun
      const ds = { bsmas_score: Instrument.bsmasScore(a), productivity_score: Instrument.productivityScore(a) };
      ds.bsmas_category = Instrument.bsmasCategory(ds.bsmas_score);
      return json_(Object.assign({ ok: true, status: 'dry_run', instrument_version: Instrument.VERSION }, ds));
    }

    lock = LockService.getScriptLock();
    try { lock.waitLock(LOCK_WAIT_MS); } catch (_) { lock = null; return json_({ ok: false, error: 'busy', retry: true }); }

    const sheet = getSheet_();
    const found = sheet.getRange('A:A').createTextFinder(body.submission_id).matchEntireCell(true).matchCase(true).findNext();
    if (found) { // kirim ulang teknis: balas yang sudah tersimpan, jangan menulis lagi
      return json_(Object.assign({ ok: true, status: 'duplicate', submission_id: body.submission_id }, storedScores_(sheet, found.getRow())));
    }
    const s = { bsmas_score: Instrument.bsmasScore(a), productivity_score: Instrument.productivityScore(a) };
    s.bsmas_category = Instrument.bsmasCategory(s.bsmas_score);
    sheet.appendRow(buildRow_(body, a, s));
    SpreadsheetApp.flush();
    if (sheet.getRange(sheet.getLastRow(), 1).getValue() !== body.submission_id) throw new Error('verifikasi penulisan gagal');
    return json_(Object.assign({ ok: true, status: 'saved', submission_id: body.submission_id }, s));
  } catch (err) {
    log_(err);
    return json_({ ok: false, error: 'server', retry: true });
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (_) { /* abaikan */ } }
  }
}

// ---- Dijalankan manual dari editor Apps Script ----
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperties({ SPREADSHEET_ID: ss.getId(), OWNER_EMAIL: Session.getEffectiveUser().getEmail() });
  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  if (!ss.getSheetByName(LOG_NAME)) ss.insertSheet(LOG_NAME).appendRow(['timestamp', 'pesan']);
  try {
    const p = sh.protect().setDescription('Data mentah: hanya ditulis oleh skrip');
    p.removeEditors(p.getEditors());
    if (p.canDomainEdit()) p.setDomainEdit(false);
  } catch (err) { log_(err); }
  installTriggers();
  return 'Setup selesai';
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupNow') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupNow').timeBased().everyDays(1).atHour(2).create();
}

function backupNow() { // salinan seluruh spreadsheet ke folder Drive; simpan BACKUP_KEEP terbaru
  const it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
  const stamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd-HHmm');
  DriveApp.getFileById(getSpreadsheet_().getId()).makeCopy('Backup-' + stamp, folder);
  const files = [], fi = folder.getFiles();
  while (fi.hasNext()) files.push(fi.next());
  files.sort(function (x, y) { return y.getDateCreated() - x.getDateCreated(); })
       .slice(BACKUP_KEEP).forEach(function (f) { f.setTrashed(true); });
}

function saveOwner() { // untuk yang sudah menjalankan setup() sebelumnya: simpan email pemilik untuk dashboard
  PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', Session.getEffectiveUser().getEmail());
  return 'Pemilik tersimpan';
}

// ---- Pembersihan baris uji: HANYA baris yang jelas bertanda uji; jalankan manual dari editor Apps Script ----
// Penanda uji (dari panduan uji, load_test.py, dan data sintetis): D4 "Lainnya" dengan isian UJI, atau submission_id berawalan SYN-.
// Baris tanpa penanda itu tidak pernah disentuh.
function isTestRow_(rec) {
  return (String(rec.D4).trim() === 'lainnya' && String(rec.D4_other).trim().toUpperCase() === 'UJI') || String(rec.submission_id).indexOf('SYN-') === 0;
}

function testRowNumbers_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return { total: 0, rows: [] };
  const rows = [];
  sheet.getRange(2, 1, last - 1, HEADERS.length).getValues().forEach(function (r, i) {
    const o = {};
    HEADERS.forEach(function (h, j) { o[h] = r[j]; });
    if (isTestRow_(o)) rows.push(i + 2);
  });
  return { total: last - 1, rows: rows };
}

function previewTestRows() { // hanya melaporkan; tidak mengubah apa pun
  const r = testRowNumbers_(getSheet_());
  return { total_data_rows: r.total, test_rows: r.rows.length, row_numbers: r.rows, kept_rows: r.total - r.rows.length };
}

function deleteTestRows() { // backup dulu (batal bila gagal), lalu hapus baris uji dari bawah ke atas; header dan jawaban asli tidak disentuh
  const sh = getSheet_(), lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const found = testRowNumbers_(sh);
    if (!found.rows.length) return { deleted: 0, kept_rows: found.total };
    backupNow();
    let deleted = 0;
    found.rows.slice().reverse().forEach(function (n) {
      const row = sh.getRange(n, 1, 1, HEADERS.length).getValues()[0], o = {};
      HEADERS.forEach(function (h, j) { o[h] = row[j]; });
      if (isTestRow_(o)) { sh.deleteRow(n); deleted++; } // diperiksa ulang tepat sebelum menghapus
    });
    SpreadsheetApp.flush();
    log_('Baris uji dihapus: ' + deleted);
    return { deleted: deleted, kept_rows: found.total - deleted };
  } finally {
    lock.releaseLock();
  }
}
