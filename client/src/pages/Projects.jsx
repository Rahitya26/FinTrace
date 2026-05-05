import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Briefcase, Users, ChevronDown, Trash2, Calendar, X, Loader2, AlertCircle, UserPlus, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '../components/Modal';
import ProjectForm from '../components/ProjectForm';
import AssignResourceModal from '../components/AssignResourceModal';
import { cn, formatCurrency } from '@/lib/utils';
import { getProjects, createProject, getClients, updateProjectStatus, deleteProject, addAllocation, getEmployeePerformance, offboardAllocation } from '@/lib/api';
import { getSystemToday, calculateInclusiveDays } from '@/utils/dateUtils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import EmployeePerformanceModal from '@/components/EmployeePerformanceModal';

const PROCESS_COLORS = {
    'T&M': 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    'Fixed Bid': 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',

};

const PROJECT_STATUSES = ['Pipeline', 'Active', 'Completed', 'On Hold'];

const STATUS_COLORS = {
    'Pipeline': 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
    'Active': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    'Completed': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    'On Hold': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

const ProjectSkeleton = () => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 animate-pulse h-[200px] flex flex-col justify-between">
        <div className="flex justify-between items-start">
            <div className="space-y-3 w-2/3">
                <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
            </div>
            <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
        </div>
        <div className="space-y-2 mt-4">
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-5/6"></div>
        </div>
    </div>
);

