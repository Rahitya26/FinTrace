require('dotenv').config({ path: __dirname + '/../.env' });
const db = require('./index');

const expenseCategories = ['AWS Hosting', 'Office Rent', 'Software Licenses', 'Marketing Campaign', 'Hardware Equipment', 'Legal Fees', 'Consulting Services', 'Travel', 'Employee Benefits', 'Utilities', 'Maintenance', 'Insurance'];

function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seedExpenses() {
    try {
        console.log('Seeding massive company expenses to balance datasets...');

        // Clear existing small expenses? Let's just append
        const NUM_EXPENSES = 10000;

        console.log(`Generating ${NUM_EXPENSES} large company expenses...`);
        const CHUNK_SIZE = 1000;
        let expenseCount = 0;

        for (let i = 0; i < NUM_EXPENSES; i += CHUNK_SIZE) {
            const chunkLimit = Math.min(CHUNK_SIZE, NUM_EXPENSES - i);
            const expenseValues = [];

            for (let j = 0; j < chunkLimit; j++) {
                const category = randomChoice(expenseCategories);
                // We want high value expenses so it balances the billions of revenue.
                // 10,000 expenses of 1,000,000 is 10 Billion. Let's do 500k to 3M
                const amount = randomInt(500000, 3000000);
                const dateStr = randomDate(new Date(2025, 0, 1), new Date(2026, 11, 31)).toISOString().split('T')[0];

                expenseValues.push(`('${category}', ${amount}, '${dateStr}')`);
            }

            await db.query(`
                INSERT INTO company_expenses (category, amount, date) VALUES
                ${expenseValues.join(',\n')}
            `);

            expenseCount += chunkLimit;
            console.log(`Inserted ${expenseCount} company expenses...`);
        }

        console.log('Massive expenses dataset seeded successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding data:', err);
        process.exit(1);
    }
}

seedExpenses();
