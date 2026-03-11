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

            // --- HUD Fix Root calculation ---
            const planDailyBurn = planMonthlyBurn / 30; // Rule: Monthly Salary / 30
            if (!isOffboarded) {
                dailyBurn += planDailyBurn;
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
            let actualDaysElapsed = 0;

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
                actualDaysElapsed = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

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
                // Keep salary logic for Fixed Bid current status, but we use working days for "To Date" cost
                // whereas "Daily Burn" for HUD/Tooltip uses /30.
                planTotalCost = (planMonthlyBurn / 22) * workingDays;
                if (!isOffboarded) {
                    totalMonthlyBurn += planMonthlyBurn;
                }
            }

            // --- Performance Categorization Logic ---
            let performance_category = 'NEUTRAL';

            if (project.type === 'T&M') {
                const billedRev = approvedRevenue;
                const costLimit = approvedCost * 1.20; // Needs 20% margin to be a generator

                if (billedRev >= costLimit && billedRev > 0) {
                    performance_category = 'GENERATOR';
                } else if (billedRev < approvedCost || (approvedHours > 0 && billedRev === 0)) {
                    performance_category = 'BURDEN';
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
                if (project.type === 'T&M') {
                    // Update category if combining data shifted the metrics
                    const combRev = existingPlan.totalPlanRevenue;
                    const combCost = existingPlan.totalPlanCost;
                    if (combRev >= (combCost * 1.20) && combRev > 0) existingPlan.performance_category = 'GENERATOR';
                    else if (combRev < combCost) existingPlan.performance_category = 'BURDEN';
                }
                existingPlan.daysSinceAssignment += actualDaysElapsed;
            } else {
                enhancedPlans.push({
                    name: plan.name,
                    role: plan.role,
                    employee_id: plan.employee_id,
                    alloc: plan.allocation_percentage,
                    salary: plan.monthly_salary,
                    hourly_rate: plan.hourly_rate,
                    calc_alloc: allocation,
                    calc_salary: salary,
                    offboarded: isOffboarded,
                    durationMonths: durationMonths,
                    workingDays: workingDays,
                    actualDaysElapsed: actualDaysElapsed,
                    daysSinceAssignment: actualDaysElapsed,
                    dailySalaryBurn: planDailyBurn,
                    totalPlanCost: project.type === 'T&M' ? approvedCost : planTotalCost,
                    totalPlanRevenue: project.type === 'T&M' ? approvedRevenue : 0,
                    totalHours: approvedHours,
                    calc_monthly_burn: project.type === 'T&M' ? (planMonthlyRevenue * 0.70) : planMonthlyBurn,
                    performance_category: performance_category,
                    netProfitOrLoss: project.type === 'T&M' ? (approvedRevenue - approvedCost) : 0
                });
            }

            return sum + planTotalCost;
        }, 0);

        // --- Financial segments (Segregation of Actual vs Projected) ---
        let projectedRevenue = 0;
        let projectedCost = 0;

        if (project.type === 'T&M') {
            // Actuals from approved logs
            computedRevenue = Number(project.revenue_earned) || 0;
            computedCost = Number(project.employee_costs) || 0;

            // Projections from unapproved logs
            projectLogs.forEach(log => {
                const hrs = Number(parseFloat(Number(log.hours_worked) || 0).toFixed(2));
                const usdRate = Number(log.usd_hourly_rate) || 0;
                const inrRate = Number(log.inr_hourly_rate) || 0;

                // Rule: Default to 83.15 if locked_exchange_rate is null (Standard projection fallback)
                projectedRevenue += (hrs * usdRate * 83.15);
                projectedCost += (hrs * inrRate);
            });
        } else {
            // Fixed Bid: Revenue is budget-locked upon completion/overdue
            const isOverdue = project.deadline && new Date(project.deadline) < today;
            if (project.status === 'Completed' || isOverdue) {
                const budget = Number(project.debug_info?.quotedBid) || Number(project.revenue_earned) || 0;
                computedRevenue = budget;
            } else {
                computedRevenue = Number(project.revenue_earned) || 0;
            }
            computedCost = Number(project.employee_costs) || 0;
        }

        debugInfo.projectedRevenue = projectedRevenue;
        debugInfo.projectedCost = projectedCost;
        debugInfo.totalUnapprovedHours = projectLogs.reduce((sum, log) => sum + Number(log.hours_worked), 0);

        // --- Post-Loop Fixed Bid/Value & Metric Synthesis ---
        const totalActiveResources = enhancedPlans.filter(p => !p.offboarded).length || 1;
        let dailyBudgetPerResource = 0;

        if (project.type !== 'T&M') {
            const projectMargin = computedRevenue - computedCost;

            // Calculate project daily budget (Revenue / Total Working Days in Deadline)
            let dailyBudget = 0;
            if (project.deadline && project.start_date) {
                const deadline = new Date(project.deadline);
                const start = new Date(project.start_date);
                if (deadline > start) {
                    const totalDays = Math.ceil((deadline - start) / (1000 * 60 * 60 * 24));
                    dailyBudget = computedRevenue / Math.max(1, totalDays);
                }
            }
            dailyBudgetPerResource = dailyBudget / totalActiveResources;

            enhancedPlans.forEach(plan => {
                const planDailyBurn = (plan.calc_salary * plan.calc_alloc) / 22;
                if (!plan.offboarded) {
                    plan.netProfitOrLoss = dailyBudgetPerResource - planDailyBurn;
                    if (plan.netProfitOrLoss > 0 && projectMargin >= 0) {
                        plan.performance_category = 'GENERATOR';
                    } else {
                        plan.performance_category = 'BURDEN';
                    }
                } else {
                    plan.netProfitOrLoss = 0;
                }
            });
        } else {
            // T&M: netProfitOrLoss was already set in the loop based on approved aggregates.
            // Just ensure performance_category is consistent with netProfitOrLoss.
            enhancedPlans.forEach(plan => {
                if (plan.totalHours === 0 && plan.netProfitOrLoss === 0) {
                    plan.performance_category = 'PENDING';
                } else if (plan.netProfitOrLoss > (plan.totalPlanCost * 0.20) && plan.netProfitOrLoss > 0) {
                    plan.performance_category = 'GENERATOR';
                } else if (plan.netProfitOrLoss < 0) {
                    plan.performance_category = 'BURDEN';
                } else {
                    plan.performance_category = 'NEUTRAL';
                }
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

                computedRevenue += (hrs * usdRate * 83.00); // Standard projection fallback for unapproved logs
                computedCost += (hrs * inrRate);
            });
        }
    }

    return {
        ...project,
        employee_costs: computedCost,
        revenue_earned: computedRevenue,
        projectedRevenue: projectedRevenue,
        projectedCost: projectedCost,
        computedCost,
        computedRevenue,
        margin: computedRevenue - computedCost,
        is_calculated_cost: true,
        debug_info: debugInfo
    };
};

module.exports = { calculateProjectFinancials };
