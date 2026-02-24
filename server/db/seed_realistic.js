require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('./index');

const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson'];

const clientAdjectives = ['Apex', 'Pinnacle', 'Synergy', 'Quantum', 'Dynamic', 'NextGen', 'Stellar', 'Prime', 'Innovative', 'Eco'];
const clientNouns = ['Solutions', 'Technologies', 'Systems', 'Networks', 'Corporation', 'Industries', 'Enterprises'];
const industries = ['Technology', 'Finance', 'Healthcare', 'Retail', 'Logistics', 'Manufacturing', 'Education'];

const projectAdjectives = ['Mobile', 'Web', 'Cloud', 'Data', 'AI', 'Security', 'Enterprise', 'Legacy', 'IoT'];
const projectNouns = ['Migration', 'Modernization', 'Integration', 'Upgrade', 'Overhaul', 'Implementation', 'Transformation'];

const roles = ['Software Engineer', 'Senior Developer', 'Project Manager', 'Product Manager', 'UX Designer', 'Data Scientist', 'DevOps Engineer', 'QA Tester', 'Business Analyst'];
const types = ['Fixed Bid', 'T&M', 'Fixed Value'];
const expenseCategories = ['AWS Hosting', 'Office Rent', 'Software Licenses', 'Marketing Campaign', 'Hardware Equipment', 'Legal Fees', 'Consulting Services', 'Travel', 'Employee Benefits', 'Utilities'];

function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seed() {
    try {
        console.log('Resetting database and seeding realistic dataset...');

        // 1. Clear database
        await db.query(`
            TRUNCATE TABLE project_resource_plans, company_expenses, projects, employees, clients RESTART IDENTITY CASCADE;
        `);
        console.log('Database cleared.');

        // 2. Generate Data
        const NUM_CLIENTS = 20;
        const NUM_EMPLOYEES = 50;
        const NUM_PROJECTS = 50;
        const NUM_EXPENSES = 100;

        console.log(`Generating ${NUM_CLIENTS} clients...`);
        const clientValues = [];
        for (let i = 0; i < NUM_CLIENTS; i++) {
            const name = `${randomChoice(clientAdjectives)} ${randomChoice(clientNouns)}`;
            const industry = randomChoice(industries);
            clientValues.push(`('${name}', '${industry}')`);
        }
        const clientsResult = await db.query(`
            INSERT INTO clients (name, industry) VALUES 
            ${clientValues.join(',\n')}
            RETURNING id;
        `);
        const clientIds = clientsResult.rows.map(r => r.id);

        console.log(`Generating ${NUM_EMPLOYEES} employees...`);
        const employeeValues = [];
        for (let i = 0; i < NUM_EMPLOYEES; i++) {
            const name = `${randomChoice(firstNames)} ${randomChoice(lastNames)}`;
            const role = randomChoice(roles);
            const status = 'Active';
            const specialization = randomChoice(types);
            const monthly_salary = specialization === 'T&M' ? 0 : randomInt(60000, 150000);
            const hourly_rate = specialization === 'T&M' ? randomInt(40, 150) : 0;
            employeeValues.push(`('${name.replace(/'/g, "''")}', '${role}', '${status}', ${monthly_salary}, '${specialization}', ${hourly_rate})`);
        }
        const empRes = await db.query(`
            INSERT INTO employees (name, role, status, monthly_salary, specialization, hourly_rate) VALUES 
            ${employeeValues.join(',\n')}
            RETURNING id;
        `);
        const empIds = empRes.rows.map(r => r.id);

        console.log(`Generating ${NUM_PROJECTS} realistic projects...`);
        const projectValues = [];
        const prpValues = [];

        for (let j = 0; j < NUM_PROJECTS; j++) {
            const cId = randomChoice(clientIds);
            const name = `${randomChoice(projectAdjectives)} ${randomChoice(projectNouns)}`;
            const type = randomChoice(types);
            // Realistic revenue: 5 Lakhs to 2 Crores (500,000 to 20,000,000)
            const revenue = randomInt(500000, 20000000);
            const startStr = randomDate(new Date(2024, 0, 1), new Date(2025, 0, 1)).toISOString().split('T')[0];
            const endStr = Math.random() > 0.2 ? `'${randomDate(new Date(2025, 0, 1), new Date(2026, 0, 1)).toISOString().split('T')[0]}'` : 'NULL';
            const status = Math.random() > 0.6 ? 'Completed' : 'Active';

            projectValues.push(`(${cId}, '${name.replace(/'/g, "''")}', '${type}', '${status}', ${revenue}, '${startStr}', ${endStr})`);
        }

        const pRes = await db.query(`
            INSERT INTO projects (client_id, name, type, status, revenue_earned, start_date, deadline) VALUES
            ${projectValues.join(',\n')}
            RETURNING id;
        `);
        const pIds = pRes.rows.map(r => r.id);

        for (const pid of pIds) {
            const numEmps = randomInt(1, 4);
            for (let k = 0; k < numEmps; k++) {
                const eId = randomChoice(empIds);
                const alloc = randomInt(20, 100);
                prpValues.push(`(${pid}, ${eId}, ${alloc})`);
            }
        }
        await db.query(`
            INSERT INTO project_resource_plans (project_id, employee_id, allocation_percentage) VALUES
            ${prpValues.join(',\n')}
        `);

        console.log(`Generating ${NUM_EXPENSES} realistic company expenses...`);
        const expenseValues = [];
        for (let j = 0; j < NUM_EXPENSES; j++) {
            const category = randomChoice(expenseCategories);
            // Realistic expenses: 50,000 to 10 Lakhs (1,000,000)
            const amount = randomInt(50000, 1000000);
            const dateStr = randomDate(new Date(2024, 0, 1), new Date(2026, 0, 1)).toISOString().split('T')[0];
            expenseValues.push(`('${category}', ${amount}, '${dateStr}')`);
        }
        await db.query(`
            INSERT INTO company_expenses (category, amount, date) VALUES
            ${expenseValues.join(',\n')}
        `);

        console.log('Realistic dataset seeded successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding data:', err);
        process.exit(1);
    }
}

seed();
