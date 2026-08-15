import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { 
    collection, 
    onSnapshot, 
    query, 
    where, 
    updateDoc, 
    doc, 
    serverTimestamp 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { 
    Search, FileText, Printer, Edit2, Trash2, Loader2, Calendar, User, DollarSign, Activity, AlertTriangle, FileSignature
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PlannedProject } from '../../types';
import { PlannedSignatureManager } from './components/PlannedSignatureManager';

interface PlannedProjectsListTabProps {
    onEditProject: (projectId: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
    rascunho: 'Rascunho',
    enviado: 'Enviado',
    aprovado: 'Aprovado',
    em_producao: 'Em Produção',
    instalado: 'Instalado',
    cancelado: 'Cancelado'
};

const STATUS_COLORS: Record<string, string> = {
    rascunho: 'bg-slate-100 text-slate-600 border-slate-200',
    enviado: 'bg-blue-50 text-blue-600 border-blue-200',
    aprovado: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    em_producao: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    instalado: 'bg-purple-50 text-purple-600 border-purple-200',
    cancelado: 'bg-rose-50 text-rose-600 border-rose-200'
};

export const PlannedProjectsListTab: React.FC<PlannedProjectsListTabProps> = ({ onEditProject }) => {
    const { user, profile } = useAuth();
    const [projects, setProjects] = useState<PlannedProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const canDelete = ['superadmin', 'company_admin', 'admin'].includes(profile?.role || '');
    const canSeeInternalPrint = ['superadmin', 'company_admin', 'admin'].includes(profile?.role || '');

    useEffect(() => {
        if (!profile?.companyId) return;

        const q = query(
            collection(db, 'planned_projects'),
            where('companyId', '==', profile.companyId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: PlannedProject[] = [];
            snapshot.forEach((docSnap) => {
                const projectData = docSnap.data();
                // Exclude deleted projects
                if (projectData.deleted !== true && projectData.isDeleted !== true) {
                    data.push({ id: docSnap.id, ...projectData } as PlannedProject);
                }
            });

            // Sort by createdAt descending
            data.sort((a, b) => {
                const dateA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
                const dateB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
                return dateB - dateA;
            });

            setProjects(data);
            setLoading(false);
        }, (err) => {
            console.error('Error fetching planned projects:', err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [profile?.companyId]);

    const handleSoftDelete = async (project: PlannedProject) => {
        const confirmed = window.confirm(`Tem certeza que deseja excluir o projeto "${project.projectName}"? Essa exclusão é segura e o projeto será marcado como cancelado.`);
        if (!confirmed) return;

        try {
            const docRef = doc(db, 'planned_projects', project.id);
            await updateDoc(docRef, {
                deleted: true,
                isDeleted: true,
                deletedAt: serverTimestamp(),
                deletedBy: user?.uid || '',
                status: 'cancelado',
                updatedAt: serverTimestamp()
            });
            alert('Projeto excluído com sucesso.');
        } catch (err) {
            console.error('Error deleting project:', err);
            alert('Erro ao excluir projeto.');
        }
    };

    const formatCentsToBRL = (cents: number): string => {
        const value = cents / 100;
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

    // Filter and Search logic
    const filteredProjects = useMemo(() => {
        return projects.filter((proj) => {
            const matchesSearch = 
                proj.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                proj.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (proj.clientPhone || '').includes(searchTerm) ||
                (proj.protocolNumber || '').toLowerCase().includes(searchTerm.toLowerCase());

            const matchesStatus = statusFilter === 'all' || proj.status === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [projects, searchTerm, statusFilter]);

    // Financial KPI Summary
    const stats = useMemo(() => {
        let totalSold = 0;
        let totalMaterial = 0;
        let totalResult = 0;
        let activeCount = 0;

        filteredProjects.forEach(proj => {
            if (proj.status !== 'cancelado') {
                totalSold += proj.saleValue || 0;
                totalMaterial += proj.materialCost || 0;
                totalResult += proj.netResult || 0;
                activeCount++;
            }
        });

        const averageMargin = totalSold > 0 ? (totalResult / totalSold) * 100 : 0;

        return {
            totalSold,
            totalMaterial,
            totalResult,
            activeCount,
            averageMargin
        };
    }, [filteredProjects]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-brand-rocha-primary" />
                <span className="text-sm font-bold text-slate-400">Carregando projetos planejados...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Volume Vendido (Ativo)</div>
                        <div className="text-lg font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                            {formatCentsToBRL(stats.totalSold)}
                        </div>
                    </div>
                    <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center">
                        <DollarSign className="h-5 w-5" />
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Custo Total de Material</div>
                        <div className="text-lg font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                            {formatCentsToBRL(stats.totalMaterial)}
                        </div>
                    </div>
                    <div className="w-10 h-10 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center">
                        <DollarSign className="h-5 w-5" />
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Resultado Líquido</div>
                        <div className="text-lg font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                            {formatCentsToBRL(stats.totalResult)}
                        </div>
                    </div>
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/20 text-brand-rocha-primary rounded-xl flex items-center justify-center">
                        <Activity className="h-5 w-5" />
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Margem Média Líquida</div>
                        <div className="text-lg font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                            {stats.averageMargin.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                        </div>
                    </div>
                    <div className="w-10 h-10 bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center">
                        <Activity className="h-5 w-5" />
                    </div>
                </div>
            </div>

            {/* Filter and Search controls */}
            <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        type="text"
                        placeholder="Buscar por protocolo, cliente ou nome do projeto..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 h-11 rounded-xl border-slate-200"
                    />
                </div>
                <div className="w-full md:w-64">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-rocha-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                    >
                        <option value="all">Todos Status</option>
                        {Object.entries(STATUS_LABELS).map(([key, value]) => (
                            <option key={key} value={key}>{value}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Projects Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Protocolo / Data</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Cliente / Vendedor</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Projeto / Obs</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Comercial (R$)</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Resultado (R$)</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredProjects.length > 0 ? (
                                filteredProjects.map((proj) => {
                                    const rawMargin = proj.saleValue > 0 ? (proj.netResult / proj.saleValue) * 100 : 0;
                                    return (
                                        <tr key={proj.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-black text-slate-900 dark:text-white">
                                                    #{proj.protocolNumber || 'S/P'}
                                                </div>
                                                <div className="text-xs text-slate-400 font-medium flex items-center gap-1 mt-1">
                                                    <Calendar className="h-3.5 w-3.5" />
                                                    {formatDate(proj.createdAt)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                                    <User className="h-4 w-4 text-slate-400 shrink-0" />
                                                    {proj.clientName}
                                                </div>
                                                <div className="text-xs text-slate-400 font-bold mt-1">
                                                    Vend: {proj.sellerName}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-800 dark:text-slate-200">{proj.projectName}</div>
                                                {proj.notes && (
                                                    <div className="text-xs text-slate-400 mt-1 truncate max-w-[180px]">
                                                        {proj.notes}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-black text-emerald-600 dark:text-emerald-400">
                                                    Venda: {formatCentsToBRL(proj.saleValue)}
                                                </div>
                                                <div className="text-xs text-slate-400 font-medium mt-1">
                                                    Mat: {formatCentsToBRL(proj.materialCost)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-black text-slate-900 dark:text-white">
                                                    Líq: {formatCentsToBRL(proj.netResult)}
                                                </div>
                                                <div className="text-xs text-slate-400 font-black mt-1">
                                                    Margem: {rawMargin.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-2">
                                                    <span className={`inline-flex w-fit items-center text-xs font-black px-2.5 py-1 rounded-lg border uppercase tracking-wider ${STATUS_COLORS[proj.status] || STATUS_COLORS.rascunho}`}>
                                                        {STATUS_LABELS[proj.status] || proj.status}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <PlannedSignatureManager project={proj} />
                                                    
                                                    {/* Print Client */}
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => window.open(`/planejados/${proj.id}/imprimir?mode=client`, '_blank')}
                                                        className="h-9 px-2 rounded-lg font-bold border-slate-200 text-slate-600 hover:border-emerald-500 hover:text-emerald-600 transition-all"
                                                        title="Imprimir Cliente"
                                                    >
                                                        <Printer className="h-4 w-4 mr-1" />
                                                        Cliente
                                                    </Button>
                                                    
                                                    {/* Print Internal (Admins Only) */}
                                                    {canSeeInternalPrint && (
                                                        <div className="flex gap-1">
                                                            <Link to={`/planejados/${proj.id}/contrato`} target="_blank">
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-9 px-2 rounded-lg font-bold border-slate-200 text-slate-600 hover:border-brand-rocha-primary hover:text-brand-rocha-primary transition-all bg-white"
                                                                    title="Gerar Contrato do Cliente"
                                                                >
                                                                    <FileSignature className="h-4 w-4 mr-1" />
                                                                    Contrato
                                                                </Button>
                                                            </Link>
                                                            
                                                            <Link to={`/planejados/${proj.id}/imprimir`} target="_blank">
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="h-9 px-2 rounded-lg font-bold border-slate-200 text-slate-600 hover:border-brand-rocha-primary hover:text-brand-rocha-primary transition-all bg-white"
                                                                    title="Imprimir Pedido de Fábrica (com custos)"
                                                                >
                                                                    <Printer className="h-4 w-4 mr-1" />
                                                                    Fábrica
                                                                </Button>
                                                            </Link>
                                                        </div>
                                                    )}

                                                    {/* Edit */}
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => onEditProject(proj.id)}
                                                        className="h-9 w-9 p-0 rounded-lg font-bold border-slate-200 text-slate-600 hover:border-blue-500 hover:text-blue-500 transition-all"
                                                        title="Editar Projeto"
                                                    >
                                                        <Edit2 className="h-4 w-4" />
                                                    </Button>

                                                    {/* Soft Delete */}
                                                    {canDelete && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleSoftDelete(proj)}
                                                            className="h-9 w-9 p-0 rounded-lg font-bold border-slate-200 text-slate-400 hover:border-red-500 hover:text-red-500 transition-all"
                                                            title="Excluir Projeto"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={7} className="px-6 py-16 text-center text-slate-400">
                                        <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
                                        Nenhum projeto planejado encontrado com as condições informadas.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
