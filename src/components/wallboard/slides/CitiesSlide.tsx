import React from 'react';

interface Props {
    cities: {
        byQty: { city: string; contracts: number; amount: number }[];
        byValue: { city: string; contracts: number; amount: number }[];
    }
}

export const CitiesSlide: React.FC<Props> = ({ cities }) => {
    const topByQty = cities.byQty[0];
    const topByValue = cities.byValue[0];
    const topRanking = cities.byQty.slice(0, 5);

    return (
        <div className="flex flex-col h-full bg-slate-900 text-white p-12">
            <header className="mb-12 border-b border-slate-800 pb-8">
                <h1 className="text-6xl font-black text-white uppercase tracking-tighter">Cidades e Regiões</h1>
                <p className="text-2xl text-slate-400 font-medium mt-2">Distribuição de Contratos (Últimos 30 dias)</p>
            </header>

            <div className="flex-1 grid grid-cols-2 gap-12">
                <div className="flex flex-col gap-8">
                    {topByQty && (
                        <div className="bg-blue-500/10 p-10 rounded-[2rem] border border-blue-500/20 shadow-[inset_0_0_50px_rgba(59,130,246,0.05)]">
                            <div className="text-xl text-blue-400 uppercase tracking-widest font-black mb-4">Cidade com Mais Contratos</div>
                            <div className="text-6xl font-black text-white uppercase tracking-tight mb-6">{topByQty.city}</div>
                            <div className="text-5xl font-black text-blue-400">{topByQty.contracts} <span className="text-2xl">contratos</span></div>
                        </div>
                    )}

                    {topByValue && (
                        <div className="bg-brand-emerald/10 p-10 rounded-[2rem] border border-brand-emerald/30 shadow-[inset_0_0_50px_rgba(16,185,129,0.05)]">
                            <div className="text-xl text-brand-emerald uppercase tracking-widest font-black mb-4">Cidade com Maior Valor</div>
                            <div className="text-6xl font-black text-white uppercase tracking-tight mb-6">{topByValue.city}</div>
                            <div className="text-5xl font-black text-brand-emerald">
                                {topByValue.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-slate-800/40 p-10 rounded-[2rem] border border-slate-700/50">
                    <div className="text-2xl text-slate-400 uppercase tracking-widest font-black mb-10">Ranking Geral</div>
                    <div className="space-y-8">
                        {topRanking.map((c, idx) => (
                            <div key={c.city} className="flex items-center gap-6">
                                <div className="text-4xl font-black text-slate-600">#{idx + 1}</div>
                                <div className="flex-1">
                                    <h3 className="text-3xl font-black text-white uppercase tracking-tight">{c.city}</h3>
                                    <p className="text-xl text-slate-400 mt-1">{c.contracts} contratos</p>
                                </div>
                                <div className="text-right">
                                    <div className="text-3xl font-black text-emerald-400">
                                        {c.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {topRanking.length === 0 && (
                            <div className="text-xl text-slate-500 font-medium">Sem dados no período.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
