import { safeArray } from '../../lib/dataDiagnostics';
import { safeParseISO } from '../../lib/dateUtils';
import React, { useState, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import type { Order, Status } from '../../types';
import { COLUMNS } from '../../data/mockData';
import { OrderCard } from './OrderCard';
import { Printer, User, BarChart2, AlertTriangle, Package } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { FileUploadModal } from '../../components/ui/FileUploadModal';
import { CarouselViewerModal } from '../../components/ui/CarouselViewerModal';
import { cn } from '../../lib/utils';
import { isAfter, addDays } from 'date-fns';

interface KanbanBoardProps {
    orders: Order[];

    onOrderClick: (order: Order) => void;
    onOrderMove: (orderId: string, newStatus: Status, newIndex?: number) => void;
    onOrderReorder?: (status: Status, startIndex: number, endIndex: number) => void;
    onOrderReturn?: (order: Order) => void;
    onInternalReturnClick?: (order: Order) => void;
    onPrintColumn?: (columnId: Status) => void;
    onUpdateOrder?: (orderId: string, updates: Partial<Order>) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ orders, onOrderClick, onOrderMove, onOrderReorder, onOrderReturn, onPrintColumn, onInternalReturnClick, onUpdateOrder }) => {
    const [searchText, setSearchText] = useState('');
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isCarouselOpen, setIsCarouselOpen] = useState(false);
    const [activeOrderForFiles, setActiveOrderForFiles] = useState<Order | null>(null);
    const [responsibleFilter, setResponsibleFilter] = useState<string>('all');

    // Extract unique responsibles for filters
    const responsibles = useMemo(() => {
        const unique = new Set<string>();
        orders.forEach(o => {
            if (o.sawyerName) unique.add(o.sawyerName);
            if (o.installerName) unique.add(o.installerName);
        });
        return Array.from(unique).sort();
    }, [orders]);

    const filteredOrders = useMemo(() => {
        let result = orders;

        // Text Search
        if ((searchText || '').trim()) {
            const term = searchText.toLowerCase();
            result = safeArray(result).filter(o =>
                (o?.customerName || '').toLowerCase().includes(term) ||
                (o?.protocolNumber || '').toLowerCase().includes(term) ||
                (o?.address && o.address.toLowerCase().includes(term)) ||
                (o?.phone && o.phone.includes(term))
            );
        }

        // Responsible Filter
        if (responsibleFilter !== 'all') {
            result = safeArray(result).filter(o => o.sawyerName === responsibleFilter || o.installerName === responsibleFilter);
        }

        return result;
    }, [orders, searchText, responsibleFilter]);

    const getOrdersByStatus = (status: Status) => {
        const filtered = safeArray(filteredOrders).filter((order) => order.status === status);
        if (status === 'aguardando_materia_prima' || status === 'em_producao') {
            return filtered.sort((a, b) => (a.position || 0) - (b.position || 0));
        }
        return filtered;
    };

    const metrics = useMemo(() => {
        const queue = safeArray(orders).filter(o => o.status === 'aguardando_materia_prima' || o.status === 'em_producao');
        const atRisk = safeArray(queue).filter((o, idx) => {
            const estDate = addDays(new Date(), Math.ceil((idx + 1) / 2));
            return ((() => { const d = safeParseISO(o.deadline); return d ? isAfter(estDate, d) : false; })());
        }).length;

        return {
            totalOrders: orders.length,
            queueSize: queue.length,
            atRiskCount: atRisk,
        };
    }, [orders]);

    const onDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;

        if (!destination) return;
        if (destination.droppableId === source.droppableId && destination.index === source.index) return;

        if (destination.droppableId === source.droppableId) {
            onOrderReorder?.(source.droppableId as Status, source.index, destination.index);
            return;
        }

        onOrderMove(draggableId, destination.droppableId as Status, destination.index);
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            {/* SUB-HEADER WITH FILTERS & METRICS */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                        <User className="h-4 w-4 text-slate-400" />
                        <select 
                            value={responsibleFilter}
                            onChange={(e) => setResponsibleFilter(e.target.value)}
                            className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-300 outline-none border-none p-0 pr-6 uppercase tracking-tight"
                        >
                            <option value="all">TODOS OS RESPONSÁVEIS</option>
                            {safeArray(responsibles).map(r => (
                                <option key={r} value={r}>{r.toUpperCase()}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <BarChart2 className="h-4 w-4 text-brand-emerald" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Carga na Fila:</span>
                        <span className="text-sm font-black text-slate-900 dark:text-white">{metrics.queueSize}</span>
                    </div>
                    {metrics.atRiskCount > 0 && (
                        <div className="flex items-center gap-2 px-2 py-1 bg-amber-50 dark:bg-amber-500/10 rounded-lg animate-pulse">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">{metrics.atRiskCount} EM RISCO</span>
                        </div>
                    )}
                </div>
            </div>

            {/* KANBAN BOARD */}
            <DragDropContext onDragEnd={onDragEnd}>
                <div className="flex h-full gap-6 overflow-x-auto pb-4 custom-scrollbar">
                    {safeArray(COLUMNS).map((column) => (
                        <div key={column.id} className="flex-shrink-0 w-80 flex flex-col">
                            <div className="flex items-center justify-between mb-4 px-2">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">
                                        {column.title}
                                    </h3>
                                    <span className="text-[10px] font-black text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full border border-slate-200 dark:border-white/5">
                                        {getOrdersByStatus(column.id).length}
                                    </span>
                                </div>
                                {onPrintColumn && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-slate-400 hover:text-brand-emerald hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all"
                                        title="Imprimir Coluna"
                                        onClick={() => onPrintColumn(column.id)}
                                    >
                                        <Printer className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>

                            <Droppable droppableId={column.id}>
                                {(provided, snapshot) => (
                                    <div className="relative flex-1 min-h-[400px] flex flex-col group/col">
                                        {/* Column Background */}
                                        <div className={cn(
                                            "absolute inset-0 rounded-[2rem] transition-all duration-300 border border-transparent",
                                            snapshot.isDraggingOver 
                                                ? "bg-brand-emerald/[0.03] dark:bg-brand-emerald/[0.05] border-brand-emerald/20 border-dashed" 
                                                : "bg-slate-50/50 dark:bg-[#0a0a0a]/40"
                                        )} />
                                        
                                        <div
                                            ref={provided.innerRef}
                                            {...provided.droppableProps}
                                            className="relative z-10 flex-1 p-3 space-y-4 h-full"
                                        >
                                            {getOrdersByStatus(column.id).map((order, index) => (
                                                <Draggable key={order.id} draggableId={order.id} index={index}>
                                                    {(provided, snapshot) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            {...provided.dragHandleProps}
                                                            style={provided.draggableProps.style}
                                                            className={cn(
                                                                "transition-transform",
                                                                snapshot.isDragging ? "z-50 ring-4 ring-brand-emerald/20 rounded-2xl rotate-2" : ""
                                                            )}
                                                        >
                                                            <OrderCard
                                                                order={order}
                                                                queueIndex={(column.id === 'aguardando_materia_prima' || column.id === 'em_producao') ? index + 1 : undefined}
                                                                onClick={onOrderClick}
                                                                onReturnClick={onOrderReturn}
                                                                onInternalReturnClick={onInternalReturnClick}
                                                                onUploadClick={(order) => {
                                                                    setActiveOrderForFiles(order);
                                                                    setIsUploadModalOpen(true);
                                                                }}
                                                                onViewAttachmentsClick={(order) => {
                                                                    setActiveOrderForFiles(order);
                                                                    setIsCarouselOpen(true);
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                </Draggable>
                                            ))}
                                            {provided.placeholder}
                                            {getOrdersByStatus(column.id).length === 0 && !snapshot.isDraggingOver && (
                                                <div className="h-full flex items-center justify-center py-20">
                                                    <div className="flex flex-col items-center gap-2 opacity-20">
                                                        <Package className="h-8 w-8 text-slate-400" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sem pedidos</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </Droppable>
                        </div>
                    ))}
                </div>
            </DragDropContext>

            {/* Modals */}
            <FileUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => {
                    setIsUploadModalOpen(false);
                    setActiveOrderForFiles(null);
                }}
                onSave={(urls) => {
                    if (activeOrderForFiles && onUpdateOrder) {
                        onUpdateOrder(activeOrderForFiles.id, { attachments: urls });
                    }
                }}
                currentAttachments={activeOrderForFiles?.attachments || []}
                title={`Arquivos: ${activeOrderForFiles?.customerName}`}
                description="Faça o upload de fotos da obra, medidas ou projeto."
            />

            <CarouselViewerModal
                isOpen={isCarouselOpen}
                onClose={() => {
                    setIsCarouselOpen(false);
                    setActiveOrderForFiles(null);
                }}
                images={activeOrderForFiles?.attachments || []}
                title={`Arquivos: ${activeOrderForFiles?.customerName}`}
            />
        </div>
    );
};
