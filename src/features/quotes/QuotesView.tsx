import { safeArray } from '../../lib/dataDiagnostics';
import { exportToMetaExcel } from '../../lib/exportUtils';
import { safeParseISO, formatVisualDate, toISODateSafe, compareDatesSafe } from '../../lib/dateUtils';
import React, { useState, useMemo } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { 
    FileEdit, 
    Trash2, 
    X, 
    Ruler, 
    ShoppingCart, 
    TrendingUp,
    TrendingDown,
    Phone,
    MapPin,
    Target,
    Trophy,
    Flame,
    Zap,
    UserCircle2,
    BarChart3,
    Filter,
    AlertCircle,
    ListFilter,
    History,
    Download,
    Copy,
    CheckSquare,
    CheckCircle2,
    Package,
    ShieldAlert,
    GanttChartSquare,
    MessageSquare,
    Save
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
    format, 
    isAfter,
    differenceInDays, 
    subDays,
    startOfMonth,
    endOfMonth,
    isWithinInterval, 
    startOfDay, 
    endOfDay
} from 'date-fns';
import { safeSplit, safeHistoryArray } from '../../lib/dataDiagnostics';

import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/Tabs';
import { cn } from '../../lib/utils';
import type { Quote, Order, Measurement } from '../../types';
import { LayoutSelectorModal } from './LayoutSelectorModal';
import { useAuth } from '../../context/AuthContext';
import { serverTimestamp } from 'firebase/firestore';
import html2canvas from 'html2canvas';
import { StoreVisitFormModal } from '../store-visits/StoreVisitFormModal';
import type { StoreVisit } from '../../types';
import jsPDF from 'jspdf';
import { QuotePrintTemplate } from './QuotePrintTemplate';
import { generateQuoteSnapshot, calculateQuoteTotals, formatQuoteCreatedDateTime, isEmptyQuoteDraft } from '../../utils/quoteCalculations';
import { useCompanyData } from '../../hooks/useCompanyData';
import { DateRangePicker } from '../../components/ui/DateRangePicker';
import { Modal } from '../../components/ui/Modal';
import { HighlightText, calculateSearchScore, normalizeStr, normalizeSearchText, normalizePhoneSearch } from '../../lib/searchUtils';
import { ModuleSearchInput } from '../../components/ui/ModuleSearchInput';
import { WorkflowBadge, WorkflowTimeline, NextStepCard, WORKFLOW_CONFIG, getEffectiveWorkflowStage, approveQuoteAndFreeze, canEditQuote, canStartContract, type WorkflowStage } from '../../components/workflow/WorkflowStatus';
import { DeleteQuoteModal } from './DeleteQuoteModal';
import { getQuoteAlertStatus } from '../../utils/quoteAlerts';
import { trackInfluencerClosure } from '../../lib/influencerTracker';

interface QuotesViewProps {
    quotes: Quote[];
    orders: Order[];
    measurements?: Measurement[];
    contracts?: any[];
    isLoading: boolean;
    onEdit: (quote: Quote) => void;
    onDownload: (quote: Quote) => void;
    onDelete: (id: string, reason: string, category: string) => void;
    onUpdateQuote: (id: string, updates: Partial<Quote>) => void;
    onDuplicate: (quote: Quote, isNewVersion?: boolean) => void;
    onConvertToMeasurement: (quote: Quote) => void;
    onDirectSale: (quote: Quote) => void;
}


