import { safeArray } from '../../lib/dataDiagnostics';
import { safeParseISO, compareDatesSafe } from '../../lib/dateUtils';
import React, { useState, useEffect, useMemo } from 'react';
import type { Quote, Measurement, Order, StoneGroup, QuoteAccessory, QuoteService } from '../../types';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Calendar, AlertCircle, FilePlus, PlusCircle, ChevronRight, Hash, ExternalLink } from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import { resolveQuoteTotal, calculateQuoteTotals, hydrateQuoteForEditor } from '../../utils/quoteCalculations';
import { updateQuoteTotalInFirestore } from '../../utils/quoteFirestore';
import { getEffectiveWorkflowStage, canStartContract } from '../../components/workflow/WorkflowStatus';
import { QuoteReview } from './QuoteReview';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { toISODateSafe } from '../../lib/dateWriteUtils';
import { useAuth } from '../../context/AuthContext';
import { useCompanyData } from '../../hooks/useCompanyData';

interface QuoteSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    measurement: Measurement | null;
    orders: Order[]; // Para verificar vínculos ativos
    contracts?: any[]; // Para verificar contratos ativos
    onSelect: (quote: Quote) => void;
    onCreateNew: () => void;
}

export const QuoteSelectorModal: React.FC<QuoteSelectorModalProps> = ({
    isOpen,
    onClose,
    measurement,
    orders,
    contracts = [],
    onSelect,
    onCreateNew
}) => {
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [loading, setLoading] = useState(false);
    const { user, profile } = useAuth();
    const { companyData } = useCompanyData();

    // Estados para edição pós-medição
    const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    
    // Estados locais do orçamento em edição (espelhando QuotePage)
    const [groups, setGroups] = useState<StoneGroup[]>([]);
    const [accessories, setAccessories] = useState<QuoteAccessory[]>([]);
    const [services, setServices] = useState<QuoteService[]>([]);
    const [discount, setDiscount] = useState(0);
    const [observations, setObservations] = useState('');
    const [includeInstallation, setIncludeInstallation] = useState(true);
    const [manualInstallation, setManualInstallation] = useState<{ value: number; description: string } | null>(null);

    // Conjunto de orçamentos já vinculados a ordens de serviço ativas ou contratos
    const usedQuoteIds = useMemo(() => {
        const orderQuoteIds = (orders || []).map(o => o?.quoteId).filter(Boolean);
        const contractQuoteIds = (contracts || []).map(c => c?.quoteId).filter(Boolean);
        return new Set([...orderQuoteIds, ...contractQuoteIds]);
    }, [orders, contracts]);

    useEffect(() => {
        if (!isOpen || !measurement?.clientId) return;

        setLoading(true);
        
        const q = query(
            collection(db, 'orcamentos'), 
            where('companyId', '==', profile.companyId),
            where('clientId', '==', measurement.clientId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as Quote));
            
            // Only show active POST-MEASUREMENT quotes in the selection funnel
            const validData = (data || []).filter(q => {
                const stage = getEffectiveWorkflowStage(q);
                const isPost = q.isPostMeasurement === true || stage === 'pos_medicao';
                return stage !== 'cancelado' && isPost;
            });
            
            // Ordenação descendente em memória
            const sorted = validData.sort((a, b) => 
                compareDatesSafe(a.createdAt, b.createdAt, 'desc')
            );
            
            setQuotes(sorted);
            setLoading(false);
        }, (error) => {
            console.error("Erro no onSnapshot do modal:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isOpen, measurement?.clientId]);

    // --- ROBUST TOTAL CALCULATION & AUTO-FIX ---
    const quotesWithTotals = useMemo(() => {
        return (quotes || []).map(q => {
            const resolution = resolveQuoteTotal(q);
            return { 
                ...q, 
                effectiveTotal: Number(resolution.effectiveTotal) || 0, 
                hasInconsistency: !!resolution.hasInconsistency,
                shouldAutoFix: !!resolution.shouldAutoFix,
                resolutionReason: String(resolution.reason || ''),
                resolutionSource: String(resolution.sourceUsed || '')
            };
        });
    }, [quotes]);

    // Background Auto-Fix side effect
    const fixedIdsRef = React.useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!isOpen) return;

        quotesWithTotals.forEach(quote => {
            if (quote.shouldAutoFix && !fixedIdsRef.current.has(quote.id)) {
                console.log(`[DATA FIX] Analisando orçamento inconsistente: ${quote.id}. Motivo: ${quote.resolutionReason}.`);
                
                // Persist the correction silently
                updateQuoteTotalInFirestore(quote.id, quote.effectiveTotal).then(success => {
                    if (success) {
                        fixedIdsRef.current.add(quote.id);
                    }
                });
            }
        });
    }, [quotesWithTotals, isOpen]);

    // --- HANDLER DE EDIÇÃO ---
    const handleOpenEdit = async (quote: Quote) => {
        setLoading(true);
        try {
            const docSnap = await getDoc(doc(db, 'orcamentos', quote.id));
            if (docSnap.exists()) {
                const data = hydrateQuoteForEditor(docSnap.data() as Quote) as Quote;
                setEditingQuote(data);
                setGroups(data.groups || []);
                setAccessories(data.accessories || []);
                setServices(data.services || []);
                setDiscount(data.discount || 0);
                setObservations(data.observations || '');
                setIncludeInstallation(data.includeInstallation ?? true);
                setManualInstallation(data.manualInstallation || null);
                setIsEditModalOpen(true);
            }
        } catch (err) {
            console.error("Erro ao carregar orçamento para edição:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveEdit = async () => {
        if (!editingQuote || !user || !profile?.companyId) return;
        setEditSaving(true);
        try {
            const finalCalc = calculateQuoteTotals(
                { groups, accessories, services, discount },
                Number(companyData?.installationRateLinear) || 0,
                includeInstallation,
                manualInstallation
            );

            const isoNow = toISODateSafe(new Date());
            const protectedStages = ['aprovado', 'em_contrato', 'em_producao', 'pronto', 'finalizado', 'cancelado'];
            const currentStage = editingQuote.quoteStage || 'pre_orcamento';
            const finalStage = protectedStages.includes(currentStage) ? currentStage : 'pos_medicao';

            const updateData = {
                groups,
                accessories,
                services,
                discount,
                observations,
                includeInstallation,
                manualInstallation,
                operationalCost: finalCalc.operationalCost,
                linearInstallationTotal: finalCalc.frontaoLinearInstallation,
                manualInstallationTotal: finalCalc.manualInstallationValue,
                subtotal: finalCalc.subtotalBruto,
                commercialTotal: finalCalc.commercialTotal,
                totalAmount: finalCalc.total,
                total: finalCalc.total,
                updatedAt: isoNow,
                isPostMeasurement: true,
                quoteStage: finalStage
            };

            await updateDoc(doc(db, 'orcamentos', editingQuote.id), updateData);
            setIsEditModalOpen(false);
            setEditingQuote(null);
        } catch (err) {
            console.error("Erro ao salvar edição pós-medição:", err);
            alert("Erro ao salvar alterações.");
        } finally {
            setEditSaving(false);
        }
    };

    const editCalc = calculateQuoteTotals(
        { groups, accessories, services, discount },
        Number(companyData?.installationRateLinear) || 0,
        includeInstallation,
        manualInstallation
    );

    // Orçamentos destacados (ex: maior valor)
    const highestValueQuote = useMemo(() => {
        if (!quotesWithTotals || (quotesWithTotals || []).length < 2) return null;
        const sorted = [...(quotesWithTotals || [])].sort((a, b) => (Number(b?.effectiveTotal) || 0) - (Number(a?.effectiveTotal) || 0));
        const highest = sorted[0];
        return (highest && (Number(highest?.effectiveTotal) || 0) > 0) ? highest : null;
    }, [quotesWithTotals]);

    if (!isOpen) return null;

    if (loading) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Sincronizando orçamentos...">
                <div className="p-12 text-center bg-white">
                    <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Validando dados comerciais...</p>
                </div>
            </Modal>
        );
    }

    if (quotes.length === 0) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="" className="max-w-md">
                <div className="p-8 text-center bg-white space-y-6">
                    <div className="w-16 h-16 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                        <AlertCircle className="w-8 h-8 text-amber-500" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">Sem orçamento vinculado</h3>
                        <p className="text-slate-500 text-sm font-medium px-4">
                            Não encontramos orçamentos ativos para este cliente.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3 pt-2">
                        <Button 
                            onClick={onCreateNew} 
                            className="bg-slate-900 text-white font-black uppercase tracking-widest text-[10px] h-12 shadow-sm rounded-xl hover:bg-slate-800 transition-all"
                        >
                            <PlusCircle className="w-4 h-4 mr-2" /> Criar Novo Orçamento
                        </Button>
                        <Button 
                            variant="ghost" 
                            onClick={onClose}
                            className="h-12 text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:text-slate-600 hover:bg-slate-50"
                        >
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <>
        <Modal isOpen={isOpen} onClose={onClose} title="" className="max-w-4xl p-0 overflow-hidden">
            <div className="bg-white">
                <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center shrink-0">
                            <FilePlus className="w-6 h-6 text-slate-900" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Selecionar orçamento</h2>
                            <p className="text-sm text-slate-500 font-bold">Identificamos os seguintes orçamentos para converter em OS.</p>
                        </div>
                    </div>
                    
                    <Button 
                        onClick={onCreateNew} 
                        variant="outline"
                        className="border-slate-200 font-black uppercase tracking-widest text-[9px] px-4 group"
                    >
                        <PlusCircle className="w-3 h-3 mr-2 text-emerald-500 group-hover:scale-110 transition-transform" />
                        Novo Orçamento
                    </Button>
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto no-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {safeArray(quotesWithTotals).map((quote, index) => {
                            const isUsed = usedQuoteIds.has(quote.id);
                            const isMostRecent = index === 0;
                            const isHighest = highestValueQuote?.id === quote.id;
                            const { effectiveTotal, hasInconsistency } = quote;

                            if (hasInconsistency) {
                                console.warn(`[QUOTE VALUE DEBUG] INCONSISTENCY DETECTED for ${quote.id}. Total is 0 but structural items exist.`, quote);
                            }
                            console.log(`[QUOTE VALUE DEBUG] Final Displaying Value for ${quote.id}:`, effectiveTotal);

                            return (
                                <div 
                                    key={quote.id} 
                                    className={cn(
                                        "relative border rounded-2xl p-5 transition-all group",
                                        (quote.quoteStage === 'em_producao' || quote.quoteStage === 'finalizado' || !!quote.convertedToOrderId || !!(quote as any).orderId) 
                                            ? "border-slate-100 bg-slate-50/50 grayscale pointer-events-none opacity-60" 
                                            : "border-slate-200 bg-white hover:border-slate-900 hover:shadow-md cursor-pointer active:scale-[0.99]"
                                    )}
                                    onClick={() => {
                                        const stage = getEffectiveWorkflowStage(quote);
                                        if (stage === 'em_producao' || stage === 'finalizado' || !!quote.convertedToOrderId || !!(quote as any).orderId) return;
                                        onSelect(quote);
                                    }}
                                >
                                    {/* Indicators/Badges */}
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            {(() => {
                                                const stage = getEffectiveWorkflowStage(quote);
                                                const isPost = stage === 'pos_medicao' || stage === 'revisao_comercial';
                                                const isContract = stage === 'em_contrato';
                                                const isApproved = stage === 'aprovado';
                                                const isProduction = stage === 'em_producao' || stage === 'finalizado';

                                                return (
                                                    <div className="flex gap-1.5">
                                                        <span className={cn(
                                                            "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-tighter whitespace-nowrap",
                                                            isProduction ? 'bg-teal-500 text-white' :
                                                            isContract ? 'bg-purple-500 text-white' :
                                                            isPost ? 'bg-blue-500 text-white' :
                                                            isApproved ? 'bg-emerald-500 text-white' : 
                                                            stage === 'pre_orcamento' ? 'bg-slate-500 text-white' : 
                                                            'bg-slate-400 text-white'
                                                        )}>
                                                            {isProduction ? '🏭 OS Gerada' : 
                                                             isContract ? '📄 Em Contrato' :
                                                             isPost ? '📏 Pós-Medição' :
                                                             isApproved ? '✔ Aprovado' : '🟡 Em Aberto'}
                                                        </span>
                                                    </div>
                                                );
                                            })()}
                                            {isMostRecent && !isUsed && (
                                                <span className="bg-amber-500 text-white px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-tighter">
                                                    Mais Recente
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-right flex flex-col items-end">
                                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-1">Cód. Interno</span>
                                            <span className="text-xs font-mono font-bold text-slate-600">#{quote.id.substring(0, 8)}</span>
                                        </div>
                                    </div>

                                    {/* Quote Body */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition-colors">
                                                <Hash className="w-5 h-5 opacity-40 group-hover:opacity-100" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Valor do Projeto</span>
                                                <span className={cn("text-xl font-black tracking-tight", isHighest ? "text-emerald-600" : "text-slate-900")}>
                                                    {hasInconsistency ? (
                                                        <span className="text-sm text-amber-600 font-bold flex items-center gap-1">
                                                            <AlertCircle className="w-4 h-4" /> Inconsistência no Valor
                                                        </span>
                                                    ) : (Number(effectiveTotal) || 0) > 0 ? (
                                                        (Number(effectiveTotal) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                                    ) : (
                                                        <span className="text-sm text-slate-400 font-medium italic">Valor Indisponível</span>
                                                    )}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-slate-500 font-bold text-xs uppercase">
                                                <Calendar className="w-3.5 h-3.5" />
                                                {safeParseISO(quote.createdAt)?.toLocaleDateString('pt-BR') || 'Sem data'}
                                            </div>
                                            {!(quote.quoteStage === 'em_producao' || quote.quoteStage === 'finalizado' || !!quote.convertedToOrderId || !!(quote as any).orderId) ? (
                                                <div className="flex items-center gap-2">
                                                    <Button 
                                                        variant="outline" 
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            const stage = getEffectiveWorkflowStage(quote);
                                                            if (['aprovado', 'em_contrato', 'em_producao', 'finalizado'].includes(stage)) {
                                                                alert('Orçamento congelado não pode ser editado. Use a tela principal para criar uma nova versão.');
                                                                return;
                                                            }
                                                            handleOpenEdit(quote);
                                                        }} 
                                                        className="h-8 px-3 text-[9px] uppercase font-black text-slate-500 hover:text-slate-900 border-slate-200"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5 mr-1" /> Editar
                                                    </Button>
                                                    <Button 
                                                        disabled={!canStartContract(quote) && !(quote.quoteStage === 'em_contrato' || !!quote.convertedToContractId)}
                                                        title={(!canStartContract(quote) && !(quote.quoteStage === 'em_contrato' || !!quote.convertedToContractId)) ? "Contrato liberado após a medição." : ""}
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            if (!canStartContract(quote) && !(quote.quoteStage === 'em_contrato' || !!quote.convertedToContractId)) return;
                                                            onSelect(quote); 
                                                        }} 
                                                        className={cn(
                                                            "h-8 px-4 text-[9px] uppercase font-black text-white",
                                                            (quote.quoteStage === 'em_contrato' || !!quote.convertedToContractId) ? "bg-purple-600 hover:bg-purple-700" : "bg-slate-900 hover:bg-slate-800",
                                                            (!canStartContract(quote) && !(quote.quoteStage === 'em_contrato' || !!quote.convertedToContractId)) ? "opacity-50 cursor-not-allowed" : ""
                                                        )}
                                                    >
                                                        {(quote.quoteStage === 'em_contrato' || !!quote.convertedToContractId) ? 'Ver Contrato' : 'Iniciar Contrato'} 
                                                        <ChevronRight className="w-3 h-3 ml-1" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="text-slate-400 font-black text-[9px] uppercase flex items-center gap-1">
                                                    <AlertCircle className="w-3.5 h-3.5" />
                                                    {quote.quoteStage === 'finalizado' ? 'Finalizado' : 'OS Gerada'}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Overlay for Used Quote (Only if in production/finalized) */}
                                    {(quote.quoteStage === 'em_producao' || quote.quoteStage === 'finalizado' || !!quote.convertedToOrderId || !!(quote as any).orderId) && (
                                        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center bg-white/40 backdrop-blur-[1px] rounded-2xl">
                                            <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-lg transform -rotate-1">
                                                <p className="text-[10px] font-black text-slate-900 uppercase leading-relaxed tracking-wider px-2">
                                                    {quote.quoteStage === 'finalizado' 
                                                        ? "Este orçamento foi concluído." 
                                                        : "Este orçamento já foi convertido \n em ordem de serviço."}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between font-bold text-[10px] uppercase tracking-widest text-slate-400">
                    <p>MarbleFlow Industrial • Gestão Inteligente de Marmoraria</p>
                    <Button variant="ghost" onClick={onClose} className="h-10 border-slate-200 px-6 text-slate-500 hover:bg-white hover:text-slate-900">
                        Fechar Janela
                    </Button>
                </div>
            </div>
        </Modal>

        {/* Modal de Revisão Pós-Medição */}
        <Modal 
            isOpen={isEditModalOpen} 
            onClose={() => setIsEditModalOpen(false)} 
            title={`Revisão Pós-Medição: ${editingQuote?.customerName || ''}`}
            className="w-[min(98vw,85rem)]"
        >
            <div className="h-[75vh]">
                <QuoteReview 
                    groups={groups}
                    accessories={accessories}
                    services={services}
                    operationalCost={editCalc.operationalCost}
                    discount={discount}
                    calculatedData={editCalc}
                    isFrozen={false}
                    customerName={editingQuote?.customerName || ''}
                    customerPhone={editingQuote?.customerPhone || ''}
                    customerAddress={editingQuote?.customerAddress || ''}
                    sellerName={editingQuote?.sellerName}
                    observations={observations}
                    quoteStage={editingQuote?.quoteStage}
                    status={editingQuote?.status}
                    onEditGroup={(index: number) => {
                        const isPost = editingQuote?.isPostMeasurement === true || editingQuote?.quoteStage === 'pos_medicao';
                        if (isPost && editingQuote?.id) {
                            window.location.href = `/orcamentos/${editingQuote.id}/editar`;
                        } else {
                            alert("Para editar as peças/medidas detalhadamente, use o editor completo. Aqui você pode ajustar acessórios, serviços e descontos.");
                        }
                    }}
                    onRemoveGroup={(index: number) => setGroups(prev => safeArray(prev).filter((_, i) => i !== index))}
                    onUpdateAccessories={setAccessories}
                    onUpdateServices={setServices}
                    onUpdateDiscount={setDiscount}
                    onUpdateObservations={setObservations}
                    includeInstallation={includeInstallation}
                    onUpdateIncludeInstallation={setIncludeInstallation}
                    manualInstallation={manualInstallation}
                    onUpdateManualInstallation={setManualInstallation}
                    onSave={async () => {
                        await handleSaveEdit();
                    }}
                    isLoading={editSaving}
                    isPostMeasurement={true}
                />
            </div>
        </Modal>
        </>
    );
};
