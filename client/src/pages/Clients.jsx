import React, { useState, useEffect } from 'react';
import { Plus, Search, Building2, Calendar, ChevronDown, Briefcase, Clock, FileText, DollarSign, Layers } from 'lucide-react';
import Modal from '../components/Modal';
import ClientForm from '../components/ClientForm';
import { getClients, createClient } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

const ClientCard = ({ client, isExpanded, onToggle }) => {
    const navigate = useNavigate();

    const handleNavigation = (type) => {
        let url = `/projects?search=${encodeURIComponent(client.name)}`;
        if (type) {
            url += `&type=${encodeURIComponent(type)}`;
        }
        navigate(url);
    };

    return (
        <div
            onClick={onToggle}
            className={cn(
                "bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all cursor-pointer group",
                isExpanded ? "ring-2 ring-primary/20" : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
            )}
        >
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                        {client.name}
                    </h3>
                    <span className="inline-block px-2 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full mt-2">
                        {client.industry}
                    </span>
                </div>
                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                    <Building2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
            </div>

            <div className="mt-6 flex items-center text-sm text-slate-500 dark:text-slate-400">
                <Calendar className="w-4 h-4 mr-2" />
                <span>Client since {format(new Date(client.created_at), 'MMM yyyy')}</span>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
                <div className="text-sm font-medium text-slate-900 dark:text-white">
                    {client.project_count || 0} Active Projects
                </div>
                <ChevronDown className={cn("w-5 h-5 text-slate-400 transition-transform duration-300", isExpanded ? "rotate-180" : "")} />
            </div>

            {/* Expanded Content - Process Filters */}
            <div className={cn("grid transition-all duration-300 ease-in-out", isExpanded ? "grid-rows-[1fr] opacity-100 mt-4" : "grid-rows-[0fr] opacity-0")}>
                <div className="overflow-hidden">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                        View Projects by Process
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); handleNavigation(); }}
                            className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors border border-transparent hover:border-slate-300"
                        >
                            <Layers className="w-4 h-4" />
                            All Projects
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleNavigation('Fixed Bid'); }}
                            className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg transition-colors border border-transparent hover:border-emerald-200"
                        >
                            <FileText className="w-4 h-4" />
                            Fixed Bid
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleNavigation('T&M'); }}
                            className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors border border-transparent hover:border-blue-200"
                        >
                            <Clock className="w-4 h-4" />
                            T&M
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleNavigation('Fixed Value'); }}
                            className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-lg transition-colors border border-transparent hover:border-purple-200"
                        >
                            <DollarSign className="w-4 h-4" />
                            Fixed Value
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Clients = () => {
    const [clients, setClients] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 1, limit: 20 });
    const [error, setError] = useState(null);
    const [expandedClientId, setExpandedClientId] = useState(null); // Lifted state
    const navigate = useNavigate();

    // Removed redundant useEffect to prevent race conditions

    useEffect(() => {
        fetchClients();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, searchTerm]);

    const fetchClients = async () => {
        setIsLoading(true);
        try {
            const params = {
                page,
                limit: pagination.limit,
                search: searchTerm
            };
            const response = await getClients(params);
            setClients(response.data.data);
            setPagination(response.data.pagination);
        } catch (err) {
            setError('Failed to fetch clients');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddClient = async (clientData) => {
        setIsLoading(true);
        try {
            const response = await createClient(clientData);
            setClients([response.data, ...clients]);
            setIsModalOpen(false);
        } catch (err) {
            alert('Failed to create client'); // Consider using toast here if available
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Clients</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your client portfolio</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Add Client
                </button>
            </div>

            <div className="mb-6 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-slate-400" />
                </div>
                <input
                    type="text"
                    placeholder="Search clients by name or industry..."
                    className="pl-10 w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400"
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setPage(1);
                    }}
                />
            </div>

            {clients.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center text-slate-500 dark:text-slate-400">
                    <Building2 className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">No clients found</h3>
                    <p>Get started by adding your first client.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                        {clients.map((client) => (
                            <ClientCard
                                key={client.id}
                                client={client}
                                isExpanded={expandedClientId === client.id}
                                onToggle={() => setExpandedClientId(expandedClientId === client.id ? null : client.id)}
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
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Add New Client"
            >
                <ClientForm
                    onSubmit={handleAddClient}
                    onCancel={() => setIsModalOpen(false)}
                    isLoading={isLoading}
                />
            </Modal>
        </div>
    );
};

export default Clients;
