import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Briefcase, DollarSign, Users } from 'lucide-react';
import Modal from '../components/Modal';
import ProjectForm from '../components/ProjectForm';
import { cn, formatCurrency } from '../lib/utils';
import { getProjects, createProject, getClients } from '../lib/api';

const PROCESS_COLORS = {
    'T&M': 'bg-blue-100 text-blue-800 border-blue-200',
    'Fixed Bid': 'bg-green-100 text-green-800 border-green-200',
    'Fixed Value': 'bg-purple-100 text-purple-800 border-purple-200',
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
    });

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
    }

    return (
        <div>
            {/* ... header and search ... */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                {/* ... existing header code ... */}
                <div>
                    <h2 className="text-3xl font-bold text-slate-900">Projects</h2>
                    <p className="text-slate-500 mt-1">Track project profitability and margins</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Add Project
                </button>
            </div>

            <div className="mb-6 relative">
                {/* ... existing search input ... */}
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-slate-400" />
                </div>
                <input
                    type="text"
                    placeholder="Search projects or clients..."
                    className="pl-10 w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
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
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
                    <Briefcase className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 mb-1">No projects found</h3>
                    <p>Start tracking by adding a new project.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProjects.map((project) => {
                        const progress = calculateProgress(project.start_date, project.deadline);
                        const daysLeft = getDaysRemaining(project.deadline);
                        const totalDays = getTotalDuration(project.start_date, project.deadline);
                        const isCritical = daysLeft !== null && progress > 80;

                        return (
                            <div key={project.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow flex flex-col">
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-slate-900">{project.name}</h3>
                                        <div className="flex items-center text-sm text-slate-500 mt-1">
                                            <Users className="w-4 h-4 mr-1" />
                                            {project.client_name}
                                        </div>
                                    </div>
                                    <div className={cn("px-2 py-1 text-xs font-semibold rounded-full border", PROCESS_COLORS[project.type])}>
                                        {project.type}
                                    </div>
                                </div>

                                {/* Timeline for Fixed Bid */}
                                {project.type === 'Fixed Bid' && project.deadline && (
                                    <div className="mb-4">
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className={isCritical ? "text-red-600 font-bold" : "text-slate-500"}>
                                                {daysLeft > 0 ? `${daysLeft} days left` : 'Overdue'}
                                                <span className="text-slate-400 font-normal ml-1">
                                                    (Total: {totalDays} days)
                                                </span>
                                            </span>
                                            <span className="text-slate-400">
                                                {Math.round(progress)}% time used
                                            </span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                            <div
                                                className={cn("h-1.5 rounded-full transition-all duration-500",
                                                    progress > 80 ? "bg-red-500" : "bg-primary"
                                                )}
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="mt-auto space-y-3 pt-4 border-t border-slate-100">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Revenue</span>
                                        <span className="font-medium text-slate-900">{formatCurrency(project.revenue_earned)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Costs</span>
                                        <span className="font-medium text-slate-900">{formatCurrency(project.employee_costs)}</span>
                                    </div>
                                    <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-50">
                                        <span className="text-slate-700">Margin</span>
                                        <span className={Number(project.margin) >= 0 ? "text-green-600" : "text-red-500"}>
                                            {formatCurrency(project.margin)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal for adding project */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <h3 className="text-lg font-semibold text-slate-900">Add New Project</h3>
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
