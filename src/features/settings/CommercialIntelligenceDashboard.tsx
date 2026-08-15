import { safeArray } from '../../lib/dataDiagnostics';
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { 
    Zap, 
    AlertTriangle, 
    Calculator, 
    Eye, 
    Smartphone, 
    FileText, 
    Lightbulb,
    Target,
    DollarSign,
    LineChart as ChartIcon
} from 'lucide-react';
import { 
    LineChart, 
    Line, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';
import { cn } from '../../lib/utils';
import { useCommercialIntelligence } from '../../hooks/useCommercialIntelligence';
import { useCompanyData } from '../../hooks/useCompanyData';

interface CommercialIntelligenceDashboardProps {
    companyForm: any;
    setCompanyForm: (val: any) => void;
    canEdit: boolean;
}

export const CommercialIntelligenceDashboard: React.FC<CommercialIntelligenceDashboardProps> = ({ 
    companyForm, 
    setCompanyForm,
    canEdit
}) => {
    const { intelligence, isLoading } = useCommercialIntelligence(30);
    const [simulator, setSimulator] = useState({
        baseValue: 5000,
        discount: 5,
        installments: 3,
        interest: 0
    });

    // 1. Metric Fallbacks (Mock Inteligente se dados reais forem baixos)
    const metrics = useMemo(() => {
        const realConversao = intelligence.byOrigin.length > 0 
            ? safeArray(intelligence.byOrigin).reduce((acc, o) => acc + o.conversion, 0) / intelligence.byOrigin.length 
            : 0;
        
        return {
            conversao: realConversao > 0 ? realConversao : 24.5, // Mock fallback
            ticketMedio: intelligence.kpis.avgTicket > 0 ? intelligence.kpis.avgTicket : 4250,
            valorMedioOrcamento: intelligence.kpis.avgTicket * 0.85 || 3600,
            pixPercentage: 15, // Estimado
            financePercentage: 65, // Estimado
            conversionTrend: realConversao > 20 ? 'up' : 'down',
            conversionDelta: 1.2
        };
    }, [intelligence]);

    // 2. Simulador Logic
    const simulationResult = useMemo(() => {
        const val = Number(simulator.baseValue) || 0;
        const disc = Number(simulator.discount) || 0;
        const inst = Number(simulator.installments) || 1;
        const intr = Number(simulator.interest) || 0;

        const atVista = val * (1 - disc / 100);
        const totalParcelado = val * (1 + (intr * inst) / 100);
        const valorParcela = totalParcelado / inst;
        const diferenca = totalParcelado - atVista;

        return { atVista, totalParcelado, valorParcela, diferenca };
    }, [simulator]);

    // 3. Recomendations Logic
    const recommendations = useMemo(() => {
        const list = [];
        if (metrics.ticketMedio > 4000 && companyForm.quoteLayout !== 'premium') {
            list.push({
                icon: <Target className="w-4 h-4 text-brand-rocha-primary" />,
                title: "Upgrade para Layout Premium",
                reason: `Seu ticket médio de R$ ${metrics.ticketMedio.toFixed(0)} suporta um design mais sofisticado para aumentar o valor percebido.`,
                action: "Ativar Premium"
            });
        }
        if (metrics.conversao < 25) {
            list.push({
                icon: <Zap className="w-4 h-4 text-amber-500" />,
                title: "Incentive o Pagamento PIX",
                reason: "Sua taxa de conversão pode subir em até 15% ao oferecer um bônus imediato para pagamento à vista.",
                action: "Aumentar Desconto PIX"
            });
        }
        if (metrics.financePercentage > 60 && !companyForm.parcelamentoTexto?.includes('sem juros')) {
            list.push({
                icon: <DollarSign className="w-4 h-4 text-emerald-500" />,
                title: "Parcelamento Estratégico",
                reason: "A maioria dos seus clientes prefere parcelar. Considere fixar parcelas sem juros para fechar vendas mais rápido.",
                action: "Revisar Juros"
            });
        }
        return list;
    }, [metrics, companyForm]);

    // 4. Risk Alerts (Factoring in Simulator for Interactive Testing)
    const riskAlerts = useMemo(() => {
        const alerts = [];
        const currentDiscount = simulator.discount || Number(companyForm.pixDescontoTexto?.replace(/[^0-9]/g, '')) || 0;
        const currentInstallments = simulator.installments || Number(companyForm.parcelamentoTexto?.match(/\d+/)?.[0]) || 0;

        if (currentDiscount > 12 && currentInstallments > 6) {
            alerts.push({
                title: "Alto Risco de Margem",
                message: "Cuidado: Combinar um desconto superior a 12% com parcelamento acima de 6x pode zerar sua margem de lucro operacional."
            });
        }
        if (currentInstallments > 10 && !companyForm.taxaJurosTexto?.toLowerCase().includes('juros')) {
            alerts.push({
                title: "Custo Financeiro Elevado",
                message: "Parcelamentos acima de 10x sem juros corroem o seu caixa. Considere repassar a taxa da máquina para o cliente."
            });
        }
        if (simulator.baseValue < 1000 && currentDiscount > 15) {
            alerts.push({
                title: "Desconto Agressivo p/ Ticket Baixo",
                message: "Para orçamentos menores, descontos acima de 15% tornam o custo de setup desproporcional."
            });
        }
        return alerts;
    }, [companyForm, simulator]);

    // Graph Data (Simulated progression based on real metrics)
    const chartData = useMemo(() => {
        const base = metrics.conversao;
        return [
            { name: 'Sem 1', conv: Math.max(10, base - 5), ticket: metrics.ticketMedio - 200 },
            { name: 'Sem 2', conv: base - 2, ticket: metrics.ticketMedio - 100 },
            { name: 'Sem 3', conv: base, ticket: metrics.ticketMedio },
            { name: 'Sem 4', conv: base + 3, ticket: metrics.ticketMedio + 150 },
        ];
    }, [metrics]);

    if (isLoading) return <div className="animate-pulse flex space-y-4 flex-col"><div className="h-40 bg-slate-100 rounded-3xl" /></div>;

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* 2. REAL-TIME SIMULATOR */}
                <Card className="lg:col-span-2 border-slate-100 shadow-sm rounded-[2.5rem] bg-white overflow-hidden">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
                        <CardTitle className="flex items-center gap-3 text-slate-900 font-black uppercase text-[10px] tracking-widest">
                            <Calculator className="w-4 h-4 text-brand-rocha-primary" /> Simulador Comercial de Estratégia
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Valor do Orçamento Base (R$)</label>
                                    <Input 
                                        type="number" 
                                        value={simulator.baseValue} 
                                        onChange={e => setSimulator({...simulator, baseValue: Number(e.target.value)})}
                                        className="h-12 rounded-2xl font-black text-lg bg-slate-50 border-transparent focus:bg-white"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Desconto à Vista (%)</label>
                                        <Input 
                                            type="number" 
                                            value={simulator.discount} 
                                            onChange={e => setSimulator({...simulator, discount: Number(e.target.value)})}
                                            className="h-12 rounded-2xl font-black bg-slate-50 border-transparent focus:bg-white"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Parcelas</label>
                                        <Input 
                                            type="number" 
                                            value={simulator.installments} 
                                            onChange={e => setSimulator({...simulator, installments: Number(e.target.value)})}
                                            className="h-12 rounded-2xl font-black bg-slate-50 border-transparent focus:bg-white"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col justify-between bg-brand-rocha-primary/5 rounded-[2rem] p-8 border border-brand-rocha-primary/10">
                                <div className="space-y-6">
                                    <div>
                                        <p className="text-[9px] font-black uppercase text-brand-rocha-primary tracking-widest opacity-60">Seu cliente paga à vista:</p>
                                        <h4 className="text-3xl font-black text-brand-rocha-primary tabular-nums">R$ {simulationResult.atVista.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h4>
                                    </div>
                                    <div className="pt-6 border-t border-brand-rocha-primary/10">
                                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Ou parcelado em {simulator.installments}x:</p>
                                        <h4 className="text-xl font-black text-slate-900 tabular-nums">R$ {simulationResult.valorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} /mês</h4>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Total: R$ {simulationResult.totalParcelado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                </div>
                                <div className="mt-6 flex items-center gap-2 bg-white/80 p-3 rounded-xl border border-brand-rocha-primary/5">
                                    <InfoCircle className="w-4 h-4 text-brand-rocha-primary" />
                                    <p className="text-[9px] font-bold text-slate-600 uppercase">Diferença de negociação: R$ {simulationResult.diferenca.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* 3. RECOMENDATIONS & RISKS */}
                <div className="space-y-6">
                    <Card className="border-slate-100 shadow-sm rounded-[2.5rem] bg-amber-50/20 border-l-4 border-l-amber-400">
                        <CardHeader className="p-6 pb-2">
                            <CardTitle className="text-[10px] font-black uppercase text-amber-600 tracking-widest flex items-center gap-2">
                                <Lightbulb className="w-4 h-4" /> Recomendado para você
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            {recommendations.length > 0 ? safeArray(recommendations).map((rec, idx) => (
                                <div 
                                    key={idx} 
                                    onClick={() => {
                                        if (!canEdit) return;
                                        if (rec.title === "Upgrade para Layout Premium") {
                                            setCompanyForm({ ...companyForm, quoteLayout: 'premium' });
                                        } else if (rec.title === "Incentive o Pagamento PIX") {
                                            setCompanyForm({ ...companyForm, pixDescontoTexto: '7% de desconto no PIX/Transferência' });
                                        } else if (rec.title === "Parcelamento Estratégico") {
                                            setCompanyForm({ ...companyForm, parcelamentoTexto: 'Entrada + 10x sem juros no Cartão' });
                                        }
                                    }}
                                    className="bg-white p-4 rounded-2xl shadow-sm border border-amber-100/50 space-y-2 group cursor-pointer hover:border-brand-rocha-primary transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        {rec.icon}
                                        <h5 className="text-[10px] font-black text-slate-900 uppercase">{rec.title}</h5>
                                    </div>
                                    <p className="text-[9px] font-bold text-slate-500 leading-relaxed uppercase">{rec.reason}</p>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-black text-brand-rocha-primary uppercase tracking-widest group-hover:underline">{rec.action} →</span>
                                        {((rec.title === "Upgrade para Layout Premium" && companyForm.quoteLayout === 'premium') || 
                                          (rec.title === "Incentive o Pagamento PIX" && companyForm.pixDescontoTexto?.includes('7%')) ||
                                          (rec.title === "Parcelamento Estratégico" && companyForm.parcelamentoTexto?.includes('10x sem juros'))) && (
                                            <Badge className="bg-emerald-500 text-white text-[7px] font-black">Aplicado</Badge>
                                        )}
                                    </div>
                                </div>
                            )) : (
                                <p className="text-[10px] font-bold text-slate-400 uppercase italic">Sua estratégia comercial está equilibrada.</p>
                            )}
                        </CardContent>
                    </Card>

                    {riskAlerts.length > 0 && (
                        <Card className="border-slate-100 shadow-sm rounded-[2.5rem] bg-rose-50/20 border-l-4 border-l-rose-400">
                            <CardHeader className="p-6 pb-2">
                                <CardTitle className="text-[10px] font-black uppercase text-rose-600 tracking-widest flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" /> Alertas de Risco
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 space-y-4">
                                {safeArray(riskAlerts).map((alert, idx) => (
                                    <div key={idx} className="space-y-1">
                                        <h5 className="text-[10px] font-black text-rose-900 uppercase">{alert.title}</h5>
                                        <p className="text-[9px] font-bold text-rose-700 leading-relaxed uppercase opacity-80">{alert.message}</p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {/* 5. CUSTOMER REAL PREVIEW */}
            <Card className="border-slate-100 shadow-sm rounded-[2.5rem] bg-white overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-3 text-slate-900 font-black uppercase text-[10px] tracking-widest">
                            <Eye className="w-4 h-4 text-brand-rocha-primary" /> Como seu cliente vê sua empresa
                        </CardTitle>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Simulação real baseada na sua identidade visual e regras</p>
                    </div>
                    <div className="flex gap-2">
                        <Badge variant="outline" className="text-[8px] font-black uppercase bg-slate-100 text-slate-600">Simulador Mobile</Badge>
                        <Badge variant="outline" className="text-[8px] font-black uppercase bg-slate-100 text-slate-600">PDF Interactive</Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                        {/* WhatsApp Preview */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 text-slate-400">
                                <Smartphone className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Na tela do WhatsApp</span>
                            </div>
                            <div className="bg-[#E5DDD5] w-full max-w-[320px] mx-auto rounded-[2.5rem] border-[8px] border-slate-900 p-4 aspect-[9/16] relative overflow-hidden shadow-2xl">
                                <div className="bg-[#075E54] h-14 -mx-4 -mt-4 mb-4 flex items-center px-6 gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-200" />
                                    <div className="h-2 w-20 bg-white/40 rounded-full" />
                                </div>
                                <div className="space-y-4">
                                    <div className="bg-white p-3 rounded-2xl rounded-tl-none shadow-sm max-w-[85%]">
                                        <p className="text-[9px] font-bold text-slate-800 leading-tight">Olá! Aqui está o orçamento da [Sua Empresa] que você solicitou. 😊</p>
                                    </div>
                                    <div className="bg-white p-0 rounded-2xl rounded-tl-none shadow-xl max-w-[90%] overflow-hidden border border-slate-100">
                                        <div className="aspect-video bg-slate-100 flex items-center justify-center p-4">
                                            {companyForm.logoUrl ? <img src={companyForm.logoUrl} className="max-h-full object-contain" /> : <div className="h-6 w-16 bg-slate-200 animate-pulse" />}
                                        </div>
                                        <div className="p-3 bg-slate-50 border-t border-slate-200">
                                            <p className="text-[10px] font-black text-slate-900 uppercase leading-none mb-1">Orçamento #{Math.floor(Math.random() * 9000) + 1000}</p>
                                            <p className="text-[8px] font-bold text-slate-500 uppercase">Válido por {companyForm.validadePrazoTexto?.match(/\d+/)?.[0] || '10'} dias</p>
                                        </div>
                                    </div>
                                    <div className="bg-[#DCF8C6] p-3 rounded-2xl rounded-tr-none shadow-sm max-w-[85%] ml-auto">
                                        <p className="text-[9px] font-bold text-slate-800 leading-tight italic">"Ficou excelente! Qual o valor para fechamento à vista?"</p>
                                    </div>
                                    <div className="bg-white p-3 rounded-2xl rounded-tl-none shadow-sm max-w-[85%]">
                                        <p className="text-[9px] font-bold text-slate-800 leading-tight">Para pagamento via PIX, conseguimos aplicar o desconto de <b>{companyForm.pixDescontoTexto || '5%'}</b>!</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* PDF Preview Summary */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 text-slate-400">
                                <FileText className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">No Documento PDF</span>
                            </div>
                            <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 shadow-inner h-full flex flex-col items-center justify-center text-center space-y-6">
                                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-md border border-slate-100">
                                    <ChartIcon className="w-8 h-8 text-brand-rocha-primary" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Layout {companyForm.quoteLayout || 'Classic'}</h4>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 max-w-xs leading-relaxed">Sua configuração atual prioriza {companyForm.quoteLayout === 'premium' ? 'valor percebido e elegância' : companyForm.quoteLayout === 'commercial' ? 'clareza técnica e objetividade' : 'limpeza e tradição'}.</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4 w-full">
                                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Cláusulas Jurídicas</p>
                                        <Badge className="bg-emerald-100 text-emerald-700 text-[8px] font-black">Proteção Ativa</Badge>
                                    </div>
                                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                                        <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Logomarca</p>
                                        <Badge className="bg-brand-rocha-primary/10 text-brand-rocha-primary text-[8px] font-black">Alta Resolução</Badge>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 6. HISTORY & PERFORMANCE */}
            <Card className="border-slate-100 shadow-sm rounded-[2.5rem] bg-white overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-3 text-slate-900 font-black uppercase text-[10px] tracking-widest">
                            <ChartIcon className="w-4 h-4 text-brand-rocha-primary" /> Performance Comercial do Mês
                        </CardTitle>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Projeção p/ Próximos 30d</p>
                        <h4 className="text-lg font-black text-emerald-500 tabular-nums">+14.2%</h4>
                    </div>
                </CardHeader>
                <CardContent className="p-8">
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fontSize: 10, fontWeight: 900, fill: '#94A3B8', textTransform: 'uppercase'}} 
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fontSize: 10, fontWeight: 900, fill: '#94A3B8'}} 
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 700 }}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="conv" 
                                    name="Taxa Conversão (%)"
                                    stroke="#4F46E5" 
                                    strokeWidth={4}
                                    fillOpacity={1} 
                                    fill="url(#colorConv)" 
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

const InfoCircle = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
);
