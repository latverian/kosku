# Spesifikasi Kebutuhan (Requirements)

Kode kebutuhan: **FR** = fungsional, **NFR** = non-fungsional. Setiap FR punya kriteria penerimaan (*acceptance criteria*, AC) yang nanti dijadikan dasar pengujian.

---

## 1. Kebutuhan fungsional

### M1 — Properti & Kamar

| ID | Kebutuhan |
|---|---|
| FR-1.1 | Pemilik dapat membuat properti (nama, alamat, no. WA pengelola, rekening bank, zona waktu). |
| FR-1.2 | Pemilik dapat menambah, mengubah, dan mengarsipkan kamar: kode/nomor, lantai, tipe, harga bulanan default, deposit default, fasilitas, foto, catatan. |
| FR-1.3 | Status kamar: `kosong`, `terisi`, `dipesan`, `perbaikan`. Status `terisi` diatur otomatis oleh sistem dari kontrak sewa aktif. |
| FR-1.4 | Daftar kamar dapat difilter berdasarkan status, tipe, dan lantai, serta menampilkan nama penghuni dan status bayar bulan ini. |

**AC FR-1.3**
- Diberikan kamar 12 berstatus `kosong`, ketika check-in penghuni dilakukan, maka status kamar berubah jadi `terisi`.
- Kamar dengan sewa aktif **tidak bisa** diubah manual menjadi `kosong`.

### M2 — Penghuni & Sewa

| ID | Kebutuhan |
|---|---|
| FR-2.1 | Data penghuni: nama lengkap, no. WA (wajib, format E.164 `62…`), email, NIK, foto KTP, pekerjaan/kampus, kontak darurat (nama, hubungan, no. HP), catatan. |
| FR-2.2 | **Check-in** membuat kontrak sewa: kamar, tanggal mulai, harga sewa (default dari kamar, bisa diubah), **tanggal tagih** (1–28), deposit, tanggal selesai (opsional). |
| FR-2.3 | Satu kamar hanya boleh punya **satu** sewa aktif (kecuali kamar bertipe "sharing" dengan kapasitas > 1). |
| FR-2.4 | **Check-out**: isi tanggal keluar, alasan, dan status deposit (dikembalikan penuh / sebagian / hangus). Tagihan setelah tanggal keluar tidak dibuat. |
| FR-2.5 | Riwayat penghuni per kamar dan riwayat kamar per penghuni tersimpan. |
| FR-2.6 | Pindah kamar = check-out dari kamar lama + check-in ke kamar baru, deposit dapat dipindahkan. |
| FR-2.7 | Saat check-in, sistem membuat **token portal** dan mengirim WA sambutan berisi link portal. |

**AC FR-2.2**
- Jika tanggal tagih tidak diisi, default = tanggal check-in (dibatasi maksimum 28 agar aman di bulan Februari).
- Opsi "prorata bulan pertama": tagihan pertama = harga × (sisa hari / jumlah hari di bulan itu), dibulatkan ke atas ke ribuan.

### M3 — Tagihan (Invoice)

| ID | Kebutuhan |
|---|---|
| FR-3.1 | Setiap hari pukul 07.00 waktu properti, sistem membuat tagihan untuk setiap sewa aktif yang jatuh tempo dalam **N hari** ke depan (default N = 7, bisa diatur). |
| FR-3.2 | Pembuatan tagihan bersifat **idempoten**: maksimal satu tagihan sewa per kontrak per periode (bulan). |
| FR-3.3 | Tagihan terdiri dari item: `sewa`, `listrik`, `air`, `laundry`, `denda`, `diskon` (nilai negatif), `lainnya`. Total = jumlah item. |
| FR-3.4 | Nomor tagihan unik dan mudah dibaca: `KSK-<kode properti>-<YYYYMM>-<kode kamar>`, contoh `KSK-MLT-202611-12`. |
| FR-3.5 | Status tagihan: `draft`, `terbit`, `sebagian`, `lunas`, `batal`. **Terlambat** bukan status tersimpan, tetapi kondisi turunan: `jatuh_tempo < hari ini AND status IN (terbit, sebagian)`. |
| FR-3.6 | Pemilik dapat menambah item ke tagihan yang belum lunas (misal tagihan listrik), mengoreksi nominal, atau membatalkan tagihan, dengan alasan wajib diisi (tercatat di audit log). |
| FR-3.7 | **Denda keterlambatan** (opsional per properti): tipe `tetap` (mis. Rp50.000 sekali) atau `per_hari` (mis. Rp5.000/hari, maksimum Rp X), berlaku setelah masa tenggang G hari. Denda ditambahkan sebagai item `denda` oleh job harian. |
| FR-3.8 | Tagihan dapat dilihat/diunduh sebagai PDF/gambar untuk dikirim ke penghuni. |

