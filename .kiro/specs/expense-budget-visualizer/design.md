# Design Document: Expense & Budget Visualizer

## Overview

Expense & Budget Visualizer adalah aplikasi web single-page yang berjalan sepenuhnya di sisi klien (browser) tanpa backend, build process, atau framework JavaScript. Seluruh aplikasi dikemas dalam **satu file HTML** yang mengandung embedded CSS dan JavaScript.

Arsitektur ini dipilih karena:
- Memenuhi constraint Requirement 6.4 (hanya HTML, CSS, Vanilla JS — tanpa framework, tanpa build)
- Memudahkan distribusi dan penggunaan — cukup buka file di browser
- Memanfaatkan Local Storage API yang tersedia di semua Modern_Browser target

**Tech stack:**
- HTML5 (struktur & semantic markup)
- CSS3 (layout, responsif, animasi visual, dark/light mode variables)
- Vanilla JavaScript ES6+ (logika, state management, event handling)
- Chart.js 4.x (via CDN) untuk rendering pie chart pada Canvas API
- Web Storage API (Local Storage) untuk persistensi data

**Struktur file:**
```
project-root/
├── index.html        ← markup HTML saja
├── css/
│   └── style.css     ← semua styling (layout, responsif, dark/light mode variables)
└── js/
    └── app.js        ← semua logika (State, Storage, Validator, Renderer, Controller)
```

**Target browser:** Chrome 109+, Firefox 109+, Edge 109+, Safari 16+

---

## Architecture

Aplikasi mengikuti pola **MVC ringan berbasis event** yang diimplementasikan secara prosedural dalam tiga file terpisah. Tidak ada class hierarki yang kompleks — state disimpan dalam satu objek global di `js/app.js`, dan setiap perubahan state memicu fungsi render yang memperbarui semua komponen sekaligus dalam satu siklus (memenuhi Requirement 6.2).

```
project-root/
│
├── index.html                   ← markup HTML saja, link ke CSS & JS
│    ├── <link> css/style.css
│    ├── <script src CDN>        Chart.js 4.x via CDN
│    └── <script src js/app.js>
│
├── css/
│   └── style.css                ← semua styling
│        ├── CSS custom properties (dark/light mode variables)
│        ├── Layout & typography
│        ├── Responsive breakpoints
│        ├── Component styles
│        └── .transaction-item--over-limit
│
└── js/
    └── app.js                   ← semua logika
         ├── State      { transactions[], sortOrder, spendingLimit }
         ├── Storage    load / save / clear / loadLimit / saveLimit
         ├── Validator  validateTransaction()
         ├── Renderer   renderAll()
         │               ├── renderBalance()
         │               ├── renderList()       (+ sort + highlight)
         │               ├── renderChart()
         │               └── renderMonthlySummary() (jika summary terbuka)
         └── Controller addTransaction() / deleteTransaction()
                         setSortOrder() / setSpendingLimit()
                         toggleMonthlySummary()
```

**Relasi antar file:**

```
index.html
    │  (DOM Structure)
    │   ├── #balance-header      (Total Balance)
    │   ├── #spending-limit-bar  (Spending Limit input)
    │   ├── #input-form          (Input Form)
    │   ├── #sort-bar            (Sort controls)
    │   ├── #transaction-list-container
    │   ├── #monthly-summary     (Monthly Summary, hidden by default)
    │   └── #chart-container     (Pie Chart + legend)
    │
    ├──► css/style.css  (diload oleh browser, tidak ada dependency JS)
    │
    └──► js/app.js      (dieksekusi setelah DOMContentLoaded)
              └──► Chart.js (global `Chart` dari CDN)
```

### Data Flow

```
User Input
    │
    ▼
Controller (addTransaction / deleteTransaction)
    │
    ├──► Validator (validateTransaction)
    │         │ invalid → show error, abort
    │         │ valid   → continue
    │
    ├──► State update  (transactions array)
    │
    ├──► Storage.save()  (write to Local Storage)
    │         │ fail → show storage error, keep form data
    │
    └──► renderAll()
              ├── renderBalance()   → update #total-balance DOM
              ├── renderList()      → update #transaction-list DOM
              └── renderChart()     → update Chart.js instance
```

