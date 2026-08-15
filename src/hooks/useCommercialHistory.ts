import { safeArray } from '../lib/dataDiagnostics';
import { safeParseISO } from '../lib/dateUtils';
import { useMemo, useState, useEffect } from 'react';
import { useClients } from './useClients';
import { useInfluencers } from './useInfluencers';
import type { Order, Contract } from '../types';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { isAfter, subDays, startOfDay, isBefore } from 'date-fns';
import { isInfluencer, getRegionKey } from '../lib/intelligenceUtils';

export interface HistoricalMetric {
    current: number;
    previous: number;
    delta: number;
    deltaPercent: number;
    trend: 'up' | 'down' | 'neutral';
}

export interface HistoricalEvolutionData {
    general: {
        leads: HistoricalMetric;
        sales: HistoricalMetric;
        conversion: HistoricalMetric;
        volume: HistoricalMetric;
        avgTicket: HistoricalMetric;
    };
    byOrigin: { 
        origin: string; 
        currentLeads: number; 
        previousLeads: number; 
        currentSales: number;
        previousSales: number;
        conversionCurrent: number;
        conversionPrevious: number;
        deltaSales: number;
    }[];
    byInfluencer: {
        id: string;
        name: string;
        currentSales: number;
        previousSales: number;
        currentVolume: number;
        previousVolume: number;
        deltaVolume: number;
        conversionCurrent: number;
        conversionPrevious: number;
    }[];
    byRegion: {
        region: string;
        currentSales: number;
        previousSales: number;
        currentVolume: number;
        previousVolume: number;
        deltaSales: number;
        avgTicketCurrent: number;
        avgTicketPrevious: number;
    }[];
    insights: { type: 'success' | 'warning' | 'info'; message: string }[];
}

