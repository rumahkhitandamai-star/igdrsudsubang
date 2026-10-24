# AGENTS.md — IGD RSUD Subang

Panduan instruksi teknis dan protokol keselamatan untuk AI agent yang bekerja pada repositori ini.

## Ringkasan Proyek
Aplikasi web internal IGD RSUD Subang untuk pencatatan dan pelaporan data operasional gawat darurat (Kunjungan, Life Saving, KLB, Retensi, Idul Fitri). Aplikasi ini **sudah berjalan aktif dan fungsional** (bukan greenfield).

## Struktur Repositori
Struktur root sangat minimalis (tanpa build tools, bundler, atau framework CLI):
```text
igd_rsudsubang/
├── Index.html      # 1 file SPA utuh: HTML5, CSS custom, Vanilla JS (~2500+ baris)
├── Kode.gs         # Backend Google Apps Script (CRUD Sheets, Drive thumbnail, Word export)
└── AGENTS.md       # File instruksi ini
```
> **Catatan GAS:** File HTML dimuat oleh `doGet` via `HtmlService.createTemplateFromFile('Index')`. Nama file wajib tepat `Index.html` (kapital I). Backend menggunakan `Kode.gs` (bukan `Code.gs`).

## Tech Stack & Batasan Ketat
- **Frontend**: Single File HTML5 + CSS murni (CSS Variables) + Vanilla JavaScript murni.
- **Backend**: Google Apps Script (GAS).
- **Database**: Google Sheets via `SpreadsheetApp`.
- **Media & Ekspor**: Google Drive (slideshow foto) & Google Docs (ekspor Word via template docx).
- **Library Eksternal**: Hanya SheetJS CDN (`xlsx.full.min.js`) pada `Index.html` untuk ekspor Excel client-side.
- **DILARANG KERAS**: Memasang framework (Vue, React, Angular), bundler (Vite, Webpack), Tailwind/PostCSS, memecah komponen ke file `.js`/`.css` terpisah, atau menambahkan runtime Node.js/Python di lingkungan produksi.

## Arsitektur & Komunikasi Data
1. **RPC GAS (`google.script.run`)**:
   - Seluruh komunikasi frontend ↔ backend WAJIB menggunakan `google.script.run`.
   - **JANGAN** menggunakan `fetch()`, `axios`, atau `XMLHttpRequest`. Tidak ada REST API publik.
   - Panggilan backend selalu asynchronous: gunakan `.withSuccessHandler(...)` dan `.withFailureHandler(...)`.
2. **Format Data Spreadsheet**:
   - Backend menggunakan `getDisplayValues()` (bukan `getValues()`) untuk mengamankan serialisasi tanggal.
   - Data diterima frontend sebagai array-of-arrays (`string[][]`) dengan baris indeks `0` sebagai header kolom.
3. **Nama Sheet Database**:
   - `USERS`, `KUNJUNGAN`, `LIFE SAVING`, `KLB`, `RETENSI`, `IDUL FITRI`, `INVENTARIS ALAT KESEHATAN`, `INVENTARIS ALAT TENUN`, `INVENTARIS ALAT RUMAH TANGGA`.
4. **Mode Pratinjau Lokal & Mock Engine**:
   - `Index.html` dilengkapi polyfill Mock Engine otomatis: jika dibuka di luar Apps Script (misalnya langsung di browser lokal atau Playwright), objek `google.script.run` disimulasikan secara transparan menggunakan data persisten di `localStorage`.
   - Kredensial lokal: `admin` / `admin123` (Super Admin).
   - Di lingkungan Google Apps Script, polyfill ini otomatis non-aktif dan backend `Kode.gs` dijalankan normal.
