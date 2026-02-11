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

async function run() {
    try {
        console.log('Creating project_resource_plans table...');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS project_resource_plans (
                id SERIAL PRIMARY KEY,
                project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
                allocation_percentage NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
                start_date DATE DEFAULT CURRENT_DATE,
                end_date DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Table created successfully!');

    } catch (err) {
        console.error('Error creating table:', err);
    } finally {
        await pool.end();
    }
}

run();
