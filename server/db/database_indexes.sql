-- Database Optimizations for Enterprise Scale

-- Indexes for Projects Table
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(type);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);

-- Indexes for Employees Table
CREATE INDEX IF NOT EXISTS idx_employees_role ON employees(role);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_specialization ON employees(specialization);
CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);

-- Indexes for Clients Table
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);

-- Indexes for Project Resource Plans Table (used heavily in joins)
CREATE INDEX IF NOT EXISTS idx_prp_project_id ON project_resource_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_prp_employee_id ON project_resource_plans(employee_id);

-- Indexes for Company Expenses
CREATE INDEX IF NOT EXISTS idx_expenses_date ON company_expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON company_expenses(category);
