const express = require('express');
const router = express.Router();
const db = require('@/db');
const { 
  getMonthsInPeriod, 
  getValidMonthsForEmployee, 
  getBusinessHoursInMonth, 
  getActiveMonthsForEmployee, 
  toLocalDate, 
  calculateFixedBidRevenueShare,
  calculateLinearRevenue,
  calculateStaffCost
} = require('@/utils/financialUtils');
const { calculateInclusiveDays, SYSTEM_TODAY } = require('@/utils/dateUtils');

// GET /api/employees/:id/performance
router.get('/:id/performance', async (req, res) => {
    const empId = req.params.id;
    const { startDate, endDate } = req.query;

    try {
        // 1. Get Employee Details
        const empResult = await db.query('SELECT monthly_salary, joining_date FROM employees WHERE id = $1 AND organization_id = $2', [empId, req.user.organizationId]);
        if (empResult.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        const monthlySalary = Number(empResult.rows[0].monthly_salary) || 0;
        let joiningDate = empResult.rows[0].joining_date || '2026-02-01';
        if (joiningDate instanceof Date) {
            joiningDate = joiningDate.toISOString().substring(0, 10);
        }
        const jDate = new Date(joiningDate);
        const baselineCost = monthlySalary;

        // 2. Determine Granularity (Weekly vs Daily vs Monthly)
        const months = [];
        const weeks = [];
        const days = [];
        let start, end;
        let isWeekly = false;
        let isDaily = false;

        if (startDate && endDate) {
            // Force local date boundaries to prevent timezone shifting (Date Leak)
            start = new Date(`${startDate}T00:00:00`);
            end = new Date(`${endDate}T23:59:59`);
            const daysInPeriod = calculateInclusiveDays(start, end);
            
            if (daysInPeriod <= 7) {
                isDaily = true;
                let curr = new Date(start);
                while (curr <= end) {
                    days.push({
                        dateStr: curr.toISOString().split('T')[0],
                        label: curr.getDate() + ' ' + curr.toLocaleString('default', { month: 'short' }),
                        revenue: 0,
                        cost: baselineCost / 30
                    });
                    curr.setDate(curr.getDate() + 1);
                }
            } else if (daysInPeriod <= 60) {
                isWeekly = true;
                let curr = new Date(start);
                let weekNum = 1;
                while (curr <= end) {
                    const weekEnd = new Date(curr);
                    weekEnd.setDate(curr.getDate() + 6);
                    weeks.push({
                        label: `Wk ${weekNum}`,
                        startDate: new Date(curr),
                        endDate: new Date(weekEnd > end ? end : weekEnd),
                        revenue: 0,
                        cost: baselineCost
                    });
                    curr.setDate(curr.getDate() + 7);
                    weekNum++;
                }
            } else {
                let curr = new Date(start.getFullYear(), start.getMonth(), 1);
                while (curr <= new Date(end.getFullYear(), end.getMonth(), 1)) {
                    months.push({
                        month: curr.toLocaleString('default', { month: 'short' }) + ' ' + curr.getFullYear().toString().slice(-2),
                        monthNum: curr.getMonth() + 1,
                        yearNum: curr.getFullYear(),
                        revenue: 0,
                        cost: baselineCost
                    });
                    curr.setMonth(curr.getMonth() + 1);
                }
            }
        } else {
            const dateTracker = new Date();
            for (let i = 5; i >= 0; i--) {
                const d = new Date(dateTracker.getFullYear(), dateTracker.getMonth() - i, 1);
                months.push({
                    month: d.toLocaleString('default', { month: 'short' }) + ' ' + d.getFullYear().toString().slice(-2),
                    monthNum: d.getMonth() + 1,
                    yearNum: d.getFullYear(),
                    revenue: 0,
                    cost: baselineCost
                });
            }
            start = new Date(dateTracker.getFullYear(), dateTracker.getMonth() - 5, 1);
            end = new Date();
        }

        const toLocalDateStr = (date) => {
            const d = new Date(date);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };

        const logsQuery = `
            SELECT 
                t.date,
                p.id as project_id,
                p.billing_type,
                p.fixed_contract_value,
                p.quoted_bid_value,
                p.budgeted_hours,
                p.status as project_status,
                p.start_date,
                p.deadline,
                t.hours_worked,
                COALESCE(prp.usd_rate, e.usd_hourly_rate) * ta.usd_to_inr_rate as tm_rate,
                prp.allocation_percentage,
                (SELECT SUM(allocation_percentage) FROM project_resource_plans WHERE project_id = p.id) as total_project_allocation
            FROM timesheet_logs t
            JOIN projects p ON t.project_id = p.id
            JOIN employees e ON t.employee_id = e.id
            JOIN timesheet_approvals ta ON t.approval_id = ta.id
            LEFT JOIN project_resource_plans prp ON t.project_id = prp.project_id AND t.employee_id = prp.employee_id
            WHERE t.employee_id = $1 
              AND t.date >= $2
              AND t.date <= $3
              AND t.approval_id IS NOT NULL
              AND p.billing_type != 'Fixed Bid'
              AND t.organization_id = $4
        `;
        const logsResult = await db.query(logsQuery, [empId, start, end, req.user.organizationId]);

        const fixedBidQuery = `
            SELECT prp.*, p.billing_type, p.quoted_bid_value, p.status as project_status, p.start_date, p.deadline
            FROM project_resource_plans prp
            JOIN projects p ON prp.project_id = p.id
            WHERE prp.employee_id = $1 AND p.billing_type = 'Fixed Bid' AND prp.organization_id = $2
        `;
        const fixedBidPlansResult = await db.query(fixedBidQuery, [empId, req.user.organizationId]);
        
        const sliceDate = (val) => val instanceof Date ? val.toISOString().substring(0, 10) : val;
        
        const fixedBidPlans = fixedBidPlansResult.rows.map(p => {
            p.start_date = sliceDate(p.start_date);
            p.deadline = sliceDate(p.deadline);
            return p;
        });

        // 4. Calculate Total Revenue
        let totalRevenue = 0;
        
        // Add Fixed Bid Revenue natively based on UI duration bounds
        fixedBidPlans.forEach(plan => {
            totalRevenue += calculateLinearRevenue(
                plan.quoted_bid_value,
                plan.start_date,
                plan.deadline,
                start,
                end,
                joiningDate,
                plan.allocation_percentage,
                empResult.rows[0].name
            );
        });

        // Add T&M Revenue natively from logged timesheets
        logsResult.rows.forEach(log => {
            totalRevenue += Number(log.hours_worked) * (Number(log.tm_rate) || 0);
        });

        const timelineData = isDaily ? days : (isWeekly ? weeks : months);

        const timeline = timelineData.map(item => {
            let revenue = 0;
            let logsForItem = [];
            
            if (isDaily) {
                logsForItem = logsResult.rows.filter(log => toLocalDateStr(log.date) === item.dateStr);
            } else if (isWeekly) {
                logsForItem = logsResult.rows.filter(log => {
                    const d = new Date(log.date);
                    return d >= item.startDate && d <= item.endDate;
                });
            } else {
                logsForItem = logsResult.rows.filter(log => {
                    const d = new Date(log.date);
                    return (d.getMonth() + 1) === item.monthNum && d.getFullYear() === item.yearNum;
                });
            }

            let itemHours = logsForItem.reduce((sum, l) => sum + (Number(l.hours_worked) || 0), 0);

            // Timeline segment costs: use pro-rata only for the VIZ, but the TOTAL will match the dashboard.
            // However, user said: "In each timeline point ... if no hours are logged ... ensure net contribution doesn't go negative".
            let periodMultiplier = 1.0;
            if (isDaily) periodMultiplier = 1/30;
            else if (isWeekly) periodMultiplier = 7/30;

            // Graph Matrix: Calculate Fixed Bid Linear mapping specific to THIS isolated timeline bound
            let linearBoundStart, linearBoundEnd;
            if (isDaily) {
                linearBoundStart = new Date(`${item.dateStr}T00:00:00`);
                linearBoundEnd = new Date(`${item.dateStr}T23:59:59`);
            } else if (isWeekly) {
                linearBoundStart = item.startDate;
                linearBoundEnd = item.endDate;
            } else {
                linearBoundStart = new Date(item.yearNum, item.monthNum - 1, 1);
                linearBoundEnd = new Date(item.yearNum, item.monthNum, 0, 23, 59, 59);
            }

            fixedBidPlans.forEach(plan => {
                revenue += calculateLinearRevenue(
                    plan.quoted_bid_value,
                    plan.start_date,
                    plan.deadline,
                    linearBoundStart,
                    linearBoundEnd,
                    joiningDate,
                    plan.allocation_percentage,
                    empResult.rows[0].name
                );
                
                // Ghost injection for logic parsing
                if (revenue > 0) itemHours += 1;
            });

            // T&M Log processing into graph node
            logsForItem.forEach(log => {
                revenue += Number(log.hours_worked) * (Number(log.tm_rate) || 0);
            });

            // 3. Cost (Single segment cost) - Standardized Pro-rata
            const cost = calculateStaffCost(
                monthlySalary,
                linearBoundStart,
                linearBoundEnd,
                linearBoundStart, // Use local segment bounds as filter
                linearBoundEnd,
                joiningDate,
                empResult.rows[0].name
            );

            let segmentProfit = 0;
            if (itemHours > 0) {
                segmentProfit = revenue - cost;
            } else {
                segmentProfit = 0;
            }

            return {
                month: isDaily ? item.label : (isWeekly ? item.label : item.month),
                revenue: Math.round(revenue),
                cost: Math.round(cost),
                profit: Math.round(segmentProfit)
            };
        });

        // Calculate Global Staff Cost using UI Date Filter (30-day Proration) clamped to joining_date
        const periodStaffCost = calculateStaffCost(
            monthlySalary,
            start,
            end,
            start, // Use global filter bounds
            end,
            joiningDate,
            empResult.rows[0].name
        );
        
        let fbRevenueMatch = 0;
        fixedBidPlans.forEach(plan => {
            fbRevenueMatch += calculateLinearRevenue(
                plan.quoted_bid_value,
                plan.start_date,
                plan.deadline,
                start,
                end,
                joiningDate,
                plan.allocation_percentage,
                empResult.rows[0].name
            );
        });

        // The exact target for Profit Contribution must ONLY use Project FB Share bounds
        const totalProfitContribution = fbRevenueMatch - periodStaffCost;

        res.json({
            timeline,
            totalProfitContribution: Math.round(totalProfitContribution),
            periodStaffCost: Math.round(periodStaffCost),
            currentBusinessHours: 160,
            joiningDate: joiningDate
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
WITH BaseEmployees AS (
    SELECT e.* 
    FROM employees e 
    ${whereClause} 
    ORDER BY e.name ASC 
    LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
),
EmpPayroll AS (
    SELECT id, 
           (monthly_salary / 30.0) * GREATEST(0, (LEAST(COALESCE($${queryParams.length + 4}::date, CURRENT_DATE), CURRENT_DATE) - GREATEST(COALESCE($${queryParams.length + 3}::date, '2026-01-01'::date), COALESCE(joining_date, '1970-01-01'::date))) + 1) as total_cost
    FROM BaseEmployees
),
EmpRevenueTM AS (
    SELECT t.employee_id, SUM(t.hours_worked * COALESCE(prp.usd_rate, e.usd_hourly_rate) * ta.usd_to_inr_rate) as tm_rev
    FROM timesheet_logs t
    JOIN BaseEmployees e ON t.employee_id = e.id
    JOIN timesheet_approvals ta ON t.approval_id = ta.id
    LEFT JOIN project_resource_plans prp ON t.project_id = prp.project_id AND t.employee_id = prp.employee_id
    JOIN projects p ON t.project_id = p.id
    WHERE t.organization_id = $1 
      AND p.billing_type != 'Fixed Bid'
      AND ($${queryParams.length + 3}::date IS NULL OR t.date >= $${queryParams.length + 3}::date)
      AND ($${queryParams.length + 4}::date IS NULL OR t.date <= $${queryParams.length + 4}::date)
    GROUP BY t.employee_id
),
ProjectTotalAllocations AS (
    SELECT project_id, GREATEST(100.0, SUM(allocation_percentage)) as total_alloc
    FROM project_resource_plans
    WHERE organization_id = $1
    GROUP BY project_id
),
EmpRevenueFB AS (
    SELECT 
        prp.employee_id,
        SUM(
            ((GREATEST(0, (LEAST(COALESCE(p.deadline, CURRENT_DATE), COALESCE($${queryParams.length + 4}::date, CURRENT_DATE)) - GREATEST(p.start_date, COALESCE($${queryParams.length + 3}::date, '2026-01-01'::date), COALESCE(e.joining_date, '1970-01-01'::date))) + 1)::NUMERIC) / GREATEST(1, COALESCE(p.deadline, CURRENT_DATE) - p.start_date + 1)) 
            * p.quoted_bid_value 
            * (prp.allocation_percentage / pta.total_alloc)
        ) as fb_rev
    FROM project_resource_plans prp
    JOIN projects p ON prp.project_id = p.id
    JOIN BaseEmployees e ON prp.employee_id = e.id
    JOIN ProjectTotalAllocations pta ON p.id = pta.project_id
    WHERE prp.organization_id = $1 AND p.billing_type = 'Fixed Bid'
    GROUP BY prp.employee_id
)
SELECT 
    b.*,
    COALESCE(ep.total_cost, 0) as expected_cost,
    COALESCE(tm.tm_rev, 0) + COALESCE(fb.fb_rev, 0) as total_revenue
FROM BaseEmployees b
LEFT JOIN EmpPayroll ep ON b.id = ep.id
LEFT JOIN EmpRevenueTM tm ON b.id = tm.employee_id
LEFT JOIN EmpRevenueFB fb ON b.id = fb.employee_id
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
