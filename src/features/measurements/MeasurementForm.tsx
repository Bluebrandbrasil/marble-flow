import { safeArray } from '../../lib/dataDiagnostics';
import React from 'react';
import type { Measurement, Quote, Client, MeasurementAttachment } from '../../types';
import { useAuth, type UserProfile } from '../../context/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/utils';
import { useClients } from '../../hooks/useClients';
import { useMaterialCatalog } from '../../hooks/useMaterialCatalog';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { MapPin, Lock, Search, ChevronDown, X, Paperclip, FileText, Trash2, Eye } from 'lucide-react';
import { DatePicker } from '../../components/ui/DatePicker';
import { db, storage } from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { toISODateSafe } from '../../lib/dateWriteUtils';
import { getClientDisplayInfo } from '../../lib/clientUtils';

interface MeasurementFormProps {
    onSubmit: (data: Omit<Measurement, 'id' | 'createdAt' | 'status'> & { measurementAttachment?: MeasurementAttachment | null }, pregeneratedId?: string) => Promise<void> | void;
    onCancel?: () => void;
    initialDate?: Date;
    preselectedQuote?: Quote | null;
    preselectedClientId?: string;
    initialMeasurement?: Measurement | null;
}

export const MeasurementForm: React.FC<MeasurementFormProps> = ({ onSubmit, initialDate, preselectedQuote, preselectedClientId, initialMeasurement }) => {

    const { user, profile } = useAuth();
    
    const [clientSearchTerm, setClientSearchTerm] = React.useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = React.useState('');

    React.useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(clientSearchTerm);
        }, 500);
        return () => clearTimeout(timer);
    }, [clientSearchTerm]);

    const { clients, addClient } = useClients(debouncedSearchTerm);
    const { materials } = useMaterialCatalog();

    const [selectedClientId, setSelectedClientId] = React.useState<string>('');
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);
    const hasPrefilledRef = React.useRef(false);

    const [parsedTime, setParsedTime] = React.useState('');
    const [selectedMaterial, setSelectedMaterial] = React.useState('');
    const [parsedObs, setParsedObs] = React.useState('');
    const [lockedDate, setLockedDate] = React.useState<string>(initialDate ? String(initialDate.toISOString() || '').split('T')[0] : '');
    const [isDateLocked] = React.useState<boolean>(!!initialDate);
    const [type, setType] = React.useState<'measurement' | 'store_visit'>('measurement');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
    const [shouldRemoveFile, setShouldRemoveFile] = React.useState(false);
    const [uploadProgress, setUploadProgress] = React.useState(0);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    
    // Inline Client creation state
    const [isCreatingNewClient, setIsCreatingNewClient] = React.useState(false);
    const [newClientName, setNewClientName] = React.useState('');
    const [newClientPhone, setNewClientPhone] = React.useState('');
    const [newClientEmail, setNewClientEmail] = React.useState('');

    // Quotes selection state
    const [clientQuotes, setClientQuotes] = React.useState<Quote[]>([]);
    const [selectedQuoteId, setSelectedQuoteId] = React.useState<string>('');

    // Assignment state
    const [measurers, setMeasurers] = React.useState<UserProfile[]>([]);
    const [assignedStaffId, setAssignedStaffId] = React.useState('');

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setClientSearchTerm(val);
        setIsDropdownOpen(true);
        if (selectedClient) {
            setSelectedClient(null);
            setSelectedClientId('');
        }
    };

    const handleInputClick = () => {
        if (!!preselectedQuote) return;
        setIsDropdownOpen(true);
    };

    const handleClearClient = () => {
        setSelectedClient(null);
        setSelectedClientId('');
        setClientSearchTerm('');
        setIsDropdownOpen(true);
        
        setZipCode('');
        setStreet('');
        setNumber('');
        setComplement('');
        setNeighborhood('');
        setCity('');
        setState('');
        setReference('');
        setCondominium('');
    };

    const handleSelectClient = (client: Client) => {
        setSelectedClient(client);
        setSelectedClientId(client.id);
        setClientSearchTerm(client.name || '');
        setIsDropdownOpen(false);

        setZipCode(client.zipCode || '');
        setStreet(client.street || '');
        setNumber(client.number || '');
        setComplement(client.complement || '');
        setNeighborhood(client.neighborhood || '');
        setCity(client.city || '');
        setState(client.state || '');
        setReference(client.reference || '');
        setCondominium(client.condominium || '');
    };

    const handleToggleNewClient = () => {
        const nextState = !isCreatingNewClient;
        setIsCreatingNewClient(nextState);
        if (nextState) {
            setSelectedClient(null);
            setSelectedClientId('');
            setClientSearchTerm('');
            setIsDropdownOpen(false);
        }
    };

    const filteredClients = React.useMemo(() => {
        const term = selectedClient ? '' : clientSearchTerm.toLowerCase().trim();
        if (!term) return clients || [];
        
        const termWords = term.split(' ').filter(Boolean);
        
        return (clients || []).filter(c => {
            const displayInfo = getClientDisplayInfo(c);
            return termWords.every(w => displayInfo.searchText.includes(w));
        });
    }, [clients, clientSearchTerm, selectedClient]);

    // Diagnostic logging for Wagner Belo
    React.useEffect(() => {
        if (!clients || clients.length === 0) return;
        const wagnerDiagnostics = clients
            .filter(client => JSON.stringify(client).toLowerCase().includes('wagner'))
            .map(client => ({
                id: client.id,
                name: client.name,
                customerName: (client as any).customerName,
                companyId: client.companyId,
                active: client.active,
                archived: client.archived,
                deleted: client.deleted,
                status: client.status
            }));
            
        if (wagnerDiagnostics.length > 0) {
            console.info('[MeasurementClientSelector] Wagner Belo diagnostics', wagnerDiagnostics);
        }
    }, [clients]);

    // Click outside handler
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Initial preselection / fetch client
    React.useEffect(() => {
        if (initialMeasurement) return;
        const fetchInitialClient = async () => {
            if (hasPrefilledRef.current) return;
            
            if (preselectedQuote?.observations) {
                setParsedObs(prev => prev || preselectedQuote.observations || '');
            }

            const targetId = preselectedQuote?.clientId || preselectedClientId;
            if (!targetId) return;

            const found = (clients || []).find(c => c.id === targetId);
            if (found) {
                setSelectedClient(found);
                setSelectedClientId(targetId);
                setClientSearchTerm(found.name || '');
                hasPrefilledRef.current = true;
                return;
            }

            try {
                const { doc, getDoc } = await import('firebase/firestore');
                const docRef = doc(db, 'clients', targetId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const fetchedClient = { id: docSnap.id, ...docSnap.data() } as Client;
                    setSelectedClient(fetchedClient);
                    setSelectedClientId(targetId);
                    setClientSearchTerm(fetchedClient.name || '');
                    hasPrefilledRef.current = true;
                }
            } catch (err) {
                console.error("Error fetching selected client:", err);
            }
        };

        fetchInitialClient();
    }, [preselectedQuote, preselectedClientId, clients, initialMeasurement]);

    // Prefill data if editing an existing measurement
    React.useEffect(() => {
        if (initialMeasurement) {
            setSelectedClientId(initialMeasurement.clientId || '');
            setParsedTime(initialMeasurement.scheduledTime || '');
            setSelectedMaterial(initialMeasurement.material || '');
            setParsedObs(initialMeasurement.observations || initialMeasurement.notes || '');
            setLockedDate(initialMeasurement.scheduledDate || '');
            setType(initialMeasurement.type || 'measurement');
            setZipCode(initialMeasurement.zipCode || '');
            setStreet(initialMeasurement.street || '');
            setNumber(initialMeasurement.number || '');
            setComplement(initialMeasurement.complement || '');
            setNeighborhood(initialMeasurement.neighborhood || '');
            setCity(initialMeasurement.city || '');
            setState(initialMeasurement.state || '');
            setReference(initialMeasurement.reference || '');
            setCondominium(initialMeasurement.condominium || '');
            
            const staffId = initialMeasurement.assignedStaffId || 
                            initialMeasurement.measurerId || 
                            initialMeasurement.assignedMeasurerId || 
                            initialMeasurement.assignedTo || '';
            setAssignedStaffId(staffId);

            if (initialMeasurement.clientId) {
                const found = (clients || []).find(c => c.id === initialMeasurement.clientId);
                if (found) {
                    setSelectedClient(found);
                    setClientSearchTerm(found.name || '');
                } else {
                    import('firebase/firestore').then(({ doc, getDoc }) => {
                        getDoc(doc(db, 'clients', initialMeasurement.clientId!)).then(docSnap => {
                            if (docSnap.exists()) {
                                const fetchedClient = { id: docSnap.id, ...docSnap.data() } as Client;
                                setSelectedClient(fetchedClient);
                                setClientSearchTerm(fetchedClient.name || '');
                            }
                        });
                    });
                }
            }
        }
    }, [initialMeasurement, clients]);

    const [zipCode, setZipCode] = React.useState('');
    const [cepWarning, setCepWarning] = React.useState('');
    const [street, setStreet] = React.useState('');
    const [number, setNumber] = React.useState('');
    const [complement, setComplement] = React.useState('');
    const [neighborhood, setNeighborhood] = React.useState('');
    const [city, setCity] = React.useState('');
    const [state, setState] = React.useState('');
    const [reference, setReference] = React.useState('');
    const [condominium, setCondominium] = React.useState('');
    const [dateError, setDateError] = React.useState('');

    // Fetch Medidores
    React.useEffect(() => {
        if (!profile?.companyId) return;
        const q = query(
            collection(db, 'users'), 
            where('companyId', '==', profile.companyId),
            where('role', '==', 'medidor')
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = (snapshot.docs || []).map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
            setMeasurers(data);
        });
        return () => unsubscribe();
    }, [profile?.companyId]);

    // Fetch Client Quotes in real-time
    React.useEffect(() => {
        if (!selectedClientId || !profile?.companyId) {
            setClientQuotes([]);
            setSelectedQuoteId('');
            return;
        }

        const q = query(
            collection(db, 'orcamentos'),
            where('companyId', '==', profile.companyId),
            where('clientId', '==', selectedClientId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = (snapshot.docs || []).map(doc => ({ id: doc.id, ...doc.data() } as Quote));
            
            // Constante única para os estados em que uma medição ainda pode ser vinculada
            const ELIGIBLE_MEASUREMENT_STAGES = [
                'pre_orcamento',
                'draft',
                'sent',
                'negotiating',
                'aguardando_medicao',
                'pos_medicao' // Included because it might still be pending approval
            ];
            
            const activeQuotes = data.filter(q => {
                if (q.quoteStage === 'cancelado' || q.status === 'cancelado') return false;
                
                // Não permitir auto-seleção se estiver congelado, em contrato, produção, finalizado, etc.
                const isFrozen = q.isFrozen || false;
                const stage = q.quoteStage || '';
                
                if (stage === 'aprovado' || stage === 'approved') return !isFrozen;
                
                return ELIGIBLE_MEASUREMENT_STAGES.includes(stage);
            });
            
            setClientQuotes(activeQuotes);
            
            if (activeQuotes.length === 1) {
                setSelectedQuoteId(activeQuotes[0].id);
            } else if (!activeQuotes.some(q => q.id === selectedQuoteId)) {
                setSelectedQuoteId('');
            }
        });

        return () => unsubscribe();
    }, [selectedClientId, profile?.companyId]);

    React.useEffect(() => {
        if (isCreatingNewClient) return; // Não limpa ou auto-preenche se estiver cadastrando novo
        if (!selectedClient) {
            setZipCode('');
            setStreet('');
            setNumber('');
            setComplement('');
            setNeighborhood('');
            setCity('');
            setState('');
            setReference('');
            setCondominium('');
            return;
        }

        setZipCode(selectedClient.zipCode || '');
        setStreet(selectedClient.street || '');
        setNumber(selectedClient.number || '');
        setComplement(selectedClient.complement || '');
        setNeighborhood(selectedClient.neighborhood || '');
        setCity(selectedClient.city || '');
        setState(selectedClient.state || '');
        setReference(selectedClient.reference || '');
        setCondominium(selectedClient.condominium || '');
    }, [selectedClient, isCreatingNewClient]);

    const handleZipCodeLookup = async (value: string) => {
        const cleanCEP = String(value || '').replace(/\D/g, '');
        setZipCode(cleanCEP);
        if (cleanCEP.length !== 8) return;

        try {
            const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
            const data = await response.json();
            if (!data.erro) {
                if (!street) setStreet(data.logradouro || '');
                if (!neighborhood) {
                    if (data.bairro) {
                        setNeighborhood(data.bairro);
                        setCepWarning('');
                    } else {
                        setCepWarning('Bairro não encontrado pelo CEP, preencha manualmente.');
                    }
                } else {
                    setCepWarning('');
                }
                if (!city) setCity(data.localidade || '');
                if (!state) setState(data.uf || '');
            } else {
                setCepWarning('');
            }
        } catch (error) {
            console.error("Error fetching CEP:", error);
        }
    };

    const getLocalTodayString = () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getLocalTimeString = () => {
        const d = new Date();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    };

    const objectUrlRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        return () => {
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
            }
        };
    }, []);

    const sanitizeFileName = (fileName: string): string => {
        const dotIndex = fileName.lastIndexOf('.');
        const ext = dotIndex !== -1 ? fileName.substring(dotIndex) : '';
        let base = dotIndex !== -1 ? fileName.substring(0, dotIndex) : fileName;

        base = base.replace(/[\/\\?%*:|"<>\s]/g, '_');
        base = base.replace(/[^a-zA-Z0-9_\-]/g, '');
        base = base.substring(0, 100);

        if (!base) {
            base = 'file';
        }

        return `${base}${ext}`;
    };

    const getPreviewUrl = (file: File) => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
        }
        const url = URL.createObjectURL(file);
        objectUrlRef.current = url;
        return url;
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setDateError('');

        const formData = new FormData(e.currentTarget);
        const submitDate = (formData.get('scheduledDate') as string) || lockedDate;
        const submitTime = (formData.get('scheduledTime') as string) || parsedTime;

        if (!submitDate || !submitTime) {
            setDateError('Por favor, informe a data e o horário.');
            return;
        }

        const todayStr = getLocalTodayString();
        
        // Validação 1: Data Passada
        if (!initialMeasurement && submitDate < todayStr) {
            setDateError('Não é possível agendar medição em data passada.');
            return;
        }

        // Validação 2: Horário Passado para Hoje
        if (!initialMeasurement && submitDate === todayStr) {
            const currentTimeStr = getLocalTimeString();
            if (submitTime < currentTimeStr) {
                setDateError('Para hoje, selecione um horário posterior ao horário atual.');
                return;
            }
        }

        setIsSubmitting(true);
        setUploadProgress(0);

        let uploadedPath: string | null = null;
        try {
            let finalClientId = selectedClientId;
            let finalCustomerName = '';
            let finalPhone = '';

            if (isCreatingNewClient) {
                if (!newClientName.trim()) {
                    setDateError('Por favor, informe o nome do novo cliente.');
                    setIsSubmitting(false);
                    return;
                }
                const newId = await addClient({
                    name: newClientName.trim(),
                    phone: newClientPhone.trim(),
                    email: newClientEmail.trim(),
                    zipCode,
                    street,
                    number,
                    complement,
                    neighborhood,
                    city,
                    state,
                    reference,
                    condominium,
                    status: 'active'
                });
                finalClientId = newId;
                finalCustomerName = newClientName.trim();
                finalPhone = newClientPhone.trim();
            } else {
                const currentClient = selectedClient || (clients || []).find(c => c.id === selectedClientId);
                if (!currentClient) {
                    setDateError('Por favor, selecione um cliente.');
                    setIsSubmitting(false);
                    return;
                }
                finalClientId = currentClient.id;
                finalCustomerName = currentClient.name || '';
                finalPhone = currentClient.phone || '';
            }

            const selectedMeasurer = (measurers || []).find(m => m.uid === assignedStaffId);
            let measurerUid = selectedMeasurer?.uid || selectedMeasurer?.id || assignedStaffId || '';
            let measurerName = selectedMeasurer?.name || selectedMeasurer?.displayName || selectedMeasurer?.email || '';

            // Rule 3: Se estiver editando uma medição existente e assignedStaffId vier vazio por erro de renderização, manter os dados já existentes da medição.
            if (initialMeasurement && !assignedStaffId) {
                measurerUid = initialMeasurement.assignedStaffId || 
                              initialMeasurement.measurerId || 
                              initialMeasurement.assignedMeasurerId || 
                              initialMeasurement.assignedTo || '';
                measurerName = initialMeasurement.assignedStaffName || 
                               initialMeasurement.measurerName || 
                               initialMeasurement.assignedMeasurerName || 
                               initialMeasurement.assignedToName || '';
            }

            const cleanNumber = (number && !['null', 'undefined', '-', ''].includes(String(number).trim().toLowerCase())) ? number.trim() : '';
            const compiledAddress = `${String(street || '')}${cleanNumber ? `, ${cleanNumber}` : ''}${complement ? ` - ${complement}` : ''} - ${String(neighborhood || '')}, ${String(city || '')} - ${String(state || '')}${zipCode ? `, CEP: ${zipCode}` : ''}`;

            const activeQuoteId = preselectedQuote?.id || selectedQuoteId || '';
            const originValue = activeQuoteId ? 'quote' : 'manual_sem_orcamento';

            const pregeneratedId = initialMeasurement?.id || doc(collection(db, 'medicoes')).id;
            let attachmentData: MeasurementAttachment | null = null;

            if (selectedFile) {
                const sanitized = sanitizeFileName(selectedFile.name);
                const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${sanitized}`;
                const storagePath = `companies/${profile?.companyId || 'general'}/medicoes/${pregeneratedId}/attachments/${uniqueFileName}`;
                
                uploadedPath = storagePath;
                
                // Upload file
                const storageRef = ref(storage, storagePath);
                const uploadTask = uploadBytesResumable(storageRef, selectedFile);
                
                await new Promise<void>((resolve, reject) => {
                    uploadTask.on('state_changed', 
                        (snapshot) => {
                            const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                            setUploadProgress(progress);
                        }, 
                        (error) => reject(error), 
                        () => resolve()
                    );
                });
                
                const downloadUrl = await getDownloadURL(storageRef);
                
                attachmentData = {
                    originalName: selectedFile.name,
                    storageFileName: uniqueFileName,
                    storagePath: storagePath,
                    mimeType: selectedFile.type || 'application/octet-stream',
                    size: selectedFile.size,
                    uploadedAt: new Date().toISOString(),
                    uploadedBy: user?.uid || ''
                };
            }

            const data: Omit<Measurement, 'id' | 'createdAt' | 'status'> & { measurementAttachment?: MeasurementAttachment | null } = {
                clientId: finalClientId,
                quoteId: activeQuoteId || null as any,
                customerName: finalCustomerName,
                clientName: finalCustomerName,
                phone: finalPhone,
                address: compiledAddress,
                zipCode,
                street,
                number: cleanNumber,
                complement,
                neighborhood,
                city,
                state,
                reference,
                condominium,
                assignedStaffId: measurerUid || null as any,
                assignedStaffName: measurerName || '',
                measurerId: measurerUid || null as any,
                measurerName: measurerName || '',
                assignedMeasurerId: measurerUid || null as any,
                assignedMeasurerName: measurerName || '',
                assignedTo: measurerUid || null as any,
                assignedToName: measurerName || '',
                scheduledAt: toISODateSafe(new Date(submitDate + 'T' + (submitTime || '00:00') + ':00')),
                scheduledDate: submitDate,
                scheduledTime: submitTime,
                type: type,
                material: String(selectedMaterial || ''),
                observations: String(formData.get('observations') || ''),
                notes: String(formData.get('observations') || ''),
                userId: user?.uid || '',
                companyId: profile?.companyId || '',
                sellerName: String(profile?.name || ''),
                origin: originValue,
                updatedAt: toISODateSafe(new Date()),
                measurementAttachment: shouldRemoveFile ? null : (attachmentData || initialMeasurement?.measurementAttachment || null)
            };

            await onSubmit(data, pregeneratedId);

            // Clean up old file if we substituted or removed it
            if (selectedFile && initialMeasurement?.measurementAttachment?.storagePath) {
                try {
                    const expectedPrefix = `companies/${profile?.companyId || 'general'}/medicoes/${initialMeasurement.id}/attachments/`;
                    if (initialMeasurement.measurementAttachment.storagePath.startsWith(expectedPrefix)) {
                        const oldFileRef = ref(storage, initialMeasurement.measurementAttachment.storagePath);
                        await deleteObject(oldFileRef);
                    }
                } catch (delErr) {
                    console.error("[MeasurementForm] Falha ao excluir anexo antigo:", delErr);
                }
            } else if (shouldRemoveFile && initialMeasurement?.measurementAttachment?.storagePath) {
                try {
                    const expectedPrefix = `companies/${profile?.companyId || 'general'}/medicoes/${initialMeasurement.id}/attachments/`;
                    if (initialMeasurement.measurementAttachment.storagePath.startsWith(expectedPrefix)) {
                        const oldFileRef = ref(storage, initialMeasurement.measurementAttachment.storagePath);
                        await deleteObject(oldFileRef);
                    }
                } catch (delErr) {
                    console.error("[MeasurementForm] Falha ao excluir anexo removido:", delErr);
                }
            }

        } catch (err: any) {
            console.error("Error saving client/measurement:", err);
            
            // COMPENSATION LOGIC: If upload succeeded but firestore failed, clean up the uploaded file
            if (uploadedPath) {
                try {
                    const fileRef = ref(storage, uploadedPath);
                    await deleteObject(fileRef);
                } catch (cleanupError) {
                    console.error('[MeasurementForm] Falha ao limpar upload órfão:', cleanupError);
                }
            }

            setDateError(err.message || 'Não foi possível enviar o arquivo. A medição não foi agendada. Tente novamente.');
        } finally {
            setIsSubmitting(false);
            setUploadProgress(0);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Tipo de Agendamento */}
                <div className="space-y-3 md:col-span-2 mb-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Modalidade do Atendimento</label>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <label className={cn("flex-1 p-4 border-2 rounded-2xl cursor-pointer transition-all flex items-center gap-4", type === 'measurement' ? "border-brand-emerald bg-brand-emerald/5" : "border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50")}>
                            <input type="radio" name="type" value="measurement" className="sr-only" checked={type === 'measurement'} onChange={() => setType('measurement')} />
                            <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0", type === 'measurement' ? "border-brand-emerald" : "border-slate-300 dark:border-slate-600")}>
                                {type === 'measurement' && <div className="w-2.5 h-2.5 rounded-full bg-brand-emerald" />}
                            </div>
                            <span className="font-bold text-sm text-slate-800 dark:text-slate-200">Medição Técnica na Obra</span>
                        </label>
                        <label className={cn("flex-1 p-4 border-2 rounded-2xl cursor-pointer transition-all flex items-center gap-4", type === 'store_visit' ? "border-purple-500 bg-purple-50 dark:bg-purple-900/10" : "border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50")}>
                            <input type="radio" name="type" value="store_visit" className="sr-only" checked={type === 'store_visit'} onChange={() => setType('store_visit')} />
                            <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0", type === 'store_visit' ? "border-purple-500" : "border-slate-300 dark:border-slate-600")}>
                                {type === 'store_visit' && <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />}
                            </div>
                            <span className="font-bold text-sm text-slate-800 dark:text-slate-200">Visita na Loja / Fechamento</span>
                        </label>
                    </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                    <div className="flex items-center justify-between ml-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Identificação do Cliente</label>
                        {!!preselectedQuote && (
                            <span className="text-[9px] font-bold text-amber-600 uppercase flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                <Lock className="w-2.5 h-2.5" /> Cliente definido pelo orçamento
                            </span>
                        )}
                    </div>
                    
                    {isCreatingNewClient ? (
                        <div className="space-y-4 p-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50">
                            <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">Novos Dados Cadastrais</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Nome Completo *</label>
                                    <Input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} required={isCreatingNewClient} placeholder="Nome do cliente" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Telefone / Celular</label>
                                    <Input value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} placeholder="(11) 99999-9999" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">E-mail</label>
                                    <Input value={newClientEmail} type="email" onChange={(e) => setNewClientEmail(e.target.value)} placeholder="cliente@email.com" />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="relative" ref={dropdownRef}>
                            <div className="relative flex items-center">
                                <Search className="absolute left-4 h-4 w-4 text-slate-400" />
                                <Input
                                    type="text"
                                    placeholder="Pesquisar cliente na base..."
                                    value={selectedClient ? selectedClient.name : clientSearchTerm}
                                    onChange={handleInputChange}
                                    onClick={handleInputClick}
                                    disabled={!!preselectedQuote}
                                    className="pl-11 pr-28 h-12 rounded-2xl font-bold bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 focus:border-brand-emerald"
                                />
                                {selectedClient && !preselectedQuote && (
                                    <button
                                        type="button"
                                        onClick={handleClearClient}
                                        className="absolute right-3 px-2 py-1 text-[10px] uppercase font-black bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
                                    >
                                        Trocar cliente
                                    </button>
                                )}
                            </div>

                            {/* Dropdown Panel */}
                            {isDropdownOpen && !isCreatingNewClient && (
                                <div className="absolute z-50 mt-2 w-full min-w-[300px] rounded-2xl border-2 border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-2 max-h-[280px] overflow-y-auto">
                                    {filteredClients.length > 0 ? (
                                        filteredClients.map((client) => {
                                            const displayInfo = getClientDisplayInfo(client);
                                            return (
                                                <div
                                                    key={client.id}
                                                    onClick={() => handleSelectClient(client)}
                                                    className="px-4 py-3 rounded-xl cursor-pointer text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors mb-1"
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-800 dark:text-slate-200">{displayInfo.name}</span>
                                                        <span className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-wide">
                                                            {displayInfo.formattedPhone}
                                                        </span>
                                                        {displayInfo.addressLabel && (
                                                            <span className="text-[9px] text-slate-400 font-medium mt-0.5 tracking-wide">
                                                                {displayInfo.addressLabel}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="px-3 py-6 text-center text-slate-400 text-sm font-medium">
                                            Nenhum cliente encontrado
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {!preselectedQuote && (
                        <button
                            type="button"
                            onClick={handleToggleNewClient}
                            className="mt-2 text-xs font-bold text-emerald-600 hover:text-emerald-700 underline block text-left"
                        >
                            {isCreatingNewClient ? "Selecionar cliente existente" : "Cadastrar novo cliente"}
                        </button>
                    )}
                    <input type="hidden" name="clientId" value={selectedClientId} />
                </div>

                {/* Seletor de Orçamento (Opcional, se o cliente tiver orçamentos) */}
                {!preselectedQuote && !isCreatingNewClient && clientQuotes.length > 0 && (
                    <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Vincular a um Orçamento Existente (Opcional)</label>
                        <select
                            value={selectedQuoteId}
                            onChange={(e) => setSelectedQuoteId(e.target.value)}
                            className="flex h-12 w-full rounded-2xl border-2 border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald font-bold transition-all shadow-sm"
                        >
                            <option value="">Nenhum orçamento - Agendar sem orçamento</option>
                            {clientQuotes.map(q => (
                                <option key={q.id} value={q.id}>
                                    Orçamento #{q.id.substring(0, 8)} - {(q.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ({q.createdAt ? new Date(q.createdAt).toLocaleDateString('pt-BR') : 'Sem data'})
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Atribuir Medidor */}
                <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Medidor Responsável</label>
                    <select
                        value={assignedStaffId}
                        onChange={(e) => setAssignedStaffId(e.target.value)}
                        className="flex h-12 w-full rounded-2xl border-2 border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald font-bold transition-all shadow-sm"
                    >
                        <option value="">Selecione um medidor (Opcional)</option>
                        {safeArray(measurers).map(m => (
                            <option key={m.uid} value={m.uid}>{m.name}</option>
                        ))}
                    </select>
                </div>

                {/* Data e Hora */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:col-span-2">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Data Agendada</label>
                        <DatePicker
                            value={lockedDate}
                            onChange={(val) => setLockedDate(val)}
                            disabled={isDateLocked}
                            minDate={new Date()}
                            placeholder="Selecione a data..."
                        />
                        <input type="hidden" name="scheduledDate" value={lockedDate} required />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Horário Previsto</label>
                        <Input name="scheduledTime" type="time" value={parsedTime} onChange={(e) => setParsedTime(e.target.value)} required className="h-12 rounded-2xl" />
                    </div>
                </div>

                {/* Arquivo para o Medidor */}
                <div className="md:col-span-2 space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
                        <Paperclip className="h-4 w-4 text-brand-emerald" /> Arquivo para o Medidor (Opcional)
                    </h3>
                    <p className="text-xs text-slate-400 -mt-2 ml-6">
                        Anexe um projeto, planta ou referência para auxiliar na medição.
                    </p>
                    
                    <div className="ml-6">
                        {/* If we have a selected file or an existing attachment */}
                        {selectedFile || (initialMeasurement?.measurementAttachment && !shouldRemoveFile) ? (
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                                <div className="flex items-center gap-3 min-w-0">
                                    <FileText className="w-8 h-8 text-brand-emerald shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-250 truncate">
                                            {selectedFile ? selectedFile.name : initialMeasurement?.measurementAttachment?.originalName}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {selectedFile 
                                                ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB` 
                                                : initialMeasurement?.measurementAttachment?.size 
                                                    ? `${(initialMeasurement.measurementAttachment.size / (1024 * 1024)).toFixed(1)} MB` 
                                                    : ''}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const fileUrl = selectedFile 
                                                ? getPreviewUrl(selectedFile) 
                                                : initialMeasurement?.measurementAttachment?.url;
                                            // Fallback dynamically fetch download url if it's editing existing attachment (no url in structure)
                                            if (fileUrl) {
                                                window.open(fileUrl, '_blank');
                                            } else if (initialMeasurement?.measurementAttachment?.storagePath) {
                                                getDownloadURL(ref(storage, initialMeasurement.measurementAttachment.storagePath))
                                                    .then(url => window.open(url, '_blank'))
                                                    .catch(err => alert("Erro ao gerar link do arquivo: " + err));
                                            }
                                        }}
                                        className="h-9 px-4 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-650 dark:text-slate-300 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors"
                                    >
                                        Visualizar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (window.confirm('Deseja remover o arquivo anexo?')) {
                                                setSelectedFile(null);
                                                if (initialMeasurement?.measurementAttachment) {
                                                    setShouldRemoveFile(true);
                                                }
                                                if (fileInputRef.current) {
                                                    fileInputRef.current.value = '';
                                                }
                                            }
                                        }}
                                        className="h-9 px-4 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors"
                                    >
                                        Remover
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-slate-50/50 dark:bg-slate-900/30 text-center hover:bg-slate-50 transition-colors">
                                <label className="cursor-pointer flex flex-col items-center gap-2 justify-center">
                                    <Paperclip className="w-8 h-8 text-slate-400 hover:text-brand-emerald transition-colors" />
                                    <span className="text-xs font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">+ Adicionar arquivo</span>
                                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">PDF, JPG, PNG ou WEBP (Max 10MB)</span>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        className="hidden" 
                                        accept=".pdf,image/*" 
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const extValid = /\.(pdf|jpg|jpeg|png|webp)$/i.test(file.name);
                                                const typeValid = file.type === 'application/pdf' || file.type.startsWith('image/');
                                                if (!extValid || !typeValid) {
                                                    alert('Tipo de arquivo não permitido. Selecione apenas PDF ou imagem (JPG, PNG, WEBP).');
                                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                                    return;
                                                }
                                                if (file.size > 10 * 1024 * 1024) {
                                                    alert('O arquivo não pode exceder o limite de 10MB.');
                                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                                    return;
                                                }
                                                setSelectedFile(file);
                                                setShouldRemoveFile(false);
                                            }
                                        }} 
                                    />
                                </label>
                            </div>
                        )}
                    </div>
                </div>

                {isSubmitting && uploadProgress > 0 && (
                    <div className="md:col-span-2 ml-6 mt-2">
                        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden shadow-inner">
                            <div className="bg-brand-emerald h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1 text-right">
                            Enviando arquivo... {uploadProgress}%
                        </p>
                    </div>
                )}

                {/* Localização */}
                <div className="md:col-span-2 space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-brand-emerald" /> Dados de Localização
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">CEP</label>
                            <Input value={zipCode} onChange={(e) => handleZipCodeLookup(e.target.value)} placeholder="00000-000" className="h-11 rounded-xl" />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Rua / Logradouro *</label>
                            <Input value={street} onChange={(e) => setStreet(e.target.value)} required placeholder="Rua, Avenida..." className="h-11 rounded-xl" />
                        </div>
                        
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Número</label>
                            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="123" className="h-11 rounded-xl" />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Complemento</label>
                            <Input value={complement} onChange={(e) => setComplement(e.target.value)} placeholder="Apto, Bloco, Casa..." className="h-11 rounded-xl" />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Condomínio</label>
                            <Input value={condominium} onChange={(e) => setCondominium(e.target.value)} placeholder="Residencial..." className="h-11 rounded-xl" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Bairro *</label>
                            <Input value={neighborhood} onChange={(e) => { setNeighborhood(e.target.value); if (e.target.value) setCepWarning(''); }} required placeholder="Bairro" className="h-11 rounded-xl" />
                            {cepWarning && (
                                <p className="text-[10px] text-amber-600 font-bold ml-1 mt-0.5">{cepWarning}</p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Cidade *</label>
                            <Input value={city} onChange={(e) => setCity(e.target.value)} required placeholder="Cidade" className="h-11 rounded-xl" />
                        </div>
                        
                        <div className="space-y-1 md:col-span-3">
                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Ponto de Referência</label>
                            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ex: Próximo ao mercado..." className="h-11 rounded-xl" />
                        </div>
                    </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Material Predominante</label>
                    <SearchableSelect 
                        value={selectedMaterial}
                        options={(materials || []).map(m => ({
                            value: String(m?.name || ''),
                            label: String(m?.name || '')
                        }))}
                        onChange={(val) => setSelectedMaterial(val)}
                        placeholder="Selecione o material da obra..."
                    />
                    <input type="hidden" name="material" value={selectedMaterial} />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Instruções Adicionais</label>
                <textarea
                    name="observations"
                    value={parsedObs}
                    onChange={(e) => setParsedObs(e.target.value)}
                    className="flex min-h-[100px] w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald font-medium transition-all dark:border-slate-800 dark:bg-slate-900"
                    placeholder="Detalhes para o medidor..."
                />
            </div>

            <div className="pt-4">
                {dateError && (
                    <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-full bg-rose-100 p-2">
                                <Lock className="h-4 w-4 text-rose-600" />
                            </div>
                            <div>
                                <h3 className="text-xs font-black uppercase text-rose-800">Agendamento Bloqueado</h3>
                                <p className="text-xs font-medium text-rose-600 mt-0.5">{dateError}</p>
                            </div>
                        </div>
                    </div>
                )}
                <Button
                    type="submit"
                    disabled={isSubmitting || (!selectedClientId && !isCreatingNewClient)}
                    className="w-full h-14 bg-brand-emerald hover:bg-emerald-600 text-white rounded-2xl shadow-xl shadow-brand-emerald/20 font-black uppercase text-xs tracking-widest transition-all"
                >
                    {isSubmitting ? (
                        <div className="flex items-center gap-2">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span>Agendando...</span>
                        </div>
                    ) : (
                        <span>Confirmar Agendamento</span>
                    )}
                </Button>
            </div>
        </form>
    );
};

const Loader2 = ({ className }: { className?: string }) => (
    <svg className={cn("animate-spin", className)} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
);
