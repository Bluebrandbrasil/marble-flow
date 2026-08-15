import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Loader2, AlertCircle, CheckCircle, FileSignature } from 'lucide-react';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';

const formatCentsToBRL = (cents: number): string => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(cents / 100);
};

export const PlannedDigitalSignature: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [linkData, setLinkData] = useState<any>(null);
    const [contractData, setContractData] = useState<any>(null);
    
    // Form state
    const [name, setName] = useState('');
    const [documentId, setDocumentId] = useState('');
    const [accepted, setAccepted] = useState(false);
    const [signing, setSigning] = useState(false);
    const sigCanvas = useRef<SignatureCanvas>(null);

    useEffect(() => {
        const fetchLink = async () => {
            if (!token) {
                setError('Token inválido.');
                setLoading(false);
                return;
            }

            try {
                const linkRef = doc(db, 'planned_public_contract_links', token);
                const linkSnap = await getDoc(linkRef);

                if (!linkSnap.exists()) {
                    setError('Link de assinatura não encontrado.');
                    setLoading(false);
                    return;
                }

                const data = linkSnap.data();
                
                if (data.status === 'revoked') {
                    setError('Este link foi revogado. Solicite um novo link.');
                    setLoading(false);
                    return;
                }

                if (data.status === 'used') {
                    setError('Este contrato já foi assinado.');
                    setLoading(false);
                    return;
                }

                const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
                if (new Date() > expiresAt) {
                    setError('Este link de assinatura expirou. Solicite um novo link.');
                    setLoading(false);
                    return;
                }

                setLinkData(data);
                setContractData(data.contractSnapshot);
                
                // Pre-fill name and document if client data exists
                if (data.contractSnapshot?.client) {
                    setName(data.contractSnapshot.client.name || '');
                    setDocumentId(data.contractSnapshot.client.document || '');
                }
            } catch (err) {
                console.error('Error fetching link:', err);
                setError('Erro ao carregar o contrato.');
            } finally {
                setLoading(false);
            }
        };

        fetchLink();
    }, [token]);

    const handleClearSignature = () => {
        sigCanvas.current?.clear();
    };

    const handleSign = async () => {
        if (!name.trim() || !documentId.trim() || !accepted || sigCanvas.current?.isEmpty() || !token || !linkData) {
            alert('Preencha todos os campos e assine o documento.');
            return;
        }

        try {
            setSigning(true);
            const signatureDataUrl = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');
            const userAgent = window.navigator.userAgent;
            const now = new Date().toISOString();

            // 1. Upload signature image to storage (optional, but good for persistence outside DB size limits)
            const storage = getStorage();
            const signatureRef = ref(storage, `planned_signatures/${linkData.plannedProjectId}/${token}.png`);
            await uploadString(signatureRef, signatureDataUrl as string, 'data_url');
            const signatureImageUrl = await getDownloadURL(signatureRef);

            // 2. Update the public link document
            const linkRef = doc(db, 'planned_public_contract_links', token);
            await updateDoc(linkRef, {
                status: 'used',
                usedAt: now,
                signedByName: name,
                signedByDocument: documentId,
                signatureImage: signatureImageUrl,
                signedUserAgent: userAgent
            });

            // 3. Update the planned project document
            // We can do this from the frontend because the firestore rule allows it if token matches
            const projectRef = doc(db, 'planned_projects', linkData.plannedProjectId);
            await updateDoc(projectRef, {
                signatureStatus: 'signed',
                signedAt: now,
                signedByName: name,
                signedByDocument: documentId,
                signatureImageUrl: signatureImageUrl,
                signatureDataUrl: signatureDataUrl, // backup
                signedUserAgent: userAgent,
                contractSignedSnapshot: contractData
            });

            setLinkData((prev: any) => ({ ...prev, status: 'used' }));
            setError('Este contrato já foi assinado.'); // Redirect to success view
            
        } catch (err) {
            console.error('Error signing contract:', err);
            alert('Erro ao salvar assinatura. Tente novamente.');
        } finally {
            setSigning(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-12 w-12 text-brand-rocha-primary animate-spin" />
                    <p className="text-slate-500 font-medium">Carregando contrato...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        {error.includes('assinado') ? <CheckCircle className="h-8 w-8 text-emerald-500" /> : <AlertCircle className="h-8 w-8" />}
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 mb-2">
                        {error.includes('assinado') ? 'Contrato Assinado' : 'Aviso'}
                    </h2>
                    <p className="text-slate-600 mb-6">{error}</p>
                </div>
            </div>
        );
    }

    if (!contractData) return null;

    const { project, client, modules, companyContractSettings } = contractData;
    const c = companyContractSettings;

    return (
        <div className="min-h-screen bg-slate-100 py-8 px-4 font-sans print:bg-white print:p-0 print:py-0">
            <div className="max-w-[800px] mx-auto space-y-6">
                
                {/* Visual Contract Rendering (Similar to Print view) */}
                <div className="bg-white shadow-xl rounded-2xl overflow-hidden print:shadow-none print:rounded-none">
                    <div className="p-8">
                        {/* Header */}
                        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-6">
                            <div className="w-48">
                                {c?.logoUrl ? (
                                    <img src={c.logoUrl} alt="Logo" className="max-w-full h-auto object-contain" style={{ maxHeight: '80px' }} />
                                ) : (
                                    <div className="h-16 w-full bg-slate-100 rounded flex items-center justify-center">
                                        <span className="text-slate-400 font-bold text-sm">Sem Logo</span>
                                    </div>
                                )}
                            </div>
                            <div className="text-right">
                                <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2 uppercase">Contrato de Móveis Planejados</h1>
                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2">
                                    Projeto #{project.projectId}
                                </div>
                                <div className="text-xs text-slate-600 leading-relaxed">
                                    <p className="font-bold">{c?.companyName || 'Sua Empresa'}</p>
                                    <p>CNPJ: {c?.cnpj || 'Não informado'}</p>
                                    <p>{c?.address || 'Endereço não informado'}</p>
                                    <p>{c?.phone || 'Telefone não informado'} | {c?.email || 'Email não informado'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Contratante */}
                        <div className="mb-6">
                            <h4 className="text-[10px] font-black text-slate-900 bg-slate-100 uppercase tracking-[0.2em] px-3 py-1.5 rounded-md mb-3">CONTRATANTE</h4>
                            <div className="grid grid-cols-2 gap-4 text-xs">
                                <div><span className="text-slate-500 uppercase text-[9px] font-bold tracking-wider block mb-0.5">NOME / RAZÃO SOCIAL</span><strong className="text-slate-900 text-sm uppercase">{client?.name}</strong></div>
                                <div><span className="text-slate-500 uppercase text-[9px] font-bold tracking-wider block mb-0.5">CPF / CNPJ</span><strong className="text-slate-900 uppercase">{client?.document || '-'}</strong></div>
                                <div><span className="text-slate-500 uppercase text-[9px] font-bold tracking-wider block mb-0.5">E-MAIL</span><strong className="text-slate-900">{client?.email || '-'}</strong></div>
                                <div><span className="text-slate-500 uppercase text-[9px] font-bold tracking-wider block mb-0.5">TELEFONE</span><strong className="text-slate-900">{client?.phone || '-'}</strong></div>
                                <div className="col-span-2"><span className="text-slate-500 uppercase text-[9px] font-bold tracking-wider block mb-0.5">ENDEREÇO</span><strong className="text-slate-900 uppercase">{client?.address}, {client?.addressNumber} {client?.addressComplement ? `- ${client?.addressComplement}` : ''} - {client?.neighborhood} - {client?.city}/{client?.state} - CEP: {client?.zipCode}</strong></div>
                            </div>
                        </div>

                        {/* Módulos Contratados */}
                        <div className="mb-6">
                            <h4 className="text-[10px] font-black text-slate-900 bg-slate-100 uppercase tracking-[0.2em] px-3 py-1.5 rounded-md mb-3">Escopo do Projeto</h4>
                            <div className="space-y-4">
                                {modules?.map((mod: any, idx: number) => (
                                    <div key={idx} className="border border-slate-200 rounded-lg p-3">
                                        <div className="font-bold text-sm text-slate-900 mb-2 uppercase">{mod.environment} - {mod.name}</div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                            {mod.dimensions?.width && <div><span className="text-slate-500 block text-[9px]">LARGURA</span><strong>{mod.dimensions.width}m</strong></div>}
                                            {mod.dimensions?.height && <div><span className="text-slate-500 block text-[9px]">ALTURA</span><strong>{mod.dimensions.height}m</strong></div>}
                                            {mod.dimensions?.depth && <div><span className="text-slate-500 block text-[9px]">PROFUNDIDADE</span><strong>{mod.dimensions.depth}m</strong></div>}
                                            
                                            {mod.materials?.external && <div><span className="text-slate-500 block text-[9px]">CAIXARIA EXTERNA</span><strong>{mod.materials.external}</strong></div>}
                                            {mod.materials?.internal && <div><span className="text-slate-500 block text-[9px]">CAIXARIA INTERNA</span><strong>{mod.materials.internal}</strong></div>}
                                            {mod.materials?.doors && <div><span className="text-slate-500 block text-[9px]">PORTAS/FRENTES</span><strong>{mod.materials.doors}</strong></div>}
                                            {mod.materials?.handles && <div><span className="text-slate-500 block text-[9px]">PUXADORES</span><strong>{mod.materials.handles}</strong></div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Pagamento */}
                        <div className="mb-6">
                            <h4 className="text-[10px] font-black text-slate-900 bg-slate-100 uppercase tracking-[0.2em] px-3 py-1.5 rounded-md mb-3">Resumo Financeiro</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                <div>
                                    <span className="text-slate-500 uppercase text-[9px] font-bold tracking-wider block mb-0.5">Forma de Pagamento</span>
                                    <strong className="text-slate-900">{project.paymentMethod || '-'}</strong>
                                </div>
                                <div>
                                    <span className="text-slate-500 uppercase text-[9px] font-bold tracking-wider block mb-0.5">Condição</span>
                                    <strong className="text-slate-900">{project.paymentCondition || '-'}</strong>
                                </div>
                                <div>
                                    <span className="text-slate-500 uppercase text-[9px] font-bold tracking-wider block mb-0.5">Sinal</span>
                                    <strong className="text-slate-900">{formatCentsToBRL(project.downPayment || 0)}</strong>
                                </div>
                                <div>
                                    <span className="text-slate-500 uppercase text-[9px] font-bold tracking-wider block mb-0.5">Valor Total</span>
                                    <strong className="text-brand-rocha-primary text-lg">{formatCentsToBRL(project.saleValue || 0)}</strong>
                                </div>
                            </div>
                        </div>

                        {/* Cláusulas */}
                        <div className="mb-6">
                            <h4 className="text-[10px] font-black text-slate-900 bg-slate-100 uppercase tracking-[0.2em] px-3 py-1.5 rounded-md mb-4">Condições Gerais</h4>
                            {c?.clauses ? (
                                <div className="space-y-4 px-2">
                                    {Array.isArray(c.clauses) ? (
                                        c.clauses.map((clause: any, idx: number) => (
                                            <div key={clause.id || idx} className="text-[10px] text-slate-600 leading-relaxed text-justify">
                                                <strong className="uppercase">{clause.title}:</strong> <span className="whitespace-pre-wrap">{clause.content}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-[10px] text-slate-600 leading-relaxed whitespace-pre-wrap text-justify">
                                            {c.clauses}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-[10px] text-slate-600 leading-relaxed text-justify space-y-2">
                                    O contrato não possui cláusulas configuradas.
                                </div>
                            )}
                        </div>

                    </div>
                </div>

                {/* Área de Assinatura Interativa (Não visível na impressão) */}
                <div className="bg-white shadow-xl rounded-2xl p-8 print:hidden">
                    <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center">
                        <FileSignature className="h-5 w-5 mr-2 text-brand-rocha-primary" />
                        Assinatura Eletrônica
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Nome Completo</label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Digite seu nome completo"
                                className="h-12"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">CPF / CNPJ</label>
                            <Input
                                value={documentId}
                                onChange={(e) => setDocumentId(e.target.value)}
                                placeholder="Digite seu CPF ou CNPJ"
                                className="h-12"
                            />
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Assinatura</label>
                        <div className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 relative overflow-hidden">
                            <SignatureCanvas 
                                ref={sigCanvas}
                                canvasProps={{
                                    className: 'w-full h-48 cursor-crosshair'
                                }}
                                backgroundColor="rgb(248 250 252)" // slate-50
                            />
                            <button 
                                onClick={handleClearSignature}
                                className="absolute top-2 right-2 text-xs font-bold text-slate-500 hover:text-slate-900 bg-white px-2 py-1 rounded shadow-sm border border-slate-200"
                            >
                                Limpar
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">Assine com o mouse ou o dedo dentro da caixa acima.</p>
                    </div>

                    <div className="mb-8">
                        <label className="flex items-start gap-3 cursor-pointer p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                            <input 
                                type="checkbox" 
                                checked={accepted}
                                onChange={(e) => setAccepted(e.target.checked)}
                                className="mt-1 w-5 h-5 rounded border-slate-300 text-brand-rocha-primary focus:ring-brand-rocha-primary"
                            />
                            <span className="text-sm text-slate-700 leading-relaxed">
                                Declaro que li e estou de acordo com os módulos, medidas, cores, acabamentos, valores, forma de pagamento e cláusulas deste contrato.
                            </span>
                        </label>
                    </div>

                    <Button 
                        onClick={handleSign}
                        disabled={signing || !accepted || !name || !documentId}
                        className="w-full h-14 text-lg font-black"
                    >
                        {signing ? (
                            <>
                                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                Salvando Assinatura...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="h-5 w-5 mr-2" />
                                Assinar Contrato
                            </>
                        )}
                    </Button>
                </div>

            </div>
        </div>
    );
};
