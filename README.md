# Sistem Informasi Operasional IGD RSUD Subang

Aplikasi web internal Instalasi Gawat Darurat (IGD) RSUD Subang untuk pencatatan, validasi, dan pelaporan data operasional kegawatdaruratan secara *real-time*.

> **Motto Operasional:** *Cepat - Akurat - Komprehensif - Edukatif - Profesional*

---

## 🚀 Tech Stack & Arsitektur

- **Frontend:** Single File HTML5, CSS kustom (*Tosca Medical Gradient*), dan Vanilla JavaScript murni (`Index.html`).
- **Backend:** Google Apps Script (`Kode.gs`) V8 Runtime dengan RPC `google.script.run`.
- **Database:** Google Sheets via `SpreadsheetApp` (sheet: `USERS`, `KUNJUNGAN`, `LIFE SAVING`, `KLB`, `RETENSI`, `IDUL FITRI`, `INVENTARIS *`).
- **Media & Penyimpanan:** Google Drive (`DriveApp`) untuk slideshow 9 foto dan arsip backup database.
- **Ekspor Dokumen:**
  - **Excel (.xlsx):** Client-side via library SheetJS (`xlsx.full.min.js`).
  - **Word (.docx):** Server-side via template Google Docs (`templateId`).

---

## 📁 Struktur Repositori

```text
igd_rsudsubang/
├── .github/workflows/  # CI/CD GitHub Actions (auto-deploy Firebase Hosting)
├── Index.html          # SPA utuh: HTML5, CSS Variables, Vanilla JS + Mock Engine
├── Kode.gs             # Backend Google Apps Script (CRUD Sheets, Drive, Docs)
├── appsscript.json     # Manifest Google Apps Script (V8 runtime, Asia/Jakarta)
├── .claspignore        # Aturan push CLASP (hanya Kode.gs, Index.html, appsscript.json)
├── firebase.json       # Konfigurasi Firebase Hosting (rewrite ke /Index.html)
├── .firebaserc         # Project alias Firebase
├── .gitignore          # File & folder yang diabaikan Git
├── AGENTS.md           # Protokol keselamatan dan instruksi teknis AI agent
├── prd.md              # Product Requirements Document lengkap
├── package.json        # Dependensi dev (Playwright, SheetJS) & script otomasi
└── README.md           # Dokumentasi ini
```

---

## 💻 Menjalankan Secara Lokal (Pratinjau / Mock Engine)

Aplikasi dilengkapi dengan **Mock Engine otomatis** yang aktif saat file dibuka di luar lingkungan Google Apps Script:

1. Buka file `Index.html` langsung di browser favorit Anda (atau gunakan live-server).
2. Anda akan otomatis masuk ke **Mode Pratinjau Lokal**:
   - Seluruh panggilan `google.script.run` disimulasikan secara transparan menggunakan `localStorage`.
   - Data tersimpan persisten di browser lokal tanpa memengaruhi data Google Sheets produksi.
3. Kredensial login bawaan mode lokal:
   - **Username:** `admin`
   - **Password:** `admin123`
   - **Peran:** Super Admin (akses penuh ke seluruh fitur)

---

## 🌐 Deployment Produksi (Google Apps Script)

Aplikasi produksi berjalan di atas Google Apps Script Web App yang terhubung langsung dengan Google Sheets.

### Prasyarat
- Node.js & npm
- Google CLASP terinstal global: `npm install -g @google/clasp`
- Login akun Google pengelola: `clasp login`

### Perintah Sinkronisasi & Deploy
```bash
# Push perubahan file ke Google Apps Script
clasp push -f

# Update deployment yang sudah ada (jangan buat deployment baru agar URL tetap)
clasp deploy -i AKfycbzdzfwzNOWKJEH1pCwqJyhfK3IaBCrKua0awE-GWOIGHZdXynQmMPc70Q2OoKlFfZIR -d "Auto Deploy"

# Atau gunakan skrip npm gabungan
npm run deploy
```

