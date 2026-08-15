import { safeArray } from '../../lib/dataDiagnostics';
import React, { useState } from 'react';
import { 
    Trash2, 
    RotateCcw, 
    ChevronLeft, 
    Search, 
    Calendar, 
    AlertCircle, 
    Info, 
    ShieldAlert
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { cn } from '../../lib/utils';
import type { Quote } from '../../types';
import { WorkflowBadge, getEffectiveWorkflowStage } from '../../components/workflow/WorkflowStatus';
import { useAuth } from '../../context/AuthContext';
import { normalizeText } from '../../utils/textUtils';

interface DeletedQuotesViewProps {
    quotes: Quote[];
    onRestore: (id: string) => void;
    onPermanentDelete: (id: string) => void;
}

export const DeletedQuotesView: React.FC<DeletedQuotesViewProps> = ({
    quotes,
    onRestore,
    onPermanentDelete
}) => {
    const navigate = useNavigate();
    const { profile } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<'restore' | 'delete'>('restore');

    const filteredQuotes = safeArray(quotes).filter(quote => {
        const searchLower = normalizeText(searchTerm);
        return normalizeText(quote?.customerName).includes(searchLower) ||
               normalizeText(quote?.id).includes(searchLower);
    });

    const handleAction = (quote: Quote, action: 'restore' | 'delete') => {
        setSelectedQuote(quote);
        setConfirmAction(action);
        setIsConfirmModalOpen(true);
    };

    const confirmActionHandler = () => {
        if (!selectedQuote) return;
        if (confirmAction === 'restore') {
            onRestore(selectedQuote.id);
        } else {
            onPermanentDelete(selectedQuote.id);
        }
        setIsConfirmModalOpen(false);
        setSelectedQuote(null);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => navigate('/orcamentos')}
                        className="rounded-xl bg-white shadow-sm border border-slate-200"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Lixeira de Orçamentos</h1>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gerencie itens excluídos e restaure se necessário</p>
                    </div>
                </div>

                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-brand-rocha-primary transition-colors" />
                    <input 
                        type="text"
                        placeholder="Buscar na lixeira..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-11 w-72 pl-11 pr-4 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-4 focus:ring-brand-rocha-primary/10 focus:border-brand-rocha-primary transition-all shadow-sm"
                    />
                </div>
            </div>

            {/* Warning Banner */}
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-4 shadow-sm">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-amber-500 shadow-sm shrink-0">
                    <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                    <h4 className="text-xs font-black text-amber-800 uppercase tracking-widest mb-1">Política de Governança</h4>
                    <p className="text-xs text-amber-700 font-medium leading-relaxed">
                        Orçamentos nesta lista foram removidos das visualizações operacionais. Você pode restaurá-los mantendo o histórico original. 
                        <span className="font-black"> Exclusão definitiva é irreversível e permitida apenas para Administradores Master.</span>
                    </p>
                </div>
            </div>

            {/* List */}
            {filteredQuotes.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                    {safeArray(filteredQuotes).map(quote => (
                        <Card key={quote.id} className="overflow-hidden border-slate-200 hover:border-brand-rocha-primary/30 transition-all shadow-sm">
                            <CardContent className="p-0">
                                <div className="p-5 flex items-center justify-between gap-6">
                                    <div className="flex items-center gap-6 flex-1 min-w-0">
                                        {/* Client & ID */}
                                        <div className="space-y-1 min-w-[200px]">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-black text-slate-900 truncate uppercase tracking-tight">{quote.customerName}</h3>
                                                <Badge variant="outline" className="text-[9px] font-black uppercase py-0 px-1.5 border-slate-200 text-slate-400">
                                                    #{quote.id.slice(-6).toUpperCase()}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <WorkflowBadge stage={getEffectiveWorkflowStage(quote)} size="sm" />
                                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    Criado: {quote.createdAt ? format(new Date(quote.createdAt), 'dd/MM/yy', { locale: ptBR }) : '---'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Values */}
                                        <div className="px-6 border-l border-slate-100 hidden md:block">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Valor Original</p>
                                            <p className="text-sm font-black text-slate-900">
                                                R$ {((quote.commercialTotal || 0) + (quote.operationalCost || 0) + (quote.freight || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </p>
                                        </div>

                                        {/* Deletion Info */}
                                        <div className="px-6 border-l border-slate-100 flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Excluído por {quote.deletedBy || 'Sistema'}</p>
                                                <span className="text-[9px] font-bold text-slate-400">
                                                    em {quote.deletedAt ? format(new Date(quote.deletedAt), 'dd/MM/yy HH:mm') : '---'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 italic truncate italic">
                                                "{quote.deleteReason || 'Sem motivo especificado'}"
                                            </p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Button 
                                            variant="ghost" 
                                            className="h-10 rounded-xl gap-2 font-black uppercase text-[10px] tracking-widest text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                                            onClick={() => handleAction(quote, 'restore')}
                                        >
                                            <RotateCcw className="h-4 w-4" /> Restaurar
                                        </Button>
                                        
                                        {profile?.role === 'superadmin' && (
                                            <Button 
                                                variant="ghost" 
                                                className="h-10 w-10 p-0 rounded-xl text-rose-400 hover:bg-rose-50 hover:text-rose-600"
                                                onClick={() => handleAction(quote, 'delete')}
                                                title="Exclusão Definitiva"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="h-[400px] flex flex-col items-center justify-center bg-white rounded-[2rem] border-2 border-dashed border-slate-100 p-8 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-200 mb-4">
                        <Trash2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-black text-slate-400 uppercase tracking-tighter">Sua lixeira está vazia</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">Itens excluídos aparecerão aqui para serem recuperados ou removidos permanentemente.</p>
                </div>
            )}

            {/* Confirmation Modal */}
            <Modal
                isOpen={isConfirmModalOpen}
                onClose={() => setIsConfirmModalOpen(null)}
                title={confirmAction === 'restore' ? "Confirmar Restauração" : "Exclusão Definitiva"}
                className="max-w-md p-0 overflow-hidden rounded-[2.5rem]"
            >
                <div className="p-8 text-center space-y-6">
                    <div className={cn(
                        "w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner",
                        confirmAction === 'restore' ? "bg-emerald-50 text-emerald-500" : "bg-rose-50 text-rose-500"
                    )}>
                        {confirmAction === 'restore' ? <RotateCcw className="w-10 h-10" /> : <ShieldAlert className="w-10 h-10" />}
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                            {confirmAction === 'restore' ? "Restaurar Orçamento?" : "Tem certeza absoluta?"}
                        </h3>
                        <p className="text-sm font-medium text-slate-500 leading-relaxed">
                            {confirmAction === 'restore' 
                                ? `Deseja retornar o orçamento de "${selectedQuote?.customerName}" para a lista ativa?` 
                                : `Esta ação é IRREVERSÍVEL. O orçamento de "${selectedQuote?.customerName}" será removido permanentemente de todos os registros.`
                            }
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 pt-2">
                        <Button
                            onClick={confirmActionHandler}
                            className={cn(
                                "h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg hover:scale-[1.02] transition-all",
                                confirmAction === 'restore' ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"
                            )}
                        >
                            {confirmAction === 'restore' ? "Sim, Restaurar" : "Sim, Excluir Definitivamente"}
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => setIsConfirmModalOpen(false)}
                            className="h-12 text-slate-400 font-bold uppercase tracking-widest text-[9px]"
                        >
                            Cancelar
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
