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
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const response = await getDashboardSummary();
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

    if (isLoading) {
        return <div className="p-8 text-center text-slate-500">Loading dashboard...</div>;
    }

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold text-slate-900">Financial Overview</h2>
                <p className="text-slate-500 mt-1">Real-time insight into your company's profitability</p>
            </div>

            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-slate-500">Net Savings</h3>
                        <div className="p-2 bg-emerald-100 rounded-lg">
                            <DollarSign className="w-5 h-5 text-emerald-600" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">{formatCurrency(netSavings)}</p>
                    <div className="flex items-center mt-2 text-sm">
                        <TrendingUp className="w-4 h-4 text-emerald-500 mr-1" />
                        <span className="text-emerald-500 font-medium">{savingsRate.toFixed(1)}%</span>
                        <span className="text-slate-400 ml-1">of revenue</span>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-slate-500">Total Revenue</h3>
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <Activity className="w-5 h-5 text-blue-600" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">{formatCurrency(stats.totalRevenue)}</p>
                    <p className="text-sm text-slate-400 mt-2">Across all active projects</p>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-slate-500">Project Margins</h3>
                        <div className="p-2 bg-indigo-100 rounded-lg">
                            <TrendingUp className="w-5 h-5 text-indigo-600" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">{formatCurrency(totalMargin)}</p>
                    <p className="text-sm text-slate-400 mt-2">Before company overhead</p>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-slate-500">Expenses</h3>
                        <div className="p-2 bg-red-100 rounded-lg">
                            <TrendingDown className="w-5 h-5 text-red-600" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-slate-900">{formatCurrency(stats.totalCompanyExpenses)}</p>
                    <p className="text-sm text-slate-400 mt-2">Fixed & operational costs</p>
                </div>
            </div>

            {/* Profitability Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
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
                                    className="cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-colors group"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-medium text-slate-700 group-hover:text-primary transition-colors">{item.type}</span>
                                        <span className="font-bold text-slate-900">{formatCurrency(item.margin)}</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
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

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-center items-center text-center">
                    <div className="p-4 bg-slate-50 rounded-full mb-4">
                        <Activity className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">Detailed Analytics</h3>
                    <p className="text-slate-500 max-w-sm">
                        More detailed charts and historical trends will be available once specific date ranges are selected in the Reports tab.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
