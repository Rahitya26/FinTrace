import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:5001/api',
});

// Add Interceptor for JWT
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('fintrace_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

export const requestOtp = (email) => api.post('/auth/request-otp', { email });
export const verifyOtp = (payload) => api.post('/auth/verify-otp', payload);
export const loginPassword = (email, password) => api.post('/auth/login-password', { email, password });

export const getClients = (params) => api.get('/clients', { params });
export const createClient = (data) => api.post('/clients', data);

export const getProjects = (params) => api.get('/projects', { params });
export const createProject = (data) => api.post('/projects', data);
export const updateProjectStatus = (id, status) => api.put(`/projects/${id}/status`, { status });
export const deleteProject = (id) => api.delete(`/projects/${id}`);
export const getProjectResources = (projectId) => api.get(`/projects/${projectId}/resources`);
export const offboardProjectResource = (projectId, employeeId, endDate) => api.patch(`/projects/${projectId}/resources/${employeeId}/offboard`, { endDate });

export const getExpenses = (params) => api.get('/expenses', { params });
export const createExpense = (data) => api.post('/expenses', data);
export const getExpenseCategories = () => api.get('/expenses/categories');
export const createExpenseCategory = (data) => api.post('/expenses/categories', data);

export const getDashboardSummary = (params) => api.get('/dashboard/summary', { params });
export const getDashboardAnalytics = () => api.get('/dashboard/analytics');

export const getEmployees = (params) => api.get('/employees', { params });
export const createEmployee = (data) => api.post('/employees', data);
export const updateEmployee = (id, data) => api.put(`/employees/${id}`, data);
export const deleteEmployee = (id) => api.delete(`/employees/${id}`);
export const getEmployeePerformance = (id, params = {}) => api.get(`/employees/${id}/performance`, { params });

export const getAllocations = (projectId) => api.get(`/employees/allocations/${projectId}`);
export const addAllocation = (data) => api.post('/employees/allocations', data);
export const removeAllocation = (id) => api.delete(`/employees/allocations/${id}`);
export const offboardAllocation = (id, endDate) => api.patch(`/employees/allocations/${id}/offboard`, { endDate });

export const getTimesheets = (params) => api.get('/timesheets', { params });
export const logTimesheet = (data) => api.post('/timesheets/log', data);
export const getApprovals = () => api.get('/timesheets/approvals');
export const approveTimesheets = (data) => api.post('/timesheets/approve', data);
export const getClientResources = (clientId) => api.get(`/timesheets/client-resources/${clientId}`);

export default api;
