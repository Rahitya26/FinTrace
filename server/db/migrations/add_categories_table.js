require('dotenv').config({ path: './server/.env' }); // Load env vars from server/.env
const db = require('../index'); // Still using db from index if it exports it, OR better to use db/index.js directly.
// Wait, let's look at server/db/index.js first.

(async () => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS expense_categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                is_default BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Seed defaults
        const defaults = [
            'Rent/Office',
            'Software/SaaS',
            'Marketing',
            'Legal/Professional',
            'Travel',
            'Salaries (Admin)',
            'Other'
        ];

        for (const cat of defaults) {
            await db.query(`
                INSERT INTO expense_categories (name, is_default)
                VALUES ($1, true)
                ON CONFLICT (name) DO NOTHING;
            `, [cat]);
        }

        console.log('Expense categories table created and seeded.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
