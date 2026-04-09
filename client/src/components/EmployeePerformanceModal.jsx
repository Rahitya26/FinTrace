import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, Label } from 'recharts';
import { toast } from 'sonner';
import Modal from './Modal';
import { cn, formatCurrency } from '../lib/utils';
import { getEmployeePerformance } from '../lib/api';

const EmployeePerformanceModal = ({ isOpen, onClose, employeeId, employeeName }) => {
    const defaultStart = `${new Date().getFullYear()}-01-01`;
    const defaultEnd = new Date().toISOString().split('T')[0];

    const [localStartDate, setLocalStartDate] = useState(defaultStart);
    const [localEndDate, setLocalEndDate] = useState(defaultEnd);
    const [performanceData, setPerformanceData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen && employeeId) {
            fetchPerformance();
        }
    }, [isOpen, employeeId, localStartDate, localEndDate]);

    const fetchPerformance = async () => {
        setIsLoading(true);
        setPerformanceData(null);
        try {
            const params = {
                startDate: localStartDate || '',
                endDate: localEndDate || ''
            };

            const res = await getEmployeePerformance(employeeId, params);
            setPerformanceData(res.data);
        } catch (error) {
            toast.error("Failed to load performance data");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`${employeeName} - Performance Track Record`}
        >
            <div className="flex items-center gap-4 mb-6 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex flex-col">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Start Date</label>
                    <input 
                        type="date" 
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        value={localStartDate}
                        onChange={(e) => setLocalStartDate(e.target.value)}
                    />
                </div>
                <div className="flex flex-col">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">End Date</label>
                    <input 
                        type="date" 
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        value={localEndDate}
                        onChange={(e) => setLocalEndDate(e.target.value)}
                    />
                </div>
            </div>

            <div className="min-h-[300px] flex flex-col justify-center">
                {isLoading ? (
                    <div className="flex flex-col items-center text-slate-500">
                        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin mb-4"></div>
                        <p>Loading performance data...</p>
                    </div>
                ) : performanceData ? (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Profit Contribution</p>
                                <p className={cn(
                                    "text-2xl font-bold mt-1",
                                    performanceData.totalProfitContribution > 0 ? "text-emerald-600 dark:text-emerald-400" :
                                        performanceData.totalProfitContribution < 0 ? "text-red-600 dark:text-red-400" :
                                            "text-slate-700 dark:text-slate-300"
                                )}>
                                    {performanceData.totalProfitContribution > 0 ? '+' : ''}
                                    {formatCurrency(performanceData.totalProfitContribution)}
                                </p>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Period Salary Cost</p>
                                <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mt-1">
                                    {formatCurrency(performanceData.periodStaffCost || 0)} <span className="text-xs font-normal text-slate-400">/total</span>
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-tighter">Pro-Rata Fraction Evaluated</p>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 col-span-2 lg:col-span-1">
                                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Asset Status</p>
                                <div className="mt-2">
                                    {performanceData.timeline && performanceData.timeline.length > 0 && (
                                        <span className={cn(
                                            "px-3 py-1 rounded text-xs font-black uppercase tracking-widest border shadow-sm",
                                            performanceData.totalProfitContribution > 0 
                                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                                                : "bg-red-500/10 text-red-500 border-red-500/20"
                                        )}>
                                            {performanceData.totalProfitContribution > 0 ? 'ASSET' : 'LIABILITY'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="h-64 w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={performanceData.timeline} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
                                    <YAxis 
                                        tickFormatter={formatCurrency} 
                                        stroke="#94a3b8" 
                                        fontSize={12} 
                                        tickLine={false} 
                                        axisLine={false}
                                        domain={['auto', 'auto']}
                                        allowDataOverflow={false}
                                    />
                                    <RechartsTooltip
                                        formatter={(value) => formatCurrency(value)}
                                        contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                                        itemStyle={{ fontSize: '14px', fontWeight: 500, color: '#fff' }}
                                        labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                                    />
                                    <Line type="monotone" dataKey="profit" name="Profit/Loss" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" strokeWidth={1} strokeDasharray="3 3" dot={false} opacity={0.5} />
                                    
                                    <ReferenceLine 
                                        y={0} 
                                        stroke="#ef4444" 
                                        strokeWidth={1} 
                                        strokeDasharray="4 4"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                ) : (
                    <p className="text-center text-slate-500">Failed to load data.</p>
                )}
            </div>
        </Modal>
    );
};

export default EmployeePerformanceModal;
