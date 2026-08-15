import React, { useMemo } from 'react';
import type { Quote, Order, Measurement } from '../../../types';
import { isSameDay, parseISO, startOfDay, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { getEffectiveWorkflowStage } from '../../../components/workflow/WorkflowStatus';

interface Props {
    quotes: Quote[];
    orders: Order[];
    measurements: Measurement[];
}

export const ExecutiveSummarySlide: React.FC<Props> = ({ quotes, orders, measurements }) => {
    const data = useMemo(() => {
        const today = startOfDay(new Date());
        const weekStart = startOfWeek(today, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

        const todayQuotes = quotes.filter(q => q.createdAt && isSameDay(parseISO(q.createdAt), today)).length;
        
        const scheduledMeasurements = measurements.filter(m => m.status === 'scheduled' && m.scheduledDate);
        const todayMeasurements = scheduledMeasurements.filter(m => isSameDay(parseISO(m.scheduledDate!), today)).length;
        
        const installOrders = orders.filter(o => getEffectiveWorkflowStage(o) === 'instalacao' || o.installationDate);
        const todayInstalls = installOrders.filter(o => o.installationDate && isSameDay(parseISO(o.installationDate), today)).length;

        const awaitingContracts = quotes.filter(q => q.quoteStage === 'contrato').length;
        
        const prodOrders = orders.filter(o => {
            const stage = getEffectiveWorkflowStage(o);
            return stage !== 'finalizado' && stage !== 'instalacao' && stage !== 'cancelado';
        });
        const inProduction = prodOrders.length;

        const followUps = quotes.filter(q => q.status === 'draft' || q.status === 'sent' || q.quoteStage === 'negotiating').length;

        const weekSalesQuotes = quotes.filter(q => {
            if (!q.createdAt) return false;
            const isApproved = q.quoteStage === 'aprovado' || q.status === 'approved' || q.quoteStage === 'contrato';
            return isApproved && isWithinInterval(parseISO(q.createdAt), { start: weekStart, end: weekEnd });
        });
        const weekSales = weekSalesQuotes.length;

        return { todayQuotes, todayMeasurements, todayInstalls, awaitingContracts, inProduction, followUps, weekSales };
    }, [quotes, orders, measurements]);

    return (
        <div className="flex flex-col h-full bg-slate-900 text-white p-12">
            <header className="mb-12">
                <h1 className="text-5xl font-bold text-white mb-4">Resumo Executivo</h1>
                <p className="text-2xl text-slate-400">Visão geral da operação</p>
            </header>

            <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-8 content-start">
                
                <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700/50 flex flex-col justify-between">
                    <div className="text-xl text-slate-400 uppercase tracking-wider mb-4">Orçamentos Hoje</div>
                    <div className="text-6xl font-bold text-white">{data.todayQuotes}</div>
                </div>

                <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700/50 flex flex-col justify-between">
                    <div className="text-xl text-slate-400 uppercase tracking-wider mb-4">Medições Hoje</div>
                    <div className="text-6xl font-bold text-brand-emerald">{data.todayMeasurements}</div>
                </div>

                <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700/50 flex flex-col justify-between">
                    <div className="text-xl text-slate-400 uppercase tracking-wider mb-4">Instalações Hoje</div>
                    <div className="text-6xl font-bold text-blue-400">{data.todayInstalls}</div>
                </div>

                <div className="bg-brand-emerald/10 p-8 rounded-3xl border border-brand-emerald/30 flex flex-col justify-between">
                    <div className="text-xl text-brand-emerald uppercase tracking-wider mb-4">Vendas da Semana</div>
                    <div className="text-6xl font-bold text-white">{data.weekSales}</div>
                </div>

                <div className="bg-amber-500/10 p-8 rounded-3xl border border-amber-500/30 flex flex-col justify-between">
                    <div className="text-xl text-amber-500 uppercase tracking-wider mb-4">Aguardando Contrato</div>
                    <div className="text-6xl font-bold text-white">{data.awaitingContracts}</div>
                </div>

                <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700/50 flex flex-col justify-between lg:col-span-2">
                    <div className="text-xl text-slate-400 uppercase tracking-wider mb-4">Produção em Andamento</div>
                    <div className="text-6xl font-bold text-white flex items-center gap-6">
                        {data.inProduction}
                        <span className="text-2xl text-slate-500 font-normal">pedidos ativos na fábrica</span>
                    </div>
                </div>

                <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700/50 flex flex-col justify-between">
                    <div className="text-xl text-slate-400 uppercase tracking-wider mb-4">Follow-ups Pendentes</div>
                    <div className="text-6xl font-bold text-slate-300">{data.followUps}</div>
                </div>
            </div>
        </div>
    );
};
