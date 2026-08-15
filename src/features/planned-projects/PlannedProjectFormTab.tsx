import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { 
    collection, 
    doc, 
    getDoc, 
    setDoc, 
    addDoc, 
    serverTimestamp,
    getDocs,
    query,
    where
} from 'firebase/firestore';
import { sanitizeForFirestore } from '../../utils/firestoreSanitizer';
import { useAuth } from '../../context/AuthContext';
import { useClients } from '../../hooks/useClients';
import { useStaffCatalog } from '../../hooks/useStaffCatalog';
import { usePlannedSettings } from '../../hooks/usePlannedSettings';

import { getClientDisplayInfo } from '../../lib/clientUtils';
import { getNextPlannedProjectProtocolNumber } from '../../lib/protocolGenerator';
import { PlannedSignatureCard } from './components/PlannedSignatureCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { 
    Plus, Trash2, Save, Printer, Loader2, ArrowLeft, PlusCircle, Check, Info, FileText
} from 'lucide-react';
import type { PlannedProject, PlannedEnvironment, PlannedModuleItem, PlannedCatalogItem, Client } from '../../types';

interface PlannedProjectFormTabProps {
    projectId: string | null;
    onBack: () => void;
    onSaveSuccess: () => void;
}

const AMBIENTES_SUGERIDOS = [
    'Cozinha',
    'Dormitório',
    'Closet',
    'Banheiro',
    'Área Gourmet',
    'Lavanderia',
    'Sala',
    'Home Office',
    'Outro'
];

const calculateEnvironmentsTotalSum = (envs: PlannedEnvironment[]): number => {
    let sum = 0;
    envs.forEach(env => {
        if (typeof env.environmentTotal === 'number') {
            sum += env.environmentTotal;
        } else {
            let envSum = 0;
            (env.modules || []).forEach(mod => {
                const unit = mod.unitCost || (mod as any).cost || 0;
                const qty = mod.quantity || 1;
                envSum += unit * qty;
            });
            sum += envSum;
        }
    });
    return sum;
};

