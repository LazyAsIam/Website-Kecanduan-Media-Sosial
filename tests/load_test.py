"""Uji beban bertahap untuk backend Apps Script (hanya pustaka standar Python).
JALANKAN HANYA pada deployment dan Sheet UJI yang terpisah dari Sheet penelitian.
Aman (tidak menulis apa pun):  python3 tests/load_test.py --url https://script.google.com/macros/s/XXXX/exec
Menulis baris uji (ditandai D4_other = UJI; hapus setelahnya):  tambahkan --write
Setiap pengguna maya memakai aturan retry yang sama dengan situs (submission_id tetap, jeda 1, 2, 4... detik)."""
import argparse
import json
import random
import sys
import threading
import time
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor

ANSWERS = {'S1': 'ya', 'S2': 'ya', 'S3': 'belum', 'D1': 20, 'D2': 'perempuan', 'D3': 2023, 'D4': 'lainnya', 'D4_other': 'UJI',
           'F1': 3.5, 'F2': 3, 'F3': 'tiktok', 'F4': 'hiburan', 'F5': 4, 'F6': 2, 'F7': 6.5, 'B1': 3, 'B2': 3, 'B3': 2, 'B4': 2, 'B5': 1, 'B6': 2,
           'P1': 3, 'P2': 4, 'P3': 2, 'P4': 5, 'P5': 1, 'P6': 2, 'P7': 5}


def one(a, barrier):
    payload = {'submission_id': str(uuid.uuid4()), 'consent': True, 'language_preference': 'id', 'duration_seconds': 1,
               'model_status': 'not_trained', 'dry_run': not a.write, 'answers': ANSWERS}
    body = json.dumps(payload).encode()
    barrier.wait()  # semua pengguna maya mulai bersamaan
    t0, busy, status, i = time.time(), 0, 'pending', 0
    for i in range(a.max_attempts):
        try:
            req = urllib.request.Request(a.url, data=body, method='POST', headers={'Content-Type': 'text/plain;charset=utf-8'})
            with urllib.request.urlopen(req, timeout=a.timeout) as r:
                res = json.loads(r.read())
            if res.get('ok'):
                status = res.get('status')
                break
            if res.get('error') in ('validation', 'bad_request'):
                status = res['error']
                break
            busy += res.get('error') == 'busy'
        except Exception:
            pass  # jaringan, timeout, atau galat HTTP: coba lagi seperti situs
        if i < a.max_attempts - 1:
            time.sleep(a.base_delay * 2 ** i * (0.5 + random.random()))
    return {'ok': status in ('saved', 'duplicate', 'dry_run'), 'status': status, 'attempts': i + 1, 'busy': int(busy), 'secs': time.time() - t0}


def run_stage(a, n):
    barrier, t0 = threading.Barrier(n), time.time()
    with ThreadPoolExecutor(max_workers=n) as ex:
        rs = list(ex.map(lambda _: one(a, barrier), range(n)))
    secs = sorted(r['secs'] for r in rs)
    pct = lambda p: secs[min(len(secs) - 1, int(p * len(secs)))]
    return {'n': n, 'ok': sum(r['ok'] for r in rs), 'failed': sum(not r['ok'] for r in rs), 'retries': sum(r['attempts'] - 1 for r in rs),
            'busy_replies': sum(r['busy'] for r in rs), 'p50_s': round(pct(0.5), 2), 'p95_s': round(pct(0.95), 2), 'max_s': round(secs[-1], 2),
            'wall_s': round(time.time() - t0, 2)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', required=True)
    ap.add_argument('--stages', default='5,10,20,40')
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--yes', action='store_true')
    ap.add_argument('--pause', type=float, default=10)
    ap.add_argument('--max-attempts', type=int, default=6)
    ap.add_argument('--base-delay', type=float, default=1.0)
    ap.add_argument('--timeout', type=float, default=30)
    ap.add_argument('--json-out')
    a = ap.parse_args()
    if a.write and not a.yes:
        try:
            go = input('Mode --write MENULIS baris uji ke Sheet. Ketik UJI untuk memastikan ini deployment uji, bukan Sheet penelitian: ').strip() == 'UJI'
        except EOFError:
            go = False
        if not go:
            sys.exit('Dibatalkan.')
    print('Mode:', 'TULIS (baris ditandai UJI)' if a.write else 'uji kering (tidak menulis)')
    stages, last_ok = [], 0
    for k, n in enumerate(int(x) for x in a.stages.split(',')):
        if k and a.pause:
            time.sleep(a.pause)
        s = run_stage(a, n)
        stages.append(s)
        print('%3d serentak | berhasil %3d | gagal %3d | percobaan ulang %3d | balasan sibuk %3d | median %5.2f dtk | p95 %5.2f | maks %5.2f'
              % (n, s['ok'], s['failed'], s['retries'], s['busy_replies'], s['p50_s'], s['p95_s'], s['max_s']))
        if s['failed']:
            print('BERHENTI: ada pengiriman gagal pada tahap %d. Jangan membagikan tautan serentak ke kelompok sebesar itu; sebar pembagiannya.' % n)
            break
        last_ok = n
    else:
        print('Semua tahap berhasil tanpa kegagalan.')
    print('Tahap serentak terbesar tanpa kegagalan: %d. Ini hasil satu uji pada saat ini, bukan jaminan kapasitas; ulangi pada jam berbeda.' % last_ok)
    if a.json_out:
        with open(a.json_out, 'w', encoding='utf-8') as fh:
            json.dump({'write': a.write, 'stages': stages, 'largest_ok': last_ok}, fh)
    sys.exit(1 if any(s['failed'] for s in stages) else 0)


if __name__ == '__main__':
    main()
