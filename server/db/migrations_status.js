const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const migrate = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if type exists
        const checkType = await client.query("SELECT typname FROM pg_type WHERE typname = 'project_status'");
        if (checkType.rowCount === 0) {
            await client.query("CREATE TYPE project_status AS ENUM ('Pipeline', 'Active', 'Completed', 'On Hold')");
            console.log('Created project_status ENUM');
        }

        // Add column if it doesn't exist
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='status') THEN 
                    ALTER TABLE projects ADD COLUMN status project_status DEFAULT 'Active'; 
                END IF; 
            END $$;
        `);
        console.log('Added status column to projects');

        await client.query('COMMIT');
        console.log('Migration completed successfully');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
};

migrate();
