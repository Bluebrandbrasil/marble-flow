import { safeArray } from '../lib/dataDiagnostics';
import type { Order, FinancialEvent, PaymentInstallment } from '../types';
import { safeParseISO, toISODateSafe } from '../lib/dateUtils';
import { isAfter, isBefore, startOfDay, endOfDay, format, isSameDay, addDays } from 'date-fns';

/**
 * [FINANCIAL UTILS] - Central de Inteligência Financeira (Lei #40)
 */

/**
 * Valida se um pedido/contrato é válido para entrar no módulo Financeiro/Radar de Liquidez.
 */
export const isValidFinancialOrder = (o: Order): boolean => {
    if (['cancelled', 'cancelado', 'deleted', 'draft', 'quote', 'orcamento', 'pending', 'sent'].includes(o.status)) {
        return false;
    }
    
    const cStatus = o.contractStatus || o.status;
    const isSigned = ['signed', 'assinado', 'assinado_presencial', 'assinado_digitalmente'].includes(cStatus);
    const isOS = ['aguardando_materia_prima', 'em_producao', 'production', 'installation', 'em_instalacao', 'ready_for_conference', 'completed', 'finalizado'].includes(o.status);

    return isSigned || isOS;
};

/**
 * Helper seguro para extrair data de eventos financeiros (suporta múltiplos campos legados e timestamps)
 */
export const getSafeEventDate = (event: any): Date | null => {
    const rawDate = event.paidAt || event.receivedAt || event.date || event.createdAt;
    return safeParseISO(rawDate);
};

/**
 * Calcula o valor total recebido real de um pedido baseado EXCLUSIVAMENTE no financialHistory.
 */
export const getRealReceivedAmount = (order: Order): number => {
    const history = safeArray(order.financialHistory);
    if (history.length > 0) {
        const calculated = history.reduce((acc, event) => {
            if (event.type === 'reversal') return acc - (Number(event.amount) || 0);
            
            const isValidType = ['income', 'payment', 'partial_payment', 'baixa_confirmada', 'received'].includes(event.type);
            const statusStr = typeof event.status === 'string' ? event.status.toLowerCase() : '';
            const isValidStatus = !event.status || ['received', 'confirmado', 'paid', 'quitado'].includes(statusStr);
            
            if (isValidType && isValidStatus) {
                return acc + (Number(event.amount) || 0);
            }
            return acc;
        }, 0);
        return calculated > 0 ? calculated : 0;
    }
    return 0;
};

/**
 * Calcula o saldo pendente de um pedido.
 */
export const getPendingBalance = (order: Order): number => {
    const total = Number(order.totalAmount || (order as any).totalContractValue || (order as any).contractTotal || 0);
    const received = getRealReceivedAmount(order);
    return Math.max(0, total - received);
};

/**
 * Filtra eventos financeiros de um pedido dentro de um período, usando múltiplas opções de data.
 */
export const getFinancialEventsInPeriod = (order: Order, start: Date, end: Date): FinancialEvent[] => {
    return safeArray(order.financialHistory).filter(event => {
        const date = getSafeEventDate(event);
        if (!date) return false;
        return isAfter(date, startOfDay(start)) && isBefore(date, endOfDay(end));
    });
};

/**
 * Calcula o método de pagamento mais utilizado.
 */
export const getPreferredPaymentMethod = (orders: Order[]): { name: string; percent: number } => {
    const methods: Record<string, number> = {};
    let totalCount = 0;

    orders.forEach(order => {
        safeArray(order.financialHistory).forEach(event => {
            if (['income', 'payment', 'partial_payment', 'baixa_confirmada', 'received'].includes(event.type)) {
                const m = (event.paymentMethod || 'A DEFINIR').toUpperCase();
                methods[m] = (methods[m] || 0) + 1;
                totalCount++;
            }
        });
    });

    if (totalCount === 0) return { name: 'A Definir', percent: 0 };
    const sorted = Object.entries(methods).sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    return { name: top[0], percent: (top[1] / totalCount) * 100 };
};

/**
 * Valida se um valor de baixa é permitido.
 */
export const validateBaixaAmount = (amount: number, balance: number): { isValid: boolean; error?: string } => {
    if (amount <= 0) return { isValid: false, error: 'O valor deve ser maior que zero.' };
    if (amount > balance + 0.01) return { isValid: false, error: 'O valor excede o saldo pendente.' };
    return { isValid: true };
};

/**
 * Helper para construir um evento financeiro padronizado.
 */
