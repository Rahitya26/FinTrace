const { Pool } = require('pg');
const path = require('path');

// Try multiple paths
const envPath1 = path.join(__dirname, '../.env'); // server/.env
require('dotenv').config({ path: envPath1 });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function checkData() {
    try {
        console.log('Checking database tables...');

        const tables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log('Tables:', tables.rows.map(r => r.table_name));

        console.log('Checking project_resource_plans...');
        const plans = await pool.query('SELECT COUNT(*) FROM project_resource_plans');
        console.log(`Resource Plans count: ${plans.rows[0].count}`);

    } catch (err) {
        console.error('Error querying database:', err);
    } finally {
        await pool.end();
    }
}

checkData();
