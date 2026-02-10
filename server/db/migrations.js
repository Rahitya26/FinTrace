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
        console.log('Running migration: Adding date columns to projects table...');

        await pool.query(`
      ALTER TABLE projects 
      ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE,
      ADD COLUMN IF NOT EXISTS deadline DATE;
    `);

        console.log('✅ Migration successful: start_date and deadline columns added.');
    } catch (err) {
        console.error('Error running migration:', err);
    } finally {
        await pool.end();
    }
};

migrate();
