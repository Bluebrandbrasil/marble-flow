import { safeArray } from '../../lib/dataDiagnostics';
import React from 'react';
import { 
    FileEdit, 
    Ruler, 
    FileText, 
    Clock, 
    CheckCircle2, 
    ShoppingCart, 
    ArrowRight,
    Package,
    CheckCircle,
    XCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Quote, Order, Measurement } from '../../types';
import { calculateQuoteTotals, generateQuoteSnapshot } from '../../utils/quoteCalculations';
import { toISODateSafe } from '../../lib/dateWriteUtils';
import { db } from '../../lib/firebase';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';

// Helper to get unified stage from legacy and new fields
export const getEffectiveWorkflowStage = (quote: Quote | null): WorkflowStage => {
    if (!quote) return 'pre_orcamento';

    // 1. REJEIÇÃO / CANCELAMENTO (Prioridade Absoluta)
    if (quote.status === 'rejected') return 'cancelado';
    if (quote.status === 'converted') {
        if (quote.quoteStage === 'em_contrato') return 'em_contrato';
        if (quote.quoteStage === 'pos_medicao') return 'pos_medicao';
        return 'em_producao';
    }
    
    // 2. CICLO NOVO (Rascunho força o início do funil)
    // Mesmo que existam campos legados, draft + pre_orcamento SEMPRE é Pré-Orçamento
    // EXCEÇÃO: Se já existir uma medição vinculada, o estágio evoluiu.
    if (quote.status === 'draft' && (!quote.quoteStage || quote.quoteStage === 'pre_orcamento') && !quote.measurementId) {
        return 'pre_orcamento';
    }

    // 3. VÍNCULO DE MEDIÇÃO (Data Integrity Fallback)
    if (quote.measurementId && (!quote.quoteStage || quote.quoteStage === 'pre_orcamento')) {
        return 'aguardando_medicao';
    }

    if (quote.quoteStage) {
        const s = quote.quoteStage as string;
        if (s === 'pos_medicao' && (quote.status === 'sent' || quote.status === 'viewed' || quote.status === 'negotiating')) {
            return 'revisao_comercial';
        }
        if (s === 'contrato') return 'em_contrato';
        if (s === 'producao') return 'em_producao';
        if (s === 'aprovado') return 'aprovado';
        if (s === 'medicao_tecnica') return 'aguardando_medicao'; // Alias
        return s as WorkflowStage;
    }
    
    if (quote.status === 'measuring') return 'aguardando_medicao';
    if (quote.status === 'approved') return 'aprovado';
    
    return 'pre_orcamento';
};

/**
 * Resolves the high-level commercial stage of an Order.
 * Orders represent the 'Production' (Step 6) and 'Finalized' phases of the lifecycle.
 */
export const getEffectiveOrderStage = (order: Order | null): WorkflowStage => {
    if (!order) return 'em_producao';
    
    if (order.status === 'finished' || order.status === 'finalizado') {
        return 'finalizado';
    }
    
    if (order.status === 'cancelled' || order.status === 'cancelado') {
        return 'cancelado';
    }
    
    // Any active order is in the 'Production' commercial phase
    return 'em_producao';
};

/**
 * Validates if a quote can proceed to the contract/production stage (Step 4 & 5).
 * Logic: Must be Approved (Post-Measurement).
 */
export const canGenerateContract = (quote: Quote | null): { can: boolean; reason?: string } => {
    if (!quote) return { can: false, reason: 'Orçamento não encontrado.' };
    
    // Explicit bypass if contract generation was manually made available after deletion
    if ((quote as any).contractGenerationAvailable === true) {
        return { can: true };
    }
    
    const stage = getEffectiveWorkflowStage(quote);
    
    // Rule: Approval OR Post-Measurement is enough to proceed
    if (stage === 'aprovado' || stage === 'em_contrato' || stage === 'pos_medicao' || stage === 'revisao_comercial') {
        return { can: true };
    }
    
    if (['em_producao', 'finalizado'].includes(stage)) {
        return { can: false, reason: 'Este orçamento já foi convertido em Ordem de Serviço.' };
    }
    
    return { 
        can: false, 
        reason: 'Medição Técnica Requerida: Para garantir a acurácia, este orçamento deve ser convertido em Pós-Medição (Medição Técnica Realizada) antes de prosseguir para contrato/OS.' 
    };
};

