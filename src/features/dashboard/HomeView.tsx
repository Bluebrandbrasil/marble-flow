import { safeArray } from '../../lib/dataDiagnostics';
import { safeParseISO } from '../../lib/dateUtils';
import React, { useMemo, useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Activity, Target, ShieldCheck, TrendingUp, CheckCircle, FileText, ShoppingCart, Ruler, Zap, ArrowUpRight, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { format, subDays, startOfDay, endOfDay, subWeeks, startOfWeek, endOfWeek, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Order, Quote } from '../../types';
import { cn } from '../../lib/utils';
import { getEffectiveWorkflowStage, getEffectiveOrderStage } from '../../components/workflow/WorkflowStatus';
import { reportDataIssue } from '../../lib/dataDiagnostics';
import { getQuoteAlertStatus } from '../../utils/quoteAlerts';
import { 
    isValidQuoteForMetrics, 
    buildQuotesByDateMap, 
    getQuoteCreatedDateKey, 
    getSellerNameFromQuote, 
    getLocalDateInTimezone 
} from '../../utils/quoteCalculations';

const normalizeText = (value: unknown): string => {
    return String(value || '').trim().toLowerCase();
};

const getQuoteSellerName = (quote: any): string => {
    return getSellerNameFromQuote(quote);
};

interface HomeViewProps {
    orders: Order[];
    quotes: Quote[];
    incidentStats?: { daysSince: number, status: 'green' | 'yellow' | 'red', latestDate: Date | null };
}

export const HomeView: React.FC<HomeViewProps> = ({
    orders,
    quotes,
    incidentStats = { daysSince: 14, status: 'green', latestDate: null }
}) => {
    const { isFocusMode } = useOutletContext<any>() || {};
    const navigate = useNavigate();



    // Single source of truth for quality stats with absolute fallback
    const daysWithoutIssues = incidentStats?.daysSince ?? 0;

    // Carousel State
    const [currentView, setCurrentView] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const [isAutoPlaying, setIsAutoPlaying] = useState(true);
    const [selectedSeller, setSelectedSeller] = useState<string>('all');

    // Extract list of all unique sellers
    const sellers = useMemo(() => {
        const set = new Set<string>();
        safeArray(quotes || []).forEach((q: Quote) => {
            if (!isValidQuoteForMetrics(q)) return;
            const name = getQuoteSellerName(q);
            set.add(name);
        });
        return Array.from(set).sort();
    }, [quotes]);

    // Auto-play interval
    useEffect(() => {
        if (!isAutoPlaying) return;

        const interval = setInterval(() => {
            setCurrentView(prev => {
                if (prev === 'daily') return 'weekly';
                if (prev === 'weekly') return 'monthly';
                return 'daily';
            });
        }, 8000);

        return () => clearInterval(interval);
    }, [isAutoPlaying]);

    // Process data for the analytical chart
    const { dailyData, weeklyData, monthlyData, kpis, teamBreakdown } = useMemo(() => {
        // [HOME DIAG] Diagnostic Data Point Initialization (Governance V4)
        const res = { 
            dailyData: [] as any[], 
            weeklyData: [] as any[], 
            monthlyData: [] as any[], 
            teamBreakdown: [] as { name: string; count: number }[],
            kpis: { 
                quotesToday: 0, 
                approvedToday: 0, 
                globalConversion: 0, 
                inProduction: 0, 
                waitingInstallation: 0, 
                finishedThisMonth: 0, 
                inMeasuring: 0,
                highValueStalled: 0
            } 
        };

        try {
            const now = new Date();
            const today = now;
            const todayLocal = getLocalDateInTimezone(now, 'America/Sao_Paulo') || now;
            
            const safeQuotes = safeArray(quotes || []);
            const safeOrders = orders || [];

            const quotesByDateMap = buildQuotesByDateMap(safeQuotes, 'America/Sao_Paulo');

            // --- DEV TEMPORARY AUDIT ---
            if (process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost') {
                const auditList = safeQuotes.map(q => {
                    const resolvedTotal = Number(q.totalAmount || q.commercialTotal || q.finalTotal || q.total || 0);
                    const valid = isValidQuoteForMetrics(q);
                    let exclusionReason = '';
                    if (!valid) {
                        if (q.isDeleted === true || q.deleted === true || q.hiddenFromDashboard === true) exclusionReason = 'Deleted Flag';
                        else if (['deleted', 'cancelled', 'cancelado'].includes(String(q.status).toLowerCase())) exclusionReason = 'Status Cancelled/Deleted';
                        else if (q.quoteStage === 'draft_zero') exclusionReason = 'Draft Zero';
                        else if (isNaN(resolvedTotal) || resolvedTotal <= 0) exclusionReason = 'Total <= 0';
                        else exclusionReason = 'Unknown';
                    }

                    return {
                        id: String(q.id).slice(-6),
                        protocolo: q.protocolNumber || 'N/A',
                        cliente: q.customerName,
                        vendedor: getSellerNameFromQuote(q),
                        createdAt_bruto: q.createdAt,
                        createdDate_bruto: q.createdDate,
                        date_bruto: q.date,
                        quoteDate_bruto: q.quoteDate,
                        dateKey: getQuoteCreatedDateKey(q, 'America/Sao_Paulo'),
                        totalResolvido: resolvedTotal,
                        status: q.status,
                        deleted: q.deleted,
                        isDeleted: q.isDeleted,
                        hiddenFromDashboard: q.hiddenFromDashboard,
                        valido: valid ? 'SIM' : 'NAO',
                        motivoExclusao: exclusionReason
                    };
                });
                
                console.groupCollapsed('[DASHBOARD AUDIT] Lista detalhada de Orçamentos (Hoje)');
                console.table(auditList);
                console.groupEnd();

                const summaryMap = Object.keys(quotesByDateMap).map(key => ({
                    dateKey: key,
                    total: quotesByDateMap[key].length
                })).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
                
                console.groupCollapsed('[DASHBOARD AUDIT] Resumo por data (Quotes válidos)');
                console.table(summaryMap);
                console.groupEnd();
            }
            // --- END AUDIT ---

            // Generate todayKey based on the local time in SP
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Sao_Paulo',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            const parts = formatter.formatToParts(now);
            const todayYear = parts.find(p => p.type === 'year')?.value;
            const todayMonth = parts.find(p => p.type === 'month')?.value;
            const todayDay = parts.find(p => p.type === 'day')?.value;
            const todayKey = `${todayYear}-${todayMonth}-${todayDay}`;

            // Obter orçamentos válidos criados hoje no fuso de São Paulo (unfiltered by selectedSeller for full team overview)
            const quotesTodayList = quotesByDateMap[todayKey] || [];

            // Operational Stage Filter
            const isApproved = (q: Quote) => {
                if (!q) return false;
                const stage = getEffectiveWorkflowStage(q);
                return !['pre_orcamento', 'cancelado'].includes(stage);
            };

            // Group by seller for team breakdown (always unfiltered for full team overview)
            const breakdownMap = new Map<string, number>();
            quotesTodayList.forEach((q: Quote) => {
                try {
                    const name = getQuoteSellerName(q);
                    breakdownMap.set(name, (breakdownMap.get(name) || 0) + 1);
                } catch (e) {
                    console.warn("[Dashboard breakdownMap] Error processing quote item:", q, e);
                }
            });

            res.teamBreakdown = Array.from(breakdownMap.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);

            // Filter quotes by selected seller for the remaining dashboard metrics
            const isAll = !selectedSeller || 
                          selectedSeller === 'all' || 
                          selectedSeller === 'Todos da empresa' || 
                          selectedSeller === '' ||
                          selectedSeller === 'undefined' ||
                          selectedSeller === 'null';

            // Filter safeQuotes for general stats (conversion rate, charts, lists)
            const filteredQuotes = isAll
                ? safeQuotes 
                : safeQuotes.filter(q => {
                    try {
                        return normalizeText(getQuoteSellerName(q)) === normalizeText(selectedSeller);
                    } catch (e) {
                        return false;
                    }
                });

            // 1. Forensic KPI Mapping using filtered quotes
            const quotesTodayListFiltered = isAll 
                ? quotesTodayList 
                : quotesTodayList.filter(q => normalizeText(getQuoteSellerName(q)) === normalizeText(selectedSeller));

            const approvedTodayList = quotesTodayListFiltered.filter(isApproved);

            res.kpis.quotesToday = quotesTodayListFiltered.length;
            res.kpis.approvedToday = approvedTodayList.length;

            const filteredValidQuotes = filteredQuotes.filter(isValidQuoteForMetrics);
            const totalQuotesFiltered = filteredValidQuotes.length;
            
            let totalApprovedFilteredCount = 0;
            filteredValidQuotes.forEach(q => {
                try {
                    if (isApproved(q)) totalApprovedFilteredCount++;
                } catch (e) {}
            });
            res.kpis.globalConversion = totalQuotesFiltered > 0 ? Math.round((totalApprovedFilteredCount / totalQuotesFiltered) * 100) : 0;

            res.kpis.inProduction = safeArray(safeOrders).filter(o => o.status === 'production' || o.status === 'production_queue').length;
            res.kpis.waitingInstallation = safeArray(safeOrders).filter(o => o.status === 'ready_for_conference' || o.status === 'installation').length;
    
            let waitingMeasureCount = 0;
            filteredQuotes.forEach(q => {
                try {
                    if (isValidQuoteForMetrics(q) && getEffectiveWorkflowStage(q) === 'aguardando_medicao') waitingMeasureCount++;
                } catch (e) {}
            });
            res.kpis.inMeasuring = waitingMeasureCount;
            
            // High Value Stalled Monitor using filtered quotes
            let stalledCount = 0;
            filteredQuotes.forEach(q => {
                try {
                    if (isValidQuoteForMetrics(q)) {
                        const status = getQuoteAlertStatus(q);
                        if (status.level !== 'none') stalledCount++;
                    }
                } catch (e) {}
            });
            res.kpis.highValueStalled = stalledCount;

            res.kpis.finishedThisMonth = safeArray(safeOrders).filter(o => {
                if (getEffectiveOrderStage(o) !== 'finalizado') return false;
                const completionDate = o.completionDate || o.updatedAt || o.createdAt;
                if (!completionDate) return false;
                const date = safeParseISO(completionDate);
                return date && !isNaN(date.getTime()) && date.getTime() >= startOfMonth(today).getTime();
            }).length;

            // 2. Analytical Series Generator (Daily) using the filtered map
            const filteredQuotesByDateMap = buildQuotesByDateMap(filteredQuotes, 'America/Sao_Paulo');
            for (let i = 6; i >= 0; i--) {
                const date = subDays(today, i);
                if (!date || isNaN(date.getTime())) continue;

                const formatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'America/Sao_Paulo',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                });
                const parts = formatter.formatToParts(date);
                const spYear = parts.find(p => p.type === 'year')?.value;
                const spMonth = parts.find(p => p.type === 'month')?.value;
                const spDay = parts.find(p => p.type === 'day')?.value;
                const dateKey = `${spYear}-${spMonth}-${spDay}`;

                const quotesOnDate = filteredQuotesByDateMap[dateKey] || [];
                const dateSP = getLocalDateInTimezone(date, 'America/Sao_Paulo') || date;

                res.dailyData.push({
                    name: format(dateSP, 'dd/MM'),
                    val: quotesOnDate.length
                });
            }

            // 3. Analytical Series Generator (Weekly) using filtered quotes
            for (let i = 3; i >= 0; i--) {
                const dateLocal = subWeeks(todayLocal, i);
                if (!dateLocal || isNaN(dateLocal.getTime())) continue;

                const start = startOfWeek(dateLocal, { weekStartsOn: 1 }).getTime();
                const end = endOfWeek(dateLocal, { weekStartsOn: 1 }).getTime();

                let count = 0;
                filteredQuotes.forEach(q => {
                    try {
                        if (!isValidQuoteForMetrics(q)) return;
                        const dbVal = q.createdAt || 
                                      (q as any).createdDate || 
                                      (q as any).quoteDate || 
                                      (q as any).date;
                        if (!dbVal) return;
                        const quoteLocalDate = getLocalDateInTimezone(dbVal, 'America/Sao_Paulo');
                        if (!quoteLocalDate) return;

                        const time = quoteLocalDate.getTime();
                        if (time >= start && time <= end) {
                            count++;
                        }
                    } catch (e) {}
                });

                res.weeklyData.push({
                    name: `S${4-i}`,
                    val: count
                });
            }

            // 4. Analytical Series Generator (Monthly) using filtered quotes
            for (let i = 5; i >= 0; i--) {
                const dateLocal = subMonths(todayLocal, i);
                if (!dateLocal || isNaN(dateLocal.getTime())) continue;

                const start = startOfMonth(dateLocal).getTime();
                const end = endOfMonth(dateLocal).getTime();

                let count = 0;
                filteredQuotes.forEach(q => {
                    try {
                        if (!isValidQuoteForMetrics(q)) return;
                        const dbVal = q.createdAt || 
                                      (q as any).createdDate || 
                                      (q as any).quoteDate || 
                                      (q as any).date;
                        if (!dbVal) return;
                        const quoteLocalDate = getLocalDateInTimezone(dbVal, 'America/Sao_Paulo');
                        if (!quoteLocalDate) return;

                        const time = quoteLocalDate.getTime();
                        if (time >= start && time <= end) {
                            count++;
                        }
                    } catch (e) {}
                });

                res.monthlyData.push({
                    name: format(dateLocal, 'MMM', { locale: ptBR }),
                    val: count
                });
            }
        } catch (err) {
            console.error("[HOME ERROR] Analytical engine failure:", err);
            // Defensive Logging via Governance layer
            if (typeof reportDataIssue === 'function') {
                reportDataIssue('HOME_ANALYTICS_FATAL', 'home', 'useMemo', { error: String(err) }, 'Fatal crash in dashboard analytics processing', 'critical');
            }
        }

        return res;
    }, [quotes, orders, selectedSeller]);
 
    // Final normalization before render
    const safeKpis = kpis ?? { quotesToday: 0, approvedToday: 0, globalConversion: 0, inProduction: 0, waitingInstallation: 0, finishedThisMonth: 0, inMeasuring: 0, highValueStalled: 0 };
    const safeTeamBreakdown = teamBreakdown ?? [];
    const activeChartData = (currentView === 'daily' ? dailyData : currentView === 'weekly' ? weeklyData : monthlyData) ?? [];
    const periodTitle = currentView === 'daily' ? 'Orçamentos por dia' : currentView === 'weekly' ? 'Orçamentos por semana' : 'Orçamentos por mês';

    // Verify if we have any data to show
    const hasTotalData = safeArray(activeChartData).some((d: any) => d.val > 0);
 
    return (
        <div className="space-y-[var(--density-gap)] animate-in fade-in duration-500 max-w-full mx-auto pb-4">
            
            {/* Filter Bar */}
            {!isFocusMode && (
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-100 dark:border-white/5">
                    <div>
                        <h2 className="text-base font-black text-slate-800 dark:text-white uppercase tracking-wider">Painel Executivo</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Visão geral do desempenho da empresa</p>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Filtrar por Vendedor:</label>
                        <select 
                            value={selectedSeller} 
                            onChange={(e) => setSelectedSeller(e.target.value)}
                            className="w-full sm:w-56 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 outline-none shadow-sm transition-all focus:border-blue-500/50"
                        >
                            <option value="all">🏢 Todos da empresa</option>
                            {sellers.map(name => (
                                <option key={name} value={name}>👤 {name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}
            
            {/* High Priority Alerts - Stalled Quotes >= 5k */}
            {safeKpis.highValueStalled > 0 && !isFocusMode && (
                <div 
                    onClick={() => navigate('/follow-up')}
                    className="group cursor-pointer p-6 rounded-[2.5rem] bg-rose-50 border border-rose-100 flex flex-col md:flex-row items-center justify-between gap-6 transition-all hover:shadow-2xl hover:shadow-rose-100/50"
                >
                    <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-3xl bg-rose-500 flex items-center justify-center text-white shadow-xl shadow-rose-200 animate-pulse">
                            <Zap className="w-8 h-8" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-rose-900 leading-tight">Follow-up Necessário!</h3>
                            <p className="text-sm font-bold text-rose-600 uppercase tracking-widest mt-1">Existem {safeKpis.highValueStalled} orçamentos de alto valor sem retorno</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="hidden md:block text-[10px] font-black text-rose-400 uppercase tracking-widest group-hover:text-rose-600 transition-colors">Ver todos agora</span>
                        <div className="h-14 w-14 rounded-3xl bg-white border border-rose-200 flex items-center justify-center text-rose-500 group-hover:translate-x-1 transition-transform">
                            <ArrowUpRight className="w-6 h-6" />
                        </div>
                    </div>
                </div>
            )}

            {/* FOCUS MODE KPI ROW */}
            {isFocusMode && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in slide-in-from-top-4 duration-500">
                    <div className="bg-slate-900 text-white p-6 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Produção Ativa</span>
                        <span className="text-3xl font-black">{safeKpis.inProduction}</span>
                    </div>
                    <div className="bg-slate-900 text-white p-6 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Instalações</span>
                        <span className="text-3xl font-black">{safeKpis.waitingInstallation}</span>
                    </div>
                    <div className="bg-slate-900 text-white p-6 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Conversão</span>
                        <span className="text-3xl font-black">{safeKpis.globalConversion}%</span>
                    </div>
                    <div className="bg-slate-900 text-white p-6 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Qualidade</span>
                        <span className="text-3xl font-black">{daysWithoutIssues} d</span>
                    </div>
                </div>
            )}
            
            {/* KPI ROW - ERP STYLE HIGH DENSITY */}
            {!isFocusMode && (<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-[var(--density-gap)]">
                
                <Card className="rocha-card group hover:border-blue-500/50 transition-all">
                    <CardContent className="p-0">
                        <div className="flex flex-col">
                            <div className="flex justify-between items-start mb-0.5">
                                <div className="p-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-md">
                                    <FileText className="h-3.5 w-3.5" />
                                </div>
                                <div className="rocha-text-label">Hoje</div>
                            </div>
                            <div className="rocha-text-value text-2xl">
                                {safeKpis.quotesToday || 0}
                            </div>
                            <div className="rocha-text-label mt-0.5">Orçamentos</div>
                        </div>
                    </CardContent>
                </Card>
 
                <Card className="rocha-card group hover:border-emerald-500/50 transition-all">
                    <CardContent className="p-0">
                        <div className="flex flex-col">
                            <div className="flex justify-between items-start mb-0.5">
                                <div className="p-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-md">
                                    <CheckCircle className="h-3.5 w-3.5" />
                                </div>
                                <div className="rocha-text-label">Fluxo</div>
                            </div>
                            <div className="rocha-text-value text-2xl">
                                {safeKpis.approvedToday || 0}
                            </div>
                            <div className="rocha-text-label mt-0.5">Aprovações</div>
                        </div>
                    </CardContent>
                </Card>
 
                <Card className="rocha-card group hover:border-purple-500/50 transition-all">
                    <CardContent className="p-0">
                        <div className="flex flex-col">
                            <div className="flex justify-between items-start mb-0.5">
                                <div className="p-1 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-md">
                                    <Target className="h-3.5 w-3.5" />
                                </div>
                                <div className="rocha-text-label">Eficiência</div>
                            </div>
                            <div className="rocha-text-value text-2xl">
                                {safeKpis.globalConversion || 0}%
                            </div>
                            <div className="rocha-text-label mt-0.5">Conversão</div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="rocha-card group hover:border-indigo-500/50 transition-all">
                    <CardContent className="p-0">
                        <div className="flex flex-col">
                            <div className="flex justify-between items-start mb-0.5">
                                <div className="p-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-md">
                                    <Ruler className="h-3.5 w-3.5" />
                                </div>
                                <div className="rocha-text-label">Campo</div>
                            </div>
                            <div className="rocha-text-value text-2xl">
                                {safeKpis.inMeasuring || 0}
                            </div>
                            <div className="rocha-text-label mt-0.5">Em Medição</div>
                        </div>
                    </CardContent>
                </Card>
 
                <Card className="rocha-card group hover:border-amber-500/50 transition-all">
                    <CardContent className="p-0">
                        <div className="flex flex-col">
                            <div className="flex justify-between items-start mb-0.5">
                                <div className="p-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-md">
                                    <ShoppingCart className="h-3.5 w-3.5" />
                                </div>
                                <div className="rocha-text-label">Fábrica</div>
                            </div>
                            <div className="rocha-text-value text-2xl">
                                {safeKpis.inProduction || 0}
                            </div>
                            <div className="rocha-text-label mt-0.5">Produção</div>
                        </div>
                    </CardContent>
                </Card>
 
                <Card className="rocha-card group hover:border-cyan-500/50 transition-all">
                    <CardContent className="p-0">
                        <div className="flex flex-col">
                            <div className="flex justify-between items-start mb-0.5">
                                <div className="p-1 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 rounded-md">
                                    <Activity className="h-3.5 w-3.5" />
                                </div>
                                <div className="rocha-text-label">Logística</div>
                            </div>
                            <div className="rocha-text-value text-2xl">
                                {safeKpis.waitingInstallation || 0}
                            </div>
                            <div className="rocha-text-label mt-0.5">Instalação</div>
                        </div>
                    </CardContent>
                </Card>
 
                <Card className="rocha-card group hover:border-brand-emerald/50 transition-all">
                    <CardContent className="p-0">
                        <div className="flex flex-col">
                            <div className="flex justify-between items-start mb-0.5">
                                <div className="p-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-md">
                                    <TrendingUp className="h-3.5 w-3.5" />
                                </div>
                                <div className="rocha-text-label">Mês</div>
                            </div>
                            <div className="rocha-text-value text-2xl">
                                {safeKpis.finishedThisMonth || 0}
                            </div>
                            <div className="rocha-text-label mt-0.5">Finalizadas</div>
                        </div>
                    </CardContent>
                </Card>
 
                <Card className={cn(
                    "rocha-card group transition-all",
                    incidentStats?.status === 'green' ? "hover:border-emerald-500/50" : 
                    incidentStats?.status === 'yellow' ? "hover:border-amber-500/50" : "hover:border-rose-500/50"
                )}>
                    <CardContent className="p-0">
                        <div className="flex flex-col">
                            <div className="flex justify-between items-start mb-0.5">
                                <div className={cn(
                                    "p-1 rounded-md",
                                    incidentStats?.status === 'green' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" :
                                    incidentStats?.status === 'yellow' ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400" :
                                    "bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400"
                                )}>
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                </div>
                                <div className="rocha-text-label">Qualidade</div>
                            </div>
                            <div className="rocha-text-value text-2xl">
                                {daysWithoutIssues}
                            </div>
                            <div className="rocha-text-label mt-0.5">Dias Sem Avarias</div>
                        </div>
                    </CardContent>
                </Card>
            </div>
            )}

            {/* PRODUÇÃO DA EQUIPE HOJE */}
            {!isFocusMode && (
                <Card className="rocha-panel">
                    <CardHeader className="py-4 px-6 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Users className="h-4 w-4 text-blue-500" />
                            <CardTitle className="rocha-text-title uppercase tracking-widest text-xs">
                                Produção da Equipe Hoje
                            </CardTitle>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Fuso Horário: America/Sao_Paulo
                        </span>
                    </CardHeader>
                    <CardContent className="py-6 px-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-baseline gap-2">
                                <span className="rocha-text-label">Total da equipe hoje:</span>
                                <span className="text-3xl font-black text-slate-900 dark:text-white font-mono leading-none">
                                    {safeKpis.quotesToday}
                                </span>
                                <span className="rocha-text-label uppercase tracking-widest text-[9px]">
                                    {safeKpis.quotesToday === 1 ? 'orçamento' : 'orçamentos'}
                                </span>
                            </div>
                            
                            <div className="flex flex-wrap gap-2.5">
                                {safeTeamBreakdown.length === 0 ? (
                                    <span className="rocha-text-label italic">Nenhum orçamento válido hoje no tenant.</span>
                                ) : (
                                    safeTeamBreakdown.map(seller => (
                                        <div 
                                            key={seller.name} 
                                            className="flex items-center gap-2 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 px-4 py-2 rounded-2xl shadow-sm"
                                        >
                                            <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight">
                                                {seller.name}:
                                            </span>
                                            <span className="text-sm font-black text-slate-800 dark:text-white font-mono">
                                                {seller.count}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
 
            {/* ANALYTICAL CHART */}
            <Card className="rocha-panel">
                <CardHeader className="py-3 px-6 border-b border-slate-100 dark:border-white/5">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <CardTitle className="rocha-text-title flex items-center gap-3">
                            <TrendingUp className="h-4 w-4 text-brand-emerald" />
                            {periodTitle}
                        </CardTitle>
                        
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                            {(['daily', 'weekly', 'monthly'] as const).map(view => (
                                <button
                                    key={view}
                                    onClick={() => {
                                        setIsAutoPlaying(false);
                                        setCurrentView(view);
                                    }}
                                    className={cn(
                                        "px-4 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all",
                                        currentView === view 
                                            ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" 
                                            : "text-slate-400 hover:text-slate-600"
                                    )}
                                >
                                    {view === 'daily' ? 'Dia' : view === 'weekly' ? 'Semana' : 'Mês'}
                                </button>
                            ))}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 px-6">
                    <div className="min-h-[340px] h-[340px] w-full flex items-center justify-center relative">
                        {!hasTotalData ? (
                            <div className="flex flex-col items-center gap-4 text-slate-400 animate-in fade-in duration-1000">
                                <Activity className="w-12 h-12 opacity-20" />
                                <p className="text-[10px] font-black uppercase tracking-[0.2em]">Sem movimentação no período</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <BarChart
                                    data={activeChartData}
                                    margin={{ top: 20, right: 20, left: -25, bottom: 0 }}
                                    barGap={8}
                                >
                                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#e2e8f0" opacity={0.3} />
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 900 }}
                                        dy={10}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 900 }}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(0, 0, 0, 0.02)' }}
                                        contentStyle={{
                                            backgroundColor: '#1e293b',
                                            border: 'none',
                                            borderRadius: '8px',
                                            color: '#fff',
                                            fontSize: '11px',
                                            padding: '12px'
                                        }}
                                        labelStyle={{ fontWeight: '900', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                                    />
                                    <Bar
                                        dataKey="val"
                                        fill="#0ea5e9"
                                        radius={[4, 4, 0, 0]}
                                        barSize={50}
                                        animationDuration={1500}
                                    >
                                        <LabelList 
                                            dataKey="val" 
                                            position="top" 
                                            fill="#020617" 
                                            fontSize={10} 
                                            fontWeight="900" 
                                            offset={10}
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </CardContent>
                </Card>
        </div>
    );
};
