import { safeArray } from '../lib/dataDiagnostics';
import { safeParseISO, getDateKeyInTimezone } from '../lib/dateUtils';
import { useMemo, useState, useEffect } from 'react';
import { useClients } from './useClients';
import { useInfluencers } from './useInfluencers';
import type { Quote, Order, Measurement, Contract } from '../types';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { isAfter, subDays, startOfDay, differenceInHours, differenceInDays, isBefore } from 'date-fns';
import { isInfluencer, getRegionKey, getCanonicalRegionLabel, normalizeRegionKey, DEFAULT_INTELLIGENCE_THRESHOLDS } from '../lib/intelligenceUtils';
import { useSettings } from './useSettings';

export interface CommercialInsight {
    type: 'success' | 'info' | 'warning';
    message: string;
    severity: 'low' | 'medium' | 'high';
}

export interface SellerPerformance {
    sellerName: string;
    followUpCount: number;
    avgResponseTime: number; 
    neglectedHighValue: number; 
    leadsWithoutAction: number;
    recoveredCount: number;
    recoveryRate: number;
}

export interface PendingRegionQuote {
    quoteId: string;
    clientId: string;
    clientName: string;
    clientPhone: string;
    totalAmount: number;
    date: string;
    reason: string;
}

export interface RegionMetrics {
    region: string;
    demandQty: number;
    demandAmount: number;
    demandAvgTicket: number;
    closedQty: number;
    closedAmount: number;
    closedAvgTicket: number;
    conversion: number;
    previousDemandQty: number;
    previousClosedQty: number;
}

export interface IntelligenceData {
    byRegion: RegionMetrics[];
    byOrigin: { origin: string; sales: number; leads: number; conversion: number }[];
    byInfluencer: { name: string; sales: number; conversion: number; volume: number; regions: string[] }[];
    kpis: {
        totalSales: number;
        avgTicket: number;
        bestOrigin: string;
        bestRegion: string;
        pendingMeasurements: number;
        completedMeasurements: number;
    };
    insights: CommercialInsight[];
    followUpRanking: SellerPerformance[];
    recoveryGlobal: {
        rate: number;
        recoveredVolume: number;
        realReceivedVolume: number; 
    };
    exclusions: {
        total: number;
        rate: number;
        churnVolume: number;
        bottleneckIndex: number;
        byReason: { reason: string; label: string; count: number; amount: number }[];
        bySeller: { sellerName: string; count: number; amount: number }[];
        anomalies: string[];
    };
    governanceTrend: {
        date: string;
        requested: number;
        approved: number;
        rejected: number;
        avgDiscount: number;
    }[];
    governanceKpis: {
        totalDiscountValue: number;
        governanceExemptionRate: number;
        avgApprovedDiscount: number;
        avgRequestedDiscount: number;
        savingsFromRejections: number;
    };
    pendingQuotes: Quote[];
    pendingRegionQuotes: PendingRegionQuote[];
}

