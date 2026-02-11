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
    const { clientId, name, type, revenue, costs, startDate, deadline, status } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO projects (client_id, name, type, revenue_earned, employee_costs, start_date, deadline, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [clientId, name, type, revenue, costs, startDate || new Date(), deadline || null, status || 'Active']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update project status
router.put('/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        const result = await db.query(
            'UPDATE projects SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/projects/:id - Delete a project
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query('DELETE FROM projects WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.json({ message: 'Project deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
