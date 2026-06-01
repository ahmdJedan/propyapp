// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// =========================================================================
// 1. GLOBAL MIDDLEWARE
// =========================================================================
app.use(cors());
app.use(express.json());

// =========================================================================
// 2. STATIC FILE SERVING (Menyajikan Frontend)
// =========================================================================
app.use(express.static(path.join(__dirname, 'public')));

// =========================================================================
// 3. DATABASE CONNECTION CONFIGURATION (NeonDB Pool Tunggal)
// =========================================================================
const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL 
});

// Tes koneksi awal saat server dihidupkan
pool.connect((err, client, release) => {
    if (err) {
        return console.error('🔴 Gagal koneksi awal ke NeonDB:', err.stack);
    }
    console.log('🟢 Koneksi ke NeonDB Berhasil!');
    release(); // Lepas kembali client ke pool setelah sukses mengetok pintu DB
});

// Menempelkan pool ke objek 'app' Express agar bisa diakses dari file rute lain
app.set('db_pool', pool);

// =========================================================================
// 4. ROUTING MANAGEMENT (Pendaftaran Rute Manual demi Keamanan & Stabilitas)
// =========================================================================
const tasksRouter = require('./routes/tasks.js');
const categoriesRouter = require('./routes/categories.js');

app.use('/api/tasks', tasksRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/auth', require('./routes/auth'));

console.log('✅ Route Terpasang: /api/tasks');
console.log('✅ Route Terpasang: /api/categories');

// =========================================================================
// 5. JALANKAN SERVER
// =========================================================================
module.exports = app;
