
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL 
});

pool.connect((err, client, release) => {
    if (err) {
        return console.error('🔴 Gagal koneksi awal ke NeonDB:', err.stack);
    }
    console.log('🟢 Koneksi ke NeonDB Berhasil!');
    release(); 
});

app.set('db_pool', pool);

const tasksRouter = require('./routes/tasks.js');
const categoriesRouter = require('./routes/categories.js');

app.use('/api/tasks', tasksRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/auth', require('./routes/auth'));

console.log('✅ Route Terpasang: /api/tasks');
console.log('✅ Route Terpasang: /api/categories');

module.exports = app;
