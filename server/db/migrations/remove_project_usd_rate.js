const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function run() {
    try {
        console.log('Connecting to database...');

        // 1. Drop NOT NULL constraint on usd_rate
        console.log('Altering projects: dropping NOT NULL on usd_rate...');
        await pool.query(`ALTER TABLE projects ALTER COLUMN usd_rate DROP NOT NULL;`);

        console.log('Success! projects table updated.');
    } catch (err) {
        console.error('Migration failed:', err.message);
    } finally {
        await pool.end();
        console.log('Database connection closed.');
    }
}

run();
