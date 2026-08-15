import { safeArray, safeHistoryArray } from '../../lib/dataDiagnostics';
import { formatVisualDate } from '../../lib/dateUtils';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Order, Status } from '../../types';
import { Check, Calendar, MapPin, Phone, User, FileText, Printer, Ruler, Paperclip, ImageIcon, Plus, XCircle, ShieldCheck, ShieldAlert, Clock, Activity, CheckCircle2, ArrowRight, Package, Loader2, Trash2, Pencil, X } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { FileUploadModal } from '../../components/ui/FileUploadModal';
import { CarouselViewerModal } from '../../components/ui/CarouselViewerModal';
import { FileDown, Download, Camera, FileCheck, Info, FileX } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import { generateProductionSheet } from '../../lib/pdfGenerator';
import { useSettings } from '../../hooks/useSettings';
import { cn } from '../../lib/utils';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { useAuth } from '../../context/AuthContext';
import { getOrderLockMessage, canEditOrderFields, getFieldFriendlyName } from '../../lib/orderGovernance';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { OrderLog } from '../../types';
import { RevokeContractModal } from '../contracts/RevokeContractModal';
import { toISODateSafe } from '../../lib/dateWriteUtils';
import { createOrderLog } from '../../lib/orderLogs';
import { deleteField } from 'firebase/firestore';
import { removeUndefinedDeep } from '../contracts/ContractsView';
import { getContractDisplayStatus } from '../../utils/contractUtils';
import { useStaffCatalog } from '../../hooks/useStaffCatalog';
import { SearchableSelect } from '../../components/ui/SearchableSelect';

interface OrderDetailsProps {
    order: Order;
    onUpdateOrder?: (updatedOrder: Order) => void;
    onCompleteConference?: (order: Order) => void;
    onInternalReturnClick?: (order: Order) => void;
    onScheduleMeasurement?: (order: Order) => void;
}

const CONFERENCE_ITEMS = [
    'Tamanho do Frontão e Saia conferidos (conforme O.S.)',
    'Tipo de Cuba e Acessórios conferidos',
    'Corte do Fogão/Cooktop realizado e conferido',
    'Cor do material e da massa plástica validados',
    'Limpeza da pedra realizada',
    'Etiquetas de identificação coladas em todas as peças',
    'Peças embaladas para transporte'
];

