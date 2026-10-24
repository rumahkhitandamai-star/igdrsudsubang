// ID SPREADSHEET DAN FOLDER
const SHEET_ID = '16abr7-2np5jY5uG6G16fAjDPoFa_4wVUHxVxxsv3PWw';
const FOLDER_ID = '1OlYaZMxUOQFGmS1L_R9t2p45ZcKr3v9K'; // Folder Ekspor & Arsip
const SLIDESHOW_FOLDER_ID = '1R6S-RavuW1z6RO3g_CcBvU2kqbhgAycj'; // Folder 9 Foto Slideshow Beranda
const BACKUP_FOLDER_ID = '1Y7HY4BO5NtEdJ7Y8ds68WJwoeffECKqR'; // Folder Backup Database IGD
const SESSION_SECRET = SHEET_ID + '_igd_subang_sec_salt_2026';

// ==========================================
// 0. KEAMANAN & MANAJEMEN SESI SERVER-SIDE
// ==========================================
function hashPassword_(pwd) {
  if (!pwd) return '';
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pwd + '_rsudsubang_salt');
  return Utilities.base64Encode(digest);
}

function createSessionToken_(user, role, otorisasi) {
  const timestamp = Date.now();
  const payload = [user, role, otorisasi || '', timestamp].join('|');
  const sigBytes = Utilities.computeHmacSha256Signature(payload, SESSION_SECRET);
  const sig = Utilities.base64Encode(sigBytes);
  return Utilities.base64Encode(Utilities.newBlob(payload + ':::' + sig).getBytes());
}

function verifySessionToken_(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const raw = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
    const parts = raw.split(':::');
    if (parts.length !== 2) return null;
    const payload = parts[0];
    const sig = parts[1];
    const expectedSigBytes = Utilities.computeHmacSha256Signature(payload, SESSION_SECRET);
    const expectedSig = Utilities.base64Encode(expectedSigBytes);
    if (sig !== expectedSig) return null;

    const subParts = payload.split('|');
    if (subParts.length < 4) return null;
    const user = subParts[0];
    const role = subParts[1];
    const otorisasi = subParts[2];
    const timestamp = parseInt(subParts[3], 10);
    // Token berlaku selama 7 hari
    if (isNaN(timestamp) || Date.now() - timestamp > 7 * 24 * 60 * 60 * 1000) return null;
    return { user: user, role: role, otorisasi: otorisasi };
  } catch (e) {
    return null;
  }
}

function assertUserCanAccess_(session, sheetName, action) {
  if (!session) {
    throw new Error('Sesi tidak valid atau telah kedaluwarsa. Silakan login kembali.');
  }

  // Super Admin memiliki akses penuh ke seluruh sheet
  if (session.role === 'Super Admin') return true;

  // Pengelolaan sheet USERS dibatasi khusus Super Admin
  if (sheetName === 'USERS') {
    throw new Error('Akses Ditolak: Hanya Super Admin yang berwenang mengelola data Pengguna.');
  }

  // Validasi OTORISASI menu
  const auths = (session.otorisasi || '').split(',').map(function(s) { return s.trim().toLowerCase(); });
  const sLower = (sheetName || '').toLowerCase();
  const matched = auths.some(function(a) {
    if (a === sLower) return true;
    if (sLower.indexOf('inventaris') === 0 && a.indexOf('inventaris') >= 0) return true;
    return false;
  });

  if (sLower.indexOf('inventaris') === 0) {
    if (!matched) {
      throw new Error('Akses Ditolak: Anda tidak memiliki hak akses ke modul ' + sheetName + '.');
    }
  } else if (!matched && session.role !== 'Admin') {
    throw new Error('Akses Ditolak: Anda tidak memiliki hak akses ke modul ' + sheetName + '.');
  }

  return true;
}

function sanitizeCellVal_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^[=+\-@]/.test(s)) {
      if (!isNaN(Number(s))) return v;
      return "'" + v;
    }
  }
  return v;
}

function sanitizeRowData_(row) {
  if (!Array.isArray(row)) return row;
  return row.map(sanitizeCellVal_);
}

function maskUsersPasswordColumn_(vals) {
  if (!Array.isArray(vals) || vals.length <= 1) return vals;
  const headers = vals[0].map(function(h) { return (h || '').toString().trim().toUpperCase(); });
  const idxPwd = headers.indexOf('PASSWORD');
  if (idxPwd >= 0) {
    for (let r = 1; r < vals.length; r++) {
      if (vals[r] && vals[r].length > idxPwd) {
        vals[r][idxPwd] = '••••••••';
      }
    }
  }
  return vals;
}

// ==========================================
// 0. PENTING: JALANKAN FUNGSI INI 1X DARI EDITOR UNTUK FIX IZIN DRIVE
// ==========================================
function fixDrivePermissions() {
  // Perintah create file di bawah ini secara eksplisit akan memaksa 
  // Google Apps Script meminta izin penuh: https://www.googleapis.com/auth/drive
  DriveApp.createFile('Test_Izin_Drive.txt', 'Anda bisa menghapus file ini nanti');
  DocumentApp.create('Test_Izin_Doc');
  UrlFetchApp.fetch('https://www.google.com');
}

// ==========================================
// 1. SETUP APLIKASI WEB
// ==========================================
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('IGD RSUD Subang')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // Agar bisa di embed di Blogger/Sites
}

