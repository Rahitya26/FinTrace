import React, { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, UserPlus } from 'lucide-react';
import api from '../lib/api';
import { formatCurrency } from '../lib/utils';

const AssignResourceModal = ({ isOpen, onClose, project, onAddSuccess }) => {
    const [employees, setEmployees] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [allocation, setAllocation] = useState(project?.type === 'T&M' ? 100 : 100);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen && project) {
            fetchEmployees();
            setSelectedEmployeeId('');
            setStartDate(new Date().toISOString().split('T')[0]);
            setAllocation(project.type === 'T&M' ? 100 : 100);
            setError(null);
        }
    }, [isOpen, project]);

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedEmployeeId || !startDate) {
            setError('Please fill in all required fields');
            return;
        }

        try {
            setIsSaving(true);
            setError(null);

            await api.post(`/projects/${project.id}/resources`, {
                employeeId: selectedEmployeeId,
                startDate,
                allocationPercentage: project.type === 'T&M' ? 100 : allocation
            });

            onAddSuccess();
        } catch (err) {
            console.error('Failed to add resource', err);
            setError(err.response?.data?.error || 'An error occurred while assigning resource');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen || !project) return null;

    const selectedEmp = employees.find(e => e.id === Number(selectedEmployeeId));

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
                            {isLoading ? (
                                <div className="h-10 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center bg-slate-50 dark:bg-slate-800">
                                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                                </div>
                            ) : (
                                <select
                                    value={selectedEmployeeId}
                                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                    required
                                >
                                    <option value="">-- Choose Employee --</option>
                                    {employees
                                        .filter(emp => emp.specialization === project?.type)
                                        .map(emp => (
                                            <option key={emp.id} value={emp.id} disabled={project.debug_info?.plans?.some(p => p.name === emp.name && !p.offboarded)}>
                                                {emp.name} - {emp.role} {project.debug_info?.plans?.some(p => p.name === emp.name && !p.offboarded) ? '(Already Assigned)' : ''}
                                            </option>
                                        ))}
                                </select>
                            )}
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

                            {project.type !== 'T&M' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Allocation %
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={allocation}
                                        onChange={(e) => setAllocation(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                                        required
                                    />
                                </div>
                            )}
                        </div>

                        {selectedEmp && (
                            <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Live Impact Preview</h4>
                                {project.type === 'T&M' ? (
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-600 dark:text-slate-300">Live Billing Rate Adds</span>
                                        <span className="font-bold text-emerald-600 dark:text-emerald-400">+{formatCurrency(Number(selectedEmp.hourly_rate || 0))} / hr</span>
                                    </div>
                                ) : (
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-600 dark:text-slate-300">Monthly Burn Increases By</span>
                                        <span className="font-bold text-red-500 dark:text-red-400">+{formatCurrency((Number(selectedEmp.monthly_salary || 0)) * (Number(allocation) / 100))} / mo</span>
                                    </div>
                                )}
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
