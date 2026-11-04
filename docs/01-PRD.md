# PRD — Kosku: Sistem Manajemen Kos

| | |
|---|---|
| **Versi** | 0.1 (draf) |
| **Tanggal** | 4 November 2026 |
| **Status** | Menunggu review pemilik |
| **Pemilik produk** | Faril Pirwan Hadi |

---

## 1. Latar belakang

Pengelolaan kos skala kecil–menengah (5–100 kamar) umumnya masih dilakukan dengan buku catatan, Excel, dan chat WhatsApp satu per satu. Akibatnya:

- **Tagihan sering telat ditagih** karena pemilik lupa siapa yang jatuh tempo hari ini.
- **Rekap pembayaran makan waktu**: harus cocokkan mutasi rekening dengan daftar penghuni secara manual.
- **Tidak ada gambaran cepat** siapa yang sudah bayar, siapa yang menunggak, dan berapa pemasukan bulan ini.
- **Komplain penghuni tercecer** di chat pribadi, tidak ada status, dan mudah terlupa.

## 2. Visi produk

> Kosku membantu pemilik kos menagih tepat waktu, tahu kondisi keuangan dalam 5 detik, dan menangani komplain penghuni tanpa ada yang terlewat, semua dari HP.

## 3. Tujuan dan indikator keberhasilan

| Tujuan | Indikator (KPI) | Target 3 bulan setelah dipakai |
|---|---|---|
| Menagih tepat waktu | % tagihan yang dibayar ≤ jatuh tempo | naik ≥ 20% dari sebelumnya |
| Hemat waktu administrasi | Waktu rekap bulanan | dari ±3 jam menjadi < 15 menit |
| Visibilitas keuangan | Pemilik bisa lihat status bayar semua kamar | ≤ 2 klik dari halaman utama |
| Komplain tertangani | Median waktu komplain → selesai | < 3 hari |
| Tidak ada tagihan terlewat | Tagihan yang tidak terkirim pengingatnya | 0 |

## 4. Pengguna (persona)

### 4.1 Pemilik kos (Owner) — pengguna utama
- Usia 30–60 tahun, mengelola 1–3 lokasi kos.
- Mengakses terutama dari **HP**, kadang laptop.
- Butuh: tahu siapa yang belum bayar, menagih tanpa merasa "tidak enak", laporan pemasukan.

### 4.2 Pengelola / penjaga kos (Manager)
- Orang kepercayaan pemilik di lokasi.
- Butuh: catat pembayaran tunai, tangani komplain, update status kamar.
- **Tidak boleh** melihat laporan keuangan lengkap (bisa diatur pemilik).

### 4.3 Penghuni (Tenant)
- Mahasiswa atau pekerja, 18–35 tahun, sangat terbiasa WhatsApp.
- Butuh: tahu jumlah tagihan, cara bayar, upload bukti, lapor kerusakan, lihat progres komplain.
- **Tidak perlu membuat akun**: akses lewat link portal pribadi yang dikirim via WA.

## 5. Ruang lingkup

### 5.1 Termasuk (in scope)

| # | Modul | Ringkasan |
|---|---|---|
| M1 | Properti & Kamar | Data lokasi kos, kamar, tipe, harga, status |
| M2 | Penghuni & Sewa | Data penghuni, kontrak sewa (masuk/keluar), deposit |
| M3 | Tagihan | Tagihan bulanan dibuat otomatis, item tambahan (listrik, dll.), denda |
| M4 | Pembayaran | Catat tunai/transfer, upload bukti, verifikasi, status otomatis |
| M5 | Pengingat WhatsApp | Pengingat H-3/H/H+N otomatis, konfirmasi lunas, broadcast |
| M6 | Dashboard | Ringkasan status bayar, pemasukan, hunian, komplain |
| M7 | Komplain | Tiket kerusakan dengan foto, prioritas, status, riwayat |
| M8 | Portal Penghuni | Lihat tagihan, upload bukti bayar, buat & pantau komplain |
| M9 | Laporan & Pengeluaran | Laba-rugi sederhana, ekspor Excel/PDF |
| M10 | Pengguna & Hak Akses | Owner, Manager, undang anggota tim |

### 5.2 Tidak termasuk (out of scope, versi 1)
- Aplikasi native Android/iOS (cukup web yang responsif dan bisa di-"Add to Home Screen" / PWA).
- Marketplace pencarian kos untuk calon penghuni.
- Integrasi akuntansi (Jurnal, Accurate, dll.).
- Smart lock / IoT meteran listrik.
- Chatbot WA dua arah yang memahami bahasa bebas.

## 6. Fitur dan prioritas (MoSCoW)

