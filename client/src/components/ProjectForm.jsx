import React, { useState, useEffect } from 'react';

const PROCESS_TYPES = ['T&M', 'Fixed Bid', 'Fixed Value'];

const ProjectForm = ({ clients, onSubmit, onCancel, isLoading }) => {
    const [formData, setFormData] = useState({
        clientId: '',
        name: '',
        type: 'T&M',
        revenue: '',
        costs: '',
        startDate: new Date().toISOString().split('T')[0],
        deadline: ''
    });

    const [displayValues, setDisplayValues] = useState({
        revenue: '',
        costs: ''
    });

    const [margin, setMargin] = useState(0);

    // Initialize display values if editing (future proofing) or just keep sync
    useEffect(() => {
        setMargin((parseFloat(formData.revenue) || 0) - (parseFloat(formData.costs) || 0));
    }, [formData.revenue, formData.costs]);

    const handleCurrencyChange = (field, value) => {
        // Remove non-numeric chars except dot
        const cleanValue = value.replace(/[^0-9.]/g, '');

        // Update raw data
        setFormData(prev => ({ ...prev, [field]: cleanValue }));

        // Update display with commas
        if (cleanValue) {
            const numberVal = parseFloat(cleanValue);
            if (!isNaN(numberVal)) {
                // Formatting for display (Indian locale)
                const formatted = new Intl.NumberFormat('en-IN', {
                    maximumFractionDigits: 2
                }).format(numberVal);
                setDisplayValues(prev => ({ ...prev, [field]: formatted }));
            } else {
                setDisplayValues(prev => ({ ...prev, [field]: cleanValue }));
            }
        } else {
            setDisplayValues(prev => ({ ...prev, [field]: '' }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({
            ...formData,
            revenue: parseFloat(formData.revenue) || 0,
            costs: parseFloat(formData.costs) || 0,
            margin
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label htmlFor="clientId" className="block text-sm font-medium text-slate-700 mb-1">
                    Client
                </label>
                <select
                    id="clientId"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors bg-white"
                    value={formData.clientId}
                    onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                >
                    <option value="">Select a client...</option>
                    {clients.map(client => (
                        <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                </select>
            </div>

            <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
                    Project Name
                </label>
                <input
                    type="text"
                    id="name"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Q4 Migration"
                />
            </div>

            <div>
                <label htmlFor="type" className="block text-sm font-medium text-slate-700 mb-1">
                    Process Type
                </label>
                <div className="flex space-x-4">
                    {PROCESS_TYPES.map(type => (
                        <label key={type} className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="radio"
                                name="type"
                                value={type}
                                checked={formData.type === type}
                                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                className="text-primary focus:ring-primary"
                            />
                            <span className="text-sm text-slate-700">{type}</span>
                        </label>
                    ))}
                </div>
            </div>

            {formData.type === 'Fixed Bid' && (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div>
                        <label htmlFor="startDate" className="block text-sm font-medium text-slate-700 mb-1">
                            Start Date
                        </label>
                        <input
                            type="date"
                            id="startDate"
                            required
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                            value={formData.startDate}
                            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                        />
                    </div>
                    <div>
                        <label htmlFor="deadline" className="block text-sm font-medium text-slate-700 mb-1">
                            Deadline
                        </label>
                        <input
                            type="date"
                            id="deadline"
                            required
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                            value={formData.deadline}
                            onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                        />
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="revenue" className="block text-sm font-medium text-slate-700 mb-1">
                        Revenue Earned (₹)
                    </label>
                    <input
                        type="text"
                        id="revenue"
                        required
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                        value={displayValues.revenue}
                        onChange={(e) => handleCurrencyChange('revenue', e.target.value)}
                        placeholder="0"
                    />
                </div>
                <div>
                    <label htmlFor="costs" className="block text-sm font-medium text-slate-700 mb-1">
                        Employee Costs (₹)
                    </label>
                    <input
                        type="text"
                        id="costs"
                        required
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                        value={displayValues.costs}
                        onChange={(e) => handleCurrencyChange('costs', e.target.value)}
                        placeholder="0"
                    />
                </div>
            </div>

            <div className="pt-2 border-t border-slate-100 mt-2">
                <label className="block text-sm font-medium text-slate-500 mb-1">
                    Calculated Margin
                </label>
                <p className={`text-xl font-bold ${margin >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(margin)}
                </p>
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
                    {isLoading ? 'Saving...' : 'Add Project'}
                </button>
            </div>
        </form>
    );
};

export default ProjectForm;
