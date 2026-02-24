import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Users, Briefcase, Plus, Trash2, Calculator } from 'lucide-react';
import { getEmployees } from '../lib/api';
import { formatCurrency, cn } from '../lib/utils';

const PROCESS_TYPES = ['T&M', 'Fixed Bid', 'Fixed Value'];

const ProjectForm = ({ clients, onSubmit, onCancel, isLoading }) => {
    const [activeTab, setActiveTab] = useState('details'); // 'details' | 'resources'
    const [employees, setEmployees] = useState([]);

    // Project Data
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

    // Resource Planner Data
    const [resources, setResources] = useState([]); // { employeeId, allocation, name, salary }
    const [newResource, setNewResource] = useState({
        employeeId: '',
        allocation: 100
    });
    const [empSearch, setEmpSearch] = useState('');
    const [selectedRole, setSelectedRole] = useState('');

    useEffect(() => {
        // Fetch employees for dropdown
        const fetchEmps = async () => {
            try {
                const res = await getEmployees();
                // Only active employees
                setEmployees(res.data.filter(e => e.status === 'Active'));
            } catch (err) {
                console.error("Failed to load employees");
            }
        };
        fetchEmps();
    }, []);

    const [margin, setMargin] = useState(0);
    const [calculatedCost, setCalculatedCost] = useState(0);

    // Calculate Margin & Sync Cost
    useEffect(() => {
        let costVal = parseFloat(formData.costs) || 0;

        // If resources exist, override cost with calculated cost
        if (resources.length > 0) {
            let total = 0;

            if (formData.type === 'T&M') {
                // T&M Logic: Sum of (Hourly Rate * Hours)
                total = resources.reduce((sum, r) => {
                    const emp = employees.find(e => e.id === Number(r.employeeId));
                    const rate = emp ? Number(emp.hourly_rate) : 0;
                    return sum + (rate * Number(r.allocation));
                }, 0);
            } else {
                // Fixed Bid / Fixed Value Logic: Monthly Burn * Duration
                const monthlyBurn = resources.reduce((sum, r) => {
                    const emp = employees.find(e => e.id === Number(r.employeeId));
                    const salary = emp ? Number(emp.monthly_salary) : 0;
                    return sum + (salary * (r.allocation / 100));
                }, 0);

                // Calculate duration
                const start = new Date(formData.startDate);

                let durationMonths = 1;
                if (formData.deadline) {
                    const diffTime = Math.max(0, new Date(formData.deadline) - start);
                    durationMonths = diffTime / (1000 * 60 * 60 * 24 * 30.44);
                } else {
                    const diffTime = Math.max(0, new Date() - start);
                    durationMonths = Math.max(1, diffTime / (1000 * 60 * 60 * 24 * 30.44));
                }

                total = monthlyBurn * durationMonths;
            }

            setCalculatedCost(total);
            costVal = total;
        }

        setMargin((parseFloat(formData.revenue) || 0) - costVal);
    }, [formData.revenue, formData.costs, formData.startDate, formData.deadline, resources, employees, formData.type]);

    const handleCurrencyChange = (field, value) => {
        const cleanValue = value.replace(/[^0-9.]/g, '');
        setFormData(prev => ({ ...prev, [field]: cleanValue }));

        if (cleanValue) {
            const numberVal = parseFloat(cleanValue);
            if (!isNaN(numberVal)) {
                const formatted = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(numberVal);
                setDisplayValues(prev => ({ ...prev, [field]: formatted }));
            } else {
                setDisplayValues(prev => ({ ...prev, [field]: cleanValue }));
            }
        } else {
            setDisplayValues(prev => ({ ...prev, [field]: '' }));
        }
    };

    const addResource = () => {
        if (!newResource.employeeId) return;

        const emp = employees.find(e => e.id === Number(newResource.employeeId));
        if (!emp) return;

        setResources([...resources, {
            ...newResource,
            name: emp.name,
            salary: emp.monthly_salary,
            hourly_rate: emp.hourly_rate
        }]);
        setNewResource({ employeeId: '', allocation: formData.type === 'T&M' ? 0 : 100 });
    };

    const removeResource = (index) => {
        setResources(resources.filter((_, i) => i !== index));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        try {
            // Use calculated cost if resources are present
            const finalCost = resources.length > 0 ? calculatedCost : (parseFloat(formData.costs) || 0);

            onSubmit({
                ...formData,
                revenue: parseFloat(formData.revenue) || 0,
                costs: finalCost,
                margin,
                resources: resources // Pass resources to parent
            });
        } catch (err) {
            toast.error("Invalid form data");
        }
    };

    const availableRoles = [...new Set(employees.map(e => e.role))].filter(Boolean).sort();

    return (
        <form onSubmit={handleSubmit} className="flex flex-col max-h-[80vh] w-full">
            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 mb-4 shrink-0">
                <button
                    type="button"
                    onClick={() => setActiveTab('details')}
                    className={cn(
                        "px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
                        activeTab === 'details'
                            ? "border-primary text-primary"
                            : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    )}
                >
                    <Briefcase className="w-4 h-4" />
                    Project Details
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('resources')}
                    className={cn(
                        "px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
                        activeTab === 'resources'
                            ? "border-primary text-primary"
                            : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    )}
                >
                    <Users className="w-4 h-4" />
                    Resource Planner
                </button>
            </div>

            {/* SCROLLABLE VIEWPORT */}
            <div className="flex-1 overflow-y-auto pr-2 pb-4 space-y-4 min-h-0">
                {/* DETAILS TAB */}
                <div className={cn("space-y-4", activeTab === 'details' ? 'block' : 'hidden')}>
                    <div>
                        <label htmlFor="clientId" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Client</label>
                        <select
                            id="clientId"
                            required
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
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
                        <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Project Name</label>
                        <input
                            type="text"
                            id="name"
                            required
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g. Q4 Migration"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Process Type</label>
                        <div className="flex space-x-4">
                            {PROCESS_TYPES.map(type => (
                                <label key={type} className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="type"
                                        value={type}
                                        checked={formData.type === type}
                                        onChange={(e) => {
                                            setFormData({ ...formData, type: e.target.value });
                                            setResources([]); // Reset resources on type change
                                            setNewResource({ employeeId: '', allocation: e.target.value === 'T&M' ? 0 : 100 });
                                        }}
                                        className="text-primary focus:ring-primary"
                                    />
                                    <span className="text-sm text-slate-700 dark:text-slate-300">{type}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="startDate" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Date</label>
                            <input
                                type="date"
                                id="startDate"
                                required
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-800 text-slate-900 dark:text-white dark:[color-scheme:dark]"
                                value={formData.startDate}
                                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                            />
                        </div>
                        <div>
                            <label htmlFor="deadline" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Deadline</label>
                            <input
                                type="date"
                                id="deadline"
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-800 text-slate-900 dark:text-white dark:[color-scheme:dark]"
                                value={formData.deadline}
                                onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="revenue" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Revenue Earned (₹)</label>
                            <input
                                type="text"
                                id="revenue"
                                required
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                value={displayValues.revenue}
                                onChange={(e) => handleCurrencyChange('revenue', e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div>
                            <label htmlFor="costs" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Employee Costs (₹)
                                {resources.length > 0 && <span className="text-xs text-primary ml-2">(Calculated from Resources)</span>}
                            </label>
                            <input
                                type="text"
                                id="costs"
                                required
                                readOnly={resources.length > 0}
                                className={cn(
                                    "w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-800 text-slate-900 dark:text-white",
                                    resources.length > 0 && "bg-slate-50 dark:bg-slate-900 text-slate-500 cursor-not-allowed"
                                )}
                                value={resources.length > 0 ? formatCurrency(calculatedCost).replace('₹', '') : displayValues.costs}
                                onChange={(e) => !resources.length && handleCurrencyChange('costs', e.target.value)}
                                placeholder="0"
                            />
                        </div>
                    </div>
                </div>

                {/* RESOURCES TAB */}
                <div className={cn("space-y-4", activeTab === 'resources' ? 'block' : 'hidden')}>
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg flex items-center gap-3 text-blue-800 dark:text-blue-300 text-sm">
                        <Calculator className="w-5 h-5 flex-shrink-0" />
                        <p>
                            {formData.type === 'T&M'
                                ? <span>Resource costs are calculated as: <strong>Hourly Rate × Estimated Hours</strong>.</span>
                                : <span>Resource costs are calculated as: <strong>Salary × Allocation % × Duration</strong>.</span>
                            }
                        </p>
                    </div>

                    <div className="flex gap-2 items-end">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Add Resource</label>

                            <div className="mb-3">
                                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2 block">Quick Filter by Role</label>
                                <div className="flex flex-wrap gap-1.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedRole('')}
                                        className={cn(
                                            "px-2.5 py-1 text-xs font-medium rounded-full transition-colors border",
                                            selectedRole === ''
                                                ? "bg-primary text-white border-primary"
                                                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700"
                                        )}
                                    >
                                        All Roles
                                    </button>
                                    {availableRoles.map(role => (
                                        <button
                                            key={role}
                                            type="button"
                                            onClick={() => setSelectedRole(role)}
                                            className={cn(
                                                "px-2.5 py-1 text-xs font-medium rounded-full transition-colors border",
                                                selectedRole === role
                                                    ? "bg-primary text-white border-primary"
                                                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700"
                                            )}
                                        >
                                            {role}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <input
                                    type="text"
                                    placeholder="Search employees by name..."
                                    className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                                    value={empSearch}
                                    onChange={(e) => setEmpSearch(e.target.value)}
                                />
                                <select
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                    value={newResource.employeeId}
                                    onChange={(e) => setNewResource({ ...newResource, employeeId: e.target.value })}
                                >
                                    <option value="">Select Employee...</option>
                                    {employees
                                        .filter(e => !resources.some(r => Number(r.employeeId) === e.id)) // Filter out already assigned
                                        .filter(e => {
                                            // Match employee specialization to project type
                                            if (formData.type === 'T&M') return e.specialization === 'T&M';
                                            return e.specialization !== 'T&M';
                                        })
                                        .filter(e => selectedRole === '' || e.role === selectedRole)
                                        .filter(e => e.name.toLowerCase().includes(empSearch.toLowerCase()) || e.role.toLowerCase().includes(empSearch.toLowerCase()))
                                        .map(e => (
                                            <option key={e.id} value={e.id}>
                                                {e.name} - {e.role} ({formData.type === 'T&M' ? `${formatCurrency(e.hourly_rate)}/hr` : `${formatCurrency(e.monthly_salary)}/mo`})
                                            </option>
                                        ))}
                                </select>
                            </div>
                        </div>
                        <div className="w-24">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                {formData.type === 'T&M' ? 'Est. Hours' : 'Alloc. %'}
                            </label>
                            <input
                                type="number"
                                min="0"
                                max={formData.type === 'T&M' ? "" : "100"}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                value={newResource.allocation}
                                onChange={(e) => setNewResource({ ...newResource, allocation: e.target.value })}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={addResource}
                            disabled={!newResource.employeeId}
                            className="px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white disabled:opacity-50"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex flex-col max-h-48">
                        <div className="overflow-y-auto">
                            <table className="w-full text-sm text-left relative">
                                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 shadow-sm z-10">
                                    <tr>
                                        <th className="px-4 py-2">Employee</th>
                                        <th className="px-4 py-2">{formData.type === 'T&M' ? 'Hours' : 'Allocation'}</th>
                                        <th className="px-4 py-2 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {resources.length === 0 ? (
                                        <tr>
                                            <td colSpan="3" className="px-4 py-8 text-center text-slate-500">No resources assigned.</td>
                                        </tr>
                                    ) : (
                                        resources.map((r, i) => (
                                            <tr key={i}>
                                                <td className="px-4 py-2 text-slate-900 dark:text-white">{r.name}</td>
                                                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                                                    {r.allocation}{formData.type === 'T&M' ? ' hrs' : '%'}
                                                </td>
                                                <td className="px-4 py-2 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => removeResource(i)}
                                                        className="text-slate-400 hover:text-red-500"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div> {/* END SCROLLABLE VIEWPORT */}

            {/* MARGIN DISPLAY & ACTIONS */}
            <div className="shrink-0 pt-4 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-800">
                <div className="w-full sm:w-auto">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        Calculated Margin
                    </label>
                    <p className={cn(
                        "text-xl font-bold",
                        margin >= 0 ? "text-green-600 dark:text-green-500" : "text-red-500 dark:text-red-400"
                    )}>
                        {formatCurrency(margin)}
                    </p>
                </div>

                <div className="flex justify-end space-x-3 w-full sm:w-auto">
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
                        {isLoading ? 'Saving...' : 'Add Project'}
                    </button>
                </div>
            </div>
        </form>
    );
};

export default ProjectForm;
