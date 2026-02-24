const pool = require('./index');

async function clearDatabase() {
    console.log('Clearing database...');
    try {
        await pool.query(`
      TRUNCATE TABLE 
        project_resource_plans, 
        projects, 
        clients, 
        employees, 
        company_expenses 
      RESTART IDENTITY CASCADE;
    `);
        console.log('All tables have been successfully cleared and IDs reset.');
    } catch (err) {
        console.error('Error clearing database:', err);
    } finally {
        process.exit(0);
    }
}

clearDatabase();
