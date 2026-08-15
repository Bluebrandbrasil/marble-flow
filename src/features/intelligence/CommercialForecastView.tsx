import { safeArray } from '../../lib/dataDiagnostics';
import React from 'react';
import { 
    TrendingUp, 
    Activity, 
    Zap, 
    Target,
    BarChart,
    Search,
    Globe,
    CreditCard,
    Calculator,
    ShieldCheck,
    CloudRain,
    Sun,
    Eye
} from 'lucide-react';
import { useCommercialForecast } from '../../hooks/useCommercialForecast';
import { Card, CardContent, CardHeader, CardDescription } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/utils';

export const CommercialForecastView: React.FC<{ periodDays: number }> = ({ periodDays }) => {
    const { forecast, isLoading } = useCommercialForecast(periodDays);
    
    if (isLoading || !forecast) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-emerald" />
            </div>
        );
    }

    const { projections, insights } = forecast;


    const ProjStatCard = ({ title, value, icon: Icon, color, suffix = '', prefix = '' }: any) => (
        <Card className="rounded-[2.5rem] bg-white dark:bg-slate-900 border-none shadow-premium relative overflow-hidden group">
            <div className={cn("absolute inset-0 opacity-5 bg-gradient-to-br transition-all duration-700", color)} />
            <div className="absolute right-[-10px] top-[-10px] opacity-10 group-hover:scale-110 transition-all duration-700">
                <Icon className={cn("h-24 w-24", color.replace('bg-', 'text-'))} />
            </div>
            <CardHeader className="pb-0">
                <CardDescription className="text-slate-400 uppercase font-black text-[9.5px] tracking-[0.2em]">{title}</CardDescription>
            </CardHeader>
            <CardContent className="pt-2 pb-8">
                <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-black tracking-tighter text-slate-800 dark:text-white">
                        {prefix}{typeof value === 'number' && value % 1 !== 0 ? value.toFixed(1) : Math.round(value)}{suffix}
                    </p>
                </div>
                <div className="flex items-center gap-2 mt-3">
                    <Badge className="bg-slate-100 dark:bg-white/5 text-slate-400 border-none font-black text-[8.5px] uppercase py-0.5 tracking-widest">
                        Projetado p/ Próximo Período
                    </Badge>
                </div>
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header: Confidence Meter */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-slate-900 dark:bg-slate-800 p-10 rounded-[3.5rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-brand-emerald/10 to-transparent opacity-50 group-hover:opacity-100 transition-all" />
                <div className="flex-1">
                    <div className="flex items-center gap-4">
                        <Badge className="bg-brand-emerald text-white border-none font-black text-[9px] uppercase tracking-widest py-1 px-4">Beta Projections Engine</Badge>
                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                            <ShieldCheck className="h-3.5 w-3.5" /> Motor de Previsibilidade Ativo
                        </p>
                    </div>
                    <h2 className="text-3xl font-black text-white mt-6 tracking-tighter uppercase leading-tight">Tendência Operacional Estimada</h2>
                    <p className="text-slate-400 text-sm font-bold mt-2 max-w-lg leading-relaxed">
                        Análise baseada em média móvel e estabilidade histórica do funil, projetando o comportamento de demanda para o ciclo seguinte.
                    </p>
                </div>

                <div className="flex flex-col items-center gap-4 bg-white/5 p-8 rounded-[2.5rem] border border-white/5 backdrop-blur-sm min-w-[240px]">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Confiança (Dados)</div>
                    <div className="flex gap-2">
                        {[1, 2, 3].map(i => (
                            <div key={i} className={cn(
                                "h-2 w-12 rounded-full",
                                projections.confidenceLevel === 'high' ? "bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]" :
                                projections.confidenceLevel === 'medium' && i < 3 ? "bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]" :
                                projections.confidenceLevel === 'low' && i === 1 ? "bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.5)]" : "bg-slate-700"
                            )} />
                        ))}
                    </div>
                    <p className={cn(
                        "text-[11px] font-black uppercase mt-2",
                        projections.confidenceLevel === 'high' ? "text-emerald-500" : projections.confidenceLevel === 'medium' ? "text-amber-500" : "text-rose-500"
                    )}>
                        Precisão: {projections.confidenceLevel === 'high' ? 'Alta Volatilidade Baixa' : projections.confidenceLevel === 'medium' ? 'Consistente' : 'Inconsistente / Volátil'}
                    </p>
                </div>
            </div>

            {/* Projected KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <ProjStatCard title="Leads Estimados" value={projections.projectedLeads} icon={Target} color="bg-blue-500" />
                <ProjStatCard title="Projeção de Vendas" value={projections.projectedSales} icon={Activity} color="bg-brand-emerald" />
                <ProjStatCard title="Pipeline Ponderado" value={projections.pipelineVolume} icon={Zap} color="bg-amber-600" prefix="R$ " />
                <ProjStatCard title="Volume Projetado" value={projections.projectedVolume} icon={CreditCard} color="bg-indigo-500" prefix="R$ " />
                <ProjStatCard title="Ticket Estimado" value={projections.projectedAvgTicket} icon={BarChart} color="bg-slate-500" prefix="R$ " />
            </div>

            {/* Insights and Strategic Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                    <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-[0.25em] flex items-center gap-3">
                        <Zap className="h-5 w-5 text-amber-500 fill-amber-500" /> Insights de Previsibilidade
                    </h3>
                    <div className="grid grid-cols-1 gap-4">
                        {safeArray(insights).map((insight, idx) => (
                            <div key={idx} className={cn(
                                "p-6 rounded-[2rem] border transition-all flex items-start gap-4",
                                insight.type === 'opportunity' ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-900 dark:text-emerald-300" :
                                insight.type === 'risk' ? "bg-rose-500/5 border-rose-500/10 text-rose-900 dark:text-rose-300" :
                                "bg-blue-500/5 border-blue-500/10 text-blue-900 dark:text-blue-300"
                            )}>
                                <div className={cn(
                                    "h-10 w-10 shrink-0 rounded-2xl flex items-center justify-center",
                                    insight.type === 'opportunity' ? "bg-emerald-500 text-white" :
                                    insight.type === 'risk' ? "bg-rose-500 text-white" : "bg-blue-500 text-white"
                                )}>
                                    {insight.type === 'opportunity' ? <Sun className="h-5 w-5" /> : 
                                     insight.type === 'risk' ? <CloudRain className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </div>
                                <div>
                                    <h4 className="text-[11px] font-black uppercase opacity-60 tracking-widest">{insight.type}</h4>
                                    <p className="text-sm font-bold mt-1 leading-relaxed">{insight.message}</p>
                                </div>
                            </div>
                        ))}
                        {insights.length === 0 && (
                            <div className="p-10 text-center bg-slate-50 dark:bg-white/5 rounded-[2rem] border-2 border-dashed border-slate-100 dark:border-white/5">
                                <p className="text-[10px] font-black text-slate-300 uppercase">Processando padrões operacionais...</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Best Bets / Probability Ranking */}
                <Card className="rounded-[2.5rem] bg-slate-50 dark:bg-slate-900 border-none shadow-premium p-10 space-y-8 overflow-hidden group relative">
                    <div className="absolute right-[-40px] top-[-40px] opacity-10 rotate-12 group-hover:scale-110 transition-transform duration-700">
                        <TrendingUp className="h-64 w-64 text-brand-emerald" />
                    </div>
                    <div className="relative">
                        <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-[0.25em] flex items-center gap-3">
                            <Target className="h-5 w-5 text-brand-emerald" /> Ranking de Previsibilidade
                        </h3>
                        <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">Apostas de Maior Probabilidade</p>
                    </div>

                    <div className="space-y-6 relative">
                        {/* Best Origin */}
                        {forecast.bestOrigin && (
                            <div className="flex items-center gap-6 p-6 rounded-3xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-white/5">
                                <div className="h-12 w-12 rounded-2xl bg-blue-500 text-white flex items-center justify-center font-black">
                                    <Search className="h-6 w-6" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Canal mais Promissor</p>
                                    <p className="text-sm font-black text-slate-800 dark:text-white uppercase mt-0.5">{forecast.bestOrigin.origin}</p>
                                </div>
                                <div className="text-right">
                                    <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-black text-[9px] uppercase">EXPANSÃO</Badge>
                                </div>
                            </div>
                        )}

                        {/* Best Influencer */}
                        {forecast.topSustainableInf && (
                            <div className="flex items-center gap-6 p-6 rounded-3xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-white/5">
                                <div className="h-12 w-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black">
                                    <Zap className="h-6 w-6" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Parceiro Sustentável</p>
                                    <p className="text-sm font-black text-slate-800 dark:text-white uppercase mt-0.5">{forecast.topSustainableInf.name}</p>
                                </div>
                                <div className="text-right">
                                    <Badge className="bg-amber-500/10 text-amber-600 border-none font-black text-[9px] uppercase">VOLUME</Badge>
                                </div>
                            </div>
                        )}

                        {/* Best Region */}
                        {forecast.potentialRegion && (
                            <div className="flex items-center gap-6 p-6 rounded-3xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-white/5">
                                <div className="h-12 w-12 rounded-2xl bg-indigo-500 text-white flex items-center justify-center font-black">
                                    <Globe className="h-6 w-6" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Região Predominante</p>
                                    <p className="text-sm font-black text-slate-800 dark:text-white uppercase mt-0.5">{forecast.potentialRegion.region}</p>
                                </div>
                                <div className="text-right">
                                    <Badge className="bg-blue-500/10 text-blue-600 border-none font-black text-[9px] uppercase">CRESCIMENTO</Badge>
                                </div>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
};
