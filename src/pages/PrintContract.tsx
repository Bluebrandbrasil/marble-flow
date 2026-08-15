import { safeArray, normalizeClauses } from '../lib/dataDiagnostics';
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, updateDoc, arrayUnion, setDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { db, firebaseConfig } from '../lib/firebase';
import { ContractPrintTemplate } from '../features/orders/ContractPrintTemplate';
import { Button } from '../components/ui/Button';
import { Loader2, ArrowLeft, Printer, ShieldCheck, Send, CheckCircle2, History, Clock, FileEdit, Save, X, DownloadCloud, AlertTriangle, RotateCcw, FilePlus } from 'lucide-react';
import type { Order } from '../types';
import { useAuth } from '../context/AuthContext';
import { toISODateSafe } from '../lib/dateWriteUtils';
import { cn } from '../lib/utils';
import { Modal } from '../components/ui/Modal';
import SignatureCanvas from 'react-signature-canvas';
import { useSettings } from '../hooks/useSettings';
import { useCompanyData } from '../hooks/useCompanyData';
import { Input } from '../components/ui/Input';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { syncClientDataToContracts } from '../services/clientSyncService';

const formatCurrency = (value: any) => {
    const numericValue = typeof value === 'number' ? value : 0;
    return numericValue.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

const safeValue = (value: any, fallback: any) => {
    return value === undefined || value === null ? fallback : value;
};

const removeUndefinedDeep = (obj: any): any => {
    if (Array.isArray(obj)) {
        return safeArray(obj).map(removeUndefinedDeep);
    }

    if (obj && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => [key, removeUndefinedDeep(value)])
        );
    }

    return obj;
};

