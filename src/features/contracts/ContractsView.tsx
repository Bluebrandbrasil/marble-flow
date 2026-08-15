import { safeArray, safeHistoryArray } from '../../lib/dataDiagnostics';
import { getContractDisplayStatus } from '../../utils/contractUtils';
import { safeParseISO, formatVisualDate } from '../../lib/dateUtils';
import { toISODateSafe } from '../../lib/dateWriteUtils';
import React, { useState, useMemo } from 'react';
import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom';
import { collection, addDoc, doc, updateDoc, deleteField, setDoc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { InPersonSignatureModal } from './InPersonSignatureModal';
import { getNextProtocolNumber } from '../../lib/protocolGenerator';
import type { Order } from '../../types';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { 
    Search, 
    FileText, 
    FileCheck, 
    Clock, 
    Copy, 
    CheckCircle2,
    ShieldCheck,
    Download,
    User,
    ClipboardList,
    TrendingUp,
    AlertCircle,
    Eye,
    Send,
    History,
    Timer,
    Calendar,
    ShieldAlert,
    Package,
    FileEdit,
    Trash2
} from 'lucide-react';
import { RevokeContractModal } from './RevokeContractModal';
import { createOrderLog } from '../../lib/orderLogs';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { openWhatsAppFollowUp } from '../../utils/whatsappHelper';
import { cn } from '../../lib/utils';
import { formatDistanceToNow, differenceInHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { WorkflowBadge, WorkflowTimeline } from '../../components/workflow/WorkflowStatus';
import { normalizeText } from '../../utils/textUtils';

const safeValue = (value: any, fallback: any) => {
    return value === undefined || value === null ? fallback : value;
};

export const removeUndefinedDeep = (obj: any): any => {
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

export const ContractsView: React.FC = () => {
    const navigate = useNavigate();
    const { contracts = [], profile } = useOutletContext<any>();
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<'pending' | 'signed' | 'all'>(() => 
        searchParams.get('search') ? 'all' : 'pending'
    );
    const [searchTerm, setSearchTerm] = useState(() => 
        searchParams.get('search') || ''
    );
    const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
    const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
    const [orderToRevoke, setOrderToRevoke] = useState<any | null>(null);
    const [isInPersonModalOpen, setIsInPersonModalOpen] = useState(false);
    const [contractForInPerson, setContractForInPerson] = useState<any | null>(null);

    const handleOpenInPersonModal = (contract: any) => {
        const displayStatus = getContractDisplayStatus(contract);
        if (displayStatus === 'assinado') {
            alert('Não é possível assinar presencialmente um contrato já assinado digitalmente.');
            return;
        }

        const parsedExpires = safeParseISO(contract.signatureExpiresAt);
        const isExpired = !!(parsedExpires && parsedExpires < new Date() && !['assinado', 'assinado_presencial', 'em_edicao'].includes(displayStatus));
        const isAllowedStatus = ['pendente', 'em_edicao'].includes(displayStatus) || isExpired;
        
        if (!isAllowedStatus) {
            alert('Assinatura presencial permitida apenas para contratos pendentes, expirados ou enviados.');
            return;
        }

        setContractForInPerson(contract);
        setIsInPersonModalOpen(true);
    };

    const handleConfirmInPersonSignature = async (file: File, date: string, responsible: string, observation: string) => {
        if (!contractForInPerson) return;

        const contract = contractForInPerson;
        const companyId = profile?.companyId || contract.companyId || 'unassigned';
        const contractId = contract.id;
        const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;

        const storagePath = `companies/${companyId}/contracts/signed/${contractId}/${fileName}`;
        const storageRef = ref(storage, storagePath);
        
        const uploadTask = uploadBytesResumable(storageRef, file);
        await uploadTask;
        
        const downloadUrl = await getDownloadURL(storageRef);
        
        const isoNow = toISODateSafe(new Date())!;
        const userName = profile?.name || 'Sistema';
        const signDateIso = new Date(date + 'T12:00:00Z').toISOString();

        await updateDoc(doc(db, 'contratos', contractId), {
            signatureMode: 'presencial',
            status: 'signed',
            contractStatus: 'signed',
            signedAt: signDateIso,
            signedContractFileUrl: downloadUrl,
            signedContractFileName: file.name,
            signedByInternalUserId: profile?.id || '',
            signedByInternalUserName: responsible,
            signedObservation: observation,
            updatedAt: isoNow,
            history: [
                ...safeHistoryArray(contract.history),
                {
                    date: isoNow,
                    action: `Contrato assinado presencialmente e anexado por ${responsible}`,
                    user: userName,
                    severity: 'success'
                }
            ]
        });

        await createOrderLog({
            orderId: contractId,
            companyId: companyId,
            userId: profile?.id || '',
            userName: userName,
            action: 'status_change',
            fieldChanged: 'contractStatus',
            oldValue: contract.contractStatus || 'pending',
            newValue: 'signed',
            reason: `Assinatura presencial adicionada por ${responsible}. Obs: ${observation}`,
            source: 'ContractsView/InPerson'
        });

        setIsInPersonModalOpen(false);
        setContractForInPerson(null);
    };

    // Executive Stats
    const stats = useMemo(() => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const pending = safeArray(contracts).filter((o: any) => getContractDisplayStatus(o) === 'pendente').length;
        const signedThisMonth = safeArray(contracts).filter((o: any) => {
            const displayStatus = getContractDisplayStatus(o);
            return ['assinado', 'assinado_presencial'].includes(displayStatus) && 
                safeParseISO(o.signedAt) && (safeParseISO(o.signedAt) as Date) >= startOfMonth;
        }).length;
        
        const totalSent = safeArray(contracts).filter((o: any) => getContractDisplayStatus(o) !== 'em_edicao').length;
        const totalSigned = safeArray(contracts).filter((o: any) => {
            const displayStatus = getContractDisplayStatus(o);
            return ['assinado', 'assinado_presencial'].includes(displayStatus);
        }).length;
        const conversion = totalSent > 0 ? Math.round((totalSigned / totalSent) * 100) : 0;
        
        const signedWithTime = safeArray(contracts).filter((o: any) => {
            const displayStatus = getContractDisplayStatus(o);
            return ['assinado', 'assinado_presencial'].includes(displayStatus) && o.contractSentAt && o.signedAt;
        });
        const avgHours = signedWithTime.length > 0 
            ? Math.round(safeArray(signedWithTime).reduce((acc: number, o: any) => {
                const s = safeParseISO(o.signedAt!);
                const c = safeParseISO(o.contractSentAt!);
                return acc + (s && c ? differenceInHours(s, c) : 0);
              }, 0) / signedWithTime.length)
            : 0;

        return { pending, signedThisMonth, conversion, avgHours };
    }, [contracts]);

    const filteredOrders = safeArray(contracts).filter((order: any) => {
        const displayStatus = getContractDisplayStatus(order);
        const matchesTab = activeTab === 'all' 
            ? true 
            : activeTab === 'pending' 
                ? ['pendente', 'em_edicao'].includes(displayStatus)
                : ['assinado', 'assinado_presencial'].includes(displayStatus);
            
        const searchLower = normalizeText(searchTerm);
        const matchesSearch = 
            normalizeText(order?.customerName).includes(searchLower) ||
            normalizeText(order?.sellerName).includes(searchLower);
            
        return matchesTab && matchesSearch;
    });

    const getUrgency = (order: any) => {
        const displayStatus = getContractDisplayStatus(order);
        if (['assinado', 'assinado_presencial', 'em_edicao'].includes(displayStatus)) return null;
        if (!order.contractSentAt) return { label: 'RECENTE', color: 'bg-emerald-500', icon: Clock };
        
        const parsedSent = safeParseISO(order.contractSentAt);
        const hoursSinceSent = parsedSent ? differenceInHours(new Date(), parsedSent) : 0;
        if (hoursSinceSent > 72) return { label: 'URGENTE', color: 'bg-rose-500', icon: AlertCircle };
        if (hoursSinceSent > 24) return { label: 'ATENÇÃO', color: 'bg-amber-500', icon: Timer };
        return { label: 'RECENTE', color: 'bg-emerald-500', icon: Clock };
    };

    const handleCopyLink = (order: any) => {
        if (!order.signatureToken) return;
        const link = `${window.location.origin}/sign/${order.signatureToken}`;
        navigator.clipboard.writeText(link);
        alert('Link copiado para a área de transferência!');
    };

    const handleSendWhatsApp = async (order: any) => {
        const phone = order.phone?.replace(/\D/g, '');
        if (!phone) {
            alert('Cliente sem telefone cadastrado.');
            return;
        }

        const isoNow = toISODateSafe(new Date())!;
        const isSigned = order.contractStatus === 'signed';

        let contractSnapshot = order.contractSnapshot || {};

        if (!isSigned) {
            // Se o contrato ainda NÃO estiver assinado: atualiza com os dados atuais do orçamento.
            // Preservamos as configurações e metadados já existentes na empresa (como templates, etc)
            contractSnapshot = {
                ...order.contractSnapshot,
                items: order.items && order.items.length > 0 ? order.items : (order.contractSnapshot?.items || (order as any).orderSnapshot?.items || (order as any).quoteSnapshot?.items || []),
                accessories: order.accessories && order.accessories.length > 0 ? order.accessories : (order.contractSnapshot?.accessories || (order as any).orderSnapshot?.accessories || (order as any).quoteSnapshot?.accessories || []),
                services: order.services && order.services.length > 0 ? order.services : (order.contractSnapshot?.services || (order as any).orderSnapshot?.services || (order as any).quoteSnapshot?.services || []),
                commercialTotal: safeValue(order.commercialTotal, 0),
                operationalCost: safeValue(order.operationalCost, 0),
                freight: safeValue(order.freight, 0),
                totalAmount: safeValue(order.totalAmount, 0),
                subtotal: safeValue(order.subtotal, 0),
                discount: safeValue(order.discount, 0),
                customerName: safeValue(order.customerName, safeValue(order.clientName, '')),
                document: safeValue(order.document, safeValue(order.customerDocument, '')),
                phone: safeValue(order.phone, safeValue(order.customerPhone, '')),
                address: safeValue(order.address, ''),
                observations: safeValue(order.observations, ''),
                splashback: safeValue(order.splashback, ''),
                skirt: safeValue(order.skirt, ''),
                paymentTerms: safeValue(order.paymentTerms, ''),
                deliveryTime: safeValue(order.deliveryTime, ''),
                version: safeValue(order.version, 1),
                isPostMeasurement: safeValue(order.isPostMeasurement, false),
                generatedAt: isoNow
            };

            // Auditoria: Garantir Token
            let activeToken = order.signatureToken;
            if (!activeToken) {
                console.warn('[AUDIT_GATEWAY] ContractsView: Token ausente. Gerando...');
                activeToken = crypto.randomUUID();
            }

            // 1. Update contract in 'contratos' collection
            await updateDoc(doc(db, 'contratos', order.id), {
                contractSentAt: isoNow,
                contractStatus: order.contractStatus === 'viewed' ? 'viewed' : 'pending',
                contractSnapshot,
                signatureToken: activeToken
            });

            // 2. Create/Update Public Gateway (Secure)
            const leanOrder = {
                id: safeValue(order.id, ''),
                customerName: safeValue(order.customerName, safeValue(order.clientName, '')),
                document: safeValue(order.document, safeValue(order.customerDocument, '')),
                phone: safeValue(order.phone, safeValue(order.customerPhone, '')),
                address: safeValue(order.address, ''),
                items: order.items && order.items.length > 0 ? order.items : (order.contractSnapshot?.items || (order as any).orderSnapshot?.items || (order as any).quoteSnapshot?.items || []),
                accessories: order.accessories && order.accessories.length > 0 ? order.accessories : (order.contractSnapshot?.accessories || (order as any).orderSnapshot?.accessories || (order as any).quoteSnapshot?.accessories || []),
                services: order.services && order.services.length > 0 ? order.services : (order.contractSnapshot?.services || (order as any).orderSnapshot?.services || (order as any).quoteSnapshot?.services || []),
                totalAmount: safeValue(order.totalAmount, 0),
                downPayment: safeValue(order.downPayment, 0),
                paymentMethod: safeValue(order.paymentMethod, ''),
                protocolNumber: safeValue(order.protocolNumber, ''),
                deadline: safeValue(order.deadline, ''),
                material: safeValue(order.material, ''),
                contractStatus: order.contractStatus || 'pending',
                createdAt: safeValue(order.createdAt, isoNow),
                contractSnapshot
            };

            const gatewayPayload = removeUndefinedDeep({
                token: activeToken,
                orderId: order.id,
                companyId: safeValue(profile?.companyId, safeValue(order.companyId, '')),
                expiresAt: safeValue(order.signatureExpiresAt, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()),
                active: true,
                createdAt: isoNow,
                orderSnapshot: leanOrder,
                contractSnapshot
            });

            await setDoc(doc(db, 'public_contract_links', activeToken), gatewayPayload);

            const message = `Olá ${order.customerName}! Aqui está o link para você revisar e assinar o seu contrato digital da marmoraria: ${window.location.origin}/sign/${activeToken}`;
            window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank');
        } else {
            // Se o contrato JÁ estiver assinado: NÃO atualiza o snapshot. Apenas envia o link existente.
            const activeToken = order.signatureToken;
            if (!activeToken) {
                alert('Contrato assinado sem link válido.');
                return;
            }
            const message = `Olá ${order.customerName}! Aqui está o link do seu contrato digital assinado: ${window.location.origin}/sign/${activeToken}`;
            openWhatsAppFollowUp(phone, message);
        }
    };

    const handleMarkAsSent = async (order: any) => {
        const isoNow = toISODateSafe(new Date())!;
        const isSigned = order.contractStatus === 'signed';

        if (isSigned) {
            alert('Este contrato já está assinado. Não é permitido atualizar o snapshot.');
            return;
        }

        // --- IMMUTABILITY ENGINE: Total Project Value Preservation (Rule #30) ---
        const contractSnapshot = {
            ...order.contractSnapshot,
            items: order.items && order.items.length > 0 ? order.items : (order.contractSnapshot?.items || (order as any).orderSnapshot?.items || (order as any).quoteSnapshot?.items || []),
            accessories: order.accessories && order.accessories.length > 0 ? order.accessories : (order.contractSnapshot?.accessories || (order as any).orderSnapshot?.accessories || (order as any).quoteSnapshot?.accessories || []),
            services: order.services && order.services.length > 0 ? order.services : (order.contractSnapshot?.services || (order as any).orderSnapshot?.services || (order as any).quoteSnapshot?.services || []),
            commercialTotal: safeValue(order.commercialTotal, 0),
            freight: safeValue(order.freight, 0),
            totalAmount: safeValue(order.totalAmount, 0),
            subtotal: safeValue(order.subtotal, 0),
            discount: safeValue(order.discount, 0),
            customerName: safeValue(order.customerName, safeValue(order.clientName, '')),
            document: safeValue(order.document, safeValue(order.customerDocument, '')),
            phone: safeValue(order.phone, safeValue(order.customerPhone, '')),
            address: safeValue(order.address, ''),
            observations: safeValue(order.observations, ''),
            splashback: safeValue(order.splashback, ''),
            skirt: safeValue(order.skirt, ''),
            paymentTerms: safeValue(order.paymentTerms, ''),
            deliveryTime: safeValue(order.deliveryTime, ''),
            version: safeValue(order.version, 1),
            isPostMeasurement: safeValue(order.isPostMeasurement, false),
            generatedAt: isoNow
        };

        // Auditoria: Garantir Token
        let activeToken = order.signatureToken;
        if (!activeToken) {
            activeToken = crypto.randomUUID();
        }

        // 1. Internal Update
        await updateDoc(doc(db, 'contratos', order.id), {
            contractSentAt: isoNow,
            contractSnapshot,
            signatureToken: activeToken
        });

        // 2. Public Gateway Update
        const leanOrder = {
            id: safeValue(order.id, ''),
            customerName: safeValue(order.customerName, safeValue(order.clientName, '')),
            document: safeValue(order.document, safeValue(order.customerDocument, '')),
            phone: safeValue(order.phone, safeValue(order.customerPhone, '')),
            address: safeValue(order.address, ''),
            items: order.items && order.items.length > 0 ? order.items : (order.contractSnapshot?.items || (order as any).orderSnapshot?.items || (order as any).quoteSnapshot?.items || []),
            accessories: order.accessories && order.accessories.length > 0 ? order.accessories : (order.contractSnapshot?.accessories || (order as any).orderSnapshot?.accessories || (order as any).quoteSnapshot?.accessories || []),
            services: order.services && order.services.length > 0 ? order.services : (order.contractSnapshot?.services || (order as any).orderSnapshot?.services || (order as any).quoteSnapshot?.services || []),
            totalAmount: safeValue(order.totalAmount, 0),
            downPayment: safeValue(order.downPayment, 0),
            paymentMethod: safeValue(order.paymentMethod, ''),
            protocolNumber: safeValue(order.protocolNumber, ''),
            deadline: safeValue(order.deadline, ''),
            material: safeValue(order.material, ''),
            contractStatus: 'pending',
            createdAt: safeValue(order.createdAt, isoNow),
            contractSnapshot
        };

        const gatewayPayload = removeUndefinedDeep({
            token: activeToken,
            orderId: order.id,
            companyId: safeValue(profile?.companyId, safeValue(order.companyId, '')),
            expiresAt: safeValue(order.signatureExpiresAt, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()),
            active: true,
            createdAt: isoNow,
            orderSnapshot: leanOrder,
            contractSnapshot
        });

        await setDoc(doc(db, 'public_contract_links', activeToken), gatewayPayload);

        alert('Marcado como enviado e link sincronizado!');
    };

    const handleViewContract = (orderId: string) => {
        window.open(`/order/${orderId}/contract`, '_blank');
    };

    const handleViewSigned = (order: any) => {
        window.open(`/sign/${order.signatureToken}`, '_blank');
    };

    const handleConfirmRevoke = async (reason: string) => {
        if (!orderToRevoke) return;

        console.log('[REVOKE] confirmação aceita');
        const isoNow = toISODateSafe(new Date())!;
        const userName = profile?.name || 'Sistema';

        try {
            console.log('[REVOKE] updateDoc iniciado');
            // 1. Update contract in 'contratos'
            const contractRef = doc(db, 'contratos', orderToRevoke.id);
            await updateDoc(contractRef, {
                contractStatus: 'draft',
                contractLinkActive: false,
                publicLinkActive: false,
                linkActive: false,
                status: 'em_contrato',
                workflowStatus: 'em_contrato',
                signedAt: null,
                contractViewedAt: null,
                viewedAt: null,
                contractSentAt: deleteField(),
                clientSnapshot: deleteField(),
                signatureData: deleteField(),
                clientSignature: deleteField(),
                linkViewedAt: deleteField(),
                signedContractFileUrl: deleteField(),
                revokedAt: isoNow,
                revokedBy: userName,
                signatureToken: crypto.randomUUID(),
                version: (orderToRevoke.version || 1) + 1,
                history: [
                    ...safeHistoryArray(orderToRevoke.history),
                    {
                        date: isoNow,
                        action: `CONTRATO REVOGADO (v${orderToRevoke.version || 1}): ${reason}`,
                        user: userName,
                        severity: 'critical'
                    }
                ]
            });

            // 2. Update linked order in 'pedidos' if orderId exists
            if (orderToRevoke.orderId) {
                const orderRef = doc(db, 'pedidos', orderToRevoke.orderId);
                const orderSnap = await getDoc(orderRef);
                if (orderSnap.exists()) {
                    await updateDoc(orderRef, {
                        contractStatus: 'draft',
                        contractLinkActive: false,
                        publicLinkActive: false,
                        linkActive: false,
                        status: 'em_contrato',
                        workflowStatus: 'em_contrato',
                        signedAt: null,
                        contractViewedAt: null,
                        viewedAt: null,
                        contractSentAt: deleteField(),
                        clientSnapshot: deleteField(),
                        signatureData: deleteField(),
                        clientSignature: deleteField(),
                        linkViewedAt: deleteField(),
                        signedContractFileUrl: deleteField(),
                        revokedAt: isoNow,
                        revokedBy: userName,
                        signatureToken: crypto.randomUUID(),
                        version: (orderSnap.data().version || 1) + 1,
                        history: [
                            ...safeHistoryArray(orderSnap.data().history),
                            {
                                date: isoNow,
                                action: `CONTRATO REVOGADO (v${orderToRevoke.version || 1}): ${reason}`,
                                user: userName,
                                severity: 'critical'
                            }
                        ]
                    });
                }
            }
            console.log('[REVOKE] updateDoc concluído');
            console.log('[REVOKE] dados após update', {
                id: orderToRevoke.id,
                contractStatus: 'draft',
                contractLinkActive: false,
                status: 'em_contrato',
                workflowStatus: 'em_contrato'
            });
        } catch (error) {
            console.error('[REVOKE] Erro ao executar updateDoc:', error);
            throw error;
        }

        await createOrderLog({
            orderId: orderToRevoke.id,
            companyId: profile?.companyId || '',
            userId: profile?.id || '',
            userName: userName,
            action: 'contract_revoked',
            fieldChanged: 'contractStatus',
            oldValue: orderToRevoke.contractStatus ?? null,
            newValue: 'revoked',
            reason: reason,
            source: 'ContractsView/Revoke'
        });

        setIsRevokeModalOpen(false);
        setOrderToRevoke(null);
    };

    const handleDeleteContract = async (contract: any) => {
        if (!contract) return;

        const confirmMsg = "Tem certeza que deseja excluir este contrato da central? Esta ação não remove a O.S.";
        if (!window.confirm(confirmMsg)) return;

        const isoNow = toISODateSafe(new Date())!;
        const userName = profile?.name || 'Sistema';

        try {
            // 1. Soft delete the contract in 'contratos'
            console.log('[DELETE] updating contract');
            const contractRef = doc(db, 'contratos', contract.id);
            await updateDoc(contractRef, {
                contractStatus: 'deleted',
                hiddenFromContracts: true,
                publicLinkActive: false,
                linkActive: false,
                contractLinkActive: false,
                deletedAt: isoNow,
                deletedBy: userName,
                history: [
                    ...safeHistoryArray(contract.history),
                    {
                        date: isoNow,
                        action: "Contrato removido da Central de Contratos.",
                        user: userName,
                        severity: 'critical'
                    }
                ]
            });

            // 2. Inactivate the public signature link if it exists
            if (contract.signatureToken) {
                console.log('[DELETE] disabling public link', contract.signatureToken);
                const gatewayRef = doc(db, 'public_contract_links', contract.signatureToken);
                await updateDoc(gatewayRef, {
                    active: false
                }).catch(err => console.error("Error disabling public contract link:", err));
            }

            // 3. Update linked order in 'pedidos' if orderId exists
            if (contract.orderId) {
                console.log('[DELETE] updating order');
                const orderRef = doc(db, 'pedidos', contract.orderId);
                const orderSnap = await getDoc(orderRef);
                if (orderSnap.exists()) {
                    await updateDoc(orderRef, {
                        contractId: deleteField(),
                        contractStatus: deleteField(),
                        signedAt: deleteField(),
                        signatureData: deleteField(),
                        clientSignature: deleteField(),
                        contractSnapshot: deleteField(),
                        revokedAt: deleteField(),
                        revokedBy: deleteField(),
                        contractSentAt: deleteField(),
                        publicLinkActive: deleteField(),
                        linkActive: deleteField(),
                        contractLinkActive: deleteField(),
                        signedContractFileUrl: deleteField(),
                        linkViewedAt: deleteField(),
                        viewedAt: deleteField(),
                        contractViewedAt: deleteField(),
                        signatureToken: deleteField(),
                        signatureExpiresAt: deleteField(),
                        osGeneratedAt: deleteField(),
                        osGeneratedBy: deleteField(),
                        isContractFirstOrder: deleteField(),
                        history: [
                            ...safeHistoryArray(orderSnap.data().history),
                            {
                                date: isoNow,
                                action: "Vínculo do contrato removido da O.S. devido a exclusão.",
                                user: userName,
                                severity: 'info'
                            }
                        ]
                    });
                }
            }

            // 4. Update linked quote in 'orcamentos' if quoteId exists
            if (contract.quoteId) {
                console.log('[DELETE] updating quote');
                const quoteRef = doc(db, 'orcamentos', contract.quoteId);
                await updateDoc(quoteRef, {
                    convertedToContractId: deleteField(),
                    contractGenerationAvailable: true,
                    updatedAt: isoNow
                }).catch(err => console.error("Error updating quote on contract delete:", err));
            }

            // 5. Update linked measurement in 'medicoes' if measurementId exists
            if (contract.measurementId) {
                const measurementRef = doc(db, 'medicoes', contract.measurementId);
                await updateDoc(measurementRef, {
                    status: 'completed',
                    updatedAt: isoNow
                }).catch(err => console.error("Error updating measurement status:", err));
            }

            // 6. Register history log
            await createOrderLog({
                orderId: contract.id,
                companyId: profile?.companyId || '',
                userId: profile?.id || '',
                userName: userName,
                action: 'contract_deleted',
                fieldChanged: 'contractStatus',
                oldValue: contract.contractStatus ?? null,
                newValue: 'deleted',
                reason: 'Contrato removido da Central de Contratos.',
                source: 'ContractsView/Delete'
            });

        } catch (error) {
            console.error('[DELETE_CONTRACT] Erro ao excluir contrato:', error);
            alert('Erro ao excluir contrato. Tente novamente.');
        }
    };

    const handleReleaseToProduction = async (contract: any) => {
        const displayStatus = getContractDisplayStatus(contract);
        if (displayStatus !== 'assinado' && displayStatus !== 'assinado_presencial') {
            alert('O contrato deve estar assinado para liberar a produção.');
            return;
        }

        if (contract.orderId) {
            alert('Esta O.S. já foi gerada anteriormente.');
            navigate('/producao/ordens');
            return;
        }

        if (!window.confirm(`Deseja gerar a Ordem de Serviço para ${contract.customerName}?`)) return;

        try {
            const iso = toISODateSafe(new Date())!;
            
            // 1. Generate Protocol Number
            const protocolNumber = await getNextProtocolNumber(profile.companyId);
            
            // 2. Prepare OS Payload (Order)
            let initialDownPayment = 0;
            const financialHistory: any[] = [];

            // Detectar Entrada (Sinal) se houver parcela 'imediato' ou pagamento à vista
            const installments = contract.paymentConditions?.installments || [];
            const signalInstallment = installments.find(i => i.dueType === 'imediato');
            const isAvista = contract.paymentConditions?.type === 'avista';
            const contractTotal = contract.totalAmount || 0;
            
            // Se já tem histórico financeiro anterior (ex: baixas manuais antes de gerar OS), preservar
            if (contract.financialHistory && Array.isArray(contract.financialHistory) && contract.financialHistory.length > 0) {
                financialHistory.push(...contract.financialHistory);
                initialDownPayment = financialHistory.reduce((acc, h) => acc + (Number(h.amount) || 0), 0);
            } else if (isAvista && contractTotal > 0) {
                initialDownPayment = contractTotal;
                financialHistory.push({
                    id: crypto.randomUUID(),
                    type: 'income',
                    date: iso,
                    amount: contractTotal,
                    paymentMethod: contract.paymentConditions?.method || 'PIX',
                    source: 'contract_down_payment',
                    userId: profile.id,
                    userName: profile.name || 'Sistema',
                    notes: 'Pagamento à vista confirmado via contrato assinado.',
                    createdAt: iso,
                    status: 'received'
                });
            } else if (signalInstallment && signalInstallment.amount > 0) {
                initialDownPayment = signalInstallment.amount;
                financialHistory.push({
                    id: crypto.randomUUID(),
                    type: 'income',
                    date: iso,
                    amount: signalInstallment.amount,
                    paymentMethod: contract.paymentConditions?.method || 'PIX',
                    source: 'contract_down_payment',
                    userId: profile.id,
                    userName: profile.name || 'Sistema',
                    notes: 'Sinal/Entrada confirmado via contrato assinado.',
                    createdAt: iso,
                    status: 'received'
                });
            }

            const orderPayload: any = {
                clientId: contract.clientId || '',
                quoteId: contract.quoteId || '',
                contractId: contract.id || '', 
                measurementId: contract.measurementId || '',
                customerName: contract.customerName || '',
                phone: contract.phone || '',
                address: contract.address || '',
                document: contract.document || '',
                material: contract.material || '',
                status: 'aguardando_materia_prima',
                productionStatus: 'aguardando_materia_prima',
                priority: 'medium',
                protocolNumber: protocolNumber || '',
                items: contract.items || [],
                commercialTotal: contract.commercialTotal || 0,
                operationalCost: contract.operationalCost || 0,
                freight: contract.freight || 0,
                totalAmount: contract.totalAmount || 0,
                discount: contract.discount || 0,
                accessories: contract.accessories || [],
                services: contract.services || [],
                observations: contract.observations || '',
                splashback: contract.splashback || '',
                skirt: contract.skirt || '',
                paymentConditions: contract.paymentConditions || null,
                deadline: contract.deadline || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
                
                downPayment: initialDownPayment,
                financialHistory: financialHistory,
                paymentStatus: initialDownPayment >= (contract.totalAmount || 0) ? 'paid' : (initialDownPayment > 0 ? 'partial' : 'pending'),
                
                contractStatus: 'signed',
                signedAt: contract.signedAt || null,
                signatureData: contract.signatureData || null,
                clientSignature: contract.clientSignature || null,
                contractSnapshot: contract.contractSnapshot || null,
                
                osGeneratedAt: iso,
                osGeneratedBy: profile?.name || 'Sistema',
                isContractFirstOrder: true,
                
                installationDate: new Date().toISOString().split('T')[0],
                installationStatus: 'aguardando_definicao',
                
                scheduledDate: null,
                startDate: null,
                
                userId: profile.id,
                companyId: profile.companyId,
                createdAt: iso,
                updatedAt: iso,
                position: 0,
                history: [
                    ...safeHistoryArray(contract.history),
                    {
                        date: iso,
                        action: 'O.S. Gerada a partir de contrato assinado',
                        user: profile?.name || 'Sistema',
                        severity: 'success'
                    }
                ]
            };

            // 3. Final Payload Sanitization
            const finalPayload = removeUndefinedDeep(orderPayload);
            if (!import.meta.env.PROD) {
                console.log('[AUDIT_PRODUCTION] ContractsView: Payload Final da O.S.:', finalPayload);
            }

            // 4. Save/Update Order
            let orderId = '';
            if (contract.quoteId) {
                const existingOrderQuery = query(
                    collection(db, 'pedidos'),
                    where('companyId', '==', profile.companyId),
                    where('quoteId', '==', contract.quoteId)
                );
                const querySnap = await getDocs(existingOrderQuery);
                const activeOrder = querySnap.docs.find(d => d.data().status !== 'cancelado');
                if (activeOrder) {
                    orderId = activeOrder.id;
                    
                    // Merge new contract details into existing order payload
                    await updateDoc(doc(db, 'pedidos', orderId), {
                        ...finalPayload,
                        protocolNumber: activeOrder.data().protocolNumber || finalPayload.protocolNumber,
                        history: [
                            ...safeHistoryArray(activeOrder.data().history),
                            {
                                date: iso,
                                action: 'O.S. re-vinculada a novo contrato assinado',
                                user: profile?.name || 'Sistema',
                                severity: 'success'
                            }
                        ],
                        updatedAt: iso
                    });
                }
            }

            if (!orderId) {
                const orderRef = await addDoc(collection(db, 'pedidos'), finalPayload);
                orderId = orderRef.id;
            }

            // 4. Update Contract with Order Link
            await updateDoc(doc(db, 'contratos', contract.id), {
                orderId: orderId,
                osGeneratedAt: iso,
                osGeneratedBy: profile?.name || 'Sistema',
                updatedAt: iso
            });

            // 5. Update Quote with Order Link
            await updateDoc(doc(db, 'orcamentos', contract.quoteId), {
                convertedToOrderId: orderId,
                updatedAt: iso
            });

            // 6. Audit Log
            await createOrderLog({
                orderId: orderId,
                companyId: profile.companyId,
                userId: profile.id,
                userName: profile.name || '',
                action: 'create',
                reason: `O.S. # ${protocolNumber} gerada via Módulo de Contratos após assinatura.`
            });
            
            alert(`O.S. #${protocolNumber} gerada com sucesso!`);
            navigate('/producao/ordens');
        } catch (error) {
            console.error('Error releasing production:', error);
            alert('Erro ao processar liberação para produção.');
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#F8FAFC] dark:bg-[#050505]">
            <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
                
                {/* Executive Header */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard 
                        title="Pendentes" 
                        value={stats.pending} 
                        icon={Clock} 
                        color="amber"
                        description="Aguardando assinatura"
                    />
                    <StatCard 
                        title="Assinados (Mês)" 
                        value={stats.signedThisMonth} 
                        icon={FileCheck} 
                        color="emerald"
                        description="Conversão do mês atual"
                    />
                    <StatCard 
                        title="Taxa de Conversão" 
                        value={`${stats.conversion}%`} 
                        icon={TrendingUp} 
                        color="blue"
                        description="Assinados vs Enviados"
                    />
                    <StatCard 
                        title="Tempo Médio" 
                        value={stats.avgHours > 0 ? `${stats.avgHours}h` : '--'} 
                        icon={Timer} 
                        color="purple"
                        description="De envio até sinal"
                    />
                </div>

                {/* Filters and Search */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                    <div className="flex bg-white dark:bg-slate-900 p-1 rounded-2xl border border-slate-200 dark:border-white/5 w-fit shadow-sm">
                        <TabButton 
                            active={activeTab === 'pending'} 
                            onClick={() => setActiveTab('pending')}
                            label="Pendentes"
                            icon={Clock}
                            count={stats.pending}
                        />
                        <TabButton 
                            active={activeTab === 'signed'} 
                            onClick={() => setActiveTab('signed')}
                            label="Assinados"
                            icon={FileCheck}
                        />
                        <TabButton 
                            active={activeTab === 'all'} 
                            onClick={() => setActiveTab('all')}
                            label="Todos"
                            icon={FileText}
                        />
                    </div>

                    <div className="relative flex-1 max-w-xl">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por cliente, O.S. ou vendedor..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-11 pr-4 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-brand-emerald outline-none transition-all shadow-sm"
                        />
                    </div>
                </div>
                {/* Contracts List */}
                <div className="space-y-4">
                    {filteredOrders.length > 0 ? (
                        safeArray(filteredOrders).map((order: Order) => {
                             const displayStatus = getContractDisplayStatus(order);
                             const urgency = getUrgency(order);
                             const isExpanded = expandedOrder === order.id;
                             const parsedExpires = safeParseISO(order.signatureExpiresAt);
                             const isExpired = !!(parsedExpires && parsedExpires < new Date() && displayStatus === 'pendente');

                             return (
                                 <div 
                                     key={order.id}
                                     className={cn(
                                         "bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden",
                                         isExpanded && "ring-2 ring-brand-emerald shadow-xl"
                                     )}
                                 >
                                     {/* Main Row */}
                                     <div className="p-6 md:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                         <div className="flex items-center gap-6 min-w-0 flex-1">
                                             <div className={cn(
                                                 "w-16 h-16 rounded-3xl flex items-center justify-center shrink-0 shadow-lg",
                                                 ['assinado', 'assinado_presencial'].includes(displayStatus) 
                                                     ? "bg-emerald-500 text-white shadow-emerald-500/20" 
                                                     : isExpired
                                                         ? "bg-slate-400 text-white shadow-slate-400/20"
                                                         : displayStatus === 'em_edicao'
                                                             ? "bg-slate-500 text-white shadow-slate-500/20"
                                                             : "bg-amber-500 text-white shadow-amber-500/20"
                                             )}>
                                                 {['assinado', 'assinado_presencial'].includes(displayStatus) ? <FileCheck className="w-8 h-8" /> : (isExpired ? <AlertCircle className="w-8 h-8" /> : (displayStatus === 'em_edicao' ? <FileText className="w-8 h-8" /> : <Clock className="w-8 h-8" />))}
                                             </div>
                                             
                                             <div className="space-y-2.5 min-w-0 flex-1">
                                                 <div className="flex flex-wrap items-center gap-3">
                                                     <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight truncate max-w-[400px]">
                                                         {order.customerName}
                                                     </h3>
                                                     {order.orderId && <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-black text-[9px]">O.S. GERADA</Badge>}
                                                 </div>
                                                     {urgency && !isExpired && (
                                                         <Badge className={cn("border-none text-[9px] font-black px-2.5 py-1 text-white shadow-sm", urgency.color)}>
                                                             <urgency.icon className="w-3 h-3 mr-1" /> {urgency.label}
                                                         </Badge>
                                                     )}
                                                     <Badge className={cn(
                                                         "border-none font-black uppercase text-[9px] tracking-widest px-2.5 py-1",
                                                         ['assinado', 'assinado_presencial'].includes(displayStatus) ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" :
                                                         isExpired ? "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400" :
                                                         displayStatus === 'em_edicao' ? "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400" :
                                                         "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                                                      )}>
                                                           {displayStatus === 'assinado' ? 'Assinado' : displayStatus === 'assinado_presencial' ? 'Assinado Presencial' : isExpired ? 'Expirado' : displayStatus === 'em_edicao' ? 'Em Edição' : 'Pendente'}
                                                       </Badge>
                                                 
                                                 <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                                                     <MetaItem icon={ClipboardList} text={`O.S. #${order?.protocolNumber || '???'}`} />
                                                     <MetaItem icon={User} text={order.sellerName || 'N/A'} />
                                                     <MetaItem icon={Calendar} text={`Criado ${formatVisualDate(order.createdAt, 'dd/MM/yy')}`} />
                                                     {order.contractSentAt && displayStatus !== 'em_edicao' && (
                                                         <MetaItem 
                                                             icon={Send} 
                                                             text={`Enviado ${(() => {
                                                                 const d = safeParseISO(order.contractSentAt);
                                                                 return d ? formatDistanceToNow(d, { addSuffix: true, locale: ptBR }) : '---';
                                                             })()}`} 
                                                         />
                                                     )}
                                                     <WorkflowBadge stage={order.status === 'em_contrato' ? 'em_contrato' : 'em_producao'} size="sm" />
                                                 </div>
                                             </div>
                                         </div>
 
                                         <div className="flex items-center gap-2 md:gap-3 flex-wrap sm:flex-nowrap">
                                             {!['assinado', 'assinado_presencial'].includes(displayStatus) ? (
                                                <>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        onClick={() => handleViewContract(order.id)}
                                                        className="h-11 rounded-xl font-black uppercase text-[10px] tracking-widest text-brand-emerald hover:bg-brand-emerald/5"
                                                    >
                                                        <FileEdit className="w-4 h-4 mr-2" />
                                                        <span className="hidden sm:inline">Editar Contrato</span>
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        onClick={() => handleCopyLink(order)}
                                                        className="h-11 rounded-xl font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                                    >
                                                        <Copy className="w-4 h-4 mr-2" />
                                                        <span className="hidden sm:inline">Copiar Link</span>
                                                    </Button>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        onClick={() => handleOpenInPersonModal(order)}
                                                        className="h-11 rounded-xl font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                                    >
                                                        <FileCheck className="w-4 h-4 mr-2" />
                                                        <span className="hidden sm:inline">Assinatura Presencial</span>
                                                    </Button>
                                                    <Button 
                                                        size="sm" 
                                                        onClick={() => handleSendWhatsApp(order)}
                                                        className="h-11 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-500/20"
                                                    >
                                                        <WhatsAppIcon className="w-4 h-4 mr-2" />
                                                        {order.contractSentAt ? 'Reenviar' : 'Enviar WhatsApp'}
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        onClick={() => handleViewContract(order.id)}
                                                        className="h-11 rounded-xl text-slate-500 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50"
                                                    >
                                                        <FileEdit className="w-4 h-4 mr-2" />
                                                        Revisar / Editar
                                                    </Button>
                                                    {displayStatus === 'assinado_presencial' ? (
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            onClick={() => window.open(order.signedContractFileUrl, '_blank')}
                                                            className="h-11 rounded-xl text-emerald-600 font-black uppercase text-[10px] tracking-widest hover:bg-emerald-50 dark:hover:bg-emerald-500/5"
                                                        >
                                                            <Eye className="w-4 h-4 mr-2" />
                                                            Ver Anexo
                                                        </Button>
                                                    ) : (
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            onClick={() => handleViewSigned(order)}
                                                            className="h-11 rounded-xl text-emerald-600 font-black uppercase text-[10px] tracking-widest hover:bg-emerald-50 dark:hover:bg-emerald-500/5"
                                                        >
                                                            <ShieldCheck className="w-4 h-4 mr-2" />
                                                            Ver Assinatura
                                                        </Button>
                                                    )}
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        onClick={() => handleViewContract(order.id)}
                                                        className="h-11 px-6 rounded-xl border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 font-black uppercase text-[10px] tracking-widest"
                                                    >
                                                        <Download className="w-4 h-4 mr-2" />
                                                        Baixar PDF
                                                    </Button>

                                                    {['assinado', 'assinado_presencial'].includes(displayStatus) && !order.orderId && (
                                                        <Button 
                                                            size="sm" 
                                                            onClick={() => handleReleaseToProduction(order)}
                                                            className="h-11 px-8 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:scale-105 active:scale-95 transition-all"
                                                        >
                                                            <Package className="w-4 h-4 mr-2" />
                                                            Gerar O.S.
                                                        </Button>
                                                    )}
                                                    {order.orderId && (
                                                        <Button 
                                                            variant="outline"
                                                            size="sm" 
                                                            onClick={() => navigate('/producao/ordens')}
                                                            className="h-11 px-8 rounded-xl border-emerald-200 text-emerald-600 font-black uppercase text-[10px] tracking-[0.2em]"
                                                        >
                                                            <CheckCircle2 className="w-4 h-4 mr-2" />
                                                            Ver O.S.
                                                        </Button>
                                                    )}
                                                </>
                                            )}
                                            
                                            {(profile?.role === 'company_admin' || profile?.role === 'superadmin') && displayStatus !== 'em_edicao' && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={() => {
                                                        console.log('[REVOKE] botão clicado');
                                                        setOrderToRevoke(order);
                                                        setIsRevokeModalOpen(true);
                                                    }}
                                                    className="h-11 w-11 p-0 rounded-xl text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/5 transition-all"
                                                    title="Revogar Contrato"
                                                >
                                                    <ShieldAlert className="w-5 h-5" />
                                                </Button>
                                            )}
                                            
                                            {(profile?.role === 'company_admin' || profile?.role === 'superadmin') && displayStatus === 'em_edicao' && (
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={() => handleDeleteContract(order)}
                                                    className="h-11 w-11 p-0 rounded-xl text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/5 transition-all"
                                                    title="Excluir Contrato"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </Button>
                                            )}
                                            
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                                                className={cn(
                                                    "h-11 w-11 p-0 rounded-xl transition-all",
                                                    isExpanded ? "bg-slate-100 dark:bg-white/10 text-brand-emerald" : "text-slate-400"
                                                )}
                                            >
                                                <History className="w-5 h-5" />
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Timeline/History Section */}
                                    {isExpanded && (
                                        <div className="px-8 pb-8 pt-2 border-t border-slate-50 dark:border-white/5 animate-in slide-in-from-top-4 duration-300">
                                            <div className="bg-slate-50 dark:bg-white/5 rounded-[2rem] p-8">
                                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-2">
                                                    <TrendingUp className="w-3.5 h-3.5" /> Estágio Comercial & Histórico Operacional
                                                </h4>
                                                
                                                <div className="mb-10 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/5 p-2">
                                                    <WorkflowTimeline currentStage={order.status === 'em_contrato' ? 'em_contrato' : 'em_producao'} />
                                                </div>

                                                <div className="relative space-y-8 pl-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200 dark:before:bg-slate-800">
                                                    <TimelineItem 
                                                        icon={FileText} 
                                                        title="Contrato Gerado" 
                                                        active 
                                                        date={order.createdAt}
                                                        details={`Documento vinculado ao orçamento #${order?.quoteId?.substring(0, 5) || '???'}`}
                                                    />
                                                    
                                                    <TimelineItem 
                                                        icon={Send} 
                                                        title="Link de Assinatura Enviado" 
                                                        active={!!order.contractSentAt && order.contractStatus !== 'draft'} 
                                                        date={order.contractStatus !== 'draft' ? order.contractSentAt : undefined}
                                                        details="Enviado para o WhatsApp do cliente"
                                                        action={(!order.contractSentAt || order.contractStatus === 'draft') ? () => handleMarkAsSent(order) : undefined}
                                                        actionLabel="Marcar como enviado manual"
                                                    />
                                                    
                                                    <TimelineItem 
                                                        icon={Eye} 
                                                        title="Documento Visualizado" 
                                                        active={!!order.contractViewedAt && order.contractStatus !== 'draft'} 
                                                        date={order.contractStatus !== 'draft' ? order.contractViewedAt : undefined}
                                                        details={order.contractViewedAt ? "O cliente abriu o link de assinatura" : "Aguardando abertura do link"}
                                                    />
                                                    
                                                    <TimelineItem 
                                                        icon={CheckCircle2} 
                                                        title="Contrato Assinado" 
                                                        active={order.contractStatus === 'signed'} 
                                                        date={order.signedAt}
                                                        details={order.signatureMode === 'presencial' ? `Assinado presencialmente por: ${order.signedByInternalUserName || 'N/A'}` : (order.signatureData ? `Validado via IP: ${order.signatureData.ip}` : "Aguardando assinatura digital")}
                                                        primary={order.contractStatus === 'signed'}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <div className="bg-white dark:bg-slate-900 rounded-[4rem] border border-dashed border-slate-200 dark:border-white/10 p-24 flex flex-col items-center text-center">
                            <div className="w-24 h-24 bg-slate-50 dark:bg-white/5 rounded-[2.5rem] flex items-center justify-center mb-8">
                                <FileText className="w-12 h-12 text-slate-200" />
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-widest mb-3">Nenhum contrato encontrado</h3>
                            <p className="text-slate-500 text-base font-medium max-w-sm">
                                Refine seu termo de busca ou troque de aba para gerenciar outros status de contrato.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {orderToRevoke && (
                <RevokeContractModal 
                    isOpen={isRevokeModalOpen}
                    onClose={() => {
                        setIsRevokeModalOpen(false);
                        setOrderToRevoke(null);
                    }}
                    onConfirm={handleConfirmRevoke}
                    orderProtocol={orderToRevoke?.protocolNumber || '???'}
                />
            )}

            {contractForInPerson && (
                <InPersonSignatureModal 
                    isOpen={isInPersonModalOpen}
                    onClose={() => {
                        setIsInPersonModalOpen(false);
                        setContractForInPerson(null);
                    }}
                    onConfirm={handleConfirmInPersonSignature}
                    contract={contractForInPerson}
                    profile={profile}
                />
            )}
        </div>
    );
};

// --- Sub-components ---

const StatCard = ({ title, value, icon: Icon, color, description }: any) => {
    const colors: any = {
        amber: 'bg-amber-500 text-white shadow-amber-500/20',
        emerald: 'bg-emerald-500 text-white shadow-emerald-500/20',
        blue: 'bg-blue-500 text-white shadow-blue-500/20',
        purple: 'bg-purple-500 text-white shadow-purple-500/20',
    };

    return (
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group">
            <div className="flex items-center justify-between mb-4">
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform", colors[color])}>
                    <Icon className="w-7 h-7" />
                </div>
                {color === 'emerald' && <Badge className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border-none font-black">+12%</Badge>}
            </div>
            <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-1 tracking-tight">{value}</h3>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">{title}</p>
            <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-2 font-medium">{description}</p>
        </div>
    );
};

const TabButton = ({ active, onClick, label, icon: Icon, count }: any) => (
    <button
        onClick={onClick}
        className={cn(
            "px-6 py-2.5 rounded-[1.2rem] text-[10px] font-black uppercase tracking-[0.15em] transition-all flex items-center gap-2",
            active 
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xl" 
                : "text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5"
        )}
    >
        <Icon className={cn("w-4 h-4", active ? "text-brand-emerald" : "text-slate-300")} />
        {label}
        {count !== undefined && count > 0 && (
            <span className={cn(
                "ml-1 px-1.5 py-0.5 rounded-md text-[8px]",
                active ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
            )}>
                {count}
            </span>
        )}
    </button>
);

const MetaItem = ({ icon: Icon, text }: any) => (
    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-slate-300" /> {text}
    </span>
);

const TimelineItem = ({ icon: Icon, title, active, date, details, primary, action, actionLabel }: any) => (
    <div className="relative group">
        <div className={cn(
            "absolute left-0 top-[6px] w-6 h-6 rounded-full flex items-center justify-center z-10 transition-all",
            active 
                ? (primary ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-110" : "bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300")
                : "bg-slate-100 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 text-slate-300"
        )}>
            <Icon className={cn("w-3.5 h-3.5", active && !primary && "text-brand-emerald")} />
        </div>
        <div className="pl-10">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-1">
                <h5 className={cn(
                    "text-xs font-black uppercase tracking-widest",
                    active ? "text-slate-900 dark:text-white" : "text-slate-400"
                )}>
                    {title}
                </h5>
                {date && (
                    <span className="text-[10px] font-bold text-slate-400">
                        {formatVisualDate(date, "dd MMM, HH:mm")}
                    </span>
                )}
            </div>
            <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                {details}
            </p>
            {action && !active && (
                <button 
                    onClick={action}
                    className="text-[9px] font-black uppercase tracking-widest text-brand-emerald hover:underline"
                >
                    {actionLabel}
                </button>
            )}
        </div>
    </div>
);
