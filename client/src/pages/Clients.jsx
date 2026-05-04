import React, { useState, useEffect } from 'react';
import { Plus, Search, Building2, Calendar, ChevronDown, Briefcase, Clock, FileText, DollarSign, Layers } from 'lucide-react';
import Modal from '../components/Modal';
import ClientForm from '../components/ClientForm';
import { getClients, createClient } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
};

const SkeletonCard = () => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 animate-pulse">
        <div className="flex justify-between items-start mb-6">
            <div className="space-y-3 flex-1">
                <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
            </div>
            <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-xl" />
        </div>
        <div className="flex justify-between items-center">
            <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/3" />
            <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/4" />
        </div>
    </div>
);

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
                "bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-xl transition-all cursor-pointer group relative overflow-hidden",
                isExpanded ? "ring-2 ring-primary shadow-indigo-200 dark:shadow-none" : "hover:border-primary/30"
            )}
        >
            {/* Background Accent */}
            <div className={cn(
                "absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rounded-full transition-all duration-500",
                isExpanded ? "bg-primary/10 scale-150" : "bg-slate-50 dark:bg-slate-700/30 group-hover:bg-primary/5"
            )} />

            <div className="relative z-10">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors leading-tight">
                            {client.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                                {formatCurrency(client.total_revenue)}
                            </span>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Revenue</span>
                        </div>
                    </div>
                    <div className={cn(
                        "p-3 rounded-xl transition-all duration-300",
                        isExpanded ? "bg-primary text-white" : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                    )}>
                        <Building2 className="w-6 h-6" />
                    </div>
                </div>

                <div className="mt-6 flex items-center justify-between text-sm">
                    <div className="flex items-center text-slate-500 dark:text-slate-400">
                        <Calendar className="w-4 h-4 mr-2" />
                        <span>Since {format(new Date(client.created_at), 'MMM yyyy')}</span>
                    </div>
                    <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                        <Layers className="w-4 h-4 text-primary" />
                        {client.project_count || 0} Projects
                    </div>
                </div>

                {/* Expanded Content */}
                <div className={cn(
                    "grid transition-all duration-500 ease-in-out",
                    isExpanded ? "grid-rows-[1fr] opacity-100 mt-6 pt-6 border-t border-slate-100 dark:border-slate-700" : "grid-rows-[0fr] opacity-0"
                )}>
                    <div className="overflow-hidden space-y-6">
                        {/* Net Savings Section */}
                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Net Savings</p>
                                <p className={cn(
                                    "text-xl font-black tracking-tight",
                                    Number(client.net_savings) >= 0 ? "text-emerald-500" : "text-rose-500"
                                )}>
                                    {formatCurrency(client.net_savings)}
                                </p>
                            </div>
                            <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center",
                                Number(client.net_savings) >= 0 ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                            )}>
                                <DollarSign className="w-5 h-5" />
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Industry Details</p>
                            <span className="inline-flex px-3 py-1.5 text-sm font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-lg">
                                {client.industry}
                            </span>
                        </div>

                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Quick Navigation</p>
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
    const [expandedClientId, setExpandedClientId] = useState(null);
    const navigate = useNavigate();

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
            fetchClients(); // Refresh to get financial data
        } catch (err) {
            alert('Failed to create client');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="pb-20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Clients</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">Manage your client portfolio and financial health</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-primary/20 flex items-center justify-center hover:scale-[1.02] active:scale-[0.98]"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Add New Client
                </button>
            </div>

            <div className="mb-8 relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-slate-400 group-focus-within:text-primary transition-colors" />
                </div>
                <input
                    type="text"
                    placeholder="Search clients by name or industry..."
                    className="pl-12 w-full px-4 py-4 border border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 shadow-sm"
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setPage(1);
                    }}
                />
            </div>

            {isLoading && clients.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
                </div>
            ) : clients.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 p-16 text-center">
                    <div className="w-20 h-20 bg-slate-50 dark:bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">No clients found</h3>
                    <p className="text-slate-500 dark:text-slate-400 max-w-xs mx-auto">Get started by adding your first client to track their financial performance.</p>
                </div>
            ) : (
                <div className="space-y-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-start">
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
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-slate-200 dark:border-slate-700">
                            <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                Showing <span className="text-slate-900 dark:text-white">{((page - 1) * pagination.limit) + 1}</span> - <span className="text-slate-900 dark:text-white">{Math.min(page * pagination.limit, pagination.total)}</span> of <span className="text-slate-900 dark:text-white">{pagination.total}</span>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="px-5 py-2 text-sm font-bold border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 transition-all"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                                    disabled={page >= pagination.totalPages}
                                    className="px-5 py-2 text-sm font-bold border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 dark:text-slate-300 transition-all"
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
