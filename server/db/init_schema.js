require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const schema = `
DROP TABLE IF EXISTS timesheet_logs CASCADE;
DROP TABLE IF EXISTS timesheet_approvals CASCADE;
DROP TABLE IF EXISTS project_resource_plans CASCADE;
DROP TABLE IF EXISTS company_expenses CASCADE;
DROP TABLE IF EXISTS expense_categories CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS verification_codes CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

CREATE TABLE organizations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    email VARCHAR(255) NOT NULL,
    password_hash TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE verification_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(6) NOT NULL,
    org_name VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clients (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    industry VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    client_id INTEGER REFERENCES clients(id),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    billing_type VARCHAR(20) DEFAULT 'T&M',
    status VARCHAR(50) DEFAULT 'Active',
    start_date DATE DEFAULT CURRENT_DATE,
    deadline DATE,
    quoted_bid_value NUMERIC(15,2) DEFAULT 0.00,
    fixed_contract_value NUMERIC(15,2) DEFAULT 0.00,
    budgeted_hours NUMERIC(15,2) DEFAULT 0.00,
    usd_rate NUMERIC(15,2) DEFAULT 0.00,
    is_manual_cost BOOLEAN DEFAULT true,
    revenue_earned NUMERIC(15,2) DEFAULT 0.00,
    employee_costs NUMERIC(15,2) DEFAULT 0.00,
    margin NUMERIC(15,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'Active',
    specialization VARCHAR(50) DEFAULT 'Fixed Bid',
    monthly_salary NUMERIC(15,2) DEFAULT 0.00,
    hourly_rate NUMERIC(15,2) DEFAULT 0.00,
    usd_hourly_rate NUMERIC(15,2) DEFAULT 0.00,
    joining_date DATE DEFAULT '2026-02-01',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project_resource_plans (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    allocation_percentage NUMERIC(5,2) DEFAULT 100.00,
    usd_rate NUMERIC(15,2),
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE timesheet_approvals (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    period_type VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL,
    usd_to_inr_rate NUMERIC(15,2) NOT NULL,
    total_usd_value NUMERIC(15,2) NOT NULL,
    total_inr_revenue NUMERIC(15,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE timesheet_logs (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    approval_id INTEGER REFERENCES timesheet_approvals(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    hours_worked NUMERIC(15,2) NOT NULL,
    description TEXT,
    batch_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE expense_categories (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE company_expenses (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES organizations(id),
    date DATE NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    category VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

async function run() {
    try {
        console.log("Dropping existing corrupted tables and rebuilding...");
        await pool.query(schema);
        console.log("Schema successfully built on Supabase!");
    } catch (e) {
        console.error("Migration Error:", e);
    } finally {
        pool.end();
    }
}

run();
