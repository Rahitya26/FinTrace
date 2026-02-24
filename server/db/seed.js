const pool = require('./index');

async function seedDatabase() {
    console.log('Seeding database...');
    try {
        // Drop all existing data
        await pool.query(`
      TRUNCATE TABLE 
        project_resource_plans, 
        projects, 
        clients, 
        employees, 
        company_expenses 
      RESTART IDENTITY CASCADE;
    `);
        console.log('Existing data cleared.');

        // Seed Clients
        const clientsData = [
            { name: 'Acme Corp', industry: 'Technology' },
            { name: 'Globex Corporation', industry: 'Finance' },
            { name: 'Initech', industry: 'Software' }
        ];
        for (const client of clientsData) {
            await pool.query('INSERT INTO clients (name, industry) VALUES ($1, $2)', [client.name, client.industry]);
        }
        console.log('Clients seeded.');

        // Seed Employees
        const employeesData = [
            { name: 'Alice Smith', role: 'Senior Developer', monthly_salary: 8000.00, status: 'Active' },
            { name: 'Bob Jones', role: 'UI/UX Designer', monthly_salary: 6500.00, status: 'Active' },
            { name: 'Charlie Brown', role: 'Project Manager', monthly_salary: 9000.00, status: 'Active' },
            { name: 'Diana Prince', role: 'Backend Developer', monthly_salary: 7500.00, status: 'Active' }
        ];
        for (const emp of employeesData) {
            await pool.query('INSERT INTO employees (name, role, monthly_salary, status) VALUES ($1, $2, $3, $4)', [emp.name, emp.role, emp.monthly_salary, emp.status]);
        }
        console.log('Employees seeded.');

        // Seed Projects (Assuming clients 1, 2, 3 exist due to RESTART IDENTITY)
        const projectsData = [
            { client_id: 1, name: 'Acme Website Redesign', type: 'Fixed Bid', revenue_earned: 50000.00, start_date: '2023-01-15', deadline: '2023-06-30' },
            { client_id: 2, name: 'Globex Financial Dashboard', type: 'T&M', revenue_earned: 25000.00, start_date: '2023-03-01', deadline: '2024-03-01' },
            { client_id: 3, name: 'Initech Mobile App', type: 'Fixed Value', revenue_earned: 75000.00, start_date: '2023-02-10', deadline: '2023-08-31' }
        ];
        for (const proj of projectsData) {
            await pool.query(
                'INSERT INTO projects (client_id, name, type, revenue_earned, start_date, deadline) VALUES ($1, $2, $3, $4, $5, $6)',
                [proj.client_id, proj.name, proj.type, proj.revenue_earned, proj.start_date, proj.deadline]
            );
        }
        console.log('Projects seeded.');

        // Seed Project Resource Plans (Assuming employees 1, 2, 3, 4 exist and projects 1, 2, 3 exist)
        const resourceData = [
            { project_id: 1, employee_id: 1, allocation: 50.00 }, // Alice on Acme
            { project_id: 1, employee_id: 2, allocation: 100.00 }, // Bob on Acme
            { project_id: 2, employee_id: 3, allocation: 25.00 },  // Charlie on Globex
            { project_id: 2, employee_id: 4, allocation: 100.00 }, // Diana on Globex
            { project_id: 3, employee_id: 1, allocation: 50.00 }   // Alice on Initech
        ];
        for (const res of resourceData) {
            await pool.query(
                'INSERT INTO project_resource_plans (project_id, employee_id, allocation_percentage) VALUES ($1, $2, $3)',
                [res.project_id, res.employee_id, res.allocation]
            );
        }
        console.log('Project Resource Plans seeded.');

        // Seed Company Expenses
        const expensesData = [
            { category: 'Software Licenses', amount: 1500.00, date: '2023-04-01', description: 'AWS and GitHub subscriptions' },
            { category: 'Office Supplies', amount: 350.00, date: '2023-04-15', description: 'New monitors and keyboards' },
            { category: 'Marketing', amount: 2000.00, date: '2023-05-01', description: 'Q2 Ad campaign' }
        ];
        for (const exp of expensesData) {
            await pool.query(
                'INSERT INTO company_expenses (category, amount, date, description) VALUES ($1, $2, $3, $4)',
                [exp.category, exp.amount, exp.date, exp.description]
            );
        }
        console.log('Company Expenses seeded.');

        console.log('Database seeding complete!');
    } catch (err) {
        console.error('Error seeding database:', err);
    } finally {
        process.exit(0); // Exit process when done
    }
}

seedDatabase();
