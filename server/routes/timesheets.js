const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/timesheets/client-resources/:clientId - Get unique active employees for a client
router.get('/client-resources/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        const query = `
            SELECT DISTINCT ON (e.id) e.id, e.name, e.role, e.specialization, p.id as project_id
            FROM employees e
            JOIN project_resource_plans prp ON e.id = prp.employee_id
            JOIN projects p ON prp.project_id = p.id
            WHERE p.client_id = $1 AND (prp.end_date IS NULL OR prp.end_date >= CURRENT_DATE)
        `;
        const result = await pool.query(query, [clientId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error fetching client resources' });
    }
});

// POST /api/timesheets/log - Log daily or range hours
router.post('/log', async (req, res) => {
    const { project_id, employee_id, startDate, endDate, hours_worked, description } = req.body;
    const db = require('../db');
    const client = await db.pool.connect();

    try {
        // 1. Financial Guardrail: Prevent future dates
        const today = new Date().toISOString().split('T')[0];
        if (endDate > today) {
            return res.status(400).json({ error: 'Cannot log time for future dates.' });
        }

        // 2. Financial Guardrail: Check resource plan and project start date
        const planRes = await client.query(
            `SELECT prp.end_date, prp.start_date as assignment_start, p.start_date as project_start 
             FROM project_resource_plans prp 
             JOIN projects p ON prp.project_id = p.id
             WHERE prp.employee_id = $1 AND prp.project_id = $2`,
            [employee_id, project_id]
        );

        if (planRes.rows.length === 0) {
            return res.status(400).json({ error: 'No active resource plan found for this employee on this project.' });
        }

        const projectStartDate = new Date(planRes.rows[0].project_start).toISOString().split('T')[0];
        const planEndDate = planRes.rows[0].end_date ? new Date(planRes.rows[0].end_date).toISOString().split('T')[0] : null;

        if (startDate < projectStartDate) {
            return res.status(400).json({ error: `Cannot log time before project start date (${projectStartDate}).` });
        }

        if (planEndDate && endDate > planEndDate) {
            return res.status(400).json({ error: `Cannot log time past offboarding date (${planEndDate}).` });
        }

        // 3. Calculate Working Days
        const workingDays = [];
        let curr = new Date(startDate);
        const end = new Date(endDate);

        while (curr <= end) {
            const dayOfWeek = curr.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                workingDays.push(new Date(curr).toISOString().split('T')[0]);
            }
            curr.setDate(curr.getDate() + 1);
        }

        if (workingDays.length === 0) {
            return res.status(400).json({ error: 'No working days (Mon-Fri) found in the selected range.' });
        }

        const dailyHours = Number(parseFloat(Number(hours_worked) / workingDays.length).toFixed(2));
        const batch_id = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Hour validation guardrail
        if (dailyHours > 24) {
            return res.status(400).json({ error: `Total hours exceed limit. You cannot log more than 24 hours per working day (Total Max: ${workingDays.length * 24}).` });
        }

        await client.query('BEGIN');

        let totalTarget = Number(hours_worked);
        let loggedSoFar = 0;

        for (let i = 0; i < workingDays.length; i++) {
            const day = workingDays[i];
            let currentDayHours = dailyHours;

            // On the last day, adjust to match the total target exactly
            if (i === workingDays.length - 1) {
                currentDayHours = Number((totalTarget - loggedSoFar).toFixed(2));
            } else {
                loggedSoFar = Number((loggedSoFar + currentDayHours).toFixed(2));
            }

            // Check if log already exists and is locked
            const check = await client.query(
                'SELECT id, approval_id FROM timesheet_logs WHERE project_id = $1 AND employee_id = $2 AND date = $3',
                [project_id, employee_id, day]
            );

            if (check.rows.length > 0) {
                if (check.rows[0].approval_id) {
                    throw new Error(`Timesheet for ${day} is locked and cannot be modified.`);
                }
                // Update existing log
                await client.query(
                    'UPDATE timesheet_logs SET hours_worked = $1, description = $2, batch_id = $3 WHERE id = $4',
                    [currentDayHours, description, batch_id, check.rows[0].id]
                );
            } else {
                // Create new log
                await client.query(
                    'INSERT INTO timesheet_logs (project_id, employee_id, date, hours_worked, description, batch_id) VALUES ($1, $2, $3, $4, $5, $6)',
                    [project_id, employee_id, day, currentDayHours, description, batch_id]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Timesheet(s) logged successfully', daysLogged: workingDays.length });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error logging timesheet:", err.message);
        res.status(400).json({ error: err.message || 'Server error logging timesheet' });
    } finally {
        client.release();
    }
});

// GET /api/timesheets - Fetch logs
router.get('/', async (req, res) => {
    const { startDate, endDate, projectId, employeeId, status } = req.query;
    try {
        let query = `
            SELECT t.*, p.name as project_name, p.type as project_type, p.usd_rate as global_project_usd_rate, 
                   e.name as employee_name, e.hourly_rate as employee_hourly_rate, e.usd_hourly_rate,
                   COALESCE(prp.usd_rate, e.usd_hourly_rate) as effective_usd_rate
            FROM timesheet_logs t
            JOIN projects p ON t.project_id = p.id
            JOIN employees e ON t.employee_id = e.id
            LEFT JOIN project_resource_plans prp ON t.project_id = prp.project_id AND t.employee_id = prp.employee_id
            WHERE 1=1
        `;
        const values = [];
        let count = 1;

        if (startDate && endDate) {
            query += ` AND t.date BETWEEN $${count} AND $${count + 1}`;
            values.push(startDate, endDate);
            count += 2;
        }

        if (projectId) {
            query += ` AND t.project_id = $${count}`;
            values.push(projectId);
            count += 1;
        }

        if (employeeId) {
            query += ` AND t.employee_id = $${count}`;
            values.push(employeeId);
            count += 1;
        }

        if (status === 'unapproved') {
            query += ` AND t.approval_id IS NULL`;
        }

        query += ' ORDER BY t.date DESC';

        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error fetching timesheets' });
    }
});

// POST /api/timesheets/approve - Manager approval
router.post('/approve', async (req, res) => {
    const { logIds, usd_to_inr_rate } = req.body;

    try {
        await pool.query('BEGIN');

        if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
            return res.status(400).json({ error: 'No logs selected for approval.' });
        }

        // Get unapproved logs and join employees table to grab their specific USD rate and INR hourly rate
        const unapprovedLogs = await pool.query(`
            SELECT t.id, t.project_id, t.hours_worked, 
                   COALESCE(prp.usd_rate, e.usd_hourly_rate) as usd_hourly_rate, 
                   e.hourly_rate as inr_hourly_rate, p.type
            FROM timesheet_logs t
            JOIN projects p ON t.project_id = p.id
            JOIN employees e ON t.employee_id = e.id
            LEFT JOIN project_resource_plans prp ON t.project_id = prp.project_id AND t.employee_id = prp.employee_id
            WHERE t.id = ANY($1::int[]) 
            AND t.approval_id IS NULL
        `, [logIds]);

        if (unapprovedLogs.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(400).json({ error: 'No unapproved logs found in this period.' });
        }

        let totalUsdValue = 0;
        let totalInrValue = 0;
        const validatedLogIds = [];
        const projectUpdates = {};

        for (const log of unapprovedLogs.rows) {
            validatedLogIds.push(log.id);
            const hrs = Number(log.hours_worked);
            const rate = Number(log.usd_hourly_rate || 0);
            const revUsd = hrs * rate;
            const revInr = revUsd * Number(usd_to_inr_rate);

            totalUsdValue += revUsd;
            totalInrValue += revInr;

            // Only T&M projects get their revenue/cost updated automatically this way
            if (log.type === 'T&M') {
                const costInr = hrs * Number(log.inr_hourly_rate || 0); // Actual Cost: SUM(Hours * INR Hourly Rate)

                if (!projectUpdates[log.project_id]) {
                    projectUpdates[log.project_id] = { rev: 0, cost: 0 };
                }
                projectUpdates[log.project_id].rev += revInr;
                projectUpdates[log.project_id].cost += costInr;
            }
        }

        // Create Approval Record
        const approvalRes = await pool.query(`
            INSERT INTO timesheet_approvals (period_type, start_date, end_date, usd_to_inr_rate, total_usd_value, total_inr_revenue, status)
            VALUES ('Weekly', (SELECT MIN(date) FROM timesheet_logs WHERE id = ANY($1::int[])), (SELECT MAX(date) FROM timesheet_logs WHERE id = ANY($1::int[])), $2, $3, $4, 'Accepted')
            RETURNING id
        `, [validatedLogIds, usd_to_inr_rate, totalUsdValue, totalInrValue]);

        const approvalId = approvalRes.rows[0].id;

        // Update logs to point to this approval
        await pool.query(`
            UPDATE timesheet_logs 
            SET approval_id = $1 
            WHERE id = ANY($2::int[])
        `, [approvalId, validatedLogIds]);

        // Update T&M Projects revenue and costs
        for (const [projectId, amounts] of Object.entries(projectUpdates)) {
            await pool.query(`
                UPDATE projects 
                SET revenue_earned = COALESCE(revenue_earned, 0) + $1,
                    employee_costs = COALESCE(employee_costs, 0) + $2
                WHERE id = $3
            `, [amounts.rev, amounts.cost, projectId]);
        }

        await pool.query('COMMIT');
        res.json({ message: 'Timesheets approved and locked successfully', approvalId, totalUsdValue });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("Error approving timesheets:", err.message);
        res.status(500).json({ error: 'Server error approving timesheets' });
    }
});

// GET /api/timesheets/approvals - Get all approvals
router.get('/approvals', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM timesheet_approvals ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error fetching approvals' });
    }
});

module.exports = router;
