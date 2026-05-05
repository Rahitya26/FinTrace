import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, AlertCircle, UserPlus, Search, ChevronDown } from 'lucide-react';
import api from '../lib/api';
import { formatCurrency, cn } from '../lib/utils';

const AssignResourceModal = ({ isOpen, onClose, project, onAddSuccess }) => {
    const [employees, setEmployees] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [allocation, setAllocation] = useState(100);
    const [usdRate, setUsdRate] = useState('');
    const [error, setError] = useState(null);

    // Dropdown state
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        if (isOpen && project) {
            fetchEmployees();
            setSelectedEmployeeId('');
            setSearchTerm('');
            setIsDropdownOpen(false);
            setStartDate(new Date().toISOString().split('T')[0]);
            setAllocation(100);
            setUsdRate('');
            setError(null);
        }
    }, [isOpen, project]);

    // Outside click handler
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchEmployees = async () => {
        try {
            setIsLoading(true);
            const response = await api.get('/employees?limit=1000');
            setEmployees(response.data.data || response.data);
        } catch (err) {
            console.error('Failed to fetch employees', err);
            setError('Failed to load employee list');
        } finally {
            setIsLoading(false);
        }
    };

    const selectedEmp = employees.find(e => Number(e.id) === Number(selectedEmployeeId));
    const currentAlloc = selectedEmp ? Number(selectedEmp.current_allocation || 0) : 0;
    const remainingCapacity = Math.max(0, 100 - currentAlloc);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedEmployeeId || !startDate) {
            setError('Please fill in all required fields');
            return;
        }

        const requestedAlloc = Number(allocation);
        if (requestedAlloc > remainingCapacity) {
            setError(`Insufficient bandwidth. This employee only has ${remainingCapacity}% capacity remaining.`);
            return;
        }

        try {
            setIsSaving(true);
            setError(null);

            await api.post(`/projects/${project.id}/resources`, {
                employeeId: selectedEmployeeId,
                startDate,
                allocationPercentage: requestedAlloc,
                usdRate: Number(usdRate)
            });

            onAddSuccess();
        } catch (err) {
            console.error('Failed to add resource', err);
            setError(err.response?.data?.details || err.response?.data?.error || 'An error occurred while assigning resource');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen || !project) return null;

    const filteredEmployees = employees.filter(emp =>
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.role.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleDropdown = () => {
        if (isLoading) return;
        setIsDropdownOpen(!isDropdownOpen);
        if (!isDropdownOpen) setSearchTerm('');
    };

    const selectEmployee = (emp) => {
        const isAssigned = project.debug_info?.plans?.some(p => Number(p.employee_id) === Number(emp.id) && !p.offboarded);
        if (isAssigned) return;

        setSelectedEmployeeId(emp.id);
        setUsdRate(emp.usd_hourly_rate || '');
        setAllocation(Math.min(100, 100 - Number(emp.current_allocation || 0)));
        setIsDropdownOpen(false);
        setSearchTerm('');
    };

    const getSelectedEmployeeName = () => {
        if (!selectedEmployeeId) return '';
        const emp = employees.find(e => Number(e.id) === Number(selectedEmployeeId));
        return emp ? `${emp.name} - ${emp.role}` : '';
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Quick Add Resource</h2>
                        <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                            To <span className="font-semibold text-slate-700 dark:text-slate-300">{project.name}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 font-bold border border-slate-200 dark:border-slate-700">{project.type}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6">
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm flex items-start gap-3 border border-red-200 dark:border-red-900/50">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <p>{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Select Employee
                            </label>
                            <div className="relative" ref={dropdownRef}>
                                <div
                                    onClick={toggleDropdown}
                                    className={cn(
                                        "w-full px-3 py-2 border rounded-lg flex items-center justify-between cursor-pointer transition-all focus:ring-2 focus:ring-primary/50 outline-none",
                                        isLoading
                                            ? "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed"
                                            : "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white",
                                        isDropdownOpen && "border-primary ring-2 ring-primary/20"
                                    )}
                                    tabIndex={0}
                                >
                                    <span className="truncate">
                                        {getSelectedEmployeeName() || "-- Choose Employee --"}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {selectedEmployeeId && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedEmployeeId('');
                                                }}
                                                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                                            >
                                                <X className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                                            </button>
                                        )}
                                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                    </div>
                                </div>

                                {isDropdownOpen && (
                                    <div className="absolute z-[60] w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden">
                                        <div className="p-2 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 flex items-center">
                                            <Search className="w-4 h-4 text-slate-400 ml-2 mr-2 shrink-0" />
                                            <input
                                                type="text"
                                                autoFocus
                                                placeholder="Type to search..."
                                                className="w-full bg-transparent border-none focus:outline-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400 py-1"
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        <ul className="max-h-60 overflow-y-auto py-1">
                                            {filteredEmployees.length > 0 ? (
                                                filteredEmployees.map(emp => {
                                                    const isAssigned = project.debug_info?.plans?.some(p => Number(p.employee_id) === Number(emp.id) && !p.offboarded);
                                                    const currentAlloc = Number(emp.current_allocation || 0);
                                                    return (
                                                        <li
                                                            key={emp.id}
                                                            className={cn(
                                                                "px-4 py-2 text-sm cursor-pointer transition-colors",
                                                                isAssigned
                                                                    ? "opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800/50 italic text-slate-400"
                                                                    : Number(emp.id) === Number(selectedEmployeeId)
                                                                        ? "bg-primary text-white font-medium"
                                                                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                                                            )}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                selectEmployee(emp);
                                                            }}
                                                        >
                                                            <div className="flex flex-col">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="font-semibold">{emp.name}</span>
                                                                    <span className={cn(
                                                                        "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border",
                                                                        currentAlloc >= 100 
                                                                            ? "bg-red-50 text-red-600 border-red-100 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
                                                                            : "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800"
                                                                    )}>
                                                                        {currentAlloc}% Allocated
                                                                    </span>
                                                                </div>
                                                                <span className="text-[11px] opacity-80 whitespace-nowrap">
                                                                    {emp.role} {isAssigned && '• Already Assigned'}
                                                                </span>
                                                            </div>
                                                        </li>
                                                    );
                                                })
                                            ) : (
                                                <li className="px-4 py-3 text-sm text-slate-500 text-center italic">
                                                    No employees found matching "{searchTerm}"
                                                </li>
                                            )}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Assignment Start Date
                                </label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-800 text-slate-900 dark:text-white dark:[color-scheme:dark]"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Billable Rate ($/hr)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={usdRate}
                                    onChange={(e) => setUsdRate(e.target.value)}
                                    placeholder="Enter rate ($)"
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                    required
                                />
                            </div>

                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Allocation %
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="number"
                                        min="1"
                                        max={remainingCapacity}
                                        value={allocation}
                                        onChange={(e) => setAllocation(e.target.value)}
                                        className={cn(
                                            "flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-800 text-slate-900 dark:text-white",
                                            Number(allocation) > remainingCapacity ? "border-red-500 focus:ring-red-500/20" : "border-slate-300 dark:border-slate-600"
                                        )}
                                        required
                                    />
                                    {selectedEmp && (
                                        <div className="text-right">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">Max Available</p>
                                            <p className="text-sm font-black text-slate-700 dark:text-slate-200">{remainingCapacity}%</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {selectedEmp && (
                            <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Capacity Insight</h4>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm text-slate-600 dark:text-slate-300">Current Assignments</span>
                                    <span className="font-bold text-slate-700 dark:text-slate-300">{currentAlloc}%</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-600 dark:text-slate-300">Remaining Bandwidth</span>
                                    <span className={cn(
                                        "font-bold",
                                        remainingCapacity > 20 ? "text-emerald-500" : remainingCapacity > 0 ? "text-amber-500" : "text-red-500"
                                    )}>
                                        {remainingCapacity}%
                                    </span>
                                </div>
                                <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                    <span className="text-slate-600 dark:text-slate-400 text-xs italic">
                                        Post-Assignment Status
                                    </span>
                                    <span className={cn(
                                        "font-black text-slate-900 dark:text-white",
                                        (currentAlloc + Number(allocation)) > 100 ? "text-red-500" : "text-emerald-500"
                                    )}>
                                        {currentAlloc + Number(allocation)}% Total
                                    </span>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSaving}
                                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving || !selectedEmployeeId}
                                className="px-5 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-600 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                Add to Project
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AssignResourceModal;
