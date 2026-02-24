import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Users, Trash2, Edit2, X, Briefcase, IndianRupee, List, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '../components/Modal';
import { cn, formatCurrency } from '../lib/utils';
import { getEmployees, createEmployee, updateEmployee, deleteEmployee, getProjectResources } from '../lib/api';

const Employees = () => {
    const [employees, setEmployees] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 1, limit: 50 });

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentEmployee, setCurrentEmployee] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        role: '',
        monthly_salary: '',
        status: 'Active',
        specialization: 'Fixed Bid',
        hourly_rate: ''
    });
    const [displayValues, setDisplayValues] = useState({
        monthly_salary: '',
        hourly_rate: ''
    });

    const handleCurrencyChange = (field, value) => {
        const cleanValue = value.replace(/[^0-9.]/g, '');
        setFormData(prev => ({ ...prev, [field]: cleanValue }));

        if (cleanValue) {
            const numberVal = parseFloat(cleanValue);
            if (!isNaN(numberVal)) {
                const formatted = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(numberVal);
                setDisplayValues(prev => ({ ...prev, [field]: formatted }));
            } else {
                setDisplayValues(prev => ({ ...prev, [field]: cleanValue }));
            }
        } else {
            setDisplayValues(prev => ({ ...prev, [field]: '' }));
        }
    };

    // Delete State
    const [employeeToDelete, setEmployeeToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [searchParams, setSearchParams] = useSearchParams();
    const specializationFilter = searchParams.get('specialization');
    const projectIdFilter = searchParams.get('projectId');

    // Removed redundant useEffect to prevent race conditions

    useEffect(() => {
        fetchEmployees();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, searchTerm, specializationFilter, projectIdFilter]);

    const fetchEmployees = async () => {
        setIsLoading(true);
        try {
            const params = {
                page,
                limit: pagination.limit,
                search: searchTerm,
                specialization: specializationFilter || '',
                projectId: projectIdFilter || ''
            };
            const response = await getEmployees(params);
            setEmployees(response.data.data);
            setPagination(response.data.pagination);
        } catch (err) {
            toast.error('Failed to fetch employees');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const openAddModal = () => {
        setFormData({ name: '', role: '', monthly_salary: '', status: 'Active', specialization: 'Fixed Bid', hourly_rate: '' });
        setDisplayValues({ monthly_salary: '', hourly_rate: '' });
        setIsEditing(false);
        setCurrentEmployee(null);
        setIsModalOpen(true);
    };

    const openEditModal = (employee) => {
        setFormData({
            name: employee.name,
            role: employee.role,
            monthly_salary: employee.monthly_salary,
            status: employee.status,
            specialization: employee.specialization || 'Fixed Bid',
            hourly_rate: employee.hourly_rate
        });
        setDisplayValues({
            monthly_salary: employee.monthly_salary ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(employee.monthly_salary) : '',
            hourly_rate: employee.hourly_rate ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(employee.hourly_rate) : ''
        });
        setIsEditing(true);
        setCurrentEmployee(employee);
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            if (isEditing) {
                const response = await updateEmployee(currentEmployee.id, formData);
                setEmployees(employees.map(emp => emp.id === currentEmployee.id ? response.data : emp));
                toast.success('Employee updated successfully');
            } else {
                const response = await createEmployee(formData);
                setEmployees([...employees, response.data]);
                toast.success('Employee added successfully');
            }
            setIsModalOpen(false);
        } catch (err) {
            toast.error('Failed to save employee');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const confirmDelete = async () => {
        if (!employeeToDelete) return;
        setIsDeleting(true);
        try {
            await deleteEmployee(employeeToDelete.id);
            setEmployees(employees.filter(e => e.id !== employeeToDelete.id));
            toast.success('Employee deleted successfully');
            setEmployeeToDelete(null);
            fetchEmployees();
        } catch (err) {
            toast.error('Failed to delete employee');
            console.error(err);
        } finally {
            setIsDeleting(false);
        }
    };

    const navigate = useNavigate();

    return (
        <div>
            {/* Process View Header - Integrated Tabs */}
            {specializationFilter && (
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            {specializationFilter} View
                            <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full border border-primary/20">
                                Process
                            </span>
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                            Manage employees and projects for {specializationFilter}
                        </p>
                    </div>

                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg self-start sm:self-center">
                        <button
                            className="px-4 py-2 text-sm font-medium text-slate-900 dark:text-white bg-white dark:bg-slate-700 shadow-sm rounded-md transition-all flex items-center gap-2"
                        >
                            <Users className="w-4 h-4" />
                            Employees
                        </button>
                        <button
                            onClick={() => navigate(`/projects?type=${encodeURIComponent(specializationFilter)}`)}
                            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors flex items-center gap-2"
                        >
                            <Briefcase className="w-4 h-4" />
                            Projects
                        </button>
                    </div>
                </div>
            )}

            {!specializationFilter && !projectIdFilter && (
                /* Original Header - Show only if NOT in Process View or Project View */
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                    <div>
                        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Employees</h2>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">Manage team members and costs</p>
                    </div>
                    <button
                        onClick={openAddModal}
                        className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center"
                    >
                        <Plus className="w-5 h-5 mr-2" />
                        Add Employee
                    </button>
                </div>
            )}

            {/* Add Button for Process View (Optional place) */}
            {specializationFilter && (
                <div className="flex justify-end mb-4">
                    <button
                        onClick={openAddModal}
                        className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center"
                    >
                        <Plus className="w-5 h-5 mr-2" />
                        Add {specializationFilter} Employee
                    </button>
                </div>
            )}


            {/* Search Bar - Styled */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden mb-6 p-1">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search employees by name or role..."
                        className="w-full pl-12 pr-4 py-3 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-lg transition-all"
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setPage(1);
                        }}
                    />
                </div>
            </div>

            {/* List - Compact Cards Layout */}
            {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="bg-white dark:bg-slate-800 h-20 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 animate-pulse"></div>
                    ))}
                </div>
            ) : employees.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center text-slate-500">
                    <Users className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">No employees found</h3>
                    <p>Get started by adding your first team member.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                        {employees.map((employee) => (
                            <div
                                key={employee.id}
                                className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all group relative overflow-hidden"
                            >
                                <div className="p-4 flex items-center gap-3">
                                    {/* Avatar */}
                                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center font-semibold text-sm">
                                        {employee.name.charAt(0).toUpperCase()}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-medium text-slate-900 dark:text-white truncate pr-6">{employee.name}</h3>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{employee.role}</p>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <span className={cn(
                                                "flex-shrink-0 inline-block w-2 h-2 rounded-full",
                                                employee.status === 'Active' ? "bg-emerald-500" : "bg-slate-300"
                                            )} title={employee.status} />
                                            {/* Specialization / Rate Display */}
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] text-slate-400 uppercase tracking-tighter">
                                                    {employee.specialization === 'T&M' ? 'Rate/Hr' : 'Salary'}
                                                </span>
                                                <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                                                    {employee.specialization === 'T&M'
                                                        ? formatCurrency(employee.hourly_rate)
                                                        : formatCurrency(employee.monthly_salary)
                                                    }
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions Area */}
                                <div className="absolute top-2 right-2 flex gap-1 transform translate-x-12 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-200">
                                    <button
                                        onClick={() => openEditModal(employee)}
                                        className="p-1.5 text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                        title="Edit Employee"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => { setEmployeeToDelete(employee) }}
                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                        title="Remove Employee"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
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


            {/* Add/Edit Modal */}
            {
                isModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                                    {isEditing ? 'Edit Employee' : 'Add New Employee'}
                                </h3>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="text-slate-400 hover:text-slate-500 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Full Name
                                    </label>
                                    <div className="relative">
                                        <Users className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                        <input
                                            type="text"
                                            name="name"
                                            required
                                            className="pl-9 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                            placeholder="John Doe"
                                            value={formData.name}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Specialization
                                        </label>
                                        <div className="relative">
                                            <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                            <select
                                                name="specialization"
                                                className="pl-9 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-700 text-slate-900 dark:text-white appearance-none"
                                                value={formData.specialization}
                                                onChange={handleInputChange}
                                            >
                                                <option value="Fixed Bid">Fixed Bid</option>
                                                <option value="T&M">T&M</option>
                                                <option value="Fixed Value">Fixed Value</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Role
                                        </label>
                                        <div className="relative">
                                            <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                            <input
                                                type="text"
                                                name="role"
                                                required
                                                className="pl-9 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                                placeholder="Developer"
                                                value={formData.role}
                                                onChange={handleInputChange}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {formData.specialization === 'T&M' ? (
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                Hourly Rate
                                            </label>
                                            <div className="relative">
                                                <IndianRupee className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                                <input
                                                    type="text"
                                                    name="hourly_rate"
                                                    required
                                                    className="pl-9 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                                    placeholder="500"
                                                    value={displayValues.hourly_rate}
                                                    onChange={(e) => handleCurrencyChange('hourly_rate', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                                Monthly Salary
                                            </label>
                                            <div className="relative">
                                                <IndianRupee className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                                <input
                                                    type="text"
                                                    name="monthly_salary"
                                                    required
                                                    className="pl-9 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                                    placeholder="50,000"
                                                    value={displayValues.monthly_salary}
                                                    onChange={(e) => handleCurrencyChange('monthly_salary', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                            Status
                                        </label>
                                        <select
                                            name="status"
                                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                            value={formData.status}
                                            onChange={handleInputChange}
                                        >
                                            <option value="Active">Active</option>
                                            <option value="Inactive">Inactive</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="flex justify-end pt-4 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="px-4 py-2 text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="px-4 py-2 text-white bg-primary hover:bg-primary-dark rounded-lg font-medium transition-colors disabled:opacity-50"
                                    >
                                        {isLoading ? 'Saving...' : (isEditing ? 'Update Employee' : 'Add Employee')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={!!employeeToDelete}
                onClose={() => setEmployeeToDelete(null)}
                title="Delete Employee"
            >
                <div>
                    <div className="flex items-center gap-3 mb-4 text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                        <Trash2 className="w-5 h-5 flex-shrink-0" />
                        <p className="text-sm font-medium">This action cannot be undone.</p>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 mb-6">
                        Are you sure you want to delete <span className="font-bold text-slate-900 dark:text-white">{employeeToDelete?.name}</span>?
                        This will check if any resource plans are linked (cascade delete is enabled).
                    </p>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setEmployeeToDelete(null)}
                            className="px-4 py-2 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={confirmDelete}
                            disabled={isDeleting}
                            className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                            {isDeleting ? 'Deleting...' : 'Delete Employee'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div >
    );
};

export default Employees;
