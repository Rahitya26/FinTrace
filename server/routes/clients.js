const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/clients - List all clients
router.get('/', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM clients ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/clients - Create a new client
router.post('/', async (req, res) => {
    const { name, industry } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO clients (name, industry) VALUES ($1, $2) RETURNING *',
            [name, industry]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
