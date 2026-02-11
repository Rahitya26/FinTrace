-- Employee Management Schema

-- Employees Table
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL, -- e.g., 'Developer', 'Designer', 'Manager'
    monthly_salary NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'Active', -- 'Active', 'Inactive'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Project Resource Plans Table
-- Links employees to projects with allocation percentage
CREATE TABLE IF NOT EXISTS project_resource_plans (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    allocation_percentage NUMERIC(5, 2) NOT NULL DEFAULT 100.00, -- e.g., 50.00 for 50%
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE, -- Optional, if they roll off before project end
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
