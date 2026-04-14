const { Pool } = require('pg');
require('dotenv').config({ path: __dirname + '/../.env' });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log("Creating new multi-tenant tables...");
        
        // 1. Create Organizations Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS organizations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Create Users Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. Create Verification Codes Table for OTP
        await client.query(`
            CREATE TABLE IF NOT EXISTS verification_codes (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                code VARCHAR(6) NOT NULL,
                org_name VARCHAR(255),
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 4. Create a Default Organization for existing data
        const orgRes = await client.query("INSERT INTO organizations (name) VALUES ('Default Organization') RETURNING id");
        const defaultOrgId = orgRes.rows[0].id;

        console.log(`Default Organization created with ID: ${defaultOrgId}`);

        // 5. Add organization_id to all relevant tables
        const tablesToUpdate = [
            'clients',
            'projects',
            'employees',
            'project_resource_plans',
            'timesheet_logs',
            'timesheet_approvals',
            'company_expenses',
            'expense_categories'
        ];

        for (const table of tablesToUpdate) {
            console.log(`Updating table: ${table}...`);
            
            // Add column if it doesn't exist
            await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE`);
            
            // Assign existing data to the Default organization
            await client.query(`UPDATE ${table} SET organization_id = $1 WHERE organization_id IS NULL`, [defaultOrgId]);
            
            // Make it NOT NULL for future safety (optional, but good for multi-tenancy)
            // await client.query(`ALTER TABLE ${table} ALTER COLUMN organization_id SET NOT NULL`);
        }

        await client.query('COMMIT');
        console.log("Multi-tenant migration completed successfully!");
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Migration failed:", err);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
