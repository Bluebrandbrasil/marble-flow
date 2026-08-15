import { safeArray, safeHistoryArray } from '../../lib/dataDiagnostics';
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams, useOutletContext } from 'react-router-dom';
import { doc, getDoc, addDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { QuoteBuilder } from './QuoteBuilder';
import { QuoteReview } from './QuoteReview';
import { Button } from '../../components/ui/Button';
import { ArrowLeft, Plus, Info, RefreshCw } from 'lucide-react';

import { getClientDisplayInfo } from '../../lib/clientUtils';
import { Modal } from '../../components/ui/Modal';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { useCompanyData } from '../../hooks/useCompanyData';
import { useStaffCatalog } from '../../hooks/useStaffCatalog';
import { 
    calculateQuoteTotals, 
    normalizeQuoteData, 
    resolveQuoteTotal,
    calculateQuoteDiff,
    generateQuoteSnapshot,
    hydrateQuoteForEditor,
    validateQuoteBeforeApproval,
    validatePaymentConditions,
    isEmptyQuoteDraft
} from '../../utils/quoteCalculations';
import { toISODateSafe } from '../../lib/dateWriteUtils';
import { logIntegrityEvent, getNextQuoteProtocol } from '../../utils/quoteFirestore';
import { trackInfluencerClosure } from '../../lib/influencerTracker';
import type { Quote, StoneGroup, QuoteAccessory, QuoteService, PaymentConditions } from '../../types';
import { useClients } from '../../hooks/useClients';
import { Loader2, CheckCircle2, AlertCircle, Lock, ShoppingCart } from 'lucide-react';
import { 
    getEffectiveWorkflowStage, 
    canGenerateContract,
    canEditQuote,
    approveQuoteAndFreeze
} from '../../components/workflow/WorkflowStatus';
import { ProductionConversionWizard } from '../orders/ProductionConversionWizard';

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

export const QuotePage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { user, profile } = useAuth();
    
    // Client search state
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [debouncedClientSearch, setDebouncedClientSearch] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedClientSearch(clientSearchTerm), 300);
        return () => clearTimeout(timer);
    }, [clientSearchTerm]);

    const { clients } = useClients(debouncedClientSearch);
    const { staff } = useStaffCatalog();
    const { companyData } = useCompanyData();
    const safeCompanyData = companyData || {};

    const { handleReviseApprovedQuote } = useOutletContext<any>();
    
    const [loading, setLoading] = useState(!!id);
    const [saving, setSaving] = useState(false);
    const [viewMode, setViewMode] = useState<'review' | 'builder'>(
        id || (location.state?.prefilledQuoteData?.groups?.length > 0) ? 'review' : 'builder'
    );

    const [searchParams] = useSearchParams();
    const autoDownload = searchParams.get('download') === 'true';

    // Central Quote State
    const [groups, setGroups] = useState<StoneGroup[]>([]);
    const [accessories, setAccessories] = useState<QuoteAccessory[]>([]);
    const [services, setServices] = useState<QuoteService[]>([]);
    const queryClientId = searchParams.get('clientId');
    const stateClientId = location.state?.preselectedClientId;
    const initialClientId = queryClientId || stateClientId || '';

    const [clientId, setClientId] = useState(initialClientId);
    const [customerName, setCustomerName] = useState(location.state?.prefilledQuoteData?.customerName || '');
    const [customerPhone, setCustomerPhone] = useState(location.state?.prefilledQuoteData?.customerPhone || '');
    const [customerAddress, setCustomerAddress] = useState(location.state?.prefilledQuoteData?.customerAddress || '');
    
    // Seller State will be auto-filled by useEffect below
    const [sellerId, setSellerId] = useState(location.state?.prefilledQuoteData?.sellerId || '');
    const [sellerName, setSellerName] = useState('');
    const [influencerId, setInfluencerId] = useState('');
    const [influencerName, setInfluencerName] = useState('');
    const [referralCode, setReferralCode] = useState('');
    const [origin, setOrigin] = useState(location.state?.prefilledQuoteData?.origin || '');
    const [leadOrigin, setLeadOrigin] = useState(location.state?.prefilledQuoteData?.leadOrigin || '');
    const [storeVisitId, setStoreVisitId] = useState(searchParams.get('storeVisitId') || '');
    const [discount, setDiscount] = useState(0);

    const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('fixed');
    const [status, setStatus] = useState<Quote['status']>('draft');
    const [observations, setObservations] = useState('');
    const [includeInstallation, setIncludeInstallation] = useState(true);
    const [manualInstallation, setManualInstallation] = useState<{ value: number; description: string } | null>(null);
    const [isPostMeasurement, setIsPostMeasurement] = useState(false);
    
    // Novas Variáveis de Rastreio Operacional
    const [quoteStage, setQuoteStage] = useState<Quote['quoteStage']>('pre_orcamento');
    const [parentQuoteId, setParentQuoteId] = useState<string | null>(null);
    const [quoteMeasurementId, setQuoteMeasurementId] = useState<string | null>(null);
    const [isFrozen, setIsFrozen] = useState(false);
    const [quoteSnapshot, setQuoteSnapshot] = useState<Partial<Quote> | null>(null);
    const [currentQuoteData, setCurrentQuoteData] = useState<Quote | null>(null);
    const [paymentConditions, setPaymentConditions] = useState<PaymentConditions | undefined>(undefined);
    
    // Original Client State (para travar na edição)
    const [originalClientId, setOriginalClientId] = useState('');
    const [originalClientName, setOriginalClientName] = useState('');
    const [originalClientPhone, setOriginalClientPhone] = useState('');
    const [originalClientSnapshot, setOriginalClientSnapshot] = useState<any>(null);
    
    // Troca de Cliente Administrativa
    const [isSwapClientModalOpen, setIsSwapClientModalOpen] = useState(false);
    const [swapNewClientId, setSwapNewClientId] = useState('');
    const [isSwappingClient, setIsSwappingClient] = useState(false);

    // Protocolo Sequencial (Rule #60)
    const [protocolNumber, setProtocolNumber] = useState<string | null>(null);
    const [protocolBaseNumber, setProtocolBaseNumber] = useState<number | null>(null);
    const [protocolYear, setProtocolYear] = useState<number | null>(null);

    // Explicitly separate routing ID (Edit Mode) from local draft session
    const [draftId, setDraftId] = useState<string | null>(null);
    const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [lastAutosaveAt, setLastAutosaveAt] = useState<Date | null>(null);
    const [isConversionWizardOpen, setIsConversionWizardOpen] = useState(false);
    const [isHydrated, setIsHydrated] = useState(false);
    
    // Revision States
    const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
    const [revisionReason, setRevisionReason] = useState('');
    const [isRevising, setIsRevising] = useState(false);
    const isDraftBeingCreated = React.useRef(false);
    const clientSelectedLocallyRef = React.useRef(false);
    const currentFetchTargetIdRef = React.useRef<string | null>(null);

    // Initial Determination: Are we editing an existing document from the URL or starting a new session?
    const isEditingExisting = !!id;

    // Reset local selection ref when URL or draft changes to a completely different quote
    useEffect(() => {
        const targetId = id || draftId;
        if (targetId && targetId !== currentFetchTargetIdRef.current) {
            clientSelectedLocallyRef.current = false;
        }
    }, [id, draftId]);



    // Auto-fill Client if clientId is provided in a new quote
    useEffect(() => {
        if (!isEditingExisting && clientId && clients.length > 0) {
            const customer = clients.find(c => c.id === clientId);
            if (customer) {
                if (!customerName) setCustomerName(customer.name);
                if (!customerPhone) setCustomerPhone(customer.phone || '');
                if (!customerAddress) setCustomerAddress(customer.address || customer.street || '');
                if (!influencerId) setInfluencerId(customer.influencerId || '');
                if (!influencerName) setInfluencerName(customer.influencerName || '');
            }
        }
    }, [isEditingExisting, clientId, clients, customerName, customerPhone, customerAddress, influencerId, influencerName]);

    // Auto-fill Seller with Logged-in User if not set
    useEffect(() => {
        if (!isEditingExisting && user && staff.length > 0 && !sellerId) {
            const loggedInStaff = staff.find(s => s.id === user.uid);
            if (loggedInStaff && (loggedInStaff.role === 'vendedor' || loggedInStaff.role === 'seller' || loggedInStaff.role === 'admin' || loggedInStaff.role === 'company_admin' || loggedInStaff.role === 'superadmin')) {
                setSellerId(loggedInStaff.id);
                setSellerName(loggedInStaff.name);
            }
        }
    }, [isEditingExisting, user, staff, sellerId]);
    
    useEffect(() => {
        if (isEditingExisting) {
            console.log("[QUOTE DEBUG] EDIT MODE: using id", id);
            setDraftId(id);
        } else {
            // Check for recovery fallback
            const savedDraftId = sessionStorage.getItem('currentNewDraftId');
            if (savedDraftId) {
                console.log("[QUOTE DEBUG] NEW MODE: Recovery found", savedDraftId);
                setDraftId(savedDraftId);
            }
        }
    }, [id, isEditingExisting]);

    // Immediate Draft Creation for New Mode
    useEffect(() => {
        const createInitialDraft = async () => {
            if (!id && !draftId && user && profile?.companyId && !isDraftBeingCreated.current) {
                isDraftBeingCreated.current = true;
                console.log("[QUOTE DEBUG] NEW MODE: Creating immediate draft...");
                
                try {
                    let postMeasurementQuoteData: any = {};
                    const cloneId = searchParams.get('cloneId');
                    const cloneMeasurementId = searchParams.get('measurementId');
                    const stage = searchParams.get('stage') as Quote['quoteStage'] || 'pre_orcamento';
                    
                    let measurementGroups: any[] = [];
                    if (cloneMeasurementId) {
                        const measSnap = await getDoc(doc(db, 'medicoes', cloneMeasurementId));
                        if (measSnap.exists() && measSnap.data().groups?.length > 0) {
                            measurementGroups = measSnap.data().groups;
                        }
                    }

                    if (cloneId) {
                         console.log("[QUOTE DEBUG] Cloning parent quote:", cloneId);
                         const parentSnap = await getDoc(doc(db, 'orcamentos', cloneId));
                         if (parentSnap.exists()) {
                              const parentQuote = parentSnap.data();
                              postMeasurementQuoteData = {
                                  groups: (measurementGroups || []).length > 0 ? measurementGroups : (parentQuote.groups || []),
                                  accessories: parentQuote.accessories || [],
                                  services: parentQuote.services || [],
                                  clientId: String(parentQuote.clientId || ''),
                                  customerName: String(parentQuote.customerName || ''),
                                  customerPhone: String(parentQuote.customerPhone || ''),
                                  customerAddress: String(parentQuote.customerAddress || ''),
                                  sellerId: String(parentQuote.sellerId || ''),
                                  discount: Number(parentQuote.discount) || 0,
                                  discountType: parentQuote.discountType || 'fixed',
                                  includeInstallation: parentQuote.includeInstallation ?? true,
                                  manualInstallation: parentQuote.manualInstallation || null,
                                  observations: String(parentQuote.observations || ''),
                                  protocolBaseNumber: parentQuote.protocolBaseNumber || null,
                                  protocolYear: parentQuote.protocolYear || null,
                              };
                         }
                    }

                    // --- GENERATE PROTOCOL ---
                    let proto: any = { protocolNumber: null, baseNumber: null, year: null };
                    if (postMeasurementQuoteData.protocolBaseNumber) {
                        // Inherit from parent
                        const prefix = stage === 'pos_medicao' ? 'POS' : 'PRE';
                        const formatted = String(postMeasurementQuoteData.protocolBaseNumber).padStart(6, '0');
                        proto = {
                            protocolNumber: `${prefix}-${postMeasurementQuoteData.protocolYear}-${formatted}`,
                            baseNumber: postMeasurementQuoteData.protocolBaseNumber,
                            year: postMeasurementQuoteData.protocolYear
                        };
                    } else {
                        // New sequential number
                        proto = await getNextQuoteProtocol(profile.companyId, stage === 'pos_medicao');
                    }

                    const initialDraftData = {
                        status: 'draft',
                        userId: user.uid,
                        createdBy: profile.name || user.email || 'Sistema',
                        companyId: profile.companyId,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        quoteStage: stage,
                        parentQuoteId: cloneId || null,
                        measurementId: cloneMeasurementId || null,
                        version: 1,
                        isLatestVersion: true,
                        protocolNumber: proto.protocolNumber,
                        protocolBaseNumber: proto.baseNumber,
                        protocolYear: proto.year
                    };
                    
                    let hydrated = hydrateQuoteForEditor({
                        ...initialDraftData,
                        ...postMeasurementQuoteData,
                        ...(Object.keys(postMeasurementQuoteData).length === 0 ? {
                            customerName: location.state?.prefilledQuoteData?.customerName || '',
                            clientId: location.state?.preselectedClientId || '',
                            groups: location.state?.prefilledQuoteData?.groups || [],
                            isPostMeasurement: location.state?.prefilledQuoteData?.isPostMeasurement || false,
                        } : {}),
                    });

                    // Hide if empty
                    if (isEmptyQuoteDraft(hydrated)) {
                        hydrated.hiddenFromDashboard = true;
                        hydrated.quoteStage = 'draft_zero';
                    }

                    console.log("[QUOTE DEBUG] Initializing with hydrated data:", hydrated.groups?.length, "groups");

                    const res = await addDoc(collection(db, 'orcamentos'), sanitizeForFirestore(hydrated));
                    console.log("[QUOTE DEBUG] Draft created: ID", res.id);
                    setDraftId(res.id);
                    setGroups(hydrated.groups || []);
                    if (hydrated.groups && hydrated.groups.length > 0) {
                        setViewMode('review');
                    }
                    setAccessories(hydrated.accessories || []);
                    setServices(hydrated.services || []);
                    setClientId(hydrated.clientId || '');
                    setCustomerName(hydrated.customerName || '');
                    setSellerId(hydrated.sellerId || '');
                    setDiscount(hydrated.discount || 0);
                    setDiscountType(hydrated.discountType || 'fixed');
                    setCustomerPhone(hydrated.customerPhone || '');
                    setCustomerAddress(hydrated.customerAddress || '');
                    setInfluencerId(hydrated.influencerId || '');
                    setInfluencerName(hydrated.influencerName || '');
                    setReferralCode(hydrated.referralCode || '');
                    setOrigin(hydrated.origin || '');
                    setIncludeInstallation(hydrated.includeInstallation ?? true);
                    setManualInstallation(hydrated.manualInstallation || null);
                    setQuoteStage(hydrated.quoteStage || 'pre_orcamento');
                    setIsPostMeasurement(!!hydrated.isPostMeasurement);
                    setObservations(hydrated.observations || '');
                    setProtocolNumber(hydrated.protocolNumber || null);
                    setProtocolBaseNumber(hydrated.protocolBaseNumber || null);
                    setProtocolYear(hydrated.protocolYear || null);
                    
                    sessionStorage.setItem('currentNewDraftId', res.id);
                } catch (err) {
                    console.error("[QUOTE ERROR] Failed to create initial draft:", err);
                } finally {
                    isDraftBeingCreated.current = false;
                }
            }
        };

        createInitialDraft();
    }, [id, draftId, user, profile, location.state]);

    // Temp Builder-to-Review Draft state
    const [builderDraft, setBuilderDraft] = useState<any>(null);



    useEffect(() => {
        if (!clientId || clients.length === 0) return;
        const customer = clients.find(c => c.id === clientId);
        if (customer) {
            if (customer.origin === 'Influencer') {
                setOrigin('Influencer');
                setInfluencerId(customer.influencerId || '');
                setInfluencerName(customer.influencerName || '');
                setReferralCode(customer.referralCode || customer.influencerCode || '');
            } else {
                setOrigin(customer.origin || '');
                setInfluencerId('');
                setInfluencerName('');
                setReferralCode('');
            }
        }
    }, [clientId, clients]);

    const rawRate = safeCompanyData?.installationRateLinear;

    const installationRateLinear = typeof rawRate === 'number' ? rawRate : Number(rawRate) || 0;

    const [editingGroupIndex, setEditingGroupIndex] = useState<number | null>(null);

    useEffect(() => {
        const fetchQuote = async () => {
            // We only fetch IF we have an ID from the URL OR IF we have a recovery draftId
            if (!id && !draftId) {
                console.log("[QUOTE DEBUG] New Quote Session: Preparing initial form state.");
                const prefilledData = location.state?.prefilledQuoteData as Partial<Quote> | undefined;
                const initialClientId = location.state?.preselectedClientId as string | undefined;
                
                if (initialClientId) setClientId(initialClientId);
                if (prefilledData?.customerName) setCustomerName(prefilledData.customerName);
                if (prefilledData?.sellerId) setSellerId(prefilledData.sellerId);
                if (prefilledData?.groups) setGroups(prefilledData.groups);
                
                setIsHydrated(true);
                setLoading(false);
                return;
            }

            const targetId = id || draftId;
            const currentRequestTarget = targetId as string;
            currentFetchTargetIdRef.current = currentRequestTarget;
            setLoading(true); // Ensure loading is true when we start a real fetch

            try {
                console.log("[QUOTE DEBUG] Fetching data for:", targetId);
                const docSnap = await getDoc(doc(db, 'orcamentos', currentRequestTarget));
                
                if (currentFetchTargetIdRef.current !== currentRequestTarget) {
                    console.log("[QUOTE DEBUG] Stale fetch ignored.");
                    return;
                }

                if (docSnap.exists()) {
                    let data = docSnap.data() as Partial<Quote>;
                    console.log("[QUOTE DEBUG] Data fetched successfully. Status:", data.status);
                    
                    // --- DEBUG LOGGING ---
                    const rawPieces = (data.groups || []).flatMap(g => (g?.pieces || [])) || [];
                    const frontaoRaw = safeArray(rawPieces).filter(p => p.type === 'frontao' || String(p.label || '').toLowerCase().includes('front'));
                    if (frontaoRaw.length > 0) console.log("[DEBUG FRONTÃO] 1. LIDO DO BANCO (Cru):", JSON.parse(JSON.stringify(frontaoRaw)));

                    // Normalize legacy data and calculate anti-zero totals
                    data = normalizeQuoteData(data);
                    
                    const normPieces = (data.groups || []).flatMap(g => (g?.pieces || [])) || [];
                    const frontaoNorm = safeArray(normPieces).filter(p => p.type === 'frontao' || String(p.label || '').toLowerCase().includes('front'));
                    if (frontaoNorm.length > 0) console.log("[DEBUG FRONTÃO] 2. APÓS NORMALIZAÇÃO (Editor):", JSON.parse(JSON.stringify(frontaoNorm)));

                    // --- RESOLUÇÃO DE TOTAIS E AUTO-CORREÇÃO SILENCIOSA ---
                    const resolution = resolveQuoteTotal(data);
                    const userRef = user?.email || 'system';

                    if (resolution.shouldAutoFix && !resolution.isBlockingError) {
                        console.log(`[DATA REPAIR] Orçamento ${targetId} incompleto ao carregar. Reparando silenciosamente...`, resolution.reason);
                        
                        const repairData: any = {
                            totalAmount: resolution.effectiveTotal,
                            total: resolution.effectiveTotal
                        };

                        // If approved but snapshot is broken, REGENERATE the snapshot (only if structure matches)
                        if (data.isFrozen || ['approved', 'measuring', 'converted'].includes(data.status || '')) {
                            console.log("[DATA REPAIR] Regenerating missing snapshot structure...");
                            const repairedSnapshot = generateQuoteSnapshot(data as Quote, resolution.liveCalc);
                            repairData.quoteSnapshot = repairedSnapshot;
                            data.quoteSnapshot = repairedSnapshot;
                        }

                        await updateDoc(doc(db, 'orcamentos', targetId as string), sanitizeForFirestore(repairData));
                        
                        // REGISTRAR LOG DE INTEGRIDADE: REPARO
                        await logIntegrityEvent({
                            quoteId: targetId as string,
                            clientName: data.customerName || 'N/A',
                            version: data.version || 1,
                            timestamp: toISODateSafe(new Date())!,
                            type: 'SNAPSHOT_REPAIRED',
                            severity: 'info',
                            details: resolution.reason,
                            triggeredBy: userRef,
                            repairedValues: { total: resolution.effectiveTotal }
                        });

                        data.totalAmount = resolution.effectiveTotal;
                        data.total = resolution.effectiveTotal;
                    } else if (resolution.isBlockingError) {
                        console.error(`[ALERTA CRÍTICO DE INTEGRIDADE] Orçamento ${targetId}:`, resolution.reason);
                        
                        // REGISTRAR LOG DE INTEGRIDADE: ALERTA CRÍTICO
                        await logIntegrityEvent({
                            quoteId: targetId as string,
                            clientName: data.customerName || 'N/A',
                            version: data.version || 1,
                            timestamp: toISODateSafe(new Date())!,
                            type: 'STRUCTURAL_DIVERGENCE',
                            severity: 'critical',
                            details: resolution.reason,
                            triggeredBy: userRef
                        });
                    }

                    const calc = calculateQuoteTotals(
                        data, 
                        typeof safeCompanyData?.installationRateLinear === 'number' ? safeCompanyData.installationRateLinear : Number(safeCompanyData?.installationRateLinear) || 0,
                        data.includeInstallation !== undefined ? data.includeInstallation : true,
                        data.manualInstallation || null
                    );

                    setGroups(calc.groups);
                    setAccessories(data.accessories || []);
                    setServices(data.services || []);
                    
                    // --- RACE CONDITION PROTECTION FOR CLIENT SELECTION ---
                    const initialClientId = location.state?.preselectedClientId as string | undefined;
                    if (isEditingExisting) {
                        setClientId(data.clientId || '');
                        setCustomerName(data.customerName || '');
                    } else {
                        if (clientSelectedLocallyRef.current) {
                            // User selected manually, do not overwrite with empty draft
                        } else if (initialClientId && !data.clientId) {
                            // Navigation state overrides empty draft
                            setClientId(initialClientId);
                        } else {
                            setClientId(data.clientId || '');
                            setCustomerName(data.customerName || '');
                        }
                    }
                    // --------------------------------------------------------
                    setSellerId(data.sellerId || '');
                    setDiscount(Number(data.discount) || 0);
                    setDiscountType(data.discountType || 'fixed');
                    setStatus((data.status as string) === 'pending' ? 'draft' : (data.status as Quote['status']) || 'draft');
                    setObservations(String(data.observations || ''));
                    setCustomerPhone(data.customerPhone || '');
                    setCustomerAddress(data.customerAddress || '');
                    setIncludeInstallation(data.includeInstallation !== undefined ? data.includeInstallation : true);
                    setManualInstallation(data.manualInstallation || null);
                    setInfluencerId(data.influencerId || '');
                    setInfluencerName(data.influencerName || '');
                    setReferralCode(data.referralCode || '');
                    setOrigin(data.origin || '');
                    
                    setQuoteStage(data.quoteStage || 'pre_orcamento');
                    setIsPostMeasurement(!!data.isPostMeasurement);
                    setParentQuoteId(data.parentQuoteId || null);
                    setQuoteMeasurementId(data.measurementId || null);
                    setIsFrozen(data.isFrozen || false);
                    setQuoteSnapshot(data.quoteSnapshot || null);
                    setPaymentConditions(data.paymentConditions || undefined);
                    setProtocolNumber(data.protocolNumber || null);
                    setProtocolBaseNumber(data.protocolBaseNumber || null);
                    setProtocolYear(data.protocolYear || null);
                    setCurrentQuoteData(data as Quote);

                    // Salva os dados originais do cliente para bloquear na edição
                    setOriginalClientId(data.clientId || '');
                    setOriginalClientName(data.customerName || '');
                    setOriginalClientPhone(data.customerPhone || '');
                    setOriginalClientSnapshot(data.clientSnapshot || null);

                    // Only switch to review automatically if we are in Edit Mode (has URL ID)
                    // Or if we have groups
                    if (id || (data.groups && data.groups.length > 0)) {
                        setViewMode('review');
                    }

                } else {
                    console.error("Quote not found");
                    navigate('/orcamentos');
                }
            } catch (error) {
                console.error("Error fetching quote:", error);
            } finally {
                setIsHydrated(true);
                setLoading(false);
            }
        };

        fetchQuote();
    }, [id, draftId, navigate, location.state]);

    useEffect(() => {
        if (sellerId === 'Administrador') {
            setSellerName('Administrador');
        } else if (sellerId && staff.length > 0) {
            const seller = (staff || []).find(s => s.id === sellerId);
            if (seller) setSellerName(String(seller.name || ''));
        }
    }, [sellerId, staff]);

    const isAdmin = profile?.role === 'company_admin' || profile?.role === 'admin' || profile?.role === 'financeiro' || profile?.role === 'superadmin';

    useEffect(() => {
        if (isAdmin && !sellerId && !id) {
            console.log("[QUOTE DEBUG] Admin detected, auto-setting seller to Administrador");
            setSellerId('Administrador');
            setSellerName('Administrador');
        }
    }, [isAdmin, sellerId, id]);

    const handleAddOrUpdateGroup = useCallback((group: StoneGroup) => {
        if (editingGroupIndex !== null) {
            const newGroups = [...groups];
            newGroups[editingGroupIndex] = group;
            setGroups(newGroups);
            setEditingGroupIndex(null);
        } else {
            setGroups([...groups, group]);
        }
        setBuilderDraft(null); // Clear builder draft after finalized
        setViewMode('review');
    }, [editingGroupIndex, groups]);

    const handleDraftUpdateFromBuilder = useCallback((data: any) => {
        setBuilderDraft(data);
    }, []);

    const handleSaveFromBuilder = useCallback((group: StoneGroup) => {
        handleAddOrUpdateGroup(group);
    }, [handleAddOrUpdateGroup]);

    // Autosave Logic (Update Only)
    useEffect(() => {
        if (!user || !profile?.companyId || !draftId || !isHydrated) return;
        
        const timerId = setTimeout(async () => {
            setAutosaveStatus('saving');
            try {
                console.log("[QUOTE DEBUG] AUTOSAVE updating draftId:", draftId);
                const finalCalc = calculateQuoteTotals(
                    { groups, accessories, services, discount, discountType },
                    installationRateLinear,
                    includeInstallation,
                    manualInstallation
                );

                let effectiveIsPostAutosave = isPostMeasurement;
                let finalStageAutosave = quoteStage || 'pre_orcamento';
                const protectedStagesAutosave = ['aprovado', 'em_contrato', 'em_producao', 'pronto', 'finalizado', 'cancelado'];
                
                if (effectiveIsPostAutosave && !protectedStagesAutosave.includes(finalStageAutosave)) {
                    finalStageAutosave = 'pos_medicao';
                }

                const quoteDataPostCalc: any = {
                    clientId,
                    customerName,
                    customerPhone,
                    customerAddress,
                    sellerId,
                    sellerName,
                    influencerId,
                    influencerName,
                    referralCode,
                    influencerCode: referralCode || '',
                    referralSource: origin === 'Influencer' ? 'influencer' : '',
                    origin,
                    groups,
                    accessories,
                    services,
                    observations,
                    includeInstallation,
                    manualInstallation,
                    operationalCost: finalCalc.operationalCost,
                    linearInstallationTotal: finalCalc.frontaoLinearInstallation,
                    manualInstallationTotal: finalCalc.manualInstallationValue,
                    subtotal: finalCalc.subtotalBruto,
                    discount: finalCalc.discount,
                    discountType,
                    commercialTotal: finalCalc.commercialTotal,
                    totalAmount: finalCalc.total,
                    total: finalCalc.total,
                    status: status || 'draft',
                    companyId: profile.companyId,
                    quoteStage: finalStageAutosave,
                    parentQuoteId,
                    isPostMeasurement: effectiveIsPostAutosave,
                    measurementId: quoteMeasurementId,
                    paymentConditions,
                    updatedAt: serverTimestamp(),
                    lastAutosaveAt: serverTimestamp(),
                    protocolNumber,
                    protocolBaseNumber,
                    protocolYear,
                    version: 2
                };

                // Empty draft handling
                if (isEmptyQuoteDraft(quoteDataPostCalc)) {
                    quoteDataPostCalc.hiddenFromDashboard = true;
                    quoteDataPostCalc.quoteStage = 'draft_zero';
                    finalStageAutosave = 'draft_zero';
                } else {
                    quoteDataPostCalc.hiddenFromDashboard = false;
                    if (finalStageAutosave === 'draft_zero') {
                        finalStageAutosave = 'pre_orcamento';
                        quoteDataPostCalc.quoteStage = 'pre_orcamento';
                    }
                }

                if (viewMode === 'builder' && builderDraft) {
                    quoteDataPostCalc.tempBuilderDraft = builderDraft;
                }

                await updateDoc(doc(db, 'orcamentos', draftId), sanitizeForFirestore(quoteDataPostCalc));
                
                console.log("[QUOTE DEBUG] Autosave successful.");
                setAutosaveStatus('saved');
                setLastAutosaveAt(new Date());

                // Reflect visual badge state immediately
                if (quoteStage !== finalStageAutosave) setQuoteStage(finalStageAutosave);
                if (isPostMeasurement !== effectiveIsPostAutosave) setIsPostMeasurement(effectiveIsPostAutosave);
            } catch (err) {
                console.error("[QUOTE ERROR] Autosave failed:", err);
                setAutosaveStatus('error');
            }
        }, 1500);

        return () => clearTimeout(timerId);
    }, [
        groups, accessories, services, clientId, customerName, sellerId, sellerName,
        discount, discountType, status, observations, includeInstallation, 
        manualInstallation, builderDraft, user, profile, draftId, isEditingExisting, viewMode, installationRateLinear, isHydrated
    ]);

    // Warning for unsaved changes (Browser level: Reload/Close)
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (autosaveStatus === 'saving' || autosaveStatus === 'idle') {
                // If it's idle, it might mean there's a pending change not yet caught by timer
                // But since we trigger on every change, 'idle' might just mean 'waiting for timer'
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [autosaveStatus]);

    // Cleanup states on unmount to prevent navigation locking
    useEffect(() => {
        return () => {
            setGroups([]);
            setAccessories([]);
            setServices([]);
            setClientId('');
            setCustomerName('');
            setCustomerPhone('');
            setCustomerAddress('');
            setSellerId('');
            setSellerName('');
            setDiscount(0);
            setObservations('');
        };
    }, []);


    // Central Calculation Pipeline
    const quoteCalc = calculateQuoteTotals(
        { groups, accessories, services, discount, discountType },
        installationRateLinear,
        includeInstallation,
        manualInstallation
    );
    const totalAmount = quoteCalc.total;

    const handleSaveQuote = async (approveRequested?: boolean, paymentConditionsInput?: PaymentConditions) => {
        if (!user || !profile?.companyId) return;
        
        setSaving(true);
        try {
            const finalCalc = calculateQuoteTotals(
                { groups, accessories, services, discount, discountType },
                installationRateLinear,
                includeInstallation,
                manualInstallation
            );

            // Workflow Integrity Guard: Orçamentos só podem ser 'Aprovados' após Medição (Pós-Medição ou superior)
            const canBeApprovedAtThisStage = quoteStage !== 'pre_orcamento' && quoteStage !== 'aguardando_medicao';
            const approveFinal = (approveRequested || status === 'approved' || (quoteStage as string) === 'aprovado') && canBeApprovedAtThisStage;

            // DETECT CHANGES (Rule #35 Audit Log)
            let auditLogs: string[] = [];
            const previousId = (currentQuoteData as any)?.previousQuoteId;
            const currentVersion = (currentQuoteData as any)?.version || 1;

            if (previousId) {
                console.log("[QUOTE AUDIT] Comparing with previous version for audit log:", previousId);
                const prevSnap = await getDoc(doc(db, 'orcamentos', previousId));
                if (prevSnap.exists()) {
                    const prevData = prevSnap.data() as Quote;
                    const diff = calculateQuoteDiff(prevData, {
                        ...currentQuoteData,
                        groups,
                        accessories,
                        services,
                        commercialTotal: finalCalc.commercialTotal,
                        operationalCost: finalCalc.operationalCost,
                        servicesSubtotal: finalCalc.servicesSubtotal,
                        total: finalCalc.total
                    } as Quote);

                    if (diff.hasChanges) {
                        auditLogs = safeArray(diff.logs).map(log => `[AUDITORIA v${currentVersion-1}->v${currentVersion}] ${log}`);
                    } else if (approveFinal) {
                        auditLogs.push(`[AVISO] Versão v${currentVersion} aprovada sem mudanças materiais em relação à v${currentVersion-1}.`);
                    }
                }
            }

            const isoNow = toISODateSafe(new Date());
            let newHistory = [...safeHistoryArray((currentQuoteData as any)?.history)];
            let approvedSnapshot = (currentQuoteData as any)?.quoteSnapshot || null;
            
            let effectiveIsPost = isPostMeasurement;
            let finalStatus = status || 'draft';
            let finalStage = quoteStage || 'pre_orcamento';
            
            const protectedStages = ['aprovado', 'em_contrato', 'em_producao', 'pronto', 'finalizado', 'cancelado'];
            
            if (effectiveIsPost && !protectedStages.includes(finalStage)) {
                finalStage = 'pos_medicao';
            }

            if (approveFinal) {
                finalStage = 'aprovado';
            }

            let isFrozenUpdate = !!(currentQuoteData as any)?.isFrozen;

            if (approveFinal) {
                const approvedUpdates = await approveQuoteAndFreeze(
                    { 
                        ...currentQuoteData,
                        id: id || draftId, 
                        groups, 
                        accessories, 
                        services, 
                        clientId,
                        customerName,
                        sellerId,
                        discount,
                        discountType,
                        includeInstallation,
                        manualInstallation,
                        observations,
                        paymentConditions: paymentConditionsInput || paymentConditions
                    } as any,
                    safeCompanyData,
                    profile?.name || user?.email || 'Sistema'
                );
                
                approvedSnapshot = approvedUpdates.quoteSnapshot || null;
                finalStatus = approvedUpdates.status || 'approved';
                finalStage = approvedUpdates.quoteStage || 'aprovado';
                isFrozenUpdate = true;
                newHistory = approvedUpdates.history || newHistory;
            }

            if (auditLogs.length > 0) {
                const currentUser = profile?.name || user?.email || 'Sistema';
                auditLogs.forEach(action => {
                    newHistory.push({ date: isoNow, action, user: currentUser });
                });
            }

            const quoteData: any = {
                clientId,
                customerName,
                customerPhone,
                customerAddress,
                sellerId,
                influencerId,
                influencerName,
                referralCode,
                influencerCode: referralCode || '',
                referralSource: origin === 'Influencer' ? 'influencer' : '',
                origin,
                leadOrigin,
                storeVisitId,
                groups,
                accessories,
                services,
                observations,
                includeInstallation,
                manualInstallation,
                operationalCost: finalCalc.operationalCost,
                linearInstallationTotal: finalCalc.frontaoLinearInstallation,
                manualInstallationTotal: finalCalc.manualInstallationValue,
                subtotal: finalCalc.subtotalBruto,
                discount: finalCalc.discount,
                discountType,
                commercialTotal: finalCalc.commercialTotal,
                totalAmount: finalCalc.total,
                 total: finalCalc.total,
                status: finalStatus,
                companyId: profile.companyId,
                quoteStage: finalStage,
                parentQuoteId: parentQuoteId || null,
                previousQuoteId: previousId || null,
                measurementId: quoteMeasurementId,
                version: currentVersion,
                quoteSnapshot: approvedSnapshot,
                isFrozen: isFrozenUpdate,
                isPostMeasurement: effectiveIsPost,
                protocolNumber,
                protocolBaseNumber,
                protocolYear,
                history: newHistory,
                updatedAt: isoNow
            };

            if (isEmptyQuoteDraft(quoteData)) {
                quoteData.hiddenFromDashboard = true;
                quoteData.quoteStage = 'draft_zero';
                finalStage = 'draft_zero';
            } else {
                quoteData.hiddenFromDashboard = false;
                if (finalStage === 'draft_zero') {
                    finalStage = 'pre_orcamento';
                    quoteData.quoteStage = 'pre_orcamento';
                }
            }

            console.log('[WORKFLOW GUARD] status:', quoteData.status, 'stage:', quoteData.quoteStage, 'requestedApprove:', approveRequested);
            console.log('[QUOTE CREATE STATUS] Persisting to Firestore:', quoteData.status);

            const finalId = id || draftId;
            let savedDocId = finalId;
            if (finalId) {
                console.log("[QUOTE DEBUG] FINAL SAVE: Updating existing document:", finalId);
                await updateDoc(doc(db, 'orcamentos', finalId), sanitizeForFirestore(quoteData));
            } else {
                 console.log("[QUOTE DEBUG] FINAL SAVE: Creating new document (safety fallback)");
                 const docRef = await addDoc(collection(db, 'orcamentos'), sanitizeForFirestore({
                    ...quoteData,
                    userId: user.uid,
                    createdAt: isoNow
                }));
                savedDocId = docRef.id;
            }

            if (approveFinal && influencerId && savedDocId) {
                try {
                    await trackInfluencerClosure({
                        type: 'quote',
                        id: savedDocId,
                        companyId: profile.companyId
                    });
                } catch (err) {
                    console.error("Error tracking influencer closure:", err);
                }
            }

            if (storeVisitId && savedDocId) {
                try {
                    await updateDoc(doc(db, 'store_visits', storeVisitId), {
                        status: 'convertida_em_orcamento',
                        quoteId: savedDocId,
                        convertedAt: isoNow,
                        convertedBy: profile?.name || user?.email || 'Sistema'
                    });
                } catch (err) {
                    console.error("Error updating store_visit:", err);
                }
            }

            // Automate Referral Status: orcamento
            if (clientId) {
                await updateDoc(doc(db, 'clients', clientId), { referralStatus: 'orcamento' });
            }

            // Sincronizar estado local com os dados salvos para garantir consistência no Wizard/UI
            setStatus(finalStatus);
            setQuoteStage(finalStage);
            setIsFrozen(isFrozenUpdate);
            setQuoteSnapshot(approvedSnapshot);
            setPaymentConditions(paymentConditionsInput || paymentConditions);
            setCurrentQuoteData(prev => prev ? { ...prev, ...quoteData } : null);
            
            console.log("[QUOTE DEBUG] Final Save Successful. Cleaning session.");
            sessionStorage.removeItem('currentNewDraftId');
            
            // Orquestração de fluxo: Se for aprovação, segue para o contrato/wizard. Se for apenas salvar, volta para a lista.
            if (approveRequested) {
                console.log("[QUOTE FLOW] Approval requested. Opening Wizard or Navigating to Contract.");
                const existingOrderId = (currentQuoteData as any)?.convertedToContractId;
                if (existingOrderId) {
                    navigate(`/order/${existingOrderId}/contract`);
                } else {
                    setIsConversionWizardOpen(true);
                }
            } else {
                console.log("[QUOTE FLOW] Save draft requested. Navigating back to list.");
                navigate('/orcamentos');
            }
        } catch (error) {
            console.error("[QUOTE ERROR] Final save failed:", error);
            alert("Erro ao salvar orçamento. Tente novamente.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="w-12 h-12 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full space-y-4">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-transparent border-b border-slate-200 dark:border-slate-800 pb-5 mb-2">
                <div className="flex items-center gap-5">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => navigate('/orcamentos')}
                        className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow transition-all"
                    >
                        <ArrowLeft className="h-4.5 w-4.5 text-slate-400 group-hover:text-slate-900 transition-colors" />
                    </Button>
                    <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-emerald opacity-60">PROCESSO DE ORÇAMENTO</span>
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none flex items-center gap-3">
                            {protocolNumber ? protocolNumber : (id || draftId ? 'Editar Orçamento' : 'Novo Orçamento')}
                            {!canEditQuote(currentQuoteData) && currentQuoteData && (
                                <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-500 text-[10px] font-black uppercase tracking-widest rounded-full border border-amber-100 dark:border-amber-500/20 shadow-sm animate-in fade-in slide-in-from-left-2 duration-500">
                                    <Lock className="w-3 h-3" />
                                    Orçamento Congelado
                                </span>
                            )}
                        </h2>
                        {(quoteStage === 'pos_medicao' || isPostMeasurement) && (
                            <span className="inline-block mt-1 bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-amber-200">
                                Pós-Medição
                            </span>
                        )}
                        <div className="flex items-center gap-3 mt-1">
                            <p className="text-[13px] font-medium text-slate-400 dark:text-slate-500">
                                {viewMode === 'review' ? 'Revise os ambientes e finalize a proposta comercial.' : 'Configure as medidas e peças do novo ambiente.'}
                            </p>
                            
                            {/* Manual Post-Measurement Toggle removido conforme regra: não deve ter mudança de etapa dentro da edição */}
                            
                            {/* Autosave Status Indicator */}
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                {autosaveStatus === 'saving' && (
                                    <>
                                        <Loader2 className="w-3 h-3 text-brand-emerald animate-spin" />
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Salvando...</span>
                                    </>
                                )}
                                {autosaveStatus === 'saved' && (
                                    <>
                                        <CheckCircle2 className="w-3 h-3 text-brand-emerald" />
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Salvo {lastAutosaveAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </>
                                )}
                                {autosaveStatus === 'error' && (
                                    <>
                                        <AlertCircle className="w-3 h-3 text-rose-500" />
                                        <span className="text-[10px] font-bold text-rose-500 uppercase tracking-tight">Erro</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {(() => {
                    const currentQuoteForLogic = {
                        ...currentQuoteData,
                        id: id || draftId,
                        status,
                        quoteStage,
                        isPostMeasurement,
                        groups,
                        accessories,
                        services,
                        discount,
                        totalAmount,
                        paymentConditions,
                        convertedToContractId: currentQuoteData?.convertedToContractId
                    } as Quote;

                    const stage = getEffectiveWorkflowStage(currentQuoteForLogic);
                    const isEditable = !['aprovado', 'em_contrato', 'em_producao', 'finalizado', 'cancelado'].includes(stage);
                    const { can: canGenerateOrder } = canGenerateContract(currentQuoteForLogic);
                    const alreadyConverted = !!currentQuoteData?.convertedToContractId;
                    
                    return viewMode === 'review' && (
                        <div className="flex items-center gap-3">


                            {isEditable ? (
                                <Button 
                                    onClick={() => {
                                        setEditingGroupIndex(null);
                                        setViewMode('builder');
                                    }} 
                                    className="bg-slate-900 hover:bg-black dark:bg-white dark:text-slate-900 border-none rounded-xl h-11 px-8 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-slate-200 dark:shadow-none"
                                >
                                    <Plus className="mr-2 h-4 w-4" /> Novo Ambiente
                                </Button>
                            ) : (
                                <Button 
                                    onClick={() => setIsRevisionModalOpen(true)}
                                    className="bg-amber-500 hover:bg-amber-600 text-white border-none rounded-xl h-11 px-8 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-amber-200 ml-auto flex items-center gap-2"
                                >
                                    <RefreshCw className="w-4 h-4" /> Editar Orçamento
                                </Button>
                            )}
                        </div>
                    );
                })()}
            </header>

            <section className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 shrink-0 flex flex-col sm:flex-row gap-6">
                {/* Cliente */}
                <div className="flex-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Cliente / Obra</label>
                    {isEditingExisting || location.state?.preselectedClientId || searchParams.get('clientId') ? (
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{customerName || 'Cliente sem nome'}</p>
                                {customerPhone && <p className="text-xs text-slate-500">{customerPhone}</p>}
                            </div>
                            {isEditingExisting && (profile?.role === 'admin' || profile?.role === 'company_admin' || profile?.role === 'superadmin') && (
                                <Button variant="ghost" size="sm" onClick={() => setIsSwapClientModalOpen(true)} className="text-[10px] uppercase tracking-wider">
                                    Trocar Cliente
                                </Button>
                            )}
                        </div>
                    ) : (
                        <SearchableSelect
                            options={clients.map(c => {
                                const displayInfo = getClientDisplayInfo(c);
                                return {
                                    value: c.id,
                                    label: displayInfo.name,
                                    description: displayInfo.formattedPhone,
                                    subDescription: displayInfo.addressLabel,
                                    searchValue: displayInfo.searchText
                                };
                            })}
                            value={clientId}
                            onSearchChange={setClientSearchTerm}
                            onChange={(val) => {
                                clientSelectedLocallyRef.current = true;
                                setClientId(val);
                                const customer = clients.find(c => c.id === val);
                                if (customer) {
                                    setCustomerName(customer.name);
                                    setCustomerPhone(customer.phone || '');
                                    setCustomerAddress(customer.address || customer.street || '');
                                    setInfluencerId(customer.influencerId || '');
                                    setInfluencerName(customer.influencerName || '');
                                } else {
                                    setCustomerName('');
                                    setCustomerPhone('');
                                    setCustomerAddress('');
                                    setInfluencerId('');
                                    setInfluencerName('');
                                }
                            }}
                            placeholder="Buscar cliente..."
                        />
                    )}
                </div>

                {/* Vendedor */}
                <div className="flex-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Vendedor Responsável</label>
                    {isEditingExisting ? (
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{sellerName || sellerId || 'Nenhum'}</p>
                            </div>
                        </div>
                    ) : (
                        <SearchableSelect
                            options={[
                                { value: 'Administrador', label: 'Administrador (Padrão)' },
                                ...staff.filter(s => s.role === 'vendedor' || s.role === 'seller' || s.role === 'admin' || s.role === 'company_admin' || s.role === 'superadmin').map(s => ({
                                    value: s.id,
                                    label: s.name,
                                    subLabel: s.email
                                }))
                            ]}
                            value={sellerId}
                            onChange={(val) => {
                                setSellerId(val);
                                if (val === 'Administrador') {
                                    setSellerName('Administrador');
                                } else {
                                    const seller = staff.find(s => s.id === val);
                                    if (seller) setSellerName(seller.name);
                                }
                            }}
                            placeholder="Selecione o vendedor..."
                            disabled={!(profile?.role === 'admin' || profile?.role === 'company_admin' || profile?.role === 'superadmin')}
                        />
                    )}
                </div>
            </section>

            <div className="flex-1 overflow-hidden bg-white dark:bg-slate-900 rounded-2xl shadow-premium border border-slate-200 dark:border-slate-800">
                {(() => {
                    const stage = getEffectiveWorkflowStage({ status, quoteStage } as Quote);
                    const isLockedFromEditing = ['aprovado', 'em_contrato', 'em_producao', 'finalizado'].includes(stage);
                    const isEditingInBuilder = viewMode === 'builder';
                    
                    if (isLockedFromEditing && isEditingInBuilder) {
                        return (
                            <div className="flex flex-col items-center justify-center p-12 text-center h-full">
                                <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-2xl flex items-center justify-center mb-4">
                                    <span className="text-3xl">🔒</span>
                                </div>
                                <h3 className="text-lg font-black uppercase text-slate-800 dark:text-slate-200 tracking-tight mb-2">Orçamento Congelado</h3>
                                <p className="text-slate-500 font-bold max-w-sm">Este orçamento foi aprovado e suas métricas estão congeladas aguardando os próximos passos do ciclo comercial.</p>
                                <Button 
                                    className="mt-6 font-bold uppercase tracking-widest text-[10px] bg-slate-900 hover:bg-black" 
                                    onClick={() => setViewMode('review')}
                                >
                                    Voltar para Resumo Completo
                                </Button>
                            </div>
                        );
                    }
                    
                    return null;
                })() || (viewMode === 'builder' ? (
                    <QuoteBuilder 
                        initialData={editingGroupIndex !== null ? groups[editingGroupIndex] : undefined}
                        installationRateLinear={installationRateLinear}
                        onDraftUpdate={handleDraftUpdateFromBuilder}
                        onSave={handleSaveFromBuilder}
                        onCancel={() => {
                            if (groups.length > 0) setViewMode('review');
                            else {
                                console.log("[QUOTE DEBUG] User cancelled new quote. Removing draft ID from session.");
                                sessionStorage.removeItem('currentNewDraftId');
                                navigate('/orcamentos');
                            }
                        }}
                    />
                ) : (
                    <QuoteReview 
                        autoDownload={autoDownload}
                        groups={groups}
                        accessories={accessories}
                        services={services}
                        operationalCost={quoteCalc.operationalCost}
                        discount={discount}
                        calculatedData={quoteCalc}
                        isFrozen={!canEditQuote({ status, quoteStage } as Quote)}
                        quoteSnapshot={quoteSnapshot || undefined}
                        customerName={customerName}
                        customerPhone={customerPhone}
                        customerAddress={customerAddress}
                        sellerName={sellerName}
                        observations={observations}
                        paymentConditions={paymentConditions}
                        quoteStage={quoteStage}
                        status={status}
                        onEditGroup={(index: number) => {

                            setEditingGroupIndex(index);
                            setViewMode('builder');
                        }}
                        onRemoveGroup={(index: number) => setGroups(prev => safeArray(prev).filter((_, i) => i !== index))}
                        onUpdateGroups={setGroups}
                        onUpdateAccessories={setAccessories}
                        onUpdateServices={setServices}
                        onUpdateDiscount={setDiscount}
                        onUpdateObservations={setObservations}
                        
                        includeInstallation={includeInstallation}
                        onUpdateIncludeInstallation={setIncludeInstallation}
                        manualInstallation={manualInstallation}
                        onUpdateManualInstallation={setManualInstallation}

                        onReviseApprovedQuote={async (reason: string) => {
                            if (currentQuoteData && handleReviseApprovedQuote) {
                                const newId = await handleReviseApprovedQuote(currentQuoteData, reason);
                                if (newId) {
                                    navigate(`/orcamentos/${newId}/editar`);
                                }
                            }
                        }}
                        history={currentQuoteData?.history}

                        onSave={async (approve?: boolean, pc?: PaymentConditions) => {
                            await handleSaveQuote(approve === true, pc);
                        }}
                        onUpdatePaymentConditions={setPaymentConditions}
                        onOpenRevisionModal={() => setIsRevisionModalOpen(true)}
                        isLoading={saving}
                        isPostMeasurement={isPostMeasurement}
                        protocolNumber={protocolNumber || undefined}
                    />
                ))}
            </div>

            {/* Production Conversion Wizard Overlay */}
            {isConversionWizardOpen && (
                <div className="fixed inset-0 z-[100] p-4 md:p-8 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300">
                    <div className="relative w-full h-full max-w-6xl shadow-2xl rounded-2xl overflow-hidden">
                        <ProductionConversionWizard 
                            quoteRef={{
                                ...currentQuoteData,
                                id: id || draftId,
                                status,
                                quoteStage,
                                isPostMeasurement,
                                groups,
                                accessories,
                                services,
                                discount,
                                totalAmount,
                                paymentConditions,
                                convertedToContractId: currentQuoteData?.convertedToContractId
                            } as Quote}
                            onClose={() => setIsConversionWizardOpen(false)}
                            onSuccess={(contractId) => {
                                setIsConversionWizardOpen(false);
                                // REGRA DE NEGÓCIO: No fluxo Contrato-Primeiro, sempre levamos ao contrato após a conversão,
                                // pois a OS só será liberada após a assinatura do cliente.
                                navigate(`/order/${contractId}/contract`);
                            }}
                        />
                    </div>
                </div>
            )}
            {/* Revision Modal (Rule #35) */}
            {isRevisionModalOpen && (
                <Modal 
                    isOpen={isRevisionModalOpen} 
                    onClose={() => setIsRevisionModalOpen(false)} 
                    title="Revisar Orçamento Aprovado" 
                    className="max-w-md"
                >
                    <div className="space-y-4 py-4">
                        <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-xl">
                            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Info className="w-4 h-4" /> Informação Importante
                            </p>
                            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                                Este orçamento está aprovado e congelado. Para fazer alterações, criaremos uma **Nova Versão** (v{((currentQuoteData as any)?.version || 1) + 1}). O orçamento atual permanecerá no histórico como versão anterior.
                            </p>
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest px-1">Motivo da Revisão</label>
                            <textarea 
                                value={revisionReason}
                                onChange={e => setRevisionReason(e.target.value)}
                                placeholder="Descreva brevemente o que será alterado (ex: Mudança de material, ajuste de medidas...)"
                                className="w-full h-24 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none transition-all"
                            />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <Button 
                                variant="outline" 
                                className="flex-1 h-12 rounded-xl font-bold" 
                                onClick={() => setIsRevisionModalOpen(false)}
                                disabled={isRevising}
                            >
                                Cancelar
                            </Button>
                            <Button 
                                className="flex-1 h-12 rounded-xl font-black uppercase tracking-widest bg-slate-900 text-white dark:bg-brand-emerald"
                                onClick={async () => {
                                    if (!(revisionReason || '').trim()) {
                                        alert("Por favor, informe o motivo da revisão.");
                                        return;
                                    }
                                    setIsRevising(true);
                                    try {
                                        if (currentQuoteData && handleReviseApprovedQuote) {
                                            const newId = await handleReviseApprovedQuote(currentQuoteData, revisionReason);
                                            if (newId) {
                                                setIsRevisionModalOpen(false);
                                                navigate(`/orcamentos/${newId}/editar`);
                                            }
                                        }
                                    } catch (err) {
                                        console.error(err);
                                        alert("Erro ao gerar revisão.");
                                    } finally {
                                        setIsRevising(false);
                                    }
                                }}
                                disabled={isRevising}
                            >
                                {isRevising ? "Gerando..." : "Criar Nova Versão"}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
            {/* Modal Trocar Cliente Administrativo */}
            {isSwapClientModalOpen && (
                <Modal 
                    isOpen={isSwapClientModalOpen} 
                    onClose={() => {
                        setIsSwapClientModalOpen(false);
                        setSwapNewClientId('');
                    }} 
                    title="Trocar Cliente (Admin)" 
                    className="max-w-md"
                >
                    <div className="space-y-4 py-4">
                        <div className="p-4 bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/20 rounded-xl">
                            <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" /> Atenção: Mudança de Vínculo
                            </p>
                            <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed font-medium">
                                A troca de cliente altera o vínculo principal deste orçamento.
                            </p>
                            {(currentQuoteData?.measurementId || currentQuoteData?.convertedToContractId || currentQuoteData?.orderId) && (
                                <p className="mt-2 text-xs text-rose-700 dark:text-rose-400 font-bold p-2 bg-white/50 dark:bg-black/20 rounded-lg">
                                    ⚠️ Este orçamento já possui vínculos com medição, contrato ou O.S. A troca de cliente pode afetar o histórico.
                                </p>
                            )}
                            <p className="mt-3 text-xs text-rose-800 dark:text-rose-300 font-black">
                                Deseja continuar?
                            </p>
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest px-1">Novo Cliente</label>
                            <SearchableSelect 
                                value={swapNewClientId}
                                options={safeArray(clients).map(c => {
                                    const displayInfo = getClientDisplayInfo(c);
                                    return {
                                        value: c.id,
                                        label: displayInfo.name,
                                        description: displayInfo.formattedPhone,
                                        subDescription: displayInfo.addressLabel,
                                        searchValue: displayInfo.searchText
                                    };
                                })}
                                onSearchChange={setClientSearchTerm}
                                onChange={setSwapNewClientId}
                                placeholder="Selecione o novo cliente..."
                            />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <Button 
                                variant="outline" 
                                className="flex-1 h-12 rounded-xl font-bold" 
                                onClick={() => {
                                    setIsSwapClientModalOpen(false);
                                    setSwapNewClientId('');
                                }}
                                disabled={isSwappingClient}
                            >
                                Cancelar
                            </Button>
                            <Button 
                                className="flex-1 h-12 rounded-xl font-black uppercase tracking-widest bg-rose-600 hover:bg-rose-700 text-white"
                                onClick={async () => {
                                    if (!swapNewClientId) return alert("Selecione um cliente válido.");
                                    setIsSwappingClient(true);
                                    try {
                                        const clientSnap = await getDoc(doc(db, 'clients', swapNewClientId));
                                        if (clientSnap.exists()) {
                                            const newClient = clientSnap.data();
                                            // 1. Log Integrity Event
                                            await logIntegrityEvent({
                                                quoteId: id as string,
                                                clientName: customerName || 'N/A',
                                                version: (currentQuoteData as any)?.version || 1,
                                                timestamp: toISODateSafe(new Date())!,
                                                type: 'ADMIN_CLIENT_SWAP',
                                                severity: 'warning',
                                                details: `Troca de cliente via painel Admin. Antigo: ${clientId} (${customerName}). Novo: ${swapNewClientId} (${newClient.name})`,
                                                triggeredBy: user.email || 'Admin'
                                            });
                                            
                                            // 2. Update state memory so save works properly
                                            setOriginalClientId(swapNewClientId);
                                            setOriginalClientName(newClient.name || '');
                                            setOriginalClientPhone(newClient.phone || '');
                                            setOriginalClientSnapshot(newClient);
                                            
                                            setClientId(swapNewClientId);
                                            setCustomerName(newClient.name || '');
                                            setCustomerPhone(newClient.phone || '');
                                            setCustomerAddress(newClient.address || newClient.street || '');
                                            
                                            // 3. Immediately save doc
                                            await updateDoc(doc(db, 'orcamentos', id!), {
                                                clientId: swapNewClientId,
                                                customerName: newClient.name || '',
                                                customerPhone: newClient.phone || '',
                                                customerAddress: newClient.address || newClient.street || '',
                                                clientSnapshot: newClient,
                                                updatedAt: serverTimestamp()
                                            });
                                            
                                            alert("Cliente trocado com sucesso.");
                                            setIsSwapClientModalOpen(false);
                                        }
                                    } catch (err) {
                                        console.error(err);
                                        alert("Erro ao trocar cliente.");
                                    } finally {
                                        setIsSwappingClient(false);
                                    }
                                }}
                                disabled={isSwappingClient || !swapNewClientId}
                            >
                                {isSwappingClient ? "Trocando..." : "Confirmar Troca"}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};