// ==========================================
// 2. SISTEM LOGIN & STRUKTUR USERS
// ==========================================
function ensureUsersSheetStructure(sheet) {
  try {
    if (!sheet) {
      sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('USERS');
    }
    if (!sheet) return;
    const lastCol = sheet.getLastColumn();
    const lastRow = sheet.getLastRow();
    if (lastCol === 0 || lastRow === 0) return;

    const headerValues = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const headers = headerValues.map(h => (h || '').toString().trim().toUpperCase());
    
    // 1. Jika belum ada kolom NO dan ID di posisi awal
    if (headers[0] !== 'NO' && headers.indexOf('NO') === -1) {
      sheet.insertColumnsBefore(1, 2);
      sheet.getRange(1, 1).setValue('NO');
      sheet.getRange(1, 2).setValue('ID');
      
      const updatedRow = sheet.getLastRow();
      if (updatedRow > 1) {
        for (let r = 2; r <= updatedRow; r++) {
          sheet.getRange(r, 1).setValue(r - 1);
          sheet.getRange(r, 2).setValue('USR' + ('000' + (r - 1)).slice(-3));
        }
      }
    }
    
    // 2. Jika belum ada kolom OTORISASI di akhir
    const curHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(h => (h || '').toString().trim().toUpperCase());
    if (curHeaders.indexOf('OTORISASI') === -1) {
      const nextCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, nextCol).setValue('OTORISASI');
      const updatedRow = sheet.getLastRow();
      if (updatedRow > 1) {
        const defaultAuth = 'Beranda,Kunjungan,Life Saving,KLB,Retensi,Idul Fitri,Inventaris';
        const visitorAuth = 'Beranda,Kunjungan,Life Saving,KLB,Retensi,Idul Fitri';
        const adminAuth = 'Beranda,Kunjungan,Life Saving,KLB,Retensi,Idul Fitri,Users,Inventaris';
        const colNama = curHeaders.indexOf('NAMA') !== -1 ? curHeaders.indexOf('NAMA') + 1 : 3;
        const colRole = curHeaders.indexOf('HAK AKSES') !== -1 ? curHeaders.indexOf('HAK AKSES') + 1 :
                        (curHeaders.indexOf('ROLE') !== -1 ? curHeaders.indexOf('ROLE') + 1 : 5);
        for (let r = 2; r <= updatedRow; r++) {
          const u = (sheet.getRange(r, colNama).getValue() || '').toString().trim().toLowerCase();
          const rRole = (sheet.getRange(r, colRole).getValue() || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
          const isSuper = (rRole === 'superadmin' || rRole === 'super admin' || u === 'admin');
          const isVisitor = (rRole === 'visitor');
          sheet.getRange(r, nextCol).setValue(isSuper ? adminAuth : (isVisitor ? visitorAuth : defaultAuth));
        }
      }
    }

    // 3. Normalisasi idempoten kolom OTORISASI berdasarkan Role:
    // - Admin: wajib memiliki Inventaris (default: Beranda,Kunjungan,Life Saving,KLB,Retensi,Idul Fitri,Inventaris)
    // - Visitor / User: HANYA 6 menu klinis (Beranda,Kunjungan,Life Saving,KLB,Retensi,Idul Fitri), tanpa Inventaris & Users
    const allHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(h => (h || '').toString().trim().toUpperCase());
    const idxOto = allHeaders.indexOf('OTORISASI');
    const idxRole = allHeaders.indexOf('HAK AKSES') !== -1 ? allHeaders.indexOf('HAK AKSES') : allHeaders.indexOf('ROLE');
    const colNamaIdx = allHeaders.indexOf('NAMA');
    const totalRows = sheet.getLastRow();
    if (idxOto !== -1 && totalRows > 1) {
      const dataRange = sheet.getRange(2, 1, totalRows - 1, sheet.getLastColumn()).getValues();
      const defaultVisitorAuth = 'Beranda,Kunjungan,Life Saving,KLB,Retensi,Idul Fitri';
      const defaultAdminAuth = 'Beranda,Kunjungan,Life Saving,KLB,Retensi,Idul Fitri,Inventaris';
      const superAdminAuth = 'Beranda,Kunjungan,Life Saving,KLB,Retensi,Idul Fitri,Users,Inventaris';

      for (let r = 0; r < dataRange.length; r++) {
        const u = colNamaIdx !== -1 ? (dataRange[r][colNamaIdx] || '').toString().trim().toLowerCase() : '';
        const rowRole = idxRole !== -1 ? (dataRange[r][idxRole] || '').toString().trim().toLowerCase().replace(/\s+/g, ' ') : '';
        const curOto = (dataRange[r][idxOto] || '').toString().trim();
        const isSuper = (rowRole === 'super admin' || rowRole === 'superadmin' || u === 'admin');
        const isVisitorOrUser = (rowRole === 'visitor' || rowRole === 'user' || u === 'visitor');

        if (isSuper) {
          if (!curOto || curOto !== superAdminAuth) {
            sheet.getRange(r + 2, idxOto + 1).setValue(superAdminAuth);
          }
        } else if (isVisitorOrUser) {
          // Akun Visitor/User wajib dinormalisasi hanya ke 6 menu, bersihkan jika ada Inventaris / Users
          if (!curOto || curOto.toLowerCase().indexOf('inventaris') !== -1 || curOto.toLowerCase().indexOf('users') !== -1) {
            sheet.getRange(r + 2, idxOto + 1).setValue(defaultVisitorAuth);
          }
        } else {
          // Akun Admin: pastikan memiliki Inventaris dan jika kosong diberi defaultAdminAuth
          if (!curOto) {
            sheet.getRange(r + 2, idxOto + 1).setValue(defaultAdminAuth);
          } else if (curOto.toLowerCase().indexOf('inventaris') === -1) {
            sheet.getRange(r + 2, idxOto + 1).setValue(curOto + ',Inventaris');
          }
        }
      }
    }
  } catch(err) {
    console.warn('Peringatan penyesuaian struktur sheet USERS: ' + err.toString());
  }
}

