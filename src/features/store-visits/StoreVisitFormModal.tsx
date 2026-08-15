import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { StoreVisit, Client, StaffModel } from '../../types';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { format } from 'date-fns';
import { Search, UserPlus, Save, Trash2, X } from 'lucide-react';
import { cn, safeString } from '../../lib/utils';
import { isSuperAdmin } from '../../lib/authHelpers';

interface StoreVisitFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    visit?: StoreVisit | null;
    selectedDate?: Date;
}

export const StoreVisitFormModal: React.FC<StoreVisitFormModalProps> = ({
    isOpen,
    onClose,
    visit,
    selectedDate
}) => {
    const { user, profile } = useAuth();
    
    const [clients, setClients] = useState<Client[]>([]);
    const [staff, setStaff] = useState<StaffModel[]>([]);
    const [clientSearch, setClientSearch] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const submittingRef = useRef(false);

    const [formData, setFormData] = useState<Partial<StoreVisit>>({
        status: 'agendada',
        visitType: 'primeira_visita',
        visitDate: format(selectedDate || new Date(), 'yyyy-MM-dd'),
        visitTime: '09:00'
    });

    useEffect(() => {
        if (!isOpen || !profile?.companyId) return;

        const loadData = async () => {
            const clientsQ = query(collection(db, 'clients'), where('companyId', '==', profile.companyId));
            const clientsSnap = await getDocs(clientsQ);
            setClients(clientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));

            if (isSuperAdmin(profile) || profile.role === 'company_admin') {
                const staffQ = query(collection(db, 'staff'), where('companyId', '==', profile.companyId));
                const staffSnap = await getDocs(staffQ);
                setStaff(staffSnap.docs.map(d => ({ id: d.id, ...d.data() } as StaffModel)));
            }
        };

        loadData();

        const DEFAULT_FORM_DATA = {
            status: 'agendada',
            visitType: 'primeira_visita',
            visitDate: format(selectedDate || new Date(), 'yyyy-MM-dd'),
            visitTime: '09:00',
            clientId: '',
            clientName: '',
            clientPhone: '',
            sellerId: user?.uid || '',
            sellerName: profile?.name || user?.email || '',
            sellerEmail: user?.email || '',
            interest: '',
            notes: ''
        };

        if (visit) {
            setFormData({
                ...DEFAULT_FORM_DATA,
                ...visit,
                status: visit.status || 'agendada',
                visitType: visit.visitType || 'primeira_visita',
                visitDate: visit.visitDate || format(selectedDate || new Date(), 'yyyy-MM-dd'),
                visitTime: visit.visitTime || '09:00'
            });
            setClientSearch(safeString(visit.clientName));
        } else {
            setFormData(DEFAULT_FORM_DATA);
            setClientSearch('');
        }
    }, [isOpen, profile?.companyId, visit, selectedDate, user]);

    const filteredClients = clients.filter(c => {
        const name = safeString(c?.name).toLowerCase();
        const phone = safeString(c?.phone);
        const search = safeString(clientSearch).toLowerCase();
        return name.includes(search) || phone.includes(search);
    }).slice(0, 5);

    const buildStoreVisitClientSnapshot = (client: Client) => {
        return {
            id: client.id,
            name: client.name || null,
            phone: client.phone ?? client.whatsapp ?? null,
            whatsapp: client.whatsapp ?? null,
            email: client.email ?? null,
            document: client.document ?? null,
            street: client.street ?? null,
            number: client.number ?? null,
            complement: client.complement ?? null,
            neighborhood: client.neighborhood ?? null,
            city: client.city ?? null,
            state: client.state ?? null,
            zipCode: client.zipCode ?? client.cep ?? null,
        };
    };

    const handleSelectClient = (client: Client) => {
        setFormData(prev => ({
            ...prev,
            clientId: client.id,
            clientName: client.name,
            clientPhone: client.phone || '',
            clientSnapshot: buildStoreVisitClientSnapshot(client)
        }));
        setClientSearch(client.name);
    };

    const handleSave = async () => {
        // 1. bloquear novo submit
        if (submittingRef.current || isLoading) return;
        if (!profile?.companyId || !user?.uid) return;

        // 2. validar formulário (campos obrigatórios)
        // 3. validar clientId
        if (!formData.clientId) {
            alert('Selecione um cliente antes de agendar a visita.');
            return;
        }

        // 4. validar visitDate
        const visitDateStr = safeString(formData.visitDate).trim();
        if (!visitDateStr) {
            alert('Por favor, informe a data da visita.');
            return;
        }

        // 5. validar visitTime
        const visitTimeStr = safeString(formData.visitTime).trim();
        if (!visitTimeStr) {
            alert('Por favor, informe o horário da visita.');
            return;
        }

        submittingRef.current = true;
        setIsLoading(true);

        try {
            // 6. montar valores normalizados
            const clientId = safeString(formData.clientId);
            const clientName = safeString(formData.clientName);
            const clientPhone = safeString(formData.clientPhone);
            const sellerId = safeString(formData.sellerId || user.uid);
            const sellerName = safeString(formData.sellerName || profile?.name || user?.email || '');
            const sellerEmail = safeString(formData.sellerEmail || user?.email || '');
            const status = safeString(formData.status || 'agendada');
            const visitType = safeString(formData.visitType || 'primeira_visita');
            const interest = safeString(formData.interest);
            const notes = safeString(formData.notes);

            const currentVisitId = visit?.id;

            // --- CHECK FOR LEGACY CONFLICTS BEFORE TRANSACTION ---
            // This query fetches existing documents in `store_visits` matching the target slot.
            // It will catch legacy documents that don't have locks yet, as well as existing modern documents.
            const conflictQuery = query(
                collection(db, 'store_visits'),
                where('companyId', '==', profile.companyId),
                where('clientId', '==', clientId),
                where('visitDate', '==', visitDateStr),
                where('visitTime', '==', visitTimeStr)
            );
            const conflictSnap = await getDocs(conflictQuery);
            const conflictDocs = conflictSnap.docs.filter(d => d.id !== currentVisitId);
            
            if (conflictDocs.length > 0) {
                alert('Este cliente já possui uma visita agendada para este mesmo dia e horário.');
                setIsLoading(false);
                submittingRef.current = false;
                return;
            }

            // Build the lock ID deterministically
            const lockId = `${profile.companyId}_${clientId}_${visitDateStr}_${visitTimeStr}`;
            const newLockRef = doc(db, 'store_visits_locks', lockId);

            let oldClientId = '';
            let oldVisitDate = '';
            let oldVisitTime = '';
            let otherOldVisits: any[] = [];

            if (currentVisitId) {
                const oldVisitSnap = await getDocs(query(collection(db, 'store_visits'), where('__name__', '==', currentVisitId)));
                if (!oldVisitSnap.empty) {
                    const oldData = oldVisitSnap.docs[0].data();
                    oldClientId = safeString(oldData.clientId);
                    oldVisitDate = safeString(oldData.visitDate);
                    oldVisitTime = safeString(oldData.visitTime);
                    
                    const oldLockId = `${profile.companyId}_${oldClientId}_${oldVisitDate}_${oldVisitTime}`;
                    if (oldLockId !== lockId) {
                        const oldQ = query(
                            collection(db, 'store_visits'),
                            where('companyId', '==', profile.companyId),
                            where('clientId', '==', oldClientId),
                            where('visitDate', '==', oldVisitDate),
                            where('visitTime', '==', oldVisitTime)
                        );
                        const oldSnap = await getDocs(oldQ);
                        otherOldVisits = oldSnap.docs.filter(d => d.id !== currentVisitId).map(d => d.id);
                    }
                }
            }

            let createdVisitPayload: any = null;

            // Execute the atomic transaction
            await runTransaction(db, async (transaction) => {
                // --- 1. READ ALL DOCUMENTS FIRST ---
                let oldVisitSnap = null;
                let oldLockSnap = null;
                let newLockSnap = null;
                let candidateSnap = null;

                if (currentVisitId) {
                    const visitRef = doc(db, 'store_visits', currentVisitId);
                    oldVisitSnap = await transaction.get(visitRef);
                }

                if (currentVisitId && oldVisitSnap && oldVisitSnap.exists()) {
                    const oldData = oldVisitSnap.data();
                    const currentOldClientId = safeString(oldData.clientId);
                    const currentOldVisitDate = safeString(oldData.visitDate);
                    const currentOldVisitTime = safeString(oldData.visitTime);
                    const oldLockId = `${profile.companyId}_${currentOldClientId}_${currentOldVisitDate}_${currentOldVisitTime}`;
                    
                    if (oldLockId !== lockId) {
                        const oldLockRef = doc(db, 'store_visits_locks', oldLockId);
                        oldLockSnap = await transaction.get(oldLockRef);
                        newLockSnap = await transaction.get(newLockRef);
                        
                        if (otherOldVisits.length > 0) {
                            const candidateRef = doc(db, 'store_visits', otherOldVisits[0]);
                            candidateSnap = await transaction.get(candidateRef);
                        }
                    } else {
                        newLockSnap = await transaction.get(newLockRef);
                    }
                } else {
                    newLockSnap = await transaction.get(newLockRef);
                }

                // --- 2. VALIDATION LOGIC (No writes yet) ---
                let oldLockRef = null;
                let shouldCreateLock = false;

                if (currentVisitId && oldVisitSnap && oldVisitSnap.exists()) {
                    const oldData = oldVisitSnap.data();
                    const currentOldClientId = safeString(oldData.clientId);
                    const currentOldVisitDate = safeString(oldData.visitDate);
                    const currentOldVisitTime = safeString(oldData.visitTime);
                    const oldLockId = `${profile.companyId}_${currentOldClientId}_${currentOldVisitDate}_${currentOldVisitTime}`;

                    if (oldLockId !== lockId) {
                        if (newLockSnap && newLockSnap.exists() && newLockSnap.data().visitId !== currentVisitId) {
                            throw new Error('DUPLICATE_VISIT');
                        }
                        oldLockRef = doc(db, 'store_visits_locks', oldLockId);
                        shouldCreateLock = true;
                    } else {
                        if (newLockSnap && !newLockSnap.exists()) {
                            shouldCreateLock = true;
                        }
                    }
                } else {
                    if (newLockSnap && newLockSnap.exists()) {
                        throw new Error('DUPLICATE_VISIT');
                    }
                    shouldCreateLock = true;
                }

                // Verify the candidate duplicate visit from old slot
                let finalCandidateId: string | null = null;
                if (candidateSnap && candidateSnap.exists() && oldVisitSnap && oldVisitSnap.exists()) {
                    const cData = candidateSnap.data();
                    if (
                        safeString(cData.companyId) === profile.companyId &&
                        safeString(cData.clientId) === oldClientId &&
                        safeString(cData.visitDate) === oldVisitDate &&
                        safeString(cData.visitTime) === oldVisitTime &&
                        candidateSnap.id !== currentVisitId
                    ) {
                        finalCandidateId = candidateSnap.id;
                    }
                }

                // Build complete visit payload
                const visitPayload = {
                    clientId,
                    clientName,
                    clientPhone,
                    clientSnapshot: formData.clientSnapshot || null,
                    visitDate: visitDateStr,
                    visitTime: visitTimeStr,
                    visitType,
                    status,
                    sellerId,
                    sellerName,
                    sellerEmail,
                    notes,
                    interest,
                    leadOrigin: formData.leadOrigin || 'Visita na Loja',
                    origin: formData.origin || 'Visita na Loja',
                    quoteId: formData.quoteId || null,
                    quoteProtocol: formData.quoteProtocol || null,
                    quoteTotal: formData.quoteTotal || null,
                    sourceType: formData.sourceType || null,
                    sourceId: formData.sourceId || null,
                    companyId: profile.companyId,
                    updatedAt: new Date().toISOString(),
                    updatedBy: user.uid
                };

                // Validate payload to avoid undefined fields
                const findUndefinedPaths = (obj: any, path: string = ''): string[] => {
                    let paths: string[] = [];
                    for (const key in obj) {
                        if (obj[key] === undefined) {
                            paths.push(path ? `${path}.${key}` : key);
                        } else if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key]) && typeof obj[key].getMonth !== 'function') {
                            paths = paths.concat(findUndefinedPaths(obj[key], path ? `${path}.${key}` : key));
                        }
                    }
                    return paths;
                };

                const undefinedPaths = findUndefinedPaths(visitPayload);
                if (undefinedPaths.length > 0) {
                    console.error('[StoreVisit] Campos undefined no payload:', undefinedPaths);
                    throw new Error('UNDEFINED_FIELDS');
                }

                // --- 3. WRITES ---
                if (currentVisitId) {
                    const visitRef = doc(db, 'store_visits', currentVisitId);
                    transaction.update(visitRef, visitPayload);
                    
                    if (oldLockRef) {
                        if (oldLockSnap && oldLockSnap.exists() && oldLockSnap.data().visitId === currentVisitId) {
                            if (finalCandidateId) {
                                // Transfer ownership of old lock
                                transaction.set(oldLockRef, {
                                    visitId: finalCandidateId,
                                    companyId: profile.companyId,
                                    clientId: oldClientId,
                                    visitDate: oldVisitDate,
                                    visitTime: oldVisitTime,
                                    createdAt: new Date().toISOString()
                                });
                            } else {
                                // Delete old lock
                                transaction.delete(oldLockRef);
                            }
                        }
                    }
                    if (shouldCreateLock) {
                        transaction.set(newLockRef, { 
                            visitId: currentVisitId, 
                            companyId: profile.companyId, 
                            clientId, 
                            visitDate: visitDateStr, 
                            visitTime: visitTimeStr,
                            createdAt: new Date().toISOString()
                        });
                    }
                } else {
                    const visitRef = doc(collection(db, 'store_visits'));
                    const newVisitPayload = {
                        ...visitPayload,
                        createdAt: new Date().toISOString(),
                        createdBy: user.uid
                    };
                    transaction.set(visitRef, newVisitPayload);
                    transaction.set(newLockRef, { 
                        visitId: visitRef.id, 
                        companyId: profile.companyId, 
                        clientId, 
                        visitDate: visitDateStr, 
                        visitTime: visitTimeStr,
                        createdAt: newVisitPayload.createdAt
                    });

                    createdVisitPayload = newVisitPayload;
                }
            });

            // Add to quote history if applicable (non-blocking, outside of transaction)
            if (createdVisitPayload && createdVisitPayload.sourceType === 'quote' && createdVisitPayload.sourceId) {
                try {
                    const quoteRef = doc(db, 'orcamentos', createdVisitPayload.sourceId);
                    const quoteSnap = await getDocs(query(collection(db, 'orcamentos'), where('__name__', '==', createdVisitPayload.sourceId)));
                    if (!quoteSnap.empty) {
                        const quoteData = quoteSnap.docs[0].data();
                        await updateDoc(quoteRef, {
                            history: [
                                ...(quoteData.history || []),
                                {
                                    date: createdVisitPayload.createdAt,
                                    action: "Visita na loja agendada",
                                    user: profile?.name || user?.email || "Sistema"
                                }
                            ],
                            updatedAt: createdVisitPayload.createdAt
                        });
                    }
                } catch (err) {
                    console.error('Error updating quote history:', err);
                }
            }

            onClose();
        } catch (error: any) {
            if (error.message === 'DUPLICATE_VISIT') {
                alert('Este cliente já possui uma visita agendada para este mesmo dia e horário.');
            } else if (error.message === 'UNDEFINED_FIELDS') {
                alert('Não foi possível preparar os dados do cliente para o agendamento.');
            } else {
                console.error('[StoreVisit] Erro ao salvar visita:', error);
                alert('Não foi possível agendar a visita. Revise os dados e tente novamente.');
            }
        } finally {
            setIsLoading(false);
            submittingRef.current = false;
        }
    };

    const handleDelete = async () => {
        if (!visit?.id) return;
        if (!window.confirm('Tem certeza que deseja excluir esta visita?')) return;

        submittingRef.current = true;
        setIsLoading(true);

        try {
            // Pre-query other visits in the same slot to transfer ownership if needed
            const q = query(
                collection(db, 'store_visits'),
                where('companyId', '==', visit.companyId),
                where('clientId', '==', visit.clientId),
                where('visitDate', '==', visit.visitDate),
                where('visitTime', '==', visit.visitTime)
            );
            const snap = await getDocs(q);
            const otherVisits = snap.docs.filter(d => d.id !== visit.id).map(d => d.id);

            await runTransaction(db, async (transaction) => {
                // --- 1. READS ---
                const visitRef = doc(db, 'store_visits', visit.id);
                const visitSnap = await transaction.get(visitRef);
                
                let lockSnap = null;
                let lockRef = null;
                let candidateSnap = null;

                if (visitSnap.exists()) {
                    const data = visitSnap.data();
                    const clientId = safeString(data.clientId);
                    const visitDate = safeString(data.visitDate);
                    const visitTime = safeString(data.visitTime);
                    const companyId = safeString(data.companyId);
                    
                    if (companyId && clientId && visitDate && visitTime) {
                        const lockId = `${companyId}_${clientId}_${visitDate}_${visitTime}`;
                        lockRef = doc(db, 'store_visits_locks', lockId);
                        lockSnap = await transaction.get(lockRef);
                        
                        if (otherVisits.length > 0) {
                            const candidateRef = doc(db, 'store_visits', otherVisits[0]);
                            candidateSnap = await transaction.get(candidateRef);
                        }
                    }
                }

                // --- 2. VALIDATE CANDIDATE ---
                let finalCandidateId: string | null = null;
                if (candidateSnap && candidateSnap.exists() && visitSnap.exists()) {
                    const data = visitSnap.data();
                    const cData = candidateSnap.data();
                    if (
                        safeString(cData.companyId) === safeString(data.companyId) &&
                        safeString(cData.clientId) === safeString(data.clientId) &&
                        safeString(cData.visitDate) === safeString(data.visitDate) &&
                        safeString(cData.visitTime) === safeString(data.visitTime) &&
                        candidateSnap.id !== visit.id
                    ) {
                        finalCandidateId = candidateSnap.id;
                    }
                }

                // --- 3. WRITES ---
                if (visitSnap.exists()) {
                    const data = visitSnap.data();
                    if (lockRef && lockSnap && lockSnap.exists() && lockSnap.data().visitId === visit.id) {
                        if (finalCandidateId) {
                            // Transfer ownership of the lock to the next duplicate
                            transaction.set(lockRef, {
                                visitId: finalCandidateId,
                                companyId: safeString(data.companyId),
                                clientId: safeString(data.clientId),
                                visitDate: safeString(data.visitDate),
                                visitTime: safeString(data.visitTime),
                                createdAt: new Date().toISOString()
                            });
                        } else {
                            // Delete lock since no other duplicates exist
                            transaction.delete(lockRef);
                        }
                    }
                }
                transaction.delete(visitRef);
            });
            onClose();
        } catch (error) {
            console.error('Error deleting visit:', error);
            alert('Erro ao excluir visita.');
        } finally {
            setIsLoading(false);
            submittingRef.current = false;
        }
    };

    const isAdmin = isSuperAdmin(profile) || profile?.role === 'company_admin';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={visit ? "Editar Visita" : "Nova Visita na Loja"}>
            <div className="space-y-4">
                {/* Client Selection */}
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Cliente</label>
                    <div className="relative">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar cliente por nome ou telefone..."
                                    value={clientSearch}
                                    onChange={(e) => {
                                        setClientSearch(e.target.value);
                                        if (formData.clientId && e.target.value !== formData.clientName) {
                                            setFormData(prev => {
                                                const { clientId, clientSnapshot, ...rest } = prev as any;
                                                return rest;
                                            });
                                        }
                                    }}
                                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-rocha-primary/20"
                                />
                            </div>
                        </div>
                        
                        {clientSearch && !formData.clientId && filteredClients.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                {filteredClients.map(c => (
                                    <div 
                                        key={c.id} 
                                        onClick={() => handleSelectClient(c)}
                                        className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0"
                                    >
                                        <div className="font-bold text-slate-900 text-sm">{c.name}</div>
                                        <div className="text-xs text-slate-500">{c.phone}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Data</label>
                        <input
                            type="date"
                            value={formData.visitDate || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, visitDate: e.target.value }))}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-rocha-primary/20"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Hora</label>
                        <input
                            type="time"
                            value={formData.visitTime || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, visitTime: e.target.value }))}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-rocha-primary/20"
                        />
                    </div>
                </div>

                {/* Type & Status */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Tipo de Visita</label>
                        <select
                            value={formData.visitType || 'primeira_visita'}
                            onChange={(e) => setFormData(prev => ({ ...prev, visitType: e.target.value as any }))}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-rocha-primary/20"
                        >
                            <option value="primeira_visita">1ª Visita</option>
                            <option value="retorno">Retorno</option>
                            <option value="apresentacao_projeto">Apresentação de Projeto</option>
                            <option value="fechamento">Fechamento</option>
                            <option value="pos_venda">Pós-Venda</option>
                            <option value="sem_agendamento">Sem Agendamento</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Status</label>
                        <select
                            value={formData.status || 'agendada'}
                            onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-rocha-primary/20"
                            disabled={formData.status === 'convertida_em_orcamento'}
                        >
                            <option value="agendada">Agendada</option>
                            <option value="compareceu">Compareceu</option>
                            <option value="nao_compareceu">Não Compareceu</option>
                            <option value="reagendada">Reagendada</option>
                            <option value="cancelada">Cancelada</option>
                            <option value="convertida_em_orcamento">Convertida em Orçamento</option>
                        </select>
                    </div>
                </div>

                {/* Seller & Notes */}
                <div className="grid grid-cols-1 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Vendedor Responsável</label>
                        {isAdmin ? (
                            <select
                                value={formData.sellerId || ''}
                                onChange={(e) => {
                                    const selectedStaff = staff.find(s => s.userId === e.target.value);
                                    setFormData(prev => ({ 
                                        ...prev, 
                                        sellerId: e.target.value,
                                        sellerName: selectedStaff?.name || '',
                                        sellerEmail: '' // Optional email update
                                    }));
                                }}
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-rocha-primary/20"
                            >
                                {staff.map(s => (
                                    <option key={s.id} value={s.userId}>{s.name}</option>
                                ))}
                                {!staff.find(s => s.userId === formData.sellerId) && formData.sellerId && (
                                    <option value={formData.sellerId}>{formData.sellerName}</option>
                                )}
                            </select>
                        ) : (
                            <input
                                type="text"
                                value={formData.sellerName || ''}
                                disabled
                                className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-500 cursor-not-allowed"
                            />
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Interesse / Notas</label>
                        <textarea
                            value={formData.interest || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, interest: e.target.value }))}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-rocha-primary/20 min-h-[80px]"
                            placeholder="Descreva o que o cliente busca..."
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="pt-4 flex items-center justify-between border-t border-slate-100 mt-6">
                    {visit?.id ? (
                        <Button type="button" variant="outline" onClick={handleDelete} className="text-rose-600 border-rose-200 hover:bg-rose-50">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                        </Button>
                    ) : (
                        <div />
                    )}
                    
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
                        <Button type="button" onClick={handleSave} disabled={isLoading}>
                            {isLoading ? 'Salvando...' : 'Salvar Visita'}
                            <Save className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
