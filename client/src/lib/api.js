import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:5000/api',
});

export const getClients = () => api.get('/clients');
export const createClient = (data) => api.post('/clients', data);

export const getProjects = () => api.get('/projects');
export const createProject = (data) => api.post('/projects', data);
export const updateProjectStatus = (id, status) => api.put(`/projects/${id}/status`, { status });

export const getExpenses = () => api.get('/expenses');
export const createExpense = (data) => api.post('/expenses', data);

export const getDashboardSummary = (params) => api.get('/dashboard/summary', { params });

export default api;
