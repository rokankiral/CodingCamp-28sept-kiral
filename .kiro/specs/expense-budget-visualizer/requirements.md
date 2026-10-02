# Requirements Document

## Introduction

Expense & Budget Visualizer adalah aplikasi web berbasis browser yang memungkinkan pengguna mencatat, mengelola, dan memvisualisasikan pengeluaran pribadi berdasarkan kategori. Aplikasi ini berjalan sepenuhnya di sisi klien menggunakan HTML, CSS, dan Vanilla JavaScript — tanpa backend, tanpa setup kompleks. Data disimpan secara lokal menggunakan Local Storage API sehingga tetap tersedia saat halaman di-refresh. Antarmuka menampilkan form input transaksi, daftar transaksi yang dapat di-scroll dan dihapus, total saldo yang diperbarui otomatis, serta pie chart distribusi pengeluaran per kategori.

---

## Glossary

- **App**: Aplikasi web Expense & Budget Visualizer yang berjalan di browser.
- **Transaction**: Satu catatan pengeluaran yang terdiri dari nama item, jumlah uang, dan kategori.
- **Transaction_List**: Komponen daftar yang menampilkan semua transaksi yang telah ditambahkan.
- **Input_Form**: Komponen form yang digunakan pengguna untuk memasukkan data transaksi baru.
- **Category**: Klasifikasi transaksi; salah satu dari: Food, Transport, atau Fun.
- **Total_Balance**: Nilai agregat yang merepresentasikan total seluruh pengeluaran dari semua transaksi.
- **Chart**: Komponen pie chart yang memvisualisasikan distribusi pengeluaran per kategori.
- **Local_Storage**: Web Storage API bawaan browser yang digunakan untuk persistensi data tanpa backend.
- **Modern_Browser**: Browser yang mendukung ES6+, Local Storage API, dan Canvas API (Chrome, Firefox, Edge, Safari versi terbaru).

---

## Requirements

### Requirement 1: Input Transaksi

**User Story:** Sebagai pengguna, saya ingin mengisi form dengan nama item, jumlah uang, dan kategori pengeluaran, sehingga saya dapat mencatat transaksi baru dengan cepat.

#### Acceptance Criteria

1. THE Input_Form SHALL menyediakan field teks untuk nama item (maksimal 100 karakter), field angka untuk jumlah uang (rentang 0.01 hingga 999.999.999,99), dan dropdown untuk kategori dengan pilihan: Food, Transport, dan Fun.
2. WHEN pengguna mengklik tombol submit tanpa mengisi semua field, THE Input_Form SHALL menampilkan pesan validasi yang menyebutkan field mana yang belum diisi, dan tidak menambahkan transaksi apapun.
3. WHEN pengguna mengisi semua field dengan nilai yang valid dan mengklik tombol submit, THE App SHALL menambahkan transaksi baru ke Transaction_List dalam waktu kurang dari 1 detik.
4. WHEN transaksi berhasil ditambahkan, THE Input_Form SHALL mengosongkan semua field sehingga pengguna dapat memasukkan transaksi berikutnya.
5. WHEN pengguna memasukkan nilai angka kurang dari atau sama dengan nol pada field jumlah uang, THE Input_Form SHALL menampilkan pesan validasi bahwa jumlah harus lebih dari nol dan menonaktifkan tombol submit hingga nilai diperbaiki.
6. IF penyimpanan transaksi ke Local_Storage gagal, THEN THE App SHALL menampilkan pesan kesalahan yang menginformasikan kegagalan penyimpanan dan mempertahankan data input pengguna di form.

---

### Requirement 2: Daftar Transaksi

**User Story:** Sebagai pengguna, saya ingin melihat semua transaksi yang telah saya catat dalam satu daftar, sehingga saya dapat meninjau dan mengelola pengeluaran saya.

#### Acceptance Criteria