function authenticateUser(nama, password) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('USERS');
    if (!sheet) return { status: false, message: 'Sheet USERS tidak ditemukan.' };
    
    // Pastikan integritas kolom sheet USERS telah siap
    ensureUsersSheetStructure(sheet);

    // Gunakan getDisplayValues() untuk menjamin nilai string persis seperti yang tertulis di sheet
    const data = sheet.getDataRange().getDisplayValues();
    if (data.length <= 1) return { status: false, message: 'Data USERS masih kosong.' };

    const headers = data[0].map(h => (h || '').toString().trim().toUpperCase());
    
    // Temukan indeks kolom NAMA dan PASSWORD secara dinamis berdasarkan baris header
    let idxNama = headers.findIndex(h => h === 'NAMA' || h === 'USERNAME' || h === 'USER' || h === 'NAMA PENGGUNA');
    let idxPwd = headers.findIndex(h => h === 'PASSWORD' || h === 'PASS' || h === 'SANDI' || h === 'KATA SANDI');
    let idxRole = headers.findIndex(h => h === 'HAK AKSES' || h === 'ROLE' || h === 'PERAN');
    let idxOto = headers.findIndex(h => h === 'OTORISASI' || h === 'AKSES' || h === 'MENU' || h === 'AUTHORIZATION');

    // Fallback cerdas jika header tidak terdeteksi
    if (idxNama === -1) idxNama = (headers.length > 2 && headers[0] === 'NO') ? 2 : 0;
    if (idxPwd === -1) idxPwd = (idxNama === 2) ? 3 : 1;

    const inputU = (nama || '').toString().trim().toLowerCase();
    const inputP = (password || '').toString().trim();

    for (let i = 1; i < data.length; i++) {
      const u = (data[i][idxNama] || '').toString().trim().toLowerCase();
      const p = (data[i][idxPwd] || '').toString().trim();

      // Pencocokan kredensial sesuai kolom NAMA dan PASSWORD pada sheet USERS (mendukung plaintext & hash)
      const isPwdMatch = (p === inputP || p === hashPassword_(inputP));
      if (u === inputU && isPwdMatch) {
        const rawRole = (idxRole !== -1 && data[i][idxRole] ? data[i][idxRole] : 'Admin').toString().trim();
        const roleLower = rawRole.toLowerCase().replace(/\s+/g, ' ');
        const isSuper = (roleLower === 'super admin' || roleLower === 'superadmin' || u === 'admin');

        // Untuk Super Admin, selalu berikan Full Akses ke semua menu
        let otorisasi = isSuper 
          ? 'Beranda,Kunjungan,Life Saving,KLB,Retensi,Idul Fitri,Users,Inventaris' 
          : (idxOto !== -1 && data[i][idxOto] ? data[i][idxOto] : '').toString().trim();

        // Default otorisasi jika kolom OTORISASI kosong:
        // Visitor/User: semua menu kecuali Inventaris, Users, Setting (6 menu)
        // Admin: semua menu kecuali Users, Setting (7 menu + Inventaris)
        if (!otorisasi) {
          if (roleLower === 'visitor' || roleLower === 'user') {
            otorisasi = 'Beranda,Kunjungan,Life Saving,KLB,Retensi,Idul Fitri';
          } else {
            otorisasi = 'Beranda,Kunjungan,Life Saving,KLB,Retensi,Idul Fitri,Inventaris';
          }
        }

        const finalUser = (data[i][idxNama] || '').toString().trim();
        const finalRole = isSuper ? 'Super Admin' : rawRole;

        return { 
          status: true, 
          user: finalUser,
          role: finalRole,
          menus: otorisasi,
          token: createSessionToken_(finalUser, finalRole, otorisasi)
        };
      }
    }
    return { status: false, message: 'Kredensial tidak valid.' };
  } catch (e) {
    return { status: false, message: e.toString() };
  }
}

// ==========================================
// 3. FUNGSI CRUD & AUTO NUMBERING
// ==========================================
function ensureInventarisSheets() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const invSheets = ['INVENTARIS ALAT KESEHATAN', 'INVENTARIS ALAT TENUN', 'INVENTARIS ALAT RUMAH TANGGA'];
    const headers = [
      'NO', 'ID', 'NAMA BARANG', 'MERK / MODEL/TYPE', 'TAHUN PEROLEHAN',
      'NO / KODE BARANG', 'HARGA BELI / PEROLEHAN', 'KONDISI BAIK',
      'KONDISI RUSAK BERAT', 'JUMLAH BARANG / REGISTER', 'KETERANGAN'
    ];
    invSheets.forEach(name => {
      let sheet = ss.getSheetByName(name);
      if (!sheet) {
        sheet = ss.insertSheet(name);
        sheet.appendRow(headers);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      } else if (sheet.getLastRow() === 0) {
        sheet.appendRow(headers);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      }
    });
  } catch (err) {
    console.warn('Peringatan penyesuaian sheet Inventaris: ' + err.toString());
  }
}

function getAllSheetsData() {
  ensureUsersSheetStructure();
  ensureInventarisSheets();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheetNames = [
    'KUNJUNGAN', 'LIFE SAVING', 'KLB', 'RETENSI', 'IDUL FITRI', 'USERS',
    'INVENTARIS ALAT KESEHATAN', 'INVENTARIS ALAT TENUN', 'INVENTARIS ALAT RUMAH TANGGA'
  ];
  const result = {};
  sheetNames.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) {
      const vals = sheet.getDataRange().getDisplayValues();
      result[name] = (name === 'USERS') ? maskUsersPasswordColumn_(vals) : vals;
    } else {
      result[name] = [];
    }
  });
  return result;
}

function getSheetData(sheetName) {
  if (sheetName === 'USERS') {
    ensureUsersSheetStructure();
  }
  if (sheetName && sheetName.indexOf('INVENTARIS') === 0) {
    ensureInventarisSheets();
  }
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet ' + sheetName + ' tidak ditemukan.');
  // OPTIMASI: Gunakan getDisplayValues() alih-alih getValues() 
  // Ini mengunci agar Spreadsheet mengirim data tanggal secara aman ke Aplikasi Anda tanpa Error Serialization
  const vals = sheet.getDataRange().getDisplayValues();
  return (sheetName === 'USERS') ? maskUsersPasswordColumn_(vals) : vals;
}

function renumberSheet(sheetName) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(sheetName);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    // Pastikan kolom A adalah kolom 'NO' sebelum melakukan penomoran ulang
    const firstColHeader = (sheet.getRange(1, 1).getValue() || '').toString().trim().toUpperCase();
    if (firstColHeader !== 'NO') return; // Lindungi jika kolom A bukan NO

    const numRows = lastRow - 1;
    const numbers = [];
    for (let i = 1; i <= numRows; i++) {
      numbers.push([i]);
    }
    // Update kolom NO (Kolom A / 1)
    sheet.getRange(2, 1, numRows, 1).setValues(numbers);
  }
}

function normalizeDateStr_(val) {
  if (!val) return '';
  var s = val.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  
  var bulanIndo = {
    'januari': '01', 'februari': '02', 'maret': '03', 'april': '04',
    'mei': '05', 'juni': '06', 'juli': '07', 'agustus': '08',
    'september': '09', 'oktober': '10', 'november': '11', 'desember': '12'
  };
  
  var parts = s.split(/[\s,/-]+/);
  if (parts.length === 3) {
    var candidate = '';
    if (parts[0].length === 4) {
      var y = parts[0];
      var m = bulanIndo[parts[1].toLowerCase()] || ("0" + parts[1]).slice(-2);
      var d = ("0" + parts[2]).slice(-2);
      candidate = y + '-' + m + '-' + d;
    } else if (parts[2].length === 4) {
      var y = parts[2];
      var m = bulanIndo[parts[1].toLowerCase()] || ("0" + parts[1]).slice(-2);
      var d = ("0" + parts[0]).slice(-2);
      candidate = y + '-' + m + '-' + d;
    }
    if (candidate && !isNaN(new Date(candidate).getTime())) {
      return candidate;
    }
  }
  
  try {
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      var yr = d.getFullYear(), mo = ("0" + (d.getMonth() + 1)).slice(-2), da = ("0" + d.getDate()).slice(-2);
      return yr + '-' + mo + '-' + da;
    }
  } catch(e) { return s; }
  return s;
}

