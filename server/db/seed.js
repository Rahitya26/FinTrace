const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const seedData = async () => {
    try {
        console.log('Connecting to database...');

        // Clear existing data (optional, but good for resetting)
        console.log('Clearing old data...');
        await pool.query('TRUNCATE TABLE projects, clients, company_expenses RESTART IDENTITY CASCADE');

        // Insert Clients
        console.log('Inserting Clients...');
        const clientRes = await pool.query(`
      INSERT INTO clients (name, industry) VALUES
      ('Acme Corp', 'Technology'),
      ('Globex Inc', 'Manufacturing'),
      ('Soylent Corp', 'Food & Beverage')
      RETURNING *
    `);
        const clients = clientRes.rows;

        // Insert Projects
        console.log('Inserting Projects...');
        await pool.query(`
      INSERT INTO projects (client_id, name, type, revenue_earned, employee_costs) VALUES
      ($1, 'Q4 Cloud Migration', 'T&M', 150000.00, 90000.00),
      ($1, 'Maintenance Contract', 'Fixed Value', 50000.00, 10000.00),
      ($2, 'Factory Automation', 'Fixed Bid', 250000.00, 180000.00),
      ($3, 'Website Redesign', 'T&M', 80000.00, 40000.00)
    `, [clients[0].id, clients[1].id, clients[2].id]);

        // Insert Expenses
        console.log('Inserting Company Expenses...');
        await pool.query(`
      INSERT INTO company_expenses (category, amount, date, description) VALUES
      ('Rent/Office', 2500.00, '2023-11-01', 'Monthly Office Rent'),
      ('Software/SaaS', 150.00, '2023-11-05', 'Jira & Confluence'),
      ('Travel', 1200.00, '2023-11-10', 'Client Visit - NYC'),
      ('Marketing', 5000.00, '2023-11-15', 'Q4 Ad Campaign')
    `);

        console.log('✅ Dummy data seeded successfully!');
    } catch (err) {
        console.error('Error seeding data:', err);
    } finally {
        await pool.end();
    }
};

seedData();
