import { safeArray } from '../../lib/dataDiagnostics';
import React, { useState } from 'react';
import { 
    Users, 
    ShoppingBag, 
    DollarSign, 
    Target,
    MapPin,
    PieChart as PieChartIcon,
    Layers,
    UserCheck,
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    Search,
    Zap,
    AlertCircle,
    Lightbulb,
    TrendingUp,
    ShieldAlert,
    Clock,
    Flame,
    Navigation2,
    Sparkles
} from 'lucide-react';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import { useExecutiveDashboard } from '../../hooks/useExecutiveDashboard';
import { useExecutiveInsights } from '../../hooks/useExecutiveInsights';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { cn, safeString } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';

const COLORS = ['#8B5CF6', '#10B981', '#6366F1', '#F59E0B', '#EF4444', '#EC4899'];

export const ExecutiveDashboardView: React.FC = () => {
    const [period, setPeriod] = useState(30);
    const navigate = useNavigate();
    const dashboardData = useExecutiveDashboard(period);
    const { 
        summary, 
        revenueHistory, 
        pipelineData, 
        actionItems, 
        geoData, 
        originData, 
        stoneData, 
        influencerData, 
        learningMetrics, 
        strategicInsights, 
        potentialRanking,
        isLoading 
    } = dashboardData;
    const { insights } = useExecutiveInsights(dashboardData);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px] bg-brand-rocha-bg">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-rocha-primary" />
            </div>
        );
    }

    const formatCurrency = (val: number) => 
        val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white border border-brand-rocha-border p-4 rounded-xl shadow-2xl">
                    <p className="rocha-text-label mb-1 normal-case">{label}</p>
                    <p className="rocha-text-value text-lg lg:text-xl text-brand-rocha-primary">{formatCurrency(payload[0].value as number)}</p>
                </div>
            );
        }
        return null;
    };

    const KPICard = ({ title, value, delta, icon: Icon, prefix = 'R$', subtitle }: any) => (
        <Card className="rocha-card rocha-card-hover group border-none relative overflow-hidden">
            <div className="absolute right-[-10px] top-[-10px] opacity-5 text-brand-rocha-primary group-hover:scale-110 transition-transform duration-500">
                <Icon className="h-24 w-24" />
            </div>
            <p className="rocha-text-label">{title}</p>
            <div className="flex items-baseline gap-2 mt-2">
                <p className="rocha-text-value text-xl lg:text-2xl">
                    {prefix === 'R$' ? formatCurrency(value) : value.toLocaleString()}
                    {prefix === '%' && '%'}
                </p>
                {delta !== undefined && (
                    <div className={cn(
                        "flex items-center text-[10px] font-black px-2 py-0.5 rounded-lg",
                        delta >= 0 ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50"
                    )}>
                        {delta >= 0 ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                        {Math.abs(delta).toFixed(1)}%
                    </div>
                )}
            </div>
            {subtitle && <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-widest">{subtitle}</p>}
        </Card>
    );

    return (
        <div className="min-h-screen bg-brand-rocha-bg p-6 lg:p-8 space-y-8 text-slate-800">
            {/* Header / Control Bar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="rocha-text-value text-2xl">Centro de Inteligência Executiva</h1>
                    <p className="rocha-text-label mt-1 flex items-center gap-2 italic">
                        <ShieldAlert className="h-3 w-3 text-amber-500" /> Monitoramento em tempo real de margem e conversão
                    </p>
                </div>
                <div className="flex bg-white p-1 rounded-2xl border border-brand-rocha-border shadow-sm">
                    {[7, 30, 90].map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={cn(
                                "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                period === p ? "bg-brand-rocha-primary text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
                            )}
                        >
                            {p} DIAS
                        </button>
                    ))}
                </div>
            </div>

            {/* Strategic KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <KPICard 
                    title="Receita Realizada" 
                    value={summary.totalRevenue} 
                    delta={summary.deltas.revenue} 
                    icon={DollarSign} 
                    subtitle="Pedidos em contrato"
                />
                <KPICard 
                    title="Receita Projetada" 
                    value={summary.projectedRevenue} 
                    icon={TrendingUp} 
                    subtitle="Orçamentos Aprovados"
                />
                <KPICard 
                    title="Ticket Médio" 
                    value={summary.avgTicket} 
                    delta={summary.deltas.avgTicket} 
                    icon={Target} 
                    subtitle="Valor médio/pedido"
                />
                <KPICard 
                    title="Conversão" 
                    value={summary.conversionRate} 
                    delta={summary.deltas.conversion} 
                    icon={Users} 
                    prefix="%" 
                    subtitle="Leads para Vendas"
                />
                <KPICard 
                    title="Receita em Risco" 
                    value={summary.revenueAtRisk} 
                    icon={ShieldAlert} 
                    subtitle="Atrasos no Follow-up"
                    className="border-rose-100 bg-rose-50/30"
                />
            </div>

            {/* Main Dashboard Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* Right Panel: Action Prioritization & Insights */}
                <div className="lg:col-span-4 space-y-6 order-2 lg:order-1">
                    
                    {/* Commercial Learning System */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                <Zap className="h-4 w-4 text-brand-emerald" /> Commercial Learning
                            </h3>
                            <Badge className="bg-emerald-500 text-white border-none text-[8px] font-black">ACTIVE OPTIMIZATION</Badge>
                        </div>

                        <Card className="rocha-card border-none bg-slate-900 text-white p-5 space-y-4">
                            <div className="space-y-1">
                                <p className="text-[9px] font-black uppercase text-slate-500 tracking-[0.2em]">Melhor Estratégia de Pagamento</p>
                                <p className="text-sm font-black text-brand-emerald uppercase tracking-tight">{learningMetrics.bestPaymentMethod}</p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                                    <Clock className="h-3 w-3 text-slate-400 mb-2" />
                                    <p className="text-[8px] font-black text-slate-500 uppercase">Ciclo Médio</p>
                                    <p className="text-xs font-black text-white">{(learningMetrics.avgTimeToClose / 24).toFixed(1)} Dias</p>
                                </div>
                                <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                                    <TrendingUp className="h-3 w-3 text-emerald-400 mb-2" />
                                    <p className="text-[8px] font-black text-slate-500 uppercase">Impacto Pilot</p>
                                    <p className="text-xs font-black text-emerald-400">+{learningMetrics.impactOfAssistedActions}%</p>
                                </div>
                            </div>

                            <div className="space-y-2 pt-2">
                                <p className="text-[9px] font-black uppercase text-slate-500 tracking-[0.1em]">Conversão por Score</p>
                                {safeArray(learningMetrics.conversionByScore).map((c, i) => (
                                    <div key={i} className="space-y-1">
                                        <div className="flex justify-between text-[9px] font-bold">
                                            <span className="text-slate-400 tracking-tighter">{c.range}</span>
                                            <span className="text-white">{c.rate.toFixed(0)}%</span>
                                        </div>
                                        <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-brand-emerald opacity-80" 
                                                style={{ width: `${c.rate}%` }} 
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {/* Strategic Insights */}
                        <div className="space-y-3">
                            {safeArray(strategicInsights).map((insight) => (
                                <div key={insight.id} className="p-5 bg-white border-2 border-slate-50 rounded-[2rem] shadow-sm relative group overflow-hidden transition-all hover:border-brand-rocha-primary/30">
                                    <div className="absolute top-0 right-0 p-4">
                                        <Lightbulb className={cn(
                                            "h-5 w-5",
                                            insight.type === 'positive' ? 'text-emerald-500' : 'text-amber-500'
                                        )} />
                                    </div>
                                    <h4 className="text-[10px] font-black uppercase tracking-tight text-slate-900 mb-1">{insight.title}</h4>
                                    <p className="text-[10px] font-medium text-slate-500 mb-3 leading-relaxed italic">"{insight.description}"</p>
                                    {insight.actionable && (
                                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                            <p className="text-[9px] font-black text-brand-rocha-primary uppercase tracking-tighter mb-0.5">Ação Recomendada:</p>
                                            <p className="text-[10px] font-bold text-slate-700 leading-tight uppercase tracking-tight">{insight.actionable}</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Insights Hub */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                <Search className="h-4 w-4 text-slate-400" /> Curadoria de Negócio
                            </h3>
                        </div>
                        <div className="space-y-3">
                            {safeArray(insights).map((insight, idx) => (
                                <div key={idx} className={cn(
                                    "p-4 rounded-2xl border transition-all hover:translate-x-1 cursor-default",
                                    insight.severity === 'critical' ? 'bg-rose-50 border-rose-200' : 
                                    insight.severity === 'warning' ? 'bg-amber-50 border-amber-200' :
                                    'bg-white border-brand-rocha-border shadow-sm'
                                )}>
                                    <h4 className="text-[10px] font-black uppercase tracking-tight text-slate-900">{insight.message}</h4>
                                    <p className="text-[9px] font-bold text-slate-500 mt-1 uppercase leading-tight">{insight.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Lead Potential Ranking (Quote Score) */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-brand-rocha-primary" /> Ranking de Potencial
                            </h3>
                            <Badge className="bg-emerald-100 text-emerald-600 border-none text-[8px] font-black">HIGH SCORE</Badge>
                        </div>
                        <div className="space-y-3">
                            {(dashboardData as any).potentialRanking?.map((lead: any) => (
                                <div 
                                    key={lead.id} 
                                    onClick={() => navigate(`/orcamentos/${lead.id}/editar`)}
                                    className="group cursor-pointer bg-white p-4 rounded-2xl border border-brand-rocha-border shadow-sm hover:border-emerald-500/50 transition-all"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="text-[10px] font-black uppercase tracking-tight text-slate-900">{lead.customerName}</h4>
                                        <Badge className="bg-slate-100 text-slate-600 border-none text-[8px] font-black">SCORE: {lead.score.score}</Badge>
                                    </div>
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-[11px] font-black text-emerald-600">{formatCurrency(lead.total)}</p>
                                            <p className={cn("text-[8px] font-bold uppercase mt-1", lead.timer.color)}>{lead.timer.label}</p>
                                        </div>
                                        <div className="flex -space-x-1">
                                            {lead.score.reasons.slice(0, 2).map((r: string, i: number) => (
                                                <div key={i} className="h-5 w-5 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-[8px]" title={r}>
                                                    {r.split(' ')[0]}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Action Items List */}
                    <div className="space-y-4 pt-4">
                        <div className="flex items-center justify-between px-2">
                            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                <Flame className="h-4 w-4 text-rose-500" /> Ações de Risco
                            </h3>
                            <Badge className="bg-rose-100 text-rose-600 border-none text-[8px] font-black">CRÍTICO</Badge>
                        </div>
                        <div className="space-y-3">
                            {safeArray(actionItems).map(item => (
                                <div key={item.id} onClick={() => navigate(`/orcamentos/${item.id}/editar`)} className="group cursor-pointer bg-white p-4 rounded-2xl border border-brand-rocha-border shadow-md hover:border-brand-rocha-primary/50 transition-all flex items-center justify-between">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            {item.priority === 'high' && <div className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />}
                                            <h4 className="text-[10px] font-black uppercase tracking-tight text-slate-900">{item.title}</h4>
                                        </div>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">{item.subtitle}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[11px] font-black text-slate-800">{formatCurrency(item.amount)}</p>
                                        <ArrowUpRight className="h-3 w-3 text-brand-rocha-primary ml-auto mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Left Panel: Pipeline & Revenue Evolutions */}
                <div className="lg:col-span-8 space-y-8 order-1 lg:order-2">
                    {/* Pipeline Funnel Visualization */}
                    <Card className="rocha-card border-none bg-slate-900 text-white p-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-rocha-primary opacity-5 blur-[100px]" />
                        <div className="flex items-center justify-between mb-10 relative z-10">
                            <div>
                                <h3 className="text-xs font-black uppercase tracking-widest text-brand-rocha-primary">Pipeline Comercial Ativo</h3>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Distribuição de propostas por estágio</p>
                            </div>
                            <div className="flex items-center gap-4 text-right">
                                <div>
                                    <p className="text-[9px] font-black text-slate-500 uppercase">Valor Total em Funil</p>
                                    <p className="text-xl font-black text-white">{formatCurrency(safeArray(pipelineData).reduce((acc, p) => acc + p.value, 0))}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex h-32 w-full gap-2 relative z-10">
                            {safeArray(pipelineData).map((stage, idx) => (
                                <div key={stage.name} className="flex-1 flex flex-col justify-end group">
                                    <div className="relative mb-3 flex flex-col items-center">
                                        <span className="text-[11px] font-black mb-1">{formatCurrency(stage.value)}</span>
                                        <span className="text-[9px] font-bold opacity-50 uppercase tracking-tighter">{stage.count} Propostas</span>
                                    </div>
                                    <div 
                                        className="w-full rounded-xl transition-all duration-1000 group-hover:brightness-125"
                                        style={{ 
                                            height: `${(stage.value / Math.max(...pipelineData.map(p => p.value))) * 100}%`,
                                            backgroundColor: stage.color,
                                            opacity: 0.8 + (idx * 0.1)
                                        }}
                                    />
                                    <p className="text-[10px] font-black mt-4 text-center uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">{stage.name}</p>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Revenue History Chart */}
                    <Card className="rocha-card border-none overflow-hidden relative p-8">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="rocha-text-title uppercase tracking-tight">Evolução de Faturamento</h3>
                                <p className="rocha-text-label text-[10px]">Comparativo temporal de recebíveis</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full bg-brand-rocha-primary" />
                                <span className="text-[9px] font-bold text-slate-500 uppercase">Fechado Comercial</span>
                            </div>
                        </div>
                        <div className="min-h-[280px] h-[280px] w-full">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <AreaChart data={revenueHistory}>
                                    <defs>
                                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.2}/>
                                            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                    <XAxis 
                                        dataKey="date" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} 
                                        dy={10}
                                    />
                                    <YAxis hide />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area 
                                        type="monotone" 
                                        dataKey="value" 
                                        stroke="#8B5CF6" 
                                        strokeWidth={4}
                                        fillOpacity={1} 
                                        fill="url(#colorRev)" 
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Bottom Row: Distribution Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Stone Materials Ranking */}
                <Card className="rocha-card border-none flex flex-col p-6">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="rocha-text-title uppercase tracking-tight">Ranking de Materiais</h3>
                            <p className="rocha-text-label text-[10px]">Share de faturamento bruto</p>
                        </div>
                        <Layers className="h-5 w-5 text-amber-500" />
                    </div>
                    <div className="space-y-5">
                        {stoneData.slice(0, 5).map((stone) => (
                            <div key={stone.name} className="group">
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{stone.name}</span>
                                    <span className="text-[10px] font-black text-slate-900">{formatCurrency(stone.revenue)}</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-brand-rocha-primary transition-all duration-1000" 
                                        style={{ width: `${(stone.revenue / (stoneData[0]?.revenue || 1)) * 100}%` }} 
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Geography Performance */}
                <Card className="rocha-card border-none p-6">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="rocha-text-title uppercase tracking-tight">Top Cidades</h3>
                            <p className="rocha-text-label text-[10px]">Performance regional</p>
                        </div>
                        <MapPin className="h-5 w-5 text-rose-500" />
                    </div>
                    <div className="min-h-[220px] h-[220px] w-full">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <BarChart data={geoData.slice(0, 5)} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis 
                                    dataKey="city" 
                                    type="category" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} 
                                    width={90}
                                />
                                <Bar dataKey="revenue" radius={[0, 4, 4, 0]} fill="#8B5CF6" barSize={12} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* Leads & Influencers */}
                <Card className="rocha-card border-none p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="rocha-text-title uppercase tracking-tight">Canais de Aquisição</h3>
                            <p className="rocha-text-label text-[10px]">Origem vs Conversão</p>
                        </div>
                        <Navigation2 className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div className="space-y-4 flex-1">
                        {originData.slice(0, 4).map((item, idx) => (
                            <div key={item.name} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                    <div>
                                        <p className="text-[10px] font-black uppercase text-slate-800">{item.name}</p>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{item.leads} LEADS</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-emerald-600">{item.conversion.toFixed(1)}%</p>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase">CONV.</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
        </div>
    );
};
