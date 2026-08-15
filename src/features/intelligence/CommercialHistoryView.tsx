import { safeArray } from '../../lib/dataDiagnostics';
import React from 'react';
import { 
    ArrowUpRight, 
    ArrowDownRight, 
    Lightbulb,
    Activity,
    Minus,
    MapPin
} from 'lucide-react';
import { useCommercialHistory, type HistoricalMetric } from '../../hooks/useCommercialHistory';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/utils';
import { CommercialActionTrigger } from '../../components/CommercialActionTrigger';

export const CommercialHistoryView: React.FC<{ periodDays: number }> = ({ periodDays }) => {
    const { history, isLoading } = useCommercialHistory(periodDays);
    const { general, byOrigin, byInfluencer, byRegion, insights } = history;

    const formatCurrency = (value: any) => {
        return Number(value || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-emerald" />
            </div>
        );
    }

    const StatCard = ({ title, metric, prefix = '', suffix = '' }: { title: string, metric: HistoricalMetric, prefix?: string, suffix?: string }) => {
        return (
            <Card className="rounded-[2.5rem] bg-white dark:bg-slate-900 shadow-premium border-none relative overflow-hidden group">
                <CardHeader className="pb-0">
                    <CardDescription className="text-slate-400 uppercase font-black text-[9px] tracking-widest">{title}</CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                    <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-black tracking-tighter text-slate-800 dark:text-white">
                            {prefix}{typeof metric.current === 'number' && metric.current % 1 !== 0 ? metric.current.toFixed(1) : metric.current}{suffix}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <div className={cn(
                            "flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[10px] font-black",
                            metric.trend === 'up' ? "bg-emerald-500/10 text-emerald-600" : 
                            metric.trend === 'down' ? "bg-rose-500/10 text-rose-600" :
                            "bg-slate-100 text-slate-400"
                        )}>
                            {metric.trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : 
                             metric.trend === 'down' ? <ArrowDownRight className="h-3 w-3" /> : 
                             <Minus className="h-3 w-3" />}
                            {Math.abs(metric.deltaPercent).toFixed(1)}%
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase">vs ant.</span>
                    </div>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="space-y-10 animate-in fade-in duration-700">
            {/* KPI Section */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <StatCard title="Leads Captados" metric={general.leads} />
                <StatCard title="Vendas Efetuadas" metric={general.sales} />
                <StatCard title="Taxa Conversão" metric={general.conversion} suffix="%" />
                <StatCard title="Volume Vendido" metric={general.volume} prefix="R$ " />
                <StatCard title="Ticket Médio" metric={general.avgTicket} prefix="R$ " />
            </div>

            {/* Insights Panel */}
            {insights.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {safeArray(insights).map((insight, idx) => (
                        <div key={idx} className={cn(
                            "p-6 rounded-[2rem] border-l-8 flex items-start gap-4 shadow-sm",
                            insight.type === 'success' ? "bg-emerald-50/50 border-emerald-500 text-emerald-900 dark:bg-emerald-500/5 dark:text-emerald-300" :
                            insight.type === 'warning' ? "bg-rose-50/50 border-rose-500 text-rose-900 dark:bg-rose-500/5 dark:text-rose-300" :
                            "bg-blue-50/50 border-blue-500 text-blue-900 dark:bg-blue-500/5 dark:text-blue-300"
                        )}>
                            <div className={cn(
                                "h-10 w-10 min-w-[40px] rounded-2xl flex items-center justify-center",
                                insight.type === 'success' ? "bg-emerald-500/20" :
                                insight.type === 'warning' ? "bg-rose-500/20" :
                                "bg-blue-500/20"
                            )}>
                                <Lightbulb className="h-5 w-5" />
                            </div>
                            <div>
                                <h4 className="text-[11px] font-black uppercase tracking-widest opacity-60">Insight de Evolução</h4>
                                <p className="text-sm font-bold mt-1 leading-relaxed">{insight.message}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Origins History */}
                <Card className="rounded-[2.5rem] bg-white dark:bg-slate-900 border-none shadow-premium overflow-hidden">
                    <CardHeader className="bg-slate-50 dark:bg-white/2 border-b border-slate-100 dark:border-white/5">
                        <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white flex items-center gap-3">
                            <Activity className="h-5 w-5 text-blue-500" /> Evolução por Origem
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full">
                            <thead className="bg-slate-50/50 dark:bg-white/2 border-b border-slate-100 dark:border-white/5">
                                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                    <th className="px-8 py-5 text-left">Origem</th>
                                    <th className="px-6 py-5 text-center">Atual</th>
                                    <th className="px-6 py-5 text-center">Anterior</th>
                                    <th className="px-8 py-5 text-right">Evolução</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                                {safeArray(byOrigin).map(o => (
                                    <tr key={o.origin} className="hover:bg-slate-50 dark:hover:bg-white/2">
                                        <td className="px-8 py-5 text-[11px] font-black text-slate-800 dark:text-white uppercase">{o.origin}</td>
                                        <td className="px-6 py-5 text-center text-xs font-bold text-slate-500">{o.currentSales}</td>
                                        <td className="px-6 py-5 text-center text-xs font-bold text-slate-300">{o.previousSales}</td>
                                        <td className="px-8 py-5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <span className={cn(
                                                    "text-[10px] font-black px-2 py-0.5 rounded-lg",
                                                    o.deltaSales > 0 ? "bg-emerald-500/10 text-emerald-600" :
                                                    o.deltaSales < 0 ? "bg-rose-500/10 text-rose-600" : "bg-slate-100 text-slate-400"
                                                )}>
                                                    {o.deltaSales > 0 ? '+' : ''}{o.deltaSales}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>

                {/* Influencers History */}
                <Card className="rounded-[2.5rem] bg-white dark:bg-slate-900 border-none shadow-premium overflow-hidden">
                    <CardHeader className="bg-slate-50 dark:bg-white/2 border-b border-slate-100 dark:border-white/5">
                        <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white flex items-center gap-3">
                            <Trophy className="h-5 w-5 text-amber-500" /> Crescimento Parceiros
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full">
                            <thead className="bg-slate-50/50 dark:bg-white/2 border-b border-slate-100 dark:border-white/5">
                                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                    <th className="px-8 py-5 text-left">Influencer</th>
                                    <th className="px-6 py-5 text-center">Fatur. Período</th>
                                    <th className="px-8 py-5 text-right">Variação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                                {safeArray(byInfluencer).slice(0, 5).map(inf => (
                                    <tr key={inf.id} className="hover:bg-slate-50 dark:hover:bg-white/2">
                                        <td className="px-8 py-5">
                                            <p className="text-[11px] font-black text-slate-800 dark:text-white uppercase">{inf.name}</p>
                                            <p className="text-[9px] font-bold text-slate-400">Conv: {inf.conversionCurrent.toFixed(1)}%</p>
                                        </td>
                                        <td className="px-6 py-5 text-center text-xs font-black text-slate-700 dark:text-slate-300">{formatCurrency(inf.currentVolume)}</td>
                                        <td className="px-8 py-5 text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                <CommercialActionTrigger 
                                                    variant="sm"
                                                    triggerLabel="Ação"
                                                    defaultData={{
                                                        title: `Evolução: ${inf.name}`,
                                                        type: inf.deltaVolume < 0 ? 'reativacao' : 'oportunidade',
                                                        sourceType: 'historico',
                                                        sourceId: inf.id,
                                                        influencerId: inf.id,
                                                        influencerName: inf.name,
                                                        priority: inf.deltaVolume < 0 ? 'high' : 'medium'
                                                    }}
                                                />
                                                <Badge className={cn(
                                                    "border-none px-2 py-0.5 text-[10px] font-black",
                                                    inf.deltaVolume > 0 ? "bg-emerald-500/10 text-emerald-600" :
                                                    inf.deltaVolume < 0 ? "bg-rose-500/10 text-rose-600" : "bg-slate-100 text-slate-400"
                                                )}>
                                                    {inf.deltaVolume > 0 ? '+' : ''}{formatCurrency(inf.deltaVolume)}
                                                </Badge>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            </div>

            {/* Region Evolution Table */}
            <Card className="rounded-[2.5rem] bg-white dark:bg-slate-900 border-none shadow-premium overflow-hidden">
                <CardHeader className="bg-slate-50 dark:bg-white/2 border-b border-slate-100 dark:border-white/5 pb-6">
                    <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white flex items-center gap-3">
                        <MapPin className="h-5 w-5 text-indigo-500" /> Comparativo de Faturamento Regional
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <table className="w-full">
                        <thead className="bg-slate-50/50 dark:bg-white/2 border-b border-slate-100 dark:border-white/5">
                            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                <th className="px-10 py-5 text-left">Região / Cidade</th>
                                <th className="px-8 py-5 text-center">Fatur. Atual</th>
                                <th className="px-8 py-5 text-center">Fatur. Anterior</th>
                                <th className="px-8 py-5 text-center">Ticket Médio</th>
                                <th className="px-10 py-5 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                            {safeArray(byRegion).map(r => (
                                <tr key={r.region} className="hover:bg-slate-50 dark:hover:bg-white/2">
                                    <td className="px-10 py-5">
                                        <span className="text-[11px] font-black text-slate-800 dark:text-white uppercase">{r.region}</span>
                                    </td>
                                    <td className="px-8 py-5 text-center text-xs font-black text-slate-700 dark:text-slate-300">{formatCurrency(r.currentVolume)}</td>
                                    <td className="px-8 py-5 text-center text-xs font-bold text-slate-400">{formatCurrency(r.previousVolume)}</td>
                                    <td className="px-8 py-5 text-center">
                                        <p className="text-xs font-black text-slate-600">{formatCurrency(r.avgTicketCurrent)}</p>
                                        <p className={cn(
                                            "text-[9px] font-bold",
                                            r.avgTicketCurrent >= r.avgTicketPrevious ? "text-emerald-500" : "text-rose-500"
                                        )}>
                                            {r.avgTicketCurrent >= r.avgTicketPrevious ? '▲' : '▼'} {formatCurrency(Math.abs(r.avgTicketCurrent - r.avgTicketPrevious))}
                                        </p>
                                    </td>
                                    <td className="px-10 py-5 text-right">
                                        {r.currentVolume > r.previousVolume ? (
                                            <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-black text-[9px] uppercase">CRESCIMENTO</Badge>
                                        ) : r.currentVolume < r.previousVolume ? (
                                            <Badge className="bg-rose-500/10 text-rose-600 border-none font-black text-[9px] uppercase">QUEDA</Badge>
                                        ) : (
                                            <Badge className="bg-slate-100 text-slate-400 border-none font-black text-[9px] uppercase">ESTÁVEL</Badge>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
};

const Trophy = (props: any) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
);
