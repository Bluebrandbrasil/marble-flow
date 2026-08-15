import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Save, Loader2, Info, UploadCloud, ImageIcon, Plus, FileText, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePlannedSettings } from '../../hooks/usePlannedSettings';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import type { PlannedContractClause } from '../../types';
import SignatureCanvas from 'react-signature-canvas';
export const PlannedContractSettingsCard: React.FC = () => {
    const { profile } = useAuth();
    const { settings, updatePlannedSettings } = usePlannedSettings();
    const canEdit = ['superadmin', 'company_admin', 'admin'].includes(profile?.role || '');

    const [isSaving, setIsSaving] = useState(false);
    
    // Form fields
    const [companyName, setCompanyName] = useState('');
    const [cnpj, setCnpj] = useState('');
    const [address, setAddress] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [responsibleName, setResponsibleName] = useState('');
    const [clauses, setClauses] = useState<PlannedContractClause[]>([]);

    const [logoUrl, setLogoUrl] = useState('');
    const [signatureUrl, setSignatureUrl] = useState('');

    const logoInputRef = useRef<HTMLInputElement>(null);
    const signatureInputRef = useRef<HTMLInputElement>(null);

    const [logoUploading, setLogoUploading] = useState(false);
    const [signatureUploading, setSignatureUploading] = useState(false);

    useEffect(() => {
        if (settings?.contractSettings) {
            const c = settings.contractSettings;
            setCompanyName(c.companyName || '');
            setCnpj(c.cnpj || '');
            setAddress(c.address || '');
            setPhone(c.phone || '');
            setEmail(c.email || '');
            setResponsibleName(c.responsibleName || '');
            
            let parsedClauses: PlannedContractClause[] = [];
            if (typeof c.clauses === 'string') {
                parsedClauses = c.clauses ? [{ id: 'CL-01', title: 'CLÁUSULAS GERAIS', content: c.clauses }] : [];
            } else if (Array.isArray(c.clauses)) {
                parsedClauses = c.clauses;
            }
            setClauses(parsedClauses);
            
            setLogoUrl(c.logoUrl || '');
            setSignatureUrl(c.signatureUrl || '');
        }
    }, [settings]);

    const handleUpload = async (
        e: React.ChangeEvent<HTMLInputElement>,
        type: 'logo' | 'signature'
    ) => {
        const file = e.target.files?.[0];
        if (!file || !profile?.companyId) return;
        
        if (file.size > 10 * 1024 * 1024) {
            alert('A imagem deve ter no máximo 10MB.');
            return;
        }

        const setter = type === 'logo' ? setLogoUploading : setSignatureUploading;
        const urlSetter = type === 'logo' ? setLogoUrl : setSignatureUrl;
        
        setter(true);
        try {
            const fileName = `${Date.now()}_${file.name}`;
            const path = `companies/${profile.companyId}/planned/contract/${type}/${fileName}`;
            const storageRef = ref(storage, path);
            
            const uploadTask = uploadBytesResumable(storageRef, file);
            
            uploadTask.on('state_changed', 
                (snapshot) => {
                    // Could add progress here if needed
                },
                (error) => {
                    console.error("Upload error:", error);
                    alert(`Erro ao fazer upload da ${type === 'logo' ? 'logo' : 'assinatura'}.`);
                    setter(false);
                },
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    urlSetter(downloadURL);
                    setter(false);
                }
            );
        } catch (err) {
            console.error(err);
            setter(false);
        }
    };

    const sigPad = useRef<SignatureCanvas | null>(null);

    const clearSignatureCanvas = () => {
        if (!canEdit) return;
        sigPad.current?.clear();
        setSignatureUrl('');
    };

    const saveSignatureCanvas = () => {
        if (!canEdit) return;
        const signatureData = sigPad.current?.getTrimmedCanvas().toDataURL('image/png');
        if (signatureData) {
            setSignatureUrl(signatureData);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canEdit) return;

        setIsSaving(true);
        try {
            await updatePlannedSettings({
                contractSettings: {
                    ...(settings?.contractSettings || {}),
                    companyName,
                    cnpj,
                    address,
                    phone,
                    email,
                    responsibleName,
                    clauses,
                    logoUrl,
                    signatureUrl,
                    updatedAt: new Date().toISOString(),
                    updatedBy: profile?.uid,
                }
            });
            alert('Configurações de contrato salvas com sucesso!');
        } catch (err) {
            console.error('Error saving contract settings:', err);
            alert('Erro ao salvar configurações do contrato.');
        } finally {
            setIsSaving(false);
        }
    };

    const addClause = () => {
        const nextId = clauses.length + 1;
        setClauses([...clauses, { id: `CL-${String(nextId).padStart(2, '0')}`, title: `CLÁUSULA 0${nextId}`, content: '' }]);
    };

    const removeClause = (id: string) => {
        setClauses(clauses.filter(c => c.id !== id));
    };

    const updateClause = (id: string, field: 'title' | 'content', value: string) => {
        setClauses(clauses.map(c => c.id === id ? { ...c, [field]: value } : c));
    };

    return (
        <Card className="border-brand-rocha-border mt-6">
            <CardHeader>
                <CardTitle className="text-xl font-bold text-slate-900 dark:text-white">Contrato Planejados</CardTitle>
                <CardDescription>
                    Configure as informações que aparecerão exclusivamente no contrato do cliente para o módulo de Planejados. Estas configurações não afetam o contrato de mármore.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSave} className="space-y-8">
                    
                    {/* Imagens */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Logo */}
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                                Logo do Contrato
                            </label>
                            <div className="flex flex-col gap-3">
                                <div className={cn(
                                    "h-32 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden bg-slate-50 transition-all",
                                    logoUrl ? "border-brand-rocha-primary/30" : "border-slate-200"
                                )}>
                                    {logoUploading ? (
                                        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                                    ) : logoUrl ? (
                                        <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain p-2" />
                                    ) : (
                                        <ImageIcon className="h-8 w-8 text-slate-300" />
                                    )}
                                </div>
                                <input
                                    type="file"
                                    ref={logoInputRef}
                                    className="hidden"
                                    accept="image/jpeg,image/png,image/webp"
                                    onChange={(e) => handleUpload(e, 'logo')}
                                    disabled={!canEdit || logoUploading}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={!canEdit || logoUploading}
                                    onClick={() => logoInputRef.current?.click()}
                                    className="w-full border-slate-200"
                                >
                                    <UploadCloud className="h-4 w-4 mr-2" />
                                    {logoUrl ? 'Trocar Logo' : 'Enviar Logo'}
                                </Button>
                            </div>
                        </div>

                        {/* Signature */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                                    Assinatura da Empresa
                                </label>
                                <div className="flex gap-2">
                                    <Button type="button" variant="ghost" size="sm" onClick={clearSignatureCanvas} className="h-8 px-4 text-[9px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 rounded-xl">Limpar</Button>
                                </div>
                            </div>
                            
                            <div className="flex flex-col gap-3">
                                <div className="bg-slate-50/50 border border-slate-200 rounded-xl shadow-inner overflow-hidden flex items-center justify-center">
                                    <SignatureCanvas
                                        ref={sigPad}
                                        penColor='#003B8E'
                                        onEnd={saveSignatureCanvas}
                                        canvasProps={{ width: 330, height: 120, className: 'sigCanvas pointer-events-auto mx-auto' }}
                                    />
                                </div>
                                <div className="pt-2">
                                    <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2 block opacity-80">Prévia do Selo Digital:</label>
                                    <div className="h-28 w-full bg-white rounded-xl flex items-center justify-center border border-dashed border-slate-200 shadow-sm">
                                        {signatureUrl ? (
                                            <img src={signatureUrl} alt="Assinatura" className="max-h-full object-contain p-2" />
                                        ) : (
                                            <span className="text-[9px] italic text-slate-300 uppercase tracking-widest font-black">Traçar assinatura acima</span>
                                        )}
                                    </div>
                                </div>
                                
                                <p className="text-xs text-slate-500 mt-1">
                                    A assinatura do cliente é feita por link digital temporário, válido por 10 minutos, dentro do projeto do cliente.
                                </p>
                            </div>
                        </div>
                    </div>

                    <hr className="border-slate-100" />

                    {/* Dados da Empresa */}
                    <div>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">Dados da Empresa no Contrato</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-600">Razão Social / Nome</label>
                                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} disabled={!canEdit} placeholder="Ex: Marcenaria XYZ" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-600">CNPJ</label>
                                <Input value={cnpj} onChange={e => setCnpj(e.target.value)} disabled={!canEdit} placeholder="00.000.000/0001-00" />
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                                <label className="block text-xs font-bold text-slate-600">Endereço Completo</label>
                                <Input value={address} onChange={e => setAddress(e.target.value)} disabled={!canEdit} placeholder="Rua ABC, 123 - Centro..." />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-600">Telefone / WhatsApp</label>
                                <Input value={phone} onChange={e => setPhone(e.target.value)} disabled={!canEdit} placeholder="(00) 00000-0000" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-slate-600">E-mail</label>
                                <Input value={email} onChange={e => setEmail(e.target.value)} disabled={!canEdit} placeholder="contato@empresa.com" />
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                                <label className="block text-xs font-bold text-slate-600">Nome do Responsável Legal</label>
                                <Input value={responsibleName} onChange={e => setResponsibleName(e.target.value)} disabled={!canEdit} placeholder="João da Silva" />
                            </div>
                        </div>
                    </div>

                    <hr className="border-slate-100" />

                    {/* Cláusulas */}
                    <div>
                        <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm mb-6">
                            <div>
                                <h2 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-3">
                                    <FileText className="w-5 h-5 text-brand-rocha-primary" /> Cláusulas Jurídicas (Contrato)
                                </h2>
                                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-2">Personalize o corpo jurídico dos seus contratos de planejados</p>
                            </div>
                            <Button type="button" onClick={addClause} disabled={!canEdit} className="bg-brand-rocha-primary text-white hover:bg-slate-900 font-black uppercase text-[10px] tracking-widest h-12 px-8 rounded-2xl shadow-xl shadow-brand-rocha-primary/10 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50">
                                <Plus className="mr-3 h-4 w-4" /> Nova Cláusula
                            </Button>
                        </div>

                        <div className="space-y-6">
                            {clauses.map((clause, idx) => (
                                <Card key={clause.id} className="border-slate-100 shadow-sm overflow-hidden rounded-[2.5rem] group transition-all hover:border-slate-200">
                                    <div className="flex bg-slate-50/50 border-b border-slate-100 p-6 items-center justify-between">
                                        <div className="flex-1 max-w-2xl">
                                            <Input
                                                value={clause.title}
                                                onChange={(e) => updateClause(clause.id, 'title', e.target.value)}
                                                disabled={!canEdit}
                                                className="bg-white border-slate-100 font-black text-slate-900 uppercase tracking-widest text-[11px] h-11 px-6 rounded-xl focus:ring-brand-rocha-primary"
                                                placeholder="Título da cláusula"
                                            />
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] whitespace-nowrap">ID: CL-{String(idx + 1).padStart(2, '0')}</span>
                                            <Button type="button" variant="ghost" size="sm" onClick={() => removeClause(clause.id)} disabled={!canEdit} className="h-10 w-10 p-0 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all disabled:opacity-30">
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

                    {!canEdit && (
                        <div className="flex gap-2 p-3 bg-amber-50 rounded-xl text-amber-800 text-xs font-medium border border-amber-100">
                            <Info className="h-4 w-4 shrink-0" />
                            Apenas usuários administradores podem salvar ou alterar estas configurações comerciais.
                        </div>
                    )}

                    {canEdit && (
                        <div className="flex justify-end pt-2">
                            <Button
                                type="submit"
                                disabled={isSaving}
                                className="bg-brand-rocha-primary text-white hover:bg-brand-rocha-primary/90 flex items-center gap-2 h-11 px-6 rounded-xl font-bold shadow-md shadow-brand-rocha-primary/20 transition-all duration-300 active:scale-[0.98]"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        Salvando...
                                    </>
                                ) : (
                                    <>
                                        <Save className="h-5 w-5" />
                                        Salvar Contrato
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </form>
            </CardContent>
        </Card>
    );
};
