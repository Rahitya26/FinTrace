import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar, Receipt, Filter } from 'lucide-react';
import Modal from '../components/Modal';
import ExpenseForm from '../components/ExpenseForm';
import { getExpenses, createExpense } from '../lib/api';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';

const Expenses = () => {
    const [expenses, setExpenses] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchExpenses();
    }, []);

    const fetchExpenses = async () => {
        try {
            const response = await getExpenses();
            setExpenses(response.data);
        } catch (err) {
            setError('Failed to fetch expenses');
            console.error(err);
        }
    };

    const handleAddExpense = async (expenseData) => {
        setIsLoading(true);
        try {
            const response = await createExpense(expenseData);
            setExpenses([response.data, ...expenses]);
            setIsModalOpen(false);
        } catch (err) {
            alert('Failed to log expense');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredExpenses = expenses.filter(expense => {
        const matchesSearch =
            expense.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
            expense.description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDate = dateFilter ? expense.date === dateFilter : true;
        return matchesSearch && matchesDate;
    });

    const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900">Company Expenses</h2>
                    <p className="text-slate-500 mt-1">Track operational overhead and costs</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Log Expense
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Toolbar */}
                <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-50">
                    <div className="flex items-center w-full md:w-auto relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3" />
                        <input
                            type="text"
                            placeholder="Search expenses..."
                            className="pl-9 pr-4 py-2 w-full md:w-64 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <div className="relative flex-1 md:flex-none">
                            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                            <input
                                type="date"
                                className="pl-9 pr-4 py-2 w-full md:w-auto text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                            />
                        </div>
                        {dateFilter && (
                            <button
                                onClick={() => setDateFilter('')}
                                className="text-xs text-slate-500 hover:text-slate-700 underline"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Category</th>
                                <th className="px-6 py-3">Description</th>
                                <th className="px-6 py-3 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredExpenses.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-12 text-center text-slate-500">
                                        No expenses found matching your filters.
                                    </td>
                                </tr>
                            ) : (
                                filteredExpenses.map((expense) => (
                                    <tr key={expense.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-3 text-slate-600">
                                            {format(new Date(expense.date), 'MMM dd, yyyy')}
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                                                {expense.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-slate-600 max-w-xs truncate">
                                            {expense.description || '-'}
                                        </td>
                                        <td className="px-6 py-3 text-right font-medium text-slate-900">
                                            {formatCurrency(expense.amount)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {filteredExpenses.length > 0 && (
                            <tfoot className="bg-slate-50 border-t border-slate-200">
                                <tr>
                                    <td colSpan="3" className="px-6 py-3 text-right font-semibold text-slate-700">Total</td>
                                    <td className="px-6 py-3 text-right font-bold text-slate-900">
                                        ${totalExpenses.toFixed(2)}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <h3 className="text-lg font-semibold text-slate-900">Log New Expense</h3>
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