export const useCommercialHistory = (periodDays: number = 30) => {
    const { profile } = useAuth();
    const { clients } = useClients();
    const { influencers } = useInfluencers();
    const [orders, setOrders] = useState<Order[]>([]);
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const effectivePeriod = periodDays === 0 ? 365 : periodDays;

    useEffect(() => {
        if (!profile?.companyId) return;
        const qOrders = query(collection(db, 'pedidos'), where('companyId', '==', profile.companyId));
        const qContracts = query(collection(db, 'contratos'), where('companyId', '==', profile.companyId));

        const unsubOrders = onSnapshot(qOrders, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setOrders(data);
        });

        const unsubContracts = onSnapshot(qContracts, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Contract));
            setContracts(data);
            setIsLoading(false);
        });

        return () => {
            unsubOrders();
            unsubContracts();
        };
    }, [profile?.companyId]);

    const calculateMetric = (current: number, previous: number): HistoricalMetric => {
        const delta = current - previous;
        const deltaPercent = previous > 0 ? (delta / previous) * 100 : 0;
        let trend: 'up' | 'down' | 'neutral' = 'neutral';
        if (deltaPercent > 2) trend = 'up';
        else if (deltaPercent < -2) trend = 'down';
        return { current, previous, delta, deltaPercent, trend };
    };

    const history = useMemo(() => {
        const now = startOfDay(new Date());
        const window1Start = subDays(now, effectivePeriod);
        const window2Start = subDays(now, effectivePeriod * 2);

        // --- SALES DEFINITION (CONTRACT-FIRST) ---
        const signedContracts = safeArray(contracts).filter(c => c.contractStatus === 'signed');
        const allSales = [
            ...signedContracts.map(c => ({
                id: c.id,
                clientId: c.clientId,
                totalAmount: c.totalAmount || 0,
                createdAt: c.signedAt || c.createdAt,
                origin: safeArray(clients).find(cl => cl.id === c.clientId)?.origin || 'Outro',
                city: safeArray(clients).find(cl => cl.id === c.clientId)?.city,
                state: safeArray(clients).find(cl => cl.id === c.clientId)?.state,
                zipCode: safeArray(clients).find(cl => cl.id === c.clientId)?.zipCode
            })),
            ...orders.filter(o => {
                const hasContract = safeArray(contracts).some(c => c.orderId === o.id || c.id === o.id || (o.quoteId && c.quoteId === o.quoteId));
                return !hasContract && o.status !== 'cancelled';
            }).map(o => ({
                id: o.id,
                clientId: o.clientId,
                totalAmount: o.totalAmount || 0,
                createdAt: o.createdAt,
                origin: safeArray(clients).find(cl => cl.id === o.clientId)?.origin || 'Outro',
                city: safeArray(clients).find(cl => cl.id === o.clientId)?.city,
                state: safeArray(clients).find(cl => cl.id === o.clientId)?.state,
                zipCode: safeArray(clients).find(cl => cl.id === o.clientId)?.zipCode
            }))
        ];

        const filterByWindow = (data: any[], start: Date, end: Date) => {
            return safeArray(data).filter(item => {
                const date = item.createdAt ? safeParseISO(item.createdAt) : null;
                return date && isAfter(date, start) && !isBefore(date, end);
            });
        };

        const currentWindowSales = filterByWindow(allSales, window1Start, now);
        const previousWindowSales = filterByWindow(allSales, window2Start, window1Start);

        const currentWindowClients = filterByWindow(clients, window1Start, now);
        const previousWindowClients = filterByWindow(clients, window2Start, window1Start);

        // 1. General Metrics
        const general = {
            leads: calculateMetric(currentWindowClients.length, previousWindowClients.length),
            sales: calculateMetric(currentWindowSales.length, previousWindowSales.length),
            conversion: calculateMetric(
                currentWindowClients.length > 0 ? (currentWindowSales.length / currentWindowClients.length) * 100 : 0,
                previousWindowClients.length > 0 ? (previousWindowSales.length / previousWindowClients.length) * 100 : 0
            ),
            volume: calculateMetric(
                safeArray(currentWindowSales).reduce((acc, s) => acc + (s.totalAmount || 0), 0),
                safeArray(previousWindowSales).reduce((acc, s) => acc + (s.totalAmount || 0), 0)
            ),
            avgTicket: calculateMetric(
                currentWindowSales.length > 0 ? safeArray(currentWindowSales).reduce((acc, s) => acc + (s.totalAmount || 0), 0) / currentWindowSales.length : 0,
                previousWindowSales.length > 0 ? safeArray(previousWindowSales).reduce((acc, s) => acc + (s.totalAmount || 0), 0) / previousWindowSales.length : 0
            )
        };

        // 2. By Origin
        const origins = Array.from(new Set([...clients.map(c => c.origin || 'Outro')]));
        const byOrigin = safeArray(origins).map(origin => {
            const cLeads = safeArray(currentWindowClients).filter(c => (c.origin || 'Outro') === origin).length;
            const pLeads = safeArray(previousWindowClients).filter(c => (c.origin || 'Outro') === origin).length;
            const cSales = safeArray(currentWindowSales).filter(s => s.origin === origin).length;
            const pSales = safeArray(previousWindowSales).filter(s => s.origin === origin).length;

            return {
                origin,
                currentLeads: cLeads,
                previousLeads: pLeads,
                currentSales: cSales,
                previousSales: pSales,
                conversionCurrent: cLeads > 0 ? (cSales / cLeads) * 100 : 0,
                conversionPrevious: pLeads > 0 ? (pSales / pLeads) * 100 : 0,
                deltaSales: cSales - pSales
            };
        }).sort((a,b) => b.currentSales - a.currentSales);

        // 3. By Influencer
        const byInfluencer = safeArray(influencers).map(inf => {
            const cClients = safeArray(currentWindowClients).filter(c => isInfluencer(c.origin) && c.influencerId === inf.id);
            const pClients = safeArray(previousWindowClients).filter(c => isInfluencer(c.origin) && c.influencerId === inf.id);
            const cSalesData = safeArray(currentWindowSales).filter(s => {
                const cl = safeArray(clients).find(c => c.id === s.clientId);
                return isInfluencer(cl?.origin) && cl?.influencerId === inf.id;
            });
            const pSalesData = safeArray(previousWindowSales).filter(s => {
                const cl = safeArray(clients).find(c => c.id === s.clientId);
                return isInfluencer(cl?.origin) && cl?.influencerId === inf.id;
            });

            const cVolume = safeArray(cSalesData).reduce((acc, s) => acc + (s.totalAmount || 0), 0);
            const pVolume = safeArray(pSalesData).reduce((acc, s) => acc + (s.totalAmount || 0), 0);

            return {
                id: inf.id,
                name: inf.name,
                currentSales: cSalesData.length,
                previousSales: pSalesData.length,
                currentVolume: cVolume,
                previousVolume: pVolume,
                deltaVolume: cVolume - pVolume,
                conversionCurrent: cClients.length > 0 ? (cSalesData.length / cClients.length) * 100 : 0,
                conversionPrevious: pClients.length > 0 ? (pSalesData.length / pClients.length) * 100 : 0
            };
        }).sort((a,b) => b.currentVolume - a.currentVolume);

        // 4. By Region
        const clientsById = safeArray(clients).reduce((acc, c) => {
            acc[c.id] = c;
            return acc;
        }, {} as Record<string, any>);

        const regionMapCurrent: Record<string, any> = {};
        const regionMapPrevious: Record<string, any> = {};

        currentWindowSales.forEach(s => {
            const client = clientsById[s.clientId];
            const region = getRegionKey(s, client);
            if (!regionMapCurrent[region]) regionMapCurrent[region] = { sales: 0, volume: 0 };
            regionMapCurrent[region].sales++;
            regionMapCurrent[region].volume += (s.totalAmount || 0);
        });

        previousWindowSales.forEach(s => {
            const client = clientsById[s.clientId];
            const region = getRegionKey(s, client);
            if (!regionMapPrevious[region]) regionMapPrevious[region] = { sales: 0, volume: 0 };
            regionMapPrevious[region].sales++;
            regionMapPrevious[region].volume += (s.totalAmount || 0);
        });

        const allRegions = Array.from(new Set([...Object.keys(regionMapCurrent), ...Object.keys(regionMapPrevious)]));
        const byRegion = safeArray(allRegions).map(region => {
            const cData = regionMapCurrent[region] || { sales: 0, volume: 0 };
            const pData = regionMapPrevious[region] || { sales: 0, volume: 0 };
            return {
                region,
                currentSales: cData.sales,
                previousSales: pData.sales,
                currentVolume: cData.volume,
                previousVolume: pData.volume,
                deltaSales: cData.sales - pData.sales,
                avgTicketCurrent: cData.sales > 0 ? cData.volume / cData.sales : 0,
                avgTicketPrevious: pData.sales > 0 ? pData.volume / pData.sales : 0
            };
        }).sort((a,b) => b.currentVolume - a.currentVolume);

        // Insights
        const insights: { type: 'success' | 'warning' | 'info'; message: string }[] = [];
        if (general.conversion.deltaPercent > 5) insights.push({ type: 'success', message: `Ótimo! A taxa de conversão em contratos cresceu ${general.conversion.deltaPercent.toFixed(1)}%.` });
        if (general.sales.deltaPercent < -10) insights.push({ type: 'warning', message: `Atenção: Queda de ${Math.abs(general.sales.deltaPercent).toFixed(1)}% nas assinaturas de contratos.` });
        
        return { general, byOrigin, byInfluencer, byRegion, insights };
    }, [clients, influencers, orders, contracts, isLoading, effectivePeriod]);

    return { history, isLoading };
};
