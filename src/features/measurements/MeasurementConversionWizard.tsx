import { safeArray, safeHistoryArray } from '../../lib/dataDiagnostics';
import React, { useState, useEffect } from 'react';
import { toISODateSafe } from '../../lib/dateWriteUtils';
import { useAuth, type UserProfile } from '../../context/AuthContext';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/utils';
import { safeSplit } from '../../lib/dataDiagnostics';
import { MapPin, User, Ruler, Calendar, CheckCircle2, X, ChevronRight, ChevronLeft, Phone } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, getDoc } from 'firebase/firestore';
import type { Quote, Client } from '../../types';

const pad = (n: number) => String(n).padStart(2, '0');

const getTodayLocal = () => {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const getCurrentTimeLocal = () => {
    const now = new Date();
    return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

const normalizeDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    const [year, month, day] = safeSplit(dateStr, '-', 'measurements', 'dateStr').map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const isSunday = (dateStr: string) => {
    if (!dateStr) return false;
    const [year, month, day] = safeSplit(dateStr, '-', 'measurements', 'dateStr').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getDay() === 0;
};

const BUSINESS_HOUR_START = "08:00";
const BUSINESS_HOUR_END = "18:00";

const isOutsideBusinessHours = (timeStr: string) => {
    if (!timeStr) return false;
    return timeStr < BUSINESS_HOUR_START || timeStr >= BUSINESS_HOUR_END;
};

interface MeasurementConversionWizardProps {
    quote: Quote;
    onClose: () => void;
    onSuccess: () => void;
}

export const MeasurementConversionWizard: React.FC<MeasurementConversionWizardProps> = ({ quote, onClose, onSuccess }) => {
    const { user, profile } = useAuth();
    
    const [step, setStep] = useState<1 | 2>(1);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Step 1: Client Data
    const [clientData, setClientData] = useState<Partial<Client>>({
        name: String(quote?.customerName || ''),
        phone: String(quote?.customerPhone || ''),
        document: '',
        zipCode: '',
        street: String(quote?.customerAddress || ''),
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: '',
        reference: '',
        condominium: '',
    });

    const [cepWarning, setCepWarning] = useState('');

    // Step 2: Scheduling
    const [scheduledDate, setScheduledDate] = useState(getTodayLocal());
    const [scheduledTime, setScheduledTime] = useState('');
    const [assignedStaffId, setAssignedStaffId] = useState('');
    const [observations, setObservations] = useState('');
    const [measurers, setMeasurers] = useState<UserProfile[]>([]);
    const [now, setNow] = useState(new Date());

    // Rigorous Time Pulse (Rule: Ensure validation stays fresh if modal remains open)
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(timer);
    }, []);

    const todayStr = getTodayLocal();
    // Use the pulsed 'now' for consistent real-time validation
    const currentTimeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const isPastDate = !!scheduledDate && normalizeDate(scheduledDate) < normalizeDate(todayStr);
    const isToday = scheduledDate === todayStr;
    const isPastTimeToday = isToday && !!scheduledTime && scheduledTime <= currentTimeStr;
    const isSundayDate = !!scheduledDate && isSunday(scheduledDate);
    const isInvalidBusinessHour = !!scheduledTime && isOutsideBusinessHours(scheduledTime);

    const isScheduleInvalid = !scheduledDate || !scheduledTime || isPastDate || isPastTimeToday || isSundayDate || isInvalidBusinessHour;

    // Load initial client data if available
    useEffect(() => {
        const loadClient = async () => {
             if (quote.clientId) {
                const clientDoc = await getDoc(doc(db, 'clients', quote.clientId));
                if (clientDoc.exists()) {
                    const data = clientDoc.data() as Client;
                    setClientData(prev => ({
                        ...prev,
                        ...data,
                        name: String(quote?.customerName || data?.name || ''),
                        phone: String(quote?.customerPhone || data?.phone || ''),
                    }));
                }
            }
        };
        loadClient();
    }, [quote.clientId, quote.customerName, quote.customerPhone]);

    // Fetch Medidores
    useEffect(() => {
        if (!profile?.companyId) return;
        const q = query(
            collection(db, 'users'), 
            where('companyId', '==', profile.companyId),
            where('role', '==', 'medidor')
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
            setMeasurers(data);
        });
        return () => unsubscribe();
    }, [profile?.companyId]);

    // Cleanup time if date becomes today and time is already past
    useEffect(() => {
        const today = getTodayLocal();
        const now = getCurrentTimeLocal();
        if (scheduledDate === today && scheduledTime && scheduledTime <= now) {
            setScheduledTime('');
        }
    }, [scheduledDate]);

    const handleZipCodeLookup = async (value: string) => {
        const cleanCEP = String(value || '').replace(/\D/g, '');
        setClientData(prev => ({ ...prev, zipCode: cleanCEP }));
        if (cleanCEP.length !== 8) return;

        try {
            const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
            const data = await response.json();
            if (!data.erro) {
                setClientData(prev => {
                    const hasBairro = !!(prev.neighborhood || data.bairro);
                    if (!hasBairro) {
                        setCepWarning('Bairro não encontrado pelo CEP, preencha manualmente.');
                    } else {
                        setCepWarning('');
                    }
                    return {
                        ...prev,
                        street: prev.street || data.logradouro || '',
                        neighborhood: prev.neighborhood || data.bairro || '',
                        city: prev.city || data.localidade || '',
                        state: prev.state || data.uf || '',
                    };
                });
            } else {
                setCepWarning('');
            }
        } catch (error) {
            console.error("Error fetching CEP:", error);
        }
    };

    const handleFinalSubmit = async () => {
        if (isSubmitting) return;

        const currentToday = getTodayLocal();
        const currentNow = getCurrentTimeLocal();

        if (!scheduledDate) {
            alert("Selecione a data da visita.");
            return;
        }

        if (!scheduledTime) {
            alert("Selecione o horário previsto.");
            return;
        }

        if (normalizeDate(scheduledDate) < normalizeDate(currentToday)) {
            alert("Não é permitido agendar visitas em datas anteriores a hoje.");
            return;
        }

        if (isSunday(scheduledDate)) {
            alert("Não é permitido agendar visitas aos domingos.");
            return;
        }

        if (isOutsideBusinessHours(scheduledTime)) {
            alert("Selecione um horário dentro do expediente disponível (08:00 às 18:00).");
            return;
        }

        if (scheduledDate === currentToday && scheduledTime <= currentNow) {
            alert("Para hoje, selecione um horário posterior ao atual.");
            return;
        }

        // GOVERNANCE V3: Malformed temporal data check
        if (!scheduledDate || scheduledDate === '' || !scheduledTime || scheduledTime === '') {
            alert("Bloqueio de Governança: Data ou horário de medição malformado.");
            return;
        }

        const cleanCep = (clientData.zipCode || '').replace(/\D/g, '');
        if (cleanCep.length > 0) {
            const cleanCity = (clientData.city || '').trim();
            const cleanState = (clientData.state || '').trim();
            if (!cleanCity || cleanCity.toLowerCase() === 'undefined' || cleanCity.toLowerCase() === 'null') {
                alert("Por favor, informe uma cidade válida.");
                return;
            }
            if (!cleanState || cleanState.toLowerCase() === 'undefined' || cleanState.toLowerCase() === 'null') {
                alert("Por favor, informe um estado válido.");
                return;
            }
        }

        setIsSubmitting(true);

        try {
            const cleanNumber = (clientData.number && !['null', 'undefined', '-', ''].includes(String(clientData.number).trim().toLowerCase())) ? clientData.number.trim() : '';
            const compiledAddress = `${String(clientData.street || '')}${cleanNumber ? `, ${cleanNumber}` : ''}${clientData.complement ? ` - ${clientData.complement}` : ''} - ${String(clientData.neighborhood || '')}, ${String(clientData.city || '')} - ${String(clientData.state || '')}${clientData.zipCode ? `, CEP: ${clientData.zipCode}` : ''}`;
            
            // 1. Update Client Doc
            if (quote.clientId) {
                await updateDoc(doc(db, 'clients', quote.clientId), {
                    document: clientData.document || '',
                    zipCode: clientData.zipCode || '',
                    street: clientData.street || '',
                    number: cleanNumber,
                    complement: clientData.complement || '',
                    neighborhood: clientData.neighborhood || '',
                    city: clientData.city || '',
                    state: clientData.state || '',
                    reference: clientData.reference || '',
                    condominium: clientData.condominium || '',
                    address: compiledAddress
                });
            }

            // 2. Create Measurement Doc
            const selectedMeasurer = (measurers || []).find(m => m.uid === assignedStaffId);
            const measurerUid = selectedMeasurer?.uid || selectedMeasurer?.id || assignedStaffId || '';
            const measurerName = selectedMeasurer?.name || selectedMeasurer?.displayName || selectedMeasurer?.email || '';
            const materialSummary = (quote?.groups || []).map(g => `${g?.quantity || 0}x ${String(g?.materialName || 'Material')} (${String(g?.environmentName || 'Ambiente')})`).join(', ');

            const measurementData = {
                clientId: quote.clientId || null,
                customerName: clientData.name,
                phone: clientData.phone,
                address: compiledAddress,
                zipCode: clientData.zipCode || '',
                street: clientData.street || '',
                number: cleanNumber,
                complement: clientData.complement || '',
                neighborhood: clientData.neighborhood || '',
                city: clientData.city || '',
                state: clientData.state || '',
                reference: clientData.reference || '',
                condominium: clientData.condominium || '',
                assignedStaffId: measurerUid || null as any,
                assignedStaffName: measurerName || '',
                measurerId: measurerUid || null as any,
                measurerName: measurerName || '',
                assignedMeasurerId: measurerUid || null as any,
                assignedMeasurerName: measurerName || '',
                assignedTo: measurerUid || null as any,
                assignedToName: measurerName || '',
                scheduledAt: toISODateSafe(new Date(scheduledDate + 'T' + (scheduledTime || '00:00') + ':00')),
                scheduledDate,
                scheduledTime,
                status: 'scheduled',
                quoteId: quote.id,
                groups: quote.groups || [],
                observations: `Oriundo do Orçamento: ${quote.id}\nMateriais: ${materialSummary}${observations ? `\n\nNotas: ${observations}` : ''}`,
                userId: user?.uid,
                companyId: profile?.companyId,
                sellerName: String(quote?.sellerName || profile?.name || ''),
                createdAt: toISODateSafe(new Date())
            };

            await addDoc(collection(db, 'medicoes'), measurementData);

            // 3. Update Quote Status
            const isoNow = toISODateSafe(new Date());
            const historyMeasurerName = (measurers || []).find(m => m.uid === assignedStaffId)?.name || 'Não atribuído';
            const historyEntry = { 
                date: isoNow, 
                action: `Orçamento convertido para medição técnica. Agendado p/ ${safeSplit(scheduledDate, '-', 'measurements', 'scheduledDate').reverse().join('/')} às ${scheduledTime} (${historyMeasurerName}) por ${profile?.name || 'Usuário'}.` 
            };
            const newHistory = [...safeHistoryArray(quote.history), historyEntry];
            
            await updateDoc(doc(db, 'orcamentos', quote.id), {
                status: 'measuring',
                quoteStage: 'aguardando_medicao',
                history: newHistory,
                updatedAt: isoNow
            });

            onSuccess();
        } catch (error) {
            console.error("Error converting quote to measurement:", error);
            alert("Erro ao realizar a conversão. Tente novamente.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 absolute inset-0 rounded-2xl overflow-hidden shadow-2xl">
             {/* Header */}
             <div className="bg-slate-50 dark:bg-slate-800/50 p-6 border-b border-slate-200 dark:border-slate-800 shrink-0 flex justify-between items-center font-sans">
                <div>
                    <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight flex items-center gap-2">
                        <Ruler className="h-5 w-5 text-purple-600" />
                        Converter para Medição
                    </h2>
                    <p className="text-sm text-slate-500 mt-1 font-bold">
                        Siga os passos para oficializar o agendamento técnico.
                    </p>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                    <X className="h-5 w-5" />
                </Button>
            </div>

            {/* Stepper */}
            <div className="flex items-center justify-center p-6 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-white/5">
                <div className="flex items-center w-full max-w-xs">
                    <div className={cn("flex flex-col items-center", step >= 1 ? "text-purple-600" : "text-slate-400")}>
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1", step >= 1 ? "bg-purple-600 text-white" : "bg-slate-100 dark:bg-slate-800")}>1</div>
                        <span className="text-[10px] uppercase font-black tracking-widest">Cadastro</span>
                    </div>
                    <div className={cn("flex-1 h-1 mx-2", step >= 2 ? "bg-purple-600" : "bg-slate-100 dark:bg-slate-800")} />
                    <div className={cn("flex flex-col items-center", step >= 2 ? "text-purple-600" : "text-slate-400")}>
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1", step >= 2 ? "bg-purple-600 text-white" : "bg-slate-100 dark:bg-slate-800")}>2</div>
                        <span className="text-[10px] uppercase font-black tracking-widest">Agenda</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 no-scrollbar">
                {step === 1 ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="bg-purple-50 dark:bg-purple-900/10 p-4 rounded-2xl border border-purple-100 dark:border-purple-800/20 mb-6 font-sans">
                            <h4 className="text-xs font-black text-purple-700 dark:text-purple-400 uppercase tracking-widest flex items-center gap-2 mb-2">
                                <User className="w-4 h-4" /> Passo 1: Validação de Dados
                            </h4>
                            <p className="text-[11px] text-purple-600/80 dark:text-purple-400/60 font-bold uppercase tracking-tight">Confirme ou atualize os dados oficiais do cliente para logística.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo *</label>
                                <Input value={clientData.name} onChange={e => setClientData({...clientData, name: e.target.value})} className="h-12 rounded-2xl font-bold" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CPF / CNPJ</label>
                                <Input value={clientData.document} onChange={e => setClientData({...clientData, document: e.target.value})} className="h-12 rounded-2xl font-bold" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp / Telefone *</label>
                                <div className="relative">
                                    <Input value={clientData.phone} onChange={e => setClientData({...clientData, phone: e.target.value})} className="h-12 rounded-2xl pl-10 font-bold" />
                                    <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 pt-6 mt-6 border-t border-slate-100 dark:border-white/5 font-sans">
                            <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-purple-600" /> Endereço da Obra
                            </h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">CEP</label>
                                    <Input value={clientData.zipCode} onChange={e => handleZipCodeLookup(e.target.value)} placeholder="00000-000" className="h-11 rounded-xl" />
                                </div>
                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Rua / Logradouro *</label>
                                    <Input value={clientData.street} onChange={e => setClientData({...clientData, street: e.target.value})} required placeholder="Rua, Avenida..." className="h-11 rounded-xl font-bold" />
                                </div>
                                
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Número</label>
                                    <Input value={clientData.number} onChange={e => setClientData({...clientData, number: e.target.value})} placeholder="123" className="h-11 rounded-xl font-bold" />
                                </div>
                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Complemento</label>
                                    <Input value={clientData.complement} onChange={e => setClientData({...clientData, complement: e.target.value})} placeholder="Apto, Bloco, Casa..." className="h-11 rounded-xl" />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Condomínio</label>
                                    <Input value={clientData.condominium} onChange={e => setClientData({...clientData, condominium: e.target.value})} placeholder="Residencial..." className="h-11 rounded-xl" />
                                </div>
                                 <div className="space-y-1">
                                     <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Bairro *</label>
                                     <Input value={clientData.neighborhood} onChange={e => { setClientData({...clientData, neighborhood: e.target.value}); if (e.target.value) setCepWarning(''); }} required placeholder="Bairro" className="h-11 rounded-xl font-bold" />
                                     {cepWarning && (
                                         <p className="text-[10px] text-amber-600 font-bold ml-1 mt-0.5">{cepWarning}</p>
                                     )}
                                 </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Cidade *</label>
                                    <Input value={clientData.city} onChange={e => setClientData({...clientData, city: e.target.value})} required placeholder="Cidade" className="h-11 rounded-xl font-bold" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">UF *</label>
                                    <Input value={clientData.state} onChange={e => setClientData({...clientData, state: e.target.value})} required placeholder="UF" className="h-11 rounded-xl text-center uppercase font-bold" maxLength={2} />
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800/20 mb-6 font-sans">
                            <h4 className="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-2 mb-2">
                                <Calendar className="w-4 h-4" /> Passo 2: Agendamento Técnico
                            </h4>
                            <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/60 font-bold uppercase tracking-tight">Defina a data, horário e o técnico para conferência.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data da Visita *</label>
                                <Input 
                                    type="date" 
                                    min={todayStr}
                                    value={scheduledDate} 
                                    onChange={e => setScheduledDate(e.target.value)} 
                                    required 
                                    className={cn("h-12 rounded-2xl font-bold", (isPastDate || isSundayDate) && "border-red-500 ring-1 ring-red-500")} 
                                />
                                {isPastDate && (
                                    <p className="text-[10px] font-bold text-red-600 mt-1 uppercase tracking-tighter">Não é permitido agendar data anterior a hoje.</p>
                                )}
                                {isSundayDate && (
                                    <p className="text-[10px] font-bold text-red-600 mt-1 uppercase tracking-tighter">Não é permitido agendar aos domingos.</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Horário Previsto *</label>
                                <Input 
                                    type="time" 
                                    value={scheduledTime} 
                                    onChange={e => setScheduledTime(e.target.value)} 
                                    required 
                                    className={cn("h-12 rounded-2xl font-bold", (isPastTimeToday || isPastDate || isSundayDate || isInvalidBusinessHour) && "border-red-500 ring-1 ring-red-500")} 
                                />
                                {isPastTimeToday && (
                                    <p className="text-[10px] font-bold text-red-600 mt-1 uppercase tracking-tighter">Para hoje, selecione um horário posterior ao atual.</p>
                                )}
                                {isInvalidBusinessHour && (
                                    <p className="text-[10px] font-bold text-red-600 mt-1 uppercase tracking-tighter">Horário fora do expediente (08:00 às 18:00).</p>
                                )}
                                {(isPastDate || isSundayDate) && (
                                    <p className="text-[10px] font-bold text-red-600 mt-1 uppercase tracking-tighter">Corrija a data para selecionar o horário.</p>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Medidor Responsável</label>
                            <select
                                value={assignedStaffId}
                                onChange={(e) => setAssignedStaffId(e.target.value)}
                                className="flex h-12 w-full rounded-2xl border-2 border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold transition-all shadow-sm"
                            >
                                <option value="">Selecione um medidor (Opcional)</option>
                                {safeArray(measurers).map(m => (
                                    <option key={m.uid} value={m.uid}>{m.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Instruções para o Medidor</label>
                            <textarea
                                value={observations}
                                onChange={(e) => setObservations(e.target.value)}
                                className="flex min-h-[120px] w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold transition-all dark:border-slate-800 dark:bg-slate-900"
                                placeholder="Ex: Cliente só atende após as 14h. Medir área total do frontão..."
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-6 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
                {step === 2 ? (
                    <Button variant="ghost" onClick={() => setStep(1)} className="font-bold text-slate-500 h-10 px-6">
                        <ChevronLeft className="w-4 h-4 mr-2" /> Voltar
                    </Button>
                ) : (
                    <div />
                )}

                {step === 1 ? (
                    <Button 
                        onClick={() => setStep(2)} 
                        disabled={!clientData.name || !clientData.phone || !clientData.street}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-black uppercase tracking-widest text-[10px] px-8 h-10 rounded-xl shadow-lg shadow-purple-500/20"
                    >
                        Próximo Passo <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                ) : (
                    <Button 
                        onClick={handleFinalSubmit}
                        disabled={isSubmitting || isScheduleInvalid}
                        className={cn(
                            "font-black uppercase tracking-widest text-[10px] px-10 h-10 rounded-xl shadow-lg transition-all",
                            isScheduleInvalid ? "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20"
                        )}
                    >
                        {isSubmitting ? (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Finalizando...
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span>Confirmar e Agendar</span>
                                <CheckCircle2 className="w-4 h-4" />
                            </div>
                        )}
                    </Button>
                )}
            </div>
        </div>
    );
};
