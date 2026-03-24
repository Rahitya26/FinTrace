const getMonthsInPeriod = (startDate, endDate) => {
    if (!startDate || !endDate) return 1;
    const s = new Date(startDate);
    const e = new Date(endDate);
    return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
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

module.exports = {
    getMonthsInPeriod,
    getActiveMonthsForEmployee,
    toLocalDate,
    calculateFixedBidRevenueShare
};
