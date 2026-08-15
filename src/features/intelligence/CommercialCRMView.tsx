import { safeArray } from '../../lib/dataDiagnostics';
import React, { useState } from 'react';
import { 
    CheckCircle2, 
    Clock, 
    AlertCircle, 
    Plus, 
    Search, 
    User, 
    MessageSquare,
    X,
    ClipboardList,
    TrendingUp,
    Zap,
    Flag,
    Minus,
    Award,
    ChevronRight,
    ArrowUpRight
} from 'lucide-react';
import { useCommercialActions } from '../../hooks/useCommercialActions';
import { useCommercialPerformanceLoop } from '../../hooks/useCommercialPerformanceLoop';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { cn } from '../../lib/utils';

export const CommercialCRMView: React.FC = () => {
    const { actions, stats, isLoading, updateAction, createAction } = useCommercialActions();
    const { results, globalStats, isLoading: performanceLoading } = useCommercialPerformanceLoop();
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [showNewModal, setShowNewModal] = useState(false);
    const [viewMode, setViewMode] = useState<'tasks' | 'performance'>('tasks');

    const formatCurrency = (value: any) => {
        return Number(value || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    };

    const filteredActions = safeArray(actions).filter(a => {
        const matchesStatus = filterStatus === 'all' || a.status === filterStatus;
        const matchesSearch = a.title.toLowerCase().includes(search.toLowerCase()) || 
                             (a.influencerName || '').toLowerCase().includes(search.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    if (isLoading || performanceLoading) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-emerald" />
            </div>
        );
    }

    const StatCard = ({ title, val, icon: Icon, color }: any) => (
        <Card className="rounded-[2.5rem] bg-white dark:bg-slate-900 shadow-premium border-none relative overflow-hidden group">
            <div className={cn("absolute right-[-10px] top-[-10px] opacity-10", color)}>
                <Icon className="h-28 w-28" />
            </div>
            <CardHeader className="pb-0">
                <CardDescription className="text-slate-400 uppercase font-black text-[9px] tracking-widest">{title}</CardDescription>
            </CardHeader>
            <CardContent className="pt-2 pb-6">
                <p className="text-4xl font-black tracking-tighter text-slate-800 dark:text-white">{val}</p>
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-10 animate-in fade-in duration-700">
            {/* KPI Section */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard title="Total de Ações" val={stats.total} icon={ClipboardList} color="text-slate-400" />
                <StatCard title="Em Aberto" val={stats.open} icon={Clock} color="text-amber-500" />
                <StatCard title="Concluídas" val={stats.done} icon={CheckCircle2} color="text-emerald-500" />
                <StatCard title="Críticas / Urgentes" val={stats.critical} icon={AlertCircle} color="text-rose-500" />
            </div>

            {/* Actions Management */}
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="relative flex-1 md:min-w-[300px]">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input 
                                placeholder="Buscar ações ou influencers..." 
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-12 h-12 rounded-2xl bg-slate-100 border-none dark:bg-white/5 font-bold text-sm"
                            />
                        </div>
                        <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-2xl">
                            <button
                                onClick={() => setViewMode('tasks')}
                                className={cn(
                                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                    viewMode === 'tasks' ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-md" : "text-slate-400"
                                )}
                            >
                                Operacional
                            </button>
                            <button
                                onClick={() => setViewMode('performance')}
                                className={cn(
                                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                    viewMode === 'performance' ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-md" : "text-slate-400"
                                )}
                            >
                                Performance
                            </button>
                        </div>
                    </div>

                    <Button 
                        onClick={() => setShowNewModal(true)}
                        className="bg-brand-emerald hover:bg-emerald-600 text-white h-12 px-8 rounded-2xl font-black uppercase text-[10px] tracking-widest"
                    >
                        <Plus className="h-4 w-4 mr-2" /> Nova Ação
                    </Button>
                </div>

                {viewMode === 'tasks' ? (
                    <div className="space-y-6">
                        <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-2xl w-fit">
                            {['all', 'open', 'in_progress', 'done'].map(s => (
                                <button
                                    key={s}
                                    onClick={() => setFilterStatus(s)}
                                    className={cn(
                                        "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                        filterStatus === s ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xl" : "text-slate-400"
                                    )}
                                >
                                    {s === 'all' ? 'Tudo' : s === 'open' ? 'Aberto' : s === 'in_progress' ? 'Em Fila' : 'Feito'}
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            {safeArray(filteredActions).map(action => {
                                const result = results.find(r => r.id === action.id);
                                return (
                                    <Card key={action.id} className="rounded-[2rem] bg-white dark:bg-slate-900 shadow-premium border-none p-6 hover:shadow-2xl transition-all group overflow-hidden relative">
                                        {action.status === 'done' && (
                                            <div className={cn(
                                                "absolute right-0 top-0 bottom-0 w-2",
                                                result?.status === 'success' ? "bg-emerald-500" :
                                                result?.status === 'failure' ? "bg-rose-500" : "bg-slate-300"
                                            )} />
                                        )}
                                        <div className="flex flex-col md:flex-row md:items-center gap-6">
                                            <div className={cn(
                                                "h-14 w-14 rounded-2xl flex items-center justify-center shrink-0",
                                                action.status === 'done' ? (
                                                    result?.status === 'success' ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : 
                                                    result?.status === 'failure' ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20" :
                                                    "bg-slate-100 text-slate-400"
                                                ) : 
                                                action.priority === 'critical' ? "bg-rose-500/10 text-rose-500 animate-pulse" : "bg-slate-100 text-slate-400"
                                            )}>
                                                {action.status === 'done' && result?.status === 'success' ? <TrendingUp className="h-6 w-6" /> :
                                                 action.type === 'reativacao' ? <Zap className="h-6 w-6" /> : 
                                                 action.type === 'followup' ? <TrendingUp className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3">
                                                    <Badge className={cn(
                                                        "border-none px-2 py-0.5 text-[8px] font-black uppercase",
                                                        action.priority === 'critical' ? "bg-rose-500/10 text-rose-600" :
                                                        action.priority === 'high' ? "bg-amber-500/10 text-amber-600" : "bg-slate-100 text-slate-400"
                                                    )}>
                                                        <Flag className="h-2 w-2 mr-1 inline-block" /> {action.priority}
                                                    </Badge>
                                                    <Badge className="bg-slate-50 dark:bg-white/5 text-slate-400 text-[8px] font-black uppercase border-none">{action.sourceType}</Badge>
                                                    {action.status === 'done' && result && (
                                                        <Badge className={cn(
                                                            "border-none px-2 py-0.5 text-[8px] font-black uppercase whitespace-nowrap",
                                                            result.status === 'success' ? "bg-emerald-500 text-white" :
                                                            result.status === 'failure' ? "bg-rose-500 text-white" : "bg-slate-100 dark:bg-white/10 text-slate-400"
                                                        )}>
                                                            {result.status === 'success' ? 'Sucesso' : result.status === 'failure' ? 'Sem Impacto' : 'Neutro'}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <h4 className="text-sm font-black text-slate-700 dark:text-white mt-1 uppercase tracking-tight">{action.title}</h4>
                                                <p className="text-xs text-slate-400 font-bold flex items-center gap-2 mt-1">
                                                    <User className="h-3 w-3" /> {action.influencerName || 'S/ Influencer'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                {action.status !== 'done' && action.status !== 'canceled' && (
                                                    <>
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            onClick={() => updateAction(action.id, { status: 'in_progress' })}
                                                            className={cn(
                                                                "border-none h-10 px-6 rounded-xl font-black text-[9px] uppercase tracking-widest",
                                                                action.status === 'in_progress' ? "bg-brand-emerald text-white" : "bg-slate-100 text-slate-500"
                                                            )}
                                                        >
                                                            {action.status === 'in_progress' ? 'Trabalhando' : 'Iniciar'}
                                                        </Button>
                                                        <Button 
                                                            onClick={() => updateAction(action.id, { status: 'done' })}
                                                            className="bg-emerald-500 hover:bg-emerald-600 text-white h-10 w-10 p-0 rounded-xl"
                                                        >
                                                            <CheckCircle2 className="h-5 w-5" />
                                                        </Button>
                                                    </>
                                                )}
                                                {action.status === 'done' && result && (
                                                    <div className="text-right">
                                                        <p className={cn(
                                                            "text-[10px] font-black uppercase tracking-tighter",
                                                            result.deltaPercent > 0 ? "text-emerald-500" : result.deltaPercent < 0 ? "text-rose-500" : "text-slate-400"
                                                        )}>
                                                            {result.deltaPercent > 0 ? '+' : ''}{result.deltaPercent.toFixed(1)}% Impacto
                                                        </p>
                                                        <div className="flex items-center gap-2 text-slate-400 font-black text-[8px] uppercase tracking-widest mt-1">
                                                            <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Finalizada
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-10 animate-in fade-in duration-700">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Card className="rounded-[2.5rem] bg-slate-900 text-white border-none p-10 shadow-2xl relative overflow-hidden group min-h-[200px] flex flex-col justify-center">
                                <TrendingUp className="absolute right-[-20px] top-[-20px] h-40 w-40 opacity-10" />
                                <CardDescription className="text-emerald-400 font-black text-[10px] uppercase tracking-widest">Taxa de Sucesso (Loop)</CardDescription>
                                <p className="text-6xl font-black tracking-tighter mt-4">{globalStats.successRate.toFixed(1)}%</p>
                                <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">Baseado em {globalStats.total} ações concluídas</p>
                            </Card>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="bg-emerald-500/10 p-6 rounded-[2rem] flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black text-emerald-600 uppercase">Sucessos</p>
                                        <p className="text-2xl font-black text-emerald-600">{globalStats.successes}</p>
                                    </div>
                                    <div className="h-10 w-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                        <CheckCircle2 className="h-6 w-6" />
                                    </div>
                                </div>
                                <div className="bg-slate-100 dark:bg-white/5 p-6 rounded-[2rem] flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase">Neutros</p>
                                        <p className="text-2xl font-black text-slate-400">{globalStats.neutrals}</p>
                                    </div>
                                    <div className="h-10 w-10 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-400 flex items-center justify-center">
                                        <Minus className="h-6 w-6" />
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="bg-rose-500/10 p-6 rounded-[2rem] flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black text-rose-600 uppercase">Falhas / Sem Impacto</p>
                                        <p className="text-2xl font-black text-rose-600">{globalStats.failures}</p>
                                    </div>
                                    <div className="h-10 w-10 rounded-xl bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/20">
                                        <X className="h-6 w-6" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Top Highlights */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <Card className="rounded-[2.5rem] bg-white dark:bg-slate-900 border-none shadow-premium p-8 overflow-hidden relative">
                                <div className="absolute right-0 top-0 p-8 opacity-5">
                                    <TrendingUp className="h-24 w-24" />
                                </div>
                                <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2 mb-6">
                                    <Zap className="h-4 w-4 text-brand-emerald" /> Parceiros Mais Recuperados
                                </h3>
                                <div className="space-y-4">
                                    {safeArray(globalStats.topRecovered).map((inf: any) => (
                                        <div key={inf.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-white/2 border border-slate-100 dark:border-white/5">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-xl bg-brand-emerald text-white flex items-center justify-center font-black text-[10px]">
                                                    {inf.influencerName?.substring(0,2).toUpperCase() || '??'}
                                                </div>
                                                <span className="text-[11px] font-black uppercase text-slate-700 dark:text-white truncate max-w-[150px]">{inf.influencerName}</span>
                                            </div>
                                            <Badge className="bg-emerald-500/10 text-emerald-500 border-none text-[10px] font-black">
                                                + {formatCurrency(inf.deltaRev)}
                                            </Badge>
                                        </div>
                                    ))}
                                    {globalStats.topRecovered.length === 0 && (
                                        <p className="text-[10px] font-bold text-slate-300 text-center py-4">Aguardando mais dados de fechamento para ranquear.</p>
                                    )}
                                </div>
                            </Card>

                            <Card className="rounded-[2.5rem] bg-amber-500 text-white border-none p-10 shadow-premium relative overflow-hidden flex flex-col justify-center">
                                <Award className="absolute right-[-20px] top-[-20px] h-40 w-40 opacity-10" />
                                <CardDescription className="text-amber-100 font-black text-[9px] uppercase tracking-widest">Ação Operacional em Destaque</CardDescription>
                                {globalStats.successes > 0 ? (
                                    <>
                                        <p className="text-3xl font-black tracking-tighter mt-4 uppercase">Recuperação de Inativos</p>
                                        <p className="text-[10px] font-bold text-amber-100 mt-2 uppercase tracking-widest">Atualmente a ação com maior probabilidade de retorno comercial</p>
                                    </>
                                ) : (
                                    <p className="text-sm font-bold mt-4 uppercase text-amber-100">Coletando amostra significativa...</p>
                                )}
                            </Card>
                        </div>

                        <Card className="rounded-[2.5rem] bg-white dark:bg-slate-900 border-none shadow-premium overflow-hidden">
                            <CardHeader className="bg-slate-50 dark:bg-white/2 border-b border-slate-100 dark:border-white/5">
                                <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white">Relatório de Impacto Detalhado</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0 overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-slate-50/50 dark:bg-white/2">
                                        <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-white/10">
                                            <th className="px-8 py-5 text-left">Ação</th>
                                            <th className="px-6 py-5 text-center">Antes (14d)</th>
                                            <th className="px-6 py-5 text-center">Depois (14d)</th>
                                            <th className="px-8 py-5 text-right">Resultado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                                        {safeArray(results).map(r => (
                                            <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-white/2 transition-all">
                                                <td className="px-8 py-5">
                                                    <p className="text-[11px] font-black text-slate-800 dark:text-white uppercase truncate max-w-[200px]">{r.actionTitle}</p>
                                                    <Badge className={cn(
                                                        "border-none px-2 py-0.5 text-[8px] font-black uppercase mt-1",
                                                        r.status === 'success' ? "bg-emerald-500/10 text-emerald-600" :
                                                        r.status === 'failure' ? "bg-rose-500/10 text-rose-600" : "bg-slate-100 text-slate-400"
                                                    )}>{r.status}</Badge>
                                                </td>
                                                <td className="px-6 py-5 text-center">
                                                    <p className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{formatCurrency(r.revenueBefore)}</p>
                                                    <p className="text-[8px] font-bold text-slate-300">{r.salesBefore} vendas</p>
                                                </td>
                                                <td className="px-6 py-5 text-center">
                                                    <p className="text-[10px] font-black text-slate-700 dark:text-slate-300 whitespace-nowrap">{formatCurrency(r.revenueAfter)}</p>
                                                    <p className="text-[8px] font-bold text-slate-500">{r.salesAfter} vendas</p>
                                                </td>
                                                <td className="px-8 py-5 text-right">
                                                    <span className={cn(
                                                        "text-[12px] font-black whitespace-nowrap",
                                                        r.deltaPercent > 0 ? "text-emerald-500" : r.deltaPercent < 0 ? "text-rose-500" : "text-slate-400"
                                                    )}>
                                                        {r.deltaPercent > 0 ? '↑' : r.deltaPercent < 0 ? '↓' : '→'} {Math.abs(r.deltaPercent).toFixed(1)}%
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>

            {showNewModal && (
                <NewActionModal 
                    onClose={() => setShowNewModal(false)} 
                    onCreate={async (data) => {
                        await createAction(data);
                        setShowNewModal(false);
                    }}
                />
            )}
        </div>
    );
};

const NewActionModal: React.FC<{ onClose: () => void, onCreate: (data: any) => Promise<void> }> = ({ onClose, onCreate }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        influencerName: '',
        priority: 'medium' as any,
        type: 'reativacao' as any,
        sourceType: 'manual' as any
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onCreate(formData);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" onClick={onClose} />
            <Card className="relative w-full max-w-lg rounded-[2.5rem] bg-white dark:bg-slate-900 shadow-premium border-none overflow-hidden animate-in zoom-in-95 duration-200 mt-[-100px]">
                <CardHeader className="bg-slate-50 dark:bg-white/2 p-8 border-b border-slate-100 dark:border-white/5">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Gerar Ação Comercial</CardTitle>
                            <CardDescription className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Transformar oportunidade em tarefa operacional</CardDescription>
                        </div>
                        <button onClick={onClose} className="text-slate-300 hover:text-slate-600 transition-colors"><X className="h-6 w-6" /></button>
                    </div>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="p-8 space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Título da Ação</label>
                            <Input 
                                required 
                                value={formData.title} 
                                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                placeholder="Ex: Reativar Parceiro ABC" 
                                className="h-12 rounded-2xl bg-slate-50 border-none dark:bg-white/5 font-bold"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Tipo</label>
                                <select 
                                    value={formData.type}
                                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as any }))}
                                    className="w-full h-12 rounded-2xl bg-slate-50 border-none dark:bg-white/5 font-bold text-sm px-4 outline-none"
                                >
                                    <option value="reativacao">Reativação</option>
                                    <option value="followup">Follow-up</option>
                                    <option value="oportunidade">Oportunidade</option>
                                    <option value="observacao">Observação</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Prioridade</label>
                                <select 
                                    value={formData.priority}
                                    onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as any }))}
                                    className="w-full h-12 rounded-2xl bg-slate-50 border-none dark:bg-white/5 font-bold text-sm px-4 outline-none"
                                >
                                    <option value="low">Baixa</option>
                                    <option value="medium">Média</option>
                                    <option value="high">Alta</option>
                                    <option value="critical">Crítica</option>
                                </select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Nome do Influencer (Opcional)</label>
                            <Input 
                                value={formData.influencerName} 
                                onChange={(e) => setFormData(prev => ({ ...prev, influencerName: e.target.value }))}
                                placeholder="..." 
                                className="h-12 rounded-2xl bg-slate-50 border-none dark:bg-white/5 font-bold"
                            />
                        </div>
                    </CardContent>
                    <div className="p-8 pt-0 flex gap-4">
                        <Button variant="ghost" onClick={onClose} type="button" className="flex-1 h-12 rounded-2xl font-black uppercase text-[10px] tracking-widest">Cancelar</Button>
                        <Button disabled={loading} type="submit" className="flex-1 bg-brand-emerald hover:bg-emerald-600 text-white h-12 rounded-2xl font-black uppercase text-[10px] tracking-widest">
                            {loading ? 'Salvando...' : 'Criar Ação CRM'}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
};
