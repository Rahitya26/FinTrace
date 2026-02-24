require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('./index');

const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Lisa', 'Daniel', 'Nancy', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley', 'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores'];

const clientAdjectives = ['Global', 'Advanced', 'Apex', 'Pinnacle', 'Synergy', 'Quantum', 'Dynamic', 'NextGen', 'Stellar', 'Prime', 'Innovative', 'Eco', 'Digital', 'Smart', 'Elite', 'Vertex', 'Visionary', 'Infinite', 'Pro', 'Neo'];
const clientNouns = ['Solutions', 'Technologies', 'Systems', 'Networks', 'Corporation', 'Industries', 'Enterprises', 'Group', 'Partners', 'Logistics', 'Holdings', 'Ventures', 'Labs', 'Dynamics', 'Consulting', 'Innovations', 'Services', 'Interactive', 'Tech', 'Studios'];
const industries = ['Technology', 'Finance', 'Healthcare', 'Retail', 'Logistics', 'Manufacturing', 'Education', 'Entertainment', 'Energy', 'Real Estate'];

const projectAdjectives = ['Mobile', 'Web', 'Cloud', 'Data', 'AI', 'Security', 'Enterprise', 'Legacy', 'IoT', 'Infrastructure', 'ERP', 'CRM', 'Blockchain', 'E-commerce', 'Machine Learning'];
const projectNouns = ['Migration', 'Modernization', 'Integration', 'Upgrade', 'Overhaul', 'Implementation', 'Transformation', 'Audit', 'Dashboard', 'Platform', 'Engine', 'App', 'Portal', 'Service', 'API'];

const roles = ['Software Engineer', 'Senior Developer', 'Project Manager', 'Product Manager', 'UX Designer', 'Data Scientist', 'DevOps Engineer', 'QA Tester', 'Business Analyst', 'System Administrator'];
const types = ['Fixed Bid', 'T&M', 'Fixed Value'];

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
        console.log('Seeding massive dataset...');

        // Let's add 500 Clients, 2,000 Employees, and 10,000 Projects.
        const NUM_CLIENTS = 500;
        const NUM_EMPLOYEES = 2000;
        const NUM_PROJECTS = 10000;

        console.log(`Generating ${NUM_CLIENTS} clients...`);
        const clientValues = [];
        for (let i = 0; i < NUM_CLIENTS; i++) {
            const name = `${randomChoice(clientAdjectives)} ${randomChoice(clientNouns)} ${randomInt(100, 999)}`;
            const industry = randomChoice(industries);
            clientValues.push(`('${name}', '${industry}')`);
        }

        // Batch insert clients (PostgreSQL has limit on parameters, doing multi-row insert by concatenating)
        const clientsResult = await db.query(`
            INSERT INTO clients (name, industry) VALUES 
            ${clientValues.join(',\n')}
            RETURNING id;
        `);
        const clientIds = clientsResult.rows.map(r => r.id);

        console.log(`Generating ${NUM_EMPLOYEES} employees...`);
        const employeeValues = [];
        for (let i = 0; i < NUM_EMPLOYEES; i++) {
            const name = `${randomChoice(firstNames)} ${randomChoice(lastNames)} ${randomInt(1, 9999)}`;
            const role = randomChoice(roles);
            const status = 'Active'; // To respect db constraint
            const specialization = randomChoice(types);
            const monthly_salary = specialization === 'T&M' ? 0 : randomInt(60000, 150000);
            const hourly_rate = specialization === 'T&M' ? randomInt(40, 150) : 0;
            employeeValues.push(`('${name.replace(/'/g, "''")}', '${role}', '${status}', ${monthly_salary}, '${specialization}', ${hourly_rate})`);
        }

        // Chunk employee inserts to avoid query string length limits
        const EMP_CHUNK_SIZE = 500;
        const empIds = [];
        for (let i = 0; i < employeeValues.length; i += EMP_CHUNK_SIZE) {
            const chunk = employeeValues.slice(i, i + EMP_CHUNK_SIZE);
            const empRes = await db.query(`
                INSERT INTO employees (name, role, status, monthly_salary, specialization, hourly_rate) VALUES 
                ${chunk.join(',\n')}
                RETURNING id;
            `);
            empIds.push(...empRes.rows.map(r => r.id));
        }

        console.log(`Generating ${NUM_PROJECTS} projects and allocations...`);
        let projectCount = 0;
        let prpValues = [];
        const PRP_CHUNK_SIZE = 2000;

        // Using parameterized queries for projects to handle random dates correctly, but large multi-inserts
        for (let i = 0; i < NUM_PROJECTS; i += EMP_CHUNK_SIZE) {
            const chunkLimit = Math.min(EMP_CHUNK_SIZE, NUM_PROJECTS - i);
            const projectValues = [];
            for (let j = 0; j < chunkLimit; j++) {
                const cId = randomChoice(clientIds);
                const name = `${randomChoice(projectAdjectives)} ${randomChoice(projectNouns)} ${randomInt(1, 9999)}`;
                const type = randomChoice(types);
                const revenue = randomInt(50000, 5000000);
                const startStr = randomDate(new Date(2023, 0, 1), new Date(2025, 0, 1)).toISOString().split('T')[0];
                const endStr = Math.random() > 0.2 ? `'${randomDate(new Date(2025, 0, 1), new Date(2027, 0, 1)).toISOString().split('T')[0]}'` : 'NULL';
                const status = Math.random() > 0.8 ? 'Completed' : 'Active';
                projectValues.push(`(${cId}, '${name.replace(/'/g, "''")}', '${type}', '${status}', ${revenue}, '${startStr}', ${endStr})`);
            }

            const pRes = await db.query(`
                INSERT INTO projects (client_id, name, type, status, revenue_earned, start_date, deadline) VALUES
                ${projectValues.join(',\n')}
                RETURNING id;
            `);

            const pIds = pRes.rows.map(r => r.id);

            // Give each project 1-5 employees
            for (const pid of pIds) {
                const numEmps = randomInt(1, 5);
                for (let k = 0; k < numEmps; k++) {
                    const eId = randomChoice(empIds);
                    const alloc = randomInt(10, 100);
                    prpValues.push(`(${pid}, ${eId}, ${alloc})`);
                }
            }

            projectCount += chunkLimit;
            console.log(`Inserted ${projectCount} projects...`);
        }

        console.log(`Inserting allocations...`);
        for (let i = 0; i < prpValues.length; i += PRP_CHUNK_SIZE) {
            const chunk = prpValues.slice(i, i + PRP_CHUNK_SIZE);
            await db.query(`
                INSERT INTO project_resource_plans (project_id, employee_id, allocation_percentage) VALUES
                ${chunk.join(',\n')}
            `);
        }

        console.log('Massive dataset seeded successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding data:', err);
        process.exit(1);
    }
}

seed();
