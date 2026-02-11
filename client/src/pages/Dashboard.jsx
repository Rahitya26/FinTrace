import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, DollarSign, PieChart, Activity, Calendar, X } from 'lucide-react';
import { getDashboardSummary, getDashboardAnalytics } from '../lib/api';
import { cn, formatCurrency } from '../lib/utils';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart as RechartsPieChart,
    Pie,
    Cell,
    Legend
} from 'recharts';

const Dashboard = () => {
    const [stats, setStats] = useState({
        totalRevenue: 0,
        totalProjectCosts: 0,
        totalCompanyExpenses: 0,
        processTypeBreakdown: []
    });
    const [analytics, setAnalytics] = useState({
        trend: [],
        expenses: []
    });
    const [dateRange, setDateRange] = useState({
        startDate: '',
        endDate: ''
    });
    const [activePreset, setActivePreset] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    // Theme colors
    const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#8B5CF6', '#F59E0B'];

    useEffect(() => {
        fetchStats();
        fetchAnalytics();
    }, [dateRange]);

    const fetchStats = async () => {
        try {
            const params = {};
            if (dateRange.startDate) params.startDate = dateRange.startDate;
            if (dateRange.endDate) params.endDate = dateRange.endDate;

            const response = await getDashboardSummary(params);
            setStats(response.data);
        } catch (err) {
            console.error('Failed to fetch dashboard stats', err);
        }
    };

    const fetchAnalytics = async () => {
        try {
            const response = await getDashboardAnalytics();
            setAnalytics(response.data);
        } catch (err) {
            console.error('Failed to fetch analytics', err);
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
        setActivePreset(null);
    };

    if (isLoading && !stats.totalRevenue) { // Only show full loading if no data
        return <div className="p-8 text-center text-slate-500">Loading dashboard...</div>;
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Financial Overview</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Absolute Profit Clarity</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    {/* Quick Selects */}
                    <div className="flex bg-slate-100 dark:bg-slate-700/50 p-1 rounded-lg self-start sm:self-center">
                        {[
                            { label: 'This Month', range: 'month' },
                            { label: 'Last 30 Days', range: '30days' },
                            { label: 'YTD', range: 'ytd' }
                        ].map((preset) => (
                            <button
                                key={preset.range}
                                onClick={() => {
                                    const now = new Date();
                                    let start, end = now;

                                    if (preset.range === 'month') {
                                        start = new Date(now.getFullYear(), now.getMonth(), 1);
                                    } else if (preset.range === '30days') {
                                        start = new Date();
                                        start.setDate(now.getDate() - 30);
                                    } else if (preset.range === 'ytd') {
                                        start = new Date(now.getFullYear(), 0, 1);
                                    }

                                    setDateRange({
                                        startDate: start.toISOString().split('T')[0],
                                        endDate: end.toISOString().split('T')[0]
                                    });
                                    setActivePreset(preset.range);
                                }}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                    activePreset === preset.range
                                        ? "bg-primary text-white shadow-md font-semibold"
                                        : "text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-600 hover:shadow-sm"
                                )}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    {/* Date Inputs */}
                    <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                        <Calendar className="w-4 h-4 text-slate-400 ml-1" />
                        <input
                            type="date"
                            name="startDate"
                            value={dateRange.startDate}
                            onChange={handleDateChange}
                            className="text-sm border-none focus:ring-0 text-slate-600 dark:text-slate-300 bg-transparent dark:[color-scheme:dark] p-0 w-[110px]"
                        />
                        <span className="text-slate-300 dark:text-slate-600">|</span>
                        <input
                            type="date"
                            name="endDate"
                            value={dateRange.endDate}
                            onChange={handleDateChange}
                            className="text-sm border-none focus:ring-0 text-slate-600 dark:text-slate-300 bg-transparent dark:[color-scheme:dark] p-0 w-[110px]"
                        />
                        {/* Clear Button */}
                        {(dateRange.startDate || dateRange.endDate) && (
                            <button
                                onClick={() => {
                                    setDateRange({ startDate: '', endDate: '' });
                                    setActivePreset(null);
                                }}
                                className="text-slate-400 hover:text-red-500 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
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

                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center">
                        <Activity className="w-5 h-5 mr-2 text-slate-400" />
                        Financial Trends
                    </h3>

                    {/* Charts Container */}
                    <div className="flex-1 flex flex-col gap-8">
                        {/* Line Chart */}
                        <div className="h-48 w-full">
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">6 Month Trend</h4>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={analytics.trend}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 12 }}
                                        dy={10}
                                    />
                                    <YAxis
                                        hide
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                        itemStyle={{ color: '#fff' }}
                                        formatter={(value) => formatCurrency(value)}
                                    />
                                    <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Revenue" />
                                    <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="Expenses" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Donut Chart (Company Expenses) */}
                        <div className="flex-1 flex flex-col min-h-[250px]">
                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Expense Breakdown</h4>
                            <div className="flex flex-col sm:flex-row items-center h-full gap-6">
                                <div className="w-full sm:w-1/2 h-48 sm:h-full relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsPieChart>
                                            <Pie
                                                data={analytics.expenses}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius="60%"
                                                outerRadius="80%"
                                                paddingAngle={5}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                {analytics.expenses.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '12px' }} itemStyle={{ color: '#fff' }} />
                                        </RechartsPieChart>
                                    </ResponsiveContainer>
                                    {/* Center Text for Total if desired, or just clean look */}
                                </div>
                                <div className="w-full sm:w-1/2 text-sm space-y-3 overflow-y-auto max-h-48 pr-2 custom-scrollbar">
                                    {analytics.expenses.length > 0 ? (
                                        analytics.expenses.map((entry, index) => (
                                            <div key={index} className="flex items-center justify-between group">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                                    <span className="text-slate-600 dark:text-slate-300 font-medium truncate max-w-[120px]" title={entry.name}>{entry.name}</span>
                                                </div>
                                                <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{formatCurrency(entry.value)}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-slate-400 text-center py-4">No expenses recorded</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
