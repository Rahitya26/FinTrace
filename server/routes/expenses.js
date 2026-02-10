const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/expenses - List all expenses
router.get('/', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM company_expenses ORDER BY date DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/expenses - Log a new expense
router.post('/', async (req, res) => {
    const { category, amount, date, description } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO company_expenses (category, amount, date, description) VALUES ($1, $2, $3, $4) RETURNING *',
            [category, amount, date, description]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
