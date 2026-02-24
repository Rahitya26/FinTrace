const API_URL = 'http://localhost:5001/api';

async function verify() {
    try {
        console.log("1. Fetching Projects...");
        const projectsRes = await fetch(`${API_URL}/projects`);
        const projects = await projectsRes.json();

        if (projects.length === 0) {
            console.log("No projects found. Skipping verification.");
            return;
        }

        const project = projects[0];
        console.log(`Checking resources for Project: ${project.name} (ID: ${project.id})`);

        // Get resources
        const start = Date.now();
        const resourcesRes = await fetch(`${API_URL}/projects/${project.id}/resources`);
        if (!resourcesRes.ok) throw new Error(`Failed to fetch resources: ${resourcesRes.statusText}`);

        const resources = await resourcesRes.json();
        console.log(`Fetch took ${Date.now() - start}ms`);
        console.log(`Found ${resources.length} resources.`);

        if (resources.length > 0) {
            console.log("Sample Resource:", resources[0]);
            if (!resources[0].name || !resources[0].employee_id) {
                console.error("FAIL: Resource data missing expected fields (name, employee_id)");
            } else {
                console.log("PASS: Resource data structure looks correct.");
            }
        } else {
            console.log("Note: Project has no resources. Please assign some manually to fully verify.");
        }

    } catch (err) {
        console.error("Verification Failed:", err);
    }
}

verify();
