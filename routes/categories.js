
const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
    const pool = req.app.get('db_pool'); // Mengambil pool dari index.js
    try {
        console.log('📬 Request kategori diterima oleh Backend...');
    
        const result = await pool.query('SELECT name FROM categories ORDER BY name ASC');
        
        console.log(`🟢 Berhasil mengambil ${result.rows.length} kategori dari database`);
        res.json(result.rows);
    } catch (err) {
        console.error('🔴 Error pada rute GET /api/categories:', err.message);
        res.status(500).json({ error: 'Gagal mengambil data kategori', details: err.message });
    }
});

module.exports = router;
