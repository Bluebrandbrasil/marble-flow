import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canAccessRoute } from '../config/permissions';
import { AlertCircle } from 'lucide-react';
import type { ViewType } from '../types';

interface ProtectedRouteProps {
    viewId: ViewType;
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ viewId, children, fallback }) => {
    const { profile, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="w-8 h-8 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!profile) return null;

    if (profile.status === 'blocked') {
        return (
            <div className="min-h-[400px] flex items-center justify-center p-6 text-center">
                <div className="glass-card p-10 rounded-3xl border border-rose-500/30 max-w-md shadow-2xl animate-in zoom-in-95 duration-500">
                    <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertCircle className="w-10 h-10 text-rose-500" />
                    </div>
                    <h2 className="text-2xl font-black text-white mb-3 tracking-tight uppercase">Conta Inativa</h2>
                    <p className="text-slate-400 text-sm leading-relaxed">
                        Seu acesso foi suspenso temporariamente por um administrador. <br/>
                        Entre em contato com o RH da sua empresa para regularizar.
                    </p>
                    <div className="mt-8 pt-8 border-t border-white/5">
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">Marble Flow Security System</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!canAccessRoute(profile.role, viewId)) {
        if (fallback) return <>{fallback}</>;

        // Special restriction feedback for Vendedores attempting to access Financeiro (Rule #RBAC)
        if (viewId === 'financial' && (profile.role === 'vendedor' || profile.role === 'seller')) {
            return (
                <div className="min-h-[500px] flex items-center justify-center p-6 text-center">
                    <div className="glass-card p-10 rounded-3xl border border-brand-ruby/20 max-w-md shadow-2xl animate-in fade-in zoom-in duration-500">
                        <div className="w-20 h-20 bg-brand-ruby/10 rounded-full flex items-center justify-center mx-auto mb-6">
                            <AlertCircle className="w-10 h-10 text-brand-ruby" />
                        </div>
                        <h2 className="text-2xl font-black text-white mb-3 tracking-tight uppercase">Módulo Restrito</h2>
                        <p className="text-slate-400 text-sm font-bold leading-relaxed">
                            Você não tem permissão para acessar o módulo financeiro. <br/>
                            Contate seu administrador para ajustes de papel.
                        </p>
                        <div className="mt-8 pt-6 border-t border-white/5">
                            <Link to="/inicio" className="text-brand-emerald font-black text-[10px] uppercase tracking-widest hover:underline">
                                Voltar ao Início
                            </Link>
                        </div>
                    </div>
                </div>
            );
        }

        // Default: Redirect to their role's home view
        return <Navigate to={profile.role === 'medidor' ? '/medicoes/hoje' : '/inicio'} replace />;
    }

    return <>{children}</>;
};
