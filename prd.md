# Product Requirements Document (PRD)
# Sistem Informasi Operasional IGD RSUD Subang

## 1. Identitas Dokumen
- **Nama Produk:** Sistem Informasi Operasional IGD RSUD Subang
- **Versi:** 1.0 (Production / Active)
- **Tipe Aplikasi:** Single Page Application (SPA) Web App
- **Lingkungan Produksi:** Google Apps Script (GAS) Web App & Google Workspace Ecosystem
- **Motto Operasional:** *Cepat - Akurat - Komprehensif - Edukatif - Profesional*

---

## 2. Latar Belakang & Tujuan
Instalasi Gawat Darurat (IGD) RSUD Subang memerlukan sistem digital terpusat, cepat, dan terintegrasi untuk mencatat dan memonitor data operasional kegawatdaruratan sehari-hari secara real-time. Sistem ini dibangun untuk menggantikan pencatatan manual serta rekapitulasi terpisah yang rentan terhadap inkonsistensi data, selisih perhitungan, dan keterlambatan pelaporan.

### Tujuan Utama:
1. **Pencatatan Cepat & Terstruktur:** Memudahkan petugas triage, perawat, dan dokter jaga mencatat data pasien per shift.
2. **Validasi Matematis Real-time:** Menghilangkan kesalahan penghitungan selisih retensi pasien dan target sismadak sebelum data tersimpan.
3. **Pemantauan Kapasitas Ruang Retensi:** Memonitor utilisasi tempat tidur observasi/retensi IGD (kapasitas 40 tempat tidur) setiap pergantian waktu operasional.
4. **Kesiapsiagaan Bencana & Posko Khusus:** Menyediakan modul pemantauan untuk Kejadian Luar Biasa (KLB) dan pelayanan siaga Idul Fitri.
5. **Otomasi Pelaporan Eksternal:** Menghasilkan laporan Excel (.xlsx) per periode dan dokumen dinas Microsoft Word (.docx) siap cetak secara instan.

---

## 3. Profil Pengguna & Hak Akses (User Roles)

| Role | Kredensial / Metode Auth | Hak Akses & Kemampuan Sistem |
| :--- | :--- | :--- |
| **Super Admin** | Akun utama (`admin`) atau user dengan peran `Super Admin` di sheet `USERS`. | - Akses penuh ke seluruh menu (Beranda, Kunjungan, Life Saving, KLB, Retensi, Idul Fitri, Users, Inventaris, Setting).<br>- Pengelolaan pengguna (CRUD Users) & Setting khusus (Slideshow, Running Text).<br>- Tambah, Ubah, Hapus data dan Ekspor di semua modul. |
| **Admin / Petugas IGD** | Login via Nama Pengguna & Password yang terdaftar pada sheet database `USERS`. | - Akses default ke semua menu kecuali Users dan Setting (`Beranda, Kunjungan, Life Saving, KLB, Retensi, Idul Fitri, Inventaris`).<br>- Tambah data (Create), Ubah data (Update), dan Hapus data (Delete).<br>- Ekspor data Excel (.xlsx) di semua modul yang diotorisasi.<br>- Ekspor Dokumen Word (.docx) pada modul Retensi. |
| **User / Petugas Klinis** | Login via Nama Pengguna & Password yang terdaftar pada sheet database `USERS`. | - Akses ke menu yang diotorisasikan (default: `Beranda, Kunjungan, Life Saving, KLB, Retensi, Idul Fitri`).<br>- Hak Akses Penuh: Tambah data (Create), Ubah data (Update), dan Hapus data (Delete).<br>- Ekspor data Excel (.xlsx) di semua modul yang diotorisasi.<br>- Ekspor Dokumen Word (.docx) pada modul Retensi.<br>- Akun login instan `visitor / 127` telah dihapus secara permanen. |

---

## 4. Arsitektur Teknis & Pola Desain

### 4.1 Frontend Architecture
- **Struktur Berkas:** 100% Single File Integrity (`Index.html`) mencakup markup HTML5 semantik, CSS custom variables bertema Tosca Medical Gradient, dan Vanilla JavaScript murni.
- **Library Client-Side:** SheetJS CDN (`xlsx.full.min.js`) untuk perakitan berkas spreadsheet client-side.
- **Komunikasi Data:** Memanfaatkan protokol Google Apps Script Remote Procedure Call (`google.script.run`) untuk seluruh interaksi data backend. Tidak ada panggilan REST API, fetch, atau XMLHttpRequest ke internet publik.
- **Mode Pratinjau Lokal & Mock Engine:** Dilengkapi dengan polyfill transparan yang aktif otomatis jika berkas dibuka di luar Google Apps Script (misalnya pengujian Playwright atau browser lokal). Data simulasi disimpan persisten di `localStorage`.

