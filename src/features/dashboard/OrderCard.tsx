import { safeArray } from '../../lib/dataDiagnostics';
import { safeParseISO } from '../../lib/dateUtils';
import React from 'react';
import { Calendar, Package, UploadCloud, Paperclip, Clock, Hammer, Truck, Info } from 'lucide-react';
import type { Order } from '../../types';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { ShieldCheck, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import { addDays, format, isBefore, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { WorkflowBadge, getEffectiveOrderStage } from '../../components/workflow/WorkflowStatus';
import { getContractDisplayStatus } from '../../utils/contractUtils';

interface OrderCardProps {
    order: Order;
    queueIndex?: number;
    onClick: (order: Order) => void;
    onReturnClick?: (order: Order) => void;
    onInternalReturnClick?: (order: Order) => void;
    onUploadClick?: (order: Order) => void;
    onViewAttachmentsClick?: (order: Order) => void;
}

const PRIORITY_COLORS = {
    high: 'destructive',
    medium: 'warning',
    low: 'secondary',
} as const;

const PRIORITY_LABELS = {
    high: 'Alta',
    medium: 'Média',
    low: 'Baixa',
};

export const OrderCard: React.FC<OrderCardProps> = ({
    order,
    queueIndex,
    onClick,
    onReturnClick,
    onInternalReturnClick,
    onUploadClick,
    onViewAttachmentsClick
}) => {
    // ESTIMATED PRODUCTION DATE (ASSUMPTION: 2 ORDERS PER DAY)
    const getEstimatedProduction = () => {
        if (queueIndex === undefined || (order.status !== 'aguardando_materia_prima' && order.status !== 'em_producao')) return null;
        const daysToProduction = Math.ceil(queueIndex / 2);
        return addDays(new Date(), daysToProduction);
    };

    const estDate = getEstimatedProduction();
    const deadlineDate = safeParseISO(order.deadline);
    const isAtRisk = estDate && isAfter(estDate, deadlineDate);
    const isOverdue = isBefore(deadlineDate, new Date()) && order.status !== 'finalizado';

    const getCardStyles = () => {
        const baseStyles = "glass-card rounded-2xl cursor-pointer relative overflow-hidden group transition-all duration-300 transform-gpu hover:shadow-xl";

        if (order.isInternalReturn || order.isReturn) {
            return `${baseStyles} border-brand-ruby/50 shadow-[0_0_15px_rgba(225,29,72,0.15)] bg-red-50/80 dark:bg-brand-ruby/10 hover:shadow-[0_0_20px_rgba(225,29,72,0.25)]`;
        }

        if (isAtRisk && (order.status === 'aguardando_materia_prima' || order.status === 'em_producao')) {
            return `${baseStyles} border-amber-500/50 bg-amber-50/50 dark:bg-amber-500/5 hover:border-amber-500 shadow-amber-500/10`;
        }

        switch (order.status) {
            case 'aguardando_materia_prima':
                return `${baseStyles} border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900 hover:border-brand-emerald/50`;
            case 'em_producao':
                return `${baseStyles} border-brand-emerald/30 bg-emerald-50/10 dark:bg-brand-emerald/5 hover:border-brand-emerald/50 shadow-emerald-500/5`;
            case 'em_instalacao':
                return `${baseStyles} border-purple-200 dark:border-purple-500/20`;
            case 'finalizado':
                return `${baseStyles} opacity-75 hover:opacity-100 bg-slate-50/50 dark:bg-white/5 border-transparent dark:border-white/5`;
            case 'pausado':
                return `${baseStyles} border-amber-200 dark:border-amber-500/20 bg-amber-50/50`;
            case 'cancelado':
                return `${baseStyles} border-rose-200 dark:border-rose-500/20 bg-rose-50/50 opacity-50`;
            default:
                return baseStyles;
        }
    };

    const checklistItems = order.conferenceChecklist ? Object.values(order.conferenceChecklist) : [];
    const totalChecklist = checklistItems.length;
    const completedChecklist = safeArray(checklistItems).filter(Boolean).length;
    const progressPercentage = totalChecklist > 0 ? (completedChecklist / totalChecklist) * 100 : 0;

    return (
        <Card
            onClick={() => onClick(order)}
            className={getCardStyles()}
        >
            {/* ALERT HEADERS */}
            {order.isReturn && !order.isInternalReturn && (
                <div className="bg-brand-ruby text-white text-[10px] uppercase font-black text-center py-1 tracking-widest shadow-sm">
                    ⚠️ Retorno: {format(deadlineDate, "dd/MM/yyyy")}
                </div>
            )}
            {order.isInternalReturn && (
                <div className="bg-brand-ruby text-white text-[10px] uppercase font-black text-center py-1 tracking-widest animate-pulse shadow-sm">
                    ⚠️ REFAZER URGENTE - {order.remakeItem}
                </div>
            )}
            {isAtRisk && (order.status === 'aguardando_materia_prima' || order.status === 'em_producao') && !order.isReturn && (
                <div className="bg-amber-500 text-white text-[9px] uppercase font-black text-center py-1 tracking-widest flex items-center justify-center gap-1.5 shadow-sm">
                    <Info className="h-3 w-3" /> Risco de Atraso na Fila
                </div>
            )}

            {/* QUEUE POSITION HEADER */}
            {queueIndex !== undefined && !order.isReturn && !order.isInternalReturn && (
                <div className={cn(
                    "px-4 py-1.5 flex justify-between items-center shadow-sm",
                    isAtRisk ? "bg-amber-100/50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400" : "bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400"
                )}>
                    <div className="flex items-center gap-1.5 uppercase font-black text-[9px] tracking-widest text-slate-500">
                        <Clock className="h-3 w-3" /> {order.status === 'em_producao' ? 'Em Produção' : 'Aguardando'}
                    </div>
                    <span className="text-sm font-black drop-shadow-sm">#{queueIndex}</span>
                </div>
            )}

            <CardContent className="p-4 space-y-4">
                {/* STATUS & PRIORITY */}
                <div className="flex justify-between items-start">
                    <div className="flex gap-1.5 flex-wrap">
                        {order.isInternalReturn ? (
                            <Badge variant="destructive" className="bg-brand-ruby text-[9px] uppercase font-black tracking-widest px-2 py-0.5">Refugo</Badge>
                        ) : (
                            <Badge variant={PRIORITY_COLORS[order.priority]} className="text-[9px] uppercase font-black tracking-widest px-2 py-0.5">
                                {PRIORITY_LABELS[order.priority]}
                            </Badge>
                        )}
                        {order.isReturn && !order.isInternalReturn && (
                            <Badge className="bg-rose-500 text-white text-[9px] uppercase font-black tracking-widest px-2 py-0.5">Retorno</Badge>
                        )}
                    </div>
                    
                    <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-white/5 px-2 py-0.5 rounded-md">
                            {order?.protocolNumber || 'OS-???'}
                        </span>
                        <WorkflowBadge 
                            stage={getEffectiveOrderStage(order)} 
                            size="sm" 
                        />
                    </div>
                </div>

                {/* CONTRACT PROVENANCE INDICATOR */}
                {(order.contractId || (order as any).quoteId) && ['assinado', 'assinado_presencial'].includes(getContractDisplayStatus(order)) && (
                    <div 
                        className="flex items-center justify-between p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/10 group/contract cursor-pointer hover:bg-emerald-500/10 transition-colors"
                        onClick={(e) => {
                            e.stopPropagation();
                            window.open(`/order/${order.id}/contract`, '_blank');
                        }}
                    >
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Contrato Assinado</span>
                        </div>
                        <ExternalLink className="w-2.5 h-2.5 text-emerald-400 opacity-0 group-hover/contract:opacity-100 transition-opacity" />
                    </div>
                )}

                {/* CUSTOMER & MATERIAL */}
                <div>
                    <h4 className="font-black text-slate-900 dark:text-white leading-none text-base uppercase tracking-tight group-hover:text-brand-emerald transition-colors">
                        {order.customerName}
                    </h4>
                    <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 mt-2 font-bold uppercase tracking-tight">
                        <Package className="h-3.5 w-3.5 mr-2 text-slate-400" />
                        <span className="truncate">{order.material}</span>
                    </div>
                </div>

                {/* OPERATIONAL INFO: SAWYER / FINISHER / INSTALLER */}
                <div className="grid grid-cols-1 gap-3 border-t border-slate-100 dark:border-white/5 pt-3">
                    {(order.cutterName || order.sawyerName || order.finisherName) && (
                        <div className="space-y-1.5">
                            <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-1">Equipe da Fábrica</p>
                            {(order.cutterName || order.sawyerName) && (
                                <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-tight text-slate-500 dark:text-slate-400">
                                    <Hammer className="h-3 w-3 text-brand-emerald/70" />
                                    <span>Serrador: <span className="text-slate-900 dark:text-slate-200">{order.cutterName || order.sawyerName}</span></span>
                                </div>
                            )}
                            {order.finisherName && (
                                <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-tight text-slate-500 dark:text-slate-400">
                                    <Hammer className="h-3 w-3 text-emerald-500/70" />
                                    <span>Acabador: <span className="text-slate-900 dark:text-slate-200">{order.finisherName}</span></span>
                                </div>
                            )}
                        </div>
                    )}
                    {order.installerName && (
                        <div className="space-y-1.5 pt-2 border-t border-slate-100/50 dark:border-white/5">
                            <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-1">Equipe de Instalação</p>
                            <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-tight text-slate-500 dark:text-slate-400">
                                <Truck className="h-3 w-3 text-indigo-500/70" />
                                <span>Instalador: <span className="text-slate-900 dark:text-slate-200">{order.installerName}</span></span>
                            </div>
                        </div>
                    )}
                </div>

                {/* PREDICTION OR PROGRESS */}
                {(order.status === 'aguardando_materia_prima' || order.status === 'em_producao') && estDate && (
                    <div className={cn(
                        "p-2 rounded-xl text-[10px] font-black uppercase tracking-tight flex items-center justify-between",
                        isAtRisk ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400"
                    )}>
                        <span className="flex items-center gap-2"><Clock className="h-3 w-3" /> Est. Fila:</span>
                        <span>{format(estDate, "dd/MM", { locale: ptBR })}</span>
                    </div>
                )}

                {order.status === 'em_producao' && order.estimatedSawyerTime && (
                    <div className="p-2 rounded-xl text-[10px] font-black uppercase tracking-tight flex items-center justify-between bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">
                        <span className="flex items-center gap-2"><Clock className="h-3 w-3" /> Produção:</span>
                        <span>{order.estimatedSawyerTime} min</span>
                    </div>
                )}

                {totalChecklist > 0 && (
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[9px] uppercase font-black tracking-widest text-slate-400 dark:text-slate-500">
                            <span>Conferência Técnica</span>
                            <span>{completedChecklist}/{totalChecklist}</span>
                        </div>
                        <div className="h-1 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-brand-emerald transition-all duration-500" 
                                style={{ width: `${progressPercentage}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* BOTTOM DATE & ACTIONS */}
                <div className="flex items-center justify-between pt-1">
                    <div className={cn(
                        "flex items-center text-[10px] font-black uppercase tracking-widest",
                        isOverdue ? "text-rose-500" : "text-slate-500 dark:text-slate-400"
                    )}>
                        <Calendar className="h-3.5 w-3.5 mr-2 opacity-70" />
                        <span>{format(deadlineDate, "dd/MM/yyyy")}</span>
                    </div>

                    <div className="flex gap-1">
                        {order.attachments && order.attachments.length > 0 && (
                            <Badge 
                                variant="secondary" 
                                className="bg-brand-emerald/10 text-brand-emerald border-brand-emerald/20 text-[9px] px-1.5 py-0 cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); onViewAttachmentsClick?.(order); }}
                            >
                                <Paperclip className="h-2.5 w-2.5 mr-1" /> {order.attachments.length}
                            </Badge>
                        )}
                        {onUploadClick && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onUploadClick(order); }}
                                className="p-1.5 text-slate-400 hover:text-brand-emerald hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-all"
                            >
                                <UploadCloud className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* SPECIAL BUTTONS */}
                {order.status === 'em_instalacao' && onReturnClick && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onReturnClick(order); }}
                        className="w-full py-2 bg-orange-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-orange-600 shadow-lg shadow-orange-500/20 transition-all"
                    >
                        Registrar Retorno
                    </button>
                )}
                {order.status === 'em_producao' && onInternalReturnClick && order.conferenceChecklist && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onInternalReturnClick(order); }}
                        className="w-full py-2 bg-brand-ruby text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-600 shadow-lg shadow-rose-500/20 transition-all"
                    >
                        Registrar Avaria
                    </button>
                )}
            </CardContent>

            {/* HOVER GLOW EFFECT */}
            <div className="absolute inset-0 bg-brand-emerald/0 group-hover:bg-brand-emerald/[0.02] pointer-events-none transition-all" />
        </Card>
    );
};