5. **Optimasi Sinkronisasi & Server Cache**:
   - Backend mengelola revisi per-sheet di `PropertiesService` (key `IGD_REV_MAP`) serta fingerprint `rev:lastRow`.
   - `getAllSheetsData(token, clientRevs)` hanya membaca dan mengirimkan sheet yang mengalami perubahan (delta sync), dilengkapi cache server-side `CacheService.getScriptCache()` (TTL 5 menit) untuk meminimalkan pembacaan fisik Google Sheets.
   - `Index.html` melacak `SYNC_REVS` dan secara otomatis memperbarui data ketika pengguna kembali ke tab aplikasi (`visibilitychange`).

## Invarian Kritis (Wajib Diperhatikan)
1. **Sinkronisasi `APP_SCHEMA` ↔ Spreadsheet**:
   - Objek `APP_SCHEMA` di `Index.html` adalah sumber kebenaran skema form input dan urutan kolom.
   - Urutan elemen pada `APP_SCHEMA` wajib 100% konsisten dengan urutan kolom fisik di sheet terkait.
2. **Indeks Kolom Hardcoded**:
   - Filter, kartu ringkasan (summary cards), dan rendering tabel mengandalkan indeks kolom langsung:
     - Kunjungan: `row[1]` = ID, `row[2]` = TANGGAL, `row[3]` = SHIFT, `row[4]` = KATEGORI PASIEN, `row[25]` = JUMLAH RETENSI HARI INI.
     - KLB & Idul Fitri: `row[2]` = KEJADIAN/TAHUN, `row[3]` = TGL MASUK, `row[7]` = JK, `row[10]` = KU, `row[14]` = KETERANGAN.
   - Menambah atau menggeser kolom menuntut pembaruan seluruh referensi indeks terkait di script.
3. **Validasi Kunjungan (Save Blockers)**:
   - Validasi Alasan Retensi: Selisih `Retensi Hari Ini - Total Alasan == 0`.
   - Validasi Sismadak: Selisih `Target Ranap - Total Sismadak == 0`.
   - Validasi Urutan Shift Kunjungan: Urutan shift per tanggal wajib `Pagi -> Sore -> Malam`. Shift `Sore` hanya bisa diisi jika `Pagi` telah lengkap 4 kategori pasien (`Anak`, `Bedah`, `Non Bedah`, `Kebidanan`). Shift `Malam` hanya bisa diisi jika `Pagi` dan `Sore` lengkap. Mode edit dikecualikan (exempt). Divalidasi di client (peringatan inline + toast + disable tombol simpan), mock engine, dan backend `Kode.gs`.
   - Pencegahan duplikasi Kunjungan: Kombinasi `TANGGAL + SHIFT + KATEGORI PASIEN` tidak boleh ganda (divalidasi di client & backend pada operasi insert maupun update dengan normalisasi tanggal).
   - Pencegahan duplikasi Retensi: Kombinasi `TANGGAL + JAM` tidak boleh ganda.
   - Pencegahan duplikasi Idul Fitri: Kombinasi `TAHUN + TANGGAL MASUK + (NAMA PASIEN / CM)` tidak boleh ganda (divalidasi di client, mock, & backend).
   - Validasi Idul Fitri: Wajib isi Tahun, Tanggal Masuk, Jam Masuk (format `08.00`), dan Nama Pasien. Tanggal/Jam Keluar harus $\ge$ Masuk.
   - Keamanan & Sesi Server: Seluruh pembacaan data (`getAllSheetsData`, `getSheetData`) dan mutasi data (`saveData`, `deleteData`, `uploadSlideshowPhoto`, `backupDatabase`, `generateRetensiDoc`) WAJIB menyertakan signed HMAC session token dari `authenticateUser`. `SESSION_SECRET` dienkripsi persisten via `PropertiesService` server-side. Kolom password pada sheet `USERS` di-hash dengan SHA-256 dan dimask (`••••••••`) pada response client. Pemulihan (Undo) penghapusan akun USERS diblokir demi proteksi kata sandi.
   - Proteksi Hapus: Menghapus data shift Kunjungan memicu peringatan integritas jika shift berikutnya sudah ada. Klien mendukung tombol "Urungkan" sesaat setelah penghapusan data (kecuali USERS).
   - Jika validasi gagal, tombol simpan dinonaktifkan atau alert dipicu. Jangan menghilangkan validasi ini.
