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

// POST /api/timesheets/log - Log daily hours
router.post('/log', async (req, res) => {
    const { project_id, employee_id, date, hours_worked, description } = req.body;
    try {
        // Check if log already exists and is locked
        const check = await pool.query(
            'SELECT id, approval_id FROM timesheet_logs WHERE project_id = $1 AND employee_id = $2 AND date = $3',
            [project_id, employee_id, date]
        );

        if (check.rows.length > 0) {
            if (check.rows[0].approval_id) {
                return res.status(400).json({ error: 'This timesheet is locked and cannot be modified.' });
            }
            // Update existing log
            const updated = await pool.query(
                'UPDATE timesheet_logs SET hours_worked = $1, description = $2 WHERE id = $3 RETURNING *',
                [hours_worked, description, check.rows[0].id]
            );
            return res.json(updated.rows[0]);
        } else {
            // Create new log
            const inserted = await pool.query(
                'INSERT INTO timesheet_logs (project_id, employee_id, date, hours_worked, description) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                [project_id, employee_id, date, hours_worked, description]
            );
            return res.status(201).json(inserted.rows[0]);
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error logging timesheet' });
    }
});

// GET /api/timesheets - Fetch logs
router.get('/', async (req, res) => {
    const { startDate, endDate, projectId, employeeId, status } = req.query;
    try {
        let query = `
            SELECT t.*, p.name as project_name, p.type as project_type, p.usd_rate, e.name as employee_name, e.hourly_rate as employee_hourly_rate, e.usd_hourly_rate 
            FROM timesheet_logs t
            JOIN projects p ON t.project_id = p.id
            JOIN employees e ON t.employee_id = e.id
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
    const { period_type, start_date, end_date, usd_to_inr_rate } = req.body;

    try {
        await pool.query('BEGIN');

        // Get unapproved logs and join employees table to grab their specific USD rate and INR hourly rate
        const unapprovedLogs = await pool.query(`
            SELECT t.id, t.project_id, t.hours_worked, e.usd_hourly_rate, e.hourly_rate as inr_hourly_rate, p.type
            FROM timesheet_logs t
            JOIN projects p ON t.project_id = p.id
            JOIN employees e ON t.employee_id = e.id
            WHERE t.date BETWEEN $1 AND $2 
            AND t.approval_id IS NULL
        `, [start_date, end_date]);

        if (unapprovedLogs.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(400).json({ error: 'No unapproved logs found in this period.' });
        }

        let totalUsdValue = 0;
        let totalInrValue = 0;
        const logIds = [];
        const projectUpdates = {};

        for (const log of unapprovedLogs.rows) {
            logIds.push(log.id);
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
            VALUES ($1, $2, $3, $4, $5, $6, 'Accepted')
            RETURNING id
        `, [period_type, start_date, end_date, usd_to_inr_rate, totalUsdValue, totalInrValue]);

        const approvalId = approvalRes.rows[0].id;

        // Update logs to point to this approval
        await pool.query(`
            UPDATE timesheet_logs 
            SET approval_id = $1 
            WHERE id = ANY($2::int[])
        `, [approvalId, logIds]);

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
