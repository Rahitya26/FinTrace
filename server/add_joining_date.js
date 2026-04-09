require('dotenv').config(); 
const db = require('./db/index'); 

async function run() {
    try {
        console.log("Adding joining_date to employees table...");
        await db.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS joining_date DATE DEFAULT '2026-02-01'`);
        
        // Ensure any existing rows that might somehow be NULL get populated
        await db.query(`UPDATE employees SET joining_date = '2026-02-01' WHERE joining_date IS NULL`);
        
        console.log("Migration successful.");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        process.exit(0);
    }
}

run();
