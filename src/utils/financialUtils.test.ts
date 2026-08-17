import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
    getRealReceivedAmount,
    getPendingBalance,
    calculateFinancialMetrics,
    isValidFinancialOrder,
    getFinancialDueDate
} from './financialUtils';
import type { Order } from '../types';

describe('Financial Utils Unit Tests (Scenarios A - AD)', () => {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

    // Scenario A: 10.000 contracted, 3.000 received -> 7.000 pending
    it('Scenario A: 10.000 contracted, 3.000 received -> 7.000 pending', () => {
        const order: Order = {
            id: 'ord-A',
            customerName: 'Cliente A',
            material: 'Granito',
            deadline: '2026-12-31',
            priority: 'medium',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua A',
            protocolNumber: 'P-A',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 10000,
            financialHistory: [
                {
                    id: 'ev-1',
                    amount: 3000,
                    type: 'payment',
                    paymentMethod: 'PIX',
                    paidAt: today.toISOString(),
                    status: 'received'
                }
            ]
        };

        const { amount: received } = getRealReceivedAmount(order);
        const pending = getPendingBalance(order);

        assert.strictEqual(received, 3000);
        assert.strictEqual(pending, 7000);
    });

    // Scenario B: 10.000 contracted, 10.000 received -> 0 pending
    it('Scenario B: 10.000 contracted, 10.000 received -> 0 pending', () => {
        const order: Order = {
            id: 'ord-B',
            customerName: 'Cliente B',
            material: 'Quartzo',
            deadline: '2026-12-31',
            priority: 'medium',
            status: 'finalizado',
            phone: '11999999999',
            address: 'Rua B',
            protocolNumber: 'P-B',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 10000,
            financialHistory: [
                {
                    id: 'ev-2',
                    amount: 10000,
                    type: 'payment',
                    paymentMethod: 'PIX',
                    paidAt: today.toISOString(),
                    status: 'received'
                }
            ]
        };

        assert.strictEqual(getRealReceivedAmount(order).amount, 10000);
        assert.strictEqual(getPendingBalance(order), 0);
    });

    // Scenario C: 10.000 contracted, 0 received -> 10.000 pending
    it('Scenario C: 10.000 contracted, 0 received -> 10.000 pending', () => {
        const order: Order = {
            id: 'ord-C',
            customerName: 'Cliente C',
            material: 'Mármore',
            deadline: '2026-12-31',
            priority: 'low',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua C',
            protocolNumber: 'P-C',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 10000,
            financialHistory: []
        };

        assert.strictEqual(getRealReceivedAmount(order).amount, 0);
        assert.strictEqual(getPendingBalance(order), 10000);
    });

    // Scenario D: Old contract + payment today -> enters cash today
    it('Scenario D: Old contract sold in July + payment today -> enters cash today', () => {
        const order: Order = {
            id: 'ord-D',
            customerName: 'Cliente D',
            material: 'Granito',
            deadline: '2026-12-31',
            priority: 'high',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua D',
            protocolNumber: 'P-D',
            createdAt: '2026-07-01T10:00:00.000Z',
            totalAmount: 10000,
            financialHistory: [
                {
                    id: 'ev-D',
                    amount: 5000,
                    type: 'payment',
                    paymentMethod: 'PIX',
                    paidAt: today.toISOString(),
                    status: 'received'
                }
            ]
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.totalReceived, 5000);
        assert.strictEqual(metrics.totalSold, 0);
    });

    // Scenario E: Contract sold today without payment -> enters sales today, NOT cash today
    it('Scenario E: Contract sold today without payment -> enters sales, not cash', () => {
        const order: Order = {
            id: 'ord-E',
            customerName: 'Cliente E',
            material: 'Granito',
            deadline: '2026-12-31',
            priority: 'medium',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua E',
            protocolNumber: 'P-E',
            createdAt: today.toISOString(),
            totalAmount: 8000,
            financialHistory: []
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.totalSold, 8000);
        assert.strictEqual(metrics.totalReceived, 0);
    });

    // Scenario F: Partial payment balance updated correctly
    it('Scenario F: Partial payment updates balance correctly', () => {
        const order: Order = {
            id: 'ord-F',
            customerName: 'Cliente F',
            material: 'Quartzo',
            deadline: '2026-12-31',
            priority: 'low',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua F',
            protocolNumber: 'P-F',
            createdAt: today.toISOString(),
            totalAmount: 10000,
            financialHistory: [
                {
                    id: 'ev-F1',
                    amount: 2500,
                    type: 'payment',
                    paymentMethod: 'PIX',
                    paidAt: today.toISOString(),
                    status: 'received'
                }
            ]
        };

        assert.strictEqual(getRealReceivedAmount(order).amount, 2500);
        assert.strictEqual(getPendingBalance(order), 7500);
    });

    // Scenario G: Cancelled contract with prior receipt -> cash keeps historical receipt, active receivable is 0
    it('Scenario G: Cancelled contract with prior receipt -> cash keeps historical receipt, active receivable is 0', () => {
        const order: Order = {
            id: 'ord-G',
            customerName: 'Cliente G',
            material: 'Mármore',
            deadline: '2026-12-31',
            priority: 'low',
            status: 'cancelled',
            phone: '11999999999',
            address: 'Rua G',
            protocolNumber: 'P-G',
            createdAt: today.toISOString(),
            totalAmount: 10000,
            financialHistory: [
                {
                    id: 'ev-G1',
                    amount: 2000,
                    type: 'payment',
                    paymentMethod: 'PIX',
                    paidAt: today.toISOString(),
                    status: 'received'
                }
            ]
        };

        assert.strictEqual(isValidFinancialOrder(order), false);

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.totalReceivable, 0);
    });

    // Scenario H: Cancelled contract with full reversal -> net received is 0
    it('Scenario H: Cancelled contract with full reversal -> net received is 0', () => {
        const order: Order = {
            id: 'ord-H',
            customerName: 'Cliente H',
            material: 'Granito',
            deadline: '2026-12-31',
            priority: 'low',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua H',
            protocolNumber: 'P-H',
            createdAt: today.toISOString(),
            totalAmount: 5000,
            financialHistory: [
                {
                    id: 'ev-H1',
                    amount: 2000,
                    type: 'payment',
                    paymentMethod: 'PIX',
                    paidAt: today.toISOString(),
                    status: 'received'
                },
                {
                    id: 'ev-H2',
                    amount: 2000,
                    type: 'reversal',
                    paymentMethod: 'PIX',
                    paidAt: today.toISOString(),
                    status: 'received'
                }
            ]
        };

        assert.strictEqual(getRealReceivedAmount(order).amount, 0);
        assert.strictEqual(getPendingBalance(order), 5000);
    });

    // Scenario I: Overdue balance with explicit financial due date enters totalOverdue
    it('Scenario I: Overdue balance with explicit financial due date enters totalOverdue', () => {
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const order: any = {
            id: 'ord-I',
            customerName: 'Cliente I',
            material: 'Quartzo',
            deadline: yesterday,
            financialDueDate: yesterday,
            priority: 'high',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua I',
            protocolNumber: 'P-I',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 4000,
            financialHistory: []
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.totalOverdue, 4000);
        assert.strictEqual(metrics.overdueCount, 1);
    });

    // Scenario J: Future balance with explicit financial due date enters totalFutureReceivable
    it('Scenario J: Future balance with explicit financial due date enters totalFutureReceivable', () => {
        const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const order: any = {
            id: 'ord-J',
            customerName: 'Cliente J',
            material: 'Quartzo',
            deadline: nextMonth,
            financialDueDate: nextMonth,
            priority: 'low',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua J',
            protocolNumber: 'P-J',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 6000,
            financialHistory: []
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.totalFutureReceivable, 6000);
    });

    // Scenario K: Balance without dueDate enters totalWithoutDueDate
    it('Scenario K: Balance without dueDate enters totalWithoutDueDate', () => {
        const order: Order = {
            id: 'ord-K',
            customerName: 'Cliente K',
            material: 'Mármore',
            deadline: '',
            priority: 'low',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua K',
            protocolNumber: 'P-K',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 3500,
            financialHistory: []
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.totalWithoutDueDate, 3500);
        assert.strictEqual(metrics.totalOverdue + metrics.totalFutureReceivable + metrics.totalWithoutDueDate, metrics.totalReceivable);
    });

    // Scenario L: Absent financialHistory + valid legacy downPayment -> fallback used
    it('Scenario L: Absent financialHistory + valid legacy downPayment -> fallback used', () => {
        const order: Order = {
            id: 'ord-L',
            customerName: 'Cliente L',
            material: 'Granito',
            deadline: '2026-12-31',
            priority: 'medium',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua L',
            protocolNumber: 'P-L',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 10000,
            downPayment: 3000,
            financialHistory: []
        };

        assert.strictEqual(getRealReceivedAmount(order).amount, 3000);
        assert.strictEqual(getPendingBalance(order), 7000);
    });

    // Scenario M: Existing financialHistory + legacy downPayment -> financialHistory takes precedence (NEVER sum both)
    it('Scenario M: Existing financialHistory + legacy downPayment -> financialHistory takes precedence (NEVER sum both)', () => {
        const order: Order = {
            id: 'ord-M',
            customerName: 'Cliente M',
            material: 'Granito',
            deadline: '2026-12-31',
            priority: 'medium',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua M',
            protocolNumber: 'P-M',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 10000,
            downPayment: 3000,
            financialHistory: [
                {
                    id: 'ev-M1',
                    amount: 3000,
                    type: 'payment',
                    paymentMethod: 'PIX',
                    paidAt: today.toISOString(),
                    status: 'received'
                }
            ]
        };

        assert.strictEqual(getRealReceivedAmount(order).amount, 3000);
        assert.strictEqual(getPendingBalance(order), 7000);
    });

    // Scenario N: Two legitimate equal payments WITHOUT canonical ID -> sum BOTH
    it('Scenario N: Two legitimate equal payments without canonical ID -> sum both (1.000 + 1.000 = 2.000)', () => {
        const order: Order = {
            id: 'ord-N',
            customerName: 'Cliente N',
            material: 'Quartzo',
            deadline: '2026-12-31',
            priority: 'medium',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua N',
            protocolNumber: 'P-N',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 10000,
            financialHistory: [
                {
                    amount: 1000,
                    type: 'payment',
                    paymentMethod: 'PIX',
                    paidAt: today.toISOString(),
                    status: 'received'
                },
                {
                    amount: 1000,
                    type: 'payment',
                    paymentMethod: 'PIX',
                    paidAt: today.toISOString(),
                    status: 'received'
                }
            ]
        };

        assert.strictEqual(getRealReceivedAmount(order).amount, 2000);
        assert.strictEqual(getPendingBalance(order), 8000);
    });

    // Scenario O: Two events with the EXACT SAME canonical event.id -> count only ONCE
    it('Scenario O: Two events with the exact same canonical event.id -> count only once', () => {
        const order: Order = {
            id: 'ord-O',
            customerName: 'Cliente O',
            material: 'Mármore',
            deadline: '2026-12-31',
            priority: 'low',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua O',
            protocolNumber: 'P-O',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 10000,
            financialHistory: [
                {
                    id: 'canonical-dup-1',
                    amount: 1000,
                    type: 'payment',
                    paymentMethod: 'PIX',
                    paidAt: today.toISOString(),
                    status: 'received'
                },
                {
                    id: 'canonical-dup-1',
                    amount: 1000,
                    type: 'payment',
                    paymentMethod: 'PIX',
                    paidAt: today.toISOString(),
                    status: 'received'
                }
            ]
        };

        assert.strictEqual(getRealReceivedAmount(order).amount, 1000);
        assert.strictEqual(getPendingBalance(order), 9000);
    });

    // Scenario P: receivedAmount = 0 does NOT fall through to downPayment = 5000 via || operator
    it('Scenario P: receivedAmount = 0 explicitly returns 0 and does NOT fall through to downPayment', () => {
        const order: Order = {
            id: 'ord-P',
            customerName: 'Cliente P',
            material: 'Granito',
            deadline: '2026-12-31',
            priority: 'low',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua P',
            protocolNumber: 'P-P',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 10000,
            receivedAmount: 0,
            downPayment: 5000,
            financialHistory: []
        };

        assert.strictEqual(getRealReceivedAmount(order).amount, 0);
        assert.strictEqual(getPendingBalance(order), 10000);
    });

    // Scenario Q: Order in status === 'installation' WITHOUT structured installation payment condition -> does NOT enter receivableAtInstallation
    it('Scenario Q: Order in installation status without explicit structured payment condition does NOT enter receivableAtInstallation', () => {
        const order: Order = {
            id: 'ord-Q',
            customerName: 'Cliente Q',
            material: 'Granito',
            deadline: '2026-12-31',
            priority: 'high',
            status: 'installation',
            phone: '11999999999',
            address: 'Rua Q',
            protocolNumber: 'P-Q',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 10000,
            financialHistory: [],
            paymentConditions: {
                type: 'avista',
                installments: [
                    { label: 'Entrada Integral', percentage: 100, amount: 10000, dueType: 'imediato' }
                ]
            }
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.receivableAtInstallation, 0);
        assert.strictEqual(metrics.isInstallationStructured, false);
    });

    // Scenario R: Installment explicitly marked with dueType: 'entrega' or label: 'Instalação' -> ENTERS receivableAtInstallation
    it('Scenario R: Installment explicitly marked with dueType: entrega ENTERS receivableAtInstallation', () => {
        const order: Order = {
            id: 'ord-R',
            customerName: 'Cliente R',
            material: 'Quartzo',
            deadline: '2026-12-31',
            priority: 'medium',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua R',
            protocolNumber: 'P-R',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 10000,
            financialHistory: [],
            paymentConditions: {
                type: 'parcelado',
                installments: [
                    { label: 'Sinal', percentage: 40, amount: 4000, dueType: 'imediato' },
                    { label: 'Quitação na Instalação', percentage: 60, amount: 6000, dueType: 'entrega' }
                ]
            }
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.receivableAtInstallation, 6000);
        assert.strictEqual(metrics.isInstallationStructured, true);
    });

    // Scenario S: Reversal greater than payments -> visual amount is protected at 0 and hasNegativeNetWarning is true
    it('Scenario S: Reversal greater than payments -> visual amount is protected at 0 and hasNegativeNetWarning is true', () => {
        const order: Order = {
            id: 'ord-S',
            customerName: 'Cliente S',
            material: 'Granito',
            deadline: '2026-12-31',
            priority: 'low',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua S',
            protocolNumber: 'P-S',
            createdAt: today.toISOString(),
            totalAmount: 10000,
            financialHistory: [
                {
                    id: 'ev-S1',
                    amount: 1000,
                    type: 'payment',
                    paymentMethod: 'PIX',
                    paidAt: today.toISOString(),
                    status: 'received'
                },
                {
                    id: 'ev-S2',
                    amount: 1500,
                    type: 'reversal',
                    paymentMethod: 'PIX',
                    paidAt: today.toISOString(),
                    status: 'received'
                }
            ]
        };

        const res = getRealReceivedAmount(order);
        assert.strictEqual(res.amount, 0);
        assert.strictEqual(res.negativeNetReceivedDetected, true);

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.totalReceived, 0);
        assert.strictEqual(metrics.hasNegativeNetWarning, true);
    });

    // Scenario T: Order with order.deadline in past, but NO financial dueDate -> OVERDUE = 0, WITHOUT_DUE_DATE = balance
    it('Scenario T: Order with order.deadline in past, but NO financial dueDate -> OVERDUE = 0, WITHOUT_DUE_DATE = balance', () => {
        const pastDeadline = '2025-01-01';
        const order: Order = {
            id: 'ord-T',
            customerName: 'Cliente T',
            material: 'Granito',
            deadline: pastDeadline,
            priority: 'medium',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua T',
            protocolNumber: 'P-T',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 5000,
            financialHistory: [],
            paymentConditions: {
                type: 'parcelado',
                installments: [
                    { label: 'Parcela Final', percentage: 100, amount: 5000, dueType: 'entrega' }
                ]
            }
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.totalOverdue, 0);
        assert.strictEqual(metrics.totalWithoutDueDate, 5000);
        assert.strictEqual(metrics.totalReceivable, 5000);
    });

    // Scenario U: Order with order.deadline in future, but NO financial dueDate -> FUTURE = 0, WITHOUT_DUE_DATE = balance
    it('Scenario U: Order with order.deadline in future, but NO financial dueDate -> FUTURE = 0, WITHOUT_DUE_DATE = balance', () => {
        const futureDeadline = '2028-01-01';
        const order: Order = {
            id: 'ord-U',
            customerName: 'Cliente U',
            material: 'Granito',
            deadline: futureDeadline,
            priority: 'medium',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua U',
            protocolNumber: 'P-U',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 7000,
            financialHistory: [],
            paymentConditions: {
                type: 'parcelado',
                installments: [
                    { label: 'Parcela Final', percentage: 100, amount: 7000, dueType: 'entrega' }
                ]
            }
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.totalFutureReceivable, 0);
        assert.strictEqual(metrics.totalWithoutDueDate, 7000);
        assert.strictEqual(metrics.totalReceivable, 7000);
    });

    // Scenario V: Installment dueType installation WITHOUT installation date -> RECEIVABLE_AT_INSTALLATION = 6000, WITHOUT_DUE_DATE = 6000, OVERDUE = 0
    it('Scenario V: Installment dueType installation WITHOUT installation date -> RECEIVABLE_AT_INSTALLATION = 6000, WITHOUT_DUE_DATE = 6000, OVERDUE = 0', () => {
        const order: Order = {
            id: 'ord-V',
            customerName: 'Cliente V',
            material: 'Mármore',
            deadline: '2025-01-01',
            priority: 'low',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua V',
            protocolNumber: 'P-V',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 6000,
            financialHistory: [],
            paymentConditions: {
                type: 'parcelado',
                installments: [
                    { label: 'Instalação', percentage: 100, amount: 6000, dueType: 'entrega' }
                ]
            }
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.receivableAtInstallation, 6000);
        assert.strictEqual(metrics.totalWithoutDueDate, 6000);
        assert.strictEqual(metrics.totalOverdue, 0);
    });

    // Scenario W: Installment dueType installation WITH future installation date -> RECEIVABLE_AT_INSTALLATION = 6000, FUTURE = 6000
    it('Scenario W: Installment dueType installation WITH future installation date -> RECEIVABLE_AT_INSTALLATION = 6000, FUTURE = 6000', () => {
        const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const order: any = {
            id: 'ord-W',
            customerName: 'Cliente W',
            material: 'Quartzo',
            deadline: '2025-01-01',
            scheduledInstallationDate: nextMonth,
            priority: 'medium',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua W',
            protocolNumber: 'P-W',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 6000,
            financialHistory: [],
            paymentConditions: {
                type: 'parcelado',
                installments: [
                    { label: 'Instalação', percentage: 100, amount: 6000, dueType: 'entrega' }
                ]
            }
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.receivableAtInstallation, 6000);
        assert.strictEqual(metrics.totalFutureReceivable, 6000);
        assert.strictEqual(metrics.totalOverdue, 0);
    });

    // Scenario X: Installment dueType installation WITH past installation date -> RECEIVABLE_AT_INSTALLATION = 6000, OVERDUE = 6000
    it('Scenario X: Installment dueType installation WITH past installation date -> RECEIVABLE_AT_INSTALLATION = 6000, OVERDUE = 6000', () => {
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const order: any = {
            id: 'ord-X',
            customerName: 'Cliente X',
            material: 'Quartzo',
            deadline: '2025-01-01',
            scheduledInstallationDate: yesterday,
            priority: 'high',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua X',
            protocolNumber: 'P-X',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 6000,
            financialHistory: [],
            paymentConditions: {
                type: 'parcelado',
                installments: [
                    { label: 'Instalação', percentage: 100, amount: 6000, dueType: 'entrega' }
                ]
            }
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.receivableAtInstallation, 6000);
        assert.strictEqual(metrics.totalOverdue, 6000);
    });

    // Scenario Y: Common installment with future financial dueDate -> FUTURE = 4000
    it('Scenario Y: Common installment with future financial dueDate -> FUTURE = 4000', () => {
        const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const order: Order = {
            id: 'ord-Y',
            customerName: 'Cliente Y',
            material: 'Granito',
            deadline: '2025-01-01',
            priority: 'low',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua Y',
            protocolNumber: 'P-Y',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 4000,
            financialHistory: [],
            paymentConditions: {
                type: 'parcelado',
                installments: [
                    { label: 'Parcela 1', percentage: 100, amount: 4000, dueType: 'data', dueDate: nextMonth }
                ]
            }
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.totalFutureReceivable, 4000);
        assert.strictEqual(metrics.totalOverdue, 0);
    });

    // Scenario Z: Common installment with past financial dueDate -> OVERDUE = 4000
    it('Scenario Z: Common installment with past financial dueDate -> OVERDUE = 4000', () => {
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const order: Order = {
            id: 'ord-Z',
            customerName: 'Cliente Z',
            material: 'Granito',
            deadline: '2025-01-01',
            priority: 'high',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua Z',
            protocolNumber: 'P-Z',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 4000,
            financialHistory: [],
            paymentConditions: {
                type: 'parcelado',
                installments: [
                    { label: 'Parcela 1', percentage: 100, amount: 4000, dueType: 'data', dueDate: yesterday }
                ]
            }
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.totalOverdue, 4000);
    });

    // Scenario AA: order.createdAt in past WITHOUT explicit immediate payment condition -> OVERDUE = 0, WITHOUT_DUE_DATE = balance
    it('Scenario AA: order.createdAt in past WITHOUT explicit immediate payment condition -> OVERDUE = 0, WITHOUT_DUE_DATE = balance', () => {
        const order: Order = {
            id: 'ord-AA',
            customerName: 'Cliente AA',
            material: 'Mármore',
            deadline: '2025-01-01',
            priority: 'low',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua AA',
            protocolNumber: 'P-AA',
            createdAt: '2025-01-01T10:00:00.000Z', // Past createdAt
            totalAmount: 3000,
            financialHistory: [],
            paymentConditions: {
                type: 'parcelado', // Not explicit immediate
                installments: [
                    { label: 'Entrada', percentage: 100, amount: 3000, dueType: 'imediato' } // dueType imediato without explicit cash condition
                ]
            }
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.totalOverdue, 0);
        assert.strictEqual(metrics.totalWithoutDueDate, 3000);
        assert.strictEqual(metrics.totalReceivable, 3000);
    });

    // Scenario AB: order.createdAt in past WITH explicit immediate payment condition -> uses createdAt and classifies as OVERDUE
    it('Scenario AB: order.createdAt in past WITH explicit immediate payment condition -> uses createdAt and classifies as OVERDUE', () => {
        const order: Order = {
            id: 'ord-AB',
            customerName: 'Cliente AB',
            material: 'Granito',
            deadline: '2025-01-01',
            priority: 'high',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua AB',
            protocolNumber: 'P-AB',
            createdAt: '2025-01-01T10:00:00.000Z', // Past createdAt
            totalAmount: 4000,
            financialHistory: [],
            paymentConditions: {
                type: 'avista', // Explicit immediate condition!
                installments: [
                    { label: 'Entrada à vista', percentage: 100, amount: 4000, dueType: 'imediato' }
                ]
            }
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.totalOverdue, 4000);
    });

    // Scenario AC: Ambiguous order.dueDate on order without financialDueDate -> ignored, classified as WITHOUT_DUE_DATE
    it('Scenario AC: Ambiguous order.dueDate on order without financialDueDate -> ignored, classified as WITHOUT_DUE_DATE', () => {
        const order: any = {
            id: 'ord-AC',
            customerName: 'Cliente AC',
            material: 'Quartzo',
            deadline: '2025-01-01',
            dueDate: '2025-01-01', // Ambiguous order.dueDate
            priority: 'low',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua AC',
            protocolNumber: 'P-AC',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 5000,
            financialHistory: []
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.totalOverdue, 0);
        assert.strictEqual(metrics.totalWithoutDueDate, 5000);
    });

    // Scenario AD: Explicit financialDueDate in past -> OVERDUE = 5000
    it('Scenario AD: Explicit financialDueDate in past -> OVERDUE = 5000', () => {
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const order: any = {
            id: 'ord-AD',
            customerName: 'Cliente AD',
            material: 'Quartzo',
            deadline: '2025-01-01',
            financialDueDate: yesterday, // Explicit financial date!
            priority: 'high',
            status: 'em_producao',
            phone: '11999999999',
            address: 'Rua AD',
            protocolNumber: 'P-AD',
            createdAt: '2026-08-01T10:00:00.000Z',
            totalAmount: 5000,
            financialHistory: []
        };

        const metrics = calculateFinancialMetrics([order], [], startDate, endDate);
        assert.strictEqual(metrics.totalOverdue, 5000);
    });
});
