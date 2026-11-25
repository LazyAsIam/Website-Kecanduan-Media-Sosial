# Privasi dan data

## Dikumpulkan
Persetujuan, pilihan bahasa, S1–S3, D1–D4, F1–F7, B1–B6, P1–P7, lama pengisian (detik), stempel waktu server, versi instrumen, status model saat mengisi, dan skor yang dihitung.

## Tidak dikumpulkan
Nama, NIM, email, nomor telepon, lokasi, dan ID perangkat. Alamat IP tidak disimpan oleh sistem ini.

## Isian bebas
Pilihan "Lainnya" (`D4_other`, `F3_other`, `F4_other`) memungkinkan responden menulis teks bebas, termasuk tanpa sengaja data identitas. Periksa kolom ini sebelum berbagi data atau lampiran, dan hapus identitas bila ada.

## Di mana data berada
Google Sheets pribadi Anda (tidak dibagikan) dan backup di Drive Anda. Di GitHub (Public) hanya ada kode, teks kuesioner, `model.json` (struktur pohon: ambang, proporsi kelas, dan jumlah sampel per simpul; setiap daun minimal 5 sampel), serta `model-metadata.json` (ringkasan metrik). Tidak ada baris responden.

## Di peramban responden
`theme` dan `lang` (preferensi tampilan), serta `kuesioner_pending_v1` (jawaban yang belum terkonfirmasi, sementara; dihapus setelah backend mengonfirmasi). Tidak ada cookie, pelacak, atau analitik.

## Pihak ketiga
GitHub dan Google dapat mencatat data teknis (misalnya alamat IP) menurut kebijakan masing-masing. Sistem ini tidak menyimpannya.

## Catatan untuk naskah persetujuan
Teks persetujuan di `translations.js` hanyalah **draf** dari prinsip Subbab 3.7. Karena data tidak memuat identitas, jawaban yang sudah terkirim tidak dapat dicari dan ditarik per orang. Jika komite etik mensyaratkan, tuliskan hal itu secara eksplisit.

## Yang dilihat responden setelah mengirim
Hanya ucapan terima kasih dan status penyimpanan. Skor BSMAS, skor produktivitas, dan hasil klasifikasi tidak ditampilkan kepada responden.
