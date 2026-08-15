import React from 'react';
import { LayoutDashboard, ShoppingCart, Settings, Moon, Sun, GalleryVerticalEnd, Calendar, FileBarChart, PenTool } from 'lucide-react';
import { clsx } from 'clsx';

interface SidebarProps {
    activeView: 'dashboard' | 'orders' | 'settings' | 'calendar' | 'reports' | 'measurements';
    onViewChange: (view: 'dashboard' | 'orders' | 'settings' | 'calendar' | 'reports' | 'measurements') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange }) => {
    const [isDark, setIsDark] = React.useState(false);

    React.useEffect(() => {
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDark]);

    const NavItem = ({ id, icon: Icon, label }: { id: SidebarProps['activeView'], icon: React.ElementType, label: string }) => {
        const isActive = activeView === id;
        return (
            <button
                onClick={() => onViewChange(id)}
                className={clsx(
                    "flex items-center w-full px-3.5 py-3 rounded-xl transition-all duration-300 relative group/btn",
                    isActive
                        ? "bg-brand-emerald/10 text-brand-emerald dark:bg-brand-emerald/20 dark:text-brand-emerald"
                        : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-100"
                )}
            >
                <Icon className={clsx("min-w-[20px] h-5 w-5 transition-colors", isActive && "text-brand-emerald")} />
                <span className="ml-4 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                    {label}
                </span>
                {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-brand-emerald rounded-r-full" />
                )}
            </button>
        );
    };

    return (
        <aside className="fixed left-0 top-0 z-50 h-screen w-[72px] hover:w-64 transition-all duration-300 ease-in-out border-r border-slate-200 bg-white/80 dark:border-white/5 dark:bg-[#0a0a0a]/80 backdrop-blur-2xl hidden md:flex flex-col group overflow-hidden">
            <div className="flex h-20 items-center px-6 border-b border-transparent shrink-0">
                <GalleryVerticalEnd className="min-w-[24px] h-6 w-6 text-brand-emerald" />
                <span className="text-xl font-bold ml-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100 whitespace-nowrap bg-clip-text text-transparent bg-gradient-to-r from-brand-emerald to-teal-400">
                    Marble Flow
                </span>
            </div>

            <div className="flex-1 px-3 py-6 space-y-2 overflow-y-auto no-scrollbar">
                <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
                <NavItem id="calendar" icon={Calendar} label="Produção" />
                <NavItem id="measurements" icon={PenTool} label="Medições" />
                <NavItem id="reports" icon={FileBarChart} label="Relatórios" />
                <NavItem id="orders" icon={ShoppingCart} label="Ordens" />
                <NavItem id="settings" icon={Settings} label="Configurações" />
            </div>

            <div className="p-3 border-t border-slate-200 dark:border-white/5 shrink-0">
                <button
                    onClick={() => setIsDark(!isDark)}
                    className="flex items-center w-full px-3.5 py-3 rounded-xl transition-all duration-300 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-100"
                >
                    {isDark ? <Sun className="min-w-[20px] h-5 w-5 text-amber-500" /> : <Moon className="min-w-[20px] h-5 w-5" />}
                    <span className="ml-4 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                        {isDark ? 'Modo Claro' : 'Modo Escuro'}
                    </span>
                </button>
            </div>
        </aside>
    );
};
