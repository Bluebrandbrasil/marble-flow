import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Button } from '../../components/ui/Button';
import { Printer, ArrowLeft, Loader2, Phone, MapPin, Globe, Instagram, Mail, Calendar, User, FileText, CheckCircle2 } from 'lucide-react';
import type { PlannedProject, CompanyData } from '../../types';

export const PlannedProjectPrint: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { profile } = useAuth();

    const [project, setProject] = useState<PlannedProject | null>(null);
    const [company, setCompany] = useState<CompanyData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Get mode from URL query (?mode=client or ?mode=internal)
    const queryParams = new URLSearchParams(location.search);
    const requestedMode = queryParams.get('mode') || 'client';

    // Role-based security check for internal costs
    const isAdmin = ['superadmin', 'company_admin', 'admin'].includes(profile?.role || '');
    const mode = requestedMode === 'internal' && isAdmin ? 'internal' : 'client';

    useEffect(() => {
        if (!id) return;

        const fetchData = async () => {
            try {
                // 1. Fetch planned project
                const projectSnap = await getDoc(doc(db, 'planned_projects', id));
                if (projectSnap.exists()) {
                    const projectData = projectSnap.data() as PlannedProject;
                    setProject({ id: projectSnap.id, ...projectData } as PlannedProject);

                    // 2. Fetch company
                    if (projectData.companyId) {
                        const companySnap = await getDoc(doc(db, 'companies', projectData.companyId));
                        if (companySnap.exists()) {
                            setCompany({ id: companySnap.id, ...companySnap.data() } as CompanyData);
                        }
                    }
                } else {
                    alert('Projeto planejado não encontrado.');
                    navigate('/planejados');
                }
            } catch (err) {
                console.error('Error fetching print data:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [id, navigate]);

    const handlePrint = () => {
        window.print();
    };

    const formatCentsToBRL = (cents: number): string => {
        return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const formatDate = (dateValue: any): string => {
        if (!dateValue) return '';
        try {
            if (dateValue.seconds) {
                return new Date(dateValue.seconds * 1000).toLocaleDateString('pt-BR');
            }
            return new Date(dateValue).toLocaleDateString('pt-BR');
        } catch {
            return String(dateValue);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-rocha-primary" />
                    <span className="text-sm font-bold text-slate-400">Carregando layout de impressão...</span>
                </div>
            </div>
        );
    }

    if (!project) return null;

    const marginValue = project.saleValue > 0 ? (project.netResult / project.saleValue) * 100 : 0;

    return (
        <div className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:py-0 print:px-0">
            {/* Styles to force compact printing */}
            <style>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 8mm !important;
                    }
                    body {
                        margin: 0 !important;
                        background: white !important;
                        color: black !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .print-card {
                        border: none !important;
                        box-shadow: none !important;
                        background: transparent !important;
                        padding: 0 !important;
                    }
                    .print-divider {
                        border-color: #cbd5e1 !important;
                    }
                }
            `}</style>

            {/* Back & Print toolbar */}
            <div className="max-w-4xl mx-auto mb-6 flex justify-between items-center no-print">
                <Button 
                    variant="outline" 
                    onClick={() => navigate('/planejados')} 
                    className="bg-white rounded-xl h-10 px-4 font-bold text-slate-700 flex items-center gap-2 border-slate-200 hover:bg-slate-50 transition-all"
                >
                    <ArrowLeft className="h-4.5 w-4.5" />
                    Voltar
                </Button>
                <div className="flex items-center gap-2">
                    <div className="bg-slate-200 dark:bg-slate-800 text-xs font-bold px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        Modo: {mode === 'internal' ? 'Análise Interna' : 'Orçamento Cliente'}
                    </div>
                    <Button 
                        onClick={handlePrint}
                        className="bg-brand-rocha-primary text-white hover:bg-brand-rocha-primary/95 rounded-xl h-10 px-5 font-bold flex items-center gap-2 shadow-md shadow-brand-rocha-primary/10 transition-all active:scale-[0.98]"
                    >
                        <Printer className="h-4.5 w-4.5" />
                        Imprimir Projeto
                    </Button>
                </div>
            </div>

            {/* Print Document Body */}
            <div className="max-w-4xl mx-auto bg-white border border-slate-200 shadow-xl rounded-3xl p-8 print-card print:border-none print:shadow-none print:rounded-none">
                
                {/* 1. Header (Company Logo & Details) */}
                <div className="flex justify-between items-start pb-6 border-b border-slate-200 print-divider">
                    <div className="flex items-center gap-4">
                        {company?.logoUrl ? (
                            <img src={company.logoUrl} alt="Logo" className="w-16 h-16 object-contain rounded-xl print:w-14 print:h-14" />
                        ) : (
                            <div className="w-16 h-16 bg-brand-rocha-primary rounded-xl flex items-center justify-center text-white text-2xl font-black print:w-14 print:h-14">
                                M
                            </div>
                        )}
                        <div>
                            <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                                {company?.name || 'MARBLEFLOW'}
                            </h1>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Móveis Planejados</p>
                            {company?.document && (
                                <p className="text-[10px] text-slate-500 font-bold mt-1">CNPJ: {company.document}</p>
                            )}
                        </div>
                    </div>
                    
                    <div className="text-right text-xs text-slate-500 font-medium space-y-1">
                        {company?.phone && (
                            <p className="flex items-center justify-end gap-1.5">
                                <Phone className="h-3.5 w-3.5 text-slate-400" />
                                {company.phone}
                            </p>
                        )}
                        {company?.email && (
                            <p className="flex items-center justify-end gap-1.5">
                                <Mail className="h-3.5 w-3.5 text-slate-400" />
                                {company.email}
                            </p>
                        )}
                        {company?.address && (
                            <p className="flex items-center justify-end gap-1.5 max-w-[280px]">
                                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                {company.address}
                            </p>
                        )}
                    </div>
                </div>

                {/* 2. Customer & Project Meta info */}
                <div className="grid grid-cols-2 gap-6 py-6 border-b border-slate-200 print-divider">
                    <div>
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Dados do Cliente</h3>
                        <div className="text-xs space-y-1.5">
                            <p className="font-black text-sm text-slate-950 flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5 text-slate-400" />
                                {project.clientName}
                            </p>
                            <p className="text-slate-600 font-medium">Tel: {project.clientPhone}</p>
                            {project.clientEmail && <p className="text-slate-600 font-medium">E-mail: {project.clientEmail}</p>}
                            {project.clientAddress && <p className="text-slate-600 font-medium">End: {project.clientAddress}</p>}
                        </div>
                    </div>
                    
                    <div className="text-right">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Resumo do Orçamento</h3>
                        <div className="text-xs space-y-1.5 inline-block text-left">
                            <p className="font-black text-sm text-slate-950">
                                Protocolo: <span className="text-brand-rocha-primary">#{project.protocolNumber || 'S/P'}</span>
                            </p>
                            <p className="text-slate-600 font-medium flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 text-slate-400" />
                                Projeto: {project.projectName}
                            </p>
                            <p className="text-slate-600 font-medium flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                Data: {formatDate(project.createdAt)}
                            </p>
                            <p className="text-slate-600 font-medium">Vendedor: {project.sellerName}</p>
                        </div>
                    </div>
                </div>

                {/* 3. Environments & Modules details */}
                <div className="py-6 space-y-6">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Descrição do Projeto</h3>
                    
                    {project.environments && project.environments.length > 0 ? (
                        project.environments.map((env, envIdx) => {
                            const envTotalCents = typeof env.environmentTotal === 'number'
                                ? env.environmentTotal
                                : (env.modules || []).reduce((acc: number, mod: any) => acc + ((mod.unitCost || mod.cost || 0) * (mod.quantity || 1)), 0);

                            return (
                                <div key={env.id} className="space-y-2.5">
                                    <h4 className="text-sm font-black text-slate-900 flex items-center justify-between gap-2 border-b border-slate-100 pb-1">
                                        <div className="flex items-center gap-2">
                                            <span className="w-5 h-5 bg-slate-100 rounded-lg flex items-center justify-center text-xs text-slate-600 font-black">
                                                {envIdx + 1}
                                            </span>
                                            {env.name}
                                        </div>
                                        <span className="text-xs font-black text-slate-500 font-mono">
                                            Valor: R$ {(envTotalCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </h4>
                                    
                                    {env.notes && (
                                        <p className="text-xs text-slate-500 font-medium italic pl-7 mb-1">
                                            Obs: {env.notes}
                                        </p>
                                    )}

                                    <div className="pl-7 overflow-x-auto">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="border-b border-slate-200 pb-2 text-slate-400 font-bold bg-slate-50/50">
                                                    <th className="py-2 px-3">Módulo / Descrição</th>
                                                    <th className="py-2 px-3 text-center">Medidas (LxAxP cm)</th>
                                                    <th className="py-2 px-3">Composição</th>
                                                    <th className="py-2 px-3 text-center">Qtd</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {(env.modules || []).map((mod) => (
                                                    <tr key={mod.id} className="text-slate-700">
                                                        <td className="py-2.5 px-3 font-semibold text-slate-900 align-top">
                                                            {mod.productName}
                                                            {mod.notes && <span className="block text-[10px] text-slate-400 font-medium mt-0.5">{mod.notes}</span>}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-center font-medium align-top">
                                                            {mod.width} x {mod.height} x {mod.depth} cm
                                                        </td>
                                                        <td className="py-2.5 px-3 font-medium text-xs align-top space-y-0.5 text-slate-600">
                                                            {mod.color && <div><span className="font-bold text-slate-400">MDF:</span> {mod.color}</div>}
                                                            {mod.handle && <div><span className="font-bold text-slate-400">Puxador:</span> {mod.handle}</div>}
                                                            {mod.finish && <div><span className="font-bold text-slate-400">Acab:</span> {mod.finish}</div>}
                                                            {mod.mdfThickness && <div><span className="font-bold text-slate-400">MDF:</span> {mod.mdfThickness}</div>}
                                                            {!mod.color && !mod.handle && !mod.finish && !mod.mdfThickness && <span className="text-slate-400">-</span>}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-center font-black align-top">
                                                            {mod.quantity}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {(env.modules || []).length === 0 && (
                                                    <tr>
                                                        <td colSpan={4} className="py-4 text-center text-slate-400 italic">
                                                            Nenhum módulo cadastrado neste ambiente.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-center py-6 text-slate-400 italic">
                            Nenhum ambiente cadastrado neste projeto.
                        </div>
                    )}
                </div>

                {/* 4. Commercial Summary */}
                <div className="pt-6 border-t border-slate-200 print-divider grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Notes/Terms */}
                    <div className="space-y-4 text-xs text-slate-500 font-medium">
                        <div>
                            <h4 className="font-bold text-slate-700 uppercase tracking-wide mb-1">Notas Comerciais</h4>
                            <p className="leading-relaxed">
                                - O prazo de produção e instalação se inicia após medição final técnica aprovada.<br />
                                - Garantia estrutural dos módulos conforme termos do contrato oficial.<br />
                                - Orçamento válido por 10 dias.
                            </p>
                        </div>
                        {project.notes && (
                            <div>
                                <h4 className="font-bold text-slate-700 uppercase tracking-wide mb-1">Observações do Projeto</h4>
                                <p className="leading-relaxed whitespace-pre-line bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                    {project.notes}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Costing Summary */}
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 self-start">
                        {mode === 'internal' ? (
                            // Internal summary DRE
                            <div className="space-y-3 text-xs">
                                <h4 className="font-black text-slate-900 uppercase tracking-wider mb-2 border-b pb-2 flex items-center justify-between">
                                    <span>Análise Financeira Interna</span>
                                    <span className="text-[10px] bg-brand-rocha-primary/10 text-brand-rocha-primary px-2 py-0.5 rounded-md">DRE</span>
                                </h4>
                                <div className="flex justify-between font-bold text-slate-700">
                                    <span>Valor de Venda:</span>
                                    <span className="font-black text-sm text-slate-950 tabular-nums">{formatCentsToBRL(project.saleValue)}</span>
                                </div>
                                <div className="flex justify-between font-semibold text-slate-600">
                                    <span>Custo do Material:</span>
                                    <span className="tabular-nums">- {formatCentsToBRL(project.materialCost)}</span>
                                </div>
                                <div className="flex justify-between text-slate-500">
                                    <span>Frete Interno ({project.freightPercent}%):</span>
                                    <span className="tabular-nums">- {formatCentsToBRL(project.freightCost)}</span>
                                </div>
                                <div className="flex justify-between text-slate-500">
                                    <span>Montagem ({project.assemblyPercent}%):</span>
                                    <span className="tabular-nums">- {formatCentsToBRL(project.assemblyCost)}</span>
                                </div>
                                <div className="flex justify-between text-slate-500">
                                    <span>Taxa de Cartão ({project.machineFeePercent}%):</span>
                                    <span className="tabular-nums">- {formatCentsToBRL(project.machineFeeAmount)}</span>
                                </div>
                                <div className="border-t border-dashed pt-3 mt-1 flex justify-between items-center">
                                    <span className="text-sm font-black text-slate-950">Lucro Líquido Estimado:</span>
                                    <div className="text-right">
                                        <span className={`text-base font-black tabular-nums ${project.netResult >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {formatCentsToBRL(project.netResult)}
                                        </span>
                                        <div className="text-[10px] font-bold text-slate-500">
                                            Margem Líq: {marginValue.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // Client summary (hide details)
                            <div className="space-y-4">
                                <h4 className="font-black text-slate-900 uppercase tracking-wider mb-2 border-b pb-2">
                                    Condições Comerciais
                                </h4>
                                <div className="text-xs text-slate-500 space-y-1.5">
                                    <p className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                        Módulos produzidos em MDF com ferragens selecionadas.
                                    </p>
                                    <p className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                        Frete e instalação inclusos no valor total.
                                    </p>
                                </div>
                                <div className="border-t pt-4 mt-2 flex justify-between items-center">
                                    <span className="text-sm font-black text-slate-950">Valor Total do Projeto:</span>
                                    <span className="text-xl font-black text-emerald-600 tabular-nums">
                                        {formatCentsToBRL(project.saleValue)}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Signature placeholder */}
                <div className="mt-12 pt-8 border-t border-slate-200 print-divider flex justify-between text-center text-xs text-slate-400 font-medium">
                    <div className="w-48">
                        <div className="border-b border-slate-300 pb-16"></div>
                        <p className="mt-2">{company?.name || 'MARBLEFLOW'}</p>
                    </div>
                    <div className="w-48">
                        <div className="border-b border-slate-300 pb-16"></div>
                        <p className="mt-2">{project.clientName}</p>
                    </div>
                </div>

            </div>
        </div>
    );
};