export const buildFinancialEvent = (payload: Partial<FinancialEvent>): FinancialEvent => {
    const now = new Date().toISOString();
    return {
        id: crypto.randomUUID(),
        type: 'income',
        date: now,
        paidAt: now,
        createdAt: now,
        amount: 0,
        paymentMethod: 'PIX',
        method: payload.paymentMethod || payload.method || 'PIX',
        source: 'manual_baixa',
        status: 'received', // Adiciona status default para evitar falhas de count
        ...payload
    } as FinancialEvent;
};

/**
 * [PREVISIVO] - Calcula a data de vencimento de uma parcela.
 */
export const getInstallmentDueDate = (installment: PaymentInstallment, order: Order): string | null => {
    const type = installment.dueType;
    
    if (type === 'imediato' || type === 'ato' as any) {
        return order.createdAt || toISODateSafe(new Date()) || null;
    }
    
    if (type === 'entrega' || type === 'instalação' as any) {
        // Usa o deadline como previsão de entrega/instalação
        return order.deadline || null;
    }
    
    if (type === 'finalização' as any) {
        // Usa completionDate se existir, senão deadline + 2 dias (heurística)
        if (order.completionDate) return order.completionDate;
        if (order.deadline) {
            const d = safeParseISO(order.deadline);
            if (d) return addDays(d, 2).toISOString();
        }
        return null;
    }
    
    if (type === 'data') {
        return installment.dueDate || null;
    }
    
    return null; // Sem previsão definida
};

/**
 * [PREVISIVO] - Define o status de uma parcela baseado na data e saldo.
 */
export const getInstallmentStatus = (dueDateStr: string | null, balance: number): 'previsto' | 'hoje' | 'atrasado' | 'recebido' => {
    if (balance <= 0.01) return 'recebido';
    if (!dueDateStr) return 'previsto';
    
    const dueDate = safeParseISO(dueDateStr);
    if (!dueDate) return 'previsto';
    
    const today = startOfDay(new Date());
    const dueDay = startOfDay(dueDate);
    
    if (isSameDay(dueDay, today)) return 'hoje';
    if (isBefore(dueDay, today)) return 'atrasado';
    return 'previsto';
};

export interface ForecastItem {
    id: string;
    orderId: string;
    customerName: string;
    protocolNumber: string;
    label: string;
    dueDate: string | null;
    amount: number;
    received: number;
    balance: number;
    status: 'previsto' | 'hoje' | 'atrasado' | 'recebido';
}

/**
 * [PREVISIVO] - Constrói o fluxo de caixa projetado.
 */
export const buildCashflowForecast = (orders: Order[]): ForecastItem[] => {
    const forecast: ForecastItem[] = [];
    
    orders.forEach(order => {
        if (order.status === 'cancelled' || order.status === 'cancelado') return;
        
        const installments = order.paymentConditions?.installments || [];
        const financialHistory = order.financialHistory || [];
        
        // Se não tem parcelas, mas tem saldo pendente, cria uma parcela genérica
        if (installments.length === 0) {
            const balance = getPendingBalance(order);
            if (balance > 0) {
                const dueDate = order.deadline || null;
                forecast.push({
                    id: `${order.id}-gen`,
                    orderId: order.id,
                    customerName: order.customerName,
                    protocolNumber: order.protocolNumber || 'S/P',
                    label: 'Saldo Pendente (Geral)',
                    dueDate,
                    amount: balance,
                    received: 0,
                    balance,
                    status: getInstallmentStatus(dueDate, balance)
                });
            }
            return;
        }

        // Mapear parcelas
        let totalReceivedRemaining = getRealReceivedAmount(order);
        
        installments.forEach((inst, index) => {
            const dueDate = getInstallmentDueDate(inst, order);
            const instAmount = inst.amount || 0;
            
            // Lógica de abatimento: as primeiras parcelas são consideradas pagas primeiro
            const instReceived = Math.min(instAmount, totalReceivedRemaining);
            totalReceivedRemaining -= instReceived;
            
            const instBalance = Math.max(0, instAmount - instReceived);
            
            forecast.push({
                id: `${order.id}-${index}`,
                orderId: order.id,
                customerName: order.customerName,
                protocolNumber: order.protocolNumber || 'S/P',
                label: inst.label || `Parcela ${index + 1}`,
                dueDate,
                amount: instAmount,
                received: instReceived,
                balance: instBalance,
                status: getInstallmentStatus(dueDate, instBalance)
            });
        });
    });
    
    return forecast.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
    });
};
