import { safeArray } from '../lib/dataDiagnostics';
import { safeParseISO, compareDatesSafe } from '../lib/dateUtils';
import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, getDocs, where, deleteDoc, addDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
    Building2,
    Users,
    Search,
    CheckCircle2,
    XCircle,
    Clock,
    UserX,
    Edit2,
    Trash2
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { CreateCompanyModal } from '../features/access/CreateCompanyModal';

interface ReactivationRequest {
    id: string;
    userId: string;
    email: string;
    companyId: string;
    companyName: string;
    status: 'pending' | 'approved' | 'denied';
    createdAt: any;
    reason?: string;
}

interface Company {
    id: string;
    name: string;
    cnpj: string;
    status: 'pending' | 'approved' | 'rejected' | 'blocked' | 'deleted';
    ownerId: string;
    createdAt: string;
    userCount?: number;
    adminEmail?: string;
    adminName?: string;
    isDeleted?: boolean;
}

interface UserDetails {
    uid: string;
    name: string;
    email: string;
    role: string;
    status: string;
    companyId: string;
    createdAt: string;
}

export const SuperAdminDashboard: React.FC = () => {
    const { profile, logout } = useAuth();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [requests, setRequests] = useState<ReactivationRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
    const [activeTab, setActiveTab] = useState<'companies' | 'reactivations'>('companies');

    // Modals State
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [editCompany, setEditCompany] = useState<Company | null>(null);
    const [companyUsers, setCompanyUsers] = useState<UserDetails[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Edit Form State
    const [editFormData, setEditFormData] = useState({ name: '', cnpj: '', status: 'pending' as any, adminEmail: '', adminName: '' });
    const [savingEdit, setSavingEdit] = useState(false);
    const [sendingReset, setSendingReset] = useState(false);

    useEffect(() => {
        document.title = `Super Admin | MarbleFlow - Gestão Inteligente marmoraria`;
    }, []);

    useEffect(() => {
        const q = query(collection(db, 'companies'));
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const companyList: Company[] = [];

            for (const document of snapshot.docs) {
                const data = document.data() as Company;
                const usersQ = query(collection(db, 'users'), where('companyId', '==', document.id));
                const usersSnapshot = await getDocs(usersQ);

                companyList.push({
                    ...data,
                    id: document.id,
                    userCount: usersSnapshot.size,
                    status: data.status === 'blocked' ? 'rejected' : data.status,
                });
            }

            setCompanies(companyList.sort((a, b) => compareDatesSafe(a.createdAt, b.createdAt, 'desc')));
            setLoading(false);
        });

        const qReq = query(collection(db, 'reactivation_requests'));
        const unsubscribeReq = onSnapshot(qReq, (snapshot) => {
            const reqList: ReactivationRequest[] = [];
            snapshot.forEach(docSnap => {
                reqList.push({ id: docSnap.id, ...docSnap.data() } as ReactivationRequest);
            });
            setRequests(reqList.sort((a, b) => compareDatesSafe(a.createdAt, b.createdAt, 'desc')));
        });

        return () => { 
            unsubscribe();
            unsubscribeReq();
        };
    }, []);

    const fetchCompanyUsers = async (companyId: string) => {
        setLoadingUsers(true);
        try {
            const q = query(collection(db, 'users'), where('companyId', '==', companyId));
            const snapshot = await getDocs(q);
            const users = safeArray(snapshot.docs).map(docSnap => docSnap.data() as UserDetails);
            setCompanyUsers(users);
        } catch (error) {
            console.error("Error fetching users:", error);
        } finally {
            setLoadingUsers(false);
        }
    };

    const handleOpenEdit = (company: Company) => {
        setEditFormData({
            name: company.name,
            cnpj: company.cnpj || '',
            status: company.status,
            adminEmail: company.adminEmail || '',
            adminName: company.adminName || ''
        });
        setEditCompany(company);
    };

    const handleSaveEdit = async () => {
        if (!editCompany) return;
        setSavingEdit(true);
        try {
            await updateDoc(doc(db, 'companies', editCompany.id), {
                name: editFormData.name,
                cnpj: editFormData.cnpj,
                status: editFormData.status,
                adminEmail: editFormData.adminEmail,
                adminName: editFormData.adminName
            });

            const usersQ = query(collection(db, 'users'), where('companyId', '==', editCompany.id));
            const usersSnap = await getDocs(usersQ);

            const updates = safeArray(usersSnap.docs).map(userDoc => {
                const userData = userDoc.data();
                const updatesForUser: any = {};
                if (editCompany.status !== editFormData.status) {
                    updatesForUser.status = editFormData.status === 'approved' ? 'approved' : 'rejected';
                }
                if (userData.role === 'company_admin') {
                    updatesForUser.name = editFormData.adminName;
                    updatesForUser.email = editFormData.adminEmail;
                }
                if (Object.keys(updatesForUser).length > 0) {
                    return updateDoc(doc(db, 'users', userDoc.id), updatesForUser);
                }
                return Promise.resolve();
            });
            await Promise.all(updates);

            setEditCompany(null);
        } catch (err) {
            alert("Erro ao salvar alterações da empresa.");
            console.error(err);
        } finally {
            setSavingEdit(false);
        }
    };

    const handleSendPasswordReset = async () => {
        if (!editFormData.adminEmail) return;
        setSendingReset(true);
        try {
            await sendPasswordResetEmail(auth, editFormData.adminEmail);
            alert("E-mail de redefinição enviado com sucesso!");
        } catch (error) {
            console.error("Erro ao enviar e-mail de redefinição:", error);
            alert("Erro ao enviar e-mail de redefinição.");
        } finally {
            setSendingReset(false);
        }
    };

    const handleDeleteCompany = async (company: Company) => {
        if (profile?.role !== 'superadmin') {
            alert("Permissão negada. Apenas super administradores podem excluir empresas.");
            return;
        }

        const confirmName = window.prompt("Tem certeza que deseja excluir esta empresa? Esta ação não pode ser desfeita.\n\nDigite o nome da empresa para confirmar:");
        if (confirmName !== company.name) {
            if (confirmName !== null) alert("Nome incorreto. Exclusão cancelada.");
            return;
        }

        try {
            const isoDate = new Date().toISOString();
            
            await updateDoc(doc(db, 'companies', company.id), {
                status: 'deleted',
                isDeleted: true,
                deletedAt: isoDate,
                deletedBy: profile?.uid
            });

            await addDoc(collection(db, 'security_logs'), {
                action: 'company_deleted',
                companyId: company.id,
                companyName: company.name,
                deletedBy: profile?.uid,
                deletedAt: isoDate
            });

            if (editCompany?.id === company.id) {
                setEditCompany(null);
            }
            alert("Empresa excluída com sucesso.");
        } catch (error) {
            console.error("Erro ao excluir empresa:", error);
            alert("Erro ao excluir empresa.");
        }
    };

    const handleApproveReactivation = async (req: ReactivationRequest) => {
        if (!window.confirm(`Deseja APROVAR a reativação da empresa ${req.companyName}?`)) return;
        try {
            const iso = new Date().toISOString();
            await updateDoc(doc(db, 'companies', req.companyId), {
                status: 'approved',
                isDeleted: false,
                deletedAt: null,
                deletedBy: null,
                reactivatedAt: iso,
                reactivatedBy: profile?.uid
            });
            
            await updateDoc(doc(db, 'users', req.userId), { status: 'approved' });
            
            await updateDoc(doc(db, 'reactivation_requests', req.id), {
                status: 'approved',
                resolvedAt: iso,
                resolvedBy: profile?.uid
            });

            await addDoc(collection(db, 'security_logs'), {
                action: 'company_reactivated',
                companyId: req.companyId,
                companyName: req.companyName,
                reactivatedBy: profile?.uid,
                reactivatedAt: iso
            });

            alert("Empresa reativada com sucesso!");
        } catch (error) {
            console.error(error);
            alert("Erro ao reativar.");
        }
    };

    const handleDenyReactivation = async (req: ReactivationRequest) => {
        if (!window.confirm(`Deseja NEGAR a solicitação da empresa ${req.companyName}?`)) return;
        try {
            const iso = new Date().toISOString();
            await updateDoc(doc(db, 'reactivation_requests', req.id), {
                status: 'denied',
                resolvedAt: iso,
                resolvedBy: profile?.uid
            });
            alert("Solicitação negada.");
        } catch (error) {
            console.error(error);
        }
    };

    const handleUpdateUserRole = async (uid: string, newRole: string) => {
        try {
            await updateDoc(doc(db, 'users', uid), { role: newRole });
            setCompanyUsers(prev => safeArray(prev).map(u => u.uid === uid ? { ...u, role: newRole } : u));
        } catch (error) {
            console.error("Error updating user role:", error);
        }
    };

    const handleUpdateUserStatus = async (uid: string, newStatus: string) => {
        try {
            await updateDoc(doc(db, 'users', uid), { status: newStatus });
            setCompanyUsers(prev => safeArray(prev).map(u => u.uid === uid ? { ...u, status: newStatus } : u));
        } catch (error) {
            console.error("Error updating user status:", error);
        }
    };

    const handleDeleteUser = async (uid: string) => {
        if (!window.confirm("Tem certeza que deseja remover este usuário (Atenção: Apenas remove do banco de dados, não do Auth)?")) return;
        try {
            await deleteDoc(doc(db, 'users', uid));
            setCompanyUsers(prev => safeArray(prev).filter(u => u.uid !== uid));
        } catch (error) {
            console.error("Error deleting user:", error);
        }
    };

    const filteredCompanies = safeArray(companies).filter(c => {
        if (c.isDeleted || c.status === 'deleted') return false;
        const nameLower = String(c.name || '').toLowerCase();
        const cnpjLower = String(c.cnpj || '').toLowerCase();
        const searchLower = String(searchTerm || '').toLowerCase();
        
        const matchesSearch = nameLower.includes(searchLower) || cnpjLower.includes(searchLower);
        const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'approved': return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Aprovada</span>;
            case 'pending': return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Pendente</span>;
            case 'rejected':
            case 'blocked': return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Bloqueada</span>;
            default: return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">{status}</span>;
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 font-sans min-h-screen">
            {/* Header Clean SaaS */}
            <div className="bg-white border-b border-slate-200 px-8 py-6 flex justify-between items-center shadow-sm z-10">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                        Super Admin Dashboard
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Gestão centralizada de empresas e acesso Master.</p>
                </div>
                <div className="flex items-center gap-4">
                    <Button onClick={() => setIsCreateModalOpen(true)} className="bg-slate-900 text-white hover:bg-slate-800">
                        + Criar Empresa
                    </Button>
                    <Button onClick={logout} variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300">
                        Sair do Painel
                    </Button>
                </div>
            </div>

            <div className="p-8 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-500">
                <div className="flex gap-4 border-b border-slate-200">
                    <button 
                        onClick={() => setActiveTab('companies')} 
                        className={`pb-4 px-4 font-bold text-sm border-b-2 transition-colors ${activeTab === 'companies' ? 'border-brand-emerald text-brand-emerald' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        Empresas
                    </button>
                    <button 
                        onClick={() => setActiveTab('reactivations')} 
                        className={`pb-4 px-4 font-bold text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'reactivations' ? 'border-brand-emerald text-brand-emerald' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        Solicitações de Reativação
                        {safeArray(requests).filter(r => r.status === 'pending').length > 0 && (
                            <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{safeArray(requests).filter(r => r.status === 'pending').length}</span>
                        )}
                    </button>
                </div>

                {activeTab === 'companies' ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            {[
                                { label: 'Total Empresas', value: companies.length, icon: Building2, color: 'text-blue-500', bg: 'bg-blue-50' },
                                { label: 'Pendentes', value: safeArray(companies).filter(c => c.status === 'pending').length, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
                                { label: 'Aprovadas', value: safeArray(companies).filter(c => c.status === 'approved').length, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                                { label: 'Bloqueadas', value: safeArray(companies).filter(c => c.status === 'rejected').length, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
                            ].map((stat, i) => (
                                <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{stat.label}</p>
                                        <p className="text-3xl font-black text-slate-900">{stat.value}</p>
                                    </div>
                                    <div className={`p-3 rounded-xl ${stat.bg}`}>
                                        <stat.icon className={`w-6 h-6 ${stat.color}`} />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                            <div className="relative w-full md:w-96">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    placeholder="Buscar por nome ou CNPJ..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 bg-slate-50 border-slate-200 text-slate-900 focus:ring-brand-emerald"
                                />
                            </div>
                            <div className="flex gap-2">
                                {['all', 'pending', 'approved', 'rejected'].map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => setFilterStatus(s as any)}
                                        className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${filterStatus === s
                                            ? 'bg-brand-emerald text-white shadow-md'
                                            : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200'
                                            }`}
                                    >
                                        {s === 'all' ? 'Todas' : s === 'approved' ? 'Aprovadas' : s === 'pending' ? 'Pendentes' : 'Bloqueadas'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest">
                                    <tr>
                                        <th className="px-6 py-4">Empresa</th>
                                        <th className="px-6 py-4">CNPJ</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4 text-center">Usuários</th>
                                        <th className="px-6 py-4">Criação</th>
                                        <th className="px-6 py-4 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-slate-500">Carregando empresas...</td>
                                        </tr>
                                    ) : filteredCompanies.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-slate-500">Nenhuma empresa encontrada com os filtros atuais.</td>
                                        </tr>
                                    ) : safeArray(filteredCompanies).map((company) => (
                                        <tr key={company.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-900">{company.name}</div>
                                                <div className="text-xs text-slate-400 font-mono mt-0.5">ID: {company.id.substring(0, 8)}...</div>
                                            </td>
                                            <td className="px-6 py-4 text-slate-600 font-mono text-sm">{company.cnpj || '-'}</td>
                                            <td className="px-6 py-4">{getStatusBadge(company.status)}</td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                                    {company.userCount}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 text-sm">
                                                {safeParseISO(company.createdAt)?.toLocaleDateString('pt-BR') || '---'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedCompany(company);
                                                            fetchCompanyUsers(company.id);
                                                        }}
                                                        className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-all border border-slate-200"
                                                        title="Ver Usuários"
                                                    >
                                                        <Users className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenEdit(company)}
                                                        className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 transition-all border border-slate-200"
                                                        title="Editar e Mudar Status"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteCompany(company)}
                                                        className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-red-50 hover:text-red-600 transition-all border border-slate-200"
                                                        title="Excluir Empresa"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="p-6 border-b border-slate-100">
                            <h2 className="text-lg font-bold text-slate-900">Solicitações Pendentes</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-widest">
                                        <th className="px-6 py-4 font-bold">Empresa / Email</th>
                                        <th className="px-6 py-4 font-bold">Data da Solicitação</th>
                                        <th className="px-6 py-4 font-bold">Status</th>
                                        <th className="px-6 py-4 font-bold text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {safeArray(requests).map((req) => (
                                        <tr key={req.id} className="hover:bg-slate-50/50">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-900 text-sm">{req.companyName}</div>
                                                <div className="text-slate-500 text-xs">{req.email}</div>
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 text-sm">
                                                {safeParseISO(req.createdAt)?.toLocaleDateString('pt-BR') || '---'}
                                            </td>
                                            <td className="px-6 py-4">
                                                {req.status === 'pending' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Pendente</span>}
                                                {req.status === 'approved' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Aprovada</span>}
                                                {req.status === 'denied' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Negada</span>}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {req.status === 'pending' && (
                                                    <div className="flex justify-end gap-2">
                                                        <Button onClick={() => handleApproveReactivation(req)} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs">Aprovar</Button>
                                                        <Button onClick={() => handleDenyReactivation(req)} variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 h-8 text-xs">Negar</Button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {requests.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-sm">Nenhuma solicitação encontrada.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal de Edição */}
            {editCompany && (
                <Modal
                    isOpen={!!editCompany}
                    onClose={() => setEditCompany(null)}
                    title="Editar Empresa & Status"
                    className="max-w-xl"
                >
                    <div className="space-y-6">
                        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-sm text-blue-800">
                            <strong>Atenção:</strong> Alterar o status da empresa afetará automaticamente <strong>todos</strong> os usuários vinculados a ela na próxima vez que fizerem login.
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Nome da Empresa</label>
                                <Input
                                    value={editFormData.name}
                                    onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">CNPJ</label>
                                <Input
                                    value={editFormData.cnpj}
                                    onChange={e => setEditFormData({ ...editFormData, cnpj: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Nome do Admin</label>
                                <Input
                                    value={editFormData.adminName}
                                    onChange={e => setEditFormData({ ...editFormData, adminName: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">E-mail do Admin</label>
                                <Input
                                    value={editFormData.adminEmail}
                                    onChange={e => setEditFormData({ ...editFormData, adminEmail: e.target.value })}
                                />
                                <div className="flex justify-between items-center mt-1">
                                    <p className="text-[10px] text-slate-500">O e-mail base será atualizado assim que salvar.</p>
                                    {editFormData.adminEmail && (
                                        <button
                                            type="button"
                                            onClick={handleSendPasswordReset}
                                            disabled={sendingReset}
                                            className="text-[10px] font-bold text-brand-emerald hover:text-emerald-700 underline disabled:opacity-50 transition-opacity"
                                        >
                                            {sendingReset ? 'Enviando...' : 'Enviar link de redefinição de senha'}
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-600 uppercase mb-1 block">Trava de Acesso (Status)</label>
                                <select
                                    value={editFormData.status}
                                    onChange={e => setEditFormData({ ...editFormData, status: e.target.value as any })}
                                    className="w-full h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 focus:ring-2 focus:ring-brand-emerald outline-none"
                                >
                                    <option value="approved">Aprovada (Acesso Liberado)</option>
                                    <option value="pending">Pendente (Em Análise)</option>
                                    <option value="rejected">Bloqueada (Acesso Suspenso)</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-between items-center w-full pt-4 border-t border-slate-100">
                            <Button
                                variant="outline"
                                onClick={() => editCompany && handleDeleteCompany(editCompany)}
                                className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 bg-white"
                            >
                                Excluir Empresa Permanente
                            </Button>
                            <div className="flex gap-3">
                                <Button variant="outline" onClick={() => setEditCompany(null)} disabled={savingEdit}>Cancelar</Button>
                                <Button onClick={handleSaveEdit} disabled={savingEdit} className="bg-brand-emerald text-white">
                                    {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Modal Criar Empresa */}
            <Modal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                title="Criar Nova Empresa"
                className="max-w-2xl"
            >
                <CreateCompanyModal
                    onClose={() => setIsCreateModalOpen(false)}
                    onSuccess={() => setIsCreateModalOpen(false)}
                />
            </Modal>

            {/* Modal Visualizar Usuários */}
            {selectedCompany && (
                <Modal
                    isOpen={!!selectedCompany}
                    onClose={() => setSelectedCompany(null)}
                    title={`Usuários: ${selectedCompany.name}`}
                    className="max-w-4xl"
                >
                    <div className="space-y-6">
                        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3">Nome / Email</th>
                                        <th className="px-4 py-3">Cargo</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loadingUsers ? (
                                        <tr><td colSpan={4} className="p-8 text-center text-slate-400">Buscando usuários...</td></tr>
                                    ) : companyUsers.length === 0 ? (
                                        <tr><td colSpan={4} className="p-8 text-center text-slate-400">Nenhum usuário encontrado para esta empresa.</td></tr>
                                    ) : safeArray(companyUsers).map(u => (
                                        <tr key={u.uid} className="hover:bg-slate-50">
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-slate-900">{u.name}</div>
                                                <div className="text-xs text-slate-500">{u.email}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select
                                                    value={u.role}
                                                    onChange={(e) => handleUpdateUserRole(u.uid, e.target.value)}
                                                    className="bg-white border border-slate-200 text-xs rounded-lg py-1 px-2 text-slate-700"
                                                >
                                                    <option value="company_admin">Admin da Empresa</option>
                                                    <option value="vendedor">Vendedor</option>
                                                    <option value="medidor">Medidor</option>
                                                    <option value="instalador">Instalador</option>
                                                    <option value="producao">Produção</option>
                                                    <option value="outro">Outro</option>
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => handleUpdateUserStatus(u.uid, u.status === 'approved' ? 'rejected' : 'approved')}
                                                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${u.status === 'approved'
                                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                                        : 'bg-red-50 text-red-600 border-red-200'
                                                        }`}
                                                >
                                                    {u.status === 'approved' ? 'Ativo' : 'Bloqueado'}
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => handleDeleteUser(u.uid)}
                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                >
                                                    <UserX className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};