### Initialization Flow

```
DOMContentLoaded
    │
    ├──► Check Local Storage availability
    │         │ unavailable → show persistent warning banner
    │
    ├──► Storage.load()
    │         │ valid JSON array → State.transactions = data
    │         │ invalid/corrupt  → State.transactions = []
    │         │                    Storage.clear() (overwrite corrupt data)
    │         │ empty            → State.transactions = []
    │
    └──► renderAll()  (initial render)
```

---

## Components and Interfaces

### 1. State (Global)

```javascript
const state = {
  transactions: [],             // Transaction[]
  sortOrder:    'default',      // 'default' | 'amount-desc' | 'amount-asc' | 'category-asc'
  spendingLimit: 0              // number; 0 berarti fitur highlight tidak aktif
};
```

State adalah satu-satunya sumber kebenaran (single source of truth). Tidak ada komponen yang menyimpan state lokal mereka sendiri. Setiap operasi CUD (Create / Update / Delete) memutakhirkan `state.transactions`, menyimpan ke Local Storage, lalu memanggil `renderAll()`.

`sortOrder` tidak disimpan ke Local Storage — direset ke `'default'` setiap kali halaman dimuat ulang.
`spendingLimit` disimpan ke Local Storage dengan key terpisah `'expense_visualizer_limit'`.

### 2. Storage Module

```javascript
const Storage = {
  KEY:       'expense_visualizer_transactions',
  LIMIT_KEY: 'expense_visualizer_limit',

  // Membaca transaksi dari Local Storage.
  // Return: Transaction[] | null (null jika tidak ada data)
  // Throws: StorageUnavailableError jika Local Storage tidak tersedia
  load(): Transaction[] | null,

  // Menulis seluruh array transaksi ke Local Storage.
  // Throws: StorageQuotaError jika kuota penuh
  save(transactions: Transaction[]): void,

  // Menulis array kosong ke Local Storage (untuk menimpa data corrupt)
  clear(): void,

  // Memeriksa apakah Local Storage tersedia di browser
  isAvailable(): boolean,

  // Membaca spendingLimit dari Local Storage.
  // Return: number (0 jika tidak ada atau tidak valid)
  loadLimit(): number,

  // Menulis spendingLimit ke Local Storage.
  saveLimit(limit: number): void
};
```

**Error handling:**
- `isAvailable()` dipanggil saat init; jika `false` → tampilkan banner peringatan permanen (Req 6.5)
- `save()` yang melempar quota error → tampilkan toast error (Req 6.6)
- `save()` yang gagal saat add transaction → tampilkan error, pertahankan form data (Req 1.6)
- `loadLimit()`: jika nilai tersimpan bukan angka positif atau NaN → kembalikan 0 (silent fallback)

---

### 3. Validator Module

```javascript
const Validator = {
  // Memvalidasi input form.
  // Return: { valid: true } | { valid: false, errors: { name?, amount?, category? } }
  validateTransaction(name: string, amount: string, category: string): ValidationResult
};
```

Aturan validasi:
- `name`: wajib diisi, tidak boleh hanya whitespace, maksimal 100 karakter
- `amount`: wajib diisi, nilai numerik > 0, maksimal 999_999_999.99
- `category`: wajib salah satu dari `['Food', 'Transport', 'Fun']`

---

### 4. Controller Functions

```javascript
// Dipanggil saat form submit
function addTransaction(name: string, amount: string, category: string): void

// Dipanggil saat tombol hapus diklik
function deleteTransaction(id: string): void

// Dipanggil saat sort select berubah (Req 8)
function setSortOrder(order: 'default' | 'amount-desc' | 'amount-asc' | 'category-asc'): void

// Dipanggil saat tombol "Set" spending limit diklik (Req 9)
function setSpendingLimit(limit: number): void

// Dipanggil saat tombol toggle monthly summary diklik (Req 10)
function toggleMonthlySummary(): void
```