export const OrderDetails: React.FC<OrderDetailsProps> = ({ order, onUpdateOrder, onCompleteConference, onInternalReturnClick, onScheduleMeasurement }) => {
    const { settings } = useSettings();
    const { profile, user } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'info' | 'checklist' | 'attachments' | 'history'>('info');

    const { staff } = useStaffCatalog();
    const [isEditingCutter, setIsEditingCutter] = useState(false);
    const [isEditingFinisher, setIsEditingFinisher] = useState(false);
    const [isEditingInstaller, setIsEditingInstaller] = useState(false);
    const [tempCutterId, setTempCutterId] = useState('');
    const [tempFinisherId, setTempFinisherId] = useState('');
    const [tempInstallerId, setTempInstallerId] = useState('');

    const [logs, setLogs] = useState<OrderLog[]>([]);

    const handleUpdateStaffField = async (fields: Partial<Order>) => {
        try {
            const isoNow = toISODateSafe(new Date())!;
            const updatedOrder = removeUndefinedDeep({
                ...order,
                ...fields,
                updatedAt: isoNow
            });

            if (onUpdateOrder) {
                await onUpdateOrder(updatedOrder);
            } else {
                const orderRef = doc(db, 'pedidos', order.id);
                await updateDoc(orderRef, {
                    ...fields,
                    updatedAt: isoNow
                });
            }
        } catch (error) {
            console.error('Erro ao atualizar responsável:', error);
            alert('Falha ao salvar responsável.');
        }
    };

    const handleSaveCutter = async () => {
        const cutter = staff.find(s => s.id === tempCutterId);
        if (!cutter) return;
        await handleUpdateStaffField({
            cutterId: cutter.id,
            cutterName: cutter.name,
            sawyerId: cutter.id,
            sawyerName: cutter.name
        });
        setIsEditingCutter(false);
    };

    const handleSaveFinisher = async () => {
        const finisher = staff.find(s => s.id === tempFinisherId);
        if (!finisher) return;
        await handleUpdateStaffField({
            finisherId: finisher.id,
            finisherName: finisher.name
        });
        setIsEditingFinisher(false);
    };

    const handleSaveInstaller = async () => {
        const installer = staff.find(s => s.id === tempInstallerId);
        if (!installer) return;
        await handleUpdateStaffField({
            installerId: installer.id,
            installerName: installer.name
        });
        setIsEditingInstaller(false);
    };
    const [isLogsLoading, setIsLogsLoading] = useState(false);

    const lockMessage = getOrderLockMessage(order, profile as any);

    if (order) {
        console.log('[REVOKE] status exibido pela UI', order.contractStatus, order.status, order.workflowStatus);
    }

    React.useEffect(() => {
        if (activeTab === 'history') {
            setIsLogsLoading(true);
            const logsQuery = query(
                collection(db, 'order_logs'),
                where('companyId', '==', profile?.companyId),
                where('orderId', '==', order.id),
                orderBy('createdAt', 'desc')
            );
            const unsubscribe = onSnapshot(logsQuery, (snapshot) => {
                const logsData = safeArray(snapshot?.docs).map(doc => ({ id: doc.id, ...doc.data() } as OrderLog));
                setLogs(logsData);
                setIsLogsLoading(false);
            });
            return () => unsubscribe();
        }
    }, [activeTab, order.id]);

    // Contract Loading State
    const [contract, setContract] = useState<any | null>(null);
    const [loadingContract, setLoadingContract] = useState(false);

    React.useEffect(() => {
        const fetchContract = async () => {
            const contractId = order.contractId || order.id;
            if (!contractId) return;

            setLoadingContract(true);
            try {
                const contractDocRef = doc(db, 'contratos', contractId);
                const snap = await getDoc(contractDocRef);
                if (snap.exists()) {
                    setContract({ id: snap.id, ...snap.data() });
                } else {
                    const contractsQuery = query(
                        collection(db, 'contratos'),
                        where('orderId', '==', order.id)
                    );
                    const qSnap = await getDocs(contractsQuery);
                    if (!qSnap.empty) {
                        const firstDoc = qSnap.docs[0];
                        setContract({ id: firstDoc.id, ...firstDoc.data() });
                    } else {
                        setContract(null);
                    }
                }
            } catch (err) {
                console.error("Error fetching contract:", err);
            } finally {
                setLoadingContract(false);
            }
        };

        fetchContract();
    }, [order.id, order.contractId]);

    // Attachments State
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isCarouselOpen, setIsCarouselOpen] = useState(false);
    const [carouselIndex, setCarouselIndex] = useState(0);

    const attachments = order.attachments || [];

    // Checklist State
    const [checklist, setChecklist] = useState<Record<string, boolean>>(order.conferenceChecklist || {});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);

    // Technical Data State
    const [isEditingTech, setIsEditingTech] = useState(false);
    const [frontaoSize, setFrontaoSize] = useState(order.frontaoSize || '');
    const [saiaSize, setSaiaSize] = useState(order.saiaSize || '');
    const [frontaoFinish, setFrontaoFinish] = useState(order.frontaoFinish || '');
    const [saiaFinish, setSaiaFinish] = useState(order.saiaFinish || '');
    const [sinkProvidedByClient, setSinkProvidedByClient] = useState<boolean>(order.sinkProvidedByClient ?? false);
    const [productionNotes, setProductionNotes] = useState(order.productionNotes || '');
    const [deliveryDate, setDeliveryDate] = useState(order.deliveryDate || '');

    // Project Attachments Upload state
    const [isUploadingProjectFile, setIsUploadingProjectFile] = useState(false);

    React.useEffect(() => {
        setFrontaoSize(order.frontaoSize || '');
        setSaiaSize(order.saiaSize || '');
        setFrontaoFinish(order.frontaoFinish || '');
        setSaiaFinish(order.saiaFinish || '');
        setSinkProvidedByClient(order.sinkProvidedByClient ?? false);
        setProductionNotes(order.productionNotes || '');
        setDeliveryDate(order.deliveryDate || '');
    }, [order]);

    const handleSaveTechDocs = async () => {
        try {
            setIsSubmitting(true);
            const isoNow = toISODateSafe(new Date())!;
            const updatedOrder = removeUndefinedDeep({
                ...order,
                frontaoSize,
                saiaSize,
                frontaoFinish,
                saiaFinish,
                sinkProvidedByClient,
                productionNotes,
                deliveryDate,
                updatedAt: isoNow
            });

            if (onUpdateOrder) {
                await onUpdateOrder(updatedOrder);
            } else {
                const orderRef = doc(db, 'contratos', order.id);
                await updateDoc(orderRef, {
                    frontaoSize,
                    saiaSize,
                    frontaoFinish,
                    saiaFinish,
                    sinkProvidedByClient,
                    productionNotes,
                    deliveryDate,
                    updatedAt: isoNow
                });
            }
            setIsEditingTech(false);
            alert('Dados técnicos salvos com sucesso!');
        } catch (error) {
            console.error('[SAVE_TECH_ERROR]', error);
            alert('Falha ao salvar dados técnicos.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleProjectFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        
        setIsUploadingProjectFile(true);
        try {
            const companyId = profile?.companyId || 'unassigned';
            const folder = file.type.includes('pdf') ? 'documents' : 'photos';
            const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
            const storagePath = `companies/${companyId}/orders/attachments/${folder}/${fileName}`;
            const storageRef = ref(storage, storagePath);
            
            if (!import.meta.env.PROD) {
                console.log(`Uploading project file: ${file.name} to ${storagePath}...`);
            }
            const uploadTask = uploadBytesResumable(storageRef, file);
            await uploadTask;
            const downloadUrl = await getDownloadURL(storageRef);
            
            const isoNow = toISODateSafe(new Date())!;
            const newFileMeta = {
                name: file.name,
                url: downloadUrl,
                type: file.type.includes('pdf') ? 'pdf' : 'image',
                uploadedAt: isoNow,
                uploadedBy: profile?.name || 'Sistema'
            };

            const existingFiles = safeArray(order.projectFiles || []);
            const updatedFiles = [...existingFiles, newFileMeta];

            const updatedOrder = removeUndefinedDeep({
                ...order,
                projectFiles: updatedFiles,
                updatedAt: isoNow
            });

            if (onUpdateOrder) {
                await onUpdateOrder(updatedOrder);
            } else {
                const orderRef = doc(db, 'contratos', order.id);
                await updateDoc(orderRef, {
                    projectFiles: updatedFiles,
                    updatedAt: isoNow
                });
            }
            alert('Projeto anexado com sucesso!');
        } catch (error) {
            console.error('[UPLOAD_PROJECT_FILE_ERROR]', error);
            alert('Falha ao anexar arquivo de projeto.');
        } finally {
            setIsUploadingProjectFile(false);
            if (e.target) e.target.value = ''; // Reset input
        }
    };

    const handleDeleteProjectFile = async (fileUrl: string) => {
        if (!window.confirm('Tem certeza que deseja remover este anexo?')) return;
        
        try {
            const existingFiles = safeArray(order.projectFiles || []);
            const updatedFiles = existingFiles.filter(f => f.url !== fileUrl);
            const isoNow = toISODateSafe(new Date())!;

            const updatedOrder = removeUndefinedDeep({
                ...order,
                projectFiles: updatedFiles,
                updatedAt: isoNow
            });

            if (onUpdateOrder) {
                await onUpdateOrder(updatedOrder);
            } else {
                const orderRef = doc(db, 'contratos', order.id);
                await updateDoc(orderRef, {
                    projectFiles: updatedFiles,
                    updatedAt: isoNow
                });
            }
            alert('Anexo removido!');
        } catch (error) {
            console.error('[DELETE_PROJECT_FILE_ERROR]', error);
            alert('Falha ao remover anexo.');
        }
    };

    const handlePrintContract = () => {
        window.open(`/order/${order.id}/contract`, '_blank');
    };


    const handleWhatsApp = () => {
        const phone = String(order?.phone || '').replace(/\D/g, '');
        window.open(`https://wa.me/55${phone}`, '_blank');
    };

    const handleCheckToggle = (item: string) => {
        if (!canEditOrderFields(order, profile as any)) {
            alert("Este pedido está bloqueado por governança. Não é possível alterar o checklist.");
            return;
        }
        const newChecklist = { ...checklist, [item]: !checklist[item] };
        setChecklist(newChecklist);
        if (onUpdateOrder) {
            onUpdateOrder({ ...order, conferenceChecklist: newChecklist });
        }
    };

    const handleItemCheckToggle = async (itemId: string, checkType: 'corte' | 'acabamento' | 'conferencia' | 'instalado') => {
        if (!canEditOrderFields(order, profile as any)) {
            alert("Este pedido está bloqueado por governança.");
            return;
        }

        const updatedItems = safeArray(order.items).map(item => {
            if (item.id === itemId) {
                const currentChecklist = item.checklist || { corte: false, acabamento: false, conferencia: false, instalado: false };
                const newChecklist = { ...currentChecklist, [checkType]: !currentChecklist[checkType] };
                
                // Status Automático
                let newStatus: 'pendente' | 'em_producao' | 'finalizado' | 'instalado' = 'pendente';
                if (newChecklist.instalado) newStatus = 'instalado';
                else if (newChecklist.conferencia) newStatus = 'finalizado';
                else if (newChecklist.corte || newChecklist.acabamento) newStatus = 'em_producao';

                return { ...item, checklist: newChecklist, productionStatus: newStatus };
            }
            return item;
        });

        // Status geral da O.S.
        const allItemsInstalled = updatedItems.length > 0 && updatedItems.every(item => item.productionStatus === 'instalado');
        const anyItemInProduction = safeArray(updatedItems).some(item => ['em_producao', 'finalizado'].includes(item.productionStatus || ''));
        
        let newOrderStatus = order.status;
        if (allItemsInstalled) newOrderStatus = 'finalizado';
        else if (anyItemInProduction && order.status !== 'em_producao') {
             // Só muda para em_producao se não estiver finalizado ou cancelado por outros motivos
             if (!['finalizado', 'cancelado'].includes(order.status)) {
                newOrderStatus = 'em_producao';
             }
        }

        const isoNow = toISODateSafe(new Date())!;
        const updatedOrder = removeUndefinedDeep({
            ...order,
            items: updatedItems,
            status: newOrderStatus,
            updatedAt: isoNow,
            history: [
                ...safeHistoryArray(order.history),
                {
                    date: isoNow,
                    action: `Checklist Item (${checkType}): ${updatedItems.find(i => i.id === itemId)?.name}`,
                    user: profile?.name || 'Sistema',
                    severity: 'info'
                }
            ]
        });

        if (onUpdateOrder) {
            await onUpdateOrder(updatedOrder);
        }
    };

    // handleTransitionToProduction removed: OS generation is now handled strictly in ContractsView.tsx 
    // after the contract is signed in the dedicated 'contratos' collection.

    const isChecklistComplete = CONFERENCE_ITEMS.every(item => checklist[item] === true);

    const handleCompleteClick = () => {
        if (!isChecklistComplete) {
            window.alert('⚠️ Atenção: Todos os itens do checklist devem ser conferidos antes do envio.');
            return;
        }
        setIsSubmitting(true);
        setTimeout(() => {
            if (onCompleteConference) {
                onCompleteConference(order);
            }
            setIsSubmitting(false);
        }, 800);
    };


    const handleTransitionToProduction = async () => {
        if (!onUpdateOrder || isSubmitting) return;

        if (!window.confirm("Deseja iniciar a produção para esta Ordem de Serviço?")) return;

        setIsSubmitting(true);
        try {
            const iso = toISODateSafe(new Date())!;
            const updatedOrder: Order = removeUndefinedDeep({
                ...order,
                status: 'aguardando_materia_prima',
                productionStatus: 'aguardando_materia_prima',
                updatedAt: iso,
                history: [
                    ...safeHistoryArray(order.history),
                    {
                        date: iso,
                        action: 'Produção Iniciada Manualmente via Detalhes da O.S.',
                        user: profile?.name || 'Sistema',
                        severity: 'success'
                    }
                ]
            });

            if (!import.meta.env.PROD) {
                console.log('[AUDIT_PRODUCTION] OrderDetails: Payload de Atualização Manual:', updatedOrder);
            }
            await onUpdateOrder(updatedOrder);

            // Audit Log
            await createOrderLog({
                orderId: order.id,
                companyId: profile?.companyId || '',
                userId: profile?.id || '',
                userName: profile?.name || '',
                action: 'status_change',
                reason: 'Início de produção manual (Bypass de conformidade)'
            });

            alert("Produção iniciada com sucesso!");
        } catch (error) {
            console.error("Erro ao iniciar produção:", error);
            alert("Erro ao processar solicitação.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmRevoke = async (reason: string) => {
        if (!onUpdateOrder) return;

        console.log('[REVOKE] confirmação aceita');
        const isoNow = toISODateSafe(new Date())!;
        const userName = profile?.name || 'Sistema';

        const updatedOrder: any = {
            ...order,
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
            version: (order.version || 1) + 1,
            history: [
                ...safeHistoryArray(order.history),
                {
                    date: isoNow,
                    action: `CONTRATO REVOGADO (v${order.version || 1}): ${reason}`,
                    user: userName,
                    severity: 'critical'
                }
            ]
        };

        try {
            console.log('[REVOKE] updateDoc iniciado');
            // Update order in 'pedidos'
            await onUpdateOrder(updatedOrder as Order);

            // Update contract in 'contratos' if linked contractId exists
            const contractId = order.contractId || order.id;
            if (contractId) {
                const contractRef = doc(db, 'contratos', contractId);
                const contractSnap = await getDoc(contractRef);
                if (contractSnap.exists()) {
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
                        version: (contractSnap.data().version || 1) + 1,
                        history: [
                            ...safeHistoryArray(contractSnap.data().history),
                            {
                                date: isoNow,
                                action: `CONTRATO REVOGADO (v${contractSnap.data().version || 1}): ${reason}`,
                                user: userName,
                                severity: 'critical'
                            }
                        ]
                    });
                }
            }
            console.log('[REVOKE] updateDoc concluído');
            console.log('[REVOKE] dados após update', {
                id: order.id,
                contractStatus: 'draft',
                contractLinkActive: false,
                status: 'em_contrato',
                workflowStatus: 'em_contrato'
            });
        } catch (error) {
            console.error('[REVOKE] Erro ao executar updateDoc:', error);
            throw error;
        }

        // Audit Log
        await createOrderLog({
            orderId: order.id,
            companyId: profile?.companyId || '',
            userId: profile?.id || '',
            userName: userName,
            action: 'contract_revoked',
            fieldChanged: 'contractStatus',
            oldValue: order.contractStatus ?? null,
            newValue: 'revoked',
            reason: reason,
            source: 'RevokeContractModal'
        });
    };

    const handleDeleteContractClick = async () => {
        const confirmMsg = "Tem certeza que deseja excluir este contrato da central? Esta ação não remove a O.S.";
        if (!window.confirm(confirmMsg)) return;

        const isoNow = toISODateSafe(new Date())!;
        const userName = profile?.name || 'Sistema';
        const contractId = order.contractId || order.id;

        try {
            // 1. Soft delete the contract in 'contratos'
            if (contractId) {
                console.log('[DELETE] updating contract');
                const contractRef = doc(db, 'contratos', contractId);
                const currentHistory = safeHistoryArray(contract?.history);
                await updateDoc(contractRef, {
                    contractStatus: 'deleted',
                    hiddenFromContracts: true,
                    publicLinkActive: false,
                    linkActive: false,
                    contractLinkActive: false,
                    deletedAt: isoNow,
                    deletedBy: userName,
                    history: [
                        ...currentHistory,
                        {
                            date: isoNow,
                            action: "Contrato removido da Central de Contratos.",
                            user: userName,
                            severity: 'critical'
                        }
                    ]
                });
            }

            // 2. Inactivate the public signature link if it exists
            const tokenToDisable = contract?.signatureToken || order.signatureToken;
            if (tokenToDisable) {
                console.log('[DELETE] disabling public link', tokenToDisable);
                const gatewayRef = doc(db, 'public_contract_links', tokenToDisable);
                await updateDoc(gatewayRef, {
                    active: false
                }).catch(err => console.error("Error disabling public contract link:", err));
            }

            // 3. Update active order (O.S.) in 'pedidos'
            console.log('[DELETE] updating order');
            const orderRef = doc(db, 'pedidos', order.id);
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
                    ...safeHistoryArray(order.history),
                    {
                        date: isoNow,
                        action: "Vínculo do contrato removido da O.S. devido a exclusão.",
                        user: userName,
                        severity: 'info'
                    }
                ]
            });

            // 4. Update linked quote in 'orcamentos' if quoteId exists
            if (order.quoteId) {
                console.log('[DELETE] updating quote');
                const quoteRef = doc(db, 'orcamentos', order.quoteId);
                await updateDoc(quoteRef, {
                    convertedToContractId: deleteField(),
                    contractGenerationAvailable: true,
                    updatedAt: isoNow
                }).catch(err => console.error("Error updating quote on contract delete:", err));
            }

            // 5. Update linked measurement in 'medicoes' if measurementId exists
            if (order.measurementId) {
                const measurementRef = doc(db, 'medicoes', order.measurementId);
                await updateDoc(measurementRef, {
                    status: 'completed',
                    updatedAt: isoNow
                }).catch(err => console.error("Error updating measurement status:", err));
            }

            // 6. Register history log
            await createOrderLog({
                orderId: order.id,
                companyId: profile?.companyId || '',
                userId: profile?.id || '',
                userName: userName,
                action: 'contract_deleted',
                fieldChanged: 'contractStatus',
                oldValue: order.contractStatus ?? null,
                newValue: 'deleted',
                reason: 'Contrato removido da Central de Contratos.',
                source: 'OrderDetails/Delete'
            });

            // Local state cleanup
            setContract(null);

        } catch (error) {
            console.error('[DELETE_CONTRACT] Erro ao excluir contrato:', error);
            alert('Erro ao excluir contrato. Tente novamente.');
        }
    };

    const getStatusBadge = (status: Status) => {
        switch (status) {
            case 'aguardando_materia_prima': return <Badge variant="secondary" className="bg-slate-100 text-slate-800 border-none px-3 font-black uppercase text-[10px]">M-Prima</Badge>;
            case 'em_producao': return <Badge variant="secondary" className="bg-violet-100 text-brand-rocha-primary border-none px-3 font-black uppercase text-[10px]">Produção</Badge>;
            case 'em_instalacao': return <Badge variant="secondary" className="bg-indigo-100 text-indigo-800 border-none px-3 font-black uppercase text-[10px]">Instalação</Badge>;
            case 'finalizado': return <Badge variant="secondary" className="bg-slate-900 text-white border-none px-3 font-black uppercase text-[10px]">Finalizado</Badge>;
            case 'cancelado': return <Badge variant="secondary" className="bg-rose-100 text-rose-800 border-none px-3 font-black uppercase text-[10px]">Cancelado</Badge>;
            case 'pausado': return <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-none px-3 font-black uppercase text-[10px]">Pausado</Badge>;
            default: return <Badge variant="outline" className="font-black uppercase text-[10px]">{status}</Badge>;
        }
    };

    const getContractBadge = () => {
        const displayStatus = getContractDisplayStatus(order);
        if (displayStatus === 'assinado') {
            return <Badge className="bg-emerald-500 text-white border-none font-black uppercase text-[9px] tracking-widest px-3 h-6 rounded-full flex items-center gap-1.5 shadow-lg shadow-emerald-500/20">
                <FileCheck className="w-3 h-3" /> Assinado Digitalmente
            </Badge>;
        }
        if (displayStatus === 'assinado_presencial') {
            return <Badge className="bg-emerald-500 text-white border-none font-black uppercase text-[9px] tracking-widest px-3 h-6 rounded-full flex items-center gap-1.5 shadow-lg shadow-emerald-500/20">
                <FileCheck className="w-3 h-3" /> Assinado Presencialmente
            </Badge>;
        }
        if (displayStatus === 'pendente') {
            return <Badge className="bg-amber-500 text-white border-none font-black uppercase text-[9px] tracking-widest px-3 h-6 rounded-full flex items-center gap-1.5 shadow-lg shadow-amber-500/20 animate-pulse">
                <Clock className="w-3 h-3" /> Pendente de Assinatura
            </Badge>;
        }
        if (displayStatus === 'em_edicao') {
            return <Badge className="bg-slate-500 text-white border-none font-black uppercase text-[9px] tracking-widest px-3 h-6 rounded-full flex items-center gap-1.5 shadow-lg shadow-slate-500/20">
                <FileText className="w-3 h-3" /> Em Edição
            </Badge>;
        }
        return null;
    };

    const serradores = React.useMemo(() => safeArray(staff).filter(s => s.role === 'serrador' && (s.active === undefined || s.active === true)), [staff]);
    const acabadores = React.useMemo(() => safeArray(staff).filter(s => s.role === 'acabador' && (s.active === undefined || s.active === true)), [staff]);
    const instaladores = React.useMemo(() => safeArray(staff).filter(s => s.role === 'instalador' && (s.active === undefined || s.active === true)), [staff]);

    return (
        <div className="flex flex-col h-full bg-white overflow-hidden">
            {lockMessage && (
                <div className={cn(
                    "px-6 py-2 flex items-center justify-between border-b transition-colors overflow-hidden shrink-0",
                    (order.status === 'finalizado' || order.status === 'cancelado') 
                        ? "bg-slate-900 border-slate-800 text-slate-400" 
                        : "bg-amber-50 border-amber-100 text-amber-700"
                )}>
                    <div className="flex items-center gap-3">
                        <ShieldCheck className="h-4 w-4 shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-widest">{lockMessage}</span>
                    </div>
                    {['pendente', 'assinado', 'assinado_presencial'].includes(getContractDisplayStatus(order)) && (profile?.role === 'company_admin' || profile?.role === 'superadmin') && (
                         <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-6 px-3 bg-amber-100 hover:bg-amber-200 text-amber-900 font-black uppercase text-[9px] tracking-widest rounded-full flex items-center gap-1.5 transition-all active:scale-95"
                            onClick={() => { console.log('[REVOKE] botão clicado'); setIsRevokeModalOpen(true); }}
                        >
                            <ShieldAlert className="w-3 h-3" /> Revogar e Editar
                        </Button>
                    )}
                </div>
            )}
            <div className="px-6 py-5 border-b shrink-0">
                <div className="flex justify-between items-start">
                    <div className="flex-1">
                        <div className="flex items-center gap-4 mb-1">
                            <h2 className="text-2xl font-black tracking-tighter text-slate-900 uppercase leading-none">
                                {String(order?.customerName || 'Cliente sem Nome')}
                            </h2>
                            {getStatusBadge(order?.status || 'pendente' as Status)}
                            {getContractBadge()}
                            {getContractDisplayStatus(order) === 'em_edicao' && order.contractId && (profile?.role === 'company_admin' || profile?.role === 'superadmin') && (
                                 <Button 
                                    variant="ghost" 
                                    size="sm"
                                    className="h-6 px-3 bg-rose-100 hover:bg-rose-200 text-rose-700 hover:text-rose-800 font-black uppercase text-[9px] tracking-widest rounded-full flex items-center gap-1.5 transition-all active:scale-95 shadow-sm ml-2"
                                    onClick={handleDeleteContractClick}
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> Excluir Contrato
                                </Button>
                            )}
                            {order?.totalAmount !== undefined && (
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] border-l-2 border-slate-100 pl-4 h-4 flex items-center leading-none">
                                    R$ {Number(order.totalAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            )}
                        </div>
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-2 flex items-center gap-2">
                            <span>O.S. #{String(order?.protocolNumber || '------')}</span>
                            <span className="opacity-30">•</span>
                            <span>{String(order?.material || 'Material não definido')}</span>
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="p-6">
                    <div className="flex border-b shrink-0 mb-6 sticky top-0 bg-white/80 backdrop-blur-md z-10 -mx-6 px-6">
                        <button
                            onClick={() => setActiveTab('info')}
                            className={cn(
                                "px-4 py-3 text-[11px] font-black transition-all border-b-2 uppercase tracking-widest",
                                activeTab === 'info' ? "border-brand-rocha-primary text-brand-rocha-primary" : "border-transparent text-slate-400 hover:text-slate-900"
                            )}
                        >
                            Informações
                        </button>
                        <button
                            onClick={() => setActiveTab('checklist')}
                            className={cn(
                                "px-4 py-3 text-[11px] font-black transition-all border-b-2 uppercase tracking-widest",
                                activeTab === 'checklist' ? "border-brand-rocha-primary text-brand-rocha-primary" : "border-transparent text-slate-400 hover:text-slate-900"
                            )}
                        >
                            Checklist ({safeArray(CONFERENCE_ITEMS).filter(i => (checklist || {})[i]).length}/{safeArray(CONFERENCE_ITEMS).length})
                        </button>
                        <button
                            onClick={() => setActiveTab('attachments')}
                            className={cn(
                                "px-4 py-3 text-[11px] font-black transition-all border-b-2 uppercase tracking-widest",
                                activeTab === 'attachments' ? "border-brand-rocha-primary text-brand-rocha-primary" : "border-transparent text-slate-400 hover:text-slate-900"
                            )}
                        >
                            Projeto e Medições ({attachments.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={cn(
                                "px-4 py-3 text-[11px] font-black transition-all border-b-2 uppercase tracking-widest",
                                activeTab === 'history' ? "border-brand-rocha-primary text-brand-rocha-primary" : "border-transparent text-slate-400 hover:text-slate-900"
                            )}
                        >
                            Histórico
                        </button>
                    </div>

                    {activeTab === 'info' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                             {order?.status === 'em_contrato' && ['assinado', 'assinado_presencial'].includes(getContractDisplayStatus(order)) && (
                                <div className="bg-slate-900 dark:bg-emerald-950 text-white p-8 rounded-[2.5rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 mb-2 animate-in fade-in zoom-in duration-500 border border-emerald-500/30">
                                    <div className="flex items-center gap-6 text-center md:text-left">
                                        <div className="w-16 h-16 rounded-3xl bg-brand-emerald flex items-center justify-center shadow-lg">
                                            <CheckCircle2 className="w-8 h-8 text-white" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black uppercase tracking-tight">Contrato Validado!</h3>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">O cliente assinou digitalmente. Liberar agora para a produção?</p>
                                        </div>
                                    </div>
                                    <Button 
                                        onClick={handleTransitionToProduction}
                                        disabled={isSubmitting}
                                        className="bg-white text-emerald-900 hover:bg-emerald-50 font-black uppercase tracking-[0.2em] h-16 px-12 rounded-2xl shadow-xl flex items-center gap-3 transition-all active:scale-95 whitespace-nowrap"
                                    >
                                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Gerar Ordem de Serviço'}
                                        <ArrowRight className="w-5 h-5" />
                                    </Button>
                                </div>
                            )}
                            {order.pendingMeasurementCheck && (
                                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-wrap justify-between items-center gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                                            <Ruler className="h-6 w-6 text-amber-600" />
                                        </div>
                                        <div>
                                            <p className="font-black text-amber-900 uppercase text-[10px] tracking-widest leading-none mb-1">Atenção: Conferência Exigida</p>
                                            <p className="text-xs font-bold text-amber-700">É necessário realizar a medição técnica em obra antes da produção.</p>
                                        </div>
                                    </div>
                                    <Button 
                                        className="bg-amber-600 hover:bg-amber-700 text-white font-black uppercase text-[10px] tracking-widest px-6 h-10 rounded-xl"
                                        onClick={() => onScheduleMeasurement?.(order)}
                                    >
                                        <Calendar className="w-4 h-4 mr-2" /> Agendar Agora
                                    </Button>
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Coluna Esquerda: Dados do Cliente, Dados Técnicos e Anexos do Projeto */}
                                <div className="space-y-6">
                                    {/* Bloco 1: Dados do Cliente */}
                                    <section className="space-y-4">
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                            <User className="w-3.5 h-3.5" /> Dados do Cliente
                                        </h3>

                                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4 shadow-sm">
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Nome do Cliente</p>
                                                <p className="text-base font-black text-slate-900 tracking-tight">{order.customerName || 'A definir'}</p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">O.S.</p>
                                                    <p className="text-sm font-black text-slate-800">#{order.protocolNumber || 'A definir'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Material Principal</p>
                                                    <p className="text-sm font-black text-slate-800">{order.material || 'A definir'}</p>
                                                </div>
                                            </div>

                                            <div className="flex items-start justify-between border-t border-slate-200/50 pt-3">
                                                <div className="flex items-start gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                                                        <Phone className="w-5 h-5 text-slate-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">WhatsApp / Celular</p>
                                                        <p className="text-sm font-black text-slate-900 tracking-tight">{order.phone || 'A definir'}</p>
                                                    </div>
                                                </div>
                                                {order.phone && (
                                                    <Button 
                                                        onClick={handleWhatsApp} 
                                                        className="h-10 w-10 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-500/20 p-0 flex items-center justify-center"
                                                    >
                                                        <WhatsAppIcon className="h-5 w-5" />
                                                    </Button>
                                                )}
                                            </div>

                                            <div className="flex items-start gap-4 border-t border-slate-200/50 pt-3">
                                                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                                                    <MapPin className="w-5 h-5 text-slate-400" />
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Endereço da Obra</p>
                                                    <p className="text-sm font-black text-slate-900 tracking-tight leading-snug">{order.address || 'A definir'}</p>
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-2 border-t border-slate-200/50 pt-3">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Contrato:</p>
                                                    {loadingContract ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                                                    ) : !contract ? (
                                                        <span className="text-[10px] font-bold text-slate-500">Contrato indisponível</span>
                                                    ) : (
                                                        (() => {
                                                            const displayStatus = getContractDisplayStatus(contract);
                                                            if (displayStatus === 'assinado') {
                                                                return (
                                                                    <Badge className="bg-emerald-100 text-emerald-800 border-none font-black uppercase text-[8px] tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                        <FileCheck className="w-2.5 h-2.5" /> Assinado Digitalmente
                                                                    </Badge>
                                                                );
                                                            }
                                                            if (displayStatus === 'assinado_presencial') {
                                                                return (
                                                                    <Badge className="bg-emerald-100 text-emerald-800 border-none font-black uppercase text-[8px] tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                        <FileCheck className="w-2.5 h-2.5" /> Assinado Presencialmente
                                                                    </Badge>
                                                                );
                                                            }
                                                            if (displayStatus === 'em_edicao') {
                                                                return (
                                                                    <Badge className="bg-slate-100 text-slate-800 border-none font-black uppercase text-[8px] tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                        <FileText className="w-2.5 h-2.5" /> Em Edição
                                                                    </Badge>
                                                                );
                                                            }
                                                            return (
                                                                <Badge className="bg-amber-100 text-amber-800 border-none font-black uppercase text-[8px] tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1">
                                                                    <Clock className="w-2.5 h-2.5" /> Pendente de Assinatura
                                                                </Badge>
                                                            );
                                                        })()
                                                    )}
                                                </div>

                                                {contract && (
                                                    <div className="space-y-2 mt-1 pl-1">
                                                        {['assinado', 'assinado_presencial'].includes(getContractDisplayStatus(contract)) && (
                                                            <div className="text-[11px] text-slate-500 space-y-1">
                                                                {contract.signatureMode === 'presencial' ? (
                                                                    <>
                                                                        <p className="font-semibold">Assinatura Presencial: <span className="font-bold text-slate-800">{formatVisualDate(contract.signedAt || contract.createdAt)}</span></p>
                                                                        <p className="font-semibold">Responsável: <span className="font-bold text-slate-800">{contract.signedByInternalUserName || 'Não informado'}</span></p>
                                                                    </>
                                                                ) : (
                                                                    <p className="font-semibold">Assinatura Digital: <span className="font-bold text-slate-800">{formatVisualDate(contract.signedAt || contract.createdAt)}</span></p>
                                                                )}
                                                            </div>
                                                        )}

                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-8 px-3 text-[9px] font-black uppercase tracking-widest rounded-xl border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-1.5 shadow-sm text-slate-700"
                                                            onClick={() => {
                                                                if (contract.signatureMode === 'presencial') {
                                                                    if (contract.signedContractFileUrl) {
                                                                        window.open(contract.signedContractFileUrl, '_blank');
                                                                    } else {
                                                                        alert('Link do contrato assinado não encontrado.');
                                                                    }
                                                                } else {
                                                                    const viewUrl = contract.signatureToken 
                                                                        ? `/sign/${contract.signatureToken}` 
                                                                        : `/order/${order.id}/contract`;
                                                                    window.open(viewUrl, '_blank');
                                                                }
                                                            }}
                                                        >
                                                            <FileText className="w-3.5 h-3.5" /> Ver Contrato
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </section>

                                    {/* Bloco 2: Dados Técnicos da Produção */}
                                    <section className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                                <Ruler className="w-3.5 h-3.5" /> Dados Técnicos da Produção
                                            </h3>
                                            {!isEditingTech ? (
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="text-[9px] font-black uppercase text-brand-rocha-primary tracking-widest"
                                                    onClick={() => setIsEditingTech(true)}
                                                >
                                                    Editar
                                                </Button>
                                            ) : (
                                                <div className="flex gap-2">
                                                    <Button 
                                                        variant="ghost" 
                                                        size="sm" 
                                                        className="text-[9px] font-black uppercase text-slate-400 tracking-widest"
                                                        onClick={() => {
                                                            setFrontaoSize(order.frontaoSize || '');
                                                            setSaiaSize(order.saiaSize || '');
                                                            setFrontaoFinish(order.frontaoFinish || '');
                                                            setSaiaFinish(order.saiaFinish || '');
                                                            setSinkProvidedByClient(order.sinkProvidedByClient ?? false);
                                                            setProductionNotes(order.productionNotes || '');
                                                            setDeliveryDate(order.deliveryDate || '');
                                                            setIsEditingTech(false);
                                                        }}
                                                    >
                                                        Cancelar
                                                    </Button>
                                                    <Button 
                                                        size="sm" 
                                                        className="bg-brand-rocha-primary hover:bg-violet-700 text-white text-[9px] font-black uppercase tracking-widest px-3 h-7 rounded-lg"
                                                        onClick={handleSaveTechDocs}
                                                        disabled={isSubmitting}
                                                    >
                                                        Salvar
                                                    </Button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4 shadow-sm">
                                            {!isEditingTech ? (
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Tamanho do Frontão</p>
                                                        <p className="text-sm font-black text-slate-900">{frontaoSize || 'A definir'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Tamanho da Saia / Acabamento</p>
                                                        <p className="text-sm font-black text-slate-900">{saiaSize || 'A definir'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Acabamento do Frontão</p>
                                                        <p className="text-sm font-black text-slate-900">{frontaoFinish || 'A definir'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Saia / Acabamento</p>
                                                        <p className="text-sm font-black text-slate-900">{saiaFinish || 'A definir'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Cuba do Cliente?</p>
                                                        <p className="text-sm font-black text-slate-900">{sinkProvidedByClient ? 'Sim' : 'Não'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Data Prevista de Entrega</p>
                                                        <p className="text-sm font-black text-slate-900">
                                                            {deliveryDate ? formatVisualDate(deliveryDate, 'dd/MM/yyyy') : 'A definir'}
                                                        </p>
                                                    </div>
                                                    <div className="col-span-2 border-t border-slate-200/50 pt-3">
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Observações da Produção</p>
                                                        <p className="text-xs font-bold text-slate-600 leading-relaxed whitespace-pre-wrap">
                                                            {productionNotes || 'Nenhuma observação técnica registrada.'}
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Tamanho do Frontão</label>
                                                        <input 
                                                            type="text" 
                                                            value={frontaoSize}
                                                            onChange={(e) => setFrontaoSize(e.target.value)}
                                                            className="w-full text-xs font-bold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-rocha-primary"
                                                            placeholder="Ex: 10 cm"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Tamanho da Saia</label>
                                                        <input 
                                                            type="text" 
                                                            value={saiaSize}
                                                            onChange={(e) => setSaiaSize(e.target.value)}
                                                            className="w-full text-xs font-bold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-rocha-primary"
                                                            placeholder="Ex: 4 cm"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Acabamento Frontão</label>
                                                        <input 
                                                            type="text" 
                                                            value={frontaoFinish}
                                                            onChange={(e) => setFrontaoFinish(e.target.value)}
                                                            className="w-full text-xs font-bold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-rocha-primary"
                                                            placeholder="Ex: Reto Simples"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Saia / Acabamento</label>
                                                        <input 
                                                            type="text" 
                                                            value={saiaFinish}
                                                            onChange={(e) => setSaiaFinish(e.target.value)}
                                                            className="w-full text-xs font-bold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-rocha-primary"
                                                            placeholder="Ex: Meia Esquadria"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Cuba do Cliente?</label>
                                                        <select 
                                                            value={sinkProvidedByClient ? "sim" : "nao"}
                                                            onChange={(e) => setSinkProvidedByClient(e.target.value === "sim")}
                                                            className="w-full text-xs font-bold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-rocha-primary"
                                                        >
                                                            <option value="nao">Não</option>
                                                            <option value="sim">Sim</option>
                                                        </select>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Previsão Entrega</label>
                                                        <input 
                                                            type="date" 
                                                            value={deliveryDate}
                                                            onChange={(e) => setDeliveryDate(e.target.value)}
                                                            className="w-full text-xs font-bold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-rocha-primary"
                                                        />
                                                    </div>
                                                    <div className="col-span-2 space-y-1.5">
                                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Observações da Produção</label>
                                                        <textarea 
                                                            value={productionNotes}
                                                            onChange={(e) => setProductionNotes(e.target.value)}
                                                            rows={3}
                                                            className="w-full text-xs font-bold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-rocha-primary resize-none"
                                                            placeholder="Instruções técnicas para serragem/acabamento..."
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    {/* Bloco 3: Projeto / Anexos */}
                                    <section className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                                <Paperclip className="w-3.5 h-3.5" /> Projeto / Anexos
                                            </h3>
                                            <div className="relative">
                                                <input 
                                                    type="file" 
                                                    id="project-file-upload-input" 
                                                    onChange={handleProjectFileUpload}
                                                    accept="image/*,application/pdf"
                                                    className="hidden"
                                                    disabled={isUploadingProjectFile}
                                                />
                                                <Button 
                                                    size="sm"
                                                    disabled={isUploadingProjectFile}
                                                    className="bg-slate-900 hover:bg-black text-white text-[9px] font-black uppercase tracking-widest px-3 h-7 rounded-lg flex items-center gap-1.5"
                                                    onClick={() => document.getElementById('project-file-upload-input')?.click()}
                                                >
                                                    {isUploadingProjectFile ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                        <Plus className="w-3 h-3" />
                                                    )}
                                                    Anexar Projeto
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4 shadow-sm">
                                            {/* Preview de imagens do projeto se já existirem */}
                                            {(() => {
                                                const images = safeArray(order.projectFiles || []).filter(f => f.type === 'image');
                                                if (images.length === 0) return null;
                                                return (
                                                    <div className="space-y-2">
                                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Preview do Projeto</p>
                                                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                                                            {images.map((img, i) => (
                                                                <div 
                                                                    key={i} 
                                                                    className="relative w-24 h-24 rounded-lg overflow-hidden border border-slate-200 shrink-0 cursor-pointer hover:opacity-90 shadow-sm"
                                                                    onClick={() => window.open(img.url, '_blank')}
                                                                >
                                                                    <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* Lista de anexos enviados */}
                                            {safeArray(order.projectFiles || []).length > 0 ? (
                                                <div className="divide-y divide-slate-200/50">
                                                    {safeArray(order.projectFiles || []).map((file, i) => (
                                                        <div key={i} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                                                            <div 
                                                                className="flex items-center gap-2.5 cursor-pointer hover:text-brand-rocha-primary min-w-0 flex-1"
                                                                onClick={() => window.open(file.url, '_blank')}
                                                            >
                                                                {file.type === 'pdf' ? (
                                                                    <FileText className="w-4 h-4 text-rose-500 shrink-0" />
                                                                ) : (
                                                                    <ImageIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                                                                )}
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="font-bold text-slate-800 truncate" title={file.name}>{file.name}</p>
                                                                    <p className="text-[8px] font-medium text-slate-400 uppercase tracking-wider">
                                                                        Enviado por: {file.uploadedBy} em {file.uploadedAt ? formatVisualDate(file.uploadedAt, 'dd/MM/yyyy HH:mm') : ''}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <button 
                                                                onClick={() => handleDeleteProjectFile(file.url)}
                                                                className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                                                                title="Remover anexo"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="py-6 text-center bg-white rounded-xl border border-dashed border-slate-200">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhum projeto anexado.</p>
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </div>

                                {/* Coluna Direita: Itens da Produção e Equipe Designada */}
                                <div className="space-y-6">
                                    {/* Bloco 4: Itens da Produção */}
                                    <section className="space-y-4">
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                            <Package className="w-3.5 h-3.5" /> Itens da Produção
                                        </h3>

                                        <div className="space-y-3">
                                            {safeArray(order.items).map((item, idx) => (
                                                <div key={item.id || idx} className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm hover:border-violet-200 transition-all group">
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                                                                    Ambiente: {item.environmentName || 'Geral'}
                                                                </p>
                                                                {item.productionStatus && (
                                                                    <Badge variant="outline" className={cn(
                                                                        "text-[8px] font-black uppercase tracking-widest px-2 h-5 border-none",
                                                                        item.productionStatus === 'instalado' ? "bg-emerald-100 text-emerald-700" :
                                                                        item.productionStatus === 'finalizado' ? "bg-blue-100 text-blue-700" :
                                                                        item.productionStatus === 'em_producao' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                                                                    )}>
                                                                        {item.productionStatus}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <h4 className="text-sm font-black text-slate-900 uppercase">Peça: {item.name}</h4>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Área Total</p>
                                                            <p className="text-sm font-black text-brand-rocha-primary">{item.area?.toFixed(2)} m²</p>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-3 gap-4 border-t border-slate-50 pt-3">
                                                        <div>
                                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Material</p>
                                                            <p className="text-[11px] font-bold text-slate-700 uppercase leading-tight">{item.material || order.material || 'A definir'}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Medida</p>
                                                            <p className="text-[11px] font-bold text-slate-700">{item.width || 'A definir'} x {item.length || 'A definir'} cm</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Quantidade</p>
                                                            <p className="text-[11px] font-bold text-slate-700">{item.quantity || 1} un</p>
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 flex flex-wrap gap-2">
                                                        {[
                                                            { key: 'corte', label: 'Corte' },
                                                            { key: 'acabamento', label: 'Acabamento' },
                                                            { key: 'conferencia', label: 'Conferência' },
                                                            { key: 'instalado', label: 'Instalado' }
                                                        ].map((check) => (
                                                            <button
                                                                key={check.key}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleItemCheckToggle(item.id, check.key as any);
                                                                }}
                                                                className={cn(
                                                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm",
                                                                    (item.checklist as any)?.[check.key]
                                                                        ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                                                                        : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                                                                )}
                                                            >
                                                                <div className={cn(
                                                                    "w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all",
                                                                    (item.checklist as any)?.[check.key] ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-slate-200"
                                                                )}>
                                                                    {(item.checklist as any)?.[check.key] && <Check className="w-2.5 h-2.5" />}
                                                                </div>
                                                                {check.label}
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {item.finishings && (
                                                        <div className="mt-4 p-2.5 bg-slate-50 rounded-xl border border-slate-100/50">
                                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Acabamentos e Observações Técnicas</p>
                                                            <p className="text-10px font-medium text-slate-600 uppercase leading-relaxed">{item.finishings}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            {safeArray(order.items).length === 0 && (
                                                <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhum item detalhado nesta O.S.</p>
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    {/* Bloco 5: Equipe Designada */}
                                    <section className="space-y-4">
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                            <User className="w-3.5 h-3.5" /> Equipe Designada
                                        </h3>

                                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-5 shadow-sm">
                                            {/* Equipe da Fábrica */}
                                            <div className="space-y-4">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Equipe da Fábrica</p>
                                                
                                                {/* Serrador */}
                                                <div className="flex items-center justify-between gap-4 pl-2 border-l-2 border-slate-200">
                                                    {isEditingCutter ? (
                                                        <div className="flex items-center gap-2 w-full">
                                                            <div className="flex-1">
                                                                <SearchableSelect
                                                                    value={tempCutterId}
                                                                    options={serradores.map(s => ({ value: s.id, label: s.name, description: 'Equipe de Produção (Serra)' }))}
                                                                    onChange={setTempCutterId}
                                                                    placeholder="Selecione o serrador..."
                                                                />
                                                            </div>
                                                            <Button size="icon" variant="ghost" onClick={handleSaveCutter} className="h-10 w-10 text-emerald-600 hover:bg-emerald-50 rounded-xl"><Check className="w-4 h-4" /></Button>
                                                            <Button size="icon" variant="ghost" onClick={() => setIsEditingCutter(false)} className="h-10 w-10 text-slate-400 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4" /></Button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-between gap-4 w-full">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-black uppercase shadow-lg shadow-black/10">
                                                                    {String(order?.cutterName || order?.sawyerName || 'S').substring(0, 2).toUpperCase()}
                                                                </div>
                                                                <div>
                                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Serrador</p>
                                                                    <p className="text-sm font-black text-slate-900 leading-none">{String(order?.cutterName || order?.sawyerName || 'A DEFINIR')}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {order.estimatedSawyerTime && (
                                                                    <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest px-3 h-7 border-slate-200 text-slate-500 bg-white shadow-sm flex items-center gap-2">
                                                                        <Clock className="w-3.5 h-3.5 text-brand-rocha-primary" /> {order.estimatedSawyerTime} min
                                                                    </Badge>
                                                                )}
                                                                <button
                                                                    onClick={() => {
                                                                        setTempCutterId(order.cutterId || order.sawyerId || '');
                                                                        setIsEditingCutter(true);
                                                                    }}
                                                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all"
                                                                >
                                                                    <Pencil className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Acabador */}
                                                <div className="flex items-center justify-between gap-4 pl-2 border-l-2 border-slate-200 pt-2">
                                                    {isEditingFinisher ? (
                                                        <div className="flex items-center gap-2 w-full">
                                                            <div className="flex-1">
                                                                <SearchableSelect
                                                                    value={tempFinisherId}
                                                                    options={acabadores.map(s => ({ value: s.id, label: s.name, description: 'Equipe de Produção (Acabamento)' }))}
                                                                    onChange={setTempFinisherId}
                                                                    placeholder="Selecione o acabador..."
                                                                />
                                                            </div>
                                                            <Button size="icon" variant="ghost" onClick={handleSaveFinisher} className="h-10 w-10 text-emerald-600 hover:bg-emerald-50 rounded-xl"><Check className="w-4 h-4" /></Button>
                                                            <Button size="icon" variant="ghost" onClick={() => setIsEditingFinisher(false)} className="h-10 w-10 text-slate-400 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4" /></Button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-between gap-4 w-full">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-black uppercase shadow-lg shadow-black/10">
                                                                    {String(order?.finisherName || 'A').substring(0, 2).toUpperCase()}
                                                                </div>
                                                                <div>
                                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Acabador</p>
                                                                    <p className="text-sm font-black text-slate-900 leading-none">{String(order?.finisherName || 'A DEFINIR')}</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    setTempFinisherId(order.finisherId || '');
                                                                    setIsEditingFinisher(true);
                                                                }}
                                                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all"
                                                            >
                                                                <Pencil className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Equipe de Instalação */}
                                            <div className="space-y-4 pt-4 border-t border-slate-200/50">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Equipe de Instalação</p>
                                                
                                                {/* Instalador */}
                                                <div className="flex items-center justify-between gap-4 pl-2 border-l-2 border-indigo-200">
                                                    {isEditingInstaller ? (
                                                        <div className="flex items-center gap-2 w-full">
                                                            <div className="flex-1">
                                                                <SearchableSelect
                                                                    value={tempInstallerId}
                                                                    options={instaladores.map(s => ({ value: s.id, label: s.name, description: 'Equipe de Instalação' }))}
                                                                    onChange={setTempInstallerId}
                                                                    placeholder="Selecione o instalador..."
                                                                />
                                                            </div>
                                                            <Button size="icon" variant="ghost" onClick={handleSaveInstaller} className="h-10 w-10 text-emerald-600 hover:bg-emerald-50 rounded-xl"><Check className="w-4 h-4" /></Button>
                                                            <Button size="icon" variant="ghost" onClick={() => setIsEditingInstaller(false)} className="h-10 w-10 text-slate-400 hover:bg-slate-100 rounded-xl"><X className="w-4 h-4" /></Button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-between gap-4 w-full">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-10 h-10 rounded-xl bg-violet-100 text-brand-rocha-primary flex items-center justify-center text-xs font-black uppercase border border-violet-200">
                                                                    {String(order?.installerName || 'I').substring(0, 2).toUpperCase()}
                                                                </div>
                                                                <div>
                                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Instalador</p>
                                                                    <p className="text-sm font-black text-slate-900 leading-none">{String(order?.installerName || 'A DEFINIR')}</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    setTempInstallerId(order.installerId || '');
                                                                    setIsEditingInstaller(true);
                                                                }}
                                                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all"
                                                            >
                                                                <Pencil className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'checklist' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div>
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
                                    <FileCheck className="w-4 h-4" /> Critérios de Qualidade e Conferência
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {safeArray(CONFERENCE_ITEMS).map((item, i) => (
                                        <div
                                            key={i}
                                            onClick={() => handleCheckToggle(item)}
                                            className={cn(
                                                "flex items-center gap-4 p-5 rounded-2xl border transition-all cursor-pointer group shadow-sm",
                                                checklist[item]
                                                    ? "bg-violet-50 border-violet-100 text-brand-rocha-primary"
                                                    : "bg-white border-slate-100 text-slate-500 hover:border-slate-200"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                                                checklist[item] ? "bg-brand-rocha-primary border-brand-rocha-primary text-white" : "bg-slate-50 border-slate-200 group-hover:border-slate-300"
                                            )}>
                                                {checklist[item] && <Check className="h-4 w-4" />}
                                            </div>
                                            <span className={cn("text-xs font-black uppercase tracking-tight transition-all", checklist[item] ? "opacity-60" : "group-hover:translate-x-1")}>{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-8">
                                <Button
                                    size="lg"
                                    className={cn(
                                        "w-full h-16 text-xs font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl transition-all shadow-violet-500/10",
                                        isChecklistComplete ? "bg-brand-rocha-primary hover:bg-violet-700 text-white" : "bg-slate-100 text-slate-300 cursor-not-allowed"
                                    )}
                                    onClick={handleCompleteClick}
                                    disabled={isSubmitting || !isChecklistComplete}
                                >
                                    {isSubmitting ? (
                                        <div className="flex items-center gap-3">
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Processando...
                                        </div>
                                    ) : (
                                        'Finalizar Conferência e Liberar para Próxima Etapa'
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'attachments' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-400 min-h-[500px] max-w-5xl mx-auto">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900/40 p-6 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <Paperclip className="w-24 h-24 rotate-12" />
                                </div>
                                <div className="relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-lg">
                                            <Paperclip className="h-6 w-6 text-brand-rocha-primary" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black uppercase tracking-tight text-slate-900 leading-none">
                                                Projeto e Medições
                                            </h3>
                                            <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-1.5">
                                                Documentação técnica e fotográfica oficial
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                {canEditOrderFields(order, profile as any) && (
                                    <Button 
                                        onClick={() => setIsUploadModalOpen(true)} 
                                        className="relative z-10 bg-slate-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest h-12 px-8 rounded-2xl shadow-xl shadow-slate-200 transition-all active:scale-95 flex items-center gap-2"
                                    >
                                        <Plus className="h-4 w-4" /> Adicionar Arquivos
                                    </Button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div className="md:col-span-1 space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 px-1">
                                        <FileCheck className="w-3.5 h-3.5" /> Contrato
                                    </h4>
                                    {order.contractId ? (
                                        <>
                                            <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-3xl flex flex-col items-center justify-center text-center group hover:bg-emerald-100 transition-all cursor-pointer shadow-sm mb-3" onClick={handlePrintContract}>
                                                <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                                    <FileText className="w-6 h-6 text-emerald-600" />
                                                </div>
                                                <p className="text-[10px] font-black text-emerald-900 uppercase tracking-widest mb-1.5">Abrir Contrato</p>
                                                <Badge className="bg-emerald-600/10 text-emerald-600 border-none font-black text-[8px] tracking-[0.2em] uppercase">
                                                    {getContractDisplayStatus(order) === 'em_edicao' ? 'Rascunho' : 'Documento Ativo'}
                                                </Badge>
                                            </div>
                                            {getContractDisplayStatus(order) === 'em_edicao' && (profile?.role === 'company_admin' || profile?.role === 'superadmin') && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={handleDeleteContractClick}
                                                    className="w-full h-10 border-rose-200 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-2xl font-black uppercase text-[9px] tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" /> Excluir Contrato
                                                </Button>
                                            )}
                                        </>
                                    ) : (
                                        <div className="bg-slate-50 border border-slate-200 p-5 rounded-3xl flex flex-col items-center justify-center text-center shadow-sm">
                                            <div className="w-12 h-12 bg-white rounded-2xl border border-slate-100 flex items-center justify-center mb-3">
                                                <FileX className="w-6 h-6 text-slate-400" />
                                            </div>
                                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Sem Contrato</p>
                                            <p className="text-[9px] text-slate-400 font-bold leading-normal">
                                                Este pedido não possui um contrato vinculado na central.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="md:col-span-3 space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 px-1">
                                        <Info className="w-3.5 h-3.5" /> Informação do Projeto
                                    </h4>
                                    <div className="bg-white border border-slate-100 p-6 rounded-3xl h-full flex items-center shadow-sm relative overflow-hidden">
                                        <div className="flex gap-12 relative z-10">
                                            <div>
                                                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2 leading-none">Total de Anexos</p>
                                                <p className="text-2xl font-black text-slate-900 uppercase tracking-tighter tabular-nums leading-none">{attachments.length} ARQUIVOS</p>
                                            </div>
                                            <div className="w-px h-8 bg-slate-100" />
                                            <div>
                                                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2 leading-none">Protocolo OS</p>
                                                <p className="text-2xl font-black text-slate-900 uppercase tracking-tighter tabular-nums leading-none">#{String(order?.protocolNumber || '------').slice(-6)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {attachments.length > 0 ? (
                                <div className="space-y-8 pb-12">
                                    {safeArray(attachments).filter(u => !String(u || '').toLowerCase().includes('.pdf') && !String(u || '').includes('documents%2F')).length > 0 && (
                                        <section className="space-y-6">
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2 px-1">
                                                <Camera className="w-4 h-4" /> Galeria de Fotos e Medições
                                            </h4>
                                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                                                {safeArray(attachments).map((url, i) => {
                                                    const urlStr = String(url || '');
                                                    const isPdf = urlStr.toLowerCase().includes('.pdf') || urlStr.includes('documents%2F');
                                                    if (isPdf) return null;

                                                    return (
                                                        <div 
                                                            key={i} 
                                                            className="group relative aspect-square rounded-3xl overflow-hidden bg-white border border-slate-100 shadow-sm transition-all cursor-pointer hover:shadow-xl hover:scale-[1.02] hover:-translate-y-1"
                                                            onClick={() => { setCarouselIndex(i); setIsCarouselOpen(true); }}
                                                        >
                                                            <img 
                                                                src={url} 
                                                                alt={`Foto ${i + 1}`} 
                                                                className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110" 
                                                            />
                                                            <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/20 to-transparent">
                                                                <p className="text-[9px] text-white font-black tracking-widest uppercase">Foto {i + 1}</p>
                                                            </div>
                                                            <div className="absolute inset-0 bg-violet-600/20 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-[2px]">
                                                                <div className="p-4 bg-white rounded-2xl text-brand-rocha-primary shadow-2xl scale-75 group-hover:scale-100 transition-transform duration-300">
                                                                    <ImageIcon className="w-6 h-6" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    )}

                                    {safeArray(attachments).filter(u => String(u || '').toLowerCase().includes('.pdf') || String(u || '').includes('documents%2F')).length > 0 && (
                                        <section className="space-y-6">
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2 px-1">
                                                <FileDown className="w-4 h-4" /> Documentos e Arquivos Técnicos
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {safeArray(attachments).map((url, i) => {
                                                    const urlStr = String(url || '');
                                                    const isPdf = urlStr.toLowerCase().includes('.pdf') || urlStr.includes('documents%2F');
                                                    if (!isPdf) return null;

                                                    return (
                                                        <div 
                                                            key={i} 
                                                            className="flex items-center gap-5 p-5 rounded-3xl bg-white border border-slate-100 shadow-sm hover:border-violet-200 hover:shadow-md transition-all group"
                                                        >
                                                            <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center shrink-0 border border-violet-100 transition-colors group-hover:bg-violet-100">
                                                                <FileText className="w-7 h-7 text-brand-rocha-primary" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-black text-slate-900 uppercase tracking-tighter truncate">
                                                                    Projeto_Tecnico_{i+1}.pdf
                                                                </p>
                                                                <p className="text-[9px] text-slate-400 font-extrabold uppercase tracking-[0.2em] mt-1 opacity-70">
                                                                    Documento Oficial PDF
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <a 
                                                                    href={url} 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer"
                                                                    className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 hover:text-brand-rocha-primary hover:bg-violet-50 transition-all border border-slate-100"
                                                                >
                                                                    <Download className="w-5 h-5" />
                                                                </a>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-24 bg-slate-50 rounded-[3.5rem] border-2 border-dashed border-slate-200 transition-all hover:bg-slate-50 group">
                                    <div className="relative mb-8">
                                        <div className="w-24 h-24 bg-white rounded-[2rem] shadow-xl flex items-center justify-center transition-transform group-hover:scale-110">
                                            <Paperclip className="h-10 w-10 text-slate-300" />
                                        </div>
                                        <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-brand-rocha-primary rounded-2xl flex items-center justify-center shadow-lg border-4 border-slate-50 animate-bounce">
                                            <Plus className="w-5 h-5 text-white" />
                                        </div>
                                    </div>
                                    <h3 className="text-slate-900 font-black text-lg uppercase tracking-widest">
                                        Sem arquivos do projeto ainda
                                    </h3>
                                    <p className="text-slate-500 text-[10px] mt-4 uppercase font-black max-w-xs text-center leading-relaxed tracking-widest opacity-60">
                                        Adicione fotos, contratos e documentos técnicos para centralizar a documentação.
                                    </p>
                                    {canEditOrderFields(order, profile as any) && (
                                        <Button 
                                            onClick={() => setIsUploadModalOpen(true)}
                                            className="mt-8 bg-slate-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-widest h-12 px-10 rounded-2xl shadow-xl shadow-slate-200"
                                        >
                                            Adicionar Arquivos
                                        </Button>
                                    )}
                                </div>
                            )}

                            <FileUploadModal
                                isOpen={isUploadModalOpen}
                                onClose={() => setIsUploadModalOpen(false)}
                                currentAttachments={attachments}
                                onSave={async (newUrls) => {
                                    if (onUpdateOrder) {
                                        await onUpdateOrder({ ...order, attachments: newUrls });
                                    }
                                    setIsUploadModalOpen(false);
                                }}
                                title={`Arquivos: ${order.customerName}`}
                            />

                            <CarouselViewerModal
                                isOpen={isCarouselOpen}
                                onClose={() => setIsCarouselOpen(false)}
                                images={safeArray(attachments).filter(u => !String(u || '').toLowerCase().includes('.pdf') && !String(u || '').includes('documents%2F'))}
                                initialIndex={carouselIndex}
                                title={`Galeria de Fotos: ${order.customerName}`}
                            />
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Linha do Tempo e Audit Log</h3>
                            
                            {isLogsLoading ? (
                                <div className="py-16 flex flex-col items-center justify-center opacity-40">
                                    <div className="w-10 h-10 border-2 border-slate-200 border-t-brand-rocha-primary rounded-full animate-spin mb-4" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Sincronizando histórico...</p>
                                </div>
                            ) : safeArray(logs).length === 0 ? (
                                <div className="py-16 flex flex-col items-center justify-center bg-slate-50 rounded-[2.5rem] border border-slate-100">
                                    <Clock className="w-10 h-10 mb-4 text-slate-200" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Nenhum evento registrado ainda</p>
                                </div>
                            ) : (
                                <div className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm bg-white">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Data e Hora</th>
                                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Evento</th>
                                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Responsável</th>
                                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Detalhes Técnicos</th>
                                                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Contexto</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {safeArray(logs).map((log) => (
                                                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-5 whitespace-nowrap">
                                                        <p className="text-[11px] font-black text-slate-900 uppercase leading-none tracking-tight">
                                                            {formatVisualDate(log?.createdAt, 'dd MMM yyyy', { locale: ptBR })}
                                                        </p>
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-1.5 leading-none tracking-widest">
                                                            {formatVisualDate(log?.createdAt, 'HH:mm')}
                                                        </p>
                                                    </td>
                                                    <td className="px-6 py-5 whitespace-nowrap">
                                                        <Badge variant="outline" className="text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 border-slate-200 text-slate-600 bg-white">
                                                            {String(log?.action || 'evento')}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-6 py-5 whitespace-nowrap">
                                                        <p className="text-xs font-black text-slate-700 uppercase tracking-tight">{String(log?.userName || 'Sistema')}</p>
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        {log.fieldChanged && (
                                                            <div className="flex flex-col gap-1.5">
                                                                <span className="text-[9px] font-black uppercase text-brand-rocha-primary/60 tracking-widest">{getFieldFriendlyName(log.fieldChanged)}</span>
                                                                <p className="text-xs font-black text-slate-900 leading-tight flex items-center gap-2">
                                                                    <span className="opacity-30 italic">{String(log.oldValue || '∅')}</span>
                                                                    <span className="text-brand-rocha-primary">→</span>
                                                                    <span className="bg-violet-50 px-1.5 py-0.5 rounded-md">{String(log.newValue || '∅')}</span>
                                                                </p>
                                                            </div>
                                                        )}
                                                        {log.action === 'create' && <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Abertura de Ordem de Serviço</p>}
                                                    </td>
                                                    <td className="px-6 py-5 whitespace-nowrap">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[180px]" title={log?.reason}>
                                                            {String(log?.reason || '---')}
                                                        </p>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="p-6 border-t shrink-0 bg-white/80 backdrop-blur-xl print:hidden flex flex-wrap justify-between items-center gap-4">
                <Button variant="ghost" className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] hover:bg-slate-50 hover:text-slate-900 transition-colors" onClick={() => generateProductionSheet(order, settings)}>
                    <Printer className="h-4 w-4 mr-2" /> Gerar Ficha de Produção
                </Button>
                <div className="flex gap-3">
                    {canEditOrderFields(order, profile as any) && (
                        <Button 
                            variant="outline" 
                            onClick={() => navigate(`/pedidos/${order.id}/editar`)}
                            className="font-black uppercase text-[10px] tracking-widest h-12 px-8 rounded-2xl border-slate-200 hover:bg-slate-50 transition-all shadow-sm"
                        >
                            <FileText className="w-4 h-4 mr-2" /> Editar OS
                        </Button>
                    )}
                    <Button 
                        variant="outline" 
                        onClick={() => navigate(`/contratos?search=${order?.protocolNumber || ''}`)}
                        className="font-black uppercase text-[10px] tracking-widest h-12 px-8 rounded-2xl border-brand-rocha-primary text-brand-rocha-primary hover:bg-violet-50 transition-all shadow-lg shadow-violet-500/5"
                    >
                        <ShieldCheck className="w-4 h-4 mr-2" /> Gerenciar Contratos
                    </Button>
                    {order.status === 'em_contrato' && (
                        <Button 
                            onClick={handleTransitionToProduction}
                            disabled={isSubmitting}
                            className="font-black uppercase text-[10px] tracking-widest h-12 px-8 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20"
                        >
                            <Activity className="w-4 h-4 mr-2" /> Iniciar Produção
                        </Button>
                    )}
                    <Button variant="outline" className="text-rose-500 hover:bg-rose-50 border-rose-100 font-black uppercase text-[10px] tracking-widest h-12 px-8 rounded-2xl" onClick={() => onInternalReturnClick?.(order)}>
                        <XCircle className="w-4 h-4 mr-2" /> Registrar Retorno
                    </Button>
                    {['pendente', 'assinado', 'assinado_presencial'].includes(getContractDisplayStatus(order)) && (
                        <Button 
                            variant="ghost" 
                            className="text-rose-600 hover:bg-rose-50 font-black uppercase text-[10px] tracking-widest h-12 px-8 rounded-2xl"
                            onClick={() => { console.log('[REVOKE] botão clicado'); setIsRevokeModalOpen(true); }}
                        >
                            <ShieldAlert className="w-4 h-4 mr-2" /> Revogar Contrato
                        </Button>
                    )}
                </div>
            </div>

            <RevokeContractModal 
                isOpen={isRevokeModalOpen}
                onClose={() => setIsRevokeModalOpen(false)}
                onConfirm={handleConfirmRevoke}
                orderProtocol={order.protocolNumber}
            />
        </div>
    );
};
