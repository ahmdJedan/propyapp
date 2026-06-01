// routes/tasks.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// ✅ Tidak buat Pool baru di sini — pakai pool dari index.js via req.app.get('db_pool')

// =========================================================================
// MIDDLEWARE: Verifikasi Token JWT
// =========================================================================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"

    // Debug — hapus setelah masalah selesai
    console.log('🔑 JWT_SECRET saat verify:', process.env.JWT_SECRET ? '✅ Ada' : '❌ UNDEFINED');
    console.log('🎫 Token diterima:', token ? token.substring(0, 20) + '...' : 'TIDAK ADA');

    if (!token) {
        return res.status(401).json({ error: 'Akses ditolak! Token tidak ditemukan.' });
    }

    // ✅ Pakai process.env.JWT_SECRET langsung (tanpa fallback hardcoded)
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error('❌ JWT verify error:', err.message);
            return res.status(403).json({ error: 'Token tidak valid!' });
        }
        req.user = decoded;
        console.log('✅ Token valid, user:', decoded.fullname, '| id_user:', decoded.id_user);
        next();
    });
};

// =========================================================================
// GET /api/tasks — Hanya tampilkan milik user yang login
// =========================================================================
router.get('/', authenticateToken, async (req, res) => {
    const pool = req.app.get('db_pool'); // ✅ pakai pool dari index.js
    try {
        const { priority, category } = req.query;
        let queryText = `
            SELECT t.id_task, t.title, t.description, t.due, 
                   p.name AS priority_name, s.name AS status_name, c.name AS category_name
            FROM tasks t
            JOIN priorities p ON t.id_priority = p.id_priority
            JOIN statuses s ON t.id_status = s.id_status
            JOIN categories c ON t.id_category = c.id_category
            WHERE t.id_user = $1
        `;

        const params = [req.user.id_user];

        if (priority && priority !== 'all') {
            params.push(priority);
            queryText += ` AND p.name = $${params.length}`;
        }
        if (category && category !== 'all') {
            params.push(category);
            queryText += ` AND c.name = $${params.length}`;
        }

        queryText += ' ORDER BY t.due ASC';

        const result = await pool.query(queryText, params);
        res.json(result.rows);
    } catch (err) {
        console.error('🔴 Error GET /api/tasks:', err.message);
        res.status(500).json({ error: 'Gagal mengambil data tugas' });
    }
});

// =========================================================================
// GET /api/tasks/stats — Hanya hitung milik user yang login
// =========================================================================
router.get('/stats', authenticateToken, async (req, res) => {
    const pool = req.app.get('db_pool'); // ✅ pakai pool dari index.js
    try {
        const queryText = `
            SELECT s.name AS status_name, COUNT(t.id_task)::INT as total
            FROM statuses s
            LEFT JOIN tasks t ON s.id_status = t.id_status AND t.id_user = $1
            GROUP BY s.name
        `;
        const result = await pool.query(queryText, [req.user.id_user]);
        res.json(result.rows);
    } catch (err) {
        console.error('🔴 Error GET /api/tasks/stats:', err.message);
        res.status(500).json({ error: 'Gagal mengambil data statistik' });
    }
});

// =========================================================================
// POST /api/tasks — Tambah task baru milik user yang login
// =========================================================================
router.post('/', authenticateToken, async (req, res) => {
    const pool = req.app.get('db_pool'); // ✅ pakai pool dari index.js
    const { title, description, due, priority_name, category_name } = req.body;

    try {
        const priorityRes = await pool.query('SELECT id_priority FROM priorities WHERE name = $1', [priority_name]);
        const categoryRes = await pool.query('SELECT id_category FROM categories WHERE name = $1', [category_name]);

        if (!priorityRes.rows[0]) return res.status(400).json({ error: `Prioritas '${priority_name}' tidak ditemukan` });
        if (!categoryRes.rows[0]) return res.status(400).json({ error: `Kategori '${category_name}' tidak ditemukan` });

        const id_priority = priorityRes.rows[0].id_priority;
        const id_category = categoryRes.rows[0].id_category;
        const id_status = 1; // Default: On Progress

        const insertQuery = `
            INSERT INTO tasks (title, description, due, id_user, id_priority, id_status, id_category)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
        `;
        const result = await pool.query(insertQuery, [
            title, description, due,
            req.user.id_user,
            id_priority, id_status, id_category
        ]);

        console.log(`🟢 Task baru ditambahkan oleh user ${req.user.id_user}:`, title);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('🔴 Error POST /api/tasks:', err.message);
        res.status(500).json({ error: 'Gagal menambahkan tugas', details: err.message });
    }
});

// =========================================================================
// PUT /api/tasks/:id_task/status — Update status (hanya milik sendiri)
// =========================================================================
router.put('/:id_task/status', authenticateToken, async (req, res) => {
    const pool = req.app.get('db_pool'); // ✅ pakai pool dari index.js
    const { id_task } = req.params;
    const { status_name } = req.body;

    try {
        const statusRes = await pool.query('SELECT id_status FROM statuses WHERE name = $1', [status_name]);
        if (!statusRes.rows[0]) return res.status(400).json({ error: `Status '${status_name}' tidak valid` });

        const id_status = statusRes.rows[0].id_status;
        const result = await pool.query(
            'UPDATE tasks SET id_status = $1 WHERE id_task = $2 AND id_user = $3 RETURNING *',
            [id_status, id_task, req.user.id_user]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Tugas tidak ditemukan' });
        res.json({ message: 'Status diperbarui!' });
    } catch (err) {
        console.error('🔴 Error PUT /api/tasks/status:', err.message);
        res.status(500).json({ error: 'Gagal update status' });
    }
});

// =========================================================================
// DELETE /api/tasks/:id_task — Hapus task (hanya milik sendiri)
// =========================================================================
router.delete('/:id_task', authenticateToken, async (req, res) => {
    const pool = req.app.get('db_pool'); // ✅ pakai pool dari index.js
    const { id_task } = req.params;

    try {
        const result = await pool.query(
            'DELETE FROM tasks WHERE id_task = $1 AND id_user = $2 RETURNING *',
            [id_task, req.user.id_user]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Tugas tidak ditemukan' });
        console.log(`🗑️ Task ${id_task} dihapus oleh user ${req.user.id_user}`);
        res.json({ message: 'Tugas dihapus!' });
    } catch (err) {
        console.error('🔴 Error DELETE /api/tasks:', err.message);
        res.status(500).json({ error: 'Gagal menghapus tugas', details: err.message });
    }
});

module.exports = router;