- **Script ID:** `1Kukez4Q9ru7tEqRl7gQTdINCM3lM1Rjv9KI48dlou2dWqp-yerbBS0qX`
- **Deployment ID:** `AKfycbzdzfwzNOWKJEH1pCwqJyhfK3IaBCrKua0awE-GWOIGHZdXynQmMPc70Q2OoKlFfZIR`
- **URL Web App Produksi:**
  [https://script.google.com/macros/s/AKfycbzdzfwzNOWKJEH1pCwqJyhfK3IaBCrKua0awE-GWOIGHZdXynQmMPc70Q2OoKlFfZIR/exec](https://script.google.com/macros/s/AKfycbzdzfwzNOWKJEH1pCwqJyhfK3IaBCrKua0awE-GWOIGHZdXynQmMPc70Q2OoKlFfZIR/exec)

---

## 🔥 Akses Publik via Firebase Hosting

Domain publik aplikasi disajikan melalui Firebase Hosting dengan **Auto-Bridge Produksi**:

- **Target URL Hosting:** [https://igdrsudsubang.web.app](https://igdrsudsubang.web.app) (atau [https://igdrsudsubang.firebaseapp.com](https://igdrsudsubang.firebaseapp.com))
- **Project ID:** `khitandamai-9c7bf`
- **Site ID:** `igdrsudsubang`
- **Akun Pengelola:** `rumahkhitandamai@gmail.com`

### Mekanisme Koneksi & Keamanan
1. **Auto-Bridge Produksi:**
   Saat dibuka di domain Firebase Hosting publik, `Index.html` secara otomatis memuat Google Apps Script Web App Produksi melalui wrapper terintegrasi dengan penyamaran URL backend. Pengguna mendapatkan koneksi live ke database Google Sheets riil dengan favicon resmi RSUD Subang.
2. **Keamanan Server-Side:**
   - Seluruh endpoint pembacaan (`getAllSheetsData`, `getSheetData`) dan mutasi data (`saveData`, `deleteData`, `uploadSlideshowPhoto`, `backupDatabase`, `generateRetensiDoc`) diwajibkan menyertakan session token HMAC-SHA256 valid.
   - `SESSION_SECRET` dienkripsi dan di-generate acak persisten menggunakan `PropertiesService` server-side.
   - Kata sandi pada sheet `USERS` di-hash dengan SHA-256 bertingkat sebelum ditulis ke spreadsheet dan selalu dimasking (`••••••••`) pada respon klien.
   - Metadata sensitif (`.git/**`, `.github/**`, dll) diblokir penuh dari deployment Firebase melalui deny-list `firebase.json`.

### Langkah Deploy ke Firebase
1. Login ke akun Google pengelola Firebase:
   ```bash
   firebase login
   # (Pastikan login menggunakan akun rumahkhitandamai@gmail.com)
   ```
2. Deploy langsung ke hosting:
   ```bash
   firebase deploy --only hosting
   ```

### Otomasi CI/CD via GitHub Actions
Tersedia workflow di `.github/workflows/`:
- `firebase-hosting-merge.yml`: Otomatis deploy ke channel *live* saat push ke branch `main`.
- `firebase-hosting-pull-request.yml`: Otomatis deploy pratinjau (*preview channel*) saat ada Pull Request.

**Setup GitHub Secrets:**
1. Di Firebase Console (`igdrsudsubang`) > Project Settings > Service Accounts, buat kunci JSON baru (atau jalankan `firebase init hosting:github` untuk generate otomatis).
2. Di repositori GitHub: **Settings > Secrets and variables > Actions**.
3. Tambahkan secret baru bernama `FIREBASE_SERVICE_ACCOUNT_IGDRSUDSUBANG` (atau `FIREBASE_SERVICE_ACCOUNT`) dan tempelkan isi JSON service account.

---

## 📋 Modul & Fitur Utama

1. **Beranda & Slideshow:**
   - Ringkasan operasional real-time (Kunjungan Hari Ini, Tempat Tidur Observasi/Retensi, Kendala Life Saving, KLB).
   - Slideshow 9 foto sarana/kegiatan IGD dengan transisi otomatis.
2. **Kunjungan (Pelayanan & Triage Pasien):**
   - Form bertahap (Data Dasar, Triage, Distribusi, Kasus Khusus, Alasan Retensi, Sismadak).
   - Validasi ketat: Selisih Alasan Retensi wajib 0, Selisih Sismadak wajib 0, validasi urutan shift (`Pagi` → `Sore` → `Malam`), dan proteksi pencegahan duplikasi shift.
3. **Life Saving:**
   - Pendataan pasien darurat yang terkendala alat resusitasi/ventilator/inkubator/pump.
4. **Kejadian Luar Biasa (KLB):**
   - Pelaporan kasus luar biasa, keracunan massal, dan wabah beserta *summary cards* keadaan umum & status keluar.
5. **Retensi (Observasi Pasien IGD):**
   - Evaluasi kapasitas tempat tidur observasi IGD (40 TT) setiap pukul `07:00 WIB` dan `19:00 WIB`.
   - Ekspor dokumen dinas Microsoft Word (.docx) berbasis template otomatis.
6. **Idul Fitri (Posko Siaga Mudik):**
   - Registrasi pasien posko kesehatan arus mudik dan balik lebaran.
7. **Inventaris (Alat Kesehatan, Tenun, Rumah Tangga):**
   - Monitoring aset sarana-prasarana IGD, kondisi (Baik / Rusak Berat), dan ekspor Excel rekapitulasi inventaris.
8. **Setting (Khusus Super Admin):**
   - **Slideshow:** Upload foto dengan alat pemotong rasio 11:8 (Ultra Hi-DPI) ke folder Google Drive.
   - **Running Text:** Pengaturan teks berjalan dan warna banner pengumuman.
   - **Backup Database:** Pencadangan seluruh spreadsheet ke folder Google Drive secara otomatis/manual.

---

## 👥 Profil Pengguna & Hak Akses

| Role | Akses Modul | Hak Operasi |
| :--- | :--- | :--- |
| **Super Admin** | Seluruh menu (termasuk Users & Setting) | Hak Akses Penuh (Tambah, Edit, Hapus, Ekspor, Kelola User, Backup, Slideshow) |
| **Admin** | Beranda, Kunjungan, Life Saving, KLB, Retensi, Idul Fitri, Inventaris | Tambah, Edit, Hapus, Ekspor Excel & Word |
| **Visitor / User** | Beranda, Kunjungan, Life Saving, KLB, Retensi, Idul Fitri | Tambah, Edit, Hapus, Ekspor Excel & Word |

---

## 🧪 Quality Control (Playwright)

Proyek ini menggunakan Playwright untuk memvalidasi bahwa tidak ada galat fatal pada konsol browser saat aplikasi dijalankan:

```bash
# Menjalankan pengujian Playwright
npm test
```

---

## 📄 Lisensi & Hak Cipta
Hak cipta milik **Instalasi Gawat Darurat (IGD) RSUD Subang**. Digunakan secara internal untuk pelayanan publik kegawatdaruratan.
