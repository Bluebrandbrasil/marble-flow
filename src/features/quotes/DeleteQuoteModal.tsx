import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { AlertTriangle, Trash2, Info, Lock } from 'lucide-react';
import type { Quote } from '../../types';
import { WorkflowBadge, canDeleteQuote, getEffectiveWorkflowStage } from '../../components/workflow/WorkflowStatus';

interface DeleteQuoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: string, category: string) => void;
    quote: Quote | null;
}

export const DeleteQuoteModal: React.FC<DeleteQuoteModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    quote
}) => {
    const [reason, setReason] = useState('');
    const [category, setCategory] = useState('');
    const validation = canDeleteQuote(quote);
    const stage = getEffectiveWorkflowStage(quote);

    const handleConfirm = () => {
        if (!category) return;
        if (category === 'outros' && !reason.trim()) return;
        onConfirm(reason, category);
        setReason('');
        setCategory('');
    };

    if (!quote) return null;

    const total = (quote.commercialTotal || 0) + (quote.operationalCost || 0) + (quote.freight || 0);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={validation.can ? "Excluir Orçamento" : "Exclusão Bloqueada"}
            className="max-w-md"
        >
            <div className="space-y-6">
                {/* Header Info */}
                <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-100 dark:border-white/5">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">Cliente</p>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{quote.customerName}</h3>
                        </div>
                        <WorkflowBadge stage={stage} size="sm" />
                    </div>
                    <div className="flex justify-between items-end">
                        <div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">Valor Total</p>
                            <p className="text-sm font-black text-brand-emerald">
                                R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        <p className="text-[10px] font-mono text-slate-400">ID: {quote.id.slice(-8).toUpperCase()}</p>
                    </div>
                </div>

                {!validation.can ? (
                    <div className="space-y-4">
                        <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 p-4 rounded-2xl flex gap-3 items-start">
                            <Lock className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest mb-1">Operação Negada</p>
                                <p className="text-xs text-rose-700 dark:text-rose-300 leading-relaxed font-medium">
                                    {validation.reason}
                                </p>
                            </div>
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 p-4 rounded-2xl flex gap-3 items-start">
                            <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed font-medium">
                                Para orçamentos aprovados ou em produção, utilize a função de <strong>Cancelar</strong> ou <strong>Revisar</strong> no menu de ações para manter a integridade fiscal e produtiva.
                            </p>
                        </div>
                        <Button
                            onClick={onClose}
                            className="w-full h-12 rounded-2xl bg-slate-900 dark:bg-white dark:text-slate-900 font-bold uppercase text-[10px] tracking-widest"
                        >
                            Entendido
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 p-4 rounded-2xl flex gap-3 items-start shadow-sm">
                            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-1">Aviso de Impacto</p>
                                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed font-medium">
                                    Esta ação realizará a <strong>exclusão lógica</strong> do orçamento. Ele não aparecerá mais nas listagens ativas, mas permanecerá no banco de dados para fins de governança e auditoria.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-1">Motivo Principal</label>
                                <select
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="w-full h-12 px-4 rounded-2xl border-2 border-slate-100 dark:border-white/5 bg-white dark:bg-slate-950 text-sm font-bold focus:border-brand-emerald outline-none transition-all"
                                >
                                    <option value="">Selecione um motivo...</option>
                                    <option value="cliente_desistiu">Cliente Desistiu</option>
                                    <option value="valor_alto">Valor Alto / Orçamento Caro</option>
                                    <option value="erro_orcamento">Erro de Orçamento</option>
                                    <option value="duplicado">Orçamento Duplicado</option>
                                    <option value="concorrencia">Perdido para Concorrência</option>
                                    <option value="outros">Outros (especificar)</option>
                                </select>
                            </div>

                            {(category === 'outros' || category === 'cliente_desistiu' || category === 'concorrencia') && (
                                <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-1">Mais Detalhes (Opcional)</label>
                                    <textarea
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="Descreva brevemente mais detalhes se necessário..."
                                        className="w-full h-24 p-4 rounded-2xl border-2 border-slate-100 dark:border-white/5 bg-white dark:bg-slate-950 text-sm font-medium focus:border-brand-emerald focus:ring-4 focus:ring-brand-emerald/10 transition-all outline-none resize-none"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <Button
                                variant="ghost"
                                onClick={onClose}
                                className="h-12 rounded-2xl font-bold uppercase text-[10px] tracking-widest text-slate-500"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleConfirm}
                                disabled={!category || (category === 'outros' && !reason.trim())}
                                className="h-12 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-rose-500/20 disabled:opacity-50"
                            >
                                <Trash2 className="w-4 h-4 mr-2" /> Confirmar Exclusão
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};
