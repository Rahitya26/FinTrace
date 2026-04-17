const express = require('express');
const router = express.Router();
const db = require('../db');
const { calculateProjectFinancials } = require('../utils/projectCalculation');
const { getActiveMonthsForEmployee, toLocalDate, getMonthsInPeriod, getValidMonthsForEmployee, calculateStaffCost } = require('../utils/financialUtils');

// GET /api/dashboard/summary
router.get('/summary', async (req, res) => {
  const { startDate, endDate } = req.query;

  // Build WHERE clauses
  let projectsWhere = 'WHERE organization_id = $1';
  let expensesWhere = 'WHERE organization_id = $1';
  const queryParams = [req.user.organizationId];

  if (startDate && endDate) {
    const start = `${startDate}T00:00:00`;
    const end = `${endDate}T23:59:59`;
    projectsWhere += ' AND start_date <= $3 AND (deadline >= $2 OR deadline IS NULL)';
    expensesWhere += ' AND date >= $2 AND date <= $3';
    queryParams.push(start, end);
  }

  try {
    // Global sanitization layer: pg driver injects incorrect timezone logic natively!
    const sliceDate = (val) => val instanceof Date ? val.toISOString().substring(0, 10) : val;
    
    // 1. Fetch all applicable projects
    const projectsQuery = `SELECT * FROM projects ${projectsWhere}`;
    const projectsResult = await db.query(projectsQuery, queryParams);
    const projects = projectsResult.rows.map(p => {
        p.start_date = sliceDate(p.start_date);
        p.deadline = sliceDate(p.deadline);
        return p;
    });


    // 3. Fetch all resource plans for these employees
    const plansQuery = `
        SELECT prp.*, e.monthly_salary, e.hourly_rate, e.name, e.role, e.joining_date 
        FROM project_resource_plans prp
        JOIN employees e ON prp.employee_id = e.id
        WHERE prp.organization_id = $1
    `;
    const plansResult = await db.query(plansQuery, [req.user.organizationId]);
    const allPlans = plansResult.rows.map(p => {
        p.joining_date = sliceDate(p.joining_date);
        p.start_date = sliceDate(p.start_date);
        p.end_date = sliceDate(p.end_date);
        return p;
    });

    // 4. Fetch Timesheet Logs (Approved and Unapproved)
    let logsWhere = 'WHERE t.organization_id = $1';
    const logsParams = [req.user.organizationId];
    if (startDate && endDate) {
      logsWhere += ' AND t.date >= $2 AND t.date <= $3';
      logsParams.push(startDate, endDate);
    }

    const unapprovedLogsQuery = `
        SELECT t.project_id, t.employee_id, t.hours_worked, e.usd_hourly_rate, e.hourly_rate as inr_hourly_rate
        FROM timesheet_logs t
        JOIN employees e ON t.employee_id = e.id
        ${logsWhere} AND t.approval_id IS NULL
      `;
    const unapprovedLogsResult = await db.query(unapprovedLogsQuery, logsParams);
    const unapprovedLogs = unapprovedLogsResult.rows;

    // IMPORTANT: Aggregated approved logs for calculateProjectFinancials
    const approvedLogsQuery = `
    SELECT
    t.project_id,
      t.employee_id,
      p.billing_type,
      SUM(t.hours_worked) as total_hours,
      SUM(t.hours_worked * COALESCE(prp.usd_rate, e.usd_hourly_rate) * ta.usd_to_inr_rate) as total_inr_revenue
        FROM timesheet_logs t
        JOIN employees e ON t.employee_id = e.id
        JOIN timesheet_approvals ta ON t.approval_id = ta.id
        JOIN projects p ON t.project_id = p.id
        LEFT JOIN project_resource_plans prp ON t.project_id = prp.project_id AND t.employee_id = prp.employee_id
        ${logsWhere}
        GROUP BY t.project_id, t.employee_id, p.billing_type
      `;
    const approvedLogsResult = await db.query(approvedLogsQuery, logsParams);
    const approvedLogs = approvedLogsResult.rows;

    const historicalTotalQuery = `
        SELECT t.project_id, t.employee_id, SUM(t.hours_worked) as total_hours
        FROM timesheet_logs t
        WHERE t.organization_id = $1
        GROUP BY t.project_id, t.employee_id
      `;
    const historyResult = await db.query(historicalTotalQuery, [req.user.organizationId]);
    const historyLogs = historyResult.rows;

    // 5. Aggregate Financials
    let totalRevenue = 0;
    let totalProjectCosts = 0;
    const processTypeBreakdownMap = {
      'T&M': { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 },
      'Fixed Bid': { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 },
      'Fixed Value': { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 }
    };

    // 2. Fetch all employees to initialize the map
    const allActiveEmployees = await db.query("SELECT id, name, role, joining_date, monthly_salary FROM employees WHERE organization_id = $1", [req.user.organizationId]);

    // User requested explicit YTD floor bound
    const MIN_START_DATE = new Date('2026-01-01T00:00:00Z');
    
    // Explicitly compute the effective start date based on frontend filters, heavily clamped to 2026-01-01
    let globalStartStr = startDate || '2026-01-01';
    
    // Safety check: ensure string never goes before 2026
    if (new Date(globalStartStr) < MIN_START_DATE) {
        globalStartStr = '2026-01-01';
    }

    // Initialize Employee Map with FULL Period Salary (Company View)
    const employeeCostMap = {};
    allActiveEmployees.rows.forEach(emp => {
        // Enforce Math.max boundary on joining_date to guarantee no December leaks
        let safeJoiningDate = emp.joining_date;
        if (safeJoiningDate) {
            // Fix PG UTC bleeding (e.g. 18:30Z turning into next day in IST) by strictly using the literal ISO prefix.
            if (safeJoiningDate instanceof Date) {
                safeJoiningDate = safeJoiningDate.toISOString().substring(0, 10);
            }
            if (new Date(safeJoiningDate) < MIN_START_DATE) {
                safeJoiningDate = '2026-01-01';
            }
        }

        const periodSalary = calculateStaffCost(
            emp.monthly_salary,
            globalStartStr,
            endDate || null,
            globalStartStr, // Intersection Filter Start
            endDate || null,   // Intersection Filter End
            safeJoiningDate,
            emp.name
        );
        employeeCostMap[emp.id] = {
            id: emp.id,
            name: emp.name,
            role: emp.role,
            totalCost: periodSalary, // Full period salary paid by company
            revenueGenerated: 0,
            byType: {},
            monthlySalary: Math.round(Number(emp.monthly_salary) || 0)
        };
    });

    // Process Projects to Aggregate Company View
    projects.forEach(project => {
      const calculated = calculateProjectFinancials(project, allPlans, unapprovedLogs, approvedLogs, historyLogs, startDate, endDate);

      const rev = Number(calculated.revenue_earned) || 0;
      const cost = Number(calculated.employee_costs) || 0;

      totalRevenue += rev;
      totalProjectCosts += cost;

      const type = project.billing_type || project.type || 'T&M';
      if (!processTypeBreakdownMap[type]) {
        processTypeBreakdownMap[type] = { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 };
      }
      processTypeBreakdownMap[type].count += 1;
      processTypeBreakdownMap[type].rev += rev;
      processTypeBreakdownMap[type].cost += cost;
      processTypeBreakdownMap[type].projectedRev += (Number(calculated.projectedRevenue) || 0);

      // Attribute Revenue to Employees
      if (calculated.debug_info?.plans) {
        calculated.debug_info.plans.forEach(plan => {
          if (employeeCostMap[plan.employee_id]) {
            employeeCostMap[plan.employee_id].revenueGenerated += plan.totalPlanRevenue || 0;
            
            if (!employeeCostMap[plan.employee_id].byType[type]) {
                employeeCostMap[plan.employee_id].byType[type] = 0;
            }
            // Optional: track project-specific allocation cost if UI needs it
          }
        });
      }
    });

    // Final calculations
    Object.keys(processTypeBreakdownMap).forEach(type => {
      const t = processTypeBreakdownMap[type];
      t.margin = t.rev - t.cost;
    });

    const processTypeBreakdown = Object.keys(processTypeBreakdownMap).map(type => ({
      type,
      ...processTypeBreakdownMap[type]
    }));

    const employeeCostList = Object.values(employeeCostMap)
        .filter(emp => emp.totalCost > 0 || emp.revenueGenerated > 0)
        .sort((a, b) => b.totalCost - a.totalCost);

    // Total Payroll (Sum of all individual totalCosts)
    const totalPayrollCost = Object.values(employeeCostMap).reduce((sum, emp) => sum + emp.totalCost, 0);
    // User dictated: Bench Time strictly equals Total Staff Costs - Total Project Burn
    const totalBenchCost = totalPayrollCost - totalProjectCosts;

    // 8. Company Expenses
    const expensesResult = await db.query(`SELECT SUM(amount) as total_expenses FROM company_expenses ${expensesWhere} `, queryParams);
    const totalExpensesValue = Number(expensesResult.rows[0]?.total_expenses) || 0;

    res.json({
      startDate: startDate || null,
      endDate: endDate || null,
      totalRevenue: Math.round(totalRevenue),
      totalProjectCosts: Math.round(totalPayrollCost), // Total Salary paid for period
      totalAllocatedCosts: Math.round(totalProjectCosts), // Sum of project pro-rata burns
      totalBenchCost: Math.round(totalBenchCost),
      totalCompanyExpenses: Math.round(totalExpensesValue),
      processTypeBreakdown,
      employeeCostList
    });


  } catch (err) {
    console.error(err);
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
