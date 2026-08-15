import { safeArray } from '../../lib/dataDiagnostics';
import { safeParseISO } from '../../lib/dateUtils';
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
    isWithinInterval,
    isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

interface DateRangePickerProps {
    startDate: string; // yyyy-MM-dd
    endDate: string;   // yyyy-MM-dd
    onChange: (start: string, end: string) => void;
    placeholder?: string;
    className?: string;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
    startDate,
    endDate,
    onChange,
    placeholder = 'Selecionar período',
    className
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [viewDate, setViewDate] = useState(new Date());
    const containerRef = useRef<HTMLDivElement>(null);

    const sDate = startDate ? safeParseISO(startDate) : null;
    const eDate = endDate ? safeParseISO(endDate) : null;

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
        const dateStr = format(date, 'yyyy-MM-dd');

        if (!sDate || (sDate && eDate)) {
            // Start a new selection
            onChange(dateStr, '');
        } else {
            // Completing the range
            if (isBefore(date, sDate)) {
                // If user clicks a date before the start, swap them
                onChange(dateStr, format(sDate, 'yyyy-MM-dd'));
            } else {
                onChange(format(sDate, 'yyyy-MM-dd'), dateStr);
            }
            setIsOpen(false);
        }
    };

    const renderCalendar = () => {
        const firstDayOfMonth = startOfMonth(viewDate);
        const lastDayOfMonth = endOfMonth(viewDate);
        const calendarStart = startOfWeek(firstDayOfMonth, { weekStartsOn: 0 });
        const calendarEnd = endOfWeek(lastDayOfMonth, { weekStartsOn: 0 });

        const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
        const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

        return (
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-[320px] animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setViewDate(subMonths(viewDate, 1))}
                        className="h-8 w-8 p-0"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
                        {format(viewDate, 'MMMM yyyy', { locale: ptBR })}
                    </h3>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setViewDate(addMonths(viewDate, 1))}
                        className="h-8 w-8 p-0"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2">
                    {safeArray(weekDays).map(day => (
                        <div key={day} className="text-[10px] font-black text-slate-400 text-center uppercase py-1">
                            {day}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                    {safeArray(days).map((day, idx) => {
                        const isSelectedStart = sDate && isSameDay(day, sDate);
                        const isSelectedEnd = eDate && isSameDay(day, eDate);
                        const isInRange = sDate && eDate && isWithinInterval(day, { start: sDate, end: eDate });
                        const isCurrentMonth = isSameMonth(day, viewDate);

                        return (
                            <button
                                key={idx}
                                onClick={(e) => { e.preventDefault(); handleDateClick(day); }}
                                className={cn(
                                    "h-9 w-full rounded-xl text-xs font-bold transition-all relative flex items-center justify-center",
                                    !isCurrentMonth && "opacity-20",
                                    isSelectedStart || isSelectedEnd 
                                        ? "bg-brand-emerald text-white shadow-lg shadow-brand-emerald/20 z-10" 
                                        : isInRange
                                            ? "bg-brand-emerald/10 text-brand-emerald rounded-none first:rounded-l-xl last:rounded-r-xl"
                                            : "hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400"
                                )}
                            >
                                {format(day, 'd')}
                            </button>
                        );
                    })}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 flex justify-between gap-2">
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => { onChange('', ''); setIsOpen(false); }}
                        className="text-[10px] font-bold uppercase tracking-widest text-rose-500 hover:text-rose-600"
                    >
                        Limpar
                    </Button>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setIsOpen(false)}
                        className="text-[10px] font-bold uppercase tracking-widest text-slate-400"
                    >
                        Fechar
                    </Button>
                </div>
            </div>
        );
    };

    const displayText = () => {
        if (sDate && eDate) {
            return `${format(sDate, 'dd/MM/yyyy')} - ${format(eDate, 'dd/MM/yyyy')}`;
        }
        if (sDate) {
            return `${format(sDate, 'dd/MM/yyyy')} - ...`;
        }
        return placeholder;
    };

    return (
        <div className={cn("relative", className)} ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-3 px-4 h-10 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm text-xs font-bold transition-all hover:border-brand-emerald group",
                    isOpen && "border-brand-emerald ring-2 ring-brand-emerald/10",
                    (startDate || endDate) && "text-brand-emerald border-brand-emerald/30 bg-brand-emerald/[0.02]"
                )}
            >
                <CalendarIcon className={cn("h-4 w-4 text-slate-400 group-hover:text-brand-emerald transition-colors", (startDate || endDate) && "text-brand-emerald")} />
                <span className={cn("uppercase tracking-widest leading-none", !startDate && "text-slate-400")}>
                    {displayText()}
                </span>
                {(startDate || endDate) && (
                    <div 
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            onChange('', ''); 
                        }}
                        className="ml-1 p-0.5 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-md text-rose-500 transition-colors"
                    >
                        <X className="h-3.5 w-3.5" />
                    </div>
                )}
            </button>

            {isOpen && (
                <div className="absolute top-full mt-2 right-0 z-[100] origin-top-right">
                    {renderCalendar()}
                </div>
            )}
        </div>
    );
};
