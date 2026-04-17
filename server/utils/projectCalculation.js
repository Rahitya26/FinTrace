const { getActiveMonthsForEmployee, calculateFixedBidRevenueShare, calculateLinearRevenue, calculateStaffCost } = require('./financialUtils');

const calculateProjectFinancials = (project, allPlans, allUnapprovedLogs = [], allApprovedLogs = [], totalHistoryApprovedLogs = [], startDate = null, endDate = null) => {
    const projectPlans = allPlans.filter(p => Number(p.project_id) === Number(project.id));
    const projectLogs = allUnapprovedLogs.filter(l => Number(l.project_id) === Number(project.id));
    const projectApprovedAggregates = allApprovedLogs.filter(a => Number(a.project_id) === Number(project.id));
    
    let totalLockedStaffBurn = 0;
    let totalRevenueAccrued = 0; // Sum of employee credits
    let enhancedPlans = [];
    const isFixedBid = project.billing_type === 'Fixed Bid';
    
    const totalAllocationOnProject = projectPlans.reduce((sum, p) => sum + (Number(p.allocation_percentage) || 0), 0);

    // 1. Calculate project hours for the SELECTED PERIOD
    let periodProjectHours = 0;
    projectApprovedAggregates.forEach(agg => {
        periodProjectHours += Number(agg.total_hours) || 0;
    });

    // 1.5 COMPANY VIEW (Decoupled Revenue): Unrestricted by employee joining dates
    let companyRevenueEarned = 0;
    if (isFixedBid) {
        companyRevenueEarned = calculateLinearRevenue(
            project.quoted_bid_value || project.fixed_contract_value,
            project.start_date,
            project.deadline,
            startDate,
            endDate,
            null, // NULL Joining Date = Company View
            100,
            "Company-Level"
        );
    } else {
        projectApprovedAggregates.forEach(agg => {
            companyRevenueEarned += Number(agg.total_inr_revenue) || 0;
        });
    }

    // 2. Process Employee Plans
    if (projectPlans.length > 0) {
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

            const activeMonthsInPeriod = getActiveMonthsForEmployee(empId, startDate, endDate, allPlans, allApprovedLogs);

            // 2. Revenue Recognition (Individual - Restricted by Joining Date)
            if (isFixedBid) {
                const totalAlloc = totalAllocationOnProject > 0 ? totalAllocationOnProject : 100;
                const weight = (Number(plan.allocation_percentage) || 0) / totalAlloc;
                
                approvedRevenue = calculateLinearRevenue(
                    project.quoted_bid_value || project.fixed_contract_value,
                    project.start_date,
                    project.deadline,
                    startDate,
                    endDate,
                    plan.joining_date,
                    (Number(plan.allocation_percentage) || 0) * (100 / totalAlloc),
                    plan.name
                );
            } else {
                approvedRevenue = empProjectLogs.reduce((sum, log) => sum + (Number(log.total_inr_revenue) || 0), 0);
            }

            totalRevenueAccrued += approvedRevenue;

            // Status: compare revenue to salary for active months
            if (approvedRevenue > (monthlySalary * Math.max(1, activeMonthsInPeriod))) {
                asset_status = 'ASSET';
                status_color = 'green';
            } else {
                asset_status = 'LIABILITY';
                status_color = 'red';
            }

            // 3. Burn Calculation: Standardized Pro-Rata
            const alloc = Number(plan.allocation_percentage) || 100;
            const fraction = alloc / 100;

            const planBurn = fraction * calculateStaffCost(
                monthlySalary,
                project.start_date, // Enforce project bounds strictly
                project.deadline,   // Enforce project bounds strictly
                startDate,          // Global Filter Start
                endDate,            // Global Filter End
                plan.joining_date,
                plan.name
            );

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

    // ACTUAL MARGIN: Company Revenue - Staff Costs
    const margin = companyRevenueEarned - totalLockedStaffBurn;

    return {
        ...project,
        employee_costs: Math.round(totalLockedStaffBurn),
        revenue_earned: Math.round(companyRevenueEarned),
        projectedRevenue: Math.round(projectedRevenue),
        margin: Math.round(margin),
        is_calculated_cost: true,
        debug_info: {
            type: project.billing_type || project.type,
            plans: enhancedPlans,
            unapprovedLogs: projectLogs.length,
            companyRevenuePotential: companyRevenueEarned,
            employeeAttributedRevenue: totalRevenueAccrued
        }
    };
};

module.exports = { calculateProjectFinancials };


