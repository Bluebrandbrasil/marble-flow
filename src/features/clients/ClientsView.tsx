import { safeArray } from '../../lib/dataDiagnostics';
import { exportToMetaExcel, exportToExcel } from '../../lib/exportUtils';
import { safeParseISO, compareDatesSafe } from '../../lib/dateUtils';
import { toISODateSafe } from '../../lib/dateWriteUtils';
import React, { useState, useMemo, useEffect } from 'react';
import { useClients } from '../../hooks/useClients';
import { 
    X, FileText, Edit2, Search, 
    TrendingUp, Users, 
    Star, Activity,
    Target, ShieldAlert, Sparkles, TrendingDown,
    Lightbulb, BrainCircuit, Rocket, Calendar, Loader2, Download,
    Trash2, RefreshCcw, Archive
} from 'lucide-react';
import { softDeleteClient, restoreClient, getClientRelationshipSummary, ClientRelationshipSummary } from '../../services/clientService';
import { canAccess } from '../../config/permissions';
import type { Client, Order, Quote } from '../../types';
import { useInfluencers } from '../../hooks/useInfluencers';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useOutletContext, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { format,  differenceInDays, isBefore, differenceInMonths } from 'date-fns';
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { openWhatsAppFollowUp } from '../../utils/whatsappHelper';
import { HighlightText, normalizeStr } from '../../lib/searchUtils';
import { ModuleSearchInput } from '../../components/ui/ModuleSearchInput';
import { applyCepMask } from '../../lib/maskUtils';
import { 
    WorkflowBadge, 
    WorkflowTimeline, 
    getEffectiveWorkflowStage 
} from '../../components/workflow/WorkflowStatus';
import { syncClientRegionToDocuments, syncClientDataToContracts } from '../../services/clientSyncService';
import { getClientRegionLabel } from '../../lib/intelligenceUtils';

