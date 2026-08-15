import React from 'react';

interface Props {
    materials: { id: string; name: string; sqm: number; contractCount: number }[]
}

export const MaterialsSlide: React.FC<Props> = ({ materials }) => {
    const top3 = materials.slice(0, 3);
    const rest = materials.slice(3, 8); // Next 5
    const totalSqm = materials.reduce((acc, m) => acc + m.sqm, 0);
    const topByContracts = [...materials].sort((a,b) => b.contractCount - a.contractCount)[0];

    return (
        <div className="flex flex-col h-full bg-slate-900 text-white p-12">
            <header className="mb-12 border-b border-slate-800 pb-8 flex justify-between items-end">
                <div>
                    <h1 className="text-6xl font-black text-white uppercase tracking-tighter">Materiais Mais Vendidos</h1>
                    <p className="text-2xl text-slate-400 font-medium mt-2">Baseado em Contratos Gerados (Últimos 30 dias)</p>
                </div>
                <div className="text-right">
                    <div className="text-4xl font-black text-brand-emerald">{totalSqm.toFixed(1)} m²</div>
                    <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">Volume Total</div>
                </div>
            </header>

            <div className="flex-1 grid grid-cols-12 gap-8">
                {/* Ranking Top 3 */}
                <div className="col-span-8 flex flex-col gap-6">
                    {top3.map((m, idx) => (
                        <div key={m.id} className={`p-8 rounded-[2rem] flex items-center gap-8 ${
                            idx === 0 
                                ? 'bg-amber-500/10 border border-amber-500/30' 
                                : 'bg-slate-800/40 border border-slate-700/50'
                        }`}>
                            <div className={`text-6xl font-black ${idx === 0 ? 'text-amber-500' : 'text-slate-600'}`}>
                                #{idx + 1}
                            </div>
                            <div className="flex-1">
                                <h3 className={`text-4xl font-black uppercase tracking-tight ${idx === 0 ? 'text-amber-400' : 'text-white'}`}>
                                    {m.name}
                                </h3>
                                <p className="text-xl text-slate-400 mt-2">Presente em {m.contractCount} contrato(s)</p>
                            </div>
                            <div className="text-right">
                                <div className={`text-5xl font-black ${idx === 0 ? 'text-amber-500' : 'text-white'}`}>
                                    {m.sqm.toFixed(1)} <span className="text-2xl">m²</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {top3.length === 0 && (
                        <div className="text-2xl text-slate-500 text-center py-20 font-medium">Nenhum material vendido no período.</div>
                    )}
                </div>

                <div className="col-span-4 flex flex-col gap-8">
                    {/* Mais popular */}
                    {topByContracts && (
                        <div className="bg-blue-500/10 p-8 rounded-[2rem] border border-blue-500/20 shadow-[inset_0_0_30px_rgba(59,130,246,0.05)]">
                            <div className="text-sm text-blue-400 uppercase tracking-widest font-black mb-4">Presente em mais contratos</div>
                            <div className="text-3xl font-black text-white uppercase tracking-tight break-words">{topByContracts.name}</div>
                            <div className="mt-4 text-5xl font-black text-blue-400">{topByContracts.contractCount} <span className="text-xl font-bold">contratos</span></div>
                        </div>
                    )}

                    {/* Restante */}
                    {rest.length > 0 && (
                        <div className="bg-slate-800/40 p-8 rounded-[2rem] border border-slate-700/50 flex-1">
                            <div className="text-sm text-slate-500 uppercase tracking-widest font-black mb-6">Outros Destaques</div>
                            <div className="space-y-4">
                                {rest.map(m => (
                                    <div key={m.id} className="flex justify-between items-center border-b border-slate-700/50 pb-4 last:border-0 last:pb-0">
                                        <div className="font-bold text-slate-300 uppercase truncate pr-4">{m.name}</div>
                                        <div className="font-black text-white whitespace-nowrap">{m.sqm.toFixed(1)} m²</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
