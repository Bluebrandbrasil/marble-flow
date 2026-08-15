import { safeArray } from '../../lib/dataDiagnostics';
import React, { useState, useMemo } from 'react';
import { 
    Crown, Flame, AlertTriangle, Snowflake, 
    Search, Filter, Rocket
} from 'lucide-react';
import { useInfluencerRanking } from '../../hooks/useInfluencerRanking';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/utils';

export const InfluencerRankingView: React.FC = () => {
    const [periodDays, setPeriodDays] = useState(30);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'risk' | 'inactive'>('all');
    
    const { rankingData } = useInfluencerRanking(periodDays);

    const filteredData = useMemo(() => {
        return safeArray(rankingData).filter(inf => {
            const matchesSearch = inf.influencerName.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'all' || inf.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [rankingData, searchTerm, statusFilter]);

    const top3 = filteredData.slice(0, 3);

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <div className="space-y-12 pb-20 animate-in fade-in-50 duration-500">
            {/* Header / Period Selection */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter flex items-center gap-3">
                        Ranking de Influencers <Crown className="h-8 w-8 text-amber-500 fill-amber-500" />
                    </h2>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Inteligência de Rede e Performance Comercial</p>
                </div>
                
                <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-2xl">
                    {[
                        { label: '7 DIAS', val: 7 },
                        { label: '30 DIAS', val: 30 },
                        { label: '90 DIAS', val: 90 },
                        { label: 'GERAL', val: 0 }
                    ].map(p => (
                        <button
                            key={p.val}
                            onClick={() => setPeriodDays(p.val)}
                            className={cn(
                                "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                periodDays === p.val 
                                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm" 
                                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            )}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* PODIUM (Top 3) */}
            {top3.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end max-w-5xl mx-auto py-10">
                    {/* Position 2 (Left) */}
                    {top3[1] && (
                        <div className="flex flex-col items-center order-2 md:order-1 group">
                            <div className="relative mb-6">
                                <div className="h-28 w-28 bg-slate-100 dark:bg-slate-800 rounded-3xl border-4 border-slate-200 dark:border-white/10 flex items-center justify-center font-black text-2xl text-slate-400 group-hover:scale-105 transition-transform">
                                    {top3[1].influencerName.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="absolute -top-4 -right-4 h-12 w-12 bg-slate-300 dark:bg-slate-500 rounded-full flex items-center justify-center shadow-lg border-4 border-white dark:border-slate-900">
                                    <span className="text-white font-black text-xl">🥈</span>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-slate-900/50 p-6 rounded-[2.5rem] w-full text-center border border-slate-100 dark:border-white/5 shadow-premium group-hover:border-slate-300 transition-all">
                                <h4 className="text-sm font-black text-slate-700 dark:text-white uppercase truncate px-4">{top3[1].influencerName}</h4>
                                <p className="text-xs font-black text-brand-emerald mt-1">{formatCurrency(top3[1].volumeVendas)}</p>
                                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-50 dark:border-white/5 pt-4">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-400 uppercase">Fechados</span>
                                        <span className="text-lg font-black text-slate-900 dark:text-white">{top3[1].totalFechados}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-400 uppercase">Conv.</span>
                                        <span className="text-lg font-black text-slate-900 dark:text-white">{top3[1].taxaConversao.toFixed(1)}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Position 1 (Center) */}
                    <div className="flex flex-col items-center order-1 md:order-2 scale-110 -translate-y-4 group">
                        <div className="relative mb-8">
                            <div className="h-36 w-36 bg-amber-500 text-white rounded-[2.5rem] border-8 border-amber-500/20 flex items-center justify-center font-black text-4xl shadow-2xl shadow-amber-500/20 group-hover:scale-105 transition-transform">
                                {top3[0].influencerName.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="absolute -top-6 -right-6 h-16 w-16 bg-amber-400 rounded-full flex items-center justify-center shadow-2xl border-4 border-white dark:border-slate-900 animate-bounce">
                                <span className="text-white font-black text-2xl">🥇</span>
                            </div>
                            <Rocket className="absolute -bottom-4 -left-4 text-emerald-500 h-8 w-8 animate-pulse" />
                        </div>
                        <div className="bg-slate-900 text-white p-8 rounded-[3rem] w-full text-center shadow-2xl shadow-slate-950/40 group-hover:bg-slate-800 transition-all">
                            <Badge className="bg-amber-400 text-slate-900 font-black text-[8px] uppercase tracking-widest mb-3 border-none">TOP PERFORMANCE</Badge>
                            <h4 className="text-lg font-black uppercase truncate tracking-tighter">{top3[0].influencerName}</h4>
                            <p className="text-sm font-black text-emerald-400 mt-1">{formatCurrency(top3[0].volumeVendas)}</p>
                            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/5 pt-6">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-slate-400 uppercase opacity-60">Fechados</span>
                                    <span className="text-2xl font-black">{top3[0].totalFechados}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-slate-400 uppercase opacity-60">Conversão</span>
                                    <span className="text-2xl font-black text-emerald-400">{top3[0].taxaConversao.toFixed(1)}%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Position 3 (Right) */}
                    {top3[2] && (
                        <div className="flex flex-col items-center order-3 group">
                            <div className="relative mb-6">
                                <div className="h-28 w-28 bg-slate-100 dark:bg-slate-800 rounded-3xl border-4 border-slate-200 dark:border-white/10 flex items-center justify-center font-black text-2xl text-slate-400 group-hover:scale-105 transition-transform">
                                    {top3[2].influencerName.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="absolute -top-4 -right-4 h-12 w-12 bg-orange-200 dark:bg-orange-700 rounded-full flex items-center justify-center shadow-lg border-4 border-white dark:border-slate-900">
                                    <span className="text-white font-black text-xl">🥉</span>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-slate-900/50 p-6 rounded-[2.5rem] w-full text-center border border-slate-100 dark:border-white/5 shadow-premium group-hover:border-slate-300 transition-all">
                                <h4 className="text-sm font-black text-slate-700 dark:text-white uppercase truncate px-4">{top3[2].influencerName}</h4>
                                <p className="text-xs font-black text-brand-emerald mt-1">{formatCurrency(top3[2].volumeVendas)}</p>
                                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-50 dark:border-white/5 pt-4">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-400 uppercase">Fechados</span>
                                        <span className="text-lg font-black text-slate-900 dark:text-white">{top3[2].totalFechados}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-400 uppercase">Conv.</span>
                                        <span className="text-lg font-black text-slate-900 dark:text-white">{top3[2].taxaConversao.toFixed(1)}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* FULL LIST & FILTERS */}
            <div className="space-y-6 pt-10">
                <div className="flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex gap-2">
                        {[
                            { id: 'all', label: 'Todos', icon: Filter },
                            { id: 'active', label: 'Ativos', icon: Flame, color: 'text-emerald-500' },
                            { id: 'risk', label: 'Em Risco', icon: AlertTriangle, color: 'text-amber-500' },
                            { id: 'inactive', label: 'Inativos', icon: Snowflake, color: 'text-blue-400' }
                        ].map(f => (
                            <button
                                key={f.id}
                                onClick={() => setStatusFilter(f.id as any)}
                                className={cn(
                                    "flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
                                    statusFilter === f.id
                                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xl"
                                        : "bg-white dark:bg-slate-900 text-slate-500"
                                )}
                            >
                                <f.icon className={cn("h-3.5 w-3.5", statusFilter === f.id ? "text-white dark:text-slate-900" : f.color)} /> {f.label}
                            </button>
                        ))}
                    </div>

                    <div className="relative flex-1 max-w-md group">
                        <Search className={cn("absolute left-4 top-1/2 -translate-y-1/2 h-4.5 w-4.5 transition-colors", searchTerm ? "text-brand-emerald" : "text-slate-400")} />
                        <Input 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="BUSCAR INFLUENCER..." 
                            className="h-14 pl-12 bg-white dark:bg-slate-900 border-none rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-brand-emerald/20 transition-all shadow-sm"
                        />
                    </div>
                </div>

            <div className="bg-white dark:bg-slate-900/50 rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-premium overflow-hidden">
                {filteredData.length === 0 ? (
                    <div className="p-20 text-center flex flex-col items-center justify-center gap-4">
                        <Crown className="h-12 w-12 text-slate-300" />
                        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">
                            {searchTerm || statusFilter !== 'all' 
                                ? "Nenhum parceiro encontrado para esta busca." 
                                : "Nenhum parceiro cadastrado ainda."}
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-white/2 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-white/10">
                                <th className="px-10 py-6">Posição</th>
                                <th className="px-10 py-6">Influencer / Status</th>
                                <th className="px-6 py-6 text-center">Clientes Indicados</th>
                                <th className="px-6 py-6 text-center">Contratos Fechados</th>
                                <th className="px-6 py-6 text-center">Conversão</th>
                                <th className="px-6 py-6 text-center">Inatividade</th>
                                <th className="px-10 py-6 text-right">Valor Fechado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                            {safeArray(filteredData).map((inf, idx) => (
                                <tr key={inf.influencerId} className="hover:bg-slate-50 dark:hover:bg-white/2 transition-colors group">
                                    <td className="px-10 py-6">
                                        <div className={cn(
                                            "h-10 w-10 rounded-xl flex items-center justify-center font-black text-[11px] border-2",
                                            idx === 0 ? "border-amber-400 text-amber-500 bg-amber-50 dark:bg-amber-500/5" :
                                            idx === 1 ? "border-slate-300 text-slate-500 bg-slate-50 dark:bg-slate-500/5" :
                                            idx === 2 ? "border-orange-300 text-orange-500 bg-orange-50 dark:bg-orange-500/5" :
                                            "border-slate-100 dark:border-white/5 text-slate-400"
                                        )}>
                                            {idx + 1}º
                                        </div>
                                    </td>
                                    <td className="px-10 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-800 dark:text-white uppercase">{inf.influencerName}</span>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    {inf.status === 'active' && <Badge className="bg-emerald-500/10 text-emerald-500 border-none px-2 py-0.5 text-[8px] font-black uppercase"><Flame className="h-2 w-2 mr-1" /> Ativo</Badge>}
                                                    {inf.status === 'risk' && <Badge className="bg-amber-500/10 text-amber-500 border-none px-2 py-0.5 text-[8px] font-black uppercase"><AlertTriangle className="h-2 w-2 mr-1" /> Em Risco</Badge>}
                                                    {inf.status === 'inactive' && <Badge className="bg-slate-100 dark:bg-white/5 text-slate-400 border-none px-2 py-0.5 text-[8px] font-black uppercase"><Snowflake className="h-2 w-2 mr-1" /> Inativo</Badge>}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 text-center">
                                        <span className="text-sm font-black text-slate-900 dark:text-white">{inf.totalLeads}</span>
                                    </td>
                                    <td className="px-6 py-6 text-center">
                                        <span className="text-sm font-black text-slate-900 dark:text-white">{inf.totalFechados}</span>
                                    </td>
                                    <td className="px-6 py-6 text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-xs font-black text-brand-emerald">{inf.taxaConversao.toFixed(1)}%</span>
                                            <div className="h-1 w-12 bg-slate-100 dark:bg-white/5 rounded-full">
                                                <div className="h-full bg-brand-emerald rounded-full" style={{ width: `${inf.taxaConversao}%` }} />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 text-center">
                                        <span className={cn(
                                            "text-[10px] font-bold uppercase",
                                            inf.tempoSemIndicacao < 15 ? "text-emerald-500" :
                                            inf.tempoSemIndicacao <= 30 ? "text-amber-500" : "text-rose-500"
                                        )}>
                                            {inf.tempoSemIndicacao === 0 ? 'Hoje' : 
                                             inf.tempoSemIndicacao === 999 ? 'Nunca' : `${inf.tempoSemIndicacao} dias`}
                                        </span>
                                    </td>
                                    <td className="px-10 py-6 text-right">
                                        <span className="text-xs font-black text-slate-550 dark:text-slate-400">{formatCurrency(inf.volumeVendas)}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            </div>
        </div>
    );
};
