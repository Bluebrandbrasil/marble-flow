import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc, addDoc, collection, updateDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { OrderForm } from './OrderForm';
import { createOrderLog } from '../../lib/orderLogs';
import { Button } from '../../components/ui/Button';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import type { Order } from '../../types';
import { safeString, safeSplit, safeHistoryArray } from '../../lib/dataDiagnostics';
import { toISODateSafe } from '../../lib/dateWriteUtils';
import { canEditOrderFields } from '../../lib/orderGovernance';
import { getNextProtocolNumber } from '../../lib/protocolGenerator';

export const OrderPage: React.FC = () => {
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { user, profile } = useAuth();
    
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [isBlocked, setIsBlocked] = useState(false);

    // Initial prefilled data from location state (e.g. from Measurement conversion)
    const prefilledData = location.state?.prefilledOrderData as any;

    useEffect(() => {
        const fetchOrder = async () => {
            if (!id) {
                // Modo CRIAÇÃO
                const contractIdFromState = location.state?.contractId;
                if (!contractIdFromState) {
                    setIsBlocked(true);
                    setLoading(false);
                    return;
                }
                
                // Validar o contrato
                try {
                    const contractSnap = await getDoc(doc(db, 'contratos', contractIdFromState));
                    if (!contractSnap.exists() || contractSnap.data()?.contractStatus !== 'signed') {
                        setIsBlocked(true);
                        alert("Bloqueio de Conformidade: A Ordem de Serviço só pode ser gerada a partir de um contrato assinado.");
                    }
                } catch (err) {
                    console.error("Erro ao validar contrato:", err);
                    setIsBlocked(true);
                }
                
                setLoading(false);
                return;
            }

            try {
                const docSnap = await getDoc(doc(db, 'pedidos', id));
                if (docSnap.exists()) {
                    setOrder({ id: docSnap.id, ...docSnap.data() } as Order);
                } else {
                    console.error("Order not found");
                    navigate('/producao/ordens');
                }
            } catch (error) {
                console.error("Error fetching order:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchOrder();
    }, [id, navigate, location.state]);

    // GOVERNANCE: Redirect if order is locked for editing
    useEffect(() => {
        if (id && order && profile && !canEditOrderFields(order, profile as any)) {
            console.warn("[GOVERNANCE] Order is locked. Redirecting edit request.");
            navigate('/producao/ordens');
        }
    }, [id, order, profile, navigate]);

    const handleSave = async (orderData: Omit<Order, 'id' | 'createdAt' | 'protocolNumber'>) => {
        if (!user || !profile?.companyId) return;
        
        try {
            const { calculateQuoteDiff } = await import('../../utils/quoteCalculations');
            const { logIntegrityEvent } = await import('../../utils/quoteFirestore');

            if (id && order) {
                const { editReason, ...cleanData } = orderData as any;
                
                // --- AUDIT LOG (Rule #35 Strategy) ---
                const diff = calculateQuoteDiff(order as any, cleanData);
                const isoNow = toISODateSafe(new Date())!;
                const newHistory = [...safeHistoryArray(order.history)];
                const currentUser = profile.name || user.email || 'Sistema';

                if (diff.hasChanges) {
                    diff.logs.forEach(msg => {
                        newHistory.push({
                            date: isoNow,
                            action: `${msg}${editReason ? ` (Motivo: ${editReason})` : ''}`,
                            user: currentUser
                        });

                        // Double Log to dedicated collection if specified (Legacy compatibility)
                        createOrderLog({
                            orderId: id,
                            companyId: profile.companyId || '',
                            userId: user.uid,
                            userName: currentUser,
                            action: 'update',
                            fieldChanged: safeSplit(msg, ':', 'orders', 'audit.message')[0],
                            oldValue: 'Omitted (Check History)',
                            newValue: 'Omitted (Check History)',
                            reason: editReason || 'Edição estrutural'
                        });
                    });

                    // --- FINANCIAL INTEGRITY LOG (Rule #30) ---
                    const valDiff = Math.abs((order.totalAmount || 0) - (cleanData.totalAmount || 0));
                    if (valDiff > 0.01) {
                         await logIntegrityEvent({
                            quoteId: id,
                            clientName: safeString(order.customerName, 'orders', 'order.customerName', 'N/A'),
                            version: (order as any).version || 1,
                            timestamp: isoNow,
                            type: 'TOTAL_MISMATCH',
                            severity: valDiff > 1000 ? 'critical' : 'warning',
                            details: `Alteração financeira detectada na OS #${order.protocolNumber || id}. Diferença: R$ ${valDiff.toFixed(2)}.`,
                            triggeredBy: currentUser,
                            previousValues: { total: order.totalAmount },
                            repairedValues: { total: cleanData.totalAmount }
                        });
                    }
                }

                await updateDoc(doc(db, 'pedidos', id), {
                    ...cleanData,
                    history: newHistory,
                    updatedAt: isoNow
                });
            } else {
                // ... Creation logic ...
                let nextPos = 1;
                try {
                    const q = query(
                        collection(db, 'pedidos'),
                        where('companyId', '==', profile.companyId),
                        where('status', '==', 'aguardando_materia_prima'),
                        orderBy('position', 'desc'),
                        limit(1)
                    );
                    const qSnap = await getDocs(q);
                    if (!qSnap.empty) {
                        nextPos = (qSnap.docs[0].data().position || 0) + 1;
                    }
                } catch (err) {
                    console.error("Error fetching max position:", err);
                }

                const { editReason, ...cleanData } = orderData as any;
                const isoNow = toISODateSafe(new Date())!;
                
                // Get sequential protocol number
                const protocolNumber = await getNextProtocolNumber(profile.companyId);

                const newOrderData = {
                    ...cleanData,
                    userId: user.uid,
                    companyId: profile.companyId,
                    status: 'aguardando_materia_prima',
                    installationDate: new Date().toISOString().split('T')[0],
                    installationStatus: 'aguardando_definicao',
                    createdAt: isoNow,
                    updatedAt: isoNow,
                    protocolNumber,
                    position: nextPos,
                    history: [{
                        date: isoNow,
                        action: 'Ordem de Serviço criada',
                        user: profile.name || user.email || 'Sistema'
                    }]
                };
                const docRef = await addDoc(collection(db, 'pedidos'), newOrderData);

                createOrderLog({
                    orderId: docRef.id,
                    companyId: profile.companyId,
                    userId: user.uid,
                    userName: profile.name || '',
                    action: 'create',
                    reason: 'Ordem de Serviço criada'
                });

                if (orderData.measurementId) {
                    await updateDoc(doc(db, 'medicoes', orderData.measurementId), { status: 'converted' });
                }
            }
            navigate('/producao/ordens');
        } catch (error) {
            console.error("Error saving order:", error);
            alert("Erro ao salvar pedido. Tente novamente.");
        }
    };

    if (isBlocked) {
        return (
            <div className="flex flex-col items-center justify-center h-[70vh] space-y-6 text-center max-w-md mx-auto animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 bg-rose-50 dark:bg-rose-500/10 rounded-3xl flex items-center justify-center text-rose-500 shadow-xl border border-rose-100 dark:border-rose-500/20">
                    <ClipboardList className="w-10 h-10" />
                </div>
                <div className="space-y-2">
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Criação Bloqueada</h2>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        Por diretriz de governança, uma Ordem de Serviço (OS) só pode ser criada a partir de um **Contrato Assinado**.
                    </p>
                </div>
                <div className="flex flex-col w-full gap-3">
                    <Button onClick={() => navigate('/contratos')} className="h-12 bg-slate-900 dark:bg-white text-white dark:text-black font-black uppercase text-[10px] tracking-widest rounded-xl">
                        Ir para Gestão de Contratos
                    </Button>
                    <Button variant="ghost" onClick={() => navigate(-1)} className="h-12 font-black uppercase text-[10px] tracking-widest text-slate-400">
                        Voltar
                    </Button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-12 h-12 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full space-y-6 max-w-5xl mx-auto">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-white/5 pb-6">
                <div className="flex items-center gap-4">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => navigate(-1)}
                        className="rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <ClipboardList className="h-6 w-6 text-brand-emerald" />
                            {id ? 'Editar Pedido' : 'Nova Ordem de Serviço'}
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400">
                            {id ? `Editando pedido #${order?.protocolNumber || id.slice(0, 8).toUpperCase()}` : 'Inicie uma nova produção a partir de uma medição ou venda direta.'}
                        </p>
                    </div>
                </div>
            </header>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-premium border border-slate-200 dark:border-slate-800">
                <OrderForm 
                    initialData={order || prefilledData}
                    onSubmit={async (data) => {
                        setIsDirty(false);
                        await handleSave(data);
                    }}
                    onCancel={() => navigate(-1)}
                    onChange={() => setIsDirty(true)}
                />
            </div>
        </div>
    );
};