**AC FR-3.2**
- Menjalankan job pembuatan tagihan dua kali di hari yang sama **tidak** menghasilkan tagihan ganda (dijamin constraint `UNIQUE(lease_id, period)` di database).

**AC FR-3.5**
- Tagihan Rp1.500.000 dengan pembayaran terverifikasi Rp500.000 berstatus `sebagian`, sisa Rp1.000.000.
- Begitu total pembayaran terverifikasi ≥ total tagihan, status otomatis berubah jadi `lunas` dan `paid_at` terisi.

### M4 — Pembayaran

| ID | Kebutuhan |
|---|---|
| FR-4.1 | Pemilik/pengelola dapat mencatat pembayaran: tagihan, nominal, tanggal, metode (`tunai`, `transfer`, `qris`, `va`, `lainnya`), bukti (opsional), catatan. Pembayaran yang dicatat pemilik langsung `terverifikasi`. |
| FR-4.2 | Penghuni dapat mengunggah bukti transfer lewat portal, tercatat sebagai pembayaran `menunggu`. |
| FR-4.3 | Pemilik dapat **Verifikasi** atau **Tolak** (dengan alasan) pembayaran `menunggu`. Penolakan mengirim WA ke penghuni. |
| FR-4.4 | Status tagihan dihitung ulang setiap ada perubahan pembayaran (FR-3.5). |
| FR-4.5 | Kelebihan bayar disimpan sebagai **saldo kredit** penghuni dan otomatis dipakai di tagihan berikutnya. |
| FR-4.6 | *(Fase 3)* Integrasi payment gateway: setiap tagihan punya link bayar (VA/QRIS). Webhook gateway yang tervalidasi tanda tangannya otomatis membuat pembayaran `terverifikasi`. |
| FR-4.7 | Kuitansi pembayaran (PDF/gambar) dapat dibuat dan dikirim via WA. |

### M5 — Pengingat & Pesan WhatsApp

| ID | Kebutuhan |
|---|---|
| FR-5.1 | Jadwal pengingat per properti, default: `H-3`, `H0`, `H+1`, `H+3`, `H+7` relatif terhadap jatuh tempo. Bisa diaktifkan/nonaktifkan per jenis. |
| FR-5.2 | Pengingat hanya dikirim untuk tagihan berstatus `terbit` atau `sebagian`. Begitu lunas, pengingat berikutnya otomatis berhenti. |
| FR-5.3 | Setiap jenis pengingat maksimal **satu kali** per tagihan (`UNIQUE(invoice_id, type)` di log pesan). |
| FR-5.4 | Pesan hanya dikirim di **jam tenang** 08.00–20.00 waktu properti. Pesan di luar jam itu ditunda ke jam 08.00 berikutnya. |
| FR-5.5 | Jeda acak 5–15 detik antar pesan untuk mengurangi risiko blokir. |
| FR-5.6 | Template pesan dengan variabel: `{nama}`, `{kamar}`, `{periode}`, `{nominal}`, `{sisa}`, `{jatuh_tempo}`, `{rekening}`, `{link_portal}`, `{nama_kos}`, `{denda}`. Template dapat diedit dan dipratinjau. |
| FR-5.7 | Pesan otomatis lain: sambutan check-in, konfirmasi lunas, pembayaran ditolak, update status komplain, notifikasi komplain baru (ke pemilik), notifikasi bukti bayar baru (ke pemilik). |
| FR-5.8 | **Broadcast**: kirim pengumuman ke semua penghuni aktif / per lantai / pilihan tertentu. |
| FR-5.9 | Semua pesan tercatat (log): tujuan, isi, status (`antri`, `terkirim`, `gagal`), alasan gagal, waktu. Pesan gagal dapat dikirim ulang. |
| FR-5.10 | Pemilik dapat menandai penghuni "jangan kirim pengingat otomatis" (mis. sudah sepakat bayar telat). |
| FR-5.11 | Provider WA diakses lewat antarmuka (`WhatsAppProvider`) sehingga Fonnte bisa diganti WhatsApp Cloud API tanpa mengubah logika bisnis. |

