const express = require('express');
const router = express.Router();
const db = require('../db');
const { getActiveMonthsForEmployee, toLocalDate, calculateFixedBidRevenueShare, getBusinessHoursInMonth } = require('../utils/financialUtils');

// GET /api/employees/:id/performance
router.get('/:id/performance', async (req, res) => {
    const empId = req.params.id;
    const { startDate, endDate } = req.query;

    try {
        // 1. Get Employee Details
        const empResult = await db.query('SELECT monthly_salary, joining_date FROM employees WHERE id = $1', [empId]);
        if (empResult.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        const monthlySalary = Number(empResult.rows[0].monthly_salary) || 0;
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
            const daysInPeriod = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
            
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
        `;
        const logsResult = await db.query(logsQuery, [empId, start, end]);

        const fixedBidQuery = `
            SELECT prp.*, p.billing_type, p.quoted_bid_value, p.status as project_status, p.start_date, p.deadline
            FROM project_resource_plans prp
            JOIN projects p ON prp.project_id = p.id
            WHERE prp.employee_id = $1 AND p.billing_type = 'Fixed Bid'
        `;
        const fixedBidPlansResult = await db.query(fixedBidQuery, [empId]);
        const fixedBidPlans = fixedBidPlansResult.rows;

        // 4. Calculate Total Revenue
        let totalRevenue = 0;
        
        // Add Fixed Bid Revenue natively based on UI duration bounds
        fixedBidPlans.forEach(plan => {
            const planStart = new Date(plan.start_date || new Date());
            const planEnd = new Date(plan.deadline || new Date());
            const totalDurationMonths = Math.max(1, (planEnd.getFullYear() - planStart.getFullYear()) * 12 + (planEnd.getMonth() - planStart.getMonth()) + 1);
            const monthlyRevenue = Number(plan.quoted_bid_value || 0) / totalDurationMonths;

            const uiStart = start;
            const uiEnd = end;

            const overlapStart = planStart > uiStart ? planStart : uiStart;
            const overlapEnd = planEnd < uiEnd ? planEnd : uiEnd;

            let applicableMonths = 0;
            if (overlapEnd >= overlapStart) {
                const diffTime = Math.abs(overlapEnd - overlapStart);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                applicableMonths = diffDays / 30;
            }
            const fraction = Number(plan.allocation_percentage || 100) / 100;
            totalRevenue += (monthlyRevenue * applicableMonths) * fraction;
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
                const planStart = new Date(plan.start_date || new Date());
                const planEnd = new Date(plan.deadline || new Date());

                const overlapStart = planStart > linearBoundStart ? planStart : linearBoundStart;
                const overlapEnd = planEnd < linearBoundEnd ? planEnd : linearBoundEnd;

                if (overlapEnd >= overlapStart) {
                    const totalDurationMonths = Math.max(1, (planEnd.getFullYear() - planStart.getFullYear()) * 12 + (planEnd.getMonth() - planStart.getMonth()) + 1);
                    const monthlyRevenue = Number(plan.quoted_bid_value || 0) / totalDurationMonths;
                    
                    const fraction = Number(plan.allocation_percentage || 100) / 100;
                    
                    // Specific calendar mathematical extraction (30 days division standard)
                    const diffTime = Math.abs(overlapEnd - overlapStart);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                    const monthFractionInNode = diffDays / 30;

                    revenue += (monthlyRevenue * monthFractionInNode) * fraction;
                    itemHours += 1; // Ghost injection for logic parsing
                }
            });

            // T&M Log processing into graph node
            logsForItem.forEach(log => {
                revenue += Number(log.hours_worked) * (Number(log.tm_rate) || 0);
            });

            // 3. Cost (Single segment cost)
            const cost = monthlySalary * periodMultiplier;

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
        const jDate = new Date(empResult.rows[0].joining_date || '2026-02-01');
        let actualStart = new Date(start);
        const actualEnd = new Date(end);
        
        if (actualStart < jDate) {
            actualStart = jDate;
        }
        
        let daysActive = 0;
        if (actualEnd >= actualStart) {
            const differenceMs = (actualEnd.getTime() - actualStart.getTime());
            daysActive = differenceMs / (1000 * 60 * 60 * 24);
        }

        const periodStaffCost = (daysActive / 30) * monthlySalary;
        const totalProfitContribution = totalRevenue - periodStaffCost;

        res.json({
            timeline,
            totalProfitContribution: Math.round(totalProfitContribution),
            periodStaffCost: Math.round(periodStaffCost),
            currentBusinessHours: 160
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
    const queryParams = [];
    let whereClause = 'WHERE 1=1';

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

        const dataQuery = `
            SELECT e.* 
            FROM employees e 
            ${whereClause} 
            ORDER BY e.name ASC 
            LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
        `;
        const dataRes = await db.query(dataQuery, [...queryParams, limit, offset]);
        const employees = dataRes.rows;

        let tStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        let tEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);

        if (startDate && endDate) {
            tStart = new Date(`${startDate}T00:00:00`);
            tEnd = new Date(`${endDate}T23:59:59`);
        }

        const enhancedEmployees = await Promise.all(employees.map(async (emp) => {
            const empId = emp.id;
            const monthlySalary = Number(emp.monthly_salary) || 0;

            const logsData = await db.query(`
                SELECT t.hours_worked, p.billing_type, p.quoted_bid_value
                FROM timesheet_logs t
                JOIN projects p ON t.project_id = p.id
                WHERE t.employee_id = $1 AND t.date >= $2 AND t.date <= $3 AND t.approval_id IS NOT NULL
                AND p.billing_type != 'Fixed Bid'
            `, [empId, tStart, tEnd]);

            let totalRevenue = 0;
            // Native T&M revenue loop
            logsData.rows.forEach(log => {
                totalRevenue += Number(log.hours_worked) * (Number(emp.usd_hourly_rate) || 0) * 83.15;
            });

            // Native Fixed Bid revenue query and scaling
            const plansForStatus = await db.query(`
                SELECT prp.*, p.billing_type, p.quoted_bid_value, p.start_date as proj_start, p.deadline as proj_deadline, p.status as project_status
                FROM project_resource_plans prp
                JOIN projects p ON prp.project_id = p.id
                WHERE prp.employee_id = $1 AND p.billing_type = 'Fixed Bid'
            `, [empId]);

            plansForStatus.rows.forEach(plan => {
                const planStart = new Date(plan.proj_start || new Date());
                const planEnd = new Date(plan.proj_deadline || new Date());
                const totalDurationMonths = Math.max(1, (planEnd.getFullYear() - planStart.getFullYear()) * 12 + (planEnd.getMonth() - planStart.getMonth()) + 1);
                const monthlyRevenue = Number(plan.quoted_bid_value || 0) / totalDurationMonths;

                const overlapStart = planStart > tStart ? planStart : tStart;
                const overlapEnd = planEnd < tEnd ? planEnd : tEnd;

                let applicableMonths = 0;
                if (overlapEnd >= overlapStart) {
                    const diffTime = Math.abs(overlapEnd - overlapStart);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    applicableMonths = diffDays / 30;
                }
                const fraction = Number(plan.allocation_percentage || 100) / 100;
                totalRevenue += (monthlyRevenue * applicableMonths) * fraction;
            });

            const jDate = new Date(emp.joining_date || '2026-02-01');
            let actualStart = new Date(tStart);
            if (actualStart < jDate) {
                actualStart = jDate;
            }
            
            let daysActive = 0;
            if (tEnd >= actualStart) {
                daysActive = (tEnd.getTime() - actualStart.getTime()) / (1000 * 60 * 60 * 24);
            }
            const expectedCost = (daysActive / 30) * monthlySalary;

            let asset_status = 'LIABILITY';
            let status_color = 'red';

            if (totalRevenue > expectedCost) {
                asset_status = 'ASSET';
                status_color = 'green';
            } else {
                asset_status = 'LIABILITY';
                status_color = 'red';
            }

            return {
                ...emp,
                asset_status,
                status_color
            };
        }));

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
            'INSERT INTO employees (name, role, joining_date, monthly_salary, status, specialization, hourly_rate, usd_hourly_rate) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [name, role, joining_date || '2026-02-01', monthly_salary, status, specialization, hourly_rate, usd_hourly_rate]
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
            'UPDATE employees SET name=$1, role=$2, joining_date=$3, monthly_salary=$4, status=$5, specialization=$6, hourly_rate=$7, usd_hourly_rate=$8 WHERE id=$9 RETURNING *',
            [name, role, joining_date || '2026-02-01', monthly_salary, status, specialization, hourly_rate, usd_hourly_rate, id]
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
        await db.query('DELETE FROM employees WHERE id = $1', [id]);
        res.json({ message: 'Employee deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
