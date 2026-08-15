import { safeArray } from '../lib/dataDiagnostics';
import { safeParseISO, formatVisualDate } from '../lib/dateUtils';
import React, { useState, useEffect, useRef } from 'react';
import { Search, FileEdit, Package, Ruler, User as UserIcon, X, CornerDownLeft, Phone, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useClients } from '../hooks/useClients';
import type { Quote, Order, Measurement } from '../types';
import { calculateSearchScore, normalizeStr, HighlightText } from '../lib/searchUtils';
import { format } from 'date-fns';
import { WhatsAppIcon } from './icons/WhatsAppIcon';
import { openWhatsAppFollowUp } from '../utils/whatsappHelper';
import { cn } from '../lib/utils';
import { getQuoteDisplayTotal, isEmptyQuoteDraft } from '../utils/quoteCalculations';
import { canStartContract, canMoveToPostMeasurement } from './workflow/WorkflowStatus';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { toISODateSafe } from '../lib/dateWriteUtils';

interface GlobalSearchCommandProps {
    quotes: Quote[];
    orders: Order[];
    measurements: Measurement[];
}

interface SearchResult {
    id: string;
    type: 'client' | 'quote' | 'order' | 'measurement';
    title: string;
    subtitle: string;
    badge: string;
    score: number;
    url: string;
    icon: any;
    color: string;
    date?: string;
    phone?: string;
    raw?: any;
}