### 4.2 Backend Architecture
- **Script Engine:** Google Apps Script (`Kode.gs`) V8 Runtime.
- **Database Engine:** Google Sheets melalui layanan `SpreadsheetApp`.
  - Serialisasi data aman menggunakan metode `getDisplayValues()` untuk menjaga format teks tanggal tanpa galat pergeseran zona waktu.
- **Media & Ekspor Dokumen:**
  - Google Drive (`DriveApp`): Mengambil dan mengelola 9 foto slideshow dari folder ID khusus (`SLIDESHOW_FOLDER_ID`: `1R6S-RavuW1z6RO3g_CcBvU2kqbhgAycj`) dengan konversi otomatis ke link thumbnail resolusi ultra tinggi (`sz=w1920`) serta folder berkas umum/ekspor (`FOLDER_ID`: `1OlYaZMxUOQFGmS1L_R9t2p45ZcKr3v9K`).
  - Google Docs (`DocumentApp`): Membuat salinan dokumen template Word (`templateId`), melakukan penggantian tag placeholder regex secara cepat, mengonversi ke format `.docx`, dan mengembalikan data dalam bentuk payload Base64 instan ke frontend.
  - Subfolder `Temp_Exports` & Pembersihan Otomatis (Auto-Cleanup): Berkas ekspor sementara yang berusia lebih dari 24 jam otomatis dibersihkan ke tempat sampah (Trash).

### 4.3 Optimasi Sinkronisasi & Server Cache
- **Peta Revisi Global & Fingerprinting:** Backend mengelola revisi per-sheet di `PropertiesService` (kunci `IGD_REV_MAP`) yang diincrement secara atomik pada setiap mutasi `saveData` dan `deleteData`. Fingerprint dihitung sebagai `revisi:lastRow`.
- **Delta Synchronization:** `getAllSheetsData(token, clientRevs)` membandingkan fingerprint klien dengan server; sheet yang tidak mengalami perubahan diabaikan dari pembacaan fisik maupun transfer payload data.
- **Server-Side Caching (`CacheService`):** Data tiap sheet disimpan dalam `CacheService.getScriptCache()` bertanda kunci fingerprint (TTL 300 detik), mencegah pembacaan ulang SpreadsheetApp berulang saat banyak pengguna mengakses bersamaan.
- **Smart Client Re-sync:** Klien `Index.html` mempertahankan status `SYNC_REVS` dan secara otomatis memicu sinkronisasi latar belakang saat pengguna beralih kembali ke tab aplikasi (`visibilitychange`).

---

## 5. Rincian Modul & Fitur Aplikasi

### 5.1 Layanan Pembuka & Autentikasi
1. **Splash Screen Interaktif:**
   - Menampilkan logo resmi IGD RSUD Subang dengan animasi detak nadi (*pulse*).
   - Tampil selama 2 detik saat inisialisasi aplikasi, kemudian meluruh (*fade out*).
2. **Sistem Login:**
   - Validasi kredensial pengguna terhadap sheet `USERS`.
   - Ikon mata (`👁️`) untuk beralih antara teks dan sandi tersembunyi.
   - Pengecekan otomatis sesi aktif di `localStorage` atau `sessionStorage` (`rsud_user`).
   - Checkbox **Remember Me** pada form login untuk mengingat nama pengguna (prefill otomatis) dan mempertahankan sesi login persisten di `localStorage`. Jika tidak dicentang, sesi hanya disimpan sementara di `sessionStorage`.
   - Jam digital real-time di header dengan format Bahasa Indonesia dan zona waktu WIB.

### 5.2 Modul Beranda (Dashboard & Slideshow)
- Kartu galeri dinamis yang memuat foto-foto sarana, kegiatan, dan instruksi internal IGD dari Google Drive.
- Animasi transisi geser horizontal otomatis setiap 3 detik.
- **Ringkasan Operasional Cepat IGD (Real-time Cards):**
  - Kunjungan IGD Hari Ini: Total Pasien Triage serta rincian kategori (Non Bedah, Bedah, Anak, Kebidanan).
  - Ruang Retensi / Observasi: Kapasitas tempat tidur IGD (40 TT), Pasien Observasi Hari Ini, dan Estimasi TT Kosong secara real-time.
  - Kendala Fasilitas (Life Saving): Pasien terkendala alat resusitasi/ventilator hari ini dan akumulasi bulan berjalan.
  - Kejadian Luar Biasa (KLB): Kasus keracunan/wabah/kasus luar biasa yang tercatat aktif.

### 5.3 Modul Kunjungan (Pelayanan & Triage Pasien)
Merupakan inti operasional pencatatan alur pasien per shift (Pagi, Sore, Malam).

