import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Briefcase, Users, ChevronDown, Trash2, Calendar, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '../components/Modal';
import ProjectForm from '../components/ProjectForm';
import { cn, formatCurrency } from '../lib/utils';
import { getProjects, createProject, getClients, updateProjectStatus, deleteProject, addAllocation } from '../lib/api';

const PROCESS_COLORS = {
    'T&M': 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    'Fixed Bid': 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
    'Fixed Value': 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
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

const ProjectCard = ({ project, onStatusChange, onDelete }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const navigate = useNavigate();

    const calculateProgress = (start, end) => {
        if (!start || !end) return 0;
        const startDate = new Date(start);
        const endDate = new Date(end);
        const today = new Date();
        const totalDuration = endDate - startDate;
        const elapsed = today - startDate;

        if (totalDuration <= 0) return 100;
        return Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
    };

    const getDaysRemaining = (end) => {
        if (!end) return null;
        const today = new Date();
        const endDate = new Date(end);
        const diffTime = endDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    };

    const getTotalDuration = (start, end) => {
        if (!start || !end) return 0;
        const startDate = new Date(start);
        const endDate = new Date(end);
        const diffTime = endDate - startDate;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    const progress = calculateProgress(project.start_date, project.deadline);
    const daysLeft = getDaysRemaining(project.deadline);
    const totalDays = getTotalDuration(project.start_date, project.deadline);
    const isCritical = daysLeft !== null && progress > 80;

    // Health Indicator Logic
    const margin = Number(project.margin) || 0;
    const revenue = Number(project.revenue_earned) || 1; // Prevent div by zero
    const marginPct = (margin / revenue) * 100;

    let borderClass = 'border-l-4 border-l-slate-200 dark:border-l-slate-700'; // Default
    if (revenue > 0) {
        if (marginPct >= 50) borderClass = 'border-l-4 border-l-emerald-500';
        else if (marginPct >= 20) borderClass = 'border-l-4 border-l-amber-500';
        else borderClass = 'border-l-4 border-l-rose-500';
    }

    return (
        <div
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
                "bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border-t border-r border-b border-slate-200 dark:border-slate-700 hover:shadow-md transition-all duration-300 flex flex-col cursor-pointer group relative overflow-hidden",
                borderClass,
                project.status === 'Completed' ? "opacity-60 grayscale bg-slate-50 dark:bg-slate-900 order-last" : ""
            )}
        >
            {/* Header Section (Always Visible) */}
            <div className="flex items-start justify-between mb-2">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{project.name}</h3>
                    <div className="flex items-center text-sm text-slate-500 dark:text-slate-400 mt-1">
                        <Users className="w-4 h-4 mr-1" />
                        {project.client_name}
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                        <div className={cn("px-2 py-1 text-xs font-semibold rounded-full border", PROCESS_COLORS[project.type])}>
                            {project.type}
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/employees?projectId=${project.id}`);
                            }}
                            className="p-1 text-slate-400 hover:text-primary hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-full transition-colors"
                            title="View Team"
                        >
                            <Users className="w-4 h-4" />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(project.id);
                            }}
                            className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                            title="Delete Project"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Status Dropdown - Stop Propagation */}
                    <div onClick={(e) => e.stopPropagation()}>
                        <select
                            value={project.status || 'Active'}
                            onChange={(e) => onStatusChange(project.id, e.target.value)}
                            className={cn(
                                "text-xs font-medium px-2 py-1 rounded-full border-none focus:ring-1 focus:ring-slate-200 cursor-pointer outline-none",
                                STATUS_COLORS[project.status || 'Active']
                            )}
                        >
                            {PROJECT_STATUSES.map(status => (
                                <option key={status} value={status} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{status}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Quick Summary (Margin) - Always visible, moves to bottom in expanded */}
            <div className={cn("flex justify-between items-end transition-all duration-300", isExpanded ? "mt-4 pt-4 border-t border-slate-100 dark:border-slate-700" : "mt-2")}>
                {!isExpanded && (
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                        Margin: <span className={Number(project.margin) >= 0 ? "text-green-600 dark:text-green-400 font-medium" : "text-red-500 dark:text-red-400 font-medium"}>
                            {formatCurrency(project.margin)}
                        </span>
                    </div>
                )}
                <div onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700/50">
                    <ChevronDown className={cn("w-5 h-5 transition-transform duration-300 transform", isExpanded ? "rotate-180" : "")} />
                </div>
            </div>

            {/* Expanded Content */}
            <div className={cn("grid transition-all duration-300 ease-in-out", isExpanded ? "grid-rows-[1fr] opacity-100 mt-4" : "grid-rows-[0fr] opacity-0")}>
                <div className="overflow-hidden">
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

                        {/* Fixed Bid / Fixed Value Progress Bar */}
                        {(project.type === 'Fixed Bid' || project.type === 'Fixed Value') && project.deadline && (
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
                            </div>
                        )}
                    </div>

                    {/* Financials */}
                    <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">Revenue</span>
                            <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(project.revenue_earned)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500 dark:text-slate-400">
                                Costs {project.is_calculated_cost && <span title="Calculated from resources" className="text-[10px] text-primary bg-primary/10 px-1 rounded ml-1 cursor-help">Calc.</span>}
                            </span>
                            <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(project.employee_costs)}</span>
                        </div>
                        <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-50 dark:border-slate-700">
                            <span className="text-slate-700 dark:text-slate-300">Margin</span>
                            <div className="flex flex-col items-end">
                                {Number(project.revenue_earned) > 0 && (() => {
                                    const margin = Number(project.margin);
                                    const revenue = Number(project.revenue_earned);
                                    const marginPct = (margin / revenue) * 100;

                                    if (marginPct < 20) {
                                        return <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium mb-1">Low Margin</span>;
                                    }
                                    if (marginPct > 50) {
                                        return <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium mb-1">High Profit</span>;
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
    const [isLoading, setIsLoading] = useState(true);
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 1, limit: 20 });
    const [error, setError] = useState(null);
    const [dateRange, setDateRange] = useState({
        startDate: '',
        endDate: ''
    });
    const [activePreset, setActivePreset] = useState(null);

    const [projectToDelete, setProjectToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

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
        setIsLoading(true); // Re-use main loader or local state? Using main for simplicity or keep local.
        // Actually ProjectForm has its own loader prop.
        try {
            const response = await createProject(projectData);

            // Handle Resources if present
            if (projectData.resources && projectData.resources.length > 0) {
                try {
                    await Promise.all(projectData.resources.map(resource =>
                        addAllocation({
                            projectId: response.data.id,
                            employeeId: resource.employeeId,
                            allocationPercentage: resource.allocation,
                            startDate: projectData.startDate // Default to project start
                        })
                    ));
                } catch (resErr) {
                    console.error("Failed to save resources", resErr);
                    toast.error("Project created but failed to save resources");
                }
            }

            // Optimistically add client name to avoid refetch
            const client = clients.find(c => c.id == projectData.clientId);
            const newProject = {
                ...response.data,
                client_name: client ? client.name : 'Unknown'
            };
            setProjects([newProject, ...projects]);
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
                                    let start, end = now;

                                    if (preset.range === 'month') {
                                        start = new Date(now.getFullYear(), now.getMonth(), 1);
                                    } else if (preset.range === '30days') {
                                        start = new Date();
                                        start.setDate(now.getDate() - 30);
                                    } else if (preset.range === '6months') {
                                        start = new Date();
                                        start.setMonth(now.getMonth() - 6);
                                    } else if (preset.range === 'ytd') {
                                        start = new Date(now.getFullYear(), 0, 1);
                                    }

                                    setDateRange({
                                        startDate: start.toISOString().split('T')[0],
                                        endDate: end.toISOString().split('T')[0]
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
                            className="text-sm border-none focus:ring-0 text-slate-600 dark:text-slate-300 bg-transparent dark:[color-scheme:dark] p-0 w-[110px]"
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
                            className="text-sm border-none focus:ring-0 text-slate-600 dark:text-slate-300 bg-transparent dark:[color-scheme:dark] p-0 w-[110px]"
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
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add New Project</h3>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="text-slate-400 hover:text-slate-500 transition-colors"
                                    type="button"
                                >
                                    <Plus className="w-5 h-5 transform rotate-45" />
                                </button>
                            </div>
                            <div className="p-6">
                                <ProjectForm
                                    clients={clients}
                                    onSubmit={handleAddProject}
                                    onCancel={() => setIsModalOpen(false)}
                                    isLoading={isLoading}
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
        </div >
    );
};

export default Projects;
