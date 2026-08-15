import { safeArray } from '../lib/dataDiagnostics';
import { safeParseISO } from '../lib/dateUtils';
import { useMemo, useState, useEffect } from 'react';
import { useClients } from './useClients';
import { useInfluencers } from './useInfluencers';
import type { Quote, Order } from '../types';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import {  differenceInDays, isAfter, subDays, startOfDay } from 'date-fns';
import {  isInfluencer, DEFAULT_INTELLIGENCE_THRESHOLDS  } from '../lib/intelligenceUtils';
import { useSettings } from './useSettings';

export interface InfluencerRanking {
    influencerId: string;
    influencerName: string;
    totalLeads: number;
    totalOrcamentos: number;
    totalFechados: number;
    taxaConversao: number;
    volumeVendas: number; // Valor Total Vendido (Signed Contracts)
    valorRecebido: number; // Valor Real Recebido em Caixa
    tempoSemIndicacao: number;
    qualityScore: number; // 0-100
    tier: 'Ouro' | 'Prata' | 'Bronze' | 'Em risco';
    status: 'active' | 'risk' | 'inactive';
}

export const useInfluencerRanking = (periodDays: number = 30) => {
    const { profile } = useAuth();
    const { clients } = useClients();
    const { influencers } = useInfluencers();
    const { settings } = useSettings();
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [contracts, setContracts] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const thresholds = useMemo(() => ({
        ...DEFAULT_INTELLIGENCE_THRESHOLDS,
        ...(settings.intelligence || {})
    }), [settings.intelligence]);

    useEffect(() => {
        if (!profile?.companyId) return;

        const qQuotes = query(collection(db, 'orcamentos'), where('companyId', '==', profile.companyId));
        const qOrders = query(collection(db, 'pedidos'), where('companyId', '==', profile.companyId));
        const qContracts = query(collection(db, 'contratos'), where('companyId', '==', profile.companyId));

        const unsubQuotes = onSnapshot(qQuotes, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Quote));
            setQuotes(data);
        });

        const unsubOrders = onSnapshot(qOrders, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setOrders(data);
        });

        const unsubContracts = onSnapshot(qContracts, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setContracts(data);
            setIsLoading(false);
        });

        return () => {
            unsubQuotes();
            unsubOrders();
            unsubContracts();
        };
    }, [profile?.companyId]);

    const rankingData = useMemo(() => {
        const now = startOfDay(new Date());
        const periodStart = subDays(now, periodDays);

        return safeArray(influencers).map(inf => {
            // Filter clients for THIS influencer (CASE-INSENSITIVE)
            const infClients = safeArray(clients).filter((c: any) => 
                c.influencerId === inf.id || 
                (c.referralCode && String(c.referralCode).trim().toLowerCase() === String(inf.code).trim().toLowerCase())
            );

            // Deduplicate unique clients
            const seenKeys = new Set<string>();
            const uniqueClients = infClients.filter((c: any) => {
                const phoneKey = c.phone ? c.phone.replace(/\D/g, '') : '';
                const emailKey = c.email ? c.email.trim().toLowerCase() : '';
                const key = c.id || phoneKey || emailKey;
                if (!key) return false;
                if (seenKeys.has(key)) return false;
                seenKeys.add(key);
                return true;
            });

            // Filter by period if needed (based on client creation)
            const filteredClients = uniqueClients.filter((c: any) => {
                if (periodDays <= 0) return true; // All time
                const created = c.createdAt ? safeParseISO(c.createdAt) : null;
                return created && isAfter(created, periodStart);
            });

            const totalLeads = filteredClients.length;
            const clientIds = filteredClients.map(c => c.id);

            // Quotes for these clients
            const infQuotes = safeArray(quotes).filter((q: any) => 
                q.influencerId === inf.id ||
                (q.referralCode && String(q.referralCode).trim().toLowerCase() === String(inf.code).trim().toLowerCase()) ||
                (q.clientId && clientIds.includes(q.clientId))
            );
            const totalOrcamentos = infQuotes.length;

            const infContracts = safeArray(contracts).filter((c: any) => 
                c.influencerId === inf.id ||
                (c.referralCode && String(c.referralCode).trim().toLowerCase() === String(inf.code).trim().toLowerCase()) ||
                (c.clientId && clientIds.includes(c.clientId))
            );

            const infOrders = safeArray(orders).filter((o: any) => 
                o.influencerId === inf.id ||
                (o.referralCode && String(o.referralCode).trim().toLowerCase() === String(inf.code).trim().toLowerCase()) ||
                (o.clientId && clientIds.includes(o.clientId))
            );

            let totalFechados = 0;
            let volumeVendas = 0;

            if (totalLeads > 0) {
                const clientDealValues = new Map<string, number>();

                infContracts.forEach((c: any) => {
                    if (c.contractStatus === 'signed') {
                        const clientId = c.clientId || 'unknown';
                        const amount = Number(c.totalAmount) || 0;
                        clientDealValues.set(clientId, amount);
                    }
                });

                infOrders.forEach((o: any) => {
                    if (o.status !== 'cancelled' && o.status !== 'cancelado') {
                        const clientId = o.clientId || 'unknown';
                        const amount = Number(o.totalAmount) || 0;
                        const existing = clientDealValues.get(clientId) || 0;
                        if (amount > existing) {
                            clientDealValues.set(clientId, amount);
                        }
                    }
                });

                totalFechados = clientDealValues.size;
                volumeVendas = Array.from(clientDealValues.values()).reduce((acc, val) => acc + val, 0);
            }

            // Received Value (Audit confirmed via financialHistory)
            const valorRecebido = safeArray(infContracts).reduce((acc, c) => {
                const history = Array.isArray(c.financialHistory) ? c.financialHistory : [];
                const sum = safeArray(history).reduce((s, e) => {
                    if (e.type === 'reversal') return s - (e.amount || 0);
                    if (['income', 'payment', 'partial_payment'].includes(e.type)) return s + (e.amount || 0);
                    return s;
                }, 0);
                return acc + sum;
            }, 0);

            const taxaConversao = totalLeads > 0 ? (totalFechados / totalLeads) * 100 : 0;

            const lastClient = [...filteredClients].sort((a: any, b: any) => {
                const dA = a.createdAt ? (safeParseISO(a.createdAt)?.getTime() || 0) : 0;
                const dB = b.createdAt ? (safeParseISO(b.createdAt)?.getTime() || 0) : 0;
                return dB - dA;
            })[0];
            const tempoSemIndicacao = lastClient?.createdAt ? (() => {
                const d = safeParseISO(lastClient.createdAt);
                return d ? differenceInDays(now, d) : 999;
            })() : 999;

            let status: 'active' | 'risk' | 'inactive' = 'active';
            if (tempoSemIndicacao > thresholds.daysInactive) {
                status = 'inactive';
            } else if (tempoSemIndicacao > thresholds.daysAtRisk) {
                status = 'risk';
            }

            // PARTNER QUALITY SCORE (0-100)
            const scoreConversion = Math.min(taxaConversao * 2, 40);
            const scoreReceived = Math.min((valorRecebido / 50000) * 30, 30);
            const scoreRecency = tempoSemIndicacao < 15 ? 20 : tempoSemIndicacao < 30 ? 10 : 0;
            const scoreVolume = Math.min(totalFechados * 2, 10);
            
            const qualityScore = Math.round(scoreConversion + scoreReceived + scoreRecency + scoreVolume);
            
            let tier: 'Ouro' | 'Prata' | 'Bronze' | 'Em risco' = 'Bronze';
            if (qualityScore >= 80) tier = 'Ouro';
            else if (qualityScore >= 50) tier = 'Prata';
            else if (status === 'inactive' || qualityScore < 20) tier = 'Em risco';

            return {
                influencerId: inf.id,
                influencerName: inf.name,
                totalLeads,
                totalOrcamentos,
                totalFechados,
                taxaConversao,
                volumeVendas,
                valorRecebido,
                tempoSemIndicacao,
                qualityScore,
                tier,
                status
            } as InfluencerRanking;
        }).sort((a, b) => {
            // Sort by: 1st volumeVendas, 2nd totalFechados, 3rd totalLeads
            if ((b.volumeVendas || 0) !== (a.volumeVendas || 0)) {
                return (b.volumeVendas || 0) - (a.volumeVendas || 0);
            }
            if ((b.totalFechados || 0) !== (a.totalFechados || 0)) {
                return (b.totalFechados || 0) - (a.totalFechados || 0);
            }
            return (b.totalLeads || 0) - (a.totalLeads || 0);
        });
    }, [influencers, clients, quotes, orders, contracts, periodDays, thresholds]);

    return { rankingData, isLoading };
};
