import React, { useState, useEffect } from 'react';
import { Plus, Search, Building2, Calendar } from 'lucide-react';
import Modal from '../components/Modal';
import ClientForm from '../components/ClientForm';
import { getClients, createClient } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

const Clients = () => {
    const [clients, setClients] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        fetchClients();
    }, []);

    const fetchClients = async () => {
        try {
            const response = await getClients();
            setClients(response.data);
        } catch (err) {
            setError('Failed to fetch clients');
            console.error(err);
        }
    };

    const handleAddClient = async (clientData) => {
        setIsLoading(true);
        try {
            const response = await createClient(clientData);
            setClients([response.data, ...clients]);
            setIsModalOpen(false);
        } catch (err) {
            alert('Failed to create client');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredClients = clients.filter(client =>
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.industry.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900">Clients</h2>
                    <p className="text-slate-500 mt-1">Manage your client portfolio</p>
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
                    className="pl-10 w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {filteredClients.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
                    <Building2 className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 mb-1">No clients found</h3>
                    <p>Get started by adding your first client.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredClients.map((client) => (
                        <div
                            key={client.id}
                            onClick={() => navigate(`/projects?search=${encodeURIComponent(client.name)}`)}
                            className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all cursor-pointer group"
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white group-hover:text-primary transition-colors">{client.name}</h3>
                                    <span className="inline-block px-2 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full mt-2">
                                        {client.industry}
                                    </span>
                                </div>
                                <div className="p-2 bg-indigo-50 rounded-lg">
                                    <Building2 className="w-5 h-5 text-indigo-600" />
                                </div>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center text-sm text-slate-500">
                                <Calendar className="w-4 h-4 mr-2" />
                                Added {format(new Date(client.created_at), 'MMM dd, yyyy')}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal for adding client */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add New Client</h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-500 transition-colors"
                            >
                                <Plus className="w-5 h-5 transform rotate-45" />
                            </button>
                        </div>
                        <div className="p-6">
                            <ClientForm
                                onSubmit={handleAddClient}
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

export default Clients;
