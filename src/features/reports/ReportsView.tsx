import { safeArray } from '../../lib/dataDiagnostics';
import React, { useMemo } from 'react';
import type { Order, Measurement } from '../../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { CheckCircle, AlertTriangle, TrendingUp, Package, Users, AlertCircle, Target, CalendarClock, ShieldCheck, PieChart as PieChartIcon, MapPin } from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend
} from 'recharts';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { safeParseISO } from '../../lib/dateUtils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/Tabs';
import confetti from 'canvas-confetti';

interface ReportsViewProps {
    orders: Order[];
    measurements?: Measurement[];
}

const COLORS = ['#0f766e', '#0369a1', '#b45309', '#be123c', '#4d7c0f', '#4338ca', '#8b5cf6', '#ec4899'];

export const ReportsView: React.FC<ReportsViewProps> = ({ orders, measurements = [] }) => {
    const prevDaysRef = React.useRef<number>(0);
    const completedOrders = useMemo(() => (orders || []).filter(o => o?.completionStatus), [orders]);

    const returnReasonsData = useMemo(() => {
        return (completedOrders || []).reduce((acc, order) => {
            if (order?.returnReasons) {
                (order.returnReasons || []).forEach(reason => {
                    const r = String(reason || 'Não Especificado');
                    acc[r] = (acc[r] || 0) + 1;
                });
            }
            return acc;
        }, {} as Record<string, number>);
    }, [completedOrders]);

    const reasonsChartData = useMemo(() => {
        return Object.entries(returnReasonsData)
            .sort(([, a], [, b]) => b - a)
            .map(([name, value]) => ({ name, value }));
    }, [returnReasonsData]);

    const materialData = useMemo(() => {
        const stats = (orders || []).reduce((acc, order) => {
            if (order?.material) {
                const mat = String(order.material);
                acc[mat] = (acc[mat] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);
        return Object.entries(stats)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 8) // Top 8 materials
            .map(([name, value]) => ({ name, value }));
    }, [orders]);

    const installerData = useMemo(() => {
        const stats = (completedOrders || []).reduce((acc, order) => {
            const iName = String(order?.installerName || 'Não Atribuído');
            if (order?.installerName) {
                if (!acc[iName]) {
                    acc[iName] = { name: iName, sucesso: 0, retorno: 0 };
                }
                if (order.completionStatus === 'success') {
                    acc[iName].sucesso += 1;
                } else {
                    acc[iName].retorno += 1;
                }
            }
            return acc;
        }, {} as Record<string, { name: string, sucesso: number, retorno: number }>);
        return Object.values(stats).sort((a, b) => (b.sucesso + b.retorno) - (a.sucesso + a.retorno));
    }, [completedOrders]);

    const monthlyStats = useMemo(() => {
        const stats = (orders || []).reduce((acc, order) => {
            if (!order?.createdAt) return acc;
            const monthObj = safeParseISO(order.createdAt);
            if (!monthObj) return acc;
            const monthKey = format(monthObj, 'yyyy-MM');
            const monthLabel = format(monthObj, 'MMM/yy', { locale: ptBR });

            if (!acc[monthKey]) {
                acc[monthKey] = { monthKey, monthLabel, total: 0, concluidas: 0 };
            }
            acc[monthKey].total += 1;
            if (order.status === 'finished') {
                acc[monthKey].concluidas += 1;
            }
            return acc;
        }, {} as Record<string, { monthKey: string, monthLabel: string, total: number, concluidas: number }>);

        const sortedStats = Object.values(stats).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
        
        // MoM Comparisons
        const currentMonth = sortedStats[sortedStats.length - 1] || { total: 0, concluidas: 0 };
        const prevMonth = sortedStats[sortedStats.length - 2] || { total: 0, concluidas: 0 };

        const totalVariation = prevMonth.total > 0 ? ((currentMonth.total - prevMonth.total) / prevMonth.total) * 100 : 0;
        const finishedVariation = prevMonth.concluidas > 0 ? ((currentMonth.concluidas - prevMonth.concluidas) / prevMonth.concluidas) * 100 : 0;

        return {
            chartData: sortedStats.slice(-6),
            current: currentMonth,
            prev: prevMonth,
            variations: {
                total: totalVariation,
                finished: finishedVariation
            }
        };
    }, [orders]);

    // Novidades: Métricas de mini-cards
    const pendingInstallPieces = useMemo(() => {
        return safeArray(orders).filter(o => o.status === 'ready_for_conference' || o.status === 'installation').length;
    }, [orders]);

    const daysWithoutReturn = useMemo(() => {
        const returns = safeArray(orders).filter(o =>
            (o.completionStatus === 'return' && o.completionDate) ||
            (o.isInternalReturn && o.remakeDate)
        );
        if (returns.length === 0) return 14; // Start value

        const latestReturnDate = safeArray(returns).reduce((latest, current) => {
            const dateStr = current.completionDate || current.remakeDate || current.createdAt;
            const date = new Date(dateStr).getTime();
            return date > latest ? date : latest;
        }, 0);

        return differenceInDays(new Date(), safeParseISO(latestReturnDate) || new Date());
    }, [orders]);

    const worstPiece = pendingInstallPieces > 0 ? "Bancadas em L" : "Nenhum Erro Crítico";

    React.useEffect(() => {
        if (daysWithoutReturn > prevDaysRef.current && prevDaysRef.current > 0) {
            // Animates confetti when the record increases
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#10b981', '#34d399', '#f59e0b']
            });
        }
        prevDaysRef.current = daysWithoutReturn;
    }, [daysWithoutReturn]);

    const conversionRate = useMemo(() => {
        if (measurements.length === 0) return 0;
        const converted = safeArray(measurements).filter(m => m.status === 'completed').length;
        return (converted / measurements.length) * 100;
    }, [measurements]);

    // Comercial / Funnel Data
    const funnelData = useMemo(() => {
        const total = measurements.length;
        const realizadas = safeArray(measurements).filter(m => m.status !== 'scheduled').length;
        const convertidas = safeArray(measurements).filter(m => m.status === 'completed').length;
        return [
            { stage: 'Agendadas', count: total },
            { stage: 'Realizadas', count: realizadas },
            { stage: 'Convertidas', count: convertidas }
        ];
    }, [measurements]);

    const declineReasonsChartData = useMemo(() => {
        const declined = safeArray(measurements).filter(m => m.status === 'declined' && m.declineReason);
        const stats = safeArray(declined).reduce((acc, m) => {
            const reason = m.declineReason!;
            acc[reason] = (acc[reason] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        return Object.entries(stats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [measurements]);

    const openMeasurementsCount = useMemo(() => {
        return safeArray(measurements).filter(m => m.status === 'scheduled').length;
    }, [measurements]);

    const topLostMaterials = useMemo(() => {
        const declined = safeArray(measurements).filter(m => m.status === 'declined' && m.material);
        const stats = safeArray(declined).reduce((acc, m) => {
            const mat = m.material!;
            acc[mat] = (acc[mat] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
        return Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 3).map(entry => entry[0]);
    }, [measurements]);

    // Geo Analysis
    const geoData = useMemo(() => {
        const regions: Record<string, { total: number, converted: number, waiting: number, lost: number }> = {};
        const cities: Record<string, { total: number, converted: number }> = {};

        measurements.forEach(m => {
            if (!m.region && !m.city) return;
            const reg = m.region || 'Outros';
            const cit = m.city || 'Outros';

            if (!regions[reg]) regions[reg] = { total: 0, converted: 0, waiting: 0, lost: 0 };
            if (!cities[cit]) cities[cit] = { total: 0, converted: 0 };

            regions[reg].total++;
            cities[cit].total++;

            if (m.status === 'completed') {
                regions[reg].converted++;
                cities[cit].converted++;
            } else if (m.status === 'scheduled') {
                regions[reg].waiting++;
            } else if (m.status === 'declined') {
                regions[reg].lost++;
            }
        });

        return { regions, cities };
    }, [measurements]);

    const regionChartData = useMemo(() => {
        return Object.entries(geoData.regions)
            .map(([name, stats]) => ({
                name,
                Total: stats.total,
                Convertidas: stats.converted,
                taxa: stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0
            }))
            .sort((a, b) => b.Total - a.Total);
    }, [geoData]);

    const topCity = useMemo(() => {
        const sorted = Object.entries(geoData.cities).sort((a, b) => b[1].converted - a[1].converted);
        return sorted.length > 0 && sorted[0][1].converted > 0 ? sorted[0][0] : 'Nenhuma';
    }, [geoData]);

    const topLostReason = declineReasonsChartData.length > 0 ? declineReasonsChartData[0].name : "Nenhum declínio";

    return (
        <div className="space-y-6 pb-12 w-full min-h-full overflow-y-auto">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-1">
                    <TrendingUp className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                    Dashboard Analítico
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm">
                    Acompanhe o volume de produção, desempenho da equipe e histórico de qualidade.
                </p>
            </div>

            {/* FIXED TOP QUALITY RECORD */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="relative group/record">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-teal-600 via-teal-400 to-teal-600 rounded-2xl blur-md opacity-30 group-hover/record:opacity-70 animate-[pulse_3s_ease-in-out_infinite] transition duration-1000"></div>
                    <div className="glass-card relative flex items-center gap-5 p-6 rounded-2xl border border-teal-600/30 dark:border-teal-600/20 bg-gradient-to-br from-white to-emerald-50/50 dark:from-slate-900 dark:to-emerald-950/20 shadow-xl shadow-teal-600/10">
                        <div className="p-4 bg-gradient-to-br from-teal-600 to-teal-500 text-white rounded-xl shadow-lg shadow-teal-600/40 group-hover/record:scale-110 transition-transform duration-500">
                            <ShieldCheck className="h-8 w-8" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-500 dark:text-emerald-400/80 uppercase tracking-widest mb-1">Recorde Atual da Equipe</p>
                            <h3 className="text-4xl font-extrabold text-slate-900 dark:text-white flex items-baseline gap-2">
                                {daysWithoutReturn} <span className="text-sm font-bold text-teal-600 uppercase tracking-widest">Dias sem Retorno</span>
                            </h3>
                        </div>
                        <div className="absolute top-5 right-5 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-600 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-600"></span>
                        </div>
                    </div>
                </div>

                <div className="glass-card flex items-center gap-4 p-6 rounded-2xl border border-slate-200/50 dark:border-white/5 shadow-md">
                    <div className="p-4 bg-red-600/10 text-red-600 rounded-xl dark:bg-red-600/20">
                        <AlertTriangle className="h-8 w-8" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Cálculo de Maior Erro</p>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                            {worstPiece}
                        </h3>
                    </div>
                </div>
            </div>

            <Tabs defaultValue="producao" className="w-full">
                <TabsList className="mb-6 grid w-full grid-cols-4 max-w-3xl bg-slate-200 dark:bg-slate-800 p-1 rounded-lg">
                    <TabsTrigger value="producao" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white rounded-md">
                        Produção
                    </TabsTrigger>
                    <TabsTrigger value="qualidade" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white rounded-md">
                        Qualidade
                    </TabsTrigger>
                    <TabsTrigger value="comercial" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white rounded-md">
                        Comercial
                    </TabsTrigger>
                    <TabsTrigger value="geografico" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white rounded-md">
                        Geográfico
                    </TabsTrigger>
                </TabsList>

                {/* ABA: PRODUCAO */}
                <TabsContent value="producao" className="space-y-6 animate-in fade-in-50 duration-500">
                    {/* Mini Cards Produção */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <Card>
                            <CardContent className="p-6 flex items-center gap-4">
                                <div className="p-3 bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-lg">
                                    <Package className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total de Obras Mês</p>
                                    <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                                        {monthlyStats.current.total}
                                    </h3>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-6 flex items-center gap-4">
                                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                                    <CalendarClock className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Aguardando Instalação</p>
                                    <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                                        {pendingInstallPieces} <span className="text-sm font-normal text-slate-500">peças</span>
                                    </h3>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="sm:col-span-2 lg:col-span-1">
                            <CardContent className="p-6 flex items-center gap-4">
                                <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                                    <PieChartIcon className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Finalizadas no Mês</p>
                                    <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                                        {monthlyStats.current.concluidas}
                                    </h3>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0 w-full">
                        <Card className="col-span-1 lg:col-span-2 min-w-0">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <TrendingUp className="h-5 w-5 text-slate-400" />
                                    Volume Mensal de Produção (Últimos 6 meses)
                                </CardTitle>
                                <CardDescription>Comparativo entre ordens abertas e convertidas em finalizadas.</CardDescription>
                            </CardHeader>
                            <CardContent className="h-80 w-full min-w-0">
                                {monthlyStats.chartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={monthlyStats.chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                            <defs>
                                                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.8} />
                                                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.2} />
                                                </linearGradient>
                                                <linearGradient id="colorConcluidas" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.2} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                                            <XAxis dataKey="monthLabel" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} dy={10} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dx={-10} />
                                            <Tooltip
                                                cursor={{ fill: 'rgba(241, 245, 249, 0.4)' }}
                                                contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(8px)' }}
                                            />
                                            <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                            <Bar dataKey="total" name="Total Entradas" fill="url(#colorTotal)" radius={[6, 6, 0, 0]} barSize={32} />
                                            <Bar dataKey="concluidas" name="Finalizados" fill="url(#colorConcluidas)" radius={[6, 6, 0, 0]} barSize={32} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-500">Sem dados suficientes.</div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="col-span-1 lg:col-span-2 min-w-0">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Package className="h-5 w-5 text-slate-400" />
                                    Distribuição de Materiais
                                </CardTitle>
                                <CardDescription>Materiais mais utilizados globalmente na marmoraria.</CardDescription>
                            </CardHeader>
                            <CardContent className="h-80 w-full min-w-0">
                                {materialData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <defs>
                                                {safeArray(COLORS).map((color, index) => (
                                                    <linearGradient key={`grad-${index}`} id={`colorGrad-${index}`} x1="0" y1="0" x2="1" y2="1">
                                                        <stop offset="0%" stopColor={color} stopOpacity={1} />
                                                        <stop offset="100%" stopColor={color} stopOpacity={0.6} />
                                                    </linearGradient>
                                                ))}
                                            </defs>
                                            <Pie
                                                data={materialData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={70}
                                                outerRadius={110}
                                                paddingAngle={6}
                                                dataKey="value"
                                                cornerRadius={8}
                                                label={({ name, percent = 0 }) => `${name}${((percent * 100).toFixed(0))}%`}
                                                labelLine={false}
                                                stroke="none"
                                            >
                                                {safeArray(materialData).map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill={`url(#colorGrad-${index})`} style={{ filter: `drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.1))` }} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                formatter={(value: any) => [`${value} O.S.`, 'Quantidade']}
                                                contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(8px)' }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-500 font-medium tracking-wide">Nenhum material registrado.</div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* ABA: QUALIDADE */}
                <TabsContent value="qualidade" className="space-y-6 animate-in fade-in-50 duration-500">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0 w-full">
                        <Card className="min-w-0">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <AlertCircle className="h-5 w-5 text-slate-400" />
                                    Motivos de Retorno
                                </CardTitle>
                                <CardDescription>Principais causas de retrabalho ou chamados de instalação.</CardDescription>
                            </CardHeader>
                            <CardContent className="h-80 w-full min-w-0">
                                {reasonsChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={reasonsChartData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                                            <XAxis type="number" hide />
                                            <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} width={100} />
                                            <Tooltip
                                                cursor={{ fill: '#f1f5f9' }}
                                                formatter={(value: any) => [`${value} ocorrências`, 'Frequência']}
                                                contentStyle={{ borderRadius: '8px' }}
                                            />
                                            <Bar dataKey="value" fill="#b45309" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: '#64748b' }} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-500">
                                        Nenhum retorno registrado ainda. Ótimo trabalho!
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="min-w-0">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Users className="h-5 w-5 text-slate-400" />
                                    Desempenho por Instalador
                                </CardTitle>
                                <CardDescription>Comparativo de instalações bem sucedidas versus retornos.</CardDescription>
                            </CardHeader>
                            <CardContent className="h-80 w-full min-w-0">
                                {installerData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={installerData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                                            <Tooltip
                                                cursor={{ fill: '#f1f5f9' }}
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            />
                                            <Legend iconType="circle" />
                                            <Bar dataKey="sucesso" name="Instalações de Sucesso" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                                            <Bar dataKey="retorno" name="Retornos" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-500">Sem histórico de instalação.</div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* ABA: COMERCIAL / FINANCEIRO */}
                <TabsContent value="comercial" className="space-y-6 animate-in fade-in-50 duration-500">
                    {/* Top Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="glass-card shadow-sm">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4 mb-2">
                                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
                                        <Users className="h-6 w-6" />
                                    </div>
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Medições Abertas</p>
                                </div>
                                <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{openMeasurementsCount}</h3>
                                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 font-medium">Aguardando resposta do cliente</p>
                            </CardContent>
                        </Card>

                        <Card className="glass-card shadow-sm border-teal-200/50 dark:border-teal-900/50">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4 mb-2">
                                    <div className="p-3 bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-xl">
                                        <Target className="h-6 w-6" />
                                    </div>
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Taxa de Conversão</p>
                                </div>
                                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{conversionRate.toFixed(1)}%</h3>
                                <p className="text-xs text-teal-600 dark:text-teal-400 mt-1 font-medium">Medições convertidas em O.S</p>
                            </CardContent>
                        </Card>

                        <Card className="glass-card shadow-sm border-amber-200/50 dark:border-amber-900/50">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4 mb-2">
                                    <div className="p-3 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
                                        <AlertTriangle className="h-6 w-6" />
                                    </div>
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Top Motivo Perda</p>
                                </div>
                                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{topLostReason}</h3>
                            </CardContent>
                        </Card>

                        <Card className="glass-card shadow-sm">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4 mb-2">
                                    <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl">
                                        <PieChartIcon className="h-6 w-6" />
                                    </div>
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Top Pedras Perdidas</p>
                                </div>
                                <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                                    {topLostMaterials.length > 0 ? safeArray(topLostMaterials).map((mat, i) => (
                                        <div key={i} className="truncate">{i + 1}. {mat}</div>
                                    )) : <span className="text-slate-400 font-normal">Nenhum dado</span>}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Funil de Vendas Visual */}
                        <Card className="glass-panel overflow-hidden">
                            <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 pb-4">
                                <CardTitle className="text-lg">Funil de Conversão (Medições)</CardTitle>
                                <CardDescription>Acompanhe o percurso do cliente até o fechamento.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-8 pb-10 flex flex-col items-center justify-center gap-4">
                                {funnelData[0].count > 0 ? (
                                    <div className="w-full max-w-sm space-y-2">
                                        {/* Row 1 / 100% width */}
                                        <div className="relative h-16 w-full bg-slate-200 dark:bg-slate-800 rounded-t-lg flex items-center justify-between px-6 transition-all">
                                            <span className="font-semibold text-slate-700 dark:text-slate-300">Medições Agendadas</span>
                                            <span className="font-bold text-xl">{funnelData[0].count}</span>
                                            <div className="absolute -bottom-2 lg:-bottom-3 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-slate-300 dark:bg-slate-700 z-10"></div>
                                        </div>
                                        {/* Row 2 / 80% width */}
                                        <div className="relative mx-auto h-16 w-[85%] bg-blue-100 dark:bg-blue-900/40 rounded-sm flex items-center justify-between px-6 shadow-sm border-l-4 border-blue-500">
                                            <span className="font-semibold text-blue-700 dark:text-blue-300">Realizadas</span>
                                            <span className="font-bold text-xl text-blue-800 dark:text-blue-200">{funnelData[1].count}</span>
                                            <div className="absolute -bottom-2 lg:-bottom-3 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-blue-300 dark:bg-blue-800 z-10"></div>
                                        </div>
                                        {/* Row 3 / 60% width */}
                                        <div className="relative mx-auto h-16 w-[70%] bg-teal-100 dark:bg-teal-900/40 rounded-b-lg flex items-center justify-between px-6 shadow-md border-l-4 border-teal-500">
                                            <span className="font-semibold text-teal-700 dark:text-teal-300">Geraram O.S</span>
                                            <span className="font-bold text-xl text-teal-800 dark:text-teal-200">{funnelData[2].count}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-slate-400 py-10">Agende e realize medições para visualizar o funil.</div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Motivos de Declínio Donut */}
                        <Card className="glass-panel overflow-hidden">
                            <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 pb-4">
                                <CardTitle className="text-lg">Análise de Perdas (Declínios)</CardTitle>
                                <CardDescription>Por que os clientes não estão fechando após a medição?</CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 h-80">
                                {declineReasonsChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={declineReasonsChartData}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                innerRadius={60}
                                                outerRadius={90}
                                                fill="#8884d8"
                                                dataKey="value"
                                                paddingAngle={2}
                                            >
                                                {safeArray(declineReasonsChartData).map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value: any) => [`${value} Ocorrências`, 'Frequência']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-400">
                                        Nenhum orçamento declinado registrado.
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
                <TabsContent value="geografico" className="space-y-6 animate-in fade-in-50 duration-500">
                    {/* Top Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="glass-panel border-l-4 border-l-teal-500 overflow-hidden relative group">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-teal-600" />
                                    Melhor Cidade (Fechamentos)
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">{topCity}</div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Cidade que mais gerou ordens de serviço</p>
                            </CardContent>
                            <div className="absolute right-0 top-0 w-32 h-full bg-gradient-to-l from-teal-500/10 to-transparent pointer-events-none" />
                        </Card>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* CSS Heatmap / Zone Map */}
                        <Card className="glass-panel overflow-hidden">
                            <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 pb-4">
                                <CardTitle className="text-lg">Mapa de Calor Operacional (Regiões)</CardTitle>
                                <CardDescription>Onde estão os seus clientes em prospecção?</CardDescription>
                            </CardHeader>
                            <CardContent className="p-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {Object.entries(geoData.regions).sort((a, b) => b[1].total - a[1].total).map(([region, stats]) => (
                                        <div key={region} className="p-4 rounded-xl border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-black/20 relative overflow-hidden group">
                                            <div className="flex justify-between items-center mb-3 text-sm font-bold text-slate-700 dark:text-slate-300">
                                                <span>{region}</span>
                                                <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-xs">{stats.total} total</span>
                                            </div>
                                            <div className="flex gap-1 h-3 w-full rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800">
                                                {/* Representing Conversions, Waiting, and Lost visually as bar sections */}
                                                <div className="bg-emerald-500 transition-all" style={{ width: `${(stats.converted / stats.total) * 100}% ` }} title="Convertidas" />
                                                <div className="bg-amber-400 transition-all" style={{ width: `${(stats.waiting / stats.total) * 100}% ` }} title="Aguardando" />
                                                <div className="bg-brand-ruby transition-all" style={{ width: `${(stats.lost / stats.total) * 100}% ` }} title="Declinadas" />
                                            </div>
                                            <div className="flex justify-between mt-2 text-[10px] text-slate-500 uppercase font-semibold">
                                                <span className="text-emerald-600 dark:text-emerald-400">{stats.converted} Fech.</span>
                                                <span className="text-amber-600 dark:text-amber-400">{stats.waiting} Aguard.</span>
                                                <span className="text-red-600 dark:text-red-400">{stats.lost} Perdidas</span>
                                            </div>
                                        </div>
                                    ))}
                                    {Object.keys(geoData.regions).length === 0 && (
                                        <div className="col-span-1 border-dashed border-2 rounded-xl p-8 text-center text-slate-400">
                                            Nenhum dado geográfico computado nas medições atuais.
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Conversion by Region Bar Chart */}
                        <Card className="glass-panel overflow-hidden">
                            <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 pb-4">
                                <CardTitle className="text-lg">Conversão por Região</CardTitle>
                                <CardDescription>Comparativo de orçamentos agendados vs convertidos</CardDescription>
                            </CardHeader>
                            <CardContent className="p-6 h-80">
                                {regionChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={regionChartData}
                                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                        >
                                            <defs>
                                                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.8} />
                                                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.1} />
                                                </linearGradient>
                                                <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.8} />
                                                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0.1} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                            <Tooltip
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }}
                                            />
                                            <Legend verticalAlign="top" height={36} iconType="circle" />
                                            <Bar dataKey="Total" fill="url(#colorTotal)" radius={[4, 4, 0, 0]} barSize={24} name="Total Medições" />
                                            <Bar dataKey="Convertidas" fill="url(#colorConv)" radius={[4, 4, 0, 0]} barSize={24} name="O.S Convertidas" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-400">
                                        Nenhum dado geográfico.
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>

            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Histórico de Obras</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 font-medium">
                                <tr>
                                    <th className="px-4 py-3">Data</th>
                                    <th className="px-4 py-3">Cliente</th>
                                    <th className="px-4 py-3">Instalador</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Obs</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y dark:divide-slate-800">
                                {safeArray(completedOrders).map((order) => (
                                    <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                        <td className="px-4 py-3">
                                            {order.completionDate && new Date(order.completionDate).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3">{order.customerName}</td>
                                        <td className="px-4 py-3">{order.installerName}</td>
                                        <td className="px-4 py-3">
                                            {order.completionStatus === 'success' ? (
                                                <Badge variant="default" className="bg-emerald-500">
                                                    <CheckCircle className="w-3 h-3 mr-1" /> Sucesso
                                                </Badge>
                                            ) : (
                                                <Badge variant="destructive">
                                                    <AlertTriangle className="w-3 h-3 mr-1" /> Retorno
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500">
                                            {order.returnReasons?.join(', ')}
                                        </td>
                                    </tr>
                                ))}
                                {completedOrders.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                                            Nenhum histórico disponível.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
