import React, { useState, useEffect, useRef } from 'react';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
import { Clock, Plus, Calendar, Save, Coffee, Lock, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { getEmployees, getProjects, getTimesheets, logTimesheet, getClients, getClientResources } from '../lib/api';

const Timesheets = () => {
    const [employees, setEmployees] = useState([]); // Project-specific employees
    const [allEmployees, setAllEmployees] = useState([]); // All active employees for filtering
    const [clients, setClients] = useState([]);
    const [projects, setProjects] = useState([]);
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // Dropdown state
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const [formData, setFormData] = useState({
        client_id: '',
        employee_id: '',
        project_id: '',
        date: new Date().toISOString().split('T')[0],
        hours_worked: '',
        description: '',
        is_leave: false
    });

    const [filterEmployee, setFilterEmployee] = useState('');
    const [filterSearch, setFilterSearch] = useState('');
    const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
    const filterDropdownRef = useRef(null);

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (filterEmployee) {
            fetchLogs(filterEmployee);
        } else {
            setLogs([]);
        }
    }, [filterEmployee]);

    const fetchInitialData = async () => {
        try {
            const [empsRes, projsRes, clientsRes] = await Promise.all([
                getEmployees(),
                getProjects({ limit: 100 }),
                getClients()
            ]);
            setAllEmployees(empsRes.data.filter(e => e.status === 'Active'));
            setProjects(projsRes.data.data.filter(p => p.status === 'Active' || p.status === 'Pipeline'));
            setClients(clientsRes.data);
        } catch (error) {
            toast.error("Failed to load generic data");
        }
    };

    // Watch for client selection to fetch assigned resources
    useEffect(() => {
        if (formData.client_id) {
            fetchClientEmployees(formData.client_id);
            // Optionally reset project/employee when client changes
            setFormData(prev => ({ ...prev, project_id: '', employee_id: '' }));
        } else {
            setEmployees([]);
            setFormData(prev => ({ ...prev, project_id: '', employee_id: '' }));
        }
    }, [formData.client_id]);

    const fetchClientEmployees = async (clientId) => {
        try {
            const res = await getClientResources(clientId);
            setEmployees(res.data || []);
        } catch (error) {
            toast.error("Failed to fetch assigned employees for client");
        }
    };

    const fetchLogs = async (empId) => {
        setIsLoading(true);
        try {
            // Fetch logs for the last 30 days
            const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
            const res = await getTimesheets({ employeeId: empId, startDate });
            setLogs(res.data);
        } catch (error) {
            toast.error("Failed to fetch timesheet logs");
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleLeave = () => {
        setFormData(prev => {
            const isLeaveNow = !prev.is_leave;
            return {
                ...prev,
                is_leave: isLeaveNow,
                hours_worked: isLeaveNow ? '0' : '',
                description: isLeaveNow ? 'Leave' : prev.description
            };
        });
    };

    // --- Searchable Dropdown Logic ---
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
            if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
                setIsFilterDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredEmployees = employees.filter(emp =>
        emp.name.toLowerCase().includes(employeeSearch.toLowerCase())
    );

    const filteredAllEmployees = allEmployees.filter(emp =>
        emp.name.toLowerCase().includes(filterSearch.toLowerCase())
    );

    const toggleDropdown = () => {
        if (!formData.client_id || employees.length === 0) return;
        setIsDropdownOpen(!isDropdownOpen);
        if (!isDropdownOpen) setEmployeeSearch('');
    };

    const toggleFilterDropdown = () => {
        setIsFilterDropdownOpen(!isFilterDropdownOpen);
        if (!isFilterDropdownOpen) setFilterSearch('');
    };

    const selectEmployee = (emp) => {
        setFormData({ ...formData, employee_id: emp.id, project_id: emp.project_id });
        setEmployeeSearch('');
        setIsDropdownOpen(false);
    };

    const getSelectedEmployeeName = () => {
        if (!formData.employee_id) return '';
        const emp = employees.find(e => Number(e.id) === Number(formData.employee_id));
        return emp ? emp.name : '';
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.employee_id || !formData.project_id || !formData.date) {
            toast.error("Please fill in all required fields.");
            return;
        }

        if (formData.hours_worked === '' || isNaN(Number(formData.hours_worked))) {
            toast.error("Please enter valid hours.");
            return;
        }

        try {
            await logTimesheet({
                employee_id: formData.employee_id,
                project_id: formData.project_id,
                date: formData.date,
                hours_worked: Number(formData.hours_worked),
                description: formData.description
            });
            toast.success("Timesheet logged successfully!");

            // Refresh logs
            if (filterEmployee === formData.employee_id) {
                fetchLogs(filterEmployee);
            } else {
                setFilterEmployee(formData.employee_id);
            }

            // Reset form but keep employee and date
            setFormData(prev => ({
                ...prev,
                project_id: '',
                hours_worked: '',
                description: '',
                is_leave: false
            }));
        } catch (err) {
            toast.error(err.response?.data?.error || "Failed to log timesheet");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Daily Logger</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Log your daily work hours and leaves</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LOGGER FORM */}
                <div className="lg:col-span-1">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                            <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center">
                                <Clock className="w-4 h-4 mr-2 text-primary" /> New Log Entry
                            </h2>
                        </div>

                        <form onSubmit={handleSubmit} className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date</label>
                                <input
                                    type="date"
                                    max={new Date().toISOString().split('T')[0]}
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-700 text-slate-900 dark:text-white dark:[color-scheme:dark]"
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Client</label>
                                <select
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                    value={formData.client_id}
                                    onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                                    required
                                >
                                    <option value="">Select client...</option>
                                    {clients.map(client => (
                                        <option key={client.id} value={client.id}>{client.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Project Dropdown Removed - Auto Resolved via Employee Selection */}

                            <div className="relative" ref={dropdownRef}>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Employee</label>
                                <div
                                    onClick={toggleDropdown}
                                    className={cn(
                                        "w-full px-3 py-2 border rounded-lg flex items-center justify-between cursor-pointer transition-colors focus:ring-2 focus:ring-primary/50 outline-none",
                                        (!formData.client_id || employees.length === 0)
                                            ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed"
                                            : "bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white",
                                        isDropdownOpen && "border-primary ring-2 ring-primary/20"
                                    )}
                                    tabIndex={0}
                                >
                                    <span className="truncate">
                                        {getSelectedEmployeeName() || (formData.client_id ? (employees.length ? "Select your name..." : "No employees assigned to client") : "Select client first...")}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {formData.employee_id && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setFormData({ ...formData, employee_id: '' });
                                                }}
                                                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors"
                                            >
                                                <X className="w-3 h-3 text-slate-500" />
                                            </button>
                                        )}
                                        <ChevronDown className="w-4 h-4 text-slate-400" />
                                    </div>
                                </div>

                                {isDropdownOpen && (
                                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden">
                                        <div className="p-2 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 flex items-center">
                                            <Search className="w-4 h-4 text-slate-400 ml-2 mr-2 shrink-0" />
                                            <input
                                                type="text"
                                                autoFocus
                                                placeholder="Search employees..."
                                                className="w-full bg-transparent border-none focus:outline-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400 py-1"
                                                value={employeeSearch}
                                                onChange={(e) => setEmployeeSearch(e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        <ul className="max-h-60 overflow-y-auto py-1">
                                            {filteredEmployees.length > 0 ? (
                                                filteredEmployees.map(emp => (
                                                    <li
                                                        key={emp.id}
                                                        className={cn(
                                                            "px-4 py-2 text-sm cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors",
                                                            Number(emp.id) === Number(formData.employee_id)
                                                                ? "bg-primary-50 text-primary dark:bg-primary-900/30 dark:text-primary-400 font-medium"
                                                                : "text-slate-700 dark:text-slate-300"
                                                        )}
                                                        onClick={() => selectEmployee(emp)}
                                                    >
                                                        {emp.name}
                                                    </li>
                                                ))
                                            ) : (
                                                <li className="px-4 py-3 text-sm text-slate-500 text-center italic">
                                                    No matches found
                                                </li>
                                            )}
                                        </ul>
                                    </div>
                                )}
                                {/* Keep native validation via hidden input */}
                                <input type="hidden" name="employee_id" required value={formData.employee_id} />
                            </div>

                            <div className="flex items-center gap-4 py-2">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Hours</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="24"
                                        step="0.5"
                                        className={cn(
                                            "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary/50 transition-colors",
                                            formData.is_leave
                                                ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed"
                                                : "bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white"
                                        )}
                                        value={formData.hours_worked}
                                        onChange={(e) => setFormData({ ...formData, hours_worked: e.target.value })}
                                        disabled={formData.is_leave}
                                        required
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={handleToggleLeave}
                                    className={cn(
                                        "mt-6 px-4 py-2 rounded-lg border font-medium flex items-center transition-colors",
                                        formData.is_leave
                                            ? "bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700/50 dark:text-amber-400"
                                            : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                                    )}
                                >
                                    <Coffee className="w-4 h-4 mr-2" />
                                    {formData.is_leave ? "On Leave" : "Mark Leave"}
                                </button>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                                <textarea
                                    rows="3"
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="What did you work on?"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-2 px-4 bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition-colors flex items-center justify-center"
                            >
                                <Save className="w-4 h-4 mr-2" /> Save Log
                            </button>
                        </form>
                    </div>
                </div>

                {/* RECENT LOGS */}
                <div className="lg:col-span-2">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden h-full flex flex-col">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50 dark:bg-slate-800/50">
                            <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center">
                                <Calendar className="w-4 h-4 mr-2 text-primary" /> Filter Logs (30 Days)
                            </h2>
                            <div className="relative w-full sm:w-64" ref={filterDropdownRef}>
                                <div
                                    onClick={toggleFilterDropdown}
                                    className={cn(
                                        "w-full px-3 py-1.5 text-sm border rounded-lg flex items-center justify-between cursor-pointer transition-colors focus:ring-2 focus:ring-primary/50 outline-none bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white",
                                        isFilterDropdownOpen && "border-primary ring-2 ring-primary/20"
                                    )}
                                    tabIndex={0}
                                >
                                    <span className="truncate">
                                        {allEmployees.find(e => Number(e.id) === Number(filterEmployee))?.name || "Select Employee..."}
                                    </span>
                                    <ChevronDown className="w-4 h-4 text-slate-400" />
                                </div>

                                {isFilterDropdownOpen && (
                                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden">
                                        <div className="p-2 border-b border-slate-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 flex items-center">
                                            <Search className="w-4 h-4 text-slate-400 ml-2 mr-2 shrink-0" />
                                            <input
                                                type="text"
                                                autoFocus
                                                placeholder="Search employees..."
                                                className="w-full bg-transparent border-none focus:outline-none text-sm text-slate-900 dark:text-white placeholder:text-slate-400 py-1"
                                                value={filterSearch}
                                                onChange={(e) => setFilterSearch(e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        <ul className="max-h-60 overflow-y-auto py-1 text-left">
                                            <li
                                                className={cn(
                                                    "px-4 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors",
                                                    !filterEmployee ? "font-bold text-primary" : "text-slate-700 dark:text-slate-300"
                                                )}
                                                onClick={() => { setFilterEmployee(''); setIsFilterDropdownOpen(false); }}
                                            >
                                                Clear Filter
                                            </li>
                                            {filteredAllEmployees.length > 0 ? (
                                                filteredAllEmployees.map(emp => (
                                                    <li
                                                        key={emp.id}
                                                        className={cn(
                                                            "px-4 py-2 text-sm cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors",
                                                            Number(emp.id) === Number(filterEmployee)
                                                                ? "bg-primary-50 text-primary dark:bg-primary-900/30 dark:text-primary-400 font-medium"
                                                                : "text-slate-700 dark:text-slate-300"
                                                        )}
                                                        onClick={() => { setFilterEmployee(emp.id); setIsFilterDropdownOpen(false); }}
                                                    >
                                                        {emp.name}
                                                    </li>
                                                ))
                                            ) : (
                                                <li className="px-4 py-3 text-sm text-slate-500 text-center italic">
                                                    No matches found
                                                </li>
                                            )}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 p-4 overflow-auto">
                            {!filterEmployee ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 py-12">
                                    <Clock className="w-12 h-12 mb-3 opacity-20" />
                                    <p>Select an employee to view their logs</p>
                                </div>
                            ) : isLoading ? (
                                <div className="flex justify-center py-12">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                </div>
                            ) : logs.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    No logs found for this period.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {logs.map((log) => (
                                        <div key={log.id} className="p-4 border border-slate-100 dark:border-slate-700/50 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors relative group">
                                            {log.approval_id && (
                                                <div className="absolute top-4 right-4 text-emerald-500 flex items-center text-xs font-medium px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 rounded border border-emerald-100 dark:border-emerald-800/30">
                                                    <Lock className="w-3 h-3 mr-1" /> Approved
                                                </div>
                                            )}

                                            <div className="flex flex-col sm:flex-row gap-2 sm:gap-6">
                                                <div className="w-32 flex-shrink-0">
                                                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                                        {format(new Date(log.date), 'MMM dd, yyyy')}
                                                    </p>
                                                    <p className={cn(
                                                        "text-xs font-bold mt-1 inline-block px-2 py-0.5 rounded",
                                                        Number(log.hours_worked) === 0
                                                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                                    )}>
                                                        {Number(log.hours_worked)} hrs
                                                    </p>
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">{log.project_name}</p>
                                                    <p className="text-sm text-slate-500 dark:text-slate-400">{log.description}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Timesheets;
