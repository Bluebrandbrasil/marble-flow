import React, { useMemo } from 'react';
import type { Order } from '../../../types';
import { isSameDay, parseISO, format, isAfter, startOfDay, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getEffectiveWorkflowStage } from '../../../components/workflow/WorkflowStatus';

interface Props {
    orders: Order[];
}

export const InstallationsCalendarSlide: React.FC<Props> = ({ orders }) => {
    const data = useMemo(() => {
        const today = startOfDay(new Date());
        const weekStart = startOfWeek(today, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
        
        // Find orders in installation status or with installation scheduled
        const installOrders = orders.filter(o => {
            const stage = getEffectiveWorkflowStage(o);
            return stage === 'instalacao' || o.installationDate;
        });
        
        const todayInstalls = installOrders.filter(o => {
            if (!o.installationDate) return false;
            return isSameDay(parseISO(o.installationDate), today);
        });

        const weekInstalls = installOrders.filter(o => {
            if (!o.installationDate) return false;
            return isWithinInterval(parseISO(o.installationDate), { start: weekStart, end: weekEnd });
        });

        const upcomingInstalls = installOrders.filter(o => {
            if (!o.installationDate) return false;
            return isAfter(parseISO(o.installationDate), today);
        }).sort((a, b) => {
            return new Date(a.installationDate || '').getTime() - new Date(b.installationDate || '').getTime();
        }).slice(0, 5);

        return { todayInstalls, weekInstallsCount: weekInstalls.length, upcomingInstalls };
    }, [orders]);

    return (
        <div className="flex flex-col h-full bg-slate-900 text-white p-12">
            <header className="mb-10 flex justify-between items-end">
                <div>
                    <h1 className="text-5xl font-bold text-white mb-4">Agenda de Instalação</h1>
                    <p className="text-2xl text-slate-400 capitalize">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
                </div>
                <div className="bg-slate-800 border border-slate-700 px-8 py-4 rounded-2xl flex flex-col items-end">
                    <span className="text-lg text-slate-400 uppercase tracking-wider">Instalações na Semana</span>
                    <span className="text-4xl font-bold text-white">{data.weekInstallsCount}</span>
                </div>
            </header>

            <div className="flex-1 flex gap-12 overflow-hidden">
                {/* Today's Schedule */}
                <div className="flex-[3] flex flex-col bg-slate-800/50 rounded-3xl border border-slate-700/50 p-8 overflow-hidden">
                    <h2 className="text-3xl font-bold mb-8 text-blue-400 flex items-center gap-4">
                        <div className="w-4 h-12 bg-blue-400 rounded-full"></div>
                        Instalações de Hoje ({data.todayInstalls.length})
                    </h2>
                    
                    <div className="flex-1 overflow-hidden grid grid-cols-2 gap-6 content-start">
                        {data.todayInstalls.length > 0 ? (
                            data.todayInstalls.map(o => (
                                <div key={o.id} className="bg-slate-800 p-6 rounded-2xl border-l-4 border-l-blue-400 border-y border-r border-y-slate-700 border-r-slate-700 shadow-lg flex flex-col gap-4">
                                    <div className="flex justify-between items-start">
                                        <div className="text-2xl font-bold text-white line-clamp-1">{o.customerName}</div>
                                        <div className="bg-slate-900 px-3 py-1 rounded-lg text-sm text-slate-400 font-mono">#{o.id.substring(0,6).toUpperCase()}</div>
                                    </div>
                                    <div className="text-xl text-slate-400 line-clamp-2">{o.deliveryAddress || 'Endereço não informado'}</div>
                                    <div className="mt-auto pt-4 border-t border-slate-700 flex justify-between items-center">
                                        <div className="text-lg text-blue-300 font-medium">{o.installerName || 'Equipe não definida'}</div>
                                        {o.installationTime && <div className="text-2xl font-bold text-white">{o.installationTime}</div>}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="col-span-2 flex flex-col items-center justify-center opacity-50 py-20">
                                <div className="text-4xl text-slate-500 mb-4">Nenhuma instalação agendada para hoje</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Upcoming */}
                <div className="flex-[2] flex flex-col bg-slate-800/30 rounded-3xl border border-slate-700/30 p-8 overflow-hidden">
                    <h2 className="text-3xl font-bold mb-8 text-slate-300 flex items-center gap-4">
                        <div className="w-4 h-12 bg-slate-600 rounded-full"></div>
                        Próximas Instalações
                    </h2>
                    
                    <div className="flex-1 overflow-hidden flex flex-col gap-4">
                        {data.upcomingInstalls.length > 0 ? (
                            data.upcomingInstalls.map(o => {
                                const mDate = o.installationDate ? parseISO(o.installationDate) : new Date();
                                return (
                                    <div key={o.id} className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 flex flex-col gap-3">
                                        <div className="flex justify-between items-center text-xl text-blue-400 font-medium">
                                            <span>{format(mDate, "dd/MM", { locale: ptBR })} - {format(mDate, "EEEE", { locale: ptBR }).substring(0,3)}</span>
                                            <span>{o.installerName || 'Sem equipe'}</span>
                                        </div>
                                        <div className="text-2xl font-bold text-white truncate">{o.customerName}</div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <span className="text-2xl text-slate-500">Sem próximas instalações</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
