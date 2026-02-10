-- Service-Based Company Financial Tracking System Schema

-- Clients Table
CREATE TABLE clients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    industry VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects Table
-- ENUM for process type: T&M (Time & Material), Fixed Bid, Fixed Value
CREATE TYPE process_type AS ENUM ('T&M', 'Fixed Bid', 'Fixed Value');

CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type process_type NOT NULL,
    revenue_earned NUMERIC(12, 2) DEFAULT 0.00,
    employee_costs NUMERIC(12, 2) DEFAULT 0.00,
    -- Margin is calculated as revenue_earned - employee_costs
    margin NUMERIC(12, 2) GENERATED ALWAYS AS (revenue_earned - employee_costs) STORED,
    start_date DATE DEFAULT CURRENT_DATE,
    deadline DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Company Expenses Table
CREATE TABLE company_expenses (
    id SERIAL PRIMARY KEY,
    category VARCHAR(255) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
