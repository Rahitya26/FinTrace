const calculateProjectFinancials = (project, allPlans, allUnapprovedLogs = [], allApprovedLogs = []) => {
    const projectPlans = allPlans.filter(p => Number(p.project_id) === Number(project.id));
    const projectLogs = allUnapprovedLogs.filter(l => Number(l.project_id) === Number(project.id));
    const projectApprovedAggregates = allApprovedLogs.filter(a => Number(a.project_id) === Number(project.id));

    let computedCost = 0;
    let computedRevenue = Number(project.revenue_earned) || 0;
    let debugInfo = { type: project.type, plans: [] };

    let totalMonthlyBurn = 0;
    let totalMonthlyRevenue = 0;
    let dailyBurn = 0;
    let enhancedPlans = [];
    const today = new Date();

    if (projectPlans.length > 0) {
        computedCost = projectPlans.reduce((sum, plan) => {
            let approvedRevenue = 0;
            let approvedCost = 0;
            let approvedHours = 0;

            const agg = projectApprovedAggregates.find(a => Number(a.employee_id) === Number(plan.employee_id));
            if (agg) {
                approvedHours = Number(agg.total_hours) || 0;
                approvedRevenue = Number(agg.total_inr_revenue) || 0;
                approvedCost = Number(agg.total_inr_cost) || 0;
            }

            const allocation = project.type === 'T&M' ? 1 : (Number(plan.allocation_percentage) / 100);
            const salary = Number(plan.monthly_salary) || 0;
            const planMonthlyBurn = salary * allocation;

            const todayStr = today.toISOString().split('T')[0];
            const planEndDateStr = plan.end_date ? new Date(plan.end_date).toISOString().split('T')[0] : null;
            const isOffboarded = planEndDateStr && planEndDateStr <= todayStr;

            if (project.type !== 'T&M' && !isOffboarded) {
                dailyBurn += (planMonthlyBurn / 22);
            }

            let planMonthlyRevenue = 0;
            if (project.type === 'T&M') {
                const hourlyRate = Number(plan.hourly_rate) || 0;
                planMonthlyRevenue = hourlyRate * 160;
                if (!isOffboarded) {
                    totalMonthlyBurn += (planMonthlyRevenue * 0.70); // Keep reference burn for margin
                }
            }

            if (!isOffboarded) {
                totalMonthlyRevenue += planMonthlyRevenue;
            }

            const planStartDate = plan.start_date ? new Date(plan.start_date) : new Date(project.start_date);

            let durationMonths = 0;
            let workingDays = 0;
            if (today > planStartDate) {
                let calculationEndDate = new Date();
                if (plan.end_date) {
                    calculationEndDate = new Date(plan.end_date);
                } else if (project.status === 'Completed' && project.deadline) {
                    calculationEndDate = new Date(project.deadline);
                }

                // Cap "Current Burn" at today. If offboarded in the past, calculationEndDate is their past end_date (freezes cost).
                if (calculationEndDate > today) {
                    calculationEndDate = new Date();
                }

                const diffTime = Math.max(0, calculationEndDate - planStartDate);
                durationMonths = diffTime / (1000 * 60 * 60 * 24 * 30.44);

                let d = new Date(planStartDate.getTime());
                while (d <= calculationEndDate) {
                    const day = d.getDay();
                    if (day !== 0 && day !== 6) workingDays++;
                    d.setDate(d.getDate() + 1);
                }
            }

            let planTotalCost = 0;
            if (project.type === 'T&M') {
                planTotalCost = 0; // T&M cost is handled separately by DB + Logs
            } else {
                planTotalCost = (planMonthlyBurn / 22) * workingDays;
                if (!isOffboarded) {
                    totalMonthlyBurn += planMonthlyBurn;
                }
            }

            const existingPlan = enhancedPlans.find(p => Number(p.employee_id) === Number(plan.employee_id));
            if (existingPlan) {
                if (project.type !== 'T&M') {
                    existingPlan.totalPlanCost += planTotalCost;
                    existingPlan.workingDays += workingDays;
                    existingPlan.durationMonths += durationMonths;
                }
                if (!isOffboarded) {
                    existingPlan.offboarded = false;
                    existingPlan.calc_monthly_burn = project.type === 'T&M' ? (planMonthlyRevenue * 0.70) : planMonthlyBurn;
                }
            } else {
                enhancedPlans.push({
                    name: plan.name,
                    employee_id: plan.employee_id,
                    alloc: plan.allocation_percentage,
                    salary: plan.monthly_salary,
                    hourly_rate: plan.hourly_rate,
                    calc_alloc: allocation,
                    calc_salary: salary,
                    offboarded: isOffboarded,
                    durationMonths: durationMonths,
                    workingDays: workingDays,
                    totalPlanCost: project.type === 'T&M' ? approvedCost : planTotalCost,
                    totalPlanRevenue: project.type === 'T&M' ? approvedRevenue : 0,
                    totalHours: approvedHours,
                    calc_monthly_burn: project.type === 'T&M' ? (planMonthlyRevenue * 0.70) : planMonthlyBurn
                });
            }

            return sum + planTotalCost;
        }, 0);

        // For Fixed Value / Fixed Bid, ensure computedRevenue retains its static value from the DB
        if (project.type !== 'T&M') {
            computedRevenue = Number(project.revenue_earned) || 0;
        } else {
            computedRevenue = Number(project.revenue_earned) || 0;
            computedCost = Number(project.employee_costs) || 0;

            projectLogs.forEach(log => {
                const hrs = Number(log.hours_worked) || 0;
                const usdRate = Number(log.usd_hourly_rate) || 0;
                const inrRate = Number(log.inr_hourly_rate) || 0;

                computedRevenue += (hrs * usdRate * 84); // Standard projection FX
                computedCost += (hrs * inrRate);

                // Add to enhanced plans as 'Projected' if not already approved?
                // For simplicity, tooltips will show 'Approved' metrics.
            });
        }

        debugInfo = {
            type: project.type,
            monthlyBurn: totalMonthlyBurn,
            monthlyRevenue: totalMonthlyRevenue,
            dailyBurn: dailyBurn,
            durationMonths: 'Dynamic per-resource',
            plans: enhancedPlans,
            unapprovedLogs: projectLogs.length
        };
    } else {
        if (project.type === 'T&M') {
            computedRevenue = Number(project.revenue_earned) || 0;
            computedCost = Number(project.employee_costs) || 0;

            projectLogs.forEach(log => {
                const hrs = Number(log.hours_worked) || 0;
                const usdRate = Number(log.usd_hourly_rate) || 0;
                const inrRate = Number(log.inr_hourly_rate) || 0;

                computedRevenue += (hrs * usdRate * 84);
                computedCost += (hrs * inrRate);
            });
        }
    }

    return {
        ...project,
        employee_costs: computedCost,
        revenue_earned: computedRevenue,
        computedCost,
        computedRevenue,
        margin: computedRevenue - computedCost,
        is_calculated_cost: true,
        debug_info: debugInfo
    };
};

module.exports = { calculateProjectFinancials };
