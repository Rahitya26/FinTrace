const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const alterApprovalsTable = async () => {
    try {
        console.log('Adding total_inr_revenue column to timesheet_approvals table...');

        await pool.query(`
            ALTER TABLE timesheet_approvals 
            ADD COLUMN IF NOT EXISTS total_inr_revenue DECIMAL(15, 2) DEFAULT 0;
        `);

        console.log('Successfully updated timesheet_approvals table with total_inr_revenue.');
    } catch (err) {
        console.error('Error updating timesheet_approvals table:', err);
    } finally {
        await pool.end();
    }
};

alterApprovalsTable();
