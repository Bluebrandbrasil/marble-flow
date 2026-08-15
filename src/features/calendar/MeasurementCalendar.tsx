import { safeArray } from '../../lib/dataDiagnostics';
import React, { useEffect } from 'react';
import { normalizeScheduledDate, parseLocalDateOnly } from '../../lib/dateUtils';
import { useSearchParams } from 'react-router-dom';
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
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Measurement } from '../../types';
import { cn } from '../../lib/utils';
import { safeSplit } from '../../lib/dataDiagnostics';
import { calculateSearchScore, normalizeStr, HighlightText } from '../../lib/searchUtils';

import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Trash2, Plus, Clock, MapPin, X, Calendar as CalendarIcon } from 'lucide-react';

import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { DndContext, DragOverlay, useDroppable, useDraggable, closestCorners, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { useAuth } from '../../context/AuthContext';


interface MeasurementCalendarProps {
    measurements: Measurement[];

    onMeasurementClick: (measurement: Measurement) => void;
    onAddMeasurementForDate: (date: Date) => void;
    onDeleteMeasurement: (id: string, e: React.MouseEvent) => void;
    onUpdateMeasurementDate: (id: string, newDateString: string) => void;
    onFullscreenChange?: (isFullscreen: boolean) => void;
    quotes?: any[];
    navigate?: any;
}

export const MeasurementCalendar: React.FC<MeasurementCalendarProps> = ({
    measurements,
    onMeasurementClick,
    onAddMeasurementForDate,
    onDeleteMeasurement,
    onUpdateMeasurementDate,
    onFullscreenChange,
    quotes,
    navigate
}) => {
    const [searchText, setSearchText] = React.useState('');
    const [currentDate, setCurrentDate] = React.useState(new Date());
    const [isFullscreen, setIsFullscreen] = React.useState(false);
    const [measurementToDelete, setMeasurementToDelete] = React.useState<Measurement | null>(null);
    const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);
    const [isDrawerMinimized, setIsDrawerMinimized] = React.useState(false);
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const [searchParams] = useSearchParams();
    const [isAwaitingContractModalOpen, setIsAwaitingContractModalOpen] = React.useState(false);
    const { profile } = useAuth();

    useEffect(() => {
        const dateParam = searchParams.get('date');
        if (dateParam) {
            const date = new Date(`${dateParam}T12:00:00`);
            if (!isNaN(date.getTime())) {
                setCurrentDate(date);
                setSelectedDate(date);
            }
        }
    }, [searchParams]);

    const firstDayOfMonth = startOfMonth(currentDate);
    const lastDayOfMonth = endOfMonth(currentDate);
    const startDate = startOfWeek(firstDayOfMonth);
    const endDate = endOfWeek(lastDayOfMonth);

    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));

    const filteredMeasurements = React.useMemo(() => {
        if (!(searchText || '').trim()) return (measurements || []);
        const term = normalizeStr(String(searchText));

        return (measurements || []).map(m => {
            const mName = String(m?.customerName || '');
            const mAddress = String(m?.address || '');
            const mPhone = String(m?.phone || '');
            const mMaterial = String(m?.material || '');

            let maxScore = Math.max(
                calculateSearchScore(mName, term),
                calculateSearchScore(mAddress, term),
                calculateSearchScore(mPhone, term, true),
                calculateSearchScore(mMaterial, term)
            );

            if ((m?.groups || []).length > 0) {
                (m?.groups || []).forEach(g => {
                    maxScore = Math.max(
                        maxScore,
                        calculateSearchScore(String(g?.materialName || ''), term),
                        calculateSearchScore(String(g?.environmentName || ''), term)
                    );
                });
            }

            return { ...m, _score: maxScore };
        }).filter(m => Number(m?._score || 0) > 0);
    }, [measurements, searchText]);

    const normalizeStatus = (s: any) => {
        if (typeof s !== 'string') return '';
        return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/[-\s]+/g, '_');
    };

    const isCompletedStatus = (status: string) => {
        const s = normalizeStatus(status);
        return ['completed', 'concluida', 'finalizada', 'realizada', 'measurement_completed', 'medicao_realizada'].includes(s);
    };

    const isPendingStatus = (status: string) => {
        const s = normalizeStatus(status);
        return ['scheduled', 'agendada', 'aguardando', 'pending', 'pendente', 'aguardando_medicao', 'manual_sem_orcamento', 'sem_orcamento', 'cancelada', 'cancelled', 'deleted'].includes(s);
    };

    const measurementsAwaitingContract = React.useMemo(() => {
        return (measurements || []).filter(m => {
            if (isPendingStatus(m.status)) return false;
            if (!isCompletedStatus(m.status) && !m.completedAt) return false;

            // Check if it already has a contract
            if ((m as any).contractId || (m as any).contractStatus || (m as any).linkedContractId || (m as any).generatedContractId) return false;

            // Check quote status
            if (m.quoteId && quotes) {
                const quote = quotes.find(q => q.id === m.quoteId);
                if (quote) {
                    const qStatus = normalizeStatus(quote.status || quote.stage || '');
                    if (qStatus === 'em_contrato') return false;
                    if ((quote as any).contractId || (quote as any).linkedContractId || (quote as any).generatedContractId) return false;
                }
            }
            
            // Check Measurement quoteStatus or quoteStage
            const mQuoteStatus = normalizeStatus((m as any).quoteStatus || (m as any).quoteStage || '');
            if (mQuoteStatus === 'em_contrato') return false;

            return true;
        });
    }, [measurements, quotes]);

    const getMeasurementsForDay = (day: Date) => {
        return (filteredMeasurements || [])
            .filter(m => {
                const normalizedDate = normalizeScheduledDate(m?.scheduledDate);
                if (!normalizedDate) return false;
                
                const localCalendarDate = parseLocalDateOnly(normalizedDate);
                const isSame = isSameDay(localCalendarDate, day);
                return isSame;
            })
            .sort((a, b) => String(a?.scheduledTime || '00:00').localeCompare(String(b?.scheduledTime || '00:00')));
    };

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        if (!over || !active) return;

        // Extract only the date part (YYYY-MM-DD) from the ISO string id
        const newDate = String(over.id as string).split('T')[0];
        const measurement = measurements?.find(m => m.id === active.id);

        console.info(`[MeasurementCalendar] drag-drop fix version 2`);
        console.info(`[MeasurementCalendar] ANTES DO ARRASTE:`, {
            measurementId: measurement?.id,
            eventId: active.id,
            clientId: (measurement as any)?.clientId,
            companyId: (measurement as any)?.companyId,
            scheduledDate: measurement?.scheduledDate,
            scheduledTime: measurement?.scheduledTime,
            status: measurement?.status
        });

        console.info(`[MeasurementCalendar] NO MOMENTO DO DROP:`, {
            idRecebido: active.id,
            dataAnterior: measurement?.scheduledDate,
            novaData: newDate,
            newDateString: newDate,
            valorQueSeraSalvo: newDate
        });
        
        try {
            await onUpdateMeasurementDate(String(active.id as string), newDate);
        } catch (error) {
            window.alert('Não foi possível alterar a data da medição. O agendamento voltou para a data anterior.');
        }
    };

    const confirmDelete = () => {
        if (measurementToDelete) {
            onDeleteMeasurement(measurementToDelete.id, { stopPropagation: () => { } } as React.MouseEvent);
            setMeasurementToDelete(null);
        }
    };

    const selectedDayMeasurements = selectedDate ? getMeasurementsForDay(selectedDate) : [];

    return (
        <div className={cn(
            "flex flex-col bg-white overflow-hidden h-full border-none transition-all relative",
            isFullscreen ? "fixed inset-0 z-[100] m-0 rounded-none bg-white" : "rounded-3xl shadow-2xl"
        )}>

            {/* Clean Professional Header */}
            <div className="flex items-center justify-between px-8 py-3 shrink-0 bg-white border-b border-slate-200">
                <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 mb-0.5 opacity-80">Agenda Técnica</p>
                        <h2 className="text-2xl text-slate-950 font-black uppercase tracking-tighter leading-none tabular-nums">
                            {format(currentDate || new Date(), 'MMMM yyyy', { locale: ptBR })}
                        </h2>
                    </div>

                    <div 
                        onClick={() => setIsAwaitingContractModalOpen(true)}
                        className="flex flex-col bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl px-4 py-2 cursor-pointer transition-colors shrink-0"
                    >
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-amber-700">Aguardando Contrato</h3>
                        <div className="flex items-end gap-2 mt-0.5">
                            <span className="text-xl font-black text-amber-900 leading-none">{measurementsAwaitingContract.length}</span>
                            <span className="text-[9px] font-bold text-amber-600 mb-0.5 max-w-[120px] leading-tight">Medições concluídas aguardando contrato</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                        <Button variant="ghost" size="icon" onClick={prevMonth} className="h-7 w-7 rounded-lg hover:bg-white text-slate-600 hover:text-brand-rocha-primary transition-all">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={nextMonth} className="h-7 w-7 rounded-lg hover:bg-white text-slate-600 hover:text-brand-rocha-primary transition-all">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => onAddMeasurementForDate(new Date())} 
                        className="h-9 px-4 rounded-xl border-slate-200 bg-white text-slate-500 font-black text-[9px] uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2"
                    >
                        <Plus className="h-3.5 w-3.5 text-emerald-500" />
                        Novo Agendamento
                    </Button>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                            const newState = !isFullscreen;
                            setIsFullscreen(newState);
                            if (typeof onFullscreenChange === 'function') {
                                onFullscreenChange(newState);
                            }
                        }} 
                        className="h-9 px-4 rounded-xl border-slate-200 bg-white text-slate-500 font-black text-[9px] uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all"
                    >
                        {isFullscreen ? <Minimize2 className="h-3.5 w-3.5 mr-2 text-brand-rocha-primary" /> : <Maximize2 className="h-3.5 w-3.5 mr-2" />}
                        {isFullscreen ? "Minimizar" : "Tela Cheia"}
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden relative">
                {/* CALENDAR MAINProtagonist GRID */}
                <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
                    <div className="grid grid-cols-7 border-b border-slate-200 shrink-0 bg-slate-50/80">
                        {safeArray(weekDays).map(day => (
                            <div key={day} className="py-2 text-center text-[9px] font-black uppercase tracking-[0.3em] text-slate-700">
                                {day}
                            </div>
                        ))}
                    </div>

                    <DndContext
                        sensors={sensors}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        collisionDetection={closestCorners}
                    >
                        <div className="flex-1 grid grid-cols-7 h-full bg-slate-100/50 gap-px">
                            {(days || []).map((day) => {
                                const dayMeasurements = getMeasurementsForDay(day);
                                const isCurrentMonth = isSameMonth(day, currentDate || new Date());
                                const today = isToday(day);
                                const isSelected = selectedDate && isSameDay(day, selectedDate);
                                const dateId = day.toISOString();

                                return (
                                    <DroppableDay
                                        key={dateId}
                                        dateId={dateId}
                                        day={day}
                                        isCurrentMonth={isCurrentMonth}
                                        today={today}
                                        isSelected={isSelected}
                                        onAddMeasurementForDate={() => onAddMeasurementForDate(day)}
                                        onClick={() => {
                                            setSelectedDate(day);
                                            setIsDrawerMinimized(false);
                                        }}
                                    >
                                        <div className="flex flex-col gap-1.5 flex-1 mt-1">
                                            {(dayMeasurements || []).map((measurement) => (
                                                <DraggableMeasurement
                                                    key={measurement.id}
                                                    measurement={measurement}
                                                    onMeasurementClick={() => onMeasurementClick(measurement)}
                                                    onDeleteMeasurement={() => setMeasurementToDelete(measurement)}
                                                    isOverlay={false}
                                                />
                                            ))}
                                        </div>
                                    </DroppableDay>
                                );
                            })}
                        </div>

                        {/* THE DND MIRROR */}
                        <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={null}>
                            {activeId ? (
                                (() => {
                                    const activeMeasurement = (measurements || []).find(m => m.id === activeId);
                                    if (!activeMeasurement) return null;
                                    return (
                                        <MeasurementCard
                                            measurement={activeMeasurement}
                                            onMeasurementClick={() => { }}
                                            onDeleteMeasurement={() => { }}
                                            isOverlay={true}
                                            className="w-full min-w-[180px] shadow-xl"
                                        />
                                    );
                                })()
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                </div>

                {/* DRAWER / SIDE OVERLAY (Appears only when day is selected) */}
                {selectedDate && !isDrawerMinimized && (
                    <div className="absolute inset-y-0 right-0 w-80 lg:w-[460px] bg-white border-l border-slate-100 shadow-2xl z-40 animate-in slide-in-from-right-full duration-300 flex flex-col">
                        <div className="p-8 border-b border-slate-50 shrink-0 flex justify-between items-center bg-slate-50/20">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 flex items-center gap-4 uppercase tracking-tighter tabular-nums leading-none">
                                    <div className="w-2 h-2 rounded-full bg-brand-rocha-primary" />
                                    {format(selectedDate || new Date(), "dd 'de' MMMM", { locale: ptBR })}
                                </h3>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mt-2 opacity-60">Atendimentos e Visitas Técnicas</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl text-slate-300 hover:text-slate-900 hover:bg-slate-100 transition-all" onClick={() => setIsDrawerMinimized(true)} title="Minimizar">
                                    <ChevronRight className="w-5 h-5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-10 w-10 rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all" onClick={() => setSelectedDate(null)} title="Fechar">
                                    <X className="w-5 h-5" />
                                </Button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-1 py-8 px-8 space-y-6 custom-scrollbar">
                            {selectedDayMeasurements.length === 0 ? (
                                <div className="text-center py-20 flex flex-col items-center justify-center bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-100 m-8">
                                    <div className="h-20 w-20 bg-white rounded-[2rem] shadow-xl flex items-center justify-center mb-8">
                                        <CalendarIcon className="w-10 h-10 text-slate-200" />
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Folha de Agenda Vazia</p>
                                    <Button onClick={() => onAddMeasurementForDate(selectedDate)} className="mt-8 h-12 px-10 bg-slate-900 hover:bg-black text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-slate-200">
                                        Novo Agendamento
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {(selectedDayMeasurements || []).map((m) => (
                                        <div key={m.id} className="group bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:border-violet-100 hover:shadow-xl hover:shadow-violet-500/5 transition-all cursor-pointer" onClick={() => onMeasurementClick(m)}>
                                            <div className="flex justify-between items-start mb-5">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60 flex items-center gap-2">
                                                        <Clock className="w-3.5 h-3.5" /> {String(m?.scheduledTime || '--:--')}
                                                    </span>
                                                    <h4 className="text-lg font-black text-slate-900 uppercase tracking-tighter mt-1 mb-1">
                                                        <HighlightText text={String(m?.customerName || '')} term={searchText} />
                                                    </h4>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        <Badge className="w-fit bg-slate-900 text-white border-none font-black text-[8px] tracking-[0.2em] uppercase px-2">
                                                            Visita Técnica
                                                        </Badge>
                                                        {!m.quoteId && (
                                                            <Badge className="w-fit bg-amber-500 text-white border-none font-black text-[8px] tracking-[0.2em] uppercase px-2">
                                                                Sem orçamento vinculado
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const companyDisplayName = (profile?.company as any)?.whatsappDisplayName?.trim() ||
                                                            (profile?.company as any)?.tradeName?.trim() ||
                                                            (profile?.company as any)?.fantasyName?.trim() ||
                                                            profile?.company?.name?.trim() ||
                                                            'Gledstone | Mármore e Planejados';
                                                        const message = `Olá ${safeSplit(String(m?.customerName || 'Cliente'), ' ', 'calendar', 'customerName')[0]}, tudo bem? Sou o medidor da ${companyDisplayName} e estou entrando em contato sobre a medição agendada.`;
                                                        const phone = String(m?.phone || '').replace(/\D/g, '');
                                                        window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank');
                                                    }}
                                                    className="h-12 w-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20 active:scale-95"
                                                >
                                                    <WhatsAppIcon className="h-5 w-5" />
                                                </button>
                                            </div>


                                            <div className="flex items-center gap-3 text-[11px] font-black text-slate-400 uppercase tracking-tight group-hover:text-slate-600 transition-colors pt-4 border-t border-slate-50">
                                                <MapPin className="w-3.5 h-3.5 shrink-0 text-brand-rocha-primary" />
                                                <span className="truncate">
                                                    <HighlightText text={String(m?.address || '')} term={searchText} />
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* MINIMIZED STATE (Compact Tab) */}
                {selectedDate && isDrawerMinimized && (
                    <button 
                        onClick={() => setIsDrawerMinimized(false)}
                        className="absolute right-0 top-1/2 -translate-y-1/2 bg-white border border-r-0 border-brand-rocha-border shadow-[0_0_20px_rgba(0,0,0,0.1)] py-5 px-3 rounded-l-2xl z-40 hover:bg-slate-50 transition-all flex flex-col items-center gap-3 group animate-in slide-in-from-right-8 duration-300"
                        title="Expandir Atendimentos"
                    >
                        <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-brand-rocha-primary transition-colors" />
                        <span className="text-[10px] font-black text-slate-900 rotate-180 uppercase tracking-[0.2em]" style={{ writingMode: 'vertical-rl' }}>
                            {format(selectedDate || new Date(), "dd 'de' MMM", { locale: ptBR })} 
                            <span className="text-brand-rocha-primary ml-1 opacity-80">({(selectedDayMeasurements || []).length})</span>
                        </span>
                    </button>
                )}
            </div>

            {/* Delete Confirmation Modal inline */}
            {measurementToDelete && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-sm p-8 rounded-2xl border border-brand-rocha-border shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-lg font-bold text-slate-900 tracking-tight mb-2">Excluir Agendamento</h3>
                        <p className="text-xs text-slate-500 leading-relaxed mb-8">
                            Tem certeza que deseja remover o agendamento de <strong>{String(measurementToDelete?.customerName || '')}</strong>? Esta ação não pode ser desfeita.
                        </p>
                        <div className="flex gap-3">
                            <Button variant="ghost" className="flex-1 h-11 rounded-xl font-bold text-xs" onClick={() => setMeasurementToDelete(null)}>Cancelar</Button>
                            <Button variant="destructive" className="flex-1 h-11 rounded-xl bg-rose-500 hover:bg-rose-600 font-bold text-xs" onClick={confirmDelete}>Excluir</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// -- DND Kit Components Helpers --

function DroppableDay({ dateId, day, isCurrentMonth, today, isSelected, onAddMeasurementForDate, onClick, children }: any) {
    const { isOver, setNodeRef } = useDroppable({ id: dateId });

    return (
            <div
            ref={setNodeRef}
            onClick={onClick}
            className={cn(
                "min-h-[110px] p-2 relative group transition-all flex flex-col cursor-pointer bg-white border-r border-b border-slate-100",
                !isCurrentMonth && "opacity-10 pointer-events-none",
                today && "bg-violet-50/30",
                isSelected && "ring-2 ring-inset ring-brand-rocha-primary z-10 bg-violet-50",
                isOver && "bg-emerald-50/30 ring-2 ring-dashed ring-emerald-500/40 z-10 scale-[1.01] shadow-sm",
            )}
        >
            <div className="flex items-center justify-between mb-2 shrink-0">
                <span className={cn(
                    "text-[11px] font-black w-7 h-7 flex items-center justify-center transition-all rounded-lg",
                    today ? "bg-slate-950 text-white shadow-lg" :
                        isSelected ? "text-slate-950 bg-slate-200 ring-1 ring-slate-300" :
                            "text-slate-900"
                )}>
                    {format(day || new Date(), 'd')}
                </span>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onAddMeasurementForDate();
                    }}
                    className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center bg-slate-900 text-white rounded-lg transition-all active:scale-90"
                    title="Novo"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-1">
                {children}
                {isOver && (
                    <div className="border border-dashed border-emerald-500/30 rounded-lg p-2 bg-emerald-500/5 text-[9px] text-emerald-600 font-black uppercase tracking-widest text-center animate-pulse py-3 mt-1.5 transition-all">
                        Soltar Aqui
                    </div>
                )}
            </div>
        </div>
    );
}

function MeasurementCard({ 
    measurement, 
    isOverlay, 
    isDragging, 
    onMeasurementClick, 
    onDeleteMeasurement, 
    providedRef, 
    style, 
    className,
    attributes,
    listeners
}: any) {
    return (
        <div
            ref={providedRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={(e) => {
                e.stopPropagation();
                onMeasurementClick();
            }}
            className={cn(
                "group/item relative p-2.5 rounded-xl border border-slate-200 bg-white transition-all flex flex-col gap-1 cursor-pointer",
                isDragging && !isOverlay && "opacity-20",
                isOverlay && "scale-105 shadow-2xl ring-2 ring-slate-950 z-[9999] opacity-100 bg-white",
                !isOverlay && !isDragging && "cursor-pointer hover:border-slate-400 hover:shadow-md",
                measurement.status === 'completed' && "opacity-40 grayscale",
                className
            )}
        >
            <div className="flex items-center justify-between gap-1 overflow-hidden">
                <span className="text-[11px] font-black text-slate-950 truncate uppercase tracking-tight">
                    {String(measurement?.customerName || '')}
                </span>
                {!isOverlay && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDeleteMeasurement();
                        }}
                        className="opacity-0 group-hover/item:opacity-100 p-0.5 text-slate-400 hover:text-rose-500 transition-all"
                    >
                        <Trash2 className="w-2.5 h-2.5" />
                    </button>
                )}
            </div>
            
            <div className="text-[10px] font-black text-slate-600 flex items-center gap-1.5">
                                                <Clock className="w-3 h-3 text-slate-400" />
                                                {String(measurement?.scheduledTime || '--:--')}
                                            </div>
                                            {!measurement.quoteId && (
                                                <div className="text-[8px] font-black text-amber-600 uppercase tracking-tight mt-0.5">
                                                    Sem orçamento vinculado
                                                </div>
                                            )}
        </div>
    );
}

function DraggableMeasurement({ measurement, onMeasurementClick, onDeleteMeasurement }: any) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: measurement.id });
    const style = { transform: CSS.Translate.toString(transform), zIndex: isDragging ? 50 : undefined };

    return (
        <MeasurementCard 
            measurement={measurement}
            providedRef={setNodeRef}
            style={style}
            isDragging={isDragging}
            onMeasurementClick={onMeasurementClick}
            onDeleteMeasurement={onDeleteMeasurement}
            attributes={attributes}
            listeners={listeners}
        />
    )
}
