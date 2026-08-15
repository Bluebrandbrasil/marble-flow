import { safeArray } from '../lib/dataDiagnostics';
import { safeParseISO } from '../lib/dateUtils';
import { toISODateSafe } from '../lib/dateWriteUtils';
import { useMemo, useState, useEffect } from 'react';
import { useClients } from './useClients';
import { useInfluencers } from './useInfluencers';
import type { Order } from '../types';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import {  isAfter, subDays, startOfDay, differenceInDays } from 'date-fns';
import { useSettings } from './useSettings';
import {  isInfluencer, DEFAULT_INTELLIGENCE_THRESHOLDS  } from '../lib/intelligenceUtils';

export interface InfluencerAlert {
    id: string;
    influencerId: string;
    influencerName: string;
    type: 'inactivity' | 'drop' | 'high_performance' | 'potential' | 'financial_risk' | 'conversion_risk';
    message: string;
    severity: 'info' | 'warning' | 'critical';
    createdAt: string;
    metrics?: {
        currentValue: number;
        previousValue: number;
        variation: number;
    };
}

export const useInfluencerAlerts = () => {
    const { profile } = useAuth();
    const { clients } = useClients();
    const { influencers } = useInfluencers();
    const { settings } = useSettings();
    const [orders, setOrders] = useState<Order[]>([]);
    const [contracts, setContracts] = useState<Order[]>([]);
    const [bonusRecords, setBonusRecords] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Merge company thresholds with defaults
    const thresholds = useMemo(() => ({
        ...DEFAULT_INTELLIGENCE_THRESHOLDS,
        ...(settings.intelligence || {})
    }), [settings.intelligence]);

    useEffect(() => {
        if (!profile?.companyId) return;

        const qOrders = query(collection(db, 'pedidos'), where('companyId', '==', profile.companyId));
        const qContracts = query(collection(db, 'contratos'), where('companyId', '==', profile.companyId));
        const qBonus = query(collection(db, 'bonus_records'), where('companyId', '==', profile.companyId));

        const unsubOrders = onSnapshot(qOrders, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setOrders(data);
        });

        const unsubContracts = onSnapshot(qContracts, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setContracts(data);
        });

        const unsubBonus = onSnapshot(qBonus, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() }));
            setBonusRecords(data);
            setIsLoading(false);
        });

        return () => {
            unsubOrders();
            unsubContracts();
            unsubBonus();
        };
    }, [profile?.companyId]);

    const alerts = useMemo(() => {
        if (isLoading) return [];

        const now = startOfDay(new Date());
        const thirtyDaysAgo = subDays(now, 30);
        const sixtyDaysAgo = subDays(now, 60);

        const generatedAlerts: InfluencerAlert[] = [];

        influencers.forEach(inf => {
            // Case-insensitive check via normalized util
            const infClients = safeArray(clients).filter(c => isInfluencer(c.origin) && c.influencerId === inf.id);
            if (infClients.length === 0) return;

            // Metrics calculation
            const getStats = (startDate: Date, endDate: Date) => {
                const periodClients = safeArray(infClients).filter(c => {
                    const created = c.createdAt ? safeParseISO(c.createdAt) : null;
                    return created && isAfter(created, startDate) && !isAfter(created, endDate);
                });
                const cIds = safeArray(periodClients).map(c => c.id);
                const pOrders = safeArray(orders).filter(o => o.clientId && cIds.includes(o.clientId) && o.status !== 'cancelled');
                const pFechados = pOrders.length;
                const pConversion = periodClients.length > 0 ? (pFechados / periodClients.length) * 100 : 0;
                return { leads: periodClients.length, closed: pFechados, conversion: pConversion };
            };

            const current = getStats(thirtyDaysAgo, now);
            const previous = getStats(sixtyDaysAgo, thirtyDaysAgo);

            // 1. INACTIVITY - Using dynamic thresholds
            const lastClient = [...infClients].sort((a,b) => {
                const dA = a.createdAt ? (safeParseISO(a.createdAt)?.getTime() || 0) : 0;
                const dB = b.createdAt ? (safeParseISO(b.createdAt)?.getTime() || 0) : 0;
                return dB - dA;
            })[0];
            const daysInactive = lastClient?.createdAt ? ((() => { const d = safeParseISO(lastClient.createdAt); return d ? differenceInDays(now, d) : 999; })()) : 999;

            if (daysInactive > thresholds.daysInactive) {
                generatedAlerts.push({
                    id: `inact-crit-${inf.id}`,
                    influencerId: inf.id,
                    influencerName: inf.name,
                    type: 'inactivity',
                    message: `Inativo há ${daysInactive} dias. Necessário contato urgente para reativação.`,
                    severity: 'critical',
                    createdAt: toISODateSafe(new Date())!
                });
            } else if (daysInactive > thresholds.daysAtRisk) {
                generatedAlerts.push({
                    id: `inact-warn-${inf.id}`,
                    influencerId: inf.id,
                    influencerName: inf.name,
                    type: 'inactivity',
                    message: `Sem indicações há ${daysInactive} dias. Status: Em Risco.`,
                    severity: 'warning',
                    createdAt: toISODateSafe(new Date())!
                });
            }

            // 2. PERFORMANCE DROP - Using dynamic threshold (%)
            const dropLimit = 1 - (thresholds.performanceDropPercent / 100);
            if (previous.conversion > 0 && current.conversion < previous.conversion * dropLimit && current.leads > 0) {
                const variation = ((current.conversion - previous.conversion) / previous.conversion) * 100;
                generatedAlerts.push({
                    id: `drop-${inf.id}`,
                    influencerId: inf.id,
                    influencerName: inf.name,
                    type: 'drop',
                    message: `Queda de performance: Conversão caiu de ${previous.conversion.toFixed(1)}% para ${current.conversion.toFixed(1)}% (${variation.toFixed(1)}%).`,
                    severity: 'warning',
                    createdAt: toISODateSafe(new Date())!,
                    metrics: { currentValue: current.conversion, previousValue: previous.conversion, variation }
                });
            }

            // 3. HIGH PERFORMANCE - Using dynamic min leads and conversion
            if (current.conversion >= thresholds.highPerformanceConversion && current.closed >= thresholds.highPerformanceMinLeads) {
                generatedAlerts.push({
                    id: `high-${inf.id}`,
                    influencerId: inf.id,
                    influencerName: inf.name,
                    type: 'high_performance',
                    message: `Excelente! Taxa de conversão de ${current.conversion.toFixed(1)}% este mês.`,
                    severity: 'info',
                    createdAt: toISODateSafe(new Date())!
                });
            }

            // 4. POTENTIAL - Using dynamic potential thresholds
            if (current.conversion >= thresholds.potentialMinConversion && current.leads > 0 && current.leads <= thresholds.potentialMaxLeads) {
                generatedAlerts.push({
                    id: `pot-${inf.id}`,
                    influencerId: inf.id,
                    influencerName: inf.name,
                    type: 'potential',
                    message: `Aproveitamento total: Fechou ${current.leads}/${current.leads} leads. Vale investir mais em tráfego/material para este parceiro.`,
                    severity: 'info',
                    createdAt: toISODateSafe(new Date())!
                });
            }

            // 5. FINANCIAL RISK - Pending Bonus without Customer Payment
            const infBonus = safeArray(bonusRecords).filter(b => b.influencerId === inf.id && b.status === 'pending');
            infBonus.forEach(bonus => {
                const contract = contracts.find(c => c.id === bonus.contractId);
                const isOverdue = contract?.dueDate && isBefore(safeParseISO(contract.dueDate) || now, now);
                
                if (isOverdue) {
                    generatedAlerts.push({
                        id: `fin-risk-${bonus.id}`,
                        influencerId: inf.id,
                        influencerName: inf.name,
                        type: 'financial_risk',
                        message: `Bônus pendente para ${bonus.clientName}, mas contrato está com pagamento atrasado.`,
                        severity: 'warning',
                        createdAt: toISODateSafe(new Date())!
                    });
                }
            });

            // 6. CONVERSION RISK - High Volume, Low Conversion
            if (current.leads >= 5 && current.conversion < 10) {
                generatedAlerts.push({
                    id: `conv-risk-${inf.id}`,
                    influencerId: inf.id,
                    influencerName: inf.name,
                    type: 'conversion_risk',
                    message: `Alto volume (${current.leads} leads) com baixa conversão (${current.conversion.toFixed(1)}%). Necessário revisar qualidade da indicação.`,
                    severity: 'warning',
                    createdAt: toISODateSafe(new Date())!
                });
            }
        });

        return generatedAlerts.sort((a,b) => {
            const map = { critical: 0, warning: 1, info: 2 };
            return map[a.severity] - map[b.severity];
        });
    }, [influencers, clients, orders, isLoading, thresholds]);

    return { alerts, isLoading };
};
