# Desain UI/UX

## 1. Prinsip desain
1. **Mobile-first**: mayoritas pemilik membuka dari HP. Desain mulai dari lebar 360 px, lalu diperluas untuk desktop.
2. **Status dulu, detail kemudian**: warna dan angka besar menjawab "siapa belum bayar?" tanpa perlu membaca.
3. **Satu aksi utama per layar**: tombol utama jelas (mis. "Catat Pembayaran").
4. **Bahasa sehari-hari**: "Belum bayar", bukan "Outstanding". Format Rupiah `Rp1.500.000`, tanggal `5 Nov 2026`.
5. **Aman dari salah klik**: aksi penting (batalkan tagihan, check-out) wajib konfirmasi + alasan.

## 2. Sistem visual

### Warna status (dipakai konsisten di semua layar)
| Status | Warna | Token | Contoh pemakaian |
|---|---|---|---|
| Lunas | Hijau | `--status-paid` `#16a34a` | badge, kotak kamar |
| Belum jatuh tempo | Biru | `--status-upcoming` `#2563eb` | |
| Sebagian | Oranye | `--status-partial` `#ea580c` | |
| Terlambat | Merah | `--status-overdue` `#dc2626` | |
| Menunggu verifikasi | Kuning | `--status-pending` `#ca8a04` | |
| Kosong / nonaktif | Abu-abu | `--status-muted` `#6b7280` | |

Warna selalu disertai **ikon/teks** (bukan warna saja) agar ramah buta warna. Semua token punya varian mode gelap.

### Tipografi & komponen
- Font: **Inter** (fallback system-ui). Angka uang memakai `tabular-nums`.
- Komponen dasar dari **shadcn/ui**: Card, Table, Badge, Dialog, Sheet (panel bawah di HP), Tabs, Form, Toast, Command (pencarian cepat).
- Ikon: **lucide-react**.
- Radius 12 px, spasi berbasis 4 px.

## 3. Peta halaman (sitemap)

```
Area pemilik / pengelola (login)
├─ /                       Dashboard
├─ /kamar                  Daftar & kisi kamar
│  └─ /kamar/[id]          Detail kamar + riwayat penghuni
├─ /penghuni               Daftar penghuni (aktif / alumni)
│  ├─ /penghuni/baru       Check-in (wizard 3 langkah)
│  └─ /penghuni/[id]       Profil, sewa, tagihan, pesan, komplain
├─ /tagihan                Daftar tagihan (filter periode & status)
│  └─ /tagihan/[id]        Detail tagihan, item, pembayaran
├─ /pembayaran             Semua pembayaran + tab "Perlu verifikasi"
├─ /komplain               Kanban / daftar komplain
│  └─ /komplain/[id]       Detail, foto, riwayat, komentar
├─ /pesan                  Log WA, antrian, gagal
│  ├─ /pesan/template      Edit template + pratinjau
│  └─ /pesan/broadcast     Kirim pengumuman
├─ /keuangan               Pengeluaran + laporan + ekspor   (owner)
└─ /pengaturan             Properti, rekening, tagihan & denda, pengingat, WA, tim

Portal penghuni (tanpa login, via link)
└─ /p/[token]
   ├─ Beranda: tagihan aktif + tombol bayar/upload
   ├─ Riwayat pembayaran
   ├─ Komplain (daftar + buat baru)
   └─ Info kos (aturan, kontak)
```

Navigasi: **bottom navigation** di HP (Dashboard · Kamar · Tagihan · Komplain · Lainnya), **sidebar** di desktop.

## 4. Wireframe

### 4.1 Dashboard — HP
```
┌──────────────────────────────┐
│ Kos Melati ▾        Nov 2026 ▾│
├──────────────────────────────┤
│ ┌───────────┐ ┌───────────┐  │
│ │ Diterima  │ │ Belum     │  │
│ │ Rp13,5 jt │ │ Rp4,5 jt  │  │
│ │ ██████░ 75%│ │ 3 orang   │  │
│ └───────────┘ └───────────┘  │
│ ┌───────────┐ ┌───────────┐  │
│ │ Terlambat │ │ Hunian    │  │
│ │ 2 orang 🔴│ │ 9/12  75% │  │
│ └───────────┘ └───────────┘  │
├──────────────────────────────┤
│ Perlu tindakan            (5)│
│ 🟡 Bukti bayar Kamar 07  [Cek]│
│ 🟡 Bukti bayar Kamar 11  [Cek]│
│ 🔴 Kamar 03 telat 6 hari [WA] │
│ 🔴 Kamar 09 telat 2 hari [WA] │
│ 🛠 Komplain #24 AC (Tinggi) → │
├──────────────────────────────┤
│ Status kamar bulan ini        │
│ ┌──┐┌──┐┌──┐┌──┐              │
│ │01││02││03││04│  Lt. 1       │
│ │🟢││🟢││🔴││⚪│              │
│ └──┘└──┘└──┘└──┘              │
│ ┌──┐┌──┐┌──┐┌──┐              │
│ │05││06││07││08│  Lt. 2       │
│ │🔵││🟢││🟡││🟢│              │
│ └──┘└──┘└──┘└──┘              │
├──────────────────────────────┤
│        [ + Catat Pembayaran ] │
├──────────────────────────────┤
│ 🏠    🚪    🧾    🛠    ☰     │
└──────────────────────────────┘
```

