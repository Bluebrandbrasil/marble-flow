import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { usePlannedSettings } from '../../hooks/usePlannedSettings';
import type { PlannedProject } from '../../types';
import { Button } from '../../components/ui/Button';
import { Printer, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const PlannedContractPrint: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { profile } = useAuth();
    const { settings, loading: loadingSettings } = usePlannedSettings();
    const [project, setProject] = useState<PlannedProject | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProject = async () => {
            if (!id) return;
            try {
                const snap = await getDoc(doc(db, 'planned_projects', id));
                if (snap.exists()) {
                    setProject({ id: snap.id, ...snap.data() } as PlannedProject);
                }
            } catch (error) {
                console.error("Error fetching planned project:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchProject();
    }, [id]);

    const formatCurrency = (value: number) => {
        return (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading || loadingSettings) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <Loader2 className="h-8 w-8 animate-spin text-brand-rocha-primary" />
            </div>
        );
    }

    if (!project) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50 flex-col gap-4">
                <AlertCircle className="h-10 w-10 text-rose-500" />
                <h2 className="text-xl font-bold">Projeto não encontrado</h2>
                <Button onClick={() => navigate('/planejados')}>Voltar</Button>
            </div>
        );
    }

    const c = settings?.contractSettings;
    const hasCompanyData = c?.companyName || c?.cnpj;

    return (
        <div className="min-h-screen bg-slate-100 print:bg-white print:p-0">
            {/* Top Bar - Hidden on print */}
            <div className="print:hidden sticky top-0 z-50 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-2 rounded-xl">
                        <ArrowLeft className="h-4 w-4" />
                        Voltar
                    </Button>
                    <div>
                        <h1 className="text-lg font-black text-slate-900 tracking-tight">Contrato do Cliente</h1>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{project.projectName} - {project.clientName}</p>
                    </div>
                </div>
                <Button onClick={handlePrint} className="bg-brand-rocha-primary text-white hover:bg-brand-rocha-primary/90 gap-2 rounded-xl font-bold px-6">
                    <Printer className="h-4 w-4" />
                    Imprimir / Gerar PDF
                </Button>
            </div>

            {/* A4 Paper Container */}
            <div className="max-w-[210mm] mx-auto bg-white min-h-[297mm] shadow-lg print:shadow-none my-8 print:my-0">
                <div className="p-12 print:p-8 flex flex-col gap-8">
                    
                    {/* Header */}
                    <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6">
                        {c?.logoUrl ? (
                            <img src={c.logoUrl} alt="Logo da Empresa" className="max-h-24 max-w-[200px] object-contain" />
                        ) : (
                            <div className="h-16 flex items-center">
                                <span className="text-2xl font-black text-slate-900 tracking-tighter uppercase">{c?.companyName || profile?.companyName || 'EMPRESA'}</span>
                            </div>
                        )}
                        <div className="text-right">
                            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-1">Contrato de Compra e Venda</h2>
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Móveis Planejados</h3>
                            <div className="mt-4 text-xs font-medium text-slate-600 space-y-0.5">
                                <p>Protocolo: <span className="font-bold">{project.protocolNumber || 'N/A'}</span></p>
                                <p>Data: <span className="font-bold">{format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span></p>
                            </div>
                        </div>
                    </div>

                    {/* Contratada / Empresa */}
                    <div>
                        <h4 className="text-[10px] font-black text-slate-900 bg-slate-100 uppercase tracking-[0.2em] px-3 py-1.5 rounded-md mb-3">Contratada</h4>
                        {hasCompanyData ? (
                            <div className="grid grid-cols-2 gap-y-2 text-xs text-slate-700 px-2">
                                <div className="col-span-2"><strong>Razão Social:</strong> {c?.companyName}</div>
                                <div><strong>CNPJ:</strong> {c?.cnpj}</div>
                                <div><strong>Telefone:</strong> {c?.phone || 'Não informado'}</div>
                                <div className="col-span-2"><strong>Endereço:</strong> {c?.address || 'Não informado'}</div>
                                <div className="col-span-2"><strong>Responsável:</strong> {c?.responsibleName || 'Não informado'}</div>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-500 px-2">Dados da empresa não configurados.</p>
                        )}
                    </div>

                    {/* Contratante / Cliente */}
                    <div>
                        <h4 className="text-[10px] font-black text-slate-900 bg-slate-100 uppercase tracking-[0.2em] px-3 py-1.5 rounded-md mb-3">Contratante</h4>
                        <div className="grid grid-cols-2 gap-y-2 text-xs text-slate-700 px-2">
                            <div className="col-span-2"><strong>Nome:</strong> {project.clientName}</div>
                            <div><strong>Telefone:</strong> {project.clientPhone}</div>
                            <div><strong>E-mail:</strong> {project.clientEmail || 'Não informado'}</div>
                            <div className="col-span-2"><strong>Endereço da Obra:</strong> {project.clientAddress || 'Não informado'}</div>
                            <div className="col-span-2"><strong>Vendedor Responsável:</strong> {project.sellerName}</div>
                        </div>
                    </div>

                    {/* Módulos */}
                    <div>
                        <h4 className="text-[10px] font-black text-slate-900 bg-slate-100 uppercase tracking-[0.2em] px-3 py-1.5 rounded-md mb-4">Especificações do Projeto</h4>
                        
                        {(project.environments || []).length === 0 ? (
                            <p className="text-xs text-slate-500 px-2">Nenhum ambiente cadastrado.</p>
                        ) : (
                            <div className="space-y-6">
                                {(project.environments || []).map((env, idx) => {
                                    const envTotalCents = typeof env.environmentTotal === 'number'
                                        ? env.environmentTotal
                                        : (env.modules || []).reduce((acc: number, mod: any) => acc + ((mod.unitCost || mod.cost || 0) * (mod.quantity || 1)), 0);

                                    return (
                                        <div key={env.id || idx}>
                                            <h5 className="text-xs font-bold text-slate-800 uppercase border-b border-slate-200 pb-1 mb-2 flex justify-between">
                                                <span>Ambiente: {env.name}</span>
                                                <span className="font-mono text-[10px] text-slate-500 normal-case">Valor: R$ {(envTotalCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </h5>
                                            {env.notes && <p className="text-[10px] text-slate-500 italic mb-3">Obs: {env.notes}</p>}
                                            
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-[10px] text-left border-collapse">
                                                    <thead>
                                                        <tr className="bg-slate-50 text-slate-600">
                                                            <th className="py-2 px-2 font-bold uppercase tracking-wider border border-slate-200">Módulo</th>
                                                            <th className="py-2 px-2 font-bold uppercase tracking-wider border border-slate-200">Medidas (L x A x P)</th>
                                                            <th className="py-2 px-2 font-bold uppercase tracking-wider border border-slate-200">MDF / Cor</th>
                                                            <th className="py-2 px-2 font-bold uppercase tracking-wider border border-slate-200">Acab. / Puxador</th>
                                                            <th className="py-2 px-2 font-bold uppercase tracking-wider border border-slate-200">Qtd</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {(env.modules || []).map((mod, midx) => (
                                                            <tr key={mod.id || midx}>
                                                                <td className="py-1.5 px-2 border border-slate-200 font-medium">
                                                                    {mod.productName}
                                                                    {mod.notes && <div className="text-[8px] text-slate-400 mt-0.5">{mod.notes}</div>}
                                                                </td>
                                                                <td className="py-1.5 px-2 border border-slate-200 text-slate-600">
                                                                    {mod.width || 0}cm x {mod.height || 0}cm x {mod.depth || 0}cm
                                                                </td>
                                                                <td className="py-1.5 px-2 border border-slate-200 text-slate-600">
                                                                    {mod.color || 'Não inf.'} {mod.mdfThickness ? `(${mod.mdfThickness})` : ''}
                                                                </td>
                                                                <td className="py-1.5 px-2 border border-slate-200 text-slate-600">
                                                                    {mod.finish || 'Não inf.'} / {mod.handle || 'Não inf.'}
                                                                </td>
                                                                <td className="py-1.5 px-2 border border-slate-200 text-center font-bold">
                                                                    {mod.quantity || 1}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Resumo Comercial e Forma de Pagamento */}
                    <div className="grid grid-cols-2 gap-8">
                        <div>
                            <h4 className="text-[10px] font-black text-slate-900 bg-slate-100 uppercase tracking-[0.2em] px-3 py-1.5 rounded-md mb-3">Forma de Pagamento</h4>
                            <div className="space-y-2 text-xs px-2">
                                <div className="flex justify-between">
                                    <span className="font-bold text-slate-600">Método Principal:</span>
                                    <span>{project.paymentMethod ? project.paymentMethod.toUpperCase().replace('_', ' ') : 'A definir'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="font-bold text-slate-600">Nº Parcelas:</span>
                                    <span>{project.installments ? `${project.installments}x` : 'À vista'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="font-bold text-slate-600">Condição:</span>
                                    <span>{project.paymentCondition || 'Não informado'}</span>
                                </div>
                                {project.paymentNotes && (
                                    <div className="mt-2 text-[10px] text-slate-500 italic p-2 bg-slate-50 rounded">
                                        Obs: {project.paymentNotes}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <h4 className="text-[10px] font-black text-slate-900 bg-slate-100 uppercase tracking-[0.2em] px-3 py-1.5 rounded-md mb-3">Resumo de Valores</h4>
                            <div className="space-y-1.5 text-xs px-2">
                                <div className="flex justify-between">
                                    <span className="text-slate-600">Sinal / Entrada:</span>
                                    <span className="font-medium">{formatCurrency(project.downPayment || 0)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-600">Saldo Restante:</span>
                                    <span className="font-medium">{formatCurrency(project.remainingBalance || 0)}</span>
                                </div>
                                <div className="flex justify-between border-t border-slate-300 pt-1.5 mt-1.5">
                                    <span className="font-black text-slate-900 text-sm">VALOR TOTAL DO PROJETO:</span>
                                    <span className="font-black text-slate-900 text-sm">{formatCurrency(project.saleValue || 0)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Cláusulas */}
                    <div className="mt-4" style={{ pageBreakInside: 'auto' }}>
                        <h4 className="text-[10px] font-black text-slate-900 bg-slate-100 uppercase tracking-[0.2em] px-3 py-1.5 rounded-md mb-4">Condições Gerais</h4>
                        {c?.clauses ? (
                            <div className="space-y-4 px-2">
                                {Array.isArray(c.clauses) ? (
                                    c.clauses.map((clause: any, idx: number) => (
                                        <div key={clause.id || idx} className="text-[9px] text-slate-600 leading-relaxed text-justify">
                                            <strong className="uppercase">{clause.title}:</strong> <span className="whitespace-pre-wrap">{clause.content}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-[9px] text-slate-600 leading-relaxed whitespace-pre-wrap text-justify">
                                        {c.clauses}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-[9px] text-slate-600 leading-relaxed px-2 text-justify space-y-2">
                                <p><strong>1. DO OBJETO:</strong> O presente contrato tem por objeto a fabricação e montagem de móveis planejados conforme descrito nas especificações acima.</p>
                                <p><strong>2. DO PRAZO:</strong> O prazo de entrega é estimado e está condicionado à medição final no local da obra e assinatura do projeto executivo.</p>
                                <p><strong>3. DO PAGAMENTO:</strong> O atraso no pagamento de qualquer parcela acarretará multa e juros conforme legislação vigente.</p>
                                <p><strong>4. DA GARANTIA:</strong> A contratada oferece garantia contra defeitos de fabricação, não cobrindo mau uso, desgaste natural ou exposição à água em áreas inadequadas.</p>
                            </div>
                        )}
                    </div>

                    {/* Assinaturas */}
                    <div className="mt-16 pt-12 grid grid-cols-2 gap-12" style={{ pageBreakInside: 'avoid' }}>
                        <div className="flex flex-col items-center relative">
                            {c?.signatureUrl && (
                                <img src={c.signatureUrl} alt="Assinatura Empresa" className="absolute -top-10 h-16 object-contain opacity-80" />
                            )}
                            <div className="w-full border-t border-slate-400"></div>
                            <span className="text-[10px] font-bold text-slate-900 mt-2 text-center uppercase">{c?.companyName || profile?.companyName}</span>
                            <span className="text-[9px] text-slate-500 uppercase">Contratada</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="w-full border-t border-slate-400"></div>
                            <span className="text-[10px] font-bold text-slate-900 mt-2 text-center uppercase">{project.clientName}</span>
                            <span className="text-[9px] text-slate-500 uppercase">Contratante</span>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};
