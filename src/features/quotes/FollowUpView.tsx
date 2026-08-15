import { safeArray } from '../../lib/dataDiagnostics';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
    MessageSquare, 
    ChevronLeft, 
    ChevronRight, 
    Zap,
    Target,
    Phone,
    LayoutGrid,
    Square,
    CheckCircle2,
    ArrowUpRight,
    Trophy,
    Flame,
    Sparkles,
    Timer
} from 'lucide-react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import type { Quote } from '../../types';
import { getQuoteAlertStatus, isQuoteEligibleForFollowUp } from '../../utils/quoteAlerts';
import { Modal } from '../../components/ui/Modal';
import { calculateQuoteScore, getAssistedMessages, getOpportunityTimer, analyzeMargin, getFollowUpCadence } from '../../lib/commercialAssistant';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { isValidQuoteForMetrics } from '../../utils/quoteCalculations';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/utils';
import { doc, collection, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { differenceInHours } from 'date-fns';
import { openWhatsAppFollowUp } from '../../utils/whatsappHelper';
import { getEffectiveFollowUpCount, getFollowUpTab } from '../../utils/followUpHelpers';

const removeUndefinedDeep = (obj: any): any => {
    if (Array.isArray(obj)) return obj.map(removeUndefinedDeep);
    if (obj && typeof obj === 'object') {
        const proto = Object.getPrototypeOf(obj);
        if (proto !== Object.prototype && proto !== null) {
            return obj;
        }
        return Object.fromEntries(
            Object.entries(obj)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => [key, removeUndefinedDeep(value)])
        );
    }
    return obj;
};

const getRegisterButtonLabel = (q: Quote) => {
    const count = getEffectiveFollowUpCount(q);
    if (count === 0) return "Registrar 1º contato";
    if (count === 1) return "Registrar 2º contato";
    if (count === 2) return "Registrar 3º contato";
    if (count === 3) return "Registrar 4º contato";
    if (count === 4) return "Finalizar Follow-up";
    return "Registrar Follow-up";
};

