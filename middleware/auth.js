// middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // ambil setelah "Bearer "

    if (!token) {
        return res.status(401).json({ error: 'Token tidak ditemukan' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error('JWT Error:', err.message);
            return res.status(403).json({ error: 'Token tidak valid!' });
        }
        req.user = decoded;
        next();
    });
};