
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

router.post('/login', async (req, res) => {
    const pool = req.app.get('db_pool'); 
    const { email, password } = req.body;

    try {
        console.log(`📬 [Auth] Mencoba login untuk email: ${email}`);

        const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) {
            return res.status(401).json({ error: 'Email atau password salah!' });
        }

        const user = userRes.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Email atau password salah!' });
        }

        // ✅ Pakai process.env.JWT_SECRET langsung, tanpa fallback hardcoded
        const token = jwt.sign(
            { id_user: user.id_user, email: user.email, fullname: user.fullname },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );

        console.log(`🟢 [Auth] ${user.fullname} berhasil login.`);
        res.json({
            message: 'Login berhasil!',
            token,
            user: { id_user: user.id_user, fullname: user.fullname, email: user.email }
        });

    } catch (err) {
        console.error('🔴 Error POST /api/auth/login:', err.message);
        res.status(500).json({ error: 'Terjadi kesalahan pada server saat login' });
    }
});

router.post('/register', async (req, res) => {
    const pool = req.app.get('db_pool'); 
    const { username, email, password, fullname } = req.body;

    try {
        const checkEmail = await pool.query('SELECT id_user FROM users WHERE email = $1', [email]);
        if (checkEmail.rows.length > 0) {
            return res.status(400).json({ error: 'Email sudah terdaftar!' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const result = await pool.query(`
            INSERT INTO users (username, email, password, fullname)
            VALUES ($1, $2, $3, $4) RETURNING id_user, username, email, fullname
        `, [username, email, hashedPassword, fullname]);

        console.log(`🟢 [Auth] User baru berhasil didaftarkan: ${fullname}`);
        res.status(201).json({ message: 'Registrasi berhasil!', user: result.rows[0] });

    } catch (err) {
        console.error('🔴 Error POST /api/auth/register:', err.message);
        res.status(500).json({ error: 'Gagal melakukan registrasi user baru' });
    }
});

module.exports = router;
