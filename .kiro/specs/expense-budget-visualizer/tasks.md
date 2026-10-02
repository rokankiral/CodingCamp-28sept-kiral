# Implementation Plan: Expense & Budget Visualizer

## Overview

Implementasi aplikasi single-file HTML/CSS/Vanilla JavaScript yang berjalan sepenuhnya di browser tanpa backend atau build process. Pendekatan inkremental: mulai dari struktur HTML dan CSS, lalu bangun modul JavaScript satu per satu (State → Storage → Validator → Renderer → Controller), akhirnya integrasikan semua komponen ke dalam satu file `index.html` yang berfungsi penuh.

---

## Tasks

- [x] 1. Buat struktur HTML dan CSS dasar
  - Buat file `index.html` dengan skeleton HTML5 yang mengandung semua elemen DOM utama: `#balance-header`, `#input-form`, `#transaction-list-container`, dan `#chart-container`
  - Tambahkan tag `<script>` Chart.js via CDN (`https://cdn.jsdelivr.net/npm/chart.js`)
  - Tulis embedded CSS untuk layout, tipografi, responsif (320px–1280px), warna badge kategori, dan efek hover pada tombol/elemen interaktif
  - Pastikan `#balance-header` menggunakan `position: sticky; top: 0` agar Total Balance selalu terlihat
  - Pastikan `#transaction-list-container` menggunakan `overflow-y: auto` untuk scrolling independen
  - Terapkan font-size minimal 14px untuk teks isi, minimal 20px untuk nilai Total Balance, dan minimal 32px dengan font-weight 700 untuk elemen `#total-balance`
  - _Requirements: 7.1, 7.2, 7.3, 7.6, 3.1_

- [x] 2. Implementasi modul State dan Storage
  - [x] 2.1 Implementasi State global dan Storage module
    - Deklarasikan `const state = { transactions: [] }` sebagai single source of truth
    - Implementasikan `Storage.isAvailable()` yang mendeteksi ketersediaan Local Storage dengan try/catch
    - Implementasikan `Storage.load()` yang membaca dan mem-parse JSON dari Local Storage; jika data tidak ada kembalikan `null`; jika data invalid/corrupt throw error
    - Implementasikan `Storage.save(transactions)` yang meng-serialize array ke JSON dan menulis ke Local Storage; jika quota penuh throw `StorageQuotaError`
    - Implementasikan `Storage.clear()` yang menulis array kosong `[]` ke Local Storage
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.5, 6.6_


- [x] 3. Implementasi modul Validator
  - [x] 3.1 Implementasi `Validator.validateTransaction()`
    - Validasi `name`: wajib diisi, tidak boleh hanya whitespace, maksimal 100 karakter
    - Validasi `amount`: wajib diisi, nilai numerik > 0, maksimal 999_999_999.99
    - Validasi `category`: wajib salah satu dari `['Food', 'Transport', 'Fun']`
    - Return `{ valid: true }` jika semua valid, atau `{ valid: false, errors: { name?, amount?, category? } }` jika ada error
    - _Requirements: 1.1, 1.2, 1.5_

  - `

- [ ] 4. Checkpoint — Verifikasi modul State, Storage, dan Validator
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implementasi modul Renderer
  - [ ] 5.1 Implementasi `Renderer.renderBalance()`
    - Hitung `sum` dari semua `state.transactions.map(t => t.amount)`
    - Format menggunakan `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })`
    - Jika `sum > 999_999_999.99`, tampilkan indikasi overflow di area `#total-balance` tanpa mengubah data
    - Jika `state.transactions` kosong, tampilkan `Rp 0,00`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_



  - [ ] 5.3 Implementasi `Renderer.renderList()`
    - Kosongkan `#transaction-list` lalu re-render semua item dari `state.transactions`
    - Setiap item `<li>` menampilkan nama, kategori (badge berwarna), jumlah (format Rp), dan tombol hapus dengan `aria-label="Hapus {name}"`
    - Jika `state.transactions.length === 0`, tampilkan `#empty-message` menggantikan seluruh area daftar
    - _Requirements: 2.1, 2.5_

  - [ ] 5.4 Implementasi `Renderer.renderChart()`
    - Hitung `CategoryTotals` dari `state.transactions` untuk Food, Transport, Fun
    - Jika semua total = 0, sembunyikan canvas dan tampilkan `#chart-empty-message`
    - Jika ada total > 0, tampilkan canvas; filter hanya kategori dengan `total > 0` untuk data dan label
    - Gunakan Chart.js: buat instance sekali saat init, perbarui dengan `chart.data = ...` + `chart.update()` pada setiap call
    - Konfigurasi label persentase format `33.3%` pada segmen (via Chart.js `datalabels` atau `tooltip` callback)
    - Render legenda custom di `#chart-legend` — hanya kategori dengan `total > 0`, beserta warna sesuai `CATEGORY_COLORS`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
 

