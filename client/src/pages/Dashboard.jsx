import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, DollarSign, PieChart, Activity } from 'lucide-react';
import { getDashboardSummary } from '../lib/api';
import { cn, formatCurrency } from '../lib/utils';

const Dashboard = () => {
    const [stats, setStats] = useState({
        totalRevenue: 0,
        totalProjectCosts: 0,
        totalCompanyExpenses: 0,
        processTypeBreakdown: []
    });
    const [dateRange, setDateRange] = useState({
        startDate: '',
        endDate: ''
    });
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchStats();
    }, [dateRange]);

    const fetchStats = async () => {
        setIsLoading(true);
        try {
            const params = {};
            if (dateRange.startDate) params.startDate = dateRange.startDate;
            if (dateRange.endDate) params.endDate = dateRange.endDate;

            const response = await getDashboardSummary(params);
            setStats(response.data);
        } catch (err) {
            console.error('Failed to fetch dashboard stats', err);
        } finally {
            setIsLoading(false);
        }
    };

    const totalMargin = stats.totalRevenue - stats.totalProjectCosts;
    const netSavings = totalMargin - stats.totalCompanyExpenses;
    const savingsRate = stats.totalRevenue > 0 ? (netSavings / stats.totalRevenue) * 100 : 0;

    const handleDateChange = (e) => {
        const { name, value } = e.target;
        setDateRange(prev => ({ ...prev, [name]: value }));
    };

    if (isLoading && !stats.totalRevenue) { // Only show full loading if no data
        return <div className="p-8 text-center text-slate-500">Loading dashboard...</div>;
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Financial Overview</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Absolute Profit Clarity</p>
                </div>
                <div className="flex gap-2 items-center bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                    <input
                        type="date"
                        name="startDate"
                        value={dateRange.startDate}
                        onChange={handleDateChange}
                        className="text-sm border-none focus:ring-0 text-slate-600 dark:text-slate-300 bg-transparent dark:[color-scheme:dark]"
                    />
                    <span className="text-slate-400">to</span>
                    <input
                        type="date"
                        name="endDate"
                        value={dateRange.endDate}
                        onChange={handleDateChange}
                        className="text-sm border-none focus:ring-0 text-slate-600 dark:text-slate-300 bg-transparent dark:[color-scheme:dark]"
                    />
                </div>
            </div>

            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Net Savings</h3>
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                            <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">{formatCurrency(netSavings)}</p>
                    <div className="flex items-center mt-2 text-sm">
                        <TrendingUp className="w-4 h-4 text-emerald-500 mr-1" />
                        <span className="text-emerald-500 font-medium">{savingsRate.toFixed(1)}%</span>
                        <span className="text-slate-400 ml-1">of revenue</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Revenue</h3>
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">{formatCurrency(stats.totalRevenue)}</p>
                    <p className="text-sm text-slate-400 mt-2">Across all active projects</p>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Project Margins</h3>
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                            <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">{formatCurrency(totalMargin)}</p>
                    <p className="text-sm text-slate-400 mt-2">Before company overhead</p>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Expenses</h3>
                        <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                            <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">{formatCurrency(stats.totalCompanyExpenses)}</p>
                    <p className="text-sm text-slate-400 mt-2">Fixed & operational costs</p>
                </div>
            </div>

            {/* Profitability Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center">
                        <PieChart className="w-5 h-5 mr-2 text-slate-400" />
                        Profitability by Process Type
                    </h3>
                    <div className="space-y-6">
                        {stats.processTypeBreakdown.map((item) => {
                            const percentage = totalMargin > 0 ? (item.margin / totalMargin) * 100 : 0;
                            const color = item.type === 'T&M' ? 'bg-blue-500' : item.type === 'Fixed Bid' ? 'bg-green-500' : 'bg-purple-500';
                            return (
                                <div
                                    key={item.type}
                                    onClick={() => navigate(`/projects?type=${encodeURIComponent(item.type)}`)}
                                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 p-2 rounded-lg transition-colors group"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-medium text-slate-700 dark:text-slate-300 group-hover:text-primary dark:group-hover:text-primary-light transition-colors">{item.type}</span>
                                        <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(item.margin)}</span>
                                    </div>
                                    <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                                        <div
                                            className={`h-2.5 rounded-full ${color}`}
                                            style={{ width: `${Math.max(0, percentage)}%` }}
                                        ></div>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1 text-right">{percentage.toFixed(1)}% contribution</p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-center items-center text-center">
                    <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-full mb-4">
                        <Activity className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Detailed Analytics</h3>
                    <p className="text-slate-500 dark:text-slate-400 max-w-sm">
                        More detailed charts and historical trends will be available once specific date ranges are selected in the Reports tab.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
