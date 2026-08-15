import { safeArray } from '../lib/dataDiagnostics';
import { useMemo, useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useCommercialHistory } from './useCommercialHistory';
import type { Quote, Contract } from '../types';

export interface CommercialForecast {
    projectedLeads: number;
    projectedSales: number;
    projectedConversion: number;
    projectedVolume: number;
    projectedAvgTicket: number;
    confidenceLevel: 'high' | 'medium' | 'low';
    trend: 'up' | 'down' | 'stable';
    growthRate: number;
    pipelineVolume: number; // New: Total weighted pipeline
}

export interface ForecastInsight {
    type: 'opportunity' | 'risk' | 'stability' | 'pipeline';
    message: string;
    severity: 'low' | 'medium' | 'high';
}

export const useCommercialForecast = (periodDays: number = 30) => {
    const { profile } = useAuth();
    const { history, isLoading: historyLoading } = useCommercialHistory(periodDays);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!profile?.companyId) return;
        const qQuotes = query(collection(db, 'orcamentos'), where('companyId', '==', profile.companyId));
        const qContracts = query(collection(db, 'contratos'), where('companyId', '==', profile.companyId));

        const unsubQuotes = onSnapshot(qQuotes, (snapshot) => {
            setQuotes(safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Quote)));
        });

        const unsubContracts = onSnapshot(qContracts, (snapshot) => {
            setContracts(safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Contract)));
            setIsLoading(false);
        });

        return () => {
            unsubQuotes();
            unsubContracts();
        };
    }, [profile?.companyId]);

    const forecast = useMemo(() => {
        if (!history || isLoading || historyLoading) return null;

        const { general, byOrigin, byInfluencer, byRegion } = history;

        // --- 1. WEIGHTED PIPELINE CALCULATION ---
        // Weights: Quote (10%), Follow-up (30%), Contract Sent (60%)
        let pipelineVolume = 0;
        let weightedSalesCount = 0;

        quotes.forEach(q => {
            if (['cancelado', 'finalizado', 'converted', 'approved'].includes(q.status) || q.isDeleted) return;
            
            const amount = (q.commercialTotal || 0) + (q.operationalCost || 0) + (q.freight || 0);
            
            // Check if there is a contract sent for this quote
            const relatedContract = contracts.find(c => c.quoteId === q.id);
            if (relatedContract && ['pending', 'viewed', 'company_signed'].includes(relatedContract.contractStatus || '')) {
                pipelineVolume += amount * 0.60;
                weightedSalesCount += 0.60;
            } else if (q.followUpCount && q.followUpCount > 0) {
                pipelineVolume += amount * 0.30;
                weightedSalesCount += 0.30;
            } else {
                pipelineVolume += amount * 0.10;
                weightedSalesCount += 0.10;
            }
        });

        // --- 2. STATISTICAL TREND (Damping 0.7) ---
        const project = (current: number, previous: number) => {
            const delta = current - previous;
            return Math.max(0, current + (delta * 0.7));
        };

        const projectedLeads = project(general.leads.current, general.leads.previous);
        // Combine Weighted Pipeline with Statistical Trend for more accuracy
        const statisticalSales = project(general.sales.current, general.sales.previous);
        const projectedSales = (statisticalSales + weightedSalesCount) / 2;
        
        const statisticalVolume = project(general.volume.current, general.volume.previous);
        const projectedVolume = (statisticalVolume + pipelineVolume) / 2;

        const projectedAvgTicket = project(general.avgTicket.current, general.avgTicket.previous);
        const projectedConversion = projectedLeads > 0 ? (projectedSales / projectedLeads) * 100 : 0;
        
        const growthOverall = general.volume.deltaPercent;
        const trend: 'up' | 'down' | 'stable' = growthOverall > 5 ? 'up' : growthOverall < -5 ? 'down' : 'stable';

        // 3. Confidence Level
        let confidenceLevel: 'high' | 'medium' | 'low' = 'medium';
        const totalSample = general.leads.current + general.leads.previous;
        if (totalSample < 10) confidenceLevel = 'low';
        else if (Math.abs(growthOverall) < 20 && totalSample > 30) confidenceLevel = 'high';

        // 4. Insights Generation
        const insights: ForecastInsight[] = [];

        if (pipelineVolume > general.volume.current) {
            insights.push({
                type: 'pipeline',
                message: `O pipeline atual de R$ ${pipelineVolume.toLocaleString()} supera o faturamento do último ciclo.`,
                severity: 'high'
            });
        }

        const bestOrigin = [...byOrigin].sort((a,b) => b.deltaSales - a.deltaSales)[0];
        if (bestOrigin && bestOrigin.deltaSales > 0) {
            insights.push({
                type: 'opportunity',
                message: `O canal "${bestOrigin.origin}" projeta o maior crescimento de contratos.`,
                severity: 'medium'
            });
        }

        const topSustainableInf = [...byInfluencer].filter(i => i.currentVolume > 0).sort((a,b) => a.deltaVolume - b.deltaVolume).reverse()[0];
        if (topSustainableInf && topSustainableInf.deltaVolume >= 0) {
            insights.push({
                type: 'opportunity',
                message: `${topSustainableInf.name} sustenta a maior projeção de volume em parcerias.`,
                severity: 'high'
            });
        }

        return {
            projections: {
                projectedLeads,
                projectedSales,
                projectedConversion,
                projectedVolume,
                projectedAvgTicket,
                confidenceLevel,
                trend,
                growthRate: growthOverall,
                pipelineVolume
            },
            insights,
            bestOrigin,
            topSustainableInf,
            potentialRegion: [...byRegion].sort((a,b) => (a.avgTicketCurrent - a.avgTicketPrevious) - (b.avgTicketCurrent - b.avgTicketPrevious)).reverse()[0]
        };
    }, [history, quotes, contracts, isLoading, historyLoading]);

    return { forecast, isLoading: isLoading || historyLoading };
};
