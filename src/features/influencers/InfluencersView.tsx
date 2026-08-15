import { safeArray } from '../../lib/dataDiagnostics';
import { safeParseISO, formatVisualDate, compareDatesSafe } from '../../lib/dateUtils';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
    Users, Plus, Search, Filter, TrendingUp, 
    Target, Wallet, Phone, 
    Crown, Award, ChevronRight, X, 
    BarChart3, AlertTriangle, CheckCircle, Info, Flame, Copy, Check, AlertCircle, Send
} from 'lucide-react';
import { useInfluencers } from '../../hooks/useInfluencers';
import { useClients } from '../../hooks/useClients';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/utils';
import { format,  differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { openWhatsAppFollowUp } from '../../utils/whatsappHelper';
import { InfluencerRankingView } from './InfluencerRankingView';
import { InfluencerAlertsPanel } from './InfluencerAlertsPanel';
import { PartnerSettlement } from './PartnerSettlement';
import { useAuth } from '../../context/AuthContext';
import { toISODateSafe } from '../../lib/dateWriteUtils';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export const InfluencersView: React.FC = () => {
    const { influencers, addInfluencer, updateInfluencer, bonusRecords, updateBonusStatus } = useInfluencers();
    const { clients } = useClients();
    const { user, profile } = useAuth();
    const [quotes, setQuotes] = useState<any[]>([]);
    const [contracts, setContracts] = useState<any[]>([]);
    const [orders, setOrders] = useState<any[]>([]);

    const getClientStatusAndValue = (clientId: string) => {
        const clientQuotes = safeArray(quotes).filter((q: any) => q.clientId === clientId);
        const clientContracts = safeArray(contracts).filter((c: any) => c.clientId === clientId);
        const clientOrders = safeArray(orders).filter((o: any) => o.clientId === clientId);

        // 1. Fechado
        const hasSignedContract = clientContracts.some((c: any) => c.contractStatus === 'signed');
        const hasActiveProductionOrFinishedOrder = clientOrders.some((o: any) => 
            (o.status === 'production' || o.status === 'em_producao' ||
             o.status === 'installation' || o.status === 'em_instalacao' ||
             o.status === 'finished' || o.status === 'finalizado') && 
            o.status !== 'cancelled' && o.status !== 'cancelado'
        );

        if (hasSignedContract || hasActiveProductionOrFinishedOrder) {
            let maxValue = 0;
            clientContracts.forEach((c: any) => {
                if (c.contractStatus === 'signed') {
                    maxValue = Math.max(maxValue, Number(c.totalAmount) || 0);
                }
            });
            clientOrders.forEach((o: any) => {
                if (o.status !== 'cancelled' && o.status !== 'cancelado') {
                    maxValue = Math.max(maxValue, Number(o.totalAmount) || 0);
                }
            });
            return { label: 'Fechado', value: maxValue, color: 'bg-emerald-500 text-white' };
        }

        // 2. Instalação
        const hasInstallationOrder = clientOrders.some((o: any) => 
            (o.status === 'installation' || o.status === 'em_instalacao') &&
            o.status !== 'cancelled' && o.status !== 'cancelado'
        );
        if (hasInstallationOrder) {
            return { label: 'Instalação', value: 0, color: 'bg-indigo-500 text-white' };
        }

        // 3. Produção
        const hasProductionOrder = clientOrders.some((o: any) => 
            (o.status === 'production' || o.status === 'em_producao' || o.status === 'production_queue') &&
            o.status !== 'cancelled' && o.status !== 'cancelado'
        );
        if (hasProductionOrder) {
            return { label: 'Produção', value: 0, color: 'bg-amber-500 text-white' };
        }

        // 4. Em Contrato
        const hasDraftOrPendingContract = clientContracts.some((c: any) => 
            ['draft', 'company_signed', 'pending', 'viewed'].includes(c.contractStatus || '')
        );
        if (hasDraftOrPendingContract) {
            return { label: 'Em Contrato', value: 0, color: 'bg-blue-500 text-white' };
        }

        // 5. Medição
        const hasMeasurement = clientQuotes.some((q: any) => 
            q.measurementId || 
            q.status === 'measuring' || 
            ['aguardando_medicao', 'pos_medicao'].includes(q.quoteStage || '')
        );
        if (hasMeasurement) {
            return { label: 'Medição', value: 0, color: 'bg-sky-500 text-white' };
        }

        // 6. Lead (Orçamento Criado)
        const hasQuote = clientQuotes.some((q: any) => 
            q.status !== 'lost' && q.status !== 'cancelled' && q.quoteStage !== 'perdido'
        );
        if (hasQuote) {
            return { label: 'Lead', value: 0, color: 'bg-slate-500 text-white' };
        }

        // 7. Perdido (Orçamento perdido/cancelado)
        const hasLostQuote = clientQuotes.some((q: any) => 
            q.status === 'lost' || q.status === 'cancelled' || q.quoteStage === 'perdido'
        );
        if (hasLostQuote) {
            return { label: 'Perdido', value: 0, color: 'bg-rose-500 text-white' };
        }

        return { label: 'Lead', value: 0, color: 'bg-slate-500 text-white' };
    };

    useEffect(() => {
        if (!profile?.companyId) return;

        const qQuotes = query(collection(db, 'orcamentos'), where('companyId', '==', profile.companyId));
        const qContracts = query(collection(db, 'contratos'), where('companyId', '==', profile.companyId));
        const qOrders = query(collection(db, 'pedidos'), where('companyId', '==', profile.companyId));

        const unsubQuotes = onSnapshot(qQuotes, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() }));
            setQuotes(data);
        });

        const unsubContracts = onSnapshot(qContracts, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() }));
            setContracts(data);
        });

        const unsubOrders = onSnapshot(qOrders, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() }));
            setOrders(data);
        });

        return () => {
            unsubQuotes();
            unsubContracts();
            unsubOrders();
        };
    }, [profile?.companyId]);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | 'leads' | 'closures' | 'pending_bonus' | 'top'>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [currentView, setCurrentView] = useState<'manager' | 'ranking' | 'alerts' | 'settlement'>('manager');

    // Form State
    const [name, setName] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [instagram, setInstagram] = useState('');
    const [goal, setGoal] = useState('10');
    const [condominiumName, setCondominiumName] = useState('');
    const [quarterlyGoal, setQuarterlyGoal] = useState('30');
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
    const [showClientResults, setShowClientResults] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [generatedCode, setGeneratedCode] = useState('');
    const [copied, setCopied] = useState(false);
    const resultsRef = useRef<HTMLDivElement>(null);

    // Edit Form State
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editWhatsapp, setEditWhatsapp] = useState('');
    const [editInstagram, setEditInstagram] = useState('');
    const [editCondominiumName, setEditCondominiumName] = useState('');
    const [editGoal, setEditGoal] = useState('');
    const [editQuarterlyGoal, setEditQuarterlyGoal] = useState('');

    const canEdit = profile?.role === 'admin' || profile?.role === 'company_admin' || profile?.role === 'superadmin';

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Generate code when modal opens
    useEffect(() => {
        if (isAddModalOpen) {
            const code = `INF-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
            setGeneratedCode(code);
        } else {
            setGeneratedCode('');
            setCopied(false);
        }
    }, [isAddModalOpen]);

    // Calculate Extended Data for each Influencer
    const influencersData = useMemo(() => {
        const now = new Date();

        return safeArray(influencers).map((inf: any) => {
            const infBonus = safeArray(bonusRecords).filter((b: any) => b.influencerId === inf.id);

            // 1. Clientes Indicados Únicos
            const infClients = safeArray(clients).filter((c: any) => 
                c.influencerId === inf.id || 
                (c.referralCode && String(c.referralCode).trim().toLowerCase() === String(inf.code).trim().toLowerCase())
            );

            // Deduplicate by id, phone normal, or email
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
            const totalIndicatedClients = uniqueClients.length;
            const clientIds = uniqueClients.map(c => c.id);

            // 2. Leads Gerados (Total of budgets/quotes)
            const infQuotes = safeArray(quotes).filter((q: any) => 
                q.influencerId === inf.id ||
                (q.referralCode && String(q.referralCode).trim().toLowerCase() === String(inf.code).trim().toLowerCase()) ||
                (q.clientId && clientIds.includes(q.clientId))
            );
            const leadsGenerated = infQuotes.length;

            // 3. Medições Agendadas
            const measurementsScheduled = infQuotes.filter((q: any) => 
                q.measurementId || 
                q.status === 'measuring' || 
                ['aguardando_medicao', 'pos_medicao', 'aprovado', 'em_contrato', 'em_producao', 'pronto', 'finalizado'].includes(q.quoteStage || '')
            ).length;

            // 4. Contratos Fechados & Valor Vendido (Deduplicated per client)
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

            let contractsClosed = 0;
            let totalSalesValue = 0;

            if (totalIndicatedClients > 0) {
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

                contractsClosed = clientDealValues.size;
                totalSalesValue = Array.from(clientDealValues.values()).reduce((acc, val) => acc + val, 0);
            }

            const targetGoal = inf.monthlyGoal || inf.goal || 10;
            const goalProgress = (contractsClosed / targetGoal) * 100;
            
            let goalStatusColor = 'text-rose-500';
            let goalBgColor = 'bg-rose-500/10';
            if (goalProgress >= 100) {
                goalStatusColor = 'text-emerald-500';
                goalBgColor = 'bg-emerald-500/10';
            } else if (goalProgress >= 70) {
                goalStatusColor = 'text-amber-500';
                goalBgColor = 'bg-amber-500/10';
            }

            const conversionRate = totalIndicatedClients > 0 ? (contractsClosed / totalIndicatedClients) * 100 : 0;
            
            const realReceivedValue = infBonus
                .filter((b: any) => b.status === 'payable' || b.status === 'paid')
                .reduce((acc: any, b: any) => acc + (b.orderValue || 0), 0);

            // Activity
            const lastClient = [...uniqueClients].sort((a: any, b: any) => compareDatesSafe(a.createdAt, b.createdAt, 'desc'))[0];
            const daysSinceLastReferral = lastClient ? ((() => { const d = safeParseISO(lastClient.createdAt); return d ? differenceInDays(now, d) : 999; })()) : 999;
            
            let activityStatus: 'active' | 'attention' | 'inactive' = 'inactive';
            if (daysSinceLastReferral < 15) activityStatus = 'active';
            else if (daysSinceLastReferral < 45) activityStatus = 'attention';

            const pendingBonus = infBonus
                .filter((b: any) => b.status === 'pending' || b.status === 'approved')
                .reduce((acc: any, b: any) => acc + b.bonusAmount, 0);
            const paidBonus = infBonus
                .filter((b: any) => b.status === 'paid')
                .reduce((acc: any, b: any) => acc + b.bonusAmount, 0);

            const isHighVolumeLowConv = totalIndicatedClients > 10 && conversionRate < 10;

            return {
                ...inf,
                leadsCount: totalIndicatedClients,
                closedCount: contractsClosed,
                targetGoal,
                goalProgress,
                goalStatusColor,
                goalBgColor,
                conversionRate,
                totalValue: totalSalesValue,
                pendingBonus,
                paidBonus,
                realReceivedValue,
                daysSinceLastReferral,
                activityStatus,
                isHighVolumeLowConv,
                clients: uniqueClients,
                qualityScore: inf.qualityScore || 0,
                rewardTier: inf.rewardTier || 'bronze',
                totalReferrals: totalIndicatedClients,
                leadsOnlyCount: leadsGenerated,
                measurementsCount: measurementsScheduled,
                totalIndicatedClients,
                leadsGenerated,
                measurementsScheduled,
                contractsClosed,
                totalSalesValue
            };
        }).sort((a: any, b: any) => {
            if ((b.totalSalesValue || 0) !== (a.totalSalesValue || 0)) {
                return (b.totalSalesValue || 0) - (a.totalSalesValue || 0);
            }
            if ((b.contractsClosed || 0) !== (a.contractsClosed || 0)) {
                return (b.contractsClosed || 0) - (a.contractsClosed || 0);
            }
            return (b.totalIndicatedClients || 0) - (a.totalIndicatedClients || 0);
        })
          .map((inf: any, idx: number) => ({ ...inf, ranking: idx + 1 }));
    }, [influencers, clients, bonusRecords, quotes, contracts, orders]);

    const filteredInfluencers = useMemo(() => {
        return safeArray(influencersData).filter((inf: any) => {
            const matchesSearch = inf.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                inf.code.toLowerCase().includes(searchTerm.toLowerCase());
            
            if (activeFilter === 'leads') return matchesSearch && inf.leadsCount > 0;
            if (activeFilter === 'closures') return matchesSearch && inf.closedCount > 0;
            if (activeFilter === 'pending_bonus') return matchesSearch && inf.pendingBonus > 0;
            if (activeFilter === 'top') return matchesSearch && inf.ranking <= 3;
            
            return matchesSearch;
        });
    }, [influencersData, searchTerm, activeFilter]);

    const stats = useMemo(() => {
        const totalReferrals = safeArray(influencersData).reduce((acc: any, i: any) => acc + i.totalIndicatedClients, 0);
        const totalClosed = safeArray(influencersData).reduce((acc: any, i: any) => acc + i.contractsClosed, 0);
        const totalValue = safeArray(influencersData).reduce((acc: any, i: any) => acc + i.totalSalesValue, 0);
        const avgConversion = totalReferrals > 0 ? (totalClosed / totalReferrals) * 100 : 0;

        return {
            totalReferrals,
            totalClosed,
            totalValue,
            avgConversion
        };
    }, [influencersData]);

    const highlights = useMemo(() => {
        const list = safeArray(influencersData);
        if (list.length === 0) {
            return {
                topSales: { name: 'Nenhum', value: 0 },
                topReferrals: { name: 'Nenhum', value: 0 },
                topClosures: { name: 'Nenhum', value: 0 },
                topConversion: { name: 'Nenhum', value: 0 }
            };
        }

        // Maior Faturamento
        const topSales = [...list].sort((a, b) => b.totalSalesValue - a.totalSalesValue)[0];
        // Maior Número de Clientes Indicados
        const topReferrals = [...list].sort((a, b) => b.totalIndicatedClients - a.totalIndicatedClients)[0];
        // Maior Número de Contratos Fechados
        const topClosures = [...list].sort((a, b) => b.contractsClosed - a.contractsClosed)[0];
        // Melhor Conversão (exclui parceiros com 0 indicações)
        const candidatesForConv = list.filter(i => i.totalIndicatedClients > 0);
        const topConversion = candidatesForConv.length > 0 
            ? [...candidatesForConv].sort((a, b) => b.conversionRate - a.conversionRate)[0]
            : list[0];

        return {
            topSales: { name: topSales?.name || 'Nenhum', value: topSales?.totalSalesValue || 0 },
            topReferrals: { name: topReferrals?.name || 'Nenhum', value: topReferrals?.totalIndicatedClients || 0 },
            topClosures: { name: topClosures?.name || 'Nenhum', value: topClosures?.contractsClosed || 0 },
            topConversion: { name: topConversion?.name || 'Nenhum', value: topConversion?.conversionRate || 0 }
        };
    }, [influencersData]);

    const handleAddPartner = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // Check if there is already a partner with the same telephone or condominium
            const phoneExists = safeArray(influencers).some((inf: any) => 
                inf.whatsapp?.replace(/\D/g, '') === whatsapp.replace(/\D/g, '')
            );
            if (phoneExists) {
                alert('⚠️ Já existe um parceiro cadastrado com este número de WhatsApp.');
                return;
            }
            if (condominiumName && condominiumName.trim() !== '') {
                const condoExists = safeArray(influencers).some((inf: any) => 
                    inf.condominiumName?.trim().toLowerCase() === condominiumName.trim().toLowerCase()
                );
                if (condoExists) {
                    alert('⚠️ Já existe um parceiro cadastrado para este condomínio.');
                    return;
                }
            }

            const whatsappMessage = `Olá, sou do condomínio ${condominiumName || '[NOME]'} e gostaria de mais informações.`;
            const whatsappContactUrl = `https://wa.me/5511961795404?text=${encodeURIComponent(whatsappMessage)}`;
            await addInfluencer({
                name,
                whatsapp,
                instagram,
                code: generatedCode,
                monthlyGoal: parseInt(goal) || 10,
                quarterlyGoal: parseInt(quarterlyGoal) || 30,
                condominiumName: condominiumName || '',
                clientId: selectedClientId,
                whatsappMessage,
                whatsappContactUrl,
                companyWhatsappNumber: "+5511961795404"
            } as any);
            setIsAddModalOpen(false);
            setName('');
            setWhatsapp('');
            setInstagram('');
            setGoal('10');
            setCondominiumName('');
            setSelectedClientId(null);
        } catch (error) {
            console.error(error);
        }
    };

    const handleStartEdit = () => {
        if (!selectedInf) return;
        setEditName(selectedInf.name || '');
        setEditWhatsapp(selectedInf.whatsapp || '');
        setEditInstagram(selectedInf.instagram || '');
        setEditCondominiumName(selectedInf.condominiumName || '');
        setEditGoal(String(selectedInf.monthlyGoal || 10));
        setEditQuarterlyGoal(String(selectedInf.quarterlyGoal || 30));
        setIsEditing(true);
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedId || !selectedInf || !user) return;
        
        try {
            // Check if there is already a partner with the same telephone or condominium (excluding current partner)
            const phoneExists = safeArray(influencers).some((inf: any) => 
                inf.id !== selectedId && inf.whatsapp?.replace(/\D/g, '') === editWhatsapp.replace(/\D/g, '')
            );
            if (phoneExists) {
                alert('⚠️ Já existe outro parceiro cadastrado com este número de WhatsApp.');
                return;
            }
            if (editCondominiumName && editCondominiumName.trim() !== '') {
                const condoExists = safeArray(influencers).some((inf: any) => 
                    inf.id !== selectedId && inf.condominiumName?.trim().toLowerCase() === editCondominiumName.trim().toLowerCase()
                );
                if (condoExists) {
                    alert('⚠️ Já existe outro parceiro cadastrado para este condomínio.');
                    return;
                }
            }

            const whatsappMessage = `Olá, sou do condomínio ${editCondominiumName || '[NOME]'} e gostaria de mais informações.`;
            const whatsappContactUrl = `https://wa.me/5511961795404?text=${encodeURIComponent(whatsappMessage)}`;
            
            await updateInfluencer(selectedId, {
                name: editName,
                whatsapp: editWhatsapp,
                instagram: editInstagram,
                condominiumName: editCondominiumName,
                monthlyGoal: parseInt(editGoal) || 10,
                quarterlyGoal: parseInt(editQuarterlyGoal) || 30,
                whatsappMessage,
                whatsappContactUrl,
                updatedAt: toISODateSafe(new Date())!,
                updatedBy: user.uid
            } as any);
            
            setIsEditing(false);
            alert('Informações atualizadas com sucesso!');
        } catch (error) {
            console.error('Error updating influencer:', error);
            alert('Erro ao atualizar informações.');
        }
    };

    const clientResults = useMemo(() => {
        if (selectedClientId) return [];
        const existingInfluencerClientIds = safeArray(influencers).map((inf: any) => inf.clientId).filter(Boolean);
        
        const filtered = clients
            .filter(c => !existingInfluencerClientIds.includes(c.id))
            .filter(c => 
                c.name.toLowerCase().includes(name.toLowerCase()) ||
                c.phone?.includes(name)
            );
        return filtered.slice(0, 10);
    }, [name, clients, selectedClientId, influencers]);

    const handleSelectClient = (client: any) => {
        setName(client.name);
        setWhatsapp(client.phone || '');
        setSelectedClientId(client.id);
        setShowClientResults(false);
        setActiveIndex(-1);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showClientResults || clientResults.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev < clientResults.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            handleSelectClient(clientResults[activeIndex]);
        } else if (e.key === 'Escape' || e.key === 'Tab') {
            setShowClientResults(false);
        }
    };

    const handleCopyCode = () => {
        navigator.clipboard.writeText(generatedCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const selectedInf = influencersData.find((i: any) => i.id === selectedId);

    // Click outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (resultsRef.current && !resultsRef.current.contains(event.target as Node)) {
                setShowClientResults(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-[#050505]">
            <div className="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <h1 className="text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tighter flex items-center gap-3">
                            Influencers <span className="text-brand-emerald">&</span> Parceiros
                        </h1>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">Gestão de Performance e Conversão Estratégica</p>
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="flex bg-slate-100 dark:bg-white/5 p-1.5 rounded-2xl mr-4">
                            <button
                                onClick={() => setCurrentView('manager')}
                                className={cn(
                                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                    currentView === 'manager' 
                                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm" 
                                        : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                )}
                            >
                                <Users className="h-3.5 w-3.5 inline mr-2" /> Gestão
                            </button>
                            <button
                                onClick={() => setCurrentView('ranking')}
                                className={cn(
                                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                    currentView === 'ranking' 
                                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm" 
                                        : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                )}
                            >
                                <Crown className="h-3.5 w-3.5 inline mr-2 text-amber-500" /> Performance
                            </button>
                            <button
                                onClick={() => setCurrentView('alerts')}
                                className={cn(
                                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                    currentView === 'alerts' 
                                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm" 
                                        : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                )}
                            >
                                <AlertCircle className="h-3.5 w-3.5 inline mr-2 text-rose-500" /> Alertas
                            </button>
                        </div>
                        {currentView === 'manager' && (
                            <>
                                <div className="relative flex-1 md:w-64">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <Input 
                                        placeholder="Buscar parceiro..." 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-12 h-14 bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 rounded-2xl shadow-sm font-medium"
                                    />
                                </div>
                                <Button 
                                    onClick={() => setIsAddModalOpen(true)}
                                    className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 h-14 px-8 rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-xl shadow-slate-950/20 active:scale-95 transition-all"
                                >
                                    <Plus className="h-4 w-4 mr-2" /> Novo Parceiro
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {currentView === 'manager' ? (
                    <>
                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                            {[
                                { label: 'Clientes Indicados', value: stats.totalReferrals, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                                { label: 'Contratos Fechados', value: stats.totalClosed, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                                { label: 'Valor Total Vendido', value: formatCurrency(stats.totalValue), icon: Wallet, color: 'text-brand-emerald', bg: 'bg-brand-emerald/10' },
                                { label: 'Conversão Geral', value: `${stats.avgConversion.toFixed(1)}%`, icon: TrendingUp, color: 'text-amber-500', bg: 'bg-amber-500/10' }
                            ].map((kpi: any, idx: number) => (
                                <Card key={idx} className="p-6 border-none bg-white dark:bg-slate-900/50 rounded-[2rem] shadow-sm group hover:ring-2 hover:ring-brand-emerald/20 transition-all">
                                    <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center mb-4", kpi.bg)}>
                                        <kpi.icon className={cn("h-5 w-5", kpi.color)} />
                                    </div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{kpi.label}</p>
                                    <h3 className="text-xl font-black text-slate-900 dark:text-white mt-1 tracking-tighter">{kpi.value}</h3>
                                </Card>
                            ))}
                        </div>

                        {/* Highlight Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-4 duration-500 mt-4">
                            {[
                                { label: '🏆 Maior Faturamento', name: highlights.topSales.name, value: formatCurrency(highlights.topSales.value), color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                                { label: '👥 Maior Indicação', name: highlights.topReferrals.name, value: `${highlights.topReferrals.value} Clientes`, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                                { label: '📄 Mais Contratos', name: highlights.topClosures.name, value: `${highlights.topClosures.value} Fechados`, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
                                { label: '📈 Melhor Conversão', name: highlights.topConversion.name, value: `${highlights.topConversion.value.toFixed(1)}%`, color: 'text-amber-500', bg: 'bg-amber-500/10' }
                            ].map((hl: any, idx: number) => (
                                <Card key={idx} className="p-6 border-none bg-slate-50 dark:bg-white/5 rounded-[2rem] shadow-sm hover:ring-2 hover:ring-brand-emerald/10 transition-all border border-slate-100 dark:border-white/5">
                                    <p className="text-[9px] font-black text-slate-450 dark:text-slate-400 uppercase tracking-widest leading-tight">{hl.label}</p>
                                    <h4 className="text-sm font-black text-slate-800 dark:text-white mt-2 truncate uppercase">{hl.name}</h4>
                                    <p className="text-xs font-bold text-brand-emerald mt-0.5">{hl.value}</p>
                                </Card>
                            ))}
                        </div>

                        {/* Filters */}
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 animate-in fade-in slide-in-from-top-2 duration-700 mt-4">
                            {[
                                { id: 'all', label: 'Todos', icon: Filter },
                                { id: 'leads', label: 'Alto Volume', icon: Target },
                                { id: 'closures', label: 'Alta Conversão', icon: Award },
                                { id: 'top', label: 'Top Ranking', icon: Crown }
                            ].map((f: any) => (
                                <button
                                    key={f.id}
                                    onClick={() => setActiveFilter(f.id as any)}
                                    className={cn(
                                        "flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                                        activeFilter === f.id 
                                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-lg scale-[1.02]" 
                                            : "bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                                    )}
                                >
                                    <f.icon className="h-3.5 w-3.5" /> {f.label}
                                </button>
                            ))}
                        </div>

                        {/* Main Table */}
                        <Card className="border-none bg-white dark:bg-slate-900/50 rounded-[2.5rem] shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden border border-slate-100 dark:border-white/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {filteredInfluencers.length === 0 ? (
                                <div className="p-20 text-center flex flex-col items-center justify-center gap-4">
                                    <Users className="h-12 w-12 text-slate-300" />
                                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">
                                        {searchTerm || activeFilter !== 'all' 
                                            ? "Nenhum parceiro encontrado para esta busca." 
                                            : "Nenhum parceiro cadastrado ainda."}
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/50 dark:bg-white/2 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-white/5">
                                                <th className="px-10 py-6">Parceiro</th>
                                                <th className="px-6 py-6 text-center">Clientes Indicados</th>
                                                <th className="px-6 py-6 text-center">Contratos Fechados</th>
                                                <th className="px-6 py-6 text-center">Valor Fechado</th>
                                                <th className="px-6 py-6 text-center">Conversão (%)</th>
                                                <th className="px-6 py-6 text-center">Meta</th>
                                                <th className="px-6 py-6 text-center">Status</th>
                                                <th className="px-10 py-6 text-right">Ação</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                                            {safeArray(filteredInfluencers).map((inf: any) => (
                                                <tr 
                                                    key={inf.id} 
                                                    onClick={() => setSelectedId(inf.id)}
                                                    className="group hover:bg-slate-50 dark:hover:bg-white/2 cursor-pointer transition-colors"
                                                >
                                                    <td className="px-10 py-6">
                                                        <div className="flex items-center gap-4">
                                                            <div className="relative">
                                                                <div className="h-12 w-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center font-black text-slate-400">
                                                                    {inf.name.substring(0,2).toUpperCase()}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{inf.name}</p>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                                                    Código: {inf.code} • {inf.instagram || 'Sem Instagram'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-6 text-center">
                                                        <span className="text-sm font-black text-slate-900 dark:text-white">
                                                            {inf.totalIndicatedClients}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-6 text-center">
                                                        <span className="text-sm font-black text-slate-900 dark:text-white">
                                                            {inf.contractsClosed}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-6 text-center">
                                                        <span className="text-sm font-black text-slate-900 dark:text-white">
                                                            {formatCurrency(inf.totalSalesValue)}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-6 text-center">
                                                        <span className="text-sm font-black text-brand-emerald">
                                                            {inf.conversionRate.toFixed(1)}%
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-6 text-center">
                                                        <div className="flex flex-col items-center">
                                                            <div className="flex items-center gap-2">
                                                                <span className={cn("text-sm font-black text-slate-900 dark:text-white")}>
                                                                    {inf.contractsClosed}
                                                                </span>
                                                                <span className="text-slate-300">/</span>
                                                                <span className="text-slate-400 font-bold text-xs">{inf.monthlyGoal ?? inf.targetGoal}</span>
                                                            </div>
                                                            <div className="w-16 h-1 bg-slate-100 dark:bg-white/5 rounded-full mt-1.5 overflow-hidden">
                                                                <div className={cn("h-full transition-all", inf.goalStatusColor.replace('text', 'bg'))} style={{ width: `${Math.min((inf.contractsClosed / ((inf.monthlyGoal ?? inf.targetGoal) || 1)) * 100, 100)}%` }} />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-6 text-center">
                                                        <Badge className={cn(
                                                            "font-black text-[9px] uppercase tracking-widest px-3 py-1 rounded-full border-none",
                                                            inf.activityStatus === 'active' ? "bg-emerald-500/10 text-emerald-500" :
                                                            inf.activityStatus === 'attention' ? "bg-amber-500/10 text-amber-500" :
                                                            "bg-slate-100 dark:bg-white/5 text-slate-400"
                                                        )}>
                                                            {inf.activityStatus === 'active' ? 'Ativo' :
                                                             inf.activityStatus === 'attention' ? 'Em atenção' : 'Sem movimento'}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-10 py-6 text-right">
                                                        <button className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-brand-emerald hover:bg-brand-emerald/10 transition-all">
                                                            <ChevronRight className="h-5 w-5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>
                    </>
                ) : currentView === 'ranking' ? (
                    <InfluencerRankingView />
                ) : currentView === 'alerts' ? (
                    <InfluencerAlertsPanel />
                ) : (
                    <PartnerSettlement />
                )}
            </div>

            {/* Sidebar Details Drawer */}
            {selectedId && selectedInf && (
                <div className="fixed inset-0 z-[60] flex justify-end">
                    <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setSelectedId(null)} />
                    <div className="relative w-full max-w-xl h-full bg-white dark:bg-[#0a0a0a] shadow-2xl animate-in slide-in-from-right duration-500 flex flex-col border-l border-slate-200 dark:border-white/5">
                        {/* Drawer Header */}
                        <div className="p-10 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50/50 dark:bg-white/2">
                            <div className="flex items-center gap-6">
                                <div className="h-16 w-16 bg-slate-900 dark:bg-white rounded-3xl flex items-center justify-center font-black text-white dark:text-slate-900 text-xl shadow-xl shadow-slate-950/20">
                                    {selectedInf.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-tight">{selectedInf.name}</h3>
                                    <div className="flex flex-col gap-1.5 mt-2">
                                        <div className="flex gap-4">
                                            <Badge className="bg-brand-emerald/10 text-brand-emerald font-black text-[9px] uppercase tracking-widest px-3 py-1 rounded-full border-none">{selectedInf.code}</Badge>
                                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-widest"><Phone className="h-3 w-3" /> {selectedInf.whatsapp}</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                            Condomínio: {selectedInf.condominiumName || 'A definir'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {canEdit && !isEditing && (
                                    <Button
                                        onClick={handleStartEdit}
                                        className="h-12 px-6 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black uppercase text-[10px] tracking-widest transition-all shadow-md active:scale-95 hover:translate-y-[-1px]"
                                    >
                                        Editar Informações
                                    </Button>
                                )}
                                <button onClick={() => { setSelectedId(null); setIsEditing(false); }} className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 hover:rotate-90 transition-all shadow-sm">
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
                        </div>

                        {/* Drawer Content */}
                        <div className="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar">
                            {isEditing ? (
                                <form onSubmit={handleSaveEdit} className="space-y-6">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do parceiro</label>
                                        <Input
                                            className="h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none font-bold text-xs"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp</label>
                                            <Input
                                                className="h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none font-bold text-xs"
                                                placeholder="(00) 00000-0000"
                                                value={editWhatsapp}
                                                onChange={(e) => setEditWhatsapp(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Instagram (@) (Opcional)</label>
                                            <Input
                                                className="h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none font-bold text-xs"
                                                placeholder="@instagram"
                                                value={editInstagram}
                                                onChange={(e) => setEditInstagram(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Meta Mensal</label>
                                            <Input
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                className="h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none font-black text-center text-lg"
                                                value={editGoal}
                                                onChange={(e) => setEditGoal(e.target.value.replace(/\D/g, ''))}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Meta Trimestral</label>
                                            <Input
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                className="h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none font-black text-center text-lg"
                                                value={editQuarterlyGoal}
                                                onChange={(e) => setEditQuarterlyGoal(e.target.value.replace(/\D/g, ''))}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do condomínio</label>
                                        <Input
                                            type="text"
                                            className="h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none font-bold text-xs"
                                            placeholder="Digite o nome do condomínio..."
                                            value={editCondominiumName}
                                            onChange={(e) => setEditCondominiumName(e.target.value)}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 pt-4">
                                        <Button
                                            type="button"
                                            onClick={() => setIsEditing(false)}
                                            className="w-full h-16 rounded-2xl font-black uppercase text-[12px] tracking-[0.2em] bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
                                        >
                                            Cancelar
                                        </Button>
                                        <Button
                                            type="submit"
                                            className="w-full h-16 rounded-2xl font-black uppercase text-[12px] tracking-[0.2em] shadow-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-slate-950/20 hover:translate-y-[-2px] active:translate-y-[0px] transition-all"
                                        >
                                            Salvar Alterações
                                        </Button>
                                    </div>
                                </form>
                            ) : (
                                <>
                                    {/* Analysis Section */}
                                    <div className="space-y-6">
                                        <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] flex items-center gap-2">
                                            <BarChart3 className="h-4 w-4 text-brand-emerald" /> Análise de Performance
                                        </h4>
                                        
                                        <Card className="p-8 border-none bg-slate-50 dark:bg-white/2 rounded-[2.5rem] space-y-6">
                                            <div className="grid grid-cols-2 gap-6">
                                                <div>
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Clientes Indicados</p>
                                                    <h5 className="text-xl font-black text-slate-900 dark:text-white mt-1">
                                                        {selectedInf.totalIndicatedClients}
                                                    </h5>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Contratos Fechados</p>
                                                    <h5 className="text-xl font-black text-slate-900 dark:text-white mt-1">
                                                        {selectedInf.contractsClosed}
                                                    </h5>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Valor Total Vendido</p>
                                                    <h5 className="text-xl font-black text-brand-emerald mt-1">
                                                        {formatCurrency(selectedInf.totalSalesValue)}
                                                    </h5>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Conversão Geral</p>
                                                    <h5 className="text-xl font-black text-slate-900 dark:text-white mt-1">
                                                        {selectedInf.conversionRate.toFixed(1)}%
                                                    </h5>
                                                </div>
                                            </div>

                                            <div className="pt-4 border-t border-slate-200 dark:border-white/5 flex justify-between items-center">
                                                <div>
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Meta Mensal</p>
                                                    <p className="text-xs font-bold text-slate-500 mt-0.5">Progresso de {selectedInf.contractsClosed} de {selectedInf.monthlyGoal ?? selectedInf.targetGoal}</p>
                                                </div>
                                                <Badge className={cn("font-black text-[10px] px-3 py-1.5 rounded-xl border-none shadow-sm", selectedInf.goalBgColor, selectedInf.goalStatusColor)}>
                                                    {((selectedInf.contractsClosed / ((selectedInf.monthlyGoal ?? selectedInf.targetGoal) || 1)) * 100).toFixed(0)}%
                                                </Badge>
                                            </div>
                                        </Card>
                                    </div>

                                    {/* Actions Quick Header */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <Button 
                                            onClick={() => window.open(`https://wa.me/55${selectedInf.whatsapp.replace(/\D/g, '')}`, 'marbleflow_whatsapp_followup')}
                                            className="h-16 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white border-none font-black uppercase text-[8px] tracking-widest transition-all px-1 flex flex-col justify-center items-center gap-1"
                                        >
                                            <WhatsAppIcon className="h-4 w-4" />
                                            <span>Contato Direto</span>
                                        </Button>
                                        <Button 
                                            onClick={() => {
                                                const url = selectedInf.whatsappContactUrl || `https://wa.me/5511961795404?text=${encodeURIComponent(`Olá, sou do condomínio ${selectedInf.condominiumName || '[NOME]'} e gostaria de mais informações.`)}`;
                                                navigator.clipboard.writeText(url);
                                                alert('Link copiado com sucesso!');
                                            }}
                                            className="h-16 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500 hover:text-white border-none font-black uppercase text-[8px] tracking-widest transition-all px-1 flex flex-col justify-center items-center gap-1"
                                        >
                                            <Copy className="h-4 w-4" />
                                            <span>Copiar Link WhatsApp</span>
                                        </Button>
                                        <Button 
                                            onClick={() => {
                                                const url = selectedInf.whatsappContactUrl || `https://wa.me/5511961795404?text=${encodeURIComponent(`Olá, sou do condomínio ${selectedInf.condominiumName || '[NOME]'} e gostaria de mais informações.`)}`;
                                                window.open(url, 'marbleflow_whatsapp_followup');
                                            }}
                                            className="h-16 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500 hover:text-white border-none font-black uppercase text-[8px] tracking-widest transition-all px-1 flex flex-col justify-center items-center gap-1"
                                        >
                                            <Send className="h-4 w-4" />
                                            <span>Enviar Link WhatsApp</span>
                                        </Button>
                                    </div>

                                    {/* Clients List */}
                                    <div className="space-y-6">
                                        <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] flex items-center justify-between">
                                            Indicações de {selectedInf.name} <span className="bg-slate-100 dark:bg-white/5 px-3 py-1 rounded-full text-[9px] font-black">{selectedInf.clients.length}</span>
                                        </h4>
                                        <div className="space-y-4">
                                            {[...selectedInf.clients].sort((a: any, b: any) => compareDatesSafe(a.createdAt, b.createdAt, 'desc')).slice(0, 10).map((client: any) => {
                                                const funnel = getClientStatusAndValue(client.id);
                                                return (
                                                    <div key={client.id} className="p-6 bg-white dark:bg-white/2 rounded-3xl border border-slate-100 dark:border-white/5 flex items-center justify-between group hover:border-brand-emerald/30 transition-all shadow-sm">
                                                        <div className="flex items-center gap-4">
                                                            <div className="h-10 w-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center">
                                                                <Users className="h-4 w-4 text-slate-400" />
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight">{client.name}</p>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                                                                    {formatVisualDate(client.createdAt as any, 'dd/MM/yyyy')}
                                                                    {funnel.label === 'Fechado' && funnel.value > 0 && ` • ${formatCurrency(funnel.value)}`}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <Badge className={cn("text-[8px] font-black uppercase px-3 py-1 rounded-lg border-none", funnel.color)}>
                                                            {funnel.label}
                                                        </Badge>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Novo Parceiro */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
                    <Card className="w-full max-w-lg bg-white dark:bg-slate-900 p-10 rounded-[2.5rem] border-none shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden">
                        <div className="flex justify-between items-center mb-10">
                            <div>
                                <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none">Ficha de Parceiro</h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Vincule um cliente à rede estratégica</p>
                            </div>
                            <button 
                                onClick={() => { setIsAddModalOpen(false); setShowClientResults(false); setName(''); setGoal('10'); setSelectedClientId(null); }} 
                                className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center transition-all hover:bg-slate-200 dark:hover:bg-white/10"
                            >
                                <X className="h-6 w-6 text-slate-500" />
                            </button>
                        </div>

                        <form onSubmit={handleAddPartner} className="space-y-6">
                            {/* Autocomplete Search Dropdown */}
                            <div className="space-y-3 relative">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Buscar Cliente na Base</label>
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <Input 
                                        className="h-14 pl-12 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none font-black uppercase text-xs"
                                        placeholder="Clique para listar ou digite para filtrar..."
                                        value={name}
                                        onChange={(e) => {
                                            setName(e.target.value);
                                            setSelectedClientId(null);
                                            setShowClientResults(true);
                                            setActiveIndex(-1);
                                        }}
                                        onFocus={() => setShowClientResults(true)}
                                        onKeyDown={handleKeyDown}
                                        required
                                    />
                                    {selectedClientId && (
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500">
                                            <CheckCircle className="h-5 w-5" />
                                        </div>
                                    )}
                                </div>
                                
                                {showClientResults && (
                                    <div 
                                        ref={resultsRef}
                                        className="absolute z-[110] left-0 right-0 top-full mt-2 bg-white dark:bg-slate-800 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-slate-100 dark:border-white/5 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
                                    >
                                        <div className="max-h-[320px] overflow-y-auto py-2 custom-scrollbar">
                                            {clientResults.length > 0 ? (
                                                safeArray(clientResults).map((client: any, idx) => (
                                                    <button
                                                        key={client.id}
                                                        type="button"
                                                        onClick={() => handleSelectClient(client)}
                                                        className={cn(
                                                            "w-full p-5 text-left transition-all flex items-center justify-between group border-b border-slate-50 last:border-none dark:border-white/5",
                                                            activeIndex === idx ? "bg-slate-50 dark:bg-white/10" : "hover:bg-slate-50 dark:hover:bg-brand-emerald/10"
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-black text-slate-400 text-[10px]">
                                                                {client.name.substring(0, 2).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-black text-slate-900 dark:text-white uppercase truncate max-w-[200px]">{client.name}</p>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{client.phone || 'Sem Telefone'}</p>
                                                                    <span className="h-1 w-1 rounded-full bg-slate-300" />
                                                                    <p className="text-[9px] font-black text-brand-emerald uppercase tracking-widest opacity-80">{client.origin === 'Arquiteto' ? 'Arquiteto' : 'Cliente'}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <ChevronRight className={cn(
                                                            "h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-1",
                                                            activeIndex === idx && "text-brand-emerald translate-x-1"
                                                        )} />
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="p-10 text-center">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhum cliente disponível</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp</label>
                                    <Input 
                                        className="h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none font-bold text-xs"
                                        placeholder="(00) 00000-0000"
                                        value={whatsapp}
                                        onChange={(e) => setWhatsapp(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Instagram (@)</label>
                                    <Input 
                                        className="h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none font-bold text-xs"
                                        placeholder="@roberto_arq"
                                        value={instagram}
                                        onChange={(e) => setInstagram(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Meta Mensal</label>
                                    <Input 
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        className="h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none font-black text-center text-lg"
                                        value={goal}
                                        onChange={(e) => setGoal(e.target.value.replace(/\D/g, ''))}
                                        required
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Meta Trimestral</label>
                                    <Input 
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        className="h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none font-black text-center text-lg"
                                        value={quarterlyGoal}
                                        onChange={(e) => setQuarterlyGoal(e.target.value.replace(/\D/g, ''))}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">NOME DO CONDOMÍNIO</label>
                                    <Input 
                                        type="text"
                                        className="h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 border-none font-bold text-xs"
                                        placeholder="Digite o nome do condomínio..."
                                        value={condominiumName}
                                        onChange={(e) => setCondominiumName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-3 relative">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Código de Indicação</label>
                                    <div className="relative group">
                                        <Input 
                                            readOnly
                                            value={generatedCode}
                                            className="h-14 pr-12 rounded-2xl bg-slate-100 dark:bg-white/5 border-none font-black text-center text-xs tracking-widest opacity-80 cursor-default"
                                        />
                                        <button 
                                            type="button"
                                            onClick={handleCopyCode}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center text-slate-400 hover:text-brand-emerald transition-all active:scale-90"
                                        >
                                            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4">
                                <Button 
                                    type="submit"
                                    disabled={!selectedClientId}
                                    className={cn(
                                        "w-full h-16 rounded-2xl font-black uppercase text-[12px] tracking-[0.2em] shadow-xl transition-all",
                                        selectedClientId 
                                            ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-slate-950/20 hover:translate-y-[-2px] active:translate-y-[0px]" 
                                            : "bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                                    )}
                                >
                                    Ativar Parceiro Estratégico
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
};