const ProjectCard = ({ project, onStatusChange, onDelete, onAddResource, onViewTeam }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const navigate = useNavigate();

    const calculateProgress = (start, end) => {
        if (!start || !end) return 0;
        const totalDuration = calculateInclusiveDays(start, end);
        const elapsed = calculateInclusiveDays(start, getSystemToday());

        if (totalDuration <= 0) return 100;
        return Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
    };

    const getDaysRemaining = (end) => {
        if (!end) return null;
        const diffDays = calculateInclusiveDays(getSystemToday(), end);
        return diffDays;
    };

    const getTotalDuration = (start, end) => {
        if (!start || !end) return 0;
        return calculateInclusiveDays(start, end);
    };

    const progress = calculateProgress(project?.start_date, project?.deadline);
    const daysLeft = getDaysRemaining(project?.deadline);
    const totalDays = getTotalDuration(project?.start_date, project?.deadline);
    const isCritical = daysLeft !== null && progress > 80;

    // Health Indicator Logic
    const margin = Number(project?.margin) || 0;
    const revenue = Number(project?.revenue_earned) || 0;
    const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;

    const isFixedBid = project?.billing_type === 'Fixed Bid';
    const isPastDeadline = isFixedBid && project?.deadline && new Date() > new Date(project.deadline) && project.status !== 'Completed';
    const isHighRisk = isFixedBid && Number(project?.employee_costs) > (revenue * 0.8);

    let borderClass = 'border border-slate-200 dark:border-white/10 shadow-sm hover:shadow-md';
    if (margin > 0) {
        borderClass = 'border-2 border-emerald-500 shadow-sm hover:shadow-md dark:shadow-[0_0_15px_-3px_rgba(16,185,129,0.2)] dark:hover:shadow-[0_0_20px_-2px_rgba(16,185,129,0.4)]';
    } else if (margin < 0) {
        borderClass = 'border-2 border-rose-500 shadow-sm hover:shadow-md dark:shadow-[0_0_15px_-3px_rgba(244,63,94,0.2)] dark:hover:shadow-[0_0_20px_-2px_rgba(244,63,94,0.4)]';
    }

    const totalLoggedHours = project?.debug_info?.plans?.reduce((sum, p) => sum + (Number(p.totalHours) || 0), 0) || 0;
    const budgetedValue = Number(project?.quoted_bid_value) || 0;
    const staffBurn = Number(project?.employee_costs) || 0;
    const burnPct = budgetedValue > 0 ? (staffBurn / budgetedValue) * 100 : 0;

    const visiblePlans = (project.debug_info?.plans || []).slice(0, 6);
    const hiddenCount = (project.debug_info?.plans || []).length - 6;

    return (
        <div
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
                "bg-white dark:bg-slate-800 p-5 rounded-xl transition-all duration-300 flex flex-col cursor-pointer group relative hover:shadow-[0_4px_20px_-2px_rgba(0,0,0,0.15)]",
                borderClass,
                project.status === 'Completed' ? "opacity-60 grayscale bg-slate-50 dark:bg-slate-900 order-last" : ""
            )}
        >
            {/* Split-Row Body */}
            <div className="flex justify-between items-start gap-4 mb-3">
                {/* Left Side: Title, Client, Avatars */}
                <div className="flex-1 flex flex-col items-start min-w-0">
                    <h3 className="text-[1.1rem] font-bold text-slate-900 dark:text-white whitespace-normal break-words leading-tight">{project.name}</h3>
                    <div className="flex items-center text-sm text-slate-500 dark:text-slate-400 mt-1">
                        <Users className="w-4 h-4 mr-1 shrink-0" />
                        <span className="truncate">{project.client_name}</span>
                    </div>
                    {isFixedBid && Number(project.quoted_bid_value) > 0 && (
                        <div className="flex items-center text-xs text-blue-600 dark:text-blue-400 mt-1 font-semibold">
                            Contract Value: {formatCurrency(project.quoted_bid_value)}
                        </div>
                    )}

                    {/* Employee Avatars Container */}
                    <div className="flex mt-3">
                        <div className="flex flex-wrap -space-x-2">
                            {visiblePlans.map((plan, idx) => (
                                <div
                                    key={idx}
                                    className="inline-flex h-8 w-8 shrink-0 rounded-full ring-2 ring-white dark:bg-slate-700 bg-slate-100 dark:ring-slate-800 items-center justify-center overflow-hidden z-0"
                                    title={`${plan.name} (${plan.role}) - ${plan.totalHours || 0} hrs`}
                                >
                                    {plan.name?.charAt(0)}
                                </div>
                            ))}
                            {hiddenCount > 0 && (
                                <div className="inline-flex h-8 w-8 shrink-0 rounded-full ring-2 ring-white dark:bg-slate-600 bg-slate-200 dark:ring-slate-800 border-none items-center justify-center text-[10px] text-slate-600 dark:text-slate-300 font-bold z-10">
                                    +{hiddenCount}
                                </div>
                            )}
                        </div>
                        {(!project.debug_info?.plans || project.debug_info.plans.length === 0) && (
                            <div className="text-[10px] text-slate-400 italic flex items-center ml-1 space-x-0">No resources</div>
                        )}
                    </div>
                </div>
                
                {/* Right Side: Badges & Net Margin */}
                <div className="flex flex-col items-end shrink-0 gap-3">
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {isHighRisk && (
                            <div className="h-6 px-3 py-0.5 text-[10px] items-center justify-center whitespace-nowrap font-bold uppercase tracking-wider rounded-full border bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900/50 flex shadow-sm">
                                High Risk
                            </div>
                        )}
                        <div className={cn("h-6 px-3 py-0.5 flex items-center justify-center text-xs whitespace-nowrap font-semibold rounded-full border", PROCESS_COLORS[project.billing_type === 'Fixed Bid' ? 'Fixed Bid' : 'T&M'])}>
                            {project.billing_type || project.type}
                        </div>
                    </div>
                    
                    {/* The Net Margin block shifted directly under badges */}
                    <div className="flex flex-col items-end mt-1">
                        <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">
                            {isFixedBid ? 'Net Margin' : 'Margin'}
                        </div>
                        <div className={cn("text-2xl font-bold whitespace-nowrap leading-none", Number(project?.margin) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                            {formatCurrency(project?.margin)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Middle Fill: Budget Burn Bar */}
            {budgetedValue > 0 && (
                <div className="mt-1 mb-3 px-3 py-2 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-100 dark:border-slate-700/50 shadow-inner">
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            Budget Burn 
                            <span className="opacity-70 lowercase ml-1 font-medium">({formatCurrency(staffBurn)} / {formatCurrency(budgetedValue)})</span>
                        </span>
                        <span className={cn("text-[10px] font-extrabold uppercase", burnPct > 100 ? "text-red-600 dark:text-red-400" : burnPct > 80 ? "text-amber-600 dark:text-amber-500" : "text-slate-600 dark:text-slate-300")}>
                            {burnPct.toFixed(1)}%
                        </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden flex">
                        <div 
                            className={cn("h-full rounded-full transition-all duration-700", burnPct > 100 ? "bg-red-500" : burnPct > 80 ? "bg-amber-500" : "bg-primary")} 
                            style={{ width: `${Math.min(burnPct, 100)}%` }} 
                        />
                    </div>
                </div>
            )}

            {/* Action Bar (Footer) - Aligned to Bottom */}
            <div className={cn("flex justify-between items-center transition-all duration-300 mt-auto pt-3", isExpanded ? "border-t border-slate-100 dark:border-slate-700" : "")}>
                
                {/* Status Dropdown - Stop Propagation */}
                <div onClick={(e) => e.stopPropagation()}>
                    <select
                        value={project.status || 'Active'}
                        onChange={(e) => onStatusChange(project.id, e.target.value)}
                        className={cn(
                            "text-xs font-bold px-3 py-1.5 rounded-full border-none focus:ring-1 focus:ring-slate-200 cursor-pointer outline-none shadow-sm",
                            STATUS_COLORS[project.status || 'Active']
                        )}
                    >
                        {PROJECT_STATUSES.map(status => (
                            <option key={status} value={status} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{status}</option>
                        ))}
                    </select>
                </div>

                {/* Right Aligned Footer Actions */}
                <div className="flex items-center gap-1.5 overflow-hidden">
                    {/* Action Icons */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onViewTeam(project);
                        }}
                        className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-full transition-colors flex shrink-0"
                        title="View Team"
                    >
                        <Users className="w-4 h-4" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onAddResource(project);
                        }}
                        className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-full transition-colors flex shrink-0"
                        title="Onboard new resource to this project"
                    >
                        <UserPlus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(project.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors flex shrink-0"
                        title="Delete Project"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    
                    <div onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700/50 flex shrink-0 items-center justify-center ml-1 border-l border-slate-200 dark:border-slate-700 pl-2">
                        <ChevronDown className={cn("w-5 h-5 transition-transform duration-300 transform", isExpanded ? "rotate-180" : "")} />
                    </div>
                </div>
            </div>

            {/* Expanded Content */}
            <div className={cn("grid transition-all duration-300 ease-in-out", isExpanded ? "grid-rows-[1fr] opacity-100 mt-4" : "grid-rows-[0fr] opacity-0")}>
                <div className={cn("min-h-0", isExpanded ? "overflow-visible" : "overflow-hidden")}>
                    {/* Project Timeline */}
                    <div className="mb-4">
                        <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Project Timeline</h4>
                        <div className="flex justify-between text-sm mb-2">
                            <div className="flex flex-col">
                                <span className="text-xs text-slate-400 dark:text-slate-500">Start Project</span>
                                <span className="font-medium text-slate-700 dark:text-slate-200">
                                    {project.start_date ? format(new Date(project.start_date), 'dd MMM yyyy') : 'N/A'}
                                </span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-xs text-slate-400 dark:text-slate-500">Deadline</span>
                                <span className="font-medium text-slate-700 dark:text-slate-200">
                                    {project.deadline ? format(new Date(project.deadline), 'dd MMM yyyy') : 'No Deadline'}
                                </span>
                            </div>
                        </div>

                        {/* Progress Bar & Delay Impact */}
                        {project.deadline && (
                            <div className="mt-2">
                                <div className="flex justify-between text-xs mb-1">
                                    <span className={isCritical ? "text-red-600 dark:text-red-400 font-bold" : "text-slate-500 dark:text-slate-400"}>
                                        {daysLeft > 0 ? `${daysLeft} days left` : 'Overdue'}
                                    </span>
                                    <span className="text-slate-400 dark:text-slate-500">
                                        {Math.round(progress)}% time used
                                    </span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
                                    <div
                                        className={cn("h-1.5 rounded-full transition-all duration-500",
                                            progress > 80 ? "bg-red-500" : "bg-primary"
                                        )}
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                                {isCritical && project.debug_info?.monthlyBurn > 0 && project.status !== 'Completed' && (
                                    <div className="mt-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-lg p-2.5 flex items-start gap-2.5 text-left">
                                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-500 tracking-wider">Delay Impact Warning</p>
                                            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-snug">
                                                {project.type === 'T&M' ? (
                                                    <>A +30 day delay will burn an additional <strong>{formatCurrency(project.debug_info.monthlyBurn)}</strong> in active staff salaries, but generate an additional <strong>{formatCurrency(project.debug_info.monthlyRevenue)}</strong> in billed revenue, altering the margin to <strong>{formatCurrency((Number(project.margin) || 0) + (Number(project.debug_info.monthlyRevenue) || 0) - (Number(project.debug_info.monthlyBurn) || 0))}</strong>.</>
                                                ) : (
                                                    <>A +30 day delay will burn an additional <strong>{formatCurrency(project.debug_info.monthlyBurn)}</strong> in active staff salaries, reducing margin to <strong>{formatCurrency(Number(project.margin) - project.debug_info.monthlyBurn)}</strong>.</>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Financials */}
                    <div className="space-y-3">
                        <div className="flex justify-between text-sm items-center">
                            <span className="text-slate-500 dark:text-slate-400 flex items-center">
                                {isFixedBid ? 'Fixed Revenue (INR)' : 'Total Billed to Date'}
                                {project.type === 'T&M' && (() => {
                                    if (!project.debug_info?.plans?.length) return null;
                                    return (
                                        <div className="relative group/tooltip ml-2 flex items-center">
                                            <span className="text-[9px] uppercase tracking-wider text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded cursor-help font-bold hover:bg-emerald-100 transition-colors">
                                                Billing
                                            </span>
                                            <div className="absolute bottom-full left-0 mb-2 w-max min-w-[200px] max-w-none bg-slate-800 text-white text-xs rounded-lg py-2 px-3 opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl text-left font-medium">
                                                <div className="mb-1.5 pb-1.5 border-b border-slate-700 text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                                                    Revenue Breakdown
                                                </div>
                                                <div className="space-y-1 mb-2">
                                                    {project.debug_info.plans.map((p, idx) => (
                                                        <div key={idx} className="flex justify-between items-center gap-4">
                                                            <span className="text-slate-300 font-bold whitespace-nowrap">{p.name || 'Unknown'}</span>
                                                            <span className="text-emerald-400 font-medium whitespace-nowrap pr-3">{formatCurrency(p.totalPlanRevenue || 0)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="flex justify-between items-center pt-1.5 border-t border-slate-700 font-bold text-emerald-500 mt-2">
                                                    <span className="whitespace-nowrap">Total Approved</span>
                                                    <span className="whitespace-nowrap pr-3">{formatCurrency(project.revenue_earned)}</span>
                                                </div>
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </span>
                            <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(project.revenue_earned)}</span>
                        </div>
                        <div className="flex justify-between text-sm items-center">
                            <span className="text-slate-500 dark:text-slate-400 flex items-center">
                                {isFixedBid ? 'Current Burn' : 'Costs'}
                                {(() => {
                                    if (!project.debug_info?.plans?.length) {
                                        return (
                                            <div className="relative group/tooltip ml-2 flex items-center">
                                                <span className="text-[9px] uppercase tracking-wider text-primary bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded cursor-help font-bold hover:bg-primary-100 transition-colors">
                                                    Staff
                                                </span>
                                                <div className="absolute bottom-full left-0 mb-2 w-max max-w-[200px] bg-slate-800 text-white text-xs rounded py-1.5 px-2.5 opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl text-center">
                                                    No resources assigned.
                                                    <div className="absolute top-full left-4 border-4 border-transparent border-t-slate-800"></div>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div className="relative group/tooltip ml-2 flex items-center">
                                            <span className="text-[9px] uppercase tracking-wider text-primary bg-primary-50 dark:bg-primary-900/30 px-1.5 py-0.5 rounded cursor-help font-bold hover:bg-primary-100 transition-colors">
                                                Staff
                                            </span>
                                            <div className="absolute bottom-full left-0 mb-2 w-max min-w-[380px] max-w-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs rounded-xl p-3 opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 shadow-2xl backdrop-blur-xl text-left font-medium">
                                                <div className="mb-3 pb-2 border-b border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 uppercase tracking-widest font-black flex justify-between items-center">
                                                    <span>Performance Hub</span>
                                                    <span className="text-primary/70">{project.debug_info.plans.length} Resources</span>
                                                </div>
                                                <div className="space-y-2 mb-3">
                                                    {project.debug_info.plans.map((p, idx) => {
                                                        const roi = (p.totalPlanRevenue || 0) - (p.totalPlanCost || 0);
                                                        const joiningDateStr = p.joining_date ? p.joining_date.split('-').reverse().join('-') : 'Unknown';
                                                        return (
                                                            <div key={idx} className="flex justify-between items-center gap-4 bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/50 rounded-lg p-2.5 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors">
                                                                <div className="flex flex-col min-w-[120px]">
                                                                    <span className="text-slate-900 dark:text-slate-100 font-bold text-sm whitespace-nowrap">{p.name || 'Unknown'}</span>
                                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 whitespace-nowrap">
                                                                        {p.role || 'Unassigned'} • Joined: {joiningDateStr}
                                                                    </span>
                                                                </div>
                                                                
                                                                <div className="flex gap-4 items-center">
                                                                    <div className="flex flex-col items-end">
                                                                        <span className="text-[9px] font-bold uppercase tracking-wider text-rose-500/70 mb-0.5">Period Cost</span>
                                                                        <span className="text-rose-600 dark:text-rose-400 font-semibold tabular-nums">{formatCurrency(p.totalPlanCost || 0)}</span>
                                                                    </div>
                                                                    <div className="w-[1px] h-6 bg-slate-200 dark:bg-slate-700"></div>
                                                                    <div className="flex flex-col items-end">
                                                                        <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-500/70 mb-0.5">Projected Rev</span>
                                                                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">{formatCurrency(p.totalPlanRevenue || 0)}</span>
                                                                    </div>
                                                                    <div className="ml-2 pl-2 border-l border-slate-200 dark:border-slate-700">
                                                                        <span className={cn(
                                                                            "px-2 py-1 rounded-full text-[10px] font-bold whitespace-nowrap border shadow-sm",
                                                                            roi >= 0 ? "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50" 
                                                                                     : "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/50"
                                                                        )}>
                                                                            {roi >= 0 ? '+' : ''}{formatCurrency(roi)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800 font-black text-slate-800 dark:text-slate-200 mt-1">
                                                    <span className="whitespace-nowrap uppercase tracking-wider text-[10px] text-slate-500">Total Staff Burn</span>
                                                    <span className="whitespace-nowrap pr-1 text-rose-600 dark:text-rose-400">{formatCurrency(project.employee_costs)}</span>
                                                </div>
                                                <div className="absolute top-full left-4 border-8 border-transparent border-t-white dark:border-t-slate-900 filter drop-shadow-xl"></div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </span>
                            <span className={cn("font-medium", isPastDeadline ? "text-red-600 dark:text-red-400 font-bold" : "text-slate-900 dark:text-white")}>
                                {formatCurrency(project.employee_costs)}
                            </span>
                        </div>
                        <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-50 dark:border-slate-700">
                            <span className="text-slate-700 dark:text-slate-300">{isFixedBid ? 'Actual Margin' : 'Margin'}</span>
                            <div className="flex flex-col items-end">
                                {Number(project.revenue_earned) > 0 && (() => {
                                    const margin = Number(project.margin);
                                    const revenue = Number(project.revenue_earned);
                                    const marginPct = (margin / revenue) * 100;

                                    if (project.type === 'T&M') {
                                        if (margin < 0) {
                                            return <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium mb-1">At Risk</span>;
                                        }
                                        return <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium mb-1">On Track</span>;
                                    } else {
                                        if (marginPct < 20) {
                                            return <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium mb-1">Low Margin</span>;
                                        }
                                        if (marginPct > 50) {
                                            return <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium mb-1">High Profit</span>;
                                        }
                                    }
                                    return null;
                                })()}
                                <span className={Number(project.margin) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                                    {formatCurrency(project.margin)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Projects = () => {
    const [projects, setProjects] = useState([]);
    const [clients, setClients] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedProjectForResource, setSelectedProjectForResource] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 1, limit: 20 });
    const [error, setError] = useState(null);
    const [dateRange, setDateRange] = useState(() => ({
        startDate: '2026-01-01',
        endDate: new Date().toISOString().split('T')[0]
    }));
    const [activePreset, setActivePreset] = useState('ytd');

    const [projectToDelete, setProjectToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedTeamProject, setSelectedProjectTeam] = useState(null);
    // Performance Modal State
    const [performanceModal, setPerformanceModal] = useState({
        isOpen: false,
        employeeId: null,
        employeeName: ''
    });

    const openPerformanceModal = (employee) => {
        setPerformanceModal({
            isOpen: true,
            employeeId: employee.employee_id || employee.id,
            employeeName: employee.name
        });
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, searchTerm, searchParams.get('type'), dateRange.startDate, dateRange.endDate]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const params = {
                page,
                limit: 20,
                search: searchTerm,
                type: searchParams.get('type') || '',
                startDate: dateRange.startDate,
                endDate: dateRange.endDate
            };
            const [projectsRes, clientsRes] = await Promise.all([getProjects(params), getClients()]);
            setProjects(projectsRes.data.data);
            setPagination(projectsRes.data.pagination);
            setClients(clientsRes.data);
        } catch (err) {
            setError('Failed to fetch data');
            toast.error('Failed to load projects');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleStatusChange = async (projectId, newStatus) => {
        try {
            const originalProjects = [...projects];
            // Optimistic update
            setProjects(projects.map(p =>
                p.id === projectId ? { ...p, status: newStatus } : p
            ));

            await updateProjectStatus(projectId, newStatus);
            toast.success(`Project status updated to ${newStatus}`);
        } catch (err) {
            console.error('Failed to update status', err);
            fetchData(); // Revert on error
            toast.error('Failed to update status');
        }
    };

    const handleDeleteProject = (projectId) => {
        const project = projects.find(p => p.id === projectId);
        if (project) {
            setProjectToDelete(project);
        }
    };

    const confirmDeleteProject = async () => {
        if (!projectToDelete) return;

        const projectId = projectToDelete.id;
        setIsDeleting(true);
        try {
            // Optimistic update
            setProjects(projects.filter(p => p.id !== projectId));
            await deleteProject(projectId);
            setProjectToDelete(null);
            toast.success('Project deleted successfully');
        } catch (err) {
            console.error('Failed to delete project', err);
            toast.error('Failed to delete project');
            fetchData(); // Revert on error
        } finally {
            setIsDeleting(false);
        }
    };

    const handleAddProject = async (projectData) => {
        setIsLoading(true);
        try {
            await createProject(projectData);
            // Trigger full refresh to get calculated financials and updated resources
            await fetchData();
            setIsModalOpen(false);
            toast.success('Project created successfully');
        } catch (err) {
            toast.error('Failed to create project');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredProjects = [...projects].sort((a, b) => {
        // Sort 'Completed' to the bottom
        if (a.status === 'Completed' && b.status !== 'Completed') return 1;
        if (a.status !== 'Completed' && b.status === 'Completed') return -1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0); // Default to newest first
    });

    const downloadCSV = () => {
        const headers = ['Client', 'Project', 'Type', 'Status', 'Revenue', 'Costs', 'Margin'];

        const csvRows = filteredProjects.map(p => {
            // Simple format: Quote strings, plain numbers
            return [
                `"${p.client_name || ''}"`,
                `"${p.name}"`,
                p.type,
                p.status || 'Active',
                p.revenue_earned,
                p.employee_costs,
                p.margin
            ].join(',');
        });

        const csvContent = [headers.join(','), ...csvRows].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', 'projects.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    // Active Filters Logic for Chips
    const activeFilters = [];
    const typeParam = searchParams.get('type');
    if (typeParam) {
        activeFilters.push({
            id: 'type',
            label: `Type: ${typeParam}`,
            onClear: () => {
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('type');
                setSearchParams(newParams);
                setPage(1);
            }
        });
    }
    if (dateRange.startDate || dateRange.endDate) {
        activeFilters.push({
            id: 'date',
            label: `Date: ${dateRange.startDate || '...'} - ${dateRange.endDate || '...'}`,
            onClear: () => {
                setDateRange({ startDate: '', endDate: '' });
                setActivePreset(null);
                setPage(1);
            }
        });
    }

    return (
        <div>
            {/* Process View Header - Integrated Tabs */}
            {typeParam && (
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            {typeParam} Projects
                            <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full border border-primary/20">
                                Process
                            </span>
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                            Track profitability for {typeParam} projects
                        </p>
                    </div>

                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg self-start sm:self-center">
                        <button
                            onClick={() => navigate(`/employees?specialization=${encodeURIComponent(typeParam)}`)}
                            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors flex items-center gap-2"
                        >
                            <Users className="w-4 h-4" />
                            Employees
                        </button>
                        <button
                            className="px-4 py-2 text-sm font-medium text-slate-900 dark:text-white bg-white dark:bg-slate-700 shadow-sm rounded-md transition-all flex items-center gap-2"
                        >
                            <Briefcase className="w-4 h-4" />
                            Projects
                        </button>
                    </div>
                </div>
            )}

            {!typeParam && (
                /* Original Header - Show only if NOT in Process View */
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                    <div>
                        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Projects</h2>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">Track project profitability and margins</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={downloadCSV}
                            className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center"
                        >
                            <Briefcase className="w-5 h-5 mr-2" />
                            Export CSV
                        </button>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center"
                        >
                            <Plus className="w-5 h-5 mr-2" />
                            Add Project
                        </button>
                    </div>
                </div>
            )}

            {/* Add Button for Process View (Optional place - matching Employees) */}
            {typeParam && (
                <div className="flex justify-end gap-2 mb-4">
                    <button
                        onClick={downloadCSV}
                        className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center"
                    >
                        <Briefcase className="w-5 h-5 mr-2" />
                        Export CSV
                    </button>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center"
                    >
                        <Plus className="w-5 h-5 mr-2" />
                        Add {typeParam} Project
                    </button>
                </div>
            )}

            {/* Filter Bar */}
            <div className="flex flex-col lg:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search projects or clients..."
                        className="pl-10 w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400"
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setPage(1);
                        }}
                    />
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    {/* Quick Selects */}
    <div className="flex bg-slate-100 dark:bg-slate-700/50 p-1 rounded-lg self-start sm:self-center">
                        {[
                            { label: 'This Month', range: 'month' },
                            { label: 'Last 30 Days', range: '30days' },
                            { label: 'Last 6 Months', range: '6months' },
                            { label: 'YTD', range: 'ytd' }
                        ].map((preset) => (
                            <button
                                key={preset.range}
                                onClick={() => {
                                    const now = new Date();
                                    // Use local date parts to avoid UTC toISOString() shifting the date by TZ offset.
                                    // e.g. In IST (UTC+5:30), Jan 1 00:00 local → Dec 31 18:30 UTC → '2025-12-31'
                                    const toLocalDateStr = (d) => {
                                        const y = d.getFullYear();
                                        const m = String(d.getMonth() + 1).padStart(2, '0');
                                        const day = String(d.getDate()).padStart(2, '0');
                                        return `${y}-${m}-${day}`;
                                    };

                                    let start, end = now;

                                    if (preset.range === 'month') {
                                        start = new Date(now.getFullYear(), now.getMonth(), 1);
                                    } else if (preset.range === '30days') {
                                        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
                                    } else if (preset.range === '6months') {
                                        start = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
                                    } else if (preset.range === 'ytd') {
                                        start = new Date(now.getFullYear(), 0, 1); // Jan 1
                                    }

                                    setDateRange({
                                        startDate: toLocalDateStr(start),
                                        endDate: toLocalDateStr(end)
                                    });
                                    setActivePreset(preset.range);
                                    setPage(1);
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
                            onChange={(e) => {
                                setDateRange(prev => ({ ...prev, startDate: e.target.value }));
                                setActivePreset(null);
                                setPage(1);
                            }}
                            className="text-sm dark:border-slate-600 border rounded p-2 [color-scheme:dark] w-[130px] bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                            style={{ colorScheme: 'dark' }}
                        />
                        <span className="text-slate-300 dark:text-slate-600">|</span>
                        <input
                            type="date"
                            name="endDate"
                            value={dateRange.endDate}
                            onChange={(e) => {
                                setDateRange(prev => ({ ...prev, endDate: e.target.value }));
                                setActivePreset(null);
                                setPage(1);
                            }}
                            className="text-sm dark:border-slate-600 border rounded p-2 [color-scheme:dark] w-[130px] bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                            style={{ colorScheme: 'dark' }}
                        />
                        {/* Clear Button */}
                        {(dateRange.startDate || dateRange.endDate) && (
                            <button
                                onClick={() => {
                                    setDateRange({ startDate: '', endDate: '' });
                                    setActivePreset(null);
                                    setPage(1);
                                }}
                                className="text-slate-400 hover:text-red-500 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Active Filter Chips */}
            {
                activeFilters.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6 animate-in fade-in slide-in-from-top-2">
                        {activeFilters.map(filter => (
                            <div key={filter.id} className="inline-flex items-center bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200 rounded-full px-3 py-1 text-sm border border-slate-200 dark:border-slate-600">
                                <span>{filter.label}</span>
                                <button
                                    onClick={filter.onClear}
                                    className="ml-2 p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={() => {
                                const newParams = new URLSearchParams(searchParams);
                                newParams.delete('type');
                                setSearchParams(newParams);
                                setDateRange({ startDate: '', endDate: '' });
                                setSearchTerm('');
                                setActivePreset(null);
                                setPage(1);
                            }}
                            className="text-sm text-primary hover:underline self-center ml-2"
                        >
                            Clear all
                        </button>
                    </div>
                )
            }


            {
                isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[...Array(6)].map((_, i) => <ProjectSkeleton key={i} />)}
                    </div>
                ) : filteredProjects.length === 0 ? (
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center text-slate-500 dark:text-slate-400">
                        <Briefcase className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                        <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">No projects found</h3>
                        <p>Start tracking by adding a new project.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                            {filteredProjects.map((project) => (
                                <ProjectCard
                                    key={project.id}
                                    project={project}
                                    onStatusChange={handleStatusChange}
                                    onDelete={handleDeleteProject}
                                    onAddResource={(p) => setSelectedProjectForResource(p)}
                                    onViewTeam={(p) => setSelectedProjectTeam(p)}
                                />
                            ))}
                        </div>

                        {/* Pagination Controls */}
                        {pagination.totalPages > 1 && (
                            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-6 mt-6">
                                <div className="text-sm text-slate-500 dark:text-slate-400">
                                    Showing <span className="font-medium text-slate-900 dark:text-white">{((page - 1) * pagination.limit) + 1}</span> to <span className="font-medium text-slate-900 dark:text-white">{Math.min(page * pagination.limit, pagination.total)}</span> of <span className="font-medium text-slate-900 dark:text-white">{pagination.total}</span> results
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="px-3 py-1 text-sm border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 transition-colors"
                                    >
                                        Previous
                                    </button>
                                    <button
                                        onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                                        disabled={page >= pagination.totalPages}
                                        className="px-3 py-1 text-sm border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 transition-colors"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )
            }

            {/* Modal for adding project */}
            {
                isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add New Project</h3>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="text-slate-400 hover:text-slate-500 transition-colors"
                                    type="button"
                                >
                                    <Plus className="w-5 h-5 transform rotate-45" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-hidden relative">
                                <ProjectForm
                                    clients={clients}
                                    onSubmit={handleAddProject}
                                    onCancel={() => setIsModalOpen(false)}
                                    isLoading={isLoading}
                                    initialData={null}
                                />
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={!!projectToDelete}
                onClose={() => setProjectToDelete(null)}
                title="Delete Project"
            >
                <div>
                    <div className="flex items-center gap-3 mb-4 text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                        <Trash2 className="w-5 h-5 flex-shrink-0" />
                        <p className="text-sm font-medium">This action cannot be undone.</p>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 mb-6">
                        Are you sure you want to delete <span className="font-bold text-slate-900 dark:text-white">{projectToDelete?.name}</span>?
                        All associated data including financials and timelines will be permanently removed.
                    </p>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setProjectToDelete(null)}
                            className="px-4 py-2 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={confirmDeleteProject}
                            disabled={isDeleting}
                            className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                            {isDeleting ? 'Deleting...' : 'Delete Project'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Project Team Modal */}
            <Modal
                isOpen={!!selectedTeamProject}
                onClose={() => setSelectedProjectTeam(null)}
                title={`${selectedTeamProject?.name} - Performance Hub`}
                maxWidth="max-w-7xl"
            >
                <div className="flex flex-col md:flex-row gap-6 h-full max-h-[75vh] overflow-hidden">
                    {/* Left Column: Assigned Resources (The Anchor) */}
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar border-r border-slate-100 dark:border-slate-700/50">
                        <div className="flex items-center justify-between mb-4 sticky top-0 bg-white dark:bg-slate-900 z-10 py-1">
                            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Users className="w-4 h-4" /> Assigned Team
                            </h4>
                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold rounded-full border border-slate-200 dark:border-slate-700">
                                {selectedTeamProject?.debug_info?.plans?.length || 0} Members
                            </span>
                        </div>

                        <div className="space-y-3">
                            {selectedTeamProject?.debug_info?.plans?.map((p, idx) => {
                                const roi = (p.totalPlanRevenue || 0) - (p.totalPlanCost || 0);
                                const joiningDateStr = p.joining_date ? p.joining_date.split('-').reverse().join('-') : 'Unknown';
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => openPerformanceModal(p)}
                                        className="w-full flex items-center justify-between p-3.5 bg-white/60 dark:bg-slate-800/60 backdrop-blur-md rounded-xl border border-slate-200/60 dark:border-slate-700/60 hover:border-primary/40 hover:bg-white dark:hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-200/20 dark:hover:shadow-none transition-all group text-left cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 flex items-center justify-center font-black text-sm border border-slate-200/50 dark:border-slate-700/50 shadow-sm shrink-0">
                                                {p.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex flex-col">
                                                <h5 className="text-sm font-black text-slate-900 dark:text-white transition-colors uppercase tracking-tight">{p.name}</h5>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-tight mt-0.5">
                                                    {p.role || 'Team Member'} • Joined: {joiningDateStr}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-5 text-right shrink-0">
                                            <div className="flex flex-col items-end">
                                                <span className="text-[9px] font-bold uppercase tracking-wider text-rose-500/80 mb-0.5">Period Cost</span>
                                                <span className="text-sm text-rose-600 dark:text-rose-400 font-bold tabular-nums">{formatCurrency(p.totalPlanCost || 0)}</span>
                                            </div>
                                            <div className="w-[1px] h-8 bg-slate-200 dark:bg-slate-700"></div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-500/80 mb-0.5">Projected Rev</span>
                                                <span className="text-sm text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">{formatCurrency(p.totalPlanRevenue || 0)}</span>
                                            </div>
                                            <div className="ml-2 pl-3 border-l border-slate-200 dark:border-slate-700">
                                                <span className={cn(
                                                    "px-2.5 py-1 rounded-full text-xs font-black whitespace-nowrap border shadow-sm",
                                                    roi >= 0 ? "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/60" 
                                                             : "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/60"
                                                )}>
                                                    {roi >= 0 ? '+' : ''}{formatCurrency(roi)}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                            {(!selectedTeamProject?.debug_info?.plans || selectedTeamProject?.debug_info?.plans?.length === 0) && (
                                <div className="p-8 text-center bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                                    <p className="text-sm text-slate-400 italic">No resources assigned to this project.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Performance Hub */}
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        <div className="space-y-8">
                            {/* Profit Generators */}
                            <div>
                                <h4 className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                                    <ArrowUpRight className="w-3 h-3" /> Profit Generators
                                </h4>
                                <div className="space-y-2">
                                    {selectedTeamProject?.debug_info?.plans?.filter(p => (Number(p.totalPlanRevenue || 0) - Number(p.totalPlanCost || 0)) >= 0).map((p, idx) => (
                                        <div key={idx} className="flex items-center p-2.5 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-lg border border-emerald-100/50 dark:border-emerald-800/20">
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{p.name}</span>
                                        </div>
                                    ))}
                                    {selectedTeamProject?.debug_info?.plans?.filter(p => (Number(p.totalPlanRevenue || 0) - Number(p.totalPlanCost || 0)) >= 0).length === 0 && (
                                        <p className="text-[10px] text-slate-400 italic px-2">No generators identified.</p>
                                    )}
                                </div>
                            </div>


                            {/* Cost Burdens */}
                            <div>
                                <h4 className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                                    <ArrowDownRight className="w-3 h-3" /> Cost Burdens
                                </h4>
                                <div className="space-y-2">
                                    {selectedTeamProject?.debug_info?.plans?.filter(p => (Number(p.totalPlanRevenue || 0) - Number(p.totalPlanCost || 0)) < 0).map((p, idx) => (
                                        <div key={idx} className="flex items-center p-2.5 bg-rose-50/50 dark:bg-rose-900/10 rounded-lg border border-rose-100/50 dark:border-rose-800/20 shadow-sm text-left">
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{p.name}</span>
                                        </div>
                                    ))}
                                    {selectedTeamProject?.debug_info?.plans?.filter(p => (Number(p.totalPlanRevenue || 0) - Number(p.totalPlanCost || 0)) < 0).length === 0 && (
                                        <div className="p-4 text-center bg-slate-50 dark:bg-slate-900/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-800/50">
                                            <p className="text-[11px] text-slate-400 italic">No cost burdens identified currently. Performance is optimal!</p>
                                        </div>
                                    )}
                                </div>

                                {/* Summary Section */}
                                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700/50">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-1">Project Revenue (Appr)</div>
                                            <div className="text-sm font-black text-emerald-600 whitespace-nowrap">
                                                {formatCurrency(Number(selectedTeamProject?.revenue_earned || 0))}
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-right">
                                            <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-1">Total Staff Burn</div>
                                            <div className="text-sm font-black text-rose-600 whitespace-nowrap">
                                                {formatCurrency(Number(selectedTeamProject?.employee_costs || 0))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 p-4 bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/10 dark:border-primary/20 flex justify-between items-center">
                                        <span className="text-[10px] text-primary/70 font-black uppercase tracking-widest">Actual Margin</span>
                                        <span className={cn(
                                            "text-base font-black font-mono whitespace-nowrap",
                                            (selectedTeamProject?.margin || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                                        )}>
                                            {formatCurrency(Number(selectedTeamProject?.margin || 0))}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Modal>
            {/* Performance Modal */}
            <EmployeePerformanceModal
                isOpen={performanceModal.isOpen}
                onClose={() => setPerformanceModal(prev => ({ ...prev, isOpen: false }))}
                employeeId={performanceModal.employeeId}
                employeeName={performanceModal.employeeName}
            />


            <AssignResourceModal
                isOpen={!!selectedProjectForResource}
                project={selectedProjectForResource}
                onClose={() => setSelectedProjectForResource(null)}
                onAddSuccess={() => {
                    setSelectedProjectForResource(null);
                    fetchData();
                    toast.success('Resource assigned to project successfully');
                }}
            />
        </div >
    );
};

export default Projects;
