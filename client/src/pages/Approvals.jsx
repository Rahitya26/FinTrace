import React, { useState, useEffect } from 'react';
import { format, startOfWeek, endOfWeek, isSameDay } from 'date-fns';
import { toast } from 'sonner';
import { CheckSquare, DollarSign, Filter, Calendar, Check, AlertCircle, X, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import Modal from '../components/Modal';
import { cn } from '../lib/utils';
import { getTimesheets, approveTimesheets } from '../lib/api';

const Approvals = () => {
    const [unapprovedLogs, setUnapprovedLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isApproving, setIsApproving] = useState(false);

    // Grouping: 'Daily' or 'Weekly'
    const [basis, setBasis] = useState('Daily');

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [fxRate, setFxRate] = useState('');

    useEffect(() => {
        fetchUnapproved();
    }, []);

    const fetchUnapproved = async () => {
        setIsLoading(true);
        try {
            const res = await getTimesheets({ status: 'unapproved' });
            // Let's filter out logs where hours_worked is 0 (Leaves) from needing financial approval?
            // Wait, we SHOULD approve leaves so they are locked. So we keep them.
            setUnapprovedLogs(res.data);
        } catch (error) {
            toast.error("Failed to fetch unapproved timesheets");
        } finally {
            setIsLoading(false);
        }
    };

    // Grouping logic
    const groupedLogs = React.useMemo(() => {
        const groups = {};

        unapprovedLogs.forEach(log => {
            const dateObj = new Date(log.date);
            let key = '';
            let startDate = '';
            let endDate = '';
            let title = '';

            if (basis === 'Daily') {
                startDate = format(dateObj, 'yyyy-MM-dd');
                endDate = startDate;
                key = startDate;
                title = format(dateObj, 'MMM dd, yyyy');
            } else {
                // Weekly (Monday to Sunday)
                const start = startOfWeek(dateObj, { weekStartsOn: 1 });
                const end = endOfWeek(dateObj, { weekStartsOn: 1 });
                startDate = format(start, 'yyyy-MM-dd');
                endDate = format(end, 'yyyy-MM-dd');
                key = startDate + '_' + endDate;
                title = `${format(start, 'MMM dd')} - ${format(end, 'MMM dd, yyyy')}`;
            }

            if (!groups[key]) {
                groups[key] = {
                    key,
                    title,
                    startDate,
                    endDate,
                    logs: [],
                    totalHours: 0,
                    projectedUsd: 0
                };
            }

            groups[key].logs.push(log);
            groups[key].totalHours += Number(log.hours_worked);
            groups[key].projectedUsd += Number(log.hours_worked) * Number(log.usd_hourly_rate || 0);
        });

        // Sort groups by date descending
        return Object.values(groups).sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    }, [unapprovedLogs, basis]);

    const handleAcceptClick = (group) => {
        setSelectedGroup(group);
        setFxRate(''); // Reset fx rate
        setIsModalOpen(true);
    };

    const submitApproval = async (e) => {
        e.preventDefault();

        if (!selectedGroup) return;
        if (!fxRate || isNaN(Number(fxRate)) || Number(fxRate) <= 0) {
            toast.error("Please enter a valid positive FX rate.");
            return;
        }

        setIsApproving(true);
        try {
            await approveTimesheets({
                period_type: basis,
                start_date: selectedGroup.startDate,
                end_date: selectedGroup.endDate,
                usd_to_inr_rate: Number(fxRate)
            });

            toast.success(`Timesheets for ${selectedGroup.title} successfully locked and approved!`);
            setIsModalOpen(false);
            setSelectedGroup(null);
            fetchUnapproved(); // Refresh
        } catch (error) {
            toast.error(error.response?.data?.error || "Approval failed");
        } finally {
            setIsApproving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Approvals Hub</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Review and approve employee timesheets to finalize billing.</p>
                </div>

                {/* Basis Switch */}
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                    <button
                        onClick={() => setBasis('Daily')}
                        className={cn(
                            "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
                            basis === 'Daily'
                                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                        )}
                    >
                        Daily Basis
                    </button>
                    <button
                        onClick={() => setBasis('Weekly')}
                        className={cn(
                            "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
                            basis === 'Weekly'
                                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                        )}
                    >
                        Weekly Basis
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                </div>
            ) : groupedLogs.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-16 text-center">
                    <CheckSquare className="w-16 h-16 mx-auto mb-4 text-emerald-100 dark:text-emerald-900/50" />
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">All Caught Up!</h3>
                    <p className="text-slate-500 dark:text-slate-400">There are no pending timesheets requiring your approval.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {groupedLogs.map(group => (
                        <div key={group.key} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden group/card transition-all hover:shadow-md">
                            <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{group.title}</h3>
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                            {group.logs.length} logs
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        Total Logged Hours: <strong className="text-slate-700 dark:text-slate-200">{group.totalHours} hrs</strong>
                                    </p>
                                </div>

                                <div className="flex items-center gap-4 w-full md:w-auto p-4 md:p-0 bg-slate-50 md:bg-transparent rounded-lg dark:bg-slate-800/50">
                                    <div className="text-left md:text-right flex-1 md:flex-none mr-2">
                                        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Projected Value</p>
                                        <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                                            ${group.projectedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                        </p>
                                    </div>

                                    <button
                                        onClick={() => handleAcceptClick(group)}
                                        className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition-colors flex items-center shadow-sm whitespace-nowrap"
                                    >
                                        <Check className="w-4 h-4 mr-2" />
                                        Accept & Lock
                                    </button>
                                </div>
                            </div>

                            {/* Expandable Preview (Optional, we'll just show a quick summary list) */}
                            <div className="border-t border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/20 px-5 py-3 overflow-x-auto">
                                <div className="flex gap-2">
                                    {group.logs.slice(0, 5).map(log => (
                                        <div key={log.id} className="flex-shrink-0 text-xs px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md">
                                            <span className="font-semibold text-slate-700 dark:text-slate-200">{log.employee_name}</span>
                                            <span className="mx-2 text-slate-300 dark:text-slate-500">•</span>
                                            <span className="text-slate-500 dark:text-slate-400">{log.project_name}</span>
                                            <span className="ml-2 font-medium text-blue-600 dark:text-blue-400">{Number(log.hours_worked)}h</span>
                                        </div>
                                    ))}
                                    {group.logs.length > 5 && (
                                        <div className="flex-shrink-0 text-xs px-3 py-1.5 flex items-center text-slate-500 dark:text-slate-400 font-medium">
                                            +{group.logs.length - 5} more
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Accept & Lock Modal */}
            <Modal
                isOpen={isModalOpen && !!selectedGroup}
                onClose={() => { setIsModalOpen(false); setSelectedGroup(null); }}
                title={
                    <div className="flex items-center">
                        <Lock className="w-5 h-5 mr-2 text-amber-500" /> Accept & Lock Timesheets
                    </div>
                }
            >
                {selectedGroup && (
                    <form onSubmit={submitApproval} className="space-y-6">
                        <div className="space-y-3">
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                You are approving <strong className="text-slate-900 dark:text-white">{selectedGroup.logs.length} logs</strong> for the period of <strong>{selectedGroup.title}</strong>.
                                This action will permanently lock these entries.
                            </p>

                            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 rounded-lg p-4 flex items-center justify-between">
                                <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Total USD Value:</span>
                                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                                    ${selectedGroup.projectedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    USD to INR Exchange Rate <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <span className="text-slate-500 dark:text-slate-400">₹</span>
                                    </div>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        className="w-full pl-8 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                        placeholder="e.g. 83.50"
                                        value={fxRate}
                                        onChange={(e) => setFxRate(e.target.value)}
                                        required
                                        autoFocus
                                    />
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    This rate will convert the entire block's revenue into INR for financial tracking.
                                </p>
                            </div>

                            {/* Calculated INR */}
                            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4 flex items-center justify-between">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Calculated INR:</span>
                                <span className="text-lg font-bold text-slate-900 dark:text-white">
                                    ₹{((selectedGroup.projectedUsd || 0) * (Number(fxRate) || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => { setIsModalOpen(false); setSelectedGroup(null); }}
                                className="px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors"
                                disabled={isApproving}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isApproving || !fxRate || Number(fxRate) <= 0}
                                className="px-5 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition-colors flex items-center disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isApproving ? "Finalizing..." : "Confirm & Finalize"}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
};

export default Approvals;
