const express = require('express');
const router = express.Router();
const db = require('../db');
const { calculateProjectFinancials } = require('../utils/projectCalculation');

// GET /api/projects - List all projects with client details and calculated costs
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search;
        const type = req.query.type;
        const status = req.query.status;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const clientId = req.query.clientId;

        // 1. Build dynamic WHERE clause
        let whereClauses = [];
        let queryParams = [];
        let paramIndex = 1;

        if (clientId) {
            whereClauses.push(`p.client_id = $${paramIndex}`);
            queryParams.push(clientId);
            paramIndex++;
        }

        if (search) {
            whereClauses.push(`(p.name ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex})`);
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        if (type) {
            whereClauses.push(`p.type = $${paramIndex}`);
            queryParams.push(type);
            paramIndex++;
        }

        if (status) {
            whereClauses.push(`p.status = $${paramIndex}`);
            queryParams.push(status);
            paramIndex++;
        }

        if (startDate) {
            whereClauses.push(`(p.deadline IS NULL OR p.deadline >= $${paramIndex})`);
            queryParams.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            whereClauses.push(`p.start_date <= $${paramIndex}`);
            queryParams.push(endDate);
            paramIndex++;
        }

        const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // 2. Get Total Count for Pagination
        const countQuery = `
            SELECT COUNT(*) 
            FROM projects p 
            JOIN clients c ON p.client_id = c.id 
            ${whereString}
        `;
        const countResult = await db.query(countQuery, queryParams);
        const totalItems = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalItems / limit);

        // 3. Fetch Paginated Projects
        const projectsQuery = `
            SELECT p.*, c.name as client_name 
            FROM projects p 
            JOIN clients c ON p.client_id = c.id 
            ${whereString}
            ORDER BY 
                CASE 
                    WHEN p.status = 'Active' THEN 0
                    WHEN p.status = 'Pipeline' THEN 1
                    WHEN p.status = 'On Hold' THEN 2
                    WHEN p.status = 'Completed' THEN 3
                    ELSE 4
                END ASC,
                p.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        const projectsResult = await db.query(projectsQuery, [...queryParams, limit, offset]);
        const projects = projectsResult.rows;

        // 2. Fetch Resource Plans with Employee Details
        const plansQuery = `
            SELECT prp.*, e.monthly_salary, e.hourly_rate, e.usd_hourly_rate as default_usd_rate, e.name as employee_name, e.role 
            FROM project_resource_plans prp
            JOIN employees e ON prp.employee_id = e.id
        `;
        const plansResult = await db.query(plansQuery);
        const plans = plansResult.rows.map(p => ({ ...p, name: p.employee_name })); // Ensure 'name' is available for calculations

        // 3. Fetch Unapproved Timesheet Logs for T&M Projections
        const unapprovedLogsQuery = `
            SELECT t.project_id, t.employee_id, t.hours_worked, t.date, 
                   COALESCE(prp.usd_rate, e.usd_hourly_rate) as usd_hourly_rate, 
                   e.hourly_rate as inr_hourly_rate
            FROM timesheet_logs t
            JOIN employees e ON t.employee_id = e.id
            LEFT JOIN project_resource_plans prp ON t.project_id = prp.project_id AND t.employee_id = prp.employee_id
            WHERE t.approval_id IS NULL
        `;
        const unapprovedLogsResult = await db.query(unapprovedLogsQuery);
        const unapprovedLogs = unapprovedLogsResult.rows;

        const approvedLogsQuery = `
            SELECT 
                t.project_id, 
                t.employee_id, 
                EXTRACT(MONTH FROM t.date) as log_month,
                EXTRACT(YEAR FROM t.date) as log_year,
                SUM(t.hours_worked) as total_hours,
                SUM(t.hours_worked * e.hourly_rate) as total_inr_cost,
                SUM(t.hours_worked * e.usd_hourly_rate * ta.usd_to_inr_rate) as total_inr_revenue,
                MIN(t.date) as first_log_date
            FROM timesheet_logs t
            JOIN employees e ON t.employee_id = e.id
            JOIN timesheet_approvals ta ON t.approval_id = ta.id
            GROUP BY t.project_id, t.employee_id, EXTRACT(MONTH FROM t.date), EXTRACT(YEAR FROM t.date)
        `;
        const approvedLogsResult = await db.query(approvedLogsQuery);
        const approvedLogs = approvedLogsResult.rows;

        // 5. Merge and Calculate Costs
        const projectsWithCosts = projects.map(project => calculateProjectFinancials(project, plans, unapprovedLogs, approvedLogs));

        res.json({
            data: projectsWithCosts,
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

// POST /api/projects - Create a new project with resources in a transaction
router.post('/', async (req, res) => {
    const { clientId, name, type, revenue, costs, startDate, deadline, status, billingType, fixedContractValue, quotedBidValue, resources, budgetedHours } = req.body;
    
    const client = await db.pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Insert Project
        const projectResult = await client.query(
            `INSERT INTO projects (
                client_id, name, type, revenue_earned, employee_costs, 
                start_date, deadline, status, billing_type, fixed_contract_value, quoted_bid_value, budgeted_hours
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [
                clientId, name, type, revenue || 0, costs || 0, 
                startDate || new Date().toISOString().split('T')[0], 
                deadline || null, status || 'Active', billingType || 'T&M', 
                fixedContractValue || 0, quotedBidValue || 0, budgetedHours || 0
            ]
        );
        
        const newProject = projectResult.rows[0];

        // 2. Insert Resources if present
        if (resources && Array.isArray(resources) && resources.length > 0) {
            for (const resource of resources) {
                await client.query(
                    `INSERT INTO project_resource_plans (
                        project_id, employee_id, allocation_percentage, start_date, end_date, usd_rate
                    ) VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        newProject.id, 
                        resource.employeeId, 
                        resource.allocation || 100, 
                        resource.startDate || newProject.start_date,
                        resource.endDate || null,
                        resource.usdRate || null
                    ]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json(newProject);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating project with resources:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
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

// PATCH /api/projects/:id/resources/:employeeId/offboard - Off-board resource from project
router.patch('/:id/resources/:employeeId/offboard', async (req, res) => {
    try {
        const { endDate } = req.body;
        const targetDate = endDate || new Date().toISOString().split('T')[0];

        const result = await db.query(
            'UPDATE project_resource_plans SET end_date = $3 WHERE project_id = $1 AND employee_id = $2 AND end_date IS NULL RETURNING *',
            [req.params.id, req.params.employeeId, targetDate]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Active allocation not found' });
        }
        res.json({ message: 'Resource off-boarded successfully', data: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/projects/:id/resources - Get resources for a specific project
router.get('/:id/resources', async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT prp.*, e.name, e.role, e.specialization
            FROM project_resource_plans prp
            JOIN employees e ON prp.employee_id = e.id
            WHERE prp.project_id = $1
        `;
        const result = await db.query(query, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/projects/:id/resources - Add a resource to a specific project
router.post('/:id/resources', async (req, res) => {
    try {
        const { id } = req.params;
        const { employeeId, startDate, allocationPercentage } = req.body;

        if (!employeeId || !startDate) {
            return res.status(400).json({ error: 'Employee ID and Start Date are required' });
        }

        // Check if employee is already active on this project or has an overlapping historical assignment
        const existingCheck = await db.query(
            `SELECT * FROM project_resource_plans 
             WHERE project_id = $1 
             AND employee_id = $2 
             AND (
                 end_date IS NULL 
                 OR end_date >= $3
             )`,
            [id, employeeId, startDate]
        );

        if (existingCheck.rows.length > 0) {
            return res.status(400).json({ error: 'This employee is already active or has an overlapping assignment on this project.' });
        }

        const result = await db.query(
            'INSERT INTO project_resource_plans (project_id, employee_id, allocation_percentage, start_date, usd_rate) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [id, employeeId, allocationPercentage || 100, startDate, req.body.usdRate || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
