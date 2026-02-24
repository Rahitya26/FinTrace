const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/expenses - List all expenses (Paginated)
router.get('/', async (req, res) => {
    try {
        if (!req.query.page) {
            // Backward compatibility
            const result = await db.query('SELECT * FROM company_expenses ORDER BY date DESC');
            return res.json(result.rows);
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const { search, startDate, endDate } = req.query;

        let whereClauses = [];
        let queryParams = [];
        let paramIndex = 1;

        if (search) {
            whereClauses.push(`(category ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        if (startDate) {
            whereClauses.push(`date >= $${paramIndex}`);
            queryParams.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            whereClauses.push(`date <= $${paramIndex}`);
            queryParams.push(endDate);
            paramIndex++;
        }

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const countQuery = `SELECT COUNT(*), COALESCE(SUM(amount), 0) as total_amount FROM company_expenses ${whereString}`;
        const countResult = await db.query(countQuery, queryParams);
        const totalItems = parseInt(countResult.rows[0].count);
        const totalAmount = parseFloat(countResult.rows[0].total_amount);
        const totalPages = Math.ceil(totalItems / limit);

        const dataQuery = `
            SELECT * FROM company_expenses 
            ${whereString} 
            ORDER BY date DESC 
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        const result = await db.query(dataQuery, [...queryParams, limit, offset]);

        res.json({
            data: result.rows,
            pagination: {
                total: totalItems,
                totalAmount,
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

// GET /api/expenses/categories - List all categories
router.get('/categories', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM expense_categories ORDER BY is_default DESC, name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/expenses/categories - Add a new category
router.post('/categories', async (req, res) => {
    const { name } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO expense_categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
            [name]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
