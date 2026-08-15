import { safeArray } from '../../lib/dataDiagnostics';
import { safeParseISO, formatVisualDate } from '../../lib/dateUtils';
import { runTemporalAudit, runTemporalNormalization, type AuditStats } from '../../lib/auditTemporal';
import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
    ShieldCheck, 
    History, 
    Search, 
    AlertTriangle,
    ExternalLink,
    Fingerprint,
    Database,
    Zap,
    Lock,
    Download,
    CheckCircle,
    Building2,
    Filter,
    BarChart
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../lib/authHelpers';

/**
 * Integrity Dashboard - Governance V4
 * 
 * Secure technical overview of data health, forensic intelligence, and compliance.
 * Restricted to SuperAdmin oversight authority only.
 */
export const IntegrityDashboard: React.FC = () => {
    const { profile, user } = useAuth();
    const navigate = useNavigate();
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'governance' | 'timeline' | 'audit'>('governance');
    const [auditStats, setAuditStats] = useState<AuditStats | null>(null);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditProgress, setAuditProgress] = useState('');
    const [filterSeverity, setFilterSeverity] = useState<'all' | 'info' | 'warning' | 'critical'>('all');
    const [filterCompany, setFilterCompany] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Session Data
    const [sessionSummary, setSessionSummary] = useState<any>({});

    // 1. Double-Layer Protection (Component Level)
    if (!isSuperAdmin(profile)) {
        return (
            <div className="min-h-[80vh] flex items-center justify-center p-6 text-center">
                <div className="glass-card p-12 rounded-[3.5rem] border border-rose-500/20 max-w-lg shadow-2xl animate-in zoom-in-95 duration-500">
                    <div className="w-24 h-24 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse">
                        <Lock className="w-12 h-12 text-rose-500" />
                    </div>
                    <h2 className="text-3xl font-black text-white mb-4 tracking-tighter uppercase">Módulo Restrito</h2>
                    <p className="text-slate-400 font-bold leading-relaxed mb-8">
                        Este módulo contém inteligência forense e dados estruturais do sistema. <br/>
                        Apenas <span className="text-brand-emerald">SuperAdmins</span> podem visualizar esta camada de governança.
                    </p>
                    <Button onClick={() => navigate('/inicio')} className="bg-white text-slate-950 font-black uppercase tracking-widest px-8 rounded-2xl h-14">
                        Voltar ao Início
                    </Button>
                </div>
            </div>
        );
    }

    useEffect(() => {
        // 2. Audit Trail: Log Admin Access
        const logAccess = async () => {
            try {
                if (user?.uid) {
                    await addDoc(collection(db, 'admin_access_logs'), {
                        userId: user.uid,
                        email: user.email,
                        action: 'open_integrity_dashboard',
                        timestamp: serverTimestamp(),
                        userAgent: navigator.userAgent,
                        version: 'Governance V4'
                    });
                }
            } catch (e) {
                console.error("Governance Error: Failed to log admin access:", e);
            }
        };
        logAccess();

        // 3. Technical Data Stream (Firestore Persistence)
        const logsRef = collection(db, 'data_issues');
        const q = query(logsRef, orderBy('timestamp', 'desc'), limit(300));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedLogs = safeArray(snapshot.docs).map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setLogs(fetchedLogs);
            setLoading(false);
        });

        // 4. Local Intelligence Stream (Session Recurrence)
        const interval = setInterval(() => {
            const diag = (window as any).__MARBLEFLOW_DIAGNOSTICS__;
            if (diag) setSessionSummary(diag.getSummary());
        }, 2000);

        return () => {
            unsubscribe();
            clearInterval(interval);
        };
    }, [user]);

    // Governance V4: Advanced Filtering
    const filteredLogs = safeArray(logs).filter(log => {
        const matchesSeverity = filterSeverity === 'all' || log.severity === filterSeverity;
        const matchesCompany = !filterCompany || (log.companyId || '').toLowerCase().includes(filterCompany.toLowerCase());
        const matchesSearch = 
            (log.message || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
            (log.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (log.entityId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (log.module || '').toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSeverity && matchesCompany && matchesSearch;
    });

    // Governance KPIs
    const stats = {
        total: safeArray(logs).filter(l => !l.resolved).length,
        critical: safeArray(logs).filter(l => l.severity === 'critical' && !l.resolved).length,
        warning: safeArray(logs).filter(l => l.severity === 'warning' && !l.resolved).length,
        score: logs.length > 0 ? Math.round(((logs.length - safeArray(logs).filter(l => l.severity === 'critical').length) / logs.length) * 100) : 100
    };

    const handleResolve = async (logId: string) => {
        try {
            const logRef = doc(db, 'data_issues', logId);
            await updateDoc(logRef, { resolved: true, resolvedAt: serverTimestamp(), resolvedBy: user?.email });
        } catch (e) {
            console.error("Governance Error: Failed to resolve log:", e);
        }
    };

    const handleExport = () => {
        const data = safeArray(filteredLogs).map(l => ({
            "Time": l.timestamp,
            "Module": l.module,
            "Code": l.code,
            "Severity": l.severity.toUpperCase(),
            "Message": l.message,
            "EntityId": l.entityId || 'N/A',
            "CompanyId": l.companyId || 'N/A'
        }));
        
        const csvContent = "data:text/csv;charset=utf-8," 
            + Object.keys(data[0]).join(",") + "\n"
            + safeArray(data).map(e => Object.values(e).join(",")).join("\n");
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `governance_report_v4_${format(new Date(), 'yyyyMMdd')}.csv`);
        document.body.appendChild(link);
        link.click();
    };

    const getEntityLink = (log: any) => {
        if (!log.entityId) return null;
        if (log.module === 'quotes') return `/orcamentos/${log.entityId}/editar`;
        if (log.module === 'crm') return `/clientes`;
        if (log.module === 'staff') return `/equipe`;
        if (log.module === 'orders') return `/pedidos/${log.entityId}/editar`;
        return null;
    };

    const handleRunAudit = async () => {
        setAuditLoading(true);
        try {
            const res = await runTemporalAudit((msg) => setAuditProgress(msg));
            setAuditStats(res);
        } catch (e) {
            console.error(e);
        } finally {
            setAuditLoading(false);
            setAuditProgress('');
        }
    };

    const handleRunNormalization = async () => {
        if (!window.confirm('Deseja iniciar a normalização automática dos dados históricos? Esta ação é irreversível.')) return;
        setAuditLoading(true);
        try {
            const count = await runTemporalNormalization((msg) => setAuditProgress(msg));
            alert(`Sucesso! ${count} registros foram normalizados.`);
            await handleRunAudit();
        } catch (e) {
            console.error(e);
        } finally {
            setAuditLoading(false);
            setAuditProgress('');
        }
    };

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-700">
            {/* Header V4 */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-5">
                    <div className="h-16 w-16 rounded-[2rem] bg-brand-rocha-primary/10 flex items-center justify-center border border-brand-rocha-primary/20">
                        <Database className="w-8 h-8 text-brand-rocha-primary" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">
                            Governança de Dados <span className="text-brand-emerald ml-2 drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">V4</span>
                        </h1>
                        <p className="text-slate-500 font-bold uppercase text-[9px] tracking-[0.25em] mt-2 opacity-80">Forensic Intelligence & Forensic Data Integrity</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <Button onClick={handleExport} variant="outline" className="h-12 border-white/5 bg-slate-900 rounded-2xl gap-3 px-6 hover:bg-white/5 group">
                        <Download className="w-4 h-4 text-brand-emerald transition-transform group-hover:-translate-y-0.5" />
                        <span className="text-[10px] font-black uppercase text-white tracking-widest">Gerar Relatório</span>
                    </Button>

                    <div className="flex bg-slate-900/50 p-1.5 rounded-2xl border border-white/5 backdrop-blur-sm">
                        <button 
                            onClick={() => setActiveTab('governance')}
                            className={cn(
                                "px-8 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                activeTab === 'governance' ? "bg-white text-slate-900 shadow-xl scale-[1.02]" : "text-slate-500 hover:text-slate-300"
                            )}
                        >Dashboard</button>
                        <button 
                            onClick={() => setActiveTab('timeline')}
                            className={cn(
                                "px-8 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                activeTab === 'timeline' ? "bg-white text-slate-900 shadow-xl scale-[1.02]" : "text-slate-500 hover:text-slate-300"
                            )}
                        >Timeline</button>
                        <button 
                            onClick={() => setActiveTab('audit')}
                            className={cn(
                                "px-8 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                activeTab === 'audit' ? "bg-white text-slate-900 shadow-xl scale-[1.02]" : "text-slate-500 hover:text-slate-300"
                            )}
                        >Auditoria</button>
                    </div>
                </div>
            </div>

            {/* KPI Cards V4 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-slate-900 border border-white/5 p-8 rounded-[2.5rem] shadow-premium relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-all">
                        <BarChart className="w-20 h-20" />
                    </div>
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-4">Integrity Score Global</p>
                    <h3 className={cn("text-6xl font-black tracking-tighter", stats.score > 90 ? "text-brand-emerald" : "text-rose-500")}>
                        {stats.score}%
                    </h3>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full mt-6 overflow-hidden">
                        <div className={cn("h-full transition-all duration-[2000ms] ease-out", stats.score > 90 ? "bg-brand-emerald" : "bg-rose-500")} style={{ width: `${stats.score}%` }} />
                    </div>
                </div>

                <div className="bg-slate-900 border border-white/5 p-8 rounded-[2.5rem] shadow-premium hover:border-rose-500/10 transition-colors">
                    <AlertTriangle className="w-8 h-8 text-rose-500 mb-6" />
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Incidentes Ativos</p>
                    <h3 className="text-6xl font-black text-rose-500 tracking-tighter">{stats.total}</h3>
                </div>

                <div className="bg-slate-900 border border-white/5 p-8 rounded-[2.5rem] shadow-premium flex flex-col justify-between">
                    <div>
                        <Fingerprint className="w-8 h-8 text-brand-emerald/70 mb-6" />
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Críticos Pendentes</p>
                        <h3 className="text-6xl font-black text-white tracking-tighter">{stats.critical}</h3>
                    </div>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-4">Ação Requerida Imediata</p>
                </div>

                <div className="bg-brand-emerald p-8 rounded-[2.5rem] shadow-premium text-emerald-950 relative overflow-hidden flex flex-col justify-between">
                    <Zap className="absolute -right-6 -bottom-6 w-36 h-36 opacity-10" />
                    <div className="relative z-10">
                        <ShieldCheck className="w-8 h-8 opacity-40 mb-6" />
                        <p className="text-emerald-900/60 text-[10px] font-black uppercase tracking-widest">Auto-Remediação V4</p>
                        <h3 className="text-4xl font-black tracking-tighter mt-4 leading-none">Proteção Ativa</h3>
                    </div>
                    <div className="bg-emerald-900/10 rounded-2xl p-4 backdrop-blur-sm border border-emerald-950/5">
                        <p className="text-[10px] font-black uppercase tracking-widest mb-1 italic">V4 Intelligence</p>
                        <p className="text-[10px] font-bold opacity-70">Sanitização automática de campos críticos ativada.</p>
                    </div>
                </div>
            </div>

            {activeTab === 'governance' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Session Intelligence (V4 Intelligence Sidebar) */}
                    <div className="md:col-span-1 space-y-6">
                        <div className="bg-slate-900 border border-white/5 p-8 rounded-[2.5rem] shadow-premium">
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-3">
                                    <Zap className="w-5 h-5 text-amber-500" />
                                    <h4 className="text-xs font-black text-white uppercase tracking-widest">Session Logic</h4>
                                </div>
                                <span className="flex h-2 w-2 rounded-full bg-brand-emerald animate-pulse" />
                            </div>
                            <div className="space-y-4">
                                {Object.entries(sessionSummary).map(([key, val]: any) => (
                                    <div key={key} className="p-5 bg-white/[0.03] rounded-3xl border border-white/5 transition-all hover:bg-white/[0.05]">
                                        <div className="flex items-center justify-between mb-3">
                                            <p className="text-[10px] font-black text-white uppercase tracking-tighter opacity-60">{key}</p>
                                            <div className={cn(
                                                "h-9 w-9 rounded-xl flex items-center justify-center font-black text-xs",
                                                val.severityLevel === 'critical' ? "bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.3)]" : 
                                                val.severityLevel === 'warning' ? "bg-amber-500 text-slate-900" : "bg-slate-800 text-slate-400"
                                            )}>
                                                {val.count}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-1 mb-4">
                                            {[...val.codes].slice(0, 3).map((c: any) => (
                                                <span key={c} className="text-[8px] font-black text-slate-500 bg-black/40 px-2 py-0.5 rounded-lg border border-white/5">{c}</span>
                                            ))}
                                        </div>
                                        <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                                            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden mr-4">
                                                <div className={cn("h-full transition-all", val.score > 80 ? "bg-brand-emerald" : "bg-rose-500")} style={{ width: `${val.score}%` }} />
                                            </div>
                                            <span className="text-[10px] font-black text-white/40">{val.score}%</span>
                                        </div>
                                    </div>
                                ))}
                                {Object.keys(sessionSummary).length === 0 && (
                                    <div className="text-center py-16 border-2 border-dashed border-white/5 rounded-3xl opacity-30">
                                        <Database className="w-8 h-8 mx-auto mb-4" />
                                        <p className="text-slate-600 font-bold text-[10px] uppercase tracking-widest">Nenhuma anomalia na sessão</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Organizational Filter Card */}
                        <div className="bg-slate-900 border border-white/5 p-8 rounded-[2.5rem] shadow-premium relative overflow-hidden group">
                             <Building2 className="absolute -right-4 -bottom-4 w-24 h-24 opacity-[0.03] group-hover:opacity-[0.05] transition-all" />
                             <div className="flex items-center gap-3 mb-6">
                                <Building2 className="w-5 h-5 text-brand-emerald" />
                                <h4 className="text-xs font-black text-white uppercase tracking-widest">Multi-Tenant Oversight</h4>
                            </div>
                            <p className="text-[10px] text-slate-500 font-bold leading-relaxed mb-6">Filtre por CompanyID para auditar empresas específicas através da estrutura de data-isolation do Marble Flow.</p>
                            <Input 
                                placeholder="Filtrar CompanyID..."
                                value={filterCompany}
                                onChange={(e) => setFilterCompany(e.target.value)}
                                className="h-12 bg-slate-950 border-white/5 rounded-2xl text-[10px] font-black text-center uppercase tracking-widest focus:ring-1 focus:ring-brand-emerald/30 group-hover:border-white/10"
                            />
                        </div>
                    </div>

                    {/* Operational Governance Table (V4 Registry) */}
                    <div className="md:col-span-3 space-y-6">
                        <div className="bg-slate-900 border border-white/5 p-3 rounded-[2rem] flex flex-wrap items-center gap-4 shadow-xl backdrop-blur-md">
                            <div className="relative flex-1">
                                <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                                <Input 
                                    placeholder="Buscar por código forense, entidade, módulo ou diagnóstico..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-14 h-14 bg-slate-950/50 border-transparent rounded-2xl font-black text-sm text-white placeholder:text-slate-700 focus:bg-slate-950 focus:ring-0"
                                />
                            </div>
                            <div className="flex items-center gap-3 pr-2">
                                <Filter className="w-4 h-4 text-slate-600 ml-2" />
                                <select 
                                    value={filterSeverity} 
                                    onChange={(e) => setFilterSeverity(e.target.value as any)}
                                    className="h-14 bg-slate-950/80 border border-white/5 rounded-2xl px-8 text-[11px] font-black uppercase tracking-widest text-slate-400 focus:outline-none appearance-none hover:text-white transition-colors"
                                >
                                    <option value="all">Filtro de Severidade</option>
                                    <option value="warning">Somente Avisos</option>
                                    <option value="critical">Somente Críticos</option>
                                </select>
                            </div>
                        </div>

                        <div className="bg-slate-900 border border-white/5 rounded-[3.5rem] overflow-hidden shadow-2xl relative">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-white/5 border-b border-white/5">
                                            <th className="px-10 py-8 text-[11px] font-black uppercase text-slate-600 tracking-[0.15em]">Sinal Forense</th>
                                            <th className="px-10 py-8 text-[11px] font-black uppercase text-slate-600 tracking-[0.15em]">Scope / Entity</th>
                                            <th className="px-10 py-8 text-[11px] font-black uppercase text-slate-600 tracking-[0.15em]">Issue Trace</th>
                                            <th className="px-10 py-8 text-[11px] font-black uppercase text-slate-600 tracking-[0.15em] text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {loading ? (
                                            <tr><td colSpan={4} className="p-32 text-center animate-pulse text-slate-500 font-bold uppercase text-[10px] tracking-widest italic">Syncing Forensic Persistence Layer...</td></tr>
                                        ) : safeArray(filteredLogs).filter(l => !l.resolved).map((log) => (
                                            <tr key={log.id} className="hover:bg-white/[0.04] transition-all group/row">
                                                <td className="px-10 py-8">
                                                    <p className="text-white font-black text-sm font-mono tracking-tighter leading-none mb-2 group-hover:text-brand-emerald transition-colors">
                                                        {formatVisualDate(log.timestamp, 'HH:mm:ss')}
                                                    </p>
                                                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest opacity-60">
                                                        {formatVisualDate(log.timestamp, 'dd MMM yyyy')}
                                                    </p>
                                                </td>
                                                <td className="px-10 py-8">
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className="text-brand-emerald font-black text-xs tracking-widest uppercase">{log.module}</span>
                                                            <span className="h-1.5 w-1.5 rounded-full bg-slate-800" />
                                                            <span className="text-white/60 text-[10px] font-black uppercase">{log.field}</span>
                                                        </div>
                                                        <span className="text-slate-500 text-[10px] font-mono opacity-80 group-hover:opacity-100 transition-all truncate max-w-[200px]">
                                                            ID: {log.entityId || 'ROOT_SCOPE'}
                                                        </span>
                                                        {log.companyId && (
                                                            <div className="mt-2 flex items-center gap-1.5">
                                                                <Building2 className="w-3 h-3 text-brand-rocha-primary" />
                                                                <span className="text-[9px] font-black text-brand-rocha-primary uppercase tracking-tighter">{log.companyId}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-10 py-8">
                                                    <div className="flex items-start gap-4">
                                                        <div className={cn(
                                                            "mt-1.5 h-3.5 w-3.5 rounded-full shrink-0 border-4 border-slate-900 ring-2 ring-offset-0",
                                                            log.severity === 'critical' ? "bg-rose-500 ring-rose-500/30" : 
                                                            log.severity === 'warning' ? "bg-amber-500 ring-amber-500/30" : "bg-blue-500 ring-blue-500/30"
                                                        )} />
                                                        <div className="max-w-[420px]">
                                                            <p className="text-white font-black text-sm uppercase tracking-tight leading-none mb-2">{log.code}</p>
                                                            <p className="text-slate-500 text-[11px] font-bold leading-relaxed mb-3">{log.message}</p>
                                                            {log.value && (
                                                                <div className="text-[9px] font-mono bg-black/50 text-brand-emerald/70 px-3 py-1.5 rounded-xl border border-white/5 inline-flex items-center gap-2">
                                                                    <Database className="w-3 h-3" />
                                                                    VAL: {JSON.stringify(log.value).substring(0, 40)}{JSON.stringify(log.value).length > 40 ? '...' : ''}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-10 py-8 text-right">
                                                    <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                                                        {getEntityLink(log) && (
                                                            <Button 
                                                                onClick={() => navigate(getEntityLink(log)!)}
                                                                className="h-12 w-12 p-0 rounded-2xl bg-white/5 hover:bg-brand-emerald text-white/40 hover:text-slate-950 transition-all border border-white/5 active:scale-90"
                                                                title="Abrir Registro Original"
                                                            >
                                                                <ExternalLink className="w-5 h-5" />
                                                            </Button>
                                                        )}
                                                        <Button 
                                                            onClick={() => handleResolve(log.id)}
                                                            className="h-12 w-12 p-0 rounded-2xl bg-white/5 hover:bg-brand-emerald text-white/40 hover:text-slate-950 transition-all border border-white/5 active:scale-90"
                                                            title="Marcar como Remediado"
                                                        >
                                                            <CheckCircle className="w-5 h-5" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {!loading && safeArray(filteredLogs).filter(l => !l.resolved).length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="p-40 text-center">
                                                    <div className="flex flex-col items-center gap-6 animate-pulse">
                                                        <div className="w-20 h-20 bg-brand-emerald/10 rounded-full flex items-center justify-center border-2 border-brand-emerald/20">
                                                            <ShieldCheck className="w-10 h-10 text-brand-emerald" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <p className="font-black text-2xl uppercase tracking-[0.4em] text-white">Full Integrity</p>
                                                            <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest">O ecossistema técnico está livre de anomalias críticas.</p>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'timeline' && (
               <div className="bg-slate-900 border border-white/5 rounded-[3.5rem] p-16 shadow-premium animate-in slide-in-from-bottom-8 duration-700 relative overflow-hidden">
                    <History className="absolute -right-16 -top-16 w-64 h-64 opacity-[0.02] pointer-events-none" />
                    
                    <div className="flex items-center gap-5 mb-16 relative z-10">
                        <div className="h-14 w-14 rounded-2xl bg-brand-emerald/10 flex items-center justify-center border border-brand-emerald/20">
                            <History className="w-7 h-7 text-brand-emerald" />
                        </div>
                        <div>
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">Timeline Forense</h2>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Audit Registry for Data Integrity Lifecycle</p>
                        </div>
                    </div>

                    <div className="space-y-10 relative before:absolute before:left-[31px] before:top-4 before:bottom-4 before:w-0.5 before:bg-gradient-to-b before:from-brand-emerald/20 before:via-slate-800 before:to-transparent">
                        {logs.slice(0, 100).map((log) => (
                            <div key={log.id} className="relative pl-20 group">
                                <div className={cn(
                                    "absolute left-[24px] top-2.5 h-4 w-4 rounded-full z-10 border-4 border-slate-900 ring-2",
                                    log.resolved ? "bg-brand-emerald ring-brand-emerald/20" : (log.severity === 'critical' ? "bg-rose-500 ring-rose-500/20" : "bg-amber-500 ring-amber-500/10")
                                )} />
                                <div className="bg-slate-950/30 border border-white/5 p-8 rounded-[2.5rem] transition-all hover:bg-slate-950/50 hover:border-white/10 group-hover:translate-x-1 duration-500 backdrop-blur-sm">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                                        <div className="flex items-center gap-3">
                                            <span className="bg-brand-emerald/10 text-brand-emerald text-[9px] font-black px-3 py-1 rounded-lg uppercase tracking-widest border border-brand-emerald/5">{log.module}</span>
                                            <span className="text-[11px] text-slate-500 font-bold font-mono">{formatVisualDate(log.timestamp, 'dd/MM/yyyy HH:mm:ss')}</span>
                                        </div>
                                        {log.resolved && (
                                            <div className="flex items-center gap-2 bg-emerald-500 text-emerald-950 px-3 py-1 rounded-xl">
                                                <CheckCircle className="w-3 h-3" />
                                                <span className="text-[9px] font-black uppercase tracking-widest">Remediado</span>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <h4 className="text-lg font-black text-white uppercase tracking-tight mb-2 group-hover:text-brand-emerald transition-colors">{log.code}</h4>
                                    <p className="text-slate-400 text-sm font-medium leading-relaxed mb-8 max-w-2xl">{log.message}</p>
                                    
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-8 border-t border-white/5">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2">Entidade</span>
                                            <span className="text-[11px] font-mono text-slate-400 truncate">{log.entityId || 'ROOT'}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2">CompanyID</span>
                                            <span className="text-[11px] font-mono text-slate-400">{log.companyId || 'GENERAL'}</span>
                                        </div>
                                        <div className="flex flex-col col-span-2">
                                            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2">Agente (UserAgent)</span>
                                            <span className="text-[10px] font-mono text-slate-500 truncate" title={log.userAgent}>{log.userAgent || 'Unknown System'}</span>
                                        </div>
                                    </div>
                                    
                                    {log.resolvedBy && (
                                        <div className="mt-6 pt-4 border-t border-dashed border-white/5 flex items-center gap-2 text-[9px] font-black text-brand-emerald uppercase italic opacity-60">
                                            <span>Fix by: {log.resolvedBy}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
               </div>
            )}

            {activeTab === 'audit' && (
                <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
                    <div className="bg-slate-900 border border-white/5 rounded-[3.5rem] p-12 shadow-premium">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
                            <div>
                                <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none mb-3">Auditoria de Dados Históricos</h2>
                                <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">Normalização e Governança Temporal Profunda</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <Button 
                                    onClick={handleRunAudit} 
                                    disabled={auditLoading}
                                    className="h-14 px-8 bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-700 disabled:opacity-50"
                                >
                                    {auditLoading ? 'Processando...' : 'Iniciar Auditoria'}
                                </Button>
                                {auditStats && (
                                    <Button 
                                        onClick={handleRunNormalization}
                                        disabled={auditLoading}
                                        className="h-14 px-8 bg-brand-emerald text-slate-950 rounded-2xl font-black uppercase tracking-widest hover:bg-brand-neon disabled:opacity-50"
                                    >
                                        Executar Normalização
                                    </Button>
                                )}
                            </div>
                        </div>

                        {auditLoading && (
                            <div className="py-20 text-center space-y-4">
                                <div className="w-12 h-12 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin mx-auto" />
                                <p className="text-brand-emerald font-black uppercase text-xs tracking-widest animate-pulse">{auditProgress || 'Analisando integridade do Firestore...'}</p>
                            </div>
                        )}

                        {!auditLoading && auditStats && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                <div className="bg-white/5 rounded-[2rem] p-8 border border-white/5">
                                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Total de Registros</p>
                                    <p className="text-5xl font-black text-white tracking-tighter">{auditStats.totalRecords}</p>
                                </div>
                                <div className="bg-white/5 rounded-[2rem] p-8 border border-white/5">
                                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Registros Afetados</p>
                                    <p className="text-5xl font-black text-rose-500 tracking-tighter">{auditStats.affectedRecords}</p>
                                </div>
                                <div className="bg-white/5 rounded-[2rem] p-8 border border-white/5">
                                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-2">Integridade Temporal</p>
                                    <p className="text-5xl font-black text-brand-emerald tracking-tighter">
                                        {Math.round(((auditStats.totalRecords - auditStats.affectedRecords) / auditStats.totalRecords) * 100)}%
                                    </p>
                                </div>

                                <div className="md:col-span-3 mt-8">
                                    <h4 className="text-sm font-black text-white uppercase tracking-widest mb-6 px-2">Detalhamento de Inconsistências</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {safeArray(auditStats.issues).map((issue, idx) => (
                                            <div key={idx} className="bg-black/20 rounded-2xl p-5 flex items-center justify-between border border-white/5">
                                                <div>
                                                    <span className="text-[9px] font-black text-brand-emerald uppercase tracking-widest block mb-1">{issue.module}</span>
                                                    <p className="text-[11px] font-black text-white uppercase tracking-tight">{issue.code.replace(/_/g, ' ')}</p>
                                                    <p className="text-[10px] text-slate-500 font-bold">Campo: {issue.field}</p>
                                                </div>
                                                <div className="text-2xl font-black text-rose-500/80 bg-rose-500/10 px-4 py-2 rounded-xl">
                                                    {issue.count}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {!auditLoading && !auditStats && (
                            <div className="py-32 text-center opacity-30">
                                <Database className="w-16 h-16 mx-auto mb-6" />
                                <p className="text-slate-500 font-black uppercase tracking-[0.3em]">Aguardando Início da Auditoria</p>
                            </div>
                        )}
                    </div>

                    <div className="bg-amber-500/10 border border-amber-500/20 p-8 rounded-[2.5rem] flex items-start gap-4">
                        <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
                        <div>
                            <p className="text-amber-500 font-black uppercase text-[10px] tracking-widest mb-2">Aviso de Governança</p>
                            <p className="text-amber-500/80 text-xs font-bold leading-relaxed">
                                A normalização automática aplica heurísticas inteligentes para preencher campos ausentes com base em lógica semântica (ex: createdAt = updatedAt). 
                                Registros sem nenhuma base temporal confiável permanecerão como null para evitar a criação de dados falsos conforme a Regra de Ouro do Marble Flow.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
