import { safeParseISO } from '../lib/dateUtils';
import { toISODateSafe } from '../lib/dateWriteUtils';
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc, updateDoc, arrayUnion, collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Order } from '../types';
import SignatureCanvas from 'react-signature-canvas';
import { ContractPrintTemplate } from '../features/orders/ContractPrintTemplate';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { 
    ShieldCheck, 
    FileCheck, 
    Lock, 
    CheckCircle2, 
    Clock, 
    Download, 
    Mail, 
    User, 
    ChevronRight, 
    MousePointer2,
    X,
    Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { triggerBonusAutomation } from '../lib/bonusService';
import { trackInfluencerClosure } from '../lib/influencerTracker';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface Signer {
    name: string;
    email: string;
    role: string;
    signed: boolean;
    current?: boolean;
}

export const DigitalSignature: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const [searchParams] = useSearchParams();

    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSigned, setIsSigned] = useState(false);
    const [scrolledToEnd, setScrolledToEnd] = useState(false);
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    
    // Form State
    const [name, setName] = useState('');
    const [signerDocument, setSignerDocument] = useState('');
    const [documentError, setDocumentError] = useState(false);
    const sigPad = useRef<SignatureCanvas>(null);
    const contractContainerRef = useRef<HTMLDivElement>(null);
    const contractRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        window.document.title = `Assinatura Digital | MarbleFlow - Gestão Inteligente marmoraria`;
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768 || ('ontouchstart' in window) || navigator.maxTouchPoints > 0);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const signatureContainerRef = useRef<HTMLDivElement>(null);
    const lastWidthRef = useRef<number>(0);

    // Track the signature container size to adjust the canvas dimensions
    useEffect(() => {
        if ((!showForm && !isMobile) || isSigned) return;

        const updateCanvasSize = () => {
            if (signatureContainerRef.current && sigPad.current) {
                const canvas = sigPad.current.getCanvas();
                if (canvas) {
                    const rect = signatureContainerRef.current.getBoundingClientRect();
                    if (rect.width > 0 && Math.abs(rect.width - lastWidthRef.current) > 2) {
                        lastWidthRef.current = rect.width;
                        
                        // Save signature if it exists
                        let savedData: string | null = null;
                        if (!sigPad.current.isEmpty()) {
                            savedData = sigPad.current.toDataURL();
                        }

                        const ratio = Math.max(window.devicePixelRatio || 1, 1);
                        canvas.width = rect.width * ratio;
                        canvas.height = (rect.height || 128) * ratio;

                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.setTransform(1, 0, 0, 1, 0, 0);
                            ctx.scale(ratio, ratio);
                            ctx.lineCap = 'round';
                            ctx.lineJoin = 'round';
                        }

                        // Restore signature
                        sigPad.current.clear();
                        if (savedData) {
                            if (ctx) {
                                const originalDrawImage = ctx.drawImage;
                                ctx.drawImage = function (img: any, ...args: any[]) {
                                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                                    originalDrawImage.call(ctx, img, 0, 0, canvas.width, canvas.height);
                                    ctx.scale(ratio, ratio);
                                    ctx.drawImage = originalDrawImage;
                                };
                            }
                            sigPad.current.fromDataURL(savedData);
                        }
                    }
                }
            }
        };

        // Run initially with a small delay to allow DOM/animation to settle
        const timeoutId = setTimeout(updateCanvasSize, 150);

        window.addEventListener('resize', updateCanvasSize);
        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('resize', updateCanvasSize);
        };
    }, [showForm, isSigned, isMobile]);

    // Prevent scroll and dismiss keyboard on canvas interaction
    useEffect(() => {
        if ((!showForm && !isMobile) || isSigned) return;

        let canvas: HTMLCanvasElement | null = null;
        let preventDefaultHandler: ((e: Event) => void) | null = null;

        const setupListeners = () => {
            canvas = sigPad.current?.getCanvas() || null;
            if (!canvas) return;

            preventDefaultHandler = (e: Event) => {
                // Dismiss keyboard
                if (document.activeElement && 'blur' in document.activeElement) {
                    (document.activeElement as HTMLElement).blur();
                }
                // Prevent scrolling/zooming of the page while drawing
                if (e.cancelable) {
                    e.preventDefault();
                }
            };

            // Apply styles to canvas directly to enforce touch-action & user-select
            canvas.style.touchAction = 'none';
            canvas.style.userSelect = 'none';
            canvas.style.webkitUserSelect = 'none';
            canvas.style.overscrollBehavior = 'contain';

            // Use non-passive event listeners to ensure preventDefault() is respected
            canvas.addEventListener('touchstart', preventDefaultHandler, { passive: false });
            canvas.addEventListener('touchmove', preventDefaultHandler, { passive: false });
            canvas.addEventListener('pointerdown', preventDefaultHandler, { passive: false });
            canvas.addEventListener('pointermove', preventDefaultHandler, { passive: false });
            canvas.addEventListener('mousedown', preventDefaultHandler);
        };

        // Try to setup immediately
        setupListeners();

        // Also setup with a small delay in case of render/transition delays
        const timeoutId = setTimeout(setupListeners, 150);

        return () => {
            clearTimeout(timeoutId);
            if (canvas && preventDefaultHandler) {
                canvas.removeEventListener('touchstart', preventDefaultHandler);
                canvas.removeEventListener('touchmove', preventDefaultHandler);
                canvas.removeEventListener('pointerdown', preventDefaultHandler);
                canvas.removeEventListener('pointermove', preventDefaultHandler);
                canvas.removeEventListener('mousedown', preventDefaultHandler);
            }
        };
    }, [showForm, isSigned, isMobile]);

    const handleCanvasBegin = () => {
        if (document.activeElement && 'blur' in document.activeElement) {
            (document.activeElement as HTMLElement).blur();
        }
    };

    const logSecurityEvent = async (eventType: string, gwData?: any) => {
        try {
            await addDoc(collection(db, 'security_logs'), {
                event_type: eventType,
                timestamp: toISODateSafe(new Date()),
                status: 'alert',
                route: window.location.pathname,
                userAgent: navigator.userAgent,
                tokenId: (token || searchParams.get('token') || '').slice(0, 8) + '...',
                companyId: gwData?.companyId || 'unknown'
            });
        } catch (e) {
            console.error('[SECURITY_LOG_ERROR]', e);
        }
    };

    useEffect(() => {
        const fetchOrder = async () => {
            const queryToken = searchParams.get('token');
            const effectiveToken = (queryToken || token || '').trim();

            if (!effectiveToken) {
                setError('Link de assinatura inválido.');
                setLoading(false);
                return;
            }

            try {
                const gatewayRef = doc(db, 'public_contract_links', effectiveToken);
                const gatewaySnap = await getDoc(gatewayRef);
                
                if (gatewaySnap.exists()) {
                    const gwData = gatewaySnap.data();
                    
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
                        signatureToken: gwData.signatureToken || effectiveToken,
                        contractStatus: gwData.signedAt ? 'signed' : (orderSnap.contractStatus || 'draft')
                    };

                    const isSignedContract = !!(gwData.signedAt || finalOrderData.signedAt || finalOrderData.contractStatus === 'signed');

                    if (!gwData.active) {
                        await logSecurityEvent('INACTIVE_LINK_ACCESS', gwData);
                        if (isSignedContract) {
                            setOrder(finalOrderData);
                            setIsSigned(true);
                            setLoading(false);
                            return;
                        } else {
                            setError('Este link de assinatura foi revogado ou desativado.');
                            setLoading(false);
                            return;
                        }
                    }

                    if (gwData.signedAt || finalOrderData.contractStatus === 'signed') {
                        setOrder(finalOrderData);
                        setIsSigned(true);
                        setLoading(false);
                        return;
                    }

                    const expiresAt = safeParseISO(gwData.expiresAt);
                    if (expiresAt && expiresAt < new Date()) {
                        await logSecurityEvent('EXPIRED_LINK_ACCESS', gwData);
                        setError('Este link de assinatura expirou.');
                        setLoading(false);
                        return;
                    }

                    setOrder(finalOrderData);
                    setName(finalOrderData.customerName || finalOrderData.clientSnapshot?.name || '');
                    setSignerDocument(finalOrderData.clientSnapshot?.document || finalOrderData.document || (finalOrderData as any).customerDocument || (finalOrderData as any).clientDocument || '');
                } else {
                    await logSecurityEvent('INVALID_TOKEN_ATTEMPT');
                    setError('O contrato solicitado não foi encontrado ou o link é inválido.');
                }
            } catch (err: any) {
                console.error('[GATEWAY_ERROR]', err);
                setError(err.code === 'permission-denied' ? 'Erro de segurança: Acesso bloqueado.' : 'Falha técnica ao carregar o contrato.');
            } finally {
                setLoading(false);
            }
        };

        fetchOrder();
    }, [token]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const isBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 25;
        if (isBottom && !scrolledToEnd) {
            setScrolledToEnd(true);
        }
    };

    const handleConfirm = async () => {
        if (!order) return;

        if (!signerDocument || signerDocument.trim() === '') {
            setDocumentError(true);
            alert('⚠️ Por favor, informe o CPF antes de assinar o contrato.');
            return;
        }

        const needsScroll = !isMobile;
        if (!name || sigPad.current?.isEmpty() || !agreedToTerms || (needsScroll && !scrolledToEnd)) {
            const msg = needsScroll 
                ? 'Por favor, preencha todos os campos, aceite os termos e role o contrato até o final.'
                : 'Por favor, desenhe sua assinatura e aceite os termos para confirmar.';
            alert(msg);
            return;
        }

        try {
            setLoading(true);
            const signatureImage = sigPad.current?.getTrimmedCanvas().toDataURL('image/png') || '';
            
            let ip = '0.0.0.0';
            try {
                const ipRes = await fetch('https://api.ipify.org?format=json');
                const ipData = await ipRes.json();
                ip = ipData.ip;
            } catch (e) { console.error('Error getting IP:', e); }

            const signatureData = {
                name,
                document: signerDocument,
                ip,
                timestamp: toISODateSafe(new Date()),
                image: signatureImage
            };

            const contractRef = doc(db, 'contratos', order.id);
            await updateDoc(contractRef, {
                contractStatus: 'signed',
                signedAt: signatureData.timestamp,
                signatureData,
                clientSignature: signatureImage,
                signatureToken: token,
                history: arrayUnion({
                    status: 'em_contrato',
                    timestamp: signatureData.timestamp,
                    action: 'CLIENT_SIGNED',
                    notes: `ASSINATURA CLIENTE: Contrato assinado via Gateway Seguro por ${name}. IP: ${ip}.`
                }) as any
            });

            const gatewayRef = doc(db, 'public_contract_links', token);
            await updateDoc(gatewayRef, {
                signedAt: signatureData.timestamp,
                signatureData,
                active: false
            });

            if (order.influencerId) {
                await triggerBonusAutomation({ ...order, id: order.id } as any, null, order.companyId);
                try {
                    await trackInfluencerClosure({
                        type: 'contract',
                        id: order.id,
                        companyId: order.companyId
                    });
                } catch (err) {
                    console.error("Error tracking influencer closure on digital signature:", err);
                }
            }

            setIsSigned(true);
            
            // Update local order state immediately to show signature on contract
            setOrder(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    contractStatus: 'signed',
                    signedAt: signatureData.timestamp,
                    signatureData,
                    clientSignature: signatureImage
                };
            });
            setShowForm(false);
        } catch (err) {
            console.error('Error saving signature:', err);
            alert('Erro ao confirmar assinatura. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    const getContractPdfElement = () => {
        if (contractRef.current) return contractRef.current;
        const fallback = document.getElementById('contract-print-root');
        return fallback;
    };

    const handleDownloadPDF = async () => {
        try {
            // OBJETIVO 4 — BLOQUEAR EXECUÇÃO PREMATURA
            if (!order || (!order.clientSnapshot && !order.customerName && !order.clientName)) {
                alert('Os dados do contrato ainda estão sendo processados. Aguarde a carga completa.');
                return;
            }

            const element = getContractPdfElement();
            if (!element) {
                alert('Contrato ainda não carregou completamente. Aguarde alguns segundos e tente novamente.');
                return;
            }

            setIsGeneratingPDF(true);

            // Aguardar renderização estabilizar
            await new Promise(resolve => setTimeout(resolve, 600));

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
            const fileName = `Contrato_Assinado_${customerName}.pdf`;
            
            pdf.save(fileName);
        } catch (error) {
            console.error('[PDF ERROR]', error);
            alert('Falha ao gerar PDF. Você ainda pode usar o botão de imprimir do navegador.');
        } finally {
            // Remover os espaçadores do DOM se existirem
            document.querySelectorAll('.pdf-page-spacer').forEach(s => s.remove());
            document.body.classList.remove('pdf-exporting');
            setIsGeneratingPDF(false);
        }
    };

    const handleDownloadPDFAndMarkRead = async () => {
        setScrolledToEnd(true);
        await handleDownloadPDF();
    };

    const signers: Signer[] = order ? [
        { 
            name: order.clientSnapshot?.name || order.customerName || 'Cliente', 
            email: order.clientSnapshot?.email || (order as any).phone || 'E-mail não informado', 
            role: 'Contratante', 
            signed: isSigned,
            current: true
        },
        { 
            name: order.contractSnapshot?.companyName || order.contractSignatureCompany || 'Empresa Responsável', 
            email: order.contractSnapshot?.companyEmail || order.contractSnapshot?.companyPhone || 'assinatura@empresa.com.br', 
            role: 'Contratada', 
            signed: !!order.companySignedAt || order.contractStatus === 'company_signed' || order.contractStatus === 'signed'
        }
    ] : [];

    if (loading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center p-6 text-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 border-4 border-slate-900 border-t-brand-emerald rounded-full animate-spin"></div>
                    <p className="font-black text-slate-900 uppercase tracking-widest text-xs mt-4">Autenticando Certificado...</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Aguarde a conexão segura</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="bg-white p-12 rounded-[3.5rem] border border-red-100 shadow-2xl shadow-red-500/5 max-w-md text-center">
                    <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto mb-8">
                        <Lock className="w-10 h-10 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 mb-4">{error}</h2>
                    <p className="text-slate-500 text-sm mb-8">Por razões de segurança, este link é único e temporário.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] h-[100dvh] bg-[#F8FAFC] flex flex-col-reverse md:flex-row overflow-hidden">
            {/* Print Specific CSS */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    #contract-print-area,
                    #contract-print-area * {
                        visibility: visible;
                    }
                    #contract-print-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 210mm;
                        padding: 0;
                        background: white;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
                body.pdf-exporting main {
                    display: flex !important;
                }
            `}} />

            {/* Sidebar - Left */}
            <aside className="no-print w-full md:w-[400px] bg-white border-t md:border-t-0 md:border-r border-slate-200 flex flex-col h-[100dvh] md:h-full shrink-0 z-50 shadow-2xl">
                {/* Sidebar Header */}
                <div className="p-4 md:p-8 border-b border-slate-100">
                    <div className="flex items-center gap-4 mb-4 md:mb-6">
                        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-premium">
                            <ShieldCheck className="w-6 h-6 text-brand-emerald" />
                        </div>
                        <div className="flex-1">
                            <h1 className="text-sm font-black uppercase tracking-tighter text-slate-900 leading-none">CONTRATO DIGITAL</h1>
                            <div className="flex items-center gap-2 mt-1.5">
                                <span className={cn(
                                    "text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest",
                                    isSigned ? "bg-emerald-500 text-white animate-pulse" : "bg-amber-500 text-white"
                                )}>
                                    {isSigned ? 'ASSINADO' : 'PENDENTE'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1 mb-4 md:mb-6">
                        {isMobile ? (
                            <>
                                <h1 className="text-lg font-black uppercase tracking-tighter text-slate-900">CONTRATO DIGITAL</h1>
                                <p className="text-sm font-bold text-slate-600">
                                    Cliente: {order?.customerName || order?.clientSnapshot?.name || 'Cliente'}
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Documento</p>
                                <h2 className="text-base font-black text-slate-900 uppercase tracking-tighter truncate">
                                    {order?.customerName ? `CONTRATO - ${order.customerName}` : 'DOCUMENTO SEM NOME'}
                                </h2>
                                <p className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">
                                    {order?.id ? `ID: ${order.id.slice(0, 12)}...` : 'ID: N/A'}
                                </p>
                            </>
                        )}
                    </div>

                    {(!isMobile || !isSigned) && (
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleDownloadPDFAndMarkRead}
                            disabled={!order || isGeneratingPDF}
                            className="w-full h-10 md:h-11 border-slate-200 text-slate-600 font-black uppercase text-[10px] tracking-widest rounded-xl hover:bg-slate-50 gap-2"
                        >
                            {isGeneratingPDF ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Download className="w-4 h-4" />
                            )}
                            {isGeneratingPDF ? "Gerando PDF..." : (isSigned ? "Baixar contrato assinado" : "Baixar contrato para leitura")}
                        </Button>
                    )}
                </div>

                {/* Sidebar Content - Signers or Form */}
                <div className="flex-1 overflow-y-auto no-scrollbar p-4 md:p-8 space-y-4 md:space-y-8">
                    {!isSigned && !showForm && !isMobile && (
                        <div className="space-y-6">
                            <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-[2rem] space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-brand-emerald flex items-center justify-center text-white">
                                        <MousePointer2 className="w-4 h-4" />
                                    </div>
                                    <p className="text-xs font-black text-brand-emerald uppercase">Sua vez de assinar</p>
                                </div>
                                <p className="text-xs font-medium text-emerald-800 leading-relaxed">
                                    Para formalizar este documento, clique no botão abaixo e preencha seus dados.
                                </p>
                                <Button 
                                    onClick={() => setShowForm(true)}
                                    className="w-full h-14 bg-brand-emerald hover:bg-emerald-600 text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-xl shadow-emerald-500/20 gap-2"
                                >
                                    Assinar como parte <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}

                    {(isSigned || showForm || isMobile) && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Assinatura do Cliente</h3>
                                {!isSigned && !isMobile && (
                                    <button onClick={() => setShowForm(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-colors">
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {isSigned ? (
                                <div className="p-8 bg-emerald-50 border-2 border-emerald-100 rounded-[2.5rem] text-center space-y-6">
                                    <div className="w-16 h-16 bg-brand-emerald rounded-3xl flex items-center justify-center mx-auto shadow-premium">
                                        <CheckCircle2 className="w-8 h-8 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-900 uppercase">✅ CONTRATO ASSINADO COM SUCESSO</p>
                                        {order?.signatureData?.timestamp && (
                                            <div className="mt-3 text-xs font-bold text-slate-600 uppercase tracking-wider space-y-1">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Assinado em:</p>
                                                <p className="font-mono text-sm text-slate-855 font-bold">
                                                    {(() => {
                                                        try {
                                                            const ts = order.signatureData.timestamp;
                                                            let d = typeof ts.toDate === 'function' ? ts.toDate() : safeParseISO(ts);
                                                            return d ? format(d, "dd/MM/yyyy", { locale: ptBR }) : '';
                                                        } catch { return ''; }
                                                    })()}
                                                </p>
                                                <p className="font-mono text-sm text-slate-855 font-bold">
                                                    {(() => {
                                                        try {
                                                            const ts = order.signatureData.timestamp;
                                                            let d = typeof ts.toDate === 'function' ? ts.toDate() : safeParseISO(ts);
                                                            return d ? format(d, "HH:mm", { locale: ptBR }) : '';
                                                        } catch { return ''; }
                                                    })()}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    <Button 
                                        onClick={handleDownloadPDF}
                                        disabled={!order || isGeneratingPDF}
                                        className="w-full h-14 bg-brand-emerald hover:bg-emerald-600 text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-xl shadow-emerald-500/20 gap-2 mt-4"
                                    >
                                        {isGeneratingPDF ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Download className="w-4 h-4" />
                                        )}
                                        {isGeneratingPDF ? 'Gerando PDF...' : 'BAIXAR CONTRATO ASSINADO'}
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {(!isMobile || !name || !signerDocument) && (
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Nome Completo</label>
                                                <Input autoFocus={false} value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">CPF / CNPJ</label>
                                                <Input autoFocus={false} value={signerDocument} onChange={e => { setSignerDocument(e.target.value); setDocumentError(false); }} placeholder="000.000.000-00" className={cn("h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold", documentError && "border-red-500")} />
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <div className="flex justify-between items-end mb-2 ml-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Assinatura</label>
                                            <button onClick={() => sigPad.current?.clear()} className="text-[10px] font-black text-brand-emerald uppercase">Limpar</button>
                                        </div>
                                        <div ref={signatureContainerRef} className="border border-slate-200 rounded-2xl bg-slate-50 overflow-hidden h-48 md:h-32 relative group">
                                            <SignatureCanvas
                                                ref={sigPad}
                                                penColor="#0F172A"
                                                minWidth={1.5}
                                                maxWidth={3.0}
                                                onBegin={handleCanvasBegin}
                                                canvasProps={{
                                                    className: "signature-canvas w-full h-full cursor-crosshair",
                                                    style: {
                                                        touchAction: 'none',
                                                        userSelect: 'none',
                                                        WebkitUserSelect: 'none',
                                                        overscrollBehavior: 'contain'
                                                    }
                                                }}
                                            />
                                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10 group-active:opacity-0 transition-opacity">
                                                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-900 border-2 border-slate-900 px-3 py-1 transform -rotate-3">Assine Aqui</p>
                                            </div>
                                        </div>
                                    </div>

                                    <label className={cn("flex items-start gap-3 p-4 rounded-2xl transition-all cursor-pointer border", agreedToTerms ? "bg-emerald-50 border-emerald-100" : "bg-slate-50 border-slate-100")}>
                                        <input type="checkbox" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-emerald" />
                                        <div className="flex-1">
                                            <p className="text-[10px] font-black text-slate-900 uppercase leading-tight">Li e estou de acordo com o contrato.</p>
                                            <p className="text-[8px] text-slate-500 mt-0.5 font-bold uppercase tracking-tighter">Assinatura digital com validade jurídica.</p>
                                        </div>
                                    </label>

                                    {!isMobile && !scrolledToEnd && (
                                        <p className="text-[9px] font-black text-amber-600 uppercase text-center bg-amber-50 py-2 rounded-lg animate-pulse">
                                            ⚠️ Baixe o contrato para leitura para liberar a assinatura
                                        </p>
                                    )}

                                    <Button 
                                        onClick={handleConfirm}
                                        disabled={loading || (!isMobile && !scrolledToEnd) || !agreedToTerms || !signerDocument || signerDocument.trim() === ''}
                                        className="w-full h-14 bg-slate-900 hover:bg-black text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl shadow-xl disabled:opacity-50"
                                    >
                                        {loading ? 'Processando...' : 'Confirmar Assinatura'}
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                    {!isMobile && (
                        <>
                            {/* Signers List */}
                            <div className="space-y-6 pt-6 border-t border-slate-100">
                                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Signatários</h3>
                                <div className="space-y-4">
                                    {signers.map((signer, idx) => (
                                        <div key={idx} className={cn(
                                            "p-4 rounded-[1.5rem] border transition-all duration-300",
                                            signer.current ? "bg-slate-50 border-slate-200" : "bg-white border-slate-100"
                                        )}>
                                            <div className="flex items-center gap-4">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                                                    signer.signed ? "bg-emerald-100 text-brand-emerald" : "bg-slate-100 text-slate-400"
                                                )}>
                                                    {signer.signed ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-[11px] font-black text-slate-900 uppercase truncate leading-none">
                                                            {signer.name}
                                                        </p>
                                                        {signer.signed ? (
                                                            <span className="shrink-0 text-[8px] font-black bg-emerald-500 text-white px-2 py-0.5 rounded-full uppercase tracking-widest">
                                                                ASSINADO
                                                            </span>
                                                        ) : (
                                                            <span className="shrink-0 text-[8px] font-black bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-widest">
                                                                PENDENTE
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <Mail className="w-3 h-3 text-slate-300" />
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase truncate">
                                                            {signer.email}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <User className="w-3 h-3 text-slate-300" />
                                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                                                            {signer.role}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Security Disclaimer */}
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3">
                                <Lock className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                                <p className="text-[8px] font-bold text-slate-400 uppercase leading-relaxed tracking-widest">
                                    Segurança criptografada ponta a ponta. Validade jurídica conforme MP 2.200-2/2001.
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </aside>

            {/* Main Content - Contract Viewer */}
            <main className="hidden md:flex flex-1 bg-[#F1F5F9] overflow-hidden flex-col relative">

                <div 
                    ref={contractContainerRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 no-scrollbar print:p-0 print:overflow-visible"
                >
                    <div id="contract-print-area" className="max-w-4xl mx-auto bg-white shadow-2xl rounded-sm min-h-full print:shadow-none">
                        <div className="p-6 md:p-12 lg:p-20 print:p-0">
                            {order ? <ContractPrintTemplate ref={contractRef} order={order} /> : <div>Carregando conteúdo do contrato...</div>}
                        </div>
                    </div>
                </div>

                {!scrolledToEnd && (
                    <div className="no-print absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 shadow-2xl backdrop-blur-md animate-bounce z-10 border border-white/10">
                        <ChevronRight className="w-3 h-3 rotate-90" /> Rolar para ler tudo
                    </div>
                )}
            </main>
        </div>
    );
};
