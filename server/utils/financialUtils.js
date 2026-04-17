const { calculateInclusiveDays, SYSTEM_TODAY } = require('@/utils/dateUtils');

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
    
    if (typeof dateStr === 'string' && dateStr.length === 10) {
        return new Date(`${dateStr}T12:00:00`); // Mid-day to avoid TZ shifts
    }
    
    const d = new Date(dateStr);
    
    // Fix: If a purely DATE column was retrieved from pg, it is typically UTC midnight.
    // In western timezones (e.g. USA), this bleeds into the previous day (e.g. Jan 14 19:00).
    // Reconstruct it using UTC parts to firmly pin it to the correct local day.
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
    }
    
    return d;
};

// Normalize any Date to local midnight (00:00:00) to guarantee integer day diffs.
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

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
    try {
        const pStart = toLocalDate(projectStart);
        const pEnd = toLocalDate(projectEnd);
        const fStart = toLocalDate(filterStart) || pStart;
        const fEnd = toLocalDate(filterEnd) || pEnd;
        
        const jDate = joiningDate ? toLocalDate(joiningDate) : new Date(1970, 0, 1);

        if (!pStart || !pEnd || !fStart || !fEnd) return 0;

        const overlapStart = new Date(Math.max(pStart.getTime(), fStart.getTime(), jDate.getTime()));
        const overlapEnd = new Date(Math.min(pEnd.getTime(), fEnd.getTime()));

        if (overlapEnd >= overlapStart) {
            const activeDays = calculateInclusiveDays(overlapStart, overlapEnd);
            const totalProjectDays = calculateInclusiveDays(pStart, pEnd);
            
            let revenue = (activeDays / totalProjectDays) * (Number(totalValue) || 0) * (Number(allocationPercentage || 100) / 100);
            return Math.round(revenue);
        }
    } catch (e) {
        console.error("Error in calculateLinearRevenue:", e);
    }
    return 0;
};

const calculateStaffCost = (salary, planStart, planEnd, filterStart, filterEnd, joiningDate, empName = 'Employee') => {
    try {
        const pStart = toLocalDate(planStart);
        const pEnd = toLocalDate(planEnd);
        const fStart = toLocalDate(filterStart) || pStart;
        const fEnd = toLocalDate(filterEnd) || pEnd;
        const j = toLocalDate(joiningDate) || new Date(2026, 0, 1);

        if (!pStart || !pEnd || !fStart || !fEnd) return 0;

        const overlapStart = new Date(Math.max(pStart.getTime(), fStart.getTime(), j.getTime()));
        let overlapEnd = new Date(Math.min(pEnd.getTime(), fEnd.getTime()));

        // Enforce 'Today' in Payroll: Never calculate future days for current month
        const localToday = SYSTEM_TODAY;
        if (overlapEnd > localToday) {
            overlapEnd = localToday;
        }

        if (overlapEnd >= overlapStart) {
            const activeDays = calculateInclusiveDays(overlapStart, overlapEnd);
            const cost = (Number(salary) || 0) / 30 * activeDays;
            return cost;
        }
    } catch (err) {
        console.error("Error in calculateStaffCost:", err);
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


