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
        const clientId = req.query.clientId;

        // 1. Build dynamic WHERE clause
        let whereClauses = [`p.organization_id = $1`];
        let queryParams = [req.user.organizationId];
        let paramIndex = 2;

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
            whereClauses.push(`p.billing_type = $${paramIndex}`);
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

        const whereString = `WHERE ${whereClauses.join(' AND ')}`;

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

// 2. Main Query with Financial CTEs
        const projectsQuery = `
WITH DateBoundaries AS (
    SELECT 
        COALESCE($${paramIndex+2}::date, '2026-01-01'::date) as filter_start,
        COALESCE($${paramIndex+3}::date, CURRENT_DATE)::date as filter_end
),
ProjectBase AS (
    SELECT p.*, c.name as client_name, db.filter_start, db.filter_end
    FROM projects p 
    JOIN clients c ON p.client_id = c.id 
    CROSS JOIN DateBoundaries db
    ${whereString}
),
Months AS (
    SELECT generate_series(
        date_trunc('month', (SELECT filter_start FROM DateBoundaries))::date,
        date_trunc('month', (SELECT filter_end FROM DateBoundaries))::date,
        '1 month'::interval
    )::date as month_start
),
MonthlyAllocations AS (
    SELECT 
        prp.project_id,
        prp.employee_id,
        prp.allocation_percentage,
        e.monthly_salary,
        m.month_start,
        (m.month_start + interval '1 month - 1 day')::date as month_end,
        EXTRACT(DAY FROM (m.month_start + interval '1 month - 1 day'))::int as days_in_this_month,
        prp.start_date::date as prp_start,
        prp.end_date::date as prp_end,
        e.joining_date::date,
        e.name,
        e.role
    FROM project_resource_plans prp
    JOIN employees e ON prp.employee_id = e.id
    CROSS JOIN Months m
    WHERE prp.organization_id = $1
),
ProjectDays AS (
    SELECT 
        pb.id as project_id,
        (LEAST(COALESCE(pb.deadline, pb.filter_end), pb.filter_end)::date - GREATEST(pb.start_date, pb.filter_start)::date) + 1 as active_days,
        (COALESCE(pb.deadline, pb.filter_end)::date - pb.start_date::date) + 1 as total_project_days
    FROM ProjectBase pb
),
EmployeeCosts AS (
    SELECT 
        project_id,
        employee_id,
        name,
        role,
        joining_date,
        allocation_percentage,
        monthly_salary,
        SUM(
            (monthly_salary::NUMERIC / days_in_this_month) * 
            GREATEST(0, (
                LEAST(COALESCE(prp_end, (SELECT filter_end FROM DateBoundaries)), month_end, (SELECT filter_end FROM DateBoundaries))::date - 
                GREATEST(prp_start, month_start, (SELECT filter_start FROM DateBoundaries), COALESCE(joining_date, '1970-01-01'::date))::date
            ) + 1) * 
            (allocation_percentage / 100.0)
        ) as total_employee_cost
    FROM MonthlyAllocations
    GROUP BY project_id, employee_id, name, role, joining_date, allocation_percentage, monthly_salary
),
ProjectStaffTotals AS (
    SELECT project_id, SUM(total_employee_cost) as total_project_staff_cost
    FROM EmployeeCosts
    GROUP BY project_id
),
EmployeeTMRevenue AS (
    SELECT 
        t.project_id,
        t.employee_id,
        SUM(t.hours_worked * COALESCE(prp.usd_rate, e.usd_hourly_rate) * ta.usd_to_inr_rate) as total_employee_revenue
    FROM timesheet_logs t
    JOIN employees e ON t.employee_id = e.id
    JOIN timesheet_approvals ta ON t.approval_id = ta.id
    LEFT JOIN project_resource_plans prp ON t.project_id = prp.project_id AND t.employee_id = prp.employee_id
    CROSS JOIN DateBoundaries db
    WHERE t.organization_id = $1 
      AND (db.filter_start IS NULL OR t.date >= db.filter_start)
      AND (db.filter_end IS NULL OR t.date <= db.filter_end)
    GROUP BY t.project_id, t.employee_id
),
TM_Total AS (
    SELECT project_id, SUM(total_employee_revenue) as tm_revenue
    FROM EmployeeTMRevenue
    GROUP BY project_id
),
EmployeeRevenueAttribution AS (
    SELECT 
        ec.project_id,
        ec.employee_id,
        ec.name,
        ec.role,
        ec.joining_date,
        ec.total_employee_cost,
        ec.monthly_salary,
        ec.allocation_percentage,
        CASE 
            WHEN pb.billing_type = 'Fixed Bid' THEN 
                CASE 
                    WHEN pst.total_project_staff_cost > 0 THEN 
                        (ec.total_employee_cost / pst.total_project_staff_cost) * 
                        ((pd.active_days::NUMERIC / pd.total_project_days) * pb.quoted_bid_value)
                    ELSE 0 
                END
            ELSE 
                COALESCE(er.total_employee_revenue, 0)
        END as attributed_revenue
    FROM EmployeeCosts ec
    JOIN ProjectBase pb ON ec.project_id = pb.id
    JOIN ProjectDays pd ON ec.project_id = pd.project_id
    JOIN ProjectStaffTotals pst ON ec.project_id = pst.project_id
    LEFT JOIN EmployeeTMRevenue er ON ec.project_id = er.project_id AND ec.employee_id = er.employee_id
),
ResourceAgg AS (
    SELECT 
        project_id,
        jsonb_agg(jsonb_build_object(
            'name', name,
            'role', role,
            'joining_date', joining_date,
            'totalPlanCost', total_employee_cost,
            'totalPlanRevenue', attributed_revenue
        )) as plans,
        SUM(monthly_salary * (allocation_percentage / 100.0))::NUMERIC(15,2) as monthly_burn
    FROM EmployeeRevenueAttribution
    GROUP BY project_id
)
SELECT 
    pb.*,
    COALESCE(pst.total_project_staff_cost, 0)::NUMERIC(15,2) as employee_costs,
    COALESCE(
        CASE 
            WHEN pb.billing_type = 'Fixed Bid' THEN 
                (pd.active_days::NUMERIC / pd.total_project_days) * pb.quoted_bid_value
            ELSE 
                tm.tm_revenue
        END, 
        0
    )::NUMERIC(15,2) as revenue_earned,
    jsonb_build_object(
        'plans', COALESCE(ra.plans, '[]'::jsonb),
        'monthlyBurn', COALESCE(ra.monthly_burn, 0),
        'monthlyRevenue', COALESCE(tm.tm_revenue, 0)
    ) as debug_info
FROM ProjectBase pb
LEFT JOIN ProjectDays pd ON pb.id = pd.project_id
LEFT JOIN ProjectStaffTotals pst ON pb.id = pst.project_id
LEFT JOIN TM_Total tm ON pb.id = tm.project_id
LEFT JOIN ResourceAgg ra ON pb.id = ra.project_id
ORDER BY 
    CASE 
        WHEN pb.status = 'Active' THEN 0
        WHEN pb.status = 'Pipeline' THEN 1
        WHEN pb.status = 'On Hold' THEN 2
        WHEN pb.status = 'Completed' THEN 3
        ELSE 4
    END,
    pb.created_at DESC
LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const projectsResult = await db.query(projectsQuery, [...queryParams, limit, offset, startDate || null, endDate || null]);
        const sliceDate = (val) => {
            if (!val) return val;
            const d = new Date(val);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        const projectsWithCosts = projectsResult.rows.map(p => {
            p.start_date = sliceDate(p.start_date);
            p.deadline = sliceDate(p.deadline);
            p.margin = Math.round(Number(p.revenue_earned) - Number(p.employee_costs));
            return p;
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
                start_date, deadline, status, billing_type, fixed_contract_value, quoted_bid_value, budgeted_hours, organization_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
            [
                clientId, name, type, revenue || 0, costs || 0, 
                startDate || new Date().toISOString().split('T')[0], 
                deadline || null, status || 'Active', billingType || 'T&M', 
                fixedContractValue || 0, quotedBidValue || 0, budgetedHours || 0,
                req.user.organizationId
            ]
        );
        
        const newProject = projectResult.rows[0];

        // 2. Insert Resources if present
        if (resources && Array.isArray(resources) && resources.length > 0) {
            for (const resource of resources) {
                await client.query(
                    `INSERT INTO project_resource_plans (
                        project_id, employee_id, allocation_percentage, start_date, end_date, usd_rate, organization_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        newProject.id, 
                        resource.employeeId, 
                        resource.allocation || 100, 
                        resource.startDate || newProject.start_date,
                        resource.endDate || null,
                        resource.usdRate || null,
                        req.user.organizationId
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
            'UPDATE projects SET status = $1 WHERE id = $2 AND organization_id = $3 RETURNING *',
            [status, id, req.user.organizationId]
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
        const result = await db.query('DELETE FROM projects WHERE id = $1 AND organization_id = $2 RETURNING *', [id, req.user.organizationId]);
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
            'UPDATE project_resource_plans SET end_date = $3 WHERE project_id = $1 AND employee_id = $2 AND end_date IS NULL AND organization_id = $4 RETURNING *',
            [req.params.id, req.params.employeeId, targetDate, req.user.organizationId]
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
            WHERE prp.project_id = $1 AND prp.organization_id = $2
        `;
        const result = await db.query(query, [id, req.user.organizationId]);
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
            'INSERT INTO project_resource_plans (project_id, employee_id, allocation_percentage, start_date, usd_rate, organization_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [id, employeeId, allocationPercentage || 100, startDate, req.body.usdRate || null, req.user.organizationId]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