- [ ] 6. Implementasi modul Controller
  - [ ] 6.1 Implementasi `addTransaction(name, amount, category)`
    - Jalankan `Validator.validateTransaction()` → jika invalid, tampilkan error per-field di `#form-errors` (aria-live), return
    - Buat objek Transaction baru: `id = crypto.randomUUID()`, `name`, `amount = parseFloat(amount)`, `category`
    - Push ke `state.transactions`
    - Panggil `Storage.save()` → jika gagal (quota error), pop dari array, tampilkan inline error di form, kembalikan nilai form, return
    - Panggil `renderAll()`
    - Reset semua field form
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ] 6.2 Implementasi `deleteTransaction(id)`
    - Simpan snapshot sementara `state.transactions`
    - Filter out transaksi dengan `id` yang cocok dari `state.transactions`
    - Panggil `Storage.save()` → jika gagal, restore dari snapshot, tampilkan toast error, return
    - Panggil `renderAll()`
    - _Requirements: 2.3, 2.4_

  

- [ ] 7. Checkpoint — Verifikasi modul Renderer dan Controller
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implementasi inisialisasi, error UI, dan integrasi ke index.html
  - [ ] 8.1 Implementasi fungsi `renderAll()` dan alur inisialisasi
    - Implementasikan `Renderer.renderAll()` yang memanggil `renderBalance()`, `renderList()`, dan `renderChart()` secara sinkron dalam satu fungsi
    - Tulis alur `DOMContentLoaded`: periksa `Storage.isAvailable()` → jika false, tampilkan warning banner permanen; panggil `Storage.load()` → tangani corrupt data dengan `Storage.clear()`; set `state.transactions`; panggil `renderAll()`
    - _Requirements: 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.5_

  - [ ] 8.2 Implementasi komponen UI error: toast dan inline form error
    - Implementasikan `showToast(message, type)` yang menampilkan notifikasi di pojok kanan bawah, auto-dismiss setelah 5 detik, dapat ditutup manual
    - Hubungkan toast ke: Storage quota error (Req 6.6), gagal hapus (Req 2.4)
    - Hubungkan inline error ke: validasi form (Req 1.2, 1.5), gagal simpan saat add (Req 1.6)
    - Tambahkan indikasi overflow di `#total-balance` (Req 3.5)
    - Tambahkan fallback message jika Chart.js gagal load (Req 4.4 — tampilkan pesan di `#chart-container`)
    - _Requirements: 1.6, 2.4, 3.5, 6.5, 6.6_

  - [ ] 8.3 Pasang event listeners dan hubungkan semua modul
    - Pasang event listener `submit` pada `#input-form` yang memanggil `addTransaction()`
    - Pasang event delegation pada `#transaction-list` untuk tombol hapus yang memanggil `deleteTransaction(id)` berdasarkan `data-id`
    - Pasang real-time validation pada `#item-amount` (`input` event) untuk disable/enable tombol submit (Req 1.5)
    - Pastikan semua modul (State, Storage, Validator, Renderer, Controller) terhubung dan dapat mengakses satu sama lain dalam scope script yang sama
    - _Requirements: 1.3, 1.5, 2.3, 6.1, 6.2, 6.4_


- [ ] 9. Final Checkpoint — Verifikasi keseluruhan aplikasi
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks bertanda `*` adalah opsional dan dapat dilewati untuk MVP yang lebih cepat
- Setiap task mereferensikan requirement spesifik untuk traceability
- Semua kode ditulis dalam satu file `index.html` (embedded CSS + JS), sesuai Requirement 6.4
- Chart.js dimuat via CDN; tidak ada build process atau npm install untuk production
- Property tests menggunakan fast-check (minimum 100 iterasi per property)
- Unit/integration tests menggunakan Vitest + jsdom (devDependencies saja, tidak bundled ke production)
- Checkpoints memastikan validasi inkremental sebelum melanjutkan ke fase berikutnya

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3"] },
    { "id": 3, "tasks": ["5.1", "5.3", "5.4"] },
    { "id": 4, "tasks": ["5.2", "5.5", "5.6", "5.7", "6.1", "6.2"] },
    { "id": 5, "tasks": ["6.3", "6.4", "6.5", "8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3"] },
    { "id": 7, "tasks": ["8.4"] }
  ]
}
```
