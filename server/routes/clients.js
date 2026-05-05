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
                WHERE c.organization_id = $1
                GROUP BY c.id
                ORDER BY c.created_at DESC
            `, [req.user.organizationId]);
            return res.json(result.rows);
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search;
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;

        let whereClauses = [`c.organization_id = $1`];
        let queryParams = [req.user.organizationId];
        let paramIndex = 2;

        if (search) {
            whereClauses.push(`c.name ILIKE $${paramIndex}`);
            queryParams.push(`%${search}%`);
            paramIndex++;
        }

        const whereString = `WHERE ${whereClauses.join(' AND ')}`;

        const countQuery = `SELECT COUNT(*) FROM clients c ${whereString}`;
        const countResult = await db.query(countQuery, queryParams);
        const totalItems = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalItems / limit);


        // Financial Aggregation Query
        const dataQuery = `
WITH ProjectList AS (
    SELECT p.* 
    FROM projects p
    WHERE p.organization_id = $1
),
DateBoundaries AS (
    SELECT 
        COALESCE($${paramIndex + 2}::date, '2026-01-01'::date) as filter_start,
        COALESCE($${paramIndex + 3}::date, CURRENT_DATE)::date as filter_end
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
        e.joining_date::date
    FROM project_resource_plans prp
    JOIN employees e ON prp.employee_id = e.id
    CROSS JOIN Months m
    WHERE prp.organization_id = $1
),
ProjectDays AS (
    SELECT 
        p.id as project_id,
        p.client_id,
        GREATEST(0, (
            LEAST(COALESCE(p.deadline, (SELECT filter_end FROM DateBoundaries)), (SELECT filter_end FROM DateBoundaries))::date - 
            GREATEST(p.start_date, (SELECT filter_start FROM DateBoundaries))::date
        ) + 1) as active_days,
        GREATEST(1, COALESCE(p.deadline, (SELECT filter_end FROM DateBoundaries))::date - p.start_date::date + 1) as total_project_days
    FROM ProjectList p
),
StaffCosts AS (
    SELECT 
        project_id,
        SUM(
            (monthly_salary::NUMERIC / days_in_this_month) * 
            GREATEST(0, (
                LEAST(COALESCE(prp_end, (SELECT filter_end FROM DateBoundaries)), month_end, (SELECT filter_end FROM DateBoundaries))::date - 
                GREATEST(prp_start, month_start, (SELECT filter_start FROM DateBoundaries), COALESCE(joining_date, '1970-01-01'::date))::date
            ) + 1) * 
            (allocation_percentage / 100.0)
        ) as total_employee_cost
    FROM MonthlyAllocations
    GROUP BY project_id
),
TM_Revenue AS (
    SELECT 
        t.project_id,
        SUM(t.hours_worked * COALESCE(prp.usd_rate, e.usd_hourly_rate) * ta.usd_to_inr_rate) as tm_revenue
    FROM timesheet_logs t
    JOIN employees e ON t.employee_id = e.id
    JOIN timesheet_approvals ta ON t.approval_id = ta.id
    LEFT JOIN project_resource_plans prp ON t.project_id = prp.project_id AND t.employee_id = prp.employee_id
    WHERE t.organization_id = $1 
      AND ($${paramIndex + 2}::date IS NULL OR t.date >= $${paramIndex + 2}::date)
      AND ($${paramIndex + 3}::date IS NULL OR t.date <= $${paramIndex + 3}::date)
    GROUP BY t.project_id
),
ProjectFinancials AS (
    SELECT 
        pl.id as project_id,
        pl.client_id,
        COALESCE(sc.total_employee_cost, 0) as employee_costs,
        COALESCE(
            CASE 
                WHEN pl.billing_type = 'Fixed Bid' THEN 
                    (pd.active_days::NUMERIC / pd.total_project_days) * pl.quoted_bid_value
                ELSE 
                    tm.tm_revenue
            END, 
            0
        ) as revenue_earned
    FROM ProjectList pl
    LEFT JOIN ProjectDays pd ON pl.id = pd.project_id
    LEFT JOIN StaffCosts sc ON pl.id = sc.project_id
    LEFT JOIN TM_Revenue tm ON pl.id = tm.project_id
),
ClientAggregates AS (
    SELECT 
        client_id,
        SUM(revenue_earned) as total_revenue,
        SUM(employee_costs) as total_employee_costs,
        SUM(revenue_earned - employee_costs) as net_savings
    FROM ProjectFinancials
    GROUP BY client_id
)
SELECT 
    c.*, 
    COUNT(p.id) FILTER (WHERE p.status = 'Active')::int as project_count,
    COALESCE(ca.total_revenue, 0)::NUMERIC(15,2) as total_revenue,
    COALESCE(ca.net_savings, 0)::NUMERIC(15,2) as net_savings
FROM clients c
LEFT JOIN projects p ON c.id = p.client_id
LEFT JOIN ClientAggregates ca ON c.id = ca.client_id
${whereString}
GROUP BY c.id, ca.total_revenue, ca.net_savings
ORDER BY c.created_at DESC
LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const sliceDate = (val) => {
            if (!val) return val;
            const d = new Date(val);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const result = await db.query(dataQuery, [...queryParams, limit, offset, startDate || null, endDate || null]);

        res.json({
            data: result.rows.map(row => {
                // Ensure dates are sliced locally if they exist
                return row;
            }),
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
            'INSERT INTO clients (name, industry, organization_id) VALUES ($1, $2, $3) RETURNING *',
            [name, industry, req.user.organizationId]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
