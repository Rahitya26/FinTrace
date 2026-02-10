const express = require('express');
const router = express.Router();
const db = require('../db');

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
    // 1. Total Revenue & Project Costs
    const projectsQuery = `
          SELECT 
            SUM(revenue_earned) as total_revenue,
            SUM(employee_costs) as total_project_costs
          FROM projects
          ${projectsWhere}
        `;
    const projectsResult = await db.query(projectsQuery, queryParams);
    const { total_revenue, total_project_costs } = projectsResult.rows[0] || {}; // Handle empty result

    // 2. Total Company Expenses
    const expensesQuery = `SELECT SUM(amount) as total_expenses FROM company_expenses ${expensesWhere}`;
    const expensesResult = await db.query(expensesQuery, queryParams);
    const { total_expenses } = expensesResult.rows[0] || {};

    // 3. Breakdown by Process Type
    const breakdownQuery = `
          SELECT 
            type, 
            COUNT(*) as count, 
            SUM(revenue_earned) - SUM(employee_costs) as margin
          FROM projects
          ${projectsWhere}
          GROUP BY type
        `;
    const breakdownResult = await db.query(breakdownQuery, queryParams);

    res.json({
      totalRevenue: parseFloat(total_revenue || 0),
      totalProjectCosts: parseFloat(total_project_costs || 0),
      totalCompanyExpenses: parseFloat(total_expenses || 0),
      processTypeBreakdown: breakdownResult.rows.map(row => ({
        type: row.type,
        count: parseInt(row.count),
        margin: parseFloat(row.margin || 0)
      }))
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
      )
      SELECT 
        TO_CHAR(months.month, 'Mon') as name,
        COALESCE(SUM(p.revenue_earned), 0) as revenue,
        COALESCE(SUM(ce.amount), 0) as expenses
      FROM months
      LEFT JOIN projects p ON date_trunc('month', p.start_date) = months.month
      LEFT JOIN company_expenses ce ON date_trunc('month', ce.date) = months.month
      GROUP BY months.month
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
    `;
    const breakdownResult = await db.query(breakdownQuery);

    res.json({
      trend: trendResult.rows.map(row => ({
        name: row.name,
        revenue: parseFloat(row.revenue),
        expenses: parseFloat(row.expenses)
      })),
      expenses: breakdownResult.rows.map(row => ({
        name: row.name,
        value: parseFloat(row.value)
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
