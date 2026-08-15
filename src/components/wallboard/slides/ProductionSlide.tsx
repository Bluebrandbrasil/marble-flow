import React from 'react';

interface Props {
    production: {
        activeCount: number;
        avgCurrentTime: number;
        completedCount: number;
        avgCompletedTime: number;
        medianCompletedTime: number;
    }
}

export const ProductionSlide: React.FC<Props> = ({ production }) => {
    return (
        <div className="flex flex-col h-full bg-slate-900 text-white p-12">
            <header className="mb-12 border-b border-slate-800 pb-8">
                <h1 className="text-6xl font-black text-white uppercase tracking-tighter">Produção (Fábrica)</h1>
                <p className="text-2xl text-slate-400 font-medium mt-2">Indicadores de Tempo e Volume</p>
            </header>

            <div className="flex-1 grid grid-cols-2 gap-8">
                <div className="flex flex-col gap-8">
                    <div className="bg-brand-emerald/10 p-10 rounded-[2rem] border border-brand-emerald/30 shadow-[inset_0_0_50px_rgba(16,185,129,0.05)] flex-1 flex flex-col justify-center text-center">
                        <div className="text-2xl text-brand-emerald uppercase tracking-widest font-black mb-6">Pedidos Ativos (Fila Atual)</div>
                        <div className="text-[8rem] leading-none font-black text-white">{production.activeCount}</div>
                        <p className="text-brand-emerald/80 mt-6 text-xl font-bold uppercase tracking-widest">Produzindo neste momento</p>
                    </div>

                    <div className="bg-slate-800/40 p-10 rounded-[2rem] border border-slate-700/50 flex flex-col justify-center text-center">
                        <div className="text-xl text-slate-400 uppercase tracking-widest font-black mb-4">Tempo Atual Médio em Produção</div>
                        <div className="text-7xl font-black text-white">{production.avgCurrentTime.toFixed(1)} <span className="text-3xl text-slate-500">dias</span></div>
                    </div>
                </div>

                <div className="flex flex-col gap-8">
                    <div className="bg-blue-500/10 p-10 rounded-[2rem] border border-blue-500/20 shadow-[inset_0_0_50px_rgba(59,130,246,0.05)] flex-1 flex flex-col justify-center text-center">
                        <div className="text-xl text-blue-400 uppercase tracking-widest font-black mb-6">Tempo Médio de Pedidos Concluídos</div>
                        <div className="text-[7rem] leading-none font-black text-blue-400">{production.avgCompletedTime.toFixed(1)} <span className="text-4xl text-blue-500/50">dias</span></div>
                        <p className="text-blue-300 mt-6 text-lg font-bold uppercase tracking-widest">Baseado em {production.completedCount} pedidos entregues</p>
                    </div>

                    <div className="bg-slate-800/40 p-10 rounded-[2rem] border border-slate-700/50 flex flex-col justify-center text-center">
                        <div className="text-xl text-slate-400 uppercase tracking-widest font-black mb-4">Mediana de Conclusão</div>
                        <div className="text-7xl font-black text-white">{production.medianCompletedTime.toFixed(1)} <span className="text-3xl text-slate-500">dias</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
};