`addTransaction`:
1. Jalankan `Validator.validateTransaction()` → jika invalid, tampilkan error per-field, return
2. Buat objek `Transaction` baru dengan `id = crypto.randomUUID()`
3. Push ke `state.transactions`
4. Panggil `Storage.save()` → jika gagal, pop dari array, tampilkan error, kembalikan nilai form
5. Panggil `renderAll()`
6. Reset form fields

`deleteTransaction`:
1. Temukan transaksi di `state.transactions` berdasarkan `id`
2. Simpan referensi sementara (untuk rollback jika gagal)
3. Filter out dari `state.transactions`
4. Panggil `Storage.save()` → jika gagal, restore dari referensi sementara, tampilkan error
5. Panggil `renderAll()`

---

### 5. Renderer Module

```javascript
const Renderer = {
  // Memanggil semua renderer yang relevan dalam satu siklus render
  renderAll(): void,

  // Memperbarui tampilan Total Balance
  renderBalance(): void,

  // Memperbarui daftar transaksi (dengan sort + highlight)
  renderList(): void,

  // Memperbarui pie chart via Chart.js
  renderChart(): void,

  // Memperbarui monthly summary (hanya jika summary sedang ditampilkan)
  renderMonthlySummary(): void
};
```

`renderAll()` selalu memanggil `renderBalance()`, `renderList()`, dan `renderChart()` secara sinkron. `renderMonthlySummary()` dipanggil dari `renderAll()` hanya jika `#monthly-summary` sedang dalam kondisi visible, memastikan semua komponen mencerminkan data yang sama dalam satu frame (Req 6.2).

---

### 6. Input Form Component

**DOM:**
```html
<section id="input-form">
  <input type="text" id="item-name" maxlength="100" />
  <input type="number" id="item-amount" min="0.01" max="999999999.99" step="0.01" />
  <select id="item-category">
    <option value="">-- Pilih Kategori --</option>
    <option value="Food">Food</option>
    <option value="Transport">Transport</option>
    <option value="Fun">Fun</option>
  </select>
  <button type="submit" id="btn-submit">Tambah</button>
  <div id="form-errors" aria-live="polite"></div>
</section>
```

**Behavior:**
- Submit via tombol klik atau `Enter` key pada form
- Validasi real-time pada `amount` field: jika ≤ 0, tampilkan inline error dan disable tombol submit (Req 1.5)
- Setelah transaksi berhasil ditambahkan, semua field dikosongkan (Req 1.4)
- Error per-field ditampilkan di `#form-errors` menggunakan `aria-live` untuk aksesibilitas

---

### 7. Transaction List Component

**DOM:**
```html
<section id="transaction-list-container">
  <h2>Daftar Transaksi</h2>
  <ul id="transaction-list" role="list">
    <!-- Diisi oleh renderList() -->
    <!-- Jika kosong: -->
    <li id="empty-message">Belum ada transaksi yang dicatat.</li>
  </ul>
</section>
```

**Item template (dihasilkan secara programatik):**
```html
<li class="transaction-item" data-id="{id}">
  <span class="item-name">{name}</span>
  <span class="item-category badge badge--{category}">{category}</span>
  <span class="item-amount">Rp {amount}</span>
  <button class="btn-delete" aria-label="Hapus {name}">✕</button>
</li>
```

**Behavior:**
- `renderList()` mengosongkan `#transaction-list` dan merender ulang semua item dari `state.transactions`
- Sebelum render, `renderList()` membuat **salinan** `state.transactions` dan mengurutkannya sesuai `state.sortOrder` — array asli `state.transactions` tidak pernah diubah (Req 8)
- Setiap item yang memiliki `amount > state.spendingLimit && state.spendingLimit > 0` diberi class `transaction-item--over-limit` dan ikon ⚠ (Req 9)
- Overflow ditangani dengan `overflow-y: auto` pada container (Req 2.2)
- Tombol hapus menggunakan event delegation di container list untuk efisiensi
- Pesan kosong ditampilkan ketika `state.transactions.length === 0` (Req 2.5)

