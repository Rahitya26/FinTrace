import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Briefcase, Receipt, Settings, Menu, X, Sun, Moon } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme } from '../hooks/useTheme';

const Layout = ({ children }) => {
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
    const { theme, toggleTheme } = useTheme();

    const navItems = [
        { label: 'Dashboard', path: '/', icon: LayoutDashboard },
        { label: 'Clients', path: '/clients', icon: Users },
        { label: 'Projects', path: '/projects', icon: Briefcase },
        { label: 'Employees', path: '/employees', icon: Users },
        { label: 'Expenses', path: '/expenses', icon: Receipt },
    ];

    const NavContent = () => (
        <>
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <Link to="/" className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight hover:opacity-80 transition-opacity">
                    Fin<span className="text-primary">Trace</span>
                </Link>
                <button
                    onClick={toggleTheme}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                >
                    {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
            </div>
            <nav className="flex-1 p-4 space-y-1">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;

                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={cn(
                                "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                                isActive
                                    ? "bg-slate-100 dark:bg-slate-800 text-primary dark:text-primary-light"
                                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                            )}
                        >
                            <Icon className="w-5 h-5 mr-3" />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center space-x-3 text-slate-500 dark:text-slate-400 text-xs">
                    <span>v1.0.0</span>
                </div>
            </div>
        </>
    );

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
            {/* Desktop Sidebar */}
            <aside className="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 hidden md:flex flex-col transition-colors duration-200">
                <NavContent />
            </aside>

            {/* Mobile Menu Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/50 z-40 md:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Mobile Sidebar */}
            <div className={cn(
                "fixed inset-y-0 left-0 w-64 bg-white dark:bg-slate-800 z-50 transform transition-transform duration-300 ease-in-out md:hidden flex flex-col border-r border-slate-200 dark:border-slate-700",
                isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <NavContent />
            </div>

            {/* Main Content */}
            <main className="flex-1 overflow-auto w-full">
                <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-6 md:hidden sticky top-0 z-30 transition-colors duration-200">
                    <Link to="/" className="text-xl font-bold text-slate-900 dark:text-white hover:opacity-80 transition-opacity">
                        Fin<span className="text-primary">Trace</span>
                    </Link>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
                        >
                            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                        >
                            {isMobileMenuOpen ? (
                                <X className="w-6 h-6" />
                            ) : (
                                <Menu className="w-6 h-6" />
                            )}
                        </button>
                    </div>
                </header>
                <div className="p-4 md:p-6 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
