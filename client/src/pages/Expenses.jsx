import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar, Receipt, Filter, X } from 'lucide-react';
import Modal from '../components/Modal';
import ExpenseForm from '../components/ExpenseForm';
import { getExpenses, createExpense } from '../lib/api';
import { format } from 'date-fns';
import { cn, formatCurrency } from '../lib/utils';

const Expenses = () => {
    const [expenses, setExpenses] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateRange, setDateRange] = useState({
        startDate: '',
        endDate: ''
    });
    const [activePreset, setActivePreset] = useState(null);
    const [error, setError] = useState(null);

    // Pagination state
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalAmount: 0, limit: 20, totalPages: 1 });

    useEffect(() => {
        fetchExpenses();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, searchTerm, dateRange.startDate, dateRange.endDate]);

    const fetchExpenses = async () => {
        try {
            const params = {
                page,
                limit: 20,
                search: searchTerm,
                startDate: dateRange.startDate,
                endDate: dateRange.endDate
            };
            const response = await getExpenses(params);

            if (response.data.data) {
                setExpenses(response.data.data);
                setPagination(response.data.pagination);
            } else {
                setExpenses(response.data); // Fallback for old API format
            }
        } catch (err) {
            setError('Failed to fetch expenses');
            console.error(err);
        }
    };

    const handleAddExpense = async (expenseData) => {
        setIsLoading(true);
        try {
            await createExpense(expenseData);
            setIsModalOpen(false);
            setPage(1);
            fetchExpenses();
        } catch (err) {
            alert('Failed to log expense');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Company Expenses</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Track operational overhead and costs</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Log Expense
                </button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                {/* Toolbar */}
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center bg-slate-50 dark:bg-slate-900">
                    <div className="flex items-center w-full xl:w-auto relative flex-1 max-w-md">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3" />
                        <input
                            type="text"
                            placeholder="Search expenses..."
                            className="pl-9 pr-4 py-2 w-full text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400"
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setPage(1);
                            }}
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
                        {/* Quick Selects */}
                        <div className="flex bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                            {[
                                { label: 'This Month', range: 'month' },
                                { label: 'Last 30 Days', range: '30days' },
                                { label: 'Last 6 Months', range: '6months' },
                                { label: 'YTD', range: 'ytd' }
                            ].map((preset) => (
                                <button
                                    key={preset.range}
                                    onClick={() => {
                                        const now = new Date();
                                        let start, end = now;

                                        if (preset.range === 'month') {
                                            start = new Date(now.getFullYear(), now.getMonth(), 1);
                                        } else if (preset.range === '30days') {
                                            start = new Date();
                                            start.setDate(now.getDate() - 30);
                                        } else if (preset.range === '6months') {
                                            start = new Date();
                                            start.setMonth(now.getMonth() - 6);
                                        } else if (preset.range === 'ytd') {
                                            start = new Date(now.getFullYear(), 0, 1);
                                        }

                                        setDateRange({
                                            startDate: start.toISOString().split('T')[0],
                                            endDate: end.toISOString().split('T')[0]
                                        });
                                        setActivePreset(preset.range);
                                        setPage(1);
                                    }}
                                    className={cn(
                                        "px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap",
                                        activePreset === preset.range
                                            ? "bg-primary text-white shadow-md font-semibold"
                                            : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                                    )}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>

                        {/* Date Inputs */}
                        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                            <Calendar className="w-4 h-4 text-slate-400 ml-1" />
                            <input
                                type="date"
                                name="startDate"
                                value={dateRange.startDate}
                                onChange={(e) => {
                                    setDateRange(prev => ({ ...prev, startDate: e.target.value }));
                                    setActivePreset(null);
                                    setPage(1);
                                }}
                                className="text-sm border-none focus:ring-0 text-slate-600 dark:text-slate-300 bg-transparent dark:[color-scheme:dark] p-0 w-[110px]"
                            />
                            <span className="text-slate-300 dark:text-slate-600">|</span>
                            <input
                                type="date"
                                name="endDate"
                                value={dateRange.endDate}
                                onChange={(e) => {
                                    setDateRange(prev => ({ ...prev, endDate: e.target.value }));
                                    setActivePreset(null);
                                    setPage(1);
                                }}
                                className="text-sm border-none focus:ring-0 text-slate-600 dark:text-slate-300 bg-transparent dark:[color-scheme:dark] p-0 w-[110px]"
                            />
                            {/* Clear Button */}
                            {(dateRange.startDate || dateRange.endDate) && (
                                <button
                                    onClick={() => {
                                        setDateRange({ startDate: '', endDate: '' });
                                        setActivePreset(null);
                                        setPage(1);
                                    }}
                                    className="text-slate-400 hover:text-red-500 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Category</th>
                                <th className="px-6 py-3">Description</th>
                                <th className="px-6 py-3 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {expenses.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                                        No expenses found matching your filters.
                                    </td>
                                </tr>
                            ) : (
                                expenses.map((expense) => (
                                    <tr key={expense.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-3 text-slate-600 dark:text-slate-400">
                                            {format(new Date(expense.date), 'MMM dd, yyyy')}
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                                {expense.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                                            {expense.description || '-'}
                                        </td>
                                        <td className="px-6 py-3 text-right font-medium text-slate-900 dark:text-white">
                                            {formatCurrency(expense.amount)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {expenses.length > 0 && (
                            <tfoot className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
                                <tr>
                                    <td colSpan="3" className="px-6 py-3 text-right font-semibold text-slate-700 dark:text-slate-300">Total</td>
                                    <td className="px-6 py-3 text-right font-bold text-slate-900 dark:text-white">
                                        {formatCurrency(pagination.totalAmount || 0)}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                    <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between bg-white dark:bg-slate-800">
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                            Showing <span className="font-medium">{(page - 1) * pagination.limit + 1}</span> to <span className="font-medium">{Math.min(page * pagination.limit, pagination.total)}</span> of <span className="font-medium">{pagination.total}</span> results
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded-md text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                                disabled={page === pagination.totalPages}
                                className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded-md text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Log New Expense</h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-500 transition-colors"
                            >
                                <Plus className="w-5 h-5 transform rotate-45" />
                            </button>
                        </div>
                        <div className="p-6">
                            <ExpenseForm
                                onSubmit={handleAddExpense}
                                onCancel={() => setIsModalOpen(false)}
                                isLoading={isLoading}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Expenses;
