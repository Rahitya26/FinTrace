import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Briefcase, Users, ChevronDown } from 'lucide-react';
import Modal from '../components/Modal';
import ProjectForm from '../components/ProjectForm';
import { cn, formatCurrency } from '../lib/utils';
import { getProjects, createProject, getClients, updateProjectStatus } from '../lib/api';

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

const ProjectCard = ({ project, onStatusChange }) => {
    const [isExpanded, setIsExpanded] = useState(false);

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

    return (
        <div
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
                "bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all duration-300 flex flex-col cursor-pointer group relative overflow-hidden",
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
                    <div className={cn("px-2 py-1 text-xs font-semibold rounded-full border", PROCESS_COLORS[project.type])}>
                        {project.type}
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
                    <ChevronDown className={cn("w-5 h-5 transition-transform duration-300", isExpanded ? "rotate-180" : "")} />
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

                        {/* Fixed Bid Progress Bar */}
                        {project.type === 'Fixed Bid' && project.deadline && (
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
                            <span className="text-slate-500 dark:text-slate-400">Costs</span>
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
    const [isLoading, setIsLoading] = useState(false);
    const [searchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [projectsRes, clientsRes] = await Promise.all([getProjects(), getClients()]);
            setProjects(projectsRes.data);
            setClients(clientsRes.data);
        } catch (err) {
            setError('Failed to fetch data');
            console.error(err);
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
        } catch (err) {
            console.error('Failed to update status', err);
            fetchData(); // Revert on error
        }
    };

    const handleAddProject = async (projectData) => {
        setIsLoading(true);
        try {
            const response = await createProject(projectData);
            // Optimistically add client name to avoid refetch
            const client = clients.find(c => c.id == projectData.clientId);
            const newProject = {
                ...response.data,
                client_name: client ? client.name : 'Unknown'
            };
            setProjects([newProject, ...projects]);
            setIsModalOpen(false);
        } catch (err) {
            alert('Failed to create project');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredProjects = projects.filter(project => {
        const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (project.client_name || '').toLowerCase().includes(searchTerm.toLowerCase());

        const typeParam = searchParams.get('type');
        const matchesType = typeParam ? project.type === typeParam : true;

        return matchesSearch && matchesType;
    }).sort((a, b) => {
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

    return (
        <div>
            {/* ... header and search ... */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                {/* ... existing header code ... */}
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

            <div className="mb-6 relative">
                {/* ... existing search input ... */}
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-slate-400" />
                </div>
                <input
                    type="text"
                    placeholder="Search projects or clients..."
                    className="pl-10 w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Clear filter button if type is present */}
            {searchParams.get('type') && (
                <div className="mb-4">
                    <button
                        onClick={() => setSearchTerm('') || window.history.pushState({}, '', '/projects')} // Simplified clear
                        // Better to use navigate but strict replace here
                        className="text-sm text-primary hover:underline"
                    >
                        Showing only {searchParams.get('type')} projects (Clear filter)
                    </button>
                </div>
            )}


            {filteredProjects.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center text-slate-500 dark:text-slate-400">
                    <Briefcase className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">No projects found</h3>
                    <p>Start tracking by adding a new project.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                    {filteredProjects.map((project) => (
                        <ProjectCard
                            key={project.id}
                            project={project}
                            onStatusChange={handleStatusChange}
                        />
                    ))}
                </div>
            )}

            {/* Modal for adding project */}
            {isModalOpen && (
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
            )}
        </div>
    );
};

export default Projects;
