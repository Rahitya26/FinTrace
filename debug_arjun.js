const db = require('./server/db');

async function debugArjun() {
    try {
        const arjun = await db.query("SELECT * FROM employees WHERE name ILIKE '%Arjun%'");
        if (arjun.rows.length === 0) {
            console.log("Arjun not found");
            return;
        }
        const empId = arjun.rows[0].id;
        console.log("Arjun ID:", empId, "Salary:", arjun.rows[0].monthly_salary);

        const plans = await db.query("SELECT * FROM project_resource_plans WHERE employee_id = $1", [empId]);
        console.log("\nResource Plans:");
        plans.rows.forEach(p => console.log(`Project ${p.project_id}: ${p.start_date} to ${p.end_date}, Alloc: ${p.allocation_percentage}%`));

        const logs = await db.query("SELECT * FROM timesheet_logs WHERE employee_id = $1 ORDER BY date", [empId]);
        console.log("\nLogs:");
        logs.rows.forEach(l => console.log(`${l.date}: ${l.hours_worked} hrs, Project ${l.project_id}`));

        const projects = await db.query("SELECT * FROM projects WHERE id IN (SELECT project_id FROM project_resource_plans WHERE employee_id = $1)", [empId]);
        console.log("\nProjects:");
        projects.rows.forEach(p => console.log(`ID ${p.id}: ${p.name}, Type: ${p.billing_type}, Value: ${p.fixed_contract_value}`));

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

debugArjun();