1. THE Transaction_List SHALL menampilkan semua transaksi yang tersimpan, masing-masing mencantumkan nama item (maksimal 100 karakter), jumlah uang (dalam format mata uang dengan 2 desimal), dan kategori.
2. WHILE jumlah transaksi melebihi kapasitas tampilan yang tersedia, THE Transaction_List SHALL dapat di-scroll secara vertikal tanpa mengubah posisi atau ukuran komponen lain di luar area Transaction_List.
3. WHEN pengguna mengklik tombol hapus pada sebuah transaksi, THE App SHALL menghapus transaksi tersebut dari Transaction_List dan memperbarui tampilan daftar dalam waktu 500 milidetik.
4. IF penghapusan transaksi gagal, THEN THE App SHALL menampilkan pesan kesalahan yang menginformasikan kegagalan penghapusan dan mempertahankan transaksi tersebut di Transaction_List.
5. WHEN Transaction_List kosong, THE App SHALL menampilkan pesan informatif yang menunjukkan bahwa belum ada transaksi yang dicatat, menggantikan seluruh area daftar.

---

### Requirement 3: Total Saldo

**User Story:** Sebagai pengguna, saya ingin melihat total keseluruhan pengeluaran saya di bagian atas halaman, sehingga saya dapat langsung mengetahui berapa total yang telah saya keluarkan.

#### Acceptance Criteria

1. THE App SHALL menampilkan Total_Balance di bagian atas halaman dalam area yang selalu terlihat pada viewport tanpa scroll, dengan format mata uang dua desimal (contoh: Rp 0,00).
2. WHEN sebuah transaksi ditambahkan ke Transaction_List, THE App SHALL memperbarui nilai Total_Balance dalam waktu kurang dari 1 detik dengan menjumlahkan nilai seluruh transaksi yang ada di Transaction_List.
3. WHEN sebuah transaksi dihapus dari Transaction_List, THE App SHALL memperbarui nilai Total_Balance dalam waktu kurang dari 1 detik untuk mencerminkan jumlah setelah penghapusan.
4. WHEN Transaction_List kosong, THE App SHALL menampilkan Total_Balance sebesar nol dengan format mata uang dua desimal (contoh: Rp 0,00).
5. IF nilai Total_Balance melebihi 999.999.999,99, THEN THE App SHALL menampilkan pesan indikasi bahwa nilai melebihi batas tampilan tanpa mengubah nilai transaksi yang tersimpan.

---

### Requirement 4: Visualisasi Pie Chart

**User Story:** Sebagai pengguna, saya ingin melihat pie chart distribusi pengeluaran per kategori, sehingga saya dapat memahami pola pengeluaran saya secara visual.

#### Acceptance Criteria

1. THE Chart SHALL menampilkan pie chart yang merepresentasikan proporsi pengeluaran untuk setiap kategori (Food, Transport, Fun) relatif terhadap total seluruh pengeluaran, di mana setiap segmen menampilkan persentase kontribusi kategori tersebut dengan presisi satu desimal (contoh: 33.3%).
2. WHEN sebuah transaksi ditambahkan atau dihapus, THE Chart SHALL diperbarui secara otomatis dalam waktu tidak lebih dari 1 detik untuk mencerminkan distribusi terkini tanpa memerlukan refresh halaman.
3. WHEN hanya satu kategori memiliki transaksi dengan jumlah lebih dari 0, THE Chart SHALL menampilkan segmen tunggal yang mengisi seluruh lingkaran (100%) untuk kategori tersebut.
4. WHEN Transaction_List kosong atau total seluruh pengeluaran bernilai 0, THE Chart SHALL menampilkan pesan teks yang menginformasikan bahwa belum ada data pengeluaran, dan tidak menampilkan segmen chart apapun.
5. THE Chart SHALL menampilkan legenda yang mengidentifikasi setiap kategori dengan nama kategori (Food, Transport, Fun) dan warna unik yang berbeda, di mana hanya kategori dengan nilai pengeluaran lebih dari 0 yang ditampilkan dalam legenda.
6. IF sebuah kategori memiliki total pengeluaran sebesar 0, THEN THE Chart SHALL tidak menampilkan segmen untuk kategori tersebut dan menghapusnya dari legenda.

---

### Requirement 5: Persistensi Data dengan Local Storage

**User Story:** Sebagai pengguna, saya ingin data pengeluaran saya tetap tersimpan saat halaman di-refresh, sehingga saya tidak kehilangan catatan yang telah dimasukkan.

#### Acceptance Criteria