export const PlannedProjectFormTab: React.FC<PlannedProjectFormTabProps> = ({ 
    projectId, 
    onBack, 
    onSaveSuccess 
}) => {
    const { user, profile } = useAuth();
    const { clients, addClient } = useClients();
    const { staff } = useStaffCatalog();
    const { settings: defaultSettings } = usePlannedSettings();

    // Catalog composition items for auto-completion
    const [catalogItems, setCatalogItems] = useState<PlannedCatalogItem[]>([]);
    const [loadingProject, setLoadingProject] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Form fields
    const [protocolNumber, setProtocolNumber] = useState('');
    const [selectedClientId, setSelectedClientId] = useState('');
    const [clientName, setClientName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [clientEmail, setClientEmail] = useState('');
    const [clientAddress, setClientAddress] = useState('');
    const [projectName, setProjectName] = useState('');
    const [sellerId, setSellerId] = useState('');
    const [status, setStatus] = useState<'rascunho' | 'enviado' | 'aprovado' | 'em_producao' | 'instalado' | 'cancelado'>('rascunho');
    const [notes, setNotes] = useState('');

    // Environments list
    const [environments, setEnvironments] = useState<PlannedEnvironment[]>([]);

    // Commercial values
    const [saleValueStr, setSaleValueStr] = useState('0,00');
    const [autoCalculateMaterialCost, setAutoCalculateMaterialCost] = useState(true);
    const [manualMaterialCostStr, setManualMaterialCostStr] = useState('0,00');
    const [freightPercentStr, setFreightPercentStr] = useState('16');
    const [assemblyPercentStr, setAssemblyPercentStr] = useState('10');
    const [cardFeePercentStr, setCardFeePercentStr] = useState('0');

    // Payment Fields
    const [paymentMethod, setPaymentMethod] = useState('');
    const [paymentCondition, setPaymentCondition] = useState('');
    const [paymentNotes, setPaymentNotes] = useState('');
    const [installments, setInstallments] = useState('');
    const [downPaymentStr, setDownPaymentStr] = useState('0,00');
    const [remainingBalanceStr, setRemainingBalanceStr] = useState('0,00');
    const [autoCalculateBalance, setAutoCalculateBalance] = useState(true);

    // Quick client modal
    const [isQuickClientOpen, setIsQuickClientOpen] = useState(false);
    const [quickName, setQuickName] = useState('');
    const [quickPhone, setQuickPhone] = useState('');
    const [quickEmail, setQuickEmail] = useState('');
    const [quickAddress, setQuickAddress] = useState('');
    const [isSavingClient, setIsSavingClient] = useState(false);

    // Load composition catalog items
    useEffect(() => {
        if (!profile?.companyId) return;
        
        const fetchCatalog = async () => {
            try {
                const q = query(
                    collection(db, 'planned_catalog_items'),
                    where('companyId', '==', profile.companyId),
                    where('active', '==', true)
                );
                const snap = await getDocs(q);
                const list: PlannedCatalogItem[] = [];
                snap.forEach(docSnap => {
                    const item = docSnap.data() as PlannedCatalogItem;
                    if (!(item as any).deleted && !(item as any).isDeleted) {
                        list.push({ id: docSnap.id, ...item });
                    }
                });
                setCatalogItems(list);
            } catch (err) {
                console.error("Error loading composition catalog:", err);
            }
        };

        fetchCatalog();
    }, [profile?.companyId]);

    // Group items for datalists
    const colorsList = useMemo(() => catalogItems.filter(i => i.type === 'color_mdf'), [catalogItems]);
    const handlesList = useMemo(() => catalogItems.filter(i => i.type === 'handle'), [catalogItems]);
    const finishesList = useMemo(() => catalogItems.filter(i => i.type === 'finish'), [catalogItems]);
    const thicknessList = useMemo(() => catalogItems.filter(i => i.type === 'mdf_thickness'), [catalogItems]);

    // Load defaults when creating
    useEffect(() => {
        if (!projectId && defaultSettings) {
            setFreightPercentStr(String(defaultSettings.freightPercentOnMaterialCost ?? 16));
            setAssemblyPercentStr(String(defaultSettings.assemblyPercentOnSale ?? 10));
            setCardFeePercentStr(String(defaultSettings.cardMachineFeePercent ?? 0));
        }
    }, [projectId, defaultSettings]);

    // Set current user as seller if not editing
    useEffect(() => {
        if (!projectId && profile) {
            setSellerId(user?.uid || '');
        }
    }, [projectId, profile, user]);

    // Load project data for editing
    useEffect(() => {
        if (!projectId) return;

        const loadProject = async () => {
            setLoadingProject(true);
            try {
                const snap = await getDoc(doc(db, 'planned_projects', projectId));
                if (snap.exists()) {
                    const data = snap.data() as PlannedProject;
                    setProtocolNumber(data.protocolNumber || '');
                    setSelectedClientId(data.clientId || '');
                    setClientName(data.clientName || '');
                    setClientPhone(data.clientPhone || '');
                    setClientEmail(data.clientEmail || '');
                    setClientAddress(data.clientAddress || '');
                    setProjectName(data.projectName || '');
                    setSellerId(data.sellerId || '');
                    setStatus(data.status || 'rascunho');
                    setNotes(data.notes || '');
                    setEnvironments(data.environments || []);

                    // Payment
                    setPaymentMethod(data.paymentMethod || '');
                    setPaymentCondition(data.paymentCondition || '');
                    setPaymentNotes(data.paymentNotes || '');
                    setInstallments(data.installments ? String(data.installments) : '');
                    setDownPaymentStr(formatCentsToBRL(data.downPayment || 0));
                    setRemainingBalanceStr(formatCentsToBRL(data.remainingBalance || 0));
                    if (data.remainingBalance !== undefined && data.saleValue && data.downPayment !== undefined) {
                        setAutoCalculateBalance(data.remainingBalance === (data.saleValue - data.downPayment));
                    }

                    // Financials
                    setSaleValueStr(formatCentsToBRL(data.saleValue));
                    setFreightPercentStr(String(data.freightPercent));
                    setAssemblyPercentStr(String(data.assemblyPercent));
                    setCardFeePercentStr(String(data.machineFeePercent));

                    // Decouple material cost calculation check
                    const loadedEnvs = (data.environments || []).map((env: any) => {
                        const total = typeof env.environmentTotal === 'number'
                            ? env.environmentTotal
                            : (env.modules || []).reduce((acc: number, mod: any) => {
                                const unit = mod.unitCost || mod.cost || 0;
                                const qty = mod.quantity || 1;
                                return acc + (unit * qty);
                              }, 0);
                        return {
                            ...env,
                            environmentTotal: total
                        };
                    });
                    setEnvironments(loadedEnvs);

                    const calculatedMatCost = calculateEnvironmentsTotalSum(loadedEnvs);
                    if (calculatedMatCost === data.materialCost) {
                        setAutoCalculateMaterialCost(true);
                        setManualMaterialCostStr(formatCentsToBRL(data.materialCost));
                    } else {
                        setAutoCalculateMaterialCost(false);
                        setManualMaterialCostStr(formatCentsToBRL(data.materialCost));
                    }
                } else {
                    alert('Projeto não encontrado.');
                    onBack();
                }
            } catch (err) {
                console.error("Error loading project:", err);
                alert("Erro ao carregar projeto.");
            } finally {
                setLoadingProject(false);
            }
        };

        loadProject();
    }, [projectId]);

    // Autofill client info when selection changes
    useEffect(() => {
        if (!selectedClientId || selectedClientId === 'custom') return;
        const selected = clients.find(c => c.id === selectedClientId);
        if (selected) {
            setClientName(selected.name);
            setClientPhone(selected.phone || '');
            setClientEmail(selected.email || '');
            setClientAddress(selected.address || selected.street || '');
        }
    }, [selectedClientId, clients]);

    // Formats & Parsers
    const formatCentsToBRL = (cents: number): string => {
        return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const parseCurrencyToCents = (val: string): number => {
        let cleaned = val.replace(/[^\d]/g, '');
        return parseInt(cleaned, 10) || 0;
    };

    const handleMoneyInputChange = (setter: (val: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const digits = e.target.value.replace(/\D/g, '');
        if (!digits) {
            setter('0,00');
            return;
        }
        const numberVal = parseFloat(digits) / 100;
        setter(numberVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    };

    const environmentsTotalSum = useMemo(() => {
        return calculateEnvironmentsTotalSum(environments);
    }, [environments]);

    // Final Commercial Summary Calculations
    const materialCost = useMemo(() => {
        if (autoCalculateMaterialCost) {
            return calculateEnvironmentsTotalSum(environments);
        }
        return parseCurrencyToCents(manualMaterialCostStr);
    }, [autoCalculateMaterialCost, manualMaterialCostStr, environments]);

    const saleValue = parseCurrencyToCents(saleValueStr);

    // Auto-calculate balance
    useEffect(() => {
        if (autoCalculateBalance) {
            const down = parseCurrencyToCents(downPaymentStr);
            const balance = saleValue - down;
            setRemainingBalanceStr(formatCentsToBRL(balance > 0 ? balance : 0));
        }
    }, [autoCalculateBalance, saleValue, downPaymentStr]);

    const freightCost = useMemo(() => {
        const percent = parseFloat(freightPercentStr.replace(',', '.')) || 0;
        return Math.round(materialCost * percent / 100);
    }, [materialCost, freightPercentStr]);

    const assemblyCost = useMemo(() => {
        const percent = parseFloat(assemblyPercentStr.replace(',', '.')) || 0;
        return Math.round(saleValue * percent / 100);
    }, [saleValue, assemblyPercentStr]);

    const machineFeeAmount = useMemo(() => {
        const percent = parseFloat(cardFeePercentStr.replace(',', '.')) || 0;
        return Math.round(saleValue * percent / 100);
    }, [saleValue, cardFeePercentStr]);

    const totalOperationalCost = useMemo(() => {
        return freightCost + assemblyCost + machineFeeAmount;
    }, [freightCost, assemblyCost, machineFeeAmount]);

    const netResult = useMemo(() => {
        return saleValue - materialCost - freightCost - assemblyCost - machineFeeAmount;
    }, [saleValue, materialCost, freightCost, assemblyCost, machineFeeAmount]);

    const profitMargin = useMemo(() => {
        if (saleValue <= 0) return 0;
        return (netResult / saleValue) * 100;
    }, [netResult, saleValue]);

    // Environment Handlers
    const handleAddEnvironment = () => {
        const newEnv: PlannedEnvironment = {
            id: crypto.randomUUID(),
            name: 'Cozinha',
            modules: [],
            notes: '',
            environmentTotal: 0
        };
        setEnvironments([...environments, newEnv]);
    };

    const handleRemoveEnvironment = (envId: string) => {
        if (!window.confirm("Tem certeza que deseja remover este ambiente? Todos os seus módulos serão perdidos.")) return;
        setEnvironments(environments.filter(env => env.id !== envId));
    };

    const handleEnvironmentFieldChange = (envId: string, field: keyof PlannedEnvironment, value: any) => {
        setEnvironments(environments.map(env => {
            if (env.id === envId) {
                return { ...env, [field]: value };
            }
            return env;
        }));
    };

    // Module Handlers
    const handleAddModule = (envId: string) => {
        const newMod: PlannedModuleItem = {
            id: crypto.randomUUID(),
            productName: '',
            moduleType: 'manual',
            quantity: 1,
            width: 0,
            height: 0,
            depth: 0,
            color: '',
            handle: '',
            finish: '',
            mdfThickness: '',
            unitCost: 0,
            totalCost: 0,
            notes: ''
        };

        setEnvironments(environments.map(env => {
            if (env.id === envId) {
                return { ...env, modules: [...(env.modules || []), newMod] };
            }
            return env;
        }));
    };

    const handleRemoveModule = (envId: string, moduleId: string) => {
        setEnvironments(environments.map(env => {
            if (env.id === envId) {
                return { ...env, modules: env.modules.filter(m => m.id !== moduleId) };
            }
            return env;
        }));
    };

    const handleModuleFieldChange = (envId: string, moduleId: string, field: keyof PlannedModuleItem, value: any) => {
        setEnvironments(environments.map(env => {
            if (env.id === envId) {
                const updatedModules = env.modules.map(mod => {
                    if (mod.id === moduleId) {
                        const updated = { ...mod, [field]: value };
                        
                        // Recalculate total cost if quantity or unitCost changes
                        if (field === 'quantity' || field === 'unitCost') {
                            const qty = field === 'quantity' ? Number(value) : mod.quantity;
                            const cost = field === 'unitCost' ? Number(value) : mod.unitCost;
                            updated.totalCost = qty * cost;
                        }
                        
                        return updated;
                    }
                    return mod;
                });
                return { ...env, modules: updatedModules };
            }
            return env;
        }));
    };



    // Quick Client Form submit
    const handleQuickClientSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!quickName.trim() || !quickPhone.trim()) {
            alert("Nome e telefone são obrigatórios.");
            return;
        }

        setIsSavingClient(true);
        try {
            // Check if phone already exists
            const cleanPhone = quickPhone.replace(/\D/g, '');
            const existingClient = clients.find(c => (c.phone || '').replace(/\D/g, '') === cleanPhone);

            if (existingClient) {
                alert(`Um cliente cadastrado com o telefone ${quickPhone} já existe: "${existingClient.name}". O cliente existente foi selecionado automaticamente.`);
                setSelectedClientId(existingClient.id);
                setClientName(existingClient.name);
                setClientPhone(existingClient.phone || '');
                setClientEmail(existingClient.email || '');
                setClientAddress(existingClient.address || existingClient.street || '');
                setIsQuickClientOpen(false);
                return;
            }

            // Create new client
            const clientPayload = sanitizeForFirestore({
                name: quickName.trim(),
                phone: quickPhone.trim(),
                email: quickEmail.trim() || "",
                address: quickAddress.trim() || "",
                street: quickAddress.trim() || "",
                origin: 'Planejados',
                type: 'Final',
                condominium: '',
                observations: 'Cadastrado rapidamente pelo módulo de Planejados.',
                status: 'active'
            });

            const newClientId = await addClient(clientPayload);

            // Set selected client
            setSelectedClientId(newClientId);
            setClientName(quickName.trim());
            setClientPhone(quickPhone.trim());
            setClientEmail(quickEmail.trim());
            setClientAddress(quickAddress.trim());
            
            // Clean modal inputs
            setQuickName('');
            setQuickPhone('');
            setQuickEmail('');
            setQuickAddress('');
            setIsQuickClientOpen(false);
            
            alert('Cliente cadastrado com sucesso!');
        } catch (err) {
            console.error("Error creating quick client:", err);
            alert("Erro ao cadastrar o cliente rápido.");
        } finally {
            setIsSavingClient(false);
        }
    };

    // Save project main logic
    const handleSaveProject = async (isDraftMode: boolean) => {
        if (!clientName.trim()) {
            alert('Por favor, selecione ou cadastre um cliente.');
            return;
        }
        if (!projectName.trim()) {
            alert('Por favor, informe o nome do projeto.');
            return;
        }

        setIsSaving(true);
        try {
            const selectedClient = clients.find(c => c.id === selectedClientId);
            
            const finalClientId = selectedClient?.id || selectedClientId || "";
            const finalClientName = selectedClient?.name || clientName || "";
            const finalClientPhone = selectedClient?.phone || clientPhone || "";
            const finalClientEmail = selectedClient?.email || clientEmail || "";
            const finalClientAddress = selectedClient?.address || clientAddress || "";

            const finalSellerId = user?.uid || '';
            const finalSellerName = profile?.name || user?.displayName || user?.email || 'Vendedor';

            let finalProtocol = protocolNumber;
            if (!projectId) {
                if (!profile?.companyId) throw new Error('Company ID not found.');
                finalProtocol = await getNextPlannedProjectProtocolNumber(profile.companyId);
            }

            const rawPayload: any = {
                companyId: profile?.companyId || '',
                protocolNumber: finalProtocol,
                clientId: finalClientId,
                clientName: finalClientName.trim(),
                clientPhone: finalClientPhone.trim(),
                clientEmail: finalClientEmail.trim(),
                clientAddress: finalClientAddress.trim(),
                sellerId: finalSellerId,
                sellerName: finalSellerName,
                projectName: projectName.trim(),
                status: isDraftMode ? 'rascunho' : (status === 'rascunho' ? 'enviado' : status),
                environments: (environments || []).map(env => ({
                    id: env.id || '',
                    name: env.name || '',
                    notes: env.notes || '',
                    environmentTotal: Number(env.environmentTotal) || 0,
                    modules: (env.modules || []).map(mod => ({
                        id: mod.id || '',
                        productId: mod.productId || '',
                        productName: mod.productName || '',
                        moduleType: mod.moduleType || 'standard',
                        quantity: Number(mod.quantity) || 1,
                        width: Number(mod.width) || 0,
                        height: Number(mod.height) || 0,
                        depth: Number(mod.depth) || 0,
                        color: mod.color || '',
                        handle: mod.handle || '',
                        finish: mod.finish || '',
                        mdfThickness: mod.mdfThickness || '',
                        unitCost: 0,
                        totalCost: 0,
                        notes: mod.notes || ''
                    }))
                })),
                saleValue,
                materialCost,
                freightPercent: parseFloat(freightPercentStr.replace(',', '.')) || 0,
                freightCost,
                assemblyPercent: parseFloat(assemblyPercentStr.replace(',', '.')) || 0,
                assemblyCost,
                machineFeePercent: parseFloat(cardFeePercentStr.replace(',', '.')) || 0,
                machineFeeAmount,
                totalOperationalCost,
                netResult,
                notes: notes.trim(),
                paymentMethod,
                paymentCondition,
                paymentNotes,
                installments: parseInt(installments, 10) || 0,
                downPayment: parseCurrencyToCents(downPaymentStr),
                remainingBalance: parseCurrencyToCents(remainingBalanceStr),
                updatedAt: serverTimestamp(),
                updatedBy: user?.uid || ''
            };

            if (!projectId) {
                rawPayload.createdBy = user?.uid || '';
                rawPayload.createdAt = serverTimestamp();
            }

            const projectPayload = sanitizeForFirestore(rawPayload);

            const docRef = projectId 
                ? doc(db, 'planned_projects', projectId)
                : doc(collection(db, 'planned_projects'));

            if (projectId) {
                await setDoc(docRef, projectPayload, { merge: true });
            } else {
                await setDoc(docRef, projectPayload);
            }

            alert(`Projeto ${projectId ? 'atualizado' : 'cadastrado'} com sucesso!`);
            onSaveSuccess();
        } catch (err) {
            console.error("Error saving planned project:", err);
            alert("Erro ao salvar o projeto planejado.");
        } finally {
            setIsSaving(false);
        }
    };

    const searchableClients = useMemo(() => {
        return clients.map(c => {
            const displayInfo = getClientDisplayInfo(c);
            return {
                value: c.id,
                label: displayInfo.name,
                description: displayInfo.formattedPhone,
                subDescription: displayInfo.addressLabel,
                searchValue: displayInfo.searchText
            };
        });
    }, [clients]);

    if (loadingProject) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-brand-rocha-primary" />
                <span className="text-sm font-bold text-slate-400">Carregando dados do projeto...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto py-2">
            {/* Header Action Bar */}
            <div className="flex items-center justify-between pb-4 border-b border-brand-rocha-border">
                <div className="flex items-center gap-3">
                    <Button variant="outline" size="icon" onClick={onBack} className="rounded-xl h-10 w-10">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                            {projectId ? `Editar Projeto #${protocolNumber}` : 'Criar Novo Projeto Planejado'}
                        </h2>
                        <p className="text-sm text-slate-400">Insira as medidas, ambientes, módulos e configure o resumo comercial.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {projectId && (
                        <div className="flex gap-1.5">
                            <Button
                                variant="outline"
                                onClick={() => window.open(`/planejados/${projectId}/imprimir?mode=client`, '_blank')}
                                className="h-10 rounded-xl font-bold border-slate-200 text-slate-700 flex items-center gap-1.5"
                            >
                                <Printer className="h-4.5 w-4.5 text-slate-400" />
                                PDF Cliente
                            </Button>
                            {['superadmin', 'company_admin', 'admin'].includes(profile?.role || '') && (
                                <Button
                                    variant="outline"
                                    onClick={() => window.open(`/planejados/${projectId}/imprimir?mode=internal`, '_blank')}
                                    className="h-10 rounded-xl font-bold border-slate-200 text-slate-700 flex items-center gap-1.5"
                                >
                                    <Printer className="h-4.5 w-4.5 text-brand-rocha-primary" />
                                    PDF Interno
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {/* Bloco 1: Cliente */}
                    <Card className="border-brand-rocha-border">
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-base font-bold text-slate-900 dark:text-white">Bloco 1: Cliente do Projeto</CardTitle>
                                <CardDescription>Selecione um cliente cadastrado ou faça a criação rápida.</CardDescription>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsQuickClientOpen(true)}
                                className="h-9 px-3 rounded-lg font-bold border-brand-rocha-primary text-brand-rocha-primary hover:bg-brand-rocha-primary/5 text-xs flex items-center gap-1"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Cliente Rápido
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Pesquisar Cliente</label>
                                <SearchableSelect
                                    options={searchableClients}
                                    value={selectedClientId}
                                    onChange={(val) => {
                                        setSelectedClientId(val);
                                    }}
                                    placeholder="Comece a digitar o nome do cliente..."
                                />
                            </div>

                            {clientName && (
                                <div className="mt-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200/50 dark:border-slate-800 text-sm space-y-2">
                                    <div className="flex items-center justify-between border-b border-slate-200/30 dark:border-slate-800/30 pb-2">
                                        <span className="font-bold text-slate-800 dark:text-slate-200 text-sm uppercase tracking-wider">Dados Selecionados</span>
                                        <span className="text-[10px] bg-brand-rocha-primary/10 text-brand-rocha-primary px-2 py-0.5 rounded-full font-black uppercase">Cliente Vinculado</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                                        <div>
                                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nome</span>
                                            <span className="font-semibold text-slate-700 dark:text-slate-300">{clientName}</span>
                                        </div>
                                        <div>
                                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Telefone</span>
                                            <span className="font-semibold text-slate-700 dark:text-slate-300">{clientPhone || 'Não informado'}</span>
                                        </div>
                                        {clientAddress && (
                                            <div className="md:col-span-2">
                                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Endereço</span>
                                                <span className="font-semibold text-slate-700 dark:text-slate-300">{clientAddress}</span>
                                            </div>
                                        )}
                                        {clientEmail && (
                                            <div className="md:col-span-2">
                                                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">E-mail</span>
                                                <span className="font-semibold text-slate-700 dark:text-slate-300">{clientEmail}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Bloco 2: Dados do Projeto */}
                    <Card className="border-brand-rocha-border">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base font-bold text-slate-900 dark:text-white">Bloco 2: Dados do Projeto</CardTitle>
                            <CardDescription>Nome do projeto, vendedor responsável e anotações.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nome do Projeto</label>
                                    <Input
                                        type="text"
                                        value={projectName}
                                        onChange={(e) => setProjectName(e.target.value)}
                                        placeholder="Ex: Cozinha Integrada e Closet da Suíte"
                                        required
                                        className="rounded-xl"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Vendedor / Responsável</label>
                                    <div className="h-10 flex items-center px-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 text-sm font-semibold">
                                        {profile?.name || user?.displayName || user?.email || 'Vendedor'}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Observações Gerais / Internas</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Informações adicionais do projeto, condições específicas, prazos combinados..."
                                    rows={3}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-rocha-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Bloco 3: Ambientes */}
                    <Card className="border-brand-rocha-border">
                        <CardHeader className="pb-3 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-base font-bold text-slate-900 dark:text-white">Bloco 3: Ambientes & Módulos</CardTitle>
                                <CardDescription>Adicione ambientes e preencha os móveis planejados de cada um.</CardDescription>
                            </div>
                            <Button
                                type="button"
                                onClick={handleAddEnvironment}
                                className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-10 px-4 font-bold flex items-center gap-1.5"
                            >
                                <PlusCircle className="h-4.5 w-4.5" />
                                Adicionar Ambiente
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {environments.length > 0 ? (
                                environments.map((env, envIndex) => (
                                    <div 
                                        key={env.id} 
                                        className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4 bg-slate-50/30 dark:bg-slate-800/10 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300"
                                    >
                                        {/* Environment Header */}
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-200/60 dark:border-slate-800">
                                            <div className="flex items-center gap-3 w-full sm:w-auto">
                                                <span className="text-xs font-black text-white bg-slate-900 dark:bg-slate-700 rounded-lg px-2.5 py-1 tabular-nums shrink-0">
                                                    #{envIndex + 1}
                                                </span>
                                                <select
                                                    value={AMBIENTES_SUGERIDOS.includes(env.name) ? env.name : 'Outro'}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val !== 'Outro') {
                                                            handleEnvironmentFieldChange(env.id, 'name', val);
                                                        } else {
                                                            handleEnvironmentFieldChange(env.id, 'name', 'Novo Ambiente');
                                                        }
                                                    }}
                                                    className="flex h-9 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-bold text-slate-800 dark:text-white shrink-0"
                                                >
                                                    {AMBIENTES_SUGERIDOS.map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                                {!AMBIENTES_SUGERIDOS.includes(env.name) && (
                                                    <Input
                                                        type="text"
                                                        value={env.name}
                                                        onChange={(e) => handleEnvironmentFieldChange(env.id, 'name', e.target.value)}
                                                        className="h-9 py-1 px-2 rounded-lg font-bold w-40 text-slate-800 dark:text-white"
                                                        placeholder="Nome do ambiente..."
                                                    />
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleAddModule(env.id)}
                                                    className="h-9 px-3 rounded-lg font-bold border-brand-rocha-primary text-brand-rocha-primary hover:bg-brand-rocha-primary/5 text-xs flex items-center gap-1.5"
                                                >
                                                    <Plus className="h-4 w-4" />
                                                    Adicionar Módulo
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleRemoveEnvironment(env.id)}
                                                    className="h-9 w-9 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100"
                                                    title="Excluir Ambiente"
                                                >
                                                    <Trash2 className="h-4.5 w-4.5" />
                                                </Button>
                                            </div>
                                        </div>
                                                      {/* Modules List inside this environment */}
                                        <div className="space-y-3">
                                            {(env.modules || []).map((mod, modIndex) => (
                                                <div 
                                                    key={mod.id} 
                                                    className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:shadow-md transition-all duration-300 space-y-3 relative group/row animate-fadeIn"
                                                >
                                                    {/* ROW 1: Physical Specification */}
                                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                                                        {/* Module name */}
                                                        <div className="md:col-span-6">
                                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Descrição / Nome do Módulo</label>
                                                            <Input
                                                                type="text"
                                                                value={mod.productName}
                                                                onChange={(e) => handleModuleFieldChange(env.id, mod.id, 'productName', e.target.value)}
                                                                placeholder="Ex: Armário Aéreo 2 Portas, Gaveteiro"
                                                                className="h-9 py-1 px-2.5 rounded-lg text-xs font-bold"
                                                                required
                                                            />
                                                        </div>

                                                        {/* Dimensions */}
                                                        <div className="md:col-span-4 grid grid-cols-3 gap-1">
                                                            <div>
                                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 text-center">Larg (cm)</label>
                                                                <Input
                                                                    type="number"
                                                                    value={mod.width || ''}
                                                                    onChange={(e) => handleModuleFieldChange(env.id, mod.id, 'width', parseFloat(e.target.value) || 0)}
                                                                    className="h-9 py-1 px-1 rounded-lg text-xs text-center font-semibold text-slate-800"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 text-center">Alt (cm)</label>
                                                                <Input
                                                                    type="number"
                                                                    value={mod.height || ''}
                                                                    onChange={(e) => handleModuleFieldChange(env.id, mod.id, 'height', parseFloat(e.target.value) || 0)}
                                                                    className="h-9 py-1 px-1 rounded-lg text-xs text-center font-semibold text-slate-800"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 text-center">Prof (cm)</label>
                                                                <Input
                                                                    type="number"
                                                                    value={mod.depth || ''}
                                                                    onChange={(e) => handleModuleFieldChange(env.id, mod.id, 'depth', parseFloat(e.target.value) || 0)}
                                                                    className="h-9 py-1 px-1 rounded-lg text-xs text-center font-semibold text-slate-800"
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Quantity */}
                                                        <div className="md:col-span-1">
                                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 text-center">Qtd</label>
                                                            <Input
                                                                type="number"
                                                                value={mod.quantity}
                                                                onChange={(e) => handleModuleFieldChange(env.id, mod.id, 'quantity', parseInt(e.target.value, 10) || 1)}
                                                                className="h-9 py-1 px-1 rounded-lg text-xs text-center font-bold"
                                                                required
                                                            />
                                                        </div>

                                                        {/* Delete module */}
                                                        <div className="md:col-span-1 flex justify-end">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleRemoveModule(env.id, mod.id)}
                                                                className="h-9 w-9 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-lg"
                                                                title="Remover Módulo"
                                                            >
                                                                <Trash2 className="h-4.5 w-4.5" />
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {/* ROW 2: Custom technical specifications */}
                                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                                        {/* MDF Color */}
                                                        <div className="md:col-span-3">
                                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cor / MDF</label>
                                                            <Input
                                                                type="text"
                                                                list="color-options"
                                                                value={mod.color}
                                                                onChange={(e) => handleModuleFieldChange(env.id, mod.id, 'color', e.target.value)}
                                                                placeholder="Ex: Louro Freijó, Nogueira"
                                                                className="h-9 py-1 px-2.5 rounded-lg text-xs"
                                                            />
                                                        </div>

                                                        {/* Handle */}
                                                        <div className="md:col-span-3">
                                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Puxador</label>
                                                            <Input
                                                                type="text"
                                                                list="handle-options"
                                                                value={mod.handle || ''}
                                                                onChange={(e) => handleModuleFieldChange(env.id, mod.id, 'handle', e.target.value)}
                                                                placeholder="Ex: Perfil cava preto, Sem puxador"
                                                                className="h-9 py-1 px-2.5 rounded-lg text-xs"
                                                            />
                                                        </div>

                                                        {/* Finish */}
                                                        <div className="md:col-span-3">
                                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Acabamento</label>
                                                            <Input
                                                                type="text"
                                                                list="finish-options"
                                                                value={mod.finish || ''}
                                                                onChange={(e) => handleModuleFieldChange(env.id, mod.id, 'finish', e.target.value)}
                                                                placeholder="Ex: Fosco, Brilho, BP, Ripado"
                                                                className="h-9 py-1 px-2.5 rounded-lg text-xs"
                                                            />
                                                        </div>

                                                        {/* MDF Thickness */}
                                                        <div className="md:col-span-3">
                                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Espessura MDF</label>
                                                            <Input
                                                                type="text"
                                                                list="thickness-options"
                                                                value={mod.mdfThickness || ''}
                                                                onChange={(e) => handleModuleFieldChange(env.id, mod.id, 'mdfThickness', e.target.value)}
                                                                placeholder="Ex: 18 mm, 15 mm"
                                                                className="h-9 py-1 px-2.5 rounded-lg text-xs"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* ROW 3: Observations */}
                                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                                                        {/* Notes */}
                                                        <div className="md:col-span-12">
                                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Observações do Módulo</label>
                                                            <Input
                                                                type="text"
                                                                value={mod.notes || ''}
                                                                onChange={(e) => handleModuleFieldChange(env.id, mod.id, 'notes', e.target.value)}
                                                                placeholder="Especificações internas do módulo..."
                                                                className="h-9 py-1 px-2.5 rounded-lg text-xs"
                                                            />
                                                        </div>
                                                    </div>

                                                </div>
                                            ))}
                                            {(env.modules || []).length === 0 && (
                                                <div className="text-center py-6 text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                                                    Nenhum módulo adicionado neste ambiente. Clique em "Adicionar Módulo" acima.
                                                </div>
                                            )}
                                        </div>

                                        {/* Environment Notes & Total */}
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-3 border-t border-slate-200/60 dark:border-slate-800">
                                            <div className="md:col-span-4">
                                                <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                                                    VALOR TOTAL DO AMBIENTE
                                                </label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                                                    <Input
                                                        type="text"
                                                        value={formatCentsToBRL(env.environmentTotal ?? 0)}
                                                        onChange={(e) => {
                                                            const cents = parseCurrencyToCents(e.target.value);
                                                            handleEnvironmentFieldChange(env.id, 'environmentTotal', cents);
                                                        }}
                                                        className="h-9 pl-8 rounded-lg text-xs font-black text-slate-800 dark:text-white"
                                                        placeholder="0,00"
                                                    />
                                                </div>
                                            </div>
                                            <div className="md:col-span-8">
                                                <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                                                    Observações do Ambiente
                                                </label>
                                                <Input
                                                    type="text"
                                                    value={env.notes || ''}
                                                    onChange={(e) => handleEnvironmentFieldChange(env.id, 'notes', e.target.value)}
                                                    placeholder="Anotações para este ambiente (Ex: Módulos aéreos com amortecedores, fita de LED...)"
                                                    className="h-9 py-1 px-3 rounded-lg text-xs"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                                    <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
                                    Nenhum ambiente cadastrado para este projeto.
                                    <div className="mt-4">
                                        <Button
                                            type="button"
                                            onClick={handleAddEnvironment}
                                            className="bg-brand-rocha-primary text-white hover:bg-brand-rocha-primary/95 font-bold rounded-xl px-5 h-10 text-xs inline-flex items-center gap-1.5"
                                        >
                                            <PlusCircle className="h-4 w-4" />
                                            Criar Primeiro Ambiente
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Bloco 5: Forma de Pagamento */}
                    <Card className="border-brand-rocha-border">
                        <CardHeader className="pb-3 border-b border-brand-rocha-border bg-slate-50/50 dark:bg-slate-900/50 rounded-t-lg">
                            <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="bg-brand-rocha-primary/10 text-brand-rocha-primary w-6 h-6 rounded-md flex items-center justify-center text-xs">5</span>
                                Forma de Pagamento
                            </CardTitle>
                            <CardDescription>Informe as condições comerciais para exibição no contrato do cliente.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-slate-600">Método Principal</label>
                                    <select
                                        value={paymentMethod}
                                        onChange={e => setPaymentMethod(e.target.value)}
                                        className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-rocha-primary"
                                    >
                                        <option value="">A definir</option>
                                        <option value="pix">PIX</option>
                                        <option value="boleto">Boleto</option>
                                        <option value="cartao_credito">Cartão de Crédito</option>
                                        <option value="transferencia">Transferência</option>
                                        <option value="dinheiro">Dinheiro</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-slate-600">Nº de Parcelas</label>
                                    <Input
                                        type="number"
                                        value={installments}
                                        onChange={e => setInstallments(e.target.value)}
                                        placeholder="Ex: 3"
                                        className="h-11 rounded-xl"
                                        min="1"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-bold text-slate-600">Valor de Entrada (Sinal)</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                                        <Input
                                            type="text"
                                            value={downPaymentStr}
                                            onChange={handleMoneyInputChange(setDownPaymentStr)}
                                            className="h-11 pl-8 rounded-xl font-bold"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-xs font-bold text-slate-600">Saldo Restante</label>
                                        <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={autoCalculateBalance} 
                                                onChange={e => setAutoCalculateBalance(e.target.checked)} 
                                                className="rounded border-slate-300 text-brand-rocha-primary focus:ring-brand-rocha-primary w-3.5 h-3.5"
                                            />
                                            Auto
                                        </label>
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                                        <Input
                                            type="text"
                                            value={remainingBalanceStr}
                                            onChange={(e) => {
                                                setAutoCalculateBalance(false);
                                                handleMoneyInputChange(setRemainingBalanceStr)(e);
                                            }}
                                            className="h-11 pl-8 rounded-xl font-bold"
                                            disabled={autoCalculateBalance}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-600">Condição (Exibida no Contrato)</label>
                                <Input
                                    value={paymentCondition}
                                    onChange={e => setPaymentCondition(e.target.value)}
                                    placeholder="Ex: 50% na assinatura e 50% na entrega"
                                    className="h-11 rounded-xl"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-600">Observações de Pagamento</label>
                                <Input
                                    value={paymentNotes}
                                    onChange={e => setPaymentNotes(e.target.value)}
                                    placeholder="Datas de vencimento ou observações adicionais..."
                                    className="h-11 rounded-xl"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Commercial Summary */}
                <div className="space-y-6">
                    {projectId ? (
                        <PlannedSignatureCard projectId={projectId} />
                    ) : (
                        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-dashed rounded-2xl p-6 text-center">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Assinatura Digital</h3>
                            <p className="text-xs text-slate-400">Salve o projeto primeiro para gerar o link de assinatura do cliente.</p>
                        </div>
                    )}

                    {/* Bloco 4: Resumo Comercial */}
                    <Card className="border-brand-rocha-border sticky top-6">
                        <CardHeader className="pb-3 border-b border-brand-rocha-border bg-slate-50/50 dark:bg-slate-900/50 rounded-t-lg">
                            <CardTitle className="text-base font-bold text-slate-900 dark:text-white">Bloco 4: Resumo Comercial</CardTitle>
                            <CardDescription>Defina o valor de venda e visualize a rentabilidade do projeto.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-5 space-y-5">
                            {/* Sale Value */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Valor de Venda do Projeto</label>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">R$</span>
                                    <Input
                                        type="text"
                                        value={saleValueStr}
                                        onChange={handleMoneyInputChange(setSaleValueStr)}
                                        className="h-12 pl-10 rounded-xl font-black text-lg text-slate-950 dark:text-white border-brand-rocha-primary/30 focus:ring-brand-rocha-primary"
                                        placeholder="0,00"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Material Cost */}
                            <div className="space-y-3 p-3 bg-slate-50/50 dark:bg-slate-800/20 border border-slate-200 dark:border-slate-800 rounded-2xl">
                                <div className="flex items-center justify-between">
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300">Custo do Material</label>
                                    <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={autoCalculateMaterialCost} 
                                            onChange={(e) => setAutoCalculateMaterialCost(e.target.checked)} 
                                            className="rounded border-slate-300 text-brand-rocha-primary focus:ring-brand-rocha-primary w-3.5 h-3.5"
                                        />
                                        Pela soma dos ambientes
                                    </label>
                                </div>
                                {autoCalculateMaterialCost ? (
                                    <div className="h-11 flex items-center px-4 font-black text-sm text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-xl select-none">
                                        R$ {formatCentsToBRL(environmentsTotalSum)}
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                                        <Input
                                            type="text"
                                            value={manualMaterialCostStr}
                                            onChange={handleMoneyInputChange(setManualMaterialCostStr)}
                                            className="h-11 pl-8 rounded-xl font-bold text-sm"
                                            placeholder="0,00"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Operational rates settings overrides */}
                            <div className="space-y-3 pt-2">
                                <div className="text-xs font-black text-slate-700 uppercase tracking-wide">Ajustes de Custos (%)</div>
                                
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Frete (%)</label>
                                        <Input
                                            type="text"
                                            value={freightPercentStr}
                                            onChange={(e) => setFreightPercentStr(e.target.value)}
                                            className="h-9 py-1 px-2 rounded-lg text-xs text-center font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Montagem (%)</label>
                                        <Input
                                            type="text"
                                            value={assemblyPercentStr}
                                            onChange={(e) => setAssemblyPercentStr(e.target.value)}
                                            className="h-9 py-1 px-2 rounded-lg text-xs text-center font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Maquininha (%)</label>
                                        <Input
                                            type="text"
                                            value={cardFeePercentStr}
                                            onChange={(e) => setCardFeePercentStr(e.target.value)}
                                            className="h-9 py-1 px-2 rounded-lg text-xs text-center font-bold"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Results Breakdown */}
                            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2 text-xs">
                                <div className="flex justify-between text-slate-500 font-medium">
                                    <span>Frete Interno ({freightPercentStr}% sobre Mat.):</span>
                                    <span className="tabular-nums font-semibold">R$ {formatCentsToBRL(freightCost)}</span>
                                </div>
                                <div className="flex justify-between text-slate-500 font-medium">
                                    <span>Montagem ({assemblyPercentStr}% sobre Venda):</span>
                                    <span className="tabular-nums font-semibold">R$ {formatCentsToBRL(assemblyCost)}</span>
                                </div>
                                <div className="flex justify-between text-slate-500 font-medium">
                                    <span>Taxa de Cartão ({cardFeePercentStr}% sobre Venda):</span>
                                    <span className="tabular-nums font-semibold">R$ {formatCentsToBRL(machineFeeAmount)}</span>
                                </div>
                                <div className="flex justify-between text-slate-600 font-bold border-b border-dashed border-slate-200 pb-2">
                                    <span>Total de Custo Operacional:</span>
                                    <span className="tabular-nums font-bold">R$ {formatCentsToBRL(totalOperationalCost)}</span>
                                </div>
                                
                                <div className="flex justify-between items-center pt-2">
                                    <span className="text-sm font-black text-slate-900 dark:text-white">Resultado Líquido:</span>
                                    <div className="text-right">
                                        <div className={`text-base font-black tabular-nums ${netResult >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            R$ {formatCentsToBRL(netResult)}
                                        </div>
                                        <div className={`text-[10px] font-bold ${netResult >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            Margem Líq: {profitMargin.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Project Status Selector */}
                            <div className="border-t border-slate-200 pt-3">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status do Projeto</label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value as any)}
                                    className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-rocha-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                                >
                                    <option value="rascunho">📝 Rascunho</option>
                                    <option value="enviado">✉️ Enviado ao Cliente</option>
                                    <option value="aprovado">✅ Aprovado (Vendido)</option>
                                    <option value="em_producao">⚙️ Em Produção</option>
                                    <option value="instalado">🏠 Instalado</option>
                                    <option value="cancelado">❌ Cancelado</option>
                                </select>
                            </div>

                            {/* Action Buttons */}
                            <div className="space-y-2 pt-2">
                                <Button
                                    type="button"
                                    onClick={() => handleSaveProject(true)}
                                    disabled={isSaving}
                                    variant="outline"
                                    className="w-full h-11 rounded-xl font-bold border-slate-200 text-slate-700 hover:bg-slate-50"
                                >
                                    Salvar Rascunho
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => handleSaveProject(false)}
                                    disabled={isSaving}
                                    className="w-full bg-brand-rocha-primary text-white hover:bg-brand-rocha-primary/90 h-11 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md shadow-brand-rocha-primary/20 transition-all active:scale-[0.98]"
                                >
                                    {isSaving ? (
                                        <>
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            Salvando...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="h-5 w-5" />
                                            Salvar Projeto Completo
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Quick Client Modal */}
            {isQuickClientOpen && (
                <Modal 
                    isOpen={isQuickClientOpen} 
                    onClose={() => setIsQuickClientOpen(false)}
                    title="Cadastro Rápido de Cliente"
                >
                    <form onSubmit={handleQuickClientSubmit} className="space-y-4 pt-2">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nome Completo</label>
                            <Input
                                type="text"
                                value={quickName}
                                onChange={(e) => setQuickName(e.target.value)}
                                placeholder="Nome do cliente"
                                required
                                className="rounded-xl h-11"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Celular / Telefone</label>
                            <Input
                                type="text"
                                value={quickPhone}
                                onChange={(e) => setQuickPhone(e.target.value)}
                                placeholder="(00) 00000-0000"
                                required
                                className="rounded-xl h-11"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">E-mail (Opcional)</label>
                            <Input
                                type="email"
                                value={quickEmail}
                                onChange={(e) => setQuickEmail(e.target.value)}
                                placeholder="exemplo@email.com"
                                className="rounded-xl h-11"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Endereço (Opcional)</label>
                            <Input
                                type="text"
                                value={quickAddress}
                                onChange={(e) => setQuickAddress(e.target.value)}
                                placeholder="Ex: Rua das Flores, 123 - Centro"
                                className="rounded-xl h-11"
                            />
                        </div>

                        <div className="flex gap-2 justify-end pt-3">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => setIsQuickClientOpen(false)} 
                                className="rounded-xl h-11 px-5"
                            >
                                Cancelar
                            </Button>
                            <Button 
                                type="submit" 
                                disabled={isSavingClient}
                                className="bg-brand-rocha-primary text-white hover:bg-brand-rocha-primary/95 rounded-xl h-11 px-6 font-bold flex items-center gap-1.5"
                            >
                                {isSavingClient ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Cadastrando...
                                    </>
                                ) : (
                                    <>
                                        <Check className="h-4 w-4" />
                                        Cadastrar Cliente
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Datalists for Composition Autocomplete */}
            <datalist id="color-options">
                {colorsList.map(item => <option key={item.id} value={item.name} />)}
            </datalist>
            <datalist id="handle-options">
                {handlesList.map(item => <option key={item.id} value={item.name} />)}
            </datalist>
            <datalist id="finish-options">
                {finishesList.map(item => <option key={item.id} value={item.name} />)}
            </datalist>
            <datalist id="thickness-options">
                {thicknessList.map(item => <option key={item.id} value={item.name} />)}
            </datalist>
        </div>
    );
};
