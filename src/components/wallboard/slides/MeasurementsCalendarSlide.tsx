import React, { useMemo } from 'react';
import type { Measurement } from '../../../types';
import { isSameDay, parseISO, format, isAfter, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
    measurements: Measurement[];
}

export const MeasurementsCalendarSlide: React.FC<Props> = ({ measurements }) => {
    const data = useMemo(() => {
        const today = startOfDay(new Date());
        
        const scheduled = measurements.filter(m => m.status === 'scheduled');
        
        const todayMeasurements = scheduled.filter(m => {
            if (!m.scheduledDate) return false;
            return isSameDay(parseISO(m.scheduledDate), today);
        }).sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));

        const upcomingMeasurements = scheduled.filter(m => {
            if (!m.scheduledDate) return false;
            return isAfter(parseISO(m.scheduledDate), today);
        }).sort((a, b) => {
            const dateA = new Date(`${a.scheduledDate}T${a.scheduledTime || '00:00'}`);
            const dateB = new Date(`${b.scheduledDate}T${b.scheduledTime || '00:00'}`);
            return dateA.getTime() - dateB.getTime();
        }).slice(0, 5); // Take next 5

        const delayedMeasurements = measurements.filter(m => {
            if (m.status !== 'scheduled' || !m.scheduledDate) return false;
            return parseISO(m.scheduledDate) < today;
        });

        return { todayMeasurements, upcomingMeasurements, delayedCount: delayedMeasurements.length };
    }, [measurements]);

    return (
        <div className="flex flex-col h-full bg-slate-900 text-white p-12">
            <header className="mb-10 flex justify-between items-end">
                <div>
                    <h1 className="text-5xl font-bold text-white mb-4">Agenda de Medição</h1>
                    <p className="text-2xl text-slate-400 capitalize">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
                </div>
                {data.delayedCount > 0 && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-500 px-6 py-3 rounded-full text-2xl font-bold flex items-center gap-3">
                        <span className="w-4 h-4 rounded-full bg-red-500 animate-pulse"></span>
                        {data.delayedCount} {data.delayedCount === 1 ? 'Medição Atrasada' : 'Medições Atrasadas'}
                    </div>
                )}
            </header>

            <div className="flex-1 flex gap-12 overflow-hidden">
                {/* Today's Schedule */}
                <div className="flex-1 flex flex-col bg-slate-800/50 rounded-3xl border border-slate-700/50 p-8 overflow-hidden">
                    <h2 className="text-3xl font-bold mb-8 text-brand-emerald flex items-center gap-4">
                        <div className="w-4 h-12 bg-brand-emerald rounded-full"></div>
                        Medições de Hoje ({data.todayMeasurements.length})
                    </h2>
                    
                    <div className="flex-1 overflow-hidden flex flex-col gap-4">
                        {data.todayMeasurements.length > 0 ? (
                            data.todayMeasurements.map(m => (
                                <div key={m.id} className="bg-slate-800 p-6 rounded-2xl border-l-4 border-l-brand-emerald border-y border-r border-y-slate-700 border-r-slate-700 flex items-center gap-8 shadow-lg">
                                    <div className="text-4xl font-bold text-white w-32">{m.scheduledTime || '--:--'}</div>
                                    <div className="flex-1">
                                        <div className="text-2xl font-bold text-white mb-2">{m.customerName || 'Cliente não informado'}</div>
                                        <div className="text-xl text-slate-400 truncate">{m.address || m.neighborhood || m.city || 'Endereço não informado'}</div>
                                    </div>
                                    <div className="bg-slate-700/50 px-6 py-3 rounded-xl text-xl text-slate-300 text-center max-w-[250px] truncate">
                                        {m.assignedStaffName || m.measurerName || m.assignedMeasurerName || m.assignedToName || 'Medidor não atribuído'}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center opacity-50">
                                <div className="text-4xl text-slate-500 mb-4">Nenhuma medição para hoje</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Upcoming */}
                <div className="w-1/3 flex flex-col bg-slate-800/30 rounded-3xl border border-slate-700/30 p-8 overflow-hidden">
                    <h2 className="text-3xl font-bold mb-8 text-slate-300 flex items-center gap-4">
                        <div className="w-4 h-12 bg-slate-600 rounded-full"></div>
                        Próximas Medições
                    </h2>
                    
                    <div className="flex-1 overflow-hidden flex flex-col gap-4">
                        {data.upcomingMeasurements.length > 0 ? (
                            data.upcomingMeasurements.map(m => {
                                const mDate = m.scheduledDate ? parseISO(m.scheduledDate) : new Date();
                                return (
                                    <div key={m.id} className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 flex flex-col gap-3">
                                        <div className="flex justify-between items-center text-xl text-brand-emerald font-medium">
                                            <span>{format(mDate, "dd/MM", { locale: ptBR })}</span>
                                            <span>{m.scheduledTime || '--:--'}</span>
                                        </div>
                                        <div className="text-2xl font-bold text-white">{m.customerName}</div>
                                        <div className="text-lg text-slate-400 truncate">{m.neighborhood || m.city || ''}</div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <span className="text-2xl text-slate-500">Agenda livre</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
