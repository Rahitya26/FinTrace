import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:5000/api',
});

export const getClients = () => api.get('/clients');
export const createClient = (data) => api.post('/clients', data);

export const getProjects = () => api.get('/projects');
export const createProject = (data) => api.post('/projects', data);

export const getExpenses = () => api.get('/expenses');
export const createExpense = (data) => api.post('/expenses', data);

export const getDashboardSummary = () => api.get('/dashboard/summary');

export default api;
