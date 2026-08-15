import { safeArray } from '../../lib/dataDiagnostics';
import { safeParseISO } from '../../lib/dateUtils';
import { useOutletContext } from 'react-router-dom';
import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, addDoc, updateDoc, doc, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import {
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    format,
    isSameMonth,
    isSameDay,
    isToday,
    parseISO
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Order } from '../../types';
import { cn } from '../../lib/utils';
import { 
    ChevronLeft, 
    ChevronRight, 
    Maximize2, 
    Minimize2, 
    Calendar as CalendarIcon,
    Lock,
    Unlock,
    Info,
    Phone,
    MapPin,
    User,
    Clipboard,
    CheckCircle,
    UserPlus,
    X,
    ExternalLink,
    Plus,
    Trash2,
    Eye,
    EyeOff,
    Pin,
    Sparkles,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useSettings } from '../../hooks/useSettings';
import { useStaffCatalog } from '../../hooks/useStaffCatalog';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { openWhatsAppFollowUp } from '../../utils/whatsappHelper';
import { SearchableSelect } from '../../components/ui/SearchableSelect';

interface ProductionCalendarProps {
    isFocusMode?: boolean;
    onTvModeChange?: (isTvMode: boolean) => void;
    orders: Order[];

    onOrderClick: (order: Order) => void;
    onOrderReschedule: (orderId: string, newDate: string) => void;
    onOrderDelete: (orderId: string) => void;
    onOrderUpdate?: (orderId: string, updates: Partial<Order>) => Promise<void>;
    onPrintColumn?: (status: Order['status']) => void; 
    onFullscreenChange?: (isFullscreen: boolean) => void;
}