function saveData(sheetName, rowData, isUpdate, token) {
  const session = verifySessionToken_(token);
  assertUserCanAccess_(session, sheetName, isUpdate ? 'update' : 'create');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (sheetName && sheetName.indexOf('INVENTARIS') === 0) {
      ensureInventarisSheets();
    }
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(sheetName);
    if (!sheet) throw new Error('Sheet ' + sheetName + ' tidak ditemukan.');

    const cleanRowData = sanitizeRowData_(rowData);

    if (!isUpdate) {
      // Validasi urutan shift & keunikan khusus sheet KUNJUNGAN (TANGGAL + SHIFT + KATEGORI PASIEN)
      if (sheetName === 'KUNJUNGAN') {
        const existingData = sheet.getDataRange().getDisplayValues();
        const newDate = normalizeDateStr_(cleanRowData[2]);
        const newShift = (cleanRowData[3] || '').toString().trim();
        const newKat = (cleanRowData[4] || '').toString().trim();
        const newShiftLower = newShift.toLowerCase();
        const newKatLower = newKat.toLowerCase();

        // Validasi urutan shift (Pagi -> Sore -> Malam)
        const shiftOrder = { 'pagi': 1, 'sore': 2, 'malam': 3 };
        const targetOrder = shiftOrder[newShiftLower];
        if (targetOrder && targetOrder > 1) {
          const shifts = ['Pagi', 'Sore', 'Malam'];
          const reqCats = ['Anak', 'Bedah', 'Non Bedah', 'Kebidanan'];
          for (let sIdx = 0; sIdx < targetOrder - 1; sIdx++) {
            const prevShift = shifts[sIdx];
            const prevShiftLower = prevShift.toLowerCase();
            const filledCats = {};
            for (let i = 1; i < existingData.length; i++) {
              if (normalizeDateStr_(existingData[i][2]) === newDate &&
                  existingData[i][3].toString().trim().toLowerCase() === prevShiftLower) {
                filledCats[existingData[i][4].toString().trim().toLowerCase()] = true;
              }
            }
            const missingCats = reqCats.filter(function(k) { return !filledCats[k.toLowerCase()]; });
            if (missingCats.length > 0) {
              throw new Error('Shift ' + prevShift + ' pada tanggal ' + (cleanRowData[2] || '') + ' belum lengkap (kurang kategori: ' + missingCats.join(', ') + '). Shift ' + newShift + ' belum bisa diisi.');
            }
          }
        }

        // Validasi keunikan
        for (let i = 1; i < existingData.length; i++) {
          if (normalizeDateStr_(existingData[i][2]) === newDate &&
              existingData[i][3].toString().trim().toLowerCase() === newShiftLower &&
              existingData[i][4].toString().trim().toLowerCase() === newKatLower) {
            throw new Error('Data Kunjungan untuk Kategori ' + cleanRowData[4] + ' pada Shift ' + cleanRowData[3] + ' (' + (cleanRowData[2] || '') + ') sudah ada di server.');
          }
        }
      }

      // Validasi keunikan khusus sheet LIFE SAVING (TANGGAL + SHIFT + NAMA PASIEN atau CM)
      if (sheetName === 'LIFE SAVING') {
        const existingData = sheet.getDataRange().getDisplayValues();
        const newDate = normalizeDateStr_(cleanRowData[2]);
        const newShift = (cleanRowData[3] || '').toString().trim().toLowerCase();
        const newNama = (cleanRowData[4] || '').toString().trim().toUpperCase();
        const newCm = (cleanRowData[5] || '').toString().trim();
        for (let i = 1; i < existingData.length; i++) {
          const rowDate = normalizeDateStr_(existingData[i][2]);
          const rowShift = (existingData[i][3] || '').toString().trim().toLowerCase();
          const rowNama = (existingData[i][4] || '').toString().trim().toUpperCase();
          const rowCm = (existingData[i][5] || '').toString().trim();
          if (rowDate === newDate && rowShift === newShift) {
            const cmMatch = newCm && rowCm && newCm === rowCm;
            const namaMatch = newNama && rowNama && newNama === rowNama;
            if (cmMatch || namaMatch) {
              throw new Error('Data Life Saving untuk Pasien ' + (cleanRowData[4] || cleanRowData[5]) + ' pada Shift ' + cleanRowData[3] + ' (' + (cleanRowData[2] || '') + ') sudah ada di server.');
            }
          }
        }
      }

      // Validasi keunikan khusus sheet KLB (KEJADIAN + TANGGAL MASUK + NAMA PASIEN atau CM)
      if (sheetName === 'KLB') {
        const existingData = sheet.getDataRange().getDisplayValues();
        const newKejadian = (cleanRowData[2] || '').toString().trim().toLowerCase();
        const newDate = normalizeDateStr_(cleanRowData[3]);
        const newCm = (cleanRowData[5] || '').toString().trim();
        const newNama = (cleanRowData[6] || '').toString().trim().toUpperCase();
        for (let i = 1; i < existingData.length; i++) {
          const rowKejadian = (existingData[i][2] || '').toString().trim().toLowerCase();
          const rowDate = normalizeDateStr_(existingData[i][3]);
          const rowCm = (existingData[i][5] || '').toString().trim();
          const rowNama = (existingData[i][6] || '').toString().trim().toUpperCase();
          if (rowKejadian === newKejadian && rowDate === newDate) {
            const cmMatch = newCm && rowCm && newCm === rowCm;
            const namaMatch = newNama && rowNama && newNama === rowNama;
            if (cmMatch || namaMatch) {
              throw new Error('Data Pasien ' + (cleanRowData[6] || cleanRowData[5]) + ' pada Kejadian ' + (cleanRowData[2] || '') + ' (' + (cleanRowData[3] || '') + ') sudah ada di server.');
            }
          }
        }
      }

      // Validasi keunikan khusus sheet RETENSI (TANGGAL + JAM)
      if (sheetName === 'RETENSI') {
        const existingData = sheet.getDataRange().getDisplayValues();
        const normJam_ = function(v) {
          if (!v) return '';
          const s = v.toString().trim().toLowerCase();
          if (s.includes('07') || s.includes('7:') || s.includes('7.')) return '07:00';
          if (s.includes('19')) return '19:00';
          return s.replace(/\s*wib/g, '').replace(':', '.');
        };

        const newDate = normalizeDateStr_(cleanRowData[2]);
        const newJam = normJam_(cleanRowData[3]);
        for (let i = 1; i < existingData.length; i++) {
          const rowDate = normalizeDateStr_(existingData[i][2]);
          const rowJam = normJam_(existingData[i][3]);
          if (rowDate === newDate && rowJam === newJam) {
            throw new Error('Laporan Retensi untuk Jam ' + (cleanRowData[3] || '') + ' pada tanggal ' + (cleanRowData[2] || '') + ' sudah ada di server.');
          }
        }
      }

      // Validasi keunikan khusus sheet IDUL FITRI (TAHUN + TANGGAL MASUK + NAMA PASIEN atau CM)
      if (sheetName === 'IDUL FITRI') {
        const existingData = sheet.getDataRange().getDisplayValues();
        const newTahun = (cleanRowData[2] || '').toString().trim().toLowerCase();
        const newDate = normalizeDateStr_(cleanRowData[3]);
        const newCm = (cleanRowData[5] || '').toString().trim();
        const newNama = (cleanRowData[6] || '').toString().trim().toUpperCase();
        for (let i = 1; i < existingData.length; i++) {
          const rowTahun = (existingData[i][2] || '').toString().trim().toLowerCase();
          const rowDate = normalizeDateStr_(existingData[i][3]);
          const rowCm = (existingData[i][5] || '').toString().trim();
          const rowNama = (existingData[i][6] || '').toString().trim().toUpperCase();
          if (rowTahun === newTahun && rowDate === newDate) {
            const cmMatch = newCm && rowCm && newCm === rowCm;
            const namaMatch = newNama && rowNama && newNama === rowNama;
            if (cmMatch || namaMatch) {
              throw new Error('Data Pasien ' + (cleanRowData[6] || cleanRowData[5]) + ' pada Idul Fitri Tahun ' + (cleanRowData[2] || '') + ' (' + (cleanRowData[3] || '') + ') sudah ada di server.');
            }
          }
        }
      }

      // Validasi keunikan khusus sheet USERS (NAMA / Username)
      if (sheetName === 'USERS') {
        const existingData = sheet.getDataRange().getDisplayValues();
        const newNama = (cleanRowData[2] || '').toString().trim().toLowerCase();
        for (let i = 1; i < existingData.length; i++) {
          if (existingData[i][2].toString().trim().toLowerCase() === newNama) {
            throw new Error('Nama pengguna "' + cleanRowData[2] + '" sudah terdaftar.');
          }
        }
      }

      // Validasi keunikan ID (Index 1)
      const existingData = sheet.getDataRange().getValues();
      const newId = String(cleanRowData[1] || '').trim();
      for (let i = 1; i < existingData.length; i++) {
        if (String(existingData[i][1]).trim() === newId) {
          cleanRowData[1] = Math.random().toString(36).substr(2, 6).toUpperCase();
          break;
        }
      }

      sheet.appendRow(cleanRowData);
    } else {
      const data = sheet.getDataRange().getValues();
      const idToFind = String(cleanRowData[1]).trim();
      let found = false;

      // Validasi keunikan khusus sheet KUNJUNGAN saat update
      if (sheetName === 'KUNJUNGAN') {
        const displayData = sheet.getDataRange().getDisplayValues();
        const newDate = normalizeDateStr_(cleanRowData[2]);
        const newShift = (cleanRowData[3] || '').toString().trim().toLowerCase();
        const newKat = (cleanRowData[4] || '').toString().trim().toLowerCase();
        for (let i = 1; i < displayData.length; i++) {
          const rowId = String(displayData[i][1]).trim();
          if (rowId !== idToFind) {
            if (normalizeDateStr_(displayData[i][2]) === newDate &&
                displayData[i][3].toString().trim().toLowerCase() === newShift &&
                displayData[i][4].toString().trim().toLowerCase() === newKat) {
              throw new Error('Data Kunjungan untuk Kategori ' + cleanRowData[4] + ' pada Shift ' + cleanRowData[3] + ' (' + (cleanRowData[2] || '') + ') sudah digunakan oleh data lain di server.');
            }
          }
        }
      }

      // Validasi keunikan khusus sheet LIFE SAVING saat update
      if (sheetName === 'LIFE SAVING') {
        const displayData = sheet.getDataRange().getDisplayValues();
        const newDate = normalizeDateStr_(cleanRowData[2]);
        const newShift = (cleanRowData[3] || '').toString().trim().toLowerCase();
        const newNama = (cleanRowData[4] || '').toString().trim().toUpperCase();
        const newCm = (cleanRowData[5] || '').toString().trim();
        for (let i = 1; i < displayData.length; i++) {
          const rowId = String(displayData[i][1]).trim();
          if (rowId !== idToFind) {
            const rowDate = normalizeDateStr_(displayData[i][2]);
            const rowShift = (displayData[i][3] || '').toString().trim().toLowerCase();
            const rowNama = (displayData[i][4] || '').toString().trim().toUpperCase();
            const rowCm = (displayData[i][5] || '').toString().trim();
            if (rowDate === newDate && rowShift === newShift) {
              const cmMatch = newCm && rowCm && newCm === rowCm;
              const namaMatch = newNama && rowNama && newNama === rowNama;
              if (cmMatch || namaMatch) {
                throw new Error('Data Life Saving untuk Pasien ' + (cleanRowData[4] || cleanRowData[5]) + ' pada Shift ' + cleanRowData[3] + ' sudah digunakan oleh data lain di server.');
              }
            }
          }
        }
      }

      // Validasi keunikan khusus sheet KLB saat update
      if (sheetName === 'KLB') {
        const displayData = sheet.getDataRange().getDisplayValues();
        const newKejadian = (cleanRowData[2] || '').toString().trim().toLowerCase();
        const newDate = normalizeDateStr_(cleanRowData[3]);
        const newCm = (cleanRowData[5] || '').toString().trim();
        const newNama = (cleanRowData[6] || '').toString().trim().toUpperCase();
        for (let i = 1; i < displayData.length; i++) {
          const rowId = String(displayData[i][1]).trim();
          if (rowId !== idToFind) {
            const rowKejadian = (displayData[i][2] || '').toString().trim().toLowerCase();
            const rowDate = normalizeDateStr_(displayData[i][3]);
            const rowCm = (displayData[i][5] || '').toString().trim();
            const rowNama = (displayData[i][6] || '').toString().trim().toUpperCase();
            if (rowKejadian === newKejadian && rowDate === newDate) {
              const cmMatch = newCm && rowCm && newCm === rowCm;
              const namaMatch = newNama && rowNama && newNama === rowNama;
              if (cmMatch || namaMatch) {
                throw new Error('Data Pasien ' + (cleanRowData[6] || cleanRowData[5]) + ' pada Kejadian ' + (cleanRowData[2] || '') + ' sudah digunakan oleh data lain di server.');
              }
            }
          }
        }
      }

      // Validasi keunikan khusus sheet RETENSI saat update
      if (sheetName === 'RETENSI') {
        const displayData = sheet.getDataRange().getDisplayValues();
        const normJam_ = function(v) {
          if (!v) return '';
          const s = v.toString().trim().toLowerCase();
          if (s.includes('07') || s.includes('7:') || s.includes('7.')) return '07:00';
          if (s.includes('19')) return '19:00';
          return s.replace(/\s*wib/g, '').replace(':', '.');
        };
        const newDate = normalizeDateStr_(cleanRowData[2]);
        const newJam = normJam_(cleanRowData[3]);
        for (let i = 1; i < displayData.length; i++) {
          const rowId = String(displayData[i][1]).trim();
          if (rowId !== idToFind) {
            const rowDate = normalizeDateStr_(displayData[i][2]);
            const rowJam = normJam_(displayData[i][3]);
            if (rowDate === newDate && rowJam === newJam) {
              throw new Error('Laporan Retensi untuk Jam ' + (cleanRowData[3] || '') + ' pada tanggal ' + (cleanRowData[2] || '') + ' sudah digunakan oleh data lain di server.');
            }
          }
        }
      }

      // Validasi keunikan khusus sheet IDUL FITRI saat update
      if (sheetName === 'IDUL FITRI') {
        const displayData = sheet.getDataRange().getDisplayValues();
        const newTahun = (cleanRowData[2] || '').toString().trim().toLowerCase();
        const newDate = normalizeDateStr_(cleanRowData[3]);
        const newCm = (cleanRowData[5] || '').toString().trim();
        const newNama = (cleanRowData[6] || '').toString().trim().toUpperCase();
        for (let i = 1; i < displayData.length; i++) {
          const rowId = String(displayData[i][1]).trim();
          if (rowId !== idToFind) {
            const rowTahun = (displayData[i][2] || '').toString().trim().toLowerCase();
            const rowDate = normalizeDateStr_(displayData[i][3]);
            const rowCm = (displayData[i][5] || '').toString().trim();
            const rowNama = (displayData[i][6] || '').toString().trim().toUpperCase();
            if (rowTahun === newTahun && rowDate === newDate) {
              const cmMatch = newCm && rowCm && newCm === rowCm;
              const namaMatch = newNama && rowNama && newNama === rowNama;
              if (cmMatch || namaMatch) {
                throw new Error('Data Pasien ' + (cleanRowData[6] || cleanRowData[5]) + ' pada Idul Fitri Tahun ' + (cleanRowData[2] || '') + ' sudah digunakan oleh data lain di server.');
              }
            }
          }
        }
      }

      // Validasi keunikan khusus sheet USERS saat update (NAMA tidak boleh duplikat dengan akun lain)
      if (sheetName === 'USERS') {
        const newNama = (cleanRowData[2] || '').toString().trim().toLowerCase();
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][1]).trim() !== idToFind && (data[i][2] || '').toString().trim().toLowerCase() === newNama) {
            throw new Error('Nama pengguna "' + cleanRowData[2] + '" sudah digunakan oleh akun lain.');
          }
          if (String(data[i][1]).trim() === idToFind) {
            const incomingPwd = (cleanRowData[3] || '').toString().trim();
            if (!incomingPwd || incomingPwd === '••••••••') {
              cleanRowData[3] = data[i][3]; // Pertahankan password lama jika tidak diubah
            }
          }
        }
      }

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][1]).trim() === idToFind) {
          sheet.getRange(i + 1, 1, 1, cleanRowData.length).setValues([cleanRowData]);
          found = true;
          break;
        }
      }
      if (!found) {
        throw new Error('Data dengan ID ' + idToFind + ' tidak ditemukan di server.');
      }
    }
    // Lakukan Penomoran Ulang setelah simpan/update
    renumberSheet(sheetName);
    // Kembalikan data terbaru untuk Cache FrontEnd
    return getSheetData(sheetName);
  } finally {
    lock.releaseLock();
  }
}

