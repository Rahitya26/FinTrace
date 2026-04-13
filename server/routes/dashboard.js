const express = require('express');
const router = express.Router();
const db = require('../db');
const { calculateProjectFinancials } = require('../utils/projectCalculation');
const { getActiveMonthsForEmployee, toLocalDate, getMonthsInPeriod, getValidMonthsForEmployee } = require('../utils/financialUtils');

// GET /api/dashboard/summary
router.get('/summary', async (req, res) => {
  const { startDate, endDate } = req.query;

  // Build WHERE clauses
  let projectsWhere = '';
  let expensesWhere = '';
  const queryParams = [];

  if (startDate && endDate) {
    const start = `${startDate}T00:00:00`;
    const end = `${endDate}T23:59:59`;
    projectsWhere = 'WHERE start_date <= $2 AND (deadline >= $1 OR deadline IS NULL)';
    expensesWhere = 'WHERE date >= $1 AND date <= $2';
    queryParams.push(start, end);
  }

  try {
    // 1. Fetch all applicable projects
    const projectsQuery = `SELECT * FROM projects ${projectsWhere}`;
    const projectsResult = await db.query(projectsQuery, queryParams);
    const projects = projectsResult.rows;

    // 2. Fetch all employees to initialize the map (historical cost tracking requires inactive employees to be tallied)
    const allActiveEmployees = await db.query("SELECT id, name, role, joining_date, monthly_salary FROM employees");
    const employeeCostMap = {};
    allActiveEmployees.rows.forEach(emp => {
      employeeCostMap[emp.id] = {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        totalCost: 0,
        revenueGenerated: 0,
        byType: {},
        monthlySalary: Math.round(Number(emp.monthly_salary) || 0)
      };
    });

    // 3. Fetch all resource plans for these employees
    const plansQuery = `
        SELECT prp.*, e.monthly_salary, e.hourly_rate, e.name, e.role 
        FROM project_resource_plans prp
        JOIN employees e ON prp.employee_id = e.id
    `;
    const plansResult = await db.query(plansQuery);
    const allPlans = plansResult.rows;

    // 4. Fetch Timesheet Logs (Approved and Unapproved)
    let logsWhere = '';
    const logsParams = [];
    if (startDate && endDate) {
        logsWhere = 'WHERE t.date >= $1 AND t.date <= $2';
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
        GROUP BY t.project_id, t.employee_id
    `;
    const historyResult = await db.query(historicalTotalQuery);
    const historyLogs = historyResult.rows;

    // 5. Aggregate Financials
    let totalRevenue = 0;
    let totalProjectCosts = 0;
    const processTypeBreakdownMap = {
      'T&M': { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 },
      'Fixed Bid': { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 },
      'Fixed Value': { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 }
    };

    const employeeAllocationMap = {}; // To track total allocation per employee

    projects.forEach(project => {
      const calculated = calculateProjectFinancials(project, allPlans, unapprovedLogs, approvedLogs, historyLogs, startDate, endDate);
      
      const rev = Number(calculated.revenue_earned) || 0;
      
      totalRevenue += rev;

      const type = project.billing_type || project.type || 'T&M';
      if (!processTypeBreakdownMap[type]) {
        processTypeBreakdownMap[type] = { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 };
      }
      processTypeBreakdownMap[type].count += 1;
      processTypeBreakdownMap[type].rev += rev;
      // Note: processTypeBreakdownMap[type].cost will be calculated pro-rata later
      processTypeBreakdownMap[type].projectedRev += (Number(calculated.projectedRevenue) || 0);

      if (calculated.debug_info?.plans) {
        calculated.debug_info.plans.forEach(plan => {
          if (employeeCostMap[plan.employee_id]) {
            employeeCostMap[plan.employee_id].totalCost += plan.totalPlanCost || 0;
            employeeCostMap[plan.employee_id].revenueGenerated += plan.totalPlanRevenue || 0;
            employeeCostMap[plan.employee_id].asset_status = plan.asset_status;
            employeeCostMap[plan.employee_id].status_color = plan.status_color;
            
            // Track allocation for bench calculation
            employeeAllocationMap[plan.employee_id] = (employeeAllocationMap[plan.employee_id] || 0) + (Number(plan.allocation_percentage) || 0);
          }
        });
      }
    });

    // 6. Calculate Total Payroll & Pro-Rata Staff Costs
    let totalPayrollCost = 0;

    // Group hours by employee and billing type
    const employeeHoursMap = {};
    allActiveEmployees.rows.forEach(emp => {
        employeeHoursMap[emp.id] = { totalHours: 0, byType: {} };
    });

    approvedLogs.forEach(agg => {
        if (agg.billing_type !== 'Fixed Bid' && employeeHoursMap[agg.employee_id]) {
            const hrs = Number(agg.total_hours) || 0;
            const bType = agg.billing_type || 'T&M';
            employeeHoursMap[agg.employee_id].totalHours += hrs;
            if (!employeeHoursMap[agg.employee_id].byType[bType]) {
                employeeHoursMap[agg.employee_id].byType[bType] = 0;
            }
            employeeHoursMap[agg.employee_id].byType[bType] += hrs;
        }
    });

    allActiveEmployees.rows.forEach(emp => {
        const salary = Number(emp.monthly_salary) || 0;
        const validMonthsMultiplier = getValidMonthsForEmployee(emp.joining_date, startDate, endDate);
        const periodSalary = salary * validMonthsMultiplier;
        totalPayrollCost += periodSalary;

        const hourlyInternalRate = salary / 160;

        // 1. Assign Costs Based on Flat Allocations (Universal for T&M and Fixed Bid)
        const empPlans = allPlans.filter(p => Number(p.employee_id) === Number(emp.id));
        empPlans.forEach(plan => {
            const project = projects.find(prj => prj.id === plan.project_id);
            if (!project) return;
            const bType = project.billing_type || 'T&M';

            const alloc = Number(plan.allocation_percentage) || 100;
            const fraction = alloc / 100;

            const planStart = plan.start_date ? new Date(plan.start_date) : new Date(startDate || new Date().getFullYear(), 0, 1);
            let planEnd = plan.end_date ? new Date(plan.end_date) : new Date(endDate || new Date());
            
            // Allow overdue plans to accrue cost right up to today/UI limits
            const today = new Date();
            if (project.status === 'Active' && planEnd < today) {
                planEnd = today;
            }

            let uiStart = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
            let uiEnd = endDate ? new Date(endDate) : new Date();

            let jDate = new Date(emp.joining_date || '2026-02-01');
            uiStart = uiStart < jDate ? jDate : uiStart;

            let overlapStart = planStart > uiStart ? planStart : uiStart;
            let overlapEnd = planEnd < uiEnd ? planEnd : uiEnd;

            let activePlanFraction = 0;
            if (overlapEnd >= overlapStart) {
                const diffTime = Math.abs(overlapEnd - overlapStart);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                activePlanFraction = diffDays / 30;
            }

            const allocatedCost = fraction * salary * activePlanFraction;
            
            if (allocatedCost > 0) {
                totalProjectCosts += allocatedCost;
                if (!processTypeBreakdownMap[bType]) {
                    processTypeBreakdownMap[bType] = { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 };
                }
                processTypeBreakdownMap[bType].cost += allocatedCost;

                if (!employeeCostMap[emp.id]) employeeCostMap[emp.id] = { id: emp.id, name: emp.name, totalCost: 0, byType: {}, benchCost: 0, role: emp.role };
                
                employeeCostMap[emp.id].totalCost += allocatedCost;
                if (!employeeCostMap[emp.id].byType[bType]) employeeCostMap[emp.id].byType[bType] = 0;
                employeeCostMap[emp.id].byType[bType] += allocatedCost;
            }
        });
    });

    // Update margin for each process type after pro-rata cost calculation
    Object.keys(processTypeBreakdownMap).forEach(type => {
        const t = processTypeBreakdownMap[type];
        t.margin = t.rev - t.cost;
    });

    const processTypeBreakdown = Object.keys(processTypeBreakdownMap).map(type => ({
      type,
      ...processTypeBreakdownMap[type]
    }));

    const employeeCostList = Object.values(employeeCostMap).sort((a, b) => b.totalCost - a.totalCost);

    // 7. Bench Cost is now simply the unallocated portion of the payroll
    const totalBenchCost = Math.max(0, totalPayrollCost - totalProjectCosts);

    // 8. Company Expenses
    const expensesResult = await db.query(`SELECT SUM(amount) as total_expenses FROM company_expenses ${expensesWhere}`, queryParams);
    const totalExpensesValue = Number(expensesResult.rows[0]?.total_expenses) || 0;

    const finalStaffCost = totalPayrollCost;

    res.json({
      startDate: startDate || null,
      endDate: endDate || null,
      totalRevenue: Math.round(totalRevenue),
      totalProjectCosts: Math.round(finalStaffCost),
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

// GET /api/dashboard/analytics
router.get('/analytics', async (req, res) => {
  try {
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
            CASE 
              WHEN p.billing_type = 'Fixed Bid' THEN p.fixed_contract_value
              ELSE p.revenue_earned 
            END / 
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
        ROUND(COALESCE(r.total_revenue, 0)) as revenue,
        ROUND(COALESCE(e.total_expenses, 0)) as expenses
      FROM months
      LEFT JOIN monthly_revenue r ON r.month = months.month
      LEFT JOIN monthly_expenses e ON e.month = months.month
      ORDER BY months.month ASC;
    `;
    const trendResult = await db.query(trendQuery);

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
