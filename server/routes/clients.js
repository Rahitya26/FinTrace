const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/clients - List all clients with active project count
router.get('/', async (req, res) => {
    try {
        if (!req.query.page) {
            // Backward compatibility for dropdowns
            const result = await db.query(`
                SELECT c.*, COUNT(p.id)::int as project_count
                FROM clients c
                LEFT JOIN projects p ON c.id = p.client_id AND p.status = 'Active'
                GROUP BY c.id
                ORDER BY c.created_at DESC
            `);
            return res.json(result.rows);
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search;

        let whereClauses = [];
        let queryParams = [];
        let paramIndex = 1;

        if (search) {
            whereClauses.push(`c.name ILIKE $${paramIndex}`);
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const countQuery = `SELECT COUNT(*) FROM clients c ${whereString}`;
        const countResult = await db.query(countQuery, queryParams);
        const totalItems = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalItems / limit);

        const dataQuery = `
            SELECT c.*, COUNT(p.id)::int as project_count
            FROM clients c
            LEFT JOIN projects p ON c.id = p.client_id AND p.status = 'Active'
            ${whereString}
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        const result = await db.query(dataQuery, [...queryParams, limit, offset]);

        res.json({
            data: result.rows,
            pagination: {
                total: totalItems,
                page,
                limit,
                totalPages
            }
        });
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
