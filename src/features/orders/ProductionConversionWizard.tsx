import { safeArray, normalizeClauses } from '../../lib/dataDiagnostics';
import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { db } from '../../lib/firebase';
import { collection, addDoc, updateDoc, doc, getDoc, deleteField } from 'firebase/firestore';
import type { Quote, Measurement } from '../../types';
import { toISODateSafe } from '../../lib/dateWriteUtils';
import { CheckCircle2, X, Info, Layers, Package, ShieldCheck, FileText, ChevronRight, Plus, AlertCircle } from 'lucide-react';
import { createOrderLog } from '../../lib/orderLogs';
import { cn } from '../../lib/utils';
import { validatePaymentConditions } from '../../utils/quoteCalculations';
import { PaymentConditionsForm } from '../../components/financial/PaymentConditionsForm';
import type { PaymentConditions } from '../../types';
import { CreditCard } from 'lucide-react';
import { useCompanyData } from '../../hooks/useCompanyData';
import { Input } from '../../components/ui/Input';
import { removeUndefinedDeep } from '../contracts/ContractsView';
import { ContractPrintTemplate } from './ContractPrintTemplate';
import { trackInfluencerClosure } from '../../lib/influencerTracker';


interface ProductionConversionWizardProps {
    measurement?: Measurement;
    quoteRef: Quote | null;
    onClose: () => void;
    onSuccess: (orderId: string) => void;
    onOpenQuoteEditor?: (quote: Quote, clientId?: string) => void;
}

