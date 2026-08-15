import { safeArray } from '../../lib/dataDiagnostics';
import React, { useMemo, useState } from 'react';
import { 
    AlertCircle, 
    AlertTriangle, 
    Zap, 
    Clock,
    X,
    Rocket
} from 'lucide-react';
import { useInfluencerAlerts } from '../../hooks/useInfluencerAlerts';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/utils';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { openWhatsAppFollowUp } from '../../utils/whatsappHelper';
import { CommercialActionTrigger } from '../../components/CommercialActionTrigger';

export const InfluencerAlertsPanel: React.FC = () => {
    const { alerts, isLoading } = useInfluencerAlerts();
    const [selectedSeverity, setSelectedSeverity] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
    
    const filteredAlerts = useMemo(() => {
        return safeArray(alerts).filter(a => selectedSeverity === 'all' || a.severity === selectedSeverity);
    }, [alerts, selectedSeverity]);

    const stats = useMemo(() => {
        return {
            critical: safeArray(alerts).filter(a => a.severity === 'critical').length,
            warning: safeArray(alerts).filter(a => a.severity === 'warning').length,
            info: safeArray(alerts).filter(a => a.severity === 'info').length
        };
    }, [alerts]);

    const handleWhatsApp = (influencerName: string) => {
        const text = `Olá ${influencerName}, tudo bem? Me chamo... da Marble Flow. Estava passando por aqui para agradecer nossa parceria e perguntar...`;
        openWhatsAppFollowUp('', text);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in-50 duration-500">
            {/* Header / Summary Mini-Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <button
                    onClick={() => setSelectedSeverity('critical')}
                    className={cn(
                        "p-6 rounded-[2.5rem] border-2 transition-all text-left group",
                        selectedSeverity === 'critical' ? "bg-rose-50 border-rose-500 shadow-lg shadow-rose-200" : "bg-white dark:bg-slate-900 border-slate-100 dark:border-white/5"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <div className="h-10 w-10 bg-rose-500/10 text-rose-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <AlertCircle className="h-5 w-5" />
                        </div>
                        <span className="text-3xl font-black text-rose-600">{stats.critical}</span>
                    </div>
                    <p className="mt-4 text-[10px] font-black text-rose-800 uppercase tracking-widest">Ações Críticas</p>
                    <p className="text-[9px] font-bold text-rose-400 uppercase mt-0.5">Inatividade Imediata</p>
                </button>

                <button
                    onClick={() => setSelectedSeverity('warning')}
                    className={cn(
                        "p-6 rounded-[2.5rem] border-2 transition-all text-left group",
                        selectedSeverity === 'warning' ? "bg-amber-50 border-amber-500 shadow-lg shadow-amber-200" : "bg-white dark:bg-slate-900 border-slate-100 dark:border-white/5"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <div className="h-10 w-10 bg-amber-500/10 text-amber-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <span className="text-3xl font-black text-amber-600">{stats.warning}</span>
                    </div>
                    <p className="mt-4 text-[10px] font-black text-amber-800 uppercase tracking-widest">Atenção</p>
                    <p className="text-[9px] font-bold text-amber-400 uppercase mt-0.5">Alertas em Risco</p>
                </button>

                <button
                    onClick={() => setSelectedSeverity('info')}
                    className={cn(
                        "p-6 rounded-[2.5rem] border-2 transition-all text-left group",
                        selectedSeverity === 'info' ? "bg-emerald-50 border-emerald-500 shadow-lg shadow-emerald-200" : "bg-white dark:bg-slate-900 border-slate-100 dark:border-white/5"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <div className="h-10 w-10 bg-emerald-500/10 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Zap className="h-5 w-5" />
                        </div>
                        <span className="text-3xl font-black text-emerald-600">{stats.info}</span>
                    </div>
                    <p className="mt-4 text-[10px] font-black text-emerald-800 uppercase tracking-widest">Oportunidades</p>
                    <p className="text-[9px] font-bold text-emerald-400 uppercase mt-0.5">Performance e Potencial</p>
                </button>
            </div>

            {/* Main Alertas List */}
            <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-[0.2em] flex items-center gap-2">
                        <Clock className="h-4 w-4 text-slate-400" /> Fluxo de Inteligência Comercial
                    </h3>
                    {selectedSeverity !== 'all' && (
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setSelectedSeverity('all')}
                            className="text-[10px] uppercase font-black text-slate-400 hover:text-slate-900"
                        >
                            <X className="h-3 w-3 mr-2" /> Limpar Filtro
                        </Button>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {filteredAlerts.length > 0 ? (
                        safeArray(filteredAlerts).map(alert => (
                            <div 
                                key={alert.id} 
                                className={cn(
                                    "p-6 rounded-[2rem] border transition-all flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm hover:shadow-md",
                                    alert.severity === 'critical' ? "bg-white border-rose-100 dark:bg-rose-900/5 dark:border-rose-500/20" :
                                    alert.severity === 'warning' ? "bg-white border-amber-100 dark:bg-amber-900/5 dark:border-amber-500/20" :
                                    "bg-white border-emerald-100 dark:bg-emerald-900/5 dark:border-emerald-500/20"
                                )}
                            >
                                <div className="flex items-center gap-6 flex-1">
                                    <div className={cn(
                                        "h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm font-black text-sm",
                                        alert.severity === 'critical' ? "bg-rose-500 text-white" :
                                        alert.severity === 'warning' ? "bg-amber-500 text-white" : "bg-emerald-500 text-white"
                                    )}>
                                        {alert.influencerName.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-3">
                                            <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{alert.influencerName}</h4>
                                            <Badge className={cn(
                                                "text-[8px] font-black uppercase border-none px-2 py-0.5",
                                                alert.type === 'inactivity' ? "bg-rose-500/10 text-rose-600" :
                                                alert.type === 'financial_risk' ? "bg-rose-600 text-white" :
                                                alert.type === 'high_performance' ? "bg-emerald-500/10 text-emerald-600" :
                                                alert.type === 'conversion_risk' ? "bg-amber-500/10 text-amber-600" :
                                                "bg-blue-500/10 text-blue-600"
                                            )}>
                                                {alert.type === 'inactivity' ? 'Inatividade' : 
                                                 alert.type === 'financial_risk' ? 'Risco Financeiro' :
                                                 alert.type === 'high_performance' ? 'Alta Performance' : 
                                                 alert.type === 'conversion_risk' ? 'Risco Conversão' :
                                                 alert.type === 'potential' ? 'Potencial' : 'Queda'}
                                            </Badge>
                                        </div>
                                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed">
                                            {alert.message}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 w-full md:w-auto">
                                    <CommercialActionTrigger 
                                        variant="sm"
                                        triggerLabel="Gerar Ação"
                                        defaultData={{
                                            title: `Tratar Alerta: ${alert.influencerName}`,
                                            type: alert.type === 'inactivity' ? 'reativacao' : 'followup',
                                            sourceType: 'alerta',
                                            sourceId: alert.id,
                                            influencerId: alert.influencerId,
                                            influencerName: alert.influencerName,
                                            priority: alert.severity === 'critical' ? 'critical' : 'high'
                                        }}
                                    />
                                    <Button 
                                        onClick={() => handleWhatsApp(alert.influencerName)}
                                        className="h-9 px-4 bg-[#25D366] hover:bg-[#20bd5c] text-white rounded-xl border-none font-black uppercase text-[9px] tracking-widest shadow-xl shadow-emerald-950/10"
                                    >
                                        <WhatsAppIcon className="h-3.5 w-3.5 mr-2" /> WhatsApp
                                    </Button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="p-20 bg-slate-50/50 dark:bg-slate-900/50 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-white/5 flex flex-col items-center text-center">
                            <Rocket className="h-12 w-12 text-slate-200 mb-4" />
                            <p className="text-sm font-black text-slate-400 uppercase tracking-widest leading-loose">Nenhum alerta pendente para esta severidade.</p>
                            <p className="text-[10px] font-bold text-slate-300 uppercase mt-1">Sua rede está operando dentro dos parâmetros de normalidade.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
