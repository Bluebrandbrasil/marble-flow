import type { Order, FinancialEvent, PaymentInstallment } from '../types';
import { safeParseISO, toISODateSafe } from '../lib/dateUtils';
import { isAfter, isBefore, startOfDay, endOfDay, isSameDay, addDays } from 'date-fns';

export const safeArray = <T = any>(val: unknown): T[] => (Array.isArray(val) ? val : []);

/**
 * [FINANCIAL UTILS] - Central de Inteligência Financeira
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

export const getSafeEventDate = (event: any): Date | null => {
    const rawDate = event.paidAt || event.receivedAt || event.date || event.createdAt;
    return safeParseISO(rawDate);
};

/**
 * Calculates the real net amount received for an order.
 * Precedence Rule:
 * 1. If financialHistory exists and has events:
 *    Deduplicate strictly by canonical ID (event.id || event.eventId || event.paymentId || event.transactionId).
 *    If no canonical ID is present, DO NOT eliminate legitimate identical payments.
 *    Calculate sum of income/payment events minus reversal events.
 * 2. Else if order.receivedAmount !== undefined && order.receivedAmount !== null:
 *    Use Number(order.receivedAmount)
 * 3. Else if order.downPayment !== undefined && order.downPayment !== null:
 *    Use Number(order.downPayment)
 * 4. Else if ['paid', 'quitado'].includes(String(order.paymentStatus || order.collectionStatus || order.billingStatus || (order as any).status).toLowerCase()):
 *    Use totalAmount
 * 5. Else:
 *    Return 0
 */
export const getRealReceivedAmount = (order: Order): { amount: number; negativeNetReceivedDetected: boolean } => {
    const history = safeArray(order.financialHistory);
    
    if (history.length > 0) {
        const seenCanonicalIds = new Set<string>();
        let negativeNetReceivedDetected = false;

        const calculated = history.reduce((acc, event) => {
            const canonicalId = event.id || (event as any).eventId || (event as any).paymentId || (event as any).transactionId;
            
            if (canonicalId) {
                if (seenCanonicalIds.has(canonicalId)) {
                    return acc;
                }
                seenCanonicalIds.add(canonicalId);
            }

            if (event.type === 'reversal') return acc - (Number(event.amount) || 0);
            
            const isValidType = ['income', 'payment', 'partial_payment', 'baixa_confirmada', 'received'].includes(event.type);
            const statusStr = typeof event.status === 'string' ? event.status.toLowerCase() : '';
            const isValidStatus = !event.status || ['received', 'confirmado', 'paid', 'quitado'].includes(statusStr);
            
            if (isValidType && isValidStatus) {
                return acc + (Number(event.amount) || 0);
            }
            return acc;
        }, 0);

        if (calculated < 0) {
            negativeNetReceivedDetected = true;
            console.warn(`[FINANCIAL DATA WARNING] Net received calculation for order ${order.id} resulted in negative amount (${calculated}). Inconsistency detected between payments and reversals.`);
        }

        return {
            amount: Math.max(0, calculated),
            negativeNetReceivedDetected
        };
    }

    if (order.receivedAmount !== undefined && order.receivedAmount !== null) {
        const val = Number(order.receivedAmount);
        if (!isNaN(val)) return { amount: Math.max(0, val), negativeNetReceivedDetected: false };
    }

    if (order.downPayment !== undefined && order.downPayment !== null) {
        const val = Number(order.downPayment);
        if (!isNaN(val)) return { amount: Math.max(0, val), negativeNetReceivedDetected: false };
    }

    const st = String(order.paymentStatus || order.collectionStatus || order.billingStatus || (order as any).status || '').toLowerCase();
    const isStrictlyPaid = st === 'paid' || st === 'quitado';

    if (isStrictlyPaid) {
        const total = Number(order.totalAmount || (order as any).totalContractValue || (order as any).contractTotal || 0);
        return { amount: Math.max(0, total), negativeNetReceivedDetected: false };
    }

    return { amount: 0, negativeNetReceivedDetected: false };
};

