import React, { useState, useEffect } from 'react';
import { Plus, Search, Users, Trash2, Edit2, X, Briefcase, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import Modal from '../components/Modal';
import { cn, formatCurrency } from '../lib/utils';
import { getEmployees, createEmployee, updateEmployee, deleteEmployee } from '../lib/api';

const Employees = () => {
    const [employees, setEmployees] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentEmployee, setCurrentEmployee] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        role: '',
        monthly_salary: '',
        status: 'Active'
    });

    // Delete State
    const [employeeToDelete, setEmployeeToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        setIsLoading(true);
        try {
            const response = await getEmployees();
            setEmployees(response.data);
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
        setFormData({ name: '', role: '', monthly_salary: '', status: 'Active' });
        setIsEditing(false);
        setCurrentEmployee(null);
        setIsModalOpen(true);
    };

    const openEditModal = (employee) => {
        setFormData({
            name: employee.name,
            role: employee.role,
            monthly_salary: employee.monthly_salary,
            status: employee.status
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
        } catch (err) {
            toast.error('Failed to delete employee');
            console.error(err);
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredEmployees = employees.filter(emp =>
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.role.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div>
            {/* Header */}
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

            {/* Filter */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden mb-6">
                <div className="p-4 flex items-center bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                    <div className="relative flex-1 max-w-md">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3" />
                        <input
                            type="text"
                            placeholder="Search employees..."
                            className="pl-9 pr-4 py-2 w-full text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
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
                ) : filteredEmployees.length === 0 ? (
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center text-slate-500">
                        <Users className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                        <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">No employees found</h3>
                        <p>Get started by adding your first team member.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                        {filteredEmployees.map((employee) => (
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
                                            <span className="text-xs font-mono text-slate-600 dark:text-slate-300">{formatCurrency(employee.monthly_salary)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Hover Actions - Absolute Top Right */}
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-slate-800/90 rounded-md p-0.5 backdrop-blur-sm">
                                    <button
                                        onClick={() => openEditModal(employee)}
                                        className="p-1 text-slate-400 hover:text-primary transition-colors"
                                        title="Edit"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => setEmployeeToDelete(employee)}
                                        className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {isModalOpen && (
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
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Monthly Salary
                                    </label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                        <input
                                            type="number"
                                            name="monthly_salary"
                                            required
                                            min="0"
                                            step="0.01"
                                            className="pl-9 w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                                            placeholder="5000.00"
                                            value={formData.monthly_salary}
                                            onChange={handleInputChange}
                                        />
                                    </div>
                                </div>
                            </div>

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
            )}

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
        </div>
    );
};

export default Employees;
