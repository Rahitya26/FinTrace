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
            SELECT prp.*, e.monthly_salary, e.hourly_rate, e.name 
            FROM project_resource_plans prp
            JOIN employees e ON prp.employee_id = e.id
        `;
        const plansResult = await db.query(plansQuery);
        const plans = plansResult.rows;

        // 3. Merge and Calculate Costs
        const projectsWithCosts = projects.map(project => {
            const projectPlans = plans.filter(p => Number(p.project_id) === Number(project.id));
            let computedCost = 0;
            let computedRevenue = Number(project.revenue_earned) || 0;
            let debugInfo = { type: project.type, plans: [] };

            if (projectPlans.length > 0) {
                let totalMonthlyBurn = 0;
                let totalMonthlyRevenue = 0;
                let enhancedPlans = [];
                const today = new Date();

                computedCost = projectPlans.reduce((sum, plan) => {
                    const allocation = project.type === 'T&M' ? 1 : (Number(plan.allocation_percentage) / 100);
                    const salary = Number(plan.monthly_salary) || 0;
                    const planMonthlyBurn = salary * allocation;

                    let planMonthlyRevenue = 0;
                    if (project.type === 'T&M') {
                        const hourlyRate = Number(plan.hourly_rate) || 0;
                        planMonthlyRevenue = hourlyRate * 160;
                    }

                    totalMonthlyRevenue += planMonthlyRevenue;

                    const planStartDate = plan.start_date ? new Date(plan.start_date) : new Date(project.start_date);

                    let durationMonths = 0;
                    let workingDays = 0;
                    if (today > planStartDate) {
                        let calculationEndDate = new Date();
                        if (plan.end_date) {
                            calculationEndDate = new Date(plan.end_date);
                        } else if (project.status === 'Completed' && project.deadline) {
                            calculationEndDate = new Date(project.deadline);
                        }

                        const diffTime = Math.max(0, calculationEndDate - planStartDate);
                        durationMonths = diffTime / (1000 * 60 * 60 * 24 * 30.44);

                        let d = new Date(planStartDate.getTime());
                        while (d <= calculationEndDate) {
                            const day = d.getDay();
                            if (day !== 0 && day !== 6) workingDays++;
                            d.setDate(d.getDate() + 1);
                        }
                    }

                    let generatedRevenue = 0;
                    let planTotalCost = 0;
                    if (project.type === 'T&M') {
                        const hourlyRate = Number(plan.hourly_rate) || 0;
                        generatedRevenue = workingDays * 8 * hourlyRate;
                        computedRevenue += generatedRevenue;

                        planTotalCost = generatedRevenue * 0.70; // 70% Contractor Payout

                        // Fake a burn value based on 70% of month's max billing just for margin percentages
                        totalMonthlyBurn += (planMonthlyRevenue * 0.70);
                    } else {
                        planTotalCost = planMonthlyBurn * durationMonths;
                        totalMonthlyBurn += planMonthlyBurn;
                    }

                    enhancedPlans.push({
                        name: plan.name,
                        alloc: plan.allocation_percentage,
                        salary: plan.monthly_salary,
                        hourly_rate: plan.hourly_rate,
                        calc_alloc: allocation,
                        calc_salary: salary,
                        offboarded: plan.end_date ? plan.end_date : false,
                        durationMonths: durationMonths,
                        workingDays: workingDays,
                        totalPlanCost: planTotalCost,
                        totalPlanRevenue: generatedRevenue,
                        calc_monthly_burn: project.type === 'T&M' ? (planMonthlyRevenue * 0.70) : planMonthlyBurn
                    });

                    return sum + planTotalCost;
                }, 0);

                // For Fixed Value / Fixed Bid, ensure computedRevenue retains its static value from the DB
                if (project.type !== 'T&M') {
                    computedRevenue = Number(project.revenue_earned) || 0;
                }

                debugInfo = {
                    type: project.type,
                    monthlyBurn: totalMonthlyBurn,
                    monthlyRevenue: totalMonthlyRevenue,
                    durationMonths: 'Dynamic per-resource',
                    plans: enhancedPlans
                };
            }

            return {
                ...project,
                employee_costs: computedCost.toFixed(2),
                revenue_earned: computedRevenue.toFixed(2),
                margin: (computedRevenue - computedCost).toFixed(2),
                is_calculated_cost: true,
                debug_info: debugInfo
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

        // Check if employee is already active on this project
        const existingCheck = await db.query(
            'SELECT * FROM project_resource_plans WHERE project_id = $1 AND employee_id = $2 AND end_date IS NULL',
            [id, employeeId]
        );

        if (existingCheck.rows.length > 0) {
            return res.status(400).json({ error: 'This employee is already actively assigned to this project.' });
        }

        const result = await db.query(
            'INSERT INTO project_resource_plans (project_id, employee_id, allocation_percentage, start_date) VALUES ($1, $2, $3, $4) RETURNING *',
            [id, employeeId, allocationPercentage || 100, startDate]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
