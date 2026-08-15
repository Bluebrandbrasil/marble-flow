import { compareDatesSafe, safeParseISO } from '../lib/dateUtils';
import { toISODateSafe } from '../lib/dateWriteUtils';
import { buildMeasurementScheduledAt } from '../lib/dateUtils';
import { format } from 'date-fns';
import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, arrayUnion, deleteField, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, storage } from '../lib/firebase';
import { ref, deleteObject } from 'firebase/storage';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';
import { Sidebar } from '../layouts/Sidebar';
import { 
    getEffectiveWorkflowStage, 
    canGenerateContract, 
    approveQuoteAndFreeze, 
    canEditQuote,
    canStartContract
} from '../components/workflow/WorkflowStatus';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { OrderDetails } from '../features/orders/OrderDetails';
import { Modal } from '../components/ui/Modal';
import { JobClosingModal } from '../features/orders/JobClosingModal';
import { ProductionConversionWizard } from '../features/orders/ProductionConversionWizard';
import { QuoteSelectorModal } from '../features/quotes/QuoteSelectorModal';
import type { JobClosingData } from '../features/orders/JobClosingModal';
import { ReturnRegistrationModal } from '../features/orders/ReturnRegistrationModal';
import type { ReturnRegistrationData } from '../features/orders/ReturnRegistrationModal';
import { InternalReturnModal } from '../features/orders/InternalReturnModal';
import { Button } from '../components/ui/Button';
import { Plus, UserPlus, List, Focus, Maximize2, ShieldCheck } from 'lucide-react';
import { ProductionEntryModal } from '../features/orders/ProductionEntryModal';
import { InstallationEntryModal } from '../features/orders/InstallationEntryModal';
import { QualityIndicator } from '../components/QualityIndicator';
import { generateBatchProductionSheet } from '../lib/pdfGenerator';
import { useSettings } from '../hooks/useSettings';
import type { Order, Status, Measurement, ViewType, Quote } from '../types';
import { MeasurementForm } from '../features/measurements/MeasurementForm';
import { MeasurementDetails } from '../features/measurements/MeasurementDetails';
import { PaymentConditionsForm } from '../components/financial/PaymentConditionsForm';
import { validatePaymentConditions } from '../utils/quoteCalculations';
import type { PaymentConditions } from '../types';
import { useIncidents } from '../hooks/useIncidents';
import { createOrderLog } from '../lib/orderLogs';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { normalizeQuote, reportDataIssue, safeArray, safeSplit, safeHistoryArray } from '../lib/dataDiagnostics';
import { isLegacyOrder, isContractFirstOrder } from '../lib/orderGovernance';
import { transitionProductionStage } from '../services/productionService';

const sanitizeForFirestore = (obj: any): any => {
    if (obj === undefined) return null;
    if (obj === null || typeof obj !== 'object') return obj;
    // Preservar FieldValue sentinels do Firebase (serverTimestamp, increment, etc)
    if (obj._methodName || typeof obj.isEqual === 'function' || obj.type === 'FieldValue') {
        return obj;
    }
    if (Array.isArray(obj)) return safeArray(obj).map(sanitizeForFirestore);
    const cleaned: any = {};
    for (const key in obj) {
        cleaned[key] = obj[key] === undefined ? null : sanitizeForFirestore(obj[key]);
    }
    return cleaned;
};

const removeUndefinedDeep = (obj: any): any => {
    if (Array.isArray(obj)) return safeArray(obj).map(removeUndefinedDeep);
    if (obj && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => [key, removeUndefinedDeep(value)])
        );
    }
    return obj;
};