interface ClientsViewProps {
    onNewQuoteFromClient?: (client: Client) => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({ onNewQuoteFromClient }) => {
    const { profile, user } = useAuth();
    const { isAddClientModalOpen, setIsAddClientModalOpen, handleConvertClientToMeasurement } = useOutletContext<any>();
    
    const [clientSearchText, setClientSearchText] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState(clientSearchText);
    const [clientStatusFilter, setClientStatusFilter] = useState<'active' | 'inactive' | 'deleted' | 'all'>('active');
    const { clients, isLoading, error, addClient, updateClient, searchMode } = useClients(debouncedSearch, clientStatusFilter);
    const { influencers } = useInfluencers();

    const [isSessionOutdated, setIsSessionOutdated] = useState(false);

    useEffect(() => {
        if (user) {
            user.getIdTokenResult().then(tokenResult => {
                const claimsCompanyId = tokenResult.claims.companyId;
                if (profile?.companyId && claimsCompanyId && claimsCompanyId !== profile.companyId) {
                    console.warn("[CLAIMS_DEBUG] Session mismatch:", { claimsCompanyId, profileCompanyId: profile.companyId });
                    setIsSessionOutdated(true);
                } else {
                    setIsSessionOutdated(false);
                }
            }).catch(err => {
                console.error("[CLAIMS_DEBUG] Error checking claims:", err);
            });
        }
    }, [user, profile?.companyId]);

    const [newClientId, setNewClientId] = useState<string | null>(null);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(clientSearchText);
        }, 300);
        return () => clearTimeout(timer);
    }, [clientSearchText]);

    const location = useLocation();
    
    // Auto-open modal if state says so (e.g. from Dashboard button)
    useEffect(() => {
        if (location.state?.openAddModal) {
            setIsAddClientModalOpen(true);
            // Clear state so it doesn't reopen on every render if we stay on this page
            window.history.replaceState({}, '');
        }
    }, [location.state, setIsAddClientModalOpen]);

    const [targetClientId, setTargetClientId] = useState<string | null>(null);

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const clientId = searchParams.get('clientId');
        if (clientId) {
            setTargetClientId(clientId);
            // Clean up the URL
            window.history.replaceState({}, '', location.pathname);
        }
    }, [location.search]);

    useEffect(() => {
        if (targetClientId && !isLoading) {
            const found = clients.find(c => c.id === targetClientId);
            if (found) {
                setSelectedClientId(targetClientId);
            } else {
                alert('Cliente não encontrado ou sem permissão de acesso.');
            }
            setTargetClientId(null);
        }
    }, [targetClientId, isLoading, clients]);

    // --- STATE ---
    const [orders, setOrders] = useState<Order[]>([]);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
    const [filterLifecycle, setFilterLifecycle] = useState('all');

    // --- MODAL DELETE STATE ---
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [deleteReasonText, setDeleteReasonText] = useState('');
    const [relationshipSummary, setRelationshipSummary] = useState<ClientRelationshipSummary | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // --- FORM STATE ---
    const [isEditing, setIsEditing] = useState(false);

    // Reset form when opening modal for a new client (triggered from global header)
    useEffect(() => {
        if (isAddClientModalOpen && !isEditing) {
            resetForm();
        }
    }, [isAddClientModalOpen, isEditing]);
    const [editingClientId, setEditingClientId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [document, setDocument] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [city, setCity] = useState('');
    const [cState, setCState] = useState('');
    const [neighborhood, setNeighborhood] = useState('');
    const [cepWarning, setCepWarning] = useState('');
    const [isCepLoading, setIsCepLoading] = useState(false);
    const [zipCode, setZipCode] = useState('');
    const [street, setStreet] = useState('');
    const [type, setType] = useState('Final');
    const [status, setStatus] = useState<'active' | 'inactive'>('active');
    const [origin, setOrigin] = useState<string>('');
    const [condominium, setCondominium] = useState('');
    const [influencerId, setInfluencerId] = useState('');
    const [influencerName, setInfluencerName] = useState('');
    const [referralCode, setReferralCode] = useState('');
    const [referralStatus, setReferralStatus] = useState<string>('lead');
    const [number, setNumber] = useState('');
    const [complement, setComplement] = useState('');

    // Fetch data
    useEffect(() => {
        if (!import.meta.env.PROD) {
            console.log('[DATA_DEBUG] ClientsView profile:', {
                companyId: profile?.companyId,
                userId: user?.uid,
                role: profile?.role
            });
        }

        if (!profile?.companyId) {
            if (!import.meta.env.PROD) {
                console.log('[DATA_DEBUG] ClientsView: No companyId, skipping fetch');
            }
            return;
        }

        const qOrders = query(collection(db, 'pedidos'), where('companyId', '==', profile.companyId));
        const qQuotes = query(collection(db, 'orcamentos'), where('companyId', '==', profile.companyId));
        
        const unsubOrders = onSnapshot(qOrders, snap => {
            if (!import.meta.env.PROD) {
                console.log('[DATA_DEBUG] Orders snapshot docs:', snap.size);
            }
            const data: Order[] = [];
            snap.forEach(d => data.push({ id: d.id, ...d.data() } as Order));
            setOrders(data);
        }, err => {
            if (!import.meta.env.PROD) {
                console.log('[DATA_DEBUG] Orders snapshot error:', err);
            }
        });

        const unsubQuotes = onSnapshot(qQuotes, snap => {
            if (!import.meta.env.PROD) {
                console.log('[DATA_DEBUG] Quotes snapshot docs:', snap.size);
            }
            const data: Quote[] = [];
            snap.forEach(d => data.push({ id: d.id, ...d.data() } as Quote));
            setQuotes(data);
        }, err => {
            if (!import.meta.env.PROD) {
                console.log('[DATA_DEBUG] Quotes snapshot error:', err);
            }
        });
        
        return () => { unsubOrders(); unsubQuotes(); };
    }, [profile?.companyId, user?.uid]);

    useEffect(() => {
        if (!import.meta.env.PROD) {
            console.log('[DATA_DEBUG] Clients list update:', clients.length);
        }
    }, [clients]);

    // --- INTELLIGENT ANALYTICAL ENGINE (IA CRM) ---
    const clientInsights = useMemo(() => {
        const insights: Record<string, any> = {};
        const today = new Date();

        clients.forEach(c => {
            const cOrders = safeArray(orders).filter(o => o.clientId === c.id && o.status !== 'cancelado');
            const cQuotes = safeArray(quotes).filter(q => q.clientId === c.id);
            
            const totalSpent = safeArray(cOrders).reduce((acc, o) => acc + (o.totalAmount || 0), 0);
            const overdueAmount = safeArray(cOrders).reduce((acc, o) => {
                if (o.paymentStatus === 'paid') return acc;
                const due = o.dueDate ? safeParseISO(o.dueDate) : null;
                return (due && isBefore(due, today) && format(due, 'yyyy-MM-dd') !== format(today, 'yyyy-MM-dd')) 
                    ? acc + ((o.totalAmount || 0) - (o.downPayment || 0)) : acc;
            }, 0);

            const lastOrder = cOrders.sort((a,b) => compareDatesSafe(a.createdAt, b.createdAt, 'desc'))[0];
            const firstOrder = cOrders.sort((a,b) => compareDatesSafe(b.createdAt, a.createdAt, 'desc'))[0];
            const daysSinceLast = lastOrder ? ((() => { const d = safeParseISO(lastOrder.createdAt); return d ? differenceInDays(today, d) : 999; })()) : 999;
            
            // Monthly Forecast / Revenue
            const firstOrderDate = firstOrder ? safeParseISO(firstOrder.createdAt) : null;
            const monthsActive = firstOrderDate ? Math.max(1, differenceInMonths(today, firstOrderDate)) : 1;
            const avgMonthlyRevenue = totalSpent / monthsActive;

            // Lifecycle Classification
            let lifecycle = 'NOVO';
            if (cOrders.length > 5 && daysSinceLast < 60) lifecycle = 'MADURO';
            else if (cOrders.length >= 2 && daysSinceLast < 45) lifecycle = 'CRESCIMENTO';
            else if (daysSinceLast > 90 && totalSpent > 5000) lifecycle = 'EM QUEDA';

            // Relationship Status & Scoring
            let relStatus = 'ATIVO';
            if (daysSinceLast > 120) relStatus = 'DORMETE';
            if (overdueAmount > 0) relStatus = 'INADIMPLENTE';
            if (cOrders.length > 8) relStatus = 'EMBAIXADOR';

            // Conversion & Efficiency
            const conversion = (cOrders.length + cQuotes.length) > 0 ? (cOrders.length / (cOrders.length + cQuotes.length)) * 100 : 0;
            const quoteWear = cQuotes.length > 4 && cOrders.length === 0;

            // Intelligent Recommendations
            let recommendation = 'Aguardando interação inicial';
            let recType = 'neutral';
            if (overdueAmount > 0) { recommendation = 'Bloquear novos orçamentos (Débito)'; recType = 'danger'; }
            else if (lifecycle === 'EM QUEDA') { recommendation = 'Ligar para Reativação (Desconto)'; recType = 'warning'; }
            else if (lifecycle === 'MADURO' && daysSinceLast > 30) { recommendation = 'Enviar lembrete VIP'; recType = 'info'; }
            else if (quoteWear) { recommendation = 'Revisar política de preços/atendimento'; recType = 'danger'; }
            else if (lifecycle === 'CRESCIMENTO') { recommendation = 'Oferecer parceria estratégica'; recType = 'success'; }

            // Score Logic (0-100)
            let score = 30;
            score += Math.min(30, (totalSpent / 10000) * 5);
            score += Math.min(20, cOrders.length * 2);
            score += (100 - Math.min(100, daysSinceLast)) / 5;
            if (overdueAmount > 0) score -= 50;

            insights[c.id] = { 
                totalSpent, overdueAmount, daysSinceLast, lifecycle, 
                relStatus, score: Math.max(0, Math.min(100, score)), 
                orderCount: cOrders.length, conversion, avgMonthlyRevenue,
                quoteCount: cQuotes.length, recommendation, recType,
                potential: lifecycle === 'CRESCIMENTO' || (conversion > 80 && totalSpent < 20000)
            };
        });
        return insights;
    }, [clients, orders, quotes]);

    const displayClients = useMemo(() => {
        return safeArray(clients).map(c => ({ ...c, ...clientInsights[c.id] }))
            .filter(c => {
                const matchesLifecycle = filterLifecycle === 'all' || c.lifecycle === filterLifecycle;
                return matchesLifecycle;
            });
    }, [clients, clientInsights, filterLifecycle]);

    const priorityActions = useMemo(() => {
        const actions: any[] = [];
        Object.entries(clientInsights).forEach(([id, data]) => {
            const client = clients.find(c => c.id === id);
            if (!client) return;
            if (data.overdueAmount > 0) actions.push({ client, type: 'CRÍTICO', msg: 'Regularizar pendência financeira', icon: ShieldAlert, color: 'rose' });
            if (data.lifecycle === 'EM QUEDA') actions.push({ client, type: 'REATIVAR', msg: 'Queda de frequência detectada', icon: TrendingDown, color: 'amber' });
            if (data.potential) actions.push({ client, type: 'POTENCIAL', msg: 'Alta probabilidade de conversão', icon: Rocket, color: 'emerald' });
        });
        return actions.slice(0, 3);
    }, [clientInsights, clients]);

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const handleWhatsApp = (client: any) => {
        openWhatsAppFollowUp(client.phone || '', '');
        try {
            updateDoc(doc(db, 'clients', client.id), {
                crmLogs: arrayUnion({ action: "Ação de Relacionamento IA - WhatsApp", timestamp: toISODateSafe(new Date()), userId: user?.uid })
            });
        } catch (e) {}
    };

    const resetForm = () => {
        setName(''); setDocument(''); setEmail(''); setPhone(''); setCity(''); setCState('');
        setZipCode(''); setStreet(''); setType('Final'); setStatus('active'); setIsEditing(false);
        setEditingClientId(null); setOrigin(''); setCondominium(''); setInfluencerId('');
        setInfluencerName(''); setReferralCode(''); setReferralStatus('lead'); setNumber('');
        setComplement(''); setNeighborhood(''); setCepWarning('');
    };

    const handleDeleteClick = async (client: Client) => {
        if (!profile?.companyId) return;
        setClientToDelete(client);
        setDeleteReason('');
        setDeleteReasonText('');
        setRelationshipSummary(null);
        setIsDeleteModalOpen(true);
        try {
            const summary = await getClientRelationshipSummary(profile.companyId, client.id);
            setRelationshipSummary(summary);
        } catch (e) {
            console.error("Erro ao carregar resumo de vínculos:", e);
        }
    };

    const handleConfirmDelete = async () => {
        if (!clientToDelete || !profile?.companyId || !user?.uid) return;
        const reasonStr = deleteReason === 'outro' ? deleteReasonText : deleteReason;
        if (!reasonStr.trim()) {
            alert('Por favor, informe o motivo da exclusão.');
            return;
        }

        setIsDeleting(true);
        try {
            await softDeleteClient({
                companyId: profile.companyId,
                clientId: clientToDelete.id,
                userId: user.uid,
                reason: reasonStr
            });
            setIsDeleteModalOpen(false);
            setClientToDelete(null);
        } catch (e: any) {
            console.error(e);
            alert(e.message || 'Não foi possível excluir o cliente.');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleRestoreClick = async (client: Client) => {
        if (!profile?.companyId || !user?.uid) return;
        if (!confirm('Deseja realmente restaurar este cliente?')) return;
        
        try {
            await restoreClient({
                companyId: profile.companyId,
                clientId: client.id,
                userId: user.uid
            });
        } catch (e: any) {
            console.error(e);
            alert(e.message || 'Não foi possível restaurar o cliente.');
        }
    };

    const handleEditClick = (client: Client) => {
        setName(client.name || ''); setDocument(client.document || ''); setEmail(client.email || '');
        setPhone(client.phone || ''); setCity(client.city || ''); setCState(client.state || '');
        setZipCode(client.zipCode || ''); setStreet(client.street || ''); setType(client.type || 'Final'); setStatus(client.status || 'active');
        setOrigin(client.origin || ''); setCondominium(client.condominium || ''); setInfluencerId(client.influencerId || '');
        setInfluencerName(client.influencerName || ''); setReferralCode(client.referralCode || ''); setReferralStatus(client.referralStatus || 'lead');
        setNumber(client.number || '');
        setComplement(client.complement || '');
        setNeighborhood(client.neighborhood || '');
        setCepWarning('');
        setIsEditing(true); setEditingClientId(client.id); setIsAddClientModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
              // BLOCKING VALIDATIONS (Rule #42)
              const cleanCep = zipCode ? zipCode.replace(/\D/g, '') : '';
              if (cleanCep.length > 0) {
                  if (cleanCep.length < 8) {
                      alert('Informe um CEP válido (8 dígitos).');
                      return;
                  }
                  const cleanCity = (city || '').trim();
                  const cleanState = (cState || '').trim();
                  if (!cleanCity || cleanCity.toLowerCase() === 'undefined' || cleanCity.toLowerCase() === 'null') {
                      alert('Cidade é obrigatória quando o CEP estiver preenchido.');
                      return;
                  }
                  if (!cleanState || cleanState.toLowerCase() === 'undefined' || cleanState.toLowerCase() === 'null') {
                      alert('Estado é obrigatório quando o CEP estiver preenchido.');
                      return;
                  }
              }
             if (!origin) {
                 alert('Selecione a origem do cliente.');
                 return;
             }
             if (origin === 'Influencer' && !influencerId) {
                 alert('Selecione o influencer responsável por esta indicação.');
                 return;
             }

             const cleanNumber = (number && !['null', 'undefined', '-', ''].includes(String(number).trim().toLowerCase())) ? number.trim() : '';
             const data = { 
                 name, document, email, phone, city, state: cState, 
                 zipCode: zipCode.replace(/\D/g, ''), // SANITIZED CEP
                 street, number: cleanNumber, complement, neighborhood, type, status, 
                 address: `${street}${cleanNumber ? `, ${cleanNumber}` : ''}${complement ? ` - ${complement}` : ''}${neighborhood ? ` - ${neighborhood}` : ''}, ${city} - ${cState}`,
                 origin: origin as any, condominium, 
                 hasInfluencer: origin === 'Influencer', 
                 influencerId: origin === 'Influencer' ? influencerId : '', 
                 influencerName: origin === 'Influencer' ? influencerName : '', 
                 influencerCode: origin === 'Influencer' ? referralCode : '', 
                 referralCode: origin === 'Influencer' ? referralCode : '', 
                 referralSource: origin === 'Influencer' ? 'influencer' : '',
                 referralStatus: referralStatus as any,
                 regionLabel: getClientRegionLabel({}, { city, state: cState, neighborhood }),
                 regionKey: normalizeStr(getClientRegionLabel({}, { city, state: cState, neighborhood }))
             };
             
             let finalClientId = editingClientId;
             
             if (isEditing && editingClientId) {
                 await updateClient(editingClientId, data);
                 alert("Cliente atualizado com sucesso.");
             } else {
                 finalClientId = await addClient(data);
                 setNewClientId(finalClientId);
                 setTimeout(() => setNewClientId(null), 3000);
                 // Scroll to top
                 window.scrollTo({ top: 0, behavior: 'smooth' });
             }
             
             // Trigger regional sync
             if (finalClientId && profile?.companyId) {
                 const generatedRegion = data.regionLabel;
                 if (generatedRegion && generatedRegion !== 'Região não informada') {
                     try {
                         await syncClientRegionToDocuments(finalClientId, {
                             city: data.city,
                             state: data.state,
                             neighborhood: data.neighborhood,
                             regionLabel: generatedRegion,
                             companyId: profile.companyId
                         });
                     } catch (err) {
                         console.error('Erro ao sincronizar região:', err);
                     }
                 }
             }

             setIsAddClientModalOpen(false); resetForm();
        } catch (e) { console.error(e); }
    };

    const handleZipCodeLookup = async (cep: string) => {
        const cleanCep = cep.replace(/\D/g, '');
        setZipCode(applyCepMask(cleanCep));
        
        if (cleanCep.length === 8) {
            setIsCepLoading(true);
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
                const data = await response.json();
                
                if (data.erro) {
                    alert('CEP não encontrado. Por favor, verifique os dígitos.');
                    setCepWarning('');
                } else {
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
                    if (!cState) setCState(data.uf || '');
                    setNumber('');
                    setComplement('');
                }
            } catch (e) {
                console.error("Erro na busca de CEP:", e);
                alert('Falha ao conectar com o serviço de CEP. Tente preencher manualmente.');
            } finally {
                setIsCepLoading(false);
            }
        }
    };

    if (isLoading) return <div className="flex items-center justify-center min-h-[400px]"><div className="w-10 h-10 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin" /></div>;

    const selectedClient = displayClients.find(c => c.id === selectedClientId);

    return (
        <div className="flex h-screen overflow-hidden bg-brand-rocha-bg">
            <div className="flex-1 overflow-y-auto p-[var(--density-p)] space-y-[var(--density-gap)] custom-scrollbar">
                
                {/* --- INTELLIGENT HEADER --- */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <Button 
                            variant="outline" 
                            onClick={() => {
                                const data = safeArray(displayClients).map(c => ({ Nome: c.name, Telefone: c.phone || "" }));
                                exportToMetaExcel(data, "clientes_meta");
                            }}
                            className="h-10 border-slate-200 text-slate-600 hover:text-brand-rocha-primary bg-white font-black uppercase text-[10px] tracking-widest rounded-xl shadow-sm"
                        >
                            <Download className="w-4 h-4 mr-2" /> Exportar Meta Ads
                        </Button>
                    <div>
                        <h1 className="rocha-text-title flex items-center gap-3">
                            Gestão Estratégica <ShieldAlert className="h-5 w-5 text-brand-rocha-primary" />
                        </h1>
                        <p className="rocha-text-label mt-1 opacity-70">Monitoramento Inteligente do Ciclo de Vida do Cliente</p>
                    </div>
                </div>

                {/* --- PRIORITY ACTIONS BAR --- */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--density-gap)]">
                      {safeArray(priorityActions).map((action, i) => (
                           <div key={i} className="rocha-card bg-slate-900 text-white flex items-center gap-4 relative group border border-white/5">
                             <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:scale-125 transition-transform"><action.icon className="h-8 w-8" /></div>
                             <div className={cn("h-10 w-10 flex items-center justify-center shrink-0", 
                                 action.color === 'rose' ? 'text-rose-500' : 
                                 action.color === 'amber' ? 'text-amber-500' : 'text-emerald-500'
                             )}>
                                 <action.icon className="h-5 w-5" />
                             </div>
                             <div className="flex flex-col">
                                 <span className="rocha-text-label opacity-60">{action.type}</span>
                                 <span className="text-[11px] font-black uppercase leading-tight mt-0.5">{action.client.name}</span>
                                 <span className="text-[9px] font-bold text-slate-400 mt-0.5">{action.msg}</span>
                             </div>
                           </div>
                      ))}
                      {priorityActions.length === 0 && (
                           <div className="col-span-3 h-16 bg-white dark:bg-slate-900/40 border-2 border-dashed border-slate-100 dark:border-white/5 rounded-2xl flex items-center justify-center">
                               <span className="rocha-text-label text-slate-400">Nenhuma ação prioritária sugerida pela IA</span>
                           </div>
                      )}
                </div>

                {/* --- RADAR HUB --- */}
                {isSessionOutdated && (
                    <div className="p-4 bg-amber-50 border-l-4 border-amber-500 rounded-xl flex items-center gap-3 shadow-sm animate-in fade-in">
                        <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
                        <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                            Sessão desatualizada. Saia e entre novamente para atualizar suas permissões.
                        </span>
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-rose-50 border-l-4 border-rose-500 rounded-xl flex items-center gap-3 shadow-sm animate-in fade-in">
                        <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0" />
                        <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
                            Erro ao carregar clientes. Verifique permissões da empresa.
                        </span>
                    </div>
                )}

                <Card className="rocha-panel bg-white p-0">
                    <div className="rocha-table-cell flex flex-wrap justify-between items-center gap-4 border-b border-brand-rocha-border">
                        <div className="flex gap-4">
                            <select value={clientStatusFilter} onChange={e => setClientStatusFilter(e.target.value as any)} className="bg-slate-50 border-none rounded-lg px-4 rocha-text-label text-slate-500 outline-none h-[var(--density-input-h)] shadow-sm">
                                <option value="active">ATIVOS</option>
                                <option value="inactive">INATIVOS</option>
                                <option value="deleted">EXCLUÍDOS</option>
                                <option value="all">TODOS</option>
                            </select>
                            <select value={filterLifecycle} onChange={e => setFilterLifecycle(e.target.value)} className="bg-slate-50 border-none rounded-lg px-4 rocha-text-label text-slate-500 outline-none h-[var(--density-input-h)] shadow-sm">
                                <option value="all">CICLO DE VIDA (TODOS)</option>
                                <option value="NOVO">NOVO</option>
                                <option value="CRESCIMENTO">CRESCIMENTO</option>
                                <option value="MADURO">MADURO</option>
                                <option value="EM QUEDA">EM QUEDA</option>
                            </select>
                        </div>
                        <div className="relative w-full md:w-96 group">
                            <ModuleSearchInput
                                moduleName="Clientes"
                                placeholder="Nome, Telefone, CPF..."
                                value={clientSearchText}
                                onChange={setClientSearchText}
                                resultCount={clientSearchText.trim().length > 0 ? clients.length : undefined}
                            />
                            {debouncedSearch && !isLoading && (
                                <div className="absolute -right-2 top-1/2 translate-x-full -translate-y-1/2 flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-1 rounded-md border border-brand-rocha-border">
                                        Busca por {searchMode === 'phone' ? 'Telefone/Doc' : 'Nome/Cidade'}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="rocha-text-label text-slate-400 border-b border-brand-rocha-border bg-slate-50/10">
                                    <th className="rocha-table-cell text-left">Ranking IA</th>
                                    <th className="rocha-table-cell text-left">Cliente / Forecast</th>
                                    <th className="rocha-table-cell text-left">Conversão & Eficiência</th>
                                    <th className="rocha-table-cell text-center">Status Ciclo</th>
                                    <th className="rocha-table-cell text-left">Recomendação IA</th>
                                    <th className="rocha-table-cell text-right">Ações Operacionais</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {isSessionOutdated && (
                                    <tr>
                                        <td colSpan={6} className="px-10 py-16 text-center">
                                            <div className="flex flex-col items-center gap-2 text-amber-500">
                                                <ShieldAlert className="h-8 w-8" />
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em]">
                                                    Sessão desatualizada. Saia e entre novamente para atualizar suas permissões.
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {!isSessionOutdated && error && (
                                    <tr>
                                        <td colSpan={6} className="px-10 py-16 text-center">
                                            <div className="flex flex-col items-center gap-2 text-rose-500">
                                                <ShieldAlert className="h-8 w-8" />
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em]">
                                                    Erro ao carregar clientes. Verifique permissões da empresa.
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {!isSessionOutdated && !error && displayClients.length === 0 && !isLoading && (
                                    <tr>
                                        <td colSpan={6} className="px-10 py-16 text-center">
                                            <div className="flex flex-col items-center gap-2 opacity-30">
                                                <Users className="h-10 w-10 text-slate-400" />
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                                                    {debouncedSearch ? 'Nenhum cliente encontrado para esta busca' : 'Nenhum cliente cadastrado ainda'}
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {safeArray(displayClients).map(client => (
                                    <tr 
                                        key={client.id} 
                                        onClick={() => setSelectedClientId(client.id)} 
                                        className={cn(
                                            "hover:bg-slate-50 transition-all cursor-pointer group border-l-4 border-transparent", 
                                            selectedClientId === client.id ? 'bg-slate-50' : '',
                                            newClientId === client.id && 'border-brand-rocha-primary animate-pulse bg-violet-50/10'
                                        )}
                                    >
                                        <td className="rocha-table-cell">
                                             <div className="flex items-center gap-3">
                                                 <div className={cn("h-8 w-8 text-[10px] font-black border rounded-lg flex items-center justify-center transition-all group-hover:scale-110", 
                                                     client.score > 75 ? 'border-brand-rocha-primary text-brand-rocha-primary' : 'border-slate-200 text-slate-400'
                                                 )}>
                                                     {client.score.toFixed(0)}
                                                 </div>
                                                 {client.potential && <Rocket className="h-3 w-3 text-emerald-500" />}
                                             </div>
                                        </td>
                                        <td className="rocha-table-cell">
                                             <div className="flex flex-col">
                                                 <span className="text-xs font-black text-slate-900 uppercase leading-none group-hover:text-brand-rocha-primary transition-colors">
                                                     <HighlightText text={client.name} term={debouncedSearch} />
                                                 </span>
                                                 <div className="flex items-center gap-2 mt-1">
                                                     <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Est. Mensal: {formatCurrency(client.avgMonthlyRevenue)}</span>
                                                     {debouncedSearch && client.city && (normalizeStr(client.city).includes(normalizeStr(debouncedSearch))) && (
                                                         <span className="text-[7px] font-black text-brand-rocha-primary uppercase bg-brand-rocha-primary/5 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                                                             📍 <HighlightText text={client.city} term={debouncedSearch} />
                                                         </span>
                                                     )}
                                                 </div>
                                             </div>
                                        </td>
                                        <td className="rocha-table-cell">
                                             <div className="flex items-center gap-3">
                                                 <div className="flex flex-col">
                                                     <span className="text-[10px] font-black text-slate-900 dark:text-white uppercase">{client.conversion.toFixed(0)}%</span>
                                                     <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Closing Rate</span>
                                                 </div>
                                                 <div className="h-1 w-12 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                                                     <div className="h-full bg-indigo-500" style={{ width: `${client.conversion}%` }} />
                                                 </div>
                                             </div>
                                        </td>
                                        <td className="rocha-table-cell text-center">
                                             <span className={cn(
                                                 "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest",
                                                 client.lifecycle === 'MADURO' ? "bg-indigo-500 text-white" :
                                                 client.lifecycle === 'CRESCIMENTO' ? "bg-emerald-500 text-white" :
                                                 client.lifecycle === 'EM QUEDA' ? "bg-rose-500 text-white" :
                                                 "bg-slate-100 text-slate-400"
                                             )}>
                                                 {client.lifecycle}
                                             </span>
                                        </td>
                                        <td className="px-4 py-3">
                                             <div className={cn("flex items-center gap-2 text-[9px] font-black uppercase tracking-tighter", 
                                                 client.recType === 'danger' ? 'text-rose-500' : 
                                                 client.recType === 'warning' ? 'text-amber-500' : 'text-slate-500 dark:text-slate-400'
                                             )}>
                                                 <Lightbulb className="h-3.5 w-3.5" />
                                                 {client.recommendation}
                                             </div>
                                        </td>
                                        <td className="px-10 py-6 text-right">
                                              <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                                                  {client.status !== 'deleted' ? (
                                                      <>
                                                          <button 
                                                            title="WhatsApp"
                                                            onClick={(e) => { e.stopPropagation(); handleWhatsApp(client); }} 
                                                            className="h-9 w-9 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-xl flex items-center justify-center transition-all"
                                                          >
                                                             <WhatsAppIcon className="h-5 w-5" />
                                                          </button>
                                                          <button 
                                                            title="Novo Orçamento"
                                                            onClick={(e) => { e.stopPropagation(); onNewQuoteFromClient?.(client); }} 
                                                            className="h-9 w-9 bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white rounded-xl flex items-center justify-center transition-all"
                                                          >
                                                             <FileText className="h-5 w-5" />
                                                          </button>
                                                          <button 
                                                            title="Agendar Medição"
                                                            onClick={(e) => { e.stopPropagation(); handleConvertClientToMeasurement(client); }} 
                                                            className="h-9 w-9 bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-slate-900 dark:hover:bg-white hover:text-white dark:hover:text-slate-900 rounded-xl flex items-center justify-center transition-all"
                                                          >
                                                             <Calendar className="h-5 w-5" />
                                                          </button>
                                                          <button 
                                                            title="Editar"
                                                            onClick={(e) => { e.stopPropagation(); handleEditClick(client); }} 
                                                            className="h-9 w-9 bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl flex items-center justify-center transition-all"
                                                          >
                                                            <Edit2 className="h-4 w-4" />
                                                          </button>
                                                          {canAccess(profile?.role, 'clients:delete') && (
                                                              <button 
                                                                title="Excluir cliente"
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteClick(client); }} 
                                                                className="h-9 w-9 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl flex items-center justify-center transition-all ml-2"
                                                                aria-label="Excluir cliente"
                                                              >
                                                                <Trash2 className="h-4 w-4" />
                                                              </button>
                                                          )}
                                                      </>
                                                  ) : (
                                                      canAccess(profile?.role, 'clients:restore') && (
                                                          <button 
                                                            title="Restaurar cliente"
                                                            onClick={(e) => { e.stopPropagation(); handleRestoreClick(client); }} 
                                                            className="h-9 w-9 bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500 hover:text-white rounded-xl flex items-center justify-center transition-all"
                                                            aria-label="Restaurar cliente"
                                                          >
                                                            <RefreshCcw className="h-4 w-4" />
                                                          </button>
                                                      )
                                                  )}
                                              </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            {/* --- ANALYTICAL SIDEBAR (IA BRAIN) --- */}
            {selectedClientId && selectedClient && (
                <div className="w-full lg:w-[520px] bg-white border-l border-brand-rocha-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-500 z-50">
                    <div className="p-10 border-b border-brand-rocha-border flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-5">
                            <div className="h-16 w-16 bg-brand-rocha-primary rounded-3xl flex items-center justify-center shadow-2xl shadow-violet-500/20 text-white transition-transform hover:scale-105">
                                <BrainCircuit className="h-8 w-8" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900 uppercase leading-none tracking-tighter">{selectedClient.name}</h3>
                                <div className="flex items-center gap-3 mt-2">
                                    <Badge className="bg-slate-900 text-white text-[9px] font-black uppercase px-2 rounded-lg">{selectedClient.lifecycle}</Badge>
                                    <span className="text-[10px] font-black text-brand-rocha-primary uppercase tracking-widest flex items-center gap-1.5"><Star className="h-3 w-3" /> Score {selectedClient.score.toFixed(0)}</span>
                                </div>
                            </div>
                        </div>
                        <button onClick={() => setSelectedClientId(null)} className="h-12 w-12 flex items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm border border-brand-rocha-border"><X className="h-6 w-6" /></button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar">
                         {/* WORKFLOW STATUS ROLLOUT */}
                         {(() => {
                             const clientQuotes = safeArray(quotes).filter(q => q.clientId === selectedClientId);
                             const latestQuote = clientQuotes.sort((a,b) => (b.createdAt && a.createdAt) ? compareDatesSafe(a.createdAt, b.createdAt, 'desc') : 0)[0];
                             
                             if (!latestQuote) return null;
                             
                             const stage = getEffectiveWorkflowStage(latestQuote);
                             
                             return (
                                 <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                     <div className="flex items-center justify-between">
                                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                             <Target className="h-4 w-4 text-brand-emerald" /> Estágio Comercial Ativo
                                         </h4>
                                         <WorkflowBadge stage={stage} size="sm" />
                                     </div>
                                     
                                     <div className="bg-slate-50 dark:bg-white/5 rounded-3xl border border-slate-100 dark:border-white/5 p-1">
                                         <WorkflowTimeline currentStage={stage} />
                                     </div>
                                     
                                     <div className="flex items-center justify-between px-2">
                                         <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                             Ref: {latestQuote.id.slice(0, 8)}
                                         </span>
                                         <Button 
                                             variant="ghost" 
                                             size="sm" 
                                             className="h-7 text-[9px] font-black uppercase text-brand-emerald hover:bg-brand-emerald/5"
                                             onClick={() => {
                                                 // Navigator logic or similar if needed, for now just a mockup of link
                                                 alert('Abrindo detalhes do orçamento...');
                                             }}
                                         >
                                             Ver Orçamento
                                         </Button>
                                     </div>
                                 </div>
                             );
                         })()}

                         {/* QUICK ACTIONS */}
                         <div className="grid grid-cols-4 gap-3 bg-slate-50 dark:bg-white/5 p-4 rounded-3xl border border-slate-100 dark:border-white/5">
                             <button onClick={() => handleWhatsApp(selectedClient)} className="flex flex-col items-center gap-2 group">
                                 <div className="h-12 w-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                                     <WhatsAppIcon className="h-6 w-6" />
                                 </div>
                                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Whats</span>
                             </button>
                             <button onClick={() => onNewQuoteFromClient?.(selectedClient)} className="flex flex-col items-center gap-2 group">
                                 <div className="h-12 w-12 bg-blue-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">
                                     <FileText className="h-6 w-6" />
                                 </div>
                                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Orçado</span>
                             </button>
                             <button onClick={() => handleConvertClientToMeasurement(selectedClient)} className="flex flex-col items-center gap-2 group">
                                 <div className="h-12 w-12 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                     <Calendar className="h-6 w-6" />
                                 </div>
                                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Medição</span>
                             </button>
                             <button onClick={() => handleEditClick(selectedClient)} className="flex flex-col items-center gap-2 group">
                                 <div className="h-12 w-12 bg-white dark:bg-slate-800 text-slate-500 rounded-2xl flex items-center justify-center shadow-md border border-slate-100 dark:border-white/5 group-hover:scale-110 transition-transform">
                                     <Edit2 className="h-5 w-5" />
                                 </div>
                                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Editar</span>
                             </button>
                         </div>

                         {/* Reprocessar região */}
                         {profile && ['admin', 'superadmin', 'company_admin'].includes(profile.role || '') && (
                             <Button 
                                 variant="outline"
                                 className="w-full mt-4 h-10 border-brand-rocha-primary/30 text-brand-rocha-primary bg-brand-rocha-primary/5 hover:bg-brand-rocha-primary hover:text-white font-black uppercase text-[9px] tracking-widest rounded-xl transition-all"
                                 onClick={async () => {
                                     if (window.confirm("Esta ação atualizará a região dos registros vinculados a este cliente com base no cadastro atual. Contratos assinados não serão alterados. Deseja continuar?")) {
                                         try {
                                             const region = getClientRegionLabel({}, selectedClient);
                                             if (!region || region === 'Região não informada') {
                                                 alert("Cliente ainda sem região definida. Preencha CEP ou cidade/estado primeiro.");
                                                 return;
                                             }
                                             const count = await syncClientRegionToDocuments(selectedClient.id, {
                                                 city: selectedClient.city,
                                                 state: selectedClient.state,
                                                 neighborhood: selectedClient.neighborhood,
                                                 regionLabel: region,
                                                 companyId: profile.companyId
                                             });
                                             alert(`Sincronização concluída! ${count} registros foram atualizados com a região: ${region}`);
                                         } catch (e) {
                                             console.error(e);
                                             alert('Erro ao sincronizar região.');
                                         }
                                     }
                                 }}
                             >
                                 <Sparkles className="w-3.5 h-3.5 mr-2" /> Reprocessar região nos registros vinculados
                             </Button>
                         )}

                         {/* Predictor Dashboard */}
                         <div className="grid grid-cols-2 gap-4">
                             <div className="p-8 bg-slate-50 dark:bg-white/5 rounded-[2.5rem] border border-slate-100 dark:border-white/5 space-y-3">
                                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><TrendingUp className="h-3 w-3 text-emerald-500" /> Previsão de Receita</span>
                                 <div className="text-2xl font-black text-slate-900 dark:text-white leading-none tracking-tight">{formatCurrency(selectedClient.avgMonthlyRevenue)}</div>
                                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest opacity-60">Média mensal histórica</p>
                             </div>
                             <div className="p-8 bg-slate-50 dark:bg-white/5 rounded-[2.5rem] border border-slate-100 dark:border-white/5 space-y-3">
                                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Target className="h-3 w-3 text-indigo-500" /> Custo Comercial</span>
                                 <div className="text-2xl font-black text-slate-900 dark:text-white leading-none tracking-tight">{(100 - selectedClient.conversion).toFixed(1)}%</div>
                                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest opacity-60">Perda de conversão (Wear)</p>
                             </div>
                         </div>

                         {/* Intelligent Action Recommender */}
                         <div className={cn("p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden group", 
                             selectedClient.recType === 'danger' ? 'bg-rose-600 text-white' : 
                             selectedClient.recType === 'warning' ? 'bg-amber-500 text-white' : 'bg-slate-900 text-white'
                         )}>
                             <div className="absolute top-0 right-0 p-8 opacity-10"><Rocket className="h-20 w-20" /></div>
                             <h4 className="text-[11px] font-black uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
                                <Sparkles className="h-4 w-4" /> Recomendação Sistêmica
                             </h4>
                             <p className="text-lg font-black leading-tight mb-8">"{selectedClient.recommendation.toUpperCase()}"</p>
                             <div className="flex flex-wrap gap-2">
                                 <Badge className="bg-white/20 text-white border-white/10 uppercase text-[9px] font-black">{selectedClient.orderCount} Pedidos Concluídos</Badge>
                                 <Badge className="bg-white/20 text-white border-white/10 uppercase text-[9px] font-black">{selectedClient.quoteCount} Orçamentos Gerados</Badge>
                             </div>
                         </div>

                         {/* Insights List */}
                         <div className="space-y-6">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Activity className="h-4 w-4 text-brand-emerald" /> Insights Analíticos</h4>
                            <div className="space-y-4">
                                {[
                                    { label: 'Ciclo de Vida:', value: selectedClient.lifecycle, sub: 'Status de maturação na base' },
                                    { label: 'Eficiência de Transação:', value: `${selectedClient.conversion.toFixed(1)}%`, sub: 'Relação Quote to Order' },
                                    { label: 'Idade na Base:', value: `${selectedClient.daysSinceLast}d`, sub: 'Tempo de inatividade operacional' }
                                ].map((row, i) => (
                                    <div key={i} className="flex justify-between items-center p-5 bg-slate-50 dark:bg-white/5 rounded-3xl">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-slate-400 uppercase">{row.label}</span>
                                            <span className="text-[8px] font-bold text-slate-400 mt-0.5">{row.sub}</span>
                                        </div>
                                        <span className="text-xs font-black text-slate-900 dark:text-white uppercase">{row.value}</span>
                                    </div>
                                ))}
                            </div>
                         </div>
                    </div>

                    <div className="p-10 border-t border-brand-rocha-border flex items-center">
                         <Button onClick={() => handleWhatsApp(selectedClient)} className="h-16 w-full bg-slate-900 text-white font-black uppercase text-[11px] tracking-widest rounded-3xl shadow-2xl transition-transform active:scale-95">Executar Sugestão IA</Button>
                    </div>
                </div>
            )}

            {isAddClientModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <Card className="w-full max-w-4xl max-h-[92vh] flex flex-col p-0 border-none bg-white dark:bg-slate-950 shadow-2xl rounded-[2.5rem] overflow-hidden">
                        <div className="flex justify-between items-center p-8 border-b border-slate-100 dark:border-white/5 bg-slate-50/30">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 bg-brand-rocha-primary/10 text-brand-rocha-primary rounded-2xl flex items-center justify-center">
                                    <Target className="h-6 w-6" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight uppercase leading-none">
                                        {isEditing ? 'Atualizar Perfil' : 'Capturar Lead'}
                                    </h2>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1.5 opacity-60">
                                        {isEditing ? 'Sincronização de dados do cliente' : 'Início do funil de conversão comercial'}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => { setIsAddClientModalOpen(false); resetForm(); }} className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors"><X className="h-5 w-5" /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-10">
                             <div className="space-y-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="h-4 w-1 bg-brand-rocha-primary rounded-full"></span>
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Dados Identificatórios</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Nome completo / Razão Social</label>
                                        <Input required value={name} onChange={e => setName(e.target.value)} placeholder="EX: NOME DO CLIENTE" className="h-11 bg-slate-50 border-none text-[11px] font-bold uppercase px-5 rounded-xl" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">CPF ou CNPJ (Opcional)</label>
                                        <Input value={document} onChange={e => setDocument(e.target.value)} placeholder="000.000.000-00" className="h-11 bg-slate-50 border-none text-[11px] font-bold uppercase px-5 rounded-xl" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">WhatsApp / Telefone</label>
                                        <Input required value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" className="h-11 bg-slate-50 border-none text-[11px] font-bold uppercase px-5 rounded-xl" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">E-mail</label>
                                        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="EXEMPLO@EMAIL.COM" className="h-11 bg-slate-50 border-none text-[11px] font-bold uppercase px-5 rounded-xl" />
                                    </div>
                                </div>
                             </div>

                             <div className="space-y-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="h-4 w-1 bg-brand-rocha-primary rounded-full"></span>
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Localização & Entrega</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                    <div className="md:col-span-3 space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">CEP</label>
                                        <div className="relative">
                                            <Input required value={zipCode} onChange={e => setZipCode(applyCepMask(e.target.value))} onBlur={(e) => handleZipCodeLookup(e.target.value)} placeholder="00000-000" className={cn("h-11 bg-slate-50 border-none text-[11px] font-bold uppercase px-5 rounded-xl w-full", isCepLoading && "opacity-50")} />
                                            {isCepLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 group"><Loader2 className="w-3.5 h-3.5 text-brand-rocha-primary animate-spin" /></div>}
                                        </div>
                                    </div>
                                    <div className="md:col-span-6 space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Logradouro (Rua/Avenida)</label>
                                        <Input required value={street} onChange={e => setStreet(e.target.value)} placeholder="LOGRADOURO" className="h-11 bg-slate-50 border-none text-[11px] font-bold uppercase px-5 rounded-xl" />
                                    </div>
                                    <div className="md:col-span-3 space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Número</label>
                                        <Input value={number} onChange={e => setNumber(e.target.value)} placeholder="Nº" className="h-11 bg-slate-50 border-none text-[11px] font-bold uppercase px-5 rounded-xl" />
                                    </div>
                                    <div className="md:col-span-4 space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Complemento</label>
                                        <Input value={complement} onChange={e => setComplement(e.target.value)} placeholder="EX: AP 42" className="h-11 bg-slate-50 border-none text-[11px] font-bold uppercase px-5 rounded-xl" />
                                    </div>
                                    <div className="md:col-span-3 space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Bairro</label>
                                        <Input value={neighborhood} onChange={e => setNeighborhood(e.target.value)} placeholder="BAIRRO" className="h-11 bg-slate-50 border-none text-[11px] font-bold uppercase px-5 rounded-xl" />
                                        {cepWarning && <p className="text-[9px] text-amber-600 font-bold ml-1 mt-0.5">{cepWarning}</p>}
                                    </div>
                                    <div className="md:col-span-3 space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Cidade</label>
                                        <Input required value={city} onChange={e => setCity(e.target.value)} placeholder="CIDADE" className="h-11 bg-slate-50 border-none text-[11px] font-bold uppercase px-5 rounded-xl" />
                                    </div>
                                    <div className="md:col-span-2 space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Estado (UF)</label>
                                        <Input required value={cState} onChange={e => setCState(e.target.value)} placeholder="UF" className="h-11 bg-slate-50 border-none text-[11px] font-bold uppercase px-5 rounded-xl text-center" />
                                    </div>
                                    <div className="md:col-span-12 space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Condomínio (Opcional)</label>
                                        <Input value={condominium} onChange={e => setCondominium(e.target.value)} placeholder="NOME DO CONDOMÍNIO" className="h-11 bg-slate-50 border-none text-[11px] font-bold uppercase px-5 rounded-xl" />
                                    </div>
                                </div>
                             </div>

                             {/* Group 3: Origem */}
                             <div className="space-y-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="h-4 w-1 bg-brand-rocha-primary rounded-full"></span>
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Canal de Aquisição</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Qual a origem deste lead?</label>
                                        <select 
                                            required
                                            value={origin} 
                                            onChange={e => {
                                                const newOrigin = e.target.value;
                                                setOrigin(newOrigin);
                                                if (newOrigin !== 'Influencer') {
                                                    setInfluencerId(''); setInfluencerName('');
                                                }
                                            }} 
                                            className="h-11 w-full bg-slate-50 border-none text-[11px] font-bold uppercase px-5 rounded-xl outline-none focus:ring-2 focus:ring-brand-rocha-primary/10 transition-all appearance-none"
                                        >
                                            <option value="">SELECIONE O CANAL</option>
                                            {['Instagram', 'Indicação', 'Loja', 'Influencer', 'Outro'].map(opt => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase ml-1">Perfil do Cliente</label>
                                        <select 
                                            value={type} 
                                            onChange={e => setType(e.target.value)} 
                                            className="h-11 w-full bg-slate-50 border-none text-[11px] font-bold uppercase px-5 rounded-xl outline-none focus:ring-2 focus:ring-brand-rocha-primary/10 transition-all appearance-none"
                                        >
                                            <option value="Final">CONSUMIDOR FINAL</option>
                                            <option value="Arquiteto">ARQUITETO / DESIGNER</option>
                                            <option value="Construtora">CONSTRUTORA / ENGENHARIA</option>
                                        </select>
                                    </div>

                                    {origin === 'Influencer' && (
                                        <div className="md:col-span-2 p-6 bg-brand-rocha-primary/5 rounded-2xl border border-brand-rocha-primary/10 animate-in slide-in-from-top-2 duration-300">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="h-8 w-8 bg-brand-rocha-primary text-white rounded-lg flex items-center justify-center">
                                                    <Star className="h-4 w-4" />
                                                </div>
                                                <span className="text-[10px] font-black text-brand-rocha-primary uppercase tracking-widest">Vincular Parceiro Estratégico</span>
                                            </div>

                                            <select 
                                                required={origin === 'Influencer'}
                                                value={influencerId} 
                                                onChange={e => {
                                                    const inf = influencers.find(i => i.id === e.target.value);
                                                    setInfluencerId(e.target.value);
                                                    setInfluencerName(inf?.name || '');
                                                    setReferralCode(inf?.code || '');
                                                }}
                                                className="h-11 w-full bg-white border-none text-[11px] font-bold uppercase px-5 rounded-xl outline-none shadow-sm focus:ring-2 focus:ring-brand-rocha-primary/20 transition-all"
                                            >
                                                <option value="">BUSCAR INFLUENCER NA LISTA...</option>
                                                {safeArray(influencers).map(inf => (
                                                    <option key={inf.id} value={inf.id}>{inf.name} ({inf.code})</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                             </div>

                             <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 mt-4">
                                <Button type="button" variant="ghost" className="h-12 px-8 font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-slate-600" onClick={() => { setIsAddClientModalOpen(false); resetForm(); }}>Descartar</Button>
                                {isEditing && ['admin', 'company_admin', 'superadmin'].includes(profile?.role || '') && (
                                    <Button 
                                        type="button"
                                        variant="outline"
                                        className="h-12 px-8 font-black uppercase text-[10px] tracking-widest border-slate-200 text-slate-600 hover:bg-slate-50"
                                        onClick={async () => {
                                            if (window.confirm("Esta ação atualizará os dados cadastrais deste cliente em contratos ainda não assinados. Contratos assinados não serão alterados. Deseja continuar?")) {
                                                try {
                                                    const currentData = {
                                                        name, document, phone, email, origin, zipCode, street, number, complement, neighborhood, city, state: cState,
                                                        influencerId, influencerName, referralCode, referralStatus,
                                                        regionLabel: getClientRegionLabel({}, { city, state: cState, neighborhood })
                                                    };
                                                    const res = await syncClientDataToContracts(editingClientId!, currentData);
                                                    alert(`Sincronização concluída. ${res.updatedCount} contrato(s) atualizado(s).`);
                                                } catch (err) {
                                                    alert("Erro ao sincronizar contratos.");
                                                    console.error(err);
                                                }
                                            }
                                        }}
                                    >
                                        Sincronizar dados nos contratos
                                    </Button>
                                 )}
                                <Button type="submit" className="h-12 px-12 bg-slate-900 hover:bg-black text-white font-black rounded-xl shadow-xl hover:shadow-2xl transition-all uppercase text-[10px] tracking-[0.2em]">
                                    {isEditing ? 'Salvar Cliente' : 'Validar & Cadastrar'}
                                </Button>
                             </div>
                        </form>
                    </Card>
        </div>
            )}

            {isDeleteModalOpen && clientToDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isDeleting && setIsDeleteModalOpen(false)}></div>
                    <Card className="relative w-full max-w-md bg-white p-6 shadow-2xl rounded-2xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 text-rose-600 mb-4">
                            <div className="h-10 w-10 bg-rose-100 rounded-full flex items-center justify-center">
                                <Trash2 className="h-5 w-5" />
                            </div>
                            <div>
                                <h2 className="font-black tracking-tight text-lg text-slate-900">Excluir Cliente?</h2>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{clientToDelete.name}</p>
                            </div>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-100">
                            <p className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Resumo de Vínculos</p>
                            {relationshipSummary ? (
                                <ul className="space-y-1.5 text-xs font-bold text-slate-600">
                                    <li className="flex justify-between"><span>Orçamentos:</span> <span>{relationshipSummary.quotes}</span></li>
                                    <li className="flex justify-between"><span>Pedidos/Contratos:</span> <span>{relationshipSummary.orders}</span></li>
                                    <li className="flex justify-between"><span>Medições:</span> <span>{relationshipSummary.measurements}</span></li>
                                    <li className="flex justify-between"><span>Projetos Planejados:</span> <span>{relationshipSummary.plannedProjects}</span></li>
                                    <li className="flex justify-between text-slate-900 pt-1 border-t border-slate-200 mt-1"><span>Total:</span> <span>{relationshipSummary.total}</span></li>
                                </ul>
                            ) : (
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Carregando vínculos...
                                </div>
                            )}
                        </div>

                        <p className="text-xs text-slate-600 mb-4 font-medium leading-relaxed bg-amber-50 text-amber-800 p-3 rounded-lg">
                            O cliente será removido das listas operacionais. Orçamentos, contratos, medições, pedidos e históricos permanecerão preservados.
                        </p>

                        <div className="space-y-3 mb-6">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Motivo da Exclusão <span className="text-rose-500">*</span></label>
                            <select 
                                value={deleteReason} 
                                onChange={e => setDeleteReason(e.target.value)}
                                className="w-full h-11 bg-slate-50 rounded-xl px-4 text-xs font-bold outline-none border border-slate-200 focus:border-rose-300 transition-colors"
                            >
                                <option value="">SELECIONE UM MOTIVO</option>
                                <option value="Dados duplicados">Dados duplicados</option>
                                <option value="Cliente solicitou exclusão (LGPD)">Cliente solicitou exclusão (LGPD)</option>
                                <option value="Cadastro indevido / Teste">Cadastro indevido / Teste</option>
                                <option value="outro">Outro</option>
                            </select>

                            {deleteReason === 'outro' && (
                                <Input 
                                    placeholder="ESPECIFIQUE O MOTIVO" 
                                    value={deleteReasonText}
                                    onChange={e => setDeleteReasonText(e.target.value)}
                                    className="h-11 bg-slate-50 border-slate-200 text-xs font-bold uppercase"
                                />
                            )}
                        </div>

                        <div className="flex gap-3 justify-end">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                className="h-11 px-6 font-black uppercase text-[10px] tracking-widest text-slate-500 hover:bg-slate-100"
                                onClick={() => setIsDeleteModalOpen(false)}
                                disabled={isDeleting}
                            >
                                Cancelar
                            </Button>
                            <Button 
                                type="button" 
                                className="h-11 px-8 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-xl uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-rose-500/20"
                                onClick={handleConfirmDelete}
                                disabled={isDeleting || !deleteReason}
                            >
                                {isDeleting ? (
                                    <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> EXCLUINDO...</>
                                ) : (
                                    'CONFIRMAR EXCLUSÃO'
                                )}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};
