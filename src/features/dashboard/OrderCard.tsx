import React from 'react';
import { Calendar, Package, AlertCircle, UploadCloud, Image as ImageIcon, Paperclip, CheckSquare } from 'lucide-react';
import type { Order } from '../../types';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/utils';

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
    const getCardStyles = () => {
        let baseStyles = "glass-card rounded-2xl cursor-pointer relative overflow-hidden group";

        if (order.isInternalReturn || order.isReturn) {
            return `${baseStyles} border - brand - ruby / 50 shadow - [0_0_15px_rgba(225, 29, 72, 0.15)] bg - red - 50 / 80 dark: bg - brand - ruby / 10 hover: shadow - [0_0_20px_rgba(225, 29, 72, 0.25)] animate - pulse - border transition - all duration - 300 transform - gpu`;
        }

        switch (order.status) {
            case 'production_queue':
                return `${baseStyles} border - brand - neon / 30 bg - orange - 50 / 50 dark: bg - brand - neon / 5 hover: border - brand - neon / 50`;
            case 'production':
                return `${baseStyles} border - brand - emerald / 30 bg - emerald - 50 / 50 dark: bg - brand - emerald / 5 hover: border - brand - emerald / 50`;
            case 'ready_for_conference':
                return `${baseStyles} `;
            case 'installation':
                return `${baseStyles} `;
            case 'finished':
                return `${baseStyles} opacity - 75 hover: opacity - 100 bg - slate - 50 / 50 dark: bg - white / 5 border - transparent dark: border - white / 5`;
            default:
                return baseStyles;
        }
    };

    const checklistItems = order.conferenceChecklist ? Object.values(order.conferenceChecklist) : [];
    const totalChecklist = checklistItems.length;
    const completedChecklist = checklistItems.filter(Boolean).length;
    const progressPercentage = totalChecklist > 0 ? (completedChecklist / totalChecklist) * 100 : 0;

    return (
        <Card
            onClick={() => onClick(order)}
            className={getCardStyles()}
        >
            {order.isReturn && !order.isInternalReturn && (
                <div className="bg-brand-ruby text-white text-[10px] uppercase font-bold text-center py-1 tracking-wider shadow-sm">
                    ⚠️ Retorno: {new Date(order.deadline).toLocaleDateString('pt-BR')}
                </div>
            )}
            {order.isInternalReturn && (
                <div className="bg-brand-ruby text-white text-[10px] uppercase font-bold text-center py-1 tracking-wider animate-pulse shadow-sm">
                    ⚠️ REFAZER URGENTE - {order.remakeItem}
                </div>
            )}

            {/* dynamic queue number as a tag header */}
            {queueIndex !== undefined && !order.isReturn && !order.isInternalReturn && (
                <div className="bg-gradient-to-r from-brand-neon to-orange-400 text-white text-xs font-bold px-4 py-1.5 flex justify-between items-center shadow-sm">
                    <span className="uppercase tracking-wider text-[10px] opacity-90">Fila de Produção</span>
                    <span className="text-sm drop-shadow-md">#{queueIndex}</span>
                </div>
            )}

            <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                    {order.isInternalReturn ? (
                        <Badge variant="destructive" className="animate-pulse bg-brand-ruby">Refugo</Badge>
                    ) : (
                        <Badge variant={PRIORITY_COLORS[order.priority]}>
                            {PRIORITY_LABELS[order.priority]}
                        </Badge>
                    )}
                    <div className="flex gap-2 items-center">
                        {order.attachments && order.attachments.length > 0 && (
                            <Badge variant="secondary" className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 gap-1 pr-1.5 pl-2 animate-in fade-in zoom-in">
                                <Paperclip className="w-3 h-3" />
                                {order.attachments.length}
                            </Badge>
                        )}
                        <span className="text-xs text-slate-500 font-mono font-medium dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 px-2 py-0.5 rounded-md">
                            {order.protocolNumber}
                        </span>
                    </div>
                </div>

                <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-100 leading-tight">
                        {order.customerName}
                    </h4>
                    <div className="flex items-center text-sm text-slate-500 dark:text-slate-400 mt-1.5">
                        <Package className="h-3.5 w-3.5 mr-1.5 opacity-70" />
                        <span className="truncate font-medium">{order.material}</span>
                    </div>
                </div>

                {totalChecklist > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-white/10 relative z-10 pb-1">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Verificação Técnica</span>
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{completedChecklist}/{totalChecklist}</span>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-200/50 dark:border-white/10 relative z-10">
                    <div className="flex items-center font-medium">
                        <Calendar className="h-3.5 w-3.5 mr-1.5 opacity-70" />
                        <span>{new Date(order.deadline).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {order.isReturn && (
                        <span className="text-[10px] font-bold text-brand-ruby bg-brand-ruby/10 px-2 py-0.5 rounded uppercase">
                            Retorno
                        </span>
                    )}
                    {!order.isReturn && new Date(order.deadline) < new Date() && order.status !== 'finished' && (
                        <AlertCircle className="h-4 w-4 text-brand-ruby animate-pulse" />
                    )}
                </div>

                {order.status === 'installation' && onReturnClick && (
                    <div className="pt-2">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onReturnClick(order);
                            }}
                            className="w-full text-xs font-bold py-2 px-3 rounded-xl bg-orange-100/50 text-orange-700 hover:bg-orange-200/80 dark:bg-orange-500/10 dark:text-orange-400 dark:hover:bg-orange-500/20 transition-all flex items-center justify-center gap-1.5"
                        >
                            <AlertCircle className="h-3.5 w-3.5" /> Registar Retorno
                        </button>
                    </div>
                )}

                {/* File Management Actions */}
                <div className="flex items-center gap-2 pt-2 z-10 relative">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onUploadClick?.(order);
                        }}
                        className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                        <UploadCloud className="w-3.5 h-3.5" /> Upar
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onViewAttachmentsClick?.(order);
                        }}
                        disabled={!order.attachments || order.attachments.length === 0}
                        className={cn(
                            "flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5",
                            order.attachments && order.attachments.length > 0
                                ? "bg-teal-50 hover:bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:hover:bg-teal-900/50 dark:text-teal-400"
                                : "bg-slate-50 text-slate-400 dark:bg-slate-900/50 dark:text-slate-600 cursor-not-allowed"
                        )}
                    >
                        <ImageIcon className="w-3.5 h-3.5" /> Ver {order.attachments && order.attachments.length > 0 && `(${order.attachments.length})`}
                    </button>
                </div>

                {order.status === 'ready_for_conference' && onInternalReturnClick && (
                    <div className="pt-2">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onInternalReturnClick(order);
                            }}
                            className="w-full text-xs font-bold py-2 px-3 rounded-xl bg-brand-ruby/10 text-brand-ruby hover:bg-brand-ruby/20 transition-all flex items-center justify-center gap-1.5"
                        >
                            <AlertCircle className="h-3.5 w-3.5" /> Registrar Avaria
                        </button>
                    </div>
                )}
            </CardContent>

            {/* Absolute Bottom Progress Bar */}
            {totalChecklist > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-200/50 dark:bg-slate-800/10 overflow-hidden z-20">
                    <div
                        className="h-full bg-gradient-to-r from-teal-400 to-brand-emerald transition-all duration-500 ease-out shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                        style={{ width: `${progressPercentage}% ` }}
                    />
                </div>
            )}
        </Card>
    );
};