#### A. Wizard Input Data (6 Tahap Form)
Form pengisian menggunakan sistem navigasi bertahap untuk menjaga fokus pengisian:
1. **Tahap 1: Data Dasar:** NO, ID (otomatis acak 6 karakter unik), TANGGAL, SHIFT (Pagi, Sore, Malam), KATEGORI PASIEN (Anak, Bedah, Non Bedah, Kebidanan).
2. **Tahap 2: Triage:** JUMLAH RETENSI SEBELUMNYA, RESUSITASI, EMERGENT, URGENT, SEMI URGENT, NON URGENT, TOTAL PASIEN (terhitung otomatis).
3. **Tahap 3: Distribusi Pasien:** IBS, ICU, HCU, RAWAT ISOLASI, PINDAH RAWAT INAP, ALIH RAWAT, RUJUK, PULPAK, PULANG, MENINGGAL (< 8 Jam, 8-24 Jam, > 24 Jam), DOA, JUMLAH RETENSI HARI INI (terhitung otomatis).
4. **Tahap 4: Kasus Khusus:** KLL, KLL Cipali, Non KLL, Visum, Snake Bite, Luka Bakar, HbsAg, B20, Datang Sendiri, Rujukan SpOG, Dokter Umum, Klinik, Puskesmas, Bidan, RS Lain, Kabupaten Lain.
5. **Tahap 5: Alasan Retensi:** 19 kategori alasan penundaan transfer pasien ke ruang rawat inap.
6. **Tahap 6: Sismadak:** Standar Akreditasi Rumah Sakit (Masuk Ranap < 6 Jam dan Masuk Ranap > 6 Jam).

#### B. Aturan Validasi Khusus (Save Blockers) & Proteksi Data
- **Validasi Alasan Retensi:**
  $$\text{Selisih} = \text{Retensi Hari Ini} - \sum(\text{Seluruh Alasan Retensi}) = 0$$
- **Validasi Sismadak:**
  $$\text{Selisih} = (\text{IBS} + \text{ICU} + \text{HCU} + \text{Rawat Isolasi} + \text{Pindah Rawat Inap}) - \sum(\text{Sismadak}) = 0$$
- **Validasi Urutan Shift (Pagi -> Sore -> Malam):** Setiap tanggal wajib mengisi urutan shift secara berurutan. Shift `Sore` hanya dapat diisi jika shift `Pagi` pada tanggal yang sama telah lengkap mengisi ke-4 kategori pasien (`Anak`, `Bedah`, `Non Bedah`, `Kebidanan`). Demikian juga shift `Malam` hanya dapat diisi jika shift `Pagi` dan `Sore` telah lengkap. Apabila belum lengkap, sistem menampilkan peringatan inline, mengunci tombol Simpan Data (`Urutan Shift Belum Lengkap ⚠️`), serta menolak penyimpanan di mock engine dan backend `Kode.gs`. Mode edit (pembaruan data lama) dikecualikan dari pemblokiran ini.
- **Pencegahan Duplikasi Shift (Client & Server, Insert & Update):** Kombinasi `TANGGAL + SHIFT + KATEGORI PASIEN` tidak boleh duplikat. Sistem klien otomatis memvalidasi secara real-time, mengunci tombol Simpan Data (`Duplikasi Data ⚠️`), serta merefresh pengecekan pasca sinkronisasi background. Backend `Kode.gs` dan mock engine memvalidasi keunikan baik saat tambah data baru maupun saat edit/update (dengan normalisasi format tanggal seragam dan pengecualian ID baris sendiri) dengan perlindungan konkurensi `LockService`.
- **Auto-Pilih Kombinasi Kosong:** Saat membuka form Tambah Data, sistem otomatis mendeteksi dan memilih kombinasi Shift dan Kategori Pasien yang belum terisi pada tanggal tersebut.
- **Navigasi Otomatis Tab Bermasalah:** Jika pengguna mencoba menyimpan dengan selisih validasi yang belum nol, form otomatis berpindah ke tab Alasan Retensi (Tab 5) atau Sismadak (Tab 6) disertai notifikasi petunjuk.
- **Otomatisasi Sisa Retensi:** Tombol *“Ambil Sisa Retensi Shift Sebelumnya”* yang mencari data shift terakhir secara kronologis sesuai kategori pasien dan mengisikannya ke kolom `JUMLAH RETENSI SEBELUMNYA`.

