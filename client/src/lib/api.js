import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:5001/api',
});

export const getClients = () => api.get('/clients');
export const createClient = (data) => api.post('/clients', data);

export const getProjects = () => api.get('/projects');
export const createProject = (data) => api.post('/projects', data);
export const updateProjectStatus = (id, status) => api.put(`/projects/${id}/status`, { status });
export const deleteProject = (id) => api.delete(`/projects/${id}`);

export const getExpenses = () => api.get('/expenses');
export const createExpense = (data) => api.post('/expenses', data);

export const getDashboardSummary = (params) => api.get('/dashboard/summary', { params });
export const getDashboardAnalytics = () => api.get('/dashboard/analytics');

export const getEmployees = () => api.get('/employees');
export const createEmployee = (data) => api.post('/employees', data);
export const updateEmployee = (id, data) => api.put(`/employees/${id}`, data);
export const deleteEmployee = (id) => api.delete(`/employees/${id}`);

export const getAllocations = (projectId) => api.get(`/employees/allocations/${projectId}`);
export const addAllocation = (data) => api.post('/employees/allocations', data);
export const removeAllocation = (id) => api.delete(`/employees/allocations/${id}`);

export default api;
