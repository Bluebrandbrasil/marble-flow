import React from 'react';

interface Props {
    metrics: {
        createdQuotes: number;
        generatedContracts: number;
        signedContracts: number;
        conversionToContract: number;
        conversionToSignature: number;
        totalGeneratedAmount: number;
        totalSignedAmount: number;
    }
}

export const CommercialPerformanceSlide: React.FC<Props> = ({ metrics }) => {
    return (
        <div className="flex flex-col h-full bg-slate-900 text-white p-12">
            <header className="mb-12 border-b border-slate-800 pb-8">
                <h1 className="text-6xl font-black text-white uppercase tracking-tighter">Desempenho Comercial</h1>
                <p className="text-2xl text-slate-400 font-medium mt-2">Visão dos Últimos 30 Dias</p>
            </header>

            <div className="flex-1 grid grid-cols-3 gap-8">
                <div className="col-span-3 grid grid-cols-3 gap-8 mb-4">
                    <div className="bg-slate-800/40 p-8 rounded-[2rem] border border-slate-700/50 flex flex-col justify-center">
                        <div className="text-xl text-slate-400 uppercase tracking-widest font-black mb-4">Orçamentos Criados</div>
                        <div className="text-8xl font-black text-white">{metrics.createdQuotes}</div>
                    </div>

                    <div className="bg-blue-500/10 p-8 rounded-[2rem] border border-blue-500/20 flex flex-col justify-center shadow-[inset_0_0_50px_rgba(59,130,246,0.05)]">
                        <div className="text-xl text-blue-400 uppercase tracking-widest font-black mb-4">Contratos Gerados</div>
                        <div className="text-8xl font-black text-blue-400">{metrics.generatedContracts}</div>
                        <div className="mt-6 text-2xl font-bold text-blue-200">
                            {metrics.totalGeneratedAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                    </div>

                    <div className="bg-brand-emerald/10 p-8 rounded-[2rem] border border-brand-emerald/30 flex flex-col justify-center shadow-[inset_0_0_50px_rgba(16,185,129,0.05)]">
                        <div className="text-xl text-brand-emerald uppercase tracking-widest font-black mb-4">Contratos Assinados</div>
                        <div className="text-8xl font-black text-brand-emerald">{metrics.signedContracts}</div>
                        <div className="mt-6 text-2xl font-bold text-emerald-200">
                            {metrics.totalSignedAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                    </div>
                </div>

                <div className="col-span-3 grid grid-cols-2 gap-8">
                    <div className="bg-slate-800/40 p-8 rounded-[2rem] border border-slate-700/50 flex flex-col justify-center items-center text-center">
                        <div className="text-xl text-slate-400 uppercase tracking-widest font-black mb-2">Conversão p/ Contrato</div>
                        <div className="text-6xl font-black text-white">{metrics.conversionToContract.toFixed(1)}%</div>
                        <p className="text-slate-500 mt-2 text-sm font-bold uppercase tracking-widest">Contratos Gerados / Orçamentos</p>
                    </div>

                    <div className="bg-slate-800/40 p-8 rounded-[2rem] border border-slate-700/50 flex flex-col justify-center items-center text-center">
                        <div className="text-xl text-slate-400 uppercase tracking-widest font-black mb-2">Conversão p/ Assinatura</div>
                        <div className="text-6xl font-black text-white">{metrics.conversionToSignature.toFixed(1)}%</div>
                        <p className="text-slate-500 mt-2 text-sm font-bold uppercase tracking-widest">Assinados / Contratos Gerados</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
