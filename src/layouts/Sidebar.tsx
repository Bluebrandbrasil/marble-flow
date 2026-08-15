import React from 'react';
import {
    LayoutDashboard, FileText, Users, Ruler, Factory, 
    ClipboardList, CalendarCheck, Calendar, DollarSign, 
    Megaphone, UserCog, MailPlus, BarChart3, Settings, 
    LogOut, Moon, Sun, Gem, FileCheck, Zap, ShieldCheck,
    ShoppingBag, PencilRuler, MonitorPlay
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import type { ViewType } from '../types';
import { canAccessRoute } from '../config/permissions';
import { useAuth } from '../context/AuthContext';
import { useAppVersion } from '../hooks/useAppVersion';
import { cn } from '../lib/utils';
import { isSuperAdmin } from '../lib/authHelpers';

interface SidebarProps {
    quotesCount?: number;
    contractsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ quotesCount, contractsCount }) => {
    const { user, profile } = useAuth();
    const [isDark, setIsDark] = React.useState(false);
    const { currentVersion, currentBuildId } = useAppVersion();

    React.useEffect(() => {
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDark]);

    const SectionTitle = ({ title }: { title: string }) => (
        <div className="px-5 pt-6 pb-2 group-hover:opacity-100 opacity-0 transition-all duration-500 overflow-hidden">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                {title}
            </span>
        </div>
    );

    const NavItem = ({ id, to, icon: Icon, label, badge, end }: { id: ViewType, to: string, icon: React.ElementType, label: string, badge?: number, end?: boolean }) => {
        if (profile && !canAccessRoute(profile.role, id)) return null;

        return (
            <NavLink
                to={to}
                end={end}
                className={({ isActive }) => cn(
                    "flex items-center w-full px-4 py-2.5 my-0.5 rounded-xl transition-all duration-300 relative group/btn",
                    isActive
                        ? "bg-brand-rocha-primary/10 text-brand-rocha-primary font-bold"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                )}
            >
                {({ isActive }) => (
                    <>
                        <Icon className={cn("min-w-[20px] h-5 w-5 transition-transform group-hover/btn:scale-110", isActive && "text-brand-rocha-primary")} />
                        <span className="ml-4 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                            {label}
                        </span>
                        {badge !== undefined && badge > 0 && (
                            <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-brand-rocha-primary text-white text-[10px] font-black px-2 py-0.5 rounded-lg shadow-sm">
                                {badge}
                            </div>
                        )}
                        {isActive && (
                            <div className="absolute left-[-12px] top-1/2 -translate-y-1/2 w-1.5 h-6 bg-brand-rocha-primary rounded-r-full shadow-[2px_0_12px_rgba(139,92,246,0.5)]" />
                        )}
                    </>
                )}
            </NavLink>
        );
    };

    return (
        <aside className="fixed left-0 top-0 z-[500] h-screen w-[72px] hover:w-64 transition-all duration-500 ease-in-out border-r border-brand-rocha-border bg-white hidden md:flex flex-col group overflow-hidden print:hidden shadow-lg shadow-slate-200/50">
            
            {/* LOGO AREA */}
            <div className="flex h-24 items-center px-4 shrink-0 overflow-visible">
                <div className="w-10 h-10 shrink-0 bg-brand-rocha-primary rounded-xl flex items-center justify-center shadow-lg shadow-brand-rocha-primary/20 group-hover:rotate-6 transition-transform">
                    <Gem className="h-6 w-6 text-white" />
                </div>
                <div className="ml-4 flex flex-col opacity-0 group-hover:opacity-100 transition-all duration-500 whitespace-nowrap overflow-hidden">
                    <span className="text-lg font-black tracking-tighter text-slate-900 leading-none uppercase">
                        MARBLE<span className="text-brand-rocha-primary">FLOW</span>
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Industrial ERP</span>
                </div>
            </div>

            {/* NAVIGATION AREA */}
            <div className="flex-1 px-3 py-2 overflow-y-auto no-scrollbar scroll-smooth">
                
                <SectionTitle title="Dashboard" />
                <NavItem id="home" to="/inicio" icon={LayoutDashboard} label="Página Inicial" />
                <NavItem id="home" to="/telao" icon={MonitorPlay} label="Modo Telão" />

                <SectionTitle title="Operação" />
                <NavItem id="quotes" to="/orcamentos" icon={FileText} label="Orçamentos" badge={quotesCount} />
                <NavItem id="quick_sales" to="/vendas-rapidas" icon={ShoppingBag} label="Venda Rápida" />
                <NavItem id="planned_projects" to="/planejados" icon={PencilRuler} label="Planejados" />
                <NavItem id="quotes" to="/follow-up" icon={Zap} label="Central Follow-up" />
                <NavItem id="clients" to="/clientes" icon={Users} label="Clientes" />
                <NavItem id="measurements" to="/medicoes" icon={Ruler} label="Medições" end={true} />
                <NavItem id="dashboard" to="/producao/ordens" icon={Factory} label="Produção" />
                <NavItem id="orders" to="/producao/todas" icon={ClipboardList} label="Ordens" />
                <NavItem id="contracts" to="/contratos" icon={FileCheck} label="Contratos" badge={contractsCount} />

                <SectionTitle title="Agenda" />
                <NavItem id="store_visits" to="/visitas" icon={Users} label="Visitas na Loja" />
                <NavItem id="medicoes_hoje" to="/medicoes/hoje" icon={CalendarCheck} label="Medições do Dia" />
                {profile?.role !== 'medidor' && (
                    <NavItem id="calendar" to="/calendario" icon={Calendar} label="Agenda de Instalação" />
                )}

                <SectionTitle title="Financeiro" />
                <NavItem id="financial" to="/financeiro" icon={DollarSign} label="Financeiro" />
                <NavItem id="intelligence" to="/inteligencia-comercial" icon={Zap} label="Inteligência Comercial" />

                <SectionTitle title="Relacionamento" />
                <NavItem id="influencers" to="/influenciadores" icon={Megaphone} label="Influencers e Parceiros" />

                <SectionTitle title="Administração" />
                <NavItem id="staff" to="/equipe" icon={UserCog} label="Equipe / RH" />
                <NavItem id="invites" to="/convites" icon={MailPlus} label="Convites" />
                <NavItem id="reports" to="/relatorios" icon={BarChart3} label="Relatórios" />
                <NavItem id="settings" to="/configuracoes" icon={Settings} label="Configurações" />
                
                {isSuperAdmin(profile) && (
                    <>
                        <SectionTitle title="Mestre do Sistema" />
                        <NavItem id="access" to="/acesso" icon={Users} label="Gestão Master" />
                        <NavItem id="integrity" to="/admin/integrity" icon={ShieldCheck} label="Governança de Dados" />
                    </>
                )}

                <div className="h-12" /> {/* Bottom spacer */}
            </div>

            {/* BOTTOM AREA */}
            <div className="p-3 bg-slate-50 shrink-0 border-t border-brand-rocha-border">
                {user && (
                    <div className="flex items-center gap-3 px-3 py-3 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 overflow-hidden">
                        <div className="w-8 h-8 rounded-full bg-brand-rocha-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                            {profile?.photoUrl ? (
                                <img src={profile.photoUrl} alt={profile.name || 'User'} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-xs font-black text-brand-rocha-primary uppercase">{(profile?.name || user.displayName || user.email || 'U').substring(0, 1)}</span>
                            )}
                        </div>
                        <div className="flex flex-col min-w-0">
                            <p className="text-xs text-slate-900 font-black truncate">{profile?.name || user.displayName || (user.email ? user.email.split('@')[0] : 'Administrador')}</p>
                            <p className="text-[10px] text-slate-500 font-bold truncate lowercase">{user.email}</p>
                        </div>
                    </div>
                )}
                
                <div className="space-y-1">
                    <button
                        onClick={() => setIsDark(!isDark)}
                        className="flex items-center w-full px-4 py-2.5 rounded-xl transition-all duration-300 text-slate-500 hover:bg-white hover:text-amber-500 group/theme"
                    >
                        {isDark ? <Sun className="min-w-[20px] h-5 w-5 text-amber-500" /> : <Moon className="min-w-[20px] h-5 w-5" />}
                        <span className="ml-4 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                            {isDark ? 'Modo Claro' : 'Modo Escuro'}
                        </span>
                    </button>
                    
                    <button
                        onClick={() => signOut(auth)}
                        className="flex items-center w-full px-4 py-2.5 rounded-xl transition-all duration-300 text-slate-400 hover:bg-rose-50 hover:text-rose-600 group/logout"
                    >
                        <LogOut className="min-w-[20px] h-5 w-5" />
                        <span className="ml-4 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                            Sair da Conta
                        </span>
                    </button>
                </div>

                {currentVersion && (
                    <div className="mt-4 px-4 py-2 border-t border-brand-rocha-border opacity-30 transition-all duration-500 text-[9px] text-slate-400 font-black tracking-widest flex flex-col pointer-events-none uppercase">
                        <span>v{currentVersion}</span>
                        {currentBuildId && <span className="mt-0.5">{currentBuildId}</span>}
                    </div>
                )}
            </div>
        </aside>
    );
};
