const API_URL = 'http://localhost:5001/api';

async function runVerification() {
    try {
        console.log("Starting Verification...");

        // Helper for fetch
        const post = async (url, data) => {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error(`POST ${url} failed: ${res.statusText} ${await res.text()}`);
            return res.json();
        };

        const get = async (url) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`GET ${url} failed: ${res.statusText}`);
            return res.json();
        };

        // 1. Create Employees
        console.log("\n1. Creating Employees...");
        const empFixed = await post(`${API_URL}/employees`, {
            name: "Test Fixed " + Date.now(),
            role: "Dev",
            status: "Active",
            specialization: "Fixed Bid",
            hourly_rate: 100
        });
        console.log("Created Fixed Emp:", empFixed.id, empFixed.hourly_rate);

        const empTM = await post(`${API_URL}/employees`, {
            name: "Test TM " + Date.now(),
            role: "Dev",
            status: "Active",
            specialization: "T&M",
            monthly_salary: 5000
        });
        console.log("Created T&M Emp:", empTM.id, empTM.monthly_salary);

        // 2. Create Projects and Allocations

        // A. Fixed Bid Project
        console.log("\n2a. Testing Fixed Bid Project...");
        // Create Project
        const projFixed = await post(`${API_URL}/projects`, {
            clientId: 1, // Assuming client 1 exists
            name: "Test Project Fixed " + Date.now(),
            type: "Fixed Bid",
            status: "Active",
            revenue: 10000,
            costs: 0,
            startDate: new Date(),
            deadline: new Date(Date.now() + 86400000 * 30) // 30 days
        });
        console.log("Created Fixed Project:", projFixed.id);

        // Add Resource (Hours)
        const hours = 10;
        await post(`${API_URL}/employees/allocations`, {
            projectId: projFixed.id,
            employeeId: empFixed.id,
            allocationPercentage: hours,
            startDate: new Date()
        });
        console.log(`Added Allocation: ${hours} hours`);

        // Fetch Project to check Cost
        const projects = await get(`${API_URL}/projects`);
        const fetchedFixed = projects.find(p => p.id === projFixed.id);

        // Expected Cost = Hours * Rate = 10 * 100 = 1000
        console.log("Fixed Project Cost from API:", fetchedFixed.employee_costs);
        if (Number(fetchedFixed.employee_costs) === 1000) {
            console.log("SUCCESS: Fixed Bid Cost Correct");
        } else {
            console.error("FAILURE: Fixed Bid Cost Incorrect. Expected 1000");
        }


        // B. T&M Project
        console.log("\n2b. Testing T&M Project...");
        // Create Project
        const projTM = await post(`${API_URL}/projects`, {
            clientId: 1,
            name: "Test Project TM " + Date.now(),
            type: "T&M",
            status: "Active",
            revenue: 20000,
            costs: 0,
            startDate: new Date(),
            deadline: new Date(Date.now() + 86400000 * 60) // 60 days (~2 months)
        });
        console.log("Created T&M Project:", projTM.id);

        // Add Resource (%)
        const allocation = 50; // 50%
        await post(`${API_URL}/employees/allocations`, {
            projectId: projTM.id,
            employeeId: empTM.id,
            allocationPercentage: allocation,
            startDate: new Date()
        });
        console.log(`Added Allocation: ${allocation}%`);

        // Fetch Project to check Cost
        const projects2 = await get(`${API_URL}/projects`);
        const fetchedTM = projects2.find(p => p.id === projTM.id);

        console.log("T&M Project Cost from API:", fetchedTM.employee_costs);

        // 60 days / 30.44 = 1.971 months
        // 5000 * 0.5 * 1.971 = ~4927
        const diffTime = (new Date(fetchedTM.deadline) - new Date(fetchedTM.start_date));
        const diffMonths = diffTime / (1000 * 60 * 60 * 24 * 30.44);
        const expectedCost = 5000 * 0.5 * diffMonths;
        console.log("Expected Cost:", expectedCost);

        if (Math.abs(Number(fetchedTM.employee_costs) - expectedCost) < 100) {
            console.log("SUCCESS: T&M Cost roughly correct");
        } else {
            console.error("FAILURE: T&M Cost significantly different");
            console.log("Debug Info:", JSON.stringify(fetchedTM.debug_info, null, 2));
        }

    } catch (err) {
        console.error("Verification Failed:", err.message);
    }
}

runVerification();
