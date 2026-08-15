import { safeArray } from '../../lib/dataDiagnostics';
import { safeParseISO, compareDatesSafe } from '../../lib/dateUtils';
import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth } from '../../lib/firebase';
import { Shield, ShieldAlert, ShieldCheck, Trash2, CheckCircle, XCircle, Building2, Plus, Edit2, KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { CreateCompanyModal } from '../admin/CreateCompanyModal';
import { EditCompanyModal } from '../admin/EditCompanyModal';

interface CompanyTenant {
    id: string;
    name: string;
    cnpj: string;
    status: 'pending' | 'approved' | 'rejected';
    ownerId: string;
    createdAt: string;
    userCount?: number;
    adminEmail?: string;
}

export const AccessView: React.FC = () => {
    const { profile } = useAuth();
    const [companies, setCompanies] = useState<CompanyTenant[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editCompany, setEditCompany] = useState<CompanyTenant | null>(null);

    // Allows the primary hardcoded email OR custom superadmin roles to use this panel
    const isSuperAdmin = profile?.email === 'rdmarketingcomercial@gmail.com' || profile?.role === 'superadmin';

    useEffect(() => {
        if (!isSuperAdmin) return;

        const loadData = async () => {
            const q = query(collection(db, 'companies'));
            const unsubscribe = onSnapshot(q, async (snapshot) => {
                const data = safeArray(snapshot.docs).map(doc => ({ ...doc.data(), id: doc.id } as CompanyTenant));

                // Fetch users to count per company
                const usersSnap = await getDocs(collection(db, 'users'));
                const usersList = safeArray(usersSnap.docs).map(d => d.data());

                const companiesWithCount = safeArray(data).map(company => {
                    const count = safeArray(usersList).filter(u => u.companyId === company.id).length;
                    return { ...company, userCount: count };
                });

                // Sort to put pending at the top
                companiesWithCount.sort((a, b) => {
                    if (a.status === 'pending' && b.status !== 'pending') return -1;
                    if (a.status !== 'pending' && b.status === 'pending') return 1;
                    return compareDatesSafe(a.createdAt, b.createdAt, 'desc');
                });
                setCompanies(companiesWithCount);
                setIsLoading(false);
            });

            return unsubscribe;
        };

        const cleanup = loadData();
        return () => {
            cleanup.then(unsub => unsub?.());
        };
    }, [isSuperAdmin]);

    const handleUpdateStatus = async (id: string, newStatus: 'approved' | 'rejected') => {
        try {
            await updateDoc(doc(db, 'companies', id), { status: newStatus });
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Erro ao atualizar status da empresa.");
        }
    };

    const handleDeleteCompany = async (id: string) => {
        if (!window.confirm("Atenção: Excluir a empresa não exclui os usuários do Firebase Auth. Deseja remover apenas os dados do locatário (Tenants)?")) return;

        try {
            await deleteDoc(doc(db, 'companies', id));
        } catch (error) {
            console.error("Error deleting company:", error);
            alert("Erro ao excluir empresa.");
        }
    };

    const handleResetPassword = async (email?: string) => {
        if (!email) {
            alert("E-mail do administrador principal não encontrado.");
            return;
        }
        if (!window.confirm(`Deseja enviar um e-mail de redefinição de senha para ${email}?`)) return;

        try {
            await sendPasswordResetEmail(auth, email);
            alert(`E-mail de redefinição enviado com sucesso para ${email}.`);
        } catch (error) {
            console.error("Error resetting password:", error);
            alert("Erro ao enviar e-mail de redefinição.");
        }
    };

    if (!isSuperAdmin) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <ShieldAlert className="w-16 h-16 mb-4 text-red-500/50" />
                <h2 className="text-xl font-bold text-white mb-2">Acesso Restrito</h2>
                <p>Você não tem permissão para visualizar o painel Super Admin.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-900 overflow-hidden font-sans relative">
            {/* Glassmorphism Background Elements */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-emerald/10 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="relative z-10 flex flex-col h-full p-6">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                            <Shield className="w-7 h-7 text-brand-emerald" />
                            Painel Super Admin - Empresas
                        </h2>
                        <p className="text-sm text-slate-400 mt-1">
                            Aprove ou bloqueie empresas e inquilinos na plataforma SaaS.
                        </p>
                    </div>
                    <Button onClick={() => setIsCreateModalOpen(true)} variant="default">
                        <Plus className="w-4 h-4 mr-2" />
                        Criar Empresa
                    </Button>
                </div>

                <div className="flex-1 overflow-auto bg-slate-800/40 rounded-2xl border border-white/5 shadow-xl glass-card">
                    {isLoading ? (
                        <div className="h-full flex items-center justify-center p-8">
                            <div className="w-8 h-8 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/10 bg-black/20 text-xs uppercase tracking-wider text-slate-400">
                                    <th className="px-6 py-4 font-bold">Empresa</th>
                                    <th className="px-6 py-4 font-bold">CNPJ</th>
                                    <th className="px-6 py-4 font-bold text-center">Usuários</th>
                                    <th className="px-6 py-4 font-bold">Cadastro</th>
                                    <th className="px-6 py-4 font-bold">Status</th>
                                    <th className="px-6 py-4 font-bold text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm divide-y divide-white/5">
                                {safeArray(companies).map(c => (
                                    <tr key={c.id} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-md bg-white/5 flex items-center justify-center flex-shrink-0">
                                                    <Building2 className="w-4 h-4 text-slate-400" />
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-white">{c.name}</div>
                                                    <div className="text-xs text-slate-500 mt-0.5 font-mono">ID: {c.id.substring(0, 8)}...</div>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-6 py-4 text-slate-300">
                                            {c.cnpj || '-'}
                                        </td>

                                        <td className="px-6 py-4 text-center">
                                            <span className="text-slate-300 bg-white/5 px-2 py-1 rounded-full text-xs font-medium border border-white/10">
                                                {c.userCount}
                                            </span>
                                        </td>

                                        <td className="px-6 py-4 text-slate-400">
                                            {safeParseISO(c.createdAt)?.toLocaleDateString('pt-BR') || '---'}
                                        </td>

                                        <td className="px-6 py-4">
                                            {c.status === 'pending' && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                                    Pendente
                                                </span>
                                            )}
                                            {c.status === 'approved' && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20">
                                                    <ShieldCheck className="w-3.5 h-3.5" />
                                                    Aprovada
                                                </span>
                                            )}
                                            {c.status === 'rejected' && (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-red-500/10 text-red-500 border border-red-500/20">
                                                    <XCircle className="w-3.5 h-3.5" />
                                                    Bloqueada
                                                </span>
                                            )}
                                        </td>

                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setEditCompany(c)}
                                                    className="p-1.5 text-slate-400 hover:text-brand-emerald hover:bg-brand-emerald/20 rounded-md transition-colors"
                                                    title="Editar Empresa"
                                                >
                                                    <Edit2 className="w-5 h-5" />
                                                </button>

                                                <button
                                                    onClick={() => handleResetPassword(c.adminEmail)}
                                                    className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/20 rounded-md transition-colors"
                                                    title="Resetar Senha do Admin"
                                                >
                                                    <KeyRound className="w-5 h-5" />
                                                </button>

                                                {c.status === 'pending' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleUpdateStatus(c.id, 'approved')}
                                                            className="p-1.5 text-brand-emerald hover:bg-brand-emerald/20 rounded-md transition-colors"
                                                            title="Aprovar Empresa"
                                                        >
                                                            <CheckCircle className="w-5 h-5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleUpdateStatus(c.id, 'rejected')}
                                                            className="p-1.5 text-red-400 hover:bg-red-500/20 rounded-md transition-colors"
                                                            title="Rejeitar Empresa"
                                                        >
                                                            <XCircle className="w-5 h-5" />
                                                        </button>
                                                    </>
                                                )}
                                                {c.status === 'rejected' && (
                                                    <button
                                                        onClick={() => handleUpdateStatus(c.id, 'approved')}
                                                        className="p-1.5 text-slate-400 hover:text-brand-emerald hover:bg-brand-emerald/20 rounded-md transition-colors"
                                                        title="Re-Aprovar Empresa"
                                                    >
                                                        <CheckCircle className="w-5 h-5" />
                                                    </button>
                                                )}
                                                {c.status === 'approved' && (
                                                    <button
                                                        onClick={() => handleUpdateStatus(c.id, 'rejected')}
                                                        className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-500/20  rounded-md transition-colors"
                                                        title="Bloquear Empresa"
                                                    >
                                                        <XCircle className="w-5 h-5" />
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => handleDeleteCompany(c.id)}
                                                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Excluir Empresa"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {companies.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                            Nenhuma empresa cadastrada no sistema.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Create Company Modal */}
            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                title="Criar Nova Empresa"
                className="max-w-2xl"
            >
                <CreateCompanyModal
                    onClose={() => setIsCreateModalOpen(false)}
                    onSuccess={() => {/* Table refreshes via onSnapshot */ }}
                />
            </Modal>

            {/* Edit Company Modal */}
            {editCompany && (
                <Modal
                    isOpen={!!editCompany}
                    onClose={() => setEditCompany(null)}
                    title="Editar Empresa"
                    className="max-w-2xl"
                >
                    <EditCompanyModal
                        company={editCompany}
                        onClose={() => setEditCompany(null)}
                        onSuccess={() => {/* Table refreshes via onSnapshot */ }}
                    />
                </Modal>
            )}
        </div>
    );
};
