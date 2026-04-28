const express = require('express');
const router = express.Router();
const db = require('../db');

const { getActiveMonthsForEmployee, toLocalDate, getMonthsInPeriod, getValidMonthsForEmployee, calculateStaffCost } = require('../utils/financialUtils');

// GET /api/dashboard/summary
router.get('/summary', async (req, res) => {
  const { startDate, endDate } = req.query;
  const orgId = req.user.organizationId;
  
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

    // 2. Global Payroll Cost (Bench Baseline)
    const payrollRes = await db.query(`
        SELECT SUM(
            (monthly_salary / 30.0) * 
            GREATEST(0, (LEAST(COALESCE($3::date, CURRENT_DATE), CURRENT_DATE) - GREATEST(COALESCE($2::date, '2026-01-01'::date), COALESCE(joining_date, '1970-01-01'::date))) + 1)
        ) as total_payroll
        FROM employees
        WHERE organization_id = $1
    `, globalParams);
    const totalPayrollCost = Number(payrollRes.rows[0]?.total_payroll) || 0;

    // 3. Project Aggregation (Process Breakdown & Allocated Burns)
    const projectAggQuery = `
WITH ProjectBase AS (
    SELECT id as project_id, COALESCE(billing_type, type::text, 'T&M') as process_type, quoted_bid_value, start_date, deadline 
    FROM projects 
    WHERE organization_id = $1
      AND ($2::date IS NULL OR (deadline >= $2::date OR deadline IS NULL))
      AND ($3::date IS NULL OR start_date <= $3::date)
),
ProjectDays AS (
    SELECT 
        pb.project_id,
        GREATEST(0, (LEAST(COALESCE(pb.deadline, CURRENT_DATE), COALESCE($3::date, CURRENT_DATE)) - GREATEST(pb.start_date, COALESCE($2::date, '2026-01-01'::date))) + 1) as active_days,
        GREATEST(1, COALESCE(pb.deadline, CURRENT_DATE) - pb.start_date + 1) as total_project_days
    FROM ProjectBase pb
),
StaffCosts AS (
    SELECT 
        prp.project_id,
        SUM(
            (e.monthly_salary / 30.0) * 
            GREATEST(0, (LEAST(COALESCE(prp.end_date, CURRENT_DATE), COALESCE($3::date, CURRENT_DATE)) - GREATEST(prp.start_date, COALESCE($2::date, '2026-01-01'::date), COALESCE(e.joining_date, '1970-01-01'::date))) + 1) * 
            (prp.allocation_percentage / 100.0)
        ) as allocated_cost
    FROM project_resource_plans prp
    JOIN employees e ON prp.employee_id = e.id
    WHERE prp.organization_id = $1
    GROUP BY prp.project_id
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
      AND ($2::date IS NULL OR t.date >= $2::date)
      AND ($3::date IS NULL OR t.date <= $3::date)
    GROUP BY t.project_id
),
ProjectFinancials AS (
    SELECT 
        pb.project_id,
        pb.process_type,
        COALESCE(sc.allocated_cost, 0) as project_cost,
        COALESCE(
            CASE 
                WHEN pb.process_type = 'Fixed Bid' THEN 
                    (pd.active_days::NUMERIC / pd.total_project_days) * pb.quoted_bid_value
                ELSE 
                    tm.tm_revenue
            END, 
            0
        ) as project_revenue
    FROM ProjectBase pb
    LEFT JOIN ProjectDays pd ON pb.project_id = pd.project_id
    LEFT JOIN StaffCosts sc ON pb.project_id = sc.project_id
    LEFT JOIN TM_Revenue tm ON pb.project_id = tm.project_id
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

    // 4. Employee Specific Leaderboard
    const employeeAggQuery = `
WITH BaseEmployees AS (
    SELECT id, name, role, monthly_salary, joining_date 
    FROM employees 
    WHERE organization_id = $1
),
EmpPayroll AS (
    SELECT id, 
           (monthly_salary / 30.0) * GREATEST(0, (LEAST(COALESCE($3::date, CURRENT_DATE), CURRENT_DATE) - GREATEST(COALESCE($2::date, '2026-01-01'::date), COALESCE(joining_date, '1970-01-01'::date))) + 1) as total_cost
    FROM BaseEmployees
),
EmpRevenueTM AS (
    SELECT t.employee_id, SUM(t.hours_worked * COALESCE(prp.usd_rate, e.usd_hourly_rate) * ta.usd_to_inr_rate) as tm_rev
    FROM timesheet_logs t
    JOIN employees e ON t.employee_id = e.id
    JOIN timesheet_approvals ta ON t.approval_id = ta.id
    LEFT JOIN project_resource_plans prp ON t.project_id = prp.project_id AND t.employee_id = prp.employee_id
    JOIN projects p ON t.project_id = p.id
    WHERE t.organization_id = $1 
      AND p.billing_type != 'Fixed Bid'
      AND ($2::date IS NULL OR t.date >= $2::date)
      AND ($3::date IS NULL OR t.date <= $3::date)
    GROUP BY t.employee_id
),
EmpRevenueFB AS (
    SELECT 
        prp.employee_id,
        SUM(
            ((GREATEST(0, (LEAST(COALESCE(p.deadline, CURRENT_DATE), COALESCE($3::date, CURRENT_DATE)) - GREATEST(p.start_date, COALESCE($2::date, '2026-01-01'::date), COALESCE(e.joining_date, '1970-01-01'::date))) + 1)::NUMERIC) / GREATEST(1, COALESCE(p.deadline, CURRENT_DATE) - p.start_date + 1)) 
            * p.quoted_bid_value 
            * (prp.allocation_percentage / 100.0)
        ) as fb_rev
    FROM project_resource_plans prp
    JOIN projects p ON prp.project_id = p.id
    JOIN employees e ON prp.employee_id = e.id
    WHERE prp.organization_id = $1 AND p.billing_type = 'Fixed Bid'
    GROUP BY prp.employee_id
)
SELECT 
    b.id, b.name, b.role, b.monthly_salary,
    COALESCE(ep.total_cost, 0) as "totalCost",
    COALESCE(tm.tm_rev, 0) + COALESCE(fb.fb_rev, 0) as "revenueGenerated"
FROM BaseEmployees b
LEFT JOIN EmpPayroll ep ON b.id = ep.id
LEFT JOIN EmpRevenueTM tm ON b.id = tm.employee_id
LEFT JOIN EmpRevenueFB fb ON b.id = fb.employee_id
WHERE COALESCE(ep.total_cost, 0) > 0 OR (COALESCE(tm.tm_rev, 0) + COALESCE(fb.fb_rev, 0)) > 0
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
          date_trunc('month', ${monthsFilter}),
          date_trunc('month', ${monthsEnd}),
          '1 month'::interval
        ) as month
      ),
      tm_revenue AS (
        SELECT 
          date_trunc('month', t.date) as month,
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
          SUM(COALESCE(p.quoted_bid_value, p.fixed_contract_value, 0) / GREATEST(1, (EXTRACT(year FROM age(COALESCE(p.deadline, CURRENT_DATE), p.start_date)) * 12 + EXTRACT(month FROM age(COALESCE(p.deadline, CURRENT_DATE), p.start_date)) + 1))) as revenue
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
          date_trunc('month', date) as month,
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
