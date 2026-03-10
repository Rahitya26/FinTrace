const express = require('express');
const router = express.Router();
const db = require('../db');
const { calculateProjectFinancials } = require('../utils/projectCalculation');

// GET /api/dashboard/summary
router.get('/summary', async (req, res) => {
  const { startDate, endDate } = req.query;

  // Build WHERE clauses
  let projectsWhere = '';
  let expensesWhere = '';
  const queryParams = [];

  if (startDate && endDate) {
    projectsWhere = 'WHERE start_date <= $2 AND (deadline >= $1 OR deadline IS NULL)';
    expensesWhere = 'WHERE date >= $1 AND date <= $2';
    queryParams.push(startDate, endDate);
  }

  try {
    // Fetch all applicable projects
    const projectsQuery = `SELECT * FROM projects ${projectsWhere}`;
    const projectsResult = await db.query(projectsQuery, queryParams);

    // Fetch related resource plans including employee specifics
    const plansQuery = `
        SELECT prp.*, e.monthly_salary, e.hourly_rate, e.name 
        FROM project_resource_plans prp
        JOIN employees e ON prp.employee_id = e.id
    `;
    const plansResult = await db.query(plansQuery);

    // 3. Fetch Unapproved Timesheet Logs for T&M Projections
    const unapprovedLogsQuery = `
        SELECT t.project_id, t.employee_id, t.hours_worked, e.usd_hourly_rate, e.hourly_rate as inr_hourly_rate
        FROM timesheet_logs t
        JOIN employees e ON t.employee_id = e.id
        WHERE t.approval_id IS NULL
    `;
    const unapprovedLogsResult = await db.query(unapprovedLogsQuery);
    const unapprovedLogs = unapprovedLogsResult.rows;

    // 4. Fetch Approved Timesheet Aggregates for Dashboard
    const approvedLogsQuery = `
        SELECT 
            t.project_id, 
            t.employee_id, 
            SUM(t.hours_worked) as total_hours,
            SUM(t.hours_worked * e.hourly_rate) as total_inr_cost,
            SUM(t.hours_worked * e.usd_hourly_rate * ta.usd_to_inr_rate) as total_inr_revenue
        FROM timesheet_logs t
        JOIN employees e ON t.employee_id = e.id
        JOIN timesheet_approvals ta ON t.approval_id = ta.id
        GROUP BY t.project_id, t.employee_id
    `;
    const approvedLogsResult = await db.query(approvedLogsQuery);
    const approvedLogs = approvedLogsResult.rows;

    let totalRevenue = 0;
    let totalProjectCosts = 0;
    const processTypeBreakdownMap = {
      'T&M': { rev: 0, cost: 0, margin: 0, count: 0 },
      'Fixed Bid': { rev: 0, cost: 0, margin: 0, count: 0 },
      'Fixed Value': { rev: 0, cost: 0, margin: 0, count: 0 }
    };

    const employeeCostMap = {};

    projectsResult.rows.forEach(project => {
      const calculated = calculateProjectFinancials(project, plansResult.rows, unapprovedLogs, approvedLogs);
      const rev = Number(calculated.revenue_earned) || 0;
      const cost = Number(calculated.employee_costs) || 0;
      const margin = rev - cost;

      totalRevenue += rev;
      totalProjectCosts += cost;

      const type = project.type || 'Fixed Bid';
      if (!processTypeBreakdownMap[type]) {
        processTypeBreakdownMap[type] = { rev: 0, cost: 0, margin: 0, count: 0 };
      }
      processTypeBreakdownMap[type].count += 1;
      processTypeBreakdownMap[type].rev += rev;
      processTypeBreakdownMap[type].cost += cost;
      processTypeBreakdownMap[type].margin += margin;

      // Track individual employee costs from enhanced plans (Calculated monthly burn or approved cost)
      if (calculated.debug_info?.plans) {
        calculated.debug_info.plans.forEach(plan => {
          if (!employeeCostMap[plan.employee_id]) {
            employeeCostMap[plan.employee_id] = { id: plan.employee_id, name: plan.name, role: plan.role, totalCost: 0 };
          }
          employeeCostMap[plan.employee_id].totalCost += plan.totalPlanCost || 0;
        });
      }
    });

    const processTypeBreakdown = Object.keys(processTypeBreakdownMap).map(type => ({
      type,
      ...processTypeBreakdownMap[type]
    }));

    const employeeCostList = Object.values(employeeCostMap).sort((a, b) => b.totalCost - a.totalCost);

    // 2. Total Company Expenses
    const expensesQuery = `SELECT SUM(amount) as total_expenses FROM company_expenses ${expensesWhere}`;
    const expensesResult = await db.query(expensesQuery, queryParams);
    const { total_expenses } = expensesResult.rows[0] || {};

    res.json({
      totalRevenue: parseFloat(totalRevenue || 0),
      totalProjectCosts: parseFloat(totalProjectCosts || 0),
      totalCompanyExpenses: parseFloat(total_expenses || 0),
      processTypeBreakdown,
      employeeCostList
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dashboard/analytics
router.get('/analytics', async (req, res) => {
  try {
    // 1. Monthly Trends (Last 6 Months)
    // We'll generate a series of months and LEFT JOIN with our data to ensure all months are present
    const trendQuery = `
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
          date_trunc('month', CURRENT_DATE),
          '1 month'::interval
        ) as month
      ),
      monthly_revenue AS (
        SELECT 
          months.month,
          SUM(
            p.revenue_earned / 
            GREATEST(1, EXTRACT(year from age(COALESCE(p.deadline, CURRENT_DATE), p.start_date)) * 12 + EXTRACT(month from age(COALESCE(p.deadline, CURRENT_DATE), p.start_date)) + 1)
          ) as total_revenue
        FROM projects p
        JOIN months ON months.month >= date_trunc('month', p.start_date) 
                   AND months.month <= date_trunc('month', COALESCE(p.deadline, CURRENT_DATE))
        GROUP BY 1
      ),
      monthly_expenses AS (
        SELECT 
          date_trunc('month', date) as month, 
          SUM(amount) as total_expenses
        FROM company_expenses
        WHERE date >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
        GROUP BY 1
      )
      SELECT 
        TO_CHAR(months.month, 'Mon') as name,
        COALESCE(r.total_revenue, 0) as revenue,
        COALESCE(e.total_expenses, 0) as expenses
      FROM months
      LEFT JOIN monthly_revenue r ON r.month = months.month
      LEFT JOIN monthly_expenses e ON e.month = months.month
      ORDER BY months.month ASC;
    `;
    const trendResult = await db.query(trendQuery);

    // 2. Expense Breakdown (Last 6 Months)
    const breakdownQuery = `
      SELECT 
        category as name,
        SUM(amount) as value
      FROM company_expenses
      WHERE date >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
      GROUP BY category
      ORDER BY value DESC
    `;
    const breakdownResult = await db.query(breakdownQuery);

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
