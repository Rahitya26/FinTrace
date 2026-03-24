const db = require('./db');
const { calculateProjectFinancials } = require('./utils/projectCalculation');
const { getActiveMonthsForEmployee, toLocalDate, getMonthsInPeriod } = require('./utils/financialUtils');

async function test() {
    try {
        const { startDate, endDate } = {};
        
        // Build WHERE clauses
        let projectsWhere = '';
        let expensesWhere = '';
        const queryParams = [];

        // 1. Fetch all applicable projects
        const projectsQuery = `SELECT * FROM projects ${projectsWhere}`;
        const projectsResult = await db.query(projectsQuery, queryParams);
        const projects = projectsResult.rows;

        // 2. Fetch all active employees to initialize the map
        const allActiveEmployees = await db.query("SELECT id, name, role, monthly_salary FROM employees WHERE status = 'Active'");
        const employeeCostMap = {};
        allActiveEmployees.rows.forEach(emp => {
          employeeCostMap[emp.id] = {
            id: emp.id,
            name: emp.name,
            role: emp.role,
            totalCost: 0,
            revenueGenerated: 0,
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

        const unapprovedLogsQuery = `
            SELECT t.project_id, t.employee_id, t.hours_worked, e.usd_hourly_rate, e.hourly_rate as inr_hourly_rate
            FROM timesheet_logs t
            JOIN employees e ON t.employee_id = e.id
            WHERE t.approval_id IS NULL
        `;
        const unapprovedLogsResult = await db.query(unapprovedLogsQuery, logsParams);
        const unapprovedLogs = unapprovedLogsResult.rows;

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

        let totalRevenue = 0;
        let totalProjectCosts = 0;
        const processTypeBreakdownMap = {
          'T&M': { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 },
          'Fixed Bid': { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 },
          'Fixed Value': { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 }
        };

        const employeeAllocationMap = {};

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
          processTypeBreakdownMap[type].projectedRev += (Number(calculated.projectedRevenue) || 0);

          if (calculated.debug_info?.plans) {
            calculated.debug_info.plans.forEach(plan => {
              if (employeeCostMap[plan.employee_id]) {
                employeeCostMap[plan.employee_id].totalCost += plan.totalPlanCost || 0;
                employeeCostMap[plan.employee_id].revenueGenerated += plan.totalPlanRevenue || 0;
                employeeCostMap[plan.employee_id].asset_status = plan.asset_status;
                employeeCostMap[plan.employee_id].status_color = plan.status_color;
                employeeAllocationMap[plan.employee_id] = (employeeAllocationMap[plan.employee_id] || 0) + (Number(plan.allocation_percentage) || 0);
              }
            });
          }
        });

        const monthsMultiplier = getMonthsInPeriod(startDate, endDate);
        let totalPayrollCost = 0;

        const employeeHoursMap = {};
        allActiveEmployees.rows.forEach(emp => {
            employeeHoursMap[emp.id] = { totalHours: 0, byType: {} };
        });

        approvedLogs.forEach(agg => {
            if (employeeHoursMap[agg.employee_id]) {
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
            const periodSalary = salary * monthsMultiplier;
            totalPayrollCost += periodSalary;

            const empMap = employeeHoursMap[emp.id];
            if (empMap && empMap.totalHours > 0) {
                for (const bType in empMap.byType) {
                    const ratio = empMap.byType[bType] / empMap.totalHours;
                    const allocatedCost = ratio * periodSalary;
                    
                    if (!processTypeBreakdownMap[bType]) {
                        processTypeBreakdownMap[bType] = { rev: 0, cost: 0, margin: 0, count: 0, projectedRev: 0 };
                    }
                    processTypeBreakdownMap[bType].cost += allocatedCost;
                }
            }
        });

        Object.keys(processTypeBreakdownMap).forEach(type => {
            const t = processTypeBreakdownMap[type];
            t.margin = t.rev - t.cost;
        });

        const processTypeBreakdown = Object.keys(processTypeBreakdownMap).map(type => ({
          type,
          ...processTypeBreakdownMap[type]
        }));

        const employeeCostList = Object.values(employeeCostMap).sort((a, b) => b.totalCost - a.totalCost);

        const totalBenchCost = Math.max(0, totalPayrollCost - totalProjectCosts);
        const finalStaffCost = totalPayrollCost;

        console.log("Success! processTypeBreakdown:", processTypeBreakdown);
    } catch (e) {
        console.error("DEBUG ERROR:", e);
    } finally {
        // process.exit(0);
    }
}
test();
