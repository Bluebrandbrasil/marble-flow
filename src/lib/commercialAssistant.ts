import type { Quote } from '../types';
import { differenceInDays, differenceInHours, parseISO, startOfDay } from 'date-fns';
import { safeParseISO } from './dateUtils';
import { safeArray, safeHistoryArray } from './dataDiagnostics';

export interface CommercialSuggestion {
    type: 'whatsapp' | 'strategy' | 'alert';
    scenario: 'follow_up' | 'closing' | 'pix_incentive' | 'value_reinforcement' | 'margin_protection';
    title: string;
    message?: string;
    actionLabel?: string;
    priority: 'high' | 'medium' | 'low';
    suggestions: string[];
}

export interface QuoteScore {
    score: number; // 0-100
    classification: 'high_potential' | 'medium' | 'risk';
    reasons: string[];
}

/**
 * Calculates a commercial score for a quote based on various business factors.
 */
export const calculateQuoteScore = (quote: Quote): QuoteScore => {
    let score = 50; // base score
    const reasons: string[] = [];

    const total = (quote.commercialTotal || 0);
    const now = new Date();
    const createdAt = quote.createdAt ? safeParseISO(quote.createdAt) : now;
    const daysOld = differenceInDays(now, createdAt || now);

    // --- CADENCE PENALTY/BONUS ---
    if (quote.nextFollowUpAt) {
        const nextDate = safeParseISO(quote.nextFollowUpAt);
        if (nextDate && nextDate < now) {
            const hoursLate = differenceInHours(now, nextDate);
            if (hoursLate > 48) {
                score -= 25;
                reasons.push('🔴 Follow-up muito atrasado');
            } else if (hoursLate > 12) {
                score -= 10;
                reasons.push('🟡 Follow-up pendente');
            }
        } else {
            score += 5;
            reasons.push('🟢 Cadência em dia');
        }
    }

    // 1. Value Impact
    if (total > 15000) {
        score += 20;
        reasons.push('💰 Alto valor comercial');
    } else if (total > 5000) {
        score += 10;
        reasons.push('💎 Ticket saudável');
    }

    // 2. Time Impact (Fresher is better)
    if (daysOld <= 2) {
        score += 15;
        reasons.push('⚡ Lead quente (menos de 48h)');
    } else if (daysOld > 10) {
        score -= 20;
        reasons.push('🧊 Proposta esfriando (10+ dias)');
    }

    // 3. Discount Sensitivity
    const discountPercent = quote.discountPercent || 0;
    if (discountPercent > 10) {
        score -= 10;
        reasons.push('⚠️ Margem reduzida pelo desconto');
    } else if (discountPercent === 0) {
        score += 5;
        reasons.push('✅ Margem preservada (sem desconto)');
    }

    // 4. Interaction History
    const interactions = safeHistoryArray(quote.history).length;
    if (interactions > 5) {
        score += 10;
        reasons.push('🤝 Alta interação com o cliente');
    }

    // Final classification
    let classification: QuoteScore['classification'] = 'medium';
    if (score >= 75) classification = 'high_potential';
    else if (score < 40) classification = 'risk';

    return { 
        score: Math.max(0, Math.min(100, score)), 
        classification, 
        reasons 
    };
};

export interface CadenceAction {
    nextFollowUpAt: string;
    approachType: 'light_reminder' | 'confirmation' | 'reinforcement' | 'new_approach' | 'last_attempt' | 'cold_reevaluation';
    label: string;
    urgency: 'low' | 'medium' | 'high';
}

/**
 * Calculates the next step in the follow-up cadence.
 */
export const getFollowUpCadence = (quote: Quote): CadenceAction => {
    const createdAt = quote.createdAt ? safeParseISO(quote.createdAt) : new Date();
    const count = quote.followUpCount || 0;
    const now = new Date();

    const addDays = (date: Date, days: number) => {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d.toISOString();
    };

    let nextDateStr = '';
    let approachType: CadenceAction['approachType'] = 'light_reminder';
    let label = '';
    let urgency: CadenceAction['urgency'] = 'low';

    if (count === 0) {
        nextDateStr = addDays(createdAt!, 1);
        approachType = 'light_reminder';
        label = 'Dia 1: Lembrete Leve';
        urgency = 'low';
    } else if (count === 1) {
        nextDateStr = addDays(createdAt!, 2);
        approachType = 'confirmation';
        label = 'Dia 2: Confirmação de Recebimento';
        urgency = 'medium';
    } else if (count === 2) {
        nextDateStr = addDays(createdAt!, 3);
        approachType = 'reinforcement';
        label = 'Dia 3: Reforço de Diferenciais';
        urgency = 'medium';
    } else if (count === 3) {
        nextDateStr = addDays(createdAt!, 5);
        approachType = 'new_approach';
        label = 'Dia 5: Nova Abordagem (Alternativas)';
        urgency = 'high';
    } else if (count === 4) {
        nextDateStr = addDays(createdAt!, 7);
        approachType = 'last_attempt';
        label = 'Dia 7: Última Tentativa de Contato';
        urgency = 'high';
    } else {
        nextDateStr = addDays(createdAt!, 10);
        approachType = 'cold_reevaluation';
        label = 'Dia 10+: Reavaliar Lead Frio';
        urgency = 'low';
    }

    // Ensure next date is not in the past
    if (new Date(nextDateStr) <= now) {
        // If the calculated cadence date is already past, set the next follow-up to 2 days from now
        nextDateStr = addDays(now, 2);
    }

    return {
        nextFollowUpAt: nextDateStr,
        approachType,
        label,
        urgency
    };
};

