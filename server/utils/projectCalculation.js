const calculateProjectFinancials = (project, allPlans, allUnapprovedLogs = [], allApprovedLogs = []) => {
    const projectPlans = allPlans.filter(p => Number(p.project_id) === Number(project.id));
    const projectLogs = allUnapprovedLogs.filter(l => Number(l.project_id) === Number(project.id));
    const projectApprovedAggregates = allApprovedLogs.filter(a => Number(a.project_id) === Number(project.id));

    let computedRevenue = Number(project.revenue_earned) || 0;
    let totalLockedStaffBurn = 0;
    let enhancedPlans = [];

    if (projectPlans.length > 0) {
        projectPlans.forEach((plan) => {
            let approvedRevenue = 0;
            let totalHours = 0;

            // 1. Fetch Approved Aggregates (Hours & Revenue)
            const agg = projectApprovedAggregates.find(a => Number(a.employee_id) === Number(plan.employee_id));
            if (agg) {
                totalHours = Number(agg.total_hours) || 0;
                approvedRevenue = Number(agg.total_inr_revenue) || 0;
            }

            // 2. Internal Rate Calculation (Salary / 176)
            const monthlySalary = Number(plan.monthly_salary) || 0;
            const internalHourlyRate = monthlySalary / 176;

            // 3. Burn Calculation based strictly on Logged Hours
            const planBurn = totalHours * internalHourlyRate;
            totalLockedStaffBurn += planBurn;

            // 4. Performance Categorization
            // Profit Generators: (Revenue - Burn) > 0
            const netContribution = approvedRevenue - planBurn;
            const performance_category = netContribution > 0 ? 'GENERATOR' : 'BURDEN';

            enhancedPlans.push({
                name: plan.name,
                role: plan.role,
                employee_id: plan.employee_id,
                salary: monthlySalary,
                internalHourlyRate: internalHourlyRate,
                totalHours: totalHours,
                totalPlanCost: planBurn,
                totalPlanRevenue: approvedRevenue,
                netProfitOrLoss: netContribution,
                performance_category: performance_category,
                zeroHourNote: totalHours === 0 ? "No billable activity logged." : null,
                allocation_percentage: plan.allocation_percentage,
                hourly_rate: plan.hourly_rate,
                usd_rate: Number(plan.usd_rate || plan.default_usd_rate || 0)
            });
        });
    }

    // --- Financial Segments (Projected Revenue for T&M) ---
    let projectedRevenue = 0;
    if (project.type === 'T&M') {
        const fallbackRate = 83.15;
        projectLogs.forEach(log => {
            const hrs = Number(parseFloat(Number(log.hours_worked) || 0).toFixed(2));
            const usdRate = Number(log.usd_hourly_rate) || 0;
            projectedRevenue += (hrs * usdRate * fallbackRate);
        });
    }

    const margin = computedRevenue - totalLockedStaffBurn;

    return {
        ...project,
        employee_costs: totalLockedStaffBurn,
        revenue_earned: computedRevenue,
        projectedRevenue: projectedRevenue,
        margin: margin,
        is_calculated_cost: true,
        debug_info: {
            type: project.type,
            plans: enhancedPlans,
            unapprovedLogs: projectLogs.length,
            totalLockedStaffBurn: totalLockedStaffBurn
        }
    };
};

module.exports = { calculateProjectFinancials };