#### C. Tampilan Tabel & Fitur Analitik
- **Filter Multi-Kriteria:** Filter Tahun, Bulan, Shift, Kategori Pasien, serta kotak pencarian instan ID/Teks. Filter diterapkan secara real-time saat pilihan dropdown diubah.
- **Indikator Waktu Sinkronisasi:** Menampilkan jam terakhir kali data berhasil disinkronkan dengan Google Sheets.
- **Pembedaan Pesan Tabel:** Membedakan antara *"Tidak ada data pada periode / filter yang dipilih"* dan *"Belum Ada Data"*.
- **Triple Sticky Columns:**
  - Kolom 1 (Kiri 0px): Tombol Aksi (Edit & Hapus).
  - Kolom 2 (Kiri 90px): TANGGAL.
  - Kolom 3 (Kiri 230px): SHIFT dengan garis pembatas toska tegas.
- Kolom selebihnya bergulir horizontal bebas.

### 5.4 Modul Life Saving
- **Fungsi:** Mendata pasien gawat darurat yang menghadapi kendala keterbatasan alat/ruang resusitasi.
- **Atribut:** No, ID, Tanggal, Shift, Nama Pasien, No CM, Jenis Kelamin (L/P), Umur, Keterangan (Ruang Resusitasi Penuh, Ventilator Tidak Tersedia, Inkubator Tidak Tersedia, Infuse Pump Tidak Tersedia, Syringe Pump Tidak Tersedia).
- **Proteksi Data & Validasi Input:**
  - Validasi field wajib: Tanggal, Nama Pasien, dan No CM wajib diisi sebelum data dapat disimpan.
  - Koersi angka otomatis: Field Umur otomatis dibulatkan dan dipastikan bernilai $\ge 0$.
  - Pencegahan Duplikasi (Client & Server): Kombinasi `TANGGAL + SHIFT + NAMA PASIEN` atau `TANGGAL + SHIFT + NO CM` dicegah ganda. Antarmuka menampilkan peringatan merah dan menonaktifkan tombol Simpan (`Duplikasi Data ⚠️`), serta divalidasi keunikannya di `Kode.gs` via `LockService`.
- **Filter Multi-Kriteria:** Filter Tahun, Bulan, Shift (Pagi, Sore, Malam), Keterangan Kendala Alat/Ruangan, serta kotak pencarian instan (ID, Nama Pasien, No CM).
- **Ekspor Excel:** Mendukung ekspor data terfilter sesuai kombinasi Tahun, Bulan, Shift, Keterangan, dan kata kunci pencarian.

### 5.5 Modul Kejadian Luar Biasa (KLB)
- **Fungsi:** Pelaporan insiden masal, wabah, atau keracunan.
- **Atribut:** No, ID, Kejadian, Tanggal Masuk, Jam Masuk, No CM, Nama Pasien, Jenis Kelamin (L/P), Umur, Alamat Lengkap, Keadaan Umum (Luka Ringan/Sedang/Berat, Sakit Ringan/Sedang/Berat, DOA), Diagnosa, Tanggal Keluar, Jam Keluar, Keterangan Tindak Lanjut.
- **Proteksi Data & Validasi Input:**
  - Validasi field wajib: Kejadian, Tanggal Masuk, Jam Masuk, dan Nama Pasien wajib diisi sebelum data dapat disimpan.
  - Normalisasi format Jam otomatis: Jam masuk dan jam keluar diformat seragam menjadi `HH.mm` (contoh: `08.00`, `14.30`).
  - Validasi urutan waktu: Tanggal Keluar tidak boleh lebih awal dari Tanggal Masuk (dan Jam Keluar tidak boleh lebih awal jika pada hari yang sama).
  - Default Tanggal Keluar dikosongkan pada form baru untuk menghindari kesalahan pencatatan pasien yang masih dalam observasi/rawat.
  - Pencegahan Duplikasi (Client & Server): Pasien dengan kombinasi `KEJADIAN + TANGGAL MASUK + NO CM` atau `KEJADIAN + TANGGAL MASUK + NAMA PASIEN` dicegah ganda. Antarmuka menampilkan peringatan merah dan menonaktifkan tombol Simpan (`Duplikasi Data ⚠️`), serta divalidasi keunikannya di `Kode.gs` via `LockService`.
- **Filter Multi-Kriteria:**
  - Filter rentang tanggal (Date Range), bulan & tahun, nama kejadian, keterangan akhir, serta kotak pencarian instan (ID, Nama Pasien, No CM, Kejadian, Diagnosa).
  - Seluruh filter di KLB terintegrasi `normalizeDateStr()` dan otomatis ter-render seketika saat parameter diubah.
- **Summary Cards Dinamis:**
  - Ringkasan total Jenis Kelamin (L/P) dan penanda jumlah data belum terisi.
  - Ringkasan distribusi Keadaan Umum.
  - Ringkasan status keluar / tindak lanjut pasien.

