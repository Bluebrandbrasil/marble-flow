import { safeArray } from '../../lib/dataDiagnostics';
import { safeParseISO, formatVisualDate, toISODateSafe } from '../../lib/dateUtils';
import React, { useState, useEffect, useMemo } from 'react';
import {
    Clock, Plus, User, ChevronRight,
    TrendingUp, Wallet, CreditCard, Calendar, CheckCircle2
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { doc, updateDoc, collection, query, orderBy, onSnapshot, where, arrayUnion } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import type { Order, FinancialEvent } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/ui/Modal';
import { format, differenceInDays, isAfter, isBefore, addDays, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '../../lib/utils';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { calculateSearchScore, normalizeStr, HighlightText } from '../../lib/searchUtils';
import { 
    getRealReceivedAmount, 
    getPendingBalance, 
    getFinancialEventsInPeriod, 
    getPreferredPaymentMethod,
    validateBaixaAmount,
    buildFinancialEvent,
    buildCashflowForecast,
    isValidFinancialOrder
} from '../../utils/financialUtils';
import type { ForecastItem } from '../../utils/financialUtils';
import { 
    AlertCircle, 
    ArrowUpRight, 
    ArrowDownRight, 
    BarChart3, 
    LayoutDashboard
} from 'lucide-react';
import { syncBonusWithFinancialEvent } from '../../lib/bonusService';
import { removeUndefinedDeep } from '../contracts/ContractsView';

const PAYMENT_METHODS = [
    { value: 'pix', label: 'PIX' },
    { value: 'dinheiro', label: 'Dinheiro' },
    { value: 'cartao_debito', label: 'Cartão de débito' },
    { value: 'cartao_credito', label: 'Cartão de crédito' },
    { value: 'boleto', label: 'Boleto' },
    { value: 'transferencia', label: 'Transferência' },
    { value: 'a_combinar', label: 'A combinar' }
];

const COLLECTION_STATUS_LABELS = {
    pending: 'Pendente',
    partial: 'Entrada recebida / parcial',
    charged: 'Cobrado',
    negotiating: 'Negociando',
    promise: 'Promessa',
    partial_payment_received: 'Pagamento parcial recebido',
    quitado: 'Quitado / Pago'
};

const COLLECTION_STATUS_COLORS = {
    pending: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    partial: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
    charged: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    negotiating: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    promise: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    partial_payment_received: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
    paid: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    quitado: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
};

const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);

const getDateRange = (
    selectedPeriod: 'today' | '7days' | '30days' | 'month' | '60days' | 'custom' | 'byMonth',
    customStartDate: string,
    customEndDate: string,
    selectedMonth: string,
    selectedYear: string
): { startDate: Date; endDate: Date } => {
    const now = startOfDay(new Date());
    let startDate = subDays(now, 30);
    let endDate = now;

    switch (selectedPeriod) {
        case 'today':
            startDate = now;
            endDate = endOfDay(now);
            break;
        case '7days':
            startDate = subDays(now, 6);
            endDate = endOfDay(now);
            break;
        case '30days':
            startDate = subDays(now, 29);
            endDate = endOfDay(now);
            break;
        case 'month':
            startDate = startOfMonth(now);
            endDate = endOfMonth(now);
            break;
        case '60days':
            startDate = subDays(now, 59);
            endDate = endOfDay(now);
            break;
        case 'custom':
            if (customStartDate && customEndDate && customEndDate >= customStartDate) {
                startDate = startOfDay(safeParseISO(customStartDate) || now);
                endDate = endOfDay(safeParseISO(customEndDate) || now);
            }
            break;
        case 'byMonth':
            if (selectedMonth && selectedYear) {
                const monthIdx = parseInt(selectedMonth, 10);
                const yearNum = parseInt(selectedYear, 10);
                if (!isNaN(monthIdx) && !isNaN(yearNum)) {
                    const firstDay = new Date(yearNum, monthIdx, 1);
                    startDate = startOfMonth(firstDay);
                    endDate = endOfMonth(firstDay);
                }
            }
            break;
    }

    return { startDate, endDate };
};

export const FinancialView: React.FC = () => {
    const { profile, user } = useAuth();
    const [orders, setOrders] = useState<Order[]>([]);
    const [contracts, setContracts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState<'today' | '7days' | '30days' | 'month' | '60days' | 'custom' | 'byMonth'>('30days');
    const [customStartDate, setCustomStartDate] = useState<string>('');
    const [customEndDate, setCustomEndDate] = useState<string>('');
    const [selectedMonth, setSelectedMonth] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<string>('');
    const [validationError, setValidationError] = useState<string | null>(null);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [activeView, setActiveView] = useState<'radar' | 'cashflow'>('radar');

    useEffect(() => {
        if (selectedPeriod === 'custom') {
            if (!customStartDate) {
                setValidationError("Selecione a data inicial.");
            } else if (!customEndDate) {
                setValidationError("Selecione a data final.");
            } else if (customEndDate < customStartDate) {
                setValidationError("A data final não pode ser menor que a data inicial.");
            } else {
                setValidationError(null);
            }
        } else if (selectedPeriod === 'byMonth') {
            if (!selectedMonth) {
                setValidationError("Selecione o mês.");
            } else if (!selectedYear) {
                setValidationError("Selecione o ano.");
            } else {
                setValidationError(null);
            }
        } else {
            setValidationError(null);
        }
    }, [selectedPeriod, customStartDate, customEndDate, selectedMonth, selectedYear]);

    const getCustomButtonLabel = () => {
        if (selectedPeriod === 'custom' && customStartDate && customEndDate && customEndDate >= customStartDate) {
            const startFormatted = format(safeParseISO(customStartDate) || new Date(), 'dd/MM/yyyy');
            const endFormatted = format(safeParseISO(customEndDate) || new Date(), 'dd/MM/yyyy');
            return `${startFormatted} até ${endFormatted}`;
        }
        return 'Personalizado';
    };

    const getByMonthButtonLabel = () => {
        if (selectedPeriod === 'byMonth' && selectedMonth && selectedYear) {
            const monthIndex = parseInt(selectedMonth, 10);
            const monthName = MONTHS[monthIndex];
            if (monthName) {
                return `${monthName}/${selectedYear}`;
            }
        }
        return 'Por Mês';
    };

    // --- MODAL STATE ---
    const [isBaixaModalOpen, setIsBaixaModalOpen] = useState(false);
    const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
    const [amountToPay, setAmountToPay] = useState<string | number>('');
    const [payMethod, setPayMethod] = useState('pix');
    const [paymentDate, setPaymentDate] = useState<string>('');
    const [paymentNote, setPaymentNote] = useState<string>('');
    const [receiptFile, setReceiptFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    useEffect(() => {
        if (!profile?.companyId) return;
        const q = query(collection(db, 'pedidos'), where('companyId', '==', profile.companyId), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: Order[] = [];
            snapshot.forEach((docSnap) => { data.push({ id: docSnap.id, ...docSnap.data() } as Order); });
            setOrders(data);
            setLoading(false);

            // --- AUDITORIA DE LIQUIDEZ ---
            if (data.length > 0) {
                // DEBUG TACYANE
                const tacyane = data.find(o => o.customerName?.toUpperCase().includes('TACYANE'));
                if (tacyane) {
                    console.group('🔍 AUDITORIA: TACYANE');
                    console.log('Dados crus:', tacyane);
                    console.log('Balance:', getPendingBalance(tacyane));
                    console.log('Received:', getRealReceivedAmount(tacyane));
                    console.groupEnd();
                }

                const auditData = data
                    .filter(o => isValidFinancialOrder(o))
                    .map(o => ({
                        Cliente: o.customerName || 'N/A',
                        'ID': o.protocolNumber || o.id,
                        'Status Ctr': o.contractStatus || 'N/A',
                        'Status OS': o.status,
                        'Contratado': Number(o.totalAmount || (o as any).totalContractValue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                        'Recebido': getRealReceivedAmount(o).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                        'Origem': o.financialHistory?.length ? 'Histórico Real' : 'Sem Baixa',
                        'Pendente': getPendingBalance(o).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    }));
                console.groupCollapsed('🔍 AUDITORIA: Radar de Liquidez');
                console.table(auditData);
                console.groupEnd();
            }
            // -----------------------------
        }, (err) => { console.error("Error fetching financial data:", err); setLoading(false); });

        const qContracts = query(collection(db, 'contratos'), where('companyId', '==', profile.companyId));
        const unsubscribeContracts = onSnapshot(qContracts, (snapshot) => {
            const data: any[] = [];
            snapshot.forEach((docSnap) => { data.push({ id: docSnap.id, ...docSnap.data() }); });
            setContracts(data);
        }, (err) => { console.error("Error fetching contracts:", err); });

        return () => { unsubscribe(); unsubscribeContracts(); };
    }, [profile?.companyId]);

    const financialData = useMemo(() => {
        const { startDate: start, endDate: end } = getDateRange(
            selectedPeriod,
            customStartDate,
            customEndDate,
            selectedMonth,
            selectedYear
        );

        const validOrders = safeArray(orders).filter(o => isValidFinancialOrder(o));

        const inPeriod = (dateStr: string) => {
            const d = safeParseISO(dateStr);
            return d && d >= start && d <= end;
        };

        // Regra 1: RECEBIDO (Somente eventos reais confirmados no histórico)
        const received = safeArray(validOrders).reduce((acc, o) => {
            if (safeArray(o.financialHistory).length > 0) {
                const eventsInPeriod = getFinancialEventsInPeriod(o, start, end);
                const sum = safeArray(eventsInPeriod).reduce((s, e) => {
                    if (e.type === 'reversal') return s - (e.amount || 0);
                    if (['income', 'payment', 'partial_payment', 'baixa_confirmada', 'received'].includes(e.type)) return s + (e.amount || 0);
                    return s;
                }, 0);
                return acc + sum;
            }
            return acc;
        }, 0);

        // Regra 2: RECEBÍVEL (Saldo pendente de contratos ativos)
        const activeStatuses = ['em_producao', 'em_instalacao', 'production', 'installation', 'ready_for_conference', 'aguardando_materia_prima'];
        const toReceiveAtInstallation = safeArray(validOrders).reduce((acc, o) => {
            const isActive = activeStatuses.includes(o.status);
            const isNotPaid = o.paymentStatus !== 'paid';
            
            if (isActive && isNotPaid) {
                const balance = getPendingBalance(o);
                if (o.dueDate) {
                    if (inPeriod(o.dueDate)) return acc + balance;
                } else {
                    return acc + balance;
                }
            }
            return acc;
        }, 0);

        // Regra 3: MÉTODO MAIS UTILIZADO
        const topMethod = getPreferredPaymentMethod(validOrders);

        // Regra 4: VENDAS NO MÊS
        const validSalesStatuses = ['signed', 'assinado', 'approved', 'aprovado', 'em_producao', 'aguardando_materia_prima', 'instalado', 'finalizado'];
        const invalidSalesStatuses = ['rascunho', 'draft', 'pendente', 'cancelado', 'cancelled', 'deleted'];

        const isValidSale = (item: any) => {
            if (item.isDeleted === true) return false;
            const status = String(item.status || item.contractStatus || '').toLowerCase();
            if (invalidSalesStatuses.includes(status)) return false;
            return validSalesStatuses.includes(status);
        };

        const getSaleDate = (item: any, isContract: boolean) => {
            const raw = item.signedAt || item.contractSignedAt || item.approvedAt || item.createdAt;
            return safeParseISO(raw);
        };

        const getSaleAmount = (item: any) => {
            return Number(item.totalAmount || item.contractTotal || item.commercialTotal || item.finalTotal || item.total || 0);
        };

        const salesList: any[] = [];
        const processedContractIds = new Set<string>();
        
        safeArray(contracts).forEach(c => {
            if (isValidSale(c)) {
                const date = getSaleDate(c, true);
                if (date && date >= start && date <= end) {
                    const amount = getSaleAmount(c);
                    if (amount > 0) {
                        salesList.push({
                            id: c.id,
                            client: c.customerName || c.clientName || 'N/A',
                            protocol: c.protocolNumber || c.id,
                            date: date,
                            amount: amount,
                            status: c.status || 'N/A',
                            type: 'Contrato'
                        });
                        processedContractIds.add(c.id);
                    }
                }
            }
        });

        safeArray(orders).forEach(o => {
            if (o.contractId && processedContractIds.has(o.contractId)) return;
            if (isValidSale(o)) {
                const date = getSaleDate(o, false);
                if (date && date >= start && date <= end) {
                    const amount = getSaleAmount(o);
                    if (amount > 0) {
                        salesList.push({
                            id: o.id,
                            client: o.customerName || o.clientName || 'N/A',
                            protocol: o.protocolNumber || o.id,
                            date: date,
                            amount: amount,
                            status: o.status || 'N/A',
                            type: 'O.S. Avulsa'
                        });
                    }
                }
            }
        });

        salesList.sort((a, b) => b.date.getTime() - a.date.getTime());
        const vendasNoMes = salesList.reduce((acc, s) => acc + s.amount, 0);
        const qtdVendas = salesList.length;

        return {
            received,
            toReceiveAtInstallation,
            topMethod,
            vendasNoMes,
            qtdVendas,
            salesList
        };
    }, [orders, contracts, selectedPeriod, customStartDate, customEndDate, selectedMonth, selectedYear]);

    const forecastData = useMemo(() => {
        const validOrders = safeArray(orders).filter(o => isValidFinancialOrder(o));
        const allForecast = buildCashflowForecast(validOrders);
        const now = startOfDay(new Date());
        let start = now;
        let end = addDays(now, 30);

        if (selectedPeriod === 'today') {
            end = endOfDay(now);
        } else if (selectedPeriod === '7days') {
            end = addDays(now, 7);
        } else if (selectedPeriod === 'month') {
            start = startOfMonth(now);
            end = endOfMonth(now);
        } else if (selectedPeriod === '60days') {
            end = addDays(now, 60);
        } else if (selectedPeriod === 'custom' || selectedPeriod === 'byMonth') {
            const range = getDateRange(selectedPeriod, customStartDate, customEndDate, selectedMonth, selectedYear);
            start = range.startDate;
            end = range.endDate;
        }

        const filtered = safeArray(allForecast).filter(item => {
            if (!item.dueDate) return true;
            const d = safeParseISO(item.dueDate);
            return d && d >= start && d <= end;
        });

        // KPIs Previsivos
        const toReceive = safeArray(filtered).reduce((acc, item) => acc + (item.status !== 'recebido' ? item.balance : 0), 0);
        const overdue = safeArray(filtered).reduce((acc, item) => acc + (item.status === 'atrasado' ? item.balance : 0), 0);
        const confirmed = safeArray(filtered).reduce((acc, item) => acc + item.received, 0);
        
        return {
            items: filtered,
            kpis: {
                toReceive,
                overdue,
                confirmed,
                netForecast: toReceive - (overdue * 0.2) // Heurística: 20% do atrasado é considerado perda/atraso longo
            }
        };
    }, [orders, selectedPeriod, customStartDate, customEndDate, selectedMonth, selectedYear]);

    const { activeOSData, pendingContractsData, liquidatedData } = useMemo(() => {
        const today = new Date();
        const term = normalizeStr(searchTerm);

            const mapped = orders
                .filter(o => isValidFinancialOrder(o))
                .map(o => {
                    const balance = getPendingBalance(o);
                    const received = getRealReceivedAmount(o);
                    const due = o.dueDate ? safeParseISO(o.dueDate) : null;
                    const overdueDays = due ? differenceInDays(today, due) : 0;
                    const isOverdue = due && isBefore(due, today) && format(due, 'yyyy-MM-dd') !== format(today, 'yyyy-MM-dd');
                    
                    let derivedStatus = o.collectionStatus || 'pending';
                    if (balance <= 0.01) {
                        derivedStatus = 'paid';
                    } else {
                        if (derivedStatus === 'quitado' || derivedStatus === 'paid') {
                            derivedStatus = received > 0 ? 'partial_payment_received' : 'pending';
                        } else if (derivedStatus === 'pending' && received > 0) {
                            derivedStatus = 'partial';
                        }
                    }
                    
                    let searchScore = term ? calculateSearchScore(o.customerName || '', term) : 1;
                    return { ...o, balance, received, isOverdue, overdueDays, derivedStatus, _searchScore: searchScore };
                })
                .filter(o => o._searchScore > 0);

        const isOrderStatus = (st: string) => ['aguardando_materia_prima', 'em_producao', 'production', 'installation', 'em_instalacao', 'ready_for_conference', 'completed', 'finalizado'].includes(st);

        const activeOSData = mapped.filter(o => isOrderStatus(o.status) && o.balance > 0.01).sort((a, b) => b.balance - a.balance);
        const pendingContractsData = mapped.filter(o => !isOrderStatus(o.status) && o.balance > 0.01).sort((a, b) => b.balance - a.balance);
        const liquidatedData = mapped.filter(o => o.balance <= 0.01 && o.received > 0).sort((a, b) => b.received - a.received);

        return { activeOSData, pendingContractsData, liquidatedData };
    }, [orders, searchTerm]);

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const selectedOrder = useMemo(() => orders.find(o => o.id === selectedOrderId), [orders, selectedOrderId]);

    const handleBillingStatusChange = async (order: any, newStatus: string) => {
        try {
            const balance = getPendingBalance(order);
            const received = getRealReceivedAmount(order);
            const orderRef = doc(db, 'pedidos', order.id);
            const historyUpdate = arrayUnion({
                action: `Status alterado para ${COLLECTION_STATUS_LABELS[newStatus as keyof typeof COLLECTION_STATUS_LABELS]}`,
                timestamp: toISODateSafe(new Date())!,
                userId: user?.uid
            });

            if (newStatus === 'paid' || newStatus === 'quitado') {
                if (balance > 0) {
                    const confirm = window.confirm(`Esse pedido ainda possui saldo pendente (${formatCurrency(balance)}). Deseja registrar a baixa total agora?`);
                    if (!confirm) return; // cancela
                    
                    const newEventId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                    const methodLabel = PAYMENT_METHODS.find(m => m.value === (order.paymentConditions?.method || (order as any).paymentMethod || 'pix'))?.label || 'PIX';

                    const updateFields = removeUndefinedDeep({
                        collectionStatus: 'paid',
                        paymentStatus: 'paid',
                        billingStatus: 'paid',
                        downPayment: received + balance,
                        receivedAmount: received + balance,
                        balance: 0,
                        lastPaymentAt: toISODateSafe(new Date()),
                        financialHistory: arrayUnion({
                            id: newEventId,
                            amount: balance,
                            method: order.paymentConditions?.method || (order as any).paymentMethod || 'pix',
                            methodLabel,
                            paidAt: toISODateSafe(new Date()),
                            note: 'Baixa automática (Quitação Integral) via alteração de status.',
                            registeredAt: toISODateSafe(new Date()),
                            registeredBy: user?.uid || 'unknown',
                            type: 'payment',
                            date: toISODateSafe(new Date()),
                            paymentMethod: order.paymentConditions?.method || (order as any).paymentMethod || 'pix',
                            notes: 'Baixa automática (Quitação Integral) via alteração de status.',
                            createdAt: toISODateSafe(new Date()),
                            userId: user?.uid || 'unknown',
                            source: 'manual_baixa'
                        }),
                        collectionHistory: historyUpdate,
                        paymentHistory: arrayUnion({
                            amount: balance,
                            method: order.paymentConditions?.method || (order as any).paymentMethod || 'pix',
                            methodLabel,
                            paidAt: toISODateSafe(new Date()),
                            note: 'Baixa automática (Quitação Integral) via alteração de status.',
                            registeredAt: toISODateSafe(new Date()),
                            registeredBy: user?.uid || 'unknown'
                        }),
                        updatedAt: toISODateSafe(new Date()),
                        updatedBy: user?.uid,
                        updatedByName: profile?.name || user?.email
                    });

                    await updateDoc(orderRef, updateFields);

                    if (profile?.companyId) {
                        await syncBonusWithFinancialEvent(order.id, newEventId, profile.companyId);
                    }
                } else {
                    const updateFields = removeUndefinedDeep({
                        collectionStatus: 'paid',
                        paymentStatus: 'paid',
                        billingStatus: 'paid',
                        receivedAmount: received,
                        balance: 0,
                        collectionHistory: historyUpdate,
                        updatedAt: toISODateSafe(new Date()),
                        updatedBy: user?.uid,
                        updatedByName: profile?.name || user?.email
                    });
                    await updateDoc(orderRef, updateFields);
                }
            } else if (newStatus === 'pending') {
                if (received > 0) {
                    alert("Este pedido já possui recebimento registrado. Use Entrada Recebida / Parcial ou Quitado / Pago.");
                    return;
                }
                const updateFields = removeUndefinedDeep({
                    collectionStatus: newStatus,
                    billingStatus: newStatus,
                    receivedAmount: 0,
                    balance: Number(order.totalAmount || 0),
                    collectionHistory: historyUpdate,
                    updatedAt: toISODateSafe(new Date()),
                    updatedBy: user?.uid,
                    updatedByName: profile?.name || user?.email
                });
                await updateDoc(orderRef, updateFields);
            } else {
                const updateFields = removeUndefinedDeep({
                    collectionStatus: newStatus,
                    billingStatus: newStatus,
                    collectionHistory: historyUpdate,
                    updatedAt: toISODateSafe(new Date()),
                    updatedBy: user?.uid,
                    updatedByName: profile?.name || user?.email
                });
                await updateDoc(orderRef, updateFields);
            }
        } catch (e) { 
            console.error(e); 
            alert('Erro ao atualizar status');
        }
    };

    const confirmBaixa = async () => {
        if (!selectedOrder) return;
        
        const numericAmount = Number(amountToPay) || 0;
        const balance = getPendingBalance(selectedOrder);
        
        if (numericAmount <= 0) {
            alert('O valor recebido precisa ser maior que 0.');
            return;
        }

        if (numericAmount > balance + 0.01) {
            alert('O valor informado é maior que o saldo pendente.');
            return;
        }

        if (!payMethod) {
            alert('Selecione uma forma de pagamento.');
            return;
        }

        let receiptMetadata: any = null;

        if (receiptFile) {
            if (!profile?.companyId) {
                alert('Erro: ID da empresa não encontrado no perfil do usuário.');
                return;
            }
            setIsUploading(true);
            try {
                const timestamp = Date.now();
                const storagePath = `companies/${profile.companyId}/orders/${selectedOrder.id}/payments/${timestamp}_${receiptFile.name}`;
                const fileRef = ref(storage, storagePath);
                
                const uploadTask = uploadBytesResumable(fileRef, receiptFile);
                
                await new Promise<void>((resolve, reject) => {
                    uploadTask.on('state_changed', 
                        (snapshot) => {
                            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                            setUploadProgress(progress);
                        }, 
                        (error) => {
                            reject(error);
                        }, 
                        () => {
                            resolve();
                        }
                    );
                });

                const downloadUrl = await getDownloadURL(fileRef);

                receiptMetadata = {
                    name: receiptFile.name,
                    url: downloadUrl,
                    type: receiptFile.type,
                    size: receiptFile.size,
                    storagePath: storagePath,
                    uploadedAt: toISODateSafe(new Date())!,
                    uploadedBy: user?.uid || 'unknown'
                };
            } catch (err: any) {
                console.error('Erro no upload:', err);
                alert('Erro ao fazer upload do comprovante.');
                setIsUploading(false);
                return;
            }
            setIsUploading(false);
        }

        try {
            const orderRef = doc(db, 'pedidos', selectedOrder.id);
            const currentReceived = getRealReceivedAmount(selectedOrder);
            const newTotalReceived = Number((currentReceived + numericAmount).toFixed(2));
            const totalContracted = Number(selectedOrder.totalAmount || 0);
            
            const computedBalance = Math.max(0, Number((totalContracted - newTotalReceived).toFixed(2)));
            const isFullyPaid = computedBalance <= 0.01;
            
            const finalBalance = isFullyPaid ? 0 : computedBalance;
            const finalReceived = isFullyPaid ? totalContracted : newTotalReceived;
            const newStatus = isFullyPaid ? 'paid' : 'partial_payment_received';
            
            const newEventId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            const methodLabel = PAYMENT_METHODS.find(m => m.value === payMethod)?.label || payMethod;

            const updateFields = removeUndefinedDeep({
                paymentStatus: isFullyPaid ? 'paid' : 'partial',
                downPayment: finalReceived, // Cache para compatibilidade
                financialHistory: arrayUnion({
                    id: newEventId,
                    amount: numericAmount,
                    method: payMethod,
                    methodLabel,
                    paidAt: toISODateSafe(paymentDate) || toISODateSafe(new Date()),
                    note: paymentNote || '',
                    receiptFile: receiptMetadata || null,
                    registeredAt: toISODateSafe(new Date()),
                    registeredBy: user?.uid || 'unknown',
                    registeredByName: profile?.name || user?.email || 'Sistema',
                    type: 'payment',
                    date: toISODateSafe(paymentDate) || toISODateSafe(new Date()),
                    paymentMethod: payMethod,
                    notes: paymentNote || '',
                    createdAt: toISODateSafe(new Date()),
                    userId: user?.uid || 'unknown',
                    source: 'manual_baixa'
                }),
                collectionStatus: newStatus,
                billingStatus: newStatus,
                receivedAmount: finalReceived,
                balance: finalBalance,
                lastPaymentAt: toISODateSafe(paymentDate) || toISODateSafe(new Date()),
                paymentHistory: arrayUnion({
                    amount: numericAmount,
                    method: payMethod,
                    methodLabel,
                    paidAt: toISODateSafe(paymentDate) || toISODateSafe(new Date()),
                    note: paymentNote || '',
                    receiptFile: receiptMetadata || null,
                    registeredAt: toISODateSafe(new Date()),
                    registeredBy: user?.uid || 'unknown',
                    registeredByName: profile?.name || user?.email || 'Sistema'
                }),
                updatedAt: toISODateSafe(new Date()),
                updatedBy: user?.uid,
                updatedByName: profile?.name || user?.email
            });

            await updateDoc(orderRef, updateFields);

            // 4. Update Client Referral Status: pago (Rule #Parceiros)
            if (isFullyPaid && selectedOrder.clientId) {
                await updateDoc(doc(db, 'clients', selectedOrder.clientId), { 
                    referralStatus: 'pago' 
                });
            }

            // 3. Sync Bonus with Financial Event (Rule #Parceiros)
            if (profile?.companyId) {
                await syncBonusWithFinancialEvent(
                    selectedOrder.id, 
                    newEventId, 
                    profile.companyId
                );
            }

            setIsBaixaModalOpen(false);
            setAmountToPay('');
            setPaymentNote('');
            setReceiptFile(null);
            setUploadProgress(0);
        } catch (e) { 
            console.error(e); 
            alert('Erro ao registrar baixa.');
        }
    };

    const handleReversal = async (order: Order, eventId: string) => {
        if (!window.confirm('Deseja realmente estornar este recebimento? Isso criará um lançamento negativo no histórico.')) return;
        
        try {
            const event = safeArray(order.financialHistory).find(e => e.id === eventId);
            if (!event) return;

            const reversalEventId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            const reversalEvent = {
                id: reversalEventId,
                type: 'reversal',
                amount: event.amount,
                reason: `Estorno do lançamento ID: ${eventId.substring(0, 8)}`,
                reversedAt: toISODateSafe(new Date())!,
                reversedBy: user?.uid || 'unknown',
                // Compatibility fields:
                date: toISODateSafe(new Date())!,
                paymentMethod: event.paymentMethod || 'pix',
                notes: `Estorno do lançamento ID: ${eventId.substring(0, 8)}`,
                createdAt: toISODateSafe(new Date())!,
                userId: user?.uid || 'unknown',
                source: 'adjustment',
                referenceEventId: eventId
            };

            const newTotalReceived = Math.max(0, Number((getRealReceivedAmount(order) - event.amount).toFixed(2)));
            const totalContracted = Number(order.totalAmount || 0);
            const computedBalance = Math.max(0, Number((totalContracted - newTotalReceived).toFixed(2)));
            
            const isFullyPaid = computedBalance <= 0.01;
            const finalBalance = isFullyPaid ? 0 : computedBalance;
            const finalReceived = isFullyPaid ? totalContracted : newTotalReceived;
            const newStatus = isFullyPaid ? 'paid' : (finalReceived > 0 ? 'partial_payment_received' : 'pending');

            const orderRef = doc(db, 'pedidos', order.id);

            const updateFields = removeUndefinedDeep({
                financialHistory: arrayUnion(reversalEvent),
                downPayment: finalReceived, // Compatibility
                paymentStatus: finalReceived <= 0 ? 'pending' : 'partial',
                collectionStatus: newStatus,
                billingStatus: newStatus,
                receivedAmount: finalReceived,
                balance: finalBalance,
                updatedAt: toISODateSafe(new Date()),
                updatedBy: user?.uid,
                updatedByName: profile?.name || user?.email
            });

            await updateDoc(orderRef, updateFields);

            alert('Estorno realizado com sucesso.');
        } catch (e) { 
            console.error(e); 
            alert('Erro ao realizar estorno.');
        }
    };
    const toggleExpand = (id: string) => {
        setExpandedOrderId(prev => prev === id ? null : id);
    };

    const renderOrderTable = (title: string, data: any[], emptyMessage: string, icon: React.ReactNode) => (
        <div className="mb-8 border border-slate-100 dark:border-white/5 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                <h3 className="text-[11px] font-black text-slate-900 dark:text-white uppercase flex items-center gap-2 tracking-widest">
                    {icon} {title} <span className="ml-2 px-2 py-0.5 bg-brand-emerald/10 text-brand-emerald rounded-full text-[9px]">{data.length}</span>
                </h3>
            </div>
            {data.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-[10px] font-bold uppercase tracking-widest">{emptyMessage}</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white dark:bg-slate-900">
                                <th className="px-6 py-4 text-left">Pedido / Protocolo</th>
                                <th className="px-6 py-4 text-left">Fluxo</th>
                                <th className="px-6 py-4 text-right">Contratado</th>
                                <th className="px-6 py-4 text-right">Recebido</th>
                                <th className="px-6 py-4 text-right">Saldo Pendente</th>
                                <th className="px-6 py-4 text-center">Método Previsto</th>
                                <th className="px-6 py-4 text-center">Status Cobrança</th>
                                <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                            {data.map((order) => (
                                <React.Fragment key={order.id}>
                                    <tr className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-all bg-white dark:bg-slate-900">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-900 dark:text-white uppercase"><HighlightText text={order.customerName} term={searchTerm} /></span>
                                                <span className="text-[9px] font-bold text-slate-400">RADAR # {order?.protocolNumber || '???'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter",
                                                    order.status === 'finalizado' ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"
                                                )}>
                                                    {order.status}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-xs font-bold text-slate-400 tabular-nums">{formatCurrency(order.totalAmount || 0)}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-xs font-bold text-emerald-500 tabular-nums">{formatCurrency(order.received)}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-xs font-black text-rose-500 tabular-nums">{formatCurrency(order.balance)}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded">
                                                {order.paymentConditions?.method?.toUpperCase() || (order as any).paymentMethod?.toUpperCase() || 'A DEFINIR'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <select 
                                                value={(order as any).derivedStatus || 'pending'} 
                                                onChange={(e) => handleBillingStatusChange(order, e.target.value)}
                                                className={cn(
                                                    "text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg outline-none cursor-pointer border-none",
                                                    COLLECTION_STATUS_COLORS[(order as any).derivedStatus as keyof typeof COLLECTION_STATUS_COLORS] || COLLECTION_STATUS_COLORS.pending
                                                )}
                                            >
                                                {Object.entries(COLLECTION_STATUS_LABELS).map(([v, l]) => <option key={v} value={v} className="text-slate-900">{l}</option>)}
                                            </select>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm"
                                                    onClick={() => toggleExpand(order.id)}
                                                    className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                                                >
                                                    <Clock className="h-4 w-4" />
                                                </Button>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm"
                                                    onClick={() => {
                                                        const phone = order.phone?.replace(/\D/g, '');
                                                        window.open(`https://wa.me/55${phone}`, '_blank');
                                                    }}
                                                    className="h-8 w-8 p-0 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50"
                                                >
                                                    <WhatsAppIcon className="h-4 w-4" />
                                                </Button>
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm"
                                                    onClick={() => {
                                                        setSelectedOrderId(order.id);
                                                        setAmountToPay(order.balance);
                                                        setPayMethod('pix');
                                                        const d = new Date();
                                                        const year = d.getFullYear();
                                                        const month = String(d.getMonth() + 1).padStart(2, '0');
                                                        const day = String(d.getDate()).padStart(2, '0');
                                                        setPaymentDate(`${year}-${month}-${day}`);
                                                        setPaymentNote('');
                                                        setReceiptFile(null);
                                                        setIsUploading(false);
                                                        setUploadProgress(0);
                                                        setIsBaixaModalOpen(true);
                                                    }}
                                                    className="h-8 w-8 p-0 text-brand-emerald hover:text-emerald-600 hover:bg-emerald-50"
                                                    disabled={order.balance <= 0.01}
                                                >
                                                    <Plus className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedOrderId === order.id && (
                                        <tr className="bg-slate-50/50 dark:bg-white/5">
                                            <td colSpan={8} className="px-8 py-6">
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Histórico de Transações</h4>
                                                        <span className="text-[9px] font-bold text-slate-400">ID: {order.id}</span>
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-1 gap-2">
                                                        {safeArray(order.financialHistory).length === 0 && order.downPayment > 0 && (
                                                            <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-white/5">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
                                                                        <Calendar className="h-4 w-4 text-amber-600" />
                                                                    </div>
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase">Saldo Inicial (Legado)</span>
                                                                        <span className="text-[9px] font-bold text-slate-400">Migrado do sistema anterior</span>
                                                                    </div>
                                                                </div>
                                                                <span className="text-xs font-black text-slate-900 dark:text-white tabular-nums">{formatCurrency(order.downPayment)}</span>
                                                            </div>
                                                        )}
                                                        
                                                        {safeArray(order.financialHistory).map((event: any) => {
                                                            const isReversal = event.type === 'reversal';
                                                            const dateToDisplay = event.paidAt || event.reversedAt || event.date || event.createdAt;
                                                            const methodToDisplay = event.methodLabel || event.paymentMethod || 'PIX';
                                                            const noteToDisplay = event.note || event.notes || event.reason || '';
                                                            const userToDisplay = event.registeredByName || event.userName || 'Sistema';
                                                            const hasReceipt = event.receiptFile && event.receiptFile.url;

                                                            return (
                                                                <div key={event.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-white/5 gap-4">
                                                                    <div className="flex items-start gap-4">
                                                                        <div className={cn(
                                                                            "h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                                                                            isReversal ? "bg-rose-100 dark:bg-rose-900/30" : "bg-emerald-100 dark:bg-emerald-900/30"
                                                                        )}>
                                                                            {isReversal ? <Clock className="h-4 w-4 text-rose-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                                                                        </div>
                                                                        <div className="flex flex-col min-w-0">
                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase">
                                                                                    {isReversal ? 'Estorno' : 'Recebimento'} - {methodToDisplay}
                                                                                </span>
                                                                                <span className="px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-[7px] font-black uppercase text-slate-400">
                                                                                    {event.source === 'contract_down_payment' ? 'Contrato' : 'Baixa Manual'}
                                                                                </span>
                                                                            </div>
                                                                            <span className="text-[9px] font-bold text-slate-400 mt-0.5">
                                                                                {formatVisualDate(dateToDisplay)} • Por {userToDisplay}
                                                                            </span>
                                                                            {noteToDisplay && (
                                                                                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 italic">
                                                                                    "{noteToDisplay}"
                                                                                </span>
                                                                            )}
                                                                            {!isReversal && (
                                                                                <div className="mt-2 text-[9px]">
                                                                                    {hasReceipt ? (
                                                                                        <button
                                                                                            onClick={() => window.open(event.receiptFile.url, "_blank")}
                                                                                            className="text-brand-emerald hover:text-emerald-600 font-bold underline uppercase tracking-wider flex items-center gap-1"
                                                                                        >
                                                                                            Ver comprovante
                                                                                        </button>
                                                                                    ) : (
                                                                                        <span className="text-slate-400 italic">Sem comprovante anexado</span>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 border-t border-slate-50 dark:border-white/5 pt-3 md:pt-0 md:border-none">
                                                                        <span className={cn(
                                                                            "text-xs font-black tabular-nums",
                                                                            isReversal ? "text-rose-500" : "text-slate-900 dark:text-white"
                                                                        )}>
                                                                            {isReversal ? '-' : ''}{formatCurrency(event.amount)}
                                                                        </span>
                                                                        {!isReversal && (
                                                                            <Button 
                                                                                variant="ghost" 
                                                                                size="sm"
                                                                                onClick={() => handleReversal(order, event.id)}
                                                                                className="h-6 px-2 text-[8px] font-black text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/10"
                                                                            >
                                                                                ESTORNAR
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );

    if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="w-10 h-10 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin" /></div>;

    return (
        <div className="flex flex-col bg-slate-50 dark:bg-[#050505] p-6 gap-6 min-h-screen">
            {/* --- HEADER --- */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                            {activeView === 'radar' ? <LayoutDashboard className="h-6 w-6 text-brand-emerald" /> : <BarChart3 className="h-6 w-6 text-brand-emerald" />}
                            {activeView === 'radar' ? 'Radar de Liquidez' : 'Fluxo de Caixa'}
                        </h1>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">
                            {activeView === 'radar' ? 'Gestão de Recebimentos e Auditoria' : 'Projeção de Entradas e Análise de Crédito'}
                        </p>
                    </div>

                    <div className="flex bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
                        <button 
                            onClick={() => setActiveView('radar')}
                            className={cn(
                                "px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                                activeView === 'radar' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
                            )}
                        >
                            Liquidez Real
                        </button>
                        <button 
                            onClick={() => setActiveView('cashflow')}
                            className={cn(
                                "px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                                activeView === 'cashflow' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
                            )}
                        >
                            Projeção Previsiva
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm gap-1">
                    {[
                        { id: 'today', label: 'Hoje' },
                        { id: '7days', label: '7 Dias' },
                        { id: '30days', label: '30 Dias' },
                        { id: 'month', label: 'Mês' },
                        { id: '60days', label: '60 Dias' },
                        { id: 'custom', label: getCustomButtonLabel() },
                        { id: 'byMonth', label: getByMonthButtonLabel() }
                    ].map((p) => (
                        <button
                            key={p.id}
                            onClick={() => setSelectedPeriod(p.id as any)}
                            className={cn(
                                "px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                                selectedPeriod === p.id 
                                    ? "bg-brand-emerald text-white shadow-lg shadow-brand-emerald/20" 
                                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            )}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Custom Range or Monthly selection panel */}
            {(selectedPeriod === 'custom' || selectedPeriod === 'byMonth') && (
                <div className="w-full flex justify-end">
                    <div className="w-full lg:max-w-xl">
                        {selectedPeriod === 'custom' && (
                            <div className="flex flex-col sm:flex-row items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm w-full animate-fadeIn">
                                <div className="flex flex-col w-full sm:w-auto">
                                    <label className="text-[10px] font-black text-slate-450 dark:text-slate-400 uppercase tracking-wider mb-1">Data Inicial</label>
                                    <Input
                                        type="date"
                                        value={customStartDate}
                                        onChange={(e) => setCustomStartDate(e.target.value)}
                                        className="h-9 py-1 px-3 rounded-lg text-xs font-bold w-full sm:w-44"
                                    />
                                </div>
                                <div className="flex flex-col w-full sm:w-auto">
                                    <label className="text-[10px] font-black text-slate-450 dark:text-slate-400 uppercase tracking-wider mb-1">Data Final</label>
                                    <Input
                                        type="date"
                                        value={customEndDate}
                                        onChange={(e) => setCustomEndDate(e.target.value)}
                                        className="h-9 py-1 px-3 rounded-lg text-xs font-bold w-full sm:w-44"
                                    />
                                </div>
                                {validationError && (
                                    <div className="text-red-500 font-bold text-xs pt-2 sm:pt-4 sm:pl-2 shrink-0">
                                        {validationError}
                                    </div>
                                )}
                            </div>
                        )}

                        {selectedPeriod === 'byMonth' && (
                            <div className="flex flex-col sm:flex-row items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm w-full animate-fadeIn">
                                <div className="flex flex-col w-full sm:w-auto">
                                    <label className="text-[10px] font-black text-slate-450 dark:text-slate-400 uppercase tracking-wider mb-1">Mês</label>
                                    <select
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="flex h-9 rounded-lg border border-slate-200 bg-white dark:bg-slate-950 px-3 py-1 text-xs font-bold text-slate-800 dark:text-white w-full sm:w-44"
                                    >
                                        <option value="">Selecione o mês</option>
                                        {MONTHS.map((m, idx) => (
                                            <option key={m} value={String(idx)}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col w-full sm:w-auto">
                                    <label className="text-[10px] font-black text-slate-450 dark:text-slate-400 uppercase tracking-wider mb-1">Ano</label>
                                    <select
                                        value={selectedYear}
                                        onChange={(e) => setSelectedYear(e.target.value)}
                                        className="flex h-9 rounded-lg border border-slate-200 bg-white dark:bg-slate-950 px-3 py-1 text-xs font-bold text-slate-800 dark:text-white w-full sm:w-44"
                                    >
                                        <option value="">Selecione o ano</option>
                                        {YEARS.map((y) => (
                                            <option key={y} value={String(y)}>{y}</option>
                                        ))}
                                    </select>
                                </div>
                                {validationError && (
                                    <div className="text-red-500 font-bold text-xs pt-2 sm:pt-4 sm:pl-2 shrink-0">
                                        {validationError}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- TOP KPIs --- */}
            <div className={cn("grid gap-6", activeView === 'radar' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-5" : "grid-cols-1 md:grid-cols-4")}>
                {activeView === 'radar' ? (
                    <>
                        <div className="rocha-card bg-emerald-500 text-white border-none p-8 flex flex-col justify-between min-h-[160px] shadow-xl shadow-emerald-500/10">
                            <div className="flex justify-between items-start">
                                <span className="text-[11px] font-black uppercase tracking-widest text-white/80">Confirmado em Caixa</span>
                                <CheckCircle2 className="h-5 w-5 text-white/50" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black tabular-nums">{formatCurrency(financialData.received)}</h2>
                                <p className="text-[9px] font-bold text-white/60 uppercase mt-2">Sinais e quitações reais confirmadas</p>
                            </div>
                        </div>

                        <div className="rocha-card bg-white dark:bg-slate-900 border-none p-8 flex flex-col justify-between min-h-[160px] shadow-sm">
                            <div className="flex justify-between items-start">
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Recebível na Instalação</span>
                                <Wallet className="h-5 w-5 text-brand-emerald" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black tabular-nums text-slate-900 dark:text-white">{formatCurrency(financialData.toReceiveAtInstallation)}</h2>
                                <p className="text-[9px] font-bold text-slate-400 uppercase mt-2">Saldo de contratos ativos em fluxo</p>
                            </div>
                        </div>

                        <div className="rocha-card bg-white dark:bg-slate-900 border-none p-8 flex flex-col justify-between min-h-[160px] shadow-sm">
                            <div className="flex justify-between items-start">
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Método de Preferência</span>
                                <CreditCard className="h-5 w-5 text-brand-emerald" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase">{financialData.topMethod.name}</h2>
                                <p className="text-[9px] font-bold text-emerald-500 uppercase mt-2">
                                    Usado em {financialData.topMethod.percent.toFixed(0)}% das baixas reais
                                </p>
                            </div>
                        </div>

                        <div className="rocha-card bg-white dark:bg-slate-900 border-none p-8 flex flex-col justify-between min-h-[160px] shadow-sm">
                            <div className="flex justify-between items-start">
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Alertas de Auditoria</span>
                                <AlertCircle className="h-5 w-5 text-rose-500" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase">{activeOSData.length + pendingContractsData.length}</h2>
                                <p className="text-[9px] font-bold text-rose-500 uppercase mt-2">Baixas pendentes identificadas</p>
                            </div>
                        </div>

                        <div 
                            onClick={() => setIsSalesModalOpen(true)}
                            className="rocha-card bg-indigo-500 text-white border-none p-8 flex flex-col justify-between min-h-[160px] shadow-xl shadow-indigo-500/10 cursor-pointer hover:bg-indigo-600 transition-colors"
                        >
                            <div className="flex justify-between items-start">
                                <span className="text-[11px] font-black uppercase tracking-widest text-white/80">
                                    {selectedPeriod === 'month' || selectedPeriod === 'byMonth' ? 'Vendas no Mês' : 'Vendas no Período'}
                                </span>
                                <TrendingUp className="h-5 w-5 text-white/50" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black tabular-nums">{formatCurrency(financialData.vendasNoMes)}</h2>
                                <p className="text-[9px] font-bold text-white/60 uppercase mt-2">{financialData.qtdVendas} {financialData.qtdVendas === 1 ? 'venda' : 'vendas'} {selectedPeriod === 'month' || selectedPeriod === 'byMonth' ? 'neste mês' : 'neste período'}</p>
                            </div>
                        </div>
                        </>
                ) : (
                    <>
                        <div className="rocha-card bg-blue-600 text-white border-none p-8 flex flex-col justify-between min-h-[160px] shadow-xl shadow-blue-500/10">
                            <div className="flex justify-between items-start">
                                <span className="text-[11px] font-black uppercase tracking-widest text-white/80">A Receber no Período</span>
                                <ArrowUpRight className="h-5 w-5 text-white/50" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black tabular-nums">{formatCurrency(forecastData.kpis.toReceive)}</h2>
                                <p className="text-[9px] font-bold text-white/60 uppercase mt-2">Parcelas futuras projetadas</p>
                            </div>
                        </div>

                        <div className="rocha-card bg-white dark:bg-slate-900 border-none p-8 flex flex-col justify-between min-h-[160px] shadow-sm">
                            <div className="flex justify-between items-start">
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Vencido / Atrasado</span>
                                <ArrowDownRight className="h-5 w-5 text-rose-500" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black tabular-nums text-rose-500">{formatCurrency(forecastData.kpis.overdue)}</h2>
                                <p className="text-[9px] font-bold text-slate-400 uppercase mt-2">Inadimplência ou atraso técnico</p>
                            </div>
                        </div>

                        <div className="rocha-card bg-white dark:bg-slate-900 border-none p-8 flex flex-col justify-between min-h-[160px] shadow-sm">
                            <div className="flex justify-between items-start">
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Recebido no Fluxo</span>
                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase">{formatCurrency(forecastData.kpis.confirmed)}</h2>
                                <p className="text-[9px] font-bold text-slate-400 uppercase mt-2">Baixas vinculadas às parcelas</p>
                            </div>
                        </div>

                        <div className="rocha-card bg-slate-900 text-white border-none p-8 flex flex-col justify-between min-h-[160px] shadow-xl">
                            <div className="flex justify-between items-start">
                                <span className="text-[11px] font-black uppercase tracking-widest text-white/50">Previsão Líquida</span>
                                <TrendingUp className="h-5 w-5 text-brand-emerald" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-white tabular-nums">{formatCurrency(forecastData.kpis.netForecast)}</h2>
                                <p className="text-[9px] font-bold text-emerald-400 uppercase mt-2">Projeção conservadora de caixa</p>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* --- LISTAGEM --- */}
            <div className="rocha-panel bg-white dark:bg-slate-900 border-none shadow-sm rounded-3xl overflow-hidden flex-1 p-6">
                {activeView === 'radar' ? (
                    <>
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter flex items-center gap-2">
                                Rastreador de Valores
                            </h3>
                            <Input 
                                value={searchTerm} 
                                onChange={(e) => setSearchTerm(e.target.value)} 
                                placeholder="BUSCAR CONTRATANTE..." 
                                className="h-10 w-64 bg-slate-50 dark:bg-white/5 border-none rounded-xl text-[10px] font-bold uppercase px-4 ring-offset-transparent focus-visible:ring-emerald-500" 
                            />
                        </div>

                        {renderOrderTable(
                            "Radar de Baixas (O.S. Ativa)",
                            activeOSData,
                            "Nenhuma O.S. ativa com saldo pendente encontrada.",
                            <Clock className="h-4 w-4 text-emerald-500" />
                        )}

                        {renderOrderTable(
                            "Contratos Avulsos (Aguardando O.S.)",
                            pendingContractsData,
                            "Nenhum contrato solto pendente no momento.",
                            <LayoutDashboard className="h-4 w-4 text-blue-500" />
                        )}

                        {renderOrderTable(
                            "Recebimentos Liquidados (Extrato)",
                            liquidatedData,
                            "Nenhum valor totalmente liquidado no período selecionado.",
                            <CheckCircle2 className="h-4 w-4 text-brand-emerald" />
                        )}
                    </>
                ) : (
                    <>
                        <div className="p-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
                            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-brand-emerald" /> Projeção de Parcelas Futuristas
                            </h3>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50 dark:bg-white/5">
                                        <th className="px-6 py-4 text-left">Contratante / Protocolo</th>
                                        <th className="px-6 py-4 text-left">Parcela</th>
                                        <th className="px-6 py-4 text-center">Vencimento</th>
                                        <th className="px-6 py-4 text-right">Valor Parcela</th>
                                        <th className="px-6 py-4 text-right">Recebido</th>
                                        <th className="px-6 py-4 text-right">Saldo</th>
                                        <th className="px-6 py-4 text-center">Status</th>
                                        <th className="px-6 py-4 text-right">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                                    {safeArray(forecastData.items).map((item) => (
                                        <tr key={item.id} className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-black text-slate-900 dark:text-white uppercase">{item.customerName}</span>
                                                    <span className="text-[9px] font-bold text-slate-400">OS # {item.protocolNumber}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="text-[10px] font-black text-slate-900 dark:text-white">{item.dueDate ? formatVisualDate(item.dueDate) : 'S/ PREVISÃO'}</span>
                                                    {item.status === 'atrasado' && <span className="text-[8px] font-black text-rose-500 uppercase">Atrasado</span>}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className="text-xs font-bold text-slate-400 tabular-nums">{formatCurrency(item.amount)}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className="text-xs font-bold text-emerald-500 tabular-nums">{formatCurrency(item.received)}</span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className="text-xs font-black text-slate-900 dark:text-white tabular-nums">{formatCurrency(item.balance)}</span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={cn(
                                                    "px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest",
                                                    item.status === 'recebido' ? "bg-emerald-100 text-emerald-600" :
                                                    item.status === 'atrasado' ? "bg-rose-100 text-rose-600 animate-pulse" :
                                                    item.status === 'hoje' ? "bg-amber-100 text-amber-600" :
                                                    "bg-slate-100 text-slate-500"
                                                )}>
                                                    {item.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {item.balance > 0 && (
                                                    <Button 
                                                        size="sm"
                                                        onClick={() => { setSelectedOrderId(item.orderId); setAmountToPay(item.balance); setIsBaixaModalOpen(true); }}
                                                        className="h-8 bg-slate-900 text-white rounded-lg px-3 text-[9px] font-black uppercase border-none hover:bg-brand-emerald"
                                                    >
                                                        Baixar
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* MODAL DE BAIXA */}
            <Modal isOpen={isBaixaModalOpen} onClose={() => setIsBaixaModalOpen(false)} title="Registrar pagamento" className="max-w-md">
                 <div className="space-y-6 pt-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor Recebido</label>
                        <Input 
                            type="number" 
                            autoFocus
                            value={amountToPay} 
                            onChange={(e) => setAmountToPay(e.target.value)} 
                            className="h-16 text-3xl font-black text-center rounded-2xl border-2 border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-brand-emerald focus:ring-0" 
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma de pagamento</label>
                        <select 
                            value={payMethod} 
                            onChange={(e) => setPayMethod(e.target.value)}
                            className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-brand-emerald focus:ring-0 text-sm font-medium outline-none animate-fade-in"
                        >
                            {PAYMENT_METHODS.map(m => (
                                <option key={m.value} value={m.value} className="text-slate-900 dark:text-white dark:bg-slate-900">{m.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data do pagamento</label>
                        <Input 
                            type="date" 
                            value={paymentDate} 
                            onChange={(e) => setPaymentDate(e.target.value)} 
                            className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-brand-emerald focus:ring-0 text-sm font-medium outline-none" 
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Observação</label>
                        <textarea
                            value={paymentNote}
                            onChange={(e) => setPaymentNote(e.target.value)}
                            rows={3}
                            placeholder="Adicione observações sobre este pagamento..."
                            className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-brand-emerald focus:ring-0 text-sm font-medium outline-none resize-none"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Anexar comprovante (Opcional)</label>
                        <div className="relative border-2 border-dashed border-slate-100 dark:border-white/5 rounded-xl p-4 flex flex-col items-center justify-center hover:border-brand-emerald cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-900/50">
                            <input 
                                type="file" 
                                accept="image/*,application/pdf"
                                onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    if (file) {
                                        if (file.size > 10 * 1024 * 1024) {
                                            alert("O comprovante excede o tamanho limite de 10MB.");
                                            return;
                                        }
                                        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
                                            alert("Apenas imagens ou arquivos PDF são permitidos.");
                                            return;
                                        }
                                        setReceiptFile(file);
                                    }
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            {receiptFile ? (
                                <div className="text-center">
                                    <p className="text-xs font-bold text-slate-700 dark:text-white truncate max-w-[250px]">{receiptFile.name}</p>
                                    <p className="text-[9px] font-bold text-slate-400 mt-0.5">{(receiptFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                    <button 
                                        type="button" 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            setReceiptFile(null);
                                        }}
                                        className="text-[9px] font-bold text-rose-500 hover:text-rose-600 mt-2 block mx-auto underline uppercase tracking-wider"
                                    >
                                        Remover
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center">
                                    <p className="text-xs font-bold text-slate-400">Clique para selecionar imagem ou PDF</p>
                                    <p className="text-[9px] font-bold text-slate-400 mt-0.5">Tamanho máximo: 10MB</p>
                                </div>
                            )}
                        </div>
                        {isUploading && (
                            <div className="w-full bg-slate-100 dark:bg-white/5 rounded-full h-1.5 mt-2 overflow-hidden">
                                <div className="bg-brand-emerald h-1.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                            </div>
                        )}
                    </div>

                    <Button 
                        onClick={confirmBaixa} 
                        disabled={isUploading}
                        className="w-full h-14 bg-brand-emerald text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-brand-emerald/20 mt-4 flex items-center justify-center gap-2"
                    >
                        {isUploading ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Enviando... {Math.round(uploadProgress)}%
                            </>
                        ) : 'Confirmar Lançamento'}
                    </Button>
                 </div>
            </Modal>

            {/* MODAL DE VENDAS */}
            <Modal isOpen={isSalesModalOpen} onClose={() => setIsSalesModalOpen(false)} title={selectedPeriod === 'month' || selectedPeriod === 'byMonth' ? 'Vendas no Mês' : 'Vendas no Período'} className="max-w-4xl">
                <div className="space-y-6 pt-4 max-h-[70vh] overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100">
                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Total Vendido</span>
                            <h3 className="text-2xl font-black text-indigo-600 mt-1">{formatCurrency(financialData.vendasNoMes)}</h3>
                        </div>
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Quantidade</span>
                            <h3 className="text-2xl font-black text-slate-700 mt-1">{financialData.qtdVendas}</h3>
                        </div>
                    </div>
                    
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b-2 border-slate-100">
                                <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente / Protocolo</th>
                                <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Data</th>
                                <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Origem</th>
                                <th className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Valor Vendido</th>
                            </tr>
                        </thead>
                        <tbody>
                            {financialData.salesList.map((sale: any) => (
                                <tr key={sale.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                    <td className="py-4">
                                        <div className="font-bold text-slate-900 text-sm">{sale.client}</div>
                                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">#{sale.protocol}</div>
                                    </td>
                                    <td className="py-4 text-center">
                                        <span className="text-xs font-bold text-slate-600 tabular-nums">
                                            {formatVisualDate(sale.date)}
                                        </span>
                                    </td>
                                    <td className="py-4 text-center">
                                        <span className="px-2 py-1 rounded-md bg-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-600">
                                            {sale.type}
                                        </span>
                                    </td>
                                    <td className="py-4 text-right">
                                        <span className="text-sm font-black text-slate-900 tabular-nums">
                                            {formatCurrency(sale.amount)}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {financialData.salesList.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-slate-400 text-sm font-bold">
                                        Nenhuma venda registrada neste período.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Modal>
        </div>
    );
};
