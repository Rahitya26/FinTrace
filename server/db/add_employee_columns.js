const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const alterEmployeesTable = async () => {
    try {
        console.log('Adding specialization and hourly_rate columns to employees table...');

        await pool.query(`
            ALTER TABLE employees 
            ADD COLUMN IF NOT EXISTS specialization VARCHAR(50) DEFAULT 'Fixed Bid',
            ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10, 2) DEFAULT 0;
        `);

        console.log('Successfully updated employees table.');
    } catch (err) {
        console.error('Error updating employees table:', err);
    } finally {
        await pool.end();
    }
};

alterEmployeesTable();
