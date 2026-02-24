const API_URL = 'http://localhost:5001/api';

async function cleanup() {
    try {
        console.log("Starting Cleanup...");

        const get = async (url) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`GET ${url} failed`);
            return res.json();
        };

        const del = async (url) => {
            const res = await fetch(url, { method: 'DELETE' });
            if (!res.ok) console.warn(`DELETE ${url} failed: ${res.statusText}`);
            return res;
        };

        // 1. Delete Test Employees
        const employees = await get(`${API_URL}/employees`);
        const testEmployees = employees.filter(e => e.name.startsWith("Test ") || e.name.startsWith("Dev "));

        console.log(`Found ${testEmployees.length} test employees.`);
        for (const emp of testEmployees) {
            await del(`${API_URL}/employees/${emp.id}`);
            console.log(`Deleted Employee: ${emp.name}`);
        }

        // 2. Delete Test Projects
        const projects = await get(`${API_URL}/projects`);
        const testProjects = projects.filter(p => p.name.startsWith("Test "));

        console.log(`Found ${testProjects.length} test projects.`);
        for (const proj of testProjects) {
            await del(`${API_URL}/projects/${proj.id}`);
            console.log(`Deleted Project: ${proj.name}`);
        }

        console.log("Cleanup Complete.");

    } catch (err) {
        console.error("Cleanup Failed:", err.message);
    }
}

cleanup();
