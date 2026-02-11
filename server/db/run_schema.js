const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function runSchema() {
    try {
        const schemaPath = path.join(__dirname, 'employee_schema.sql');
        const sql = fs.readFileSync(schemaPath, 'utf8');

        console.log('Running schema...');
        await pool.query(sql);
        console.log('Schema applied successfully.');
    } catch (err) {
        console.error('Error applying schema:', err);
    } finally {
        await pool.end();
    }
}

runSchema();
