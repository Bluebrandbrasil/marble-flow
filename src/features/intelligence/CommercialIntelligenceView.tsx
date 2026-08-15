import React, { useState } from 'react';
import { 
    TrendingUp, 
    MapPin, 
    Zap, 
    Target, 
    Users, 
    ArrowUpRight,
    Activity,
    Trophy,
    Lightbulb,
    ShieldAlert,
    AlertCircle,
    AlertTriangle,
    BarChart3,
    Award,
    Timer,
    Flame,
    History,
    ShieldX
} from 'lucide-react';
import { useCommercialIntelligence } from '../../hooks/useCommercialIntelligence';
import { CommercialHistoryView } from './CommercialHistoryView';
import { CommercialCRMView } from './CommercialCRMView';
import { CommercialForecastView } from './CommercialForecastView';
import { CommercialRegionsView } from './CommercialRegionsView';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/utils';
import { safeString, safeArray } from '../../lib/dataDiagnostics';
import { 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer, 
    Cell, 
    PieChart as RePieChart, 
    Pie 
} from 'recharts';

const COLORS = ['#8B5CF6', '#10b981', '#6366f1', '#f59e0b', '#ef4444', '#ec4899', '#3b82f6'];

export const CommercialIntelligenceView: React.FC = () => {
    const [periodDays, setPeriodDays] = useState(30);
    const [activeView, setActiveView] = useState<'dashboard' | 'history' | 'crm' | 'projections' | 'exclusions' | 'performance' | 'regions'>('dashboard');
    const { intelligence, isLoading } = useCommercialIntelligence(periodDays);
    const { byRegion, byOrigin, byInfluencer, kpis, insights, exclusions, followUpRanking, recoveryGlobal } = intelligence;

    const formatCurrency = (value: any) => {
        return Number(value || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-rocha-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-10 pb-20 animate-in fade-in-50 duration-500">
            {/* Header / Period Selection */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="rocha-text-value flex items-center gap-3">
                        Inteligência Comercial <Activity className="h-8 w-8 text-brand-rocha-primary" />
                    </h2>
                    <p className="rocha-text-label mt-1">Cruzamento de Dados Estratégicos I Região I Origem I Performance</p>
                </div>
                
                <div className="flex bg-white p-1.5 rounded-2xl group border border-brand-rocha-border shadow-sm transition-all overflow-x-auto max-w-full">
                    {safeArray([
                        { label: '7 D', val: 7 },
                        { label: '30 D', val: 30 },
                        { label: '90 D', val: 90 },
                        { label: 'GERAL', val: 0 }
                    ]).map(p => (
                        <button
                            key={p.val}
                            onClick={() => setPeriodDays(p.val)}
                            className={cn(
                                "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                                periodDays === p.val 
                                    ? "bg-brand-rocha-primary text-white shadow-lg" 
                                    : "text-slate-400 hover:text-slate-600"
                            )}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                <div className="flex bg-white p-1 rounded-2xl ml-4 border border-brand-rocha-border shadow-sm overflow-x-auto max-w-full">
                    {(['dashboard', 'history', 'performance', 'regions', 'crm', 'projections', 'exclusions'] as const).map(view => (
                        <button
                            key={view}
                            onClick={() => setActiveView(view)}
                            className={cn(
                                "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                                activeView === view ? "bg-brand-rocha-primary text-white shadow-md" : "text-slate-400 hover:text-slate-600"
                            )}
                        >
                            {view === 'dashboard' ? 'Dashboard' : 
                             view === 'history' ? 'Evolução' : 
                             view === 'performance' ? 'Vendedores' :
                             view === 'regions' ? 'Regiões' :
                             view === 'crm' ? 'Ações' : 
                             view === 'projections' ? 'Projeções' : 'Exclusões'}
                        </button>
                    ))}
                </div>
            </div>

            {activeView === 'projections' ? (
                <CommercialForecastView periodDays={periodDays} />
            ) : activeView === 'regions' ? (
                <CommercialRegionsView byRegion={byRegion} pendingRegionQuotes={intelligence.pendingRegionQuotes} />
            ) : activeView === 'crm' ? (
                <CommercialCRMView />
            ) : activeView === 'history' ? (
                <CommercialHistoryView periodDays={periodDays} />
            ) : activeView === 'performance' ? (
                <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <Card className="rounded-[2.5rem] bg-emerald-600 text-white p-10 shadow-2xl relative overflow-hidden flex flex-col justify-center min-h-[180px]">
                            <TrendingUp className="absolute right-[-20px] top-[-20px] h-40 w-40 opacity-10" />
                            <CardDescription className="text-emerald-100 font-black text-[10px] uppercase tracking-widest">Recuperação via Follow-up</CardDescription>
                            <p className="text-5xl font-black tracking-tighter mt-4">{formatCurrency(recoveryGlobal.recoveredVolume)}</p>
                            <div className="mt-4 flex items-center gap-4">
                                <div>
                                    <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest">Conversão: {recoveryGlobal.rate.toFixed(1)}%</p>
                                </div>
                                <div className="h-8 w-px bg-white/20" />
                                <div>
                                    <p className="text-[10px] font-black text-white uppercase tracking-widest">Em Caixa Real</p>
                                    <p className="text-xl font-black">{formatCurrency(recoveryGlobal.realReceivedVolume)}</p>
                                </div>
                            </div>
                        </Card>
                        
                        <Card className="rounded-[2.5rem] bg-slate-900 text-white p-8 shadow-2xl flex flex-col justify-center">
                            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6 flex items-center gap-2">
                                <ShieldAlert className="w-4 h-4 text-rose-500" /> Alerta de Negligência Comercial
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                                    <p className="text-[10px] font-black text-slate-500 uppercase">Perda Iminente ({'>'}R$ 5k)</p>
                                    <p className="text-3xl font-black text-rose-500 mt-1">
                                        {safeArray(followUpRanking).reduce((acc, r) => acc + r.neglectedHighValue, 0)}
                                    </p>
                                </div>
                                <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                                    <p className="text-[10px] font-black text-slate-500 uppercase">Leads s/ Ação (2d+)</p>
                                    <p className="text-3xl font-black text-amber-500 mt-1">
                                        {safeArray(followUpRanking).reduce((acc, r) => acc + r.leadsWithoutAction, 0)}
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <Card className="rocha-panel p-0 border-none overflow-hidden pb-4">
                        <div className="p-8 border-b border-brand-rocha-border/30 flex justify-between items-center">
                            <h3 className="rocha-text-title text-[11px] uppercase tracking-widest flex items-center gap-3 font-black">
                                <Trophy className="h-5 w-5 text-amber-500" /> Ranking de Performance: Vendedores
                            </h3>
                            <Badge className="bg-slate-100 text-slate-500 border-none font-black text-[9px] px-3">Tempo Real</Badge>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50/50">
                                    <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-brand-rocha-border/50">
                                        <th className="px-8 py-5 text-left">Vendedor</th>
                                        <th className="px-6 py-5 text-center">Follow-ups</th>
                                        <th className="px-6 py-5 text-center">Média Resposta</th>
                                        <th className="px-6 py-5 text-center">Recuperação</th>
                                        <th className="px-6 py-5 text-center px-10">Negligência</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-brand-rocha-border/30">
                                    {safeArray(followUpRanking).map((p, idx) => (
                                        <tr key={p.sellerName} className="hover:bg-slate-50 transition-all">
                                            <td className="px-8 py-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-10 w-10 rounded-2xl bg-brand-rocha-primary/10 flex items-center justify-center font-black text-brand-rocha-primary text-xs">
                                                        {p.sellerName.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{p.sellerName}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-sm font-black text-slate-800">{p.followUpCount}</span>
                                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Executados</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-center">
                                                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100">
                                                    <Timer className="h-3 w-3 text-slate-500" />
                                                    <span className="text-[10px] font-black text-slate-600">{p.avgResponseTime.toFixed(1)}h</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-center">
                                                <Badge className={cn(
                                                    "border-none px-3 py-1 text-[10px] font-black",
                                                    p.recoveryRate > 15 ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"
                                                )}>{p.recoveryRate.toFixed(1)}%</Badge>
                                            </td>
                                            <td className="px-6 py-5 text-center">
                                                <div className="flex items-center justify-center gap-4">
                                                    <div className="flex flex-col items-center">
                                                        <span className={cn(
                                                            "text-[10px] font-black",
                                                            p.neglectedHighValue > 0 ? "text-rose-500" : "text-slate-300"
                                                        )}>{p.neglectedHighValue}</span>
                                                        <span className="text-[7px] font-black uppercase text-slate-400">Alto Valor</span>
                                                    </div>
                                                    <div className="flex flex-col items-center">
                                                        <span className={cn(
                                                            "text-[10px] font-black",
                                                            p.leadsWithoutAction > 0 ? "text-amber-500" : "text-slate-300"
                                                        )}>{p.leadsWithoutAction}</span>
                                                        <span className="text-[7px] font-black uppercase text-slate-400">s/ Ação</span>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            ) : activeView === 'exclusions' ? (
                <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="rocha-card border-none bg-rose-500 text-white p-8">
                            <CardDescription className="text-rose-100 uppercase font-black text-[9px] tracking-widest">TOTAL EXCLUÍDOS</CardDescription>
                            <p className="text-4xl font-black mt-2">{exclusions.total}</p>
                            <p className="text-[10px] font-bold text-rose-100 mt-2 uppercase tracking-widest">No período selecionado</p>
                        </Card>
                        <Card className="rocha-card border-none bg-slate-900 text-white p-8">
                            <CardDescription className="text-slate-400 uppercase font-black text-[9px] tracking-widest">TAXA DE EXCLUSÃO (CHURN)</CardDescription>
                            <p className="text-4xl font-black mt-2">{exclusions.rate.toFixed(1)}%</p>
                            <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">Sobre o volume total gerado</p>
                        </Card>
                        <Card className="rocha-card border-none bg-brand-rocha-primary text-white p-8">
                            <CardDescription className="text-brand-rocha-primary-foreground/70 uppercase font-black text-[9px] tracking-widest">VALOR EM POTENCIAL RECUPERÁVEL</CardDescription>
                            <p className="text-2xl font-black mt-2">
                                {formatCurrency(exclusions.churnVolume)}
                            </p>
                            <p className="text-[10px] font-bold text-brand-rocha-primary-foreground/70 mt-2 uppercase tracking-widest">Perda de oportunidade ({exclusions.bottleneckIndex.toFixed(1)}x over revenue)</p>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <Card className="rocha-card border-none shadow-sm h-[400px]">
                            <CardHeader className="p-0 mb-6">
                                <CardTitle className="text-xs font-black uppercase text-slate-500 tracking-widest">Ranking por Motivo de Exclusão</CardTitle>
                            </CardHeader>
                            <ResponsiveContainer width="100%" height="80%">
                                <BarChart data={safeArray(exclusions.byReason).filter(r => r.count > 0).sort((a,b) => b.count - a.count)}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                                    <Tooltip 
                                        cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 900 }}
                                    />
                                    <Bar dataKey="count" fill="#f43f5e" radius={[8, 8, 0, 0]} barSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>

                        <Card className="rocha-card border-none shadow-sm">
                            <CardHeader className="p-0 mb-6">
                                <CardTitle className="text-xs font-black uppercase text-slate-500 tracking-widest">Exclusões por Vendedor</CardTitle>
                            </CardHeader>
                            <div className="space-y-4">
                                {safeArray(exclusions.bySeller).sort((a,b) => b.count - a.count).map((seller, idx) => (
                                    <div key={idx} className="flex justify-between items-center p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-xl bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 uppercase">
                                                {seller.sellerName.substring(0, 2)}
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-slate-800 uppercase">{seller.sellerName}</p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vol: {formatCurrency(seller.amount)}</p>
                                            </div>
                                        </div>
                                        <Badge className="bg-rose-50 text-rose-600 border-none font-black text-[10px] px-3">{seller.count} exclusões</Badge>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>

                    {exclusions.anomalies.length > 0 && (
                        <div className="bg-rose-50 border border-rose-100 p-6 rounded-[2.5rem] space-y-4">
                            <h4 className="text-xs font-black text-rose-600 uppercase tracking-widest flex items-center gap-2">
                                <ShieldAlert className="w-4 h-4" /> Alertas de Comportamento Atípico
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {safeArray(exclusions.anomalies).map((a, i) => (
                                    <div key={i} className="flex items-start gap-3 bg-white p-4 rounded-2xl shadow-sm border border-rose-100/50 transition-all hover:scale-[1.01]">
                                        <div className="w-8 h-8 bg-rose-500 text-white rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-rose-500/20">
                                            <AlertCircle className="w-4 h-4" />
                                        </div>
                                        <p className="text-xs text-rose-900 font-bold leading-relaxed">{a}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <>
                {/* KPI Section */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="rocha-card border-none bg-emerald-500 text-white overflow-hidden relative p-8 shadow-lg shadow-emerald-500/20">
                    <div className="absolute right-[-20px] top-[-20px] opacity-10">
                        <TrendingUp className="h-32 w-32" />
                    </div>
                    <CardHeader className="pb-0 p-0">
                        <CardDescription className="text-emerald-100 uppercase font-black text-[9px] tracking-widest">VENDAS (CONTRATOS)</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2 p-0">
                        <p className="rocha-text-value text-4xl text-white">{kpis.totalSales}</p>
                        <div className="flex items-center gap-1 mt-2 text-[10px] font-bold text-emerald-100">
                             Assinaturas no Período
                        </div>
                    </CardContent>
                </Card>

                <Card className="rocha-card rocha-card-hover border-none relative overflow-hidden group p-8">
                    <div className="absolute right-[-10px] top-[-10px] opacity-5 group-hover:scale-110 transition-all duration-700">
                        <Target className="h-28 w-28 text-brand-rocha-primary" />
                    </div>
                    <CardHeader className="p-0 pb-0">
                        <CardDescription className="rocha-text-label text-[9px] uppercase font-black tracking-widest">RECUPERAÇÃO (R$)</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2 p-0">
                        <p className="rocha-text-value text-3xl">{formatCurrency(recoveryGlobal.recoveredVolume)}</p>
                        <div className="flex items-center gap-2 mt-2">
                            <Badge className="bg-emerald-50 text-emerald-600 border-none px-2 py-0.5 text-[8px] font-black uppercase">Via Follow-up</Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card className="rocha-card rocha-card-hover border-none relative overflow-hidden group p-8">
                    <div className="absolute right-[-10px] top-[-10px] opacity-5 group-hover:scale-110 transition-all duration-700 text-brand-rocha-primary">
                        <Flame className="h-28 w-28" />
                    </div>
                    <CardHeader className="p-0 pb-0">
                        <CardDescription className="rocha-text-label text-[9px] uppercase font-black tracking-widest">TAXA DE RESGATE</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2 p-0">
                        <p className="rocha-text-value text-3xl">{recoveryGlobal.rate.toFixed(1)}%</p>
                        <div className="flex items-center gap-2 mt-2">
                            <Badge className="bg-brand-rocha-primary/10 text-brand-rocha-primary border-none px-2 py-0.5 text-[8px] font-black uppercase tracking-widest">Resiliência Comercial</Badge>
                        </div>
                    </CardContent>
                </Card>

                <Card className="rocha-card rocha-card-hover border-none relative overflow-hidden group p-8">
                    <div className="absolute right-[-10px] top-[-10px] opacity-5 group-hover:scale-110 transition-all duration-700 text-brand-rocha-primary">
                        <History className="h-28 w-28" />
                    </div>
                    <CardHeader className="p-0 pb-0">
                        <CardDescription className="rocha-text-label text-[9px] uppercase font-black tracking-widest">FOLLOW-UPS TOTAIS</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2 p-0">
                        <p className="rocha-text-value text-3xl">{safeArray(followUpRanking).reduce((acc, r) => acc + r.followUpCount, 0)}</p>
                        <div className="flex items-center gap-2 mt-2 text-[10px] font-black text-rose-600 uppercase tracking-widest">
                            <ShieldX className="h-3.5 w-3.5" /> {safeArray(followUpRanking).reduce((acc, r) => acc + r.neglectedHighValue, 0)} Críticos
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Insights Board */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <h3 className="rocha-text-title uppercase tracking-[0.25em] flex items-center gap-3">
                        <Lightbulb className="h-5 w-5 text-amber-500 fill-amber-500" /> Insights de Gestão (Automáticos)
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                        {safeArray(insights).length > 0 ? safeArray(insights).map((insight, idx) => (
                            <div 
                                key={idx} 
                                className={cn(
                                    "p-5 rounded-3xl border transition-all flex items-start gap-4 animate-in slide-in-from-left-4 duration-500",
                                    insight.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-900" :
                                    insight.type === 'warning' ? "bg-amber-50 border-amber-100 text-amber-900" :
                                    "bg-white border-brand-rocha-border text-slate-800"
                                )}
                                style={{ animationDelay: `${idx * 100}ms` }}
                            >
                                <div className={cn(
                                    "h-10 w-10 shrink-0 rounded-2xl flex items-center justify-center",
                                    insight.type === 'success' ? "bg-emerald-500 text-white" :
                                    insight.type === 'warning' ? "bg-amber-500 text-white" : "bg-brand-rocha-primary text-white"
                                )}>
                                    <Zap className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-black leading-tight uppercase tracking-tight">{insight.message}</p>
                                    <span className="text-[9px] font-bold uppercase opacity-50 tracking-widest">Severidade: {insight.severity}</span>
                                </div>
                            </div>
                        )) : (
                            <div className="rocha-card p-12 text-center border-dashed border-2">
                                <p className="rocha-text-label">Processando dados brutos para gerar recomendações...</p>
                            </div>
                        )}
                    </div>
                </div>

                <Card className="rocha-card border-none overflow-hidden">
                    <CardHeader className="p-0 mb-6">
                        <CardTitle className="rocha-text-label text-[10px]">Ranking por Região (Volume Total)</CardTitle>
                    </CardHeader>
                    <CardContent className="h-64 p-0 min-w-0 overflow-hidden">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={safeArray(byRegion).filter(r => r.region !== 'Região não informada').slice(0, 5)} layout="vertical" margin={{ left: 20, right: 30, top: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#374151" />
                                <XAxis type="number" hide />
                                <YAxis 
                                    dataKey="region" 
                                    type="category" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                                    width={100}
                                />
                                <Tooltip 
                                    cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                    contentStyle={{ background: '#FFFFFF', color: '#1e293b', borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 700 }}
                                />
                                <Bar dataKey="closedAmount" radius={[0, 8, 8, 0]} barSize={24}>
                                    {safeArray(byRegion).filter(r => r.region !== 'Região não informada').slice(0, 5).map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
            </>
        )}
    </div>
);
};
