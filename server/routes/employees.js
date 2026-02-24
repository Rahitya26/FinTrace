const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/employees - List all employees
router.get('/', async (req, res) => {
    try {
        if (!req.query.page) {
            // Backward compatibility for dropdowns
            const result = await db.query('SELECT * FROM employees ORDER BY name ASC');
            return res.json(result.rows);
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        const { search, role, specialization, projectId } = req.query;

        let whereClauses = [];
        let queryParams = [];
        let paramIndex = 1;

        let joinClause = '';

        if (projectId) {
            joinClause = 'JOIN project_resource_plans prp ON e.id = prp.employee_id';
            whereClauses.push(`prp.project_id = $${paramIndex}`);
            queryParams.push(projectId);
            paramIndex++;
        }

        if (search) {
            whereClauses.push(`(e.name ILIKE $${paramIndex} OR e.role ILIKE $${paramIndex})`);
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        if (role) {
            whereClauses.push(`e.role = $${paramIndex}`);
            queryParams.push(role);
            paramIndex++;
        }

        if (specialization) {
            whereClauses.push(`e.specialization = $${paramIndex}`);
            queryParams.push(specialization);
            paramIndex++;
        }

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const countQuery = `SELECT COUNT(DISTINCT e.id) FROM employees e ${joinClause} ${whereString}`;
        const countResult = await db.query(countQuery, queryParams);
        const totalItems = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalItems / limit);

        const dataQuery = `
            SELECT DISTINCT e.* FROM employees e
            ${joinClause}
            ${whereString} 
            ORDER BY e.name ASC 
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

// GET /api/employees/:id - Get single employee
router.get('/:id', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/employees - Create new employee
router.post('/', async (req, res) => {
    const { name, role, monthly_salary, status, specialization, hourly_rate } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO employees (name, role, monthly_salary, status, specialization, hourly_rate) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [name, role, monthly_salary || 0, status || 'Active', specialization || 'T&M', hourly_rate || 0]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/employees/:id - Update employee
router.put('/:id', async (req, res) => {
    const { name, role, monthly_salary, status, specialization, hourly_rate } = req.body;
    try {
        const result = await db.query(
            'UPDATE employees SET name = $1, role = $2, monthly_salary = $3, status = $4, specialization = $5, hourly_rate = $6 WHERE id = $7 RETURNING *',
            [name, role, monthly_salary, status, specialization, hourly_rate, req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/employees/:id - Delete employee
router.delete('/:id', async (req, res) => {
    try {
        const result = await db.query('DELETE FROM employees WHERE id = $1 RETURNING *', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        res.json({ message: 'Employee deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Resource Allocation Routes ---

// GET /api/employees/allocations/:projectId
router.get('/allocations/:projectId', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT prp.*, e.name, e.role, e.monthly_salary 
             FROM project_resource_plans prp
             JOIN employees e ON prp.employee_id = e.id
             WHERE prp.project_id = $1`,
            [req.params.projectId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/employees/allocations
router.post('/allocations', async (req, res) => {
    const { projectId, employeeId, allocationPercentage, startDate } = req.body;
    try {
        // Check if allocation already exists for this employee on this project
        const existing = await db.query(
            'SELECT * FROM project_resource_plans WHERE project_id = $1 AND employee_id = $2',
            [projectId, employeeId]
        );

        if (existing.rows.length > 0) {
            // Update existing
            const result = await db.query(
                'UPDATE project_resource_plans SET allocation_percentage = $1, start_date = $2 WHERE id = $3 RETURNING *',
                [allocationPercentage, startDate || new Date(), existing.rows[0].id]
            );
            return res.json(result.rows[0]);
        }

        // Create new
        const result = await db.query(
            'INSERT INTO project_resource_plans (project_id, employee_id, allocation_percentage, start_date) VALUES ($1, $2, $3, $4) RETURNING *',
            [projectId, employeeId, allocationPercentage, startDate || new Date()]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/employees/allocations/:id
router.delete('/allocations/:id', async (req, res) => {
    try {
        const result = await db.query('DELETE FROM project_resource_plans WHERE id = $1 RETURNING *', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Allocation not found' });
        }
        res.json({ message: 'Allocation removed successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