**Contoh template default** — lihat [05-architecture.md § Template pesan](05-architecture.md#template-pesan-wa-default).

### M6 — Dashboard

| ID | Kebutuhan |
|---|---|
| FR-6.1 | Kartu ringkasan bulan berjalan: **Total tagihan**, **Sudah dibayar** (Rp & %), **Belum dibayar**, **Terlambat** (jumlah orang & Rp). |
| FR-6.2 | Tingkat hunian: kamar terisi / total kamar (%). |
| FR-6.3 | Daftar **perlu tindakan**: bukti bayar menunggu verifikasi, tagihan terlambat (urut terlama), komplain baru/darurat, pesan WA gagal. |
| FR-6.4 | Tabel/kisi status bayar per kamar bulan ini, warna: hijau = lunas, kuning = belum jatuh tempo, oranye = sebagian, merah = terlambat, abu = kosong. |
| FR-6.5 | Grafik pemasukan 12 bulan terakhir (diterima vs ditagihkan). |
| FR-6.6 | Pilih periode (bulan) dan properti. |
| FR-6.7 | Aksi cepat dari dashboard: "Catat pembayaran", "Kirim pengingat sekarang", "Hubungi via WA" (buka `wa.me`). |

### M7 — Komplain

| ID | Kebutuhan |
|---|---|
| FR-7.1 | Penghuni membuat komplain di portal: kategori (`listrik`, `air`, `AC`, `internet`, `kebersihan`, `keamanan`, `fasilitas`, `tetangga`, `lainnya`), judul, deskripsi, maksimal 5 foto. |
| FR-7.2 | Pemilik/pengelola juga dapat membuat komplain atas nama penghuni (dari laporan lisan/WA). |
| FR-7.3 | Prioritas: `rendah`, `sedang`, `tinggi`, `darurat`. Penghuni memilih usulan, pemilik dapat mengubah. |
| FR-7.4 | Status: `baru` → `diproses` → `selesai`, atau `ditolak`. Setiap perubahan status tercatat di riwayat dengan catatan opsional. |
| FR-7.5 | Komentar dua arah (pemilik ↔ penghuni) di setiap komplain. |
| FR-7.6 | Notifikasi WA ke pemilik saat ada komplain baru; ke penghuni saat status berubah. |
| FR-7.7 | Penugasan ke pengelola/teknisi (nama + no. HP, tidak wajib punya akun). |
| FR-7.8 | Penghuni dapat memberi rating 1–5 setelah komplain selesai. |
| FR-7.9 | Biaya perbaikan dapat dicatat dan otomatis masuk ke pengeluaran (M9). |
| FR-7.10 | Laporan: jumlah komplain per kategori, rata-rata waktu selesai, kamar paling sering komplain. |

### M8 — Portal Penghuni

| ID | Kebutuhan |
|---|---|
| FR-8.1 | Akses melalui link unik `https://<domain>/p/<token>`. Token acak 32 byte, yang disimpan di database hanya hash-nya. |
| FR-8.2 | Halaman portal: tagihan aktif (nominal, jatuh tempo, rekening tujuan, tombol salin nomor rekening), riwayat pembayaran, upload bukti bayar, daftar & form komplain, info kos (aturan, kontak pengelola). |
| FR-8.3 | Token dapat dicabut/dibuat ulang oleh pemilik (misal HP penghuni hilang). Token otomatis tidak berlaku 30 hari setelah check-out. |
| FR-8.4 | *(Opsional)* Lapisan keamanan tambahan: verifikasi 4 digit terakhir no. WA saat pertama kali membuka link di perangkat baru. |
| FR-8.5 | Portal tidak menampilkan data penghuni lain. |

### M9 — Laporan & Pengeluaran

| ID | Kebutuhan |
|---|---|
| FR-9.1 | Catat pengeluaran: kategori (`listrik`, `air`, `internet`, `kebersihan`, `perbaikan`, `gaji`, `pajak`, `lainnya`), nominal, tanggal, keterangan, foto nota. |
| FR-9.2 | Laporan bulanan: pemasukan (per metode), pengeluaran (per kategori), laba bersih, tunggakan. |
| FR-9.3 | Laporan tahunan dan perbandingan antar bulan. |
| FR-9.4 | Ekspor ke **Excel (.xlsx)** dan **PDF**. |
| FR-9.5 | Laporan tunggakan per penghuni (aging: 1–7 hari, 8–30 hari, > 30 hari). |

### M10 — Pengguna & Hak Akses

| ID | Kebutuhan |
|---|---|
| FR-10.1 | Login pemilik/pengelola dengan email + password atau magic link email. *(Opsional: OTP via WA.)* |
| FR-10.2 | Peran: `owner` (semua akses), `manager` (kamar, penghuni, catat bayar, komplain; laporan keuangan **tidak**, kecuali diizinkan). |
| FR-10.3 | Owner dapat mengundang manager via email/WA dan mencabut aksesnya. |
| FR-10.4 | Semua perubahan data penting (tagihan, pembayaran, sewa, hapus data) tercatat di **audit log**: siapa, kapan, apa, nilai sebelum & sesudah. |

---

## 2. Kebutuhan non-fungsional

| ID | Kategori | Kebutuhan |
|---|---|---|
| NFR-1 | **Usability** | UI bahasa Indonesia, mobile-first (nyaman di layar 360 px), aksi utama ≤ 3 ketukan. Tersedia mode gelap. |
| NFR-2 | **Kinerja** | Halaman dashboard tampil < 2 detik pada 4G untuk properti dengan 100 kamar dan 3 tahun data. |
| NFR-3 | **Keamanan** | HTTPS wajib. Row Level Security (RLS) di database: user hanya bisa membaca data properti tempat ia menjadi anggota. Password di-hash (dikelola Supabase Auth). Rahasia (API key Fonnte, gateway) hanya di environment variable server, tidak pernah dikirim ke browser atau di-commit ke Git. |
| NFR-4 | **Privasi (UU PDP)** | Foto KTP dan bukti bayar di bucket **privat**, diakses dengan signed URL berumur ≤ 10 menit. NIK ditampilkan tersamar (`3273********0001`). Data penghuni dapat dihapus/dianonimkan atas permintaan setelah kewajiban keuangan selesai. |
| NFR-5 | **Integritas data** | Nominal uang disimpan sebagai `bigint` Rupiah (tanpa desimal/float). Semua tanggal & waktu disimpan UTC (`timestamptz`), ditampilkan di zona waktu properti. Operasi tagihan/pembayaran dalam transaksi database. |
| NFR-6 | **Keandalan** | Job terjadwal idempoten dan dapat dijalankan ulang. Kegagalan kirim WA dicoba ulang maksimal 3 kali (backoff 1, 5, 15 menit). |
| NFR-7 | **Ketersediaan** | Target uptime 99,5% (mengikuti Vercel & Supabase). |
| NFR-8 | **Backup** | Backup database harian otomatis (Supabase), plus ekspor mingguan ke penyimpanan terpisah. |
| NFR-9 | **Observabilitas** | Log error terpusat (Sentry atau setara). Riwayat eksekusi job (mulai, selesai, jumlah diproses, error) terlihat di halaman admin. |
| NFR-10 | **Maintainability** | TypeScript strict mode, lint + format otomatis, test unit untuk logika tagihan/denda/status ≥ 90% coverage, CI di GitHub Actions wajib hijau sebelum merge. |
| NFR-11 | **Skalabilitas** | Arsitektur siap multi-properti dan multi-pemilik (multi-tenant) tanpa ubah skema. |
| NFR-12 | **Biaya** | Biaya operasional bulanan untuk 1 kos ≤ Rp150.000 (Fonnte + domain, Vercel/Supabase tier gratis). |

---

## 3. User stories (ringkas)

**Pemilik**
- Sebagai pemilik, saya ingin melihat siapa saja yang belum bayar bulan ini dalam satu layar, agar saya tahu siapa yang perlu ditagih.
- Sebagai pemilik, saya ingin pengingat dikirim otomatis, agar saya tidak perlu menagih satu per satu dan merasa sungkan.
- Sebagai pemilik, saya ingin cukup menekan "Verifikasi" pada bukti transfer, agar rekap terjadi otomatis.
- Sebagai pemilik, saya ingin laporan pemasukan dan pengeluaran bulanan, agar saya tahu keuntungan kos saya.

**Pengelola**
- Sebagai pengelola, saya ingin mencatat pembayaran tunai dari HP, agar pemilik langsung melihatnya.
- Sebagai pengelola, saya ingin daftar komplain yang belum selesai, agar saya bisa menindaklanjutinya.

**Penghuni**
- Sebagai penghuni, saya ingin tahu jumlah tagihan dan nomor rekening tanpa harus bertanya, agar mudah membayar.
- Sebagai penghuni, saya ingin melaporkan kerusakan dengan foto dan melihat progresnya, agar tidak perlu bertanya berulang kali.