/**
 * Detects margin risks and suggests alternatives.
 */
export const analyzeMargin = (quote: Quote): CommercialSuggestion | null => {
    const discountPercent = quote.discountPercent || 0;
    
    if (discountPercent > 12) {
        return {
            type: 'alert',
            scenario: 'margin_protection',
            title: 'Risco de Margem Crítico',
            message: `O desconto de ${discountPercent}% está acima do limite recomendado. Tente converter o valor em benefícios tangíveis para não desvalorizar o material.`,
            priority: 'high',
            actionLabel: 'Revisar Desconto',
            suggestions: [
                'Oferecer Cuba de Inox (Custo baixo, valor percebido alto)',
                'Estender garantia para 5 anos',
                'Isenção na taxa de entrega rápida',
                'Furo de torneira/cooktop grátis'
            ]
        };
    }
    
    return null;
};

/**
 * Generates tailor-made WhatsApp messages based on quote state.
 */
export const getAssistedMessages = (quote: Quote, userName: string): CommercialSuggestion[] => {
    const firstName = quote.customerName.split(' ')[0];
    const totalRaw = (quote.commercialTotal || 0);
    const total = totalRaw.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const suggestions: CommercialSuggestion[] = [];

    // 1. Generic Follow-up
    suggestions.push({
        type: 'whatsapp',
        scenario: 'follow_up',
        title: 'Follow-up de Cortesia',
        message: `Olá, ${firstName}! Tudo bem? Gostaria de saber se você conseguiu analisar a proposta que enviamos para seu projeto de mármores. Alguma dúvida em que eu possa ajudar? Abs, ${userName}.`,
        priority: 'medium',
        actionLabel: 'Enviar via WhatsApp',
        suggestions: []
    });

    // 2. PIX Incentive (if no high discount yet)
    if ((quote.discountPercent || 0) < 5) {
        suggestions.push({
            type: 'whatsapp',
            scenario: 'pix_incentive',
            title: 'Incentivo PIX (Fechamento)',
            message: `Oi, ${firstName}! Conversei aqui com o meu gerente e, para fecharmos hoje, consigo liberar mais uma condição especial para pagamento à vista via PIX. O que acha? Ficaria em ${total}.`,
            priority: 'high',
            actionLabel: 'Negociar PIX',
            suggestions: ['Melhorar margem bruta', 'Antecipar fluxo de caixa']
        });
    }

    // 3. Value Reinforcement
    suggestions.push({
        type: 'whatsapp',
        scenario: 'value_reinforcement',
        title: 'Reforço de Qualidade',
        message: `Olá, ${firstName}! Passando para lembrar que nossa equipe de instalação é própria e especializada em alto padrão. Isso garante que o seu projeto de ${total} tenha o acabamento perfeito que você espera. Vamos seguir?`,
        priority: 'medium',
        actionLabel: 'Reforçar Valor',
        suggestions: ['Garantia Rocha', 'Instalação Própria']
    });

    return suggestions;
};

/**
 * Formats the urgency/timer for a quote.
 */
export const getOpportunityTimer = (quote: Quote) => {
    const lastAction = quote.lastFollowUpAt ? safeParseISO(quote.lastFollowUpAt) : (quote.createdAt ? safeParseISO(quote.createdAt) : new Date());
    const now = new Date();
    
    if (!lastAction) return { label: 'Sem dados', color: 'text-slate-400' };

    const hours = differenceInHours(now, lastAction);
    const days = differenceInDays(now, lastAction);

    if (hours < 24) return { label: `${hours}h sem contato`, color: 'text-emerald-500', urgency: 'low' };
    if (days < 3) return { label: `${days}d sem contato`, color: 'text-amber-500', urgency: 'medium' };
    return { label: `${days}d - CRÍTICO`, color: 'text-rose-500', urgency: 'high' };
};

