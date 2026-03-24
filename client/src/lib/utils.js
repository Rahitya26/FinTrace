import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(amount);
};

export const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const getThisMonthRange = () => {
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 0, 0, 0);
    const end = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);
    
    return {
        startDate: formatLocalDate(start),
        endDate: formatLocalDate(end)
    };
};
