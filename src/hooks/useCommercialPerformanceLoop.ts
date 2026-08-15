import { safeArray } from '../lib/dataDiagnostics';
import { safeParseISO } from '../lib/dateUtils';
import { useMemo } from 'react';
import { useClients } from './useClients';
import { useCommercialActions } from './useCommercialActions';
import {  isAfter, isBefore, subDays, addDays } from 'date-fns';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Order } from '../types';
import {  isInfluencer  } from '../lib/intelligenceUtils';

export interface ActionPerformanceResult {
    id: string;
    actionTitle: string;
    influencerName?: string;
    status: 'success' | 'neutral' | 'failure';
    deltaPercent: number;
    deltaLeads: number;
    deltaSales: number;
    deltaRev: number;
    leadsBefore: number;
    leadsAfter: number;
    salesBefore: number;
    salesAfter: number;
    revenueBefore: number;
    revenueAfter: number;
}

export const useCommercialPerformanceLoop = () => {
    const { profile } = useAuth();
    const { actions, isLoading: actionsLoading } = useCommercialActions();
    const { clients } = useClients();
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!profile?.companyId) return;
        const q = query(collection(db, 'pedidos'), where('companyId', '==', profile.companyId));
        const unsub = onSnapshot(q, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setOrders(safeArray(data).filter(o => o.status !== 'cancelled'));
            setIsLoading(false);
        });
        return () => unsub();
    }, [profile?.companyId]);

    const results = useMemo(() => {
        if (actionsLoading || isLoading) return [];

        const doneActions = safeArray(actions).filter(a => a.status === 'done' && a.completedAt);

        return safeArray(doneActions).map(action => {
            const created = safeParseISO(action.createdAt);
            const completed = action.completedAt ? safeParseISO(action.completedAt) : new Date();
            
            // Comparison Windows (14 days)
            const windowBeforeStart = subDays(created, 14);
            const windowAfterEnd = addDays(completed, 14);
            const now = new Date();
            const realAfterEnd = isBefore(now, windowAfterEnd) ? now : windowAfterEnd;

            // Target Filter (influencer or origin-based)
            const filterBySubject = (items: any[]) => {
                if (action.influencerId) {
                    return safeArray(items).filter(i => {
                        if ('influencerId' in i) return i.influencerId === action.influencerId && isInfluencer(i.origin);
                        const cl = safeArray(clients).find(c => c.id === i.clientId);
                        return cl?.influencerId === action.influencerId && isInfluencer(cl?.origin);
                    });
                }
                return items;
            };

            const filterByDate = (items: any[], start: Date, end: Date) => {
                return safeArray(items).filter(i => {
                    const dt = i.createdAt ? safeParseISO(i.createdAt) : null;
                    return dt && isAfter(dt, start) && isBefore(dt, end);
                });
            };

            const subjectClients = filterBySubject(clients);
            const subjectOrders = filterBySubject(orders);

            const beforeClients = filterByDate(subjectClients, windowBeforeStart, created);
            const afterClients = filterByDate(subjectClients, completed, realAfterEnd);

            const beforeOrders = filterByDate(subjectOrders, windowBeforeStart, created);
            const afterOrders = filterByDate(subjectOrders, completed, realAfterEnd);

            const revBefore = safeArray(beforeOrders).reduce((sum, o) => sum + (o.totalAmount || 0), 0);
            const revAfter = safeArray(afterOrders).reduce((sum, o) => sum + (o.totalAmount || 0), 0);

            const deltaLeads = afterClients.length - beforeClients.length;
            const deltaSales = afterOrders.length - beforeOrders.length;
            const deltaRev = revAfter - revBefore;

            const baseline = Math.max(1, revBefore);
            const deltaPercent = (deltaRev / baseline) * 100;

            let resultStatus: 'success' | 'neutral' | 'failure' = 'neutral';
            if (deltaPercent > 5 || (beforeOrders.length === 0 && afterOrders.length > 0)) resultStatus = 'success';
            else if (deltaPercent < -5) resultStatus = 'failure';

            return {
                id: action.id,
                actionTitle: action.title,
                influencerName: action.influencerName,
                status: resultStatus,
                deltaPercent,
                deltaLeads,
                deltaSales,
                deltaRev,
                leadsBefore: beforeClients.length,
                leadsAfter: afterClients.length,
                salesBefore: beforeOrders.length,
                salesAfter: afterOrders.length,
                revenueBefore: revBefore,
                revenueAfter: revAfter
            } as ActionPerformanceResult;
        });
    }, [actions, clients, orders, actionsLoading, isLoading]);

    const globalStats = useMemo(() => {
        const total = results.length;
        const successes = safeArray(results).filter(r => r.status === 'success').length;
        const successRate = total > 0 ? (successes / total) * 100 : 0;
        
        const topRecovered = [...safeArray(results)]
            .filter(r => r.status === 'success' && r.influencerName)
            .sort((a,b) => b.deltaRev - a.deltaRev)
            .slice(0, 3);
            
        return {
            total,
            successRate,
            successes,
            neutrals: safeArray(results).filter(r => r.status === 'neutral').length,
            failures: safeArray(results).filter(r => r.status === 'failure').length,
            topRecovered
        };
    }, [results]);

    return { results, globalStats, isLoading: isLoading || actionsLoading };
};
