require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('./index');

async function seed() {
    try {
        console.log('Seeding new 2026 data...');

        // 1. Insert Clients
        const clientsResult = await db.query(`
            INSERT INTO clients (name, industry) VALUES 
            ('TechFrontier', 'Technology'),
            ('Quantum Financial', 'Finance'),
            ('HealthPlus Healthcare', 'Healthcare'),
            ('EcoRetail Solutions', 'Retail')
            RETURNING id, name;
        `);
        const clients = clientsResult.rows;
        const getClientId = (name) => clients.find(c => c.name === name).id;

        // 2. Insert Employees
        const employeesResult = await db.query(`
            INSERT INTO employees (name, role, status, monthly_salary, specialization, hourly_rate) VALUES
            ('Sarah Connor', 'Senior Developer', 'Active', 120000, 'Fixed Bid', 0),
            ('John Smith', 'UX Designer', 'Active', 0, 'T&M', 800),
            ('Emily Chen', 'Project Manager', 'Active', 150000, 'Fixed Value', 0),
            ('David Kim', 'Backend Engineer', 'Active', 110000, 'Fixed Bid', 0),
            ('Laura Palmer', 'Frontend Developer', 'Active', 0, 'T&M', 750),
            ('Michael Scott', 'QA Specialist', 'Active', 70000, 'Fixed Bid', 0)
            RETURNING id, name, specialization;
        `);
        const emps = employeesResult.rows;
        const getEmpId = (name) => emps.find(e => e.name === name).id;

        // 3. Insert Projects
        // Fixed Bid Project 1
        const p1 = await db.query(`
            INSERT INTO projects (client_id, name, type, revenue_earned, start_date, deadline)
            VALUES ($1, 'Mobile App Redesign', 'Fixed Bid', 1200000, '2026-01-15', '2026-06-15')
            RETURNING id;
        `, [getClientId('TechFrontier')]);

        await db.query(`
            INSERT INTO project_resource_plans (project_id, employee_id, allocation_percentage) VALUES
            ($1, $2, 100),
            ($1, $3, 50)
        `, [p1.rows[0].id, getEmpId('Sarah Connor'), getEmpId('David Kim')]);

        // T&M Project 1
        const p2 = await db.query(`
            INSERT INTO projects (client_id, name, type, revenue_earned, start_date, deadline)
            VALUES ($1, 'Cloud Migration Support', 'T&M', 850000, '2025-11-01', NULL)
            RETURNING id;
        `, [getClientId('Quantum Financial')]);

        // Note: For T&M, allocation_percentage functions as Estimated Hours
        await db.query(`
            INSERT INTO project_resource_plans (project_id, employee_id, allocation_percentage) VALUES
            ($1, $2, 160), 
            ($1, $3, 80)   
        `, [p2.rows[0].id, getEmpId('John Smith'), getEmpId('Laura Palmer')]);

        // Fixed Value Project
        const p3 = await db.query(`
            INSERT INTO projects (client_id, name, type, revenue_earned, start_date, deadline)
            VALUES ($1, 'Patient Portal Upgrade', 'Fixed Value', 2500000, '2026-02-01', '2026-10-01')
            RETURNING id;
        `, [getClientId('HealthPlus Healthcare')]);

        await db.query(`
            INSERT INTO project_resource_plans (project_id, employee_id, allocation_percentage) VALUES
            ($1, $2, 25),
            ($1, $3, 100),
            ($1, $4, 50)
        `, [p3.rows[0].id, getEmpId('Emily Chen'), getEmpId('Sarah Connor'), getEmpId('Michael Scott')]);

        // Fixed Bid Project 2
        const p4 = await db.query(`
            INSERT INTO projects (client_id, name, type, revenue_earned, start_date, deadline)
            VALUES ($1, 'Inventory System Overhaul', 'Fixed Bid', 900000, '2025-08-01', '2026-02-28')
            RETURNING id;
        `, [getClientId('EcoRetail Solutions')]);

        await db.query(`
            INSERT INTO project_resource_plans (project_id, employee_id, allocation_percentage) VALUES
            ($1, $2, 100)
        `, [p4.rows[0].id, getEmpId('David Kim')]);

        // 4. Insert Company Expenses
        await db.query(`
            INSERT INTO company_expenses (category, amount, date) VALUES
            ('AWS Hosting', 45000, '2026-01-05'),
            ('AWS Hosting', 48000, '2026-02-05'),
            ('Office Rent', 150000, '2026-01-01'),
            ('Office Rent', 150000, '2026-02-01'),
            ('Software Licenses', 35000, '2026-01-15'),
            ('Software Licenses', 12000, '2026-02-15'),
            ('Marketing Campaign', 85000, '2026-02-10')
        `);

        console.log('Seed data added successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding data:', err);
        process.exit(1);
    }
}

seed();