export const QuotesView: React.FC<QuotesViewProps> = ({
    quotes,
    orders = [],
    measurements = [],
    contracts = [],
    isLoading,
    onEdit = () => {},
    onDelete,
    onUpdateQuote,
    onDuplicate,
    onConvertToMeasurement,
    onDirectSale
}) => {
    const { isFocusMode } = useOutletContext<any>() || {};
    const [searchParams, setSearchParams] = useSearchParams();
    const filterFromUrl = searchParams.get('filter');
    
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const navigate = useNavigate();

    // Vendedores State
    const [rankingPeriod, setRankingPeriod] = useState<'today' | '7d' | '30d' | 'month' | 'custom'>('30d');
    const [rankingSortBy, setRankingSortBy] = useState<'score' | 'totalSold' | 'salesCount' | 'quotesCount' | 'measurementsCount' | 'conversion'>('score');
    const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
    const [isSellerDrawerOpen, setIsSellerDrawerOpen] = useState(false);
    const [rankStartDate, setRankStartDate] = useState('');
    const [rankEndDate, setRankEndDate] = useState('');
    
    // CRM Search & Filters
    const [quoteSearchText, setQuoteSearchText] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>(filterFromUrl === 'stalled' ? 'all' : 'all');
    const [urgentMode, setUrgentMode] = useState(filterFromUrl === 'stalled');
    const [selectedBulkQuotes, setSelectedBulkQuotes] = useState<string[]>([]);
    
    // UI Effects
    const [flashRowId, setFlashRowId] = useState<string | null>(null);
    const [showWelcomeModal, setShowWelcomeModal] = useState<boolean>(false);
    const { user, profile } = useAuth();
    
    // Store Visit State
    const [isStoreVisitModalOpen, setIsStoreVisitModalOpen] = useState(false);
    const [storeVisitPrefill, setStoreVisitPrefill] = useState<Partial<StoreVisit> | null>(null);

    const handleOpenStoreVisitModal = (quote: Quote) => {
        setStoreVisitPrefill({
            clientId: quote.clientId,
            clientName: quote.customerName,
            clientPhone: quote.customerPhone,
            sellerId: quote.sellerId,
            sellerName: quote.sellerName || profile?.name || '',
            sellerEmail: profile?.email || '',
            quoteId: quote.id,
            quoteProtocol: quote.protocolNumber || '',
            quoteTotal: quote.total || 0,
            leadOrigin: 'Orçamento',
            origin: 'Orçamento',
            sourceType: 'quote',
            sourceId: quote.id,
        });
        setIsStoreVisitModalOpen(true);
    };

    // Governance Note: Role-based permissions are now informational for analytics oversight.

    const handleAdvanceToPostMeasurementManual = async (quote: Quote) => {
        if (!window.confirm("Este orçamento será avançado para Pós-medição sem uma medição técnica agendada. Deseja continuar?")) {
            return;
        }

        const isoNow = new Date().toISOString();
        const updates = {
            status: "pos_medicao" as any,
            workflowStatus: "pos_medicao" as any,
            quoteStage: "pos_medicao" as any,
            isPostMeasurement: true,
            postMeasurementMode: "manual",
            postMeasurementReason: "Sem medição técnica agendada",
            postMeasurementAt: serverTimestamp(),
            postMeasurementBy: user?.uid || "",
            protocolNumber: (quote.protocolBaseNumber && quote.protocolYear) 
                ? `POS-${quote.protocolYear}-${String(quote.protocolBaseNumber).padStart(6, '0')}` 
                : quote.protocolNumber,
            history: [
                ...safeHistoryArray(quote.history),
                {
                    date: isoNow,
                    action: "Orçamento avançado manualmente para Pós-medição sem medição técnica agendada.",
                    user: user?.displayName || user?.email || "Sistema"
                },
                {
                    id: `status_change_${Date.now()}`,
                    type: "status_change",
                    from: quote.status || "pre_orcamento",
                    to: "pos_medicao",
                    label: "Convertido para Pós-Medição",
                    createdAt: isoNow,
                    createdBy: user?.uid,
                    createdByName: profile?.name || user?.email || "Sistema"
                }
            ],
            updatedAt: isoNow
        };

        try {
            await onUpdateQuote(quote.id, updates);
            if (selectedQuote && selectedQuote.id === quote.id) {
                setSelectedQuote({ 
                    ...selectedQuote, 
                    ...updates,
                    postMeasurementAt: isoNow
                });
            }
        } catch (error) {
            console.error("Erro ao avançar orçamento para pós-medição:", error);
            alert("Erro ao avançar orçamento para pós-medição.");
        }
    };
    
    React.useEffect(() => {
        if (!user) return;
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const storageKey = `commercialAlertLastSeen_${user.uid}`;
        const lastSeen = localStorage.getItem(storageKey);
        if (lastSeen !== todayStr) {
            setShowWelcomeModal(true);
            localStorage.setItem(storageKey, todayStr);
        }
    }, [user]);

    // Handle contract modal from URL params
    React.useEffect(() => {
        const contractModal = searchParams.get('contractModal');
        const paramQuoteId = searchParams.get('quoteId');
        
        if (contractModal === 'true' && paramQuoteId && quotes && quotes.length > 0) {
            const quoteToContract = quotes.find(q => q.id === paramQuoteId);
            if (quoteToContract && onDirectSale) {
                // Clear the parameters to avoid reopening on refresh
                setSearchParams((prev) => {
                    const params = new URLSearchParams(prev);
                    params.delete('contractModal');
                    params.delete('quoteId');
                    return params;
                }, { replace: true });
                
                // Slight timeout to ensure UI is ready
                setTimeout(() => {
                    onDirectSale(quoteToContract);
                }, 300);
            }
        }
    }, [searchParams, quotes, onDirectSale, setSearchParams]);
    
    // CRM Drafts
    const [draftStatus, setDraftStatus] = useState<Quote['status']>('draft');
    const [draftStage, setDraftStage] = useState<string>('pre_orcamento');
    const [draftNextAction, setDraftNextAction] = useState('');

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [quoteToDelete, setQuoteToDelete] = useState<Quote | null>(null);

    const handleDeleteClick = (quote: Quote) => {
        setQuoteToDelete(quote);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = (reason: string, category: string) => {
        if (quoteToDelete) {
            onDelete(quoteToDelete.id, reason, category);
            setIsDeleteModalOpen(false);
            setQuoteToDelete(null);
            setIsDrawerOpen(false);
        }
    };
    
    const { companyData } = useCompanyData();
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [isLayoutModalOpen, setIsLayoutModalOpen] = useState(false);
    const [layoutOverrideForPdf, setLayoutOverrideForPdf] = useState<'classic' | 'commercial' | 'premium' | null>(null);
    const [pendingDownloadId, setPendingDownloadId] = useState<string | null>(null);
    const printRef = React.useRef<HTMLDivElement>(null);
    const activeQuoteForPdf = useMemo(() => quotes.find(q => q.id === downloadingId), [quotes, downloadingId]);

    React.useEffect(() => {
        if (downloadingId && activeQuoteForPdf && printRef.current) {
            const timer = setTimeout(async () => {
                try {
                    const element = printRef.current;
                    if (!element) return;

                    const canvas = await html2canvas(element, {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: '#ffffff',
                        logging: true,
                        scrollY: -window.scrollY,
                        windowWidth: element.scrollWidth,
                        windowHeight: element.scrollHeight,
                        width: element.scrollWidth,
                        height: element.scrollHeight
                    });

                    console.log("[DEBUG PDF LIST] Canvas Height:", canvas.height);

                    const imgData = canvas.toDataURL('image/png');
                    const format = 'PNG';
                    
                    const pdf = new jsPDF('p', 'mm', 'a4');
                    const pageWidth = pdf.internal.pageSize.getWidth();
                    const pageHeight = pdf.internal.pageSize.getHeight();
                    const imgWidth = pageWidth;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;
                    
                    let heightLeft = imgHeight;
                    let position = 0;

                    // Primeira página
                    pdf.addImage(imgData, format, 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;

                    // Páginas subsequentes
                    let pageCount = 1;
                    while (heightLeft > 0) {
                        position = -(pageHeight * pageCount);
                        pdf.addPage();
                        pdf.addImage(imgData, format, 0, position, imgWidth, imgHeight);
                        heightLeft -= pageHeight;
                        pageCount++;
                    }

                    console.log("[DEBUG PDF LIST] Total Pages:", pageCount);

                    const isPostPDF = activeQuoteForPdf.isPostMeasurement === true || activeQuoteForPdf.quoteStage === 'pos_medicao';
                    const suffixPDF = isPostPDF ? '_Pos-Medicao' : '';
                    const safeName = (activeQuoteForPdf.customerName || 'Cliente')
                        .trim()
                        .replace(/[^\w\sà-üÀ-Ü]/g, '')
                        .replace(/\s+/g, '_');
                    pdf.save(`Proposta_Comercial_${safeName}${suffixPDF}.pdf`);
                } catch (err) {
                    console.error("Erro ao exportar PDF:", err);
                    alert("Não foi possível gerar o PDF. Tente novamente.");
                } finally {
                    setDownloadingId(null);
                }
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [downloadingId, activeQuoteForPdf]);
    
    React.useEffect(() => {
        if (selectedQuote) {
            setDraftStatus(selectedQuote.status);
            setDraftStage(getEffectiveWorkflowStage(selectedQuote));
            setDraftNextAction(selectedQuote.nextAction || '');
        }
    }, [selectedQuote]);

    const handleSelectLayout = (layout: 'classic' | 'commercial' | 'premium') => {
        setLayoutOverrideForPdf(layout);
        setIsLayoutModalOpen(false);
        if (pendingDownloadId) {
            setDownloadingId(pendingDownloadId);
            setPendingDownloadId(null);
        }
    };

    const openLayoutSelector = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setPendingDownloadId(id);
        setIsLayoutModalOpen(true);
    };

    // helper for temporal filtering
    // HELPER: Normalizar Status
    const normalizeStatus = (status: any) => {
        if (!status || typeof status !== 'string') return '';
        return status.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
            .replace(/[-\s]+/g, '_'); // troca espaços e hífens por underline
    };

    // HELPER: Identificar Vendedor
    const getSellerIdentity = (record: any) => {
        if (!record) return { id: '', name: 'Sem vendedor atribuído' };
        
        // Prioridade de identificação
        let sellerId = record.sellerId || record.vendedorId || record.assignedSellerId || record.salesPersonId || record.consultantId;
        let sellerName = record.sellerName || record.vendedorNome || record.assignedSellerName || record.salesPersonName || record.consultantName;
        
        // Fallback para quem criou (se não houver um vendedor específico setado)
        if (!sellerId && !sellerName) {
            // Regra anti-admin: Se for administrador mas não tem vendedor claro, assumimos sem vendedor,
            if (record.createdBy || record.createdByName || record.userId || record.userName) {
                const fallbackName = record.createdByName || record.userName || 'Desconhecido';
                const fallbackId = record.createdBy || record.userId || '';
                if (fallbackName.toLowerCase().includes('administrador') || fallbackName.toLowerCase() === 'admin') {
                    return { id: '', name: 'Sem vendedor atribuído' };
                }
                sellerId = fallbackId;
                sellerName = fallbackName;
            }
        }
        
        if (!sellerName && !sellerId) {
            return { id: '', name: 'Sem vendedor atribuído' };
        }
        
        return { 
            id: String(sellerId || ''), 
            name: String(sellerName || 'Sem vendedor atribuído') 
        };
    };

    // helper for temporal filtering
    const filterByPeriod = (itemDateStr: string | undefined | null) => {
        if (!itemDateStr) return false;
        try {
            const date = safeParseISO(itemDateStr);
            if (!date) return false;
            
            const now = new Date();

            if (rankingPeriod === 'today') {
                return isWithinInterval(date, { start: startOfDay(now), end: endOfDay(now) });
            }
            if (rankingPeriod === '7d') {
                return isAfter(date, subDays(now, 7));
            }
            if (rankingPeriod === '30d') {
                return isAfter(date, subDays(now, 30));
            }
            if (rankingPeriod === 'month') {
                const tz = 'America/Sao_Paulo';
                const nowStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); 
                const [year, month] = nowStr.split('-');
                
                const startStr = `${year}-${month}-01T00:00:00.000-03:00`;
                const d = new Date(`${year}-${month}-01T12:00:00Z`);
                d.setUTCMonth(d.getUTCMonth() + 1);
                d.setUTCDate(0);
                const lastDay = d.getUTCDate().toString().padStart(2, '0');
                const endStr = `${year}-${month}-${lastDay}T23:59:59.999-03:00`;
                
                return isWithinInterval(date, { start: new Date(startStr), end: new Date(endStr) });
            }
            if (rankingPeriod === 'custom' && rankStartDate && rankEndDate) {
                const s = safeParseISO(rankStartDate);
                const e = safeParseISO(rankEndDate);
                if (!s || !e) return false;
                return isWithinInterval(date, { 
                    start: startOfDay(s), 
                    end: endOfDay(e) 
                });
            }
            return true;
        } catch (e) {
            return false;
        }
    };

    // SELLERS PERFORMANCE DATA (CRISTAL CRM LEVEL)
    const sellerStats = useMemo(() => {
        const stats: Record<string, { 
            id: string,
            name: string, 
            totalSold: number, 
            salesCount: number, 
            quotesCount: number,
            measurementsCount: number,
            conversion: number,
            avgTicket: number,
            score: number,
        }> = {};

        const initSeller = (identity: { id: string, name: string }) => {
            const key = identity.id || identity.name;
            if (!stats[key]) {
                stats[key] = {
                    id: identity.id || '',
                    name: identity.name || 'Desconhecido',
                    totalSold: 0,
                    salesCount: 0,
                    quotesCount: 0,
                    measurementsCount: 0,
                    conversion: 0,
                    avgTicket: 0,
                    score: 0
                };
            }
            return key;
        };

        // 1. Orçamentos Feitos
        (quotes || []).forEach(quote => {
            const d = quote.createdAt || quote.quoteDate || quote.createdDate || quote.date;
            if (filterByPeriod(d)) {
                const sellerKey = initSeller(getSellerIdentity(quote));
                stats[sellerKey].quotesCount += 1;
            }
        });

        // 2. Medições Agendadas
        const validMeasurementStatuses = ['scheduled', 'agendada', 'aguardando_medicao', 'confirmada', 'realizada', 'concluida', 'concluída', 'finalizada'];
        (measurements || []).forEach(measurement => {
            const d = measurement.scheduledAt || measurement.scheduledDate || measurement.date || measurement.createdAt;
            const normStatus = normalizeStatus(measurement.status);
            
            if (filterByPeriod(d) && validMeasurementStatuses.some(v => normStatus.includes(v))) {
                const sellerKey = initSeller(getSellerIdentity(measurement));
                stats[sellerKey].measurementsCount += 1;
            }
        });

        // 3. Fechamentos e Valor
        const countedContracts = new Set<string>();
        const validClosingStatuses = ['signed', 'assinado', 'approved', 'aprovado', 'em_contrato', 'em_producao', 'aguardando_materia_prima', 'instalado', 'finalizado'];

        // 3.1 Contratos
        (contracts || []).forEach(contract => {
            const d = contract.signedAt || contract.contractSignedAt || contract.approvedAt || contract.closedAt || contract.createdAt;
            const normStatus = normalizeStatus(contract.status || contract.contractStatus);
            
            if (filterByPeriod(d) && validClosingStatuses.some(v => normStatus.includes(v))) {
                const sellerKey = initSeller(getSellerIdentity(contract));
                stats[sellerKey].salesCount += 1;
                
                const val = Number(contract.totalAmount || contract.contractTotal || contract.commercialTotal || contract.finalTotal || contract.total || 0);
                stats[sellerKey].totalSold += val;
                
                if (contract.id) countedContracts.add(contract.id);
            }
        });

        // 3.2 Pedidos / Orders
        (orders || []).forEach(order => {
            if (order.contractId && countedContracts.has(order.contractId)) return;
            if (order.contractId) return; // Anti-duplicidade estrita
            
            const d = order.signedAt || order.contractSignedAt || order.approvedAt || order.closedAt || order.createdAt;
            const normStatus = normalizeStatus(order.status);

            if (filterByPeriod(d) && validClosingStatuses.some(v => normStatus.includes(v))) {
                const sellerKey = initSeller(getSellerIdentity(order));
                stats[sellerKey].salesCount += 1;
                
                const val = Number(order.totalAmount || order.contractTotal || order.commercialTotal || order.finalTotal || order.total || 0);
                stats[sellerKey].totalSold += val;
            }
        });

        // 4. Score e Cálculos
        const processedSellers = Object.values(stats).map(s => {
            const conversion = s.quotesCount > 0 ? (s.salesCount / s.quotesCount) * 100 : 0;
            const avgTicket = s.salesCount > 0 ? s.totalSold / s.salesCount : 0;
            const score = (s.quotesCount * 1) + (s.measurementsCount * 2) + (s.salesCount * 5) + (s.totalSold / 1000);
            return { ...s, conversion, avgTicket, score };
        });

        if (processedSellers.length === 0) return [];

        return processedSellers.sort((a, b) => {
            if (rankingSortBy === 'score') return b.score - a.score;
            if (rankingSortBy === 'totalSold') return b.totalSold - a.totalSold;
            if (rankingSortBy === 'conversion') return b.conversion - a.conversion;
            if (rankingSortBy === 'salesCount' || rankingSortBy as any === 'fechamentos') return b.salesCount - a.salesCount;
            if (rankingSortBy === 'quotesCount' || rankingSortBy as any === 'orcamentos') return b.quotesCount - a.quotesCount;
            if (rankingSortBy === 'measurementsCount' || rankingSortBy as any === 'medicoes') return b.measurementsCount - a.measurementsCount;
            return b.score - a.score;
        });
    }, [quotes, orders, measurements, contracts, rankingPeriod, rankingSortBy, rankStartDate, rankEndDate]);

    const globalSalesStats = useMemo(() => {
        const totalSold = safeArray(sellerStats).reduce((acc, s) => acc + s.totalSold, 0);
        const totalSales = safeArray(sellerStats).reduce((acc, s) => acc + s.salesCount, 0);
        const totalQuotes = safeArray(sellerStats).reduce((acc, s) => acc + s.quotesCount, 0);
        const totalMeasurements = safeArray(sellerStats).reduce((acc, s) => acc + s.measurementsCount, 0);
        const avgGlobalTicket = totalSales > 0 ? totalSold / totalSales : 0;
        const globalConv = totalQuotes > 0 ? (totalSales / totalQuotes) * 100 : 0;

        return { totalSold, totalQuotes, totalMeasurements, avgGlobalTicket, globalConv, totalSales };
    }, [sellerStats]);

    const getRiskDays = (quote: Quote) => {
        const stage = getEffectiveWorkflowStage(quote);
        if (!quote || stage === 'em_producao' || stage === 'cancelado' || stage === 'finalizado') return -1;
        const ref = safeParseISO(quote.lastContact) || safeParseISO(quote.createdAt) || new Date();
        return differenceInDays(new Date(), ref);
    };


    // Original Filter and Sort Logic
    const filteredAndSortedQuotes = useMemo(() => {
        if (!quotes || !Array.isArray(quotes)) return [];
        
        const term = quoteSearchText?.trim() || '';
        
        // 1. Filter phase
        const result = safeArray(quotes).filter(q => {
            // Regra de ocultação de rascunhos vazios
            if (q.hiddenFromDashboard === true || q.quoteStage === 'draft_zero' || isEmptyQuoteDraft(q)) {
                return false;
            }

            // Text search
            let matchText = true;
            if (term) {
                const cName = q?.customerName || '';
                const cPhone = q?.customerPhone || '';
                const qNumber = q?.id?.slice(-8) || '';
                const sName = q?.sellerName || '';
                const qStatus = WORKFLOW_CONFIG[getEffectiveWorkflowStage(q)]?.label || q.status || '';
                
                const normTerm = normalizeSearchText(term);
                const normPhoneTerm = normalizePhoneSearch(term);

                const scoreName = calculateSearchScore(normalizeSearchText(cName), normTerm);
                const scorePhone = calculateSearchScore(normalizePhoneSearch(cPhone), normPhoneTerm, true);
                const scoreNum = calculateSearchScore(normalizeSearchText(qNumber), normTerm);
                const scoreSeller = calculateSearchScore(normalizeSearchText(sName), normTerm);
                const scoreStatus = calculateSearchScore(normalizeSearchText(qStatus), normTerm);
                
                matchText = (scoreName > 0 || scorePhone > 0 || scoreNum > 0 || scoreSeller > 0 || scoreStatus > 0);
            }

            // Date match
            let matchDate = true;
            if (q?.createdAt && (startDate || endDate)) {
                try {
                    const quoteDate = safeParseISO(q.createdAt);
                    if (quoteDate) {
                        if (startDate && quoteDate < new Date(startDate + 'T00:00:00')) matchDate = false;
                        if (endDate && quoteDate > new Date(endDate + 'T23:59:59')) matchDate = false;
                    }
                } catch (e) {
                    matchDate = true;
                }
            }
            
            // Status match (Rule: Must match visual state from getEffectiveWorkflowStage)
            const matchStatus = statusFilter === 'all' 
                ? true 
                : getEffectiveWorkflowStage(q) === statusFilter;

            // Stalled Filter match (Rule #2: Condition >= 5000 and daysSemContato)
            if (urgentMode) {
                const status = getQuoteAlertStatus(q);
                if (status.level === 'none') return false;
            }

            return matchText && matchDate && matchStatus && (q?.isLatestVersion !== false);
        });

        // 2. Score and Sort phase
        if (term) {
            const normTerm = normalizeSearchText(term);
            const normPhoneTerm = normalizePhoneSearch(term);
            
            const scored = safeArray(result).map(q => {
                const cName = q?.customerName || '';
                const cPhone = q?.customerPhone || '';
                const qNumber = q?.id?.slice(-8) || '';
                const pNumber = q?.protocolNumber || '';
                const sName = q?.sellerName || '';
                const qStatus = WORKFLOW_CONFIG[getEffectiveWorkflowStage(q)]?.label || q.status || '';
                
                const scoreName = calculateSearchScore(normalizeSearchText(cName), normTerm);
                const scorePhone = calculateSearchScore(normalizePhoneSearch(cPhone), normPhoneTerm, true);
                const scoreNum = calculateSearchScore(normalizeSearchText(qNumber), normTerm);
                const scoreProto = calculateSearchScore(normalizeSearchText(pNumber), normTerm);
                const scoreSeller = calculateSearchScore(normalizeSearchText(sName), normTerm);
                const scoreStatus = calculateSearchScore(normalizeSearchText(qStatus), normTerm);
                
                return { ...q, _searchScore: Math.max(scoreName, scorePhone, scoreNum, scoreProto, scoreSeller, scoreStatus) };
            });
            
            return scored.sort((a, b) => {
                if (a._searchScore !== b._searchScore) return b._searchScore - a._searchScore;
                const dateA = a.lastAutosaveAt || a.updatedAt || a.createdAt;
                const dateB = b.lastAutosaveAt || b.updatedAt || b.createdAt;
                return compareDatesSafe(dateA, dateB, 'desc');
            });
        }

        // Smart Ordering: Most recent movement first (lastAutosaveAt -> updatedAt -> createdAt)
        return result.sort((a, b) => {
            const dateA = a.lastAutosaveAt || a.updatedAt || a.createdAt;
            const dateB = b.lastAutosaveAt || b.updatedAt || b.createdAt;
            
            // Descending order (most recent first)
            return compareDatesSafe(dateA, dateB, 'desc');
        });
    }, [quotes, quoteSearchText, startDate, endDate, statusFilter, urgentMode]);


    // KPI Calculations
    const kpis = useMemo(() => {
        const pipelineTotal = safeArray(filteredAndSortedQuotes).reduce((acc, q) => {
            const stage = getEffectiveWorkflowStage(q);
            const isPipeline = !['em_producao', 'cancelado', 'finalizado'].includes(stage);
            return acc + (isPipeline ? (Number(q?.totalAmount || q?.total || (q?.commercialTotal || 0) + (q?.operationalCost || 0) + (q?.freight || 0))) : 0);
        }, 0);
        
        let staleCount = 0;
        let riskCount = 0;
        let riskValue = 0;
        
        filteredAndSortedQuotes.forEach(q => {
            const stage = getEffectiveWorkflowStage(q);
            if (['em_producao', 'cancelado', 'finalizado', 'aprovado', 'em_contrato'].includes(stage)) return;
            const ref = safeParseISO(q.lastContact) || safeParseISO(q.createdAt) || new Date();
            const days = differenceInDays(new Date(), ref);
            if (days >= 7) {
                riskCount++;
                riskValue += Number(q.totalAmount || q.total || (Number(q.commercialTotal || 0) + Number(q.operationalCost || 0) + Number(q.freight || 0)));
            } else if (days >= 3) {
                staleCount++;
            }
        });

        const converted = (filteredAndSortedQuotes || []).filter(q => {
            const stage = getEffectiveWorkflowStage(q);
            return ['em_contrato', 'aprovado', 'em_producao'].includes(stage);
        }).length;

        const rejected = (filteredAndSortedQuotes || []).filter(q => getEffectiveWorkflowStage(q) === 'cancelado').length;
        const totalConcluded = converted + rejected;
        const conversionRate = totalConcluded > 0 ? (converted / totalConcluded) * 100 : 0;

        const medicaoCount = (filteredAndSortedQuotes || []).filter(q => getEffectiveWorkflowStage(q) === 'aguardando_medicao').length;

        return { pipelineTotal, staleCount, riskCount, riskValue, converted, rejected, conversionRate, medicaoCount };
    }, [filteredAndSortedQuotes]);

    /* Follow-up and Contact logic removed - Separation of Concerns */

    return (
        <div className="space-y-[var(--density-gap)] animate-in fade-in duration-500 pb-4">
            {/* Welcome Modal Removed - Follow-up separation policy */}

            <Tabs defaultValue="propostas" className="w-full">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <TabsList className="bg-white p-0.5 rounded-lg border border-brand-rocha-border">
                            <TabsTrigger value="propostas" className="data-[state=active]:bg-brand-rocha-bg data-[state=active]:text-brand-rocha-primary data-[state=active]:shadow-sm rounded-md font-black uppercase text-[9px] tracking-widest px-4 py-1.5 transition-all">
                                <TrendingUp className="w-3 h-3 mr-2" />
                                Propostas
                            </TabsTrigger>
                            <TabsTrigger value="vendedores" className="data-[state=active]:bg-brand-rocha-bg data-[state=active]:text-brand-rocha-primary data-[state=active]:shadow-sm rounded-md font-black uppercase text-[9px] tracking-widest px-4 py-1.5 transition-all">
                                <Trophy className="w-3 h-3 mr-2" />
                                Ranking
                            </TabsTrigger>
                        </TabsList>
                    </div>
                </div>

                <TabsContent value="propostas" className="space-y-6 focus-visible:outline-none outline-none">
            {/* KPI Section */}
            {!isFocusMode && (<div className="grid grid-cols-2 lg:grid-cols-7 gap-[var(--density-gap)]">
                <Card className="rocha-card col-span-2 relative">
                    <CardContent className="p-0 flex flex-col justify-center h-full group">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="rocha-text-label mb-1 flex items-center gap-2">
                                    <Target className="h-2.5 w-2.5" /> Pipeline Aberto
                                </p>
                                <p className="rocha-text-value">
                                    R$ {kpis.pipelineTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                            <div className="flex flex-col items-end text-right border-l border-rose-100 pl-4 h-full">
                                <p className="rocha-text-label text-rose-500 mb-1 flex items-center gap-1">
                                    <Flame className="w-2.5 h-2.5 text-rose-500 animate-pulse" /> Em Risco
                                </p>
                                <p className="text-[12px] font-black text-rose-600 font-mono">
                                    R$ {kpis.riskValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="rocha-card">
                    <CardContent className="p-0 flex flex-col justify-center">
                        <p className="rocha-text-label text-amber-500 mb-1 flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" /> Estagnado
                        </p>
                        <p className="rocha-text-value">{kpis.staleCount}</p>
                    </CardContent>
                </Card>
                <Card className="rocha-card">
                    <CardContent className="p-0 flex flex-col justify-center">
                        <p className="rocha-text-label text-rose-500 mb-1 flex items-center gap-1">
                            <Flame className="w-2.5 h-2.5" /> Risco
                        </p>
                        <p className="rocha-text-value text-rose-500">{kpis.riskCount}</p>
                    </CardContent>
                </Card>
                <Card className="rocha-card">
                    <CardContent className="p-0 flex flex-col justify-center">
                        <p className="rocha-text-label text-emerald-500 mb-1">Fechados</p>
                        <p className="rocha-text-value flex items-end gap-1.5">
                            {kpis.converted} <span className="text-[8px] text-emerald-500 mb-1 font-black">{kpis.conversionRate.toFixed(1)}%</span>
                        </p>
                    </CardContent>
                </Card>
                <Card className="rocha-card">
                    <CardContent className="p-0 flex flex-col justify-center text-rose-500">
                        <p className="rocha-text-label text-rose-500 mb-1">Perdidos</p>
                        <p className="rocha-text-value">{kpis.rejected}</p>
                    </CardContent>
                </Card>
                <Card className="rocha-card bg-brand-rocha-primary/5">
                    <CardContent className="p-0 flex flex-col justify-center">
                        <p className="rocha-text-label text-brand-rocha-primary mb-1">Medição</p>
                        <p className="rocha-text-value">
                            {kpis.medicaoCount}
                        </p>
                    </CardContent>
                </Card>
            </div>
            )}

            {/* Filter Bar */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Target className="h-4 w-4 text-emerald-500" />
                    <h2 className="rocha-text-title uppercase tracking-widest text-xs">Workflow Comercial</h2>
                    
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex gap-2 mr-2">
                        <Button 
                            variant="outline" 
                            onClick={() => {
                                const closed = safeArray(quotes).filter(q => {
                                    const stage = getEffectiveWorkflowStage(q);
                                    return stage === "em_producao" || stage === "finalizado";
                                }).map(q => ({ Nome: q.customerName, Telefone: q.customerPhone || "", Valor: q.totalAmount || q.total || (q.commercialTotal || 0) + (q.operationalCost || 0) + (q.freight || 0) }));
                                exportToMetaExcel(closed, "orcamentos_fechados_meta");
                            }}
                            className="h-9 border-brand-rocha-border text-slate-500 hover:text-emerald-600 bg-white font-black uppercase text-[9px] tracking-widest rounded-xl"
                        >
                            <Download className="w-3.5 h-3.5 mr-2" /> Fechados (Excel)
                        </Button>
                        <Button 
                            variant="outline" 
                            onClick={() => {
                                const stale = safeArray(quotes).filter(q => {
                                    const stage = getEffectiveWorkflowStage(q);
                                    if (["em_producao", "cancelado", "finalizado"].includes(stage)) return false;
                                    const ref = safeParseISO(q.lastContact) || safeParseISO(q.createdAt) || new Date();
                                    return differenceInDays(new Date(), ref) >= 7;
                                }).map(q => ({ Nome: q.customerName, Telefone: q.customerPhone || "", Valor: q.totalAmount || q.total || (q.commercialTotal || 0) + (q.operationalCost || 0) + (q.freight || 0) }));
                                exportToMetaExcel(stale, "orcamentos_parados_meta");
                            }}
                            className="h-9 border-brand-rocha-border text-slate-500 hover:text-amber-600 bg-white font-black uppercase text-[9px] tracking-widest rounded-xl"
                        >
                            <Download className="w-3.5 h-3.5 mr-2" /> Parados (Excel)
                        </Button>
                        <Button 
                            variant="outline" 
                            onClick={() => navigate('/orcamentos/lixeira')} 
                            className="h-9 border-slate-200 text-slate-400 hover:text-rose-600 bg-white font-black uppercase text-[9px] tracking-widest rounded-xl hover:bg-rose-50 transition-all shadow-sm" 
                        > 
                            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Lixeira 
                        </Button>
                    </div>
                    <ModuleSearchInput
                        moduleName="Orçamentos"
                        placeholder="Nome, Telefone, Protocolo, Vendedor..."
                        value={quoteSearchText}
                        onChange={setQuoteSearchText}
                        resultCount={quoteSearchText.trim().length > 0 ? filteredAndSortedQuotes.length : undefined}
                    />

                    <select 
                        value={statusFilter} 
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="p-1 px-3 h-9 bg-white rounded-xl border border-brand-rocha-border shadow-sm text-xs font-bold focus:ring-brand-rocha-primary focus:border-brand-rocha-primary uppercase tracking-widest text-slate-500"
                    >
                        <option value="all">Todos os Status</option>
                        {Object.entries(WORKFLOW_CONFIG).map(([key, value]) => (
                            <option key={key} value={key}>{value.label}</option>
                        ))}
                    </select>

                    <DateRangePicker 
                        startDate={startDate} 
                        endDate={endDate} 
                        onChange={(start, end) => {
                            setStartDate(start);
                            setEndDate(end);
                        }} 
                        className="w-auto"
                    />
                </div>
            </div>

            {/* Main Table */}
            <Card className="rocha-panel bg-white p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead>
                            <tr className="rocha-text-label text-slate-400 border-b border-brand-rocha-border/50 bg-slate-50/10">
                                <th className="rocha-table-cell w-10 text-center">
                                    <input 
                                        type="checkbox" 
                                        className="w-3.5 h-3.5 rounded text-brand-rocha-primary border-brand-rocha-border bg-white cursor-pointer"
                                        checked={selectedBulkQuotes.length === filteredAndSortedQuotes.length && filteredAndSortedQuotes.length > 0}
                                        onChange={(e) => {
                                            if (e.target.checked) setSelectedBulkQuotes(safeArray(filteredAndSortedQuotes).map(q => q.id));
                                            else setSelectedBulkQuotes([]);
                                        }}
                                    />
                                </th>
                                <th className="rocha-table-cell py-5">Cliente</th>
                                <th className="rocha-table-cell py-5">Status</th>
                                <th className="rocha-table-cell py-5">Próxima Etapa</th>
                                <th className="rocha-table-cell py-5">Vendedor</th>
                                <th className="rocha-table-cell py-5 text-right">Valor Negociado</th>
                                <th className="rocha-table-cell py-5 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-rocha-border/30">
                            {isLoading ? (
                                <tr><td colSpan={7} className="px-6 py-20 text-center text-slate-400 font-bold uppercase tracking-widest animate-pulse">Sincronizando Funil Comercial...</td></tr>
                            ) : (!quotes || filteredAndSortedQuotes.length === 0) ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="h-16 w-16 rounded-full bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-slate-200 dark:text-slate-700">
                                                <Target className="h-8 w-8" />
                                            </div>
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Pipeline Vazio ou em Carregamento</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                safeArray(filteredAndSortedQuotes).map((quote) => (
                                    <tr 
                                        key={quote?.id} 
                                        onClick={() => { setSelectedQuote(quote); setIsDrawerOpen(true); }}
                                        className={cn(
                                            "hover:bg-slate-50 transition-all duration-300 group border-l-4 border-l-transparent",
                                            flashRowId === quote.id ? "bg-emerald-50 scale-[1.005] border-l-emerald-500 shadow-md z-10 relative" : "hover:border-l-brand-rocha-primary/30"
                                        )}
                                    >
                                        <td className="rocha-table-cell text-center" onClick={(e) => e.stopPropagation()}>
                                            <input 
                                                type="checkbox" 
                                                className="w-3.5 h-3.5 rounded text-emerald-500 border-slate-300 bg-white cursor-pointer"
                                                checked={selectedBulkQuotes.includes(quote.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedBulkQuotes(prev => [...prev, quote.id]);
                                                    else setSelectedBulkQuotes(prev => safeArray(prev).filter(id => id !== quote.id));
                                                }}
                                            />
                                        </td>
                                        <td className="rocha-table-cell py-5">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-slate-900 uppercase leading-none flex items-center gap-2">
                                                    {(() => {
                                                        const displayClientName = (quote as any)?.clientName || quote?.customerName || (quote as any)?.clientSnapshot?.name || (quote as any)?.customer?.name || (quote as any)?.client?.name || 'Cliente não identificado';
                                                        return <HighlightText text={displayClientName} term={quoteSearchText} />;
                                                    })()}
                                                    {(quote.version > 1 || quote.isPostMeasurement) && (
                                                        <span className={cn(
                                                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                                                            quote.isPostMeasurement 
                                                                ? "bg-purple-600 text-white border-purple-400" 
                                                                : "bg-slate-900 text-white border-white/10"
                                                        )} title={quote.isPostMeasurement ? "Orçamento com Medição Técnica Confirmada" : `Versão ${quote.version}`}>
                                                            v{quote.version} {quote.isPostMeasurement ? '• Pós-Medição' : ''}
                                                        </span>
                                                    )}
                                                </span>
                                                {quote.protocolNumber && (
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1.5">
                                                        <HighlightText text={quote.protocolNumber} term={quoteSearchText} />
                                                    </span>
                                                )}
                                                <div className="flex items-center gap-3 mt-1.5">
                                                    <span className="text-[10px] font-medium text-slate-400">
                                                        <HighlightText text={quote?.customerPhone || '--'} term={quoteSearchText} />
                                                    </span>
                                                    {formatQuoteCreatedDateTime(quote) && (
                                                        <span className="text-[10px] font-medium text-slate-400">
                                                            • Criado em {formatQuoteCreatedDateTime(quote)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                         <td className="rocha-table-cell py-5">
                                            <WorkflowBadge stage={getEffectiveWorkflowStage(quote)} />
                                        </td>
                                        <td className="rocha-table-cell py-5" onClick={(e) => e.stopPropagation()}>
                                            {(() => {
                                                const stage = getEffectiveWorkflowStage(quote);
                                                
                                                if (stage === 'pre_orcamento') {
                                                    return (
                                                        <div className="flex flex-wrap gap-2">
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                className="h-8 px-4 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-sm"
                                                                onClick={() => onConvertToMeasurement(quote)}
                                                            >
                                                                <Ruler className="h-3 w-3 mr-2" />
                                                                Agendar Medição
                                                            </Button>
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                className="h-8 px-4 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-sm"
                                                                onClick={() => handleOpenStoreVisitModal(quote)}
                                                            >
                                                                <MapPin className="h-3 w-3 mr-2" />
                                                                Agendar Visita
                                                            </Button>
                                                            <Button 
                                                                variant="outline" 
                                                                size="sm" 
                                                                className="h-8 px-4 border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-sm"
                                                                onClick={() => handleAdvanceToPostMeasurementManual(quote)}
                                                            >
                                                                <CheckCircle2 className="h-3 w-3 mr-2" />
                                                                Pós-Medição
                                                            </Button>
                                                        </div>
                                                    );
                                                }
                                                
                                                if (stage === 'aguardando_medicao') {
                                                    return (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="h-8 px-4 border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-sm"
                                                            onClick={async () => {
                                                                if (window.confirm('Deseja converter este orçamento em Pós-Medição?')) {
                                                                    const isoNow = new Date().toISOString();
                                                                    const updates = {
                                                                        isPostMeasurement: true,
                                                                        quoteStage: 'pos_medicao' as const,
                                                                        protocolNumber: (quote.protocolBaseNumber && quote.protocolYear) 
                                                                            ? `POS-${quote.protocolYear}-${String(quote.protocolBaseNumber).padStart(6, '0')}` 
                                                                            : quote.protocolNumber,
                                                                        history: [
                                                                            ...safeHistoryArray(quote.history), 
                                                                            { 
                                                                                date: isoNow, 
                                                                                action: 'Confirmado Pós-Medição (Próxima Etapa)',
                                                                                user: user?.displayName || user?.email || "Sistema"
                                                                            },
                                                                            {
                                                                                id: `status_change_${Date.now()}`,
                                                                                type: "status_change",
                                                                                from: quote.status || "aguardando_medicao",
                                                                                to: "pos_medicao",
                                                                                label: "Convertido para Pós-Medição",
                                                                                createdAt: isoNow,
                                                                                createdBy: user?.uid,
                                                                                createdByName: profile?.name || user?.email || "Sistema"
                                                                            }
                                                                        ],
                                                                        updatedAt: isoNow,
                                                                        updatedBy: user?.uid || "",
                                                                        updatedByName: profile?.name || user?.email || ""
                                                                    };
                                                                    await onUpdateQuote(quote.id, updates);
                                                                }
                                                            }}
                                                        >
                                                            <CheckCircle2 className="h-3 w-3 mr-2" />
                                                            Pós-Medição
                                                        </Button>
                                                    );
                                                }
                                                
                                                if (canStartContract(quote)) {
                                                    return (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="h-8 px-4 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-sm"
                                                            onClick={() => onDirectSale(quote)}
                                                        >
                                                            <CheckSquare className="h-3 w-3 mr-2" />
                                                            Iniciar Contrato
                                                        </Button>
                                                    );
                                                }

                                                if (stage === 'em_contrato') {
                                                    return (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm" 
                                                            className="h-8 px-4 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-sm"
                                                            onClick={() => onDirectSale(quote)}
                                                        >
                                                            <Package className="h-3 w-3 mr-2" />
                                                            Liberar Produção
                                                        </Button>
                                                    );
                                                }
                                                
                                                return (
                                                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] px-4">
                                                        Concluído
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td className="rocha-table-cell py-5">
                                            <div className="flex items-center gap-2">
                                                <div className="h-6 w-6 rounded bg-slate-100 flex items-center justify-center text-[8px] font-black text-slate-500 uppercase">
                                                    {String(quote?.sellerName || 'VD').slice(0, 2)}
                                                </div>
                                                <span className="text-[10px] font-black text-slate-600 uppercase truncate max-w-[80px]">{String(quote?.sellerName || 'Venda Direta')}</span>
                                            </div>
                                        </td>
                                        <td className="rocha-table-cell text-right py-5">
                                            <div className="flex flex-col items-end">
                                                <span className="text-xs font-black leading-none text-slate-900 transition-all">
                                                    R$ {(quote?.totalAmount || quote?.total || ((quote?.commercialTotal || 0) + (quote?.operationalCost || 0) + (quote?.freight || 0))).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                                {quote.discount > 0 && (
                                                    <div className="flex flex-col items-end gap-0.5 mt-1.5">
                                                        <div className="flex items-center gap-1">
                                                            <span className={cn(
                                                                "text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter flex items-center gap-1 transition-all",
                                                                ( (quote.discount / ((quote.commercialTotal || 0) + quote.discount)) * 100 ) > 10 ? "text-amber-600 bg-amber-50 border border-amber-200" : 
                                                                ( (quote.discount / ((quote.commercialTotal || 0) + quote.discount)) * 100 ) >= 5 ? "text-blue-600 bg-blue-50 border border-blue-100" :
                                                                "text-emerald-600 bg-emerald-50 border border-emerald-100"
                                                            )}>
                                                                <TrendingDown className="w-2 h-2" />
                                                                DESC {((quote.discount / ((quote.commercialTotal || 0) + quote.discount)) * 100).toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="rocha-table-cell text-right py-5" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                    onClick={() => { setSelectedQuote(quote); setIsDrawerOpen(true); }}
                                                    title="Visualizar Orçamento"
                                                >
                                                    <BarChart3 className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 rounded-lg transition-all"
                                                    onClick={() => typeof onEdit === 'function' && onEdit(quote)}
                                                    title="Editar Orçamento"
                                                >
                                                    <FileEdit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className={cn("h-8 w-8 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all", downloadingId === quote.id ? "text-blue-500 animate-pulse bg-blue-50" : "text-slate-400")}
                                                    onClick={(e) => openLayoutSelector(quote.id, e)}
                                                    title="Baixar PDF"
                                                >
                                                    {downloadingId === quote.id ? (
                                                        <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                                    ) : (
                                                        <Download className="h-4 w-4" />
                                                    )}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-all"
                                                    onClick={() => onDuplicate(quote)}
                                                    title="Duplicar Orçamento"
                                                >
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                                    onClick={() => handleDeleteClick(quote)}
                                                    title="Excluir Orçamento"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </TabsContent>

                <TabsContent value="vendedores" className="space-y-6 animate-in slide-in-from-bottom-2 duration-500 focus-visible:outline-none outline-none">
                    
                    {/* BARRA DE FILTROS E RANKING CONTROLS */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-2 pr-4 border-r border-slate-100 dark:border-white/5 mr-2">
                                <Filter className="w-4 h-4 text-slate-400" />
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Período</span>
                            </div>
                            {(['today', '7d', '30d', 'month', 'custom'] as const).map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setRankingPeriod(p)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all",
                                        rankingPeriod === p 
                                            ? "bg-teal-600 text-white shadow-md shadow-teal-500/20 scale-105" 
                                            : "bg-slate-50 dark:bg-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                                    )}
                                >
                                    {p === 'today' ? 'Hoje' : p === '7d' ? '7 Dias' : p === '30d' ? '30 Dias' : p === 'month' ? 'Este Mês' : 'Personalizado'}
                                </button>
                            ))}

                            {rankingPeriod === 'custom' && (
                                <DateRangePicker 
                                    startDate={rankStartDate} 
                                    endDate={rankEndDate} 
                                    onChange={(start, end) => {
                                        setRankStartDate(start);
                                        setRankEndDate(end);
                                    }} 
                                    className="ml-4"
                                />
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 pr-4 border-r border-slate-100 dark:border-white/5 mr-2">
                                <ListFilter className="w-4 h-4 text-slate-400" />
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ordenar por</span>
                            </div>
                            <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-xl">
                                {(['totalSold', 'conversion', 'avgClosureTime', 'score'] as const).map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setRankingSortBy(s)}
                                        className={cn(
                                            "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all",
                                            rankingSortBy === s 
                                                ? "bg-white dark:bg-slate-700 text-teal-600 shadow-sm" 
                                                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                        )}
                                    >
                                        {s === 'totalSold' ? 'Valor' : s === 'conversion' ? 'Conversão' : s === 'avgClosureTime' ? 'Velocidade' : 'Score'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* CRM KPIs GERAIS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        <Card className="bg-white dark:bg-slate-900 border-none shadow-sm overflow-hidden relative group hover:shadow-md transition-all">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                                <TrendingUp className="w-16 h-16 text-emerald-500" />
                            </div>
                            <CardContent className="p-6">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Faturamento Fechado</p>
                                <h3 className="text-3xl font-black text-slate-900 dark:text-white">R$ {globalSalesStats.totalSold.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</h3>
                            </CardContent>
                        </Card>

                        <Card className="bg-white dark:bg-slate-900 border-none shadow-sm overflow-hidden relative group hover:shadow-md transition-all">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                                <Target className="w-16 h-16 text-blue-500" />
                            </div>
                            <CardContent className="p-6">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Orçamentos Feitos</p>
                                <h3 className="text-3xl font-black text-slate-900 dark:text-white">{globalSalesStats.totalQuotes}</h3>
                            </CardContent>
                        </Card>

                        <Card className="bg-white dark:bg-slate-900 border-none shadow-sm overflow-hidden relative group hover:shadow-md transition-all">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                                <Zap className="w-16 h-16 text-amber-500" />
                            </div>
                            <CardContent className="p-6">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Medições Agendadas</p>
                                <h3 className="text-3xl font-black text-slate-900 dark:text-white">{globalSalesStats.totalMeasurements}</h3>
                            </CardContent>
                        </Card>

                        <Card className="bg-white dark:bg-slate-900 border-none shadow-sm overflow-hidden relative group hover:shadow-md transition-all">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                                <Trophy className="w-16 h-16 text-indigo-500" />
                            </div>
                            <CardContent className="p-6">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Fechamentos</p>
                                <h3 className="text-3xl font-black text-slate-900 dark:text-white">{globalSalesStats.totalSales}</h3>
                            </CardContent>
                        </Card>

                        <Card className="bg-white dark:bg-slate-900 border-none shadow-sm overflow-hidden relative group hover:shadow-md transition-all">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                                <BarChart3 className="w-16 h-16 text-teal-500" />
                            </div>
                            <CardContent className="p-6">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ticket Médio</p>
                                <h3 className="text-3xl font-black text-slate-900 dark:text-white">R$ {globalSalesStats.avgGlobalTicket.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</h3>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Podium / Top Sellers */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end mt-4">
                        {/* Silver #2 */}
                        {sellerStats.length > 1 && (
                            <div className="order-2 md:order-1 h-full flex flex-col justify-end">
                                <Card 
                                    className="border-slate-200 dark:border-white/5 bg-gradient-to-t from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 shadow-xl overflow-hidden relative group hover:scale-[1.02] transition-all cursor-pointer"
                                    onClick={() => {
                                        setSelectedSellerId(sellerStats[1].id);
                                        setIsSellerDrawerOpen(true);
                                    }}
                                >
                                    <div className="absolute top-0 right-0 p-4 opacity-5">
                                        <Trophy className="w-24 h-24 text-slate-300" />
                                    </div>
                                    <CardContent className="p-6 text-center">
                                        <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 border-2 border-slate-300 dark:border-slate-700 shadow-inner">
                                            <span className="text-2xl font-black text-slate-400">#2</span>
                                        </div>
                                        <h4 className="text-lg font-black text-slate-800 dark:text-white truncate uppercase tracking-tight">{sellerStats[1].name}</h4>
                                        <div className="flex items-center justify-center gap-2 mt-2">
                                            <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold px-3">Score: {sellerStats[1].score.toFixed(1)}</Badge>
                                        </div>
                                        <div className="mt-6 pt-6 border-t border-slate-100 dark:border-white/5 space-y-2">
                                            <div className="text-2xl font-black text-slate-700 dark:text-slate-200 tabular-nums tracking-tighter">R$ {sellerStats[1].totalSold.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                            <div className="flex justify-center gap-3">
                                                <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-widest">{sellerStats[1].conversion.toFixed(1)}% Conv.</span>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{sellerStats[1].salesCount} Vendas</span>
                                            </div>
                                        </div>
                                    </CardContent>
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800">
                                        <div className="h-full bg-slate-400" style={{ width: `${sellerStats[1].score}%` }}></div>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {/* Gold #1 */}
                        {sellerStats.length > 0 && (
                            <div className="order-1 md:order-2">
                                <Card 
                                    className="border-amber-200 dark:border-amber-500/20 bg-gradient-to-b from-amber-50 to-white dark:from-amber-900/10 dark:to-slate-900 shadow-2xl overflow-hidden relative scale-105 border-b-4 border-b-amber-500 cursor-pointer hover:shadow-amber-500/20 transition-all"
                                    onClick={() => {
                                        setSelectedSellerId(sellerStats[0].id);
                                        setIsSellerDrawerOpen(true);
                                    }}
                                >
                                    <div className="absolute -top-4 -right-4 p-8 opacity-10 rotate-12">
                                        <Trophy className="w-32 h-32 text-amber-500" />
                                    </div>
                                    <CardContent className="p-8 text-center pt-10">
                                        <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center mb-6 shadow-lg shadow-amber-500/40 relative">
                                            <Trophy className="w-10 h-10 text-white" />
                                            <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center border-2 border-amber-500">
                                              <span className="text-sm font-black text-amber-600">#1</span>
                                            </div>
                                        </div>
                                        <h4 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">{sellerStats[0].name}</h4>
                                        <div className="flex items-center justify-center gap-3 mt-3">
                                            <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-none font-black text-[10px] tracking-widest">RANK MESTRE</Badge>
                                            <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600">
                                                <Flame className="w-3 h-3" /> {sellerStats[0].score.toFixed(1)} PTS
                                            </div>
                                        </div>
                                        
                                        <div className="mt-8 p-6 rounded-2xl bg-amber-500/5 border border-amber-500/10 backdrop-blur-sm">
                                            <div className="text-4xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums tracking-tighter">R$ {sellerStats[0].totalSold.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                            <div className="flex justify-center gap-6 mt-4">
                                                <div className="text-center">
                                                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Conversão</div>
                                                    <div className="text-xl font-black text-slate-800 dark:text-white">{sellerStats[0].conversion.toFixed(1)}%</div>
                                                </div>
                                                <div className="w-px h-8 bg-amber-200 dark:bg-amber-700/30"></div>
                                                <div className="text-center">
                                                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pedidos</div>
                                                    <div className="text-xl font-black text-slate-800 dark:text-white">{sellerStats[0].salesCount}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                    <div className="h-2 w-full bg-amber-100 dark:bg-amber-900/10">
                                        <div className="h-full bg-amber-500 animate-pulse" style={{ width: `${sellerStats[0].score}%` }}></div>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {/* Bronze #3 */}
                        {sellerStats.length > 2 && (
                            <div className="order-3 h-full flex flex-col justify-end">
                                <Card 
                                    className="border-orange-200 dark:border-white/5 bg-gradient-to-t from-orange-50 to-white dark:from-orange-900/5 dark:to-slate-800 shadow-xl overflow-hidden relative group hover:scale-[1.02] transition-all cursor-pointer"
                                    onClick={() => {
                                        setSelectedSellerId(sellerStats[2].id);
                                        setIsSellerDrawerOpen(true);
                                    }}
                                >
                                    <CardContent className="p-6 text-center">
                                        <div className="mx-auto w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-800/20 flex items-center justify-center mb-4 border-2 border-orange-300 dark:border-orange-700 shadow-inner">
                                            <span className="text-2xl font-black text-orange-600">#3</span>
                                        </div>
                                        <h4 className="text-lg font-black text-slate-800 dark:text-white truncate uppercase tracking-tight">{sellerStats[2].name}</h4>
                                        <div className="flex items-center justify-center gap-2 mt-2">
                                            <Badge variant="secondary" className="bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-bold px-3">Score: {sellerStats[2].score.toFixed(1)}</Badge>
                                        </div>
                                        <div className="mt-6 pt-6 border-t border-slate-100 dark:border-white/5 space-y-2">
                                            <div className="text-2xl font-black text-slate-700 dark:text-slate-200 tabular-nums tracking-tighter">R$ {sellerStats[2].totalSold.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                                            <div className="flex justify-center gap-3">
                                                <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-widest">{sellerStats[2].conversion.toFixed(1)}% Conv.</span>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{sellerStats[2].salesCount} Vendas</span>
                                            </div>
                                        </div>
                                    </CardContent>
                                    <div className="h-1.5 w-full bg-orange-100 dark:bg-orange-900/10">
                                        <div className="h-full bg-orange-500" style={{ width: `${sellerStats[2].score}%` }}></div>
                                    </div>
                                </Card>
                            </div>
                        )}
                    </div>

                    {/* Master Ranking Table */}
                    <Card className="glass-panel overflow-hidden border-none bg-white dark:bg-slate-900 shadow-lg mt-6">
                        <CardHeader className="border-b border-slate-100 dark:border-white/5 px-8 py-6">
                            <div className="lg:flex justify-between items-center gap-8">
                                <div>
                                    <CardTitle className="text-lg font-black flex items-center gap-2 text-slate-800 dark:text-slate-100">
                                        <BarChart3 className="w-5 h-5 text-teal-500" />
                                        Performance Comercial Detalhada
                                    </CardTitle>
                                    <CardDescription>Escaneamento estratégico por ticket médio, fechamento e eficiência de funil.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-50 dark:bg-black/20 text-slate-500 font-black uppercase text-[9px] tracking-[0.2em] border-b border-slate-100 dark:border-white/5">
                                        <tr>
                                            <th className="px-8 py-4 w-16">Pos</th>
                                            <th className="px-4 py-4 uppercase">Vendedor</th>
                                            <th className="px-4 py-4 text-center uppercase">Orçamentos</th>
                                            <th className="px-4 py-4 text-center uppercase">Medições</th>
                                            <th className="px-4 py-4 text-center uppercase">Fechamentos</th>
                                            <th className="px-4 py-4 text-right uppercase">Valor Fechado</th>
                                            <th className="px-4 py-4 text-right uppercase">Ticket Médio</th>
                                            <th className="px-4 py-4 text-center uppercase">Conversão</th>
                                            <th className="px-4 py-4 text-center uppercase">Score Geral</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                        {safeArray(sellerStats).map((seller, index) => (
                                            <tr 
                                                key={index} 
                                                className="hover:bg-teal-50/50 dark:hover:bg-teal-500/5 transition-all cursor-pointer group border-l-2 border-transparent hover:border-teal-500"
                                                onClick={() => {
                                                    setSelectedSellerId(seller.id);
                                                    setIsSellerDrawerOpen(true);
                                                }}
                                            >
                                                <td className="px-8 py-5">
                                                    <span className={cn(
                                                        "text-sm font-black tabular-nums",
                                                        index === 0 ? "text-amber-500" : 
                                                        index === 1 ? "text-slate-400" : 
                                                        index === 2 ? "text-orange-500" : "text-slate-300"
                                                    )}>#{index + 1}</span>
                                                </td>
                                                <td className="px-4 py-5 font-bold">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                                                            <UserCircle2 className="w-5 h-5" />
                                                        </div>
                                                        <div className="text-slate-900 dark:text-white font-black uppercase text-[10px] tracking-tight">{seller.name}</div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-5 text-center font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                                                    {seller.quotesCount}
                                                </td>
                                                <td className="px-4 py-5 text-center font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                                                    {seller.measurementsCount}
                                                </td>
                                                <td className="px-4 py-5 text-center font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                                                    {seller.salesCount}
                                                </td>
                                                <td className="px-4 py-5 text-right font-black text-slate-800 dark:text-slate-200 tabular-nums">
                                                    R$ {seller.totalSold.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-5 text-right font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                                                    R$ {seller.avgTicket.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                                </td>
                                                <td className="px-4 py-5 text-center">
                                                    <div className="flex flex-col items-center gap-1.5 min-w-[80px] mx-auto">
                                                        <span className="text-xs font-black text-slate-900 dark:text-white tabular-nums">{seller.conversion.toFixed(1)}%</span>
                                                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full flex overflow-hidden">
                                                            <div className="bg-emerald-500 h-full" style={{ width: `${seller.conversion}%` }}></div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-5 text-center">
                                                    <div className="flex flex-col items-center gap-1.5 min-w-[80px] mx-auto">
                                                        <span className="text-xs font-black text-teal-600 dark:text-teal-400 tabular-nums">{seller.score.toFixed(1)}</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Fim dos Conteúdos de Tabs */}
            </Tabs>

            {/* DRAWER LATERAL */}
            {isDrawerOpen && selectedQuote && (
                <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto" onClick={() => setIsDrawerOpen(false)} />
                    <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl pointer-events-auto flex flex-col p-8 transition-transform duration-500 translate-x-0 border-l border-slate-200 dark:border-white/5 no-scrollbar overflow-y-auto">
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <h3 className="text-[10px] font-black text-brand-emerald uppercase tracking-[0.3em] mb-2">Resumo Comercial</h3>
                                <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none">{selectedQuote?.customerName || 'Sem nome'}</h2>
                            </div>
                            <Button variant="ghost" className="h-10 w-10 p-0 rounded-full hover:bg-slate-100" onClick={() => setIsDrawerOpen(false)}>
                                <X className="h-6 w-6 text-slate-400" />
                            </Button>
                        </div>

                        {/* New Workflow Timeline Section */}
                        <div className="mb-8 p-1 bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-100 dark:border-white/5">
                            {(() => {
                                console.log('[DRAWER WORKFLOW DEBUG]', {
                                    id: selectedQuote.id,
                                    status: selectedQuote.status,
                                    quoteStage: selectedQuote.quoteStage,
                                    isLatest: selectedQuote.isLatestVersion
                                });
                                return null;
                            })()}
                            <WorkflowTimeline currentStage={getEffectiveWorkflowStage(selectedQuote)} />
                        </div>

                        {/* Status & Next Step */}
                        <div className="grid grid-cols-1 gap-4 mb-8">
                            <NextStepCard currentStage={getEffectiveWorkflowStage(selectedQuote)} />
                            
                            <div className="flex items-center justify-between bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-100 dark:border-white/5">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Status do Processo</span>
                                    <WorkflowBadge stage={getEffectiveWorkflowStage(selectedQuote)} />
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Valor do Orçamento</span>
                                    <div className="text-lg font-black text-slate-900 dark:text-white">
                                        R$ {((selectedQuote?.commercialTotal || 0) + (selectedQuote?.operationalCost || 0) + (selectedQuote?.freight || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Detail Info */}
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Informações de Contato</label>
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-4 bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-100 dark:border-white/5">
                                        <div className="h-10 w-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 shadow-sm">
                                            <Phone className="h-5 w-5" />
                                        </div>
                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{selectedQuote?.customerPhone || 'Não informado'}</span>
                                    </div>
                                    <div className="flex items-center gap-4 bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-100 dark:border-white/5">
                                        <div className="h-10 w-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 shadow-sm">
                                            <MapPin className="h-5 w-5" />
                                        </div>
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 line-clamp-2">{selectedQuote?.customerAddress || 'Endereço não informado'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Notas Comerciais</label>
                                <div className="bg-indigo-50/30 dark:bg-indigo-500/5 p-5 rounded-2xl border border-indigo-100/50 dark:border-indigo-500/10 italic text-sm text-indigo-900/70 dark:text-indigo-300/60 leading-relaxed font-medium">
                                    {selectedQuote?.observations || 'Nenhuma observação interna para este orçamento.'}
                                </div>
                            </div>

                            {/* Intelligent Panel & Checklist */}
                            {(() => {
                                const stage = getEffectiveWorkflowStage(selectedQuote);
                                const isDraftOrActive = !['em_producao', 'cancelado', 'finalizado'].includes(stage);
                                
                                return selectedQuote && isDraftOrActive && (
                                <div className="bg-slate-50 dark:bg-white/5 p-5 rounded-2xl border border-slate-100 dark:border-white/5 space-y-4">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 p-1.5 bg-brand-emerald/10 text-brand-emerald rounded-lg">
                                            <Zap className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Assistente Comercial</h4>
                                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                                {getRiskDays(selectedQuote) >= 15 ? "Ação urgente necessária. O cliente está esfriando muito rápido." :
                                                 getRiskDays(selectedQuote) >= 7 ? "O cliente está começando a esfriar. É hora de fazer contato." :
                                                 getRiskDays(selectedQuote) >= 3 ? "Hora de relembrar o cliente sobre o orçamento." :
                                                 "Tudo em dia. Aguardando os próximos passos da negociação."}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="pt-4 border-t border-slate-200 dark:border-white/10">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Checklist de Venda</h4>
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                {['aguardando_aprovacao', 'aprovado', 'em_contrato', 'em_producao', 'finalizado'].includes(stage) ? (
                                                    <CheckSquare className="w-4 h-4 text-emerald-500" />
                                                ) : (
                                                    <div className="w-4 h-4 rounded border border-slate-300 dark:border-slate-600" />
                                                )}
                                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Orçamento Enviado</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {((Array.isArray(selectedQuote.history) && safeArray(selectedQuote.history).some(h => (h.action || '').toLowerCase().includes('follow-up'))) || (getRiskDays(selectedQuote) === 0 && stage !== 'pre_orcamento')) ? (
                                                    <CheckSquare className="w-4 h-4 text-emerald-500" />
                                                ) : (
                                                    <div className="w-4 h-4 rounded border border-slate-300 dark:border-slate-600" />
                                                )}
                                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Follow-up Realizado</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {stage === 'aguardando_aprovacao' || stage === 'aprovado' ? (
                                                    <CheckSquare className="w-4 h-4 text-emerald-500" />
                                                ) : (
                                                    <div className="w-4 h-4 rounded border border-slate-300 dark:border-slate-600" />
                                                )}
                                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Aguardando Resposta</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ); })()}

                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Linha do Tempo & Histórico</label>
                                <div className="space-y-3 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 dark:before:via-slate-800 before:to-transparent">
                                    {(Array.isArray(selectedQuote?.history) && selectedQuote.history.length > 0) ? (
                                        [...selectedQuote.history].reverse().map((h, i) => (
                                            <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                                <div className="flex items-center justify-center w-8 h-8 rounded-full border border-white dark:border-slate-900 bg-slate-100 dark:bg-slate-800 text-slate-400 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                                                    <History className="h-3 w-3" />
                                                </div>
                                                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 shadow-sm">
                                                    <time className="mb-0.5 text-[8px] font-black uppercase text-brand-emerald">{formatVisualDate(h.date, "dd/MM 'às' HH:mm")}</time>
                                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-tight">{h.action}</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-dashed border-slate-200 dark:border-white/10 relative z-10">
                                            <p className="text-[10px] font-black uppercase text-slate-400">Nenhum registro de contato.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Actions Group */}
                            <div className="pt-8 border-t border-slate-100 dark:border-white/5 flex flex-col gap-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Ações de Relacionamento</label>
                                
                                <div className="grid grid-cols-2 gap-3 mb-2">
                                    <Button
                                        onClick={() => selectedQuote && handleActionClick(selectedQuote, undefined, 'whatsapp')}
                                        className="h-12 bg-white hover:bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[10px] uppercase rounded-xl relative overflow-hidden group shadow-sm"
                                    >
                                        <WhatsAppIcon className="h-4 w-4 mr-2" />
                                        Enviar Proposta
                                    </Button>
                                    <Button
                                        onClick={() => selectedQuote && handleActionClick(selectedQuote, undefined, 'follow-up')}
                                        className="h-12 bg-amber-400 hover:bg-amber-500 text-amber-950 font-black text-[10px] uppercase rounded-xl relative overflow-hidden group shadow-sm shadow-amber-500/20 shadow-lg"
                                    >
                                        <MessageSquare className="h-4 w-4 mr-2" />
                                        Mandar Follow-up
                                    </Button>
                                </div>

                                <div className="space-y-4 bg-slate-50 dark:bg-white/5 p-5 rounded-2xl border border-slate-100 dark:border-white/5 mt-2">
                                    <h4 className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 tracking-widest border-b border-slate-200 dark:border-white/10 pb-2">
                                        <Target className="w-3 h-3" /> Acompanhamento Operacional
                                    </h4>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Estágio do Fluxo</label>
                                            <select 
                                                value={getEffectiveWorkflowStage(selectedQuote)}
                                                onChange={(e) => {
                                                    const newStage = e.target.value as WorkflowStage;
                                                    // Map stage back to default status/quoteStage
                                                    let status: Quote['status'] = 'draft';
                                                    const quoteStage: Quote['quoteStage'] = newStage;

                                                    if (newStage === 'aguardando_aprovacao') status = 'sent';
                                                    if (newStage === 'aprovado') status = 'approved';
                                                    if (newStage === 'em_producao') status = 'converted';
                                                    if (newStage === 'cancelado') status = 'rejected';
                                                    if (newStage === 'aguardando_medicao') status = 'measuring';

                                                    // These will be used in the save function
                                                    setDraftStatus(status);
                                                    setDraftStage(quoteStage || 'pre_orcamento');
                                                }}
                                                className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 outline-none focus:ring-2 focus:ring-brand-emerald/30"
                                            >
                                                {Object.entries(WORKFLOW_CONFIG).map(([key, config]) => (
                                                    <option key={key} value={key}>{config.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Feedback ou Próximo Passo</label>
                                            <input 
                                                value={draftNextAction}
                                                onChange={e => setDraftNextAction(e.target.value)}
                                                className="w-full text-xs font-medium p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 outline-none focus:ring-2 focus:ring-brand-emerald/30"
                                                placeholder="Ex: Retornar amanhã para decisão final..."
                                            />
                                        </div>
                                        <Button 
                                            onClick={async () => {
                                                if(selectedQuote) {
                                                    const currentStage = getEffectiveWorkflowStage(selectedQuote);
                                                    const isLocked = ['aprovado', 'em_contrato', 'em_producao', 'pronto', 'finalizado'].includes(currentStage);
                                                    
                                                    // Bloqueio de Downgrade: Se já está aprovado/produção, não pode voltar p/ draft via select simples
                                                    if (isLocked && !['aprovado', 'em_contrato', 'em_producao', 'pronto', 'finalizado', 'cancelado'].includes(draftStatus as string) && draftStatus !== 'approved') {
                                                        alert('Atenção: Este orçamento já foi aprovado e congelado. Para alterações estruturais, crie uma nova versão (Revisar Orçamento) na tela de detalhes.');
                                                        return;
                                                    }

                                                    const isoNow = new Date().toISOString();
                                                    
                                                    // Detect if status changed to approved to freeze snapshot
                                                    const isBecomingApproved = draftStatus === 'approved' && selectedQuote.status !== 'approved';
                                                    let snapshotUpdate = {};
                                                    const stageLabel = WORKFLOW_CONFIG[draftStage as WorkflowStage]?.label || draftStatus;
                                                    let actionLog = `Estágio alterado para ${stageLabel}`;
                                                    
                                                    if (isBecomingApproved) {
                                                        const approvedUpdates = await approveQuoteAndFreeze(
                                                            selectedQuote, 
                                                            companyData, 
                                                            profile?.name || 'Sistema'
                                                        );
                                                        snapshotUpdate = approvedUpdates;
                                                        actionLog = 'ORÇAMENTO APROVADO via Andamento - Snapshot gerado.';

                                                        if (selectedQuote.influencerId) {
                                                            try {
                                                                await trackInfluencerClosure({
                                                                    type: 'quote',
                                                                    id: selectedQuote.id,
                                                                    companyId: profile?.companyId || selectedQuote.companyId
                                                                });
                                                            } catch (err) {
                                                                console.error("Error tracking influencer closure in QuotesView:", err);
                                                            }
                                                        }
                                                    }

                                                    const newHistory = [...safeHistoryArray(selectedQuote.history), { date: isoNow, action: actionLog, user: user?.displayName || user?.email || "Sistema" }];

                                                    onUpdateQuote(selectedQuote.id, {
                                                        status: draftStatus,
                                                        quoteStage: draftStage as Quote['quoteStage'],
                                                        nextAction: draftNextAction,
                                                        history: newHistory,
                                                        updatedAt: isoNow,
                                                        ...snapshotUpdate
                                                    });
                                                    setSelectedQuote({...selectedQuote, status: draftStatus, quoteStage: draftStage as Quote['quoteStage'], nextAction: draftNextAction, history: newHistory, ...snapshotUpdate});
                                                }
                                            }}
                                            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold h-10 rounded-xl"
                                        >
                                            <Save className="w-4 h-4 mr-2" /> Salvar Andamento
                                        </Button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-3 mt-4">
                                    {(() => {
                                        const stage = getEffectiveWorkflowStage(selectedQuote);
                                        
                                        return (
                                            <>
                                                {/* PRE_ORCAMENTO */}
                                                {stage === 'pre_orcamento' && (
                                                    <>
                                                        <Button 
                                                            onClick={() => selectedQuote && typeof onEdit === 'function' && onEdit(selectedQuote)}
                                                            className="h-14 rounded-2xl bg-slate-800 hover:bg-slate-900 text-white font-bold flex flex-col items-center justify-center gap-1 shadow-sm uppercase text-[10px]"
                                                        >
                                                            <FileEdit className="h-5 w-5" />
                                                            Editar Pré-Orçamento
                                                        </Button>
                                                        <Button 
                                                            variant="outline"
                                                            onClick={() => selectedQuote && onConvertToMeasurement(selectedQuote)}
                                                            className="h-14 rounded-2xl border-amber-200 bg-amber-50 text-amber-700 font-bold hover:bg-amber-100 flex flex-col items-center justify-center gap-1 shadow-sm uppercase text-[10px]"
                                                        >
                                                            <Ruler className="h-5 w-5" />
                                                            Agendar Medição Técnica
                                                        </Button>
                                                        <Button 
                                                            variant="outline"
                                                            onClick={() => selectedQuote && handleOpenStoreVisitModal(selectedQuote)}
                                                            className="h-14 rounded-2xl border-emerald-200 bg-emerald-50 text-emerald-700 font-bold hover:bg-emerald-100 flex flex-col items-center justify-center gap-1 shadow-sm uppercase text-[10px]"
                                                        >
                                                            <MapPin className="h-5 w-5" />
                                                            Agendar Visita na Loja
                                                        </Button>
                                                        <Button 
                                                            variant="outline"
                                                            onClick={() => selectedQuote && handleAdvanceToPostMeasurementManual(selectedQuote)}
                                                            className="h-14 rounded-2xl border-purple-200 bg-purple-50 text-purple-700 font-bold hover:bg-purple-100 flex flex-col items-center justify-center gap-1 shadow-sm uppercase text-[10px]"
                                                        >
                                                            <CheckCircle2 className="h-5 w-5" />
                                                            Orçamento Pós-Medição
                                                        </Button>
                                                    </>
                                                )}

                                                {/* AGUARDANDO_MEDICAO */}
                                                {stage === 'aguardando_medicao' && (
                                                    <>
                                                        <Button 
                                                            variant="outline"
                                                            onClick={() => selectedQuote && onConvertToMeasurement(selectedQuote)}
                                                            className="h-14 rounded-2xl border-indigo-200 bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100 flex flex-col items-center justify-center gap-1 shadow-sm uppercase text-[10px]"
                                                        >
                                                            <Ruler className="h-5 w-5" />
                                                            Ver Medição Agendada
                                                        </Button>
                                                        <Button 
                                                            variant="outline"
                                                            onClick={async () => {
                                                                if (selectedQuote && window.confirm('Medição finalizada? Converter este orçamento em Pós-Medição agora?')) {
                                                                    const isoNow = new Date().toISOString();
                                                                    const updates = {
                                                                        isPostMeasurement: true,
                                                                        quoteStage: 'pos_medicao',
                                                                        history: [
                                                                            ...safeHistoryArray(selectedQuote.history), 
                                                                            { 
                                                                                date: isoNow, 
                                                                                action: 'Convertido para Pós-Medição (Manual)',
                                                                                user: user?.displayName || user?.email || "Sistema"
                                                                            },
                                                                            {
                                                                                id: `status_change_${Date.now()}`,
                                                                                type: "status_change",
                                                                                from: selectedQuote.status || "aguardando_medicao",
                                                                                to: "pos_medicao",
                                                                                label: "Convertido para Pós-Medição",
                                                                                createdAt: isoNow,
                                                                                createdBy: user?.uid,
                                                                                createdByName: profile?.name || user?.email || "Sistema"
                                                                            }
                                                                        ],
                                                                        updatedAt: isoNow,
                                                                        updatedBy: user?.uid || "",
                                                                        updatedByName: profile?.name || user?.email || ""
                                                                    };
                                                                    await onUpdateQuote(selectedQuote.id, updates);
                                                                    setSelectedQuote({ ...selectedQuote, ...updates });
                                                                }
                                                            }}
                                                            className="h-14 rounded-2xl border-purple-200 bg-purple-50 text-purple-700 font-bold hover:bg-purple-100 flex flex-col items-center justify-center gap-1 shadow-sm uppercase text-[10px]"
                                                        >
                                                            <CheckCircle2 className="h-5 w-5" />
                                                            Orçamento Pós-Medição
                                                        </Button>
                                                    </>
                                                )}

                                                {/* POS_MEDIÇÃO & AGUARDANDO_APROVACAO */}
                                                {stage === 'aguardando_aprovacao' && (
                                                    <>
                                                        <Button 
                                                            onClick={() => selectedQuote && typeof onEdit === 'function' && onEdit(selectedQuote)}
                                                            className="h-14 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold flex flex-col items-center justify-center gap-1 shadow-sm uppercase text-[10px]"
                                                        >
                                                            <FileEdit className="h-5 w-5 text-blue-500" />
                                                            Revisar p/ Aprovação
                                                        </Button>
                                                        <Button 
                                                            variant="outline"
                                                            onClick={async () => {
                                                                if (selectedQuote) {
                                                                    const approvedUpdates = await approveQuoteAndFreeze(
                                                                        selectedQuote,
                                                                        companyData,
                                                                        profile?.name || 'Sistema'
                                                                    );
                                                                    onUpdateQuote(selectedQuote.id, approvedUpdates);
                                                                    setSelectedQuote({ ...selectedQuote, ...approvedUpdates });
                                                                }
                                                            }}
                                                            className="h-14 rounded-2xl border-emerald-200 bg-emerald-50 text-emerald-700 font-bold hover:bg-emerald-100 flex flex-col items-center justify-center gap-1 shadow-sm uppercase text-[10px]"
                                                        >
                                                            <CheckSquare className="h-5 w-5" />
                                                            Aprovar Agora
                                                        </Button>
                                                    </>
                                                )}

                                                {/* APROVADO / PÓS-MEDIÇÃO / REVISÃO COMERCIAL */}
                                                {canStartContract(selectedQuote) && (
                                                    <>
                                                        <Button 
                                                            onClick={() => selectedQuote && onDirectSale(selectedQuote)}
                                                            className="h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex flex-col items-center justify-center gap-1 shadow-lg shadow-emerald-500/20 uppercase text-[10px]"
                                                        >
                                                            <ShoppingCart className="h-5 w-5" />
                                                            Liberar para Produção
                                                        </Button>
                                                        <Button 
                                                            variant="outline" 
                                                            onClick={() => selectedQuote && onDirectSale(selectedQuote)}
                                                            className="h-14 rounded-2xl border-purple-200 bg-purple-50 text-purple-700 font-bold hover:bg-purple-100 flex flex-col items-center justify-center gap-1 shadow-sm uppercase text-[10px]"
                                                        >
                                                            <Download className="h-5 w-5" />
                                                            Gerar Contrato Digital
                                                        </Button>
                                                    </>
                                                )}

                                                {/* EM_PRODUCAO / FINALIZADO */}
                                                {(stage === 'em_producao' || stage === 'finalizado') && (
                                                    <Button 
                                                        variant="outline"
                                                        onClick={() => {
                                                            if (selectedQuote?.convertedToOrderId) {
                                                                navigate(`/producao/ordens?search=${selectedQuote.convertedToOrderId.slice(0, 8)}`);
                                                            }
                                                        }}
                                                        className="h-14 rounded-2xl border-slate-200 bg-slate-50 text-slate-700 font-bold hover:bg-slate-100 flex flex-col items-center justify-center gap-1 shadow-sm uppercase text-[10px]"
                                                    >
                                                        <Package className="h-5 w-5 text-teal-600" />
                                                        Acompanhar Produção
                                                    </Button>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>

                                {/* Edition Blocking Warning if applicable */}
                                {(getEffectiveWorkflowStage(selectedQuote) === 'aprovado' || getEffectiveWorkflowStage(selectedQuote) === 'em_producao') && (
                                    <div className="text-center p-3 bg-rose-50 dark:bg-rose-900/10 rounded-2xl border border-rose-100 dark:border-rose-900/20 mt-2">
                                        <p className="text-[10px] font-black uppercase text-rose-500 tracking-widest flex items-center justify-center gap-2">
                                            <Lock className="w-3 h-3" /> Orçamento Congelado p/ Edição
                                        </p>
                                    </div>
                                )}
                                {/* Edition Button - Only if not frozen */}
                                {canEditQuote(selectedQuote) && (
                                    <Button 
                                        variant="ghost" 
                                        onClick={() => selectedQuote && typeof onEdit === 'function' && onEdit(selectedQuote)}
                                        className="h-12 rounded-2xl font-bold text-slate-500 flex items-center justify-center gap-2 mt-2"
                                    >
                                        <FileEdit className="h-4 w-4" /> Editar Proposta Completa
                                    </Button>
                                )}

                                <Button 
                                    variant="ghost" 
                                    onClick={() => selectedQuote && handleDeleteClick(selectedQuote)}
                                    className="h-12 rounded-2xl font-bold text-rose-500 flex items-center justify-center gap-2 hover:bg-rose-50"
                                >
                                    <Trash2 className="h-4 w-4" /> Arquivar Orçamento
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        {/* SELLER DETAIL DRAWER */}
        {isSellerDrawerOpen && (
            <div className="fixed inset-0 z-[60] overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity duration-300 pointer-events-auto" 
                    onClick={() => setIsSellerDrawerOpen(false)} />
                <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white dark:bg-slate-900 shadow-2xl pointer-events-auto flex flex-col transition-transform duration-500 translate-x-0 border-l border-slate-200 dark:border-white/5 no-scrollbar overflow-y-auto">
                    {(() => {
                        const seller = sellerStats.find(s => s.id === selectedSellerId);
                        if (!seller) return null;

                        return (
                            <div className="p-8 space-y-8">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-4">
                                        <div className="h-16 w-16 bg-teal-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-teal-500/20">
                                            <UserCircle2 className="h-10 w-10" />
                                        </div>
                                        <div>
                                            <h3 className="text-[10px] font-black text-teal-600 uppercase tracking-[0.3em] mb-1">Perfil do Vendedor</h3>
                                            <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none">{seller.name}</h2>
                                        </div>
                                    </div>
                                    <Button variant="ghost" className="h-12 w-12 p-0 rounded-full hover:bg-slate-100" onClick={() => setIsSellerDrawerOpen(false)}>
                                        <X className="h-6 w-6 text-slate-400" />
                                    </Button>
                                </div>
    
                                {/* Seller KPIs */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-100 dark:border-white/5">
                                        <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Total Faturado</span>
                                        <div className="text-xl font-black text-slate-900 dark:text-white">R$ {seller.totalSold.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-100 dark:border-white/5">
                                        <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Score Geral</span>
                                        <div className="text-xl font-black text-teal-600">{seller.score.toFixed(1)}</div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-100 dark:border-white/5">
                                        <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Ticket Médio</span>
                                        <div className="text-xl font-black text-slate-900 dark:text-white">R$ {seller.avgTicket.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-2xl border border-slate-100 dark:border-white/5">
                                        <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">Conversão</span>
                                        <div className="text-xl font-black text-emerald-600">{seller.conversion.toFixed(1)}%</div>
                                    </div>
                                </div>
                                
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Atividade Comercial</label>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-white/5 text-center">
                                            <div className="text-2xl font-black text-slate-700 dark:text-slate-200">{seller.quotesCount}</div>
                                            <div className="text-[9px] font-bold text-slate-400 uppercase mt-1">Orçamentos</div>
                                        </div>
                                        <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-white/5 text-center">
                                            <div className="text-2xl font-black text-slate-700 dark:text-slate-200">{seller.measurementsCount}</div>
                                            <div className="text-[9px] font-bold text-slate-400 uppercase mt-1">Medições</div>
                                        </div>
                                        <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-white/5 text-center">
                                            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{seller.salesCount}</div>
                                            <div className="text-[9px] font-bold text-slate-400 uppercase mt-1">Fechamentos</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        )}

        {/* Hidden PDF Engine Trigger */}
        {activeQuoteForPdf && (
            <div style={{ position: 'absolute', left: '-9999px', top: '0', width: '210mm' }}>
                <div ref={printRef} className="bg-white">
                    <QuotePrintTemplate 
                        customerName={activeQuoteForPdf.customerName}
                        customerPhone={activeQuoteForPdf.customerPhone}
                        customerAddress={activeQuoteForPdf.customerAddress}
                        observations={activeQuoteForPdf.observations}
                        groups={activeQuoteForPdf.groups || []}
                        accessories={activeQuoteForPdf.accessories || []}
                        services={activeQuoteForPdf.services || []}
                        discount={activeQuoteForPdf.discount || 0}
                        totalAmount={(activeQuoteForPdf.commercialTotal || 0) + (activeQuoteForPdf.operationalCost || 0) + (activeQuoteForPdf.freight || 0)}
                        includeInstallation={activeQuoteForPdf.includeInstallation !== false}
                        manualInstallation={activeQuoteForPdf.manualInstallation || null}
                        companyData={companyData as any}
                        sellerName={activeQuoteForPdf.sellerName}
                        clientId={activeQuoteForPdf.clientId || ''}
                        quoteSnapshot={activeQuoteForPdf as any}
                        layoutOverride={layoutOverrideForPdf || undefined}
                        isPostMeasurement={activeQuoteForPdf.isPostMeasurement}
                        quoteStage={activeQuoteForPdf.quoteStage}
                    />
                </div>
            </div>
        )}

        <LayoutSelectorModal 
            isOpen={isLayoutModalOpen}
            onClose={() => setIsLayoutModalOpen(false)}
            onSelect={handleSelectLayout}
            defaultLayout={companyData?.quoteLayout}
        />


        
        <DeleteQuoteModal
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
            onConfirm={handleConfirmDelete}
            quote={quoteToDelete}
        />
        
        {isStoreVisitModalOpen && (
            <StoreVisitFormModal
                isOpen={isStoreVisitModalOpen}
                onClose={() => {
                    setIsStoreVisitModalOpen(false);
                    setStoreVisitPrefill(null);
                }}
                visit={storeVisitPrefill}
                selectedDate={new Date()}
            />
        )}
    </div>
);
};
