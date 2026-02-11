const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/projects - List all projects with client details and calculated costs
router.get('/', async (req, res) => {
    try {
        // 1. Fetch Projects with Client Name
        const projectsQuery = `
            SELECT p.*, c.name as client_name 
            FROM projects p 
            JOIN clients c ON p.client_id = c.id 
            ORDER BY p.created_at DESC
        `;
        const projectsResult = await db.query(projectsQuery);
        const projects = projectsResult.rows;

        // 2. Fetch Resource Plans with Employee Details
        const plansQuery = `
            SELECT prp.*, e.monthly_salary 
            FROM project_resource_plans prp
            JOIN employees e ON prp.employee_id = e.id
        `;
        const plansResult = await db.query(plansQuery);
        const plans = plansResult.rows;

        // 3. Merge and Calculate Costs
        const projectsWithCosts = projects.map(project => {
            const projectPlans = plans.filter(p => p.project_id === project.id);

            if (projectPlans.length > 0) {
                // Calculate Monthly Burn Rate
                const monthlyBurn = projectPlans.reduce((sum, plan) => {
                    const allocation = Number(plan.allocation_percentage) / 100;
                    const salary = Number(plan.monthly_salary);
                    return sum + (salary * allocation);
                }, 0);

                // Calculate Duration in Months (Pro-rated)
                const startDate = new Date(project.start_date);
                const endDate = project.deadline ? new Date(project.deadline) : new Date(); // Use deadline or today

                // If the project is 'Active' or 'Pipeline' and no deadline, we might just use today.
                // If 'Completed', we should use deadline or some completion date (which we don't track explicit completion date separately, assuming deadline or manual).
                // For simplicity: Max(Start, Min(Today, Deadline if exists)) -> Duration so far or total if completed.

                // Better approach for tracking:
                // Cost = Monthly Burn * (Months from Start to Now (or End))

                let calculationEndDate = new Date();
                if (project.status === 'Completed' && project.deadline) {
                    calculationEndDate = new Date(project.deadline);
                } else if (project.deadline && new Date(project.deadline) < new Date()) {
                    calculationEndDate = new Date(project.deadline); // Cap at deadline if passed?
                }

                const diffTime = Math.max(0, calculationEndDate - startDate);
                const diffMonths = diffTime / (1000 * 60 * 60 * 24 * 30.44); // Average days in month

                const computedCost = monthlyBurn * diffMonths;

                return {
                    ...project,
                    employee_costs: computedCost.toFixed(2),
                    // Recalculate margin since it's a generated column in DB but we are overriding cost in API
                    margin: (Number(project.revenue_earned) - computedCost).toFixed(2),
                    is_calculated_cost: true // Flag for UI
                };
            }

            return {
                ...project,
                is_calculated_cost: false
            };
        });

        res.json(projectsWithCosts);
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