export const useCommercialIntelligence = (periodDays: number = 30) => {
    const { profile } = useAuth();
    const { clients } = useClients();
    const { influencers } = useInfluencers();
    const { settings } = useSettings();
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [measurements, setMeasurements] = useState<Measurement[]>([]);
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
        const qMeasurements = query(collection(db, 'medicoes'), where('companyId', '==', profile.companyId));

        const unsubQuotes = onSnapshot(qQuotes, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Quote));
            setQuotes(data);
        });

        const unsubOrders = onSnapshot(qOrders, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Order));
            setOrders(data);
        });

        const unsubContracts = onSnapshot(qContracts, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Contract));
            setContracts(data);
            setIsLoading(false);
        });

        const unsubMeasurements = onSnapshot(qMeasurements, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Measurement));
            setMeasurements(data);
        });

        return () => {
            unsubQuotes();
            unsubOrders();
            unsubContracts();
            unsubMeasurements();
        };
    }, [profile?.companyId]);

    const intelligence = useMemo(() => {
        const now = startOfDay(new Date());
        
        let periodStart = periodDays > 0 ? subDays(now, periodDays) : new Date(2000, 0, 1);
        let prevPeriodStart = periodDays > 0 ? subDays(periodStart, periodDays) : new Date(1999, 0, 1);

        const clientsById = safeArray(clients).reduce((acc, c) => {
            acc[c.id] = c;
            return acc;
        }, {} as Record<string, any>);

        // 1. Resolve Valid Quotes (Demand)
        const validQuotes = safeArray(quotes).filter(q => {
            if (q.isDeleted || q.deleted || q.hiddenFromDashboard) return false;
            const status = String(q.status || q.quoteStage).toLowerCase();
            if (['deleted', 'cancelled', 'cancelado', 'draft_zero', 'rascunho', 'draft'].includes(status)) return false;
            const total = Number(q.totalAmount || q.commercialTotal || q.finalTotal || 0);
            if (isNaN(total) || total <= 0) return false;
            return true;
        }).map(q => {
            const dateStr = q.createdAt || q.quoteDate || q.createdDate || q.date;
            const parsedDate = safeParseISO(dateStr);
            return {
                ...q,
                resolvedDate: parsedDate,
                resolvedRegion: getCanonicalRegionLabel(q, clientsById[q.clientId || '']),
                resolvedRegionKey: normalizeRegionKey(getCanonicalRegionLabel(q, clientsById[q.clientId || '']))
            };
        }).filter(q => q.resolvedDate);

        // 2. Resolve Valid Closings (Contracts & Orders)
        const closedStatuses = ['signed', 'assinado', 'approved', 'aprovado', 'em_contrato', 'em_producao', 'aguardando_materia_prima', 'instalado', 'finalizado'];
        
        const validContracts = safeArray(contracts).filter(c => {
            if (c.isDeleted || c.deleted) return false;
            const status = String(c.contractStatus || c.status).toLowerCase();
            return closedStatuses.includes(status);
        }).map(c => {
            const dateStr = c.signedAt || c.contractSignedAt || c.approvedAt || c.closedAt || c.createdAt;
            const parsedDate = safeParseISO(dateStr);
            return {
                ...c,
                resolvedDate: parsedDate,
                resolvedRegion: getCanonicalRegionLabel(c, clientsById[c.clientId || '']),
                resolvedRegionKey: normalizeRegionKey(getCanonicalRegionLabel(c, clientsById[c.clientId || '']))
            };
        }).filter(c => c.resolvedDate);

        const validOrders = safeArray(orders).filter(o => {
            if (o.isDeleted || o.deleted) return false;
            const status = String(o.status).toLowerCase();
            const hasContract = validContracts.some(c => c.orderId === o.id || c.id === o.id || (o.quoteId && c.quoteId === o.quoteId));
            return !hasContract && closedStatuses.includes(status);
        }).map(o => {
            const dateStr = o.signedAt || o.approvedAt || o.closedAt || o.createdAt;
            const parsedDate = safeParseISO(dateStr);
            return {
                ...o,
                resolvedDate: parsedDate,
                resolvedRegion: getCanonicalRegionLabel(o, clientsById[o.clientId || '']),
                resolvedRegionKey: normalizeRegionKey(getCanonicalRegionLabel(o, clientsById[o.clientId || '']))
            };
        }).filter(o => o.resolvedDate);

        const allClosings = [...validContracts, ...validOrders];

        // Group by Region
        const regionMap: Record<string, RegionMetrics> = {};

        // Helper to get or create region
        const getRegion = (rKey: string, rLabel: string) => {
            if (!regionMap[rKey]) {
                regionMap[rKey] = { region: rLabel, demandQty: 0, demandAmount: 0, demandAvgTicket: 0, closedQty: 0, closedAmount: 0, closedAvgTicket: 0, conversion: 0, previousDemandQty: 0, previousClosedQty: 0 };
            }
            return regionMap[rKey];
        };

        // Current & Previous Period Logic
        validQuotes.forEach(q => {
            const r = getRegion(q.resolvedRegionKey, q.resolvedRegion);
            const total = Number(q.totalAmount || q.commercialTotal || q.finalTotal || 0);
            
            if (periodDays <= 0 || (isAfter(q.resolvedDate!, periodStart) && !isAfter(q.resolvedDate!, now))) {
                r.demandQty++;
                r.demandAmount += total;
            } else if (periodDays > 0 && isAfter(q.resolvedDate!, prevPeriodStart) && isBefore(q.resolvedDate!, periodStart)) {
                r.previousDemandQty++;
            }
        });

        allClosings.forEach(c => {
            const r = getRegion(c.resolvedRegionKey, c.resolvedRegion);
            const total = Number(c.totalAmount || c.snapshot?.totalAmount || c.commercialTotal || 0);
            
            if (periodDays <= 0 || (isAfter(c.resolvedDate!, periodStart) && !isAfter(c.resolvedDate!, now))) {
                r.closedQty++;
                r.closedAmount += total;
            } else if (periodDays > 0 && isAfter(c.resolvedDate!, prevPeriodStart) && isBefore(c.resolvedDate!, periodStart)) {
                r.previousClosedQty++;
            }
        });

        const byRegion = Object.values(regionMap).map(r => ({
            ...r,
            demandAvgTicket: r.demandQty > 0 ? r.demandAmount / r.demandQty : 0,
            closedAvgTicket: r.closedQty > 0 ? r.closedAmount / r.closedQty : 0,
            conversion: r.demandQty > 0 ? (r.closedQty / r.demandQty) * 100 : 0
        })).filter(r => r.demandQty > 0 || r.closedQty > 0).sort((a, b) => b.closedAmount - a.closedAmount);

        // We also need sales/leads format for backward compatibility in other tabs for now
        const filteredSales = allClosings.filter(c => periodDays <= 0 || (isAfter(c.resolvedDate!, periodStart) && !isAfter(c.resolvedDate!, now)));
        const filteredQuotesForSales = validQuotes.filter(q => periodDays <= 0 || (isAfter(q.resolvedDate!, periodStart) && !isAfter(q.resolvedDate!, now)));

        const pendingRegionQuotes: PendingRegionQuote[] = validQuotes
            .filter(q => q.resolvedRegion === 'Região não informada')
            .map(q => {
                const client = clientsById[q.clientId || ''];
                const reason = (!client?.city && !client?.state && !client?.zipCode) 
                    ? 'Cliente sem CEP, cidade e estado.'
                    : 'Endereço incompleto ou inválido.';
                return {
                    quoteId: q.id,
                    clientId: q.clientId || '',
                    clientName: q.clientName || client?.name || 'Desconhecido',
                    clientPhone: q.clientPhone || client?.phone || '',
                    totalAmount: Number(q.totalAmount || q.commercialTotal || q.finalTotal || 0),
                    date: q.createdAt || q.quoteDate || q.createdDate || q.date || '',
                    reason
                };
            });

        // 2. Group by Origin
        const originMap: Record<string, any> = {};
        filteredQuotesForSales.forEach(q => {
            const c = clientsById[q.clientId || ''];
            const origin = q.leadSource || q.origin || c?.leadSource || c?.origin || 'Origem não informada';
            if (!originMap[origin]) originMap[origin] = { origin, sales: 0, leads: 0 };
            originMap[origin].leads++;
        });

        filteredSales.forEach(s => {
            const c = clientsById[s.clientId || ''];
            const origin = s.leadSource || s.origin || c?.leadSource || c?.origin || 'Origem não informada';
            if (!originMap[origin]) originMap[origin] = { origin, sales: 0, leads: 0 };
            originMap[origin].sales++;
        });

        const byOrigin = Object.values(originMap).map((o: any) => ({
            ...o,
            conversion: o.leads > 0 ? (o.sales / o.leads) * 100 : 0
        })).sort((a, b) => (b as any).leads - (a as any).leads);

        // 3. Group by Influencer
        const influencerMap: Record<string, any> = {};
        safeArray(influencers).forEach(inf => {
            influencerMap[inf.id] = { name: inf.name, sales: 0, leads: 0, volume: 0, regions: new Set<string>() };
        });

        filteredQuotesForSales.forEach(q => {
            const c = clientsById[q.clientId || ''] || {};
            const origin = q.leadSource || q.origin || c.leadSource || c.origin || '';
            if (isInfluencer(origin) && c.influencerId && influencerMap[c.influencerId]) {
                influencerMap[c.influencerId].leads++;
                if (c.city) influencerMap[c.influencerId].regions.add(c.city);
            }
        });

        filteredSales.forEach(s => {
            const c = clientsById[s.clientId || ''] || {};
            const origin = s.leadSource || s.origin || c.leadSource || c.origin || '';
            if (isInfluencer(origin) && c.influencerId && influencerMap[c.influencerId]) {
                influencerMap[c.influencerId].sales++;
                const total = Number(s.totalAmount || s.snapshot?.totalAmount || s.commercialTotal || 0);
                influencerMap[c.influencerId].volume += total;
            }
        });

        const byInfluencer = Object.values(influencerMap).map((inf: any) => ({
            ...inf,
            conversion: inf.leads > 0 ? (inf.sales / inf.leads) * 100 : 0,
            regions: Array.from(inf.regions as Set<string>)
        })).sort((a, b) => b.volume - a.volume);

        // KPIs
        const totalSales = filteredSales.length;
        const totalAmount = safeArray(filteredSales).reduce((acc, s) => acc + Number(s.totalAmount || s.snapshot?.totalAmount || s.commercialTotal || 0), 0);
        const avgTicket = totalSales > 0 ? totalAmount / totalSales : 0;
        const bestOrigin = byOrigin.length > 0 ? byOrigin[0].origin : 'N/A';
        const bestRegion = byRegion.length > 0 ? [...byRegion].sort((a,b)=>b.closedAmount - a.closedAmount)[0].region : 'N/A';

        // 4. Follow-up Performance
        const sellerPerfMap: Record<string, SellerPerformance> = {};
        let globalRecoveredCount = 0;
        let globalRecoveredVolume = 0;
        let globalRealReceivedVolume = 0;

        filteredQuotesForSales.forEach(q => {
            const seller = q.sellerName || 'Venda Direta';
            if (!sellerPerfMap[seller]) {
                sellerPerfMap[seller] = {
                    sellerName: seller, 
                    followUpCount: 0, 
                    avgResponseTime: 0, 
                    neglectedHighValue: 0,
                    leadsWithoutAction: 0,
                    recoveredCount: 0,
                    recoveryRate: 0
                };
            }
            const p = sellerPerfMap[seller];

            p.followUpCount += (q.followUpCount || 0);

            const followUpLogs = Array.isArray(q.history) ? safeArray(q.history).filter(h => String(h?.action || '').toLowerCase().includes('follow-up')) : [];
            if (followUpLogs.length > 0 && q.resolvedDate) {
                const firstFollowUp = safeParseISO(followUpLogs[0].date);
                if (firstFollowUp) {
                    const hours = Math.max(0, differenceInHours(firstFollowUp, q.resolvedDate));
                    p.avgResponseTime = (p.avgResponseTime * (followUpLogs.length - 1) + hours) / followUpLogs.length;
                }
            }

            const isApproved = q.status === 'approved' || q.status === 'converted' || 
                             safeArray(filteredSales).some(c => c.quoteId === q.id);
            const wasRecovered = (q.followUpCount && q.followUpCount > 0) && isApproved;

            if (wasRecovered) {
                p.recoveredCount++;
                globalRecoveredCount++;
                const amount = Number(q.commercialTotal || q.totalAmount || 0) + Number(q.operationalCost || 0) + Number(q.freight || 0);
                globalRecoveredVolume += amount;

                const relatedSale = safeArray(filteredSales).find(s => s.quoteId === q.id);
                if (relatedSale) {
                    const received = safeArray(relatedSale.financialHistory || []).reduce((acc, ev) => {
                        if (ev.type === 'reversal') return acc - ev.amount;
                        return acc + ev.amount;
                    }, 0);
                    globalRealReceivedVolume += received;
                }
            }

            const quoteAge = differenceInDays(now, q.resolvedDate);
            const hasAction = (q.followUpCount && q.followUpCount > 0) || (Array.isArray(q.history) && q.history.length > 1);
            if (!hasAction && quoteAge >= 2 && !['cancelado', 'finalizado'].includes(q.quoteStage || '')) {
                p.leadsWithoutAction++;
            }

            const total = Number(q.commercialTotal || q.totalAmount || 0) + Number(q.operationalCost || 0) + Number(q.freight || 0);
            if (total >= 5000 && quoteAge >= 5 && (q.followUpCount || 0) === 0 && !['cancelado', 'finalizado'].includes(q.quoteStage || '')) {
                p.neglectedHighValue++;
            }
        });

        const followUpRanking = Object.values(sellerPerfMap).map(p => ({
            ...p,
            recoveryRate: p.followUpCount > 0 ? (p.recoveredCount / p.followUpCount) * 100 : 0
        })).sort((a, b) => (b as any).followUpCount - (a as any).followUpCount);

        const totalFollowUpsGlobal = safeArray(followUpRanking).reduce((acc, r) => acc + r.followUpCount, 0);
        const recoveryGlobal = {
            rate: totalFollowUpsGlobal > 0 ? (globalRecoveredCount / totalFollowUpsGlobal) * 100 : 0,
            recoveredVolume: globalRecoveredVolume,
            realReceivedVolume: globalRealReceivedVolume
        };

        // 5. Insights Generation
        const insights: CommercialInsight[] = [];
        
        if (safeArray(followUpRanking).length > 0) {
            const topFollower = [...safeArray(followUpRanking)].sort((a,b) => b.followUpCount - a.followUpCount)[0];
            if (topFollower.followUpCount > 0) {
                insights.push({ type: 'success', message: `Performance: ${topFollower.sellerName} executou ${topFollower.followUpCount} ações de follow-up.`, severity: 'medium' });
            }

            const totalNeglected = safeArray(followUpRanking).reduce((acc, r) => acc + r.neglectedHighValue, 0);
            if (totalNeglected > 0) {
                insights.push({ type: 'warning', message: `Risco Crítico: ${totalNeglected} orçamentos de alto valor ignorados há 5 dias.`, severity: 'high' });
            }

            if (recoveryGlobal.rate > 0) {
                insights.push({ type: 'info', message: `Resgate Comercial: Follow-up recuperou ${recoveryGlobal.rate.toFixed(1)}% das vendas (${globalRealReceivedVolume.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em caixa).`, severity: 'medium' });
            }
        }

        if (byOrigin.length > 0) {
            const bestConvO = safeArray(byOrigin).filter(o => o.leads >= thresholds.highPerformanceMinLeads).sort((a, b) => b.conversion - a.conversion)[0];
            if (bestConvO && bestConvO.conversion > 0) {
                insights.push({ type: 'success', message: `Canal de Elite: "${bestConvO.origin}" converte em ${bestConvO.conversion.toFixed(1)}%.`, severity: 'medium' });
            }
        }

        const pendingMeasurements = safeArray(measurements).filter(m => m.status === 'scheduled').length;
        const completedMeasurements = safeArray(measurements).filter(m => m.status === 'completed' || m.status === 'converted').length;

        // Restore exclusions & governance
        const exclusions = (() => {
            const filteredExclusions = safeArray(quotes).filter(q => {
                if (!q.isDeleted) return false;
                if (periodDays <= 0) return true;
                const date = q.deletedAt ? safeParseISO(q.deletedAt) : null;
                return date && isAfter(date, periodStart) && !isAfter(date, now);
            });

            const total = filteredExclusions.length;
            const activeCount = safeArray(quotes).filter(q => !q.isDeleted).length;
            const rate = activeCount > 0 ? (total / (total + activeCount)) * 100 : 0;

            const reasonMap: Record<string, { count: number; amount: number; label: string }> = {
                'cliente_desistiu': { count: 0, amount: 0, label: 'Cliente Desistiu' },
                'valor_alto': { count: 0, amount: 0, label: 'Valor Alto' },
                'erro_orcamento': { count: 0, amount: 0, label: 'Erro de Orçamento' },
                'duplicado': { count: 0, amount: 0, label: 'Duplicado' },
                'concorrencia': { count: 0, amount: 0, label: 'Concorrência' },
                'outros': { count: 0, amount: 0, label: 'Outros' }
            };

            const sellerMap: Record<string, { count: number; amount: number }> = {};

            filteredExclusions.forEach(q => {
                const cat = q.deleteReasonCategory || 'outros';
                const amount = (q.commercialTotal || 0) + (q.operationalCost || 0) + (q.freight || 0);
                if (reasonMap[cat]) {
                    reasonMap[cat].count++;
                    reasonMap[cat].amount += amount;
                }
                const seller = q.sellerName || 'Venda Direta';
                if (!sellerMap[seller]) sellerMap[seller] = { count: 0, amount: 0 };
                sellerMap[seller].count++;
                sellerMap[seller].amount += amount;
            });

            const anomalies: string[] = [];
            const todayExclusions = safeArray(filteredExclusions).filter(q => {
                const date = q.deletedAt ? safeParseISO(q.deletedAt) : null;
                return date && differenceInDays(now, date) === 0;
            }).length;

            if (todayExclusions >= 5) {
                anomalies.push(`Volume anormal: ${todayExclusions} exclusões registradas hoje.`);
            }

            const totalAmount = safeArray(filteredExclusions).reduce((acc, q) => acc + (q.commercialTotal || 0) + (q.operationalCost || 0) + (q.freight || 0), 0);
            const activeTotal = safeArray(quotes).filter(q => !q.isDeleted).reduce((acc, q) => acc + (q.commercialTotal || 0) + (q.operationalCost || 0) + (q.freight || 0), 0);
            const churnVolume = totalAmount;
            const bottleneckIndex = activeTotal > 0 ? (totalAmount / activeTotal) : 0;

            return {
                total,
                rate,
                churnVolume,
                bottleneckIndex,
                byReason: Object.entries(reasonMap).map(([reason, data]) => ({ reason, ...data })),
                bySeller: Object.entries(sellerMap).map(([sellerName, data]) => ({ sellerName, ...data })),
                anomalies
            };
        })();

        const governanceTrend = (() => {
            const last7Days = Array.from({ length: 7 }, (_, i) => {
                const d = subDays(new Date(), i);
                return d.toISOString().split('T')[0];
            }).reverse();

            const trendMap: Record<string, any> = {};
            last7Days.forEach(date => {
                trendMap[date] = { date, requested: 0, approved: 0, rejected: 0, discountSum: 0, discountCount: 0 };
            });

            filteredQuotesForSales.forEach(q => {
                const date = getDateKeyInTimezone(q.resolvedDate);
                if (date && trendMap[date]) {
                    if (q.discount && q.discount > 0) {
                        const subtotal = (q.commercialTotal || 0) + (q.discount || 0);
                        const perc = subtotal > 0 ? (q.discount / subtotal) * 100 : 0;
                        trendMap[date].requested++;
                        trendMap[date].approved++;
                        trendMap[date].discountSum += perc;
                        trendMap[date].discountCount++;
                    }
                }
            });

            return Object.values(trendMap).map((t: any) => ({
                ...t,
                avgDiscount: t.discountCount > 0 ? t.discountSum / t.discountCount : 0
            }));
        })();

        const governanceKpis = (() => {
            const quotesWithDiscount = safeArray(filteredQuotesForSales).filter(q => q.discount && q.discount > 0);
            const totalDiscountValue = safeArray(quotesWithDiscount).reduce((acc, q) => acc + (q.discount || 0), 0);
            const discountRate = filteredQuotesForSales.length > 0 ? (quotesWithDiscount.length / filteredQuotesForSales.length) * 100 : 0;
            const avgDiscountPerc = quotesWithDiscount.length > 0 
                ? safeArray(quotesWithDiscount).reduce((acc, q) => {
                    const subtotal = (q.commercialTotal || 0) + (q.discount || 0);
                    return acc + (subtotal > 0 ? (q.discount / subtotal) * 100 : 0);
                }, 0) / quotesWithDiscount.length 
                : 0;

            return {
                totalDiscountValue,
                governanceExemptionRate: 100 - discountRate,
                avgApprovedDiscount: avgDiscountPerc,
                avgRequestedDiscount: avgDiscountPerc,
                savingsFromRejections: 0
            };
        })();

        return {
            byRegion,
            byOrigin,
            byInfluencer,
            kpis: { totalSales, avgTicket, bestOrigin, bestRegion, pendingMeasurements, completedMeasurements },
            insights,
            followUpRanking,
            recoveryGlobal,
            exclusions,
            governanceTrend,
            governanceKpis,
            pendingQuotes: [] as Quote[],
            pendingRegionQuotes
        };
    }, [quotes, orders, contracts, measurements, periodDays, clients, influencers, profile?.companyId, thresholds]);

    return { intelligence, isLoading };
};