---

### 10. Sort Transactions Component (Req 8)

**DOM:**
```html
<div id="sort-bar">
  <label for="sort-select">Urutkan:</label>
  <select id="sort-select">
    <option value="default">Default (urutan masuk)</option>
    <option value="amount-desc">Jumlah: Terbesar dulu</option>
    <option value="amount-asc">Jumlah: Terkecil dulu</option>
    <option value="category-asc">Kategori: A–Z</option>
  </select>
</div>
```

Ditempatkan tepat di atas `#transaction-list-container`.

**Behavior:**
- Perubahan pada `#sort-select` memanggil `setSortOrder(value)`, yang memperbarui `state.sortOrder` lalu memanggil `renderAll()`
- `renderList()` mengurutkan **salinan** array, bukan array asli; `state.transactions` tetap dalam urutan penambahan
- Sort tidak disimpan ke Local Storage; reset ke `'default'` saat halaman dimuat ulang

**Sort logic:**
```javascript
function getSortedTransactions() {
  const copy = [...state.transactions];
  switch (state.sortOrder) {
    case 'amount-desc':   return copy.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':    return copy.sort((a, b) => a.amount - b.amount);
    case 'category-asc':  return copy.sort((a, b) => a.category.localeCompare(b.category));
    default:              return copy;  // 'default': urutan asli
  }
}
```

---

### 11. Spending Limit Highlight Component (Req 9)

**DOM:**
```html
<div id="spending-limit-bar">
  <label for="spending-limit">Batas per transaksi (Rp):</label>
  <input type="number" id="spending-limit" min="0" step="0.01"
         placeholder="0 = nonaktif" />
  <button id="btn-set-limit">Set</button>
  <span id="limit-active-indicator"></span>
</div>
```

Ditempatkan di bawah `#balance-header`, di atas `#input-form`.

**Behavior:**
- Klik `#btn-set-limit` memanggil `setSpendingLimit(value)`:
  1. Parse nilai menjadi float; jika NaN atau < 0, abaikan dan tampilkan inline error
  2. Perbarui `state.spendingLimit`
  3. Panggil `Storage.saveLimit(limit)`
  4. Panggil `renderAll()` (highlight diperbarui)
- `#limit-active-indicator` menampilkan teks "Aktif: Rp X" jika `state.spendingLimit > 0`, kosong jika 0
- Saat init, baca `Storage.loadLimit()` ke `state.spendingLimit`

**CSS untuk highlight:**
```css
.transaction-item--over-limit {
  background-color: #fff3cd;   /* kuning muda / oranye muda */
  border-left: 4px solid #e67e22;
}
.transaction-item--over-limit .item-amount::before {
  content: '⚠ ';
  color: #e67e22;
}
```

---

### 12. Monthly Summary Component (Req 10)

**DOM:**
```html
<section id="monthly-summary" hidden>
  <h2>Ringkasan Bulanan</h2>
  <div id="monthly-summary-content">
    <!-- Diisi oleh renderMonthlySummary() -->
  </div>
</section>
<button id="btn-toggle-summary">Tampilkan Ringkasan Bulanan</button>
```

Ditempatkan di bawah `#transaction-list-container`, di atas `#chart-container`.

**Behavior:**
- `#btn-toggle-summary` memanggil `toggleMonthlySummary()`:
  1. Toggle atribut `hidden` pada `#monthly-summary`
  2. Perbarui teks tombol: "Tampilkan Ringkasan Bulanan" ↔ "Sembunyikan Ringkasan Bulanan"
  3. Jika summary menjadi visible, panggil `renderMonthlySummary()`
- `renderMonthlySummary()` dipanggil dari `renderAll()` hanya jika `#monthly-summary` tidak `hidden`

