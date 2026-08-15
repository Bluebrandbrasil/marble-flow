import React, { useMemo } from 'react';
import type { Quote } from '../../../types';
import { startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';

interface Props {
    quotes: Quote[];
}

export const CommercialIntelligenceSlide: React.FC<Props> = ({ quotes }) => {
    const data = useMemo(() => {
        const now = new Date();
        const start = startOfMonth(now);
        const end = endOfMonth(now);

        const monthQuotes = quotes.filter(q => {
            if (!q.createdAt) return false;
            const date = new Date(q.createdAt);
            return isWithinInterval(date, { start, end });
        });

        const leads = monthQuotes.length;
        const approved = monthQuotes.filter(q => q.quoteStage === 'aprovado' || q.status === 'approved' || q.quoteStage === 'contrato');
        const sales = approved.length;
        
        const conversion = leads > 0 ? ((sales / leads) * 100).toFixed(1) : '0.0';
        
        const totalAmount = approved.reduce((acc, q) => acc + (q.total || q.totalAmount || 0), 0);
        const ticket = sales > 0 ? totalAmount / sales : 0;

        const followUps = monthQuotes.filter(q => q.status === 'draft' || q.status === 'sent' || q.quoteStage === 'negotiating').length;

        // Best region
        const regions: Record<string, number> = {};
        monthQuotes.forEach(q => {
            const r = q.customerAddress?.split('-')[0]?.trim() || q.customerAddress || 'Não informada';
            // simple heuristic to get a region/neighborhood if available, assuming short strings
            const region = r.length > 20 ? 'Diversas' : r;
            regions[region] = (regions[region] || 0) + 1;
        });
        
        let bestRegion = 'N/A';
        let bestRegionCount = 0;
        Object.entries(regions).forEach(([r, count]) => {
            if (count > bestRegionCount && r !== 'Não informada' && r !== 'Diversas') {
                bestRegionCount = count;
                bestRegion = r;
            }
        });

        const formatCurrency = (val: number) => {
            if (val >= 1000000) return `R$ ${(val / 1000000).toFixed(1)}M`;
            if (val >= 1000) return `R$ ${(val / 1000).toFixed(1)}K`;
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
        };

        return { leads, sales, conversion, ticket: formatCurrency(ticket), totalAmount: formatCurrency(totalAmount), followUps, bestRegion };
    }, [quotes]);

    return (
        <div className="flex flex-col h-full bg-slate-900 text-white p-12">
            <header className="mb-12">
                <h1 className="text-5xl font-bold text-white mb-4">Inteligência Comercial</h1>
                <p className="text-2xl text-slate-400">Desempenho no mês atual</p>
            </header>

            <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-8 content-start">
                {/* Metric Cards */}
                <div className="bg-slate-800/50 p-10 rounded-3xl border border-slate-700/50 flex flex-col justify-between">
                    <div className="text-2xl text-slate-400 uppercase tracking-wider mb-6">Orçamentos Emitidos</div>
                    <div className="text-7xl font-bold text-white">{data.leads}</div>
                </div>

                <div className="bg-slate-800/50 p-10 rounded-3xl border border-slate-700/50 flex flex-col justify-between">
                    <div className="text-2xl text-slate-400 uppercase tracking-wider mb-6">Vendas Fechadas</div>
                    <div className="text-7xl font-bold text-brand-emerald">{data.sales}</div>
                </div>

                <div className="bg-brand-emerald/10 p-10 rounded-3xl border border-brand-emerald/30 flex flex-col justify-between">
                    <div className="text-2xl text-brand-emerald uppercase tracking-wider mb-6">Taxa de Conversão</div>
                    <div className="text-7xl font-bold text-white">{data.conversion}%</div>
                </div>

                <div className="bg-slate-800/50 p-10 rounded-3xl border border-slate-700/50 flex flex-col justify-between">
                    <div className="text-2xl text-slate-400 uppercase tracking-wider mb-6">Ticket Médio</div>
                    <div className="text-6xl font-bold text-blue-400">{data.ticket}</div>
                </div>
                
                <div className="bg-slate-800/50 p-10 rounded-3xl border border-slate-700/50 flex flex-col justify-between">
                    <div className="text-2xl text-slate-400 uppercase tracking-wider mb-6">Total Vendido</div>
                    <div className="text-6xl font-bold text-blue-400">{data.totalAmount}</div>
                </div>

                <div className="bg-amber-500/10 p-10 rounded-3xl border border-amber-500/30 flex flex-col justify-between">
                    <div className="text-2xl text-amber-500 uppercase tracking-wider mb-6">Follow-ups Abertos</div>
                    <div className="text-7xl font-bold text-white">{data.followUps}</div>
                </div>
            </div>
            
            <div className="mt-8 bg-slate-800 p-8 rounded-3xl border border-slate-700 flex items-center justify-between">
                <div className="text-2xl text-slate-300">Principal Região do Mês</div>
                <div className="text-4xl font-bold text-white">{data.bestRegion}</div>
            </div>
        </div>
    );
};
