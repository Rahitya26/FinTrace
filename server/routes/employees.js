const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/employees - List all employees
router.get('/', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM employees ORDER BY name ASC');
        res.json(result.rows);
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
    const { name, role, monthly_salary, status } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO employees (name, role, monthly_salary, status) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, role, monthly_salary || 0, status || 'Active']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/employees/:id - Update employee
router.put('/:id', async (req, res) => {
    const { name, role, monthly_salary, status } = req.body;
    try {
        const result = await db.query(
            'UPDATE employees SET name = $1, role = $2, monthly_salary = $3, status = $4 WHERE id = $5 RETURNING *',
            [name, role, monthly_salary, status, req.params.id]
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