export const Dashboard: React.FC = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [contracts, setContracts] = useState<any[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const { settings } = useSettings();

    const { user, profile } = useAuth();
    const { incidents, addIncident, stats: incidentStats } = useIncidents();

    const location = useLocation();
    const navigate = useNavigate();
    const currentPath = location.pathname;

    const viewMetadata = useMemo(() => {
        const metadata: Record<string, { title: string, description: string, viewId: ViewType }> = {
            '/inicio': { title: 'Visão Geral', description: 'Acompanhe as métricas e acesse ações rápidas.', viewId: 'home' },
            '/producao/ordens': { title: 'Fila de Produção', description: 'Gerencie a fila de produção da marmoraria.', viewId: 'dashboard' },
            '/calendario': { title: 'Agenda de Instalação', description: 'Visualize as entregas previstas.', viewId: 'calendar' },
            '/medicoes': { title: 'Agenda de Atendimentos e Medições', description: 'Agende e converta medições em ordens de serviço.', viewId: 'measurements' },
            '/orcamentos': { title: 'Gestão de Orçamentos', description: 'Crie e gerencie propostas comerciais.', viewId: 'quotes' },
            '/orcamentos/novo': { title: 'Novo Orçamento', description: 'Crie uma nova proposta comercial.', viewId: 'quotes' },
            '/clientes': { title: 'Cadastro de Clientes', description: 'Gerencie sua base de clientes e arquitetos.', viewId: 'clients' },
            '/follow-up': { title: 'Central de Follow-up', description: 'Reativação de orçamentos de alto valor e foco em conversão.', viewId: 'quotes' },
            '/producao/todas': { title: 'Todas as Ordens', description: 'Área operacional central para acompanhamento e gestão de pedidos.', viewId: 'orders' },
            '/pedidos/novo': { title: 'Novo Pedido', description: 'Gere um novo pedido ou ordem de serviço.', viewId: 'orders' },
            '/configuracoes': { title: 'Configurações', description: 'Ajustes do sistema.', viewId: 'settings' },
            '/relatorios': { title: 'Relatórios', description: 'Métricas e histórico.', viewId: 'reports' },
            '/contratos': { title: 'Gestão de Contratos', description: 'Central de assinaturas digitais e acompanhamento de contratos.', viewId: 'contracts' },
            '/acesso': { title: 'Controle de Acessos', description: 'Aprove, rejeite e libere acessos novos.', viewId: 'access' },
            '/convites': { title: 'Gestão de Convites', description: 'Envie convites para novos colaboradores.', viewId: 'invites' },
            '/equipe': { title: 'Equipe / RH', description: 'Gerencie sua equipe.', viewId: 'staff' },
            '/financeiro': { title: 'Visão Financeira', description: 'Gestão de Receitas e Radar de Cobrança', viewId: 'financial' },
            '/inteligencia-comercial': { title: 'Inteligência Comercial', description: 'Cruzamento de Dados e Insights Estratégicos', viewId: 'intelligence' },
            '/medicoes/hoje': { title: 'Medições do Dia', description: 'Consulte sua agenda de campo para hoje.', viewId: 'medicoes_hoje' },
        };
        return metadata[currentPath] || metadata['/inicio'];
    }, [currentPath]);

    useEffect(() => {
        if (viewMetadata) {
            document.title = `${viewMetadata.title} | MarbleFlow - Gestão Inteligente marmoraria`;
        }
    }, [viewMetadata]);
    
    const isFullPageForm = (currentPath.startsWith('/orcamentos/') && currentPath !== '/orcamentos') || 
                          (currentPath.startsWith('/pedidos/') && currentPath !== '/pedidos');

    const activeView = viewMetadata.viewId;

    const [isConversionWizardOpen, setIsConversionWizardOpen] = useState(false);
    const [conversionMeasurement, setConversionMeasurement] = useState<Measurement | null>(null);
    const [conversionQuote, setConversionQuote] = useState<Quote | null>(null);

    const [measurements, setMeasurements] = useState<Measurement[]>([]);
    const [selectedMeasurement, setSelectedMeasurement] = useState<Measurement | null>(null);
    const [isAddMeasurementModalOpen, setIsAddMeasurementModalOpen] = useState(false);
    const [isEditMeasurementModalOpen, setIsEditMeasurementModalOpen] = useState(false);
    const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);
    const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false);
    const [prefilledMeasurementDate, setPrefilledMeasurementDate] = useState<Date | null>(null);
    const [isFullscreenMode, setIsFullscreenMode] = useState(false);
    const [isFocusMode, setIsFocusMode] = useState(() => localStorage.getItem('focusMode') === 'true');

    const toggleFocusMode = () => {
        const newState = !isFocusMode;
        setIsFocusMode(newState);
        localStorage.setItem('focusMode', String(newState));
    };
    const [preselectedClientIdForModal, setPreselectedClientIdForModal] = useState<string | null>(null);

    useEffect(() => {
        if (location.pathname === '/medicoes' && location.state?.openScheduleModal) {
            const clientId = location.state?.preselectClientId;
            if (clientId) {
                setPreselectedClientIdForModal(clientId);
            }
            setIsAddMeasurementModalOpen(true);
            // Clear state from navigation history to prevent modal opening again on navigation/refresh
            navigate('/medicoes', { replace: true, state: {} });
        }
    }, [location.pathname, location.state, navigate]);
    const [isTvMode, setIsTvMode] = useState(false);

    const [isProductionEntryModalOpen, setIsProductionEntryModalOpen] = useState(false);
    const [orderToProduction, setOrderToProduction] = useState<Order | null>(null);
    const pendingMeasurementUpdatesRef = React.useRef<Record<string, string>>({});

    const [isInstallationModalOpen, setIsInstallationModalOpen] = useState(false);
    const [orderToInstallation, setOrderToInstallation] = useState<Order | null>(null);
    const [targetInstallationStatus, setTargetInstallationStatus] = useState<Status>('em_instalacao');

    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [deletedQuotes, setDeletedQuotes] = useState<Quote[]>([]);
    const [isMeasurementScheduleModalOpen, setIsMeasurementScheduleModalOpen] = useState(false);
    const [quoteToMeasure, setQuoteToMeasure] = useState<Quote | null>(null);

    const [isQuoteSelectorOpen, setIsQuoteSelectorOpen] = useState(false);
    const [pendingMeasurement, setPendingMeasurement] = useState<Measurement | null>(null);

    // Estados para o novo fluxo Agendamento -> Pagamento -> Contrato
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentDraft, setPaymentDraft] = useState<PaymentConditions | null>(null);
    const [targetQuoteForPayment, setTargetQuoteForPayment] = useState<Quote | null>(null);


    useEffect(() => {
        if (!user || !profile?.companyId) {
            setOrders([]);
            setMeasurements([]);
            setQuotes([]);
            return;
        }

        let unsubscribeOrders = () => {};
        let unsubscribeQuotes = () => {};
        let unsubscribeContracts = () => {};

        if (profile?.role !== 'medidor') {
            const ordersQuery = query(collection(db, 'pedidos'), where('companyId', '==', profile.companyId));
            unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
                const safeDocs = safeArray(snapshot?.docs);
                const ordersData = safeArray(safeDocs).map(doc => ({ id: doc.id, ...doc.data() } as Order));
                setOrders(ordersData.sort((a, b) => compareDatesSafe(a.createdAt, b.createdAt, 'desc')));
            });

            const quotesQuery = query(collection(db, 'orcamentos'), where('companyId', '==', profile.companyId));
            unsubscribeQuotes = onSnapshot(quotesQuery, (snapshot) => {
                const safeDocs = safeArray(snapshot?.docs);
                if (!import.meta.env.PROD) {
                    console.log('[DATA_DEBUG] quotes snapshot docs count:', safeDocs.length);
                }
                const normalized = safeArray(safeDocs).map(doc => normalizeQuote({ id: doc.id, ...doc.data() }));
                
                const active = normalized
                    .filter(res => {
                        if (res.isBlocked) {
                            if (!import.meta.env.PROD) {
                                console.log('[DATA_DEBUG] quote blocked:', res.data?.id, res.reason);
                            }
                        }
                        return !res.isBlocked && !res.data?.isDeleted;
                    })
                    .map(res => res.data as Quote);
                    
                const deleted = normalized
                    .filter(res => res.data?.isDeleted)
                    .map(res => res.data as Quote);

                if (!import.meta.env.PROD) {
                    console.log('[DATA_DEBUG] active quotes:', active.length);
                }
                setQuotes(active.sort((a, b) => compareDatesSafe(a.createdAt, b.createdAt, 'desc')));
                setDeletedQuotes(deleted.sort((a, b) => compareDatesSafe(a.deletedAt || a.createdAt, b.deletedAt || b.createdAt, 'desc')));
            }, (error) => {
                if (!import.meta.env.PROD) {
                    console.log('[DATA_DEBUG] quotes snapshot error:', error.message);
                }
            });

            const contractsQuery = query(collection(db, 'contratos'), where('companyId', '==', profile.companyId));
            unsubscribeContracts = onSnapshot(contractsQuery, (snapshot) => {
                const safeDocs = safeArray(snapshot?.docs);
                const contractsData = safeArray(safeDocs)
                    .map(doc => ({ id: doc.id, ...doc.data() } as any))
                    .filter(c => c.contractStatus !== 'deleted' && c.hiddenFromContracts !== true);
                setContracts(contractsData.sort((a, b) => compareDatesSafe(a.createdAt, b.createdAt, 'desc')));
            });
        }

        const measurementsQuery = query(collection(db, 'medicoes'), where('companyId', '==', profile.companyId));
            
        const unsubscribeMeasurements = onSnapshot(measurementsQuery, (snapshot) => {
            const safeDocs = safeArray(snapshot?.docs);
            let msData = safeArray(safeDocs).map(doc => ({ id: doc.id, ...doc.data() } as Measurement));
            
            console.info(`[Dashboard] onSnapshot disparado: total de medições originais recebidas = ${msData.length}`);
            
            if (profile?.role === 'medidor') {
                msData = msData.filter(m => 
                    m.assignedStaffId === user.uid ||
                    m.measurerId === user.uid ||
                    m.assignedMeasurerId === user.uid ||
                    m.assignedTo === user.uid
                );
            }
            
            setMeasurements(msData);
        });

        return () => {
            unsubscribeOrders();
            unsubscribeMeasurements();
            unsubscribeQuotes();
            unsubscribeContracts();
        };
    }, [user, profile?.companyId]);

    useEffect(() => {
        if (selectedOrder) {
            const freshOrder = orders.find(o => o.id === selectedOrder.id);
            if (freshOrder && JSON.stringify(freshOrder) !== JSON.stringify(selectedOrder)) {
                setSelectedOrder(freshOrder);
            }
        }
    }, [orders, selectedOrder]);

    // Extrair ID da URL para auto-abertura (Busca Global)
    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const orderId = searchParams.get('orderId');
        if (orderId && orders.length > 0 && !selectedOrder) {
            const orderToOpen = orders.find(o => o.id === orderId);
            if (orderToOpen) {
                setSelectedOrder(orderToOpen);
                window.history.replaceState({}, '', location.pathname);
            }
        }
        
        const measurementId = searchParams.get('measurementId');
        if (measurementId && measurements.length > 0 && !selectedMeasurement) {
            const measurementToOpen = measurements.find(m => m.id === measurementId);
            if (measurementToOpen) {
                setSelectedMeasurement(measurementToOpen);
                window.history.replaceState({}, '', location.pathname);
            }
        }
    }, [location.search, orders, measurements, selectedOrder, selectedMeasurement]);

    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [orderToClose, setOrderToClose] = useState<Order | null>(null);
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [orderToReturn, setOrderToReturn] = useState<Order | null>(null);
    const [isInternalReturnModalOpen, setIsInternalReturnModalOpen] = useState(false);
    const [orderToInternalReturn, setOrderToInternalReturn] = useState<Order | null>(null);
    const [internalReturnItem, setInternalReturnItem] = useState<'Base' | 'Frontão' | 'Cuba'>('Base');

    useEffect(() => {
        setSelectedOrder(null);
        setIsConversionWizardOpen(false);
        setConversionMeasurement(null);
        setConversionQuote(null);
        setSelectedMeasurement(null);
        setIsAddMeasurementModalOpen(false);
        setPrefilledMeasurementDate(null);
        setIsMeasurementScheduleModalOpen(false);
        setQuoteToMeasure(null);
        setOrderToReturn(null);
        setIsReturnModalOpen(false);
        setIsClosingModalOpen(false);
        setOrderToClose(null);
        setIsInternalReturnModalOpen(false);
        setOrderToInternalReturn(null);
        setIsQuoteSelectorOpen(false);
        setPendingMeasurement(null);
        
        // Mantemos isAddClientModalOpen e isAddStaffModalOpen intocados aqui
        // para permitir que o clique no Dashboard persista a abertura do modal
        // se houver uma navegação interna ou se o modal for controlado via Outlet.
    }, [currentPath]);

    const handleNewQuote = () => navigate('/orcamentos/novo');
    const handleNewQuoteFromClient = (client: any) => {
        navigate('/orcamentos/novo', { state: { preselectedClientId: client.id } });
    };

    const handleAddMeasurement = async (data: Omit<Measurement, 'id' | 'createdAt' | 'status'>, pregeneratedId?: string) => {
        try {
            const isoNow = toISODateSafe(new Date());
            const newMeasurementData = {
                ...data,
                userId: user?.uid,
                companyId: profile?.companyId,
                status: 'scheduled',
                createdAt: isoNow,
                history: [
                    {
                        date: isoNow,
                        action: 'MEASUREMENT_SCHEDULED',
                        user: profile?.name || 'Sistema',
                        source: 'Dashboard',
                        metadata: { targetStage: 'scheduled' }
                    }
                ]
            };
            const docRef = pregeneratedId ? doc(db, 'medicoes', pregeneratedId) : doc(collection(db, 'medicoes'));
            await setDoc(docRef, sanitizeForFirestore(newMeasurementData));
            
            // 2. Update Quote if linked
            if (data.quoteId) {
                const quoteRef = doc(db, 'orcamentos', data.quoteId);
                const quoteSnap = await getDoc(quoteRef);
                
                if (quoteSnap.exists()) {
                    const quoteData = quoteSnap.data();
                    const stage = quoteData.quoteStage || '';
                    const isFrozen = quoteData.isFrozen || false;
                    
                    const ELIGIBLE_MEASUREMENT_STAGES = [
                        'pre_orcamento', 'draft', 'sent', 'negotiating', 'aguardando_medicao', 'pos_medicao'
                    ];
                    
                    let isEligible = ELIGIBLE_MEASUREMENT_STAGES.includes(stage);
                    if (stage === 'aprovado' || stage === 'approved') {
                        isEligible = !isFrozen;
                    }
                    
                    if (!isEligible) {
                        throw new Error(`O orçamento selecionado está em um estágio (${stage}) que não permite vinculação. Por favor, desmarque o orçamento e tente novamente.`);
                    }

                    await updateDoc(quoteRef, {
                        status: 'measuring',
                        quoteStage: 'aguardando_medicao',
                        measurementId: docRef.id,
                        updatedAt: isoNow,
                        history: arrayUnion({
                            date: isoNow,
                            action: 'MEDIÇÃO AGENDADA - Orçamento movido para o funil de Medição Técnica.',
                            user: profile?.name || 'Sistema'
                        })
                    });
                }
            }

            // 3. Unified audit log
            await createOrderLog({
                orderId: docRef.id,
                companyId: profile?.companyId || '',
                userId: user?.uid || '',
                userName: profile?.name || '',
                action: 'create',
                source: 'Dashboard/Measurements',
                metadata: { 
                    type: 'MEASUREMENT_SCHEDULED',
                    measurementId: docRef.id,
                    clientId: data.clientId,
                    targetStage: 'scheduled'
                }
            });

            if (data.clientId) {
                await updateDoc(doc(db, 'clients', data.clientId), {
                    zipCode: data.zipCode,
                    street: data.street,
                    number: data.number,
                    complement: data.complement,
                    neighborhood: data.neighborhood,
                    city: data.city,
                    state: data.state,
                    reference: data.reference,
                    address: data.address
                });
            }

            setIsAddMeasurementModalOpen(false);
            setPrefilledMeasurementDate(null);

            // Redirecionar para o calendário na data agendada
            if (data.scheduledDate) {
                navigate(`/medicoes?date=${data.scheduledDate}`);
            }
        } catch (e) {
            console.error("Error adding measurement: ", e);
            reportDataIssue('MEASUREMENT_CREATE_FAILED', 'measurements', 'database', data, 'Falha ao criar agendamento', 'critical', { error: String(e) });
        }
    };

    const handleUpdateMeasurementDate = async (id: string, newDateString: string) => {
        try {
            const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
            if (!DATE_ONLY_REGEX.test(newDateString)) {
                throw new Error('Data de reagendamento inválida.');
            }

            const isoNow = toISODateSafe(new Date());
            const measurement = measurements.find(m => m.id === id);
            
            if (!measurement) {
                throw new Error('A medição não foi encontrada. Atualize o calendário e tente novamente.');
            }

            // Proteção contra drag & drop duplicado/fora de ordem
            const currentRequestId = `${Date.now()}-${Math.random()}`;
            pendingMeasurementUpdatesRef.current[id] = currentRequestId;

            const scheduledAt = buildMeasurementScheduledAt(newDateString, measurement.scheduledTime);
            
            // Abortar se outra requisição mais nova já foi disparada para a mesma medição
            if (pendingMeasurementUpdatesRef.current[id] !== currentRequestId) {
                console.warn('[Dashboard] Reagendamento ignorado (stale request).', { id, newDateString });
                return;
            }

            const measurementRef = doc(db, 'medicoes', id);
            console.info(`[Dashboard] ANTES DO UPDATE - Documento alvo: ${measurementRef.path}`);
            console.info(`[Dashboard] NO MOMENTO DO DROP - Valores que serão salvos no DB:`, {
                scheduledDate: newDateString,
                scheduledAt: scheduledAt,
                oldScheduledDate: measurement.scheduledDate,
                historyDate: isoNow
            });

            await updateDoc(measurementRef, { 
                scheduledDate: newDateString,
                ...(scheduledAt ? { scheduledAt } : {}),
                updatedAt: isoNow,
                updatedBy: user?.uid || '',
                history: arrayUnion({
                    date: isoNow,
                    action: 'MEASUREMENT_RESCHEDULED',
                    user: profile?.name || 'Sistema',
                    source: 'Calendar/DragDrop',
                    metadata: { 
                        oldDate: measurement?.scheduledDate || null,
                        newDate: newDateString
                    }
                })
            });

            console.info(`[Dashboard] DEPOIS DO UPDATE - Confirmação de sucesso do Firestore. Documento: ${id}`);

            await createOrderLog({
                orderId: id,
                companyId: profile?.companyId || '',
                userId: user?.uid || '',
                userName: profile?.name || '',
                action: 'update',
                fieldChanged: 'scheduledDate',
                oldValue: measurement?.scheduledDate,
                newValue: newDateString,
                source: 'Calendar/DragDrop'
            });
            
            // Sucesso processado pelo componente de calendário (MeasurementCalendar)
        } catch (e) {
            console.error("[Dashboard] Erro ao reagendar medição:", e);
            throw e; // Lança o erro para que o rollback visual aconteça no MeasurementCalendar
        }
    };

    const handleUpdateMeasurement = async (id: any, data?: Omit<Measurement, 'id' | 'createdAt' | 'status'> & { measurementAttachment?: MeasurementAttachment | null }) => {
        try {
            let finalId = id;
            let finalData = data;
            if (!data) {
                // Remap if called with only one argument
                finalData = id as any;
                finalId = undefined;
            }

            const existingMeasurement = selectedMeasurement;
            const measurementId = (typeof finalId === 'string' ? finalId : '') || existingMeasurement?.id;

            if (!measurementId || typeof measurementId !== "string" || measurementId.trim() === "") {
                console.error("ID da medição inválido:", measurementId, existingMeasurement);
                alert("Não foi possível atualizar a medição: ID inválido.");
                return;
            }

            // Preservar medidor ao editar se o formulário não resolver o medidor
            const oldMeasurer = {
                assignedStaffId: existingMeasurement?.assignedStaffId || existingMeasurement?.measurerId || existingMeasurement?.assignedMeasurerId || existingMeasurement?.assignedTo || null,
                assignedStaffName: existingMeasurement?.assignedStaffName || existingMeasurement?.measurerName || existingMeasurement?.assignedMeasurerName || existingMeasurement?.assignedToName || '',
                measurerId: existingMeasurement?.measurerId || existingMeasurement?.assignedStaffId || existingMeasurement?.assignedMeasurerId || existingMeasurement?.assignedTo || null,
                measurerName: existingMeasurement?.measurerName || existingMeasurement?.assignedStaffName || existingMeasurement?.assignedMeasurerName || existingMeasurement?.assignedToName || '',
                assignedMeasurerId: existingMeasurement?.assignedMeasurerId || existingMeasurement?.assignedStaffId || existingMeasurement?.measurerId || existingMeasurement?.assignedTo || null,
                assignedMeasurerName: existingMeasurement?.assignedMeasurerName || existingMeasurement?.assignedStaffName || existingMeasurement?.measurerName || existingMeasurement?.assignedToName || '',
                assignedTo: existingMeasurement?.assignedTo || existingMeasurement?.assignedStaffId || existingMeasurement?.measurerId || existingMeasurement?.assignedMeasurerId || null,
                assignedToName: existingMeasurement?.assignedToName || existingMeasurement?.assignedStaffName || existingMeasurement?.measurerName || existingMeasurement?.assignedMeasurerName || ''
            };

            const payloadData = {
                ...finalData,
                assignedStaffId: finalData?.assignedStaffId || oldMeasurer.assignedStaffId,
                assignedStaffName: finalData?.assignedStaffName || oldMeasurer.assignedStaffName,
                measurerId: finalData?.measurerId || oldMeasurer.measurerId,
                measurerName: finalData?.measurerName || oldMeasurer.measurerName,
                assignedMeasurerId: finalData?.assignedMeasurerId || oldMeasurer.assignedMeasurerId,
                assignedMeasurerName: finalData?.assignedMeasurerName || oldMeasurer.assignedMeasurerName,
                assignedTo: finalData?.assignedTo || oldMeasurer.assignedTo,
                assignedToName: finalData?.assignedToName || oldMeasurer.assignedToName,
            };

            // Garantir que scheduledAt seja string ISO válida
            let scheduledAt = payloadData?.scheduledAt;
            if (scheduledAt) {
                scheduledAt = toISODateSafe(scheduledAt);
            } else if (payloadData?.scheduledDate) {
                scheduledAt = toISODateSafe(new Date(payloadData.scheduledDate + 'T' + (payloadData.scheduledTime || '00:00') + ':00'));
            }

            const isoNow = toISODateSafe(new Date());

            const payload = sanitizeForFirestore({
                ...payloadData,
                scheduledAt,
                updatedAt: isoNow,
                updatedBy: user?.uid || ''
            });

            // Logs temporários em DEV
            if (import.meta.env.DEV) {
                console.log("Atualizando medição:", {
                    measurementId,
                    measurementIdType: typeof measurementId,
                    payload
                });
            }

            await updateDoc(doc(db, 'medicoes', measurementId), payload);

            await createOrderLog({
                orderId: measurementId,
                companyId: profile?.companyId || '',
                userId: user?.uid || '',
                userName: profile?.name || '',
                action: 'update',
                source: 'Dashboard/MeasurementsEdit'
            });
            setIsEditMeasurementModalOpen(false);
            setSelectedMeasurement(null);
        } catch (e) {
            console.error("Error updating measurement: ", e);
        }
    };

    const handleDeleteMeasurement = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const measurement = measurements.find(m => m.id === id);
            await deleteDoc(doc(db, 'medicoes', id));

            // If it had an attachment, delete it from Storage
            if (measurement?.measurementAttachment?.storagePath) {
                try {
                    const expectedPrefix = `companies/${profile?.companyId || 'general'}/medicoes/${id}/attachments/`;
                    if (measurement.measurementAttachment.storagePath.startsWith(expectedPrefix)) {
                        const fileRef = ref(storage, measurement.measurementAttachment.storagePath);
                        await deleteObject(fileRef);
                    }
                } catch (delErr) {
                    console.error("[Dashboard] Falha ao excluir anexo de medição removida:", delErr);
                }
            }
        } catch (err) {
            console.error("Error deleting measurement: ", err);
        }
    };

    const handleConvertToOrder = async (measurement: Measurement) => {
        if (!measurement.clientId) {
            alert("Erro: Este agendamento não possui um cliente vinculado.");
            return;
        }

        // Interceptar: fechar o modal de detalhes para evitar sobreposição
        setSelectedMeasurement(null);
        
        // Buscar orçamentos vinculados ao cliente
        const clientQuotes = safeArray(quotes).filter(q => q.clientId === measurement.clientId);
        
        if (clientQuotes.length === 0) {
            const confirm = window.confirm("Este cliente não possui orçamentos cadastrados. Deseja criar um novo orçamento automaticamente para esta medição?");
            if (confirm) {
                const newQuoteId = await handleCreateAutoQuote(measurement);
                const isoNow = toISODateSafe(new Date());
                await updateDoc(doc(db, 'medicoes', measurement.id), {
                    quoteId: newQuoteId,
                    origin: 'quote',
                    updatedAt: isoNow
                });
                await updateDoc(doc(db, 'orcamentos', newQuoteId), {
                    measurementId: measurement.id,
                    updatedAt: isoNow
                });
                setPendingMeasurement({ ...measurement, quoteId: newQuoteId });
                setIsQuoteSelectorOpen(true);
            }
        } else if (clientQuotes.length === 1 && measurement.quoteId) {
            const quote = clientQuotes[0];
            const { can, reason } = canGenerateContract(quote);
            
            if (can) {
                // Iniciar fluxo de pagamento
                preparePaymentFlow(quote, measurement);
            } else {
                alert(reason || "Atenção: Este orçamento precisa ser revisado e aprovado como Pós-Medição antes de gerar o contrato.");
                setPendingMeasurement(measurement);
                setIsQuoteSelectorOpen(true);
            }
        } else {
            // Se houver múltiplos ou se a medição NÃO tiver quoteId vinculado (precisa vincular), abre o seletor
            setPendingMeasurement(measurement);
            setIsQuoteSelectorOpen(true);
        }
    };

    const handleCreateAutoQuote = async (measurement: Measurement) => {
        try {
            const isoNow = toISODateSafe(new Date());
            const newQuoteData = {
                clientId: measurement.clientId,
                customerName: measurement.customerName,
                customerPhone: measurement.phone,
                customerAddress: measurement.address,
                companyId: profile?.companyId,
                sellerId: user?.uid,
                sellerName: profile?.name || 'Sistema',
                status: 'draft',
                quoteStage: 'pos_medicao',
                isPostMeasurement: true,
                version: 1,
                total: 0,
                totalAmount: 0,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdBy: profile?.name || user?.email || 'Sistema',
                userId: user?.uid,
                items: [],
                groups: [],
                accessories: [],
                services: [],
                history: [{ date: isoNow, action: 'ORÇAMENTO CRIADO AUTOMATICAMENTE VIA AGENDAMENTO' }]
            };
            const docRef = await addDoc(collection(db, 'orcamentos'), sanitizeForFirestore(newQuoteData));
            return docRef.id;
        } catch (err) {
            console.error("Erro ao criar orçamento automático:", err);
            throw err;
        }
    };

    const preparePaymentFlow = (quote: Quote, measurement: Measurement | null) => {
        const defaultPayment: PaymentConditions = quote.paymentConditions || {
            installments: [
                { label: 'Entrada', percentage: 50, amount: (quote.total || 0) * 0.5, dueType: 'imediato' },
                { label: 'Entrega', percentage: 50, amount: (quote.total || 0) * 0.5, dueType: 'entrega' }
            ],
            interest: { enabled: false, percentage: 0, amount: 0 }
        };
        
        setTargetQuoteForPayment(quote);
        setPaymentDraft(defaultPayment);
        setPendingMeasurement(measurement);
        setIsPaymentModalOpen(true);
    };

    const handleConfirmPaymentAndProceed = async () => {
        if (!targetQuoteForPayment || !paymentDraft) return;

        // Validar
        const validation = validatePaymentConditions(paymentDraft, targetQuoteForPayment.total || 0);
        if (!validation.isValid) {
            alert(validation.reason);
            return;
        }

        try {
            // Salvar no orçamento
            await updateDoc(doc(db, 'orcamentos', targetQuoteForPayment.id), {
                paymentConditions: paymentDraft
            });

            // Fechar pagamento
            setIsPaymentModalOpen(false);

            // Iniciar fluxo de contrato (Wizard)
            setConversionMeasurement(pendingMeasurement || null);
            setConversionQuote(targetQuoteForPayment);
            setIsConversionWizardOpen(true);
            
            // Limpar estados auxiliares
            setTargetQuoteForPayment(null);
            setPaymentDraft(null);
            setPendingMeasurement(null);
        } catch (err) {
            console.error("Erro ao processar pagamento e iniciar contrato:", err);
            alert("Erro ao salvar condições de pagamento.");
        }
    };

    const handleDirectSale = async (quote: Quote) => {
        if (!canStartContract(quote)) {
            alert("O contrato só pode ser iniciado após a medição do orçamento.");
            return;
        }
        
        // Audit log for direct sale start
        await createOrderLog({
            orderId: quote.id,
            companyId: profile?.companyId || '',
            userId: user?.uid || '',
            userName: profile?.name || '',
            action: 'create',
            reason: 'Iniciando Conversão p/ Produção via Venda Direta/Contrato'
        });

        setConversionMeasurement(null);
        setConversionQuote(quote);
        setIsConversionWizardOpen(true);
    };

    const handleDeclineMeasurement = async (measurement: Measurement, reason: string) => {
        try {
            const isoNow = toISODateSafe(new Date());
            await updateDoc(doc(db, 'medicoes', measurement.id), { 
                status: 'declined', 
                declineReason: reason,
                history: arrayUnion({
                    date: isoNow,
                    action: 'MEASUREMENT_CANCELLED',
                    user: profile?.name || 'Sistema',
                    source: 'Details/Decline',
                    metadata: { reason }
                })
            });

            await createOrderLog({
                orderId: measurement.id,
                companyId: profile?.companyId || '',
                userId: user?.uid || '',
                userName: profile?.name || '',
                action: 'status_change',
                oldValue: measurement.status,
                newValue: 'declined',
                reason: reason,
                source: 'Details/Decline'
            });
            setSelectedMeasurement(null);
        } catch (e) {
            console.error("Error declining measurement: ", e);
        }
    };

    const handleDeleteQuote = async (id: string, reason: string, category: string) => {
        try {
            await updateDoc(doc(db, 'orcamentos', id), {
                isDeleted: true,
                deleted: true, // redundância de segurança para filtros novos
                hiddenFromDashboard: true,
                deletedAt: toISODateSafe(new Date()),
                deletedBy: profile?.name || user?.email || 'Sistema',
                deleteReasonCategory: category,
                deleteReason: reason
            });

            await createOrderLog({
                orderId: id,
                companyId: profile?.companyId || '',
                userId: user?.uid || '',
                userName: profile?.name || '',
                action: 'delete',
                source: 'Quotes/SoftDelete',
                reason: `[${category}] ${reason}`,
                metadata: { 
                    type: 'QUOTE_SOFT_DELETE',
                    category: category
                }
            });
        } catch (error) {
            console.error("Error soft deleting quote: ", error);
        }
    };

    const handleRestoreQuote = async (id: string) => {
        try {
            await updateDoc(doc(db, 'orcamentos', id), {
                isDeleted: false,
                restoredAt: toISODateSafe(new Date()),
                restoredBy: profile?.name || user?.email || 'Sistema'
            });

            await createOrderLog({
                orderId: id,
                companyId: profile?.companyId || '',
                userId: user?.uid || '',
                userName: profile?.name || '',
                action: 'update',
                source: 'Quotes/Restore',
                metadata: { type: 'QUOTE_RESTORED' }
            });
        } catch (error) {
            console.error("Error restoring quote: ", error);
        }
    };

    const handlePermanentDeleteQuote = async (id: string) => {
        if (profile?.role !== 'superadmin') {
            alert("Ação negada: Apenas administradores master podem realizar a exclusão definitiva.");
            return;
        }

        try {
            await deleteDoc(doc(db, 'orcamentos', id));
            
            await createOrderLog({
                orderId: id,
                companyId: profile?.companyId || '',
                userId: user?.uid || '',
                userName: profile?.name || '',
                action: 'delete',
                source: 'Quotes/PermanentDelete',
                metadata: { type: 'QUOTE_PERMANENT_DELETE' }
            });
        } catch (error) {
            console.error("Error permanently deleting quote: ", error);
        }
    };

    const handleUpdateQuote = async (id: string, updates: Partial<Quote>) => {
        if (!id || id === 'unknown' || id === '') {
            alert("Bloqueio de Governança: Operação negada em orçamento sem ID válido.");
            return;
        }
        try {
            await updateDoc(doc(db, 'orcamentos', id), updates);
        } catch (error) {
            console.error("Error updating quote: ", error);
        }
    };

    const handleDuplicateQuote = async (quote: Quote, isNewVersion: boolean = false) => {
        try {
            const deepCloned = JSON.parse(JSON.stringify(quote));
            const newQuoteData = { 
                ...deepCloned,
                status: 'draft',
                quoteStage: quote.isPostMeasurement ? 'pos_medicao' : 'pre_orcamento',
                isPostMeasurement: !!quote.isPostMeasurement,
                isFrozen: false,
                approvedAt: undefined,
                quoteSnapshot: undefined,
                stonesSubtotal: undefined,
                accessoriesSubtotal: undefined,
                servicesSubtotal: undefined,
                isLatestVersion: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdBy: profile?.name || user?.email || 'Sistema',
                userId: user?.uid,
                companyId: profile?.companyId
            };
            
            delete (newQuoteData as any).id;
            newQuoteData.lastContact = undefined;
            newQuoteData.nextAction = undefined;
            
            if (isNewVersion) {
                newQuoteData.parentQuoteId = quote.id;
                newQuoteData.version = (quote.version || 1) + 1;
            } else {
                newQuoteData.version = 1;
                newQuoteData.parentQuoteId = undefined;
            }

            if(newQuoteData.items) delete (newQuoteData as any).items; 
            const docRef = await addDoc(collection(db, 'orcamentos'), sanitizeForFirestore(newQuoteData));
            return docRef.id;
        } catch (error) {
            console.error("Error duplicating/versioning quote: ", error);
        }
    };

    const handleReviseApprovedQuote = async (quote: Quote, reason: string) => {
        try {
            const isoNow = toISODateSafe(new Date());
            const deepCloned = JSON.parse(JSON.stringify(quote));
            const newRevision: Partial<Quote> = {
                ...deepCloned,
                status: 'draft',
                quoteStage: quote.isPostMeasurement ? 'pos_medicao' : 'pre_orcamento',
                isPostMeasurement: !!quote.isPostMeasurement,
                isFrozen: false,
                approvedAt: undefined,
                quoteSnapshot: undefined,
                stonesSubtotal: undefined,
                accessoriesSubtotal: undefined,
                servicesSubtotal: undefined,
                version: (quote.version || 1) + 1,
                previousQuoteId: quote.id,
                isLatestVersion: true,
                revisionReason: reason,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdBy: profile?.name || user?.email || 'Sistema',
                userId: user?.uid,
                companyId: profile?.companyId,
                history: [
                    ...safeHistoryArray(quote.history),
                    { date: isoNow, action: `REVISÃO CRIADA (v${(quote.version || 1) + 1}). Motivo: ${reason}` }
                ]
            };
            delete (newRevision as any).id;
            delete (newRevision as any).convertedToOrderId;
            delete (newRevision as any).convertedAt;

            await updateDoc(doc(db, 'orcamentos', quote.id), {
                isLatestVersion: false,
                supersededAt: isoNow,
                history: [
                    ...safeHistoryArray(quote.history),
                    { date: isoNow, action: `SUBSTITUÍDO POR NOVA VERSÃO (v${(quote.version || 1) + 1})` }
                ]
            });

            const docRef = await addDoc(collection(db, 'orcamentos'), sanitizeForFirestore(newRevision));
            await updateDoc(doc(db, 'orcamentos', quote.id), { supersededBy: docRef.id });
            return docRef.id;
        } catch (err) {
            console.error("Error creating budget revision:", err);
            throw err;
        }
    };

    const handleConvertQuoteToMeasurement = (quote: Quote) => {
        setQuoteToMeasure(quote);
        setIsMeasurementScheduleModalOpen(true);
    };

    const handleConvertClientToMeasurement = (client: any) => {
        navigate('/medicoes', { state: { preselectClientId: client.id, openScheduleModal: true } });
    };

    const handleUpdateOrder = async (updatedOrder: Order) => {
        try {
            const { id, ...dataToUpdate } = updatedOrder;
            await updateDoc(doc(db, 'pedidos', id), dataToUpdate);
        } catch (e) {
            console.error("Error updating document: ", e);
        }
    };

    const handlePatchOrder = async (orderId: string, updates: Partial<Order>) => {
        try {
            await updateDoc(doc(db, 'pedidos', orderId), updates);
        } catch (e) {
            console.error("Error patching document: ", e);
        }
    };

    const handleOrderReorder = async (status: Status, startIndex: number, endIndex: number) => {
        const statusOrders = [...orders].filter(o => o.status === status);
        const [removed] = statusOrders.splice(startIndex, 1);
        statusOrders.splice(endIndex, 0, removed);
        const otherOrders = safeArray(orders).filter(o => o.status !== status);
        const newState = [...statusOrders, ...otherOrders];
        setOrders(newState);
        if (status === 'em_producao' || status === 'aguardando_materia_prima') {
            try {
                const batchPromises = safeArray(statusOrders).map((order, idx) => updateDoc(doc(db, 'pedidos', order.id), { position: idx + 1 }));
                await Promise.all(batchPromises);
            } catch (e) {
                console.error("Error persisting reorder: ", e);
            }
        }
    };

    const handleOrderMove = async (orderOrId: string | Order, newStatus: Status, newIndex?: number) => {
        const orderId = typeof orderOrId === 'string' ? orderOrId : orderOrId.id;
        const order = orders.find(o => o.id === orderId);
        if (!order) return;
        if (newStatus === 'finalizado') {
            setOrderToClose(order);
            setIsClosingModalOpen(true);
            return;
        }
        if ((newStatus === 'em_producao' || newStatus === 'production') && order.status !== 'em_producao' && order.status !== 'production') {
            setOrderToProduction(order);
            setIsProductionEntryModalOpen(true);
            return;
        }
        if ((newStatus === 'em_instalacao' || newStatus === 'installation') && order.status !== 'em_instalacao' && order.status !== 'installation') {
            setOrderToInstallation(order);
            setTargetInstallationStatus(newStatus);
            setIsInstallationModalOpen(true);
            return;
        }

        // Global Governance: Prevent manual bypass of contract signature
        if (order.status === 'em_contrato' && order.contractStatus !== 'signed' && (['aguardando_materia_prima', 'em_producao', 'em_instalacao', 'pronto_para_conferencia'].includes(newStatus))) {
            alert('Bloqueio de Conformidade: Este pedido está na etapa de CONTRATO e não pode ser movido para a produção sem a Assinatura Digital do Cliente.');
            return;
        }
        const originalOrders = [...orders];
        try {
            const updates: Partial<Order> = { 
                status: newStatus,
                history: [
                    ...safeHistoryArray(order.history),
                    { status: newStatus, timestamp: toISODateSafe(new Date()), userId: user?.uid }
                ] as any
            };
            if (newStatus === 'em_producao' || newStatus === 'aguardando_materia_prima') {
                const targetQueue = orders
                    .filter(o => (o.status === 'em_producao' || o.status === 'aguardando_materia_prima') && o.id !== orderId)
                    .sort((a, b) => (a.position || 0) - (b.position || 0));
                const insertIndex = newIndex !== undefined ? newIndex : targetQueue.length;
                targetQueue.splice(insertIndex, 0, { ...order, ...updates, status: newStatus });
                const batchPromises = safeArray(targetQueue).map((o, idx) => updateDoc(doc(db, 'pedidos', o.id), { ...(o.id === orderId ? updates : {}), position: idx + 1 }));
                setOrders(prev => {
                    const others = safeArray(prev).filter(o => o.status !== 'em_producao' && o.id !== orderId);
                    return [...targetQueue, ...others];
                });
                await Promise.all(batchPromises);
            } else if (order.status === 'em_producao' || order.status === 'aguardando_materia_prima') {
                updates.position = deleteField() as any;
                const remainingQueue = orders
                    .filter(o => (o.status === 'em_producao' || o.status === 'aguardando_materia_prima') && o.id !== orderId)
                    .sort((a, b) => (a.position || 0) - (b.position || 0));
                const shiftPromises = safeArray(remainingQueue).map((o, idx) => updateDoc(doc(db, 'pedidos', o.id), { position: idx + 1 }));
                await updateDoc(doc(db, 'pedidos', orderId), updates);
                await Promise.all(shiftPromises);
            } else {
                await updateDoc(doc(db, 'pedidos', orderId), updates);
            }
        } catch (e) {
            console.error("Error moving order: ", e);
            setOrders(originalOrders);
        }
    };

    const handleConfirmProductionEntry = async (data: { 
        sawyerId: string; 
        sawyerName: string; 
        cutterId: string; 
        cutterName: string; 
        finisherId: string;
        finisherName: string; 
        deliveryDate: string;
        installationDate: string;
        productionDeadline: string;
        estimatedTime: number; 
    }) => {
        if (!orderToProduction) return;
        try {
            const isoNow = toISODateSafe(new Date())!;
            const formattedDeadline = format(safeParseISO(data.productionDeadline)!, 'dd/MM/yyyy');
            const formattedInstallation = format(safeParseISO(data.installationDate)!, 'dd/MM/yyyy');

            await transitionProductionStage({
                orderId: orderToProduction.id,
                companyId: profile?.companyId || '',
                fromStage: orderToProduction.status,
                toStage: 'em_producao',
                userId: user?.uid || '',
                userName: profile?.name || '',
                reason: `Pedido liberado para produção. Prazo interno da fábrica: ${formattedDeadline}. Instalação prevista: ${formattedInstallation}.`,
                additionalFields: {
                    productionStatus: 'em_producao',
                    deliveryDate: data.deliveryDate,
                    scheduledDate: data.deliveryDate,
                    installationDate: data.installationDate,
                    productionDeadline: data.productionDeadline,
                    cutterId: data.cutterId,
                    cutterName: data.cutterName,
                    finisherId: data.finisherId,
                    finisherName: data.finisherName,
                    sawyerId: data.cutterId,
                    sawyerName: data.cutterName,
                    estimatedSawyerTime: data.estimatedTime
                }
            });
            
            setIsProductionEntryModalOpen(false);
            setOrderToProduction(null);
        } catch (e) {
            console.error("Error entering production: ", e);
        }
    };

    const handleConfirmInstallationEntry = async (data: { 
        installerId: string; 
        installerName: string; 
    }) => {
        if (!orderToInstallation) return;
        try {
            const isoNow = toISODateSafe(new Date())!;
            await transitionProductionStage({
                orderId: orderToInstallation.id,
                companyId: profile?.companyId || '',
                fromStage: orderToInstallation.status,
                toStage: targetInstallationStatus,
                userId: user?.uid || '',
                userName: profile?.name || '',
                reason: `Pedido liberado para instalação. Instalador responsável: ${data.installerName}.`,
                additionalFields: {
                    installerId: data.installerId,
                    installerName: data.installerName
                }
            });
            
            setIsInstallationModalOpen(false);
            setOrderToInstallation(null);
        } catch (e) {
            console.error("Error entering installation: ", e);
        }
    };

    const handleCloseJob = async (data: JobClosingData) => {
        if (!orderToClose) return;
        const isReturn = data.completionStatus === 'return';
        const newStatus: Status = isReturn ? 'em_producao' : 'finalizado';
        try {
            const queueOrders = safeArray(orders).filter(o => o.status === 'em_producao');
            const maxPos = safeArray(queueOrders).reduce((max, o) => Math.max(max, o.position || 0), 0);
            if (!isReturn) {
                await transitionProductionStage({
                    orderId: orderToClose.id,
                    companyId: profile?.companyId || '',
                    fromStage: orderToClose.status,
                    toStage: 'finalizado',
                    userId: user?.uid || '',
                    userName: profile?.name || '',
                    reason: data.otherReason || 'Ordem finalizada',
                    metadata: { installerName: data.installerName, completionStatus: data.completionStatus }
                });
            } else {
                const payload: Partial<Order> = {
                    status: newStatus,
                    installerName: data.installerName,
                    completionStatus: data.completionStatus,
                    completionDate: toISODateSafe(new Date())!,
                    closureDetails: data.otherReason || '',
                    position: isReturn ? maxPos + 1 : deleteField() as any,
                    history: arrayUnion({
                        status: newStatus,
                        timestamp: toISODateSafe(new Date())!,
                        userId: user?.uid,
                        notes: isReturn ? `Retorno: ${data.returnReasons.join(', ')}${data.otherReason ? ` - ${data.otherReason}` : ''}` : 'Finalizado'
                    }) as any
                };
                await updateDoc(doc(db, 'pedidos', orderToClose.id), payload);
            }
            if (isReturn && data.returnReasons?.length) {
                addIncident({
                    orderId: orderToClose.id,
                    type: 'avaria',
                    date: new Date(),
                    description: `Retorno Técnico: ${data.returnReasons.join(', ')}${data.otherReason ? ` - ${data.otherReason}` : ''}`,
                    customerName: orderToClose.customerName
                });
            }
            setIsClosingModalOpen(false);
            setOrderToClose(null);
        } catch (e) {
            console.error("Error closing job:", e);
        }
    };

    const handleConfirmReturn = async (data: ReturnRegistrationData) => {
        if (!orderToReturn) return;
        try {
            const queueOrders = safeArray(orders).filter(o => o.status === 'em_producao');
            const maxPos = safeArray(queueOrders).reduce((max, o) => Math.max(max, o.position || 0), 0);
            const updates: Partial<Order> = {
                status: 'em_producao',
                position: maxPos + 1,
                lastReturnDate: toISODateSafe(new Date())!,
                lastReturnReason: data.returnReasons.join(', ') + (data.otherReason ? ` - ${data.otherReason}` : ''),
                history: arrayUnion({
                    status: 'em_producao',
                    timestamp: toISODateSafe(new Date())!,
                    userId: user?.uid,
                    notes: `Retorno em Campo: ${data.returnReasons.join(', ')}${data.otherReason ? ` - ${data.otherReason}` : ''}`
                }) as any
            };
            await updateDoc(doc(db, 'pedidos', orderToReturn.id), updates);
            addIncident({
                orderId: orderToReturn.id,
                type: 'avaria',
                date: new Date(),
                description: `Retorno em Campo: ${data.returnReasons.join(', ')}${data.otherReason ? ` - ${data.otherReason}` : ''}`,
                customerName: orderToReturn.customerName
            });
            setIsReturnModalOpen(false);
            setOrderToReturn(null);
} catch (err) {
            console.error("Error registering return: ", err);
        }
    };

    const handleConfirmInternalReturn = async (itemToRemake: 'Base' | 'Frontão' | 'Cuba', reason: string, newDate: string, auditMetadata?: { source?: string; metadata?: Record<string, any> }) => {
        if (!orderToInternalReturn) return;
        try {
            const queueOrders = safeArray(orders).filter(o => o.status === 'em_producao');
            const maxPos = safeArray(queueOrders).reduce((max, o) => Math.max(max, o.position || 0), 0);
            const updates: Partial<Order> = {
                status: 'em_producao',
                position: maxPos + 1,
                lastInternalReturnItem: itemToRemake,
                lastInternalReturnReason: reason,
                remakeDate: toISODateSafe(newDate)!,
                history: arrayUnion({
                    status: 'em_producao',
                    timestamp: toISODateSafe(new Date())!,
                    userId: user?.uid,
                    notes: `Retorno Interno (${itemToRemake}): ${reason}`
                }) as any
            };
            await updateDoc(doc(db, 'pedidos', orderToInternalReturn.id), updates);
            addIncident({
                orderId: orderToInternalReturn.id,
                type: 'avaria',
                date: new Date(),
                description: `Retorno Interno (${itemToRemake}): ${reason}`,
                customerName: orderToInternalReturn.customerName
            });
            setIsInternalReturnModalOpen(false);
            setOrderToInternalReturn(null);
            setSelectedOrder(null);
        } catch (err) {
            console.error("Error registering internal return: ", err);
        }
    };

    const handleOrderReschedule = (order: Order) => {
        if (!isContractFirstOrder(order) && !isLegacyOrder(order)) {
            alert("Bloqueio de Conformidade: Esta operação requer um contrato assinado.");
            return;
        }
        
        setSelectedOrder(null);
        // Em vez de criar um "novo pedido" livre, redirecionamos para edição ou sugerimos novo orçamento
        if (order.id) {
            navigate(`/pedidos/${order.id}/editar`);
        } else {
            alert("Para gerar uma nova produção, utilize o fluxo de Orçamentos -> Medição -> Contrato.");
            navigate('/orcamentos');
        }
    };

    const handleOrderCalendarReschedule = async (orderId: string, newDate: string) => {
        try {
            const docRef = doc(db, 'pedidos', orderId);
            const isoNow = toISODateSafe(new Date())!;
            const targetDateStr = newDate.split('T')[0];
            const formattedDate = format(safeParseISO(targetDateStr)!, 'dd/MM/yyyy');
            
            const order = orders.find(o => o.id === orderId);
            const history = order ? safeHistoryArray(order.history) : [];

            await updateDoc(docRef, {
                installationDate: targetDateStr,
                installationStatus: 'agendado',
                updatedAt: isoNow,
                history: [
                    ...history,
                    {
                        date: isoNow,
                        action: `Data de instalação alterada para ${formattedDate}.`,
                        user: profile?.name || 'Sistema',
                        severity: 'info'
                    }
                ]
            });
            
            createOrderLog({
                orderId: orderId,
                companyId: profile?.companyId || '',
                userId: user?.uid || '',
                userName: profile?.name || '',
                action: 'status_change',
                fieldChanged: 'installationDate',
                oldValue: order?.installationDate || '',
                newValue: targetDateStr,
            });
        } catch (e) {
            console.error("Error rescheduling calendar order: ", e);
        }
    };

    const handleCompleteConference = async (orderId: string) => {
        await handlePatchOrder(orderId, { conferenceCompleted: true, conferenceDate: toISODateSafe(new Date())! });
        setSelectedOrder(null);
    };

    const activeOrders = useMemo(() => {
        return (orders || []).filter(order => {
            // Regra 1: Filtrar status finais
            if (order.status === 'finalizado' || order.status === 'cancelado') return false;
            
            // Regra 2: Blindagem Contract-First
            // Permitir se for Contrato Assinado OU se for registro Legado (antes da trava)
            return isContractFirstOrder(order) || isLegacyOrder(order);
        });
    }, [orders]);

    const contractsWithoutOS = useMemo(() => {
        return (contracts || []).filter(c => c.contractStatus === 'signed' && !c.orderId);
    }, [contracts]);

    const pendingContractsCount = useMemo(() => {
        return (contracts || []).filter(c => ['pending', 'viewed', 'draft', 'company_signed'].includes(c.contractStatus as string)).length;
    }, [contracts]);

    const handleInternalReturnClick = (order: Order, item: 'Base' | 'Frontão' | 'Cuba') => {
        setOrderToInternalReturn(order);
        setInternalReturnItem(item);
        setIsInternalReturnModalOpen(true);
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#020617] flex font-inter transition-colors duration-500">
            {!isFullscreenMode && !isFocusMode && (<Sidebar 
                    quotesCount={(quotes || []).filter(q => q.status === 'sent' || q.status === 'viewed').length} 
                    contractsCount={pendingContractsCount}
                />
            )}
            <main className={cn(
                "flex-1 transition-all duration-300 w-full", isFullscreenMode ? "fixed inset-0 z-[9999] bg-white overflow-hidden p-0" : isFocusMode ? "p-6 overflow-y-auto" : "p-4 overflow-y-auto", !isFullscreenMode && !isFocusMode && "lg:ml-[72px]"
            )}>
                <div className={cn("w-full mx-auto space-y-[var(--density-gap)]", isFullscreenMode && "h-screen space-y-0")}>
                    {!isFullPageForm && (
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-700">
                            <div className="space-y-1 text-left">
                                <h1 className="rocha-text-title uppercase leading-none">{viewMetadata.title}</h1>
                                <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 dark:text-slate-500">{viewMetadata.description}</p>
                                {activeView === 'home' && (
                                    <div className="flex items-center gap-3 pt-4 animate-in fade-in slide-in-from-left-4 duration-1000">
                                        <Button onClick={handleNewQuote} className="h-9 bg-brand-rocha-primary hover:bg-brand-rocha-primary/90 text-white rounded-lg shadow-lg shadow-brand-rocha-primary/10 px-6 font-black uppercase text-[10px] tracking-widest group">
                                            <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" /> Novo Orçamento
                                        </Button>
                                        <Button 
                                            onClick={() => navigate('/clientes', { state: { openAddModal: true } })} 
                                            variant="outline" 
                                            className="h-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-brand-rocha-primary hover:border-brand-rocha-primary/50 rounded-lg shadow-sm px-6 font-black uppercase text-[10px] tracking-widest"
                                        >
                                            <UserPlus className="w-4 h-4 mr-2" /> Novo Cliente
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <Button
                                    onClick={toggleFocusMode}
                                    variant="outline"
                                    className={cn(
                                        "h-10 px-4 rounded-xl font-bold uppercase text-[10px] tracking-widest transition-all",
                                        isFocusMode ? "bg-slate-900 text-white border-slate-900" : "bg-white dark:bg-slate-900 border-slate-200 text-slate-500"
                                    )}
                                    title={isFocusMode ? "Sair do modo foco" : "Ativar modo foco"}
                                >
                                    <Focus className="w-4 h-4 mr-2" />
                                    {isFocusMode ? "Sair Foco" : "Modo Foco"}
                                </Button>
                                {activeView === 'dashboard' && (
                                    <div className="flex items-center gap-2">
                                        <QualityIndicator qualityScore={incidentStats.daysSince} />
                                        <Button variant="outline" size="sm" className="h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 font-bold uppercase text-[10px] tracking-widest shadow-sm hover:bg-slate-50 dark:hover:bg-white/10" onClick={() => generateBatchProductionSheet(safeArray(orders).filter(o => o.status === 'aguardando_materia_prima' || o.status === 'em_producao'), settings)}>
                                            <List className="w-4 h-4 mr-2" /> Ficha de Lote
                                        </Button>
                                    </div>
                                )}
                                {activeView === 'quotes' && currentPath === '/orcamentos' && (
                                    <Button onClick={handleNewQuote} className="h-10 bg-brand-rocha-primary hover:bg-brand-rocha-primary/90 text-white rounded-xl shadow-lg shadow-brand-rocha-primary/20 px-6 font-bold uppercase text-[10px] tracking-widest">
                                        <Plus className="w-4 h-4 mr-2" /> Novo Orçamento
                                    </Button>
                                )}
                                {activeView === 'clients' && (
                                    <Button onClick={() => setIsAddClientModalOpen(true)} className="h-10 bg-brand-rocha-primary hover:bg-brand-rocha-primary/90 text-white rounded-xl shadow-lg shadow-brand-rocha-primary/20 px-6 font-bold uppercase text-[10px] tracking-widest">
                                        <UserPlus className="w-4 h-4 mr-2" /> Novo Cliente
                                    </Button>
                                )}
                                {activeView === 'staff' && (
                                    <Button onClick={() => setIsAddStaffModalOpen(true)} className="h-10 bg-brand-rocha-primary hover:bg-brand-rocha-primary/90 text-white rounded-xl shadow-lg shadow-brand-rocha-primary/20 px-6 font-bold uppercase text-[10px] tracking-widest">
                                        <UserPlus className="w-4 h-4 mr-2" /> Novo Colaborador
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                        {/* MANAGEMENT ALERTS */}
                        {contractsWithoutOS.length > 0 && (
                            <div 
                                onClick={() => navigate('/contratos')}
                                className="mb-6 p-4 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between group cursor-pointer hover:bg-amber-500/20 transition-all"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center text-white shadow-lg">
                                        <ShieldCheck className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest leading-none mb-1">Ação Requerida</p>
                                        <h4 className="text-sm font-black text-amber-900 dark:text-amber-200 uppercase tracking-tight">
                                            {contractsWithoutOS.length} Contrato(s) assinado(s) aguardando O.S.
                                        </h4>
                                    </div>
                                </div>
                                <Button variant="ghost" size="sm" className="text-amber-600 hover:text-amber-700 font-black uppercase tracking-widest text-[9px] gap-2">
                                    Liberar Produção <Plus className="w-3 h-3" />
                                </Button>
                            </div>
                        )}

                    <ErrorBoundary>
                        <Outlet context={{ setIsTvMode, isTvMode, isFocusMode, toggleFocusMode, 
                            orders: safeArray(orders), 
                            contracts: safeArray(contracts),
                            activeOrders: safeArray(activeOrders),
                            selectedOrder, 
                            setSelectedOrder, 
                            handleOrderMove, 
                            handleOrderReorder, 
                            handleOrderReturn: (order: Order) => { setOrderToReturn(order); setIsReturnModalOpen(true); },
                            handleInternalReturnClick,
                            handleUpdateOrder,
                            handlePatchOrder,
                            onOrderReschedule: async (order: Order) => { handleOrderReschedule(order); },
                            handleOrderCalendarReschedule,
                            handleCompleteConference,
                            handleUpdateQuote,
                            handleDeleteQuote,
                            handleDuplicateQuote,
                            handleConvertQuoteToMeasurement,
                            handleReviseApprovedQuote,
                            handleDirectSale,
                            quotes: safeArray(quotes), 
                            deletedQuotes: safeArray(deletedQuotes),
                            handleRestoreQuote,
                            handlePermanentDeleteQuote,
                            measurements: safeArray(measurements),
                            selectedMeasurement,
                            setSelectedMeasurement,
                            isAddMeasurementModalOpen,
                            setIsAddMeasurementModalOpen,
                            handleAddMeasurement,
                            handleUpdateMeasurementDate,
                            handleDeleteMeasurement,
                            handleConvertToOrder,
                            handleDeclineMeasurement,
                            prefilledMeasurementDate,
                            setPrefilledMeasurementDate: (date: Date | null) => setPrefilledMeasurementDate(date),
                            onNewQuoteFromClient: (clientId: string) => handleNewQuoteFromClient(clientId),
                            isAddClientModalOpen,
                            setIsAddClientModalOpen,
                            isAddStaffModalOpen,
                            setIsAddStaffModalOpen,
                            handleConvertClientToMeasurement,
                            incidentStats: incidentStats || { daysSince: 14, status: 'green', latestDate: null },
                            incidents: safeArray(incidents),
                            settings: settings || {},
                            navigate,
                            setIsFullscreenMode,
                            profile
                        }} />
                    </ErrorBoundary>
                </div>
            </main>

            {selectedOrder && (
                <Modal isOpen={!!selectedOrder} onClose={() => setSelectedOrder(null)} title="Detalhes do Pedido">
                    <OrderDetails 
                        order={selectedOrder} 
                        onUpdateOrder={handleUpdateOrder}
                        onScheduleMeasurement={(order: Order) => handleOrderReschedule(order)}
                        onCompleteConference={(order: Order) => { handleCompleteConference(order.id); }}
                        onInternalReturnClick={(order: Order) => { setOrderToInternalReturn(order); setIsInternalReturnModalOpen(true); }}
                    />
                </Modal>
            )}

            <JobClosingModal 
                isOpen={isClosingModalOpen} 
                onClose={() => { setIsClosingModalOpen(false); setOrderToClose(null); }} 
                onConfirm={handleCloseJob}
                orderId={orderToClose?.id || ''}
            />

            <ReturnRegistrationModal
                isOpen={isReturnModalOpen}
                onClose={() => { setIsReturnModalOpen(false); setOrderToReturn(null); }}
                onConfirm={handleConfirmReturn}
                orderId={orderToReturn?.id || ''}
            />

            <InternalReturnModal
                isOpen={isInternalReturnModalOpen}
                onClose={() => { setIsInternalReturnModalOpen(false); setOrderToInternalReturn(null); }}
                onConfirm={handleConfirmInternalReturn}
                initialItem={internalReturnItem}
            />

            <ProductionEntryModal 
                isOpen={isProductionEntryModalOpen}
                onClose={() => { setIsProductionEntryModalOpen(false); setOrderToProduction(null); }}
                onConfirm={handleConfirmProductionEntry}
                order={orderToProduction}
            />

            <InstallationEntryModal 
                isOpen={isInstallationModalOpen}
                onClose={() => { setIsInstallationModalOpen(false); setOrderToInstallation(null); }}
                onConfirm={handleConfirmInstallationEntry}
                order={orderToInstallation}
            />

            {isConversionWizardOpen && (
                <ProductionConversionWizard 
                    onClose={() => { setIsConversionWizardOpen(false); setConversionMeasurement(null); setConversionQuote(null); }}
                    measurement={conversionMeasurement || undefined}
                    quoteRef={conversionQuote}
                    onSuccess={(_orderId) => {
                        setIsConversionWizardOpen(false);
                        const isDirectToContract = conversionQuote?.isPostMeasurement || 
                                                 conversionQuote?.quoteStage === 'pos_medicao' || 
                                                 conversionQuote?.quoteStage === 'revisao_comercial';
                        
                        setConversionMeasurement(null);
                        setConversionQuote(null);
                        
                        if (isDirectToContract) {
                            navigate(`/order/${_orderId}/contract`);
                        } else {
                            navigate('/producao/ordens');
                        }
                    }}
                />
            )}

            <QuoteSelectorModal 
                isOpen={isQuoteSelectorOpen} 
                onClose={() => setIsQuoteSelectorOpen(false)} 
                onSelect={async (quote) => {
                    const stage = getEffectiveWorkflowStage(quote);
                    
                    if (stage === 'em_contrato') {
                        // Se já tem contrato, redireciona para visualização
                        const contractId = quote.convertedToContractId || quote.id;
                        navigate(`/order/${contractId}/contract`);
                        setIsQuoteSelectorOpen(false);
                        return;
                    }

                    if (pendingMeasurement) {
                        try {
                            const isoNow = toISODateSafe(new Date());
                            // Vincular medição e orçamento no Firestore
                            await updateDoc(doc(db, 'medicoes', pendingMeasurement.id), {
                                quoteId: quote.id,
                                origin: 'quote',
                                updatedAt: isoNow
                            });
                            await updateDoc(doc(db, 'orcamentos', quote.id), {
                                measurementId: pendingMeasurement.id,
                                status: 'measuring',
                                quoteStage: 'aguardando_medicao',
                                updatedAt: isoNow
                            });
                        } catch (err) {
                            console.error("Erro ao vincular medição e orçamento:", err);
                        }
                    }

                    if (canStartContract(quote)) {
                        // Redirecionar para o fluxo de pagamento antes do contrato
                        preparePaymentFlow(quote, pendingMeasurement || null);
                    } else if (pendingMeasurement) {
                        // Se viemos de uma medição mas o orçamento não permite contrato ainda
                        alert("Atenção: Este orçamento precisa ser revisado e aprovado como Pós-Medição antes de gerar o contrato.");
                        setIsQuoteSelectorOpen(false);
                        return;
                    } else {
                        // Fluxo normal de agendar medição a partir de orçamento
                        handleConvertQuoteToMeasurement(quote);
                    }
                    setIsQuoteSelectorOpen(false);
                }}
                measurement={pendingMeasurement || null}
                orders={safeArray(orders)}
                contracts={safeArray(contracts)}
                onCreateNew={() => {
                    setIsQuoteSelectorOpen(false);
                    navigate('/orcamentos/novo');
                }}
            />

            <Modal 
                isOpen={isMeasurementScheduleModalOpen} 
                onClose={() => { setIsMeasurementScheduleModalOpen(false); setQuoteToMeasure(null); }}
                title="Agendar Medição Técnica"
            >
                {quoteToMeasure && (
                    <MeasurementForm 
                        onSubmit={async (data, id) => {
                            await handleAddMeasurement(data, id);
                            setIsMeasurementScheduleModalOpen(false);
                            setQuoteToMeasure(null);
                        }}
                        preselectedQuote={quoteToMeasure}
                    />
                )}
            </Modal>

            <Modal 
                isOpen={isAddMeasurementModalOpen} 
                onClose={() => { 
                    setIsAddMeasurementModalOpen(false); 
                    setPrefilledMeasurementDate(null); 
                    setPreselectedClientIdForModal(null);
                }}
                title="Novo Agendamento de Medição"
            >
                <MeasurementForm 
                    onSubmit={async (data, id) => {
                        await handleAddMeasurement(data, id);
                        setIsAddMeasurementModalOpen(false);
                        setPrefilledMeasurementDate(null);
                        setPreselectedClientIdForModal(null);
                    }}
                    initialDate={prefilledMeasurementDate || undefined}
                    preselectedClientId={preselectedClientIdForModal || undefined}
                />
            </Modal>

            {selectedMeasurement && (
                <Modal
                    isOpen={!!selectedMeasurement}
                    onClose={() => setSelectedMeasurement(null)}
                    title="Detalhes do Agendamento"
                >
                    <MeasurementDetails 
                        measurement={selectedMeasurement}
                        onClose={() => setSelectedMeasurement(null)}
                        onDelete={(e) => handleDeleteMeasurement(selectedMeasurement.id, e)}
                        onConvertToOrder={handleConvertToOrder}
                        onDecline={handleDeclineMeasurement}
                        onEdit={profile?.role !== 'medidor' ? () => setIsEditMeasurementModalOpen(true) : undefined}
                    />
                </Modal>
            )}

            {isEditMeasurementModalOpen && selectedMeasurement && (
                <Modal
                    isOpen={isEditMeasurementModalOpen}
                    onClose={() => setIsEditMeasurementModalOpen(false)}
                    title="Editar Agendamento de Medição"
                >
                    <MeasurementForm
                        initialMeasurement={selectedMeasurement}
                        onSubmit={(data) => handleUpdateMeasurement(selectedMeasurement.id, data)}
                    />
                </Modal>
            )}

            {isPaymentModalOpen && paymentDraft && targetQuoteForPayment && (
                <Modal 
                    isOpen={isPaymentModalOpen} 
                    onClose={() => setIsPaymentModalOpen(false)} 
                    title="Condições de Pagamento"
                    className="max-w-2xl"
                >
                    <div className="flex flex-col gap-6">
                        <PaymentConditionsForm 
                            total={targetQuoteForPayment.total || 0}
                            paymentDraft={paymentDraft}
                            onUpdate={setPaymentDraft}
                        />
                        
                        <div className="flex gap-3 pt-4 border-t border-slate-100">
                            <Button 
                                variant="ghost" 
                                className="flex-1 h-12 rounded-xl font-bold text-xs uppercase tracking-widest text-slate-400" 
                                onClick={() => setIsPaymentModalOpen(false)}
                            >
                                Cancelar
                            </Button>
                            <Button 
                                className="flex-[2] h-12 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg" 
                                onClick={handleConfirmPaymentAndProceed}
                            >
                                Validar e Gerar Contrato
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};
