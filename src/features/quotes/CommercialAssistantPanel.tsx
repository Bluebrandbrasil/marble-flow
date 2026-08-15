import { safeArray, safeHistoryArray } from '../../lib/dataDiagnostics';
import React, { useState, useMemo } from 'react';
import { 
    Sparkles, 
    MessageSquare, 
    Wallet, 
    ShieldAlert, 
    ArrowRight, 
    ChevronDown, 
    ChevronUp,
    Zap,
    Trophy,
    Flame,
    Gem,
    Copy,
    Check,
    Clock
} from 'lucide-react';
import { calculateQuoteScore, getAssistedMessages, analyzeMargin, getOpportunityTimer, getFollowUpCadence } from '../../lib/commercialAssistant';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/utils';
import type { Quote } from '../../types';

interface CommercialAssistantPanelProps {
    quote: Partial<Quote>;
    sellerName: string;
    onApplyDiscount?: (discount: number) => void;
}

export const CommercialAssistantPanel: React.FC<CommercialAssistantPanelProps> = ({ 
    quote, 
    sellerName,
    onApplyDiscount
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    // Ensure we have a valid enough quote for the engine
    const fullQuote = useMemo(() => ({
        id: quote.id || 'draft',
        customerName: quote.customerName || 'Cliente',
        customerPhone: quote.customerPhone || '',
        commercialTotal: quote.commercialTotal || quote.total || 0,
        status: quote.status || 'draft',
        createdAt: quote.createdAt || new Date().toISOString(),
        lastFollowUpAt: quote.lastFollowUpAt,
        discount: quote.discount || 0,
        quoteStage: quote.quoteStage || 'pre_orcamento',
        history: safeHistoryArray(quote.history)
    } as Quote), [quote]);

    const score = useMemo(() => calculateQuoteScore(fullQuote), [fullQuote]);
    const marginAlert = useMemo(() => analyzeMargin(fullQuote), [fullQuote]);
    const messages = useMemo(() => getAssistedMessages(fullQuote, sellerName), [fullQuote, sellerName]);
    const timer = useMemo(() => getOpportunityTimer(fullQuote), [fullQuote]);
    const cadence = useMemo(() => getFollowUpCadence(fullQuote), [fullQuote]);

    const handleCopy = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleWhatsApp = (text: string) => {
        const phone = fullQuote.customerPhone?.replace(/\D/g, '');
        if (phone) {
            window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(text)}`, '_blank');
        }
    };

    return (
        <div className={cn(
            "fixed bottom-32 right-8 z-[60] transition-all duration-500 ease-out",
            isOpen ? "w-[400px]" : "w-14 h-14"
        )}>
            {/* Floating Trigger Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="w-14 h-14 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all group relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-tr from-brand-rocha-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <Sparkles className="h-6 w-6 animate-pulse" />
                    <div className="absolute -top-1 -right-1 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white dark:border-slate-900"></span>
                    </div>
                </button>
            )}

            {/* Panel Content */}
            <div className={cn(
                "bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border border-slate-200 dark:border-white/10 overflow-hidden transition-all duration-500 transform",
                isOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-10 pointer-events-none"
            )}>
                {/* Header */}
                <div className="bg-slate-900 dark:bg-brand-rocha-bg p-6 text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-white/10 flex items-center justify-center">
                            <Zap className="h-5 w-5 text-brand-emerald" />
                        </div>
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-[0.2em]">Pilot Comercial</h3>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">IA de Assistência Ativa</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setIsOpen(false)}
                        className="h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                    >
                        <ChevronDown className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-8">
                    {/* Score & Potential Card */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Análise de Potencial</span>
                            <Badge className={cn(
                                "border-none px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                                score.classification === 'high_potential' ? "bg-emerald-100 text-emerald-600" : 
                                score.classification === 'medium' ? "bg-blue-100 text-blue-600" : "bg-rose-100 text-rose-600"
                            )}>
                                Score: {score.score}
                            </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-[1.5rem] border border-slate-100 dark:border-white/5">
                                <Trophy className="h-4 w-4 text-amber-500 mb-2" />
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Status</p>
                                <p className="text-xs font-black text-slate-900 dark:text-white uppercase truncate mt-0.5">{score.classification.replace('_', ' ')}</p>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-[1.5rem] border border-slate-100 dark:border-white/5">
                                <Clock className="h-4 w-4 text-brand-rocha-primary mb-2" />
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Latência</p>
                                <p className={cn("text-xs font-black uppercase mt-0.5", timer.color)}>{timer.label}</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {safeArray(score.reasons).map((reason, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-tight">
                                    <ArrowRight className="h-3 w-3 text-brand-emerald" />
                                    {reason.replace(/[🟢🟡🔴]/g, '')}
                                </div>
                            ))}
                            <div className="pt-2 border-t border-slate-100 dark:border-white/5">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Próxima Cadência:</p>
                                <p className="text-[10px] font-black text-brand-rocha-primary uppercase mt-0.5">{cadence.label}</p>
                            </div>
                        </div>
                    </div>

                    {/* Margin Protection Alert */}
                    {marginAlert && (
                        <div className="p-6 bg-rose-50 dark:bg-rose-900/10 rounded-[2rem] border-2 border-rose-100 dark:border-rose-900/20 space-y-3">
                            <div className="flex items-center gap-3">
                                <ShieldAlert className="h-6 w-6 text-rose-500" />
                                <h4 className="text-[11px] font-black text-rose-600 uppercase tracking-tight">Proteção de Margem</h4>
                            </div>
                            <p className="text-[10px] font-bold text-rose-500 leading-relaxed uppercase tracking-tight">
                                {marginAlert.message}
                            </p>
                            {marginAlert.suggestions.length > 0 && (
                                <div className="space-y-2 pt-2">
                                    <p className="text-[9px] font-black text-rose-400 uppercase underline">Alternativas sugeridas:</p>
                                    {safeArray(marginAlert.suggestions).map((s, idx) => (
                                        <div key={idx} className="text-[10px] font-black text-rose-700 bg-white/50 py-1.5 px-3 rounded-xl border border-rose-200/50">
                                            {s}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Actions & Messages */}
                    <div className="space-y-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ações de Conversão</span>
                        <div className="space-y-3">
                            {safeArray(messages).map((msg, idx) => (
                                <div key={idx} className="p-5 bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-white/10 hover:border-brand-rocha-primary/50 transition-all group overflow-hidden relative">
                                    <div className="flex items-center justify-between mb-3 relative z-10">
                                        <div className="flex items-center gap-2">
                                            <div className="h-6 w-6 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center">
                                                {msg.scenario === 'pix_incentive' ? <Wallet className="h-3.5 w-3.5 text-emerald-500" /> : <MessageSquare className="h-3.5 w-3.5 text-brand-rocha-primary" />}
                                            </div>
                                            <h5 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-tight">{msg.title}</h5>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button 
                                                onClick={() => handleCopy(msg.message, idx)}
                                                className="h-7 w-7 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center hover:text-brand-rocha-primary transition-colors text-slate-400"
                                            >
                                                {copiedIndex === idx ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 italic line-clamp-3 mb-4 leading-relaxed relative z-10 px-1">
                                        "{msg.message}"
                                    </p>
                                    <Button 
                                        onClick={() => handleWhatsApp(msg.message)}
                                        className="w-full h-12 bg-slate-900 text-white dark:bg-brand-rocha-primary rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 group-hover:scale-[1.02] shadow-xl relative z-10"
                                    >
                                        <MessageSquare className="h-3.5 w-3.5" /> Enviar WhatsApp
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Motivation Quote/Tip */}
                    <div className="p-6 bg-brand-emerald/10 rounded-[2rem] border border-brand-emerald/20 flex items-start gap-4">
                        <Gem className="h-8 w-8 text-brand-emerald shrink-0" />
                        <div>
                            <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase mb-1">Dica do Especialista</p>
                            <p className="text-[10px] font-bold text-emerald-700/80 leading-relaxed tracking-tight">
                                "Foque no valor agregado do serviço de instalação Rocha. Reduzir preço agora pode desvalorizar sua entrega final."
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 bg-slate-50 dark:bg-white/5 border-t border-slate-100 dark:border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Pilot Ativo</span>
                    </div>
                    <span className="text-[9px] font-bold text-slate-400">v1.2 Commercial Assisted</span>
                </div>
            </div>
        </div>
    );
};