/**
 * Checks if a contract can be started for the given quote.
 * A contract can only be started when the quote is in a valid post-measurement stage.
 */
export const canStartContract = (quote: Quote | null | undefined): boolean => {
    if (!quote) return false;
    
    const normalize = (str: any) => {
        if (!str || typeof str !== 'string') return '';
        return str.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[\s\-]+/g, "_");
    };
    
    const quoteStage = normalize(quote.quoteStage);
    const status = normalize(quote.status);
    const stage = normalize((quote as any).stage);
    const workflowStage = normalize((quote as any).workflowStage);
    const effectiveStage = normalize(getEffectiveWorkflowStage(quote as Quote));

    const fields = [quoteStage, status, stage, workflowStage, effectiveStage].filter(Boolean);
    
    // Status que bloqueiam sumariamente
    const blockingStages = ['cancelado', 'cancelled', 'deleted'];
    if (fields.some(f => blockingStages.includes(f))) return false;
    
    // Status que permitem
    const validStages = [
        'pos_medicao', 
        'posmedicao', 
        'aguardando_aprovacao', 
        'aprovado', 
        'approved'
    ];
    if (fields.some(f => validStages.includes(f))) return true;
    
    // Status iniciais que não permitem
    const invalidStages = [
        'pre_orcamento', 
        'preorcamento', 
        'rascunho', 
        'draft', 
        'draft_zero', 
        'aguardando_medicao', 
        'em_medicao', 
        'sem_medicao'
    ];
    if (fields.some(f => invalidStages.includes(f))) return false;
    
    return false;
};

/**
 * Checks if a quote can be moved to the post measurement stage.
 */
export const canMoveToPostMeasurement = (quote: Quote | null | undefined): boolean => {
    if (!quote) return false;
    
    // Bloqueia rascunhos sem valor
    if ((quote.total || 0) <= 0 && (!quote.items || quote.items.length === 0)) {
        return false;
    }

    const normalize = (str: any) => {
        if (!str || typeof str !== 'string') return '';
        return str.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[\s\-]+/g, "_");
    };
    
    const quoteStage = normalize(quote.quoteStage);
    const status = normalize(quote.status);
    const stage = normalize((quote as any).stage);
    const workflowStage = normalize((quote as any).workflowStage);
    const effectiveStage = normalize(getEffectiveWorkflowStage(quote as Quote));

    const fields = [quoteStage, status, stage, workflowStage, effectiveStage].filter(Boolean);
    
    // Status que bloqueiam sumariamente
    const blockingStages = [
        'pos_medicao', 
        'posmedicao',
        'aguardando_aprovacao',
        'aprovado',
        'approved',
        'em_contrato',
        'contrato',
        'em_producao',
        'producao',
        'finalizado',
        'cancelado', 
        'cancelled', 
        'deleted',
        'rascunho',
        'draft_zero'
    ];
    if (fields.some(f => blockingStages.includes(f))) return false;
    
    // Status que permitem
    const validStages = [
        'pre_orcamento', 
        'preorcamento', 
        'aguardando_medicao',
        'em_medicao',
        'sem_medicao',
        'enviado',
        'aguardando_retorno'
    ];
    if (fields.some(f => validStages.includes(f))) return true;
    
    return false;
};


/**
 * Orchestrates the transition to Approval (Freezing the snapshot).
 * Implements Rule #30 & Rule #35.
 */
export const approveQuoteAndFreeze = async (
    quote: Quote, 
    companyData: any,
    userName: string
): Promise<Partial<Quote>> => {
    const isoNow = new Date().toISOString();
    
    const rate = typeof companyData?.installationRateLinear === 'number' 
        ? companyData.installationRateLinear 
        : Number(companyData?.installationRateLinear) || 0;

    const calcResults = calculateQuoteTotals(
        quote,
        rate,
        quote.includeInstallation !== false,
        quote.manualInstallation
    );
    
    const snapshot = generateQuoteSnapshot(quote, calcResults, {
        sellerName: quote.sellerName,
        companyName: companyData?.name
    });

    return {
        status: 'approved',
        quoteStage: 'aprovado',
        isFrozen: true,
        approvedAt: isoNow,
        quoteSnapshot: snapshot,
        history: [
            ...(quote.history || []), 
            { 
                date: isoNow, 
                action: 'ORÇAMENTO APROVADO - Snapshot gerado e dados congelados.',
                user: userName
            }
        ]
    };
};

