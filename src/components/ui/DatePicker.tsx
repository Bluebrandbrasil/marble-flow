import { safeArray } from '../../lib/dataDiagnostics';
import React, { useState, useRef, useEffect } from 'react';
import { 
    format, 
    startOfMonth, 
    endOfMonth, 
    startOfWeek, 
    endOfWeek, 
    eachDayOfInterval, 
    isSameMonth, 
    isSameDay, 
    addMonths, 
    subMonths, 
    isBefore,
    startOfDay
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';
import { safeParseISO } from '../../lib/dateUtils';

interface DatePickerProps {
    value: string; // yyyy-MM-dd
    onChange: (date: string) => void;
    placeholder?: string;
    className?: string;
    minDate?: Date;
    disabled?: boolean;
}

export const DatePicker: React.FC<DatePickerProps> = ({
    value,
    onChange,
    placeholder = 'Selecionar data',
    className,
    minDate,
    disabled = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [viewDate, setViewDate] = useState(value ? safeParseISO(value) || new Date() : new Date());
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedDate = value ? safeParseISO(value) : null;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleDateClick = (date: Date) => {
        if (minDate && isBefore(startOfDay(date), startOfDay(minDate))) return;
        
        const dateStr = format(date, 'yyyy-MM-dd');
        onChange(dateStr);
        setIsOpen(false);
    };

    const renderCalendar = () => {
        const firstDayOfMonth = startOfMonth(viewDate);
        const lastDayOfMonth = endOfMonth(viewDate);
        const calendarStart = startOfWeek(firstDayOfMonth, { weekStartsOn: 0 });
        const calendarEnd = endOfWeek(lastDayOfMonth, { weekStartsOn: 0 });

        const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
        const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

        return (
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-[280px] animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        type="button"
                        onClick={() => setViewDate(subMonths(viewDate, 1))}
                        className="h-8 w-8 p-0"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
                        {format(viewDate, 'MMMM yyyy', { locale: ptBR })}
                    </h3>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        type="button"
                        onClick={() => setViewDate(addMonths(viewDate, 1))}
                        className="h-8 w-8 p-0"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2">
                    {safeArray(weekDays).map(day => (
                        <div key={day} className="text-[9px] font-black text-slate-400 text-center uppercase py-1">
                            {day}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                    {safeArray(days).map((day, idx) => {
                        const isSelected = selectedDate && isSameDay(day, selectedDate);
                        const isCurrentMonth = isSameMonth(day, viewDate);
                        const isToday = isSameDay(day, new Date());
                        const isPast = minDate && isBefore(startOfDay(day), startOfDay(minDate));

                        return (
                            <button
                                key={idx}
                                type="button"
                                disabled={isPast}
                                onClick={(e) => { e.preventDefault(); handleDateClick(day); }}
                                className={cn(
                                    "h-8 w-full rounded-lg text-xs font-bold transition-all relative flex items-center justify-center",
                                    !isCurrentMonth && "opacity-20",
                                    isToday && !isSelected && "text-brand-emerald border border-brand-emerald/20",
                                    isSelected 
                                        ? "bg-brand-emerald text-white shadow-lg shadow-brand-emerald/20 z-10" 
                                        : isPast
                                            ? "text-slate-200 dark:text-slate-700 cursor-not-allowed"
                                            : "hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400"
                                )}
                            >
                                {format(day, 'd')}
                            </button>
                        );
                    })}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex justify-end">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        type="button"
                        onClick={() => setIsOpen(false)}
                        className="text-[10px] font-bold uppercase tracking-widest text-slate-400"
                    >
                        Fechar
                    </Button>
                </div>
            </div>
        );
    };

    return (
        <div className={cn("relative", className)} ref={containerRef}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-3 px-4 h-12 w-full bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-100 dark:border-slate-800 text-sm font-bold transition-all hover:border-brand-emerald group shadow-sm text-left",
                    isOpen && "border-brand-emerald ring-2 ring-brand-emerald/10",
                    selectedDate && "text-slate-800 dark:text-slate-200",
                    !selectedDate && "text-slate-400",
                    disabled && "opacity-50 cursor-not-allowed bg-slate-50"
                )}
            >
                <CalendarIcon className={cn("h-4 w-4 text-slate-400 group-hover:text-brand-emerald transition-colors", selectedDate && "text-brand-emerald")} />
                <span className="flex-1 truncate">
                    {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : placeholder}
                </span>
                {selectedDate && !disabled && (
                    <div 
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            onChange(''); 
                        }}
                        className="p-1 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-md text-rose-500 transition-colors"
                    >
                        <X className="h-3.5 w-3.5" />
                    </div>
                )}
            </button>

            {isOpen && (
                <div className="absolute top-full mt-2 left-0 z-[100] origin-top-left">
                    {renderCalendar()}
                </div>
            )}
        </div>
    );
};