**Grouping logic:**
```javascript
function groupByMonth(transactions) {
  const groups = {};
  for (const tx of transactions) {
    const key = tx.date.slice(0, 7);  // 'YYYY-MM'
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }
  // Urutkan terbaru di atas
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a));
}
```

**Template per grup bulan:**
```html
<div class="month-group">
  <h3 class="month-label">Oktober 2026</h3>
  <p class="month-total">Total: Rp 125.000,00</p>
  <ul class="month-category-breakdown">
    <li>Food: Rp 75.000,00</li>
    <li>Transport: Rp 50.000,00</li>
  </ul>
</div>
```

Label bulan diformat menggunakan:
```javascript
new Intl.DateTimeFormat('id-ID', { year: 'numeric', month: 'long' }).format(new Date(key + '-01'))
```

---

### 8. Total Balance Component

**DOM:**
```html
<header id="balance-header">
  <p>Total Pengeluaran</p>
  <h1 id="total-balance">Rp 0,00</h1>
</header>
```

**Behavior:**
- `renderBalance()` menghitung `sum` dari semua `transaction.amount`
- Format: `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' })`
- Jika `sum > 999_999_999.99`, tampilkan indikasi overflow tanpa mengubah data (Req 3.5)
- Selalu terlihat di viewport (Req 3.1) menggunakan `position: sticky; top: 0`

---

### 9. Pie Chart Component

**DOM:**
```html
<section id="chart-container">
  <h2>Distribusi Pengeluaran</h2>
  <canvas id="expense-chart" width="300" height="300"></canvas>
  <div id="chart-legend"></div>
  <p id="chart-empty-message" hidden>Belum ada data pengeluaran.</p>
</section>
```

**Behavior:**
- Chart.js instance dibuat sekali saat init, diperbarui dengan `chart.data = ...` + `chart.update()` pada setiap `renderChart()` call
- Segmen hanya ditampilkan untuk kategori dengan `total > 0` (Req 4.6)
- Label persentase dalam format `33.3%` langsung pada segmen (Req 4.1)
- Jika semua total = 0, sembunyikan canvas, tampilkan `#chart-empty-message` (Req 4.4)
- Legenda custom dirender di `#chart-legend` — hanya kategori aktif (Req 4.5)

**Warna kategori (tetap/konstan):**
```javascript
const CATEGORY_COLORS = {
  Food:      '#FF6384',
  Transport: '#36A2EB',
  Fun:       '#FFCE56'
};
```

---

## Data Models

### Transaction

```javascript
/**
 * Merepresentasikan satu catatan pengeluaran.
 * @typedef {Object} Transaction
 */
{
  id:       string,    // UUID v4, dihasilkan oleh crypto.randomUUID()
  name:     string,    // Nama item, 1–100 karakter, non-whitespace
  amount:   number,    // Nilai positif > 0, maksimal 999_999_999.99, presisi 2 desimal
  category: 'Food' | 'Transport' | 'Fun',
  date:     string     // ISO 8601 string, dari new Date().toISOString() saat transaksi dibuat
                       // Contoh: "2026-10-15T08:30:00.000Z"
}
```

**Contoh:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Makan siang",
  "amount": 45000,
  "category": "Food",
  "date": "2026-10-15T08:30:00.000Z"
}
```

### Local Storage Schema

```
Key:   "expense_visualizer_transactions"
Value: JSON string dari Transaction[]