/**
 * Centralized logic for editing permissions.
 * Transitioned to Non-Blocking Mode: Allows editing during negotiation.
 * Locked only for: Signed Contracts, Production, and Finalized states.
 */
export const canEditQuote = (quote: Quote | null): boolean => {
    if (!quote) return false;
    const stage = getEffectiveWorkflowStage(quote);
    
    // In Non-Blocking Mode, we lock when the quote is already approved or further.
    return !['aprovado', 'em_contrato', 'em_producao', 'finalizado'].includes(stage);
};

/**
 * Deletion Flow: Non-Blocking Analytical Mode.
 * Allow deletion unless the document has a physical operational link (OS/Order).
 */
export const canDeleteQuote = (quote: Quote | null): { can: boolean; reason?: string } => {
    if (!quote) return { can: false, reason: 'Orçamento não encontrado.' };
    
    // 1. Physical conversion link remains a hard block for data integrity
    if (quote.convertedToOrderId) {
        return { 
            can: false, 
            reason: 'Vínculo Operacional: Este orçamento já possui um Pedido/OS vinculado e não pode ser excluído.' 
        };
    }

    const stage = getEffectiveWorkflowStage(quote);
    
    // 2. Lock removal for production/finalized to protect financial records
    if (['em_producao', 'finalizado'].includes(stage)) {
        return { 
            can: false, 
            reason: 'Integridade Financeira: Orçamentos em produção ou finalizados não podem ser excluídos.' 
        };
    }

    return { can: true };
};
// No imports needed for types here if not used, or keep other necessary ones

export type WorkflowStage = 
    | 'pre_orcamento' 
    | 'aguardando_medicao' 
    | 'pos_medicao' 
    | 'revisao_comercial' 
    | 'aprovado' 
    | 'em_contrato' 
    | 'em_producao' 
    | 'finalizado' 
    | 'cancelado';

export interface WorkflowMetadata {
    label: string;
    color: string;
    icon: any;
    nextStepLabel?: string;
    stepIndex?: number; // 1 to 6
}

export const WORKFLOW_CONFIG: Record<WorkflowStage, WorkflowMetadata> = {
    pre_orcamento: {
        label: 'Pré-Orçamento',
        color: 'bg-slate-100 text-slate-600 border-slate-200',
        icon: FileEdit,
        nextStepLabel: 'Agendar Medição Técnica',
        stepIndex: 1
    },
    aguardando_medicao: {
        label: 'Medição Técnica',
        color: 'bg-amber-50 text-amber-600 border-amber-200',
        icon: Ruler,
        nextStepLabel: 'Realizar Medição e Gerar Pós-Medição',
        stepIndex: 2
    },
    pos_medicao: {
        label: 'Orçamento Pós-Medição',
        color: 'bg-blue-50 text-blue-600 border-blue-200',
        icon: FileText,
        nextStepLabel: 'Enviar p/ Cliente e Aguardar Aprovação',
        stepIndex: 3
    },
    revisao_comercial: {
        label: 'Revisão Comercial',
        color: 'bg-orange-50 text-orange-600 border-orange-200',
        icon: Clock,
        nextStepLabel: 'Analisar Margens e Prosseguir',
        stepIndex: 3
    },
    aprovado: {
        label: 'Aprovado',
        color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
        icon: CheckCircle2,
        nextStepLabel: 'Gerar Contrato Digital ou Venda Direta',
        stepIndex: 4
    },
    em_contrato: {
        label: 'Em Contrato',
        color: 'bg-purple-50 text-purple-600 border-purple-200',
        icon: ShoppingCart,
        nextStepLabel: 'Assinar Contrato e Liberar Produção',
        stepIndex: 5
    },
    em_producao: {
        label: 'Em Produção',
        color: 'bg-teal-50 text-teal-700 border-teal-200',
        icon: Package,
        nextStepLabel: 'Acompanhar no Kanban de Produção',
        stepIndex: 6
    },
    finalizado: {
        label: 'Finalizado',
        color: 'bg-slate-800 text-white border-slate-700',
        icon: CheckCircle,
        stepIndex: 6
    },
    cancelado: {
        label: 'Cancelado',
        color: 'bg-rose-50 text-rose-600 border-rose-200',
        icon: XCircle
    }
};