function deleteData(sheetName, id, token) {
  const session = verifySessionToken_(token);
  assertUserCanAccess_(session, sheetName, 'delete');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(sheetName);
    if (!sheet) throw new Error('Sheet ' + sheetName + ' tidak ditemukan.');
    const data = sheet.getDataRange().getValues();
    const idToFind = String(id).trim();
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim() === idToFind) {
        sheet.deleteRow(i + 1);
        found = true;
        break;
      }
    }
    if (!found) {
      throw new Error('Data dengan ID ' + id + ' tidak ditemukan di server.');
    }
    renumberSheet(sheetName);
    return getSheetData(sheetName);
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// 4. MENGAMBIL & MENGELOLA FOTO SLIDESHOW (DRIVE - MAKS 9 FOTO)
// ==========================================
function getSlideshowImages() {
  try {
    const folder = DriveApp.getFolderById(SLIDESHOW_FOLDER_ID);
    const files = folder.getFiles();
    const slots = [];
    for (let i = 1; i <= 9; i++) {
      slots.push({ slot: i, id: null, url: null, name: null });
    }
    
    const unassigned = [];
    while (files.hasNext()) {
      const file = files.next();
      if (file.isTrashed()) continue;
      const mimeType = file.getMimeType();
      if (!mimeType.startsWith('image/')) continue;
      
      const fname = file.getName();
      const m = fname.match(/slideshow_([1-9])\b/i);
      if (m) {
        const idx = parseInt(m[1], 10) - 1;
        if (idx >= 0 && idx < 9 && !slots[idx].id) {
          slots[idx] = {
            slot: idx + 1,
            id: file.getId(),
            url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1920',
            name: fname
          };
          continue;
        }
      }
      unassigned.push({
        id: file.getId(),
        url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1920',
        name: fname
      });
    }
    
    // Assign foto lainnya ke slot kosong
    for (let i = 0; i < 9 && unassigned.length > 0; i++) {
      if (!slots[i].id) {
        const item = unassigned.shift();
        slots[i] = {
          slot: i + 1,
          id: item.id,
          url: item.url,
          name: item.name
        };
      }
    }
    
    return slots;
  } catch (e) {
    console.error('getSlideshowImages error: ' + e.toString());
    const fallback = [];
    for (let i = 1; i <= 9; i++) {
      fallback.push({ slot: i, id: null, url: null, name: null });
    }
    return fallback;
  }
}