Key:   "expense_visualizer_limit"
Value: JSON string dari number (spendingLimit; 0 jika tidak aktif)
```

**Contoh nilai tersimpan (`expense_visualizer_transactions`):**
```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Makan siang",
    "amount": 45000,
    "category": "Food",
    "date": "2026-10-15T08:30:00.000Z"
  },
  {
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "name": "Taksi",
    "amount": 30000,
    "category": "Transport",
    "date": "2026-10-15T12:00:00.000Z"
  }
]
```

**Contoh nilai tersimpan (`expense_visualizer_limit`):**
```json
50000
```

**Aturan validasi saat load (transactions):**
- Nilai harus berupa string JSON yang dapat di-parse
- Hasil parse harus berupa `Array`
- Setiap elemen harus memiliki `id` (string), `name` (string non-empty), `amount` (number > 0), `category` (salah satu dari enum), `date` (string ISO 8601 valid — elemen lama tanpa `date` dapat di-migrate dengan `date = new Date(0).toISOString()` sebagai fallback)
- Jika validasi gagal untuk elemen apapun → seluruh data dianggap corrupt, State direset ke `[]`, Local Storage ditulis ulang dengan `[]` (Req 5.5)

**Aturan validasi saat load (spendingLimit):**
- Nilai harus dapat di-parse menjadi angka finite ≥ 0
- Jika tidak valid (NaN, negatif, atau bukan angka) → gunakan 0 sebagai fallback (silent)

### ValidationResult

```javascript
{
  valid: true
}
// atau
{
  valid: false,
  errors: {
    name?:     string,  // pesan error untuk field name
    amount?:   string,  // pesan error untuk field amount
    category?: string   // pesan error untuk field category
  }
}
```

### CategoryTotals (computed, tidak disimpan)

```javascript
{
  Food:      number,  // total pengeluaran kategori Food
  Transport: number,  // total pengeluaran kategori Transport
  Fun:       number   // total pengeluaran kategori Fun
}
```

Dihitung ulang setiap kali `renderChart()` dipanggil dari `state.transactions`.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Penambahan transaksi valid memperbesar daftar

*For any* daftar transaksi yang ada dan input transaksi yang valid (nama non-whitespace, jumlah > 0, kategori valid), menambahkan transaksi tersebut harus menghasilkan panjang daftar bertambah tepat satu.

**Validates: Requirements 1.3**

---

### Property 2: Input whitespace ditolak

*For any* string yang terdiri seluruhnya dari karakter whitespace sebagai nilai nama, upaya penambahan transaksi harus ditolak dan panjang daftar transaksi tidak berubah.

**Validates: Requirements 1.2, 1.5**

---

### Property 3: Penghapusan transaksi mengurangi daftar

*For any* daftar transaksi yang tidak kosong, menghapus transaksi yang ada berdasarkan id-nya harus menghasilkan daftar yang tidak lagi mengandung transaksi tersebut, dengan panjang daftar berkurang tepat satu.

**Validates: Requirements 2.3**

---

### Property 4: Total balance adalah jumlah seluruh transaksi

*For any* daftar transaksi, nilai Total_Balance yang ditampilkan harus selalu sama dengan jumlah (sum) dari seluruh nilai `amount` pada setiap transaksi di daftar.

**Validates: Requirements 3.2, 3.3, 3.4**

---

### Property 5: Persistensi data round-trip

*For any* daftar transaksi yang valid, menyimpan daftar tersebut ke Local Storage lalu membacanya kembali harus menghasilkan daftar yang ekuivalen dengan daftar semula (sama persis dalam id, name, amount, category, dan urutan).

**Validates: Requirements 5.1, 5.2, 5.3**

---

### Property 6: Proporsi pie chart menjumlah ke 100%

*For any* daftar transaksi yang tidak kosong, jumlah persentase semua segmen pada Chart (hanya kategori dengan total > 0) harus sama dengan 100% dengan toleransi presisi floating point (± 0.1%).

**Validates: Requirements 4.1, 4.3, 4.6**

---

### Property 7: Kategori nol tidak muncul di chart dan legenda

*For any* daftar transaksi, setiap kategori yang memiliki total pengeluaran sebesar 0 tidak boleh menghasilkan segmen pada pie chart maupun entri pada legenda.

**Validates: Requirements 4.5, 4.6**

---

## Error Handling

### Strategi Umum

Semua error yang mungkin terjadi dikategorikan dan ditangani sebagai berikut:

| Kondisi Error | Sumber | Penanganan | UI Feedback |
|---|---|---|---|
| Local Storage tidak tersedia | Init | Tampilkan banner permanen | Warning banner di atas halaman |
| Local Storage penuh (quota) | `Storage.save()` | Batalkan operasi, jangan ubah state | Toast notification |
| Data corrupt saat load | `Storage.load()` | Reset state ke `[]`, timpa LS | Silent (tidak tampilkan error ke user) |
| Gagal simpan saat add | `Storage.save()` | Rollback state, pertahankan form | Inline error di form |
| Gagal simpan saat delete | `Storage.save()` | Rollback state, pertahankan item | Toast notification |
| Input tidak valid | `Validator` | Abort operasi | Inline error per field |
| Total balance overflow | `renderBalance()` | Tampilkan indikasi overflow | Text indikasi di area balance |
| Chart.js gagal load (CDN) | Script load error | Canvas tidak tersedia | Tampilkan pesan fallback |

### Toast Notification

Untuk error yang tidak berkaitan dengan form (seperti quota error), digunakan toast notification yang muncul di pojok bawah kanan, auto-dismiss setelah 5 detik, dan dapat ditutup manual.

```javascript
function showToast(message: string, type: 'error' | 'warning'): void
```

### Inline Form Error

Error validasi ditampilkan langsung di bawah field yang bermasalah menggunakan `aria-live="polite"` untuk aksesibilitas.

---

## Testing Strategy

### Pendekatan Dual Testing

Strategi pengujian menggunakan dua pendekatan komplementer:
- **Unit tests**: memverifikasi perilaku spesifik, edge case, dan kondisi error
- **Property-based tests**: memverifikasi properti universal yang berlaku untuk semua input valid

### Unit Tests

Unit tests difokuskan pada:
- Validasi form: setiap aturan validasi diuji dengan contoh konkret
- Kalkulasi balance: contoh spesifik dengan nilai mata uang
- Formatting currency: pastikan format `Intl.NumberFormat` menghasilkan output yang benar
- Chart data computation: contoh konkret dengan transaksi dari 1, 2, dan 3 kategori
- Local Storage error scenarios: mock `localStorage.setItem` untuk throw quota error
- Edge cases: daftar kosong, satu transaksi, nilai maksimal

**Framework:** Vitest (atau Jest) untuk test runner; jsdom untuk DOM simulation.

### Property-Based Tests

Property-based testing menggunakan library **fast-check** untuk menghasilkan input acak dan memverifikasi properti universal.

Konfigurasi: minimum **100 iterasi** per property test.

Setiap property test harus diberi tag komentar dengan format:
`// Feature: expense-budget-visualizer, Property {N}: {property_text}`

