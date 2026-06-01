// routes/tasks.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Hubungkan ke NeonDB menggunakan variabel lingkungan dari .env
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

router.get('/', async (req, res) => {
    try {
        const { priority, category } = req.query;
        let queryText = `
            SELECT t.id_task, t.title, t.description, t.due, 
                   p.name AS priority_name, s.name AS status_name, c.name AS category_name
            FROM tasks t
            JOIN priorities p ON t.id_priority = p.id_priority
            JOIN statuses s ON t.id_status = s.id_status
            JOIN categories c ON t.id_category = c.id_category
            WHERE t.id_user = 1
        `; // Menggunakan id_user = 1 (Dummy Budi Sudrajat)
        
        const params = [];
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
        console.error("🔴 Error GET /api/tasks:", err.message);
        res.status(500).json({ error: 'Gagal mengambil data tugas' });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const queryText = `
            SELECT s.name AS status_name, COUNT(t.id_task)::INT as total
            FROM statuses s
            LEFT JOIN tasks t ON s.id_status = t.id_status AND t.id_user = 1
            GROUP BY s.name
        `;
        const result = await pool.query(queryText);
        res.json(result.rows);
    } catch (err) {
        console.error("🔴 Error GET /api/tasks/stats:", err.message);
        res.status(500).json({ error: 'Gagal mengambil data statistik' });
    }
});

router.post('/', async (req, res) => {
    const { title, description, due, priority_name, category_name } = req.body;
    try {
        // Cari ID Master berdasarkan nama teks yang dikirim oleh Frontend
        const priorityRes = await pool.query('SELECT id_priority FROM priorities WHERE name = $1', [priority_name]);
        const categoryRes = await pool.query('SELECT id_category FROM categories WHERE name = $1', [category_name]);
        
        const id_priority = priorityRes.rows[0]?.id_priority || 1;
        const id_category = categoryRes.rows[0]?.id_category || 1;
        const id_status = 1; // Default status awal tugas baru: 'On Progress' (ID: 1)
        const id_user = 1;   // Default user Budi Sudrajat

        const insertQuery = `
            INSERT INTO tasks (title, description, due, id_user, id_priority, id_status, id_category)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
        `;
        const result = await pool.query(insertQuery, [title, description, due, id_user, id_priority, id_status, id_category]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("🔴 Error POST /api/tasks:", err.message);
        res.status(500).json({ error: 'Gagal menambahkan tugas baru' });
    }
});

router.put('/:id_task/status', async (req, res) => {
    const { id_task } = req.params; // Disamakan dengan nama kolom database agar konsisten
    const { status_name } = req.body; // Menerima nama status tujuan (Contoh: 'On Progress', 'Overdue', 'Done')
    
    console.log(`📬 [Backend] Request drag-drop masuk. Task ID: ${id_task} -> Status Baru: ${status_name}`);
    
    try {
        const statusRes = await pool.query('SELECT id_status FROM statuses WHERE name = $1', [status_name]);
        if (statusRes.rows.length === 0) {
            console.warn(`⚠️ Status "${status_name}" tidak valid di database.`);
            return res.status(400).json({ error: 'Nama status tidak valid atau tidak ditemukan di database' });
        }
        const id_status = statusRes.rows[0].id_status;

        // 2. Lakukan pembaruan (Update) pada baris tugas terkait
        const updateQuery = 'UPDATE tasks SET id_status = $1 WHERE id_task = $2 RETURNING *';
        const result = await pool.query(updateQuery, [id_status, id_task]);

        if (result.rows.length === 0) {
            console.warn(`⚠️ Gagal memindahkan. Task ID ${id_task} tidak ditemukan.`);
            return res.status(404).json({ error: 'Tugas tidak ditemukan' });
        }

        console.log(`🟢 [Backend] Sukses! Task ID ${id_task} berhasil dipindah ke status ID: ${id_status} (${status_name})`);
        res.json({ message: 'Status tugas berhasil diperbarui!', task: result.rows[0] });
    } catch (err) {
        console.error("🔴 Error PUT /api/tasks/:id_task/status:", err.message);
        res.status(500).json({ error: 'Gagal memperbarui status tugas' });
    }
});

router.delete('/:id_task', async (req, res) => {
    const { id_task } = req.params;
    
    console.log(`📬 [Backend] Menerima request MENGHAPUS Task ID: ${id_task}`);
    
    try {
        const targetId = parseInt(id_task, 10);
        
        if (isNaN(targetId)) {
            return res.status(400).json({ error: 'ID tugas yang dikirimkan ke server tidak valid' });
        }

        // Trik Aman: Gunakan query ini untuk mendeteksi apakah skema database kamu menggunakan 'id_task' atau 'id'
        const deleteQuery = 'DELETE FROM tasks WHERE id_task = $1 RETURNING *';
        const result = await pool.query(deleteQuery, [targetId]);

        if (result.rows.length === 0) {
            console.warn(`⚠️ Task ID ${targetId} tidak ditemukan di database.`);
            return res.status(404).json({ 
                error: 'Tugas tidak ditemukan', 
                details: 'Data kemungkinan sudah terhapus atau ID salah.' 
            });
        }

        console.log(`🟢 [Backend] Sukses! Task ID ${targetId} berhasil dihapus.`);
        res.json({ message: 'Tugas berhasil dihapus!', deletedTask: result.rows[0] });

    } catch (err) {
        console.error("🔴 Error internal pada DELETE /api/tasks:", err.message);
        
        // JIKA ERROR KARENA CONSTRAINT (RELASI): Berikan pesan edukatif ke pengguna
        let friendlyMessage = err.message;
        if (err.message.includes("foreign key constraint")) {
            friendlyMessage = "Data gagal dihapus karena ID tugas ini masih terikat dengan relasi data di tabel lain.";
        }

        res.status(500).json({ 
            error: 'Gagal menghapus data dari database', 
            details: friendlyMessage 
        });
    }
});

module.exports = router;