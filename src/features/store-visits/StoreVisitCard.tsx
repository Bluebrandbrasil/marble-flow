import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Clock, MapPin, MessageCircle, FileText, CheckCircle, XCircle, MoreVertical, RefreshCw } from 'lucide-react';
import { cn, safeString } from '../../lib/utils';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import type { StoreVisit } from '../../types';

interface StoreVisitCardProps {
    visit: StoreVisit;
    onClick: () => void;
    onWhatsApp: (e: React.MouseEvent) => void;
    onCreateQuote: (e: React.MouseEvent) => void;
    onStatusChange: (status: StoreVisit['status'], e: React.MouseEvent) => void;
}

export const StoreVisitCard: React.FC<StoreVisitCardProps> = ({
    visit,
    onClick,
    onWhatsApp,
    onCreateQuote,
    onStatusChange
}) => {
    const statusColors = {
        agendada: 'bg-blue-100 text-blue-700 border-blue-200',
        compareceu: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        nao_compareceu: 'bg-rose-100 text-rose-700 border-rose-200',
        reagendada: 'bg-amber-100 text-amber-700 border-amber-200',
        convertida_em_orcamento: 'bg-purple-100 text-purple-700 border-purple-200',
        cancelada: 'bg-slate-100 text-slate-700 border-slate-200'
    };

    const typeLabels = {
        primeira_visita: '1ª Visita',
        retorno: 'Retorno',
        apresentacao_projeto: 'Apresentação',
        fechamento: 'Fechamento',
        pos_venda: 'Pós-Venda',
        sem_agendamento: 'Sem Agendamento'
    };

    const normalizedStatus = (safeString(visit?.status).trim() || 'agendada') as StoreVisit['status'];
    const statusLabel = normalizedStatus.replace(/_/g, ' ');
    const normalizedType = safeString(visit?.visitType).trim();
    const typeLabel = typeLabels[normalizedType as keyof typeof typeLabels] || normalizedType || 'Tipo não informado';

    return (
        <div 
            onClick={onClick}
            className="group relative flex flex-col p-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-brand-rocha-primary/30 transition-all cursor-pointer overflow-hidden"
        >
            <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-slate-900 text-sm truncate pr-2">
                    {visit.clientName || 'Cliente não informado'}
                </span>
                <span className={cn("text-[10px] font-black uppercase px-2 py-0.5 rounded-full border whitespace-nowrap", statusColors[normalizedStatus] || statusColors.agendada)}>
                    {statusLabel}
                </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <Clock className="w-3.5 h-3.5" />
                <span>{visit.visitTime || 'S/ Hora'}</span>
                <span className="text-slate-300">•</span>
                <span className="font-medium text-slate-600 truncate">{typeLabel}</span>
            </div>

            {visit.sellerName && (
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <span className="font-medium">Vendedor:</span>
                    <span className="truncate">{visit.sellerName}</span>
                </div>
            )}

            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onWhatsApp(e);
                    }}
                    className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors flex-1 flex justify-center"
                    title="Abrir WhatsApp"
                >
                    <WhatsAppIcon className="w-4 h-4" />
                </button>
                
                {visit.status !== 'convertida_em_orcamento' && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onCreateQuote(e);
                        }}
                        className="p-1.5 text-slate-400 hover:text-brand-rocha-primary hover:bg-brand-rocha-primary/10 rounded-lg transition-colors flex-1 flex justify-center"
                        title="Criar Orçamento"
                    >
                        <FileText className="w-4 h-4" />
                    </button>
                )}

                {visit.status === 'agendada' && (
                    <>
                        <button
                            onClick={(e) => onStatusChange('compareceu', e)}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors flex-1 flex justify-center"
                            title="Marcar Compareceu"
                        >
                            <CheckCircle className="w-4 h-4" />
                        </button>
                        <button
                            onClick={(e) => onStatusChange('nao_compareceu', e)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex-1 flex justify-center"
                            title="Marcar Não Compareceu"
                        >
                            <XCircle className="w-4 h-4" />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};
