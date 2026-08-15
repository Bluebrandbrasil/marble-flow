import React, { useMemo } from 'react';
import type { Quote } from '../../../types';
import { startOfWeek, endOfWeek, isWithinInterval, parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
    quotes: Quote[];
}

export const QuotesByWeekdaySlide: React.FC<Props> = ({ quotes }) => {
    const data = useMemo(() => {
        const now = new Date();
        const start = startOfWeek(now, { weekStartsOn: 1 }); // Monday
        const end = endOfWeek(now, { weekStartsOn: 1 });

        const thisWeekQuotes = quotes.filter(q => {
            if (!q.createdAt) return false;
            const date = new Date(q.createdAt);
            return isWithinInterval(date, { start, end });
        });

        const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const counts = [0, 0, 0, 0, 0, 0];
        
        thisWeekQuotes.forEach(q => {
            const date = new Date(q.createdAt);
            const dayIndex = date.getDay(); // 0 = Sun, 1 = Mon...
            if (dayIndex >= 1 && dayIndex <= 6) {
                counts[dayIndex - 1]++;
            }
        });

        const maxCount = Math.max(...counts, 1);
        const total = thisWeekQuotes.length;
        const avg = (total / (now.getDay() === 0 ? 6 : Math.max(1, now.getDay()))).toFixed(1);

        const bestDayIndex = counts.indexOf(Math.max(...counts));

        return { days, counts, maxCount, total, avg, bestDayIndex };
    }, [quotes]);

    return (
        <div className="flex flex-col h-full bg-slate-900 text-white p-12">
            <header className="mb-12">
                <h1 className="text-5xl font-bold text-white mb-4">Orçamentos da Semana</h1>
                <p className="text-2xl text-slate-400">Volume diário de orçamentos gerados</p>
            </header>

            <div className="flex-1 flex gap-12">
                {/* Main Chart */}
                <div className="flex-1 flex items-end gap-6 pb-12 pt-20 border-b-2 border-slate-700">
                    {data.days.map((day, i) => {
                        const height = `${(data.counts[i] / data.maxCount) * 100}%`;
                        const isBest = i === data.bestDayIndex && data.counts[i] > 0;
                        return (
                            <div key={day} className="flex-1 flex flex-col items-center justify-end h-full group">
                                <div className="text-4xl font-bold mb-4 opacity-80">{data.counts[i]}</div>
                                <div 
                                    className={`w-full rounded-t-xl transition-all duration-1000 ease-out ${isBest ? 'bg-brand-emerald shadow-[0_0_30px_rgba(16,185,129,0.3)]' : 'bg-slate-700'}`}
                                    style={{ height: data.counts[i] === 0 ? '4px' : height }}
                                />
                                <div className="mt-6 text-2xl font-medium text-slate-400">{day.substring(0, 3)}</div>
                            </div>
                        );
                    })}
                </div>

                {/* Sidebar Stats */}
                <div className="w-1/3 flex flex-col gap-8 justify-center">
                    <div className="bg-slate-800/50 p-10 rounded-3xl border border-slate-700/50">
                        <div className="text-xl text-slate-400 mb-2 uppercase tracking-wider">Total da Semana</div>
                        <div className="text-7xl font-bold text-white">{data.total}</div>
                    </div>
                    
                    <div className="bg-slate-800/50 p-10 rounded-3xl border border-slate-700/50">
                        <div className="text-xl text-slate-400 mb-2 uppercase tracking-wider">Média Diária</div>
                        <div className="text-7xl font-bold text-brand-emerald">{data.avg}</div>
                    </div>

                    {data.counts[data.bestDayIndex] > 0 && (
                        <div className="bg-brand-emerald/10 p-10 rounded-3xl border border-brand-emerald/30">
                            <div className="text-xl text-brand-emerald mb-2 uppercase tracking-wider">Melhor Dia</div>
                            <div className="text-5xl font-bold text-white">{data.days[data.bestDayIndex]}</div>
                            <div className="text-xl text-slate-300 mt-2">{data.counts[data.bestDayIndex]} orçamentos</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
