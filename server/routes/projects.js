const express = require('express');
const router = express.Router();
const db = require('../db');

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

        // 1. Build dynamic WHERE clause
        let whereClauses = [];
        let queryParams = [];
        let paramIndex = 1;

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
            SELECT prp.*, e.monthly_salary, e.hourly_rate 
            FROM project_resource_plans prp
            JOIN employees e ON prp.employee_id = e.id
        `;
        const plansResult = await db.query(plansQuery);
        const plans = plansResult.rows;

        // 3. Merge and Calculate Costs
        const projectsWithCosts = projects.map(project => {
            const projectPlans = plans.filter(p => p.project_id === project.id);

            if (projectPlans.length > 0) {
                let computedCost = 0;

                let debugInfo = null;

                // Distinct Calculation per Project Type
                if (project.type === 'T&M') {
                    // Logic: Sum of (Hourly Rate * Hours)
                    // Note: For T&M, we use 'allocation_percentage' column to store 'Estimated Hours'
                    computedCost = projectPlans.reduce((sum, plan) => {
                        const hours = Number(plan.allocation_percentage) || 0;
                        const rate = Number(plan.hourly_rate) || 0;
                        return sum + (hours * rate);
                    }, 0);

                    debugInfo = {
                        type: 'T&M',
                        plans: projectPlans.map(p => ({
                            hours: p.allocation_percentage,
                            rate: p.hourly_rate
                        }))
                    };
                } else {
                    // Logic: Monthly Burn Rate * Duration
                    // Fixed Bid or Fixed Value
                    const monthlyBurn = projectPlans.reduce((sum, plan) => {
                        const allocation = Number(plan.allocation_percentage) / 100;
                        const salary = Number(plan.monthly_salary) || 0;
                        return sum + (salary * allocation);
                    }, 0);

                    // Calculate Duration
                    const startDate = new Date(project.start_date);
                    let calculationEndDate = new Date();

                    if (project.status === 'Completed' && project.deadline) {
                        calculationEndDate = new Date(project.deadline);
                    } else if (project.deadline && new Date(project.deadline) < new Date()) {
                        calculationEndDate = new Date(project.deadline);
                    }

                    const diffTime = Math.max(0, calculationEndDate - startDate);
                    const diffMonths = diffTime / (1000 * 60 * 60 * 24 * 30.44); // Average days in month
                    computedCost = monthlyBurn * diffMonths;

                    debugInfo = {
                        type: 'Fixed',
                        monthlyBurn,
                        diffMonths,
                        plans: projectPlans.map(p => ({
                            alloc: p.allocation_percentage,
                            salary: p.monthly_salary,
                            calc_alloc: Number(p.allocation_percentage) / 100,
                            calc_salary: Number(p.monthly_salary)
                        }))
                    };
                }

                return {
                    ...project,
                    employee_costs: computedCost.toFixed(2),
                    // Recalculate margin since it's a generated column in DB but we are overriding cost in API
                    margin: (Number(project.revenue_earned) - computedCost).toFixed(2),
                    is_calculated_cost: true, // Flag for UI
                    debug_info: debugInfo
                };
            }

            return {
                ...project,
                is_calculated_cost: false
            };
        });

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

module.exports = router;