export const FollowUpView: React.FC = () => {
    const { quotes } = useOutletContext<any>();
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [viewMode, setViewMode] = useState<'list' | 'focus'>('list');
    const [filterType, setFilterType] = useState<'all' | 'mine' | string>(
        profile?.role === 'seller' ? 'mine' : 'all'
    );
    const [activeTab, setActiveTab] = useState<'contact0' | 'contact1' | 'contact2' | 'contact3' | 'contact4' | 'finalized'>('contact0');
    const [focusIndex, setFocusIndex] = useState(0);
    const [feedback, setFeedback] = useState<{ msg: string, type: 'info' | 'success' } | null>(null);
    const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());

    const [registerQuote, setRegisterQuote] = useState<Quote | null>(null);
    const [disableQuote, setDisableQuote] = useState<Quote | null>(null);
    const [followUpNote, setFollowUpNote] = useState('');
    const [nextFollowUpDate, setNextFollowUpDate] = useState('');
    const [disableReason, setDisableReason] = useState('');
    const [isLoading, setLoading] = useState(false);

    const handleRegisterFollowUpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!registerQuote || isLoading) return;
        
        if (!navigator.onLine) {
            alert("Sem conexão com a internet. O contato não foi registrado. Conecte-se e tente novamente.");
            return;
        }
        
        // Capture expected count at start of action
        const expectedFollowUpCount = getEffectiveFollowUpCount(registerQuote);
        
        setLoading(true);
        const isoNow = new Date().toISOString();
        try {
            const quoteRef = doc(db, 'orcamentos', registerQuote.id);
            const historyRef = doc(collection(db, 'orcamentos', registerQuote.id, 'followup_history'));
            
            // Generate next date
            const nextDate = nextFollowUpDate 
                ? new Date(nextFollowUpDate + 'T12:00:00').toISOString() 
                : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

            await runTransaction(db, async (transaction) => {
                const quoteDoc = await transaction.get(quoteRef);
                if (!quoteDoc.exists()) {
                    throw new Error("Documento do orçamento não existe!");
                }
                const quoteData = quoteDoc.data();
                
                // Multi-tenant check
                if (quoteData.companyId !== profile?.companyId) {
                    throw new Error("Bloqueio de Governança: Empresa inválida.");
                }

                // Expected count concurrency check
                const currentCount = getEffectiveFollowUpCount(quoteData);
                if (currentCount !== expectedFollowUpCount) {
                    throw new Error("Este contato já foi registrado ou modificado por outro usuário.");
                }

                const followUpCount = currentCount + 1;
                
                const logPayload = removeUndefinedDeep({
                    userId: profile?.uid || profile?.id,
                    userName: profile?.name || 'Sistema',
                    companyId: profile?.companyId,
                    quoteId: registerQuote.id,
                    contactNumber: followUpCount,
                    previousCount: currentCount,
                    newCount: followUpCount,
                    contactedAt: serverTimestamp(),
                    contactedBy: profile?.uid || profile?.id || 'system',
                    actionType: 'contacted',
                    timestamp: serverTimestamp(),
                    notes: followUpNote || 'Follow-up registrado manualmente'
                });

                const quoteUpdates: any = {
                    followUpLastAt: serverTimestamp(),
                    lastFollowUpAt: serverTimestamp(),
                    lastFollowUpBy: profile?.uid || profile?.id || 'system',
                    lastFollowUpByName: profile?.name || profile?.email || 'Sistema',
                    lastFollowUpNote: followUpNote,
                    followUpCount,
                    nextFollowUpAt: nextDate,
                    followUpStatus: 'followup_realizado',
                    updatedAt: serverTimestamp(),
                    history: [...(Array.isArray(quoteData.history) ? quoteData.history : []), {
                        date: isoNow,
                        user: profile?.name || 'Sistema',
                        action: `Contato ${followUpCount} registrado: ${followUpNote || 'Acompanhamento registrado manualmente'}`
                    }]
                };

                const cleanQuoteUpdates = removeUndefinedDeep(quoteUpdates);
                
                transaction.set(historyRef, logPayload);
                transaction.update(quoteRef, cleanQuoteUpdates);
            });
            
            const contactLabel = 
                expectedFollowUpCount === 0 ? "1º contato" :
                expectedFollowUpCount === 1 ? "2º contato" :
                expectedFollowUpCount === 2 ? "3º contato" :
                expectedFollowUpCount === 3 ? "4º contato" : `${expectedFollowUpCount + 1}º contato`;

            setRegisterQuote(null);
            setFollowUpNote('');
            setNextFollowUpDate('');
            setFeedback({ msg: `${contactLabel} registrado com sucesso.`, type: 'success' });
            setTimeout(() => setFeedback(null), 3000);
        } catch (err: any) {
            console.error('[MANUAL_FOLLOW_UP_ERROR]', err);
            const isOffline = !navigator.onLine || 
                err.code === 'unavailable' || 
                err.message?.toLowerCase().includes('offline') || 
                err.message?.toLowerCase().includes('network') || 
                err.message?.toLowerCase().includes('unavailable');
            
            if (isOffline) {
                alert("Sem conexão com a internet. O contato não foi registrado. Conecte-se e tente novamente.");
            } else {
                alert(err.message || 'Não foi possível registrar o contato. Tente novamente.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDisableFollowUpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!disableQuote || isLoading) return;
        
        if (!navigator.onLine) {
            alert("Sem conexão com a internet. O contato não foi registrado. Conecte-se e tente novamente.");
            return;
        }

        setLoading(true);
        const isoNow = new Date().toISOString();
        try {
            const quoteRef = doc(db, 'orcamentos', disableQuote.id);
            const historyRef = doc(collection(db, 'orcamentos', disableQuote.id, 'followup_history'));

            await runTransaction(db, async (transaction) => {
                const quoteDoc = await transaction.get(quoteRef);
                if (!quoteDoc.exists()) {
                    throw new Error("Documento do orçamento não existe!");
                }
                const quoteData = quoteDoc.data();

                // Multi-tenant check
                if (quoteData.companyId !== profile?.companyId) {
                    throw new Error("Bloqueio de Governança: Empresa inválida.");
                }

                const currentCount = getEffectiveFollowUpCount(quoteData);

                const logPayload = removeUndefinedDeep({
                    userId: profile?.uid || profile?.id,
                    userName: profile?.name || 'Sistema',
                    companyId: profile?.companyId,
                    quoteId: disableQuote.id,
                    contactNumber: currentCount,
                    previousCount: currentCount,
                    newCount: currentCount,
                    contactedAt: serverTimestamp(),
                    contactedBy: profile?.uid || profile?.id || 'system',
                    actionType: 'ignored',
                    timestamp: serverTimestamp(),
                    notes: disableReason || 'Acompanhamento desativado'
                });

                const quoteUpdates = {
                    followUpDisabled: true,
                    followUpDisabledReason: disableReason || 'Sem motivo informado',
                    followUpStatus: 'stopped',
                    updatedAt: serverTimestamp(),
                    history: [...(Array.isArray(quoteData.history) ? quoteData.history : []), {
                        date: isoNow,
                        user: profile?.name || 'Sistema',
                        action: `Acompanhamento desativado: ${disableReason || 'Sem motivo informado'}`
                    }]
                };

                const cleanQuoteUpdates = removeUndefinedDeep(quoteUpdates);

                transaction.set(historyRef, logPayload);
                transaction.update(quoteRef, cleanQuoteUpdates);
            });

            setProcessedIds(prev => new Set([...prev, disableQuote.id]));
            setDisableQuote(null);
            setDisableReason('');
            setFeedback({ msg: "Acompanhamento desativado com sucesso!", type: 'info' });
            setTimeout(() => setFeedback(null), 3000);
        } catch (err: any) {
            console.error('[DISABLE_FOLLOW_UP_ERROR]', err);
            const isOffline = !navigator.onLine || 
                err.code === 'unavailable' || 
                err.message?.toLowerCase().includes('offline') || 
                err.message?.toLowerCase().includes('network') || 
                err.message?.toLowerCase().includes('unavailable');
            
            if (isOffline) {
                alert("Sem conexão com a internet. O contato não foi registrado. Conecte-se e tente novamente.");
            } else {
                alert(err.message || 'Erro ao desativar follow-up.');
            }
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (value: any) => {
        return Number(value || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    };

    // 1. Filter and Enhanced Sort with Quote Score & Cadence
    const validQuotes = useMemo(() => quotes.filter(isValidQuoteForMetrics), [quotes]);

    const uniqueSellers = useMemo(() => {
        const sellersMap = new Map<string, string>();
        safeArray(quotes).forEach((q: Quote) => {
            if (q.sellerId && q.sellerName) {
                sellersMap.set(q.sellerId, q.sellerName);
            }
        });
        return Array.from(sellersMap.entries()).map(([id, name]) => ({ id, name }));
    }, [quotes]);

    const followUpList = useMemo(() => {
        const now = new Date();
        return validQuotes
            .filter((q: Quote) => isQuoteEligibleForFollowUp(q) && !processedIds.has(q.id))
            .map((q: Quote) => {
                const assistedScore = calculateQuoteScore(q);
                const marginAlert = analyzeMargin(q);
                const timer = getOpportunityTimer(q);
                const cadence = getFollowUpCadence(q);
                
                // Urgency mapping for sorting
                const nextDate = q.nextFollowUpAt ? new Date(q.nextFollowUpAt) : new Date(cadence.nextFollowUpAt);
                const isOverdue = nextDate < now;
                
                return {
                    quote: q,
                    alertStatus: getQuoteAlertStatus(q),
                    assistedScore,
                    marginAlert,
                    timer,
                    cadence: {
                        ...cadence,
                        nextDate,
                        isOverdue,
                        status: isOverdue ? 'overdue' : (differenceInHours(nextDate, now) < 12 ? 'pending' : 'on_track')
                    }
                };
            })
            .sort((a: any, b: any) => {
                // Sort by overdue first, then score
                if (a.cadence.isOverdue && !b.cadence.isOverdue) return -1;
                if (!a.cadence.isOverdue && b.cadence.isOverdue) return 1;
                return b.assistedScore.score - a.assistedScore.score;
            });
    }, [validQuotes, processedIds]);

    const filteredFollowUpList = useMemo(() => {
        const myId = profile?.uid || profile?.id;
        return followUpList.filter((item: any) => {
            if (filterType === 'all') return true;
            if (filterType === 'mine') {
                return item.quote.sellerId === myId || item.quote.userId === myId;
            }
            return item.quote.sellerId === filterType;
        });
    }, [followUpList, filterType, profile]);

    const contact0List = useMemo(() => {
        return filteredFollowUpList.filter((item: any) => getFollowUpTab(item.quote) === 'contact0');
    }, [filteredFollowUpList]);

    const contact1List = useMemo(() => {
        return filteredFollowUpList.filter((item: any) => getFollowUpTab(item.quote) === 'contact1');
    }, [filteredFollowUpList]);

    const contact2List = useMemo(() => {
        return filteredFollowUpList.filter((item: any) => getFollowUpTab(item.quote) === 'contact2');
    }, [filteredFollowUpList]);

    const contact3List = useMemo(() => {
        return filteredFollowUpList.filter((item: any) => getFollowUpTab(item.quote) === 'contact3');
    }, [filteredFollowUpList]);

    const contact4List = useMemo(() => {
        return filteredFollowUpList.filter((item: any) => getFollowUpTab(item.quote) === 'contact4');
    }, [filteredFollowUpList]);

    const finalizedList = useMemo(() => {
        return filteredFollowUpList.filter((item: any) => getFollowUpTab(item.quote) === 'finalized');
    }, [filteredFollowUpList]);

    const activeTabList = useMemo(() => {
        switch (activeTab) {
            case 'contact0': return contact0List;
            case 'contact1': return contact1List;
            case 'contact2': return contact2List;
            case 'contact3': return contact3List;
            case 'contact4': return contact4List;
            case 'finalized': return finalizedList;
            default: return contact0List;
        }
    }, [activeTab, contact0List, contact1List, contact2List, contact3List, contact4List, finalizedList]);

    const handleTabChange = (tab: 'contact0' | 'contact1' | 'contact2' | 'contact3' | 'contact4' | 'finalized') => {
        setActiveTab(tab);
        setFocusIndex(0);
    };

    const filteredSummary = useMemo(() => {
        let totalPendingValue = 0;
        let pendingCriticalCount = 0;
        let recoveredVolumeToday = 0;
        let recoveredCountToday = 0;
        let performedToday = 0;
        
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const myId = profile?.uid || profile?.id;
        
        validQuotes.forEach((q: Quote) => {
            // Apply filter
            if (filterType === 'mine') {
                if (q.sellerId !== myId && q.userId !== myId) return;
            } else if (filterType !== 'all') {
                if (q.sellerId !== filterType) return;
            }
            
            const history = Array.isArray(q.history) ? q.history : [];
            
            // Performed today
            const hadFollowUpToday = q.lastFollowUpAt?.startsWith(todayStr) || 
                                     (Array.isArray(history) && safeArray(history).some(h => 
                                        h.date?.startsWith(todayStr) && 
                                        (h.action?.includes('Follow-up') || h.action?.includes('CONTATO'))
                                     ));
            if (hadFollowUpToday) {
                performedToday++;
            }
            
            // Recovered today
            const wasApprovedToday = (q.status === 'approved' || q.status === 'converted') && 
                                   (Array.isArray(history) && safeArray(history).some(h => 
                                    h.date?.startsWith(todayStr) && 
                                    (h.action?.includes('APPROVE') || h.action?.includes('APROVADO') || h.action?.includes('CONVERTED'))
                                   ));
            const hasHistoryOfFollowUp = Array.isArray(history) && safeArray(history).some(h => h.action?.includes('Follow-up'));
            if (wasApprovedToday && hasHistoryOfFollowUp) {
                recoveredVolumeToday += (q.commercialTotal || 0);
                recoveredCountToday++;
            }
            
            // Critical
            const alertS = getQuoteAlertStatus(q);
            if (alertS.level === 'critical') {
                pendingCriticalCount++;
                totalPendingValue += (q.commercialTotal || 0);
            }
        });
        
        const conversionRate = performedToday > 0 ? (recoveredCountToday / performedToday) * 100 : 0;
        
        return { totalPendingValue, pendingCriticalCount, recoveredVolumeToday, recoveredCountToday, performedToday, conversionRate };
    }, [validQuotes, filterType, profile]);

    // 2. Performance & Goals Calculation
    const perfData = useMemo(() => {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        
        let companyPerformed = 0;
        let companyRecoveredVal = 0;
        let companyRecoveredCount = 0;
        let totalPendingValue = 0;

        const sellers: Record<string, { 
            name: string; 
            followUps: number; 
            recoveredVolume: number;
            criticalCount: number;
        }> = {};

        validQuotes.forEach((q: Quote) => {
            const sellerId = q.sellerId || 'direta';
            const sellerName = q.sellerName || 'Venda Direta';
            
            if (!sellers[sellerId]) {
                sellers[sellerId] = { name: sellerName, followUps: 0, recoveredVolume: 0, criticalCount: 0 };
            }

            const history = Array.isArray(q.history) ? q.history : [];
            
            // Performed today
            const hadFollowUpToday = q.lastFollowUpAt?.startsWith(todayStr) || 
                                     (Array.isArray(history) && safeArray(history).some(h => 
                                        h.date?.startsWith(todayStr) && 
                                        (h.action?.includes('Follow-up') || h.action?.includes('CONTATO'))
                                     ));
            
            if (hadFollowUpToday) {
                companyPerformed++;
                sellers[sellerId].followUps++;
            }

            // Recovered today
            const wasApprovedToday = (q.status === 'approved' || q.status === 'converted') && 
                                   (Array.isArray(history) && safeArray(history).some(h => 
                                    h.date?.startsWith(todayStr) && 
                                    (h.action?.includes('APPROVE') || h.action?.includes('APROVADO') || h.action?.includes('CONVERTED'))
                                   ));
            
            const hasHistoryOfFollowUp = Array.isArray(history) && safeArray(history).some(h => h.action?.includes('Follow-up'));

            if (wasApprovedToday && hasHistoryOfFollowUp) {
                const total = (q.commercialTotal || 0);
                companyRecoveredVal += total;
                companyRecoveredCount++;
                sellers[sellerId].recoveredVolume += total;
            }

            // Negligence check (critical and assigned to seller)
            const alertS = getQuoteAlertStatus(q);
            if (alertS.level === 'critical') {
                sellers[sellerId].criticalCount++;
                totalPendingValue += (q.commercialTotal || 0);
            }
        });

        const sellerList = Object.values(sellers);
        const topFollowUps = [...sellerList].sort((a, b) => b.followUps - a.followUps)[0];
        const topRecovered = [...sellerList].sort((a, b) => b.recoveredVolume - a.recoveredVolume)[0];
        const mostCritical = [...sellerList].sort((a, b) => b.criticalCount - a.criticalCount)[0];

        // Individual stats
        const myId = profile?.uid || profile?.id;
        const myStats = sellers[myId || 'non-existent'] || { followUps: 0, recoveredVolume: 0, criticalCount: 0 };
        
        // Goals (Configurable constants)
        const FU_GOAL = 10;
        const REC_GOAL = 20000;
        const TEAM_REC_GOAL = 100000; // Team collective goal

        const pendingCriticalCount = safeArray(followUpList).filter((i: any) => i.alertStatus.level === 'critical').length;
        const conversionRate = companyPerformed > 0 ? (companyRecoveredCount / companyPerformed) * 100 : 0;

        return {
            summary: {
                performedToday: companyPerformed,
                recoveredVolumeToday: companyRecoveredVal,
                recoveredCountToday: companyRecoveredCount,
                conversionRate,
                pendingCriticalCount,
                totalPendingValue
            },
            highlights: {
                topFollowUps,
                topRecovered,
                mostCritical,
                sellerRank: sellerList.sort((a, b) => b.recoveredVolume - a.recoveredVolume)
            },
            myPerformance: {
                ...myStats,
                fuGoal: FU_GOAL,
                recGoal: REC_GOAL,
                fuGoalPercent: (myStats.followUps / FU_GOAL) * 100,
                recGoalPercent: (myStats.recoveredVolume / REC_GOAL) * 100
            },
            teamPerformance: {
                recoveredVolume: companyRecoveredVal,
                goal: TEAM_REC_GOAL,
                goalPercent: (companyRecoveredVal / TEAM_REC_GOAL) * 100
            }
        };
    }, [validQuotes, followUpList, profile]);

    // Live recovery detection for feedback
    const prevRecoveredCount = useRef(filteredSummary.recoveredCountToday);
    useEffect(() => {
        if (filteredSummary.recoveredCountToday > prevRecoveredCount.current) {
            setFeedback({ msg: "💥 VENDA RECUPERADA! Parabéns!", type: 'success' });
            setTimeout(() => setFeedback(null), 5000);
        }
        prevRecoveredCount.current = filteredSummary.recoveredCountToday;
    }, [filteredSummary.recoveredCountToday]);

    const saveFollowUpAction = async (quote: Quote, data: {
        actionType: 'snoozed' | 'ignored' | 'cleared';
        notes?: string;
        nextFollowUpAt?: string;
        followUpStatus?: 'pending' | 'done' | 'snoozed' | 'stopped';
    }) => {
        if (!navigator.onLine) {
            alert("Sem conexão com a internet. O contato não foi registrado. Conecte-se e tente novamente.");
            return false;
        }

        const isoNow = new Date().toISOString();
        
        try {
            const quoteRef = doc(db, 'orcamentos', quote.id);
            const historyRef = doc(collection(db, 'orcamentos', quote.id, 'followup_history'));

            await runTransaction(db, async (transaction) => {
                const quoteDoc = await transaction.get(quoteRef);
                if (!quoteDoc.exists()) {
                    throw new Error("Documento do orçamento não existe!");
                }
                const quoteData = quoteDoc.data();
                
                // Multi-tenant check
                if (quoteData.companyId !== profile?.companyId) {
                    throw new Error("Bloqueio de Governança: Empresa inválida.");
                }

                const currentCount = getEffectiveFollowUpCount(quoteData);

                const logPayload = removeUndefinedDeep({
                    userId: profile?.uid || profile?.id,
                    userName: profile?.name || 'Sistema',
                    companyId: profile?.companyId,
                    quoteId: quote.id,
                    contactNumber: currentCount,
                    previousCount: currentCount,
                    newCount: currentCount,
                    contactedAt: serverTimestamp(),
                    contactedBy: profile?.uid || profile?.id || 'system',
                    actionType: data.actionType,
                    timestamp: serverTimestamp(),
                    notes: data.notes || ''
                });

                const quoteUpdates: any = {
                    nextFollowUpAt: data.nextFollowUpAt || quoteData.nextFollowUpAt || null,
                    followUpStatus: data.followUpStatus || quoteData.followUpStatus || null,
                    updatedAt: serverTimestamp(),
                    history: [...(Array.isArray(quoteData.history) ? quoteData.history : []), {
                        date: isoNow,
                        user: profile?.name || 'Sistema',
                        action: `Acompanhamento (${data.actionType}): ${data.notes || 'Ação registrada via Central'}`
                    }]
                };

                const cleanQuoteUpdates = removeUndefinedDeep(quoteUpdates);
                
                transaction.set(historyRef, logPayload);
                transaction.update(quoteRef, cleanQuoteUpdates);
            });

            // 3. Remover da lista visual
            setProcessedIds(prev => new Set([...prev, quote.id]));
            
            return true;
        } catch (err: any) {
            console.error('[FOLLOW_UP_SAVE_ERROR]', err);
            const isOffline = !navigator.onLine || 
                err.code === 'unavailable' || 
                err.message?.toLowerCase().includes('offline') || 
                err.message?.toLowerCase().includes('network') || 
                err.message?.toLowerCase().includes('unavailable');
            
            if (isOffline) {
                alert("Sem conexão com a internet. O contato não foi registrado. Conecte-se e tente novamente.");
            } else {
                alert('Falha ao registrar ação de follow-up. Tente novamente.');
            }
            return false;
        }
    };

    const handleFinalizeFollowUp = async (quote: Quote) => {
        if (isLoading) return;
        
        if (!navigator.onLine) {
            alert("Sem conexão com a internet. O contato não foi registrado. Conecte-se e tente novamente.");
            return;
        }

        if (!window.confirm('Deseja finalizar o follow-up deste cliente?')) return;
        
        setLoading(true);
        const isoNow = new Date().toISOString();
        try {
            const quoteRef = doc(db, 'orcamentos', quote.id);
            const historyRef = doc(collection(db, 'orcamentos', quote.id, 'followup_history'));

            await runTransaction(db, async (transaction) => {
                const quoteDoc = await transaction.get(quoteRef);
                if (!quoteDoc.exists()) {
                    throw new Error("Documento do orçamento não existe!");
                }
                const quoteData = quoteDoc.data();
                
                // Multi-tenant check
                if (quoteData.companyId !== profile?.companyId) {
                    throw new Error("Bloqueio de Governança: Empresa inválida.");
                }

                // Check expected count (must be 4 to finalize from tab 4)
                const currentCount = getEffectiveFollowUpCount(quoteData);
                if (currentCount !== 4) {
                    throw new Error("Este follow-up não está no 4º contato.");
                }

                const logPayload = removeUndefinedDeep({
                    userId: profile?.uid || profile?.id,
                    userName: profile?.name || 'Sistema',
                    companyId: profile?.companyId,
                    quoteId: quote.id,
                    contactNumber: 4,
                    previousCount: 4,
                    newCount: 4,
                    contactedAt: serverTimestamp(),
                    contactedBy: profile?.uid || profile?.id || 'system',
                    actionType: 'followup_completed',
                    timestamp: serverTimestamp(),
                    notes: 'Follow-up finalizado após 4 contatos'
                });

                const quoteUpdates = {
                    followUpStatus: 'completed',
                    followUpFinishedAt: serverTimestamp(),
                    followUpFinishedReason: "Limite de 4 contatos atingido",
                    updatedAt: serverTimestamp(),
                    history: [...(Array.isArray(quoteData.history) ? quoteData.history : []), {
                        date: isoNow,
                        user: profile?.name || 'Sistema',
                        action: `Follow-up finalizado após 4 contatos`
                    }]
                };

                const cleanQuoteUpdates = removeUndefinedDeep(quoteUpdates);

                transaction.set(historyRef, logPayload);
                transaction.update(quoteRef, cleanQuoteUpdates);
            });

            setFeedback({ msg: "Follow-up finalizado com sucesso.", type: 'success' });
            setTimeout(() => setFeedback(null), 3000);
        } catch (err: any) {
            console.error('[FINALIZE_FOLLOW_UP_ERROR]', err);
            const isOffline = !navigator.onLine || 
                err.code === 'unavailable' || 
                err.message?.toLowerCase().includes('offline') || 
                err.message?.toLowerCase().includes('network') || 
                err.message?.toLowerCase().includes('unavailable');
            
            if (isOffline) {
                alert("Sem conexão com a internet. O contato não foi registrado. Conecte-se e tente novamente.");
            } else {
                alert(err.message || 'Não foi possível finalizar o follow-up. Tente novamente.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleWhatsApp = async (item: any, scenario?: string, action: 'open' | 'copy' = 'open') => {
        const { quote } = item;
        const messages = getAssistedMessages(quote, profile?.name || 'Consultor');
        const selectedMsg = scenario ? messages.find(m => m.scenario === scenario) : messages[0];
        const message = selectedMsg?.message || messages[0].message;
        const phone = quote.customerPhone?.replace(/\D/g, '');

        if (action === 'copy' && message) {
            await navigator.clipboard.writeText(message);
            setFeedback({ msg: "Mensagem copiada. Cole no WhatsApp.", type: 'info' });
            setTimeout(() => setFeedback(null), 3000);
            return;
        }

        if (phone && message) {
            openWhatsAppFollowUp(phone, message);
            setFeedback({ msg: "WhatsApp aberto com sucesso!", type: 'info' });
            setTimeout(() => setFeedback(null), 3000);
        } else {
            alert('Dados do cliente insuficientes para abrir o WhatsApp.');
        }
    };

    const handleSnooze = async (quote: Quote, hours: number) => {
        const snoozeDate = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
        
        const success = await saveFollowUpAction(quote, {
            actionType: 'snoozed',
            notes: `Soneca de ${hours}h aplicada`,
            nextFollowUpAt: snoozeDate,
            followUpStatus: 'snoozed'
        });

        if (success) {
            setFeedback({ msg: `Soneca de ${hours}h aplicada`, type: 'info' });
            setTimeout(() => setFeedback(null), 3000);
        }
    };

    const handleIgnoreAll = async () => {
        if (activeTabList.length === 0) return;
        if (!window.confirm(`Deseja realmente ignorar os ${activeTabList.length} itens restantes da lista de hoje?`)) return;

        setLoading(true);
        try {
            for (const item of activeTabList) {
                await saveFollowUpAction(item.quote, {
                    actionType: 'cleared',
                    notes: 'Limpeza em massa da Central de Follow-up',
                    followUpStatus: 'snoozed',
                    nextFollowUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                });
            }
            setFeedback({ msg: "Lista limpa com sucesso!", type: 'info' });
        } catch (err) {
            console.error('[IGNORE_ALL_ERROR]', err);
        } finally {
            setLoading(false);
            setTimeout(() => setFeedback(null), 3000);
        }
    };

    const currentFocus = activeTabList[focusIndex];

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-20 relative">
            {/* Feedback Notification */}
            {feedback && (
                <div className="fixed top-24 right-8 z-[1000] animate-in slide-in-from-right-10 duration-300">
                    <Badge className={cn(
                        "border-none py-3 px-6 rounded-2xl shadow-2xl font-black uppercase tracking-widest flex items-center gap-2",
                        feedback.type === 'success' ? "bg-emerald-500 text-white" : "bg-brand-rocha-primary text-white"
                    )}>
                        {feedback.type === 'success' ? <Trophy className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        {feedback.msg}
                    </Badge>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tighter flex items-center gap-3">
                        Camada Comercial Assistida <Sparkles className="h-7 w-7 text-brand-rocha-primary animate-pulse" />
                    </h2>
                    <p className="text-slate-400 font-bold text-sm uppercase tracking-widest mt-1 italic">Inteligência Ativa para Venda e Recuperação</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
                    <select
                        value={filterType}
                        onChange={(e) => {
                            setFilterType(e.target.value);
                            setFocusIndex(0);
                        }}
                        className="p-1.5 px-3 h-9 bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-slate-500 focus:outline-none cursor-pointer dark:text-white"
                    >
                        <option value="all">🏢 Todos da Empresa</option>
                        <option value="mine">💼 Minha Carteira</option>
                        {uniqueSellers.map(s => (
                            <option key={s.id} value={s.id}>👤 {s.name}</option>
                        ))}
                    </select>

                    <div className="w-px h-6 bg-slate-200 dark:bg-white/10 hidden md:block" />

                    {activeTabList.length > 0 && (
                        <button
                            onClick={handleIgnoreAll}
                            disabled={isLoading}
                            className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                        >
                            <Square className="h-4 w-4" /> Ignorar Todos
                        </button>
                    )}
                    
                    <button
                        onClick={() => setViewMode('list')}
                        className={cn(
                            "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                            viewMode === 'list' ? "bg-slate-900 text-white dark:bg-brand-emerald dark:text-slate-900" : "text-slate-400"
                        )}
                    >
                        <LayoutGrid className="h-4 w-4" /> Lista de Foco
                    </button>
                    <button
                        onClick={() => setViewMode('focus')}
                        className={cn(
                            "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                            viewMode === 'focus' ? "bg-slate-900 text-white dark:bg-brand-emerald dark:text-slate-900" : "text-slate-400"
                        )}
                    >
                        <Square className="h-4 w-4" /> Modo Assistente
                    </button>
                </div>
            </div>

            {/* Performance Bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                 <Card className="rounded-[2.5rem] bg-white dark:bg-slate-900 border-none p-6 shadow-premium hover:shadow-xl transition-all">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Impacto Financeiro Pendente</p>
                    <p className="text-xl font-black text-rose-600">{formatCurrency(filteredSummary.totalPendingValue)}</p>
                    <p className="text-[8px] font-bold text-slate-400 mt-2 uppercase flex items-center gap-1">
                        <Timer className="h-3 w-3" /> {filteredSummary.pendingCriticalCount} leads críticos
                    </p>
                 </Card>
                 <Card className="rounded-[2.5rem] bg-white dark:bg-slate-900 border-none p-6 shadow-premium hover:shadow-xl transition-all">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Recuperado Hoje</p>
                    <p className="text-xl font-black text-emerald-600">{formatCurrency(filteredSummary.recoveredVolumeToday)}</p>
                    <p className="text-[8px] font-bold text-slate-400 mt-2 uppercase flex items-center gap-1">
                        <Trophy className="h-3 w-3" /> {filteredSummary.recoveredCountToday} Vendas resgatadas
                    </p>
                 </Card>
                 <Card className="rounded-[2.5rem] bg-white dark:bg-slate-900 border-none p-6 shadow-premium hover:shadow-xl transition-all">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Taxa de Conversão Diária</p>
                    <p className="text-xl font-black text-brand-rocha-primary">{filteredSummary.conversionRate.toFixed(1)}%</p>
                    <p className="text-[8px] font-bold text-slate-400 mt-2 uppercase">Conversão em Follow-ups assistidos</p>
                 </Card>
                 <Card className="rounded-[2.5rem] bg-slate-900 dark:bg-brand-rocha-primary border-none p-6 text-white shadow-2xl group hover:scale-[1.02] transition-all">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Minha Meta de Hoje</p>
                    <div className="flex items-center justify-between">
                        <p className="text-xl font-black">{Math.round(perfData.myPerformance.fuGoalPercent)}%</p>
                        <Target className="h-5 w-5 opacity-40" />
                    </div>
                    <div className="h-1.5 w-full bg-white/10 rounded-full mt-3 overflow-hidden">
                        <div className="h-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" style={{ width: `${Math.min(100, perfData.myPerformance.fuGoalPercent)}%` }} />
                    </div>
                 </Card>
            </div>

            {/* Tabs Selector */}
            <div className="flex flex-wrap border-b border-slate-200 dark:border-white/10 mt-2 mb-6 gap-1">
                {[
                    { id: 'contact0', label: 'Sem Contato', count: contact0List.length },
                    { id: 'contact1', label: '1º Contato', count: contact1List.length },
                    { id: 'contact2', label: '2º Contato', count: contact2List.length },
                    { id: 'contact3', label: '3º Contato', count: contact3List.length },
                    { id: 'contact4', label: '4º Contato', count: contact4List.length },
                    { id: 'finalized', label: 'Finalizados', count: finalizedList.length }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id as any)}
                        className={cn(
                            "pb-4 px-4 sm:px-6 text-xs font-black uppercase tracking-widest transition-all border-b-2 -mb-px flex items-center gap-2",
                            activeTab === tab.id 
                                ? "border-brand-rocha-primary text-brand-rocha-primary dark:text-white dark:border-white" 
                                : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        )}
                    >
                        {tab.label}
                        <span className={cn(
                            "px-2 py-0.5 rounded-full text-[9px] font-bold",
                            activeTab === tab.id 
                                ? "bg-brand-rocha-primary/10 text-brand-rocha-primary dark:bg-white/10 dark:text-white" 
                                : "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400"
                        )}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* Foco do Dia - Top 3 */}
            {viewMode === 'list' && activeTabList.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-2">
                        <Flame className="h-5 w-5 text-orange-500 fill-orange-500" />
                        <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Foco do Dia (Alta Prioridade)</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {activeTabList.slice(0, 3).map((item: any) => (
                            <Card key={`top-${item.quote.id}`} 
                                className="rounded-[2rem] bg-gradient-to-br from-slate-900 to-slate-800 border-none p-6 text-white shadow-2xl relative overflow-hidden group cursor-pointer hover:scale-[1.02] transition-all"
                                onClick={() => navigate(`/orcamentos/${item.quote.id}/editar`)}
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <Trophy className="h-20 w-20" />
                                </div>
                                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                    <Sparkles className="h-3 w-3" /> Prioridade Máxima
                                </p>
                                <h4 className="text-lg font-black uppercase truncate mb-1">{item.quote.customerName}</h4>
                                <p className="text-3xl font-black text-white font-mono tracking-tighter mb-4">{formatCurrency(item.quote.commercialTotal)}</p>
                                <div className="flex items-center justify-between">
                                    <Badge className="bg-white/10 text-white border-none text-[9px] font-black uppercase py-1">
                                        {item.cadence.label}
                                    </Badge>
                                    <ArrowUpRight className="h-5 w-5 text-emerald-400 opacity-0 group-hover:opacity-100 transition-all" />
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* List / Focus View */}
            {viewMode === 'list' ? (
                <div className="grid grid-cols-1 gap-4">
                    {safeArray(activeTabList).map((item: any) => {
                        return (
                            <Card key={item.quote.id} className="rounded-[2rem] bg-white dark:bg-slate-900 border-none shadow-premium p-0 hover:shadow-2xl transition-all group relative overflow-hidden">
                                <div className={cn("absolute left-0 top-0 bottom-0 w-1.5", 
                                    item.cadence.status === 'overdue' ? "bg-rose-500" : 
                                    item.cadence.status === 'pending' ? "bg-amber-500" : "bg-emerald-500"
                                )} />
                                
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 items-stretch">
                                    <div className="lg:col-span-4 p-8 border-r border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                                        <div className="flex flex-col h-full justify-center">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h4 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] truncate">
                                                    {item.quote.customerName}
                                                </h4>
                                                <span className={cn("text-[9px] font-black flex items-center gap-1 uppercase px-2 py-0.5 rounded-md", 
                                                    item.cadence.isOverdue ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"
                                                )}>
                                                    {item.timer.label}
                                                </span>
                                            </div>
                                            <p className="text-4xl font-black text-slate-900 dark:text-white font-mono tracking-tight leading-none">
                                                {formatCurrency(item.quote.commercialTotal)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="lg:col-span-5 p-8 flex flex-col justify-center">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-3">O que fazer agora?</p>
                                        <h5 className="text-xl font-black text-brand-rocha-primary uppercase tracking-tight leading-tight mb-2">
                                            {item.cadence.label}
                                        </h5>
                                    </div>

                                    <div className="lg:col-span-3 p-8 flex flex-col justify-center gap-3">
                                        {getFollowUpTab(item.quote) === 'finalized' ? (
                                            <div className="text-center p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-[10px] font-semibold text-slate-500 dark:text-slate-455 uppercase tracking-wider">
                                                Follow-up finalizado para evitar excesso de contato com o cliente.
                                            </div>
                                        ) : (
                                            <>
                                                <Button 
                                                    onClick={() => handleWhatsApp(item, 'follow_up')}
                                                    className="h-12 w-full text-[10px] font-black uppercase tracking-[0.2em] bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-md shadow-emerald-500/10 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <Phone className="h-4 w-4" />
                                                    Fazer Contato
                                                </Button>

                                                {getEffectiveFollowUpCount(item.quote) === 4 ? (
                                                    <Button 
                                                        onClick={() => handleFinalizeFollowUp(item.quote)}
                                                        disabled={isLoading}
                                                        className="h-10 w-full text-[9px] font-black uppercase tracking-[0.15em] bg-slate-900 dark:bg-white dark:text-slate-900 hover:bg-slate-800 text-white rounded-xl hover:scale-[1.01] transition-all flex items-center justify-center gap-2"
                                                    >
                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                        Finalizar Follow-up
                                                    </Button>
                                                ) : (
                                                    <Button 
                                                        onClick={() => setRegisterQuote(item.quote)}
                                                        className="h-10 w-full text-[9px] font-black uppercase tracking-[0.15em] bg-brand-rocha-primary hover:bg-brand-rocha-primary/95 text-white rounded-xl hover:scale-[1.01] transition-all flex items-center justify-center gap-2"
                                                    >
                                                        <MessageSquare className="h-3.5 w-3.5" />
                                                        {getRegisterButtonLabel(item.quote)}
                                                    </Button>
                                                )}

                                                <div className="flex gap-2">
                                                    <Button 
                                                        onClick={() => handleSnooze(item.quote, 24)}
                                                        variant="outline"
                                                        className="flex-1 h-9 text-[8px] font-black uppercase tracking-widest border-slate-200 text-slate-400 hover:text-amber-500 hover:border-amber-500 transition-all rounded-lg"
                                                    >
                                                        Adiar 24h
                                                    </Button>
                                                    <Button 
                                                        onClick={() => setDisableQuote(item.quote)}
                                                        variant="outline"
                                                        className="flex-1 h-9 text-[8px] font-black uppercase tracking-widest border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-500 transition-all rounded-lg"
                                                    >
                                                        Ignorar
                                                    </Button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <div className="relative max-w-5xl mx-auto pb-40">
                    {currentFocus ? (
                        <div className="animate-in zoom-in-95 duration-500">
                            <Card className="rounded-[4rem] bg-white dark:bg-slate-900 border-none shadow-premium p-16 relative overflow-hidden">
                                <div className="flex flex-col lg:flex-row gap-16 items-start">
                                    <div className="flex-1 space-y-12">
                                        <h3 className="text-6xl font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none mb-6">
                                            {currentFocus.quote.customerName}
                                        </h3>
                                    </div>

                                    <div className="w-full lg:w-[420px] space-y-8">
                                        <div className="pt-6 border-t border-white/5 space-y-3 relative z-10">
                                            {getFollowUpTab(currentFocus.quote) === 'finalized' ? (
                                                <div className="text-center p-3 bg-white/5 rounded-xl text-[10px] font-semibold text-slate-450 uppercase tracking-wider">
                                                    Follow-up finalizado para evitar excesso de contato com o cliente.
                                                </div>
                                            ) : (
                                                <>
                                                    {getEffectiveFollowUpCount(currentFocus.quote) === 4 ? (
                                                        <Button 
                                                            onClick={() => handleFinalizeFollowUp(currentFocus.quote)}
                                                            disabled={isLoading}
                                                            className="w-full h-12 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2"
                                                        >
                                                            <CheckCircle2 className="h-4 w-4" /> Finalizar Follow-up
                                                        </Button>
                                                    ) : (
                                                        <Button 
                                                            onClick={() => setRegisterQuote(currentFocus.quote)}
                                                            className="w-full h-12 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2"
                                                        >
                                                            <MessageSquare className="h-4 w-4" /> {getRegisterButtonLabel(currentFocus.quote)}
                                                        </Button>
                                                    )}
                                                    <Button 
                                                        onClick={() => setDisableQuote(currentFocus.quote)}
                                                        className="w-full h-12 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2"
                                                    >
                                                        Não precisa mais follow-up
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                        
                                        <div className="pt-4 grid grid-cols-2 gap-5 relative z-10">
                                            <Button 
                                                onClick={() => navigate(`/orcamentos/${currentFocus.quote.id}/editar`)}
                                                variant="outline" className="h-14 bg-transparent border-white/20 text-white rounded-2xl hover:bg-white/5 font-black uppercase text-[9px] tracking-widest"
                                            >
                                                Editor Completo
                                            </Button>
                                            <Button 
                                                onClick={() => setFocusIndex(prev => (prev + 1) % activeTabList.length)}
                                                variant="outline" className="h-14 bg-transparent border-white/20 text-white rounded-2xl hover:bg-white/5 font-black uppercase text-[9px] tracking-widest"
                                            >
                                                Próximo (Pular)
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            <div className="flex items-center justify-between mt-12 px-10">
                                <Button 
                                    disabled={focusIndex === 0}
                                    onClick={() => setFocusIndex(prev => prev - 1)}
                                    variant="ghost" className="h-24 w-24 rounded-[3rem] bg-white dark:bg-slate-800 disabled:opacity-20 hover:bg-slate-100 transition-all shadow-xl group border-none"
                                >
                                    <ChevronLeft className="h-12 w-12 text-slate-300 group-hover:text-brand-rocha-primary transition-colors" />
                                </Button>
                                <Button 
                                    disabled={focusIndex === activeTabList.length - 1}
                                    onClick={() => setFocusIndex(prev => prev + 1)}
                                    variant="ghost" className="h-24 w-24 rounded-[3rem] bg-white dark:bg-slate-800 disabled:opacity-20 hover:bg-slate-100 transition-all shadow-xl group border-none"
                                >
                                    <ChevronRight className="h-12 w-12 text-slate-300 group-hover:text-brand-rocha-primary transition-colors" />
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="py-20 text-center flex flex-col items-center">
                            <div className="h-32 w-32 rounded-[3.5rem] bg-emerald-500 text-white flex items-center justify-center mb-10 shadow-3xl shadow-emerald-500/40">
                                <Zap className="h-16 w-16" />
                            </div>
                            <h3 className="text-4xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Oportunidades Esgotadas!</h3>
                            <p className="text-slate-400 font-bold max-w-sm mx-auto mt-6 text-xl leading-relaxed uppercase tracking-widest">Sua inteligência comercial processou todos os leads pendentes com sucesso.</p>
                            <Button onClick={() => setViewMode('list')} variant="ghost" className="mt-12 font-black uppercase tracking-widest text-brand-rocha-primary text-base hover:underline">Ver Dashboard Completo</Button>
                        </div>
                    )}
                </div>
            )}

            {/* Modal: Registrar Follow-up */}
            <Modal
                isOpen={!!registerQuote}
                onClose={() => { setRegisterQuote(null); setFollowUpNote(''); setNextFollowUpDate(''); }}
                title="Registrar Follow-up Comercial"
                className="max-w-md"
            >
                <form onSubmit={handleRegisterFollowUpSubmit} className="space-y-4 py-2">
                    <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Observações do Contato</label>
                        <textarea
                            value={followUpNote}
                            onChange={(e) => setFollowUpNote(e.target.value)}
                            required
                            placeholder="Descreva o retorno do cliente ou detalhes da conversa..."
                            className="w-full h-24 p-3 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-rocha-primary"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Próximo Contato (Opcional)</label>
                        <input
                            type="date"
                            value={nextFollowUpDate}
                            onChange={(e) => setNextFollowUpDate(e.target.value)}
                            className="w-full p-3 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-rocha-primary"
                        />
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                        <Button 
                            type="button" 
                            variant="outline" 
                            disabled={isLoading}
                            onClick={() => { setRegisterQuote(null); setFollowUpNote(''); setNextFollowUpDate(''); }} 
                            className="h-10 text-xs uppercase font-black tracking-widest"
                        >
                            Cancelar
                        </Button>
                        <Button 
                            type="submit" 
                            disabled={isLoading}
                            className="h-10 text-xs bg-brand-rocha-primary hover:bg-brand-rocha-primary/95 text-white uppercase font-black tracking-widest"
                        >
                            {isLoading ? "REGISTRANDO..." : "Confirmar"}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Modal: Não precisa mais follow-up */}
            <Modal
                isOpen={!!disableQuote}
                onClose={() => { setDisableQuote(null); setDisableReason(''); }}
                title="Desativar Acompanhamento de Lead"
                className="max-w-md"
            >
                <form onSubmit={handleDisableFollowUpSubmit} className="space-y-4 py-2">
                    <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Motivo do Encerramento</label>
                        <textarea
                            value={disableReason}
                            onChange={(e) => setDisableReason(e.target.value)}
                            required
                            placeholder="Explique o motivo para não fazer mais follow-up (ex: cliente fechou com concorrente, desistiu da obra, etc.)...."
                            className="w-full h-24 p-3 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                        <Button 
                            type="button" 
                            variant="outline" 
                            disabled={isLoading}
                            onClick={() => { setDisableQuote(null); setDisableReason(''); }} 
                            className="h-10 text-xs uppercase font-black tracking-widest"
                        >
                            Cancelar
                        </Button>
                        <Button 
                            type="submit" 
                            disabled={isLoading}
                            className="h-10 text-xs bg-rose-500 hover:bg-rose-600 text-white uppercase font-black tracking-widest"
                        >
                            {isLoading ? "REGISTRANDO..." : "Confirmar"}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};
