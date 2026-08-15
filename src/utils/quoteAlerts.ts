import type { Quote } from '../types';
import { differenceInDays } from 'date-fns';
import { safeParseISO } from '../lib/dateUtils';
import { getEffectiveWorkflowStage } from '../components/workflow/WorkflowStatus';

export type AlertLevel = 'none' | 'attention' | 'urgent' | 'critical';

export interface QuoteAlertStatus {
    level: AlertLevel;
    daysSinceInteraction: number;
    colorClass: string;
    label: string;
}

export const isQuoteEligibleForFollowUp = (q: Quote): boolean => {
    if (!q) return false;
    if (q.isDeleted || q.followUpDisabled) return false;
    
    // Exclusion based on IDs/Fields/Status
    if (q.measurementId || q.convertedToOrderId || q.contractId) return false;
    
    // Stage check via getEffectiveWorkflowStage
    const stage = getEffectiveWorkflowStage(q);
    const excludedStages = [
        'aguardando_medicao',
        'pos_medicao',
        'revisao_comercial',
        'aprovado',
        'em_contrato',
        'em_producao',
        'finalizado',
        'cancelado'
    ];
    if (excludedStages.includes(stage)) return false;

    // Status / quoteStage exclusions
    const statusStr = String(q.status || '').toLowerCase();
    const stageStr = String(q.quoteStage || '').toLowerCase();
    
    const excludedStatusValues = [
        'measuring',
        'approved',
        'converted',
        'rejected',
        'lost',
        'perdido',
        'aguardando_medicao',
        'pos_medicao',
        'aguardando_aprovacao',
        'aprovado',
        'em_contrato',
        'em_producao',
        'finalizado',
        'cancelado'
    ];
    
    if (excludedStatusValues.includes(statusStr) || excludedStatusValues.includes(stageStr)) return false;

    // Inclusion rules: pre_orcamento, draft, aguardando_retorno, enviado_cliente, negociacao
    const inclusionStages = [
        'pre_orcamento',
        'draft',
        'aguardando_retorno',
        'enviado_cliente',
        'negociacao',
        'sent',
        'viewed',
        'negotiating'
    ];
    
    const hasInclusionStage = inclusionStages.includes(stage) || 
                              inclusionStages.includes(statusStr) || 
                              inclusionStages.includes(stageStr);
                              
    return hasInclusionStage;
};

export const getFollowUpReferenceDate = (q: Quote): Date => {
    if (q.nextFollowUpAt) {
        const d = safeParseISO(q.nextFollowUpAt);
        if (d) return d;
    }
    if (q.lastFollowUpAt) {
        const d = safeParseISO(q.lastFollowUpAt);
        if (d) return d;
    }
    if (q.sentAt) {
        const d = safeParseISO(q.sentAt);
        if (d) return d;
    }
    if (q.updatedAt) {
        const d = safeParseISO(q.updatedAt);
        if (d) return d;
    }
    if (q.createdAt) {
        const d = safeParseISO(q.createdAt);
        if (d) return d;
    }
    return new Date();
};

export const getQuoteAlertStatus = (quote: Quote): QuoteAlertStatus => {
    if (!isQuoteEligibleForFollowUp(quote)) {
        return { level: 'none', daysSinceInteraction: 0, colorClass: '', label: '' };
    }

    const refDate = getFollowUpReferenceDate(quote);
    const days = differenceInDays(new Date(), refDate);

    let level: AlertLevel = 'none';
    let label = 'Normal';
    let colorClass = 'bg-emerald-500 text-white';

    if (days >= 7) {
        level = 'critical';
        label = 'Vencido';
        colorClass = 'bg-rose-700 text-white';
    } else if (days >= 5) {
        level = 'urgent';
        label = 'Urgente';
        colorClass = 'bg-rose-500 text-white';
    } else if (days >= 3) {
        level = 'attention';
        label = 'Atenção';
        colorClass = 'bg-amber-500 text-white';
    } else if (days >= 1) {
        level = 'attention';
        label = 'Normal';
        colorClass = 'bg-emerald-500 text-white';
    }

    return {
        level,
        daysSinceInteraction: days,
        colorClass,
        label
    };
};


export const getWhatsAppFollowUpMessage = (quote: Quote): string => {
    // Busca mensagens assistidas (Sugerindo o primeiro cenário de follow-up disponível)
    const messages = getAssistedMessages(quote, 'Consultor');
    if (messages.length > 0) {
        return messages[0].message || '';
    }
    
    // Fallback básico caso o assistente não gere mensagem
    const firstName = (quote.customerName || 'Cliente').split(' ')[0].trim();
    return `Olá ${firstName}! Passando para saber se você recebeu o orçamento certinho e se ficou com alguma dúvida inicial. Estou aqui para ajudar! ✨`;
};