export const GlobalSearchCommand: React.FC<GlobalSearchCommandProps> = ({ quotes, orders, measurements }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const { clients } = useClients();
    const navigate = useNavigate();
    const { user, profile } = useAuth();
    const inputRef = useRef<HTMLInputElement>(null);
    const resultsContainerRef = useRef<HTMLDivElement>(null);

    // Keyboard shortcut (Cmd+K / Ctrl+K)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(true);
            }
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        } else {
            setQuery(''); // Clear on close
            setSelectedIndex(0);
        }
    }, [isOpen]);

    const { flatResults, grouped } = React.useMemo(() => {
        if (!query.trim() || query.length < 2) return { flatResults: [], grouped: { client: [], quote: [], order: [], measurement: [] } };
        
        const term = normalizeStr(query);
        const mappedResults: SearchResult[] = [];

        // --- PRE-PASS: Cross-referencing IDs ---
        // Se a busca bater em uma medição, queremos exibir o orçamento e o cliente associados.
        const matchedClientIds = new Set<string>();
        const matchedQuoteIds = new Set<string>();
        const matchedMeasurementIds = new Set<string>();

        // 0.a Clients check
        clients.forEach(c => {
            if (calculateSearchScore(c.name || '', term) > 0 || calculateSearchScore(c.phone || '', term, true) > 0 || calculateSearchScore(c.document || '', term, true) > 0) {
                matchedClientIds.add(c.id);
            }
        });

        // 0.b Measurements check
        measurements.forEach(m => {
            if (calculateSearchScore(m.customerName || '', term) > 0 || calculateSearchScore(m.address || '', term) > 0 || calculateSearchScore(m.phone || '', term, true) > 0) {
                matchedMeasurementIds.add(m.id);
                if (m.clientId) matchedClientIds.add(m.clientId);
                if (m.quoteId) matchedQuoteIds.add(m.quoteId);
            }
        });

        // 0.c Orders check
        orders.forEach(o => {
            if (calculateSearchScore(o.customerName || '', term) > 0 || calculateSearchScore(o?.protocolNumber || '', term) > 0 || calculateSearchScore(o.address || '', term) > 0 || calculateSearchScore(o.phone || '', term, true) > 0) {
                if (o.clientId) matchedClientIds.add(o.clientId);
                if (o.quoteId) matchedQuoteIds.add(o.quoteId);
                if (o.measurementId) matchedMeasurementIds.add(o.measurementId);
            }
        });
        
        // 0.d Quotes check (just in case quote matches directly but we need the client)
        quotes.forEach(q => {
            if (calculateSearchScore(q.customerName || q.clientName || '', term) > 0 || calculateSearchScore(q.customerPhone || q.clientPhone || '', term, true) > 0 || calculateSearchScore(q.id.slice(-8), term) > 0) {
                matchedQuoteIds.add(q.id);
                if (q.clientId) matchedClientIds.add(q.clientId);
                if (q.measurementId) matchedMeasurementIds.add(q.measurementId);
            }
        });
        // --- FIM PRE-PASS ---

        // 1. Clients
        clients.forEach(client => {
            const scoreName = calculateSearchScore(client.name || '', term);
            const scorePhone = calculateSearchScore(client.phone || '', term, true);
            const scoreDoc = calculateSearchScore(client.document || '', term, true);
            
            const maxScore = Math.max(
                scoreName, 
                scorePhone, 
                scoreDoc, 
                matchedClientIds.has(client.id) ? 60 : 0
            );
            if (maxScore > 0) {
                mappedResults.push({
                    id: client.id,
                    type: 'client',
                    title: client.name,
                    subtitle: client.phone || client.email || 'Sem contato',
                    badge: 'Cliente',
                    score: maxScore,
                    url: `/clientes?clientId=${client.id}`,
                    phone: client.phone,
                    icon: UserIcon,
                    color: 'text-blue-500 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400',
                    date: client.createdAt
                });
            }
        });

        // 2. Quotes
        quotes.forEach(quote => {
            // Regra 1: Ocultar o que é realmente lixo/deletado/cancelado
            if (
                quote.deleted || 
                (quote as any).isDeleted || 
                ['deleted', 'cancelled', 'cancelado'].includes((quote.status || '').toLowerCase())
            ) {
                return;
            }

            // Regra 2: É um "draft_zero" real se for considerado vazio pelas regras matemáticas
            // e NÃO tiver vínculo explícito com medição ou contrato
            const hasMeasurement = !!quote.measurementId || !!(quote as any).measurementProtocol || !!(quote as any).hasMeasurement;
            const hasContract = !!quote.contractId || !!(quote as any).contractNumber || !!(quote as any).hasContract;
            const isTrulyEmpty = isEmptyQuoteDraft(quote) && !hasMeasurement && !hasContract;

            // Regra 3: Só oculta se for "draft" OU "hidden" se também for *realmente* vazio
            if (isTrulyEmpty && (quote.hiddenFromDashboard || quote.quoteStage === 'draft_zero')) {
                return;
            }

            // Melhorando os matches para Orçamento -> Cliente / Orçamento -> Medição
            const cName = quote.customerName || quote.clientName || '';
            const scoreName = calculateSearchScore(cName, term);
            const scorePhone = calculateSearchScore(quote.customerPhone || quote.clientPhone || '', term, true);
            const scoreNum = calculateSearchScore(quote.id.slice(-8), term);
            const scoreMeasurement = calculateSearchScore(quote.measurementId || '', term);
            const scoreClient = calculateSearchScore(quote.clientId || '', term);
            
            // Procura cross-reference: Se o term for igual ao clientId ou measurementId
            const isIndirectMatch = matchedQuoteIds.has(quote.id) || 
                                    (quote.clientId && matchedClientIds.has(quote.clientId)) || 
                                    (quote.measurementId && matchedMeasurementIds.has(quote.measurementId));
            
            const maxScore = Math.max(
                scoreName, 
                scorePhone, 
                scoreNum, 
                scoreMeasurement, 
                scoreClient,
                isIndirectMatch ? 60 : 0
            );
            if (maxScore > 0) {
                const total = getQuoteDisplayTotal(quote);
                const formattedTotal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total);

                mappedResults.push({
                    id: quote.id,
                    type: 'quote',
                    title: cName || 'Cliente sem nome',
                    subtitle: `Total: ${formattedTotal}`,
                    badge: 'ORÇAMENTO',
                    score: maxScore,
                    url: `/orcamentos/${quote.id}/editar`,
                    phone: quote.customerPhone || quote.clientPhone,
                    icon: FileEdit,
                    color: 'text-amber-500 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400',
                    date: quote.createdAt || (quote as any).createdDate || (quote as any).date || (quote as any).quoteDate,
                    raw: quote
                });
            }
        });

        // 3. Orders
        orders.forEach(order => {
            const scoreName = calculateSearchScore(order.customerName || '', term);
            const scoreProto = calculateSearchScore(order?.protocolNumber || '', term);
            const scoreAddress = calculateSearchScore(order.address || '', term);
            const scorePhone = calculateSearchScore(order.phone || '', term, true);
            const isIndirectMatch = (order.clientId && matchedClientIds.has(order.clientId)) || 
                                    (order.quoteId && matchedQuoteIds.has(order.quoteId));
            
            const maxScore = Math.max(
                scoreName, 
                scoreProto, 
                scoreAddress, 
                scorePhone,
                isIndirectMatch ? 60 : 0
            );
            if (maxScore > 0) {
                mappedResults.push({
                    id: order.id,
                    type: 'order',
                    title: order.customerName,
                    subtitle: `OS: ${order?.protocolNumber || '---'} - ${order?.material || '---'}`,
                    badge: 'Ordem de Serviço',
                    score: maxScore + 5, // slight priority for OS exact matches
                    url: `/producao/ordens?orderId=${order.id}`,
                    phone: order.phone,
                    icon: Package,
                    color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400',
                    date: order.createdAt
                });
            }
        });

        // 4. Measurements
        measurements.forEach(measurement => {
            const scoreName = calculateSearchScore(measurement.customerName || '', term);
            const scoreAddress = calculateSearchScore(measurement.address || '', term);
            const scorePhone = calculateSearchScore(measurement.phone || '', term, true);
            const isIndirectMatch = matchedMeasurementIds.has(measurement.id) || 
                                    (measurement.clientId && matchedClientIds.has(measurement.clientId)) || 
                                    (measurement.quoteId && matchedQuoteIds.has(measurement.quoteId));
            
            const maxScore = Math.max(
                scoreName, 
                scoreAddress, 
                scorePhone,
                isIndirectMatch ? 60 : 0
            );
            if (maxScore > 0) {
                mappedResults.push({
                    id: measurement.id,
                    type: 'measurement',
                    title: measurement.customerName || 'Cliente sem nome',
                    subtitle: `Endereço: ${measurement.address || 'Não informado'}`,
                    badge: 'Medição',
                    score: maxScore,
                    url: `/medicoes?measurementId=${measurement.id}`,
                    phone: measurement.phone,
                    icon: Ruler,
                    color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 dark:text-indigo-400',
                    date: measurement.createdAt || measurement.scheduledDate
                });
            }
        });

        // Group & Sort
        const allSorted = mappedResults.sort((a, b) => b.score - a.score);
        
        const grp = {
            client: safeArray(allSorted).filter(r => r.type === 'client').slice(0, 5),
            quote: safeArray(allSorted).filter(r => r.type === 'quote').slice(0, 5),
            order: safeArray(allSorted).filter(r => r.type === 'order').slice(0, 5),
            measurement: safeArray(allSorted).filter(r => r.type === 'measurement').slice(0, 5),
        };

        const flat = [
            ...grp.client,
            ...grp.quote,
            ...grp.order,
            ...grp.measurement
        ];

        return { flatResults: flat, grouped: grp };
    }, [query, clients, quotes, orders, measurements]);

    // Reset selection when results change
    useEffect(() => {
        setSelectedIndex(0);
    }, [flatResults.length]);

    // Arrow keys navigation
    useEffect(() => {
        if (!isOpen) return;
        const handleKeys = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev < flatResults.length - 1 ? prev + 1 : prev));
                scrollIntoView(selectedIndex + 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
                scrollIntoView(selectedIndex - 1);
            } else if (e.key === 'Enter' && flatResults.length > 0) {
                e.preventDefault();
                handleSelect(flatResults[selectedIndex]);
            }
        };
        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [isOpen, flatResults, selectedIndex]);

    const scrollIntoView = (index: number) => {
        if (!resultsContainerRef.current) return;
        const items = resultsContainerRef.current.querySelectorAll('.search-result-item');
        if (items[index]) {
            items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    };

    const handleSelect = (result: SearchResult) => {
        setIsOpen(false);
        navigate(result.url);
    };

    const handleWhatsApp = (e: React.MouseEvent, phone?: string) => {
        e.stopPropagation();
        if (!phone) return;
        openWhatsAppFollowUp(phone, '');
    };

    const handleCall = (e: React.MouseEvent, phone?: string) => {
        e.stopPropagation();
        if (!phone) return;
        const num = phone.replace(/\D/g, '');
        window.open(`tel:${num}`);
    };

    const handleMakePostMeasurement = async (e: React.MouseEvent, quote: Quote) => {
        e.stopPropagation();
        if (!window.confirm("Tem certeza que deseja avançar este orçamento para Pós-Medição?")) return;
        
        try {
            const companyId = profile?.companyId;
            if (!companyId) {
                alert("Erro: companyId não encontrado no perfil.");
                return;
            }

            const isoNow = toISODateSafe(new Date());
            const updateData = {
                quoteStage: 'pos_medicao',
                status: 'pos_medicao',
                isPostMeasurement: true,
                updatedAt: serverTimestamp(),
                updatedBy: user?.uid || '',
                updatedByName: profile?.name || user?.email || 'Sistema',
            };

            const historyEntry = {
                date: isoNow,
                action: 'Orçamento avançado para Pós-Medição pela Busca Global.',
                user: profile?.name || user?.email || 'Sistema'
            };

            const quoteRef = doc(db, 'companies', companyId, 'quotes', quote.id);
            await updateDoc(quoteRef, {
                ...updateData,
                history: [...(quote.history || []), historyEntry]
            });
            
            setIsOpen(false);
            alert("Orçamento avançado para Pós-Medição com sucesso.");
        } catch (err) {
            console.error("Erro ao tornar Pós-Medição:", err);
            alert("Erro ao atualizar o orçamento.");
        }
    };

    const handleStartContractAction = (e: React.MouseEvent, quote: Quote) => {
        e.stopPropagation();
        if (!canStartContract(quote)) {
            alert("O contrato só pode ser iniciado após a medição do orçamento.");
            return;
        }
        setIsOpen(false);
        navigate(`/orcamentos?contractModal=true&quoteId=${quote.id}`);
    };

    if (!isOpen) {
        return (
            <button 
                onClick={() => setIsOpen(true)}
                className="hidden md:flex items-center justify-between w-64 h-10 px-4 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl border border-transparent dark:border-white/5 transition-all text-sm group"
            >
                <div className="flex items-center text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">
                    <Search className="w-4 h-4 mr-2" />
                    <span>Busca Global...</span>
                </div>
                <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-white/10 text-slate-400">Ctrl</kbd>
                    <span className="text-slate-300 text-xs">+</span>
                    <kbd className="px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-white/10 text-slate-400">K</kbd>
                </div>
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4 font-sans">
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-all" onClick={() => setIsOpen(false)} />
            
            <div className="relative w-full max-w-3xl bg-white dark:bg-[#111] rounded-[24px] shadow-[0_0_40px_rgba(0,0,0,0.1)] border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col max-h-[80vh] animate-in slide-in-from-top-4 fade-in duration-300">
                
                {/* Search Bar Input */}
                <div className="relative flex items-center px-4 border-b border-slate-100 dark:border-white/5 bg-white dark:bg-[#111] shrink-0">
                    <Search className="w-6 h-6 text-brand-emerald shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Buscar por nome, telefone ou documento..."
                        className="w-full bg-transparent px-4 py-5 text-lg font-black text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:font-medium focus:outline-none"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    {query.length > 0 && (
                        <button onClick={() => setQuery('')} className="p-2 mr-1 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg text-slate-400 transition-colors">
                            <X className="w-5 h-5 cursor-pointer" />
                        </button>
                     )}
                     <div className="px-2 py-1 text-[9px] font-black uppercase tracking-widest border border-slate-200 dark:border-white/10 text-slate-400 rounded-md bg-slate-50 dark:bg-white/5">Esc</div>
                </div>

                {/* Results List */}
                <div className="flex-1 overflow-y-auto p-3 no-scrollbar" ref={resultsContainerRef}>
                    {query.length > 0 && query.length < 2 && (
                        <div className="py-20 flex flex-col items-center justify-center text-center">
                            <div className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-white/10 border-t-emerald-500 animate-spin mb-4" />
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Buscando na base...</p>
                        </div>
                    )}
                    
                    {query.length >= 2 && flatResults.length === 0 && (
                        <div className="py-20 text-center animate-in fade-in">
                            <div className="mx-auto w-12 h-12 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 flex items-center justify-center text-slate-300 dark:text-slate-600 mb-4">
                                <Search className="w-6 h-6" />
                            </div>
                            <p className="text-slate-900 dark:text-white font-black text-lg">Nenhum resultado encontrado 😕</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 font-medium">Tente buscar por nome longo, telefone (com DDD) ou documento.</p>
                        </div>
                    )}

                    {flatResults.length > 0 && (
                        <div className="space-y-6 pb-2">
                            {/* Render Groups */}
                            {[
                                { title: 'Clientes', data: grouped.client },
                                { title: 'Orçamentos', data: grouped.quote },
                                { title: 'Ordens de Serviço', data: grouped.order },
                                { title: 'Medições', data: grouped.measurement },
                            ].map(group => {
                                if (!group.data || group.data.length === 0) return null;
                                
                                return (
                                    <div key={group.title} className="space-y-1.5 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="px-3 pb-1 flex items-center gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-400">
                                                {group.title}
                                            </span>
                                            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                                                {group.data.length}
                                            </span>
                                        </div>
                                        
                                        {safeArray(group.data).map((result: SearchResult) => {
                                            const globalIndex = flatResults.findIndex(r => r.id === result.id && r.type === result.type);
                                            const isSelected = selectedIndex === globalIndex;
                                            
                                            return (
                                                <div
                                                    key={`${result.type}-${result.id}`}
                                                    onClick={() => handleSelect(result)}
                                                    onMouseMove={() => setSelectedIndex(globalIndex)}
                                                    className={cn(
                                                        "search-result-item flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all group",
                                                        isSelected 
                                                            ? "bg-slate-100 dark:bg-white/10 ring-1 ring-slate-200 dark:ring-white/20" 
                                                            : "hover:bg-slate-50 dark:hover:bg-white/5"
                                                    )}
                                                >
                                                    <div className={cn("w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 shadow-sm", result.color)}>
                                                        <result.icon className="w-4 h-4" />
                                                    </div>
                                                    
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-black text-slate-900 dark:text-white truncate">
                                                                <HighlightText text={result.title} term={query} />
                                                            </span>
                                                            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-200/50 dark:bg-white/10 text-slate-500 dark:text-slate-400">
                                                                {result.badge}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                                                                <HighlightText text={result.subtitle} term={query} />
                                                            </span>
                                                            {result.date && (
                                                                <>
                                                                    <span className="text-slate-300 dark:text-slate-600">•</span>
                                                                    <span className="text-[10px] font-bold text-slate-400">
                                                                        {formatVisualDate(result.date, "dd/MM/yyyy")}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Quick Actions Panel */}
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {result.phone && (
                                                            <>
                                                              <button 
                                                                onClick={(e) => handleCall(e, result.phone)}
                                                                className="h-8 w-8 flex items-center justify-center rounded-lg bg-blue-50 text-blue-500 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 transition-colors"
                                                                title="Ligar"
                                                              >
                                                                <Phone className="w-3.5 h-3.5" />
                                                              </button>
                                                              <button 
                                                                onClick={(e) => handleWhatsApp(e, result.phone)}
                                                                className="h-8 w-8 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-500 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 transition-colors"
                                                                title="WhatsApp"
                                                              >
                                                                <WhatsAppIcon className="w-4 h-4" />
                                                              </button>
                                                            </>
                                                        )}
                                                        {result.type === 'quote' && result.raw && (
                                                            <>
                                                                {canMoveToPostMeasurement(result.raw) && (
                                                                    <button 
                                                                        onClick={(e) => handleMakePostMeasurement(e, result.raw)}
                                                                        className="ml-1 h-8 px-2 flex items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800 font-bold text-[9px] uppercase tracking-wider transition-colors"
                                                                    >
                                                                        Tornar Pós-Medição
                                                                    </button>
                                                                )}
                                                                {canStartContract(result.raw) && (
                                                                    <button 
                                                                        onClick={(e) => handleStartContractAction(e, result.raw)}
                                                                        className="ml-1 h-8 px-2 flex items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 font-bold text-[9px] uppercase tracking-wider transition-colors"
                                                                    >
                                                                        Iniciar Contrato
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleSelect(result); }}
                                                            className="ml-2 h-8 px-3 flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold text-[10px] uppercase tracking-wider hover:scale-105 transition-transform"
                                                        >
                                                            <span>Abrir</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer hints */}
                <div className="p-3 bg-slate-50 dark:bg-[#0a0a0a] border-t border-slate-100 dark:border-white/5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <span className="flex items-center gap-1.5">
                            <kbd className="flex items-center justify-center w-5 h-5 bg-white dark:bg-slate-800 rounded shadow-sm border border-slate-200 dark:border-white/10">↑</kbd>
                            <kbd className="flex items-center justify-center w-5 h-5 bg-white dark:bg-slate-800 rounded shadow-sm border border-slate-200 dark:border-white/10">↓</kbd>
                            <span>Navegar</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <kbd className="flex items-center justify-center px-1.5 h-5 bg-white dark:bg-slate-800 rounded shadow-sm border border-slate-200 dark:border-white/10"><CornerDownLeft className="h-2.5 w-2.5" /></kbd>
                            <span>Abrir</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <kbd className="flex items-center justify-center px-1.5 h-5 bg-white dark:bg-slate-800 rounded shadow-sm border border-slate-200 dark:border-white/10">ESC</kbd>
                            <span>Fechar</span>
                        </span>
                    </div>
                    <span className="font-black text-[9px] uppercase tracking-[0.3em] text-brand-emerald opacity-50 flex items-center gap-1"><Zap className="w-3 h-3" /> Sistema Inteligente</span>
                </div>
            </div>
        </div>
    );
};