### 5.6 Modul Retensi (Observasi Pasien IGD)
- **Fungsi:** Evaluasi kapasitas tempat tidur observasi IGD yang dilaporkan 2 kali sehari:
  - Pukul `07:00 WIB` (Laporan Pagi)
  - Pukul `19:00 WIB` (Laporan Malam)
- **Atribut:** No, ID, Tanggal, Jam Laporan, Total Pasien Observasi, Rincian Kasus Anak, Rincian Kasus Bedah, Rincian Kasus Non Bedah, Rincian Kasus Kebidanan.
- **Proteksi Data & Validasi Input:**
  - Validasi field wajib: Tanggal Laporan, Jam Laporan, dan Total Pasien (angka non-negatif) wajib diisi sebelum data dapat disimpan.
  - Validasi rincian kasus: Jika Total Pasien > 0, form mewajibkan minimal salah satu rincian kasus (Anak, Bedah, Non Bedah, Kebidanan) terisi agar data observasi akuntabel.
  - Pencegahan Duplikasi (Client & Server): Kombinasi `TANGGAL + JAM` tidak boleh ganda (dilengkapi normalisasi format jam). Antarmuka menampilkan peringatan merah dan menonaktifkan tombol Simpan (`Duplikasi Data ⚠️`), serta divalidasi keunikannya di backend `Kode.gs` via `LockService`.
- **Filter & Pencarian Instan:**
  - Filter Tahun dan Bulan auto-apply seketika saat diubah.
  - Filter Jam Laporan spesifik (Semua Jam, 07:00 WIB, 19:00 WIB).
  - Kotak pencarian instan (ID, Tanggal, Jam, Total Pasien, maupun teks rincian kasus).
  - Ekspor Excel terintegrasi akurat dengan parsing `normalizeDateStr()`, filter jam, dan pencarian teks.
- **Formatting Otomatis Teks Kasus:** Membersihkan whitespace berlebih, menstandarisasi penomoran urut atau poin peluru, serta secara cerdas mendeteksi baris judul/kategori (ANAK, BEDAH, DALAM, KEBIDANAN) untuk menghilangkan angka penomoran '1.' di baris judul sehingga penomoran rincian penyakit di bawahnya rapi dimulai dari urutan 1 (1., 2., dst).
- **Ekspor Dokumen Word (.docx):**
  - Menggantikan penanda template (`{{TANGGAL}}`, `{{JAM}}`, `{{TOTAL_PASIEN}}`, `{{PERSENTASE}}`, serta rincian data kasus `{{KASUS_ANAK}}`, `{{KASUS_BEDAH}}`, `{{KASUS_NON_BEDAH}}`, `{{KASUS_KEBIDANAN}}` yang menampilkan seluruh daftar rincian kasus dengan penomoran rapi; didukung pula penanda alternatif `{{JUMLAH_...}}` untuk angka jumlah).
  - Menghitung persentase okupansi berdasarkan kapasitas tempat tidur:
    $$\text{Persentase} = \left(\frac{\text{Total Pasien}}{\text{KAPASITAS\_TT\_RETENSI (40)}}\right) \times 100\%$$
  - Pengunduhan dokumen binary instan via Blob dengan nama berkas aman tersanitasi serta perlindungan safety timeout ekspor.

### 5.7 Modul Idul Fitri (Posko Siaga Mudik)
- **Fungsi:** Registrasi pasien khusus posko kesehatan arus mudik dan balik lebaran.
- **Atribut:** Tahun Posko, Tanggal/Jam Masuk, Identitas, Alamat, Keadaan Umum, Diagnosa, Tanggal/Jam Keluar, Keterangan Akhir.
- **Validasi & Proteksi Duplikat:**
  - Validasi field wajib: Tahun, Tanggal Masuk, Jam Masuk (format `08.00`), dan Nama Pasien.
  - Tanggal/Jam Keluar harus $\ge$ Tanggal/Jam Masuk jika diisi.
  - Pencegahan duplikasi real-time `TAHUN + TANGGAL MASUK + (NAMA PASIEN / CM)` di client, mock, dan server (`Kode.gs`).
- **Summary Cards:** Agregasi pasien berdasarkan gender (Laki-laki, Perempuan, Belum Diisi), keadaan umum, dan disposisi akhir.

### 5.8 Modul Inventaris (Alat Kesehatan, Alat Tenun, Alat Rumah Tangga)
- **Fungsi:** Pencatatan dan monitoring aset sarana dan prasarana IGD RSUD Subang terbagi ke dalam 3 kategori:
  1. **Inventaris Alat Kesehatan:** Alat medis, monitor, ventilator, syringe pump, infus pump, dll.
  2. **Inventaris Alat Tenun:** Sprei, selimut, perlak, baju operasi, sarung bantal, dll.
  3. **Inventaris Alat Rumah Tangga:** Lemari, meja, kursi, brankar, AC, dispenser, dll.