### 4.2 Dashboard — desktop
```
┌────────────┬──────────────────────────────────────────────────────────┐
│ KOSKU      │ Kos Melati ▾                       Nov 2026 ▾   👤 Faril │
│            ├──────────────────────────────────────────────────────────┤
│ 🏠 Dashboard│ [Diterima Rp13,5jt 75%] [Belum Rp4,5jt] [Telat 2] [Hunian 75%]│
│ 🚪 Kamar    ├───────────────────────────────┬──────────────────────────┤
│ 👥 Penghuni │ Status bayar per kamar        │ Perlu tindakan           │
│ 🧾 Tagihan  │ Kmr Penghuni  Tagihan  Status │ 🟡 Verifikasi 2 bukti    │
│ 💳 Pembayaran│ 01  Andi    1.500.000  🟢Lunas│ 🔴 Telat: Kmr 03, 09     │
│ 🛠 Komplain │ 03  Sinta   1.500.000  🔴Telat│ 🛠 Komplain baru: 1      │
│ 💬 Pesan WA │ 05  Rudi    1.800.000  🔵10 Nov│ ⚠ WA gagal: 0            │
│ 📊 Keuangan │ 07  Dewi    1.500.000  🟡Cek  ├──────────────────────────┤
│ ⚙ Pengaturan│ ...                           │ Pemasukan 12 bulan       │
│            │                               │ ▁▃▅▆▇▇▆▇█▇▇▆            │
└────────────┴───────────────────────────────┴──────────────────────────┘
```

### 4.3 Verifikasi bukti bayar (sheet dari bawah)
```
┌──────────────────────────────┐
│ Verifikasi Pembayaran      ✕ │
├──────────────────────────────┤
│ Kamar 07 · Dewi Lestari       │
│ Tagihan Nov 2026  Rp1.500.000 │
│ Dibayar           Rp1.500.000 │
│ Metode: Transfer BCA          │
│ ┌──────────────────────────┐ │
│ │   [ foto bukti transfer ] │ │
│ │      ketuk untuk zoom     │ │
│ └──────────────────────────┘ │
│ Catatan penghuni: "sudah tf"  │
│                               │
│ [ Tolak ]   [ ✓ Verifikasi ]  │
└──────────────────────────────┘
```

### 4.4 Check-in penghuni (wizard)
```
Langkah 1/3 — Pilih kamar        Langkah 2/3 — Data penghuni     Langkah 3/3 — Sewa
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│ Kamar kosong:          │      │ Nama lengkap*          │      │ Tanggal masuk*  5/11/26│
│ ○ 04  Standar  1,5 jt  │      │ No. WhatsApp*  +62 ... │      │ Harga/bulan* 1.500.000 │
│ ● 10  AC       1,8 jt  │      │ NIK                    │      │ Tanggal tagih*    5    │
│ ○ 12  AC+KM    2,2 jt  │      │ Foto KTP   [Upload]    │      │ Deposit        500.000 │
│                        │      │ Kontak darurat         │      │ ☑ Prorata bulan pertama│
│                        │      │                        │      │ ☑ Kirim WA sambutan    │
│          [Lanjut →]    │      │   [← Kembali][Lanjut →]│      │  [← Kembali][Simpan ✓] │
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
```

### 4.5 Portal penghuni
```
┌──────────────────────────────┐
│ 🏠 Kos Melati                 │
│ Halo, Dewi · Kamar 07         │
├──────────────────────────────┤
│ Tagihan November 2026         │
│ Rp1.500.000                   │
│ Jatuh tempo 10 Nov 2026 🔵    │
│                               │
│ Transfer ke:                  │
│ BCA 1234567890  [Salin]       │
│ a.n. Budi Santoso             │
│                               │
│ [ 📷 Upload Bukti Bayar ]     │
├──────────────────────────────┤
│ 🛠 Lapor Masalah           →  │
│ Komplain #24 AC — Diproses 🟠 │
├──────────────────────────────┤
│ Riwayat pembayaran         →  │
│ Info & aturan kos          →  │
│ 💬 Hubungi pengelola (WA)     │
└──────────────────────────────┘
```

### 4.6 Komplain — kanban (desktop) / tab (HP)
```
┌─ Baru (2) ──────┐┌─ Diproses (1) ──┐┌─ Selesai (12) ──┐
│ #25 🔴 Darurat  ││ #24 🟠 Tinggi   ││ #23 Lampu kamar │
│ Air mati Lt.2   ││ AC kamar 07     ││ mandi 03  ⭐5   │
│ 10 mnt lalu     ││ Teknisi: Pak Joko││ ...             │
├─────────────────┤└─────────────────┘└─────────────────┘
│ #26 🟢 Rendah   │
│ WiFi lambat     │
└─────────────────┘
```

## 5. Status kosong, error, dan loading
- **Kosong**: ilustrasi kecil + ajakan, mis. "Belum ada kamar. [+ Tambah kamar pertama]".
- **Loading**: skeleton (bukan spinner) untuk kartu & tabel.
- **Error**: pesan manusiawi + tombol coba lagi. Error validasi tampil di bawah field.
- **Offline**: banner "Kamu sedang offline, perubahan belum tersimpan".

## 6. Onboarding pemilik baru
1. Daftar → buat properti (nama, alamat, kode).
2. Tambah rekening bank.
3. Tambah kamar (bisa massal: "Lantai 1: kamar 01–04, Rp1.500.000").
4. Check-in penghuni yang sudah ada (tanggal masuk lama diperbolehkan; opsi "jangan buat tagihan bulan lalu").
5. Hubungkan WhatsApp (masukkan token Fonnte, kirim pesan uji).
6. Selesai, tampil dashboard.

## 7. Aksesibilitas
- Kontras teks ≥ 4.5:1 (WCAG AA), target sentuh ≥ 44 px.
- Semua input punya label, form bisa dioperasikan dengan keyboard.
- Ukuran teks dasar 16 px di HP.