function uploadSlideshowPhoto(slotIndex, base64Data, mimeType, token) {
  try {
    const session = verifySessionToken_(token);
    if (!session || session.role !== 'Super Admin') {
      return { success: false, message: 'Akses Ditolak: Hanya Super Admin yang berwenang mengunggah foto slideshow.' };
    }

    const slot = parseInt(slotIndex, 10);
    if (isNaN(slot) || slot < 1 || slot > 9) {
      return { success: false, message: 'Nomor slot tidak valid (wajib 1 - 9).' };
    }
    
    const folder = DriveApp.getFolderById(SLIDESHOW_FOLDER_ID);
    
    // Hapus/trash file foto lama pada slot ini jika ada
    const files = folder.getFiles();
    while (files.hasNext()) {
      const f = files.next();
      if (f.isTrashed()) continue;
      const fname = f.getName().toLowerCase();
      if (fname.startsWith('slideshow_' + slot + '.') || fname === 'slideshow_' + slot) {
        f.setTrashed(true);
      }
    }
    
    // Bersihkan format data URL jika ada
    let cleanBase64 = base64Data || '';
    if (cleanBase64.indexOf(',') > -1) {
      cleanBase64 = cleanBase64.split(',')[1];
    }
    
    const contentType = mimeType || 'image/jpeg';
    const decodedBytes = Utilities.base64Decode(cleanBase64);
    const fileName = 'slideshow_' + slot + '.jpg';
    const blob = Utilities.newBlob(decodedBytes, contentType, fileName);
    
    const newFile = folder.createFile(blob);
    try {
      newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (errSharing) {}
    
    return {
      success: true,
      message: 'Foto ' + slot + ' berhasil disimpan!',
      slots: getSlideshowImages()
    };
  } catch (err) {
    return { success: false, message: 'Gagal mengunggah foto: ' + err.toString() };
  }
}

function deleteSlideshowPhoto(slotIndex, token) {
  try {
    const session = verifySessionToken_(token);
    if (!session || session.role !== 'Super Admin') {
      return { success: false, message: 'Akses Ditolak: Hanya Super Admin yang berwenang menghapus foto slideshow.' };
    }

    const slot = parseInt(slotIndex, 10);
    if (isNaN(slot) || slot < 1 || slot > 9) {
      return { success: false, message: 'Nomor slot tidak valid (wajib 1 - 9).' };
    }
    
    const folder = DriveApp.getFolderById(SLIDESHOW_FOLDER_ID);
    const files = folder.getFiles();
    let deleted = false;
    while (files.hasNext()) {
      const f = files.next();
      if (f.isTrashed()) continue;
      const fname = f.getName().toLowerCase();
      if (fname.startsWith('slideshow_' + slot + '.') || fname === 'slideshow_' + slot) {
        f.setTrashed(true);
        deleted = true;
      }
    }
    return {
      success: true,
      message: deleted ? 'Foto ' + slot + ' berhasil dihapus.' : 'Foto tidak ditemukan.',
      slots: getSlideshowImages()
    };
  } catch (err) {
    return { success: false, message: 'Gagal menghapus foto: ' + err.toString() };
  }
}

// ==========================================
// 4B. BACKUP DATABASE (SUPER ADMIN)
// ==========================================
function backupDatabase(token) {
  try {
    const session = verifySessionToken_(token);
    if (!session || session.role !== 'Super Admin') {
      return { success: false, message: 'Akses Ditolak: Hanya Super Admin yang berwenang melakukan backup database.' };
    }

    if (!BACKUP_FOLDER_ID || BACKUP_FOLDER_ID.trim() === '') {
      return { success: false, message: 'BACKUP_FOLDER_ID belum dikonfigurasi di server.' };
    }

    const backupFolder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
    const dateStr = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
    const timeStr = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'HH.mm');
    const baseName = dateStr + '_Backup Database IGD';

    // Periksa apakah file dengan nama dasar sudah ada pada hari ini; jika ada, tambahkan penanda jam
    let targetName = baseName;
    const existing = backupFolder.getFilesByName(baseName);
    if (existing.hasNext()) {
      targetName = baseName + ' (' + timeStr + ')';
    }

    // Salin seluruh isi Spreadsheet Database (semua sheet)
    const sourceFile = DriveApp.getFileById(SHEET_ID);
    const backupFile = sourceFile.makeCopy(targetName, backupFolder);

    return {
      success: true,
      message: 'Backup database berhasil disimpan!',
      fileName: backupFile.getName(),
      fileUrl: backupFile.getUrl(),
      createdDate: Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss')
    };
  } catch (err) {
    return { success: false, message: 'Gagal melakukan backup: ' + err.toString() };
  }
}

