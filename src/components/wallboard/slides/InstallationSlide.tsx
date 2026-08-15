import React from 'react';
import { Order } from '../../../types';

interface Props {
    installation: {
        today: Order[];
        week: Order[];
        completedCount: number;
        avgTime: number;
    }
}

export const InstallationSlide: React.FC<Props> = ({ installation }) => {
    return (
        <div className="flex flex-col h-full bg-slate-900 text-white p-12">
            <header className="mb-12 border-b border-slate-800 pb-8">
                <h1 className="text-6xl font-black text-white uppercase tracking-tighter">Instalação e Montagem</h1>
                <p className="text-2xl text-slate-400 font-medium mt-2">Visão da Equipe de Rua</p>
            </header>

            <div className="flex-1 grid grid-cols-12 gap-8">
                <div className="col-span-7 flex flex-col gap-8">
                    <div className="bg-blue-500/10 p-10 rounded-[2rem] border border-blue-500/20 shadow-[inset_0_0_50px_rgba(59,130,246,0.05)]">
                        <div className="text-2xl text-blue-400 uppercase tracking-widest font-black mb-8">Instalações de Hoje</div>
                        <div className="space-y-4">
                            {installation.today.map(o => (
                                <div key={o.id} className="flex justify-between items-center bg-blue-900/20 p-6 rounded-2xl border border-blue-500/10">
                                    <div className="text-3xl font-black text-white uppercase tracking-tight">{o.customerName}</div>
                                    <div className="text-2xl font-black text-blue-300">OS #{o.protocolNumber}</div>
                                </div>
                            ))}
                            {installation.today.length === 0 && (
                                <div className="text-3xl font-black text-slate-500 py-10 text-center">Nenhuma instalação agendada para hoje.</div>
                            )}
                        </div>
                    </div>

                    <div className="bg-slate-800/40 p-10 rounded-[2rem] border border-slate-700/50 flex-1">
                        <div className="text-2xl text-slate-400 uppercase tracking-widest font-black mb-8">Instalações da Semana</div>
                        <div className="grid grid-cols-2 gap-4">
                            {installation.week.filter(o => !installation.today.find(t => t.id === o.id)).slice(0, 8).map(o => (
                                <div key={o.id} className="bg-slate-900/50 p-5 rounded-xl border border-slate-700/30">
                                    <div className="text-xl font-black text-white truncate uppercase">{o.customerName}</div>
                                    <div className="text-sm font-bold text-slate-400 mt-1">OS #{o.protocolNumber}</div>
                                </div>
                            ))}
                        </div>
                        {installation.week.length === 0 && (
                            <div className="text-xl font-bold text-slate-500 py-10 text-center">Nenhuma instalação agendada na semana.</div>
                        )}
                    </div>
                </div>

                <div className="col-span-5 flex flex-col gap-8">
                    <div className="bg-brand-emerald/10 p-10 rounded-[2rem] border border-brand-emerald/30 shadow-[inset_0_0_50px_rgba(16,185,129,0.05)] flex-1 flex flex-col justify-center text-center">
                        <div className="text-xl text-brand-emerald uppercase tracking-widest font-black mb-6">Tempo Médio Real de Instalação</div>
                        <div className="text-[7rem] leading-none font-black text-white">{installation.avgTime.toFixed(1)} <span className="text-4xl text-emerald-500/50">dias</span></div>
                        <p className="text-emerald-300 mt-6 text-lg font-bold uppercase tracking-widest">Baseado em {installation.completedCount} instalações concluídas</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
