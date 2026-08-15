import { safeArray } from '../lib/dataDiagnostics';
import { safeParseISO, formatVisualDate } from '../lib/dateUtils';
import { useMemo, useState, useEffect } from 'react';
import { useClients } from './useClients';
import { useInfluencers } from './useInfluencers';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import {  isAfter, isBefore, subDays, startOfDay, format } from 'date-fns';
import type { Order, Client, Quote } from '../types';
import { isInfluencer } from '../lib/intelligenceUtils';
import { calculateQuoteScore, getOpportunityTimer, calculateLearningMetrics, generateStrategicInsights, type LearningMetrics, type StrategicInsight } from '../lib/commercialAssistant';

export interface ExecutiveStats {
    totalRevenue: number;
    projectedRevenue: number;
    revenueAtRisk: number;
    avgTicket: number;
    conversionRate: number;
    totalOrders: number;
    activeQuotes: number;
    deltas: {
        revenue: number;
        avgTicket: number;
        conversion: number;
        orders: number;
    };
}

export interface ExecutiveDashboardData {
    summary: ExecutiveStats;
    revenueHistory: { date: string; value: number }[];
    pipelineData: { name: string; value: number; count: number; color: string }[];
    actionItems: { id: string; type: 'risk' | 'opportunity' | 'delay'; title: string; subtitle: string; priority: 'high' | 'medium'; amount: number }[];
    geoData: { city: string; revenue: number; orders: number; avgTicket: number }[];
    originData: { name: string; value: number; leads: number; sales: number; conversion: number; revenue: number }[];
    stoneData: { name: string; revenue: number; area: number; avgTicket: number }[];
    influencerData: { name: string; leads: number; sales: number; conversion: number; revenue: number }[];
    learningMetrics: LearningMetrics;
    strategicInsights: StrategicInsight[];
    isLoading: boolean;
}

