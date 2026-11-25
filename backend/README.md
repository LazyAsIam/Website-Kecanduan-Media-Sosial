# Backend Apps Script — cara memasang

1. Buat Google Sheet baru di Drive Anda. **Jangan dibagikan ke siapa pun.** Buka Extensions → Apps Script.
2. Ganti isi `Code.gs` dengan isi berkas `Code.gs` di folder ini. Tambah file baru (+ → Script) bernama `Instrument`, isi dengan `Instrument.gs`. Untuk dashboard, tambah juga file Script `Admin` (isi `Admin.gs`) dan file HTML `Admin` (isi `Admin.html`); lihat `docs/DEPLOYMENT.md` bagian I.
3. Project Settings → centang "Show appsscript.json manifest file", lalu ganti isinya dengan `appsscript.json`.
4. Pilih fungsi `setup` → Run. Setujui izin (muncul peringatan "belum diverifikasi": ini skrip Anda sendiri; Advanced → Go to ...). Hasilnya: sheet `Responses` dan `Log`, serta backup harian jam 02.00.
5. Deploy → New deployment → Web app. Execute as: **Me**. Who has access: **Anyone**. Salin URL berakhiran `/exec`.
6. Buka URL itu di browser: harus tampil `{"ok":true,"service":"kuesioner-backend",...}`.
7. Tempel URL ke `BACKEND_URL` di `config.js`.
8. Setelah mengubah kode: Deploy → Manage deployments → ikon pensil → Version: New version → Deploy (URL tidak berubah).

Catatan: `Instrument.gs` harus selalu identik dengan `instrument.js` (diperiksa oleh `tests/test_instrument.js`).