4. **ID & Kredensial Hardcoded**:
   - `SHEET_ID`: Hardcoded di `Kode.gs`.
   - `FOLDER_ID`: Hardcoded di `Kode.gs` (folder berkas umum & subfolder `Temp_Exports`).
   - `SLIDESHOW_FOLDER_ID`: Hardcoded di `Kode.gs` (`1R6S-RavuW1z6RO3g_CcBvU2kqbhgAycj` untuk 9 foto slideshow 440×320).
   - `templateId` Dokumen Word Retensi: Hardcoded di `Kode.gs` dan `Index.html` (`1DN_-I9XkF_dTzExMVyGwYRs4cqGw5eAsoEtRCX8s4bM`).
   - **Hak Akses Modal & CRUD**: Seluruh peran terotorisasi (Admin dan User/Visitor) memiliki Hak Akses Penuh (Tambah, Edit, Hapus, Export Word/Excel) pada menu yang diotorisasikan. Akun hardcoded `visitor / 127` telah dihapus; login wajib menggunakan akun valid pada sheet `USERS`.

5. **Otorisasi Menu & Pembatasan Peran**:
   - **Default Hak Akses per Peran:**
     - **Super Admin:** Hak Akses Penuh untuk seluruh menu aplikasi (termasuk Users, Inventaris, dan Setting).
     - **Admin:** Semua menu kecuali Users dan Setting (default: `Beranda, Kunjungan, Life Saving, KLB, Retensi, Idul Fitri, Inventaris`) dengan Hak Akses Penuh (Tambah, Edit, Hapus, Export).
     - **User / Visitor:** Semua menu kecuali Inventaris, Users, dan Setting (default: `Beranda, Kunjungan, Life Saving, KLB, Retensi, Idul Fitri`) dengan Hak Akses Penuh (Tambah, Edit, Hapus, Export).
   - **Menu Setting (Slideshow, Running Text, & Backup Database):** Khusus Super Admin mutlak. Disembunyikan total untuk Admin dan Visitor pada sidebar dan navigasi; backend `uploadSlideshowPhoto`, `deleteSlideshowPhoto`, `backupDatabase`, dan `listDatabaseBackups` serta penyimpanan client Running Text memblokir non-Super Admin. Submenu Backup Database menyalin seluruh database ke Google Drive folder `1Y7HY4BO5NtEdJ7Y8ds68WJwoeffECKqR` dengan format `YYYY-MM-DD_Backup Database IGD`.
   - **Menu Inventaris (3 Submenu Alat & Download):** Dapat diakses oleh Super Admin dan Admin yang memiliki kunci otorisasi `Inventaris` pada kolom OTORISASI (aktif default untuk Admin, disembunyikan untuk Visitor). Operasi tulis `saveData`/`deleteData` pada sheet `INVENTARIS *` di backend `Kode.gs` memvalidasi keberadaan kunci `Inventaris` untuk pengguna Admin.
   - **Konfigurasi Menu Users:** Checkbox otorisasi pada form pengguna mencakup seluruh modul: `Beranda, Kunjungan, Life Saving, KLB, Retensi, Idul Fitri, Users, Inventaris`. Tombol *Reset Bawaan* dan perubahan dropdown role otomatis menerapkan default otorisasi sesuai peran yang dipilih.

## Protokol Modifikasi Kode
1. **Single File Integrity**: Seluruh markup HTML, CSS, JavaScript, dan logika klien WAJIB tetap berada utuh di dalam `Index.html`. Jangan memecah ke file terpisah.
2. **Strict Scope Execution**: Modifikasi HANYA fungsi atau baris yang diminta secara eksplisit. Hindari refactoring global atau memformat ulang area di luar cakupan.
3. **Append-Only Preferred**: Utamakan penambahan helper atau fungsi baru tanpa menimpa fungsi lama yang telah stabil.
4. **Konfirmasi Perubahan**: Jika solusi memerlukan penyesuaian skema spreadsheet, otentikasi, atau struktur database, minta konfirmasi pengguna sebelum menulis kode.