1. WHEN pengguna menambahkan sebuah transaksi, THE App SHALL menimpa data di Local_Storage dengan seluruh daftar transaksi terbaru yang mencakup transaksi yang baru ditambahkan.
2. WHEN pengguna menghapus sebuah transaksi, THE App SHALL memperbarui data di Local_Storage dengan daftar transaksi terbaru yang tidak menyertakan transaksi yang dihapus.
3. WHEN halaman dimuat atau di-refresh, THE App SHALL membaca data dari Local_Storage dan menampilkan kembali transaksi yang tersimpan ke Transaction_List dalam urutan yang sama seperti saat disimpan.
4. IF Local_Storage tidak mengandung data transaksi saat halaman dimuat, THEN THE App SHALL memulai dengan Transaction_List kosong tanpa menampilkan pesan error kepada pengguna.
5. IF data di Local_Storage tidak valid atau rusak saat halaman dimuat, THEN THE App SHALL mengabaikan data tersebut, menampilkan Transaction_List kosong, dan menimpa data yang tidak valid dengan array kosong di Local_Storage.

---

### Requirement 6: Kompatibilitas Browser dan Performa

**User Story:** Sebagai pengguna, saya ingin aplikasi berjalan lancar di browser modern saya tanpa lag atau error, sehingga pengalaman penggunaan terasa responsif dan menyenangkan.

#### Acceptance Criteria

1. THE App SHALL berfungsi penuh pada Chrome 109+, Firefox 109+, Edge 109+, dan Safari 16+ tanpa memerlukan plugin, ekstensi, atau konfigurasi tambahan, di mana "berfungsi penuh" berarti semua komponen (Input_Form, Transaction_List, Total_Balance, Chart) dapat digunakan dan menampilkan data dengan benar.
2. WHEN pengguna menambahkan atau menghapus transaksi, THE App SHALL memperbarui Transaction_List, Total_Balance, dan Chart dalam satu siklus render sehingga ketiga komponen mencerminkan data yang sama pada frame yang sama.
3. WHEN halaman dimuat, THE App SHALL merender seluruh antarmuka dan menampilkan transaksi yang tersimpan di Local_Storage dalam waktu kurang dari 2 detik setelah event DOMContentLoaded terpicu.
4. THE App SHALL menggunakan hanya HTML, CSS, dan Vanilla JavaScript — tanpa framework JavaScript, tanpa server-side code, dan tanpa proses build.
5. IF Local_Storage tidak tersedia di browser pengguna, THEN THE App SHALL menampilkan pesan peringatan yang menginformasikan bahwa fitur penyimpanan data tidak tersedia dan transaksi tidak akan tersimpan setelah halaman ditutup.
6. IF operasi tulis ke Local_Storage gagal karena kuota penuh, THEN THE App SHALL menampilkan pesan peringatan yang menginformasikan bahwa penyimpanan penuh dan data baru tidak dapat disimpan.

---

### Requirement 7: Antarmuka yang Bersih dan Mudah Digunakan

**User Story:** Sebagai pengguna, saya ingin antarmuka yang sederhana dan rapi, sehingga saya dapat langsung menggunakan aplikasi tanpa perlu membaca petunjuk.

#### Acceptance Criteria

1. THE App SHALL menampilkan semua komponen utama (Input_Form, Total_Balance, Transaction_List, Chart) dalam satu halaman tanpa navigasi multi-halaman.
2. THE App SHALL menggunakan tipografi yang mudah dibaca dengan ukuran font minimal 14px untuk teks isi dan minimal 20px untuk nilai Total_Balance.
3. THE App SHALL menempatkan Total_Balance pada posisi paling atas halaman dengan ukuran font minimal 32px dan font-weight minimal 700, sehingga Total_Balance secara visual lebih besar dari seluruh elemen teks lainnya di halaman.
4. WHEN pengguna berinteraksi dengan tombol atau elemen interaktif, THE App SHALL memberikan perubahan tampilan visual yang terlihat (seperti perubahan warna latar, warna teks, atau efek hover) dalam waktu kurang dari 100ms.
5. IF halaman dimuat pertama kali, THEN THE App SHALL menampilkan seluruh komponen utama dalam kondisi siap digunakan tanpa memerlukan langkah konfigurasi atau navigasi tambahan oleh pengguna.
6. WHILE pengguna menggunakan aplikasi di perangkat dengan lebar layar antara 320px hingga 1280px, THE App SHALL menampilkan semua komponen utama dalam tata letak yang dapat dibaca tanpa horizontal scrolling dan tanpa elemen yang saling tumpang tindih.