- **Atribut:** No, ID, Nama Barang, Merk/Model/Type, Tahun Perolehan, No. Kode Barang, Harga Beli/Perolehan (nominal), Kondisi Baik (B), Kondisi Rusak Berat (RB), Jumlah Barang / Register (otomatis B + RB), Keterangan, Penanggung Jawab Ruangan (Nama & NIP).
- **Kalkulasi Otomatis:** Perubahan nilai kondisi Baik atau Rusak Berat seketika menghitung kolom Jumlah Barang secara real-time.
- **Download Inventaris:** Fasilitas unduh kompilasi berkas Excel gabungan untuk pelaporan aset berkala ke bagian logistik/sarana rumah sakit.
- **Hak Akses & Otorisasi:** Dapat diakses oleh Super Admin dan Admin yang memiliki kunci otorisasi 'Inventaris' pada kolom OTORISASI (otomatis aktif secara default untuk Admin baru/lama, dan disembunyikan untuk Visitor).

### 5.9 Modul Setting (Slideshow, Running Text, & Backup Database)
- **Menu Setting:** Terletak di sidebar di bawah menu Users dengan tiga sub menu:
  - **Slideshow:** Mengelola foto slideshow Beranda dengan kuota tepat 9 foto dan standar dimensi 440 × 320 px.
    - **Penyimpanan Cloud:** Tersimpan langsung di Google Drive folder `1R6S-RavuW1z6RO3g_CcBvU2kqbhgAycj`.
    - **Slot Grid 3×3:** Menampilkan 9 slot foto interaktif (Foto 1 s/d 9) dengan status badge `✓ Siap (HD)` atau `Kosong`.
    - **Tombol Upload / Ganti:** Pengguna dapat mengunggah foto baru pada slot kosong atau mengganti foto pada slot yang telah terisi.
    - **Pemotongan Manual & Optimasi Anti-Pecah (Ultra Hi-DPI):** Mempertahankan rasio presisi 440 : 320 (11 : 8). Jika ukuran atau rasio foto yang diunggah belum sesuai, sistem otomatis membuka modal crop interaktif dengan panduan *Rule-of-Thirds* 3×3, kontrol zoom, dan reset posisi. Foto diproses dan diekspor menggunakan kanvas Ultra Hi-DPI (resolusi tinggi 1320 × 960 px, 1760 × 1280 px hingga maksimal 2640 × 1920 px dengan multiplier 3×, 4×, 6×) dengan interpolasi *bicubic smoothing* (`imageSmoothingQuality: 'high'`) dan kualitas JPEG premium 0.95, sehingga foto sangat tajam, jernih, dan tidak pecah saat ditampilkan di layar besar / monitor 4K & proyektor. Google Drive melayani thumbnail dalam resolusi tinggi `sz=w1920`. Foto berukuran pas 440 × 320 px otomatis di-upscale ke 1760 × 1280 px (4×), sedangkan foto yang sudah proporsional 11 : 8 dipertahankan hingga batas maksimal 2640 px.
    - **Pengaturan Durasi:** Opsi interval transisi Beranda (2s, 3s, 5s, 7s, 10s) tersimpan di `localStorage`.
    - **Navigasi & Tombol Tutup:** Dilengkapi tombol x (Close) pada header dan card untuk kembali ke modul sebelumnya.
  - **Running Text:** Mengatur teks berjalan / ticker banner pengumuman operasional di bagian atas aplikasi. Dilengkapi switch toggle aktif/nonaktif, textarea pesan kustom, pilihan kecepatan (lambat, sedang, cepat), tema warna (Tosca, Amber, Merah, Biru), tombol reset standar, live preview interaktif, serta tombol x (Close) pada header dan card form untuk menutup tampilan dan kembali ke modul sebelumnya.
  - **Backup Database:** Menyalin seluruh spreadsheet database operasional (`16abr7-2np5jY5uG6G16fAjDPoFa_4wVUHxVxxsv3PWw` - seluruh sheet aktif) ke Google Drive folder `1Y7HY4BO5NtEdJ7Y8ds68WJwoeffECKqR` dengan format nama berkas terstandarisasi `YYYY-MM-DD_Backup Database IGD` (dengan sufiks jam otomatis jika dicadangkan ganda pada hari yang sama). Dilengkapi tombol "Mulai Backup Sekarang", indikator progres/loading, tombol segarkan riwayat, serta tabel daftar riwayat file backup di Google Drive lengkap dengan tanggal pembuatan dan tautan langsung untuk membuka file backup di Google Spreadsheet.