## Deployment & Operasional
- **Google Apps Script**: Sinkronisasi lokal ke GAS dikelola melalui Google CLASP (`clasp push -f` & `clasp deploy`).
- **Script ID**: `1Kukez4Q9ru7tEqRl7gQTdINCM3lM1Rjv9KI48dlou2dWqp-yerbBS0qX`
- **Deployment ID (Web App)**: `AKfycbzdzfwzNOWKJEH1pCwqJyhfK3IaBCrKua0awE-GWOIGHZdXynQmMPc70Q2OoKlFfZIR`
- **Web App URL**: `https://script.google.com/macros/s/AKfycbzdzfwzNOWKJEH1pCwqJyhfK3IaBCrKua0awE-GWOIGHZdXynQmMPc70Q2OoKlFfZIR/exec`
- **Google Drive Folder**: `https://drive.google.com/drive/folders/1roxR2bu5O-Q1O05bjvh9_N69QHXw8NZ_?usp=drive_link` (`1roxR2bu5O-Q1O05bjvh9_N69QHXw8NZ_` / `gdrive:Aplikasi Web/igd_rsudsubang`)
- **Git**: Repositori GitHub: `https://github.com/rumahkhitandamai-star/igdrsudsubang` (branch `main`). Terapkan konvensi commit: `feat:`, `fix:`, `chore:`, `docs:`.

## Aturan Wajib: Sinkronisasi Otomatis Setiap Ada Perubahan
**PENTING:** Setiap kali ada modifikasi kode (`Index.html`, `Kode.gs`) atau dokumen (`AGENTS.md`, `prd.md`), AI agent WAJIB menjalankan:
1. **Kirim Otomatis `AGENTS.md` & `prd.md` ke Google Drive:**
   ```bash
   rclone copy . "gdrive:Aplikasi Web/igd_rsudsubang" --include "AGENTS.md" --include "prd.md"
   ```
2. **Push CLASP & Redeploy Web App (Ketat pada Deployment ID Tetap):**
   - **DILARANG** membuat deployment baru (`clasp deploy` tanpa flag `-i`). Selalu update deployment ID yang sudah ada agar URL produksi tidak berubah:
   ```bash
   clasp push -f
   clasp deploy -i AKfycbzdzfwzNOWKJEH1pCwqJyhfK3IaBCrKua0awE-GWOIGHZdXynQmMPc70Q2OoKlFfZIR -d "Auto Deploy"
   ```
   *(Atau jalankan skrip gabungan: `npm run sync`)*
   - **Target URL Produksi:** `https://script.google.com/macros/s/AKfycbzdzfwzNOWKJEH1pCwqJyhfK3IaBCrKua0awE-GWOIGHZdXynQmMPc70Q2OoKlFfZIR/exec`

## Protokol Quality Control (QC) via Playwright
Setiap kali selesai memodifikasi logika atau UI di `Index.html`, jalankan QC mandiri menggunakan Playwright CLI:
1. **Persiapan Dependensi:**
   - Periksa `package.json` di root proyek. Jika belum ada: `npm init -y && npm install -D @playwright/test && npx playwright install`.
2. **Skrip Uji Sementara (`qc-test.spec.js`):**
   - Tulis pengujian verifikasi elemen dasar `Index.html` (render splash screen, form login, modal, dan memastikan tidak ada uncaught exception di console browser).
3. **Eksekusi:**
   - Jalankan via terminal: `npx playwright test qc-test.spec.js --headed` (DILARANG menggunakan flag `--ui` agar tidak hang).
4. **Pembersihan:**
   - Jika PASS, hapus file `qc-test.spec.js` dari workspace untuk menjaga kebersihan repo statis.
   - Jika FAIL, selesaikan error di `Index.html` tanpa merombak arsitektur, lalu ulangi pengujian.