function listDatabaseBackups(token) {
  try {
    const session = verifySessionToken_(token);
    if (!session || session.role !== 'Super Admin') {
      return { success: false, message: 'Akses Ditolak: Hanya Super Admin yang berwenang melihat riwayat backup.', backups: [] };
    }

    if (!BACKUP_FOLDER_ID || BACKUP_FOLDER_ID.trim() === '') {
      return { success: false, message: 'BACKUP_FOLDER_ID belum dikonfigurasi.', backups: [] };
    }

    const backupFolder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
    const files = backupFolder.getFiles();
    const list = [];

    while (files.hasNext()) {
      const f = files.next();
      if (f.isTrashed()) continue;
      const name = f.getName();
      if (name.indexOf('_Backup Database IGD') !== -1) {
        list.push({
          id: f.getId(),
          name: name,
          url: f.getUrl(),
          createdDate: Utilities.formatDate(f.getDateCreated(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss'),
          size: f.getSize()
        });
      }
    }

    // Urutkan terbaru di atas (descending)
    list.sort(function(a, b) {
      return (b.createdDate || '').localeCompare(a.createdDate || '');
    });

    return { success: true, backups: list.slice(0, 30) };
  } catch (err) {
    return { success: false, message: 'Gagal mengambil riwayat backup: ' + err.toString(), backups: [] };
  }
}

// ==========================================
// 5. MANAJEMEN SUBFOLDER & CLEANUP EKSPOR SEMENTARA
// ==========================================
function getOrCreateTempExportsFolder() {
  if (!FOLDER_ID || FOLDER_ID.trim() === '') {
    throw new Error('FOLDER_ID belum dikonfigurasi di server.');
  }
  const parentFolder = DriveApp.getFolderById(FOLDER_ID);
  const subfolders = parentFolder.getFoldersByName('Temp_Exports');
  if (subfolders.hasNext()) {
    return subfolders.next();
  }
  return parentFolder.createFolder('Temp_Exports');
}

function cleanupOldTempExports() {
  try {
    const tempFolder = getOrCreateTempExportsFolder();
    // Pengamanan ketat: jangan pernah menyapu folder Root Drive
    if (tempFolder.getId() === DriveApp.getRootFolder().getId() || tempFolder.getName() !== 'Temp_Exports') {
      console.warn('Pembersihan dibatalkan: folder tujuan bukan Temp_Exports.');
      return;
    }
    const files = tempFolder.getFiles();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000; // Sesuai PRD: berkas lebih tua dari 24 jam
    while (files.hasNext()) {
      const file = files.next();
      const fName = file.getName();
      // Hanya bersihkan file sementara retensi yang sudah usang (> 24 jam)
      if ((fName.indexOf('Laporan_Retensi_') === 0 || fName.indexOf('Data_Retensi_') === 0 || fName.indexOf('temp_') === 0) &&
          file.getLastUpdated().getTime() < oneDayAgo) {
        file.setTrashed(true);
      }
    }
  } catch (err) {
    console.warn('Peringatan cleanup berkas sementara: ' + err.toString());
  }
}

// ==========================================
// 6. EXPORT WORD (KHUSUS RETENSI)
// ==========================================
function generateRetensiDoc(docData) {
  let newFile = null;
  try {
    // Bersihkan berkas sementara terdahulu di Google Drive
    cleanupOldTempExports();

    // Validasi parameter aman
    if (!docData) throw new Error("Data permintaan kosong.");
    if (typeof docData === 'string') docData = JSON.parse(docData);
    
    // K3 FIX: Hardcode templateId untuk mencegah eksfiltrasi file Google Docs lain
    const templateId = '1DN_-I9XkF_dTzExMVyGwYRs4cqGw5eAsoEtRCX8s4bM';
    const placeholders = docData.placeholders || {};
    const tgl = placeholders['TANGGAL'] || 'Baru';
    const jam = placeholders['JAM'] ? '_' + String(placeholders['JAM']).replace(/[^a-zA-Z0-9]/g, '') : '';
    const newFileName = 'Data_Retensi_' + tgl + jam;
    
    // Tempatkan salinan dokumen sementara ke dalam subfolder khusus Temp_Exports
    const targetFolder = getOrCreateTempExportsFolder();
    const templateFile = DriveApp.getFileById(templateId);
    newFile = templateFile.makeCopy(newFileName, targetFolder);
    const docId = newFile.getId();
    
    // Buka dokumen duplikat untuk memanipulasi teks
    const doc = DocumentApp.openById(docId);
    const body = doc.getBody();
    const header = doc.getHeader();
    const footer = doc.getFooter();

    // Optimasi Cerdas: Ambil teks seluruh bagian sekali saja untuk verifikasi keberadaan placeholder
    // Ini memangkas lebih dari 100 pemanggilan RPC yang tidak perlu pada server Google Docs
    const bodyText = body ? body.getText() : '';
    const headerText = header ? header.getText() : '';
    const footerText = footer ? footer.getText() : '';
    
    // Loop penggantian Placeholder efisien: hanya eksekusi jika placeholder benar-benar ada di dokumen
    for (const key in placeholders) {
      const keyLower = key.toLowerCase();
      const inBody = bodyText && bodyText.toLowerCase().indexOf(keyLower) !== -1;
      const inHeader = header && headerText.toLowerCase().indexOf(keyLower) !== -1;
      const inFooter = footer && footerText.toLowerCase().indexOf(keyLower) !== -1;

      // Lewati panggilan replaceText jika penanda sama sekali tidak ditemukan di dokumen template
      if (!inBody && !inHeader && !inFooter) continue;

      const rawVal = placeholders[key] !== undefined && placeholders[key] !== null ? String(placeholders[key]) : '';
      const safeVal = rawVal.replace(/\\/g, '\\\\').replace(/\$/g, '\\$');
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Pola regex gabungan toleran spasi dan format kurung (<<KEY>> atau {{KEY}}) dalam satu panggilan
      const combinedPattern = '(?i)(<<|\\{\\{)\\s*' + escapedKey + '\\s*(>>|\\}\\})';
      
      if (inBody) { try { body.replaceText(combinedPattern, safeVal); } catch(e){} }
      if (inHeader) { try { header.replaceText(combinedPattern, safeVal); } catch(e){} }
      if (inFooter) { try { footer.replaceText(combinedPattern, safeVal); } catch(e){} }
    }
    
    // Wajib simpan dan tutup agar perubahan teks tersinkronisasi
    doc.saveAndClose();
    
    let base64Data = null;

    // Ambil data binary docx secara cepat menggunakan feed export langsung
    try {
      const token = ScriptApp.getOAuthToken();
      const fastExportUrl = "https://docs.google.com/feeds/download/documents/export/Export?id=" + docId + "&exportFormat=docx";
      const res = UrlFetchApp.fetch(fastExportUrl, {
        headers: { Authorization: 'Bearer ' + token },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        const bytes = res.getBlob().getBytes();
        if (bytes && bytes.length > 50) {
          base64Data = Utilities.base64Encode(bytes);
        }
      }
    } catch (fetchErr) {
      console.warn("Peringatan pengambilan blob docx: " + fetchErr.toString());
    }
    
    // CEGAH SIMPAN DI GDRIVE: Segera hapus berkas salinan sementara dari Google Drive
    // Berkas Word HANYA disimpan ke perangkat pengguna via stream base64/Blob di browser
    if (newFile) {
      try {
        newFile.setTrashed(true);
      } catch (delErr) {
        console.warn("Peringatan penghapusan berkas sementara: " + delErr.toString());
      }
    }

    if (!base64Data) {
      throw new Error("Gagal mengonversi dokumen Word ke binary.");
    }
    
    return {
      success: true,
      filename: newFileName + '.docx',
      base64: base64Data
    };
  } catch (e) {
    if (newFile) {
      try {
        newFile.setTrashed(true);
      } catch (delErr) {}
    }
    throw new Error(e.toString());
  }
}