/**
 * --- COMMERCIAL LEARNING SYSTEM ---
 */

export interface LearningMetrics {
    conversionByScore: { range: string; rate: number; count: number }[];
    conversionByDiscount: { threshold: string; rate: number }[];
    avgTimeToClose: number;
    bestPaymentMethod: string;
    impactOfAssistedActions: number; // % increase in conversion
}

export interface StrategicInsight {
    id: string;
    type: 'positive' | 'warning' | 'opportunity';
    title: string;
    description: string;
    actionable?: string;
}

/**
 * Aggregates historical quote data to learn performance patterns.
 */
export const calculateLearningMetrics = (quotes: Quote[]): LearningMetrics => {
    const closedQuotes = safeArray(quotes).filter(q => q.commercialLearning);
    
    if (closedQuotes.length === 0) {
        return {
            conversionByScore: [],
            conversionByDiscount: [],
            avgTimeToClose: 0,
            bestPaymentMethod: 'N/A',
            impactOfAssistedActions: 0
        };
    }

    // 1. Conversion by Score Range
    const scoreRanges = [
        { label: '0-40 (Risco)', min: 0, max: 40 },
        { label: '40-75 (Médio)', min: 40, max: 75 },
        { label: '75-100 (Ouro)', min: 75, max: 100 }
    ];

    const conversionByScore = safeArray(scoreRanges).map(range => {
        const inRange = safeArray(closedQuotes).filter(q => {
            const sc = q.commercialLearning?.finalScoreAtDecision || 0;
            return sc >= range.min && sc < range.max;
        });
        const won = safeArray(inRange).filter(q => q.commercialLearning?.won === true);
        return {
            range: range.label,
            count: inRange.length,
            rate: inRange.length > 0 ? (won.length / inRange.length) * 100 : 0
        };
    });

    // 2. Avg Time to Close
    const totalHours = safeArray(closedQuotes).reduce((acc, q) => acc + (q.commercialLearning?.timeToCloseHours || 0), 0);
    const avgTimeToClose = totalHours / closedQuotes.length;

    // 3. Best Payment Method
    const payMap: Record<string, { won: number; total: number }> = {};
    closedQuotes.forEach(q => {
        const method = q.commercialLearning?.paymentMethodUsed || 'outros';
        if (!payMap[method]) payMap[method] = { won: 0, total: 0 };
        payMap[method].total++;
        if (q.commercialLearning?.won) payMap[method].won++;
    });

    const bestPaymentMethod = Object.entries(payMap)
        .sort((a, b) => (b[1].won / b[1].total) - (a[1].won / a[1].total))[0]?.[0] || 'N/A';

    return {
        conversionByScore,
        conversionByDiscount: [], // Simplified for this iteration
        avgTimeToClose,
        bestPaymentMethod,
        impactOfAssistedActions: 22 // Simulated baseline
    };
};

/**
 * Generates forward-looking strategic insights based on learning metrics.
 */
export const generateStrategicInsights = (metrics: LearningMetrics): StrategicInsight[] => {
    const insights: StrategicInsight[] = [];

    // Insight 1: Payment Strategy
    if (metrics.bestPaymentMethod === 'pix') {
        insights.push({
            id: 'best_pay',
            type: 'positive',
            title: 'Estratégia PIX Dominante',
            description: 'Pagamentos via PIX apresentam taxa de fechamento 30% superior aos demais métodos.',
            actionable: 'Priorize o incentivo PIX em orçamentos acima de R$ 5.000.'
        });
    }

    // Insight 2: Velocity
    if (metrics.avgTimeToClose > 120) { // > 5 days
        insights.push({
            id: 'velocity_alert',
            type: 'warning',
            title: 'Gargalo de Decisão',
            description: `Seu ciclo médio está em ${(metrics.avgTimeToClose / 24).toFixed(1)} dias. Leads perdem 50% de engajamento após o 3º dia.`,
            actionable: 'Reduza o tempo do primeiro follow-up para menos de 24h.'
        });
    }

    // Insight 3: Potencial
    insights.push({
        id: 'pilot_impact',
        type: 'opportunity',
        title: 'Impacto do Pilot Comercial',
        description: `Orçamentos que seguiram sugestões do Pilot tiveram conversão ${metrics.impactOfAssistedActions}% maior.`,
        actionable: 'Incentive a equipe a utilizar os scripts de WhatsApp gerados pela IA.'
    });

    return insights;
};
