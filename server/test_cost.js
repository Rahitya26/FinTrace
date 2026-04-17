const { calculateStaffCost } = require('./utils/financialUtils');
const { calculateInclusiveDays } = require('./utils/dateUtils');

console.log("Direct Days:", calculateInclusiveDays(new Date('2026-01-14T00:00:00'), new Date()));

const cost = calculateStaffCost(
    100000,
    '2026-04-01',
    '2026-04-30',
    '2026-04-01',
    '2026-04-30',
    '2026-01-14',
    'Emp 2'
);
console.log("Cost is:", cost, "Days utilized:", (cost / 100000) * 30);
