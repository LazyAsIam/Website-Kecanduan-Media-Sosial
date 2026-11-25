"""Menguji load_test.py terhadap server TIRUAN (bukan Apps Script asli). Jalankan dari akar proyek: python3 tests/test_load_test.py"""
import json
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
n = 0
_TMP = Path(tempfile.mkdtemp()); __import__('atexit').register(__import__('shutil').rmtree, _TMP, True)


def ok(c, m=''):
    global n
    assert c, m
    n += 1


class Fake:  # meniru LockService: satu penulis pada satu waktu, menunggu paling lama `wait` detik
    def __init__(self, write, wait):
        self.lock, self.write, self.wait, self.ids, self.calls, self.dry = threading.Lock(), write, wait, {}, 0, 0


def serve(fake):
    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            fake.calls += 1
            if body.get('dry_run'):
                fake.dry += 1
                out = {'ok': True, 'status': 'dry_run'}
            elif not fake.lock.acquire(timeout=fake.wait):
                out = {'ok': False, 'error': 'busy', 'retry': True}
            else:
                try:
                    time.sleep(fake.write)
                    sid = body['submission_id']
                    out = {'ok': True, 'status': 'duplicate' if sid in fake.ids else 'saved'}
                    fake.ids[sid] = fake.ids.get(sid, 0) + 1
                finally:
                    fake.lock.release()
            data = json.dumps(out).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *a):
            pass
    srv = ThreadingHTTPServer(('127.0.0.1', 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, 'http://127.0.0.1:%d/exec' % srv.server_address[1]


def run(url, *args, stdin=None):
    out = _TMP / 'r.json'
    p = subprocess.run([sys.executable, str(ROOT / 'tests' / 'load_test.py'), '--url', url, '--pause', '0', '--base-delay', '0.02',
                        '--json-out', str(out), *args], capture_output=True, text=True, timeout=120, input=stdin)
    return p, (json.loads(out.read_text()) if out.exists() else None)


# 1. bawaan = uji kering: tidak menulis apa pun
f = Fake(0.03, 0.5); srv, url = serve(f)
p, r = run(url, '--stages', '4,12')
ok(p.returncode == 0 and f.ids == {} and f.dry == 16 and not r['write'], 'uji kering tidak menulis: ' + p.stdout)
ok([s['ok'] for s in r['stages']] == [4, 12] and r['largest_ok'] == 12, 'semua tahap berhasil')
srv.shutdown()

# 2. --write tanpa konfirmasi dibatalkan
f = Fake(0.03, 0.5); srv, url = serve(f)
p, r = run(url, '--stages', '4', '--write', stdin='tidak\n')
ok(p.returncode != 0 and f.ids == {} and f.calls == 0, 'tanpa konfirmasi tidak ada yang terkirim')
srv.shutdown()

# 3. penulisan dengan rebutan lock: ada balasan sibuk, tetapi retry berhasil dan tidak ada data ganda
f = Fake(0.03, 0.15); srv, url = serve(f)
p, r = run(url, '--stages', '4,12', '--write', '--yes', '--max-attempts', '10')
ok(p.returncode == 0 and r['stages'][1]['ok'] == 12 and r['stages'][1]['busy_replies'] > 0, 'retry mengatasi lock sibuk: ' + p.stdout)
ok(len(f.ids) == 16 and all(v == 1 for v in f.ids.values()), 'tiap submission_id tertulis tepat satu kali')
ok(f.calls > 16, 'ada percobaan ulang')
srv.shutdown()

# 4. kegagalan tidak disembunyikan
f = Fake(0.2, 0.01); srv, url = serve(f)
p, r = run(url, '--stages', '8,16', '--write', '--yes', '--max-attempts', '2')
ok(p.returncode == 1 and r['stages'][0]['failed'] > 0 and len(r['stages']) == 1 and 'BERHENTI' in p.stdout, 'kegagalan dilaporkan dan tahap berikutnya dibatalkan')
srv.shutdown()
print(f'Uji beban (server tiruan): {n} pemeriksaan lulus')
