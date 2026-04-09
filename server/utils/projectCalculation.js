const { getActiveMonthsForEmployee, calculateFixedBidRevenueShare } = require('./financialUtils');

const calculateProjectFinancials = (project, allPlans, allUnapprovedLogs = [], allApprovedLogs = [], totalHistoryApprovedLogs = [], startDate = null, endDate = null) => {
    const projectPlans = allPlans.filter(p => Number(p.project_id) === Number(project.id));
    const projectLogs = allUnapprovedLogs.filter(l => Number(l.project_id) === Number(project.id));
    const projectApprovedAggregates = allApprovedLogs.filter(a => Number(a.project_id) === Number(project.id));
    
    let totalLockedStaffBurn = 0;
    let enhancedPlans = [];
    const isFixedBid = project.billing_type === 'Fixed Bid';
    
    // 1. Calculate project hours for the SELECTED PERIOD
    let periodProjectHours = 0;
    projectApprovedAggregates.forEach(agg => {
        periodProjectHours += Number(agg.total_hours) || 0;
    });

    // 2. Determine Total Project Revenue for the SELECTED PERIOD
    let computedRevenue = 0;
    if (isFixedBid) {
        if (project.status === 'Completed' || periodProjectHours >= 160) {
            computedRevenue = Number(project.quoted_bid_value || 0);
        } else if (project.budgeted_hours > 0) {
            const hourlyProjectValueINR = Number(project.quoted_bid_value || 0) / Number(project.budgeted_hours);
            projectApprovedAggregates.forEach(agg => {
                computedRevenue += (Number(agg.total_hours) || 0) * hourlyProjectValueINR;
            });
        }
    } else {
        projectApprovedAggregates.forEach(agg => {
            computedRevenue += Number(agg.total_inr_revenue) || 0;
        });
    }

    if (projectPlans.length > 0) {
        const totalAllocationOnProject = projectPlans.reduce((sum, p) => sum + (Number(p.allocation_percentage) || 0), 0);

        projectPlans.forEach((plan) => {
            const empId = plan.employee_id;
            let approvedRevenue = 0;
            let periodHours = 0;
            let asset_status = 'LIABILITY';
            let status_color = 'red';

            const empProjectLogs = projectApprovedAggregates.filter(a => Number(a.employee_id) === Number(empId));
            empProjectLogs.forEach(agg => {
                periodHours += Number(agg.total_hours) || 0;
            });

            const monthlySalary = Number(plan.monthly_salary) || 0;
            const internalHourlyRate = monthlySalary / 160;

            // USE SHARED LOGIC: Count months where employee had Logs OR Allocation in this specific project plan?
            // Actually the "Active Months" rule applies to the PERIOD for that employee.
            // We pass ALL plans and ALL aggregates for that employee to the helper.
            const activeMonthsInPeriod = getActiveMonthsForEmployee(empId, startDate, endDate, allPlans, allApprovedLogs);

            // 2. Revenue Recognition
            if (isFixedBid) {
                if (project.status === 'Completed' || periodProjectHours >= 160) {
                    approvedRevenue = (periodHours / Math.max(1, periodProjectHours)) * Number(project.quoted_bid_value || 0);
                } else if (project.budgeted_hours > 0) {
                    const hourlyProjectValueINR = Number(project.quoted_bid_value || 0) / Number(project.budgeted_hours);
                    approvedRevenue = periodHours * hourlyProjectValueINR;
                } else {
                    approvedRevenue = 0;
                }
            } else {
                approvedRevenue = empProjectLogs.reduce((sum, log) => sum + (Number(log.total_inr_revenue) || 0), 0);
            }

            // Status: compare revenue to salary for active months
            if (approvedRevenue > (monthlySalary * Math.max(1, activeMonthsInPeriod))) {
                asset_status = 'ASSET';
                status_color = 'green';
            } else {
                asset_status = 'LIABILITY';
                status_color = 'red';
            }

            // 3. Burn Calculation: Pro-Rata Loop Per Month
            let planBurn = 0;
            empProjectLogs.forEach(projLog => {
                const month = projLog.log_month;
                const year = projLog.log_year;
                const hoursThisMonth = Number(projLog.total_hours) || 0;

                const employeeAllLogsThisMonth = allApprovedLogs.filter(a => 
                    Number(a.employee_id) === Number(empId) && 
                    Number(a.log_month) === Number(month) && 
                    Number(a.log_year) === Number(year)
                );

                const totalGlobalHoursThisMonth = employeeAllLogsThisMonth.reduce(
                    (sum, log) => sum + (Number(log.total_hours) || 0), 0
                );

                if (totalGlobalHoursThisMonth > 0) {
                    const ratio = hoursThisMonth / totalGlobalHoursThisMonth;
                    planBurn += ratio * monthlySalary; 
                }
            });
            totalLockedStaffBurn += planBurn;

            const hourlyProjectValueUSD = (isFixedBid && project.budgeted_hours > 0) 
                ? (Number(project.quoted_bid_value || 0) / 83.15) / Number(project.budgeted_hours) 
                : 0;

            enhancedPlans.push({
                name: plan.name,
                role: plan.role,
                employee_id: empId,
                salary: monthlySalary,
                internalHourlyRate: internalHourlyRate,
                totalHours: periodHours,
                totalPlanCost: Math.round(planBurn),
                totalPlanRevenue: Math.round(approvedRevenue),
                netProfitOrLoss: Math.round(approvedRevenue - planBurn),
                asset_status: asset_status,
                status_color: status_color,
                allocation_percentage: plan.allocation_percentage,
                virtual_usd_rate: hourlyProjectValueUSD
            });
        });
    }

    let projectedRevenue = 0;
    if (!isFixedBid) {
        const EXCHANGE_RATE = 83.15;
        projectLogs.forEach(log => {
            const hrs = Number(parseFloat(Number(log.hours_worked) || 0).toFixed(2));
            const usdRoleRate = Number(log.usd_hourly_rate) || 0;
            projectedRevenue += (hrs * usdRoleRate * EXCHANGE_RATE);
        });
    }

    const margin = computedRevenue - totalLockedStaffBurn;

    return {
        ...project,
        employee_costs: Math.round(totalLockedStaffBurn),
        revenue_earned: Math.round(computedRevenue),
        projectedRevenue: Math.round(projectedRevenue),
        margin: Math.round(margin),
        is_calculated_cost: true,
        debug_info: {
            type: project.billing_type || project.type,
            plans: enhancedPlans,
            unapprovedLogs: projectLogs.length,
            totalLockedStaffBurn: totalLockedStaffBurn
        }
    };
};

module.exports = { calculateProjectFinancials };
