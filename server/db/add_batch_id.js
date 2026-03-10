const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const migrate = async () => {
    try {
        console.log('Running migration: Adding batch_id to timesheet_logs table...');

        await pool.query(`
            ALTER TABLE timesheet_logs 
            ADD COLUMN IF NOT EXISTS batch_id VARCHAR(50);
        `);

        console.log('✅ Migration successful: batch_id column added.');
    } catch (err) {
        console.error('Error running migration:', err);
    } finally {
        await pool.end();
    }
};

migrate();
