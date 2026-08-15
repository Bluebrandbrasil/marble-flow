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
    isToday,
    parseISO,
    differenceInHours
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Measurement } from '../../types';
import { cn } from '../../lib/utils';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Trash2, Plus, PenTool, CheckCircle2, Clock, MapPin, X, MessageCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

interface MeasurementCalendarProps {
    measurements: Measurement[];
    globalSearchText?: string;
    onMeasurementClick: (measurement: Measurement) => void;
    onAddMeasurementForDate: (date: Date) => void;
    onDeleteMeasurement: (id: string, e: React.MouseEvent) => void;
    onUpdateMeasurementDate: (id: string, newDateString: string) => void;
}

export const MeasurementCalendar: React.FC<MeasurementCalendarProps> = ({
    measurements,
    globalSearchText = '',
    onMeasurementClick,
    onAddMeasurementForDate,
    onDeleteMeasurement,
    onUpdateMeasurementDate
}) => {
    const [currentDate, setCurrentDate] = React.useState(new Date());
    const [isFullscreen, setIsFullscreen] = React.useState(false);
    const [measurementToDelete, setMeasurementToDelete] = React.useState<Measurement | null>(null);
    const [selectedDate, setSelectedDate] = React.useState<Date | null>(new Date());

    const firstDayOfMonth = startOfMonth(currentDate);
    const lastDayOfMonth = endOfMonth(currentDate);
    const startDate = startOfWeek(firstDayOfMonth);
    const endDate = endOfWeek(lastDayOfMonth);

    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));

    const filteredMeasurements = React.useMemo(() => {
        if (!globalSearchText.trim()) return measurements;
        const term = globalSearchText.toLowerCase();
        return measurements.filter(m =>
            m.customerName.toLowerCase().includes(term) ||
            m.address.toLowerCase().includes(term) ||
            (m.material && m.material.toLowerCase().includes(term)) ||
            (m.phone && m.phone.includes(term))
        );
    }, [measurements, globalSearchText]);

    const getMeasurementsForDay = (day: Date) => {
        return filteredMeasurements
            .filter(m => isSameDay(new Date(m.scheduledDate), day))
            .sort((a, b) => (a.scheduledTime || '00:00').localeCompare(b.scheduledTime || '00:00'));
    };

    const handleDragEnd = (result: DropResult) => {
        const { destination, source, draggableId } = result;
        if (!destination) return;
        if (destination.droppableId === source.droppableId && destination.index === source.index) return;

        // droppableId is the ISO date string
        onUpdateMeasurementDate(draggableId, destination.droppableId);
    };

    const confirmDelete = () => {
        if (measurementToDelete) {
            onDeleteMeasurement(measurementToDelete.id, { stopPropagation: () => { } } as React.MouseEvent);
            setMeasurementToDelete(null);
        }
    };

    // Dashboard Metrics
    const currentMonthMeasurements = measurements.filter(m => isSameMonth(new Date(m.scheduledDate), currentDate));
    const totalMonth = currentMonthMeasurements.length;
    const completedMonth = currentMonthMeasurements.filter(m => m.status === 'completed').length;
    const conversionRate = totalMonth > 0 ? Math.round((completedMonth / totalMonth) * 100) : 0;

    const selectedDayMeasurements = selectedDate ? getMeasurementsForDay(selectedDate) : [];

    return (
        <div className={cn(
            "flex flex-col glass-panel rounded-2xl shadow-xl transition-all overflow-hidden",
            isFullscreen ? "fixed inset-0 z-50 p-4 md:p-6" : "h-full"
        )}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200/50 dark:border-white/10 shrink-0">
                <h2 className="text-xl font-bold capitalize flex items-center gap-2 text-slate-800 dark:text-slate-100">
                    <PenTool className="h-6 w-6 text-brand-emerald" />
                    {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
                </h2>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsFullscreen(!isFullscreen)} className="mr-2 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5">
                        {isFullscreen ? (
                            <><Minimize2 className="h-4 w-4 mr-2" /> Minimizar</>
                        ) : (
                            <><Maximize2 className="h-4 w-4 mr-2" /> Expandir Calendário</>
                        )}
                    </Button>
                    <Button variant="outline" size="icon" onClick={prevMonth} className="dark:border-white/10 dark:hover:bg-white/5">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={nextMonth} className="dark:border-white/10 dark:hover:bg-white/5">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {isFullscreen && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border-b border-slate-200/50 dark:border-white/10 shrink-0">
                    <div className="glass-card flex items-center gap-4 p-4 rounded-xl border border-slate-200/50 dark:border-white/5">
                        <div className="p-3 bg-brand-emerald/10 text-brand-emerald rounded-xl dark:bg-brand-emerald/20">
                            <PenTool className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500 font-medium dark:text-slate-400">Medições no Mês</p>
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalMonth}</p>
                        </div>
                    </div>

                    <div className="glass-card flex items-center gap-4 p-4 rounded-xl border border-slate-200/50 dark:border-white/5">
                        <div className="p-3 bg-brand-neon/10 text-brand-neon rounded-xl dark:bg-brand-neon/20">
                            <CheckCircle2 className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500 font-medium dark:text-slate-400">Conversão (Mês)</p>
                            <div className="flex items-baseline gap-2">
                                <p className="text-2xl font-bold text-slate-900 dark:text-white">{conversionRate}%</p>
                                <span className="text-sm font-medium text-brand-neon">({completedMonth} convertidas)</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden">
                {/* CALENDAR BODY */}
                <div className="flex-1 flex flex-col min-w-[500px]">
                    <div className="grid grid-cols-7 border-b border-slate-200/50 dark:border-white/10 shrink-0">
                        {weekDays.map(day => (
                            <div key={day} className="p-3 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
                                {day}
                            </div>
                        ))}
                    </div>

                    <DragDropContext onDragEnd={handleDragEnd}>
                        <div className="flex-1 grid grid-cols-7 grid-rows-5 lg:grid-rows-6 h-full">
                            {days.map((day, i) => {
                                const dayMeasurements = getMeasurementsForDay(day);
                                const isCurrentMonth = isSameMonth(day, currentDate);
                                const today = isToday(day);
                                const isSelected = selectedDate && isSameDay(day, selectedDate);
                                const dateId = day.toISOString();

                                return (
                                    <Droppable droppableId={dateId} key={day.toString()}>
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.droppableProps}
                                                onClick={() => setSelectedDate(day)}
                                                className={cn(
                                                    "p-2 border-b border-r dark:border-white/5 relative group transition-colors flex flex-col cursor-pointer",
                                                    !isCurrentMonth && "bg-slate-100/30 dark:bg-black/20",
                                                    today && "bg-brand-emerald/5 dark:bg-brand-emerald/10",
                                                    isSelected && "ring-2 ring-inset ring-brand-emerald bg-brand-emerald/10 dark:bg-brand-emerald/20",
                                                    snapshot.isDraggingOver && "bg-brand-emerald/20 dark:bg-brand-emerald/30",
                                                    i % 7 === 6 && "border-r-0"
                                                )}
                                            >
                                                <div className="flex items-center justify-between mb-2 shrink-0">
                                                    <span className={cn(
                                                        "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full transition-colors",
                                                        today ? "bg-brand-emerald text-white shadow-md shadow-brand-emerald/50" :
                                                            isSelected ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900" :
                                                                !isCurrentMonth ? "text-slate-400 dark:text-slate-600" : "text-slate-700 dark:text-slate-300 group-hover:bg-slate-200 dark:group-hover:bg-slate-800"
                                                    )}>
                                                        {format(day, 'd')}
                                                    </span>

                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onAddMeasurementForDate(day);
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 p-1 text-brand-emerald hover:bg-brand-emerald/20 rounded-md transition-all dark:text-brand-emerald"
                                                        title="Nova Medição"
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                </div>

                                                <div className="flex-1 space-y-1.5 overflow-y-auto pr-1 no-scrollbar min-h-[60px]">
                                                    {dayMeasurements.map((measurement, index) => {
                                                        // Calculate if measurement is actively open for > 48h
                                                        const isWarning = measurement.status === 'scheduled' &&
                                                            measurement.scheduledDate &&
                                                            differenceInHours(new Date(), parseISO(measurement.scheduledDate)) >= 48;

                                                        return (
                                                            <Draggable key={measurement.id} draggableId={measurement.id} index={index}>
                                                                {(provided, snapshot) => (
                                                                    <div
                                                                        ref={provided.innerRef}
                                                                        {...provided.draggableProps}
                                                                        {...provided.dragHandleProps}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            onMeasurementClick(measurement);
                                                                        }}
                                                                        className={cn(
                                                                            "group/item relative text-[11px] p-2 rounded-lg border leading-tight cursor-pointer shadow-sm transition-all overflow-hidden",
                                                                            measurement.status === 'completed'
                                                                                ? "bg-slate-100 border-slate-200 text-slate-500 opacity-60 dark:bg-slate-800/50 dark:border-white/5 dark:text-slate-400 line-through decoration-slate-400/50"
                                                                                : measurement.status === 'declined'
                                                                                    ? "bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-900/50 dark:border-white/5 line-through decoration-brand-ruby/50"
                                                                                    : isWarning
                                                                                        ? "bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700/50 shadow-amber-500/10 hover:border-amber-400"
                                                                                        : "bg-white dark:bg-slate-900 border-slate-200/50 dark:border-white/10 hover:border-brand-emerald/50 hover:shadow-md",
                                                                            snapshot.isDragging && "shadow-xl ring-2 ring-brand-emerald scale-105 z-50 opacity-100 rotate-2"
                                                                        )}
                                                                    >
                                                                        {isWarning && (
                                                                            <div className="absolute top-0 right-0 w-8 h-8 bg-gradient-to-bl from-amber-400/20 to-transparent"></div>
                                                                        )}
                                                                        <div className={cn(
                                                                            "font-bold truncate",
                                                                            isWarning ? "text-amber-900 dark:text-amber-400" : "text-slate-800 dark:text-slate-200"
                                                                        )}>
                                                                            {measurement.scheduledTime || '--:--'} • {measurement.customerName}
                                                                        </div>

                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setMeasurementToDelete(measurement);
                                                                            }}
                                                                            className="absolute top-1/2 -translate-y-1/2 right-1.5 p-1 text-slate-400 hover:text-brand-ruby hover:bg-red-50 dark:hover:bg-brand-ruby/10 opacity-0 group-hover/item:opacity-100 transition-all rounded"
                                                                        >
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </Draggable>
                                                        );
                                                    })}
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

                {/* LATERAL TIMELINE */}
                {selectedDate && (
                    <aside className="w-80 lg:w-96 flex-shrink-0 border-l border-slate-200/50 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 flex flex-col animate-in slide-in-from-right-8 duration-300">
                        <div className="p-5 border-b border-slate-200/50 dark:border-white/10 shrink-0 flex justify-between items-center bg-white/50 dark:bg-white/5 backdrop-blur-md">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-brand-emerald" />
                                    {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
                                </h3>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wider uppercase mt-1">Roteiro Diário de Medições</p>
                            </div>
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full dark:hover:bg-white/10 rounded-full" onClick={() => setSelectedDate(null)}>
                                <X className="w-4 h-4 text-slate-500" />
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 relative">
                            {selectedDayMeasurements.length === 0 ? (
                                <div className="text-center text-slate-400 dark:text-slate-500 mt-10 text-sm glass-card border-dashed p-8 rounded-2xl">
                                    <PenTool className="w-8 h-8 mx-auto mb-3 opacity-50" />
                                    <p>Nenhuma medição agendada.</p>
                                    <Button size="sm" className="mt-4 bg-brand-emerald hover:bg-emerald-600 text-white rounded-xl shadow-lg shadow-brand-emerald/20" onClick={() => onAddMeasurementForDate(selectedDate)}>
                                        Agendar Agora
                                    </Button>
                                </div>
                            ) : (
                                <div className="relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-brand-emerald/50 before:via-brand-emerald/20 before:to-transparent">
                                    {selectedDayMeasurements.map((m) => (
                                        <div key={m.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group mb-8 last:mb-0 cursor-pointer" onClick={() => onMeasurementClick(m)}>
                                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-50 border-4 border-white dark:border-slate-950 dark:bg-slate-800 shadow shadow-brand-emerald/20 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-transform group-hover:scale-110">
                                                <span className="text-xs font-bold text-brand-emerald">{m.scheduledTime || '--'}</span>
                                            </div>
                                            <div className="w-[calc(100%-3rem)] md:w-[calc(50%-1.5rem)] glass-card p-4 rounded-2xl border border-slate-200/50 dark:border-white/5 shadow-md group-hover:shadow-xl group-hover:border-brand-emerald/50 transition-all">
                                                <div className="flex items-center justify-between mb-1">
                                                    <h4 className="font-bold text-slate-800 dark:text-slate-100 leading-tight">{m.customerName}</h4>
                                                    {m.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-brand-emerald" />}
                                                </div>
                                                <div className="flex items-start text-xs text-slate-500 dark:text-slate-400 mt-2 gap-1.5">
                                                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                                    <span className="line-clamp-2">{m.address}</span>
                                                </div>
                                                <div className="flex items-center justify-between mt-3">
                                                    {m.material && (
                                                        <div className="inline-block px-2 py-1 bg-brand-neon/10 text-brand-neon rounded-md text-[10px] font-bold tracking-wider uppercase">
                                                            {m.material}
                                                        </div>
                                                    )}

                                                    {m.status === 'scheduled' && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 px-2 text-[10px] gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30 ml-auto"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const message = `Olá ${m.customerName.split(' ')[0]}, tudo bem? Aqui é da marmoraria. Gostaríamos de fazer um acompanhamento sobre o seu projeto${m.material ? ` de ${m.material}` : ''}. Como podemos seguir?`;
                                                                const phone = m.phone.replace(/\D/g, '');
                                                                window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank');
                                                            }}
                                                        >
                                                            <MessageCircle className="w-3.5 h-3.5" />
                                                            Cobrar via Whats
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </aside>
                )}
            </div>

            {/* Delete Confirmation Modal inline */}
            {measurementToDelete && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="glass-panel w-full max-w-sm p-6 rounded-3xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3 mb-3">
                            <div className="p-2 bg-brand-ruby/10 rounded-xl relative">
                                <div className="absolute inset-0 bg-brand-ruby/20 animate-ping rounded-xl"></div>
                                <Trash2 className="h-5 w-5 text-brand-ruby relative z-10" />
                            </div>
                            Excluir Medição
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                            Tem certeza que deseja excluir a medição de <strong className="text-slate-900 dark:text-white">{measurementToDelete.customerName}</strong> permanentemente?
                        </p>
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" className="rounded-xl border-slate-200 dark:border-white/10" onClick={() => setMeasurementToDelete(null)}>Cancelar</Button>
                            <Button variant="destructive" className="rounded-xl bg-brand-ruby hover:bg-red-700 shadow-lg shadow-brand-ruby/20" onClick={confirmDelete}>Excluir</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
