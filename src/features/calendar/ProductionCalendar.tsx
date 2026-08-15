import React from 'react';
import {
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    format,
    isSameMonth,
    isSameDay,
    isToday
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Order } from '../../types';
import { cn } from '../../lib/utils';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Trash2, Plus, TrendingUp, AlertTriangle, PackageSearch } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

interface ProductionCalendarProps {
    orders: Order[];
    globalSearchText?: string;
    onOrderClick: (order: Order) => void;
    onOrderReschedule: (orderId: string, newDate: string) => void;
    onOrderDelete: (orderId: string) => void;
    onAddOrderForDate?: (date: Date) => void;
}

export const ProductionCalendar: React.FC<ProductionCalendarProps> = ({ orders, globalSearchText = '', onOrderClick, onOrderReschedule, onOrderDelete, onAddOrderForDate }) => {
    const [currentDate, setCurrentDate] = React.useState(new Date());
    const [isFullscreen, setIsFullscreen] = React.useState(false);
    const [orderToDelete, setOrderToDelete] = React.useState<Order | null>(null);

    const firstDayOfMonth = startOfMonth(currentDate);
    const lastDayOfMonth = endOfMonth(currentDate);
    const startDate = startOfWeek(firstDayOfMonth);
    const endDate = endOfWeek(lastDayOfMonth);

    const days = eachDayOfInterval({ start: startDate, end: endDate });

    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const filteredOrders = React.useMemo(() => {
        if (!globalSearchText.trim()) return orders;
        const term = globalSearchText.toLowerCase();
        return orders.filter(o =>
            o.customerName.toLowerCase().includes(term) ||
            o.protocolNumber.toLowerCase().includes(term) ||
            o.address.toLowerCase().includes(term) ||
            (o.phone && o.phone.includes(term))
        );
    }, [orders, globalSearchText]);

    const getOrdersForDay = (day: Date) => {
        return filteredOrders.filter(order => isSameDay(new Date(order.deadline), day));
    };

    const getPriorityColor = (priority: Order['priority'], isReturn?: boolean) => {
        if (isReturn) {
            return 'bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-950/50 dark:border-orange-800 dark:text-orange-300 font-bold';
        }
        switch (priority) {
            case 'high':
                return 'bg-red-100 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300';
            case 'medium':
                return 'bg-amber-100 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-300';
            case 'low':
            default:
                return 'bg-slate-100 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300';
        }
    };

    const handleDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;

        if (!destination) return;

        if (
            destination.droppableId === source.droppableId &&
            destination.index === source.index
        ) {
            return;
        }

        // droppableId is the date string ISO format from the cell
        onOrderReschedule(draggableId, destination.droppableId);
    };

    const confirmDelete = () => {
        if (orderToDelete) {
            onOrderDelete(orderToDelete.id);
            setOrderToDelete(null);
        }
    };

    // Calculate Dashboard Metrics
    const currentMonthOrders = orders.filter(o => isSameMonth(new Date(o.deadline), currentDate));

    // -- Produção --
    const productionQueue = orders.filter(o => o.status === 'production_queue' || o.status === 'production');
    const finishedThisMonth = currentMonthOrders.filter(o => o.status === 'finished').length;

    const stoneCounts = productionQueue.reduce((acc, order) => {
        acc[order.material] = (acc[order.material] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const topStone = Object.entries(stoneCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Nenhuma';

    // -- Qualidade --
    const totalReturns = orders.filter(o => o.isReturn || o.isInternalReturn).length;

    const problemCounts = orders.filter(o => o.isInternalReturn && o.remakeItem).reduce((acc, order) => {
        if (order.remakeItem) acc[order.remakeItem] = (acc[order.remakeItem] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const topProblem = Object.entries(problemCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Nenhum';

    const returnStoneCounts = orders.filter(o => o.isReturn || o.isInternalReturn).reduce((acc, order) => {
        acc[order.material] = (acc[order.material] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const topReturnStone = Object.entries(returnStoneCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Nenhuma';

    // -- Logística --
    const awaitingInstall = orders.filter(o => o.status === 'ready_for_conference').length;

    return (
        <div className={cn(
            "flex flex-col bg-white dark:bg-slate-950 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 transition-all",
            isFullscreen ? "fixed inset-0 z-50 p-6 overflow-auto" : "h-full"
        )}>
            <div className="flex items-center justify-between p-4 border-b dark:border-slate-800">
                <h2 className="text-lg font-semibold capitalize">
                    {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
                </h2>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsFullscreen(!isFullscreen)} className="mr-2">
                        {isFullscreen ? (
                            <><Minimize2 className="h-4 w-4 mr-2" /> Minimizar</>
                        ) : (
                            <><Maximize2 className="h-4 w-4 mr-2" /> Expandir Calendário</>
                        )}
                    </Button>
                    <Button variant="outline" size="icon" onClick={prevMonth}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={nextMonth}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {isFullscreen && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 border-b dark:border-slate-800 animate-in slide-in-from-top-4">
                    {/* Produção */}
                    <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-start gap-4">
                        <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-lg">
                            <TrendingUp className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500">Produção Ativa</p>
                            <h3 className="text-xl font-bold mt-1 text-slate-900 dark:text-slate-100">{productionQueue.length} na fila</h3>
                            <p className="text-xs text-slate-500 mt-1">Pedra Principal: <strong>{topStone}</strong></p>
                            <p className="text-xs text-slate-500">Finalizados no Mês: {finishedThisMonth}</p>
                        </div>
                    </div>

                    {/* Qualidade */}
                    <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-start gap-4">
                        <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-lg">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-slate-500">Alerta de Qualidade</p>
                            <h3 className="text-xl font-bold mt-1 text-red-600">{totalReturns} Retornos</h3>
                            <div className="flex justify-between text-xs mt-1">
                                <span className="text-slate-500">Peça Crítica: <strong>{topProblem}</strong></span>
                            </div>
                            <p className="text-xs text-slate-500">Pedra Crítica: <strong>{topReturnStone}</strong></p>
                        </div>
                    </div>

                    {/* Logística */}
                    <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-start gap-4">
                        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg">
                            <PackageSearch className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500">Logística de Instalação</p>
                            <h3 className="text-xl font-bold mt-1 text-blue-600">{awaitingInstall} Aguardando</h3>
                            <p className="text-xs text-slate-500 mt-1">Status: Pronto para Conferência</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-7 border-b dark:border-slate-800">
                {weekDays.map((day) => (
                    <div key={day} className="p-2 text-center text-xs font-semibold uppercase text-slate-500">
                        {day}
                    </div>
                ))}
            </div>

            <DragDropContext onDragEnd={handleDragEnd}>
                <div className="flex-1 grid grid-cols-7 grid-rows-5 lg:grid-rows-6">
                    {days.map((day, dayIdx) => {
                        const dayOrders = getOrdersForDay(day);
                        const isCurrentMonth = isSameMonth(day, firstDayOfMonth);
                        const dropId = day.toISOString();

                        return (
                            <Droppable droppableId={dropId} key={dropId}>
                                {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className={cn(
                                            "min-h-[100px] border-b border-r p-2 dark:border-slate-800 relative group overflow-hidden transition-colors flex flex-col",
                                            !isCurrentMonth && "bg-slate-50/50 dark:bg-slate-900/50 text-slate-400",
                                            dayIdx % 7 === 0 && "border-l-0",
                                            snapshot.isDraggingOver && "bg-slate-100 dark:bg-slate-800/80"
                                        )}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <div className={cn(
                                                "text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full shrink-0",
                                                isToday(day) && "bg-blue-600 text-white"
                                            )}>
                                                {format(day, 'd')}
                                            </div>
                                            {onAddOrderForDate && (
                                                <button
                                                    onClick={() => onAddOrderForDate(day)}
                                                    className="opacity-0 group-hover:opacity-100 lg:opacity-100 lg:scale-0 lg:group-hover:scale-100 p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-all"
                                                    title="Adicionar ordem neste dia"
                                                >
                                                    <Plus className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>

                                        <div className="space-y-1 overflow-y-auto custom-scrollbar flex-1 min-h-[20px]">
                                            {dayOrders.map((order, idx) => (
                                                <Draggable key={order.id} draggableId={order.id} index={idx}>
                                                    {(dragProvided, dragSnapshot) => (
                                                        <div
                                                            ref={dragProvided.innerRef}
                                                            {...dragProvided.draggableProps}
                                                            {...dragProvided.dragHandleProps}
                                                            style={{ ...dragProvided.draggableProps.style }}
                                                            className={cn(
                                                                "group/card flex items-center justify-between text-xs p-1 rounded border cursor-pointer",
                                                                getPriorityColor(order.priority, order.isReturn),
                                                                dragSnapshot.isDragging && "opacity-90 shadow-lg scale-105 z-50 ring-2 ring-blue-500"
                                                            )}
                                                            title={`${order.customerName} - ${order.material}`}
                                                        >
                                                            <div
                                                                className="truncate flex-1"
                                                                onClick={() => onOrderClick(order)}
                                                            >
                                                                {order.isReturn && '⚠️ '}{order.customerName}
                                                            </div>
                                                            <button
                                                                className="opacity-0 group-hover/card:opacity-100 ml-1 p-0.5 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-opacity"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setOrderToDelete(order);
                                                                }}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </Draggable>
                                            ))}
                                            {provided.placeholder}
                                        </div>
                                    </div>
                                )}
                            </Droppable>
                        );
                    })}
                </div>
            </DragDropContext>

            {/* Confirm Delete Modal */}
            <Modal
                isOpen={!!orderToDelete}
                onClose={() => setOrderToDelete(null)}
                title="Excluir Ordem"
            >
                <div className="space-y-4">
                    <p className="text-slate-700 dark:text-slate-300">
                        Tem certeza que deseja excluir a ordem de <strong>{orderToDelete?.customerName}</strong>?
                    </p>
                    <p className="text-sm text-red-600 dark:text-red-400">
                        Esta ação não pode ser desfeita.
                    </p>
                    <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-800">
                        <Button variant="ghost" onClick={() => setOrderToDelete(null)}>
                            Cancelar
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete}>
                            Excluir Permanentemente
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