export const getPendingBalance = (order: Order): number => {
    const total = Number(order.totalAmount || (order as any).totalContractValue || (order as any).contractTotal || 0);
    const { amount: received } = getRealReceivedAmount(order);
    return Math.max(0, Number((total - received).toFixed(2)));
};

export const getFinancialEventsInPeriod = (order: Order, start: Date, end: Date): FinancialEvent[] => {
    const history = safeArray(order.financialHistory);
    const seenCanonicalIds = new Set<string>();
    const uniqueEvents: FinancialEvent[] = [];

    history.forEach(event => {
        const canonicalId = event.id || (event as any).eventId || (event as any).paymentId || (event as any).transactionId;
        if (canonicalId) {
            if (!seenCanonicalIds.has(canonicalId)) {
                seenCanonicalIds.add(canonicalId);
                uniqueEvents.push(event);
            }
        } else {
            uniqueEvents.push(event);
        }
    });

    return uniqueEvents.filter(event => {
        const date = getSafeEventDate(event);
        if (!date) return false;
        return isAfter(date, startOfDay(start)) && isBefore(date, endOfDay(end));
    });
};

export const getPreferredPaymentMethod = (orders: Order[]): { name: string; percent: number } => {
    const methods: Record<string, number> = {};
    let totalCount = 0;

    orders.forEach(order => {
        const history = safeArray(order.financialHistory);
        const seenCanonicalIds = new Set<string>();

        history.forEach(event => {
            const canonicalId = event.id || (event as any).eventId || (event as any).paymentId || (event as any).transactionId;
            if (canonicalId) {
                if (seenCanonicalIds.has(canonicalId)) return;
                seenCanonicalIds.add(canonicalId);
            }
            
            if (['income', 'payment', 'partial_payment', 'baixa_confirmada', 'received'].includes(event.type)) {
                const m = (event.paymentMethod || event.method || 'A DEFINIR').toUpperCase();
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

export const validateBaixaAmount = (amount: number, balance: number): { isValid: boolean; error?: string } => {
    if (amount <= 0) return { isValid: false, error: 'O valor deve ser maior que zero.' };
    if (amount > balance + 0.01) return { isValid: false, error: 'O valor excede o saldo pendente.' };
    return { isValid: true };
};

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
        status: 'received',
        ...payload
    } as FinancialEvent;
};

/**
 * Resolves the Effective Financial Due Date for an installment/order.
 * REMOVES COMPLETELY any operational deadline or automatic createdAt fallback.
 *
 * Priority:
 * 1. Explicit installment.dueDate
 * 2. Explicit order.financialDueDate or order.billingDueDate
 * 3. Immediate / Downpayment condition ONLY if order has structured explicit payment condition ('avista' / 'imediato')
 * 4. Linked Installation Date ONLY if installment condition is installation/delivery AND explicit scheduled installation date exists
 * 5. Conservatism rule: Otherwise, returns null (SEM DATA DEFINIDA)
 */
export const getFinancialDueDate = (installment: PaymentInstallment, order: Order): string | null => {
    if (installment.dueDate) {
        return installment.dueDate;
    }

    const explicitOrderFinancialDate = (order as any).financialDueDate || (order as any).billingDueDate;
    if (explicitOrderFinancialDate) {
        return explicitOrderFinancialDate;
    }

    const typeStr = String(installment.dueType || '').toLowerCase();
    const orderPaymentType = String(order.paymentConditions?.type || (order as any).paymentType || '').toLowerCase();
    const isExplicitImmediateCondition = orderPaymentType === 'avista' || orderPaymentType === 'imediato' || orderPaymentType === 'ato';

    if (typeStr === 'imediato' || typeStr === 'ato') {
        if (isExplicitImmediateCondition && order.createdAt) {
            return order.createdAt;
        }
    }

    const isInstallationCondition = typeStr === 'entrega' || typeStr === 'instalação' || typeStr === 'instalacao';
    if (isInstallationCondition) {
        const scheduledInstallationDate = (order as any).scheduledInstallationDate || (order as any).installationDate || (order as any).installationScheduledAt;
        if (scheduledInstallationDate) {
            return scheduledInstallationDate;
        }
    }

    return null;
};

/**
 * Backward compatible alias for getFinancialDueDate.
 */
export const getInstallmentDueDate = (installment: PaymentInstallment, order: Order): string | null => {
    return getFinancialDueDate(installment, order);
};

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

export const buildCashflowForecast = (orders: Order[]): ForecastItem[] => {
    const forecast: ForecastItem[] = [];
    
    orders.forEach(order => {
        if (order.status === 'cancelled' || order.status === 'cancelado') return;
        
        const installments = order.paymentConditions?.installments || [];
        
        if (installments.length === 0) {
            const balance = getPendingBalance(order);
            if (balance > 0) {
                const dueDate = (order as any).financialDueDate || (order as any).billingDueDate || null;
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

        let { amount: totalReceivedRemaining } = getRealReceivedAmount(order);
        
        installments.forEach((inst, index) => {
            const dueDate = getFinancialDueDate(inst, order);
            const instAmount = inst.amount || 0;
            
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

export interface FinancialMetrics {
    totalSold: number;
    totalReceived: number;
    totalReceivable: number;
    totalOverdue: number;
    totalFutureReceivable: number;
    totalWithoutDueDate: number;
    receivableAtInstallation: number;
    isInstallationStructured: boolean;
    salesCount: number;
    overdueCount: number;
    hasNegativeNetWarning: boolean;
}

export const calculateFinancialMetrics = (
    orders: Order[],
    contracts: any[],
    start: Date,
    end: Date
): FinancialMetrics => {
    const validOrders = safeArray(orders).filter(o => isValidFinancialOrder(o));
    let hasNegativeNetWarning = false;

    // 1. DINHEIRO NO CAIXA (Somente recebimentos reais com data no período)
    const totalReceived = validOrders.reduce((acc, o) => {
        const eventsInPeriod = getFinancialEventsInPeriod(o, start, end);
        if (eventsInPeriod.length > 0) {
            const sum = eventsInPeriod.reduce((s, e) => {
                if (e.type === 'reversal') return s - (Number(e.amount) || 0);
                if (['income', 'payment', 'partial_payment', 'baixa_confirmada', 'received'].includes(e.type)) {
                    return s + (Number(e.amount) || 0);
                }
                return s;
            }, 0);
            if (sum < 0) hasNegativeNetWarning = true;
            return acc + Math.max(0, sum);
        }
        return acc;
    }, 0);

    validOrders.forEach(o => {
        const res = getRealReceivedAmount(o);
        if (res.negativeNetReceivedDetected) {
            hasNegativeNetWarning = true;
        }
    });

    // 2. FALTA RECEBER DOS CLIENTES (CARTEIRA TOTAL ATIVA - ignora filtro de período)
    const totalReceivable = validOrders.reduce((acc, o) => {
        return acc + getPendingBalance(o);
    }, 0);

    // 3. VENDAS NO PERÍODO (respeita filtro de data comercial do contrato/OS)
    const validSalesStatuses = ['signed', 'assinado', 'approved', 'aprovado', 'em_producao', 'aguardando_materia_prima', 'instalado', 'finalizado'];
    const invalidSalesStatuses = ['rascunho', 'draft', 'pendente', 'cancelado', 'cancelled', 'deleted'];

    const isValidSale = (item: any) => {
        if (item.isDeleted === true) return false;
        const status = String(item.status || item.contractStatus || '').toLowerCase();
        if (invalidSalesStatuses.includes(status)) return false;
        return validSalesStatuses.includes(status);
    };

    const getSaleDate = (item: any) => {
        const raw = item.signedAt || item.contractSignedAt || item.approvedAt || item.createdAt;
        return safeParseISO(raw);
    };

    const getSaleAmount = (item: any) => {
        return Number(item.totalAmount || item.contractTotal || item.commercialTotal || item.finalTotal || item.total || 0);
    };

    let totalSold = 0;
    let salesCount = 0;
    const processedContractIds = new Set<string>();

    safeArray(contracts).forEach(c => {
        if (isValidSale(c)) {
            const date = getSaleDate(c);
            if (date && date >= start && date <= end) {
                const amount = getSaleAmount(c);
                if (amount > 0) {
                    totalSold += amount;
                    salesCount++;
                    processedContractIds.add(c.id);
                }
            }
        }
    });

    safeArray(orders).forEach(o => {
        if (o.contractId && processedContractIds.has(o.contractId)) return;
        if (isValidSale(o)) {
            const date = getSaleDate(o);
            if (date && date >= start && date <= end) {
                const amount = getSaleAmount(o);
                if (amount > 0) {
                    totalSold += amount;
                    salesCount++;
                }
            }
        }
    });

    // 4. DECOMPOSIÇÃO DA CARTEIRA DE COBRANÇA (Total da Carteira Ativa)
    const allForecastItems = buildCashflowForecast(validOrders);
    
    let totalOverdue = 0;
    let overdueCount = 0;
    let totalFutureReceivable = 0;
    let totalWithoutDueDate = 0;

    allForecastItems.forEach(item => {
        if (item.balance <= 0.01) return;

        if (!item.dueDate) {
            totalWithoutDueDate += item.balance;
        } else if (item.status === 'atrasado') {
            totalOverdue += item.balance;
            overdueCount++;
        } else if (item.status === 'hoje' || item.status === 'previsto') {
            totalFutureReceivable += item.balance;
        }
    });

    // Garantia da Invariante: totalOverdue + totalFutureReceivable + totalWithoutDueDate === totalReceivable
    const sumBreakdown = Number((totalOverdue + totalFutureReceivable + totalWithoutDueDate).toFixed(2));
    const roundedReceivable = Number(totalReceivable.toFixed(2));
    
    if (sumBreakdown !== roundedReceivable && roundedReceivable > 0) {
        const diff = Number((roundedReceivable - sumBreakdown).toFixed(2));
        if (totalFutureReceivable > 0) {
            totalFutureReceivable = Math.max(0, Number((totalFutureReceivable + diff).toFixed(2)));
        } else if (totalWithoutDueDate > 0) {
            totalWithoutDueDate = Math.max(0, Number((totalWithoutDueDate + diff).toFixed(2)));
        }
    }

    // 5. SUBCATEGORIA: A RECEBER NA INSTALAÇÃO (SOMENTE DADOS ESTRUTURADOS EXPLÍCITOS DE PARCELAS)
    let isInstallationStructured = false;

    const receivableAtInstallation = validOrders.reduce((acc, o) => {
        const installments = o.paymentConditions?.installments || [];
        if (installments.length > 0) {
            let { amount: totalReceivedRemaining } = getRealReceivedAmount(o);
            const instSum = installments.reduce((sum, inst) => {
                const instAmount = inst.amount || 0;
                const instReceived = Math.min(instAmount, totalReceivedRemaining);
                totalReceivedRemaining -= instReceived;
                const instBalance = Math.max(0, instAmount - instReceived);
                
                const typeStr = String(inst.dueType || '').toLowerCase();
                const isExplicitInstallation = typeStr === 'entrega' || typeStr === 'instalação' || typeStr === 'instalacao';

                if (isExplicitInstallation) {
                    isInstallationStructured = true;
                    return sum + instBalance;
                }
                return sum;
            }, 0);
            return acc + instSum;
        }
        return acc;
    }, 0);

    return {
        totalSold: Math.max(0, Number(totalSold.toFixed(2))),
        totalReceived: Math.max(0, Number(totalReceived.toFixed(2))),
        totalReceivable: Math.max(0, Number(totalReceivable.toFixed(2))),
        totalOverdue: Math.max(0, Number(totalOverdue.toFixed(2))),
        totalFutureReceivable: Math.max(0, Number(totalFutureReceivable.toFixed(2))),
        totalWithoutDueDate: Math.max(0, Number(totalWithoutDueDate.toFixed(2))),
        receivableAtInstallation: Math.max(0, Number(receivableAtInstallation.toFixed(2))),
        isInstallationStructured,
        salesCount,
        overdueCount,
        hasNegativeNetWarning
    };
};
