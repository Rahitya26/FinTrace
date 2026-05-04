const express = require('express');
const router = express.Router();
const db = require('../db');

const { getActiveMonthsForEmployee, toLocalDate, getMonthsInPeriod, getValidMonthsForEmployee, calculateStaffCost } = require('../utils/financialUtils');

// GET /api/dashboard/summary
router.get('/summary', async (req, res) => {
  const { startDate, endDate } = req.query;
  const orgId = req.user.organizationId;
  console.log("DEBUG: Executing Dashboard Summary Query at", new Date().toISOString());
  
  // Explicitly compute the effective start date based on frontend filters, heavily clamped to 2026-01-01
  const MIN_START_DATE = '2026-01-01';
  let globalStartStr = startDate || MIN_START_DATE;
  if (new Date(globalStartStr) < new Date(MIN_START_DATE)) {
      globalStartStr = MIN_START_DATE;
  }
  const globalEndStr = endDate || null;

  try {
    const globalParams = [orgId, globalStartStr, globalEndStr];

    // 1. Total Company Expenses
    const expensesRes = await db.query(
      `SELECT SUM(amount) as total_expenses FROM company_expenses 
       WHERE organization_id = $1 
         AND ($2::date IS NULL OR date >= $2::date) 
         AND ($3::date IS NULL OR date <= $3::date)`,
      globalParams
    );
    const totalCompanyExpenses = Number(expensesRes.rows[0]?.total_expenses) || 0;

    // 2. Global Payroll Cost (Unified Logic)
    const payrollRes = await db.query(`
        WITH DateBoundaries AS (
            SELECT 
                COALESCE($2::date, '2026-01-01'::date) as filter_start,
                COALESCE($3::date, CURRENT_DATE)::date as filter_end
        ),
        Months AS (
            SELECT generate_series(
                date_trunc('month', (SELECT filter_start FROM DateBoundaries))::date,
                date_trunc('month', (SELECT filter_end FROM DateBoundaries))::date,
                '1 month'::interval
            )::date as month_start
        )
        SELECT SUM(
            (e.monthly_salary::NUMERIC / EXTRACT(DAY FROM (m.month_start + interval '1 month - 1 day'))) * 
            GREATEST(0, (
                LEAST((SELECT filter_end FROM DateBoundaries), (m.month_start + interval '1 month - 1 day')::date)::date - 
                GREATEST((SELECT filter_start FROM DateBoundaries), m.month_start, COALESCE(e.joining_date, '1970-01-01'::date))::date
            ) + 1)
        ) as total_payroll
        FROM employees e
        CROSS JOIN Months m
        WHERE e.organization_id = $1
    `, globalParams);
    const totalPayrollCost = Number(payrollRes.rows[0]?.total_payroll) || 0;

    // 3. Project Aggregation (Synchronized Engine)
    const projectAggQuery = `
WITH DateBoundaries AS (
    SELECT 
        COALESCE($2::date, '2026-01-01'::date) as filter_start,
        COALESCE($3::date, CURRENT_DATE)::date as filter_end
),
ProjectBase AS (
    SELECT id as project_id, COALESCE(billing_type, type::text, 'T&M') as process_type, quoted_bid_value, start_date, deadline 
    FROM projects 
    WHERE organization_id = $1
      AND ($2::date IS NULL OR (deadline >= $2::date OR deadline IS NULL))
      AND ($3::date IS NULL OR start_date <= $3::date)
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
        e.name
    FROM project_resource_plans prp
    JOIN employees e ON prp.employee_id = e.id
    CROSS JOIN Months m
    WHERE prp.organization_id = $1
),
ProjectDays AS (
    SELECT 
        pb.project_id,
        (LEAST(COALESCE(pb.deadline, (SELECT filter_end FROM DateBoundaries)), (SELECT filter_end FROM DateBoundaries))::date - GREATEST(pb.start_date, (SELECT filter_start FROM DateBoundaries))::date) + 1 as active_days,
        (COALESCE(pb.deadline, (SELECT filter_end FROM DateBoundaries))::date - pb.start_date::date) + 1 as total_project_days
    FROM ProjectBase pb
),
EmployeeCosts AS (
    SELECT 
        project_id,
        employee_id,
        name,
        SUM(
            (monthly_salary::NUMERIC / days_in_this_month) * 
            GREATEST(0, (
                LEAST(COALESCE(prp_end, (SELECT filter_end FROM DateBoundaries)), month_end, (SELECT filter_end FROM DateBoundaries))::date - 
                GREATEST(prp_start, month_start, (SELECT filter_start FROM DateBoundaries), COALESCE(joining_date, '1970-01-01'::date))::date
            ) + 1) * 
            (allocation_percentage / 100.0)
        ) as total_employee_cost
    FROM MonthlyAllocations
    GROUP BY project_id, employee_id, name
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
ProjectFinancials AS (
    SELECT 
        pb.project_id,
        pb.process_type,
        COALESCE(pst.total_project_staff_cost, 0) as project_cost,
        COALESCE(
            CASE 
                WHEN pb.process_type = 'Fixed Bid' THEN 
                    (pd.active_days::NUMERIC / pd.total_project_days) * pb.quoted_bid_value
                ELSE 
                    (SELECT SUM(total_employee_revenue) FROM TM_Revenue tr WHERE tr.project_id = pb.project_id)
            END, 
            0
        ) as project_revenue
    FROM ProjectBase pb
    LEFT JOIN ProjectDays pd ON pb.project_id = pd.project_id
    LEFT JOIN ProjectStaffTotals pst ON pb.project_id = pst.project_id
)
SELECT 
    process_type as type,
    COUNT(*) as count,
    SUM(project_revenue) as rev,
    SUM(project_cost) as cost
FROM ProjectFinancials
GROUP BY process_type;
    `;
    const projectAggRes = await db.query(projectAggQuery, globalParams);
    
    let totalRevenue = 0;
    let totalAllocatedCosts = 0;
    const processTypeBreakdownMap = {
      'T&M': { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 },
      'Fixed Bid': { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 },
      'Fixed Value': { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 }
    };

    projectAggRes.rows.forEach(row => {
        const type = row.type || 'T&M';
        const rev = Number(row.rev) || 0;
        const cost = Number(row.cost) || 0;
        
        totalRevenue += rev;
        totalAllocatedCosts += cost;
        
        if (!processTypeBreakdownMap[type]) {
            processTypeBreakdownMap[type] = { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 };
        }
        processTypeBreakdownMap[type].count += Number(row.count);
        processTypeBreakdownMap[type].rev += rev;
        processTypeBreakdownMap[type].cost += cost;
        processTypeBreakdownMap[type].margin = rev - cost;
    });

    const processTypeBreakdown = Object.keys(processTypeBreakdownMap).map(type => ({
        type,
        ...processTypeBreakdownMap[type]
    }));

    const totalBenchCost = totalPayrollCost - totalAllocatedCosts;

    // 4. Employee Specific Leaderboard (Weighted Attribution)
    const employeeAggQuery = `
WITH DateBoundaries AS (
    SELECT 
        COALESCE($2::date, '2026-01-01'::date) as filter_start,
        COALESCE($3::date, CURRENT_DATE)::date as filter_end
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
        e.name,
        e.role,
        e.monthly_salary,
        SUM(
            (e.monthly_salary::NUMERIC / EXTRACT(DAY FROM (m.month_start + interval '1 month - 1 day'))) * 
            GREATEST(0, (
                LEAST((SELECT filter_end FROM DateBoundaries), (m.month_start + interval '1 month - 1 day')::date)::date - 
                GREATEST((SELECT filter_start FROM DateBoundaries), m.month_start, COALESCE(e.joining_date, '1970-01-01'::date))::date
            ) + 1)
        ) as total_payroll_cost
    FROM employees e
    CROSS JOIN Months m
    WHERE e.organization_id = $1
    GROUP BY e.id, e.name, e.role, e.monthly_salary
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
    etp.id, etp.name, etp.role, etp.monthly_salary,
    etp.total_payroll_cost as "totalCost",
    COALESCE(era.attributed_revenue, 0) as "revenueGenerated"
FROM EmpTotalPayroll etp
LEFT JOIN EmployeeRevenueAttribution era ON etp.id = era.employee_id
WHERE etp.total_payroll_cost > 0 OR era.attributed_revenue > 0
ORDER BY "totalCost" DESC;
    `;

    const empRes = await db.query(employeeAggQuery, globalParams);
    const employeeCostList = empRes.rows.map(r => ({
        id: r.id,
        name: r.name,
        role: r.role,
        monthlySalary: Number(r.monthly_salary),
        totalCost: Number(r.totalCost),
        revenueGenerated: Number(r.revenueGenerated),
        byType: {}
    }));

    res.json({
      startDate: globalStartStr,
      endDate: globalEndStr,
      totalRevenue: Math.round(totalRevenue),
      totalProjectCosts: Math.round(totalPayrollCost), 
      totalAllocatedCosts: Math.round(totalAllocatedCosts),
      totalBenchCost: Math.round(totalBenchCost),
      totalCompanyExpenses: Math.round(totalCompanyExpenses),
      processTypeBreakdown,
      employeeCostList
    });

  } catch (err) {
    console.error("Dashboard SQL Refactor Error:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/analytics', async (req, res) => {
    try {
    console.log("DEBUG: Executing Dashboard Financial Query at", new Date().toISOString());
    const { startDate, endDate } = req.query;
    let monthsFilter = `date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'`;
    let monthsEnd = `date_trunc('month', CURRENT_DATE)`;
    let expensesFilter = `date >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'`;

    if (startDate && endDate) {
        monthsFilter = `'${startDate}'::date`;
        monthsEnd = `'${endDate}'::date`;
        expensesFilter = `date >= '${startDate}'::date AND date <= '${endDate}'::date`;
    }

    const trendQuery = `
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', ${monthsFilter})::date,
          date_trunc('month', ${monthsEnd})::date,
          '1 month'::interval
        )::date as month
      ),
      tm_revenue AS (
        SELECT 
          date_trunc('month', t.date)::date as month,
          SUM(t.hours_worked * COALESCE(prp.usd_rate, e.usd_hourly_rate) * ta.usd_to_inr_rate) as revenue
        FROM timesheet_logs t
        JOIN projects p ON t.project_id = p.id
        JOIN employees e ON t.employee_id = e.id
        JOIN timesheet_approvals ta ON t.approval_id = ta.id
        LEFT JOIN project_resource_plans prp ON t.project_id = prp.project_id AND t.employee_id = prp.employee_id
        WHERE (p.billing_type != 'Fixed Bid' AND p.type::text != 'Fixed Bid') 
          AND t.organization_id = $1
        GROUP BY 1
      ),
      fb_revenue AS (
        SELECT 
          m.month,
          SUM(
            GREATEST(0, (LEAST(COALESCE(p.deadline, CURRENT_DATE), (m.month + interval '1 month - 1 day')::date)::date - GREATEST(p.start_date, m.month)::date) + 1)::NUMERIC / 
            GREATEST(1, (COALESCE(p.deadline, CURRENT_DATE)::date - p.start_date::date) + 1) * 
            COALESCE(p.quoted_bid_value, 0)
          ) as revenue
        FROM projects p
        CROSS JOIN months m
        WHERE (p.billing_type = 'Fixed Bid' OR p.type::text = 'Fixed Bid')
          AND p.organization_id = $1
          AND m.month >= date_trunc('month', p.start_date)
          AND m.month <= date_trunc('month', COALESCE(p.deadline, CURRENT_DATE))
        GROUP BY 1
      ),
      combined_revenue AS (
        SELECT 
          m.month,
          COALESCE(tm.revenue, 0) + COALESCE(fb.revenue, 0) as total_revenue
        FROM months m
        LEFT JOIN tm_revenue tm ON tm.month = m.month
        LEFT JOIN fb_revenue fb ON fb.month = m.month
      ),
      monthly_expenses AS (
        SELECT 
          date_trunc('month', date)::date as month,
          SUM(amount) as total_expenses
        FROM company_expenses
        WHERE ${expensesFilter}
          AND organization_id = $1
        GROUP BY 1
      )
      SELECT
        TO_CHAR(months.month, 'Mon') as name,
        ROUND(COALESCE(r.total_revenue, 0)) as revenue,
        ROUND(COALESCE(e.total_expenses, 0)) as expenses
      FROM months
      LEFT JOIN combined_revenue r ON r.month = months.month
      LEFT JOIN monthly_expenses e ON e.month = months.month
      ORDER BY months.month ASC;
    `;
    const trendResult = await db.query(trendQuery, [req.user.organizationId]);

    const breakdownQuery = `
    SELECT
    category as name,
      SUM(amount) as value
      FROM company_expenses
      WHERE ${expensesFilter}
      AND organization_id = $1
      GROUP BY category
      ORDER BY value DESC
      `;
    const breakdownResult = await db.query(breakdownQuery, [req.user.organizationId]);

    let expensesChartData = breakdownResult.rows.map(row => ({
      name: row.name,
      value: parseFloat(row.value)
    }));

    if (expensesChartData.length > 5) {
      const top4 = expensesChartData.slice(0, 4);
      const othersValue = expensesChartData.slice(4).reduce((sum, item) => sum + item.value, 0);
      expensesChartData = [...top4, { name: 'Others', value: othersValue }];
    }

    res.json({
      trend: trendResult.rows.map(row => ({
        name: row.name,
        revenue: parseFloat(row.revenue),
        expenses: parseFloat(row.expenses)
      })),
      expenses: expensesChartData
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
