import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { getExpenseCategories, createExpenseCategory } from '../lib/api';
import { toast } from 'sonner';

const ExpenseForm = ({ onSubmit, onCancel, isLoading }) => {
    const [categories, setCategories] = useState([]);
    const [formData, setFormData] = useState({
        category: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
    });

    const [displayAmount, setDisplayAmount] = useState('');

    // Fetch categories on mount
    useEffect(() => {
        const fetchCats = async () => {
            try {
                const res = await getExpenseCategories();
                setCategories(res.data);
            } catch (err) {
                console.error("Failed to load categories");
                // Fallback defaults
                setCategories([
                    { id: 1, name: 'Rent/Office' },
                    { id: 2, name: 'Software/SaaS' },
                    { id: 3, name: 'Marketing' },
                    { id: 4, name: 'Legal/Professional' },
                    { id: 5, name: 'Travel' },
                    { id: 6, name: 'Salaries (Admin)' },
                    { id: 7, name: 'Other' }
                ]);
            }
        };
        fetchCats();
    }, []);

    const handleAddCategory = async () => {
        if (!formData.category) return;
        try {
            const res = await createExpenseCategory({ name: formData.category });
            setCategories([...categories, res.data]);
            toast.success(`Category "${res.data.name}" saved!`);
        } catch (err) {
            toast.error("Failed to save category");
        }
    };

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

    // Check if category is new
    const isNewCategory = formData.category &&
        !(categories || []).some(c => (c.name || '').toLowerCase() === (formData.category || '').toLowerCase());

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label htmlFor="category" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Category
                </label>
                <div className="relative">
                    <input
                        id="category"
                        list="category-options"
                        required
                        autoComplete="off"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        placeholder="Select or type a category..."
                    />
                    <datalist id="category-options">
                        {categories.map(cat => (
                            <option key={cat.id} value={cat.name} />
                        ))}
                    </datalist>
                </div>

                {/* Save Category Button - Placed BELOW the input to avoid overlap */}
                {isNewCategory && (
                    <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                        <button
                            type="button"
                            onClick={handleAddCategory}
                            className="text-xs flex items-center gap-1 font-medium text-primary hover:text-primary-dark bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-md transition-colors border border-blue-100 dark:border-blue-800"
                        >
                            <Plus className="w-3 h-3" />
                            Save "{formData.category}" to list
                        </button>
                    </div>
                )}
            </div>

            <div>
                <label htmlFor="amount" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Amount (₹)
                </label>
                <input
                    type="text"
                    id="amount"
                    required
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                    value={displayAmount}
                    onChange={handleAmountChange}
                    placeholder="0"
                />
            </div>

            <div>
                <label htmlFor="date" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Date
                </label>
                <input
                    type="date"
                    id="date"
                    required
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors bg-white dark:bg-slate-800 text-slate-900 dark:text-white dark:[color-scheme:dark]"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
            </div>

            <div>
                <label htmlFor="description" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Description (Optional)
                </label>
                <textarea
                    id="description"
                    rows="3"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Detailed description of the expense..."
                />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
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
