import React from 'react';

interface Props {
    sellers: { id: string; name: string; generated: number; signed: number; amount: number; signatureRate: number }[]
}

export const SellersSlide: React.FC<Props> = ({ sellers }) => {
    const topSeller = sellers[0];
    const ranking = sellers.slice(0, 5);

    return (
        <div className="flex flex-col h-full bg-slate-900 text-white p-12">
            <header className="mb-12 border-b border-slate-800 pb-8">
                <h1 className="text-6xl font-black text-white uppercase tracking-tighter">Ranking de Vendas</h1>
                <p className="text-2xl text-slate-400 font-medium mt-2">Destaques por Vendedor (Últimos 30 dias)</p>
            </header>

            <div className="flex-1 grid grid-cols-12 gap-12">
                <div className="col-span-5 flex flex-col gap-8">
                    {topSeller && (
                        <div className="bg-amber-500/10 p-10 rounded-[2rem] border border-amber-500/30 shadow-[inset_0_0_50px_rgba(245,158,11,0.05)] flex-1">
                            <div className="text-xl text-amber-500 uppercase tracking-widest font-black mb-10 flex items-center gap-4">
                                <span className="text-4xl">👑</span> Melhor Vendedor
                            </div>
                            <div className="text-7xl font-black text-white uppercase tracking-tight mb-8 break-words">{topSeller.name.split(' ')[0]}</div>
                            <div className="space-y-6">
                                <div>
                                    <div className="text-sm text-slate-400 font-bold uppercase tracking-widest">Contratos Gerados</div>
                                    <div className="text-6xl font-black text-amber-400">{topSeller.generated}</div>
                                </div>
                                <div>
                                    <div className="text-sm text-slate-400 font-bold uppercase tracking-widest">Taxa de Assinatura</div>
                                    <div className="text-4xl font-black text-amber-200">{topSeller.signatureRate.toFixed(1)}%</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="col-span-7 bg-slate-800/40 p-10 rounded-[2rem] border border-slate-700/50">
                    <div className="text-2xl text-slate-400 uppercase tracking-widest font-black mb-10">Ranking por Quantidade</div>
                    <div className="space-y-6">
                        {ranking.map((s, idx) => (
                            <div key={s.id} className="flex items-center gap-6 bg-slate-900/50 p-6 rounded-2xl border border-slate-700/30">
                                <div className={`text-4xl font-black w-12 text-center ${idx === 0 ? 'text-amber-500' : 'text-slate-600'}`}>
                                    {idx + 1}
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-3xl font-black text-white uppercase tracking-tight">{s.name}</h3>
                                    <div className="flex gap-6 mt-2">
                                        <span className="text-xl text-blue-400 font-bold">{s.generated} gerados</span>
                                        <span className="text-xl text-emerald-400 font-bold">{s.signed} assinados</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-3xl font-black text-white">
                                        {s.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </div>
                                    <div className="text-lg text-slate-400 mt-1 font-bold">Valor Gerado</div>
                                </div>
                            </div>
                        ))}
                        {ranking.length === 0 && (
                            <div className="text-xl text-slate-500 font-medium p-8 text-center">Nenhuma venda registrada no período.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