// UI Map with 6 official steps for the timeline
export const WORKFLOW_STEPS = [
    { id: 'step_1', key: 'pre_orcamento', label: 'Pré-Orçamento', stages: ['pre_orcamento'] },
    { id: 'step_2', key: 'medicao', label: 'Medição Técnica', stages: ['aguardando_medicao'] },
    { id: 'step_3', key: 'pos_medicao', label: 'Pós-Medição', stages: ['pos_medicao', 'revisao_comercial'] },
    { id: 'step_4', key: 'aprovacao', label: 'Aprovação', stages: ['aprovado'] },
    { id: 'step_5', key: 'contrato', label: 'Contrato', stages: ['em_contrato'] },
    { id: 'step_6', key: 'producao', label: 'Produção', stages: ['em_producao', 'finalizado'] },
];

export const WorkflowBadge: React.FC<{ stage?: WorkflowStage | string, className?: string, size?: 'sm' | 'md' }> = ({ stage = 'pre_orcamento', className, size = 'md' }) => {
    const config = WORKFLOW_CONFIG[stage as WorkflowStage] || WORKFLOW_CONFIG.pre_orcamento;
    const Icon = config.icon;
    
    return (
        <div className={cn(
            "rounded-lg font-black uppercase tracking-tighter flex items-center justify-center gap-1.5 shadow-sm border transition-all",
            size === 'sm' ? "px-1.5 py-0.5 text-[8px]" : "px-2.5 py-1 text-[10px]",
            config.color,
            className
        )}>
            <Icon className={size === 'sm' ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} />
            {config.label}
        </div>
    );
};

export const WorkflowTimeline: React.FC<{ currentStage?: WorkflowStage | string }> = ({ currentStage }) => {
    const currentIndex = WORKFLOW_STEPS.findIndex(step => step.stages.includes(currentStage as string));
    
    return (
        <div className="py-6 px-4">
            <div className="flex items-start justify-between relative">
                {/* Connector Line */}
                <div className="absolute top-4 left-0 w-full h-[2px] bg-slate-100 dark:bg-white/5 -z-10" />
                <div 
                    className="absolute top-4 left-0 h-[2px] bg-brand-emerald transition-all duration-500 -z-10" 
                    style={{ width: currentIndex >= 0 ? `${(currentIndex / (WORKFLOW_STEPS.length - 1)) * 100}%` : '0%' }}
                />

                {safeArray(WORKFLOW_STEPS).map((step, idx) => {
                    const isCompleted = idx < currentIndex;
                    const isCurrent = idx === currentIndex;
                    const isCancel = currentStage === 'cancelado';

                    return (
                        <div key={step.id} className="flex flex-col items-center gap-2 group">
                            <div className={cn(
                                "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300 shadow-lg",
                                isCompleted ? "bg-brand-emerald border-brand-emerald text-white" :
                                isCurrent ? "bg-white border-brand-emerald text-brand-emerald scale-110 ring-4 ring-emerald-50 dark:bg-slate-900 dark:ring-emerald-500/10" :
                                isCancel ? "bg-rose-50 border-rose-200 text-rose-500" :
                                "bg-white border-slate-200 text-slate-300 dark:bg-slate-900 dark:border-white/5"
                            )}>
                                {isCompleted ? (
                                    <CheckCircle2 className="w-5 h-5" />
                                ) : (
                                    <span className="text-xs font-black">{idx + 1}</span>
                                )}
                            </div>
                            <span className={cn(
                                "text-[9px] font-black uppercase tracking-tighter text-center max-w-[60px] leading-tight transition-colors",
                                isCurrent ? "text-slate-900 dark:text-white" : "text-slate-400"
                            )}>
                                {step.label}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const NextStepCard: React.FC<{ currentStage?: WorkflowStage | string }> = ({ currentStage }) => {
    const config = WORKFLOW_CONFIG[currentStage as WorkflowStage] || WORKFLOW_CONFIG.pre_orcamento;
    if (!config.nextStepLabel) return null;

    return (
        <div className="bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/10 p-4 rounded-2xl flex items-center gap-4 group">
            <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center text-emerald-500 shadow-sm shrink-0">
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </div>
            <div>
                <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-0.5">Próximo Passo Recomendado</p>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{config.nextStepLabel}</p>
            </div>
        </div>
    );
};
