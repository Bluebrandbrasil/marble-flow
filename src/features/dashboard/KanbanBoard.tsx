import React from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import type { Order, Status } from '../../types';
import { COLUMNS } from '../../data/mockData';
import { OrderCard } from './OrderCard';
import { Printer } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { FileUploadModal } from '../../components/ui/FileUploadModal';
import { CarouselViewerModal } from '../../components/ui/CarouselViewerModal';

interface KanbanBoardProps {
    orders: Order[];
    globalSearchText?: string;
    onOrderClick: (order: Order) => void;
    onOrderMove: (orderId: string, newStatus: Status, newIndex?: number) => void;
    onOrderReorder?: (status: Status, startIndex: number, endIndex: number) => void;
    onOrderReturn?: (order: Order) => void;
    onInternalReturnClick?: (order: Order) => void;
    onPrintColumn?: (columnId: Status) => void;
    onUpdateOrder?: (orderId: string, updates: Partial<Order>) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ orders, globalSearchText = '', onOrderClick, onOrderMove, onOrderReorder, onOrderReturn, onPrintColumn, onInternalReturnClick, onUpdateOrder }) => {
    const [isUploadModalOpen, setIsUploadModalOpen] = React.useState(false);
    const [isCarouselOpen, setIsCarouselOpen] = React.useState(false);
    const [activeOrderForFiles, setActiveOrderForFiles] = React.useState<Order | null>(null);

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

    const getOrdersByStatus = (status: Status) => {
        return filteredOrders.filter((order) => order.status === status);
    };

    const onDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;

        if (!destination) {
            return;
        }

        if (
            destination.droppableId === source.droppableId &&
            destination.index === source.index
        ) {
            return;
        }

        if (destination.droppableId === source.droppableId) {
            onOrderReorder?.(source.droppableId as Status, source.index, destination.index);
            return;
        }

        onOrderMove(draggableId, destination.droppableId as Status, destination.index);
    };

    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex h-full gap-6 overflow-x-auto pb-4">
                {COLUMNS.map((column) => (
                    <div key={column.id} className="flex-shrink-0 w-80 flex flex-col">
                        <div className="flex items-center justify-between mb-3 px-1">
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-slate-700 dark:text-slate-200">
                                    {column.title}
                                </h3>
                                <span className="text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                                    {getOrdersByStatus(column.id).length}
                                </span>
                            </div>
                            {onPrintColumn && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    title="Imprimir Fichas da Coluna"
                                    onClick={() => onPrintColumn(column.id)}
                                >
                                    <Printer className="h-4 w-4" />
                                </Button>
                            )}
                        </div>

                        <Droppable droppableId={column.id}>
                            {(provided, snapshot) => (
                                <div className="relative flex-1 min-h-[200px] flex flex-col">
                                    <div className={`absolute inset-0 glass-panel rounded-3xl pointer-events-none transition-all duration-300 border border-transparent ${snapshot.isDraggingOver
                                        ? 'bg-brand-emerald/10 dark:bg-brand-emerald/20 border-brand-emerald/50 border-dashed shadow-inner'
                                        : 'hover:border-white/20 dark:hover:border-white/5'
                                        }`}
                                    />
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className="relative z-10 flex-1 p-3 space-y-3 h-full"
                                    >
                                        {getOrdersByStatus(column.id).map((order, index) => (
                                            <Draggable key={order.id} draggableId={order.id} index={index}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        {...provided.dragHandleProps}
                                                        style={{
                                                            ...provided.draggableProps.style,
                                                            ...(snapshot.isDragging
                                                                ? { zIndex: 9999, filter: 'drop-shadow(0 25px 25px rgb(0 0 0 / 0.15))' }
                                                                : {}
                                                            )
                                                        }}
                                                        className={snapshot.isDragging ? 'rotate-1' : ''}
                                                    >
                                                        <OrderCard
                                                            order={order}
                                                            queueIndex={column.id === 'production_queue' ? index + 1 : undefined}
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
                                            <div className="h-full flex items-center justify-center text-slate-400 text-sm py-8">
                                                Vazio
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </Droppable>
                    </div>
                ))}
            </div>

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
        </DragDropContext >
    );
};