**Property tests yang perlu diimplementasikan:**

| Property | Deskripsi | fast-check Arbitraries |
|---|---|---|
| Property 1 | Penambahan transaksi valid memperbesar daftar | `fc.array(transactionArb)`, `fc.string()`, `fc.float()`, `fc.constantFrom('Food','Transport','Fun')` |
| Property 2 | Input whitespace ditolak | `fc.string().filter(isAllWhitespace)` |
| Property 3 | Penghapusan transaksi mengurangi daftar | `fc.array(transactionArb, {minLength: 1})`, pilih random index |
| Property 4 | Total balance = sum semua transaksi | `fc.array(transactionArb)` |
| Property 5 | Persistensi round-trip | `fc.array(transactionArb)` dengan mock localStorage |
| Property 6 | Proporsi chart = 100% | `fc.array(transactionArb, {minLength: 1})` |
| Property 7 | Kategori nol tidak muncul | `fc.array(transactionArb)` dengan beberapa kategori dikosongkan |

### Integration Tests

- Verifikasi bahwa Local Storage tersedia di lingkungan test
- Verifikasi bahwa semua komponen dirender dalam satu siklus setelah operasi
- Verifikasi bahwa halaman memuat dalam < 2 detik (Req 6.3) menggunakan Lighthouse atau custom performance test

### Responsive Layout Testing

- Manual testing di lebar layar 320px, 768px, dan 1280px
- Verifikasi tidak ada horizontal scrolling dan tidak ada elemen yang overlapping