export const PrintContract: React.FC = () => {
    const { orderId } = useParams<{ orderId: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const { profile, user } = useAuth();
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [outdatedClientData, setOutdatedClientData] = useState(false);
    const [latestClientData, setLatestClientData] = useState<any>(null);
    const [isSyncingClient, setIsSyncingClient] = useState(false);
    const [showSignModal, setShowSignModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [isEditingClauses, setIsEditingClauses] = useState(false);
    const [editedClauses, setEditedClauses] = useState<{ title: string; content: string }[]>([]);
    
    // States for custom contract overrides
    const [isEditingContract, setIsEditingContract] = useState(false);
    const [overrideEntry, setOverrideEntry] = useState<string | number>('');
    const [overrideEntryMethod, setOverrideEntryMethod] = useState('PIX');
    const [overrideInstallments, setOverrideInstallments] = useState<any[]>([]);
    const [overrideNotes, setOverrideNotes] = useState('');
    const [overrideConditions, setOverrideConditions] = useState('');
    const [overrideClauses, setOverrideClauses] = useState<{ title: string; content: string }[]>([]);
    const { settings, updateSettings } = useSettings();
    const { companyData } = useCompanyData();
    const sigPad = useRef<SignatureCanvas>(null);
    const contractRef = useRef<HTMLDivElement>(null);
    const isPublicView = !!token || !user;

    const fetchOrder = async () => {
        if (!orderId) return;
        try {
            // 1. PUBLIC ACCESS (Secure Gateway)
            // If there's no authenticated user, we MUST use the public gateway
            if (!user) {
                if (!token) {
                    setError('Efetue login ou use um link de acesso válido.');
                    setLoading(false);
                    return;
                }

                console.log(`[GATEWAY] Public PDF request for token`);
                const gatewayRef = doc(db, 'public_contract_links', token);
                const gatewaySnap = await getDoc(gatewayRef);

                if (gatewaySnap.exists()) {
                    const gwData = gatewaySnap.data();
                    
                    if (!gwData.active) {
                        setError('Este link não está mais ativo.');
                        setLoading(false);
                        return;
                    }

                    // Map from Gateway Snapshots
                    const snap = gwData.contractSnapshot || (gwData.orderSnapshot as any)?.contractSnapshot || {};
                    const orderSnap = gwData.orderSnapshot || {};
                    const finalOrderData = {
                        ...(orderSnap as Order),
                        id: gwData.orderId,
                        contractSnapshot: snap,
                        clientSnapshot: gwData.clientSnapshot || (gwData.orderSnapshot as any)?.clientSnapshot,
                        signatureData: gwData.signatureData || (gwData.orderSnapshot as any)?.signatureData,
                        items: snap.items && snap.items.length > 0 ? snap.items : (orderSnap.items || []),
                        accessories: snap.accessories && snap.accessories.length > 0 ? snap.accessories : (orderSnap.accessories || []),
                        services: snap.services && snap.services.length > 0 ? snap.services : (orderSnap.services || []),
                        clientSignature: gwData.signatureData?.image || gwData.clientSignature || (gwData.orderSnapshot as any)?.clientSignature || snap.clientSignature,
                        signedAt: gwData.signedAt || gwData.signatureData?.timestamp || (gwData.orderSnapshot as any)?.signedAt || snap.signedAt,
                        signatureToken: gwData.signatureToken || token,
                        contractStatus: gwData.signedAt ? 'signed' : (orderSnap.contractStatus || 'draft')
                    };

                    setOrder(finalOrderData);
                    return;
                } else {
                    setError('Acesso negado: Documento não encontrado no portal seguro.');
                    setLoading(false);
                    return;
                }
            }

            // 2. AUTHENTICATED ACCESS (Internal ERP)
            const docRef = doc(db, 'contratos', orderId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data() as Order;
                
                if (data.contractStatus === 'deleted' || (data as any).hiddenFromContracts === true) {
                    setError('Este contrato foi excluído da Central de Contratos.');
                    setLoading(false);
                    return;
                }
                
                let finalOrderData = { ...data, id: docSnap.id };
                
                // IMMUTABILITY ENGINE: Use snapshot if available
                if (data.contractSnapshot) {
                    const snap = data.contractSnapshot;
                    finalOrderData = {
                        ...finalOrderData,
                        ...snap,
                        items: snap.items && snap.items.length > 0 ? snap.items : (finalOrderData.items || []),
                        accessories: snap.accessories && snap.accessories.length > 0 ? snap.accessories : (finalOrderData.accessories || []),
                        services: snap.services && snap.services.length > 0 ? snap.services : (finalOrderData.services || []),
                        contractStatus: data.contractStatus,
                        contractSentAt: data.contractSentAt,
                        signedAt: data.signedAt,
                        signatureData: data.signatureData,
                        clientSignature: data.clientSignature || data.signatureData?.image,
                        signatureToken: data.signatureToken
                    };
                }
                
                setOrder(finalOrderData);

                // Check for newer client data
                const isSigned = ['signed', 'assinado', 'completed', 'finalizado'].includes(finalOrderData.contractStatus?.toLowerCase() || '');
                if (finalOrderData.clientId) {
                    const clientSnap = await getDoc(doc(db, 'clients', finalOrderData.clientId));
                    if (clientSnap.exists()) {
                        const currentClient = clientSnap.data();
                        const snapClient = finalOrderData.clientSnapshot || {};
                        // Simple heuristic: compare specific fields
                        if (
                            currentClient.name !== snapClient.name ||
                            currentClient.phone !== snapClient.phone ||
                            currentClient.document !== snapClient.document
                        ) {
                            setOutdatedClientData(true);
                            setLatestClientData(currentClient);
                        }
                    }
                }
            } else {
                setError('Pedido não encontrado.');
            }
        } catch (err: any) {
            console.error('[PRINT_ERROR]', err);
            if (err.code === 'permission-denied') {
                setError('Erro de segurança: Acesso ao pedido bloqueado.');
            } else {
                setError('Erro ao carregar o pedido.');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrder();
    }, [orderId]);

    // Trigger print automatically when data is loaded AND signed
    useEffect(() => {
        if (order && order.contractStatus === 'signed') {
            const isPostPDF = order.isPostMeasurement === true;
            const suffix = isPostPDF ? '_Pos-Medicao' : '';
            const safeCustomer = String(order.customerName || 'Cliente').trim().replace(/[^\w\sà-üÀ-Ü]/g, '').replace(/\s+/g, '_');
            const fileName = `Proposta_Comercial_${safeCustomer}${suffix}`;
            document.title = `${fileName.replace(/[<>:"/\\|?*]/g, '').trim()} | ${order?.protocolNumber || 'OS'}`;

            const timer = setTimeout(() => {
                window.print();
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [order]);

    const handleCompanySign = async () => {
        const savedSignature = settings.settings?.signature || settings.companySignature;
        
        if (!orderId) return;
        if (!savedSignature && (!sigPad.current || sigPad.current.isEmpty())) {
            alert('Por favor, faça a sua assinatura antes de confirmar.');
            return;
        }

        if (!acceptedTerms) {
            alert('Você deve aceitar os termos de responsabilidade para assinar.');
            return;
        }

        try {
            setIsSubmitting(true);
            
            // Try to get IP address
            let ip = '---';
            try {
                const response = await fetch('https://api.ipify.org?format=json');
                const data = await response.json();
                ip = data.ip;
            } catch (ipError) {
                console.warn('Could not fetch IP:', ipError);
            }

            const signatureImage = savedSignature || sigPad.current!.getTrimmedCanvas().toDataURL('image/png');
            const iso = toISODateSafe(new Date())!;
            
            const companySignatureData = {
                name: profile?.name || 'Assinatura Autorizada',
                document: profile?.email || '',
                ip: ip,
                timestamp: iso,
                image: signatureImage
            };

            // 1. Save to Contract record
            await updateDoc(doc(db, 'contratos', orderId), {
                contractStatus: 'company_signed',
                companySignedAt: iso,
                companySignatureData,
                updatedAt: iso,
                history: arrayUnion({
                    status: 'em_contrato',
                    timestamp: iso,
                    userId: profile?.uid,
                    notes: `ASSINATURA EMPRESA: Registro efetuado por ${profile?.name || 'Administrador'}. IP: ${ip}`
                }) as any
            });

            // 2. Save to Company Settings if it was manual and not already saved
            if (!savedSignature && profile?.companyId) {
                await updateSettings({
                    settings: {
                        ...settings.settings,
                        signature: signatureImage
                    }
                });
            }

            await fetchOrder();
            setShowSignModal(false);
        } catch (err) {
            console.error(err);
            alert('Falha ao registrar assinatura da empresa.');
        } finally {
            setIsSubmitting(false);
        }
    };
    const formatAddress = () => {
        const p = companyData || (settings as any);
        const parts = [p?.street, p?.number, p?.neighborhood, p?.city, p?.state].filter(Boolean);
        return parts.join(' - ');
    };
    
    const getContractPdfElement = () => {
        if (contractRef.current) return contractRef.current;
        const fallback = document.getElementById('contract-print-root');
        return fallback;
    };

    const handleDownloadPDF = async () => {
        try {
            if (typeof window === 'undefined' || !window.document) {
                return;
            }

            // OBJETIVO 4 — BLOQUEAR EXECUÇÃO PREMATURA
            if (!order || (!order.clientSnapshot && !order.customerName && !order.clientName)) {
                alert('Dados do contrato ainda não carregados completamente. Aguarde um momento.');
                return;
            }

            const element = getContractPdfElement();
            if (!element) {
                alert('Contrato ainda não carregou completamente. Aguarde alguns segundos e tente novamente.');
                return;
            }

            setIsGeneratingPDF(true);

            // Aguardar DOM estabilizar
            await new Promise(resolve => setTimeout(resolve, 500));

            // Validar elemento estável pós-delay
            const stableElement = getContractPdfElement();
            if (!stableElement) {
                alert('Erro ao localizar container do contrato.');
                return;
            }

            // Garantir que imagens (assinaturas) foram carregadas antes da captura
            const images = stableElement.querySelectorAll('img');
            await Promise.all(Array.from(images).map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                    img.onload = resolve;
                    img.onerror = resolve;
                });
            }));

            // Aplicar classe de exportação e aguardar frame
            document.body.classList.add('pdf-exporting');
            await new Promise(resolve => setTimeout(resolve, 150));

            // Mapear e aplicar espaçadores inteligentes para evitar cortes
            const PAGE_HEIGHT = 1122;
            const blocks = Array.from(stableElement.querySelectorAll(
                '.project-first-block, .env-group, .clause-item, .financial-section, .signature-section'
            )) as HTMLElement[];

            for (const block of blocks) {
                const containerRect = stableElement.getBoundingClientRect();
                const blockRect = block.getBoundingClientRect();
                const relativeTop = blockRect.top - containerRect.top;
                const relativeBottom = relativeTop + block.offsetHeight;

                const startPage = Math.floor(relativeTop / PAGE_HEIGHT);
                const endPage = Math.floor((relativeBottom - 1) / PAGE_HEIGHT);

                if (startPage !== endPage) {
                    const blockHeight = block.offsetHeight;
                    if (blockHeight < PAGE_HEIGHT) {
                        const spacerHeight = ((startPage + 1) * PAGE_HEIGHT) - relativeTop;
                        if (spacerHeight > 0) {
                            const spacer = document.createElement('div');
                            spacer.className = 'pdf-page-spacer';
                            spacer.style.height = `${spacerHeight}px`;
                            spacer.style.width = '100%';
                            spacer.style.backgroundColor = '#ffffff';
                            spacer.style.boxSizing = 'border-box';
                            spacer.style.margin = '0';
                            spacer.style.padding = '0';
                            block.parentNode?.insertBefore(spacer, block);
                        }
                    }
                }
            }

            const canvas = await html2canvas(stableElement, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                windowWidth: 794,
                windowHeight: stableElement.scrollHeight
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');

            const pageWidth = 210;
            const pageHeight = 297;
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            const customerName = (order.customerName || 'Cliente').replace(/[<>:"/\\|?*]/g, '').trim();
            const protocol = order.protocolNumber || order.id.slice(0, 8);
            const fileName = `Contrato_${customerName}_${protocol}.pdf`;
            
            pdf.save(fileName);
        } catch (error) {
            console.error('[PDF ERROR]', error);
            alert('Falha ao gerar PDF');
        } finally {
            // Remover os espaçadores do DOM se existirem
            document.querySelectorAll('.pdf-page-spacer').forEach(s => s.remove());
            document.body.classList.remove('pdf-exporting');
            setIsGeneratingPDF(false);
        }
    };

    const handleStartEditing = () => {
        const rawClauses = order?.contractSnapshot?.contractTemplate || (order as any).customClauses || settings?.contractTemplate || [];
        setEditedClauses(normalizeClauses(rawClauses));
        setIsEditingClauses(true);
    };

    const handleSaveClauses = async () => {
        if (!orderId) return;
        try {
            setIsSubmitting(true);
            const iso = toISODateSafe(new Date())!;
            
            // Se já existir um snapshot, atualizamos ele. Se não, atualizamos o campo customClauses no pedido.
            const updatePayload: any = {
                updatedAt: iso,
                history: arrayUnion({
                    date: iso,
                    action: 'CLÁUSULAS CONTRATUAIS EDITADAS',
                    user: profile?.name || 'Sistema',
                    severity: 'info'
                })
            };

            if (order?.contractSnapshot) {
                updatePayload.contractSnapshot = {
                    ...order.contractSnapshot,
                    contractTemplate: editedClauses
                };
            } else {
                updatePayload.customClauses = editedClauses;
            }

            await updateDoc(doc(db, 'contratos', orderId), updatePayload);
            await fetchOrder();
            setIsEditingClauses(false);
        } catch (err) {
            console.error(err);
            alert('Falha ao salvar alterações nas cláusulas.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleStartEditingContract = () => {
        if (!order) return;
        const overrides = order.contractOverrides || {};
        
        // Find existing installments
        const currentInstallments = safeArray(
            overrides.paymentSchedule || 
            order.paymentConditions?.installments
        );
        
        const entryInst = currentInstallments.find(i => 
            String(i.label || '').toLowerCase().includes('entrada') || 
            i.dueType === 'imediato'
        );

        const entryVal = entryInst?.amount || order.downPayment || 0;
        setOverrideEntry(entryVal === 0 ? '' : entryVal);
        setOverrideEntryMethod(entryInst?.paymentMethodLabel || 'Não informado');
        
        const remInstallments = currentInstallments.filter(i => i !== entryInst);
        setOverrideInstallments(remInstallments.map((inst, idx) => ({
            label: inst.label || `Parcela ${idx + 2}`,
            amount: (inst.amount === 0 || !inst.amount) ? '' : inst.amount,
            paymentMethodLabel: inst.paymentMethodLabel || 'Não informado',
            dueType: inst.dueType || 'data',
            dueDate: inst.dueDate || ''
        })));

        setOverrideNotes(overrides.hasOwnProperty('paymentNotes') ? overrides.paymentNotes : (order.observations || ''));
        setOverrideConditions(overrides.commercialConditions || '');
        
        const rawClauses = overrides.additionalClauses || order.contractSnapshot?.contractTemplate || (order as any).customClauses || settings?.contractTemplate || [];
        setOverrideClauses(normalizeClauses(rawClauses));

        setIsEditingContract(true);
    };

    const handleSaveContractOverrides = async () => {
        if (!order || !orderId) return;

        const normalizeNumeric = (valor: any): number => {
            if (valor === null || valor === undefined) return 0;
            const cleanStr = String(valor).replace(/\s/g, '').replace(',', '.');
            return Number(cleanStr) || 0;
        };

        const entryCents = Math.round(normalizeNumeric(overrideEntry) * 100);
        const totalInstallmentsCents = overrideInstallments.reduce((acc, inst) => acc + Math.round(normalizeNumeric(inst.amount) * 100), 0);
        const totalSumCents = entryCents + totalInstallmentsCents;
        const totalAmountCents = Math.round((order.totalAmount || 0) * 100);
        
        const diffCents = Math.abs(totalSumCents - totalAmountCents);
        if (diffCents > 1) {
            const totalSum = totalSumCents / 100;
            const totalAmount = totalAmountCents / 100;
            const diff = totalAmount - totalSum;
            const diffMsg = diff > 0 
                ? `Faltam ${formatCurrency(diff)} para completar o total.`
                : `A soma ultrapassa o total em ${formatCurrency(Math.abs(diff))}.`;
            alert(`A soma das parcelas precisa ser igual ao total do contrato.\n\nTotal do Contrato: ${formatCurrency(totalAmount)}\nSoma Atual: ${formatCurrency(totalSum)}\n\n${diffMsg}`);
            return;
        }

        try {
            setIsSubmitting(true);
            const iso = toISODateSafe(new Date())!;

            const paymentSchedule = [
                {
                    label: 'Entrada / Sinal',
                    amount: entryNumeric,
                    paymentMethodLabel: overrideEntryMethod,
                    dueType: 'imediato' as const,
                    dueDate: ''
                },
                ...overrideInstallments.map((inst, index) => ({
                    label: inst.label || `Parcela ${index + 2}`,
                    amount: normalizeNumeric(inst.amount),
                    paymentMethodLabel: inst.paymentMethodLabel || 'Não informado',
                    dueType: inst.dueType || ('data' as const),
                    dueDate: inst.dueType === 'data' ? inst.dueDate : ''
                }))
            ];

            const overrides = {
                paymentSchedule,
                paymentNotes: overrideNotes,
                commercialConditions: overrideConditions,
                additionalClauses: overrideClauses,
                updatedAt: iso,
                updatedBy: user?.uid || ''
            };

            const updatePayload: any = {
                contractOverrides: overrides,
                updatedAt: iso,
                history: arrayUnion({
                    date: iso,
                    action: 'Contrato editado manualmente antes do envio.',
                    user: profile?.name || 'Sistema',
                    severity: 'info'
                })
            };

            await updateDoc(doc(db, 'contratos', orderId), updatePayload);
            await fetchOrder();
            setIsEditingContract(false);
        } catch (err) {
            console.error(err);
            alert('Falha ao salvar as alterações do contrato.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCreateNewVersion = async () => {
        if (!order || !orderId || !window.confirm('Isso revogará o contrato atual e criará uma nova versão para edição. Continuar?')) return;

        try {
            setIsSubmitting(true);
            const iso = toISODateSafe(new Date())!;
            const userName = profile?.name || 'Sistema';

            const newVersion = (order.version || 1) + 1;
            
            // 1. Atualizar o contrato principal (resetando status e incrementando versão)
            await updateDoc(doc(db, 'contratos', orderId), {
                contractStatus: 'draft',
                contractSnapshot: deleteField(),
                clientSignature: deleteField(),
                signedAt: deleteField(),
                signatureData: deleteField(),
                companySignedAt: deleteField(),
                companySignatureData: deleteField(),
                contractSentAt: deleteField(),
                contractViewedAt: deleteField(),
                version: newVersion,
                signatureToken: crypto.randomUUID(), // Novo token para segurança
                history: arrayUnion({
                    date: iso,
                    action: `NOVA VERSÃO CONTRATUAL INICIADA (v${newVersion})`,
                    user: userName,
                    severity: 'warning'
                })
            });

            // 2. Desativar link público antigo
            if (order.signatureToken) {
                await updateDoc(doc(db, 'public_contract_links', order.signatureToken), {
                    active: false,
                    revokedAt: iso,
                    revocationReason: `Nova versão v${newVersion} criada.`
                });
            }

            await fetchOrder();
            alert('Nova versão criada com sucesso! O contrato agora está aberto para edição.');
        } catch (err) {
            console.error(err);
            alert('Falha ao criar nova versão.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSendToClient = async () => {
        if (!order || !orderId) return;

        if (order.contractStatus === 'signed') {
            alert('Não é permitido atualizar o snapshot de um contrato assinado.');
            return;
        }
        
        try {
            const iso = toISODateSafe(new Date())!;
            const token = crypto.randomUUID();

            console.log('[GATEWAY] Generating token and saving public link...');

            // Montar contractSnapshot completo e seguro (empresa + orçamento atualizado)
            const contractSnapshot = {
                companyName: safeValue(companyData?.name, safeValue(settings?.companyName, '')),
                companyCnpj: safeValue(companyData?.cnpj, safeValue((settings as any)?.cnpj, '')),
                companyAddress: safeValue(formatAddress(), ''),
                companyPhone: safeValue(companyData?.whatsapp1 || companyData?.telefoneFixo, safeValue((settings as any)?.phone, '')),
                companyLogo: safeValue(companyData?.logoUrl, safeValue(settings?.logoUrl, '')),
                companySignature: safeValue(settings.settings?.signature, safeValue(settings.companySignature, safeValue(companyData?.companySignature, ''))),
                contractTemplate: normalizeClauses(safeValue((order as any).customClauses, safeValue(settings?.contractTemplate, []))),
                quoteLayout: safeValue(companyData?.quoteLayout, 'classic'),
                
                // Budget values
                items: order.items && order.items.length > 0 ? order.items : (order.contractSnapshot?.items || (order as any).orderSnapshot?.items || (order as any).quoteSnapshot?.items || []),
                accessories: order.accessories && order.accessories.length > 0 ? order.accessories : (order.contractSnapshot?.accessories || (order as any).orderSnapshot?.accessories || (order as any).quoteSnapshot?.accessories || []),
                services: order.services && order.services.length > 0 ? order.services : (order.contractSnapshot?.services || (order as any).orderSnapshot?.services || (order as any).quoteSnapshot?.services || []),
                commercialTotal: safeValue(order.commercialTotal, 0),
                operationalCost: safeValue(order.operationalCost, 0),
                freight: safeValue(order.freight, 0),
                totalAmount: safeValue(order.totalAmount, 0),
                subtotal: safeValue(order.subtotal, 0),
                discount: safeValue(order.discount, 0),
                customerName: safeValue(order.customerName, safeValue((order as any).clientName, '')),
                document: safeValue(order.document, safeValue((order as any).customerDocument, '')),
                phone: safeValue(order.phone, safeValue((order as any).customerPhone, '')),
                address: safeValue(order.address, ''),
                observations: safeValue(order.observations, ''),
                splashback: safeValue(order.splashback, ''),
                skirt: safeValue(order.skirt, ''),
                paymentTerms: safeValue(order.paymentTerms, ''),
                deliveryTime: safeValue(order.deliveryTime, ''),
                version: safeValue(order.version, 1),
                isPostMeasurement: safeValue(order.isPostMeasurement, false),
                generatedAt: iso
            };

            // 1. Criar o documento no portal público (Document ID = token)
            const gatewayPayload = removeUndefinedDeep({
                active: true,
                token,
                companyId: safeValue(profile?.companyId, safeValue(order.companyId, '')),
                orderId: safeValue(order.id, orderId),
                contractSnapshot,
                orderSnapshot: {
                    id: safeValue(order.id, orderId),
                    customerName: safeValue(order.customerName, safeValue((order as any).clientName, '')),
                    document: safeValue(order.document, safeValue((order as any).customerDocument, '')),
                    phone: safeValue(order.phone, safeValue((order as any).customerPhone, '')),
                    address: safeValue(order.address, ''),
                    items: order.items && order.items.length > 0 ? order.items : (order.contractSnapshot?.items || (order as any).orderSnapshot?.items || (order as any).quoteSnapshot?.items || []),
                    totalAmount: safeValue(order.totalAmount, 0),
                    downPayment: safeValue(order.downPayment, 0),
                    balance: safeValue(order.balance, 0),
                    remainingAmount: safeValue((order as any).remainingAmount, (Math.round((order.totalAmount || 0) * 100) - Math.round((order.downPayment || 0) * 100)) / 100),
                    paymentConditions: safeValue(order.paymentConditions, null),
                    paymentMethod: safeValue(order.paymentMethod, ''),
                    protocolNumber: safeValue(order.protocolNumber, ''),
                    deadline: safeValue(order.deadline, ''),
                    material: safeValue(order.material, ''),
                    contractStatus: 'pending',
                    contractSnapshot: contractSnapshot,
                    clientSnapshot: safeValue(order.clientSnapshot, null),
                    accessories: order.accessories && order.accessories.length > 0 ? order.accessories : (order.contractSnapshot?.accessories || (order as any).orderSnapshot?.accessories || (order as any).quoteSnapshot?.accessories || []),
                    services: order.services && order.services.length > 0 ? order.services : (order.contractSnapshot?.services || (order as any).orderSnapshot?.services || (order as any).quoteSnapshot?.services || []),
                    createdAt: order.createdAt
                },
                createdAt: serverTimestamp(),
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            });

            console.log('[PAYLOAD FINAL]', gatewayPayload);

            await setDoc(doc(db, 'public_contract_links', token), gatewayPayload);

            // --- VERIFICAÇÃO CRÍTICA DE PERSISTÊNCIA ---
            const checkSnap = await getDoc(doc(db, 'public_contract_links', token));
            
            console.log('[CHECK_LINK_CREATED]', checkSnap.exists());
            console.log('[GATEWAY_DEBUG] Project ID:', firebaseConfig.projectId);
            console.log('[GATEWAY_DEBUG] Database ID:', import.meta.env.VITE_FIREBASE_DATABASE_ID || 'marbleflow');
            console.log('[GATEWAY_DEBUG] Link created successfully.');

            if (!checkSnap.exists()) {
                throw new Error('Falha crítica: O link não pôde ser verificado no banco de dados após a criação.');
            }

            // 2. Atualizar o documento principal do contrato
            await updateDoc(doc(db, 'contratos', orderId), {
                updatedAt: iso,
                signatureToken: token,
                contractSnapshot,
                contractStatus: 'pending',
                contractSentAt: iso,
                history: arrayUnion({
                    status: 'em_contrato',
                    timestamp: iso,
                    userId: user?.uid,
                    notes: `LINK DE ASSINATURA GERADO: Contrato liberado para o cliente via token ${token}.`
                })
            });

            // 3. Copiar link para o clipboard
            const link = `${window.location.origin}/sign/${token}`;
            await navigator.clipboard.writeText(link);
            
            console.log('[AUDIT_GATEWAY] Link copiado com sucesso:', link);

            await fetchOrder();
            alert('Link de Assinatura do Cliente copiado!\n\nEnvie este link para que o cliente possa assinar o contrato.');
        } catch (err) {
            console.error("ERRO AO GERAR LINK:", err);
            alert('Falha ao gerar link de assinatura.');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center flex-col gap-4">
                <Loader2 className="w-8 h-8 text-brand-emerald animate-spin" />
                <p className="text-slate-500 font-medium font-black uppercase tracking-widest text-[10px]">Autenticando Contrato...</p>
            </div>
        );
    }

    if (error || !order) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
                <div className="bg-white p-12 rounded-[3rem] shadow-premium max-w-sm border border-slate-200">
                    <p className="text-red-600 font-black uppercase text-xs mb-8 tracking-widest">{error || 'Erro desconhecido'}</p>
                    <Button onClick={() => navigate('/')} className="w-full bg-slate-900 rounded-2xl h-14 uppercase font-black text-[10px] tracking-widest">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Voltar ao Início
                    </Button>
                </div>
            </div>
        );
    }

    const normalizeNumeric = (valor: any): number => {
        if (valor === null || valor === undefined) return 0;
        const cleanStr = String(valor).replace(/\s/g, '').replace(',', '.');
        return Number(cleanStr) || 0;
    };

    const updateOverrideEntry = (val: string) => {
        setOverrideEntry(val);
        const totalAmount = order?.totalAmount || 0;
        const totalCents = Math.round(totalAmount * 100);
        const entryCents = Math.round(normalizeNumeric(val) * 100);
        
        if (overrideInstallments.length > 0) {
            const newInst = [...overrideInstallments];
            let sumPriorCents = 0;
            for (let i = 0; i < newInst.length - 1; i++) {
                sumPriorCents += Math.round(normalizeNumeric(newInst[i].amount) * 100);
            }
            const lastCents = totalCents - entryCents - sumPriorCents;
            const lastIdx = newInst.length - 1;
            newInst[lastIdx].amount = lastCents / 100;
            setOverrideInstallments(newInst);
        }
    };

    const updateOverrideInstallmentAmount = (index: number, val: string) => {
        const newInst = [...overrideInstallments];
        newInst[index].amount = val;
        
        const totalAmount = order?.totalAmount || 0;
        const totalCents = Math.round(totalAmount * 100);
        const entryCents = Math.round(normalizeNumeric(overrideEntry) * 100);
        
        if (newInst.length > 0) {
            if (index === newInst.length - 1 && newInst.length > 1) {
                const amountCents = Math.round(normalizeNumeric(val) * 100);
                let otherSumCents = 0;
                for (let i = 1; i < newInst.length; i++) {
                    otherSumCents += Math.round(normalizeNumeric(newInst[i].amount) * 100);
                }
                const firstCents = totalCents - entryCents - otherSumCents;
                newInst[0].amount = firstCents / 100;
            } else {
                let sumPriorCents = 0;
                for (let i = 0; i < newInst.length - 1; i++) {
                    sumPriorCents += Math.round(normalizeNumeric(newInst[i].amount) * 100);
                }
                const lastCents = totalCents - entryCents - sumPriorCents;
                const lastIdx = newInst.length - 1;
                newInst[lastIdx].amount = lastCents / 100;
            }
            setOverrideInstallments(newInst);
        }
    };

    const entryNumeric = normalizeNumeric(overrideEntry);
    const totalInstallmentsSum = overrideInstallments.reduce((acc, inst) => acc + normalizeNumeric(inst.amount), 0);
    const totalAllocated = entryNumeric + totalInstallmentsSum;
    const remaining = (order?.totalAmount || 0) - totalAllocated;
    const sumMatches = Math.abs(remaining) < 0.015;
    const calculatedRemaining = Math.max(0, remaining);

    return (
        <div className="min-h-screen bg-slate-100 py-10 print:p-0 print:bg-white overflow-visible pb-40">
            {/* Overlay UI - Hidden during printing */}
            <div className="fixed top-6 right-6 flex gap-3 print:hidden z-[9999]">
                <Button 
                    variant="outline" 
                    className="bg-white shadow-xl border-slate-200 hover:bg-slate-50 rounded-2xl h-12 px-6 font-black uppercase text-[10px] tracking-widest"
                    onClick={() => navigate('/contratos')}
                >
                    <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
                </Button>
                
                <Button 
                    variant="outline" 
                    className="bg-white shadow-xl border-slate-200 hover:bg-slate-50 rounded-2xl h-12 px-6 font-black uppercase text-[10px] tracking-widest text-slate-600"
                    onClick={handleDownloadPDF}
                    disabled={!order || isGeneratingPDF}
                >
                    {isGeneratingPDF ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                        <DownloadCloud className="w-4 h-4 mr-2" />
                    )}
                    {isGeneratingPDF ? 'Gerando PDF...' : 'Baixar PDF'}
                </Button>

                {!isPublicView && order.contractStatus !== 'signed' && (
                    <Button
                        onClick={handleSendToClient}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl"
                    >
                        Gerar/Reenviar Link
                    </Button>
                )}

                {order.contractStatus === 'signed' ? (
                    <Button 
                        className="bg-slate-900 text-white shadow-xl shadow-slate-900/20 px-8 rounded-2xl h-12 font-black uppercase text-[10px] tracking-widest"
                        onClick={() => window.print()}
                    >
                        <Printer className="w-4 h-4 mr-2" /> Imprimir Contrato Final
                    </Button>
                ) : (
                    !isPublicView && (
                        <div className="bg-amber-100 text-amber-800 px-6 h-12 rounded-2xl flex items-center gap-2 border border-amber-200 shadow-sm">
                            <Clock className="w-4 h-4 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest">
                                {order.contractStatus === 'draft' ? 'Contrato em Edição' : 'Aguardando Assinaturas'}
                            </span>
                        </div>
                    )
                )}
            </div>

            {/* Editing Panel (Pre-Signature) */}
            {isEditingClauses && (
                <div className="fixed left-6 top-6 bottom-24 w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-[2.5rem] shadow-premium-up z-[9999] flex flex-col print:hidden animate-in slide-in-from-left-4">
                    <div className="p-8 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Editor de Cláusulas</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-1">Ajuste o texto jurídico antes de assinar</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => setIsEditingClauses(false)} className="rounded-xl h-10 w-10">
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                        {safeArray(editedClauses).map((clause, idx) => (
                            <div key={idx} className="space-y-3">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block">Cláusula {idx + 1}</label>
                                <Input 
                                    value={clause.title} 
                                    onChange={(e) => {
                                        const newClauses = [...editedClauses];
                                        newClauses[idx].title = e.target.value;
                                        setEditedClauses(newClauses);
                                    }}
                                    className="font-black text-xs uppercase"
                                    placeholder="Título da Cláusula"
                                />
                                <textarea 
                                    value={clause.content} 
                                    onChange={(e) => {
                                        const newClauses = [...editedClauses];
                                        newClauses[idx].content = e.target.value;
                                        setEditedClauses(newClauses);
                                    }}
                                    className="w-full min-h-[120px] p-4 text-xs font-medium leading-relaxed bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl focus:ring-2 focus:ring-brand-emerald/20 outline-none resize-none text-slate-600 dark:text-slate-300"
                                    placeholder="Conteúdo da Cláusula"
                                />
                            </div>
                        ))}
                    </div>

                    <div className="p-8 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-white/5 rounded-b-[2.5rem]">
                        <Button 
                            onClick={handleSaveClauses} 
                            disabled={isSubmitting}
                            className="w-full h-14 bg-brand-emerald hover:bg-emerald-600 text-slate-900 font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-lg shadow-emerald-500/10"
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Salvar Alterações</>}
                        </Button>
                    </div>
                </div>
            )}

            {/* Outdated Client Warning Banner */}
            {outdatedClientData && latestClientData && !isPublicView && order && (
                <div className="max-w-4xl mx-auto mb-6 print:hidden z-10 relative">
                    <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 flex flex-col md:flex-row gap-6 items-center justify-between shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shrink-0">
                                <AlertTriangle className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-amber-900 font-black uppercase text-[11px] tracking-widest">
                                    {['signed', 'assinado', 'completed', 'finalizado'].includes(order.contractStatus?.toLowerCase() || '') 
                                        ? "Dados do cliente atualizados recentemente" 
                                        : "Dados do cliente desatualizados neste contrato"
                                    }
                                </h3>
                                <p className="text-amber-700/80 text-[11px] font-medium mt-1">
                                    {['signed', 'assinado', 'completed', 'finalizado'].includes(order.contractStatus?.toLowerCase() || '') 
                                        ? "O cadastro principal do cliente foi atualizado. Este contrato já foi assinado e, por segurança jurídica, manterá o histórico (snapshot) original da data da assinatura." 
                                        : "O cadastro principal do cliente foi atualizado. Este contrato exibe o snapshot antigo. Deseja atualizar o contrato com os dados mais recentes?"
                                    }
                                </p>
                            </div>
                        </div>
                        {!['signed', 'assinado', 'completed', 'finalizado'].includes(order.contractStatus?.toLowerCase() || '') && (
                            <Button 
                                className="shrink-0 h-12 px-6 bg-amber-500 hover:bg-amber-600 text-white font-black uppercase text-[10px] tracking-widest rounded-xl shadow-lg shadow-amber-500/20"
                                onClick={async () => {
                                    if (!order) return;
                                    try {
                                        setIsSyncingClient(true);
                                        await syncClientDataToContracts(order.clientId, latestClientData);
                                        alert('Contrato atualizado com os novos dados do cliente!');
                                        setOutdatedClientData(false);
                                        await fetchOrder();
                                    } catch (err) {
                                        alert('Erro ao atualizar contrato.');
                                    } finally {
                                        setIsSyncingClient(false);
                                    }
                                }}
                                disabled={isSyncingClient}
                            >
                                {isSyncingClient ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                                Sincronizar Dados
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Template Rendering Area */}
            <div className={cn("w-full flex justify-center print:block print:p-0 overflow-visible transition-all duration-500", (showSignModal || isEditingClauses || isEditingContract) ? "blur-md scale-[0.98]" : "scale-100", isEditingClauses && "ml-48")}>
                {order ? <ContractPrintTemplate ref={contractRef} order={order} /> : <div>Carregando conteúdo do contrato...</div>}
            </div>

            {/* Workflow Action Bar - Only for Admins */}
            {!isPublicView && (
                <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-200/60 p-8 flex justify-center gap-6 print:hidden z-[9999] shadow-[0_-20px_50px_rgba(0,0,0,0.1)]">
                    
                    {/* Status: SIGNED (Lockdown) */}
                    {order.contractStatus === 'signed' && (
                        <div className="flex items-center gap-6">
                            <div className="bg-emerald-50 border border-emerald-100 px-12 h-20 rounded-[2.5rem] flex flex-col items-center justify-center gap-1 shadow-sm">
                                <CheckCircle2 className="w-6 h-6 text-emerald-500 mb-0.5" />
                                <span className="text-sm font-black text-emerald-900 uppercase tracking-[0.2em]">Contrato Assinado</span>
                                <span className="text-[8px] font-black text-emerald-600 uppercase">Documento Bloqueado para Segurança</span>
                            </div>
                            
                            <Button 
                                onClick={handleCreateNewVersion}
                                disabled={isSubmitting}
                                className="bg-slate-900 text-white font-black uppercase tracking-widest px-10 h-20 rounded-[2.5rem] shadow-xl hover:bg-black transition-all flex flex-col items-center justify-center gap-1"
                            >
                                <FilePlus className="w-5 h-5 text-brand-emerald mb-0.5" />
                                <span className="text-xs">Criar Nova Versão</span>
                                <span className="text-[8px] opacity-40">Editar após assinatura</span>
                            </Button>
                        </div>
                    )}

                    {/* Status: DRAFT / PENDING (Editable) */}
                    {order.contractStatus !== 'signed' && (
                        <>
                            <Button 
                                onClick={handleStartEditingContract}
                                className="bg-white border border-slate-200 text-slate-600 font-black uppercase tracking-widest px-10 h-20 rounded-[2.5rem] shadow-sm hover:bg-slate-50 transition-all flex flex-col items-center justify-center gap-1"
                            >
                                <FileEdit className="w-5 h-5 text-purple-600 mb-0.5" />
                                <span className="text-xs">Editar Contrato</span>
                                <span className="text-[8px] opacity-40">Condições & Financeiro</span>
                            </Button>

                            <Button 
                                onClick={handleStartEditing}
                                className="bg-white border border-slate-200 text-slate-600 font-black uppercase tracking-widest px-10 h-20 rounded-[2.5rem] shadow-sm hover:bg-slate-50 transition-all flex flex-col items-center justify-center gap-1"
                            >
                                <FileEdit className="w-5 h-5 text-brand-emerald mb-0.5" />
                                <span className="text-xs">Editar Cláusulas</span>
                                <span className="text-[8px] opacity-40">Ajuste Manual do Conteúdo</span>
                            </Button>

                            {/* Botão de Assinatura da Empresa (se ainda não assinado) */}
                            {order.contractStatus === 'draft' && (
                                <Button 
                                    onClick={() => setShowSignModal(true)}
                                    className="bg-slate-900 text-white font-black uppercase tracking-[0.2em] px-16 h-20 rounded-[2.5rem] shadow-2xl shadow-slate-900/20 flex flex-col items-center justify-center gap-1 hover:scale-105 active:scale-95 transition-all"
                                >
                                    <ShieldCheck className="w-6 h-6 text-brand-emerald mb-0.5" />
                                    <span className="text-sm">Assinar como Empresa</span>
                                    <span className="text-[8px] opacity-40">Validação Interna de Contratada</span>
                                </Button>
                            )}

                            {/* Botão Gerar/Reenviar Link (Sempre visível se não assinado) */}
                            <Button 
                                onClick={handleSendToClient}
                                className={cn(
                                    "font-black uppercase tracking-[0.2em] px-16 h-20 rounded-[2.5rem] shadow-2xl flex flex-col items-center justify-center gap-1 hover:scale-105 active:scale-95 transition-all",
                                    (order.contractStatus === 'company_signed' || order.contractStatus === 'pending' || order.contractStatus === 'viewed') 
                                        ? "bg-emerald-500 text-white shadow-emerald-500/20" 
                                        : "bg-white border border-slate-200 text-slate-600 shadow-sm"
                                )}
                            >
                                <Send className="w-6 h-6 mb-0.5" />
                                <span className="text-sm">Gerar/Reenviar Link</span>
                                <span className="text-[8px] opacity-60">Portal de Assinatura Digital</span>
                            </Button>

                            {(order.contractStatus === 'viewed' || order.contractStatus === 'pending') && (
                                <div className="bg-slate-50 border border-slate-200 px-12 h-20 rounded-[2.5rem] flex flex-col items-center justify-center gap-1 shadow-sm">
                                    <History className="w-5 h-5 text-slate-400 mb-0.5 animate-spin duration-[3000ms]" />
                                    <span className="text-sm font-black text-slate-900 uppercase tracking-widest">
                                        {order.contractStatus === 'viewed' ? 'Cliente Visualizou' : 'Aguardando Assinatura'}
                                    </span>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Contract Overrides Editor Modal */}
            <Modal
                isOpen={isEditingContract}
                onClose={() => setIsEditingContract(false)}
                title="Editar Condições Comerciais do Contrato"
            >
                <div className="space-y-6 pb-6 text-slate-800 dark:text-slate-200">
                    
                    {/* Info Box: Total do Contrato */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl flex items-center justify-between border border-slate-100 dark:border-white/5">
                        <div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total do Contrato</p>
                            <p className="text-xl font-black text-slate-900 dark:text-white tabular-nums">
                                {formatCurrency(order?.totalAmount || 0)}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total Alocado (Entrada + Parcelas)</p>
                            <p className={cn(
                                "text-xl font-black tabular-nums",
                                sumMatches ? "text-emerald-500" : "text-amber-500 animate-pulse"
                            )}>
                                {formatCurrency(totalAllocated)}
                            </p>
                        </div>
                    </div>

                    {/* Validation Alert */}
                    {!sumMatches && (
                        <div className="bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40 p-3.5 rounded-xl flex items-center gap-2.5 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>
                                {remaining > 0 
                                    ? `A soma das parcelas precisa ser igual ao total do contrato (${formatCurrency(remaining)} restante).`
                                    : `A soma das parcelas ultrapassa o total do contrato em ${formatCurrency(Math.abs(remaining))}.`
                                }
                            </span>
                        </div>
                    )}

                    {/* Secao 1: Entrada / Sinal */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Entrada / Sinal</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-2xl border border-slate-100 dark:border-white/5">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Valor da Entrada</label>
                                <Input 
                                    type="number" 
                                    value={overrideEntry} 
                                    onChange={(e) => updateOverrideEntry(e.target.value)} 
                                    placeholder="R$ 0,00"
                                    className="h-11 rounded-xl"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Forma de Pagamento da Entrada</label>
                                <select 
                                    value={overrideEntryMethod}
                                    onChange={(e) => setOverrideEntryMethod(e.target.value)}
                                    className="w-full h-11 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 px-3 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-brand-emerald/20"
                                >
                                    <option value="PIX">PIX</option>
                                    <option value="Dinheiro">Dinheiro</option>
                                    <option value="Cartão de Débito">Cartão de Débito</option>
                                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                                    <option value="Boleto">Boleto</option>
                                    <option value="Transferência">Transferência</option>
                                    <option value="A combinar">A combinar</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Secao 2: Cronograma de Parcelas */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Cronograma de Parcelas (Saldo)</h4>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setOverrideInstallments([...overrideInstallments, { label: `Parcela ${overrideInstallments.length + 2}`, amount: '', paymentMethodLabel: 'PIX', dueType: 'data', dueDate: '' }])}
                                className="h-8 rounded-xl text-[10px] font-black uppercase tracking-wider"
                            >
                                + Adicionar Parcela
                            </Button>
                        </div>
                        
                        <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-1 custom-scrollbar">
                            {overrideInstallments.map((inst, index) => (
                                <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 p-4 rounded-2xl relative group hover:border-brand-emerald/20 transition-all">
                                    
                                    <div className="md:col-span-3 space-y-1">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase">Identificação</label>
                                        <Input 
                                            value={inst.label} 
                                            onChange={(e) => {
                                                const newInst = [...overrideInstallments];
                                                newInst[index].label = e.target.value;
                                                setOverrideInstallments(newInst);
                                            }}
                                            placeholder={`Parcela ${index + 2}`}
                                            className="h-9 text-xs rounded-xl"
                                        />
                                    </div>

                                    <div className="md:col-span-2 space-y-1">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase">Valor</label>
                                        <Input 
                                            type="number"
                                            value={inst.amount} 
                                            onChange={(e) => updateOverrideInstallmentAmount(index, e.target.value)}
                                            placeholder="R$ 0,00"
                                            className="h-9 text-xs rounded-xl"
                                        />
                                    </div>

                                    <div className="md:col-span-3 space-y-1">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase">Forma Pgto.</label>
                                        <select 
                                            value={inst.paymentMethodLabel}
                                            onChange={(e) => {
                                                const newInst = [...overrideInstallments];
                                                newInst[index].paymentMethodLabel = e.target.value;
                                                setOverrideInstallments(newInst);
                                            }}
                                            className="w-full h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 px-2 text-[10px] font-bold uppercase outline-none"
                                        >
                                            <option value="PIX">PIX</option>
                                            <option value="Dinheiro">Dinheiro</option>
                                            <option value="Cartão de Débito">Cartão de Débito</option>
                                            <option value="Cartão de Crédito">Cartão de Crédito</option>
                                            <option value="Boleto">Boleto</option>
                                            <option value="Transferência">Transferência</option>
                                            <option value="A combinar">A combinar</option>
                                        </select>
                                    </div>

                                    <div className="md:col-span-2 space-y-1">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase">Vencimento</label>
                                        <select 
                                            value={inst.dueType}
                                            onChange={(e) => {
                                                const newInst = [...overrideInstallments];
                                                newInst[index].dueType = e.target.value;
                                                setOverrideInstallments(newInst);
                                            }}
                                            className="w-full h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 px-2 text-[10px] font-bold uppercase outline-none"
                                        >
                                            <option value="data">Data Fixa</option>
                                            <option value="entrega">Na Entrega</option>
                                            <option value="imediato">Sinal Imediato</option>
                                        </select>
                                    </div>

                                    <div className="md:col-span-2 space-y-1">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase">Data Limite</label>
                                        <Input 
                                            type="date"
                                            value={inst.dueDate} 
                                            disabled={inst.dueType !== 'data'}
                                            onChange={(e) => {
                                                const newInst = [...overrideInstallments];
                                                newInst[index].dueDate = e.target.value;
                                                setOverrideInstallments(newInst);
                                            }}
                                            className="h-9 text-xs rounded-xl"
                                        />
                                    </div>

                                    <button 
                                        onClick={() => setOverrideInstallments(overrideInstallments.filter((_, i) => i !== index))}
                                        className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-md"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                            {overrideInstallments.length === 0 && (
                                <div className="text-center py-6 border border-dashed border-slate-200 dark:border-white/5 rounded-2xl text-[11px] font-black uppercase text-slate-400">
                                    Nenhuma parcela adicional cadastrada (100% à vista/entrada)
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Secao 3: Observacoes e Condicoes Comerciais */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Observações Financeiras</label>
                            <textarea 
                                value={overrideNotes} 
                                onChange={(e) => setOverrideNotes(e.target.value)}
                                placeholder="Ex: Pagamento da entrada via PIX no fechamento..."
                                className="w-full h-24 p-3.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-brand-emerald/20 resize-none font-medium text-slate-800 dark:text-slate-100"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Condições Comerciais</label>
                            <textarea 
                                value={overrideConditions} 
                                onChange={(e) => setOverrideConditions(e.target.value)}
                                placeholder="Ex: Entrega em até 15 dias úteis após medição final..."
                                className="w-full h-24 p-3.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-brand-emerald/20 resize-none font-medium text-slate-800 dark:text-slate-100"
                            />
                        </div>
                    </div>

                    {/* Secao 4: Clausulas Adicionais */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Cláusulas Adicionais</h4>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setOverrideClauses([...overrideClauses, { title: 'Nova Cláusula', content: '' }])}
                                className="h-8 rounded-xl text-[10px] font-black uppercase tracking-wider"
                            >
                                + Adicionar Cláusula
                            </Button>
                        </div>
                        
                        <div className="space-y-4 max-h-[30vh] overflow-y-auto pr-1 custom-scrollbar">
                            {overrideClauses.map((clause, idx) => (
                                <div key={idx} className="space-y-2.5 p-4 bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-white/5 rounded-2xl relative group">
                                    <Input 
                                        value={clause.title} 
                                        onChange={(e) => {
                                            const newClauses = [...overrideClauses];
                                            newClauses[idx].title = e.target.value;
                                            setOverrideClauses(newClauses);
                                        }}
                                        className="font-black text-xs uppercase h-9 rounded-xl"
                                        placeholder="Título da Cláusula"
                                    />
                                    <textarea 
                                        value={clause.content} 
                                        onChange={(e) => {
                                            const newClauses = [...overrideClauses];
                                            newClauses[idx].content = e.target.value;
                                            setOverrideClauses(newClauses);
                                        }}
                                        className="w-full h-24 p-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl outline-none resize-none text-slate-600 dark:text-slate-300"
                                        placeholder="Conteúdo da Cláusula"
                                    />
                                    <button 
                                        onClick={() => setOverrideClauses(overrideClauses.filter((_, i) => i !== idx))}
                                        className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-md"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
                        <Button 
                            variant="outline" 
                            onClick={() => setIsEditingContract(false)}
                            className="h-12 px-6 font-black uppercase text-[10px] tracking-widest rounded-xl"
                        >
                            Cancelar
                        </Button>
                        <Button 
                            onClick={handleSaveContractOverrides} 
                            disabled={isSubmitting || !sumMatches}
                            className="h-12 px-8 bg-brand-emerald hover:bg-emerald-600 text-slate-900 font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-emerald-500/10"
                        >
                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar Alterações'}
                        </Button>
                    </div>

                </div>
            </Modal>

            {/* Signature Modal */}
            <Modal
                isOpen={showSignModal}
                onClose={() => setShowSignModal(false)}
                title="Assinatura Digital da Empresa"
                className="max-w-xl"
            >
                <div className="space-y-8 p-4">
                    <div className="text-center space-y-2">
                        <ShieldCheck className="w-12 h-12 text-brand-emerald mx-auto mb-4" />
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Validação de Contratada</p>
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Eu, {profile?.name || 'Administrador'}, confirmo os dados deste contrato.</h3>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-2 relative group overflow-hidden min-h-60 flex items-center justify-center">
                        {(settings.settings?.signature || settings.companySignature) ? (
                            <div className="flex flex-col items-center gap-4 p-8">
                                <img 
                                    src={settings.settings?.signature || settings.companySignature} 
                                    alt="Assinatura Salva" 
                                    className="max-h-40 object-contain"
                                />
                                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                                    Assinatura padrão da empresa detectada
                                </p>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => updateSettings({ settings: { ...settings.settings, signature: undefined }, companySignature: undefined })}
                                    className="text-rose-500 font-black uppercase tracking-widest text-[8px]"
                                >
                                    Alterar Assinatura
                                </Button>
                            </div>
                        ) : (
                            <>
                                <SignatureCanvas 
                                    ref={sigPad}
                                    penColor="#003B8E"
                                    canvasProps={{
                                        className: "w-full h-full cursor-crosshair"
                                    }}
                                />
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10 group-active:opacity-0 transition-opacity">
                                    <p className="text-xl font-black uppercase tracking-[0.2em] transform -rotate-12 border-4 border-slate-900 px-6 py-2">Assinar Aqui</p>
                                </div>
                                <button 
                                    onClick={() => sigPad.current?.clear()}
                                    className="absolute bottom-4 right-4 text-[9px] font-black text-rose-500 uppercase bg-white px-3 py-1.5 rounded-full shadow-sm hover:bg-rose-50"
                                >
                                    Limpar
                                </button>
                            </>
                        )}
                    </div>

                    <div className={cn(
                        "p-6 rounded-3xl flex items-start gap-4 shadow-xl transition-all",
                        acceptedTerms ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-400"
                    )}>
                        <input 
                            type="checkbox" 
                            id="terms" 
                            checked={acceptedTerms}
                            onChange={(e) => setAcceptedTerms(e.target.checked)}
                            className="mt-1 h-5 w-5 rounded-md border-slate-200 bg-white text-brand-emerald focus:ring-brand-emerald" 
                        />
                        <label htmlFor="terms" className="text-[10px] font-bold uppercase tracking-widest leading-relaxed cursor-pointer select-none">
                            Certifico que analisei os itens de medição, prazos e valores e atesto que a empresa possui capacidade técnica para execução conforme acordado.
                        </label>
                    </div>

                    <Button 
                        onClick={handleCompanySign}
                        disabled={isSubmitting}
                        className={cn(
                            "w-full h-16 text-white font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl transition-all",
                            acceptedTerms ? "bg-brand-emerald hover:bg-emerald-600 shadow-emerald-500/20" : "bg-slate-300 shadow-none cursor-not-allowed opacity-50"
                        )}
                    >
                        {isSubmitting ? 'Finalizando...' : (settings.settings?.signature || settings.companySignature) ? 'Confirmar assinatura' : 'Confirmar e Assinar Agora'}
                    </Button>
                </div>
            </Modal>

        </div>
    );
};
