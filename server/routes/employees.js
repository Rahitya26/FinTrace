const express = require('express');
const router = express.Router();
const db = require('../db');
const { 
  getMonthsInPeriod, 
  getValidMonthsForEmployee, 
  getBusinessHoursInMonth, 
  getActiveMonthsForEmployee, 
  toLocalDate, 
  calculateFixedBidRevenueShare,
  calculateLinearRevenue,
  calculateStaffCost
} = require('../utils/financialUtils');
const { calculateInclusiveDays, SYSTEM_TODAY } = require('../utils/dateUtils');

// GET /api/employees/:id/performance
router.get('/:id/performance', async (req, res) => {
    const empId = req.params.id;
    const { startDate, endDate } = req.query;

    try {
        const orgId = req.user.organizationId;
        const baselineStart = startDate || '2026-01-01';
        const baselineEnd = endDate || new Date().toISOString().substring(0, 10);

        const performanceQuery = `
WITH DateBoundaries AS (
    SELECT 
        $2::date as filter_start,
        $3::date as filter_end
),
Months AS (
    SELECT generate_series(
        date_trunc('month', (SELECT filter_start FROM DateBoundaries))::date,
        date_trunc('month', (SELECT filter_end FROM DateBoundaries))::date,
        '1 month'::interval
    )::date as month_start
),
EmpTotalPayroll AS (
    SELECT 
        e.id,
        e.monthly_salary,
        e.joining_date,
        SUM(
            (e.monthly_salary::NUMERIC / EXTRACT(DAY FROM (m.month_start + interval '1 month - 1 day'))) * 
            GREATEST(0, (
                LEAST((SELECT filter_end FROM DateBoundaries), (m.month_start + interval '1 month - 1 day')::date)::date - 
                GREATEST((SELECT filter_start FROM DateBoundaries), m.month_start, COALESCE(e.joining_date, '1970-01-01'::date))::date
            ) + 1)
        ) as total_payroll_cost
    FROM employees e
    CROSS JOIN Months m
    WHERE e.id = $1 AND e.organization_id = $4
    GROUP BY e.id, e.monthly_salary, e.joining_date
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
    WHERE prp.employee_id = $1 AND prp.organization_id = $4
),
EmployeeCosts AS (
    SELECT 
        project_id,
        employee_id,
        SUM(
            (monthly_salary::NUMERIC / days_in_this_month) * 
            GREATEST(0, (
                LEAST(COALESCE(prp_end, (SELECT filter_end FROM DateBoundaries)), month_end, (SELECT filter_end FROM DateBoundaries))::date - 
                GREATEST(prp_start, month_start, (SELECT filter_start FROM DateBoundaries), COALESCE(joining_date, '1970-01-01'::date))::date
            ) + 1) * 
            (allocation_percentage / 100.0)
        ) as total_employee_cost
    FROM MonthlyAllocations
    GROUP BY project_id, employee_id
),
ProjectStaffTotals AS (
    SELECT project_id, SUM(
        (monthly_salary::NUMERIC / days_in_this_month) * 
        GREATEST(0, (
            LEAST(COALESCE(prp_end, (SELECT filter_end FROM DateBoundaries)), month_end, (SELECT filter_end FROM DateBoundaries))::date - 
            GREATEST(prp_start, month_start, (SELECT filter_start FROM DateBoundaries), COALESCE(joining_date, '1970-01-01'::date))::date
        ) + 1) * 
        (allocation_percentage / 100.0)
    ) as total_project_staff_cost
    FROM (
        SELECT 
            prp.project_id,
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
        WHERE prp.project_id IN (SELECT project_id FROM EmployeeCosts) AND prp.organization_id = $4
    ) sub
    GROUP BY project_id
),
TM_Revenue AS (
    SELECT 
        t.project_id,
        SUM(t.hours_worked * COALESCE(prp.usd_rate, e.usd_hourly_rate) * ta.usd_to_inr_rate) as total_employee_revenue
    FROM timesheet_logs t
    JOIN employees e ON t.employee_id = e.id
    JOIN timesheet_approvals ta ON t.approval_id = ta.id
    LEFT JOIN project_resource_plans prp ON t.project_id = prp.project_id AND t.employee_id = prp.employee_id
    CROSS JOIN DateBoundaries db
    WHERE t.employee_id = $1 AND t.organization_id = $4
      AND (db.filter_start IS NULL OR t.date >= db.filter_start)
      AND (db.filter_end IS NULL OR t.date <= db.filter_end)
    GROUP BY t.project_id
),
ProjectDays AS (
    SELECT 
        p.id as project_id,
        (LEAST(COALESCE(p.deadline, (SELECT filter_end FROM DateBoundaries)), (SELECT filter_end FROM DateBoundaries))::date - GREATEST(p.start_date, (SELECT filter_start FROM DateBoundaries))::date) + 1 as active_days,
        (COALESCE(p.deadline, (SELECT filter_end FROM DateBoundaries))::date - p.start_date::date) + 1 as total_project_days
    FROM projects p
    WHERE p.id IN (SELECT project_id FROM EmployeeCosts)
),
EmployeeRevenueAttribution AS (
    SELECT 
        SUM(
            CASE 
                WHEN p.billing_type = 'Fixed Bid' THEN 
                    CASE 
                        WHEN pst.total_project_staff_cost > 0 THEN 
                            (ec.total_employee_cost / pst.total_project_staff_cost) * 
                            ((pd.active_days::NUMERIC / pd.total_project_days) * p.quoted_bid_value)
                        ELSE 0 
                    END
                ELSE 
                    COALESCE(er.total_employee_revenue, 0)
            END
        ) as total_attributed_revenue
    FROM EmployeeCosts ec
    JOIN projects p ON ec.project_id = p.id
    JOIN ProjectDays pd ON ec.project_id = pd.project_id
    JOIN ProjectStaffTotals pst ON ec.project_id = pst.project_id
    LEFT JOIN TM_Revenue er ON ec.project_id = er.project_id
),
TimelineSegments AS (
    SELECT 
        month_start as segment_start,
        (month_start + interval '1 month - 1 day')::date as segment_end,
        TO_CHAR(month_start, 'Mon YY') as label
    FROM Months
),
TimelineData AS (
    SELECT 
        ts.label,
        SUM(
            (e.monthly_salary::NUMERIC / EXTRACT(DAY FROM (m.month_start + interval '1 month - 1 day'))) * 
            GREATEST(0, (
                LEAST(ts.segment_end, (m.month_start + interval '1 month - 1 day')::date)::date - 
                GREATEST(ts.segment_start, m.month_start, COALESCE(e.joining_date, '1970-01-01'::date))::date
            ) + 1)
        ) as segment_cost,
        -- Weighted Revenue per segment
        COALESCE((
            SELECT SUM(
                CASE 
                    WHEN p.billing_type = 'Fixed Bid' THEN 
                        CASE 
                            WHEN pst.total_project_staff_cost > 0 THEN 
                                -- Cost in THIS segment for THIS project
                                (
                                    (SELECT SUM(
                                        (ma2.monthly_salary::NUMERIC / ma2.days_in_this_month) * 
                                        GREATEST(0, (
                                            LEAST(COALESCE(ma2.prp_end, ts.segment_end), ma2.month_end, ts.segment_end)::date - 
                                            GREATEST(ma2.prp_start, ma2.month_start, ts.segment_start, COALESCE(e.joining_date, '1970-01-01'::date))::date
                                        ) + 1) * 
                                        (ma2.allocation_percentage / 100.0)
                                    ) FROM MonthlyAllocations ma2 WHERE ma2.project_id = p.id) 
                                / pst.total_project_staff_cost) * 
                                ((pd.active_days::NUMERIC / pd.total_project_days) * p.quoted_bid_value)
                            ELSE 0 
                        END
                    ELSE 
                        (SELECT SUM(t.hours_worked * COALESCE(prp.usd_rate, e.usd_hourly_rate) * ta.usd_to_inr_rate) 
                         FROM timesheet_logs t 
                         JOIN timesheet_approvals ta ON t.approval_id = ta.id 
                         LEFT JOIN project_resource_plans prp ON t.project_id = prp.project_id AND t.employee_id = prp.employee_id
                         WHERE t.employee_id = $1 AND t.project_id = p.id AND t.date >= ts.segment_start AND t.date <= ts.segment_end)
                END
            )
            FROM EmployeeCosts ec
            JOIN projects p ON ec.project_id = p.id
            JOIN ProjectDays pd ON ec.project_id = pd.project_id
            JOIN ProjectStaffTotals pst ON ec.project_id = pst.project_id
        ), 0) as segment_revenue
    FROM employees e
    CROSS JOIN Months m
    CROSS JOIN TimelineSegments ts
    WHERE e.id = $1 AND m.month_start = ts.segment_start
    GROUP BY ts.label, ts.segment_start, ts.segment_end
)
SELECT 
    (SELECT total_payroll_cost FROM EmpTotalPayroll) as period_staff_cost,
    (SELECT total_attributed_revenue FROM EmployeeRevenueAttribution) as total_revenue,
    (SELECT jsonb_agg(jsonb_build_object('month', label, 'revenue', ROUND(segment_revenue), 'cost', ROUND(segment_cost), 'profit', ROUND(segment_revenue - segment_cost))) FROM TimelineData) as timeline,
    (SELECT joining_date FROM employees WHERE id = $1) as joining_date
        `;

        const result = await db.query(performanceQuery, [empId, baselineStart, baselineEnd, orgId]);
        const row = result.rows[0];

        res.json({
            timeline: row.timeline || [],
            totalProfitContribution: Math.round((Number(row.total_revenue) || 0) - (Number(row.period_staff_cost) || 0)),
            periodStaffCost: Math.round(Number(row.period_staff_cost) || 0),
            currentBusinessHours: 160,
            joiningDate: row.joining_date
        });

    } catch (err) {
        console.error("Error fetching employee performance:", err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/employees - List employees
router.get('/', async (req, res) => {
    const { search, status, specialization, projectId, startDate, endDate, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const queryParams = [req.user.organizationId];
    let whereClause = 'WHERE e.organization_id = $1';

    if (search) {
        queryParams.push(`%${search}%`);
        whereClause += ` AND (e.name ILIKE $${queryParams.length} OR e.role ILIKE $${queryParams.length})`;
    }
    if (status) {
        queryParams.push(status);
        whereClause += ` AND e.status = $${queryParams.length}`;
    }
    if (specialization) {
        queryParams.push(specialization);
        whereClause += ` AND e.specialization = $${queryParams.length}`;
    }
    if (projectId) {
        queryParams.push(projectId);
        whereClause += ` AND EXISTS (SELECT 1 FROM project_resource_plans prp WHERE prp.employee_id = e.id AND prp.project_id = $${queryParams.length})`;
    }

    try {
        const countQuery = `SELECT COUNT(*) FROM employees e ${whereClause}`;
        const countRes = await db.query(countQuery, queryParams);
        const total = parseInt(countRes.rows[0].count);

        let tStart = '2026-01-01';
        let tEnd = new Date().toISOString().substring(0,10);

        if (startDate && endDate) {
            tStart = startDate;
            tEnd = endDate;
        }

        const employeeAggQuery = `
WITH DateBoundaries AS (
    SELECT 
        COALESCE($${queryParams.length + 3}::date, '2026-01-01'::date) as filter_start,
        COALESCE($${queryParams.length + 4}::date, CURRENT_DATE)::date as filter_end
),
BaseEmployees AS (
    SELECT e.* 
    FROM employees e 
    ${whereClause} 
    ORDER BY e.name ASC 
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
),
Months AS (
    SELECT generate_series(
        date_trunc('month', (SELECT filter_start FROM DateBoundaries))::date,
        date_trunc('month', (SELECT filter_end FROM DateBoundaries))::date,
        '1 month'::interval
    )::date as month_start
),
EmpTotalPayroll AS (
    SELECT 
        be.id,
        SUM(
            (be.monthly_salary::NUMERIC / EXTRACT(DAY FROM (m.month_start + interval '1 month - 1 day'))) * 
            GREATEST(0, (
                LEAST((SELECT filter_end FROM DateBoundaries), (m.month_start + interval '1 month - 1 day')::date)::date - 
                GREATEST((SELECT filter_start FROM DateBoundaries), m.month_start, COALESCE(be.joining_date, '1970-01-01'::date))::date
            ) + 1)
        ) as total_payroll_cost
    FROM BaseEmployees be
    CROSS JOIN Months m
    GROUP BY be.id
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
EmployeeCosts AS (
    SELECT 
        project_id,
        employee_id,
        SUM(
            (monthly_salary::NUMERIC / days_in_this_month) * 
            GREATEST(0, (
                LEAST(COALESCE(prp_end, (SELECT filter_end FROM DateBoundaries)), month_end, (SELECT filter_end FROM DateBoundaries))::date - 
                GREATEST(prp_start, month_start, (SELECT filter_start FROM DateBoundaries), COALESCE(joining_date, '1970-01-01'::date))::date
            ) + 1) * 
            (allocation_percentage / 100.0)
        ) as total_employee_cost
    FROM MonthlyAllocations
    GROUP BY project_id, employee_id
),
ProjectStaffTotals AS (
    SELECT project_id, SUM(total_employee_cost) as total_project_staff_cost
    FROM EmployeeCosts
    GROUP BY project_id
),
TM_Revenue AS (
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
ProjectDays AS (
    SELECT 
        p.id as project_id,
        (LEAST(COALESCE(p.deadline, (SELECT filter_end FROM DateBoundaries)), (SELECT filter_end FROM DateBoundaries))::date - GREATEST(p.start_date, (SELECT filter_start FROM DateBoundaries))::date) + 1 as active_days,
        (COALESCE(p.deadline, (SELECT filter_end FROM DateBoundaries))::date - p.start_date::date) + 1 as total_project_days
    FROM projects p
    CROSS JOIN DateBoundaries db
    WHERE p.organization_id = $1
),
EmployeeRevenueAttribution AS (
    SELECT 
        ec.employee_id,
        SUM(
            CASE 
                WHEN p.billing_type = 'Fixed Bid' THEN 
                    CASE 
                        WHEN pst.total_project_staff_cost > 0 THEN 
                            (ec.total_employee_cost / pst.total_project_staff_cost) * 
                            ((pd.active_days::NUMERIC / pd.total_project_days) * p.quoted_bid_value)
                        ELSE 0 
                    END
                ELSE 
                    COALESCE(er.total_employee_revenue, 0)
            END
        ) as attributed_revenue
    FROM EmployeeCosts ec
    JOIN projects p ON ec.project_id = p.id
    JOIN ProjectDays pd ON ec.project_id = pd.project_id
    JOIN ProjectStaffTotals pst ON ec.project_id = pst.project_id
    LEFT JOIN TM_Revenue er ON ec.project_id = er.project_id AND ec.employee_id = er.employee_id
    GROUP BY ec.employee_id
)
SELECT 
    be.*,
    etp.total_payroll_cost as expected_cost,
    COALESCE(era.attributed_revenue, 0) as total_revenue
FROM BaseEmployees be
LEFT JOIN EmpTotalPayroll etp ON be.id = etp.id
LEFT JOIN EmployeeRevenueAttribution era ON be.id = era.employee_id;
        `;

        const dataRes = await db.query(employeeAggQuery, [...queryParams, limit, offset, tStart, tEnd]);
        
        const enhancedEmployees = dataRes.rows.map(emp => {
            const expectedCost = Number(emp.expected_cost);
            const totalRevenue = Number(emp.total_revenue);

            let asset_status = 'LIABILITY';
            let status_color = 'red';

            if (totalRevenue > expectedCost) {
                asset_status = 'ASSET';
                status_color = 'green';
            }

            return {
                ...emp,
                asset_status,
                status_color
            };
        });

        res.json({
            data: enhancedEmployees,
            pagination: {
                total,
                totalPages: Math.ceil(total / limit),
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/employees - Create employee
router.post('/', async (req, res) => {
    const { name, role, joining_date, monthly_salary, status, specialization, hourly_rate, usd_hourly_rate } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO employees (name, role, joining_date, monthly_salary, status, specialization, hourly_rate, usd_hourly_rate, organization_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
            [name, role, joining_date || '2026-02-01', monthly_salary, status, specialization, hourly_rate, usd_hourly_rate, req.user.organizationId]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/employees/:id - Update employee
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, role, joining_date, monthly_salary, status, specialization, hourly_rate, usd_hourly_rate } = req.body;
    try {
        const result = await db.query(
            'UPDATE employees SET name=$1, role=$2, joining_date=$3, monthly_salary=$4, status=$5, specialization=$6, hourly_rate=$7, usd_hourly_rate=$8 WHERE id=$9 AND organization_id=$10 RETURNING *',
            [name, role, joining_date || '2026-02-01', monthly_salary, status, specialization, hourly_rate, usd_hourly_rate, id, req.user.organizationId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/employees/:id - Delete employee
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM employees WHERE id = $1 AND organization_id = $2', [id, req.user.organizationId]);
        res.json({ message: 'Employee deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
