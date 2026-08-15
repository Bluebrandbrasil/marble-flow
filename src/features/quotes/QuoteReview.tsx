import { safeArray, safeHistoryArray } from '../../lib/dataDiagnostics';
import { formatVisualDate } from '../../lib/dateUtils';
import React, { useRef, useState, useMemo, useEffect } from 'react';

import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { 
    Trash2, Edit2, CheckCircle2, Package, Truck, Tag,
    Download, Image as ImageIcon, Printer, Plus, ChevronRight, MessageSquare, Lock, RefreshCw, Info, Clock, AlertTriangle, Sparkles, AlertCircle, ShieldCheck, Save
} from 'lucide-react';
import { CommercialAssistantPanel } from './CommercialAssistantPanel';
import type { Quote, StoneGroup, QuoteAccessory, QuoteService, PaymentConditions, PaymentInstallment } from '../../types';
import { validateQuoteBeforeApproval, validatePaymentConditions, auditQuoteCalculations } from '../../utils/quoteCalculations';
import { QuotePrintTemplate } from './QuotePrintTemplate';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useCompanyData } from '../../hooks/useCompanyData';
import { useSinkCatalog } from '../../hooks/useSinkCatalog';
import { useAccessoryCatalog } from '../../hooks/useAccessoryCatalog';
import { useServiceCatalog } from '../../hooks/useServiceCatalog';
import { Modal } from '../../components/ui/Modal';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { cn } from '../../lib/utils';
import { LayoutSelectorModal } from './LayoutSelectorModal';
import { PaymentConditionsForm } from '../../components/financial/PaymentConditionsForm';
import { canStartContract } from '../../components/workflow/WorkflowStatus';

