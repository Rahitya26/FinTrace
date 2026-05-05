import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Users, Briefcase, Plus, Trash2, Calculator } from 'lucide-react';
import { getEmployees } from '../lib/api';
import { formatCurrency, cn } from '../lib/utils';
import { calculateInclusiveDays } from '../utils/dateUtils';

const PROCESS_TYPES = ['T&M', 'Fixed Bid'];

const ProjectForm = ({ clients, onSubmit, onCancel, isLoading, initialData }) => {
    const [employees, setEmployees] = useState([]);
    const [activeTab, setActiveTab] = useState('details');

    // Project Data
    const [formData, setFormData] = useState(initialData || {
        clientId: '',
        name: '',
        type: 'T&M',
        billingType: 'T&M',
        fixedContractValue: '',
        quotedBidValue: initialData?.quoted_bid_value || '',
        revenue: '',
        startDate: new Date().toISOString().split('T')[0],
        deadline: '',
        usdRate: '',
        budgetedHours: 0
    });

    const [displayValues, setDisplayValues] = useState({
        revenue: initialData?.revenue ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(initialData.revenue) : '',
        fixedContractValue: initialData?.fixed_contract_value ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(initialData.fixed_contract_value) : '',
        quotedBidValue: initialData?.quoted_bid_value ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(initialData.quoted_bid_value) : ''
    });

    // Resource Planner Data
    const [resources, setResources] = useState([]); // { employeeId, allocation, name, salary }
    const [newResource, setNewResource] = useState({
        employeeId: '',
        allocation: 100,
        usdRate: ''
    });
    const [empSearch, setEmpSearch] = useState('');
    const [selectedRole, setSelectedRole] = useState('');

    useEffect(() => {
        // Fetch employees for dropdown
        const fetchEmps = async () => {
            try {
                const res = await getEmployees({ limit: 1000 }); // Fetch a larger set for the dropdown
                const employeeData = Array.isArray(res.data) ? res.data : (res.data.data || []);
                // Only active employees
                setEmployees(employeeData.filter(e => e.status === 'Active'));
            } catch (err) {
                console.error("Failed to load employees");
            }
        };
        fetchEmps();
    }, []);

    const [margin, setMargin] = useState(0);
    const [calculatedCost, setCalculatedCost] = useState(0);

    // Helper: Calculate Business Days (Mon-Fri)
    const calculateBusinessDays = (start, end) => {
        if (!start || !end) return 0;
        let count = 0;
        const curDate = new Date(start);
        const endDate = new Date(end);
        while (curDate <= endDate) {
            const dayOfWeek = curDate.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
            curDate.setDate(curDate.getDate() + 1);
        }
        return count;
    };

    // Auto-calculate Budgeted Hours for Fixed Bid
    useEffect(() => {
        if (formData.billingType === 'Fixed Bid' && formData.startDate && formData.deadline) {
            const days = calculateBusinessDays(formData.startDate, formData.deadline);
            setFormData(prev => ({ ...prev, budgetedHours: days * 8 }));
        }
    }, [formData.startDate, formData.deadline, formData.billingType]);

    // Calculate Margin & Sync Cost
    useEffect(() => {
        const isTM = formData.billingType === 'T&M';
        const isFixedBid = formData.billingType === 'Fixed Bid';
        
        let totalCost = 0;
        let totalRevenue = 0;

        if (isFixedBid) {
            totalRevenue = (parseFloat(formData.fixedContractValue) || 0) * 83.15;
        } else {
            totalRevenue = parseFloat(formData.revenue) || 0;
        }

        if (resources.length > 0) {
            const today = new Date();

            resources.forEach(r => {
                const emp = employees.find(e => e.id === Number(r.employeeId));
                const salary = emp ? Number(emp.monthly_salary) : 0;
                
                // For Fixed Bid, allocation matters for cost. For T&M, we often ignore simplified allocation in this simulation
                const allocation = (Number(r.allocation) || 100) / 100;
                const monthlyBurn = salary * allocation;

                const start = new Date(r.startDate || formData.startDate);
                if (today <= start) return;

                let calculationEndDate = new Date();
                if (r.endDate) {
                    calculationEndDate = new Date(r.endDate);
                } else if (formData.status === 'Completed' && formData.deadline) {
                    calculationEndDate = new Date(formData.deadline);
                }

                const durationMonths = calculateInclusiveDays(start, calculationEndDate) / 30.0;

                if (isTM) {
                    // T&M revenue projection for the UI simulation
                    const usdRate = Number(r.usdRate) || 0;
                    totalRevenue += (usdRate * 176 * 83.15 * durationMonths);
                    totalCost += (monthlyBurn * durationMonths);
                } else {
                    totalCost += (monthlyBurn * durationMonths);
                }
            });
        }

        setCalculatedCost(totalCost);
        setMargin(totalRevenue - totalCost);
    }, [formData.revenue, formData.fixedContractValue, formData.billingType, formData.startDate, formData.deadline, formData.status, resources, employees, formData.type]);

    const selectEmployeeForResource = (empId) => {
        const emp = employees.find(e => e.id === Number(empId));
        if (emp) {
            setNewResource({
                ...newResource,
                employeeId: empId,
                usdRate: emp.usd_hourly_rate || ''
            });
        } else {
            setNewResource({ ...newResource, employeeId: '' });
        }
    };

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

        if (resources.some(r => Number(r.employeeId) === emp.id)) {
            toast.error(`${emp.name} is already assigned to this project`);
            return;
        }

        setResources([...resources, {
            ...newResource,
            name: emp.name,
            salary: emp.monthly_salary,
            hourly_rate: emp.hourly_rate,
            usdRate: newResource.usdRate || emp.usd_hourly_rate
        }]);
        setNewResource({
            employeeId: '',
            allocation: 100,
            usdRate: ''
        });
    };

    const handleOffboardClick = (index) => {
        const todayStr = new Date().toISOString().split('T')[0];
        const dateInput = window.prompt("Enter End Date (YYYY-MM-DD) to Offboard:", todayStr);
        if (dateInput !== null) {
            const newDate = new Date(dateInput);
            if (!isNaN(newDate.getTime())) {
                const newResources = [...resources];
                newResources[index].endDate = newDate.toISOString().split('T')[0];
                setResources(newResources);
            } else {
                toast.error("Invalid date format. Please use YYYY-MM-DD.");
            }
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        if (resources.length === 0) {
            toast.error("Please assign at least one resource to the project.");
            return;
        }

        try {
            const finalCost = calculatedCost;

            onSubmit({
                ...formData,
                revenue: parseFloat(formData.revenue) || 0,
                costs: finalCost,
                margin,
                startDate: formData.startDate,
                deadline: formData.deadline || null,
                resources: resources.map(r => ({
                    ...r,
                    employeeId: Number(r.employeeId),
                    allocation: Number(r.allocation),
                    startDate: r.startDate || formData.startDate,
                    endDate: r.endDate || null
                })),
                budgetedHours: formData.budgetedHours,
                quotedBidValue: parseFloat(formData.quotedBidValue) || 0
            });
        } catch (err) {
            toast.error("Invalid form data");
        }
    };

    const availableRoles = [...new Set(employees.map(e => e.role))].filter(Boolean).sort();

    return (
        <form onSubmit={handleSubmit} className="flex flex-col max-h-[80vh] w-full">
            {/* TABS HEADER */}
            <div className="flex space-x-6 border-b border-slate-200 dark:border-slate-700 px-4 pt-2 shrink-0">
                <button
                    type="button"
                    onClick={() => setActiveTab('details')}
                    className={cn(
                        "pb-3 text-sm font-medium transition-colors relative outline-none",
                        activeTab === 'details' ? "text-primary" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                    )}
                >
                    Project Details
                    {activeTab === 'details' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('resources')}
                    className={cn(
                        "pb-3 text-sm font-medium transition-colors relative outline-none",
                        activeTab === 'resources' ? "text-primary" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                    )}
                >
                    Resource Planner
                    {activeTab === 'resources' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
                </button>
            </div>

            {/* SCROLLABLE VIEWPORT */}
            <div className="flex-1 overflow-y-auto px-4 py-6 min-h-0">

                {/* DETAILS TAB */}
                {activeTab === 'details' && (
                    <div className="space-y-4 flex flex-col max-w-2xl mx-auto">
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
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Billing Type</label>
                            <div className="flex space-x-4">
                                {['T&M', 'Fixed Bid'].map(bType => (
                                    <label key={bType} className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="billingType"
                                            value={bType}
                                            checked={formData.billingType === bType}
                                            onChange={(e) => setFormData({ ...formData, billingType: e.target.value })}
                                            className="text-primary focus:ring-primary"
                                        />
                                        <span className="text-sm text-slate-700 dark:text-slate-300">{bType}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {formData.billingType === 'Fixed Bid' && (
                            <div className="mb-4">
                                <label htmlFor="quotedBidValue" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Total Contract Value (₹)
                                </label>
                                <input
                                    type="text"
                                    id="quotedBidValue"
                                    required
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                    value={displayValues.quotedBidValue}
                                    onChange={(e) => handleCurrencyChange('quotedBidValue', e.target.value)}
                                    placeholder="e.g. 8,30,000"
                                />
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">
                                    Required. This base value drives internal hourly rates for fixed bid margins.
                                </p>
                            </div>
                        )}

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
                                <label htmlFor="deadline" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    {formData.type === 'T&M' ? 'Projected End Date' : 'Deadline'}
                                </label>
                                <input
                                    type="date"
                                    id="deadline"
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-800 text-slate-900 dark:text-white dark:[color-scheme:dark]"
                                    value={formData.deadline}
                                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                                />
                            </div>
                        </div>

                        {formData.type !== 'T&M' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    {(() => {
                                        const isEditMode = !!initialData;
                                        const isFixedBid = formData.type === 'Fixed Bid';
                                        return (
                                            <>
                                                <label htmlFor="revenue" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                    {isFixedBid ? "Quoted Bid Amount (₹)" : "Revenue Earned (₹)"}
                                                    {isEditMode && isFixedBid && <span className="ml-2 text-[10px] text-red-500 uppercase tracking-wider font-bold">Locked</span>}
                                                </label>
                                                <input
                                                    type="text"
                                                    id="revenue"
                                                    required
                                                    disabled={isEditMode && isFixedBid}
                                                    className={cn(
                                                        "w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2",
                                                        (isEditMode && isFixedBid)
                                                            ? "bg-slate-50 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 cursor-not-allowed"
                                                            : "border-slate-300 dark:border-slate-600 focus:ring-primary/50 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                                    )}
                                                    value={displayValues.revenue}
                                                    onChange={(e) => handleCurrencyChange('revenue', e.target.value)}
                                                    placeholder="0"
                                                />
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>

                )}

                {/* RESOURCES TAB */}
                {activeTab === 'resources' && (
                    <div className="space-y-4 flex flex-col w-[95%] mx-auto">
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg flex items-center gap-3 text-blue-800 dark:text-blue-300 text-sm">
                            <Calculator className="w-5 h-5 flex-shrink-0" />
                            <p>
                                {formData.type === 'T&M'
                                    ? <span>Revenue is calculated as: <strong>176 hrs × Billable Rate ($) × FX Rate (83.15)</strong>.</span>
                                    : <span>Resource costs are calculated as: <strong>Salary × Allocation % × Duration</strong>.</span>
                                }
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 items-end bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 w-full mb-6">
                            <div className="w-full sm:w-[40%]">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Add Resource</label>
                                    {newResource.employeeId && (() => {
                                        const emp = employees.find(e => e.id === Number(newResource.employeeId));
                                        if (!emp) return null;
                                        
                                        // Current allocation from OTHER projects
                                        const otherProjectsAlloc = Number(emp.current_allocation || 0);
                                        // Allocation already added in THIS project form
                                        const currentFormAlloc = resources
                                            .filter(r => Number(r.employeeId) === emp.id)
                                            .reduce((sum, r) => sum + Number(r.allocation || 0), 0);
                                        
                                        const remaining = 100 - (otherProjectsAlloc + currentFormAlloc);
                                        
                                        return (
                                            <span className={cn(
                                                "text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider",
                                                remaining > 20 ? "bg-emerald-50 text-emerald-600 border-emerald-100" : remaining > 0 ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-red-50 text-red-600 border-red-100"
                                            )}>
                                                Available: {remaining}%
                                            </span>
                                        );
                                    })()}
                                </div>

                                <div className="mb-3">
                                    <div className="flex flex-wrap gap-1.5 pb-2">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedRole('')}
                                            className={cn(
                                                "px-2.5 py-1 text-xs font-medium rounded-full transition-colors border",
                                                selectedRole === ''
                                                    ? "bg-primary text-white border-primary"
                                                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700"
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
                                                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700"
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
                                        className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:border-primary"
                                        value={empSearch}
                                        onChange={(e) => setEmpSearch(e.target.value)}
                                    />
                                    <select
                                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                        value={newResource.employeeId}
                                        onChange={(e) => selectEmployeeForResource(e.target.value)}
                                    >
                                        <option value="">Select Employee...</option>
                                        {employees
                                            .filter(e => !resources.some(r => Number(r.employeeId) === e.id))
                                            .filter(e => selectedRole === '' || e.role === selectedRole)
                                            .filter(e => e.name.toLowerCase().includes(empSearch.toLowerCase()) || e.role.toLowerCase().includes(empSearch.toLowerCase()))
                                            .map(e => {
                                                const currentAlloc = Number(e.current_allocation || 0);
                                                return (
                                                    <option key={e.id} value={e.id}>
                                                        {e.name} - {e.role} ({currentAlloc}% Allocated)
                                                    </option>
                                                );
                                            })}
                                    </select>
                                </div>
                            </div>

                            {formData.billingType === 'T&M' && (
                                <div className="w-full sm:w-[20%]">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Billable Rate ($/hr)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                        value={newResource.usdRate}
                                        onChange={(e) => setNewResource({ ...newResource, usdRate: e.target.value })}
                                        placeholder="Rate"
                                    />
                                </div>
                            )}

                            <div className="w-full sm:w-[15%]">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Alloc. %
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                    value={newResource.allocation}
                                    onChange={(e) => setNewResource({ ...newResource, allocation: e.target.value })}
                                />
                            </div>

                            <div className="w-full sm:w-[15%] flex justify-end sm:justify-start">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const emp = employees.find(e => e.id === Number(newResource.employeeId));
                                        if (emp) {
                                            const totalAlloc = Number(emp.current_allocation || 0) + Number(newResource.allocation || 0);
                                            if (totalAlloc > 100) {
                                                toast.error(`${emp.name} would exceed 100% capacity (${totalAlloc}%). Please reduce allocation.`);
                                                return;
                                            }
                                        }
                                        addResource();
                                    }}
                                    disabled={!newResource.employeeId}
                                    className="w-full sm:w-auto px-4 py-2 bg-slate-900 dark:bg-slate-100 rounded-lg hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 font-medium disabled:opacity-50 transition-colors whitespace-nowrap"
                                >
                                    <span className="sm:hidden">Add to Project</span>
                                    <span className="hidden sm:inline">Add</span>
                                </button>
                            </div>
                        </div>

                        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden flex flex-col max-h-48">
                            <div className="overflow-y-auto">
                                <table className="w-full text-sm text-left relative">
                                    <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 shadow-sm z-10">
                                        <tr>
                                            <th className="px-4 py-2">Employee</th>
                                            <th className="px-4 py-2">Start Date</th>
                                            {formData.billingType === 'T&M' && <th className="px-4 py-2">Billable Rate ($)</th>}
                                            <th className="px-4 py-2">Allocation</th>
                                            <th className="px-4 py-2 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {resources.length === 0 ? (
                                            <tr>
                                                <td colSpan={formData.type !== 'T&M' ? "4" : "3"} className="px-4 py-8 text-center text-slate-500">No resources assigned.</td>
                                            </tr>
                                        ) : (
                                            resources.map((r, i) => (
                                                <tr key={i}>
                                                    <td className="px-4 py-2 text-slate-900 dark:text-white">
                                                        <div>{r.name}</div>
                                                        {formData.type === 'T&M' && (!r.hourly_rate || Number(r.hourly_rate) === 0) && (
                                                            <div className="text-[10px] text-amber-600 dark:text-amber-500 font-bold mt-0.5">Missing billing rate for this resource.</div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                                                        {r.startDate ? format(new Date(r.startDate), 'dd MMM yyyy') : 'N/A'}
                                                    </td>
                                                    {formData.billingType === 'T&M' && (
                                                        <td className="px-4 py-2 text-slate-600 dark:text-slate-300 font-mono">
                                                            ${Number(r.usdRate || 0).toFixed(2)}
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                                                        {r.allocation}%
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        {!r.endDate ? (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    handleOffboardClick(i);
                                                                }}
                                                                className="text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400 font-medium text-xs px-2 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 rounded transition-colors"
                                                            >
                                                                Offboard
                                                            </button>
                                                        ) : (
                                                            <span className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
                                                                {format(new Date(r.endDate), 'dd MMM')}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div> {/* END SCROLLABLE VIEWPORT */}

            {/* MARGIN DISPLAY & ACTIONS */}
            <div className="shrink-0 p-6 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50 dark:bg-slate-800/80 overflow-hidden relative z-20 mt-auto">
                {/* Financial Summary or Empty State */}
                {resources.length === 0 || (formData.type !== 'T&M' && (!formData.revenue || Number(formData.revenue) === 0)) ? (
                    <div className="flex items-center justify-center w-full sm:w-auto h-full px-4 py-2 text-sm text-slate-500 dark:text-slate-400 italic mr-auto">
                        Add resources and revenue to view margin projections
                    </div>
                ) : formData.type === 'T&M' ? (() => {
                    let monthlyCost = 0;
                    let monthlyBilling = 0;
                    resources.forEach(r => {
                        const emp = employees.find(e => e.id === Number(r.employeeId));
                        if (emp) {
                            monthlyCost += (Number(emp.monthly_salary) || 0) * (Number(r.allocation) / 100);
                            const effectiveUsdRate = Number(r.usdRate || emp.usd_hourly_rate || 0);
                            monthlyBilling += (effectiveUsdRate * 176 * 83.15);
                        }
                    });
                    return (
                        <div className="flex flex-col max-w-full overflow-hidden shrink-0 mr-auto">
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Projected Monthly Revenue</span>
                            <div className="flex items-end gap-3 truncate">
                                <span className="text-xl font-bold text-slate-900 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-white dark:to-slate-300">
                                    {formatCurrency(monthlyBilling)}
                                </span>
                                <span className="text-sm font-medium text-slate-500 mb-0.5">
                                    | Cost: {formatCurrency(monthlyCost)}
                                </span>
                            </div>
                        </div>
                    );
                })() : (
                    <div className="flex gap-3 sm:gap-6 items-center w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0 hide-scrollbar mr-auto">
                        <div className="shrink-0">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                                {formData.type === 'T&M' ? 'Revenue' : 'Quoted Bid'}
                            </label>
                            <p className="text-xl font-bold text-slate-900 dark:text-white">
                                {formatCurrency(parseFloat(formData.revenue) || 0)}
                            </p>
                        </div>
                        <div className="text-xl font-bold text-slate-400 shrink-0">-</div>
                        <div className="shrink-0">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1 group/cost">
                                Expected Cost
                                <div className="relative">
                                    <AlertCircle className="w-2.5 h-2.5 text-slate-400 cursor-help" />
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-slate-800 text-white text-[9px] rounded shadow-xl opacity-0 group-hover/cost:opacity-100 transition-opacity whitespace-nowrap z-[70] pointer-events-none">
                                        Calculated as (Logged Hours * Internal Rate)
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                                    </div>
                                </div>
                            </label>
                            <p className="text-xl font-bold text-slate-900 dark:text-white">
                                {formatCurrency(calculatedCost)}
                            </p>
                        </div>
                        <div className="text-xl font-bold text-slate-400 shrink-0">=</div>
                        <div className="shrink-0">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                                Est. Margin
                            </label>
                            <p className={cn(
                                "text-xl font-bold",
                                margin >= 0 ? "text-green-600 dark:text-green-500" : "text-red-500 dark:text-red-400"
                            )}>
                                {formatCurrency(margin)}
                            </p>
                        </div>
                    </div>
                )}

                <div className="flex justify-end space-x-4 w-full sm:w-auto">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50"
                    >
                        {isLoading ? 'Saving...' : 'Add Project'}
                    </button>
                </div>
            </div>

        </form >
    );
};

export default ProjectForm;
