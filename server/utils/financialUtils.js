const getMonthsInPeriod = (startDate, endDate) => {
    if (!startDate || !endDate) return 1;
    const s = new Date(startDate);
    const e = new Date(endDate);
    return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
};

const getValidMonthsForEmployee = (joiningDate, periodStart, periodEnd) => {
    const pStart = toLocalDate(periodStart);
    const pEnd = toLocalDate(periodEnd);
    if (!pStart || !pEnd) return 1;

    let validCount = 0;
    let iter = new Date(pStart.getFullYear(), pStart.getMonth(), 1);
    
    // Fallback joining logic: treat missing dates as 2026-02-01 globally mapped default.
    const joinDateObj = joiningDate ? toLocalDate(joiningDate) : new Date(2026, 1, 1);
    // Determine the precise start Month boundary for the employee
    const joinThresholdMonth = new Date(joinDateObj.getFullYear(), joinDateObj.getMonth(), 1);

    while (iter <= pEnd) {
        if (iter >= joinThresholdMonth) {
            validCount++;
        }
        iter.setMonth(iter.getMonth() + 1);
    }
    return validCount;
};

const getBusinessHoursInMonth = (year, month) => {
    let workingDays = 0;
    const date = new Date(year, month, 1);
    while (date.getMonth() === month) {
        if (date.getDay() !== 0 && date.getDay() !== 6) {
            workingDays++;
        }
        date.setDate(date.getDate() + 1);
    }
    return workingDays * 8;
};

const toLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    // If it's just a YYYY-MM-DD string, Date(string) can be UTC.
    // Ensure we treat it as local.
    if (typeof dateStr === 'string' && dateStr.length === 10) {
        return new Date(`${dateStr}T12:00:00`); // Mid-day to avoid TZ shifts
    }
    return d;
};

const getActiveMonthsForEmployee = (employeeId, periodStart, periodEnd, allPlans, allLogs) => {
    const pStart = toLocalDate(periodStart);
    const pEnd = toLocalDate(periodEnd);
    if (!pStart || !pEnd) return 1;

    // Define the months in the period
    const months = [];
    let iter = new Date(pStart.getFullYear(), pStart.getMonth(), 1);
    while (iter <= pEnd) {
        months.push({
            monthStart: new Date(iter.getFullYear(), iter.getMonth(), 1),
            monthEnd: new Date(iter.getFullYear(), iter.getMonth() + 1, 0, 23, 59, 59)
        });
        iter.setMonth(iter.getMonth() + 1);
    }

    let activeCount = 0;
    months.forEach(m => {
        let hasActivity = false;
        const hasAllocation = allPlans.some(p => {
            if (Number(p.employee_id) !== Number(employeeId)) return false;
            const ps = toLocalDate(p.start_date);
            const pe = toLocalDate(p.end_date);
            return (!ps || ps <= m.monthEnd) && (!pe || pe >= m.monthStart) && (Number(p.allocation_percentage) > 0);
        });
        if (hasAllocation) hasActivity = true;
        
        if (!hasActivity) {
            const hasLog = allLogs.some(l => {
                if (Number(l.employee_id) !== Number(employeeId)) return false;
                const ld = toLocalDate(l.date);
                return ld >= m.monthStart && ld <= m.monthEnd && (Number(l.hours_worked) > 0);
            });
            if (hasLog) hasActivity = true;
        }
        if (hasActivity) activeCount++;
    });
    return activeCount;
};

const calculateFixedBidRevenueShare = (plan, periodStart, periodEnd) => {
    const totalVal = Number(plan.fixed_contract_value) || 0;
    const totalAlloc = Number(plan.total_project_allocation) || 0;
    if (totalAlloc <= 0) return 0;
    
    const weight = (Number(plan.allocation_percentage) || 0) / totalAlloc;
    const totalShare = totalVal * weight;
    
    // Dashboard Logic: If the plan overlaps with the period, recognize the FULL share.
    // This is because Fixed Bid projects are usually reported as total value in the YTD summary.
    const ps = toLocalDate(plan.start_date);
    const pe = toLocalDate(plan.end_date);
    const pStart = toLocalDate(periodStart);
    const pEnd = toLocalDate(periodEnd);
    
    if (!ps || !pe) return totalShare;
    const overlaps = ps <= pEnd && pe >= pStart;
    
    return overlaps ? totalShare : 0;
};

const calculateLinearRevenue = (totalValue, projectStart, projectEnd, filterStart, filterEnd, joiningDate, allocationPercentage = 100, empName = 'Employee') => {
    const pStart = toLocalDate(projectStart);
    const pEnd = toLocalDate(projectEnd);
    const fStart = toLocalDate(filterStart);
    const fEnd = toLocalDate(filterEnd);
    
    // Decoupling Check: If no joiningDate provided, we assume company view (unrestricted)
    const jDate = joiningDate ? toLocalDate(joiningDate) : new Date(1970, 0, 1);

    if (!pStart || !pEnd || !fStart || !fEnd) return 0;

    // 1. Total project duration in months (the denominator)
    const totalDurationMonths = Math.max(1, (pEnd.getFullYear() - pStart.getFullYear()) * 12 + (pEnd.getMonth() - pStart.getMonth()) + 1);
    const monthlyRevenue = (Number(totalValue) || 0) / totalDurationMonths;

    // 2. Revenue Recognition Start = MAX(project_start, filter_start, joining_date)
    const overlapStart = new Date(Math.max(pStart.getTime(), fStart.getTime(), jDate.getTime()));
    const overlapEnd = pEnd < fEnd ? pEnd : fEnd;

    let revenue = 0;
    if (overlapEnd >= overlapStart) {
        const diffTime = Math.abs(overlapEnd - overlapStart);
        // Precision: Math.ceil with T23:59:59 boundary ensures April 1-14 is exactly 14 days.
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        const fraction = diffDays / 30;
        revenue = (monthlyRevenue * fraction) * (Number(allocationPercentage || 100) / 100);

        if (empName.includes("John Wick")) {
            console.log(`Calculating ${empName} Revenue: Start ${overlapStart.toDateString()}, End ${overlapEnd.toDateString()}, Days: ${diffDays}, Revenue: ${Math.round(revenue)}`);
        }
    }
    return revenue;
};

const calculateStaffCost = (salary, start, end, joiningDate, empName = 'Employee') => {
    const s = toLocalDate(start);
    const e = toLocalDate(end);
    const j = toLocalDate(joiningDate) || new Date(2026, 1, 1);

    if (!s || !e) return 0;

    const effectiveStart = s < j ? j : s;

    if (e >= effectiveStart) {
        const diffTime = Math.abs(e - effectiveStart);
        // Standardized Daily Pro-rata: (Salary / 30) * Days
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const cost = (Number(salary) || 0) * (diffDays / 30);

        if (empName.includes("John Wick")) {
            console.log(`Calculating ${empName} Salary: Start ${effectiveStart.toDateString()}, End ${e.toDateString()}, Days: ${diffDays}, Cost: ${Math.round(cost)}`);
        }
        return cost;
    }
    return 0;
};

module.exports = {
    getMonthsInPeriod,
    getValidMonthsForEmployee,
    getBusinessHoursInMonth,
    getActiveMonthsForEmployee,
    toLocalDate,
    calculateFixedBidRevenueShare,
    calculateLinearRevenue,
    calculateStaffCost
};


