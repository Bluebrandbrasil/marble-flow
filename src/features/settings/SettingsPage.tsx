import React from 'react';
import { useSettings } from '../../hooks/useSettings';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/Tabs';
import { Save, Plus, Trash2, Image as ImageIcon, RefreshCcw, Eraser, Pencil, X, Instagram, Facebook, Phone, MapPin, Building2, Globe, FileText, Clock, CreditCard, Info, TrendingUp, Zap, Search, Copy, Check, Lock, Eye, EyeOff } from 'lucide-react';
import { useMaterialCatalog } from '../../hooks/useMaterialCatalog';
import { useServiceCatalog } from '../../hooks/useServiceCatalog';
import { useSinkCatalog } from '../../hooks/useSinkCatalog';
import { useAccessoryCatalog } from '../../hooks/useAccessoryCatalog';
import { useCompanyData, type CompanyData } from '../../hooks/useCompanyData';
import { useAuth } from '../../context/AuthContext';
import { storage } from '../../lib/firebase';
import { ref, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { seedDatabase, importOfficialPriceList } from '../../lib/seedDatabase';
import { runRule30Migration } from '../../lib/migrateRule30';
import { migrateCatalogData } from '../../lib/migrationUtils';
import { cn } from '../../lib/utils';
import { Badge } from '../../components/ui/Badge';
import type { ContractClause } from '../../hooks/useSettings';
import SignatureCanvas from 'react-signature-canvas';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { CommercialIntelligenceDashboard } from './CommercialIntelligenceDashboard';
import { DEFAULT_INTELLIGENCE_THRESHOLDS } from '../../lib/intelligenceUtils';
import { createCompanyAuditLog, diffCompanySettings, type CompanyAuditLog } from '../../lib/companyAuditLogs';
import { collection, query, where, orderBy, limit, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { safeArray, normalizeClauses } from '../../lib/dataDiagnostics';
import { normalizeText } from '../../utils/materialSearch';
import { ModuleSearchInput } from '../../components/ui/ModuleSearchInput';
import { normalizeSearchText } from '../../lib/searchUtils';
export const SettingsPage: React.FC = () => {
    const { profile, user } = useAuth();
    const { settings, updateSettings } = useSettings();
    const { companyData, updateCompanyData } = useCompanyData();

    const [formData, setFormData] = React.useState(settings);
    const [companyForm, setCompanyForm] = React.useState<CompanyData | null>(companyData);
    const [isSaving, setIsSaving] = React.useState(false);
    const [isSavingCompany, setIsSavingCompany] = React.useState(false);
    const [activeTab, setActiveTab] = React.useState('empresa');
    const [logoFile, setLogoFile] = React.useState<File | null>(null);
    const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
    const [isSavingManual, setIsSavingManual] = React.useState(false);

    // Installation calendar password state
    const [calendarPassword, setCalendarPassword] = React.useState('');
    const [showPassword, setShowPassword] = React.useState(false);
    const [isSavingPassword, setIsSavingPassword] = React.useState(false);

    const canEdit = ['superadmin', 'company_admin', 'admin'].includes(profile?.role || '');

    React.useEffect(() => {
        if (companyData) {
            const pwd = companyData.settings?.installationCalendarPassword || 
                        companyData.installationCalendarPassword || 
                        '';
            setCalendarPassword(pwd);
        }
    }, [companyData]);

    React.useEffect(() => {
        if (isSavingManual) return;
        if (!import.meta.env.PROD) {
            console.log('🔄 [REIDRATAÇÃO] Sincronizando formData com settings');
        }
        setFormData(settings);
    }, [settings, isSavingManual]);

    React.useEffect(() => {
        if (isSavingManual) return;
        if (!import.meta.env.PROD) {
            console.log('🔄 [REIDRATAÇÃO] Sincronizando companyForm com companyData');
        }
        setCompanyForm(companyData);
    }, [companyData, isSavingManual]);

    const sanitizePayload = (obj: any) => {
        const cleaned: any = {};
        for (const key in obj) {
            if (obj[key] !== undefined) {
                cleaned[key] = obj[key] === null ? null : obj[key];
            }
        }
        return cleaned;
    };

    const handleSaveSettings = async () => {
        if (!canEdit) return;
        setIsSaving(true);
        try {
            const payload = sanitizePayload({
                ...formData,
                contractTemplate: formData.contractTemplate || "",
                email: formData.email || "",
                city: formData.city || ""
            });

            // Geração de Log de Auditoria
            const diff = diffCompanySettings(settings, payload);
            if (diff.hasChanges) {
                await createCompanyAuditLog({
                    companyId: profile?.companyId || 'system',
                    userId: profile?.uid || 'system',
                    userName: profile?.name || 'Sistema',
                    userEmail: profile?.email || '',
                    action: 'settings_updated',
                    changedFields: diff.changedFields,
                    before: diff.before,
                    after: diff.after,
                    source: 'settings_page'
                });
            }

            await updateSettings(payload);
        } catch (error) {
            console.error('Error saving settings:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSavePassword = async () => {
        if (!canEdit || !profile?.companyId) return;
        setIsSavingPassword(true);
        try {
            const finalPassword = calendarPassword.trim() || '1234';
            const currentSettings = companyData?.settings || {};
            
            const updates = {
                installationCalendarPassword: finalPassword,
                settings: {
                    ...currentSettings,
                    installationCalendarPassword: finalPassword
                }
            };
            
            await updateCompanyData(updates);
            
            await createCompanyAuditLog({
                companyId: profile.companyId,
                userId: profile.uid,
                userName: profile.name || 'Gestor',
                userEmail: profile.email || '',
                action: 'settings_updated',
                changedFields: ['installationCalendarPassword'],
                before: { installationCalendarPassword: companyData?.settings?.installationCalendarPassword || companyData?.installationCalendarPassword || '1234' },
                after: { installationCalendarPassword: finalPassword },
                source: 'settings_page'
            });
            
            alert('✅ Senha da agenda de instalação atualizada com sucesso!');
        } catch (error) {
            console.error('Erro ao salvar senha do calendário:', error);
            alert('❌ Erro ao salvar senha. Tente novamente.');
        } finally {
            setIsSavingPassword(false);
        }
    };

    const handleSaveCompany = async () => {
        if (!canEdit) return;
        if (!companyForm) {
            console.warn('Tentativa de salvar sem formulário carregado.');
            return;
        }
        if (!profile?.companyId) {
            alert('Empresa não identificada. Faça login novamente.');
            return;
        }

            setIsSavingCompany(true);
            setIsSavingManual(true);
            
            try {
                console.log('--- 🚀 INICIANDO PROCESSO DE SALVAMENTO ---');
                console.log('📍 Estado Inicial do Formulário:', companyForm);
                
                let finalLogoUrl = companyForm.logoUrl || null;
                
                // 0. Upload de Logo
                if (logoFile && profile?.companyId) {
                    try {
                        if (!user) {
                            alert('Usuário não autenticado. Faça login novamente.');
                            return;
                        }

                        console.log('[LOGO_UPLOAD_DEBUG]', {
                            profileCompanyId: profile?.companyId,
                            authUid: user?.uid
                        });

                        // Forçar refresh do token antes do upload
                        await user.getIdToken(true);
                        const tokenResult = await user.getIdTokenResult(true);
                        console.log('[CLAIMS_DEBUG]', tokenResult.claims);

                        if (!tokenResult.claims.companyId) {
                            alert('Sua sessão ainda não possui permissão atualizada. Saia e entre novamente.');
                            return;
                        }

                        if (tokenResult.claims.companyId !== profile.companyId && tokenResult.claims.superadmin !== true) {
                            alert('Permissão da sessão desatualizada. Saia e entre novamente.');
                            return;
                        }

                        console.log('☁️ [STORAGE] Subindo novo arquivo de logo...');
                        const companyId = profile?.companyId;
                        const logoPath = `companies/${companyId}/logo/logo_${Date.now()}`;
                        const storageRef = ref(storage, logoPath);
                        const metadata = { contentType: logoFile.type || 'image/png' };
                        const uploadTask = uploadBytesResumable(storageRef, logoFile, metadata);
                        const snapshot = await uploadTask;
                        finalLogoUrl = await getDownloadURL(snapshot.ref);
                        console.log('✅ [STORAGE] Nova URL pública:', finalLogoUrl);
                        setLogoFile(null);
                    } catch (uploadError) {
                        console.error('❌ [STORAGE ERROR] Erro no upload da logo:', uploadError);
                        alert('Erro ao subir imagem para o Storage. Tente novamente.');
                        return;
                    }
                }

                // 1. Montar payload final da Empresa
                const updatedForm: CompanyData = {
                    ...companyForm,
                    id: companyForm.id,
                    logoUrl: finalLogoUrl || undefined,
                    cnpj: companyForm.cnpj || "",
                    phone: companyForm.phone || "",
                    telefoneFixo: companyForm.telefoneFixo || "",
                    whatsapp1: companyForm.whatsapp1 || "",
                    whatsapp2: companyForm.whatsapp2 || "",
                    instagram: companyForm.instagram || "",
                    facebook: companyForm.facebook || "",
                    website: companyForm.website || "",
                    email: companyForm.email || "",
                    street: companyForm.street || "",
                    number: companyForm.number || "",
                    neighborhood: companyForm.neighborhood || "",
                    city: companyForm.city || "",
                    state: companyForm.state || "",
                    zipCode: companyForm.zipCode || companyForm.cep || "",
                    address: companyForm.address || "",
                    cep: companyForm.cep || "",
                    name: companyForm.name || "",
                    validadePrazoTexto: companyForm.validadePrazoTexto || "",
                    parcelamentoTexto: companyForm.parcelamentoTexto || "",
                    taxaJurosTexto: companyForm.taxaJurosTexto || "",
                    pixDescontoTexto: companyForm.pixDescontoTexto || "",
                    observacaoPagamentoTexto: companyForm.observacaoPagamentoTexto || "",
                    quoteLayout: companyForm.quoteLayout || "classic"
                };

                const companyPayload = sanitizePayload({
                    ...updatedForm,
                    companySignature: updatedForm.companySignature === undefined ? null : updatedForm.companySignature,
                    settings: {
                        ...updatedForm.settings,
                        signature: updatedForm.settings?.signature === undefined ? null : updatedForm.settings.signature
                    }
                });
                console.log('📋 [DEBUG] Payload p/ updateCompanyData:', companyPayload);
                
                // 2. Montar payload de Configurações Sincronizadas
                const settingsPayload = sanitizePayload({
                    ...formData,
                    cnpj: updatedForm.cnpj,
                    city: updatedForm.city,
                    state: updatedForm.state,
                    street: updatedForm.street,
                    number: updatedForm.number,
                    neighborhood: updatedForm.neighborhood,
                    zipCode: updatedForm.zipCode,
                    logoUrl: updatedForm.logoUrl,
                    companySignature: updatedForm.companySignature === undefined ? null : updatedForm.companySignature,
                    settings: {
                        ...updatedForm.settings,
                        signature: updatedForm.settings?.signature === undefined ? null : updatedForm.settings.signature
                    },
                    contractTemplate: formData.contractTemplate || ""
                });
                console.log('📋 [DEBUG] Payload p/ updateSettings:', settingsPayload);

                // 3. Gerar Log de Auditoria antes de persistir
                const diff = diffCompanySettings(companyData, companyPayload);
                if (diff.hasChanges) {
                    try {
                        await createCompanyAuditLog({
                            companyId: profile?.companyId || 'system',
                            userId: profile?.uid || 'system',
                            userName: profile?.name || 'Sistema',
                            userEmail: profile?.email || '',
                            action: 'settings_updated',
                            changedFields: diff.changedFields,
                            before: diff.before,
                            after: diff.after,
                            source: 'settings_page'
                        });
                    } catch (logErr) {
                        console.error('⚠️ [AUDIT] Falha ao registrar log de auditoria:', logErr);
                    }
                }

                // 4. Persistir no Firestore (Sequencial para garantir ordem)
                await updateCompanyData(companyPayload);
                await updateSettings(settingsPayload);
                
                // 4. Atualizar estados locais PRIMEIRO para evitar cintilação na UI
                setCompanyForm(updatedForm);
                setFormData(settingsPayload);
                setLogoPreview(null);
                
                // Atualizar localStorage para garantir que reload use dados novos
                localStorage.setItem('marble-flow-settings', JSON.stringify(settingsPayload));
                
                console.log('✅ [SUCESSO] Todos os dados foram persistidos e sincronizados.');
                alert('🚀 Dados salvos com sucesso!');
                
            } catch (error) {
                console.error('❌ [ERRO CRÍTICO] Falha no salvamento:', error);
                alert('⚠️ Ocorreu um erro ao salvar. Tente novamente.');
            } finally {
                setIsSavingCompany(false);
                // Aguardar um pouco para liberar a reidratação, garantindo que o onSnapshot do Firestore já tenha chegado
                setTimeout(() => setIsSavingManual(false), 2000);
            }
    };

    const handleReset = () => {
        if (window.confirm('Deseja resetar as configurações para os valores atuais salvos?')) {
            setFormData(settings);
        }
    };

    const handleSeed = async () => {
        if (window.confirm('ATENÇÃO: Isso irá adicionar dados de exemplo (Pedras, Serviços, Cubas) ao seu banco de dados. Deseja continuar?')) {
            try {
                await seedDatabase(profile?.email, profile?.uid || '', profile?.companyId || '');
                alert('Banco de dados inicializado com sucesso! Recarregue os componentes se necessário.');
            } catch (error) {
                alert('Erro ao semear banco.');
            }
        }
    };

    const handleImportPrices = async () => {
        if (!profile?.uid || !profile?.companyId) return;
        if (!window.confirm('Deseja importar a lista oficial de materiais e cubas agora? (42 itens serão adicionados)')) return;
        
        setIsSavingCompany(true);
        try {
            const result = await importOfficialPriceList(profile.uid, profile.companyId);
            if (result.success) {
                alert(`🚀 Sucesso Absoluto! ${result.count} itens importados com preços oficiais no seu catálogo. Recarregue a página para visualizar.`);
            }
        } catch (error) {
            console.error('Error importing prices:', error);
            alert('Falha na importação.');
        } finally {
            setIsSavingCompany(false);
        }
    };

    const handleRunMigrationRule30 = async () => {
        if (!profile?.companyId) return;
        if (!window.confirm('Executar a migração da Regra nº 30 nos dados do Firestore da empresa? Isso substituirá campos de total numéricos antigos nos orçamentos e pedidos pela nova estrutura comercial.\n\nESTE PROCESSO É IRREVERSÍVEL.')) return;
        
        setIsSavingCompany(true);
        try {
            const result = await runRule30Migration(profile.companyId);
            alert(`✅ Migração da Regra nº 30 concluída!\n\n${result.quotesMigrated || 0} Orçamentos atualizados\n${result.ordersMigrated || 0} Ordens de Serviço atualizadas.`);
        } catch (error) {
            console.error('Error running Rule #30 migration:', error);
            alert('Erro ao executar a migração.');
        } finally {
            setIsSavingCompany(false);
        }
    };

    const handleMigrateCatalog = async () => {
        const dryRun = window.confirm("Deseja rodar em modo SIMULAÇÃO (Dry Run)?\n\nOK = Simulação (Safe)\nCancelar = Execução Real");
        
        if (!dryRun) {
            if (!window.confirm("⚠️ ATENÇÃO: Você escolheu a EXECUÇÃO REAL.\n\nIsso irá copiar os dados das coleções antigas para as novas. Os dados antigos NÃO serão apagados.\n\nDeseja continuar?")) return;
        }

        setIsSavingCompany(true);
        try {
            const results = await migrateCatalogData(dryRun);
            const summary = safeArray(results).map(r => 
                `${r.collection}:\n - Lidos: ${r.stats.totalRead}\n - Migrados: ${r.stats.totalMigrated}\n - Ignorados/Duplicados: ${r.stats.totalIgnored}`
            ).join('\n\n');

            alert(`📊 Resultado da Migração (${dryRun ? 'Simulação' : 'Real'}):\n\n${summary}\n\nNota: Itens migrados agora contém metadados de auditoria (legacyId, migratedFrom).\nVerifique o console para detalhes de erros.`);
        } catch (error) {
            console.error("Migration Error:", error);
            alert("Erro durante a migração. Verifique o console.");
        } finally {
            setIsSavingCompany(false);
        }
    };


    // Signature Pad logic
    const sigPad = React.useRef<SignatureCanvas | null>(null);

    const [showManagerSignatureModal, setShowManagerSignatureModal] = React.useState(false);
    const [managerSignatureLink, setManagerSignatureLink] = React.useState('');
    const [mobileSigToken, setMobileSigToken] = React.useState('');
    const [mobileSigExpiresAt, setMobileSigExpiresAt] = React.useState<Date | null>(null);
    const [isGeneratingLink, setIsGeneratingLink] = React.useState(false);
    const [copied, setCopied] = React.useState(false);

    const generateSecureToken = () => {
        if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
            const array = new Uint8Array(16);
            window.crypto.getRandomValues(array);
            return Array.from(array, dec => dec.toString(16).padStart(2, '0')).join('');
        }
        return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    };

    const handleGenerateManagerSignatureLink = async () => {
        console.log("[MANAGER_SIGNATURE] botão clicado");
        alert("Gerando link de assinatura pelo celular...");
        if (!profile?.companyId) return;
        setIsGeneratingLink(true);
        try {
            const token = generateSecureToken();
            console.log('[MANAGER_SIGNATURE] token criado:', token);

            const expiresDate = new Date(Date.now() + 10 * 60 * 1000);
            const expiresAt = expiresDate.toISOString();

            await setDoc(doc(db, 'manager_signature_tokens', token), {
                token,
                companyId: profile.companyId,
                companyName: companyForm?.companyName || formData?.companyName || profile?.companyName || companyForm?.name || formData?.name || 'Sua Empresa',
                createdBy: profile.uid || user?.uid || 'system',
                createdAt: new Date().toISOString(),
                expiresAt,
                active: true,
                usedAt: null
            });

            const link = `${window.location.origin}/manager-signature/${token}`;
            console.log('[MANAGER_SIGNATURE] link criado:', link);

            setManagerSignatureLink(link);
            setMobileSigToken(token);
            setMobileSigExpiresAt(expiresDate);
            setShowManagerSignatureModal(true);
            alert(link);
        } catch (err) {
            console.error('[GENERATE_MOBILE_SIG_ERROR]', err);
            alert('Falha ao gerar link de assinatura móvel.');
        } finally {
            setIsGeneratingLink(false);
        }
    };

    React.useEffect(() => {
        if (!mobileSigToken) return;

        const tokenRef = doc(db, 'manager_signature_tokens', mobileSigToken);
        const unsubscribe = onSnapshot(tokenRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data && (data.active === false || data.usedAt)) {
                    setShowManagerSignatureModal(false);
                    setMobileSigToken('');
                    setManagerSignatureLink('');
                    alert('Assinatura móvel concluída com sucesso! Salve as configurações para registrar definitivamente.');
                    // Force rehydration of local data to load signature
                    setIsSavingManual(true);
                    setTimeout(() => setIsSavingManual(false), 500);
                }
            }
        });

        return () => unsubscribe();
    }, [mobileSigToken]);

    const clearSignature = () => {
        if (!canEdit) return;
        sigPad.current?.clear();
        if (companyForm) {
            setCompanyForm({ 
                ...companyForm, 
                companySignature: null,
                settings: { ...companyForm.settings, signature: null }
            });
        }
        setFormData(prev => ({
            ...prev,
            companySignature: null,
            settings: { ...prev.settings, signature: null }
        }));
    };

    const saveSignature = () => {
        if (!canEdit) return;
        if (sigPad.current?.isEmpty()) {
            alert('Por favor, faça a assinatura antes de salvar.');
            return;
        }
        const signatureData = sigPad.current?.getTrimmedCanvas().toDataURL('image/png');
        if (companyForm) {
            setCompanyForm({ 
                ...companyForm, 
                companySignature: signatureData,
                settings: { ...companyForm.settings, signature: signatureData }
            });
        }
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!canEdit) return;
        const file = e.target.files?.[0];
        if (!file) return;

        // Validar tipo de arquivo
        if (!file.type.startsWith('image/')) {
            alert('Por favor, selecione um arquivo de imagem válido.');
            return;
        }

        // Criar preview local
        const previewUrl = URL.createObjectURL(file);
        setLogoFile(file);
        setLogoPreview(previewUrl);
        console.log('📸 Preview da logo gerado localmente.');
    };

    return (
        <div className="space-y-10 pb-20">
            <div className="flex justify-between items-center">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    {!canEdit && (
                        <div className="mb-6 p-5 bg-amber-50 border border-amber-100 rounded-[1.5rem] flex items-center gap-4 animate-in slide-in-from-top-2 duration-300">
                            <Info className="h-5 w-5 text-amber-600 flex-shrink-0" />
                            <div>
                                <h4 className="text-[10px] font-black uppercase text-amber-900 tracking-widest leading-none">Modo de Leitura</h4>
                                <p className="text-[11px] text-amber-700 font-medium mt-1">Apenas administradores podem alterar as configurações da empresa.</p>
                            </div>
                        </div>
                    )}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10 sticky top-0 bg-slate-50/90 backdrop-blur-md z-30 py-6 -mx-4 px-6 border-b border-slate-100/50 shadow-sm transition-all">
                <TabsList className="flex-wrap h-auto gap-2 bg-transparent p-0">
                    <TabsTrigger value="empresa" className="data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:shadow-slate-200/50 border-2 border-transparent data-[state=active]:border-slate-100 h-11 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 data-[state=active]:text-slate-900 transition-all">Gestão da Unidade</TabsTrigger>
                    <TabsTrigger value="comercial" className="data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:shadow-slate-200/50 border-2 border-transparent data-[state=active]:border-slate-100 h-11 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 data-[state=active]:text-slate-900 transition-all">Configuração Proposta</TabsTrigger>
                    <TabsTrigger value="contract" className="data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:shadow-slate-200/50 border-2 border-transparent data-[state=active]:border-slate-100 h-11 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 data-[state=active]:text-slate-900 transition-all">Cláusulas Jurídicas</TabsTrigger>
                    <TabsTrigger value="materials" className="data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:shadow-slate-200/50 border-2 border-transparent data-[state=active]:border-slate-100 h-11 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 data-[state=active]:text-slate-900 transition-all">Base de Materiais</TabsTrigger>
                    <TabsTrigger value="services" className="data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:shadow-slate-200/50 border-2 border-transparent data-[state=active]:border-slate-100 h-11 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 data-[state=active]:text-slate-900 transition-all">Regras de Obra</TabsTrigger>
                    <TabsTrigger value="sinks" className="data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:shadow-slate-200/50 border-2 border-transparent data-[state=active]:border-slate-100 h-11 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 data-[state=active]:text-slate-900 transition-all">Cubas e Acessórios</TabsTrigger>
                    <TabsTrigger value="intelligence" className="data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:shadow-slate-200/50 border-2 border-transparent data-[state=active]:border-slate-100 h-11 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 data-[state=active]:text-slate-900 transition-all">Fluxo Inteligente</TabsTrigger>
                    <TabsTrigger value="governança" className="data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:shadow-slate-200/50 border-2 border-transparent data-[state=active]:border-slate-100 h-11 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 data-[state=active]:text-slate-900 transition-all">🛡️ Governança</TabsTrigger>
                </TabsList>

                <div className="flex gap-3 w-full lg:w-auto">
                    {['empresa', 'comercial'].includes(activeTab) ? (
                        <Button onClick={handleSaveCompany} disabled={isSavingCompany || !canEdit} className="bg-brand-rocha-primary hover:scale-[1.02] active:scale-[0.98] transition-all text-white font-black uppercase text-[10px] tracking-widest h-11 px-8 rounded-xl shadow-xl shadow-violet-500/10 flex-1 lg:flex-none disabled:opacity-50">
                            <Save className="mr-3 h-4 w-4" />
                            {isSavingCompany ? 'Processando...' : 'Atualizar Dados'}
                        </Button>
                    ) : activeTab === 'contract' ? (
                        <Button onClick={handleSaveSettings} disabled={isSaving || !canEdit} className="bg-slate-900 hover:scale-[1.02] active:scale-[0.98] transition-all text-white font-black uppercase text-[10px] tracking-widest h-11 px-8 rounded-xl shadow-xl shadow-slate-900/10 flex-1 lg:flex-none disabled:opacity-50">
                            <Save className="mr-3 h-4 w-4" />
                            {isSaving ? 'Processando...' : 'Salvar Cláusulas'}
                        </Button>
                    ) : ['materials', 'services', 'sinks'].includes(activeTab) ? (
                        <div className="flex gap-3 flex-1 lg:flex-none">
                            <Button 
                                variant="outline" 
                                onClick={handleImportPrices} 
                                className="border-emerald-100 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 h-11 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest flex-1 disabled:opacity-30"
                                disabled={isSavingCompany || !canEdit}
                            >
                                <Plus className="mr-3 h-4 w-4 text-emerald-500" />
                                Tabela Oficial
                            </Button>
                            <Button variant="outline" onClick={handleSeed} disabled={!canEdit} className="border-slate-100 bg-slate-50 text-slate-400 hover:text-slate-900 h-11 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest flex-1 lg:flex-none disabled:opacity-30">
                                <RefreshCcw className="mr-3 h-4 w-4 text-slate-300" />
                                Demo Data
                            </Button>
                            <Button variant="outline" onClick={handleRunMigrationRule30} disabled={isSavingCompany || !canEdit} className="border-amber-100 bg-amber-50 text-amber-600 hover:bg-amber-100 h-11 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest flex-1 lg:flex-none disabled:opacity-30">
                                <Zap className="mr-3 h-4 w-4 text-amber-500" />
                                R30
                            </Button>
                            <Button variant="outline" onClick={handleMigrateCatalog} disabled={isSavingCompany || !canEdit} className="border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100 h-11 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest flex-1 lg:flex-none disabled:opacity-30">
                                <RefreshCcw className="mr-3 h-4 w-4 text-blue-500" />
                                Migrar Catálogo
                            </Button>
                        </div>
                    ) : (
                        <Button onClick={handleSaveSettings} disabled={isSaving} className="bg-brand-rocha-primary hover:scale-[1.02] active:scale-[0.98] transition-all text-white font-black uppercase text-[10px] tracking-widest h-11 px-8 rounded-xl shadow-xl shadow-violet-500/10 flex-1 lg:flex-none">
                            <Save className="mr-3 h-4 w-4" />
                            {isSaving ? 'Gravando...' : 'Salvar Inteligência'}
                        </Button>
                    )}
                    <Button variant="ghost" onClick={handleReset} title="Limpar tudo" className="h-11 w-11 p-0 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                        <Eraser className="h-5 w-5" />
                    </Button>
                </div>
            </div>

                    <TabsContent value="empresa" className="space-y-6 animate-in fade-in duration-500">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Identity Column */}
                            <div className="lg:col-span-2 space-y-6">
                                <Card className="border-slate-100 shadow-sm overflow-hidden rounded-[2.5rem]">
                                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
                                        <CardTitle className="flex items-center gap-3 text-slate-900 font-black uppercase text-xs tracking-[0.2em]">
                                            <Building2 className="w-5 h-5 text-brand-rocha-primary" /> Institucional Marmoraria
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-8 space-y-8">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">
                                                    <Building2 className="w-3.5 h-3.5 inline mr-2 opacity-50" /> Nome Fantasia Corporativo
                                                </label>
                                                <Input
                                                    value={companyForm?.name || ''}
                                                    onChange={(e) => setCompanyForm((prev: CompanyData | null) => (prev ? { ...prev, name: e.target.value } : null))}
                                                    disabled={!canEdit}
                                                    placeholder="Ex: Marmoraria Rocha"
                                                    className="font-black h-12 rounded-2xl bg-white border-slate-100 px-6 text-sm uppercase tracking-tight focus:ring-brand-rocha-primary"
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">
                                                    <FileText className="w-3.5 h-3.5 inline mr-2 opacity-50" /> Documentação (CNPJ)
                                                </label>
                                                <Input
                                                    value={companyForm?.cnpj || ''}
                                                    onChange={(e) => setCompanyForm((prev: CompanyData | null) => (prev ? { ...prev, cnpj: e.target.value } : null))}
                                                    disabled={!canEdit}
                                                    placeholder="00.000.000/0000-00"
                                                    className="font-black h-12 rounded-2xl bg-white border-slate-100 px-6 text-sm tabular-nums focus:ring-brand-rocha-primary"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                            <div className="md:col-span-3 space-y-3">
                                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">
                                                    <MapPin className="w-3.5 h-3.5 inline mr-2 opacity-50" /> Logradouro Sede
                                                </label>
                                                <Input
                                                    value={companyForm?.street || ''}
                                                    onChange={(e) => setCompanyForm((prev: CompanyData | null) => (prev ? { ...prev, street: e.target.value } : null))}
                                                    placeholder="Ex: Av. Principal de Produção"
                                                    className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-bold focus:ring-brand-rocha-primary"
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">
                                                    Número
                                                </label>
                                                <Input
                                                    value={companyForm?.number || ''}
                                                    onChange={(e) => setCompanyForm((prev: CompanyData | null) => (prev ? { ...prev, number: e.target.value } : null))}
                                                    placeholder="123"
                                                    className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-bold text-center focus:ring-brand-rocha-primary"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">
                                                <Building2 className="w-3.5 h-3.5 inline mr-2 opacity-50" /> Bairro / Região
                                            </label>
                                            <Input
                                                value={companyForm?.neighborhood || ''}
                                                onChange={(e) => setCompanyForm((prev: CompanyData | null) => (prev ? { ...prev, neighborhood: e.target.value } : null))}
                                                placeholder="Ex: Distrito Industrial"
                                                className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-bold focus:ring-brand-rocha-primary"
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Sede (Cidade)</label>
                                                <Input
                                                    value={companyForm?.city || ''}
                                                    onChange={(e) => setCompanyForm((prev: CompanyData | null) => (prev ? { ...prev, city: e.target.value } : null))}
                                                    placeholder="Cidade"
                                                    className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-bold focus:ring-brand-rocha-primary"
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">UF</label>
                                                <Input
                                                    value={companyForm?.state || ''}
                                                    onChange={(e) => setCompanyForm((prev: CompanyData | null) => (prev ? { ...prev, state: e.target.value } : null))}
                                                    placeholder="SP"
                                                    maxLength={2}
                                                    className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-black text-center focus:ring-brand-rocha-primary uppercase"
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Circular (CEP)</label>
                                                <Input
                                                    value={companyForm?.zipCode || companyForm?.cep || ''}
                                                    onChange={(e) => setCompanyForm((prev: CompanyData | null) => {
                                                        if (!prev) return null;
                                                        return { ...prev, zipCode: e.target.value, cep: e.target.value };
                                                    })}
                                                    placeholder="00000-000"
                                                    className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-mono tabular-nums focus:ring-brand-rocha-primary"
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="border-slate-100 shadow-sm overflow-hidden rounded-[2.5rem] border-t-4 border-t-violet-500">
                                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
                                        <CardTitle className="flex items-center gap-3 text-slate-900 font-black uppercase text-xs tracking-[0.2em]">
                                            <Phone className="w-5 h-5 text-brand-rocha-primary" /> Relacionamento e Presença Digital
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-8 space-y-8">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="space-y-6">
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">
                                                        <Phone className="w-3.5 h-3.5 inline mr-2 opacity-50" /> Telefone Administrativo
                                                    </label>
                                                    <Input
                                                        value={companyForm?.telefoneFixo || ''}
                                                        onChange={(e) => setCompanyForm((prev: CompanyData | null) => (prev ? { ...prev, telefoneFixo: e.target.value } : null))}
                                                        placeholder="(00) 0000-0000"
                                                        className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-bold"
                                                    />
                                                </div>
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">
                                                        <WhatsAppIcon className="w-3.5 h-3.5 inline mr-2 text-emerald-500" /> WhatsApp Operacional
                                                    </label>
                                                    <Input
                                                        value={companyForm?.whatsapp1 || ''}
                                                        onChange={(e) => setCompanyForm((prev: CompanyData | null) => (prev ? { ...prev, whatsapp1: e.target.value } : null))}
                                                        placeholder="(00) 00000-0000"
                                                        className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-bold"
                                                    />
                                                </div>
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">
                                                        <WhatsAppIcon className="w-3.5 h-3.5 inline mr-2 text-emerald-400 opacity-60" /> WhatsApp Suporte
                                                    </label>
                                                    <Input
                                                        value={companyForm?.whatsapp2 || ''}
                                                        onChange={(e) => setCompanyForm((prev: CompanyData | null) => (prev ? { ...prev, whatsapp2: e.target.value } : null))}
                                                        placeholder="(00) 00000-0000"
                                                        className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-bold"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-6">
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">
                                                        <Instagram className="w-3.5 h-3.5 inline mr-2 text-pink-500" /> Instagram (@marmoraria)
                                                    </label>
                                                    <Input
                                                        value={companyForm?.instagram || ''}
                                                        onChange={(e) => setCompanyForm((prev: CompanyData | null) => (prev ? { ...prev, instagram: e.target.value } : null))}
                                                        placeholder="@suamarca"
                                                        className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-bold"
                                                    />
                                                </div>
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">
                                                        <Facebook className="w-3.5 h-3.5 inline mr-2 text-blue-600" /> Facebook Page
                                                    </label>
                                                    <Input
                                                        value={companyForm?.facebook || ''}
                                                        onChange={(e) => setCompanyForm((prev: CompanyData | null) => (prev ? { ...prev, facebook: e.target.value } : null))}
                                                        placeholder="Sua Marmoraria"
                                                        className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-bold"
                                                    />
                                                </div>
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">
                                                        <Globe className="w-3.5 h-3.5 inline mr-2 text-blue-400" /> Website / Domínio
                                                    </label>
                                                    <Input
                                                        value={companyForm?.website || ''}
                                                        onChange={(e) => setCompanyForm((prev: CompanyData | null) => (prev ? { ...prev, website: e.target.value } : null))}
                                                        placeholder="www.seusite.com.br"
                                                        className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-bold"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Logo & Signature Column */}
                            <div className="space-y-6">
                                <Card className="border-slate-100 shadow-sm rounded-[2.5rem] overflow-hidden">
                                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
                                        <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">Identidade Visual (Logo)</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-8">
                                        <div className="flex flex-col items-center gap-6">
                                            <div className="h-48 w-full bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-100 flex items-center justify-center overflow-hidden group relative cursor-pointer hover:border-brand-rocha-primary hover:bg-violet-50 transition-all shadow-inner"
                                                onClick={() => document.getElementById('logo-upload')?.click()}>
                                                {(logoPreview || companyForm?.logoUrl) ? (
                                                    <img 
                                                        src={logoPreview || companyForm?.logoUrl || ''} 
                                                        alt="Logo" 
                                                        crossOrigin="anonymous"
                                                        className="max-h-full max-w-full p-8 object-contain transition-transform group-hover:scale-105" 
                                                    />
                                                ) : (
                                                    <div className="flex flex-col items-center text-slate-300 group-hover:text-brand-rocha-primary transition-colors">
                                                        <ImageIcon className="h-12 w-12 mb-3 opacity-40" />
                                                        <span className="text-[9px] font-black uppercase tracking-widest">Upload da Marca</span>
                                                    </div>
                                                )}
                                                <input
                                                    id="logo-upload"
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleLogoUpload}
                                                    className="hidden"
                                                />
                                            </div>
                                            <p className="text-[9px] text-center text-slate-400 font-black uppercase tracking-[0.1em] px-6 leading-relaxed opacity-60">
                                                Formato PNG/SVG (Fundo Transp) ou JPG (Fundo Branco). Máx: 2MB.
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="border-slate-100 shadow-sm rounded-[2.5rem] overflow-hidden border-t-4 border-t-slate-900">
                                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
                                        <CardTitle className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">
                                            Assinatura do Gestor
                                            <div className="flex gap-2">
                                                <Button variant="ghost" size="sm" onClick={handleGenerateManagerSignatureLink} disabled={isGeneratingLink} className="h-8 px-4 text-[9px] font-black uppercase tracking-widest text-brand-rocha-primary hover:bg-slate-100 rounded-xl">
                                                    {isGeneratingLink ? 'Gerando...' : 'Assinar pelo Celular'}
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={clearSignature} className="h-8 px-4 text-[9px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 rounded-xl">Limpar</Button>
                                            </div>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-8 space-y-6">
                                        <div className="bg-slate-50/50 border border-slate-100 rounded-3xl shadow-inner overflow-hidden flex items-center justify-center">
                                            <SignatureCanvas
                                                ref={sigPad}
                                                penColor='#003B8E'
                                                onEnd={saveSignature}
                                                canvasProps={{ width: 330, height: 120, className: 'sigCanvas pointer-events-auto mx-auto' }}
                                            />
                                        </div>
                                        <div className="pt-6 border-t border-slate-50">
                                            <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-3 block opacity-60">Prévia do Selo Digital:</label>
                                            <div className="h-28 w-full bg-white rounded-2xl flex items-center justify-center border border-dashed border-slate-100 shadow-sm">
                                                {(companyForm?.settings?.signature || companyForm?.companySignature) ? (
                                                    <img src={companyForm.settings?.signature || companyForm.companySignature} alt="Assinatura" className="max-h-full object-contain p-4" />
                                                ) : (
                                                    <span className="text-[9px] italic text-slate-300 uppercase tracking-widest font-black">Traçar assinatura acima</span>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="contract" className="space-y-10 animate-in fade-in duration-300 max-w-5xl mx-auto">
                        <Card className="border-none shadow-none bg-transparent">
                            <CardContent className="p-0">
                                <ContractClauseManager 
                                    template={formData.contractTemplate} 
                                    onUpdate={(newTemplate) => setFormData(prev => ({ ...prev, contractTemplate: newTemplate }))}
                                    canEdit={canEdit}
                                />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="comercial" className="space-y-12 animate-in fade-in duration-300">
                        {/* BLOCO DE INTELIGÊNCIA COMERCIAL (NOVO) */}
                        <div className="max-w-5xl mx-auto">
                            <CommercialIntelligenceDashboard 
                                companyForm={companyForm} 
                                setCompanyForm={setCompanyForm} 
                                canEdit={canEdit}
                            />
                        </div>

                        {/* BLOCO 1: Condições Comerciais */}
                        <div className="max-w-5xl mx-auto space-y-6">
                            <div className="flex items-center gap-4 mb-2">
                                <div className="h-10 w-10 bg-amber-100 rounded-2xl flex items-center justify-center">
                                    <TrendingUp className="w-5 h-5 text-amber-600" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black uppercase text-slate-900 tracking-widest">Condições Comerciais</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Configure como o cliente pode pagar e os prazos</p>
                                </div>
                            </div>
                            
                            <Card className="border-slate-100 shadow-sm overflow-hidden rounded-[2.5rem]">
                                <CardContent className="p-8 space-y-8">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2 flex items-center gap-2">
                                            <Clock className="w-3.5 h-3.5 text-slate-300" /> Validade e Prazo de Entrega
                                        </label>
                                        <textarea
                                            value={companyForm?.validadePrazoTexto || ''}
                                            onChange={(e) => setCompanyForm((prev: any) => (prev ? { ...prev, validadePrazoTexto: e.target.value } : null))}
                                            placeholder="Ex: Proposta válida por 10 dias úteis. Prazo médio de execução: 15-20 dias após medição final."
                                            className="w-full min-h-[120px] p-6 rounded-2xl border border-slate-100 focus:border-brand-rocha-primary outline-none text-sm font-bold bg-slate-50/30 shadow-inner resize-none transition-all"
                                        />
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3 p-6 bg-slate-50/50 rounded-3xl border border-slate-100 shadow-sm">
                                            <label className="text-[10px] font-black uppercase text-slate-900 tracking-[0.2em] ml-2 flex items-center gap-2">
                                                <CreditCard className="w-3.5 h-3.5 text-amber-500" /> Como o cliente pode pagar
                                            </label>
                                            <Input
                                                value={companyForm?.parcelamentoTexto || ''}
                                                onChange={(e) => setCompanyForm((prev: any) => (prev ? { ...prev, parcelamentoTexto: e.target.value } : null))}
                                                placeholder="Ex: 50% Entrada + 3x no Cartão"
                                                className="h-12 rounded-2xl bg-white border-slate-200 px-6 font-black text-slate-900 focus:ring-amber-500"
                                            />
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-2 italic">Ex: Entrada + Parcelas</p>
                                        </div>
                                        
                                        <div className="space-y-3 p-6 bg-violet-50/30 rounded-3xl border border-violet-100 shadow-sm ring-2 ring-violet-500/5">
                                            <label className="text-[10px] font-black uppercase text-brand-rocha-primary tracking-[0.2em] ml-2 flex items-center gap-2">
                                                <Zap className="w-3.5 h-3.5 text-brand-rocha-primary" /> Desconto no pagamento à vista
                                            </label>
                                            <Input
                                                value={companyForm?.pixDescontoTexto || ''}
                                                onChange={(e) => setCompanyForm((prev: any) => (prev ? { ...prev, pixDescontoTexto: e.target.value } : null))}
                                                placeholder="Ex: 7% de desconto no PIX/Transferência"
                                                className="h-12 rounded-2xl bg-white border-violet-200 px-6 font-black text-brand-rocha-primary focus:ring-brand-rocha-primary shadow-sm"
                                            />
                                            <div className="flex items-center gap-2 ml-2">
                                                <Badge className="bg-emerald-500 text-white text-[8px] font-black uppercase px-2 py-0">Estratégico</Badge>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic font-bold">Incentiva o faturamento imediato</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2 flex items-center gap-2">
                                                <TrendingUp className="w-3.5 h-3.5 text-slate-300" /> Taxa de Financiamento / Juros
                                            </label>
                                            <Input
                                                value={companyForm?.taxaJurosTexto || ''}
                                                onChange={(e) => setCompanyForm((prev: any) => (prev ? { ...prev, taxaJurosTexto: e.target.value } : null))}
                                                placeholder="Ex: Parcelas fixas sem juros"
                                                className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-bold"
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2 flex items-center gap-2">
                                                <Info className="w-3.5 h-3.5 text-slate-300" /> Observações de Faturamento
                                            </label>
                                            <Input
                                                value={companyForm?.observacaoPagamentoTexto || ''}
                                                onChange={(e) => setCompanyForm((prev: any) => (prev ? { ...prev, observacaoPagamentoTexto: e.target.value } : null))}
                                                placeholder="Ex: Saldo residual pago na montagem"
                                                className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-bold"
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                    </TabsContent>


                    <TabsContent value="materials" className="space-y-10 animate-in fade-in duration-300">
                        <MaterialManager canEdit={canEdit} />
                        <ServiceManager canEdit={canEdit} />
                    </TabsContent>

                    <TabsContent value="services" className="space-y-10 animate-in fade-in duration-300">
                        <InstallationRateManager canEdit={canEdit} />
                    </TabsContent>

                    <TabsContent value="sinks" className="space-y-10 animate-in fade-in duration-300">
                        <SinkManager canEdit={canEdit} />
                        <AccessoryManager canEdit={canEdit} />
                    </TabsContent>
                    
                    <TabsContent value="intelligence" className="space-y-10 animate-in fade-in duration-300">
                        <IntelligenceSettingsManager 
                            intelligence={formData.intelligence}
                            onUpdate={(updated) => setFormData(prev => ({ ...prev, intelligence: updated }))}
                            onSave={handleSaveSettings}
                            isSaving={isSaving}
                            canEdit={canEdit}
                        />
                    </TabsContent>

                    <TabsContent value="governança" className="space-y-10 animate-in fade-in duration-300">
                        {canEdit && (
                            <Card className="border-slate-100 shadow-sm overflow-hidden rounded-[2.5rem]">
                                <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
                                    <CardTitle className="flex items-center gap-3 text-slate-900 font-black uppercase text-xs tracking-[0.2em]">
                                        <Lock className="w-5 h-5 text-brand-rocha-primary" /> Senha da Agenda de Instalação
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-8 space-y-6">
                                    <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-2xl flex gap-4">
                                        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="text-[10px] font-black uppercase text-blue-900 tracking-widest leading-none">Segurança e Governança</h4>
                                            <p className="text-[11px] text-blue-700 font-medium mt-2 leading-relaxed">
                                                Esta senha é solicitada aos usuários sempre que uma data de instalação for modificada no calendário (seja por arraste ou no painel de detalhes). Se nenhuma senha for cadastrada, o sistema utilizará o padrão provisório <strong>1234</strong>.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-3 max-w-md">
                                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">
                                            Senha Administrativa
                                        </label>
                                        <div className="relative flex items-center">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                value={calendarPassword}
                                                onChange={(e) => setCalendarPassword(e.target.value)}
                                                placeholder="Digite a senha..."
                                                className="w-full h-12 rounded-2xl bg-white border border-slate-100 px-6 pr-14 text-sm font-bold tracking-tight focus:outline-none focus:ring-2 focus:ring-brand-rocha-primary/20 focus:border-brand-rocha-primary"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-4 p-2 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="h-5 w-5" />
                                                ) : (
                                                    <Eye className="h-5 w-5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-100">
                                        <Button
                                            onClick={handleSavePassword}
                                            disabled={isSavingPassword}
                                            className="bg-slate-900 hover:scale-[1.02] active:scale-[0.98] transition-all text-white font-black uppercase text-[10px] tracking-widest h-12 px-8 rounded-xl shadow-xl shadow-slate-900/10"
                                        >
                                            <Save className="mr-3 h-4 w-4" />
                                            {isSavingPassword ? 'Salvando...' : 'Salvar Senha'}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                        <GovernanceHistory companyId={profile?.companyId} />
                    </TabsContent>
                </Tabs>
            </div>

            {showManagerSignatureModal && (
                <div 
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
                    style={{ zIndex: 9999 }}
                >
                    <div className="relative w-full max-w-md rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-2xl dark:border-white/10 dark:bg-slate-900 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6 flex-shrink-0">
                            <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider">
                                Assinatura pelo Celular
                            </h3>
                            <button
                                onClick={() => { setShowManagerSignatureModal(false); setMobileSigToken(''); setManagerSignatureLink(''); }}
                                className="p-2 text-slate-400 hover:text-rose-500 rounded-xl hover:bg-rose-50 transition-all"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto pr-1 space-y-6 text-center">
                            <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">
                                Este link ficará válido por 10 minutos.
                            </p>

                            {/* QR Code Container */}
                            <div className="flex justify-center bg-white p-4 rounded-3xl border border-slate-100 shadow-inner w-fit mx-auto">
                                <img 
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(managerSignatureLink)}`} 
                                    alt="QR Code Assinatura Móvel" 
                                    className="w-36 h-36"
                                />
                            </div>

                            {/* Link Display */}
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-left">
                                <label className="text-[8px] font-black uppercase text-slate-400 tracking-widest block mb-1">Link Completo:</label>
                                <p className="text-xs text-slate-600 font-mono break-all select-all font-medium">{managerSignatureLink}</p>
                            </div>

                            {/* Expiration Display */}
                            {mobileSigExpiresAt && (
                                <p className="text-[10px] font-black uppercase text-amber-500 tracking-widest bg-amber-500/10 py-2 rounded-xl">
                                    Expira em: {format(mobileSigExpiresAt, 'HH:mm:ss', { locale: ptBR })}
                                </p>
                            )}

                            {/* Botões */}
                            <div className="grid grid-cols-2 gap-3">
                                <Button
                                    onClick={() => {
                                        navigator.clipboard.writeText(managerSignatureLink);
                                        alert('✅ Link copiado');
                                    }}
                                    className="h-14 text-xs font-black uppercase tracking-widest bg-slate-900 text-white rounded-xl shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
                                >
                                    COPIAR LINK
                                </Button>
                                <Button
                                    onClick={() => {
                                        const message = `Olá.\n\nSegue o link para assinatura do gestor.\n\n${managerSignatureLink}\n\nEste link expira em 10 minutos.`;
                                        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
                                    }}
                                    className="h-14 text-xs font-black uppercase tracking-widest bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                >
                                    <WhatsAppIcon className="h-5 w-5" /> ENVIAR WHATSAPP
                                </Button>
                            </div>

                            <Button
                                onClick={() => { setShowManagerSignatureModal(false); setMobileSigToken(''); setManagerSignatureLink(''); }}
                                className="w-full h-12 text-xs font-black uppercase tracking-widest bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-xl transition-all"
                            >
                                FECHAR
                            </Button>

                            <div className="pt-4 border-t border-slate-100 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                                Aguardando assinatura no celular (Expira em 10 min)
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const InstallationRateManager: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
    const { companyData, updateCompanyData } = useCompanyData();
    const [rate, setRate] = React.useState(companyData?.installationRateLinear || 0);

    React.useEffect(() => {
        if (companyData?.installationRateLinear !== undefined) {
            setRate(companyData.installationRateLinear);
        }
    }, [companyData?.installationRateLinear]);

    const handleSave = async () => {
        if (!canEdit) return;
        try {
            await updateCompanyData({ installationRateLinear: rate });
            alert('Taxa de instalação atualizada!');
        } catch (error) {
            alert('Erro ao salvar taxa.');
        }
    };

    return (
        <Card className="border-slate-100 shadow-sm overflow-hidden border-t-4 border-t-emerald-500 rounded-[2.5rem] max-w-5xl mx-auto">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
                <CardTitle className="flex items-center gap-3 text-slate-900 font-black uppercase text-xs tracking-[0.2em]">
                    <RefreshCcw className="w-5 h-5 text-emerald-500" /> Regra da Instalação do Frontão
                </CardTitle>
            </CardHeader>
            <CardContent className="p-8">
                <div className="flex flex-col md:flex-row gap-6 items-end">
                    <div className="flex-1 w-full space-y-3">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Valor da Instalação Linear (R$ por metro)</label>
                        <Input
                            type="number"
                            value={rate}
                            onChange={(e) => setRate(Number(e.target.value))}
                            disabled={!canEdit}
                            placeholder="Ex: 60.00"
                            className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-black text-emerald-600 text-lg shadow-inner focus:ring-emerald-500"
                        />
                    </div>
                    <Button onClick={handleSave} disabled={!canEdit} className="w-full md:w-auto bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest h-12 px-10 rounded-2xl shadow-xl shadow-emerald-500/10 transition-all hover:scale-[1.02] active:scale-[0.98]">
                        <Save className="mr-3 h-4 w-4" /> Salvar Regra
                    </Button>
                </div>
                
                <div className="mt-10 p-8 bg-slate-50/50 rounded-3xl border border-dashed border-slate-100 space-y-4">
                    <h4 className="text-[10px] font-black uppercase text-slate-900 tracking-[0.2em] flex items-center gap-3">
                        <Info className="w-4 h-4 text-emerald-500" /> Funcionamento da Lógica Comercial
                    </h4>
                    <p className="text-sm text-slate-600 leading-relaxed font-medium">
                        A instalação é calculada de forma <span className="text-slate-900 font-black underline decoration-emerald-500/30">exclusivamente linear</span> sobre o comprimento total dos frontões informados no orçamento.
                    </p>
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 font-black text-xs text-slate-900 flex items-center justify-between shadow-sm">
                        <span className="text-slate-400 uppercase tracking-widest text-[9px]">Estrutura do Cálculo:</span>
                        <div className="flex items-center gap-2">
                             Comprimento (m) <X className="w-2.5 h-2.5 text-slate-300" /> R$ {rate}
                        </div>
                    </div>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.1em] opacity-60">
                        * Nota: Tampos, saias, acessórios e serviços diversos não integram esta base de cálculo linear.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
};

const MaterialManager: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
    const { materials, addMaterial, removeMaterial, updateMaterial, isLoading } = useMaterialCatalog();
    const [newName, setNewName] = React.useState('');
    const [newPrice, setNewPrice] = React.useState('');
    const [newPriceBuy, setNewPriceBuy] = React.useState('');
    const [newCategory, setNewCategory] = React.useState<'granite' | 'marble' | 'quartz' | 'other'>('granite');
    
    // Edit state
    const [editingId, setEditingId] = React.useState<string | null>(null);

    const [materialSearchText, setMaterialSearchText] = React.useState('');

    const filteredMaterials = React.useMemo(() => {
        let result = materials || [];

        // Search Filter
        if (materialSearchText.trim()) {
            const term = normalizeSearchText(materialSearchText);
            result = result.filter(m => {
                const searchStr = `${m.name} ${m.type} ${(m as any).category || ''} ${(m as any).color || ''} ${m.price || ''} ${(m as any).aliases?.join(' ') || ''}`;
                return normalizeSearchText(searchStr).includes(term);
            });
        }

        // Visual Deduplication by normalized name and price
        const unique = new Map();
        for (const m of result) {
            const key = `${normalizeSearchText(m.name)}_${m.price}`;
            if (!unique.has(key)) {
                unique.set(key, m);
            }
        }
        return Array.from(unique.values());
    }, [materials, materialSearchText]);

    const handleEdit = (mat: any) => {
        setEditingId(mat.id);
        setNewName(mat.name || '');
        setNewPrice(mat.price?.toString() || '');
        setNewPriceBuy(mat.priceBuy?.toString() || '');
        setNewCategory(mat.type || 'granite');
        // Scroll to top of catalog section to show it's editing? Or just let user see it
        window.scrollTo({ top: 300, behavior: 'smooth' });
    };

    const handleCancel = () => {
        setEditingId(null);
        setNewName('');
        setNewPrice('');
        setNewPriceBuy('');
        setNewCategory('granite');
    };

    const handleSave = async () => {
        if (!newName || !newPrice) return;
        
        try {
            const normalizedNewName = normalizeText(newName);
            const isDuplicate = materials.some(m => normalizeText(m.name) === normalizedNewName && m.id !== editingId);
            
            if (isDuplicate) {
                alert("Este material já está cadastrado.");
                return;
            }

            if (editingId) {
                await updateMaterial(editingId, {
                    name: newName,
                    price: Number(newPrice),
                    type: newCategory
                });
            } else {
                await addMaterial({
                    name: newName,
                    price: Number(newPrice),
                    type: newCategory
                });
            }
            handleCancel();
        } catch (error) {
            console.error("Error saving stone:", error);
            alert("Erro ao salvar o material. Verifique seu login.");
        }
    };

    const handleRemove = async (id: string) => {
        if (window.confirm('Tem certeza que deseja excluir esta pedra/material?')) {
            try {
                await removeMaterial(id);
            } catch (error) {
                alert('Erro ao excluir material.');
            }
        }
    };

    return (
        <Card className="border-slate-100 shadow-sm overflow-hidden rounded-[2.5rem] max-w-5xl mx-auto">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
                <CardTitle className="flex items-center gap-3 text-slate-900 font-black uppercase text-xs tracking-[0.2em]">
                    <ImageIcon className="w-5 h-5 text-emerald-500" /> Catálogo de Pedras e Insumos
                </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-10">
                {/* Form Section */}
                <div className={cn(
                    "p-8 rounded-[2rem] border transition-all duration-500",
                    editingId 
                        ? "bg-violet-50/30 border-violet-200 ring-4 ring-violet-500/5 shadow-2xl shadow-violet-500/5" 
                        : "bg-slate-50/50 border-slate-100 shadow-inner"
                )}>
                    <div className="flex items-center justify-between mb-8">
                        <h3 className={cn(
                            "text-[10px] uppercase font-black tracking-[0.2em] flex items-center gap-3",
                            editingId ? "text-brand-rocha-primary" : "text-slate-400"
                        )}>
                            {editingId ? <><Pencil className="w-4 h-4" /> Gestão de Material Existente</> : <><Plus className="w-4 h-4" /> Registrar Nova Pedra</>}
                        </h3>
                        {editingId && (
                            <Badge variant="outline" className="bg-violet-100 border-violet-200 text-brand-rocha-primary text-[9px] font-black uppercase tracking-widest px-4 py-1">Modo Edição Ativo</Badge>
                        )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                        <div className="md:col-span-3 space-y-3">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Nomenclatura do Material</label>
                            <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                disabled={!canEdit}
                                placeholder="Ex: Granito Preto São Gabriel Escovado"
                                className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-black text-sm uppercase tracking-tight focus:ring-brand-rocha-primary"
                            />
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2 text-center block">Referência Técnica</label>
                            <select
                                value={newCategory}
                                onChange={(e) => setNewCategory(e.target.value as any)}
                                disabled={!canEdit}
                                className="flex h-12 w-full rounded-2xl border border-slate-100 bg-white px-6 py-1 text-xs font-black uppercase tracking-widest shadow-sm transition-colors focus:ring-2 focus:ring-brand-rocha-primary outline-none appearance-none cursor-pointer"
                            >
                                <option value="granite">Granito</option>
                                <option value="marble">Mármore</option>
                                <option value="quartz">Quartzo / Ind.</option>
                                <option value="other">Outro</option>
                            </select>
                        </div>
                    </div>
                    
                    <div className="flex flex-col md:flex-row gap-6 items-end">
                        <div className="flex-1 w-full space-y-3">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Preço de Venda (R$ por m²)</label>
                            <div className="relative">
                                <span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-slate-300 text-xs tracking-widest">R$</span>
                                <Input
                                    type="number"
                                    value={newPrice}
                                    onChange={(e) => setNewPrice(e.target.value)}
                                    disabled={!canEdit}
                                    placeholder="0.00"
                                    className="h-12 rounded-2xl bg-white border-slate-100 pl-14 pr-6 font-black text-emerald-600 text-lg shadow-inner focus:ring-emerald-500"
                                />
                            </div>
                        </div>
                        
                        <div className="flex gap-3 w-full md:w-auto">
                            {editingId && (
                                <Button 
                                    variant="ghost" 
                                    onClick={handleCancel}
                                    disabled={!canEdit}
                                    className="h-12 px-8 font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all"
                                >
                                    <X className="mr-3 h-4 w-4" /> Descartar
                                </Button>
                            )}
                            <Button 
                                onClick={handleSave} 
                                disabled={!newName || !newPrice || !canEdit}
                                className={cn(
                                    "h-12 px-10 font-black uppercase text-[10px] tracking-[0.2em] rounded-2xl shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex-1 md:flex-none",
                                    editingId 
                                        ? "bg-slate-900 border-none text-white shadow-slate-900/10" 
                                        : "bg-emerald-500 border-none text-white shadow-emerald-500/10"
                                )}
                            >
                                {editingId ? <><RefreshCcw className="mr-3 h-4 w-4" /> Atualizar Registro</> : <><Plus className="mr-3 h-4 w-4" /> Ativar Material</>}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* List Section */}
                <div className="space-y-6">
                    <div className="flex flex-col gap-4 px-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">Acervo de Materiais</h3>
                        </div>
                        <ModuleSearchInput 
                            moduleName="Base de Materiais" 
                            placeholder="Buscar material, tipo, cor ou preço..." 
                            value={materialSearchText} 
                            onChange={setMaterialSearchText} 
                            resultCount={filteredMaterials.length}
                        />
                    </div>
                    
                    {isLoading ? (
                        <div className="py-20 flex flex-col items-center justify-center gap-4 opacity-40">
                             <RefreshCcw className="w-8 h-8 text-slate-400 animate-spin" />
                             <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Sincronizando Catálogo...</span>
                        </div>
                    ) : filteredMaterials.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {safeArray(filteredMaterials).map(mat => (
                                <div 
                                    key={mat.id} 
                                    className={cn(
                                        "group relative flex flex-col p-6 border rounded-[1.5rem] transition-all duration-500",
                                        editingId === mat.id 
                                            ? "bg-white border-brand-rocha-primary shadow-2xl ring-4 ring-violet-500/5 translate-y-[-4px]" 
                                            : "bg-white border-slate-50 shadow-sm hover:border-slate-200 hover:shadow-xl hover:shadow-slate-200/50 hover:translate-y-[-4px]"
                                    )}
                                >
                                    <div className="flex justify-between items-start mb-6">
                                        <Badge variant="outline" className={cn(
                                            "text-[9px] uppercase font-black px-3 py-1 rounded-lg tracking-widest border-transparent",
                                            mat.type === 'granite' ? 'bg-slate-100 text-slate-500' : 
                                            mat.type === 'marble' ? 'bg-amber-50 text-amber-600' : 
                                            mat.type === 'quartz' ? 'bg-blue-50 text-blue-600' : 
                                            'bg-slate-50 text-slate-400'
                                        )}>
                                            {mat.type === 'granite' ? 'Granito' : mat.type === 'marble' ? 'Mármore' : mat.type === 'quartz' ? 'Quartzo' : 'Outro'}
                                        </Badge>
                                        <div className="flex gap-1">
                                            <Button variant="ghost" size="sm" onClick={() => handleEdit(mat)} disabled={!canEdit} className="h-9 w-9 p-0 text-slate-300 hover:text-brand-rocha-primary hover:bg-violet-50 rounded-xl transition-all">
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => handleRemove(mat.id)} disabled={!canEdit} className="h-9 w-9 p-0 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    <h4 className="font-black text-slate-900 text-sm uppercase tracking-tight mb-2 truncate leading-none">{mat.name}</h4>
                                    
                                    <div className="mt-auto pt-6 border-t border-slate-50 flex items-baseline justify-between">
                                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Valor de Venda (m²)</span>
                                        <span className="text-lg font-black text-emerald-600 tracking-tight tabular-nums">
                                            {mat.price?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </span>
                                    </div>
                                    
                                    {editingId === mat.id && (
                                        <div className="absolute top-0 right-10 -translate-y-1/2">
                                            <Badge className="bg-brand-rocha-primary text-white text-[8px] font-black border-none shadow-lg px-2 rounded-md uppercase tracking-widest animate-bounce">Aberto p/ Edição</Badge>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-20 flex flex-col items-center justify-center gap-4 opacity-50 text-center border-2 border-dashed border-slate-100 rounded-[2.5rem]">
                            {materialSearchText ? (
                                <>
                                    <Search className="w-8 h-8 text-slate-400" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Nenhum material encontrado para essa busca.</span>
                                </>
                            ) : (
                                <>
                                    <ImageIcon className="h-12 w-12 text-slate-300 mx-auto mb-2" />
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Nenhum material registrado no acervo.</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

const ServiceManager: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
    const { services, addService, removeService, updateService, isLoading } = useServiceCatalog();
    const [newName, setNewName] = React.useState('');
    const [newPrice, setNewPrice] = React.useState('');
    
    // Edit state
    const [editingId, setEditingId] = React.useState<string | null>(null);

    const handleEdit = (srv: any) => {
        setEditingId(srv.id);
        setNewName(srv.name || '');
        setNewPrice(srv.price?.toString() || '');
    };

    const handleCancel = () => {
        setEditingId(null);
        setNewName('');
        setNewPrice('');
    };

    const handleSave = async () => {
        if (!newName || !newPrice) return;
        try {
            if (editingId) {
                await updateService(editingId, {
                    name: newName,
                    price: Number(newPrice)
                });
            } else {
                await addService({
                    name: newName,
                    price: Number(newPrice)
                });
            }
            handleCancel();
        } catch (error) {
            console.error("Error saving service:", error);
            alert('Erro ao salvar serviço.');
        }
    };

    const handleRemove = async (id: string) => {
        if (window.confirm('Tem certeza que deseja excluir este serviço?')) {
            try {
                await removeService(id);
            } catch (error) {
                alert('Erro ao excluir serviço.');
            }
        }
    };

    return (
        <Card className="border-slate-100 shadow-sm overflow-hidden rounded-[2.5rem] mt-10 max-w-5xl mx-auto">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
                <CardTitle className="text-slate-900 font-black uppercase text-xs tracking-[0.2em] flex items-center gap-3">
                    <FileText className="w-5 h-5 text-emerald-500" /> Serviços e Mão de Obra Especializada
                </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-10">
                <div className={cn(
                    "p-8 rounded-[2rem] border transition-all duration-500",
                    editingId 
                        ? "bg-violet-50/30 border-violet-200 ring-4 ring-violet-500/5 shadow-2xl shadow-violet-500/5" 
                        : "bg-slate-50/50 border-slate-100 shadow-inner"
                )}>
                    <div className="flex flex-col md:flex-row gap-6 items-end">
                        <div className="flex-1 space-y-3 w-full">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Descrição do Serviço / Acabamento</label>
                            <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                disabled={!canEdit}
                                placeholder="Ex: Acabamento em 45 Graus Premium"
                                className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-black text-sm uppercase tracking-tight focus:ring-brand-rocha-primary"
                            />
                        </div>
                        <div className="w-full md:w-48 space-y-3">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2 text-center block">Custo Unitário</label>
                            <div className="relative">
                                <span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-slate-300 text-xs tracking-widest">R$</span>
                                <Input
                                    type="number"
                                    value={newPrice}
                                    onChange={(e) => setNewPrice(e.target.value)}
                                    disabled={!canEdit}
                                    placeholder="0,00"
                                    className="h-12 rounded-2xl bg-white border-slate-100 pl-14 pr-6 font-black text-emerald-600 text-lg shadow-inner focus:ring-emerald-500"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 w-full md:w-auto">
                            {editingId && (
                                <Button variant="ghost" onClick={handleCancel} disabled={!canEdit} className="h-12 px-8 font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all">
                                    <X className="mr-3 h-4 w-4" /> Cancelar
                                </Button>
                            )}
                            <Button 
                                onClick={handleSave} 
                                disabled={!newName || !newPrice || !canEdit} 
                                className={cn(
                                    "h-12 px-10 font-black uppercase text-[10px] tracking-[0.2em] rounded-2xl shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex-1 md:flex-none",
                                    editingId ? "bg-slate-900 text-white" : "bg-emerald-500 text-white"
                                )}
                            >
                                {editingId ? <><RefreshCcw className="mr-3 h-4 w-4" /> Atualizar</> : <><Plus className="mr-3 h-4 w-4" /> Adicionar</>}
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="flex items-center justify-between px-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Serviços Cadastrados no Catálogo</h3>
                    </div>

                    {isLoading ? (
                        <div className="py-12 flex justify-center italic text-slate-400 text-sm">Carregando serviços...</div>
                    ) : services.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {safeArray(services).map(srv => (
                                <div 
                                    key={srv.id} 
                                    className={cn(
                                        "group flex justify-between items-center p-6 border rounded-[1.5rem] transition-all duration-500 bg-white",
                                        editingId === srv.id 
                                            ? "border-brand-rocha-primary shadow-2xl ring-4 ring-violet-500/5 translate-y-[-4px]" 
                                            : "border-slate-50 shadow-sm hover:border-slate-200 hover:shadow-xl hover:shadow-slate-200/50 hover:translate-y-[-4px]"
                                    )}
                                >
                                    <div className="flex flex-col min-w-0 pr-4">
                                        <span className="font-black text-slate-900 text-sm truncate uppercase tracking-tight mb-1">{srv.name}</span>
                                        <span className="text-lg font-black text-emerald-600 tracking-tight tabular-nums">
                                            {srv.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </span>
                                    </div>
                                    <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="sm" onClick={() => handleEdit(srv)} className="h-9 w-9 p-0 text-slate-300 hover:text-brand-rocha-primary hover:bg-violet-50 rounded-xl transition-all">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleRemove(srv.id)} className="h-9 w-9 p-0 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-20 text-center border-2 border-dashed border-slate-100 rounded-[2.5rem]">
                             <FileText className="h-12 w-12 text-slate-100 mx-auto mb-4" />
                             <p className="text-[10px] font-black uppercase text-slate-300 tracking-[0.2em]">Nenhum serviço registrado no momento.</p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

const SinkManager: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
    const { sinks, addSink, removeSink, updateSink, isLoading } = useSinkCatalog();
    const [newName, setNewName] = React.useState('');
    const [newPrice, setNewPrice] = React.useState('');
    
    // Edit state
    const [editingId, setEditingId] = React.useState<string | null>(null);

    const [sinkSearchText, setSinkSearchText] = React.useState('');

    const filteredSinks = React.useMemo(() => {
        let result = sinks || [];
        if (sinkSearchText.trim()) {
            const term = normalizeSearchText(sinkSearchText);
            result = result.filter(s => {
                const searchStr = `${s.name} ${s.price || ''} ${(s as any).aliases?.join(' ') || ''}`;
                return normalizeSearchText(searchStr).includes(term);
            });
        }
        
        // Visual Deduplication
        const unique = new Map();
        for (const s of result) {
            const key = `${normalizeSearchText(s.name)}_${s.price}`;
            if (!unique.has(key)) {
                unique.set(key, s);
            }
        }
        return Array.from(unique.values());
    }, [sinks, sinkSearchText]);

    const handleEdit = (sink: any) => {
        setEditingId(sink.id);
        setNewName(sink.name || '');
        setNewPrice(sink.price?.toString() || '');
    };

    const handleCancel = () => {
        setEditingId(null);
        setNewName('');
        setNewPrice('');
    };

    const handleSave = async () => {
        if (!newName || !newPrice) return;
        try {
            const normalizedNewName = normalizeSearchText(newName);
            const isDuplicate = sinks.some(s => normalizeSearchText(s.name) === normalizedNewName && s.price === Number(newPrice) && s.id !== editingId);
            if (isDuplicate) {
                alert("Este item já está cadastrado.");
                return;
            }

            if (editingId) {
                await updateSink(editingId, {
                    name: newName,
                    price: Number(newPrice)
                });
            } else {
                await addSink({
                    name: newName,
                    price: Number(newPrice)
                });
            }
            handleCancel();
        } catch (error) {
            console.error("Error saving sink:", error);
            alert('Erro ao salvar cuba.');
        }
    };

    const handleRemove = async (id: string) => {
        if (window.confirm('Tem certeza que deseja excluir esta cuba?')) {
            try {
                await removeSink(id);
            } catch (error) {
                alert('Erro ao excluir cuba.');
            }
        }
    };

    return (
        <Card className="border-slate-100 shadow-sm overflow-hidden rounded-[2.5rem] max-w-5xl mx-auto">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
                <CardTitle className="text-slate-900 font-black uppercase text-xs tracking-[0.2em] flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-emerald-500" /> Catálogo de Cubas e Cubas de Apoio
                </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-10">
                <div className={cn(
                    "p-8 rounded-[2rem] border transition-all duration-500",
                    editingId 
                        ? "bg-violet-50/30 border-violet-200 ring-4 ring-violet-500/5 shadow-2xl shadow-violet-500/5" 
                        : "bg-slate-50/50 border-slate-100 shadow-inner"
                )}>
                    <div className="flex flex-col md:flex-row gap-6 items-end">
                        <div className="flex-1 space-y-3 w-full">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Identificação da Cuba (Marca/Modelo)</label>
                            <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                disabled={!canEdit}
                                placeholder="Ex: Cuba Inox Tramontina Prime 40x34"
                                className="h-12 rounded-2xl bg-white border-slate-100 px-6 font-black text-sm uppercase tracking-tight focus:ring-brand-rocha-primary"
                            />
                        </div>
                        <div className="w-full md:w-48 space-y-3">
                            <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2 text-center block">Preço Unitário</label>
                            <div className="relative">
                                <span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-slate-300 text-xs tracking-widest">R$</span>
                                <Input
                                    type="number"
                                    value={newPrice}
                                    onChange={(e) => setNewPrice(e.target.value)}
                                    disabled={!canEdit}
                                    placeholder="0,00"
                                    className="h-12 rounded-2xl bg-white border-slate-100 pl-14 pr-6 font-black text-emerald-600 text-lg shadow-inner focus:ring-emerald-500"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 w-full md:w-auto">
                            {editingId && (
                                <Button variant="ghost" onClick={handleCancel} disabled={!canEdit} className="h-12 px-8 font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all">
                                    <X className="mr-3 h-4 w-4" /> Cancelar
                                </Button>
                            )}
                            <Button 
                                onClick={handleSave} 
                                disabled={!newName || !newPrice || !canEdit} 
                                className={cn(
                                    "h-12 px-10 font-black uppercase text-[10px] tracking-[0.2em] rounded-2xl shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] flex-1 md:flex-none",
                                    editingId ? "bg-slate-900 text-white" : "bg-emerald-500 text-white"
                                )}
                            >
                                {editingId ? <><RefreshCcw className="mr-3 h-4 w-4" /> Salvar</> : <><Plus className="mr-3 h-4 w-4" /> Adicionar</>}
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="flex flex-col gap-4 px-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Estoque de Cubas Disponíveis</h3>
                                <Badge variant="outline" className="bg-slate-100 border-slate-100 text-slate-400 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                                    {filteredSinks.length} itens ativos
                                </Badge>
                            </div>
                        </div>
                        <ModuleSearchInput 
                            moduleName="Cubas e Acessórios" 
                            placeholder="Buscar cuba, tanque, lavatório, modelo ou preço..." 
                            value={sinkSearchText} 
                            onChange={setSinkSearchText} 
                            resultCount={filteredSinks.length}
                        />
                    </div>

                    {isLoading ? (
                        <div className="py-12 flex justify-center italic text-slate-400 text-sm">Carregando cubas...</div>
                    ) : filteredSinks.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {safeArray(filteredSinks).map(sink => (
                                <div 
                                    key={sink.id} 
                                    className={cn(
                                        "group flex justify-between items-center p-6 border rounded-[1.5rem] transition-all duration-500 bg-white",
                                        editingId === sink.id 
                                            ? "border-brand-rocha-primary shadow-2xl ring-4 ring-violet-500/5 translate-y-[-4px]" 
                                            : "border-slate-50 shadow-sm hover:border-slate-200 hover:shadow-xl hover:shadow-slate-200/50 hover:translate-y-[-4px]"
                                    )}
                                >
                                    <div className="flex flex-col min-w-0 pr-4">
                                        <span className="font-black text-slate-900 text-sm truncate uppercase tracking-tight mb-1">{sink.name}</span>
                                        <span className="text-lg font-black text-emerald-600 tracking-tight tabular-nums">
                                            {sink.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </span>
                                    </div>
                                    <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="sm" onClick={() => handleEdit(sink)} className="h-9 w-9 p-0 text-slate-300 hover:text-brand-rocha-primary hover:bg-violet-50 rounded-xl transition-all">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleRemove(sink.id)} className="h-9 w-9 p-0 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-20 flex flex-col items-center justify-center gap-4 opacity-50 text-center border-2 border-dashed border-slate-100 rounded-[2.5rem]">
                            {sinkSearchText ? (
                                <>
                                    <Search className="w-8 h-8 text-slate-400" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Nenhuma cuba ou acessório encontrado para essa busca.</span>
                                </>
                            ) : (
                                <>
                                    <Building2 className="h-12 w-12 text-slate-300 mx-auto mb-2" />
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Nenhuma cuba registrada no catálogo.</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

const AccessoryManager: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
    const { accessories, addAccessory, removeAccessory, updateAccessory, isLoading } = useAccessoryCatalog();
    const [newName, setNewName] = React.useState('');
    const [newPrice, setNewPrice] = React.useState('');
    
    // Edit state
    const [editingId, setEditingId] = React.useState<string | null>(null);

    const [accessorySearchText, setAccessorySearchText] = React.useState('');

    const filteredAccessories = React.useMemo(() => {
        let result = accessories || [];
        if (accessorySearchText.trim()) {
            const term = normalizeSearchText(accessorySearchText);
            result = result.filter(a => {
                const searchStr = `${a.name} ${a.price || ''} ${(a as any).aliases?.join(' ') || ''}`;
                return normalizeSearchText(searchStr).includes(term);
            });
        }
        
        const unique = new Map();
        for (const a of result) {
            const key = `${normalizeSearchText(a.name)}_${a.price}`;
            if (!unique.has(key)) {
                unique.set(key, a);
            }
        }
        return Array.from(unique.values());
    }, [accessories, accessorySearchText]);

    const handleEdit = (acc: any) => {
        setEditingId(acc.id);
        setNewName(acc.name || '');
        setNewPrice(acc.price?.toString() || '');
    };

    const handleCancel = () => {
        setEditingId(null);
        setNewName('');
        setNewPrice('');
    };

    const handleSave = async () => {
        if (!newName || !newPrice) return;
        try {
            const normalizedNewName = normalizeSearchText(newName);
            const isDuplicate = accessories.some(a => normalizeSearchText(a.name) === normalizedNewName && a.price === Number(newPrice) && a.id !== editingId);
            if (isDuplicate) {
                alert("Este item já está cadastrado.");
                return;
            }

            if (editingId) {
                await updateAccessory(editingId, {
                    name: newName,
                    price: Number(newPrice)
                });
            } else {
                await addAccessory({
                    name: newName,
                    price: Number(newPrice)
                });
            }
            handleCancel();
        } catch (error) {
            console.error("Error saving accessory:", error);
            alert('Erro ao salvar acessório.');
        }
    };

    const handleRemove = async (id: string) => {
        if (window.confirm('Tem certeza que deseja excluir este acessório?')) {
            try {
                await removeAccessory(id);
            } catch (error) {
                alert('Erro ao excluir acessório.');
            }
        }
    };

    return (
        <Card className="border-slate-200 shadow-sm overflow-hidden mt-6">
            <CardHeader className="bg-slate-50 border-b p-4">
                <CardTitle className="text-slate-800 text-base flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-brand-emerald" /> Extra: Acessórios (Rodas, Bases, etc)
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className={cn(
                    "flex flex-col md:flex-row gap-4 mb-6 items-end p-4 rounded-xl border transition-all",
                    editingId ? "bg-blue-50/50 border-blue-200" : "bg-slate-50/50 border-slate-100"
                )}>
                    <div className="flex-1 space-y-2 w-full">
                        <label className="text-xs font-bold uppercase text-slate-400">Descrição do Acessório</label>
                        <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            disabled={!canEdit}
                            placeholder="Ex: Rodamão 10cm"
                            className="bg-white"
                        />
                    </div>
                    <div className="w-full md:w-40 space-y-2">
                        <label className="text-xs font-bold uppercase text-slate-400">Preço (R$)</label>
                        <Input
                            type="number"
                            value={newPrice}
                            onChange={(e) => setNewPrice(e.target.value)}
                            disabled={!canEdit}
                            placeholder="0,00"
                            className="bg-white font-black text-brand-emerald"
                        />
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                        {editingId && (
                            <Button variant="ghost" onClick={handleCancel} disabled={!canEdit} className="h-10 px-4 font-bold border border-slate-200 hover:bg-slate-100 flex-1 md:flex-none">
                                <X className="mr-2 h-4 w-4" /> Cancelar
                            </Button>
                        )}
                        <Button 
                            onClick={handleSave} 
                            disabled={!newName || !newPrice || !canEdit} 
                            className={cn(
                                "text-white font-bold h-10 px-6 flex-1 md:flex-none",
                                editingId ? "bg-blue-600 hover:bg-blue-700" : "bg-brand-emerald hover:bg-emerald-600"
                            )}
                        >
                            {editingId ? <><RefreshCcw className="mr-2 h-4 w-4" /> Salvar</> : <><Plus className="mr-2 h-4 w-4" /> Adicionar</>}
                        </Button>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="flex flex-col gap-4">
                        <ModuleSearchInput 
                            moduleName="Acessórios Extras" 
                            placeholder="Buscar acessório..." 
                            value={accessorySearchText} 
                            onChange={setAccessorySearchText} 
                            resultCount={filteredAccessories.length}
                        />
                    </div>
                    {isLoading ? (
                        <div className="italic text-slate-500 py-4 flex justify-center">Carregando...</div>
                    ) : filteredAccessories.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {safeArray(filteredAccessories).map(acc => (
                                <div 
                                    key={acc.id} 
                                    className={cn(
                                        "flex justify-between items-center p-3 border rounded-lg group transition-all",
                                        editingId === acc.id ? "bg-blue-50 border-blue-200" : "bg-white dark:bg-slate-800 border-slate-100 shadow-sm hover:shadow-md"
                                    )}
                                >
                                    <div className="flex flex-col">
                                        <span className="font-bold text-slate-700 dark:text-slate-200 text-sm truncate">{acc.name}</span>
                                        <span className="text-xs font-black text-brand-emerald">R$ {acc.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="sm" onClick={() => handleEdit(acc)} className="h-8 w-8 p-0 text-slate-400 hover:text-blue-500">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleRemove(acc.id)} className="h-8 w-8 p-0 text-slate-400 hover:text-red-500">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-8 flex flex-col items-center justify-center gap-2 opacity-50 text-center">
                            {accessorySearchText ? (
                                <span className="text-xs font-bold text-slate-400">Nenhum acessório encontrado para essa busca.</span>
                            ) : (
                                <span className="text-xs font-bold text-slate-400 italic">Nenhum acessório cadastrado.</span>
                            )}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

interface ContractClauseManagerProps {
    template: string | ContractClause[];
    onUpdate: (val: string) => void;
    canEdit: boolean;
}

const TagLegend = () => {
    const [copiedTag, setCopiedTag] = React.useState<string | null>(null);

    const tagGroups = [
        {
            name: 'Cliente',
            tags: [
                { name: '{{CLIENTE_NOME}}', desc: 'Nome Completo' },
                { name: '{{CLIENTE_CPF}}', desc: 'CPF ou CNPJ' },
                { name: '{{CLIENTE_TELEFONE}}', desc: 'Telefone' },
                { name: '{{CLIENTE_ENDERECO}}', desc: 'Endereço Completo' },
            ]
        },
        {
            name: 'Empresa',
            tags: [
                { name: '{{EMPRESA_NOME}}', desc: 'Nome da Empresa' },
                { name: '{{EMPRESA_CNPJ}}', desc: 'CNPJ da Empresa' },
                { name: '{{EMPRESA_ENDERECO}}', desc: 'Endereço Comercial' },
                { name: '{{EMPRESA_TELEFONE}}', desc: 'WhatsApp Principal' },
            ]
        },
        {
            name: 'Contrato/Pedido',
            tags: [
                { name: '{{PROTOCOLO}}', desc: 'Nº do Pedido' },
                { name: '{{DATA_EMISSAO}}', desc: 'Data do Contrato' },
                { name: '{{VALOR_TOTAL}}', desc: 'Valor Total' },
                { name: '{{VALOR_ENTRADA}}', desc: 'Valor da Entrada' },
                { name: '{{VALOR_RESTANTE}}', desc: 'Saldo Devedor' },
                { name: '{{FORMA_PAGAMENTO}}', desc: 'Método Pagto.' },
                { name: '{{PRAZO}}', desc: 'Prazo de Entrega' },
            ]
        },
        {
            name: 'Itens/Materiais',
            tags: [
                { name: '{{ITENS_PEDIDO}}', desc: 'Lista de Itens' },
                { name: '{{MATERIAL}}', desc: 'Pedras Utilizadas' },
                { name: '{{AMBIENTES}}', desc: 'Ambientes' },
                { name: '{{MEDIDAS}}', desc: 'Resumo Medidas' },
            ]
        },
        {
            name: 'Condições',
            tags: [
                { name: '{{VALIDADE_ORCAMENTO_TEXTO}}', desc: 'Prazo Validade' },
                { name: '{{PARCELAMENTO_TEXTO}}', desc: 'Regra Parcelas' },
                { name: '{{TAXA_JUROS_TEXTO}}', desc: 'Regra Juros' },
                { name: '{{PIX_DESCONTO_TEXTO}}', desc: 'Regra Pix' },
                { name: '{{OBSERVACAO_PAGAMENTO_TEXTO}}', desc: 'Observação' },
            ]
        }
    ];

    const copyToClipboard = (tag: string) => {
        navigator.clipboard.writeText(tag);
        setCopiedTag(tag);
        setTimeout(() => setCopiedTag(null), 2000);
    };

    return (
        <div className="bg-slate-50/50 rounded-[2.5rem] p-8 border border-slate-100 shadow-inner mb-10">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                    <Info className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Tags de Automação Disponíveis</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-1">O sistema substitui automaticamente pelos dados reais do contrato</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {safeArray(tagGroups).map(group => (
                    <div key={group?.name} className="space-y-4">
                        <h5 className="text-[9px] font-black text-slate-900 uppercase tracking-widest border-l-2 border-emerald-500 pl-3">{group?.name}</h5>
                        <div className="space-y-2">
                            {safeArray(group?.tags).map(tag => (
                                <button
                                    key={tag?.name}
                                    onClick={() => copyToClipboard(tag?.name)}
                                    className="w-full flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all group"
                                >
                                    <div className="text-left">
                                        <p className="text-[10px] font-black text-slate-900 font-mono tracking-tighter">{tag?.name}</p>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase">{tag?.desc}</p>
                                    </div>
                                    {copiedTag === tag?.name ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                        <Copy className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-400 transition-colors" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};


const ContractClauseManager: React.FC<ContractClauseManagerProps> = ({ template, onUpdate, canEdit }) => {
    const defaultClauses: ContractClause[] = [
        { id: '1', title: 'DO OBJETO', content: 'O presente contrato tem por objeto a fabricação e instalação de peças de marmoraria...' },
        { id: '2', title: 'DO PREÇO E PAGAMENTO', content: 'O valor total do projeto é o definido no orçamento aprovado...' },
        { id: '4', title: 'DO PRAZO', content: 'O prazo de entrega é de 15 dias úteis após a medição final...' },
    ];

    const [clauses, setClauses] = React.useState<ContractClause[]>(() => {
        if (Array.isArray(template)) return normalizeClauses(template);
        if (typeof template === 'string') {
            try {
                // Tenta parsear se for JSON
                if (template.trim().startsWith('[') || template.trim().startsWith('{')) {
                    return normalizeClauses(JSON.parse(template));
                }
            } catch (e) {
                console.warn("[CLAUSE FIX] Failed to parse template as JSON, treating as legacy string");
            }
        }
        return normalizeClauses(template) || defaultClauses;
    });

    const addClause = () => {
        const newClause = { id: Date.now().toString(), title: 'NOVA CLÁUSULA', content: 'Texto da cláusula...' };
        const updated = [...safeArray(clauses), newClause];
        const normalized = normalizeClauses(updated);
        setClauses(normalized);
        onUpdate(JSON.stringify(normalized));
    };

    const removeClause = (id: string) => {
        const updated = safeArray(clauses).filter(c => c.id !== id);
        const normalized = normalizeClauses(updated);
        setClauses(normalized);
        onUpdate(JSON.stringify(normalized));
    };

    const updateClause = (id: string, field: 'title' | 'content', value: string) => {
        const updated = safeArray(clauses).map(c => c.id === id ? { ...c, [field]: value } : c);
        const normalized = normalizeClauses(updated);
        setClauses(normalized);
        onUpdate(JSON.stringify(normalized));
    };

    return (
        <div className="space-y-10 max-w-5xl mx-auto">
            <TagLegend />
            <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div>
                    <h2 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3">
                        <FileText className="w-5 h-5 text-brand-rocha-primary" /> Cláusulas Jurídicas (Contrato)
                    </h2>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-2">Personalize o corpo jurídico dos seus contratos automáticos</p>
                </div>
                <Button onClick={addClause} disabled={!canEdit} className="bg-brand-rocha-primary text-white hover:bg-slate-900 font-black uppercase text-[10px] tracking-widest h-12 px-8 rounded-2xl shadow-xl shadow-brand-rocha-primary/10 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50">
                    <Plus className="mr-3 h-4 w-4" /> Nova Cláusula
                </Button>
            </div>

            <div className="space-y-6">
                {safeArray(clauses).map((clause, idx) => (
                    <Card key={clause.id} className="border-slate-100 shadow-sm overflow-hidden rounded-[2.5rem] group transition-all hover:border-slate-200">
                        <div className="flex bg-slate-50/50 border-b border-slate-100 p-6 items-center justify-between">
                            <div className="flex-1 max-w-2xl">
                                <Input
                                    value={clause.title}
                                    onChange={(e) => updateClause(clause.id, 'title', e.target.value)}
                                    disabled={!canEdit}
                                    className="bg-white border-slate-100 font-black text-slate-900 uppercase tracking-widest text-[11px] h-11 px-6 rounded-xl focus:ring-brand-rocha-primary"
                                />
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] whitespace-nowrap">ID: CL-0{idx + 1}</span>
                                <Button variant="ghost" size="sm" onClick={() => removeClause(clause.id)} disabled={!canEdit} className="h-10 w-10 p-0 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all disabled:opacity-30">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <CardContent className="p-8">
                            <textarea
                                value={clause.content}
                                onChange={(e) => updateClause(clause.id, 'content', e.target.value)}
                                disabled={!canEdit}
                                className="w-full min-h-[160px] bg-slate-50/30 p-6 rounded-2xl border border-slate-100 focus:ring-2 focus:ring-brand-rocha-primary outline-none transition-all text-sm text-slate-600 font-medium leading-relaxed resize-none shadow-inner disabled:bg-slate-100"
                                placeholder="..."
                            />
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
};

const GovernanceHistory: React.FC<{ companyId?: string }> = ({ companyId }) => {
    const [logs, setLogs] = React.useState<CompanyAuditLog[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        if (!companyId) return;

        const q = query(
            collection(db, 'company_audit_logs'),
            where('companyId', '==', companyId),
            orderBy('createdAt', 'desc'),
            limit(50)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const logsData = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as CompanyAuditLog));
            setLogs(logsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [companyId]);

    if (loading) {
        return <div className="py-20 flex justify-center italic text-slate-400">Sincronizando trilha de auditoria...</div>;
    }

    return (
        <div className="max-w-5xl mx-auto space-y-10">
            <Card className="border-slate-100 shadow-sm overflow-hidden rounded-[2.5rem]">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
                    <CardTitle className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3">
                        <Clock className="w-5 h-5 text-brand-rocha-primary" /> Histórico de Governança
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="divide-y divide-slate-50">
                        {safeArray(logs).length > 0 ? safeArray(logs).map((log) => (
                            <div key={log.id} className="p-8 hover:bg-slate-50/50 transition-colors">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-black text-xs">
                                            {log.userName.charAt(0)}
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">{log.userName}</h4>
                                            <p className="text-[9px] text-slate-400 font-bold uppercase">{log.userEmail}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            {format(new Date(log.createdAt), "dd 'de' MMMM, HH:mm", { locale: ptBR })}
                                        </p>
                                        <Badge variant="outline" className="mt-2 text-[8px] font-black uppercase tracking-tighter bg-white border-slate-200">IP: {log.source}</Badge>
                                    </div>
                                </div>
                                <div className="ml-14">
                                    <div className="flex flex-wrap gap-2">
                                        {safeArray(log?.changedFields).map(field => (
                                            <span key={field} className="text-[9px] font-black bg-brand-rocha-primary/5 text-brand-rocha-primary px-3 py-1 rounded-lg uppercase tracking-widest border border-brand-rocha-primary/10">
                                                {field}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="py-20 text-center italic text-slate-400 text-sm">Nenhuma alteração registrada até o momento.</div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

const IntelligenceSettingsManager: React.FC<{
    intelligence?: any;
    onUpdate: (updated: any) => void;
    onSave: () => void;
    isSaving: boolean;
    canEdit: boolean;
}> = ({ intelligence, onUpdate, onSave, isSaving, canEdit }) => {
    // Sync local state with intelligence prop but use defaults as fallback
    const values = React.useMemo(() => ({
        ...DEFAULT_INTELLIGENCE_THRESHOLDS,
        ...(intelligence || {})
    }), [intelligence]);

    const handleChange = (key: string, val: string) => {
        const num = Math.max(0, parseInt(val) || 0);
        onUpdate({ ...values, [key]: num });
    };

    const handleRestoreDefaults = () => {
        if (window.confirm('Deseja restaurar todos os limiares de inteligência para os padrões de fábrica?')) {
            onUpdate(DEFAULT_INTELLIGENCE_THRESHOLDS);
        }
    };

    const validate = () => {
        if (values.performanceDropPercent > 100) return 'O percentual de queda não pode exceder 100%.';
        if (values.potentialMinConversion > 100) return 'A conversão mínima não pode exceder 100%.';
        if (values.daysInactive <= values.daysAtRisk) return 'O período de inatividade deve ser maior que o período de risco.';
        return null;
    };

    const error = validate();

    return (
        <div className="max-w-5xl mx-auto space-y-10 pb-20">
            <Card className="border-slate-100 shadow-sm overflow-hidden rounded-[2.5rem] border-t-8 border-t-brand-rocha-primary bg-white">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3">
                                <Zap className="w-5 h-5 text-brand-rocha-primary" /> Parâmetros de Inteligência Comercial
                            </CardTitle>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Logaritmos de Conversão e Alertas de Performance (Rule #44)</p>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleRestoreDefaults}
                            className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-brand-rocha-primary hover:bg-violet-50 rounded-xl px-4"
                        >
                            <RefreshCcw className="w-3.5 h-3.5 mr-2" /> Restaurar Padrões
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-8 space-y-12">
                    {/* Retention & Activity */}
                    <div className="space-y-6">
                        <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3 border-l-4 border-emerald-500 pl-4">
                             Retenção e Fluxo de Atividade
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Monitoramento: Início de Risco</label>
                                <div className="relative">
                                    <Input 
                                        type="number" 
                                        value={values.daysAtRisk} 
                                        onChange={(e) => handleChange('daysAtRisk', e.target.value)}
                                        className="h-12 rounded-2xl bg-slate-50/50 border-slate-100 px-6 font-black text-slate-900 focus:ring-brand-rocha-primary shadow-inner"
                                    />
                                    <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-slate-300 text-[10px] uppercase tracking-widest">Dias</span>
                                </div>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight opacity-60">Alerta: Influencer sem indicações marcadas.</p>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Status: Inatividade Crítica</label>
                                <div className="relative">
                                    <Input 
                                        type="number" 
                                        value={values.daysInactive} 
                                        onChange={(e) => handleChange('daysInactive', e.target.value)}
                                        className="h-12 rounded-2xl bg-slate-50/50 border-slate-100 px-6 font-black text-rose-500 focus:ring-rose-500 shadow-inner"
                                    />
                                    <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-slate-300 text-[10px] uppercase tracking-widest">Dias</span>
                                </div>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight opacity-60">Ponto de corte para expurgar da base ativa.</p>
                            </div>
                        </div>
                    </div>

                    {/* Performance Monitoring */}
                    <div className="space-y-6">
                        <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3 border-l-4 border-violet-500 pl-4">
                            Detecção de Queda e Performance
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Gatilho de Queda (%)</label>
                                <div className="relative">
                                    <Input 
                                        type="number" 
                                        value={values.performanceDropPercent} 
                                        onChange={(e) => handleChange('performanceDropPercent', e.target.value)}
                                        className="h-12 rounded-2xl bg-slate-50/50 border-slate-100 px-6 font-black text-slate-900 focus:ring-brand-rocha-primary"
                                    />
                                    <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-slate-300">%</span>
                                </div>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight opacity-60 leading-relaxed">Percentual de queda na conversão para alerta BI.</p>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Base Gold (Min Leads)</label>
                                <Input 
                                    type="number" 
                                    value={values.highPerformanceMinLeads} 
                                    onChange={(e) => handleChange('highPerformanceMinLeads', e.target.value)}
                                    className="h-12 rounded-2xl bg-slate-50/50 border-slate-100 px-6 font-black text-slate-900 focus:ring-brand-rocha-primary"
                                />
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight opacity-60 leading-relaxed">Volume p/ considerar parceiro Alta Performance.</p>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Conversão Target (%)</label>
                                <div className="relative">
                                    <Input 
                                        type="number" 
                                        value={values.highPerformanceConversion} 
                                        onChange={(e) => handleChange('highPerformanceConversion', e.target.value)}
                                        className="h-12 rounded-2xl bg-emerald-50 border-emerald-100 px-6 font-black text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-emerald-200">%</span>
                                </div>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight opacity-60 leading-relaxed">Meta de taxa de fechamento para parceiros Master.</p>
                            </div>
                        </div>
                    </div>

                    {/* Potential & Scale */}
                    <div className="space-y-6">
                        <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3 border-l-4 border-amber-500 pl-4">
                            Predição de Escala / Novos Talentos
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Target Inicial (%)</label>
                                <div className="relative">
                                    <Input 
                                        type="number" 
                                        value={values.potentialMinConversion} 
                                        onChange={(e) => handleChange('potentialMinConversion', e.target.value)}
                                        className="h-12 rounded-2xl bg-slate-50/50 border-slate-100 px-6 font-black text-blue-600"
                                    />
                                    <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-slate-300">%</span>
                                </div>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight opacity-60 leading-relaxed">Sugere investimento se o parceiro converter 100% no início.</p>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Janela de Teste (Max Leads)</label>
                                <Input 
                                    type="number" 
                                    value={values.potentialMaxLeads} 
                                    onChange={(e) => handleChange('potentialMaxLeads', e.target.value)}
                                    className="h-12 rounded-2xl bg-slate-50/50 border-slate-100 px-6 font-black text-slate-900"
                                />
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight opacity-60 leading-relaxed">Limite de amostragem para o algoritmo de análise inicial.</p>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="p-6 bg-rose-50 border border-rose-100 rounded-[1.5rem] flex items-center gap-4 text-rose-600 animate-in slide-in-from-top-4 duration-500">
                            <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                                <Info className="h-5 w-5" />
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-[0.1em]">{error}</p>
                        </div>
                    )}

                    <div className="pt-10 border-t border-slate-100 flex justify-end">
                        <Button 
                            disabled={isSaving || !!error || !canEdit} 
                            onClick={onSave}
                            className="bg-slate-900 hover:bg-black text-white font-black uppercase text-[10px] tracking-[0.2em] px-12 h-12 rounded-2xl shadow-2xl shadow-slate-900/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                        >
                            <Save className="mr-3 h-4 w-4" /> 
                            {isSaving ? 'Consolidando...' : 'Salvar Regras BI'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default SettingsPage;