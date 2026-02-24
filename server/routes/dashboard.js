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
