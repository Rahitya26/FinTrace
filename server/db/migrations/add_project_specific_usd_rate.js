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

const migrate = async () => {
    try {
        console.log('Adding usd_rate column to project_resource_plans table...');

        await pool.query(`
            ALTER TABLE project_resource_plans 
            ADD COLUMN IF NOT EXISTS usd_rate DECIMAL(10, 2);
        `);

        console.log('Successfully updated project_resource_plans table with usd_rate.');
    } catch (err) {
        console.error('Error updating project_resource_plans table:', err);
    } finally {
        await pool.end();
    }
};

migrate();