- **Hak Akses:** Hanya dapat diakses oleh Super Admin (otomatis disembunyikan untuk peran Admin dan Visitor). Pengubahan running text, upload/hapus foto slideshow, serta eksekusi dan pembacaan riwayat backup database dibatasi mutlak khusus Super Admin.

### 5.10 Fitur Global Tabel, Aksesibilitas & Proteksi Hapus
- Paginasi client-side di seluruh tabel: pilihan 10, 20, 50, 100, atau Semua Data per halaman.
- Dialog konfirmasi hapus data berbasis modal visual kustom dengan deteksi ketergantungan shift operasional.
- **Fitur "Urungkan" Hapus (Undo Delete):** Setelah data dihapus, sistem menampilkan toast notifikasi interaktif selama 6 detik dengan tombol "Urungkan" yang dapat memulihkan kembali data yang baru terhapus.
- **Aksesibilitas & Keyboard Navigation:** Dukungan tombol Escape untuk menutup seluruh modal, fokus visual tegas (`:focus-visible`), serta atribut ARIA (`role="dialog"`, `role="alertdialog"`, `aria-live="polite"`).
- Ekspor spreadsheet Excel (.xlsx) di semua modul dengan format nama berkas standar terstruktur tanggal/filter (termasuk opsi filter Semua Tahun dan Semua Bulan).

---

## 6. Spesifikasi Skema Database Google Sheets

### 6.1 Sheet `USERS` (7 Kolom Terstandarisasi)
| Indeks Kolom | Nama Kolom | Tipe Data |
| :---: | :--- | :--- |
| 0 | NO | Number (Auto Renumber) |
| 1 | ID | Text (Unique ID) |
| 2 | NAMA | Text (Username) |
| 3 | PASSWORD | Text (Password) |
| 4 | HAK AKSES | Text (`Super Admin` / `Admin` / `Visitor`) |
| 5 | Email | Text (Email Pengguna) |
| 6 | OTORISASI | Text (Comma-separated daftar menu. Default Super Admin: Semua menu + Setting; Admin: Beranda,Kunjungan,Life Saving,KLB,Retensi,Idul Fitri,Inventaris; User/Visitor: Beranda,Kunjungan,Life Saving,KLB,Retensi,Idul Fitri) |

### 6.2 Sheet `KUNJUNGAN` (63 Kolom Terstandarisasi)
1. NO
2. ID
3. TANGGAL
4. SHIFT
5. KATEGORI PASIEN
6. JUMLAH RETENSI SEBELUMNYA
7. RESUSITASI
8. EMERGENT
9. URGENT
10. SEMI URGENT
11. NON URGENT
12. TOTAL PASIEN
13. IBS
14. ICU
15. HCU
16. RAWAT ISOLASI
17. PINDAH RAWAT INAP
18. ALIH RAWAT
19. RUJUK
20. PULPAK
21. PULANG
22. MENINGGAL KURANG 8 JAM
23. MENINGGAL 8-24 JAM
24. MENINGGAL LEBIH 24 JAM
25. DOA
26. JUMLAH RETENSI HARI INI
27. KLL
28. KLL CIPALI
29. NON KLL
30. VISUM
31. SNAKE BITE
32. LUKA BAKAR
33. HBSAG
34. B 20
35. DATANG SENDIRI
36. SPOG
37. DR UMUM
38. KLINIK
39. PUSKESMAS
40. BIDAN
41. RS LAIN
42. KABUPATEN LAIN
43. KURANG DARI 6 JAM NUNGGU HASIL PENUNJANG
44. KURANG DARI 6 JAM NUNGGU JAWABAN KONSUL DPJP
45. RESUSITASI KURANG DARI 6 JAM
46. RESUSITASI LEBIH DARI 6 JAM TIDAK TRANSPORTABLE
47. RESUSITASI LEBIH DARI 6 JAM NUNGGU JAWABAN DPJP
48. RESUSITASI LEBIH DARI 6 JAM BELUM MENDAPATKAN RS TUJUAN RUJUK
49. RESUSITASI LEBIH DARI 6 JAM RUANG INTENSIVE PENUH
50. RESUSITASI LEBIH DARI 6 JAM BELUM ADA PERSETUJUAN DARI DPJP INTENSIVE
51. RESUSITASI LEBIH DARI 6 JAM BELUM ADA KEPUTUSAN KELUARGA
52. LEBIH DARI 6 JAM NUNGGU JAWABAN KONSUL DPJP
53. RUANGAN JENIS KELAMIN TERTENTU PENUH
54. RUANG ISOLASI PENUH
55. OBSERVASI 6 JAM JIKA KONDISI BAIK BOLEH PULANG
56. SEDANG ANTRI DI ADMISI
57. BELUM ADA KEPUTUSAN KELUARGA UNTUK DI LAKUKAN OPERASI
58. ALAT ALAT KHUSUS TIDAT TERSEDIA DI RUANG RAWAT INAP
59. RUANGAN SESUAI HAK KELASNYA PENUH
60. REGULATOR TIDAK TERSEDIA DI RUANGAN
61. INFUS BELUM BERHASIL
62. MASUK RANAP KURANG DARI 6 JAM
63. MASUK RANAP LEBIH DARI 6 JAM