const getEnvironmentMetrics = (pieces: any[]) => {
    let tampoSqm = 0;
    let frontaoRodapeSqm = 0;
    let saiaBordaSqm = 0;
    let totalSqm = 0;

    (pieces || []).forEach(p => {
        const width = Number(p.width || 0);
        const height = Number(p.height || 0);
        const qty = Number(p.quantity || 0);
        const sqm = Number(p.sqm) || (width * height * qty);
        
        totalSqm += sqm;

        const type = String(p.type || '').toLowerCase();
        const label = String(p.label || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        if (type === 'tampo' || label.includes('tampo')) {
            tampoSqm += sqm;
        } else if (
            type === 'frontao' || 
            type === 'rodabase' || 
            label.includes('frontao') || 
            label.includes('rodape') || 
            label.includes('rodap') || 
            label.includes('rodab')
        ) {
            frontaoRodapeSqm += sqm;
        } else if (
            type === 'saia' || 
            type === 'lateral' || 
            label.includes('saia') || 
            label.includes('borda') || 
            label.includes('acabamento') || 
            label.includes('lateral')
        ) {
            saiaBordaSqm += sqm;
        }
    });

    return {
        tampoSqm,
        frontaoRodapeSqm,
        saiaBordaSqm,
        totalSqm
    };
};

interface QuoteReviewProps {
    groups: StoneGroup[];
    accessories: QuoteAccessory[];
    services: QuoteService[];
    operationalCost: number;
    discount: number;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    sellerName?: string;
    observations?: string;

    onEditGroup: (index: number) => void;
    onRemoveGroup: (index: number) => void;
    onUpdateGroups: (groups: StoneGroup[]) => void;
    onUpdateAccessories: (accessories: QuoteAccessory[]) => void;
    onUpdateServices: (services: QuoteService[]) => void;
    onUpdateDiscount: (discount: number) => void;
    onUpdateObservations: (observations: string) => void;

    includeInstallation: boolean;
    onUpdateIncludeInstallation: (include: boolean) => void;
    manualInstallation: { value: number; description: string } | null;
    onUpdateManualInstallation: (manual: { value: number; description: string } | null) => void;
    protocolNumber?: string;

    onSave: (approve?: boolean, pc?: PaymentConditions) => Promise<void>;
    isLoading?: boolean;
    autoDownload?: boolean;
    
    // Novas props para unificar o cálculo
    calculatedData?: any;
    isFrozen?: boolean;
    quoteSnapshot?: Partial<Quote>;
    onReviseApprovedQuote?: (reason: string) => Promise<void>;
    history?: any[];
    isLatestVersion?: boolean;
    supersededBy?: string;
    isPostMeasurement?: boolean;
    paymentConditions?: PaymentConditions;
    onUpdatePaymentConditions?: (pc: PaymentConditions) => void;
    onOpenRevisionModal?: () => void;
    quoteStage?: string;
    status?: string;
}

export const QuoteReview: React.FC<QuoteReviewProps> = ({ 
    groups, 
    accessories, 
    services, 
    operationalCost,
    discount,
    customerName,
    customerPhone,
    customerAddress,
    sellerName,
    observations,
    quoteStage,
    status,

    onEditGroup, 
    onRemoveGroup,
    onUpdateGroups,
    onUpdateAccessories,
    onUpdateServices,
    onUpdateDiscount,
    onUpdateObservations,

    includeInstallation,
    onUpdateIncludeInstallation,
    manualInstallation,
    onUpdateManualInstallation,
    protocolNumber,

    onSave,

    isLoading,
    autoDownload,
    calculatedData,
    isFrozen,
    quoteSnapshot,
    onReviseApprovedQuote,
    history,
    isLatestVersion,
    supersededBy,
    isPostMeasurement,
    paymentConditions,
    onUpdatePaymentConditions,
    onOpenRevisionModal
}) => {
    const { companyData } = useCompanyData();
    const { sinks } = useSinkCatalog();
    const { accessories: accessoryCatalog } = useAccessoryCatalog();
    const { services: serviceCatalog } = useServiceCatalog();

    const [isExporting, setIsExporting] = useState(false);
    const [isAccModalOpen, setIsAccModalOpen] = useState(false);
    const [isSrvModalOpen, setIsSrvModalOpen] = useState(false);
    const [editingAccIndex, setEditingAccIndex] = useState<number | null>(null);
    const [editingSrvIndex, setEditingSrvIndex] = useState<number | null>(null);

    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentDraft, setPaymentDraft] = useState<PaymentConditions | null>(paymentConditions || null);

    const [isInstModalOpen, setIsInstModalOpen] = useState(false);
    const [instDraft, setInstDraft] = useState<{ value: number; description: string }>({ value: 0, description: '' });

    const [localAccessories, setLocalAccessories] = useState<QuoteAccessory[]>([]);
    const [localServices, setLocalServices] = useState<QuoteService[]>([]);

    // Draft state for Modals
    const [accDraft, setAccDraft] = useState<Partial<QuoteAccessory>>({ type: 'cuba', name: '', quantity: 1, unitPrice: 0 });
    const [srvDraft, setSrvDraft] = useState<Partial<QuoteService>>({ type: 'servico', description: '', quantity: 1, unitPrice: 0 });

    const [isLayoutModalOpen, setIsLayoutModalOpen] = useState(false);
    const [pendingExportType, setPendingExportType] = useState<'pdf' | 'print' | 'jpg' | null>(null);
    


    // Environment Selection for Customer Provided Items
    const [selectedEnvIndexForProvidedItems, setSelectedEnvIndexForProvidedItems] = useState<number>(0);

    const printRef = useRef<HTMLDivElement>(null);

    // Use passed calculations if available, otherwise fallback to local calculation 
    // (though QuotePage should always pass it now)
    const subtotalStones = (calculatedData?.stonesSubtotal ?? (groups || []).reduce((acc: number, g: any) => acc + (Number(g?.groupTotal || 0)), 0)) || 0;
    const subtotalAccessories = (calculatedData?.accessoriesSubtotal ?? (accessories || []).reduce((acc: number, a: any) => acc + (Number(a?.total || 0)), 0)) || 0;
    const subtotalServices = (calculatedData?.servicesSubtotal ?? (services || []).reduce((acc: number, s: any) => acc + (Number(s?.price || 0)), 0)) || 0;
    
    // subtotal = Stones + Accessories + Services (Gross value before discount)
    const subtotal = calculatedData?.subtotalBruto ?? (subtotalStones + subtotalAccessories + subtotalServices);
        // SYSTEM LAW [RULE #35]: Snapshot is absolute priority for display when frozen/approved.
    const isActuallyFrozen = !!(isFrozen && quoteSnapshot && (quoteSnapshot.total || quoteSnapshot.totalAmount));
    const displayGroups = isActuallyFrozen ? (quoteSnapshot?.groups || []) : (calculatedData?.groups || groups);
    const displayAccessories = isActuallyFrozen ? (quoteSnapshot?.accessories || []) : accessories;
    const displayServices = isActuallyFrozen ? (quoteSnapshot?.services || []) : services;

    const snapTotal = quoteSnapshot?.totalAmount ?? quoteSnapshot?.total ?? 0;
    const snapSubtotal = quoteSnapshot?.subtotal ?? (isActuallyFrozen ? snapTotal : 0);
    const snapInstallation = (quoteSnapshot as any)?.effectiveInstallation ?? 0;
    const snapDiscount = quoteSnapshot?.discount ?? 0;

    // Rule #30: centralized calculation in quoteCalculations.ts.
    const fallbackInstallation = includeInstallation ? (manualInstallation?.value || 0) + (operationalCost || 0) : 0;
    const finalInstallation = isActuallyFrozen 
        ? ((quoteSnapshot as any)?.effectiveInstallation ?? snapInstallation) 
        : (calculatedData?.operationalCost ?? (calculatedData?.effectiveInstallation ?? fallbackInstallation));

    const finalSubtotal = isActuallyFrozen ? snapSubtotal : (calculatedData?.subtotalBruto ?? subtotal);
    const finalDiscount = isActuallyFrozen ? snapDiscount : (discount || 0);
    const finalFreight = isActuallyFrozen ? (quoteSnapshot?.freight ?? 0) : (calculatedData?.freight ?? 0);

    // ONE SOURCE OF TRUTH FOR TOTAL
    const total = isActuallyFrozen 
        ? (Number(snapTotal) || 0)
        : (Number(calculatedData?.total) || (Number(finalSubtotal || 0) + (Number(finalFreight) || 0) - (Number(finalDiscount) || 0)));

    // For compatibility with legacy debug/logs
    const effectiveInstallation = finalInstallation;

    // [TOTAL DEBUG] - Diagnostics for integrity audit
    if (total <= 0 && ((displayGroups || []).length > 0)) {
        console.error("[CRITICAL TOTAL BUG]", {
            id: (quoteSnapshot as any)?.id,
            total,
            finalSubtotal,
            finalInstallation,
            finalFreight,
            finalDiscount,
            includeInstallation,
            isActuallyFrozen,
            snapTotal,
            source: calculatedData ? 'calculatedData' : 'fallback'
        });
    }

    // --- AUDITORIA AUTOMÁTICA (Rule #50) ---
    const auditResults = useMemo(() => {
        if (isActuallyFrozen) return { isValid: true, errors: [], details: {} as any, environmentErrors: [] };
        
        const res = auditQuoteCalculations(
            displayGroups,
            subtotalStones,
            subtotalAccessories,
            subtotalServices,
            finalDiscount,
            finalFreight,
            total,
            finalInstallation
        );

        if (!res.isValid) {
            console.error("❌ [AUDIT FAIL] Inconsistência detectada:", res.errors);
        } else {
            console.log("✅ [AUDIT SUCCESS] Integridade financeira confirmada:", {
                stonesSubtotal: subtotalStones,
                installationTotal: finalInstallation,
                accessoriesTotal: subtotalAccessories,
                servicesTotal: subtotalServices,
                discount: finalDiscount,
                finalTotal: total
            });
        }
        
        return res;
    }, [displayGroups, subtotalStones, subtotalAccessories, subtotalServices, finalDiscount, finalFreight, total, finalInstallation, isActuallyFrozen]);

    const handleFixCalculations = () => {
        // Força a recalculação sincronizando o estado com o pai
        onUpdateGroups([...groups]);
        onUpdateAccessories([...accessories]);
        onUpdateServices([...services]);
        console.log("🛠️ [AUTO-FIX] Recalculando tudo do zero...");
    };

    const standardizeNomenclature = (text: string) => {
        if (!text) return '';
        const lower = text.toLowerCase().trim();
        
        // Specific Mappings
        if (lower.includes('brinde') || lower.includes('cortesia')) return 'Cortesia: Cortes e Furos';
        if (lower === 'cuba' || lower === 'furo de cuba' || lower === 'corte cuba' || lower === 'recorte cuba') return 'Recorte da Cuba';
        if (lower.includes('torneira') || lower === 'furo torneira') return 'Furo para Torneira';
        if (lower.includes('cooktop') || lower === 'furo cooktop') return 'Corte para Cooktop';
        if (lower === 'frontao' || lower === 'rodape') return 'Frontão / Rodapé';
        if (lower === 'saia' || lower === 'vocal') return 'Acabamento de Saia / Borda';
        
        // Standard Title Case
        return text.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    };

    const getProjectSummaryMetrics = (groupsList: any[]) => {
        const envMap: { [name: string]: number } = {};
        const matSummary: { [materialName: string]: number } = {};
        
        let totalEnvironments = 0;
        let totalPieces = 0;
        let totalStoneArea = 0;
        let totalFrontaoLinear = 0;
        let totalSaiaLinear = 0;
        let totalInstLinear = 0;

        safeArray(groupsList).forEach(group => {
            const groupQty = Number(group.quantity || 0);
            totalEnvironments += groupQty;

            let groupSqm = 0;
            let groupFrontaoLinear = 0;
            let groupSaiaLinear = 0;
            let groupInstLinear = 0;

            safeArray(group.pieces).forEach(p => {
                const width = Number(p.width || 0);
                const height = Number(p.height || 0);
                const qty = Number(p.quantity || 0);
                const pieceSqm = Number(p.sqm) || (width * height * qty);
                
                totalPieces += qty * groupQty;
                groupSqm += pieceSqm;

                const type = String(p.type || '').toLowerCase();
                const label = String(p.label || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                const linearLength = width * qty;

                if (
                    type === 'frontao' || 
                    type === 'rodabase' || 
                    label.includes('frontao') || 
                    label.includes('rodape') || 
                    label.includes('rodap') || 
                    label.includes('rodab')
                ) {
                    groupFrontaoLinear += linearLength;
                    groupInstLinear += linearLength;
                } else if (
                    type === 'saia' || 
                    type === 'lateral' || 
                    label.includes('saia') || 
                    label.includes('borda') || 
                    label.includes('acabamento') || 
                    label.includes('lateral')
                ) {
                    groupSaiaLinear += linearLength;
                }
            });

            const totalGroupArea = groupSqm * groupQty;
            totalStoneArea += totalGroupArea;
            totalFrontaoLinear += groupFrontaoLinear * groupQty;
            totalSaiaLinear += groupSaiaLinear * groupQty;
            totalInstLinear += groupInstLinear * groupQty;

            const envName = standardizeNomenclature(group.environmentName || 'Ambiente');
            envMap[envName] = (envMap[envName] || 0) + totalGroupArea;

            const matName = group.materialName || 'Material não informado';
            if (!matSummary[matName]) {
                matSummary[matName] = 0;
            }
            matSummary[matName] += totalGroupArea;
        });

        return {
            envMap,
            matSummary,
            totalEnvironments,
            totalPieces,
            totalStoneArea,
            totalFrontaoLinear,
            totalSaiaLinear,
            totalInstLinear
        };
    };

    // --- RULE #40: PRE-APPROVAL FINANCIAL GUARD ---
    const validation = validateQuoteBeforeApproval(
        { groups, accessories, services, discount, freight: finalFreight } as any,
        calculatedData
    );

    const canStart = canStartContract({ quoteStage, status } as any) || !!isPostMeasurement;

    const handleInitiateFinalization = () => {
        if (isFrozen && onOpenRevisionModal) {
            onOpenRevisionModal();
            return;
        }
        if (!validation.isValid) return;
        onSave(false);
    };

    const handleConfirmPaymentAndSave = () => {
        const interestAmount = paymentDraft?.interest?.enabled ? paymentDraft.interest.amount : 0;
        const financedTotal = total + interestAmount;
        const totalParcelado = (paymentDraft?.installments || []).reduce((acc, i) => acc + i.amount, 0);
        const faltaAlocar = financedTotal - totalParcelado;
        const isBalanced = Math.abs(faltaAlocar) < 0.05;
        
        // O bloqueio obrigatório para aprovação foi removido da tela de edição
        
        if (isBalanced) {
            localStorage.setItem('mf_last_payment_config', JSON.stringify(paymentDraft));
        }

        if (onUpdatePaymentConditions) {
            onUpdatePaymentConditions(paymentDraft as PaymentConditions);
        } else {
            // Se for apenas edição manual via botão de pagamento, salva como rascunho
            onSave(false, paymentDraft as PaymentConditions);
        }
        
        setIsPaymentModalOpen(false);
        setIsFinalizing(false);
    };



    const getExportFileName = (extension: string) => {
        const isPostPDF = isPostMeasurement === true || (quoteSnapshot as any)?.isPostMeasurement === true || (quoteSnapshot as any)?.quoteStage === 'pos_medicao';
        const prefix = isPostPDF ? 'POS MEDIÇÃO' : 'ORÇAMENTO PREVIO';
        
        const safeCustomer = String(customerName || 'CLIENTE')
            .toUpperCase()
            .trim()
            .replace(/[^\w\sà-üÀ-Ü]/g, '')
            .replace(/\s+/g, ' ');
            
        const mainStoneName = displayGroups[0]?.materialName || (displayGroups[0] as any)?.material?.name || '';
        const stoneAbbr = mainStoneName
            ? mainStoneName.toUpperCase()
                .replace(/CLIENTE|PREMIUM|TIPO|PADRÃO/g, '')
                .trim()
                .split(' ')
                .filter(w => w.length > 2)
                .map(w => w[0])
                .join('')
            : '';

        const fileName = `${prefix} ${safeCustomer} ${stoneAbbr}`.trim().replace(/\s+/g, ' ');
        return `${fileName}.${extension}`;
    };

    const handleExportJPG = async () => {
        if (!printRef.current) return;
        setIsExporting(true);
        await new Promise(resolve => setTimeout(resolve, 500)); 

        try {
            const canvas = await html2canvas(printRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                windowWidth: 1200
            });
            const link = document.createElement('a');
            link.download = getExportFileName('jpg');
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.click();
        } catch (err) {
            console.error("Erro ao exportar imagem:", err);
            alert("Erro ao gerar imagem. Tente novamente.");
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportPDF = async () => {
        if (!printRef.current) return;
        setIsExporting(true);
        // Wait for styles and images to fully settle
        await new Promise(resolve => setTimeout(resolve, 800)); 

        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 10;
            const contentWidth = pageWidth - (margin * 2);
            let currentY = margin;

            const blockElements = Array.from(printRef.current.querySelectorAll('.pdf-export-block')) as HTMLElement[];

            if (blockElements.length === 0) {
               console.warn("[PDF Export] Nenhum bloco de PDF encontrado.");
               setIsExporting(false);
               return;
            }

            // Pre-calculate full container scroll height to prevent html2canvas off-screen clipping
            const fullScrollHeight = printRef.current.scrollHeight;

            for (let i = 0; i < blockElements.length; i++) {
                const el = blockElements[i];

                // Capturar o bloco com escala alta para nitidez
                const canvas = await html2canvas(el, { 
                    scale: 2.5, 
                    useCORS: true, 
                    backgroundColor: '#ffffff',
                    logging: false,
                    scrollY: 0,
                    windowHeight: el.scrollHeight // Captura a altura real do elemento
                });
                
                const imgWidth = contentWidth;
                const imgHeight = (canvas.height * contentWidth) / canvas.width;

                // PROTEÇÃO: Se o bloco atual ultrapassar o limite da página (considerando margem inferior)
                // Adicionamos uma nova página e resetamos o Y para a margem superior
                if (currentY + imgHeight > pageHeight - margin) {
                    pdf.addPage();
                    currentY = margin;
                }

                // Inserir o bloco na posição calculada
                pdf.addImage(
                    canvas.toDataURL('image/png', 1.0), 
                    'PNG', 
                    margin, 
                    currentY, 
                    imgWidth, 
                    imgHeight,
                    undefined,
                    'FAST'
                );

                // Incrementar Y com um pequeno respiro entre blocos
                currentY += imgHeight + 2; 
            }

            pdf.save(getExportFileName('pdf'));

        } catch (err) {
            console.error("Erro ao exportar PDF:", err);
            alert("Erro ao gerar PDF. Tente novamente.");
        } finally {
            setIsExporting(false);
        }
    };

    const handlePrint = async () => {
        if (!printRef.current) return;
        setIsExporting(true);
        
        // Native printing is more reliable for multi-page CSS than image capture
        const printContent = printRef.current.innerHTML;
        const printWindow = window.open('', '_blank');
        
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Imprimir Orçamento - ${customerName}</title>
                        <link rel="stylesheet" href="/src/index.css">
                        <style>
                            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                            body { margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
                            @media print {
                                @page { size: A4; margin: 15mm 10mm; }
                                .no-print { display: none !important; }
                            }
                            /* Inline the critical CSS from QuotePrintTemplate to ensure it works in the new window */
                            .print-sheet { width: 100%; display: block; border: none; box-shadow: none; padding: 0; }
                            .modern-table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; }
                            .modern-table thead { display: table-header-group; }
                            .modern-table tr { break-inside: avoid; }
                            .break-avoid { break-inside: avoid; }
                        </style>
                    </head>
                    <body>
                        ${printContent}
                        <script>
                            window.onload = () => {
                                setTimeout(() => {
                                    window.print();
                                    window.close();
                                }, 500);
                            };
                        </script>
                    </body>
                </html>
            `);
            printWindow.document.close();
            setIsExporting(false);
        }
    };

    const handleSelectLayout = async (layout: string, exportType?: 'pdf' | 'print' | 'jpg') => {
        setIsLayoutModalOpen(false);
        const type = exportType || pendingExportType;
        
        if (type === 'pdf') await handleExportPDF();
        else if (type === 'print') await handlePrint();
        else if (type === 'jpg') await handleExportJPG();
        
        setPendingExportType(null);
    };

    const openLayoutSelector = (type: 'pdf' | 'print' | 'jpg') => {
        // Direct execution for 'commercial' layout as requested by current flow
        handleSelectLayout('commercial', type);
    };

    // Auto-download Trigger
    React.useEffect(() => {
        if (autoDownload && !isExporting && (groups || []).length > 0) {
            handleExportPDF();
        }
    }, [autoDownload, (groups || []).length]);

    // --- Accessory Handlers ---
    const openAddAcc = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setLocalAccessories([...accessories]);
        setAccDraft({ type: 'cuba', name: '', quantity: 1, unitPrice: 0 });
        setEditingAccIndex(null);
        setIsAccModalOpen(true);
    };

    const openEditAcc = (index: number) => {
        setAccDraft(accessories[index]);
        setEditingAccIndex(index);
        setLocalAccessories([...accessories]);
        setIsAccModalOpen(true);
    };

    // This now only updates the LOCAL list in the modal
    const addToLocalAcc = () => {
        if (!accDraft.name || !accDraft.quantity || accDraft.unitPrice === undefined) return;
        const finalItem: QuoteAccessory = {
            id: accDraft.id || crypto.randomUUID(),
            type: accDraft.type || 'cuba',
            name: String(accDraft.name || ''),
            accessoryId: accDraft.accessoryId,
            quantity: Number(accDraft.quantity) || 1,
            unitPrice: Number(accDraft.unitPrice) || 0,
            total: (Number(accDraft.quantity) || 0) * (Number(accDraft.unitPrice) || 0)
        };

        if (editingAccIndex !== null) {
            const newAcc = [...localAccessories];
            newAcc[editingAccIndex] = finalItem;
            setLocalAccessories(newAcc);
            setEditingAccIndex(null);
        } else {
            setLocalAccessories([...localAccessories, finalItem]);
        }
        
        // Reset form for next item
        setAccDraft({ type: 'cuba', name: '', quantity: 1, unitPrice: 0 });
    };

    const saveAcc = () => {
        onUpdateAccessories(localAccessories);
        setIsAccModalOpen(false);
    };

    const removeAcc = (index: number, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setLocalAccessories(safeArray(localAccessories).filter((_, i) => i !== index));
        if (editingAccIndex === index) setEditingAccIndex(null);
    };

    // --- Service Handlers ---
    const openAddSrv = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setLocalServices([...services]);
        setSrvDraft({ type: 'servico', description: '', quantity: 1, unitPrice: 0 });
        setEditingSrvIndex(null);
        setIsSrvModalOpen(true);
    };

    const openEditSrv = (index: number) => {
        setSrvDraft(services[index]);
        setEditingSrvIndex(index);
        setLocalServices([...services]);
        setIsSrvModalOpen(true);
    };

    const addToLocalSrv = () => {
        if (!srvDraft.description || !srvDraft.quantity || srvDraft.unitPrice === undefined) return;
        const finalItem: QuoteService = {
            id: srvDraft.id || crypto.randomUUID(),
            type: srvDraft.type || 'servico',
            description: String(srvDraft.description || ''),
            quantity: Number(srvDraft.quantity) || 1,
            unitPrice: Number(srvDraft.unitPrice) || 0,
            price: (Number(srvDraft.quantity) || 0) * (Number(srvDraft.unitPrice) || 0)
        };

        if (editingSrvIndex !== null) {
            const newSrv = [...localServices];
            newSrv[editingSrvIndex] = finalItem;
            setLocalServices(newSrv);
            setEditingSrvIndex(null);
        } else {
            setLocalServices([...localServices, finalItem]);
        }
        
        // Reset form
        setSrvDraft({ type: 'servico', description: '', quantity: 1, unitPrice: 0 });
    };

    const saveSrv = () => {
        onUpdateServices(localServices);
        setIsSrvModalOpen(false);
    };

    const removeSrv = (index: number, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setLocalServices(safeArray(localServices).filter((_, i) => i !== index));
        if (editingSrvIndex === index) setEditingSrvIndex(null);
    };

    // --- Installation Handlers ---
    const openEditInst = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setInstDraft({ 
            value: manualInstallation?.value ?? 0, 
            description: manualInstallation?.description ?? 'Instalação Técnica' 
        });
        setIsInstModalOpen(true);
    };

    const saveInst = () => {
        onUpdateManualInstallation(instDraft);
        setIsInstModalOpen(false);
    };

    const removeInst = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        onUpdateManualInstallation(null);
        onUpdateIncludeInstallation(false);
    };


    return (
        <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/50 relative">
            {isLatestVersion === false && (
                <div className="bg-amber-500 text-white py-3 px-6 text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 animate-in slide-in-from-top duration-500">
                    <Clock className="w-4 h-4" /> 
                    <span>CUIDADO: ESTA É UMA VERSÃO ANTERIOR (SUBSTITUÍDA)</span>
                    {supersededBy && (
                         <Button 
                            variant="outline" 
                            className="bg-white/20 border-white/40 text-white hover:bg-white/30 h-8 text-[9px] dark:hover:bg-white/10"
                            onClick={() => {
                                window.location.href = `/orcamentos/${supersededBy}/editar`;
                            }}
                         >
                            Ver Versão Atual
                         </Button>
                    )}
                </div>
            )}
            {/* Template para Captura (Oculto da tela principal mas disponível para html2canvas) */}
            <div style={{ position: 'absolute', left: '-9999px', top: '0', width: '210mm', height: 'auto', overflow: 'visible' }}>
                 <div ref={printRef} className="bg-white">
                        <QuotePrintTemplate 
                            customerName={customerName}
                            customerPhone={customerPhone}
                            customerAddress={customerAddress}
                            observations={observations}
                            groups={displayGroups}
                            accessories={displayAccessories}
                            services={displayServices}
                            discount={finalDiscount}
                            totalAmount={total}
                            includeInstallation={includeInstallation}
                            manualInstallation={manualInstallation}
                            companyData={companyData as any}
                            sellerName={sellerName}
                            calculatedData={calculatedData}
                            quoteSnapshot={quoteSnapshot}
                            protocolNumber={protocolNumber}
                            isPostMeasurement={isPostMeasurement}
                            layoutOverride="commercial"
                        />
                 </div>
            </div>

            {!isFrozen && (
                <CommercialAssistantPanel 
                    sellerName={sellerName || 'Consultor'}
                    onApplyDiscount={onUpdateDiscount}
                    quote={{
                        customerName,
                        customerPhone,
                        commercialTotal: total,
                        discount: finalDiscount,
                        createdAt: (quoteSnapshot as any)?.createdAt || new Date().toISOString(),
                        lastFollowUpAt: (quoteSnapshot as any)?.lastFollowUpAt,
                        status: isActuallyFrozen ? 'approved' : 'draft',
                        quoteStage: isActuallyFrozen ? 'aprovado' : (isPostMeasurement ? 'pos_medicao' : 'pre_orcamento'),
                        history: history || []
                    }}
                />
            )}

            <main className="flex-1 overflow-y-auto min-h-0">
                <div className="max-w-full mx-auto p-4 md:p-8 space-y-8 pb-32">
                    {/* AUDIT WARNING BANNER */}
                    {!auditResults.isValid && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-3xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
                            <div className="flex items-center gap-5">
                                <div className="p-4 bg-red-100 dark:bg-red-900/40 rounded-2xl shrink-0">
                                    <AlertTriangle className="w-8 h-8 text-red-600" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-base font-black uppercase tracking-[0.15em] text-red-800 dark:text-red-200 leading-none">
                                        Divergência de Cálculo Detectada
                                    </h3>
                                    <ul className="text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-tight list-disc list-inside">
                                        {safeArray(auditResults.errors).map((err, i) => <li key={i}>{err}</li>)}
                                    </ul>
                                </div>
                            </div>
                            <Button 
                                onClick={handleFixCalculations}
                                className="bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest gap-2 h-12 px-6 rounded-2xl shadow-lg shadow-red-500/20"
                            >
                                <RefreshCw className="w-4 h-4" /> Corrigir Automaticamente
                            </Button>
                        </div>
                    )}

                    
                    
                    {/* ITENS FORNECIDOS PELO CLIENTE (Global Control) */}
                    <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4 duration-700">
                        <div className="p-6 md:p-8">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                                {/* ESQUERDA: Identificação */}
                                <div className="lg:col-span-6 flex items-center gap-5">
                                    <div className="p-4 bg-brand-emerald/10 dark:bg-brand-emerald/5 rounded-2xl shrink-0">
                                        <Package className="w-8 h-8 text-brand-emerald" />
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="text-base font-black uppercase tracking-[0.15em] text-slate-800 dark:text-slate-100 leading-none">
                                            Itens Fornecidos pelo Cliente
                                        </h3>
                                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-tight leading-relaxed">
                                            Selecione o ambiente e marque o que o cliente irá fornecer
                                        </p>
                                    </div>
                                </div>

                                {/* DIREITA: Controles */}
                                <div className="lg:col-span-6">
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-4 justify-end">
                                        <div className="flex-1 max-w-sm space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">
                                                Visualizar Ambiente
                                            </label>
                                            <div className="relative">
                                                <select 
                                                    value={selectedEnvIndexForProvidedItems}
                                                    onChange={(e) => setSelectedEnvIndexForProvidedItems(Number(e.target.value))}
                                                    className="w-full h-12 pl-4 pr-10 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black uppercase tracking-wider focus:ring-2 focus:ring-brand-emerald/20 transition-all outline-none appearance-none cursor-pointer"
                                                >
                                                    {safeArray(displayGroups).map((group: any, idx: number) => (
                                                        <option key={group.id || idx} value={idx}>
                                                            {standardizeNomenclature(group.environmentName)}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                                    <ChevronRight className="w-4 h-4 rotate-90" />
                                                </div>
                                            </div>
                                        </div>

                                        {displayGroups[selectedEnvIndexForProvidedItems] && (
                                            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-2xl border border-slate-100 dark:border-slate-800/50 h-12">
                                                {(() => {
                                                    const group = displayGroups[selectedEnvIndexForProvidedItems];
                                                    const provided = group.itensFornecidosCliente || { cuba: false, tanque: false, cubaLavatorio: false };
                                                    
                                                    const handleToggleProvided = (field: keyof typeof provided) => {
                                                        if (isFrozen) return;
                                                        const newGroups = [...displayGroups];
                                                        const updatedGroup = { 
                                                            ...group, 
                                                            itensFornecidosCliente: { 
                                                                ...provided, 
                                                                [field]: !provided[field] 
                                                            } 
                                                        };
                                                        newGroups[selectedEnvIndexForProvidedItems] = updatedGroup;
                                                        onUpdateGroups(newGroups);
                                                    };

                                                    const items = [
                                                        { key: 'cuba', label: 'Cuba' },
                                                        { key: 'cubaGourmet', label: 'Cuba Gourmet' },
                                                        { key: 'tanque', label: 'Tanque' },
                                                        { key: 'cubaLavatorio', label: 'Lavatório' },
                                                        { key: 'lixeira', label: 'Lixeira' }
                                                    ];

                                                    return safeArray(items).map(item => (
                                                        <button
                                                            key={item.key}
                                                            disabled={isFrozen}
                                                            onClick={() => handleToggleProvided(item.key as any)}
                                                            className={cn(
                                                                "h-9 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shrink-0",
                                                                provided[item.key as keyof typeof provided]
                                                                    ? "bg-brand-emerald text-white shadow-md shadow-emerald-500/20"
                                                                    : "bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 border border-slate-200 dark:border-slate-700"
                                                            )}
                                                        >
                                                            {item.label}
                                                        </button>
                                                    ));
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 1. Ambientes (SaaS Style Cards) */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 px-1">Ambientes Configurados</h3>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            {safeArray(displayGroups).map((group: any, index: number) => (
                                <div 
                                    key={group.id} 
                                    className={cn(
                                        "bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all group overflow-hidden",
                                        auditResults.environmentErrors.includes(group.id) && "border-red-500 ring-2 ring-red-500/20"
                                    )}
                                >
                                    <div className="p-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="space-y-1">
                                                <h4 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                                                    {standardizeNomenclature(group.environmentName)}
                                                </h4>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                                                        {group.materialName}
                                                    </span>

                                                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                                                        {group.quantity} {group.quantity > 1 ? 'Ambientes' : 'Ambiente'}
                                                    </span>

                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
                                                    R$ {group.groupStoneTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-100 dark:border-slate-800/50">
                                            <p className="text-sm font-bold text-slate-600 dark:text-slate-400">

                                                {(group.pieces || []).map((p: any, i: number) => (
                                                    <React.Fragment key={p.id}>
                                                        {i > 0 && <span className="mx-2 text-slate-300">|</span>}
                                                        <span className="text-slate-800 dark:text-slate-200 font-semibold">{standardizeNomenclature(p.label)}</span>{' '}
                                                        <span className="text-slate-500">{String(Number(p.width || 0).toFixed(2)).replace('.', ',')}x{String(Number(p.height || 0).toFixed(2)).replace('.', ',')}</span>
                                                        {p.quantity > 1 && <span className="text-slate-400 ml-1">({p.quantity}x)</span>}
                                                    </React.Fragment>
                                                ))}
                                            </p>

                                            {(() => {
                                                const metrics = getEnvironmentMetrics(group.pieces);
                                                return (
                                                    <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-700/50 text-[11px] text-slate-500 dark:text-slate-400">
                                                        <div className="flex items-center gap-1.5 mb-1.5">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                                                            <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">Uso de Material (Interno):</span>
                                                        </div>
                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 font-medium pl-3">
                                                            <div>
                                                                Tampo: <span className="font-bold text-slate-700 dark:text-slate-300">{metrics.tampoSqm.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</span>
                                                            </div>
                                                            <div>
                                                                Frontão/Rodapé: <span className="font-bold text-slate-700 dark:text-slate-300">{metrics.frontaoRodapeSqm.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</span>
                                                            </div>
                                                            <div>
                                                                Saia/Borda: <span className="font-bold text-slate-700 dark:text-slate-300">{metrics.saiaBordaSqm.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</span>
                                                            </div>
                                                            <div className="font-bold text-slate-800 dark:text-slate-200">
                                                                Total usado: <span>{metrics.totalSqm.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {(() => {
                                                const currentFuros = group.furosECortes || (group as any).freebies || { cuba: false, furoTorneira: false, corteCooktop: false, cooktop: false };
                                                const providedItems = group.itensFornecidosCliente || { cuba: false, tanque: false, cubaLavatorio: false };
                                                const hasProvidedItems = Object.values(providedItems).some(v => v === true);

                                                const handleToggleFuro = (field: string) => {
                                                    if (isFrozen) return;
                                                    const newGroups = [...displayGroups];
                                                    const updatedGroup = { 
                                                        ...group, 
                                                        furosECortes: { 
                                                            ...currentFuros, 
                                                            [field]: !currentFuros[field as keyof typeof currentFuros] 
                                                        } 
                                                    };
                                                    newGroups[index] = updatedGroup;
                                                    onUpdateGroups(newGroups);
                                                };

                                                return (
                                                    <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-700/50 flex flex-col gap-4">
                                                        {/* Provided Items (If any) */}
                                                        {hasProvidedItems && (
                                                            <div className="flex flex-col gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-brand-emerald" />
                                                                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Itens fornecidos pelo cliente:</span>
                                                                </div>
                                                                <div className="flex flex-wrap gap-1.5 ml-3.5">
                                                                    {providedItems.cuba && (
                                                                        <span className="text-[9px] font-bold text-slate-500 uppercase px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">Cuba</span>
                                                                    )}
                                                                    {providedItems.cubaGourmet && (
                                                                        <span className="text-[9px] font-bold text-slate-500 uppercase px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">Cuba Gourmet</span>
                                                                    )}
                                                                    {providedItems.tanque && (
                                                                        <span className="text-[9px] font-bold text-slate-500 uppercase px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">Tanque</span>
                                                                    )}
                                                                    {providedItems.cubaLavatorio && (
                                                                        <span className="text-[9px] font-bold text-slate-500 uppercase px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">Lavatório</span>
                                                                    )}
                                                                    {providedItems.lixeira && (
                                                                        <span className="text-[9px] font-bold text-slate-500 uppercase px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">Lixeira</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="flex flex-col gap-3">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Configurações do Ambiente</span>
                                                                {group.edgeFinishing && (
                                                                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[9px] font-black uppercase tracking-widest rounded border border-slate-200 dark:border-slate-700">
                                                                        {group.edgeFinishing}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            
                                                            <div className="flex flex-wrap gap-2">
                                                                {/* Recorte da Cuba */}
                                                                <button 
                                                                    disabled={isFrozen}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleToggleFuro('cuba');
                                                                    }}
                                                                    className={cn(
                                                                        "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all duration-200",
                                                                        currentFuros.cuba 
                                                                            ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                                                                            : "bg-white border-slate-200 text-slate-400 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-700"
                                                                    )}
                                                                >
                                                                    <div className={cn(
                                                                        "w-3.5 h-3.5 rounded-md flex items-center justify-center border transition-all",
                                                                        currentFuros.cuba ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"
                                                                    )}>
                                                                        {currentFuros.cuba && <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={4} />}
                                                                    </div>
                                                                    <span className="text-[10px] font-black uppercase tracking-tight leading-none">
                                                                        {standardizeNomenclature('cuba')}
                                                                    </span>
                                                                </button>

                                                                {/* Furo para Torneira */}
                                                                <button 
                                                                    disabled={isFrozen}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleToggleFuro('furoTorneira');
                                                                    }}
                                                                    className={cn(
                                                                        "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all duration-200",
                                                                        currentFuros.furoTorneira 
                                                                            ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                                                                            : "bg-white border-slate-200 text-slate-400 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-700"
                                                                    )}
                                                                >
                                                                    <div className={cn(
                                                                        "w-3.5 h-3.5 rounded-md flex items-center justify-center border transition-all",
                                                                        currentFuros.furoTorneira ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"
                                                                    )}>
                                                                        {currentFuros.furoTorneira && <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={4} />}
                                                                    </div>
                                                                    <span className="text-[10px] font-black uppercase tracking-tight leading-none">
                                                                        {standardizeNomenclature('torneira')}
                                                                    </span>
                                                                </button>

                                                                {/* Corte para Cooktop */}
                                                                <button 
                                                                    disabled={isFrozen}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleToggleFuro(currentFuros.corteCooktop !== undefined ? 'corteCooktop' : 'cooktop');
                                                                    }}
                                                                    className={cn(
                                                                        "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all duration-200",
                                                                        (currentFuros.corteCooktop || currentFuros.cooktop)
                                                                            ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                                                                            : "bg-white border-slate-200 text-slate-400 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-700"
                                                                    )}
                                                                >
                                                                    <div className={cn(
                                                                        "w-3.5 h-3.5 rounded-md flex items-center justify-center border transition-all",
                                                                        (currentFuros.corteCooktop || currentFuros.cooktop) ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"
                                                                    )}>
                                                                        {(currentFuros.corteCooktop || currentFuros.cooktop) && <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={4} />}
                                                                    </div>
                                                                    <span className="text-[10px] font-black uppercase tracking-tight leading-none">
                                                                        {standardizeNomenclature('cooktop')}
                                                                    </span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {!isFrozen && (
                                            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/50 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    onClick={() => onEditGroup(index)}
                                                    className="h-8 text-[11px] font-black uppercase tracking-wider gap-1.5 rounded-lg border-slate-200"

                                                >
                                                    <Edit2 className="w-3.5 h-3.5 text-blue-500" /> Editar
                                                </Button>
                                                <Button 
                                                    variant="outline" 
                                                    size="sm" 
                                                    onClick={() => onRemoveGroup(index)}
                                                    className="h-8 text-[11px] font-bold uppercase tracking-wider gap-1.5 rounded-lg border-slate-200 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" /> Excluir
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                {/* 2. Interactive Cards (Accessories / Services) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Acessórios Card */}
                        <div 
                            onClick={openAddAcc}
                            className={cn(
                                "flex flex-col bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-all cursor-pointer group hover:border-brand-emerald/30 hover:shadow-md",
                                accessories.length === 0 && "items-start border-dashed border-2 hover:border-brand-emerald"
                            )}
                        >
                            <div className="w-12 h-12 bg-slate-50 dark:bg-slate-900 rounded-xl flex items-center justify-center mb-6 text-slate-400 group-hover:text-brand-emerald transition-colors">
                                <Package className="w-6 h-6" />
                            </div>
                            
                            <div className="flex-1 w-full space-y-1">
                                <h4 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">Acessórios / Cubas</h4>
                                {displayAccessories.length > 0 ? (
                                    <>
                                        <p className="text-sm font-semibold text-slate-500">{displayAccessories.length} {displayAccessories.length === 1 ? 'item adicionado' : 'itens adicionados'}</p>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">Total:</span>

                                            <span className="text-2xl font-black text-slate-900 dark:text-white">R$ {safeArray(displayAccessories).reduce((sum: number, a: any) => sum + (a.total || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[11px] font-bold text-brand-emerald uppercase tracking-widest mt-2 group-hover:translate-x-1 transition-transform">
                                            Editar itens <ChevronRight className="w-3 h-3" />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-sm font-medium text-slate-400 italic">Nenhum item adicionado</p>
                                        <div className="mt-4">
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest">
                                                <Plus className="w-3 h-3" /> Adicionar
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Services Card */}
                        <div 
                            onClick={openAddSrv}
                            className={cn(
                                "flex flex-col bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-all cursor-pointer group hover:border-brand-emerald/30 hover:shadow-md",
                                services.length === 0 && "items-start border-dashed border-2 hover:border-brand-emerald"
                            )}
                        >
                            <div className="w-12 h-12 bg-slate-50 dark:bg-slate-900 rounded-xl flex items-center justify-center mb-6 text-slate-400 group-hover:text-brand-emerald transition-colors">
                                <Truck className="w-6 h-6" />
                            </div>
                            
                            <div className="flex-1 w-full space-y-1">
                                <h4 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">Serviços / Frete</h4>
                                {displayServices.length > 0 ? (
                                    <>
                                        <p className="text-sm font-semibold text-slate-500">{displayServices.length} {displayServices.length === 1 ? 'item adicionado' : 'itens adicionados'}</p>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">Total:</span>

                                            <span className="text-2xl font-black text-slate-900 dark:text-white">R$ {safeArray(displayServices).reduce((sum: number, s: any) => sum + (s.price || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[11px] font-bold text-brand-emerald uppercase tracking-widest mt-2 group-hover:translate-x-1 transition-transform">
                                            Editar itens <ChevronRight className="w-3 h-3" />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-sm font-medium text-slate-400 italic">Nenhum item adicionado</p>
                                        <div className="mt-4">
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[10px] font-black uppercase tracking-widest">
                                                <Plus className="w-3 h-3" /> Adicionar
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Controle de Instalação (RESTAURADO PARA UI INTERNA) */}
                        <div 
                            onClick={openEditInst}
                            className={cn(
                                "flex flex-col md:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-all cursor-pointer group hover:border-brand-emerald/30 hover:shadow-md",
                                !includeInstallation && "bg-slate-50/50 border-dashed opacity-75"
                            )}
                        >
                            <div className="flex justify-between items-start mb-6">
                                <div className="w-12 h-12 bg-slate-50 dark:bg-slate-900 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-brand-emerald transition-colors">
                                    <CheckCircle2 className="w-6 h-6" />
                                </div>
                                {!isFrozen && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Controle Técnico:</span>
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest",
                                            includeInstallation ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                                        )}>
                                            {includeInstallation ? 'Instalação Ativa' : 'Sem Instalação'}
                                        </span>
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <h4 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wider">Mão de Obra de Instalação</h4>
                                    <p className="text-sm font-semibold text-slate-500">
                                        {(manualInstallation?.value || 0) > 0 ? 'Valor manual técnico definido' : 'Cálculo automático pro-rata'}
                                    </p>
                                </div>

                                <div className="flex items-baseline gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">Valor Operacional:</span>
                                    <span className={cn(
                                        "text-2xl font-black tabular-nums",
                                        includeInstallation ? "text-slate-900 dark:text-white" : "text-slate-400 line-through"
                                    )}>
                                        R$ {(calculatedData?.operationalCost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-1 text-[11px] font-bold text-brand-emerald uppercase tracking-widest mt-6 group-hover:translate-x-1 transition-transform">
                                Ajustar Instalação Técnica <ChevronRight className="w-3 h-3" />
                            </div>
                        </div>
                    </div>

                    {/* 5. Inconsistências (Rule #40) */}
                    {!isFrozen && (!validation.isValid || validation.warnings.length > 0) && (
                        <div className={cn(
                            "p-6 rounded-2xl border flex flex-col gap-4 animate-in slide-in-from-bottom-2 duration-300",
                            validation.isValid ? "bg-amber-50 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/20" : "bg-rose-50 border-rose-100 dark:bg-rose-900/10 dark:border-rose-900/20"
                        )}>
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                    validation.isValid ? "bg-amber-100 text-amber-600" : "bg-rose-100 text-rose-600 shadow-sm"
                                )}>
                                    {validation.isValid ? <Info className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                                </div>
                                <div>
                                    <h4 className={cn(
                                        "text-[13px] font-black uppercase tracking-tight",
                                        validation.isValid ? "text-amber-800 dark:text-amber-400" : "text-rose-800 dark:text-rose-400"
                                    )}>
                                        {validation.isValid ? "Atenção: Revise os alertas abaixo" : "Não foi possível finalizar este orçamento"}
                                    </h4>
                                    <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">Existem inconsistências financeiras que precisam ser revisadas.</p>
                                </div>
                            </div>
                            
                            <ul className="space-y-2.5 mt-2">
                                {safeArray(validation.blockingIssues).map((issue, idx) => (
                                    <li key={idx} className="text-[12px] font-bold text-rose-700 dark:text-rose-300 flex items-start gap-3 pl-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                                        {issue}
                                    </li>
                                ))}
                                {safeArray(validation.warnings).map((warning, idx) => (
                                    <li key={idx} className="text-[12px] font-bold text-amber-700 dark:text-amber-300 flex items-start gap-3 pl-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                                        {warning}
                                    </li>
                                ))}
                                </ul>
                            </div>
                        )}

                        {/* 6. PAINEL TÉCNICO INTERNO (PRODUÇÃO & COMPRAS) */}
                        {(() => {
                            const metrics = getProjectSummaryMetrics(displayGroups);
                            const materialsKeys = Object.keys(metrics.matSummary);
                            const chapaEstimada = Math.ceil(metrics.totalStoneArea / 6.0);

                            return (
                                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-slate-800/80 shadow-sm p-6 md:p-8 space-y-6 mt-8">
                                    <div className="flex items-center gap-3 border-b border-slate-200/60 dark:border-slate-800/60 pb-4">
                                        <div className="p-3 bg-brand-emerald/10 text-brand-emerald rounded-2xl">
                                            <ShieldCheck className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-700 dark:text-slate-350">
                                                Resumo Técnico & Consumo de Materiais (Interno)
                                            </h3>
                                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">
                                                Esta área é para visualização interna da equipe (compras, produção, conferência) e não é visível para o cliente.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {/* Coluna 1: Metragem por Ambiente & Consumo por Material */}
                                        <div className="space-y-6">
                                            {/* Resumo do Projeto */}
                                            <div className="space-y-3">
                                                <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-1.5 flex items-center justify-between">
                                                    <span>Resumo do Projeto</span>
                                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold lowercase italic">metragem por ambiente</span>
                                                </h4>
                                                <div className="space-y-2 text-xs font-semibold pl-1">
                                                    {Object.entries(metrics.envMap).map(([name, sqm]) => (
                                                        <div key={name} className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                                                            <span>{name}</span>
                                                            <span className="font-mono text-slate-800 dark:text-slate-200">{sqm.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</span>
                                                        </div>
                                                    ))}
                                                    <div className="flex justify-between items-center text-brand-emerald font-black border-t border-slate-200 dark:border-slate-800 pt-2 text-xs uppercase tracking-wide">
                                                        <span>Total de Pedra</span>
                                                        <span className="font-mono">{metrics.totalStoneArea.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Consumo por Material */}
                                            <div className="space-y-3">
                                                <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-1.5 flex items-center justify-between">
                                                    <span>Consumo por Material</span>
                                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold lowercase italic">agrupado</span>
                                                </h4>
                                                <div className="space-y-2 text-xs font-semibold pl-1">
                                                    {materialsKeys.map(matName => (
                                                        <div key={matName} className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                                                            <span>{matName}</span>
                                                            <span className="font-mono text-slate-800 dark:text-slate-200">{metrics.matSummary[matName].toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</span>
                                                        </div>
                                                    ))}
                                                    {materialsKeys.length > 1 && (
                                                        <div className="flex justify-between items-center text-brand-emerald font-black border-t border-slate-200 dark:border-slate-800 pt-2 text-xs uppercase tracking-wide">
                                                            <span>Total</span>
                                                            <span className="font-mono">{metrics.totalStoneArea.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Coluna 2: Resumo Técnico de Produção & Estimativa de Chapas */}
                                        <div className="space-y-6">
                                            {/* Resumo Técnico */}
                                            <div className="space-y-3">
                                                <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-1.5 flex items-center justify-between">
                                                    <span>Resumo Técnico de Produção</span>
                                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold lowercase italic">especificações</span>
                                                </h4>
                                                <div className="grid grid-cols-1 gap-2 text-xs font-semibold pl-1">
                                                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-300 border-b border-slate-200/60 dark:border-slate-800/60 pb-1.5">
                                                        <span className="text-slate-500 dark:text-slate-400 font-medium">Quantidade de Ambientes</span>
                                                        <span className="font-mono text-slate-800 dark:text-slate-200">{metrics.totalEnvironments}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-300 border-b border-slate-200/60 dark:border-slate-800/60 pb-1.5">
                                                        <span className="text-slate-500 dark:text-slate-400 font-medium">Quantidade de Peças</span>
                                                        <span className="font-mono text-slate-800 dark:text-slate-200">{metrics.totalPieces}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-300 border-b border-slate-200/60 dark:border-slate-800/60 pb-1.5">
                                                        <span className="text-slate-500 dark:text-slate-400 font-medium">Área Total de Pedra</span>
                                                        <span className="font-mono text-slate-800 dark:text-slate-200">{metrics.totalStoneArea.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-300 border-b border-slate-200/60 dark:border-slate-800/60 pb-1.5">
                                                        <span className="text-slate-500 dark:text-slate-400 font-medium">Frontões Totais</span>
                                                        <span className="font-mono text-slate-800 dark:text-slate-200">{metrics.totalFrontaoLinear.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-300 border-b border-slate-200/60 dark:border-slate-800/60 pb-1.5">
                                                        <span className="text-slate-500 dark:text-slate-400 font-medium">Saia/Bordas Totais</span>
                                                        <span className="font-mono text-slate-800 dark:text-slate-200">{metrics.totalSaiaLinear.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-300 border-b border-slate-200/60 dark:border-slate-800/60 pb-1.5">
                                                        <span className="text-slate-500 dark:text-slate-400 font-medium">Instalação Linear Total</span>
                                                        <span className="font-mono text-slate-800 dark:text-slate-200">{metrics.totalInstLinear.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Estimativa de Chapas */}
                                            <div className="space-y-3">
                                                <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-1.5 flex items-center justify-between">
                                                    <span>Estimativa de Chapas</span>
                                                </h4>
                                                <div className="bg-slate-100/50 dark:bg-slate-900/80 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-800/60 space-y-2.5 text-xs font-semibold">
                                                    <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                                                        <span className="font-medium">Área Total</span>
                                                        <span className="font-mono text-slate-800 dark:text-slate-200">{metrics.totalStoneArea.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-2">
                                                        <span className="font-medium">Chapa Padrão</span>
                                                        <span className="text-slate-800 dark:text-slate-200 font-bold">3,00 x 2,00 = 6,00 m²</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-brand-emerald font-black pt-1">
                                                        <span>Estimativa Necessária</span>
                                                        <span className="px-2 py-0.5 bg-brand-emerald/10 rounded text-[11px] tracking-wide">
                                                            {chapaEstimada} {chapaEstimada > 1 ? 'chapas' : 'chapa'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
            </main>



            {/* 4. Resumo Financeiro e Ações (Sticky Footer) */}
            <div className="sticky bottom-0 left-0 right-0 p-4 md:p-6 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 z-50 shadow-premium-up">
                <div className="max-w-full mx-auto flex flex-col md:flex-row items-center justify-between gap-6 px-4">

                    
                    {/* Finance Summary Content */}
                    <div className="flex flex-wrap items-center gap-8 w-full md:w-auto">
                        <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase text-slate-600 dark:text-slate-400 block tracking-widest">Total Produtos e Serviços</span>

                            <span className="text-lg font-bold text-slate-600 dark:text-slate-300 tabular-nums">R$ {finalSubtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>

                        <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase text-red-500 block tracking-widest flex items-center gap-1">
                                <Tag className="w-3 h-3" /> Desconto
                            </span>
                            <div className="relative w-32 group">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-red-500">R$</span>
                                <Input 
                                    type="number" 
                                    value={finalDiscount} 
                                    onChange={e => onUpdateDiscount(Number(e.target.value))} 
                                    disabled={isFrozen}
                                    className="h-10 pl-9 font-black text-red-500 text-base tabular-nums border-red-50 group-hover:border-red-100 focus:ring-red-500 focus:border-red-500 bg-red-50/10 disabled:opacity-80"
                                />
                            </div>
                        </div>
                        
                        <div className="pl-6 md:pl-8 border-l border-slate-200 dark:border-slate-800">
                            <span className="text-[10px] font-black uppercase text-slate-600 dark:text-slate-400 block tracking-widest mb-1.5">Total do Orçamento</span>

                            <div className="flex items-baseline gap-2">
                                <span className="text-sm font-black text-slate-900 dark:text-slate-100">R$</span>
                                <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums">
                                    {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>

                            {paymentConditions?.installments && paymentConditions.installments.length > 0 && (
                                <div 
                                    className="mt-2 pt-2 border-t border-slate-200 dark:border-white/5 hidden md:block cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg transition-colors p-1"
                                    onClick={() => {
                                        setPaymentDraft(paymentConditions);
                                        setIsPaymentModalOpen(true);
                                    }}
                                >
                                    <span className="text-[9px] font-black uppercase text-slate-400 block tracking-widest mb-1">
                                        Condições Definidas
                                    </span>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {safeArray(paymentConditions.installments).map((i, idx) => (
                                            <span key={idx} className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-white/5 rounded text-slate-500 font-bold whitespace-nowrap">
                                                {i.percentage.toFixed(0)}% {i.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action Buttons Container */}
                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        <div className="flex items-center gap-1.5 p-1 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handlePrint()} 
                                title="Imprimir" 
                                className="h-11 w-11 rounded-lg hover:bg-white shadow-none transition-all"
                            >
                                <Printer className="w-4.5 h-4.5 text-slate-500" />
                            </Button>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => openLayoutSelector('pdf')} 
                                disabled={isExporting} 
                                title="Exportar PDF" 
                                className="h-11 w-11 rounded-lg hover:bg-white hover:text-red-500 transition-all"
                            >
                                <Download className="w-4.5 h-4.5" />
                            </Button>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => openLayoutSelector('jpg')} 
                                disabled={isExporting} 
                                title="Exportar Imagem" 
                                className="h-11 w-11 rounded-lg hover:bg-white hover:text-blue-500 transition-all"
                            >
                                <ImageIcon className="w-4.5 h-4.5" />
                            </Button>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={openEditInst} 
                                disabled={isFrozen}
                                title="Configurar Instalação (Embutida)" 
                                className="h-11 w-11 rounded-lg hover:bg-white hover:text-brand-emerald transition-all"
                            >
                                <CheckCircle2 className="w-4.5 h-4.5" />
                            </Button>
                        </div>

                        {/* History Timeline (Rule #35) */}
                        {(safeHistoryArray(history || (quoteSnapshot as any)?.history)?.length > 0) && (
                            <div className="lg:col-span-3 bg-slate-50/50 dark:bg-slate-800/10 rounded-2xl border border-slate-100 dark:border-white/5 p-6 space-y-4">
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                    <Clock className="w-3 h-3" /> Histórico de Versões e Eventos
                                </h4>
                                <div className="space-y-4">
                                    {[...safeHistoryArray(history || (quoteSnapshot as any)?.history)].reverse().map((entry: any, idx: number, arr: any[]) => (
                                        <div key={idx} className="flex gap-4 items-start relative">
                                            {idx < arr.length - 1 && (
                                                <div className="absolute left-[5px] top-4 bottom-0 w-[1px] bg-slate-200 dark:bg-slate-700"></div>
                                            )}
                                            <div className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-500 mt-1 z-10 border-2 border-white dark:border-slate-900 ring-2 ring-slate-100 dark:ring-slate-800/50"></div>
                                            <div className="flex-1">
                                                <p className="text-[10px] font-bold text-slate-400 flex items-center gap-2">
                                                    {entry.date ? formatVisualDate(entry.date, 'dd/MM/yy HH:mm') : '--/--'}
                                                    {entry.user && (
                                                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[8px] font-black border border-slate-200/50 dark:border-white/5">
                                                            {entry.user}
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 antialiased leading-relaxed">
                                                    {entry.action}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}



                        {!isFrozen && (
                            <Button 
                                variant="ghost"
                                onClick={() => onSave(false)}
                                disabled={isLoading || isExporting}
                                className="h-14 px-6 text-slate-400 hover:text-slate-600 font-black uppercase tracking-widest text-[9px] transition-all"
                            >
                                Salvar Rascunho
                            </Button>
                        )}

                        <Button 
                            onClick={handleInitiateFinalization}
                            disabled={(!isFrozen && !validation.isValid) || isLoading || isExporting}
                            className={cn(
                                "flex-1 md:flex-none h-14 px-10 rounded-xl font-bold uppercase tracking-[0.15em] text-xs shadow-lg transition-all",
                                (!isFrozen && !validation.isValid)
                                    ? "bg-slate-200 text-slate-500 cursor-not-allowed shadow-none dark:bg-slate-800 dark:text-slate-500" 
                                    : "bg-slate-900 hover:bg-black dark:bg-brand-emerald dark:hover:bg-emerald-600 text-white shadow-slate-200 dark:shadow-none"
                            )}
                        >
                            {isLoading ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <span className="flex items-center gap-2">
                                    {isFrozen ? <RefreshCw className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                                    {isFrozen ? "Editar Orçamento" : "Salvar Orçamento"}
                                </span>
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Overlays e Modais */}
            {isExporting && (
                <div className="absolute inset-0 bg-white/60 dark:bg-slate-950/60 backdrop-blur-sm z-[100] flex flex-col items-center justify-center animate-in fade-in duration-300">
                    <div className="w-12 h-12 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="font-bold uppercase tracking-widest text-slate-800 dark:text-white text-xs">Preparando arquivos...</p>
                </div>
            )}

            {/* Modal de Condições de Pagamento */}
            {isPaymentModalOpen && paymentDraft && (
                <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title="Condições de Pagamento" className="max-w-2xl">
                    <PaymentConditionsForm 
                        total={total}
                        paymentDraft={paymentDraft}
                        onUpdate={setPaymentDraft}
                    />
                        <div className="flex flex-col gap-4 pt-6 border-t border-slate-100 dark:border-slate-800 mt-4">
                            {(() => {
                                const interestAmount = paymentDraft?.interest?.enabled ? paymentDraft.interest.amount : 0;
                                const financedTotal = total + interestAmount;
                                const totalParcelado = (paymentDraft?.installments || []).reduce((acc, i) => acc + i.amount, 0);
                                const faltaAlocar = financedTotal - totalParcelado;
                                const isBalanced = Math.abs(faltaAlocar) < 0.05;

                                if (!isBalanced) {
                                    return (
                                        <div className={cn(
                                            "p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2",
                                            faltaAlocar > 0 ? "bg-amber-50 border border-amber-100 text-amber-800" : "bg-rose-50 border border-rose-100 text-rose-800"
                                        )}>
                                            <AlertCircle className="w-5 h-5 shrink-0" />
                                            <div className="flex-1">
                                                <p className="text-[10px] font-black uppercase tracking-tight">Divergência detectada</p>
                                                <p className="text-[11px] font-bold opacity-80">
                                                    {faltaAlocar > 0 
                                                        ? `Ainda falta alocar R$ ${faltaAlocar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para fechar o total financiado.`
                                                        : `As parcelas excedem o total financiado em R$ ${Math.abs(faltaAlocar).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-800 flex items-center gap-3 animate-in fade-in">
                                        <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
                                        <div className="flex-1">
                                            <p className="text-[10px] font-black uppercase tracking-tight">Tudo pronto</p>
                                            <p className="text-[11px] font-bold opacity-80">Pagamento validado com sucesso.</p>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="flex gap-3 w-full">
                                <Button 
                                    variant="ghost" 
                                    className="flex-1 h-12 rounded-2xl font-black uppercase tracking-widest text-[10px] text-slate-400 hover:text-slate-600" 
                                    onClick={() => setIsPaymentModalOpen(false)}
                                >
                                    Cancelar
                                </Button>
                                <Button 
                                    className={cn(
                                        "flex-[2] h-12 rounded-2xl font-black uppercase tracking-[0.15em] text-[10px] shadow-lg transition-all",
                                        "bg-slate-900 hover:bg-black text-white dark:bg-brand-emerald shadow-slate-200"
                                    )}
                                    onClick={handleConfirmPaymentAndSave}
                                >
                                    Salvar Condições
                                </Button>
                            </div>
                        </div>
                </Modal>
            )}

            {/* Modal Acessórios */}
            <Modal
                isOpen={isAccModalOpen}
                onClose={() => setIsAccModalOpen(false)}
                title={editingAccIndex !== null ? "Editar Cuba / Acessório" : "Gerenciar Acessórios / Cubas"}
                className="w-[min(94vw,42rem)]"
            >
                <div className="space-y-6">
                    {/* Preview da Lista Atual */}
                    <div className="space-y-3 max-h-[250px] overflow-y-auto px-1">
                        {safeArray(localAccessories).map((a, i) => (
                            <div key={a.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 group">
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-slate-900 dark:text-white uppercase">{a.name}</span>
                                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">{a.quantity}x • R$ {(a.unitPrice || 0).toLocaleString('pt-BR')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-brand-emerald">R$ {a.total.toLocaleString('pt-BR')}</span>
                                    <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" onClick={() => {
                                            setAccDraft(localAccessories[i]);
                                            setEditingAccIndex(i);
                                        }} className="h-8 w-8 rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-500" /></Button>
                                        <Button variant="ghost" size="icon" onClick={() => removeAcc(i)} className="h-8 w-8 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {localAccessories.length === 0 && <p className="text-center text-xs text-slate-400 italic py-4">Nenhum item adicionado ainda.</p>}
                    </div>

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                        <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 px-1">
                            {editingAccIndex !== null ? 'Personalizar Detalhes' : 'Adicionar Novo Item'}
                        </h5>
                        
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <button 
                                onClick={() => setAccDraft(prev => ({ ...prev, type: 'cuba' }))}
                                className={cn(
                                    "p-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                    accDraft.type === 'cuba' ? "border-brand-emerald bg-brand-emerald/5 text-brand-emerald" : "border-slate-50 text-slate-400"
                                )}
                            >
                                Cuba
                            </button>
                            <button 
                                onClick={() => setAccDraft(prev => ({ ...prev, type: 'acessorio' }))}
                                className={cn(
                                    "p-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                    accDraft.type === 'acessorio' ? "border-brand-emerald bg-brand-emerald/5 text-brand-emerald" : "border-slate-50 text-slate-400"
                                )}
                            >
                                Acessório
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 px-1">Item do Catálogo</label>
                                <SearchableSelect 
                                    value={accDraft.accessoryId || ''}
                                    options={[
                                        ...(accDraft.type === 'cuba' ? sinks : accessoryCatalog).map(item => ({
                                            value: item.id,
                                            label: item.name,
                                            description: `Sugestão: R$ ${item.price.toLocaleString('pt-BR')}`
                                        }))
                                    ]}
                                    onChange={(val) => {
                                        const items = accDraft.type === 'cuba' ? sinks : accessoryCatalog;
                                        const selected = items.find(i => i.id === val);
                                        if (selected) {
                                            setAccDraft(prev => ({ ...prev, name: selected.name, unitPrice: selected.price, accessoryId: selected.id }));
                                        }
                                    }}
                                    placeholder="Buscar no estoque..."
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 px-1">Nome Manual</label>
                                    <Input 
                                        value={accDraft.name || ''}
                                        onChange={e => setAccDraft(prev => ({ ...prev, name: e.target.value }))}
                                        className="h-11 font-bold rounded-xl"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 px-1">Qtd</label>
                                        <Input 
                                            type="number"
                                            value={accDraft.quantity || 1}
                                            onChange={e => setAccDraft(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                                            className="h-11 font-bold text-center rounded-xl"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 px-1">Preço (R$)</label>
                                        <Input 
                                            type="number"
                                            value={accDraft.unitPrice || 0}
                                            onChange={e => setAccDraft(prev => ({ ...prev, unitPrice: Number(e.target.value) }))}
                                            className="h-11 font-bold text-brand-emerald rounded-xl"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4">
                            <Button 
                                onClick={addToLocalAcc}
                                disabled={!accDraft.name || !accDraft.quantity || !accDraft.unitPrice}
                                className="w-full h-11 bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold rounded-xl"
                            >
                                {editingAccIndex !== null ? 'Atualizar na Lista' : 'Incluir na Lista'}
                            </Button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between py-2">
                        <span className="text-xs font-black uppercase text-slate-400">Total desta lista:</span>
                        <span className="text-xl font-black text-brand-emerald">R$ {(localAccessories || []).reduce((sum, a) => sum + (Number(a.total) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="flex gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <Button variant="ghost" className="flex-1 font-bold rounded-xl h-12" onClick={() => { setIsAccModalOpen(false); setEditingAccIndex(null); }}>
                            Cancelar
                        </Button>
                        <Button className="flex-1 font-black uppercase tracking-widest bg-brand-emerald text-white rounded-xl h-12 shadow-lg shadow-emerald-500/20" onClick={saveAcc}>
                            Salvar Alterações
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* Modal Instalação Manual */}
            <Modal
                isOpen={isInstModalOpen}
                onClose={() => setIsInstModalOpen(false)}
                title="Investimento Técnico - Ajuste de Instalação"
                className="w-[min(94vw,30rem)]"
            >
                <div className="space-y-6">
                    <div className="space-y-4">
                        {(calculatedData?.frontaoLinearInstallation || 0) > 0 && (
                             <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl group transition-all">
                                 <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1.5 px-0.5">Calculado Automaticamente (Frontão/Lineares)</p>
                                 <div className="flex items-baseline gap-2">
                                    <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums">R$ {calculatedData.frontaoLinearInstallation.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    <span className="px-1.5 py-0.5 bg-brand-emerald/10 text-brand-emerald text-[8px] font-black uppercase tracking-wider rounded-md border border-brand-emerald/20">Rule #30</span>
                                 </div>
                                  <p className="text-[9px] font-medium text-slate-500 mt-2.5 leading-relaxed antialiased">
                                      Este valor é baseado em metros lineares. Se você definir um **Ajuste Manual** abaixo, ele irá **SUBSTITUIR** este valor automático no total.
                                  </p>
                             </div>
                        )}
                        <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5 px-1 tracking-widest">Descrição do Ajuste Técnico</label>
                            <Input 
                                value={instDraft.description}
                                onChange={e => setInstDraft(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Ex: Mão de obra especializada, Frete ou Ajuste de Obra"
                                className="h-12 font-bold rounded-xl focus:ring-brand-emerald/20 border-slate-200"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5 px-1 tracking-widest">Ajuste manual da instalação (R$)</label>
                            <div className="relative">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">R$</span>
                                <Input 
                                    type="text"
                                    value={instDraft.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    onChange={e => {
                                        // Handle BRL input mask (cents-based replacement for substitution rule)
                                        const rawValue = e.target.value.replace(/\D/g, '');
                                        const newValue = rawValue === '' ? 0 : parseFloat(rawValue) / 100;
                                        setInstDraft(prev => ({ ...prev, value: newValue }));
                                    }}
                                    className="h-12 pl-10 font-black text-brand-emerald text-lg tabular-nums rounded-xl focus:ring-brand-emerald/20 border-slate-200"
                                />
                            </div>
                            <p className="text-[9px] font-bold text-slate-400 mt-2 px-1 uppercase tracking-tighter">
                                Atenção: Este valor **substitui** o valor automático calculado acima.
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <Button variant="ghost" className="flex-1 font-bold rounded-xl h-12" onClick={() => setIsInstModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button className="flex-1 font-black uppercase tracking-widest bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-xl h-12 shadow-lg active:scale-95 transition-all" onClick={saveInst}>
                            Salvar Alteração
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Modal Serviços */}
            <Modal
                isOpen={isSrvModalOpen}
                onClose={() => setIsSrvModalOpen(false)}
                title={editingSrvIndex !== null ? "Editar Serviço / Frete" : "Gerenciar Serviços / Frete"}
                className="w-[min(94vw,42rem)]"
            >
                <div className="space-y-6">
                    {/* Preview da Lista Atual */}
                    <div className="space-y-3 max-h-[250px] overflow-y-auto px-1">
                        {safeArray(localServices).map((s, i) => (
                            <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 group">
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-slate-900 dark:text-white uppercase">{s.description}</span>
                                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">{s.quantity}x • R$ {(s.unitPrice || 0).toLocaleString('pt-BR')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-brand-emerald">R$ {s.price.toLocaleString('pt-BR')}</span>
                                    <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" onClick={() => {
                                            setSrvDraft(localServices[i]);
                                            setEditingSrvIndex(i);
                                        }} className="h-8 w-8 rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-500" /></Button>
                                        <Button variant="ghost" size="icon" onClick={() => removeSrv(i)} className="h-8 w-8 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {localServices.length === 0 && <p className="text-center text-xs text-slate-400 italic py-4">Nenhum serviço adicionado ainda.</p>}
                    </div>

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                        <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 px-1">
                            {editingSrvIndex !== null ? 'Ajustar Serviço' : 'Inserir Novo Serviço'}
                        </h5>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <button 
                                onClick={() => setSrvDraft(prev => ({ ...prev, type: 'servico' }))}
                                className={cn(
                                    "p-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                    srvDraft.type === 'servico' ? "border-brand-emerald bg-brand-emerald/5 text-brand-emerald" : "border-slate-50 text-slate-400"
                                )}
                            >
                                Serviço
                            </button>
                            <button 
                                onClick={() => setSrvDraft(prev => ({ ...prev, type: 'frete' }))}
                                className={cn(
                                    "p-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                    srvDraft.type === 'frete' ? "border-brand-emerald bg-brand-emerald/5 text-brand-emerald" : "border-slate-50 text-slate-400"
                                )}
                            >
                                Frete / Logística
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 px-1">Catálogo de Serviços</label>
                                <SearchableSelect 
                                    value={srvDraft.id || ''}
                                    options={safeArray(serviceCatalog).map(item => ({
                                        value: item.id,
                                        label: item.name,
                                        description: `R$ ${item.price.toLocaleString('pt-BR')}`
                                    }))}
                                    onChange={(val) => {
                                        const selected = serviceCatalog.find(i => i.id === val);
                                        if (selected) {
                                            setSrvDraft(prev => ({ ...prev, id: selected.id, description: selected.name, unitPrice: selected.price, quantity: 1 }));
                                        }
                                    }}
                                    placeholder="Buscar serviço padrão..."
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 px-1">Descrição</label>
                                    <Input 
                                        value={srvDraft.description || ''}
                                        onChange={e => setSrvDraft(prev => ({ ...prev, description: e.target.value }))}
                                        className="h-11 font-bold rounded-xl"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 px-1">Qtd/Log</label>
                                        <Input 
                                            type="number"
                                            value={srvDraft.quantity || 1}
                                            onChange={e => setSrvDraft(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                                            className="h-11 font-bold text-center rounded-xl"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 px-1">Preço (R$)</label>
                                        <Input 
                                            type="number"
                                            value={srvDraft.unitPrice || 0}
                                            onChange={e => setSrvDraft(prev => ({ ...prev, unitPrice: Number(e.target.value) }))}
                                            className="h-11 font-bold text-brand-emerald rounded-xl"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4">
                            <Button 
                                onClick={addToLocalSrv}
                                disabled={!srvDraft.description || !srvDraft.quantity || !srvDraft.unitPrice}
                                className="w-full h-11 bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold rounded-xl"
                            >
                                {editingSrvIndex !== null ? 'Atualizar na Lista' : 'Incluir na Lista'}
                            </Button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between py-2">
                        <span className="text-xs font-black uppercase text-slate-400">Total desta lista:</span>
                        <span className="text-xl font-black text-brand-emerald">R$ {(localServices || []).reduce((sum, s) => sum + (Number(s.price) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>

                    <div className="flex gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <Button variant="ghost" className="flex-1 font-bold rounded-xl h-12" onClick={() => { setIsSrvModalOpen(false); setEditingSrvIndex(null); }}>
                            Cancelar
                        </Button>
                        <Button className="flex-1 font-black uppercase tracking-widest bg-brand-emerald text-white rounded-xl h-12 shadow-lg shadow-emerald-500/20" onClick={saveSrv}>
                            Salvar Alterações
                        </Button>
                    </div>
                </div>
            </Modal>

        </div>
    );
};