export const ProductionCalendar: React.FC<ProductionCalendarProps> = ({ 
    orders, 
    onOrderClick, 
    onOrderReschedule, 
    onOrderDelete, 
    onOrderUpdate,
    onFullscreenChange 
}) => {
    const [searchText, setSearchText] = React.useState('');
    const { isFocusMode } = useOutletContext<any>() || {};
    const { profile } = useAuth();
    
    // Sticky Notes States
    const [notes, setNotes] = useState<any[]>([]);
    const [localNotes, setLocalNotes] = useState<any[]>([]);
    const [showNotes, setShowNotes] = useState(() => localStorage.getItem('calendar_show_notes') !== 'false');
    
    const [currentDate, setCurrentDate] = useState(new Date());
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // Quick Details State
    const [selectedQuickOrder, setSelectedQuickOrder] = useState<Order | null>(null);
    const [isQuickDetailsOpen, setIsQuickDetailsOpen] = useState(false);
    
    // Reschedule states
    const [pendingReschedule, setPendingReschedule] = useState<{
        orderId: string;
        order: Order;
        targetDate: string;
    } | null>(null);
    
    // Password states
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [typedPassword, setTypedPassword] = useState('');
    const [passwordError, setPasswordError] = useState(false);
    
    // Manual date reschedule inside modal
    const [isInlineDatePickerOpen, setIsInlineDatePickerOpen] = useState(false);
    const [manualTargetDate, setManualTargetDate] = useState('');
    const [quickDetailsPassword, setQuickDetailsPassword] = useState('');
    const [quickDetailsPasswordError, setQuickDetailsPasswordError] = useState(false);

    const { settings } = useSettings();
    const { staff } = useStaffCatalog();

    const installers = useMemo(() => 
        safeArray(staff).filter(s => s.role === 'instalador' && (s.active === undefined || s.active === true)), 
        [staff]
    );

    // Firestore listener for sticky notes
    useEffect(() => {
        if (!profile?.companyId) return;

        const q = query(
            collection(db, 'calendar_notes'),
            where('companyId', '==', profile.companyId),
            where('active', '==', true)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = safeArray(snapshot.docs).map(d => ({
                id: d.id,
                ...d.data()
            }));
            setNotes(data);
            setLocalNotes(data);
        }, (error) => {
            console.error("Erro ao escutar notas do calendário:", error);
        });

        return () => unsubscribe();
    }, [profile?.companyId]);

    // Sticky Notes Actions
    const handleAddNote = async () => {
        if (!profile?.companyId) return;
        try {
            const newNote = {
                companyId: profile.companyId,
                text: '',
                color: 'amarelo', // default yellow
                x: 100,
                y: 150,
                width: 220,
                height: 180,
                minimized: false,
                active: true,
                createdAt: new Date().toISOString(),
                createdBy: profile.uid || 'system',
                updatedAt: new Date().toISOString(),
                updatedBy: profile.uid || 'system'
            };
            await addDoc(collection(db, 'calendar_notes'), newNote);
        } catch (err) {
            console.error("Erro ao criar nota:", err);
        }
    };

    const handleUpdateNote = async (noteId: string, updates: any) => {
        try {
            const noteRef = doc(db, 'calendar_notes', noteId);
            const payload = {
                ...updates,
                updatedAt: new Date().toISOString(),
                updatedBy: profile?.uid || 'system'
            };
            await updateDoc(noteRef, payload);
        } catch (err) {
            console.error("Erro ao atualizar nota:", err);
        }
    };

    const handleDeleteNote = async (noteId: string) => {
        try {
            const noteRef = doc(db, 'calendar_notes', noteId);
            await updateDoc(noteRef, {
                active: false,
                deletedAt: new Date().toISOString(),
                deletedBy: profile?.uid || 'system',
                updatedAt: new Date().toISOString(),
                updatedBy: profile?.uid || 'system'
            });
        } catch (err) {
            console.error("Erro ao excluir nota:", err);
        }
    };

    // Dragging notes custom tracking
    const handleStartDrag = (e: React.MouseEvent, noteId: string) => {
        e.preventDefault();
        const note = localNotes.find(n => n.id === noteId);
        if (!note) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const initialX = note.x || 0;
        const initialY = note.y || 0;

        let lastX = initialX;
        let lastY = initialY;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            lastX = Math.max(0, initialX + dx);
            lastY = Math.max(0, initialY + dy);

            setLocalNotes(prev => prev.map(n => n.id === noteId ? { ...n, x: lastX, y: lastY } : n));
        };

        const handleMouseUp = async () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            await handleUpdateNote(noteId, { x: lastX, y: lastY });
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // Resizing notes custom tracking
    const handleStartResize = (e: React.MouseEvent, noteId: string) => {
        e.preventDefault();
        e.stopPropagation();
        const note = localNotes.find(n => n.id === noteId);
        if (!note) return;

        const startX = e.clientX;
        const startY = e.clientY;
        const initialW = note.width || 220;
        const initialH = note.height || 180;

        let lastW = initialW;
        let lastH = initialH;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            lastW = Math.max(160, initialW + dx);
            lastH = Math.max(120, initialH + dy);

            setLocalNotes(prev => prev.map(n => n.id === noteId ? { ...n, width: lastW, height: lastH } : n));
        };

        const handleMouseUp = async () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            await handleUpdateNote(noteId, { width: lastW, height: lastH });
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const toggleShowNotes = () => {
        const next = !showNotes;
        setShowNotes(next);
        localStorage.setItem('calendar_show_notes', String(next));
    };

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

    const filteredOrders = useMemo(() => {
        if (!(searchText || '').trim()) return (orders || []);
        const term = String(searchText || '').toLowerCase();
        return (orders || []).filter(o =>
            (o?.customerName || '').toLowerCase().includes(term) ||
            (o?.protocolNumber || '').toLowerCase().includes(term) ||
            (o?.address || '').toLowerCase().includes(term) ||
            (o?.phone && String(o.phone).includes(term))
        );
    }, [orders, searchText]);

    const getOrdersForDay = (day: Date) => {
        const result: Order[] = [];
        (filteredOrders || []).forEach(order => {
            const instDate = safeParseISO(order.installationDate || order.deliveryDate || order.scheduledDate || order.deadline);
            if (instDate && isSameDay(instDate, day)) {
                result.push(order);
            }
        });
        return result;
    };

    const getInstallationStatusInfo = (status?: string) => {
        switch (status) {
            case 'instalado':
                return { label: 'Instalado', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
            case 'problema':
                return { label: 'Problema', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
            case 'agendado':
                return { label: 'Agendado', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
            case 'aguardando_definicao':
            default:
                return { label: 'Aguardando Definição', bg: 'bg-slate-50 text-slate-500 border-slate-200' };
        }
    };

    const verifyPassword = (pass: string) => {
        const correctPassword = settings?.settings?.installationCalendarPassword || 
                                settings?.installationCalendarPassword || 
                                '1234';
        return pass === correctPassword;
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

        const realOrderId = draggableId;
        const order = orders.find(o => o.id === realOrderId);
        if (!order) return;

        setPendingReschedule({
            orderId: realOrderId,
            order,
            targetDate: destination.droppableId
        });
        setTypedPassword('');
        setPasswordError(false);
        setIsPasswordModalOpen(true);
    };

    const handleConfirmReschedule = () => {
        if (!pendingReschedule) return;

        if (verifyPassword(typedPassword)) {
            onOrderReschedule(pendingReschedule.orderId, pendingReschedule.targetDate);
            setIsPasswordModalOpen(false);
            setPendingReschedule(null);
        } else {
            setPasswordError(true);
        }
    };

    const handleQuickManualReschedule = () => {
        if (!selectedQuickOrder || !manualTargetDate) return;

        if (verifyPassword(quickDetailsPassword)) {
            onOrderReschedule(selectedQuickOrder.id, manualTargetDate);
            setSelectedQuickOrder(prev => prev ? { ...prev, installationDate: manualTargetDate, installationStatus: 'agendado' } : null);
            setIsInlineDatePickerOpen(false);
            setQuickDetailsPassword('');
            setQuickDetailsPasswordError(false);
        } else {
            setQuickDetailsPasswordError(true);
        }
    };

    const handleStatusChange = async (newStatus: string) => {
        if (!selectedQuickOrder || !onOrderUpdate) return;
        try {
            await onOrderUpdate(selectedQuickOrder.id, { installationStatus: newStatus as any });
            setSelectedQuickOrder(prev => prev ? { ...prev, installationStatus: newStatus as any } : null);
        } catch (e) {
            console.error(e);
        }
    };

    const handleInstallerChange = async (installerId: string) => {
        if (!selectedQuickOrder || !onOrderUpdate) return;
        const installer = installers.find(i => i.id === installerId);
        const installerName = installer ? installer.name : '';
        try {
            await onOrderUpdate(selectedQuickOrder.id, { installerId, installerName });
            setSelectedQuickOrder(prev => prev ? { ...prev, installerId, installerName } : null);
        } catch (e) {
            console.error(e);
        }
    };

    const handleCardClick = (order: Order) => {
        setSelectedQuickOrder(order);
        setManualTargetDate(order.installationDate || '');
        setQuickDetailsPassword('');
        setQuickDetailsPasswordError(false);
        setIsInlineDatePickerOpen(false);
        setIsQuickDetailsOpen(true);
    };

    const handleWhatsAppCalendar = (order: Order) => {
        if (!order.phone) return;
        const text = `Olá ${order.customerName || ''}, referente ao agendamento de instalação da O.S. #${order.protocolNumber || ''}...`;
        openWhatsAppFollowUp(order.phone, text);
    };

    const toggleFullscreen = () => {
        const newState = !isFullscreen;
        setIsFullscreen(newState);
        if (onFullscreenChange) onFullscreenChange(newState);
    };

    return (
        <div className={cn(
            "flex flex-col animate-in fade-in duration-500 mx-auto w-full relative", 
            isFullscreen ? "fixed inset-0 z-[9999] p-6 bg-slate-50 overscroll-none overflow-hidden h-screen w-screen pb-0" : "max-w-full h-full gap-8 pb-12"
        )}>
            {/* HEADER */}
            <div className={cn(
                "flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white rounded-3xl border border-slate-100 shadow-sm",
                isFullscreen ? "p-4" : "p-8"
            )}>
                {!isFullscreen && (
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-emerald-50 text-brand-emerald rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/5 border border-emerald-100">
                                <CalendarIcon className="h-6 w-6" />
                            </div>
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Agenda de Instalação</h1>
                        </div>
                        <div className="flex flex-col gap-1 ml-1">
                            <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.2em] opacity-70">Monitoramento logístico, designação de equipes e agendamentos</p>
                        </div>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                    <div className="flex items-center bg-slate-50 rounded-2xl p-1.5 border border-slate-100 shadow-inner">
                        <Button variant="ghost" size="icon" onClick={prevMonth} className="h-10 w-10 hover:bg-white text-slate-400 hover:text-slate-900 rounded-xl shadow-none transition-all">
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <span className={cn("font-black uppercase tracking-[0.2em] text-slate-900 text-center transition-all", isFullscreen ? "text-sm px-10 min-w-[240px]" : "text-[10px] px-6 min-w-[160px]")}>
                            {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
                        </span>
                        <Button variant="ghost" size="icon" onClick={nextMonth} className="h-10 w-10 hover:bg-white text-slate-400 hover:text-slate-900 rounded-xl shadow-none transition-all">
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </div>

                    <Button 
                        variant="outline" 
                        onClick={toggleShowNotes} 
                        className="h-12 px-6 border-slate-200 font-black uppercase text-[10px] tracking-widest text-slate-500 shadow-sm hover:bg-slate-50 rounded-2xl transition-all flex items-center"
                    >
                        {showNotes ? (
                            <><EyeOff className="h-4 w-4 mr-2" /> Ocultar Notas</>
                        ) : (
                            <><Eye className="h-4 w-4 mr-2" /> Mostrar Notas</>
                        )}
                    </Button>

                    <Button 
                        onClick={handleAddNote} 
                        className="h-12 px-6 bg-amber-500 hover:bg-amber-600 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all flex items-center shadow-lg shadow-amber-500/10 border-none"
                    >
                        <Plus className="h-4 w-4 mr-2" /> Nota
                    </Button>

                    <Button 
                        variant="outline" 
                        onClick={toggleFullscreen} 
                        className="h-12 px-6 border-slate-200 font-black uppercase text-[10px] tracking-widest text-slate-500 shadow-sm hover:bg-slate-50 rounded-2xl transition-all"
                    >
                        {isFullscreen ? (
                            <><Minimize2 className="h-4 w-4 mr-2 text-brand-emerald" /> Sair da Tela Cheia</>
                        ) : (
                            <><Maximize2 className="h-4 w-4 mr-2" /> Tela Cheia</>
                        )}
                    </Button>
                </div>
            </div>

            {/* LEGEND / STATUS SUMMARY */}
            (
                <div className="flex flex-wrap gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm justify-center">
                    {[
                        { id: 'aguardando_definicao', label: 'Aguardando Definição', color: 'bg-slate-400' },
                        { id: 'agendado', label: 'Agendado', color: 'bg-blue-500' },
                        { id: 'instalado', label: 'Instalado', color: 'bg-emerald-500' },
                        { id: 'problema', label: 'Problema', color: 'bg-rose-500' },
                    ].map(status => {
                        const count = safeArray(orders).filter(o => 
                            o.installationStatus === status.id || 
                            (status.id === 'aguardando_definicao' && !o.installationStatus)
                        ).length;
                        return (
                            <div key={status.id} className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 shadow-sm/5">
                                <div className={cn("w-2.5 h-2.5 rounded-full ring-4 ring-white shadow-sm", status.color)} />
                                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{status.label}</span>
                                <span className="text-xs font-black text-slate-900 ml-2 border-l border-slate-200 pl-2">{count}</span>
                            </div>
                        );
                    })}
                </div>
            )

            {/* CALENDAR BODY */}
            <div className={cn(
                "bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col min-h-0",
                isFullscreen ? "flex-1 border-none shadow-none rounded-none" : ""
            )}>
                <div className="bg-slate-50/30 px-8 py-5 border-b border-slate-100 flex items-center justify-between">
                    <h3 className={cn("font-black uppercase tracking-[0.3em] text-slate-400 flex items-center gap-3", isFullscreen ? "text-xs" : "text-[10px]")}>
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-emerald" />
                        Quadro Geral de Instalações
                    </h3>
                    {searchText && (
                        <div className="flex items-center gap-2 mb-4 bg-brand-rocha-primary/10 text-brand-rocha-primary px-3 py-2 rounded-lg text-xs font-bold w-fit">
                            Pesquisa: {searchText}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-7 bg-slate-50/50 border-b border-slate-100 shrink-0">
                    {safeArray(weekDays).map((day) => (
                        <div key={day} className={cn("py-4 text-center font-black uppercase tracking-[0.2em] text-slate-400 transition-all", isFullscreen ? "text-sm text-slate-600" : "text-[10px]")}>
                            {day}
                        </div>
                    ))}
                </div>

                <DragDropContext onDragEnd={handleDragEnd}>
                    <div className="flex-1 grid grid-cols-7 overflow-y-auto no-scrollbar">
                        {safeArray(days).map((day, dayIdx) => {
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
                                                isFullscreen ? "min-h-[160px]" : "min-h-[130px]",
                                                "border-b border-r p-3 relative group overflow-hidden transition-all flex flex-col flex-1 cursor-default",
                                                !isCurrentMonth ? "bg-slate-50/40 text-slate-300" : "bg-white",
                                                dayIdx % 7 === 0 && "border-l-0",
                                                snapshot.isDraggingOver && "bg-emerald-50/40 ring-2 ring-dashed ring-brand-emerald/40 z-10 scale-[1.01] shadow-sm"
                                            )}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div className={cn(
                                                    "font-black flex items-center justify-center rounded-xl transition-all tabular-nums", 
                                                    isFullscreen ? "w-10 h-10 text-base" : "w-7 h-7 text-[11px]",
                                                    isToday(day) 
                                                        ? "bg-slate-900 text-white shadow-xl" 
                                                        : isCurrentMonth ? "text-slate-900" : "text-slate-200"
                                                )}>
                                                    {format(day, 'd')}
                                                </div>
                                            </div>

                                            <div className="space-y-1.5 overflow-y-auto no-scrollbar flex-1 min-h-[30px]">
                                                {safeArray(dayOrders).map((order, idx) => (
                                                     <Draggable key={order.id} draggableId={order.id} index={idx}>
                                                         {(dragProvided, dragSnapshot) => (
                                                             <div
                                                                 ref={dragProvided.innerRef}
                                                                 {...dragProvided.draggableProps}
                                                                 {...dragProvided.dragHandleProps}
                                                                 style={{ ...dragProvided.draggableProps.style }}
                                                                 onClick={() => handleCardClick(order)}
                                                                 className={cn(
                                                                     "group/card flex flex-col p-2.5 rounded-lg border-l-4 shadow-sm transition-all cursor-pointer bg-white border border-slate-100/80 hover:shadow-md hover:scale-[1.02]",
                                                                     dragSnapshot.isDragging && "opacity-90 shadow-2xl scale-105 z-50 ring-2 ring-brand-emerald",
                                                                     order.installationStatus === 'instalado' ? "border-l-emerald-500" :
                                                                     order.installationStatus === 'problema' ? "border-l-rose-500" :
                                                                     order.installationStatus === 'agendado' ? "border-l-blue-500" :
                                                                     "border-l-slate-400"
                                                                 )}
                                                             >
                                                                 <div className="font-black text-[10px] text-slate-900 uppercase truncate">
                                                                     {order.customerName}
                                                                 </div>
                                                                 <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1 leading-none">
                                                                     O.S. #{order.protocolNumber}
                                                                 </div>
                                                                 
                                                                 <div className="flex flex-wrap items-center justify-between gap-1.5 mt-2">
                                                                     <span className={cn(
                                                                         "px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider border", 
                                                                         getInstallationStatusInfo(order.installationStatus).bg
                                                                     )}>
                                                                         {getInstallationStatusInfo(order.installationStatus).label}
                                                                     </span>
                                                                     {order.installerName && (
                                                                         <span className="text-[7.5px] font-black text-slate-500 bg-slate-50 border border-slate-100 px-1 py-0.5 rounded truncate max-w-[85px] uppercase">
                                                                             👷 {order.installerName.split(' ')[0]}
                                                                         </span>
                                                                     )}
                                                                 </div>
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
            </div>

            {/* Drag and Drop Password Dialog */}
            <Modal
                isOpen={isPasswordModalOpen}
                onClose={() => { setIsPasswordModalOpen(false); setPendingReschedule(null); }}
                title="🔐 Autorização Requerida"
                className="max-w-md"
            >
                <div className="space-y-6">
                    {pendingReschedule && (
                        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 p-4 rounded-xl flex gap-3">
                            <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-amber-900 dark:text-amber-100 uppercase tracking-tight">Alteração de Agendamento</p>
                                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mt-1">
                                    Deseja alterar a data de instalação de <strong>{pendingReschedule.order.customerName}</strong> para o dia <strong>{format(parseISO(pendingReschedule.targetDate.split('T')[0]), 'dd/MM/yyyy')}</strong>?
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-500">Senha Administrativa</label>
                        <input 
                            type="password"
                            value={typedPassword}
                            onChange={(e) => { setTypedPassword(e.target.value); setPasswordError(false); }}
                            placeholder="Digite a senha..."
                            className={cn(
                                "flex h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 font-bold",
                                passwordError && "border-rose-500 focus:ring-rose-500"
                            )}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmReschedule(); }}
                        />
                        {passwordError && (
                            <p className="text-[10px] text-rose-500 font-bold uppercase tracking-wider mt-1">Senha inválida ou incorreta.</p>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-800">
                        <Button variant="ghost" onClick={() => { setIsPasswordModalOpen(false); setPendingReschedule(null); }} className="font-bold uppercase text-xs tracking-wider">
                            Cancelar
                        </Button>
                        <Button onClick={handleConfirmReschedule} className="bg-slate-900 text-white font-black uppercase text-xs tracking-widest rounded-xl h-12 px-6">
                            Confirmar Alteração
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Quick Details Sidebar/Modal */}
            <Modal
                isOpen={isQuickDetailsOpen}
                onClose={() => setIsQuickDetailsOpen(false)}
                title="🔍 Detalhes da Instalação"
                className="max-w-lg"
            >
                {selectedQuickOrder && (
                    <div className="space-y-6">
                        <div className="border-b pb-4 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase">{selectedQuickOrder.customerName}</h3>
                                <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">O.S. #{selectedQuickOrder.protocolNumber}</p>
                            </div>
                            
                            {selectedQuickOrder.phone && (
                                <button 
                                    onClick={() => handleWhatsAppCalendar(selectedQuickOrder)}
                                    className="h-10 w-10 flex items-center justify-center bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl shadow-lg transition-transform active:scale-95 border-none"
                                    title="Enviar Mensagem WhatsApp"
                                >
                                    <WhatsAppIcon className="w-5 h-5 fill-white" />
                                </button>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="flex gap-3">
                                <Phone className="h-4.5 w-4.5 text-slate-400 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Telefone de Contato</p>
                                    <p className="text-sm font-bold text-slate-700 mt-1">{selectedQuickOrder.phone || 'Sem telefone'}</p>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <MapPin className="h-4.5 w-4.5 text-slate-400 mt-0.5 shrink-0" />
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Endereço de Entrega</p>
                                    <p className="text-sm font-medium text-slate-700 mt-1 leading-relaxed">{selectedQuickOrder.address || 'Sem endereço cadastrado'}</p>
                                </div>
                            </div>
                            
                            <hr className="border-slate-100" />

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                        <Info className="w-3.5 h-3.5" /> Status Instalação
                                    </label>
                                    <select
                                        value={selectedQuickOrder.installationStatus || 'aguardando_definicao'}
                                        onChange={(e) => handleStatusChange(e.target.value)}
                                        className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-black uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-slate-900"
                                    >
                                        <option value="aguardando_definicao">Aguardando Definição</option>
                                        <option value="agendado">Agendado</option>
                                        <option value="instalado">Instalado</option>
                                        <option value="problema">Problema</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5 font-bold text-slate-700">
                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                                        <User className="w-3.5 h-3.5" /> Instalador
                                    </label>
                                    <SearchableSelect
                                        value={selectedQuickOrder.installerId || ''}
                                        options={[
                                            { value: '', label: 'NÃO DESIGNADO' },
                                            ...safeArray(installers).map(i => ({
                                                value: i.id,
                                                label: i.name.toUpperCase(),
                                                description: 'Equipe de Instalação'
                                            }))
                                        ]}
                                        onChange={handleInstallerChange}
                                        placeholder="Selecione o instalador..."
                                    />
                                </div>
                            </div>

                            <hr className="border-slate-100" />

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Data de Instalação</p>
                                        <p className="text-sm font-black text-slate-800 mt-1">
                                            {selectedQuickOrder.installationDate 
                                                ? format(parseISO(selectedQuickOrder.installationDate), 'dd/MM/yyyy') 
                                                : 'NÃO DEFINIDA'}
                                        </p>
                                    </div>
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => setIsInlineDatePickerOpen(!isInlineDatePickerOpen)}
                                        className="font-black uppercase text-[9px] tracking-widest h-9 px-4 rounded-lg"
                                    >
                                        {isInlineDatePickerOpen ? 'Fechar' : 'Reagendar'}
                                    </Button>
                                </div>

                                {isInlineDatePickerOpen && (
                                    <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl space-y-4 animate-in slide-in-from-top-2 duration-200">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Nova Data</label>
                                                <input 
                                                    type="date"
                                                    value={manualTargetDate}
                                                    onChange={(e) => setManualTargetDate(e.target.value)}
                                                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Senha Admin</label>
                                                <input 
                                                    type="password"
                                                    value={quickDetailsPassword}
                                                    onChange={(e) => { setQuickDetailsPassword(e.target.value); setQuickDetailsPasswordError(false); }}
                                                    placeholder="Senha..."
                                                    className={cn(
                                                        "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold",
                                                        quickDetailsPasswordError && "border-rose-500"
                                                    )}
                                                />
                                            </div>
                                        </div>
                                        
                                        {quickDetailsPasswordError && (
                                            <p className="text-[9px] text-rose-500 font-bold uppercase tracking-wider leading-none">Senha incorreta.</p>
                                        )}

                                        <div className="flex justify-end gap-2">
                                            <Button 
                                                size="sm"
                                                onClick={() => setIsInlineDatePickerOpen(false)}
                                                className="bg-white border border-slate-200 text-slate-600 font-bold uppercase text-[9px] h-9 px-4 rounded-lg hover:bg-slate-100"
                                            >
                                                Cancelar
                                            </Button>
                                            <Button 
                                                size="sm"
                                                onClick={handleQuickManualReschedule}
                                                disabled={!manualTargetDate || !quickDetailsPassword}
                                                className="bg-slate-900 text-white font-black uppercase text-[9px] h-9 px-4 rounded-lg"
                                            >
                                                Salvar Reagendamento
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t dark:border-slate-800">
                            <Button 
                                onClick={() => {
                                    setIsQuickDetailsOpen(false);
                                    onOrderClick(selectedQuickOrder);
                                }}
                                variant="ghost"
                                className="font-black uppercase text-[10px] tracking-widest text-slate-500 hover:text-slate-900"
                            >
                                <ExternalLink className="w-3.5 h-3.5 mr-2" /> Ver O.S. Completa
                            </Button>
                            <Button onClick={() => setIsQuickDetailsOpen(false)} className="bg-slate-950 text-white font-black uppercase text-xs tracking-widest rounded-xl h-11 px-8">
                                Fechar
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* STICKY NOTES LAYER */}
            {showNotes && safeArray(localNotes).map((note) => {
                const colorSchemes: Record<string, { bg: string, border: string, text: string, titleBg: string }> = {
                    amarelo: { bg: 'bg-yellow-50/95', border: 'border-yellow-200', text: 'text-yellow-900', titleBg: 'bg-yellow-100/50' },
                    verde: { bg: 'bg-emerald-50/95', border: 'border-emerald-200', text: 'text-emerald-900', titleBg: 'bg-emerald-100/50' },
                    azul: { bg: 'bg-blue-50/95', border: 'border-blue-200', text: 'text-blue-900', titleBg: 'bg-blue-100/50' },
                    rosa: { bg: 'bg-rose-50/95', border: 'border-rose-200', text: 'text-rose-900', titleBg: 'bg-rose-100/50' },
                    laranja: { bg: 'bg-orange-50/95', border: 'border-orange-200', text: 'text-orange-900', titleBg: 'bg-orange-100/50' },
                    roxo: { bg: 'bg-purple-50/95', border: 'border-purple-200', text: 'text-purple-900', titleBg: 'bg-purple-100/50' },
                    cinza: { bg: 'bg-slate-50/95', border: 'border-slate-200', text: 'text-slate-900', titleBg: 'bg-slate-100/50' }
                };

                const scheme = colorSchemes[note.color] || colorSchemes.amarelo;

                return (
                    <div
                        key={note.id}
                        style={{
                            position: 'absolute',
                            left: `${note.x}px`,
                            top: `${note.y}px`,
                            width: note.minimized ? '220px' : `${note.width || 220}px`,
                            height: note.minimized ? '48px' : `${note.height || 180}px`,
                            zIndex: 100,
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                        className={cn(
                            "rounded-2xl border shadow-xl backdrop-blur-sm transition-shadow hover:shadow-2xl select-none overflow-hidden",
                            scheme.bg,
                            scheme.border
                        )}
                    >
                        {/* Header (Drag area) */}
                        <div
                            onMouseDown={(e) => handleStartDrag(e, note.id)}
                            className={cn(
                                "h-12 px-4 flex items-center justify-between border-b cursor-grab active:cursor-grabbing select-none shrink-0",
                                scheme.titleBg,
                                scheme.border
                            )}
                        >
                            <div className="flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 opacity-60" />
                                <span className="text-[9px] font-black uppercase tracking-wider opacity-60">Lembrete</span>
                            </div>
                            
                            <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
                                <button
                                    onClick={() => handleUpdateNote(note.id, { minimized: !note.minimized })}
                                    className="p-1 rounded hover:bg-black/5 opacity-60 hover:opacity-100 transition-colors"
                                >
                                    {note.minimized ? (
                                        <ChevronDown className="w-4 h-4" />
                                    ) : (
                                        <ChevronUp className="w-4 h-4" />
                                    )}
                                </button>
                                <button
                                    onClick={() => handleDeleteNote(note.id)}
                                    className="p-1 rounded hover:bg-rose-500/10 text-rose-700 opacity-60 hover:opacity-100 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Content Area */}
                        {!note.minimized && (
                            <>
                                <textarea
                                    value={note.text || ''}
                                    onChange={(e) => {
                                        setLocalNotes(prev => prev.map(n => n.id === note.id ? { ...n, text: e.target.value } : n));
                                    }}
                                    onBlur={(e) => handleUpdateNote(note.id, { text: e.target.value })}
                                    placeholder="Digite seu lembrete aqui..."
                                    className={cn(
                                        "flex-1 p-4 text-xs font-semibold bg-transparent border-none resize-none focus:outline-none focus:ring-0 placeholder:opacity-50",
                                        scheme.text
                                    )}
                                    onMouseDown={(e) => e.stopPropagation()}
                                />
                                
                                {/* Color Selector & Resize Handle */}
                                <div 
                                    className="h-10 px-4 border-t flex items-center justify-between shrink-0 select-none"
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <div className="flex gap-1.5 items-center">
                                        {Object.keys(colorSchemes).map((c) => (
                                            <button
                                                key={c}
                                                onClick={() => handleUpdateNote(note.id, { color: c })}
                                                className={cn(
                                                    "w-4 h-4 rounded-full border border-black/10 transition-transform hover:scale-115 active:scale-90",
                                                    c === 'amarelo' && 'bg-yellow-300',
                                                    c === 'verde' && 'bg-emerald-300',
                                                    c === 'azul' && 'bg-blue-300',
                                                    c === 'rosa' && 'bg-rose-300',
                                                    c === 'laranja' && 'bg-orange-300',
                                                    c === 'roxo' && 'bg-purple-300',
                                                    c === 'cinza' && 'bg-slate-400'
                                                )}
                                                title={c}
                                            />
                                        ))}
                                    </div>
                                    
                                    {/* Resize handle */}
                                    <div
                                        onMouseDown={(e) => handleStartResize(e, note.id)}
                                        className="w-4 h-4 cursor-se-resize flex items-end justify-end opacity-40 hover:opacity-100 transition-opacity"
                                    >
                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="stroke-current opacity-70">
                                            <line x1="1" y1="9" x2="9" y2="1" strokeWidth="1.5" strokeLinecap="round" />
                                            <line x1="4" y1="9" x2="9" y2="4" strokeWidth="1.5" strokeLinecap="round" />
                                            <line x1="7" y1="9" x2="9" y2="7" strokeWidth="1.5" strokeLinecap="round" />
                                        </svg>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
