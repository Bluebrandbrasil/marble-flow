import { safeArray } from '../../lib/dataDiagnostics';
import { compareDatesSafe } from '../../lib/dateUtils';
import { toISODateSafe } from '../../lib/dateWriteUtils';
import React, { useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, messaging, storage } from '../../lib/firebase';
import { getToken } from 'firebase/messaging';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';
import type { Measurement } from '../../types';
import { isSameDay } from 'date-fns';
import { 
    MapPin, 
    ChevronRight, 
    CheckCircle2, 
    Copy, 
    Navigation,
    X,
    FileText,
    Info,
    Clock,
    AlertCircle,
    Phone,
    Calendar,
    MessageSquare,
    Plus,
    Menu,
    LogOut,
    UploadCloud,
    Trash2,
    Image as ImageIcon,
    Paperclip
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { cn, safeString } from '../../lib/utils';
import { safeSplit } from '../../lib/dataDiagnostics';

// Deterministic SHA-256 helper for client-side hashing
async function sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const MeasurerView: React.FC = () => {
    const { profile, logout } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
    const [hasFCMToken, setHasFCMToken] = React.useState(false);
    const [promptDismissed, setPromptDismissed] = React.useState(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('notificationPromptDismissed') === 'true';
    });

    const [notificationPermission, setNotificationPermission] = React.useState<NotificationPermission>(
        typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
    );

    const [notificationFeedback, setNotificationFeedback] = React.useState<{
        message: string;
        type: 'success' | 'error' | 'info' | 'warning' | null;
    }>({ message: '', type: null });
    const [isRequestingNotifications, setIsRequestingNotifications] = React.useState(false);

    // Notification permission & iOS banners state
    const [showIOSBanner, setShowIOSBanner] = React.useState(() => {
        if (typeof window === 'undefined') return false;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
        return isIOS && !isStandalone && !localStorage.getItem('dismiss_ios_pwa_banner');
    });

    // Check if user has active tokens in Firestore
    React.useEffect(() => {
        if (!profile?.uid) return;

        const tokensRef = collection(db, 'users', profile.uid, 'notificationTokens');
        const q = query(tokensRef, where('active', '==', true));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setHasFCMToken(!snapshot.empty);
        }, (err) => {
            console.error("Error checking notification tokens:", err);
        });

        return () => unsubscribe();
    }, [profile?.uid]);

    // Keep permission state in sync on mount
    React.useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setNotificationPermission(Notification.permission);
        }
    }, []);

    const [measurements, setMeasurements] = React.useState<Measurement[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [selectedMeasurement, setSelectedMeasurement] = React.useState<Measurement | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);
    const [filter, setFilter] = React.useState<'today' | 'upcoming' | 'completed'>('today');

    // Modals State
    const [isRescheduleModalOpen, setIsRescheduleModalOpen] = React.useState(false);
    const [reschedulingMeasurement, setReschedulingMeasurement] = React.useState<Measurement | null>(null);
    const [newRescheduleDate, setNewRescheduleDate] = React.useState('');
    const [newRescheduleTime, setNewRescheduleTime] = React.useState('');
    const [rescheduleReason, setRescheduleReason] = React.useState('');

    const [isObservationModalOpen, setIsObservationModalOpen] = React.useState(false);
    const [observationMeasurement, setObservationMeasurement] = React.useState<Measurement | null>(null);
    const [newObservationText, setNewObservationText] = React.useState('');

    const [uploadingPhotos, setUploadingPhotos] = React.useState<Record<string, number>>({});

    const [attachmentUrl, setAttachmentUrl] = React.useState<string | null>(null);
    const [isLoadingUrl, setIsLoadingUrl] = React.useState(false);

    React.useEffect(() => {
        if (selectedMeasurement?.measurementAttachment?.storagePath) {
            if (selectedMeasurement.measurementAttachment.mimeType.startsWith('image/')) {
                getDownloadURL(ref(storage, selectedMeasurement.measurementAttachment.storagePath))
                    .then(url => setAttachmentUrl(url))
                    .catch(err => console.error("Error loading preview URL in mobile drawer:", err));
            }
        } else {
            setAttachmentUrl(null);
        }
    }, [selectedMeasurement]);

    const handleOpenAttachment = async () => {
        if (!selectedMeasurement?.measurementAttachment?.storagePath) return;
        setIsLoadingUrl(true);
        try {
            const url = await getDownloadURL(ref(storage, selectedMeasurement.measurementAttachment.storagePath));
            window.open(url, '_blank');
        } catch (err) {
            console.error("Error opening attachment:", err);
            alert("Erro ao abrir o arquivo.");
        } finally {
            setIsLoadingUrl(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'environment' | 'technical', measurementId: string) => {
        const files = Array.from(e.target.files || []);
        if (!files.length || !profile?.companyId || !profile?.uid) return;

        e.target.value = ''; // clear input

        for (const file of files) {
            if (!file.type.startsWith('image/')) {
                alert('Apenas arquivos de imagem são permitidos.');
                continue;
            }
            if (file.size > 10 * 1024 * 1024) {
                alert('O tamanho máximo permitido é de 10MB por imagem.');
                continue;
            }

            const cleanFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const uniqueFileName = `${Date.now()}_${cleanFileName}`;
            const storagePath = `companies/${profile.companyId}/medicoes/${measurementId}/photos/${type}/${uniqueFileName}`;
            const storageRef = ref(storage, storagePath);

            const uploadTask = uploadBytesResumable(storageRef, file);
            
            // set initial progress
            setUploadingPhotos(prev => ({ ...prev, [storagePath]: 0 }));

            uploadTask.on('state_changed', 
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setUploadingPhotos(prev => ({ ...prev, [storagePath]: progress }));
                },
                (error) => {
                    console.error("Error uploading photo:", error);
                    alert("Erro ao enviar foto: " + error.message);
                    setUploadingPhotos(prev => {
                        const next = { ...prev };
                        delete next[storagePath];
                        return next;
                    });
                },
                async () => {
                    try {
                        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                        
                        const newPhoto = {
                            url: downloadURL,
                            storagePath,
                            fileName: file.name,
                            uploadedAt: new Date().toISOString(),
                            uploadedBy: profile.uid,
                            uploadedByName: profile.name,
                            type
                        };

                        const measurementRef = doc(db, 'medicoes', measurementId);
                        const fieldToUpdate = type === 'environment' ? 'environmentPhotos' : 'technicalMeasurementPhotos';
                        
                        await updateDoc(measurementRef, {
                            [fieldToUpdate]: arrayUnion(newPhoto)
                        });
                    } catch (err) {
                        console.error("Error updating measurement with photo:", err);
                        alert("Erro ao salvar foto na medição.");
                    } finally {
                        setUploadingPhotos(prev => {
                            const next = { ...prev };
                            delete next[storagePath];
                            return next;
                        });
                    }
                }
            );
        }
    };

    const handleDeletePhoto = async (measurementId: string, photo: any) => {
        if (!confirm('Deseja realmente excluir esta foto?')) return;
        
        try {
            const photoRef = ref(storage, photo.storagePath);
            await deleteObject(photoRef);
            
            const measurementRef = doc(db, 'medicoes', measurementId);
            const fieldToUpdate = photo.type === 'environment' ? 'environmentPhotos' : 'technicalMeasurementPhotos';
            await updateDoc(measurementRef, {
                [fieldToUpdate]: arrayRemove(photo)
            });
        } catch (err) {
            console.error("Error deleting photo:", err);
            alert("Erro ao excluir foto.");
        }
    };

    // Fetch measurements assigned to me
    React.useEffect(() => {
        if (!profile?.uid || !profile?.companyId) return;

        // Fetch all measurements of the company to allow flexible frontend filtering (OR queries for compatibility)
        const q = query(
            collection(db, 'medicoes'),
            where('companyId', '==', profile.companyId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allDocs = (snapshot.docs || []).map(doc => ({ id: doc.id, ...doc.data() } as Measurement));
            
            // Filter by medidor UID compatibility fields
            // Always show unassigned measurements so they are not lost
            const filtered = allDocs.filter(m => 
                !m.assignedStaffId ||
                m.assignedStaffId === profile.uid ||
                m.measurerId === profile.uid ||
                m.assignedMeasurerId === profile.uid ||
                m.assignedTo === profile.uid ||
                (profile.email && (
                    m.assignedStaffEmail === profile.email ||
                    m.measurerEmail === profile.email ||
                    m.assignedToEmail === profile.email
                ))
            );

            setMeasurements(filtered);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching measurements:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [profile?.uid, profile?.companyId]);

    // Console table trace for auditing visibility
    React.useEffect(() => {
        if (import.meta.env.DEV && measurements.length > 0) {
            const todaySP = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
            const traceData = measurements.map(m => {
                const isCompleted = ['completed', 'concluida', 'finalizada'].includes(m.status || '');
                const isHidden = ['completed', 'concluida', 'finalizada', 'cancelled', 'cancelada', 'deleted', 'declined'].includes(m.status || '');
                const matchesUid = m.assignedStaffId === profile?.uid ||
                                   m.measurerId === profile?.uid ||
                                   m.assignedMeasurerId === profile?.uid ||
                                   m.assignedTo === profile?.uid;
                
                let visibilityReason = '';
                if (!matchesUid) {
                    visibilityReason = 'UID not assigned';
                } else if (isHidden && filter !== 'completed') {
                    visibilityReason = `Hidden status (${m.status}) in active view`;
                } else if (filter === 'today' && m.scheduledDate !== todaySP) {
                    visibilityReason = `Date (${m.scheduledDate}) is not today (${todaySP})`;
                } else if (filter === 'upcoming' && m.scheduledDate <= todaySP) {
                    visibilityReason = `Date (${m.scheduledDate}) is not future (> ${todaySP})`;
                } else if (filter === 'completed' && !isCompleted) {
                    visibilityReason = `Status (${m.status}) is not completed`;
                } else {
                    visibilityReason = 'VISIBLE';
                }

                return {
                    id: m.id,
                    cliente: m.clientName || m.customerName || '',
                    status: m.status || '',
                    scheduledDate: m.scheduledDate || '',
                    scheduledAt: m.scheduledAt || '',
                    assignedStaffId: m.assignedStaffId || '',
                    measurerId: m.measurerId || '',
                    assignedMeasurerId: m.assignedMeasurerId || '',
                    assignedTo: m.assignedTo || '',
                    currentUserUid: profile?.uid || '',
                    motivo: visibilityReason
                };
            });
            console.table(traceData);
        }
    }, [measurements, filter, profile?.uid]);

    const filteredMeasurements = useMemo(() => {
        const todaySP = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

        return safeArray(measurements).filter(m => {
            const rawDate = m.scheduledAt || m.scheduledDate || m.date || m.appointmentDate || '';
            const mDateStr = String(rawDate).split('T')[0].trim();
            if (!mDateStr) return false;

            const currentStatus = String(m.status || '').toLowerCase();
            const isCompleted = ['completed', 'concluida', 'finalizada'].includes(currentStatus);
            const isHidden = ['completed', 'concluida', 'finalizada', 'cancelled', 'cancelada', 'deleted', 'declined'].includes(currentStatus);

            if (filter === 'today') {
                return mDateStr === todaySP && !isHidden;
            }
            if (filter === 'upcoming') {
                return mDateStr > todaySP && !isHidden;
            }
            if (filter === 'completed') {
                return isCompleted;
            }
            return false;
        }).sort((a, b) => {
            const dateA = a.scheduledAt || a.scheduledDate || a.date || a.appointmentDate || '';
            const dateB = b.scheduledAt || b.scheduledDate || b.date || b.appointmentDate || '';
            return dateA.localeCompare(dateB);
        });
    }, [measurements, filter]);

    const handleDismissIOSBanner = () => {
        localStorage.setItem('dismiss_ios_pwa_banner', 'true');
        setShowIOSBanner(false);
    };

    const handleCopyAddress = (address: string) => {
        if (!address) return;
        navigator.clipboard.writeText(address)
            .then(() => alert('Endereço copiado para a área de transferência!'))
            .catch(err => {
                console.error('Erro ao copiar endereço:', err);
                alert('Não foi possível copiar o endereço.');
            });
    };

    const handleRequestPermission = async () => {
        setNotificationFeedback({ message: '', type: null });
        setIsRequestingNotifications(true);

        if (import.meta.env.DEV) {
            console.log("[FCM Diagnostic] Starting notification setup...");
            console.log("[FCM Diagnostic] Current permission state:", Notification.permission);
        }

        // 1. Check if 'Notification' is supported
        if (!('Notification' in window)) {
            setNotificationFeedback({
                message: "Este navegador não suporta notificações",
                type: "error"
            });
            setIsRequestingNotifications(false);
            return;
        }

        // 2. Check if permission is already 'denied'
        if (Notification.permission === 'denied') {
            setNotificationPermission('denied');
            setNotificationFeedback({
                message: "Permissão bloqueada no navegador. Siga as instruções abaixo para liberar manualmente.",
                type: "warning"
            });
            setIsRequestingNotifications(false);
            return;
        }

        try {
            // 3. Request permission
            const permissionResult = await Notification.requestPermission();
            setNotificationPermission(permissionResult);
            
            if (import.meta.env.DEV) {
                console.log("[FCM Diagnostic] requestPermission result:", permissionResult);
            }

            if (permissionResult !== 'granted') {
                setNotificationFeedback({
                    message: "Permissão bloqueada no navegador",
                    type: "error"
                });
                setIsRequestingNotifications(false);
                return;
            }

            // 4. Validate Push system dependencies
            if (!messaging) {
                if (import.meta.env.DEV) {
                    console.error("[FCM Diagnostic] Messaging is not supported or initialized (PushManager/ServiceWorker check failed).");
                }
                setNotificationFeedback({
                    message: "Este navegador não suporta notificações Push",
                    type: "error"
                });
                setIsRequestingNotifications(false);
                return;
            }

            // Validate Service Worker Registration
            if (!('serviceWorker' in navigator)) {
                throw new Error("Service Worker não suportado neste navegador");
            }

            if (import.meta.env.DEV) {
                console.log("[FCM Diagnostic] Checking Service Worker registration...");
            }

            const registration = await navigator.serviceWorker.ready;
            if (import.meta.env.DEV) {
                console.log("[FCM Diagnostic] Service Worker registration found & ready:", registration);
            }

            // Validate VAPID key
            const vapidKey = import.meta.env.VITE_FIREBASE_FCM_VAPID_KEY;
            if (!vapidKey) {
                throw new Error("VAPID Key do Firebase FCM não configurada no ambiente (VITE_FIREBASE_FCM_VAPID_KEY)");
            }
            if (import.meta.env.DEV) {
                console.log("[FCM Diagnostic] VAPID key verified:", vapidKey);
            }

            // Generate Token
            if (import.meta.env.DEV) {
                console.log("[FCM Diagnostic] Generating FCM Token...");
            }
            const token = await getToken(messaging, { 
                serviceWorkerRegistration: registration,
                vapidKey 
            });

            if (!token) {
                throw new Error("Não foi possível gerar o token do Firebase Messaging (retorno vazio)");
            }

            if (import.meta.env.DEV) {
                console.log("[FCM Diagnostic] Token generated successfully:", token);
            }

            // Persist token in Firestore
            if (profile?.uid && profile?.companyId) {
                if (import.meta.env.DEV) {
                    console.log("[FCM Diagnostic] Persisting FCM Token in Firestore...");
                }
                
                localStorage.setItem('fcm_token', token);
                const tokenId = await sha256(token);
                const tokenDocRef = doc(db, 'users', profile.uid, 'notificationTokens', tokenId);
                await setDoc(tokenDocRef, {
                    token,
                    companyId: profile.companyId,
                    role: "medidor",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    userAgent: navigator.userAgent,
                    active: true
                }, { merge: true });

                if (import.meta.env.DEV) {
                    console.log("[FCM Diagnostic] Token successfully persisted in Firestore.");
                }
                setHasFCMToken(true);
            } else {
                if (import.meta.env.DEV) {
                    console.warn("[FCM Diagnostic] User profile uid/companyId is missing. Skipping Firestore save.");
                }
            }

            setNotificationFeedback({
                message: "Notificações ativadas com sucesso",
                type: "success"
            });

        } catch (error: any) {
            if (import.meta.env.DEV) {
                console.error("[FCM Diagnostic] Error details:", error);
            }
            setNotificationFeedback({
                message: `Erro na validação do Push: ${error.message || error}`,
                type: "error"
            });
        } finally {
            setIsRequestingNotifications(false);
        }
    };

    const showPermissionBanner = notificationPermission === 'default' && !hasFCMToken && !promptDismissed;


    const handleOpenRoute = (address: string) => {
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
    };

    const handleWhatsApp = (m: Measurement) => {
        const customerName = String(m?.customerName || 'Cliente');
        const companyDisplayName = (profile?.company as any)?.whatsappDisplayName?.trim() ||
            (profile?.company as any)?.tradeName?.trim() ||
            (profile?.company as any)?.fantasyName?.trim() ||
            profile?.company?.name?.trim() ||
            'Gledstone | Mármore e Planejados';
        const message = `Olá ${safeSplit(customerName, ' ', 'measurements', 'customerName')[0]}, tudo bem? Sou o medidor da ${companyDisplayName} e estou entrando em contato sobre a medição agendada.`;
        const phone = safeString(m?.phone).replace(/\D/g, '');
        if (!phone) {
            alert('Telefone do cliente não cadastrado.');
            return;
        }
        window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank');
    };

    const handleStart = async (id: string) => {
        try {
            await updateDoc(doc(db, 'medicoes', id), {
                status: 'in_progress',
                startedAt: toISODateSafe(new Date())
            });
            setIsDetailsOpen(false);
            setSelectedMeasurement(null);
        } catch (error) {
            console.error("Error starting measurement:", error);
            alert("Erro ao iniciar medição.");
        }
    };

    const handleComplete = async (id: string) => {
        if (!window.confirm('Confirmar finalização desta medição?')) return;
        try {
            await updateDoc(doc(db, 'medicoes', id), {
                status: 'completed',
                completedAt: toISODateSafe(new Date()),
                completedByStaffId: profile?.uid || 'unknown',
                completedByStaffName: profile?.name || 'unknown'
            });
            setIsDetailsOpen(false);
            setSelectedMeasurement(null);
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Erro ao finalizar medição.");
        }
    };

    const handleReschedule = async (id: string, newDate: string, newTime: string, reason: string) => {
        if (!newDate || !newTime) {
            alert("Por favor, preencha data e horário.");
            return;
        }
        try {
            const m = measurements.find(item => item.id === id);
            if (!m) return;

            const rescheduleLog = `\n[Reagendado em ${new Date().toLocaleDateString('pt-BR')} para ${new Date(newDate + 'T00:00:00').toLocaleDateString('pt-BR')} às ${newTime}.${reason ? ` Motivo: ${reason}` : ''}]`;
            const updatedObservations = (m.observations || '') + rescheduleLog;

            await updateDoc(doc(db, 'medicoes', id), {
                status: 'reagendada',
                scheduledDate: newDate,
                scheduledTime: newTime,
                scheduledAt: toISODateSafe(new Date(newDate + 'T' + (newTime || '00:00') + ':00')),
                observations: updatedObservations,
                updatedAt: toISODateSafe(new Date())
            });

            setIsRescheduleModalOpen(false);
            setReschedulingMeasurement(null);
            alert("Medição reagendada com sucesso!");
        } catch (error) {
            console.error("Error rescheduling:", error);
            alert("Erro ao reagendar medição.");
        }
    };

    const handleSaveObservation = async (id: string, newObsText: string) => {
        if (!newObsText.trim()) {
            alert("A observação não pode ser vazia.");
            return;
        }
        try {
            const m = measurements.find(item => item.id === id);
            if (!m) return;

            const updatedObservations = (m.observations || '') + (m.observations ? '\n' : '') + newObsText.trim();

            await updateDoc(doc(db, 'medicoes', id), {
                observations: updatedObservations
            });

            setIsObservationModalOpen(false);
            setObservationMeasurement(null);
            setNewObservationText('');
            alert("Observação adicionada com sucesso!");
        } catch (error) {
            console.error("Error saving observation:", error);
            alert("Erro ao adicionar observação.");
        }
    };

    if (isLoading) {
        return (
            <div className="flex-1 bg-brand-rocha-bg flex flex-col items-center justify-center p-6 text-center">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-brand-rocha-primary rounded-full animate-spin mb-4"></div>
                <p className="rocha-text-label">Sincronizando Agenda de Campo...</p>
            </div>
        );
    }

    return (
        <div className="flex-1 bg-[#F8FAFC] flex flex-col overflow-hidden font-sans">
            {/* Mobile Header Bar */}
            <header className="flex md:hidden items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-brand-rocha-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-black text-brand-rocha-primary uppercase">
                            {(profile?.name || 'M').substring(0, 1)}
                        </span>
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Medidor</p>
                        <h3 className="text-sm font-bold text-slate-900 truncate mt-1">
                            {profile?.name || 'Usuário'}
                        </h3>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-900 transition-colors"
                        title="Abrir Menu"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <button 
                        onClick={logout}
                        className="p-2 hover:bg-rose-50 rounded-xl text-slate-500 hover:text-rose-600 transition-colors"
                        title="Sair da Conta"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* MOBILE MENU DRAWER */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-[300] md:hidden flex justify-end bg-black/60 animate-in fade-in duration-300 backdrop-blur-sm">
                    <div 
                        className="absolute inset-0 cursor-pointer" 
                        onClick={() => setIsMobileMenuOpen(false)} 
                    />
                    <div className="bg-white border-l border-slate-200 w-64 h-full p-6 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col justify-between relative">
                        <div className="space-y-6">
                            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Navegação</h4>
                                <button 
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => { setFilter('today'); setIsMobileMenuOpen(false); }}
                                    className={cn(
                                        "w-full text-left px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all",
                                        filter === 'today' 
                                            ? "bg-slate-900 text-white shadow-sm font-black" 
                                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                    )}
                                >
                                    Medições de Hoje
                                </button>
                                <button
                                    onClick={() => { setFilter('upcoming'); setIsMobileMenuOpen(false); }}
                                    className={cn(
                                        "w-full text-left px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all",
                                        filter === 'upcoming' 
                                            ? "bg-slate-900 text-white shadow-sm font-black" 
                                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                    )}
                                >
                                    Próximas Medições
                                </button>
                                <button
                                    onClick={() => { setFilter('completed'); setIsMobileMenuOpen(false); }}
                                    className={cn(
                                        "w-full text-left px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all",
                                        filter === 'completed' 
                                            ? "bg-slate-900 text-white shadow-sm font-black" 
                                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                    )}
                                >
                                    Medições Concluídas
                                </button>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100 space-y-4">
                            <div className="flex items-center gap-3 px-2">
                                <div className="w-8 h-8 rounded-full bg-brand-rocha-primary/10 flex items-center justify-center shrink-0">
                                    <span className="text-xs font-black text-brand-rocha-primary uppercase">
                                        {(profile?.name || 'M').substring(0, 1)}
                                    </span>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-900 truncate leading-none">{profile?.name || 'Usuário'}</p>
                                    <p className="text-[10px] text-slate-500 font-bold truncate mt-1">{profile?.email || ''}</p>
                                </div>
                            </div>

                            <button
                                onClick={() => { setIsMobileMenuOpen(false); logout(); }}
                                className="w-full flex items-center justify-center gap-2 h-11 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
                            >
                                <LogOut className="w-4 h-4" /> Sair da Conta
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Tabs */}
            <div className="px-4 sm:px-8 py-4 bg-white border-b border-slate-200 flex gap-2 overflow-x-auto no-scrollbar">
                {(['today', 'upcoming', 'completed'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={cn(
                            "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0",
                            filter === f 
                                ? "bg-slate-900 text-white shadow-sm" 
                                : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                        )}
                    >
                        {f === 'today' ? 'Para Hoje' : f === 'upcoming' ? 'Próximas' : 'Concluídas'}
                    </button>
                ))}
            </div>

            {/* iOS and Permission Banners */}
            {showIOSBanner && (
                <div className="mx-4 sm:mx-8 mt-4 p-4 bg-blue-50 border border-blue-100 rounded-2xl flex gap-3 relative animate-in slide-in-from-top-4 duration-300">
                    <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div className="flex-1 pr-6">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">Notificações no iPhone</h4>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Para receber alertas de medição no seu iPhone, toque no botão de **Compartilhar** no Safari, selecione **"Adicionar à Tela de Início"** e abra o Marble Flow por lá.
                        </p>
                    </div>
                    <button 
                        onClick={handleDismissIOSBanner}
                        className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Feedback Notifications */}
            {notificationFeedback.message && (
                <div className={cn(
                    "mx-4 sm:mx-8 mt-4 p-4 rounded-2xl flex gap-3 items-center justify-between animate-in slide-in-from-top-4 duration-300 relative pr-10",
                    notificationFeedback.type === 'success' && "bg-emerald-50 border border-emerald-100 text-emerald-800",
                    notificationFeedback.type === 'error' && "bg-rose-50 border border-rose-100 text-rose-800",
                    notificationFeedback.type === 'warning' && "bg-amber-50 border border-amber-100 text-amber-800",
                    notificationFeedback.type === 'info' && "bg-blue-50 border border-blue-100 text-blue-800"
                )}>
                    <div className="flex gap-3 items-center">
                        {notificationFeedback.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
                        {notificationFeedback.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />}
                        {notificationFeedback.type === 'warning' && <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />}
                        {notificationFeedback.type === 'info' && <Info className="w-5 h-5 text-blue-500 shrink-0" />}
                        <span className="text-xs font-semibold">{notificationFeedback.message}</span>
                    </div>
                    <button 
                        onClick={() => setNotificationFeedback({ message: '', type: null })}
                        className="absolute top-4 right-3 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {showPermissionBanner && !notificationFeedback.message && (
                <div className="mx-4 sm:mx-8 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-300 relative pr-10 sm:pr-12">
                    <div className="flex gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">Alertas Desativados</h4>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                Ative as notificações para receber avisos em tempo real 1h, 30m e 10m antes de cada medição.
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={handleRequestPermission}
                        disabled={isRequestingNotifications}
                        className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-slate-900 rounded-xl text-xs font-bold uppercase tracking-wider shrink-0 transition-colors self-end sm:self-auto active:scale-95"
                    >
                        {isRequestingNotifications ? 'Ativando...' : 'Ativar Alertas'}
                    </button>
                    <button 
                        onClick={() => {
                            localStorage.setItem('notificationPromptDismissed', 'true');
                            setPromptDismissed(true);
                        }}
                        className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {notificationPermission === 'denied' && (
                <div className="mx-4 sm:mx-8 mt-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex gap-3 animate-in slide-in-from-top-4 duration-300">
                    <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-1">Notificações Bloqueadas</h4>
                        <p className="text-xs text-slate-600 leading-relaxed mb-3">
                            A permissão de notificações está bloqueada no seu navegador. Para receber alertas de agendamento em tempo real:
                        </p>
                        <ol className="text-xs text-slate-600 list-decimal pl-4 space-y-1.5 font-medium">
                            <li>Clique no ícone de cadeado/configurações (ao lado da URL do site na barra de endereços).</li>
                            <li>Localize a opção de <strong>Notificações</strong> e mude para <strong>Permitir</strong>.</li>
                            <li>Recarregue a página para aplicar as alterações.</li>
                        </ol>
                    </div>
                </div>
            )}

            {/* List Content */}
            <main className="flex-1 px-4 sm:px-8 py-6 overflow-y-auto no-scrollbar space-y-4">
                {filteredMeasurements.length === 0 ? (
                    <div className="bg-white border border-slate-200 p-16 text-center flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500 rounded-3xl shadow-sm">
                        <div className="h-24 w-24 bg-slate-50 rounded-full flex items-center justify-center mb-8">
                            <AlertCircle className="w-10 h-10 text-slate-400" />
                        </div>
                        <p className="rocha-text-label">
                            {filter === 'today' ? 'Nenhuma medição para hoje' : 'Agenda Limpa'}
                        </p>
                        <p className="text-sm text-slate-500 mt-2 max-w-xs leading-relaxed">
                            Sua agenda está livre — novas medições aparecerão aqui automaticamente assim que forem registradas pela equipe.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {safeArray(filteredMeasurements).map((m, idx) => {
                            const isDelayed = !m.status || ((m.status === 'scheduled' || m.status === 'reagendada') && new Date(m.scheduledDate + 'T23:59:59') < new Date());
                            const isToday = isSameDay(new Date(m.scheduledDate + 'T12:00:00'), new Date());

                            return (
                                <div 
                                    key={m.id} 
                                    onClick={() => { setSelectedMeasurement(m); setIsDetailsOpen(true); }}
                                    className={cn(
                                        "bg-white border border-slate-200 shadow-sm rounded-2xl p-5 flex flex-col gap-5 relative overflow-hidden group animate-in slide-in-from-bottom-4 duration-500 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all",
                                        m.status === 'completed' && "opacity-90 bg-slate-50/70",
                                        isToday && m.status !== 'completed' && "ring-2 ring-emerald-500 ring-offset-2 ring-offset-slate-50"
                                    )}
                                    style={{ animationDelay: `${idx * 50}ms` }}
                                >
                                    {/* Client & Status header */}
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="text-xl font-bold text-slate-900 tracking-tight uppercase truncate max-w-[180px]">{m.customerName}</h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                <span className="text-xs text-slate-500 font-medium">
                                                    {new Date(m.scheduledDate + 'T12:00:00').toLocaleDateString('pt-BR')} às {m.scheduledTime || '--:--'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className={cn(
                                            "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                                            m.status === 'completed' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : 
                                            m.status === 'in_progress' ? "bg-amber-50 text-amber-600 border-amber-100 animate-pulse" :
                                            m.status === 'reagendada' ? "bg-blue-50 text-blue-600 border-blue-100" :
                                            isDelayed ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-blue-50 text-blue-600 border-blue-100"
                                        )}>
                                            {m.status === 'completed' ? 'Realizada' : m.status === 'in_progress' ? 'Em Progresso' : m.status === 'reagendada' ? 'Reagendada' : 'Pendente'}
                                        </div>
                                    </div>

                                    {/* Address Info */}
                                    <div className="space-y-2 text-slate-600 text-sm">
                                        <div className="flex items-start gap-2.5">
                                            <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                            <div className="flex-1 min-w-0">
                                                <p className="leading-tight font-semibold text-slate-800 break-words">{m.address}</p>
                                                {m.condominium && <p className="text-xs text-slate-550 mt-1"><span className="font-bold text-slate-400 uppercase text-[9px] tracking-wider mr-1">Condomínio:</span>{m.condominium}</p>}
                                                {m.reference && <p className="text-xs text-slate-550 mt-0.5"><span className="font-bold text-indigo-400 uppercase text-[9px] tracking-wider mr-1">Referência:</span>{m.reference}</p>}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 pt-1">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleCopyAddress(m.address); }}
                                                className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-800 flex items-center gap-1 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition-colors border border-slate-200 shadow-xs"
                                            >
                                                <Copy className="w-3 h-3" /> Copiar
                                            </button>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleOpenRoute(m.address); }}
                                                className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-slate-800 flex items-center gap-1 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition-colors border border-slate-200 shadow-xs"
                                            >
                                                <Navigation className="w-3 h-3" /> Rota GPS
                                            </button>
                                        </div>
                                    </div>

                                    {/* Phone & WhatsApp */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                                                <Phone className="w-4 h-4 text-slate-500" />
                                            </div>
                                            <span className="text-sm font-bold text-slate-700">{m.phone || 'Sem Telefone'}</span>
                                        </div>
                                        {m.phone && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleWhatsApp(m); }}
                                                className="h-9 px-3.5 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg flex items-center gap-1.5 font-bold text-[9px] sm:text-[10px] uppercase tracking-wider sm:tracking-widest transition-colors active:scale-95 shrink-0 shadow-xs"
                                            >
                                                <WhatsAppIcon className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp
                                            </button>
                                        )}
                                    </div>

                                    {/* Observations */}
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1">
                                        <div className="flex items-center gap-1.5 text-slate-500">
                                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Observações de Campo</span>
                                        </div>
                                        <p className="text-xs text-slate-650 leading-relaxed font-medium break-words">
                                            {m.observations || 'Nenhuma instrução extra cadastrada.'}
                                        </p>
                                    </div>

                                    {/* Photo Thumbnails */}
                                    {(safeArray(m.environmentPhotos).length > 0 || safeArray(m.technicalMeasurementPhotos).length > 0) && (
                                        <div className="flex flex-col gap-3">
                                            {safeArray(m.environmentPhotos).length > 0 && (
                                                <div className="space-y-1.5">
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">Fotos do Ambiente: {safeArray(m.environmentPhotos).length} {safeArray(m.environmentPhotos).length === 1 ? 'foto' : 'fotos'}</span>
                                                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                                        {safeArray(m.environmentPhotos).map((photo: any, idx: number) => (
                                                            <div key={idx} className="w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-slate-200">
                                                                <img src={photo.url} alt="Ambiente" className="w-full h-full object-cover" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {safeArray(m.technicalMeasurementPhotos).length > 0 && (
                                                <div className="space-y-1.5">
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">Medição Técnica: {safeArray(m.technicalMeasurementPhotos).length} {safeArray(m.technicalMeasurementPhotos).length === 1 ? 'foto' : 'fotos'}</span>
                                                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                                        {safeArray(m.technicalMeasurementPhotos).map((photo: any, idx: number) => (
                                                            <div key={idx} className="w-12 h-12 shrink-0 rounded-lg overflow-hidden border border-slate-200">
                                                                <img src={photo.url} alt="Técnica" className="w-full h-full object-cover" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                                        {m.status !== 'completed' && (
                                            <>
                                                {m.status === 'scheduled' || m.status === 'reagendada' ? (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleStart(m.id); }}
                                                        className="h-10 bg-slate-900 hover:bg-black text-white rounded-xl font-black text-[9px] sm:text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-sm"
                                                    >
                                                        Iniciar Medição
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleComplete(m.id); }}
                                                        className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[9px] sm:text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-sm"
                                                    >
                                                        Concluir
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        setReschedulingMeasurement(m); 
                                                        setNewRescheduleDate(m.scheduledDate); 
                                                        setNewRescheduleTime(m.scheduledTime || ''); 
                                                        setRescheduleReason(''); 
                                                        setIsRescheduleModalOpen(true); 
                                                    }}
                                                    className="h-10 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-black text-[9px] sm:text-[10px] uppercase tracking-widest border border-slate-200 transition-all active:scale-95 shadow-sm"
                                                >
                                                    Reagendar
                                                </button>
                                            </>
                                        )}
                                        {m.status === 'completed' && (
                                            <div className="col-span-2 py-2.5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-center text-[10px] font-black uppercase tracking-widest">
                                                Realizada em {m.completedAt ? new Date(m.completedAt).toLocaleString('pt-BR') : ''}
                                            </div>
                                        )}
                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setObservationMeasurement(m); 
                                                setNewObservationText(''); 
                                                setIsObservationModalOpen(true); 
                                            }}
                                            className="col-span-2 h-9 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all mt-1 border border-slate-200 active:scale-95 shadow-xs"
                                        >
                                            + Adicionar Observação
                                        </button>
                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setSelectedMeasurement(m); 
                                                setIsDetailsOpen(true); 
                                            }}
                                            className="col-span-2 h-10 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all mt-1 border border-indigo-200 active:scale-95 shadow-sm flex items-center justify-center gap-2"
                                        >
                                            <ImageIcon className="w-4 h-4" /> Abrir Detalhes e Fotos
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Summary */}
            <div className="px-4 sm:px-8 py-6 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-6">
                    <div>
                        <p className="rocha-text-label text-[10px] mb-1">Status da Agenda</p>
                        <p className="text-slate-900 font-black text-sm uppercase">
                            {safeArray(measurements).filter(m => m.status === 'completed' && isSameDay(new Date(m.scheduledDate + 'T00:00:00'), new Date())).length} de {safeArray(measurements).filter(m => isSameDay(new Date(m.scheduledDate + 'T00:00:00'), new Date())).length} concluídas hoje
                        </p>
                    </div>
                </div>
            </div>

            {/* DETAILS DRAWER */}
            {isDetailsOpen && selectedMeasurement && (
                <div className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/50 animate-in fade-in duration-300 backdrop-blur-sm">
                    <div 
                        className="absolute inset-0 cursor-pointer" 
                        onClick={() => setIsDetailsOpen(false)} 
                    />
                    <div className="bg-[#F8FAFC] rounded-t-[2rem] sm:rounded-t-[3rem] p-6 sm:p-10 max-h-[90vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom-full duration-500 custom-scrollbar relative border-t border-slate-200">
                        <div className="w-16 h-1.5 bg-slate-200 rounded-full mx-auto mb-10" />
                        
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h1 className="rocha-text-label text-brand-rocha-primary text-xs mb-3">Detalhes do Atendimento</h1>
                                <h2 className="rocha-text-value text-3xl leading-none text-slate-900">
                                    {String(selectedMeasurement?.customerName || 'Cliente')}
                                </h2>
                            </div>
                            <Button onClick={() => setIsDetailsOpen(false)} variant="ghost" className="h-12 w-12 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200">
                                <X className="w-5 h-5" />
                            </Button>
                        </div>

                        {/* Quick Actions */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-12">
                            <Button 
                                onClick={() => handleWhatsApp(selectedMeasurement)}
                                className="h-16 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest active:scale-95 transition-all shadow-sm"
                            >
                                <WhatsAppIcon className="w-6 h-6 text-emerald-600" />
                                Contatar Cliente
                            </Button>
                            <Button 
                                onClick={() => handleOpenRoute(selectedMeasurement.address)}
                                className="h-16 bg-slate-900 hover:bg-black text-white rounded-2xl flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest active:scale-95 transition-all shadow-md"
                            >
                                <Navigation className="w-5 h-5 text-emerald-400" />
                                Abrir GPS / Rota
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-32">
                            <section className="space-y-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Localização Técnica</label>
                                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 relative group shadow-sm">
                                    <button 
                                        onClick={() => handleCopyAddress(selectedMeasurement.address)}
                                        className="absolute top-6 right-6 p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl shadow-sm text-slate-400 hover:text-emerald-500 transition-colors"
                                    >
                                        <Copy className="w-5 h-5" />
                                    </button>
                                    <div className="flex gap-5">
                                        <MapPin className="w-7 h-7 text-emerald-500 shrink-0 mt-1" />
                                        <div>
                                            <p className="text-lg font-bold text-slate-900 leading-relaxed mb-4">
                                                {selectedMeasurement.address}
                                            </p>
                                            {(selectedMeasurement.condominium || selectedMeasurement.reference) && (
                                                <div className="space-y-2 pt-4 border-t border-slate-100">
                                                    {selectedMeasurement.condominium && (
                                                        <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Cond: {selectedMeasurement.condominium}</p>
                                                    )}
                                                    {selectedMeasurement.reference && (
                                                        <p className="text-xs font-black text-indigo-550 uppercase tracking-wider">Ref: {selectedMeasurement.reference}</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <div className="space-y-8">
                                <section className="space-y-4">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observações e Material</label>
                                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                                        <div className="flex gap-5 mb-4">
                                            <FileText className="w-6 h-6 text-indigo-500 shrink-0" />
                                            <p className="text-sm font-medium text-slate-700 leading-relaxed italic">
                                                {selectedMeasurement.observations || 'Nenhuma instrução extra.'}
                                            </p>
                                        </div>
                                        {selectedMeasurement.material && (
                                            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 shadow-sm">
                                                <Info className="w-3.5 h-3.5 text-indigo-500" />
                                                <span className="text-[10px] font-black text-indigo-600 uppercase">{selectedMeasurement.material}</span>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {selectedMeasurement.measurementAttachment && (
                                    <section className="space-y-4">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Anexo para Medição</label>
                                        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
                                            {selectedMeasurement.measurementAttachment.mimeType?.startsWith('image/') && attachmentUrl && (
                                                <div 
                                                    className="mb-4 rounded-2xl overflow-hidden border border-slate-200 aspect-video max-h-48 bg-slate-50 cursor-pointer hover:opacity-90 transition-opacity" 
                                                    onClick={handleOpenAttachment}
                                                >
                                                    <img src={attachmentUrl} alt="Anexo" className="w-full h-full object-contain" />
                                                </div>
                                            )}
                                            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-4">
                                                <Paperclip className="w-6 h-6 text-brand-emerald shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold text-slate-800 truncate" title={selectedMeasurement.measurementAttachment.originalName}>
                                                        {selectedMeasurement.measurementAttachment.originalName}
                                                    </p>
                                                    {selectedMeasurement.measurementAttachment.size && (
                                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                                            {(selectedMeasurement.measurementAttachment.size / (1024 * 1024)).toFixed(1)} MB
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <Button
                                                onClick={handleOpenAttachment}
                                                disabled={isLoadingUrl}
                                                className="w-full h-12 bg-slate-900 hover:bg-black text-white font-bold rounded-2xl text-xs uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
                                            >
                                                {isLoadingUrl ? 'Abrindo...' : 'Abrir Arquivo'}
                                            </Button>
                                        </div>
                                    </section>
                                )}

                                <section className="space-y-4">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Documentação Fotográfica</label>
                                    <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
                                        {/* Environment Photos */}
                                        <div>
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
                                                        <ImageIcon className="w-4 h-4 text-indigo-500" />
                                                    </div>
                                                    <h3 className="text-sm font-bold text-slate-700">Fotos do Ambiente</h3>
                                                </div>
                                                <label className="cursor-pointer h-9 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 transition-colors">
                                                    <UploadCloud className="w-3.5 h-3.5" /> Enviar
                                                    <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'environment', selectedMeasurement.id)} />
                                                </label>
                                            </div>
                                            
                                            {safeArray(selectedMeasurement.environmentPhotos).length > 0 ? (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                    {selectedMeasurement.environmentPhotos!.map((photo, idx) => (
                                                        <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden group border border-slate-100 shadow-sm">
                                                            <img src={photo.url} alt="Ambiente" className="w-full h-full object-cover" />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <button onClick={(e) => { e.preventDefault(); handleDeletePhoto(selectedMeasurement.id, photo); }} className="w-8 h-8 bg-white/20 hover:bg-red-500 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-colors">
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="p-6 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                                                    <p className="text-xs font-medium text-slate-400">Nenhuma foto do ambiente.</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Technical Photos */}
                                        <div className="pt-6 border-t border-slate-100">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                                                        <ImageIcon className="w-4 h-4 text-emerald-500" />
                                                    </div>
                                                    <h3 className="text-sm font-bold text-slate-700">Fotos da Medição</h3>
                                                </div>
                                                <label className="cursor-pointer h-9 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 transition-colors">
                                                    <UploadCloud className="w-3.5 h-3.5" /> Enviar
                                                    <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'technical', selectedMeasurement.id)} />
                                                </label>
                                            </div>
                                            
                                            {safeArray(selectedMeasurement.technicalMeasurementPhotos).length > 0 ? (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                    {selectedMeasurement.technicalMeasurementPhotos!.map((photo, idx) => (
                                                        <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden group border border-slate-100 shadow-sm">
                                                            <img src={photo.url} alt="Técnica" className="w-full h-full object-cover" />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <button onClick={(e) => { e.preventDefault(); handleDeletePhoto(selectedMeasurement.id, photo); }} className="w-8 h-8 bg-white/20 hover:bg-red-500 text-white rounded-full flex items-center justify-center backdrop-blur-sm transition-colors">
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="p-6 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                                                    <p className="text-xs font-medium text-slate-400">Nenhuma foto técnica.</p>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Upload Progress bars */}
                                        {Object.entries(uploadingPhotos).length > 0 && (
                                            <div className="pt-4 border-t border-slate-100 space-y-2">
                                                {Object.entries(uploadingPhotos).map(([path, progress]) => (
                                                    <div key={path} className="flex items-center gap-3">
                                                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                            <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                                                        </div>
                                                        <span className="text-[10px] font-bold text-slate-500 w-8">{Math.round(progress)}%</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {selectedMeasurement.status === 'scheduled' && (
                                    <Button 
                                        onClick={() => handleStart(selectedMeasurement.id)}
                                        className="h-20 w-full bg-slate-900 hover:bg-black text-white rounded-[1.8rem] font-black uppercase text-sm tracking-[0.2em] shadow-lg transition-all flex items-center justify-center gap-4 active:scale-95"
                                    >
                                        <Clock className="w-8 h-8" />
                                        Iniciar Medição agora
                                    </Button>
                                )}

                                {selectedMeasurement.status === 'in_progress' && (
                                    <Button 
                                        onClick={() => handleComplete(selectedMeasurement.id)}
                                        className="h-20 w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-[1.8rem] font-black uppercase text-sm tracking-[0.2em] shadow-lg transition-all flex items-center justify-center gap-4 active:scale-95"
                                    >
                                        <CheckCircle2 className="w-8 h-8" />
                                        Finalizar Medição
                                    </Button>
                                )}

                                {selectedMeasurement.status === 'completed' && (
                                    <div className="h-20 w-full bg-emerald-50 border border-emerald-200 rounded-[1.8rem] flex items-center justify-center gap-4 shadow-sm">
                                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                                        <span className="text-sm font-black text-emerald-700 uppercase tracking-widest">Medição Concluída</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* RESCHEDULE MODAL */}
            {isRescheduleModalOpen && reschedulingMeasurement && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 sm:p-6 animate-in fade-in duration-300 backdrop-blur-sm">
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col gap-4 sm:gap-6 text-left">
                        <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Reagendar Medição</h2>
                            <button onClick={() => { setIsRescheduleModalOpen(false); setReschedulingMeasurement(null); }} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-655 transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Nova Data</label>
                                <input 
                                    type="date" 
                                    value={newRescheduleDate}
                                    onChange={(e) => setNewRescheduleDate(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium focus:outline-none focus:border-brand-rocha-primary" 
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Novo Horário</label>
                                <input 
                                    type="time" 
                                    value={newRescheduleTime}
                                    onChange={(e) => setNewRescheduleTime(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium focus:outline-none focus:border-brand-rocha-primary" 
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Motivo do Reagendamento (Opcional)</label>
                                <textarea 
                                    rows={3}
                                    value={rescheduleReason}
                                    onChange={(e) => setRescheduleReason(e.target.value)}
                                    placeholder="Ex: Cliente solicitou alteração de horário..."
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium focus:outline-none focus:border-brand-rocha-primary resize-none" 
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4 border-t border-slate-100">
                            <button 
                                onClick={() => handleReschedule(reschedulingMeasurement.id, newRescheduleDate, newRescheduleTime, rescheduleReason)}
                                className="flex-1 h-12 bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors active:scale-95 shadow-sm"
                            >
                                Confirmar
                            </button>
                            <button 
                                onClick={() => { setIsRescheduleModalOpen(false); setReschedulingMeasurement(null); }}
                                className="flex-1 h-12 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors active:scale-95"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ADD OBSERVATION MODAL */}
            {isObservationModalOpen && observationMeasurement && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 sm:p-6 animate-in fade-in duration-300 backdrop-blur-sm">
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col gap-4 sm:gap-6 text-left">
                        <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Adicionar Observação</h2>
                            <button onClick={() => { setIsObservationModalOpen(false); setObservationMeasurement(null); }} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-655 transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Nova Nota / Instrução</label>
                            <textarea 
                                rows={4}
                                value={newObservationText}
                                onChange={(e) => setNewObservationText(e.target.value)}
                                placeholder="Digite a nova observação técnica da medição..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium focus:outline-none focus:border-brand-rocha-primary resize-none" 
                            />
                        </div>

                        <div className="flex gap-3 pt-4 border-t border-slate-100">
                            <button 
                                onClick={() => handleSaveObservation(observationMeasurement.id, newObservationText)}
                                className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors active:scale-95 shadow-sm"
                            >
                                Adicionar
                            </button>
                            <button 
                                onClick={() => { setIsObservationModalOpen(false); setObservationMeasurement(null); }}
                                className="flex-1 h-12 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors active:scale-95"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