### 6.3 Sheet `LIFE SAVING`
1. NO | 2. ID | 3. TANGGAL | 4. SHIFT | 5. NAMA PASIEN | 6. CM | 7. JENIS KELAMIN | 8. UMUR | 9. KETERANGAN

### 6.4 Sheet `KLB`
1. NO | 2. ID | 3. KEJADIAN | 4. TANGGAL MASUK | 5. JAM MASUK | 6. CM | 7. NAMA PASIEN | 8. JENIS KELAMIN | 9. UMUR | 10. ALAMAT LENGKAP | 11. KEADAAN UMUM | 12. DIAGNOSA | 13. TANGGAL KELUAR | 14. JAM KELUAR | 15. KETERANGAN

### 6.5 Sheet `RETENSI`
1. NO | 2. ID | 3. TANGGAL | 4. JAM | 5. TOTAL PASIEN | 6. KASUS ANAK | 7. KASUS BEDAH | 8. KASUS NON BEDAH | 9. KASUS KEBIDANAN

### 6.6 Sheet `IDUL FITRI`
1. NO | 2. ID | 3. TAHUN | 4. TANGGAL MASUK | 5. JAM MASUK | 6. CM | 7. NAMA PASIEN | 8. JENIS KELAMIN | 9. UMUR | 10. ALAMAT LENGKAP | 11. KEADAAN UMUM | 12. DIAGNOSA | 13. TANGGAL KELUAR | 14. JAM KELUAR | 15. KETERANGAN

---

## 7. Persyaratan Non-Fungsional (NFR)
1. **Kecepatan & Responsivitas:**
   - Halaman SPA harus memuat data secara asinkron tanpa memblokir antarmuka pengguna.
   - Pemanfaatan cache client-side (`CACHE`) agar perpindahan antar-tab menu berlangsung instan.
2. **Kesesuaian Mobile (Mobile-First Operational):**
   - Area ketuk (*tap target*) tombol minimal 44px.
   - Sidebar otomatis tersembunyi pada layar seluler ($\le 768\text{px}$) dan digantikan dengan tombol apung (*Floating Action Button*).
   - Form grid yang otomatis menyesuaikan dari multikolom ke 1 kolom vertikal.
3. **Integritas & Keamanan Berkas:**
   - Dilarang memecah `Index.html` ke berkas JavaScript atau CSS terpisah.
   - Backend tidak mengekspos API publik terbuka; hanya menerima panggilan dari session terotorisasi Apps Script.
4. **Keandalan Uji (Quality Control via Playwright):**
   - Setiap perubahan logika wajib lolos uji end-to-end melalui Playwright tanpa error fatal pada konsol browser.

---

## 8. Spesifikasi Deployment & Sinkronisasi Cloud
1. **Google Apps Script Web App:**
   - **Script ID:** `1Kukez4Q9ru7tEqRl7gQTdINCM3lM1Rjv9KI48dlou2dWqp-yerbBS0qX`
   - **Deployment ID:** `AKfycbzdzfwzNOWKJEH1pCwqJyhfK3IaBCrKua0awE-GWOIGHZdXynQmMPc70Q2OoKlFfZIR`
   - **Web App URL:** `https://script.google.com/macros/s/AKfycbzdzfwzNOWKJEH1pCwqJyhfK3IaBCrKua0awE-GWOIGHZdXynQmMPc70Q2OoKlFfZIR/exec`
   - **Metode Sinkronisasi:** Google CLASP CLI (`clasp push -f` & `clasp deploy`).
2. **Penyimpanan Dokumentasi Google Drive:**
   - **Target Folder:** `https://drive.google.com/drive/folders/1roxR2bu5O-Q1O05bjvh9_N69QHXw8NZ_?usp=drive_link` (`1roxR2bu5O-Q1O05bjvh9_N69QHXw8NZ_` / `gdrive:Aplikasi Web/igd_rsudsubang`).
   - **Otomasi:** Berkas `AGENTS.md` dan `prd.md` otomatis dikirimkan ke Google Drive setiap kali terjadi perubahan kode atau dokumen via `rclone`.
