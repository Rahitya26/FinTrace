const jwt = require('jsonwebtoken');
const db = require('../db'); // Add database connection

const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Strictly verify that the user and organization still exist in the CURRENT database
        const userRes = await db.query('SELECT id FROM users WHERE id = $1 AND organization_id = $2', [decoded.userId, decoded.organizationId]);
        
        if (userRes.rows.length === 0) {
            return res.status(401).json({ error: 'Session invalid: User or Organization no longer exists in this database.' });
        }

        req.user = {
            userId: decoded.userId,
            organizationId: decoded.organizationId
        };
        next();
    } catch (err) {
        console.error('JWT Verification Error:', err.message);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

module.exports = authMiddleware;