export const ProductionConversionWizard: React.FC<ProductionConversionWizardProps> = ({ 
    measurement, 
    quoteRef, 
    onClose, 
    onSuccess
}) => {
    const { user, profile } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [step, setStep] = useState<'summary' | 'payment' | 'clauses' | 'signature' | 'finalization'>('summary');
    const [paymentDraft, setPaymentDraft] = useState<PaymentConditions | null>(quoteRef?.paymentConditions || { installments: [{ label: 'Entrada', percentage: 50, amount: null, dueType: 'imediato' }, { label: 'Finalização', percentage: 50, amount: null, dueType: 'entrega' }] });
    const { companyData } = useCompanyData();
    const [customClauses, setCustomClauses] = useState<any[]>([]);
    const [companySignature, setCompanySignature] = useState<string>('');
    const [showPreview, setShowPreview] = useState(false);
    const [clientData, setClientData] = useState<any>(null);

    // Initialize clauses and signature when company data is available
    React.useEffect(() => {
        if (companyData && customClauses.length === 0) {
            const quoteClauses = (quoteRef as any)?.customClauses;
            const hasQuoteClauses = Array.isArray(quoteClauses) && quoteClauses.length > 0;
            const rawClauses = hasQuoteClauses ? quoteClauses : companyData?.contractTemplate || [];
            setCustomClauses(normalizeClauses(rawClauses));
        }
        if (companyData && !companySignature) {
            setCompanySignature(companyData?.settings?.signature || companyData?.companySignature || '');
        }
    }, [companyData]);

    // Fetch client data for snapshot
    React.useEffect(() => {
        const fetchClient = async () => {
            const clientId = quoteRef?.clientId || measurement?.clientId;
            if (!clientId) return;
            try {
                const clientSnap = await getDoc(doc(db, 'clients', clientId));
                if (clientSnap.exists()) {
                    setClientData(clientSnap.data());
                }
            } catch (e) {
                console.error('[CLIENT_FETCH_ERROR]', e);
            }
        };
        fetchClient();
    }, [quoteRef, measurement]);
    
    const calculationData = useMemo(() => {
        if (!quoteRef) {
            return {
                stones: 0,
                accessories: 0,
                otherServices: 0,
                freight: 0,
                discount: 0,
                linearInstallation: 0,
                manualInstallation: 0,
                totalInstallation: 0,
                commercialTotal: 0,
                operationalTotal: 0,
                totalAmount: 0,
                groups: []
            };
        }
        // PRIORITY: Use immutable snapshot if available (Rule #30)
        if (quoteRef.isFrozen && quoteRef.quoteSnapshot) {
            const snap = quoteRef.quoteSnapshot;
            return {
                stones: snap.stonesSubtotal || 0,
                accessories: snap.accessoriesSubtotal || 0,
                otherServices: snap.servicesSubtotal || 0,
                freight: snap.freight || 0,
                discount: snap.discount || 0,
                linearInstallation: snap.operationalCost || 0, 
                manualInstallation: 0,
                totalInstallation: snap.operationalCost || 0,
                commercialTotal: snap.commercialTotal || 0,
                operationalTotal: snap.operationalCost || 0,
                totalAmount: snap.totalAmount || 0,
                groups: snap.groups
            };
        }

        const stones = (quoteRef.groups || []).reduce((acc, g) => acc + (g.groupTotal || 0), 0);
        const accessories = (quoteRef.accessories || []).reduce((acc, a) => acc + (a.total || 0), 0);
        
        // Freight is usually a service of type 'frete' or a description containing 'frete'
        const freight = (quoteRef.services || []).filter(s => 
            s.type === 'frete' || s.description?.toLowerCase().includes('frete')
        ).reduce((acc, s) => acc + (s.price || 0), 0);

        // Other services excluding freight
        const otherServices = (quoteRef.services || []).filter(s => 
            s.type !== 'frete' && !s.description?.toLowerCase().includes('frete')
        ).reduce((acc, s) => acc + (s.price || 0), 0);
        
        const discount = quoteRef.discount || 0;
        
        // Granular installation tracking from the quote
        const linearInstallation = quoteRef.linearInstallationTotal || 0;
        const manualInstallation = quoteRef.manualInstallationTotal || 0;
        const totalInstallation = linearInstallation + manualInstallation;
        
        // Final commercial total (Revenue: Stones(embodied) + Accessories + Services - Discount)
        const commercialTotal = quoteRef.commercialTotal ?? (stones + accessories + otherServices - discount);
        
        // Operational totals (Technical Investment: Linear + Manual Installation)
        const operationalTotal = quoteRef.operationalCost ?? totalInstallation;
        
        // Final total (matches the quote's printed value)
        const totalAmount = quoteRef.totalAmount ?? (commercialTotal + freight);
        
        return {
            stones,
            accessories,
            otherServices,
            freight,
            discount,
            linearInstallation,
            manualInstallation,
            totalInstallation,
            commercialTotal,
            operationalTotal,
            totalAmount,
            groups: quoteRef.groups
        };
    }, [quoteRef]);

    // Fallback if quoteRef is somehow null (though unlikely given Dashboard logic)
    if (!quoteRef) {
        return (
            <div className="p-12 text-center">
                <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Aguardando dados comerciais...</p>
            </div>
        );
    }

    const generatePreviewOrder = (): any => {
        const stoneBaseTotal = (calculationData.groups || []).reduce((acc, g) => acc + safeArray(g.pieces).reduce((pAcc, p) => pAcc + p.total, 0), 0) || 1;
        
        const orderItems = (calculationData.groups || []).flatMap(g => 
            safeArray(g.pieces).map(p => {
                const proportion = p.total / stoneBaseTotal;
                const itemAddedValue = calculationData.operationalTotal * proportion;
                const itemTotalPrice = Number((p.total + itemAddedValue).toFixed(2));
                
                const extras = [];
                if (g.edgeFinishing) extras.push(`Acabamento: ${g.edgeFinishing}`);
                if (g.furosECortes?.cuba) extras.push('Recorte Cuba');
                if (g.furosECortes?.furoTorneira) extras.push('Furo Torneira');
                if (g.furosECortes?.corteCooktop) extras.push('Corte Cooktop');

                return {
                    id: crypto.randomUUID(),
                    name: `${p.label} - ${g.environmentName}`,
                    width: p.width,
                    length: p.height,
                    quantity: p.quantity,
                    pieceType: p.type,
                    material: g.materialName,
                    environment: g.environmentName,
                    finishings: extras.join(' | '),
                    totalPrice: itemTotalPrice,
                };
            })
        );

        const formatAddress = (c: any) => {
            if (!c) return '';
            if (typeof c === 'string') return c;
            const parts = [];
            let streetPart = c.street || c.address || '';
            if (streetPart && c.number && !['null', 'undefined', '-', ''].includes(String(c.number).trim().toLowerCase())) {
                streetPart += `, ${c.number}`;
            }
            if (c.complement) streetPart += ` - ${c.complement}`;
            if (streetPart) parts.push(streetPart);
            if (c.neighborhood) parts.push(`Bairro ${c.neighborhood}`);
            if (c.city) parts.push(`${c.city}${c.state ? ` - ${c.state}` : ''}`);
            if (c.zipCode || c.cep) parts.push(`CEP: ${c.zipCode || c.cep}`);
            return parts.join(', ');
        };

        const entryAmount = paymentDraft?.installments?.[0]?.amount || 0;
        const remainingAmount = (calculationData.totalAmount || 0) - entryAmount;

        return {
            customerName: quoteRef?.customerName || measurement?.customerName || clientData?.name || 'NOME DO CLIENTE',
            document: (quoteRef as any)?.document || measurement?.document || clientData?.document || clientData?.cpf || clientData?.cpfCnpj || '000.000.000-00',
            address: formatAddress(clientData) || quoteRef?.customerAddress || measurement?.address || 'ENDEREÇO COMPLETO',
            phone: quoteRef?.customerPhone || measurement?.phone || clientData?.phone || '(00) 00000-0000',
            email: clientData?.email || '',
            protocolNumber: quoteRef?.id?.slice(0, 8) || '000000',
            createdAt: new Date().toISOString(),
            totalAmount: calculationData.totalAmount || 0,
            downPayment: entryAmount,
            balance: remainingAmount,
            remainingAmount: remainingAmount,
            paymentConditions: paymentDraft,
            paymentMethod: paymentDraft?.method || 'A combinar',
            items: orderItems,
            accessories: quoteRef?.quoteSnapshot?.accessories || quoteRef?.accessories || [],
            services: quoteRef?.quoteSnapshot?.services || quoteRef?.services || [],
            clientSnapshot: clientData ? {
                id: quoteRef.clientId || measurement?.clientId || '',
                name: clientData.name || '',
                document: clientData.document || clientData.cpf || clientData.cpfCnpj || '',
                cpf: clientData.cpf || clientData.document || '',
                cpfCnpj: clientData.cpfCnpj || clientData.document || clientData.cpf || '',
                phone: clientData.phone || '',
                email: clientData.email || '',
                address: formatAddress(clientData),
                zipCode: clientData.zipCode || '',
                street: clientData.street || '',
                number: clientData.number || '',
                complement: clientData.complement || '',
                neighborhood: clientData.neighborhood || '',
                city: clientData.city || '',
                state: clientData.state || '',
                source: clientData.source || '',
                profile: clientData.profile || null
            } : null,
            contractSnapshot: {
                companyName: companyData?.name || (companyData as any)?.companyName || '',
                companyCnpj: companyData?.cnpj || '',
                companyAddress: ((): string => {
                    const p = companyData;
                    if (!p) return '';
                    const parts = [];
                    let streetPart = p.street || p.address || '';
                    if (streetPart && p.number) streetPart += `, Nº ${p.number}`;
                    if (streetPart) parts.push(streetPart);
                    let neighborCity = '';
                    if (p.neighborhood) neighborCity += `Bairro ${p.neighborhood}`;
                    if (p.city) neighborCity += (neighborCity ? `, ${p.city}` : p.city);
                    if (neighborCity) parts.push(neighborCity);
                    let stateZip = '';
                    if (p.state) stateZip += p.state;
                    const zip = p.zipCode || p.cep || '';
                    if (zip) stateZip += (stateZip ? `, ${zip}` : zip);
                    if (stateZip) parts.push(stateZip);
                    return parts.join(' - ');
                })(),
                companyPhone: companyData?.whatsapp1 || companyData?.telefoneFixo || '',
                companyLogo: companyData?.logoUrl || '',
                companySignature: companyData?.companySignature || (companyData?.settings as any)?.signature || '',
                contractTemplate: customClauses,
                environments: quoteRef.groups || []
            },
            customClauses: customClauses,
            companySignatureData: { ip: 'Visualização', timestamp: new Date().toLocaleString() },
            companySignature: companySignature,
        };
    };

    const handleFinalSubmit = async () => {
        if (step !== 'finalization' || !user || !profile?.companyId || isSubmitting) return;

        setIsSubmitting(true);

        try {
            // Prepare Order Items
            const stoneBaseTotal = (calculationData.groups || []).reduce((acc, g) => acc + safeArray(g.pieces).reduce((pAcc, p) => pAcc + p.total, 0), 0) || 1;
            
            const orderItems = (calculationData.groups || []).flatMap(g => 
                safeArray(g.pieces).map(p => {
                    const proportion = p.total / stoneBaseTotal;
                    const itemAddedValue = calculationData.operationalTotal * proportion;
                    const itemTotalPrice = Number((p.total + itemAddedValue).toFixed(2));
                    
                    const extras = [];
                    if (g.edgeFinishing) extras.push(`Acabamento: ${g.edgeFinishing}`);
                    if (g.furosECortes?.cuba) extras.push('Recorte Cuba');
                    if (g.furosECortes?.furoTorneira) extras.push('Furo Torneira');
                    if (g.furosECortes?.corteCooktop) extras.push('Corte Cooktop');
                    if (g.itensFornecidosCliente?.cuba) extras.push('Cuba fornecida pelo cliente');
                    if (g.itensFornecidosCliente?.cubaGourmet) extras.push('Cuba Gourmet fornecida pelo cliente');
                    if (g.itensFornecidosCliente?.tanque) extras.push('Tanque fornecido pelo cliente');
                    if (g.itensFornecidosCliente?.cubaLavatorio) extras.push('Cuba Lavatório fornecida pelo cliente');
                    if (g.itensFornecidosCliente?.lixeira) extras.push('Lixeira fornecida pelo cliente');

                    return {
                        id: crypto.randomUUID(),
                        name: `${p.label} - ${g.environmentName}`,
                        completed: false,
                        width: p.width,
                        length: p.height,
                        area: p.sqm,
                        quantity: p.quantity,
                        pieceType: p.type,
                        material: g.materialName,
                        environment: g.environmentName,
                        finishings: extras.join(' | '),
                        unitPrice: (p.sqm * p.quantity) > 0 ? (itemTotalPrice / (p.sqm * p.quantity)) : 0,
                        totalPrice: itemTotalPrice,
                        unit: 'm²'
                    };
                })
            );

            const isoNow = toISODateSafe(new Date())!;
            
            const contractPayload: any = removeUndefinedDeep({
                clientId: quoteRef.clientId || measurement?.clientId || '',
                quoteId: quoteRef.id,
                measurementId: measurement?.id || quoteRef.measurementId || '',
                customerName: String(quoteRef.customerName ?? ''),
                document: String((quoteRef as any)?.document ?? measurement?.document ?? clientData?.document ?? clientData?.cpf ?? clientData?.cpfCnpj ?? ''),
                phone: String(quoteRef.customerPhone ?? measurement?.phone ?? ''),
                address: String(quoteRef.customerAddress ?? measurement?.address ?? ''),
                material: (calculationData.groups || []).map(g => String(g.materialName ?? '')).filter((v, i, a) => Array.isArray(a) && a.indexOf(v) === i).join(', ') || 'Produtos Diversos',
                status: 'em_contrato',
                priority: 'medium',
                items: orderItems,
                
                commercialTotal: calculationData.commercialTotal || 0,
                operationalCost: calculationData.operationalTotal || 0,
                freight: calculationData.freight || 0,
                totalAmount: calculationData.totalAmount || 0,
                downPayment: paymentDraft?.installments?.[0]?.amount || 0,
                balance: (calculationData.totalAmount || 0) - (paymentDraft?.installments?.[0]?.amount || 0),
                subtotal: (calculationData.stones || 0) + (calculationData.accessories || 0) + (calculationData.otherServices || 0),
                discount: calculationData.discount || 0,

                accessories: quoteRef.quoteSnapshot?.accessories || quoteRef.accessories || [],
                services: quoteRef.quoteSnapshot?.services || quoteRef.services || [],
                observations: quoteRef.quoteSnapshot?.observations || quoteRef.observations || '',
                splashback: quoteRef.quoteSnapshot?.splashback || quoteRef.splashback || '',
                skirt: quoteRef.quoteSnapshot?.skirt || quoteRef.skirt || '',
                paymentTerms: quoteRef.quoteSnapshot?.paymentTerms || quoteRef.paymentTerms || '',
                paymentConditions: paymentDraft || null,
                deliveryTime: quoteRef.quoteSnapshot?.deliveryTime || quoteRef.deliveryTime || '',
                
                customClauses: customClauses || [],
                contractSignatureCompany: companySignature || '',
                contractSnapshot: {
                    companyName: companyData?.name || '',
                    companyCnpj: companyData?.cnpj || '',
                    companyPhone: companyData?.whatsapp1 || companyData?.telefoneFixo || '',
                    companyLogo: companyData?.logoUrl || '',
                    companyAddress: ((): string => {
                        const p = companyData;
                        if (!p) return '';
                        const parts = [];
                        let streetPart = p.street || p.address || '';
                        if (streetPart && p.number) streetPart += `, Nº ${p.number}`;
                        if (streetPart) parts.push(streetPart);
                        let neighborCity = '';
                        if (p.neighborhood) neighborCity += `Bairro ${p.neighborhood}`;
                        if (p.city) neighborCity += (neighborCity ? `, ${p.city}` : p.city);
                        if (neighborCity) parts.push(neighborCity);
                        let stateZip = '';
                        if (p.state) stateZip += p.state;
                        const zip = p.zipCode || p.cep || '';
                        if (zip) stateZip += (stateZip ? `, ${zip}` : zip);
                        if (stateZip) parts.push(stateZip);
                        return parts.join(' - ');
                    })(),
                    companySignature: companyData?.companySignature || (companyData?.settings as any)?.signature || '',
                    contractTemplate: customClauses,
                    customerDocument: String((quoteRef as any)?.document ?? measurement?.document ?? clientData?.document ?? clientData?.cpf ?? clientData?.cpfCnpj ?? '')
                },
                clientSnapshot: clientData ? removeUndefinedDeep({
                    id: quoteRef.clientId || measurement?.clientId || '',
                    name: clientData.name || '',
                    document: clientData.document || clientData.cpf || clientData.cpfCnpj || '',
                    phone: clientData.phone || '',
                    email: clientData.email || '',
                    street: clientData.street || '',
                    number: clientData.number || '',
                    complement: clientData.complement || '',
                    neighborhood: clientData.neighborhood || '',
                    city: clientData.city || '',
                    state: clientData.state || '',
                    zipCode: clientData.zipCode || clientData.cep || '',
                    address: ((): string => {
                        const c = clientData;
                        const p = [];
                        let s = c.street || c.address || '';
                        if (s && c.number && !['null', 'undefined', '-', ''].includes(String(c.number).trim().toLowerCase())) {
                             s += `, ${c.number}`;
                        }
                        if (c.complement) s += ` - ${c.complement}`;
                        if (s) p.push(s);
                        if (c.neighborhood) p.push(`Bairro ${c.neighborhood}`);
                        if (c.city) p.push(`${c.city}${c.state ? ` - ${c.state}` : ''}`);
                        if (c.zipCode || c.cep) p.push(`CEP: ${c.zipCode || c.cep}`);
                        return p.join(', ');
                    })(),
                    cpf: clientData.cpf || clientData.document || '',
                    cpfCnpj: clientData.cpfCnpj || clientData.document || clientData.cpf || '',
                    source: clientData.source || '',
                    profile: clientData.profile || null
                }) : null,
                contractStatus: 'sent',
                
                userId: user.uid,
                companyId: profile.companyId,
                createdAt: isoNow,
                updatedAt: isoNow,
                deadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
                position: 0, 
                history: [{
                    status: 'em_contrato',
                    timestamp: isoNow,
                    userId: user.uid,
                    notes: 'Workflow Guiado: Contrato formulado e enviado para assinatura do cliente.'
                }],
                signatureToken: crypto.randomUUID(),
                signatureExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                isPostMeasurement: !!quoteRef.isPostMeasurement,

                influencerId: quoteRef.influencerId || '',
                influencerName: quoteRef.influencerName || '',
                referralCode: (quoteRef as any).referralCode || '',
                origin: (quoteRef as any).origin || '',
            });

            if (!import.meta.env.PROD) {
                console.log('[AUDIT_PRODUCTION] ProductionConversionWizard: Payload de Contrato:', contractPayload);
            }

            // Save to Firestore
            const docRef = await addDoc(collection(db, 'contratos'), contractPayload);

            if (contractPayload.influencerId) {
                try {
                    await trackInfluencerClosure({
                        type: 'contract',
                        id: docRef.id,
                        companyId: profile.companyId
                    });
                } catch (err) {
                    console.error("Error tracking influencer closure on contract conversion:", err);
                }
            }

            // Update Client Referral Status: contrato
            if (contractPayload.clientId) {
                await updateDoc(doc(db, 'clients', contractPayload.clientId), { 
                    referralStatus: 'contrato' 
                });
            }

            // Audit Log
            await createOrderLog({
                orderId: docRef.id,
                companyId: profile.companyId,
                userId: user.uid,
                userName: profile.name || '',
                action: 'create',
                reason: `Contrato Comercial gerado via Workflow Guiado (5 etapas)`
            });

            // Update Quote & Measurement Status
            await updateDoc(doc(db, 'orcamentos', quoteRef.id), {
                status: 'converted',
                quoteStage: 'em_contrato',
                convertedToContractId: docRef.id,
                paymentConditions: paymentDraft,
                contractGenerationAvailable: deleteField(),
                convertedAt: toISODateSafe(new Date())!,
                updatedAt: toISODateSafe(new Date())!
            });

            if (measurement?.id) {
                await updateDoc(doc(db, 'medicoes', measurement.id), {
                    status: 'converted'
                });
            }

            onSuccess(docRef.id);
        } catch (error) {
            console.error("[CONVERSION ERROR]", error);
            alert("Erro crítico ao gerar Contrato. Verifique sua conexão.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const nextStep = () => {
        if (step === 'summary') setStep('payment');
        else if (step === 'payment') {
            const val = validatePaymentConditions(paymentDraft, calculationData.totalAmount);
            if (!val.isValid) {
                alert(val.reason);
                return;
            }
            setStep('clauses');
        }
        else if (step === 'clauses') setStep('signature');
        else if (step === 'signature') setStep('finalization');
    };

    const prevStep = () => {
        if (step === 'payment') setStep('summary');
        else if (step === 'clauses') setStep('payment');
        else if (step === 'signature') setStep('clauses');
        else if (step === 'finalization') setStep('signature');
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-950 absolute inset-0 rounded-2xl overflow-hidden">
            {/* Header with Progress Steps */}
            <div className="bg-slate-50 dark:bg-slate-900 p-6 border-b border-slate-200 dark:border-white/5 shrink-0">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2 leading-none">
                            <ShieldCheck className="h-5 w-5 text-brand-emerald" />
                            Geração de Contrato
                        </h2>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">
                            Fluxo Guiado de Formalização Comercial
                        </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-slate-200 dark:hover:bg-white/5">
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                <div className="flex items-center justify-between max-w-2xl mx-auto px-4 relative">
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 dark:bg-white/5 -translate-y-1/2 z-0" />
                    {[
                        { id: 'summary', label: 'Resumo' },
                        { id: 'payment', label: 'Pagamento' },
                        { id: 'clauses', label: 'Cláusulas' },
                        { id: 'signature', label: 'Assinatura' },
                        { id: 'finalization', label: 'Finalização' }
                    ].map((s, idx) => {
                        const isActive = step === s.id;
                        const isPast = ['summary', 'payment', 'clauses', 'signature', 'finalization'].indexOf(step) > idx;
                        
                        return (
                            <div key={s.id} className="relative z-10 flex flex-col items-center gap-2">
                                <div className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black transition-all border-4",
                                    isActive ? "bg-slate-900 dark:bg-white text-white dark:text-black border-slate-900 dark:border-white scale-110" : 
                                    isPast ? "bg-brand-emerald text-white border-brand-emerald" : "bg-white dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-white/5"
                                )}>
                                    {isPast ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                                </div>
                                <span className={cn(
                                    "text-[8px] font-black uppercase tracking-widest",
                                    isActive ? "text-slate-900 dark:text-white" : "text-slate-400"
                                )}>{s.label}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="p-8 space-y-8 max-w-4xl mx-auto">
                    {step === 'summary' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                            <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-white/5 p-8 shadow-premium relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <ShieldCheck className="w-32 h-32 rotate-12" />
                                </div>
                                
                                <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-2xl bg-slate-900 dark:bg-white flex items-center justify-center shadow-lg">
                                                <FileText className="h-5 w-5 text-white dark:text-black" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Referência Comercial</p>
                                                <p className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter">#{quoteRef.id.slice(0, 8)}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                <Layers className="w-3.5 h-3.5" /> Detalhamento de Itens ({ (quoteRef.groups || []).length } Ambientes)
                                            </h4>
                                            <div className="space-y-2">
                                                {(quoteRef.groups || []).map((group, i) => (
                                                    <div key={i} className="flex justify-between items-center p-3 rounded-2xl bg-slate-50 dark:bg-black/20 border border-slate-100 dark:border-white/5">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-black text-slate-900 dark:text-white uppercase">{group.environmentName}</span>
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase">{group.materialName} ({group.pieces.length} peças)</span>
                                                        </div>
                                                        <span className="text-xs font-mono font-black text-slate-600 dark:text-slate-400">
                                                            R$ {group.groupTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-slate-900 dark:bg-[#050505] rounded-[2rem] p-8 text-white shadow-2xl space-y-6">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-1">Total Comercial (Faturado)</p>
                                            <h3 className="text-4xl font-black tracking-tighter text-white">
                                                R$ {calculationData.commercialTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </h3>
                                        </div>

                                        <div className="pt-6 border-t border-white/10 space-y-3">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="font-bold text-slate-400 uppercase">Subtotal Peças:</span>
                                                <span className="font-mono font-black">R$ {calculationData.stones.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="font-bold text-slate-400 uppercase">Instalação:</span>
                                                <span className="font-mono font-black">R$ {calculationData.operationalTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            {calculationData.discount > 0 && (
                                                <div className="flex justify-between items-center text-xs pt-2 border-t border-white/5">
                                                    <span className="font-bold text-rose-400 uppercase tracking-tighter">Desconto:</span>
                                                    <span className="font-mono font-black text-rose-400">- R$ {calculationData.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'payment' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                            <div className="bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-brand-emerald/30 p-8 shadow-xl">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 rounded-2xl bg-brand-emerald/10 flex items-center justify-center">
                                        <CreditCard className="w-6 h-6 text-brand-emerald" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Definição de Pagamento</h3>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Condições obrigatórias para o contrato</p>
                                    </div>
                                </div>

                                <PaymentConditionsForm 
                                    total={calculationData.totalAmount}
                                    paymentDraft={paymentDraft!}
                                    onUpdate={setPaymentDraft}
                                />
                            </div>
                        </div>
                    )}

                    {step === 'clauses' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                            <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-white/5 p-8 shadow-xl">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="w-12 h-12 rounded-2xl bg-brand-emerald/10 flex items-center justify-center">
                                        <FileText className="w-6 h-6 text-brand-emerald" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Cláusulas Contratuais</h3>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Personalize o texto jurídico deste contrato</p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {safeArray(customClauses).map((clause, idx) => (
                                        <div key={idx} className="space-y-3 p-6 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 group hover:border-brand-emerald/20 transition-all">
                                            <Input 
                                                value={clause.title}
                                                onChange={(e) => {
                                                    const newClauses = [...customClauses];
                                                    newClauses[idx].title = e.target.value;
                                                    setCustomClauses(newClauses);
                                                }}
                                                className="h-10 font-black uppercase text-[10px] tracking-widest bg-transparent border-transparent focus:border-brand-emerald/30 focus:bg-white dark:focus:bg-slate-900"
                                            />
                                            <textarea 
                                                value={clause.content}
                                                onChange={(e) => {
                                                    const newClauses = [...customClauses];
                                                    newClauses[idx].content = e.target.value;
                                                    setCustomClauses(newClauses);
                                                }}
                                                className="w-full h-32 p-4 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl focus:ring-2 focus:ring-brand-emerald/20 outline-none resize-none font-medium text-slate-600 dark:text-slate-300"
                                            />
                                        </div>
                                    ))}
                                    
                                    <Button 
                                        variant="outline" 
                                        className="w-full h-14 border-dashed rounded-3xl font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-brand-emerald hover:border-brand-emerald"
                                        onClick={() => setCustomClauses([...customClauses, { title: 'Nova Cláusula', content: '' }])}
                                    >
                                        <Plus className="w-4 h-4 mr-2" /> Adicionar Cláusula Extra
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'signature' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8 text-center max-w-2xl mx-auto py-12">
                            <div className="w-24 h-24 rounded-[2.5rem] bg-brand-emerald/10 flex items-center justify-center mx-auto mb-8 shadow-xl">
                                <ShieldCheck className="w-12 h-12 text-brand-emerald" />
                            </div>
                            
                            <div className="space-y-4">
                                <h3 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Assinatura da Empresa</h3>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Confirme a assinatura digital para o contrato</p>
                            </div>

                            <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-white/5 rounded-[3rem] p-12 shadow-premium relative group">
                                {companySignature ? (
                                    <div className="space-y-6">
                                        <img src={companySignature} alt="Signature" className="max-h-48 mx-auto object-contain opacity-90 group-hover:opacity-100 transition-opacity" />
                                        <p className="text-[10px] font-black text-brand-emerald uppercase tracking-[0.3em]">Assinatura Autenticada</p>
                                    </div>
                                ) : (
                                    <div className="py-12 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-[2rem] flex flex-col items-center gap-4">
                                        <Info className="w-8 h-8 text-slate-300" />
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhuma assinatura padrão encontrada</p>
                                        <Button variant="outline" className="rounded-2xl h-12 px-8 font-black uppercase text-[10px] tracking-widest">Configurar Assinatura</Button>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-4 p-6 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/5 text-left">
                                <Info className="h-5 w-5 text-brand-emerald shrink-0" />
                                <p className="text-[10px] font-bold text-slate-500 leading-relaxed uppercase tracking-wider">
                                    Ao avançar, esta assinatura será vinculada permanentemente a este contrato como a validação da contratada.
                                </p>
                            </div>
                        </div>
                    )}

                    {step === 'finalization' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8 text-center max-w-2xl mx-auto py-12">
                            <div className="w-24 h-24 rounded-[2.5rem] bg-slate-900 dark:bg-white flex items-center justify-center mx-auto mb-8 shadow-2xl">
                                <Package className="w-12 h-12 text-white dark:text-black" />
                            </div>
                            
                            <div className="space-y-4">
                                <h3 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Pronto para Enviar</h3>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">O contrato será gerado e ficará aguardando o cliente</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 dark:bg-white/5 p-8 rounded-[2rem] border border-slate-100 dark:border-white/5 text-left space-y-2">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Protocolo Gerado</p>
                                    <p className="text-xl font-black text-slate-900 dark:text-white uppercase">#{quoteRef.id.slice(0, 8)}</p>
                                </div>
                                <div className="bg-slate-50 dark:bg-white/5 p-8 rounded-[2rem] border border-slate-100 dark:border-white/5 text-left space-y-2">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Status Inicial</p>
                                    <p className="text-xl font-black text-brand-emerald uppercase">Em Contrato</p>
                                </div>
                            </div>

                            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 p-8 rounded-[2rem] flex items-start gap-4 text-left">
                                <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                                <div>
                                    <p className="text-[10px] font-black text-amber-900 dark:text-amber-200 uppercase tracking-widest mb-1">Atenção Operacional</p>
                                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 leading-relaxed">
                                        A Ordem de Serviço (OS) **NÃO** será gerada nesta etapa. Ela só será liberada para produção após o cliente assinar digitalmente este contrato.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer Navigation */}
            <div className="bg-slate-50 dark:bg-slate-900 p-8 border-t border-slate-200 dark:border-white/5 flex justify-between items-center shrink-0">
                <div className="flex gap-4">
                    <Button 
                        variant="ghost" 
                        onClick={step === 'summary' ? onClose : prevStep} 
                        className="font-black uppercase text-[10px] tracking-widest text-slate-500 hover:bg-slate-200 dark:hover:bg-white/5 px-8 h-12 rounded-2xl"
                    >
                        {step === 'summary' ? 'Cancelar' : 'Voltar'}
                    </Button>
                </div>

                <div className="flex items-center gap-6">
                    <div className="hidden md:flex flex-col items-end">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total do Contrato</p>
                        <p className="text-lg font-black text-slate-900 dark:text-white tracking-tighter">
                            R$ {calculationData.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                    </div>

                    {step === 'finalization' && (
                        <Button 
                            variant="outline"
                            onClick={() => setShowPreview(true)}
                            className="h-16 border-2 border-slate-200 dark:border-white/10 font-black uppercase text-xs tracking-[0.1em] px-8 rounded-[2rem] hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                        >
                            Visualizar contrato
                        </Button>
                    )}

                    <Button 
                        onClick={step === 'finalization' ? handleFinalSubmit : nextStep}
                        disabled={isSubmitting}
                        className="h-16 bg-slate-900 dark:bg-white text-white dark:text-black font-black uppercase text-xs tracking-[0.2em] px-16 rounded-[2rem] shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        {isSubmitting ? (
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 border-2 border-slate-500/30 border-t-slate-500 rounded-full animate-spin" />
                                Gerando...
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                {step === 'finalization' ? 'Confirmar e Enviar' : 'Continuar'}
                                {step === 'finalization' ? <ShieldCheck className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                            </div>
                        )}
                    </Button>
                </div>
            </div>

            {/* Preview Modal */}
            {showPreview && (
                <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-white/5 shrink-0 bg-white dark:bg-slate-900">
                            <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-tighter">Pré-visualização do Contrato</h3>
                            <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => setShowPreview(false)}
                                className="h-10 w-10 rounded-full hover:bg-slate-100 dark:hover:bg-white/5"
                            >
                                <X className="h-5 w-5 text-slate-500" />
                            </Button>
                        </div>
                        <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-950 p-8">
                            <ContractPrintTemplate order={generatePreviewOrder() as any} />
                        </div>
                        <div className="p-6 border-t border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900 flex justify-end shrink-0">
                            <Button
                                onClick={() => setShowPreview(false)}
                                className="font-black uppercase text-xs tracking-widest px-8 rounded-xl h-12"
                            >
                                Fechar visualização
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};