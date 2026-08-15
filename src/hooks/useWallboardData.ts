import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { safeArray } from '../lib/dataDiagnostics';
import type { Quote, Order, Contract, Measurement } from '../types';
import { startOfDay, startOfWeek, startOfMonth, subDays, differenceInDays, differenceInHours } from 'date-fns';

export interface WallboardData {
    quotes: Quote[];
    orders: Order[];
    contracts: Contract[];
    measurements: Measurement[];
    loading: boolean;
    lastUpdated: Date | null;
}

export const useWallboardData = (period: 'today' | 'week' | 'month' | '30days' = '30days') => {
    const { profile } = useAuth();
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [measurements, setMeasurements] = useState<Measurement[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Prevent duplicate listeners
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        if (!profile?.companyId) {
            setLoading(false);
            return;
        }

        const now = new Date();
        let startDate: Date;
        if (period === 'today') startDate = startOfDay(now);
        else if (period === 'week') startDate = startOfWeek(now, { weekStartsOn: 1 });
        else if (period === 'month') startDate = startOfMonth(now);
        else startDate = subDays(now, 30);

        const startDateIso = startDate.toISOString().split('T')[0];

        // Optimized queries with date filters where possible
        // We only fetch recent quotes to save bandwidth
        const qQuotes = query(
            collection(db, 'orcamentos'), 
            where('companyId', '==', profile.companyId),
            where('createdAt', '>=', startDateIso)
        );
        
        // We fetch active orders and recent contracts
        const qOrders = query(collection(db, 'pedidos'), where('companyId', '==', profile.companyId));
        const qContracts = query(
            collection(db, 'contratos'), 
            where('companyId', '==', profile.companyId)
        );
        const qMeasurements = query(
            collection(db, 'medicoes'), 
            where('companyId', '==', profile.companyId)
        );

        let resolvedCount = 0;
        const checkLoading = () => {
            resolvedCount++;
            if (resolvedCount >= 4 && isMounted.current) {
                setLoading(false);
                setLastUpdated(new Date());
            }
        };

        const unsubQuotes = onSnapshot(qQuotes, (snapshot) => {
            if (!isMounted.current) return;
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Quote));
            setQuotes(data);
            setLastUpdated(new Date());
            if (resolvedCount < 4) checkLoading();
        }, (err) => { console.error(err); if (resolvedCount < 4) checkLoading(); });

        const unsubOrders = onSnapshot(qOrders, (snapshot) => {
            if (!isMounted.current) return;
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setOrders(data);
            setLastUpdated(new Date());
            if (resolvedCount < 4) checkLoading();
        }, (err) => { console.error(err); if (resolvedCount < 4) checkLoading(); });

        const unsubContracts = onSnapshot(qContracts, (snapshot) => {
            if (!isMounted.current) return;
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Contract));
            setContracts(data);
            setLastUpdated(new Date());
            if (resolvedCount < 4) checkLoading();
        }, (err) => { console.error(err); if (resolvedCount < 4) checkLoading(); });

        const unsubMeasurements = onSnapshot(qMeasurements, (snapshot) => {
            if (!isMounted.current) return;
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Measurement));
            setMeasurements(data);
            setLastUpdated(new Date());
            if (resolvedCount < 4) checkLoading();
        }, (err) => { console.error(err); if (resolvedCount < 4) checkLoading(); });

        return () => {
            isMounted.current = false;
            unsubQuotes();
            unsubOrders();
            unsubContracts();
            unsubMeasurements();
        };
    }, [profile?.companyId, period]);

    return { quotes, orders, contracts, measurements, loading, lastUpdated };
};
