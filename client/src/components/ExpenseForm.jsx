import React, { useState } from 'react';

const EXPENSE_CATEGORIES = [
    'Rent/Office', 'Software/SaaS', 'Marketing', 'Legal/Professional', 'Travel', 'Salaries (Admin)', 'Other'
];

const ExpenseForm = ({ onSubmit, onCancel, isLoading }) => {
    const [formData, setFormData] = useState({
        category: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
    });

    const [displayAmount, setDisplayAmount] = useState('');

    const handleAmountChange = (e) => {
        const value = e.target.value;
        const cleanValue = value.replace(/[^0-9.]/g, '');
        setFormData(prev => ({ ...prev, amount: cleanValue }));

        if (cleanValue) {
            const numberVal = parseFloat(cleanValue);
            if (!isNaN(numberVal)) {
                const formatted = new Intl.NumberFormat('en-IN', {
                    maximumFractionDigits: 2
                }).format(numberVal);
                setDisplayAmount(formatted);
            } else {
                setDisplayAmount(cleanValue);
            }
        } else {
            setDisplayAmount('');
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({
            ...formData,
            amount: parseFloat(formData.amount),
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label htmlFor="category" className="block text-sm font-medium text-slate-700 mb-1">
                    Category
                </label>
                <input
                    id="category"
                    list="category-options"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors bg-white"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="Select or type a category..."
                />
                <datalist id="category-options">
                    {EXPENSE_CATEGORIES.map(cat => (
                        <option key={cat} value={cat} />
                    ))}
                </datalist>
            </div>

            <div>
                <label htmlFor="amount" className="block text-sm font-medium text-slate-700 mb-1">
                    Amount (₹)
                </label>
                <input
                    type="text"
                    id="amount"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                    value={displayAmount}
                    onChange={handleAmountChange}
                    placeholder="0"
                />
            </div>

            <div>
                <label htmlFor="date" className="block text-sm font-medium text-slate-700 mb-1">
                    Date
                </label>
                <input
                    type="date"
                    id="date"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
            </div>

            <div>
                <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">
                    Description (Optional)
                </label>
                <textarea
                    id="description"
                    rows="3"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Detailed description of the expense..."
                />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={isLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                    {isLoading ? 'Saving...' : 'Log Expense'}
                </button>
            </div>
        </form>
    );
};

export default ExpenseForm;
