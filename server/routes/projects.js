const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/projects - List all projects with client details
router.get('/', async (req, res) => {
    try {
        const query = `
      SELECT p.*, c.name as client_name 
      FROM projects p 
      JOIN clients c ON p.client_id = c.id 
      ORDER BY p.created_at DESC
    `;
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/projects - Create a new project
router.post('/', async (req, res) => {
    const { clientId, name, type, revenue, costs, startDate, deadline } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO projects (client_id, name, type, revenue_earned, employee_costs, start_date, deadline) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [clientId, name, type, revenue, costs, startDate || new Date(), deadline]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
