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

module.exports = router;
