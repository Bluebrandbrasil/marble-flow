import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { safeArray } from '../../lib/dataDiagnostics';
import { cn } from '../../lib/utils';
import { Trophy, TrendingUp, MapPin, Zap, AlertTriangle, ArrowRight, ExternalLink } from 'lucide-react';
import type { RegionMetrics, PendingRegionQuote } from '../../hooks/useCommercialIntelligence';

interface CommercialRegionsViewProps {
    byRegion: RegionMetrics[];
    pendingRegionQuotes: PendingRegionQuote[];
}

export const CommercialRegionsView: React.FC<CommercialRegionsViewProps> = ({ byRegion, pendingRegionQuotes }) => {
    const formatCurrency = (value: any) => {
        return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const validRegions = safeArray(byRegion).filter(r => r.region !== 'Região não informada');
    
    const topDemand = [...validRegions].sort((a, b) => b.demandAmount - a.demandAmount)[0];
    const topClosedQty = [...validRegions].sort((a, b) => b.closedQty - a.closedQty)[0];
    const topClosedAmount = [...validRegions].sort((a, b) => b.closedAmount - a.closedAmount)[0];
    const topConversion = [...validRegions].filter(r => r.demandQty >= 2).sort((a, b) => b.conversion - a.conversion)[0];

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            {/* Pendências de Região */}
            {safeArray(pendingRegionQuotes).length > 0 && (
                <div className="space-y-4">
                    <Card className="rocha-card border-none bg-rose-50 border-l-4 border-rose-500 p-6 relative overflow-hidden">
                        <AlertTriangle className="absolute right-[-20px] top-[-20px] h-32 w-32 opacity-5 text-rose-500" />
                        <CardDescription className="text-rose-600 uppercase font-black text-[9px] tracking-widest flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4" /> Pendências de Região
                        </CardDescription>
                        <p className="text-2xl font-black mt-2 text-slate-800">{safeArray(pendingRegionQuotes).length} {safeArray(pendingRegionQuotes).length === 1 ? 'orçamento válido sem região' : 'orçamentos válidos sem região'}</p>
                        <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase">Clientes com endereço incompleto que impactam a análise comercial.</p>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {safeArray(pendingRegionQuotes).map(quote => (
                            <Card key={quote.quoteId} className="border border-brand-rocha-border/50 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col justify-between">
                                <div>
                                    <h4 className="font-black text-slate-800 text-sm uppercase truncate" title={quote.clientName}>{quote.clientName}</h4>
                                    <div className="flex justify-between items-center mt-2">
                                        <p className="text-xs font-bold text-emerald-600">{formatCurrency(quote.totalAmount)}</p>
                                        <p className="text-[10px] text-slate-400">{quote.date ? new Date(quote.date).toLocaleDateString('pt-BR') : 'Data não informada'}</p>
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-500 mt-1">{quote.clientPhone || 'Telefone não informado'}</p>
                                    <p className="text-[10px] text-rose-500 font-bold mt-3 p-2 bg-rose-50 rounded-md border border-rose-100">{quote.reason}</p>
                                </div>
                                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                                    <a href={`/app/clients`} className="text-[10px] font-black text-brand-rocha-primary hover:text-brand-rocha-primary/80 uppercase flex items-center gap-1 transition-colors flex-1 text-center justify-center p-2 rounded-lg bg-slate-50 hover:bg-slate-100">
                                        Abrir Cliente <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <a href={`/app/quotes/${quote.quoteId}`} className="text-[10px] font-black text-slate-600 hover:text-slate-800 uppercase flex items-center gap-1 transition-colors flex-1 text-center justify-center p-2 rounded-lg bg-slate-50 hover:bg-slate-100">
                                        Abrir Orç. <ArrowRight className="w-3 h-3" />
                                    </a>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Top Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="rocha-card border-none bg-blue-600 text-white p-6 relative overflow-hidden">
                    <TrendingUp className="absolute right-[-20px] top-[-20px] h-32 w-32 opacity-10" />
                    <CardDescription className="text-blue-100 uppercase font-black text-[9px] tracking-widest">Maior Demanda (R$)</CardDescription>
                    <p className="text-2xl font-black mt-2">{topDemand?.region || 'N/A'}</p>
                    <p className="text-[10px] font-bold text-blue-100 mt-1 uppercase">{formatCurrency(topDemand?.demandAmount)} ({topDemand?.demandQty || 0} orç.)</p>
                </Card>

                <Card className="rocha-card border-none bg-emerald-600 text-white p-6 relative overflow-hidden">
                    <Trophy className="absolute right-[-20px] top-[-20px] h-32 w-32 opacity-10" />
                    <CardDescription className="text-emerald-100 uppercase font-black text-[9px] tracking-widest">Maior Fechamento (Vol)</CardDescription>
                    <p className="text-2xl font-black mt-2">{topClosedQty?.region || 'N/A'}</p>
                    <p className="text-[10px] font-bold text-emerald-100 mt-1 uppercase">{topClosedQty?.closedQty || 0} contratos fechados</p>
                </Card>

                <Card className="rocha-card border-none bg-amber-500 text-white p-6 relative overflow-hidden">
                    <MapPin className="absolute right-[-20px] top-[-20px] h-32 w-32 opacity-10" />
                    <CardDescription className="text-amber-100 uppercase font-black text-[9px] tracking-widest">Maior Faturamento (R$)</CardDescription>
                    <p className="text-2xl font-black mt-2">{topClosedAmount?.region || 'N/A'}</p>
                    <p className="text-[10px] font-bold text-amber-100 mt-1 uppercase">{formatCurrency(topClosedAmount?.closedAmount)}</p>
                </Card>

                <Card className="rocha-card border-none bg-purple-600 text-white p-6 relative overflow-hidden">
                    <Zap className="absolute right-[-20px] top-[-20px] h-32 w-32 opacity-10" />
                    <CardDescription className="text-purple-100 uppercase font-black text-[9px] tracking-widest">Melhor Conversão</CardDescription>
                    <p className="text-2xl font-black mt-2">{topConversion?.region || 'N/A'}</p>
                    <p className="text-[10px] font-bold text-purple-100 mt-1 uppercase">{(topConversion?.conversion || 0).toFixed(1)}% de conversão</p>
                </Card>
            </div>

            {/* Detailed Table */}
            <Card className="rocha-panel p-0 border-none overflow-hidden">
                <div className="p-8 border-b border-brand-rocha-border/30">
                    <h3 className="rocha-text-title text-[11px] uppercase tracking-widest font-black">Detalhamento por Região</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50/50">
                            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-brand-rocha-border/50">
                                <th className="px-6 py-4 text-left">Região</th>
                                <th className="px-6 py-4 text-right">Demanda (Qtd)</th>
                                <th className="px-6 py-4 text-right">Demanda (R$)</th>
                                <th className="px-6 py-4 text-right">Contratos (Qtd)</th>
                                <th className="px-6 py-4 text-right">Faturamento (R$)</th>
                                <th className="px-6 py-4 text-right">Ticket Médio</th>
                                <th className="px-6 py-4 text-right">Conversão</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-rocha-border/30">
                            {safeArray(byRegion).map((r, idx) => (
                                <tr key={r.region} className={cn("hover:bg-slate-50 transition-all", r.region === 'Região não informada' ? 'opacity-60 bg-slate-50/50' : '')}>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            {r.region === 'Região não informada' ? (
                                                <Badge className="bg-slate-200 text-slate-500 border-none">Não Informado</Badge>
                                            ) : (
                                                <span className="text-xs font-black text-slate-800 uppercase">{r.region}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm font-black text-slate-800">{r.demandQty}</td>
                                    <td className="px-6 py-4 text-right text-xs font-bold text-slate-600">{formatCurrency(r.demandAmount)}</td>
                                    <td className="px-6 py-4 text-right text-sm font-black text-emerald-600">{r.closedQty}</td>
                                    <td className="px-6 py-4 text-right text-xs font-bold text-emerald-600">{formatCurrency(r.closedAmount)}</td>
                                    <td className="px-6 py-4 text-right text-xs font-bold text-slate-600">{formatCurrency(r.closedAvgTicket)}</td>
                                    <td className="px-6 py-4 text-right">
                                        <Badge className={cn(
                                            "border-none px-2 py-1 text-[10px] font-black",
                                            r.conversion > 40 ? "bg-emerald-100 text-emerald-700" : 
                                            r.conversion > 20 ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                                        )}>
                                            {r.conversion.toFixed(1)}%
                                        </Badge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