| Fitur | Prioritas | Fase |
|---|---|---|
| CRUD kamar dan penghuni | **Must** | 1 |
| Kontrak sewa (check-in / check-out) | **Must** | 1 |
| Generate tagihan bulanan otomatis | **Must** | 1 |
| Catat pembayaran manual + verifikasi bukti | **Must** | 1 |
| Dashboard status bayar bulan berjalan | **Must** | 1 |
| Login pemilik/pengelola | **Must** | 1 |
| Pengingat WA otomatis (H-3, H, H+1, H+3, H+7) | **Must** | 2 |
| Konfirmasi pembayaran via WA | **Must** | 2 |
| Portal penghuni (link pribadi) | **Must** | 2 |
| Komplain + foto + status | **Must** | 2 |
| Template pesan WA bisa diedit | Should | 2 |
| Broadcast pengumuman | Should | 2 |
| Denda keterlambatan otomatis | Should | 2 |
| Pencatatan pengeluaran | Should | 3 |
| Laporan laba-rugi + ekspor Excel/PDF | Should | 3 |
| Payment gateway (VA/QRIS) dan lunas otomatis | Should | 3 |
| Multi-properti | Could | 3 |
| Peran Manager dengan izin terbatas | Could | 3 |
| Daftar tunggu calon penghuni | Could | 4 |
| Tagihan listrik per meteran (input kWh) | Could | 4 |
| PWA + notifikasi push untuk pemilik | Won't (v1) | — |

## 7. Alur utama (user journey)

### 7.1 Siklus tagihan bulanan
```
[Tgl tagih - 7 hari]  Sistem membuat tagihan untuk setiap sewa aktif
[H-3]                 WA pengingat → penghuni (berisi nominal, rekening, link portal)
[H]                   WA pengingat jatuh tempo
                      Penghuni transfer → upload bukti di portal
                      Pemilik/pengelola dapat notifikasi → klik "Verifikasi"
                      Status tagihan → LUNAS, WA konfirmasi terkirim otomatis
[H+1, H+3, H+7]       Jika belum lunas: WA pengingat telat (+ denda bila diaktifkan)
```

### 7.2 Komplain
```
Penghuni buka portal → "Lapor Masalah" → isi kategori, deskripsi, foto
  → Pemilik dapat WA "Komplain baru: AC kamar 12 tidak dingin"
  → Pemilik ubah status: Diproses (WA ke penghuni)
  → Selesai (WA ke penghuni + minta konfirmasi/rating)
```

### 7.3 Penghuni masuk dan keluar
```
Check-in : pilih kamar kosong → isi data penghuni → atur harga, tanggal tagih, deposit
           → kamar jadi "Terisi" → WA sambutan + link portal
Check-out: tanggal keluar → hitung sisa tagihan / pengembalian deposit
           → kamar jadi "Kosong" → tagihan berikutnya tidak dibuat lagi
```

## 8. Asumsi
1. Satu pemilik dapat memiliki lebih dari satu properti (struktur data disiapkan sejak awal, UI multi-properti di fase 3).
2. Harga sewa bulanan. Sewa harian/mingguan tidak didukung di v1.
3. Mata uang hanya Rupiah, zona waktu **Asia/Jakarta (WIB)** (bisa diatur per properti).
4. Pembayaran default via transfer bank atau tunai. Payment gateway menyusul di fase 3.
5. Pengiriman WA memakai penyedia pihak ketiga (default **Fonnte**) dengan satu nomor WA khusus kos.

## 9. Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Nomor WA diblokir karena dianggap spam | Pengingat tidak terkirim | Nomor khusus kos, jeda antar pesan, kirim hanya jam 08.00–20.00, isi pesan personal, opsi pindah ke WhatsApp Cloud API resmi |
| Kebocoran data KTP penghuni | Pelanggaran UU PDP No. 27/2022 | Penyimpanan privat, link bertanda tangan (kedaluwarsa), enkripsi, akses berbasis peran |
| Salah hitung tagihan / denda | Penghuni komplain, hilang kepercayaan | Uang disimpan sebagai bilangan bulat Rupiah, unit test untuk logika tagihan, tagihan bisa dikoreksi dengan jejak audit |
| Cron gagal jalan | Tagihan/pengingat tidak dibuat | Job idempoten (aman dijalankan ulang), log eksekusi, peringatan di dashboard bila job terakhir gagal |
| Pemilik gaptek | Tidak dipakai | UI bahasa Indonesia sederhana, mobile-first, onboarding langkah demi langkah |

## 10. Pertanyaan terbuka (perlu jawaban pemilik)
Lihat [08-roadmap.md § Pertanyaan terbuka](08-roadmap.md#pertanyaan-terbuka).
