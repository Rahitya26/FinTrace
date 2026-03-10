const pool = require('../index');

async function migrate() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS timesheet_approvals (
                id SERIAL PRIMARY KEY,
                period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('Daily', 'Weekly')),
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                usd_to_inr_rate DECIMAL(10, 2) NOT NULL,
                total_usd_value DECIMAL(12, 2) NOT NULL,
                status VARCHAR(20) NOT NULL CHECK (status IN ('Accepted', 'Paid')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS timesheet_logs (
                id SERIAL PRIMARY KEY,
                project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                hours_worked DECIMAL(5, 2) NOT NULL,
                description TEXT,
                approval_id INTEGER REFERENCES timesheet_approvals(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            ALTER TABLE projects ADD COLUMN IF NOT EXISTS usd_rate DECIMAL(10, 2) DEFAULT 0;
        `);
        console.log("Timesheet tables and project USD rate column created successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed", err);
        process.exit(1);
    }
}

migrate();