export const useExecutiveDashboard = (periodDays: number = 30) => {
    const { profile } = useAuth();
    const { clients } = useClients();
    const { influencers } = useInfluencers();
    const [orders, setOrders] = useState<Order[]>([]);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!profile?.companyId) return;
        
        const qOrders = query(collection(db, 'pedidos'), where('companyId', '==', profile.companyId));
        const unsubOrders = onSnapshot(qOrders, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setOrders(safeArray(data).filter(o => o.status !== 'cancelled'));
            setIsLoading(false);
        });

        const qQuotes = query(collection(db, 'orcamentos'), where('companyId', '==', profile.companyId));
        const unsubQuotes = onSnapshot(qQuotes, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Quote));
            setQuotes(safeArray(data).filter(q => !q.isDeleted));
        });

        return () => {
            unsubOrders();
            unsubQuotes();
        };
    }, [profile?.companyId]);

    const dashboard = useMemo(() => {
        const now = startOfDay(new Date());
        const window1Start = subDays(now, periodDays);
        const window2Start = subDays(now, periodDays * 2);

        const filterByWindow = (data: any[], start: Date, end: Date) => {
            return safeArray(data).filter(item => {
                const date = item.createdAt ? safeParseISO(item.createdAt) : null;
                return date && isAfter(date, start) && isBefore(date, end);
            });
        };

        const currentOrders = filterByWindow(orders, window1Start, now);
        const previousOrders = filterByWindow(orders, window2Start, window1Start);
        const currentClients = filterByWindow(clients, window1Start, now);
        const previousClients = filterByWindow(clients, window2Start, window1Start);
        const currentQuotes = filterByWindow(quotes, window1Start, now);

        // 1. Summary & Deltas
        const calcSummary = (ordersList: Order[], clientsList: Client[]) => {
            const revenue = safeArray(ordersList).reduce((acc, o) => acc + (o.commercialTotal || o.totalAmount || 0), 0);
            const totalOrders = ordersList.length;
            const avgTicket = totalOrders > 0 ? revenue / totalOrders : 0;
            const conversion = clientsList.length > 0 ? (totalOrders / clientsList.length) * 100 : 0;
            return { revenue, avgTicket, conversion, totalOrders };
        };

        const s1 = calcSummary(currentOrders, currentClients);
        const s2 = calcSummary(previousOrders, previousClients);

        const calcDelta = (curr: number, prev: number) => prev > 0 ? ((curr - prev) / prev) * 100 : 0;

        // Pipeline Calculation
        const projectedRevenue = safeArray(quotes).filter(q => q.status === 'approved' && !q.convertedToOrderId)
            .reduce((acc, q) => acc + (q.commercialTotal || 0), 0);
        
        const revenueAtRisk = safeArray(quotes).filter(q => q.status === 'sent' && q.nextAction === 'delay')
            .reduce((acc, q) => acc + (q.commercialTotal || 0), 0);

        const summary: ExecutiveStats = {
            totalRevenue: s1.revenue,
            projectedRevenue,
            revenueAtRisk,
            avgTicket: s1.avgTicket,
            conversionRate: s1.conversion,
            totalOrders: s1.totalOrders,
            activeQuotes: quotes.length,
            deltas: {
                revenue: calcDelta(s1.revenue, s2.revenue),
                avgTicket: calcDelta(s1.avgTicket, s2.avgTicket),
                conversion: calcDelta(s1.conversion, s2.conversion),
                orders: calcDelta(s1.totalOrders, s2.totalOrders)
            }
        };

        // 2. Pipeline Data
        const pipelineStages = [
            { id: 'pre_orcamento', name: 'Prospecção', color: '#94A3B8' },
            { id: 'pos_medicao', name: 'Proposta Técnica', color: '#6366F1' },
            { id: 'aprovado', name: 'Aprovado (Cofre)', color: '#10B981' }
        ];

        const pipelineData = safeArray(pipelineStages).map(stage => {
            const stageQuotes = safeArray(quotes).filter(q => q.quoteStage === stage.id);
            return {
                name: stage.name,
                value: safeArray(stageQuotes).reduce((acc, q) => acc + (q.commercialTotal || 0), 0),
                count: stageQuotes.length,
                color: stage.color
            };
        });

        // 3. Action Items Logic
        const actionItems: ExecutiveDashboardData['actionItems'] = [];
        
        // High risk: Approved > 5 days without conversion
        safeArray(quotes).filter(q => q.status === 'approved' && !q.convertedToOrderId).forEach(q => {
            const date = q.approvedAt ? safeParseISO(q.approvedAt) : null;
            if (date && isBefore(date, subDays(now, 5))) {
                actionItems.push({
                    id: q.id,
                    type: 'risk',
                    title: `Fechamento Travado: ${q.customerName}`,
                    subtitle: 'Aprovado há 5+ dias sem ordem de serviço.',
                    priority: 'high',
                    amount: q.commercialTotal || 0
                });
            }
        });

        // High potential: Quotes > 8k in technical stage
        safeArray(quotes).filter(q => q.quoteStage === 'pos_medicao' && (q.commercialTotal || 0) > 8000).forEach(q => {
            actionItems.push({
                id: q.id,
                type: 'opportunity',
                title: `Ticket Ouro: ${q.customerName}`,
                subtitle: 'Oportunidade de alto valor aguardando fechamento.',
                priority: 'medium',
                amount: q.commercialTotal || 0
            });
        });

        // 4. Geography
        const geoMap: Record<string, { revenue: number; orders: number }> = {};
        currentOrders.forEach(o => {
            const cl = clients.find(c => c.id === o.clientId);
            const city = cl?.city || 'Outra';
            if (!geoMap[city]) geoMap[city] = { revenue: 0, orders: 0 };
            geoMap[city].revenue += (o.commercialTotal || o.totalAmount || 0);
            geoMap[city].orders++;
        });

        const geoData = Object.entries(geoMap).map(([city, data]) => ({
            city,
            revenue: data.revenue,
            orders: data.orders,
            avgTicket: data.orders > 0 ? data.revenue / data.orders : 0
        })).sort((a,b) => b.revenue - a.revenue).slice(0, 10);

        // 5. Origin
        const originMap: Record<string, { leads: number; sales: number; revenue: number }> = {};
        safeArray(clients).forEach(c => {
            const origin = c.origin || 'Outro';
            if (!originMap[origin]) originMap[origin] = { leads: 0, sales: 0, revenue: 0 };
            const inPeriod = c.createdAt && ((() => { const d = safeParseISO(c.createdAt); return d ? isAfter(d, window1Start) : false; })());
            if (inPeriod) originMap[origin].leads++;
        });
        currentOrders.forEach(o => {
            const cl = clients.find(c => c.id === o.clientId);
            const origin = cl?.origin || 'Outro';
            if (!originMap[origin]) originMap[origin] = { leads: 0, sales: 0, revenue: 0 };
            originMap[origin].sales++;
            originMap[origin].revenue += (o.commercialTotal || o.totalAmount || 0);
        });

        const originData = Object.entries(originMap).map(([name, data]) => ({
            name,
            value: data.revenue,
            leads: data.leads,
            sales: data.sales,
            conversion: data.leads > 0 ? (data.sales / data.leads) * 100 : 0,
            revenue: data.revenue
        })).sort((a,b) => b.revenue - a.revenue);

        // 6. Stones
        const stoneMap: Record<string, { revenue: number; area: number }> = {};
        currentOrders.forEach(o => {
            safeArray(o.items).forEach(item => {
                const material = item.material || 'Outro';
                if (!stoneMap[material]) stoneMap[material] = { revenue: 0, area: 0 };
                stoneMap[material].revenue += (item.totalPrice || 0);
                stoneMap[material].area += (item.area || 0);
            });
        });

        const stoneData = Object.entries(stoneMap).map(([name, data]) => ({
            name,
            revenue: data.revenue,
            area: data.area,
            avgTicket: data.area > 0 ? data.revenue / data.area : 0
        })).sort((a,b) => b.revenue - a.revenue).slice(0, 10);

        // 7. Influencers
        const infMap: Record<string, { leads: number; sales: number; revenue: number; name: string }> = {};
        safeArray(clients).forEach(c => {
            if (c.influencerId || isInfluencer(c.origin)) {
                const id = c.influencerId || c.influencerName || 'Desconhecido';
                const name = c.influencerName || id;
                if (!infMap[id]) infMap[id] = { leads: 0, sales: 0, revenue: 0, name };
                const inPeriod = c.createdAt && ((() => { const d = safeParseISO(c.createdAt); return d ? isAfter(d, window1Start) : false; })());
                if (inPeriod) infMap[id].leads++;
            }
        });
        currentOrders.forEach(o => {
            const cl = clients.find(c => c.id === o.clientId);
            if (cl?.influencerId || isInfluencer(cl?.origin)) {
                const id = cl?.influencerId || cl?.influencerName || 'Desconhecido';
                const name = cl?.influencerName || id;
                if (!infMap[id]) infMap[id] = { leads: 0, sales: 0, revenue: 0, name };
                infMap[id].sales++;
                infMap[id].revenue += (o.commercialTotal || o.totalAmount || 0);
            }
        });

        const influencerData = Object.entries(infMap).map(([id, data]) => ({
            name: data.name,
            leads: data.leads,
            sales: data.sales,
            conversion: data.leads > 0 ? (data.sales / data.leads) * 100 : 0,
            revenue: data.revenue
        })).sort((a,b) => b.revenue - a.revenue);

        // 8. Revenue History (Last 30 days)
        const historyDays = Array.from({ length: periodDays }, (_, i) => subDays(now, i)).reverse();
        const revenueHistory = safeArray(historyDays).map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayRevenue = safeArray(currentOrders).filter(o => o.createdAt && formatVisualDate(o.createdAt, 'yyyy-MM-dd') === dateStr)
                                          .reduce((acc, o) => acc + (o.commercialTotal || o.totalAmount || 0), 0);
            return { date: format(day, 'dd/MM'), value: dayRevenue };
        });
        // 9. Learning & Strategy
        const learningMetrics = calculateLearningMetrics(quotes);
        const strategicInsights = generateStrategicInsights(learningMetrics);

        return { summary, revenueHistory, pipelineData, actionItems, geoData, originData, stoneData, influencerData, learningMetrics, strategicInsights };
    }, [orders, clients, influencers, quotes, periodDays]);

    const potentialRanking = useMemo(() => {
        return safeArray(quotes)
            .filter(q => q.status === 'sent' || q.status === 'under_review')
            .map(q => ({
                id: q.id,
                customerName: q.customerName,
                score: calculateQuoteScore(q),
                timer: getOpportunityTimer(q),
                total: q.commercialTotal || 0
            }))
            .sort((a,b) => b.score.score - a.score.score)
            .slice(0, 5);
    }, [quotes]);

    return { ...dashboard, potentialRanking, isLoading };
};
