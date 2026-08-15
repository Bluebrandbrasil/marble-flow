import { safeArray } from '../../lib/dataDiagnostics';
import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth } from '../../lib/firebase';
import { Search, ShieldAlert, ShieldCheck, KeyRound, Loader2, XCircle, CheckCircle } from 'lucide-react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { updateUserStatus, type CompanyUser } from '../../services/userService';
import { normalizeText, displayOrFallback } from '../../utils/textUtils';

interface CompanyUsersModalProps {
    company: { id: string; name: string; cnpj: string };
    onClose: () => void;
}

export const CompanyUsersModal: React.FC<CompanyUsersModalProps> = ({ company }) => {
    const [users, setUsers] = useState<CompanyUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [confirmAction, setConfirmAction] = useState<{
        type: 'reset' | 'block' | 'unblock',
        user: CompanyUser
    } | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'users'), where('companyId', '==', company.id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as CompanyUser));
            data = data.filter(u => u.role !== 'superadmin' && u.email !== 'rdmarketingcomercial@gmail.com');
            setUsers(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [company.id]);

    const filteredUsers = safeArray(users).filter(u => {
        const searchLower = normalizeText(searchTerm);
        return normalizeText(u?.name).includes(searchLower) ||
               normalizeText(u?.email).includes(searchLower);
    });

    const handleConfirmAction = async () => {
        if (!confirmAction) return;
        setActionLoading(true);
        const { type, user } = confirmAction;

        try {
            if (type === 'reset') {
                await sendPasswordResetEmail(auth, user.email);
                alert(`E-mail de redefinição enviado com sucesso para ${user.email}.`);
            } else if (type === 'block') {
                await updateUserStatus(user.id, 'rejected');
            } else if (type === 'unblock') {
                await updateUserStatus(user.id, 'approved');
            }
        } catch (error) {
            console.error(`Error performing ${type} on user:`, error);
            alert("Erro ao realizar operação. Verifique os logs.");
        } finally {
            setActionLoading(false);
            setConfirmAction(null);
        }
    };

    return (
        <div className="flex flex-col h-[70vh]">
            <div className="mb-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Gerenciando usuários de: <span className="font-bold text-slate-700 dark:text-slate-200">{company.name}</span> {company.cnpj ? `(${company.cnpj})` : ''}
                </p>
                <div className="relative mt-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome ou e-mail..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-10 pl-9 pr-4 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 focus:ring-2 focus:ring-brand-emerald focus:border-transparent outline-none transition-all dark:text-white"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/40">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-brand-emerald" />
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
                            <tr className="border-b border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th className="px-4 py-3">Usuário</th>
                                <th className="px-4 py-3">Role</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-sm">
                            {filteredUsers.length > 0 ? safeArray(filteredUsers).map(u => (
                                <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-900 dark:text-white">{displayOrFallback(u?.name, "Nome não informado")}</div>
                                        <div className="text-xs text-slate-500">{displayOrFallback(u?.email, "E-mail não informado")}</div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                        <span className="bg-slate-100 dark:bg-white/10 px-2 py-1 rounded text-xs">
                                            {displayOrFallback(u?.role, "Função não informada")}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {!u?.status ? (
                                            <span className="inline-flex items-center gap-1 text-slate-400 text-xs font-medium">
                                                Status não informado
                                            </span>
                                        ) : u.status === 'approved' ? (
                                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                                                <ShieldCheck className="w-3.5 h-3.5" /> Ativo
                                            </span>
                                        ) : u.status === 'rejected' ? (
                                            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-medium">
                                                <ShieldAlert className="w-3.5 h-3.5" /> Bloqueado
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-amber-500 text-xs font-medium">
                                                Pendente
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            {u.status !== 'rejected' ? (
                                                <button
                                                    onClick={() => setConfirmAction({ type: 'block', user: u })}
                                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                                    title="Bloquear Acesso"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => setConfirmAction({ type: 'unblock', user: u })}
                                                    className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                                    title="Desbloquear Acesso"
                                                >
                                                    <CheckCircle className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setConfirmAction({ type: 'reset', user: u })}
                                                className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                                                title="Resetar Senha"
                                            >
                                                <KeyRound className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-xs text-muted-foreground">
                                        Nenhum usuário encontrado.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {confirmAction && (
                <ConfirmDialog
                    isOpen={!!confirmAction}
                    title={
                        confirmAction.type === 'reset' ? 'Resetar Senha' :
                            confirmAction.type === 'block' ? 'Bloquear Usuário' : 'Desbloquear Usuário'
                    }
                    message={
                        confirmAction.type === 'reset' ? `Deseja enviar um link de redefinição de senha para ${confirmAction.user.email}?` :
                            confirmAction.type === 'block' ? `Deseja realmente bloquear o acesso de ${confirmAction.user.name}?` :
                                `Deseja desbloquear o acesso de ${confirmAction.user.name}?`
                    }
                    variant={confirmAction.type === 'block' ? 'danger' : 'warning'}
                    confirmLabel={
                        confirmAction.type === 'reset' ? 'Enviar' :
                            confirmAction.type === 'block' ? 'Bloquear' : 'Desbloquear'
                    }
                    onConfirm={handleConfirmAction}
                    onCancel={() => setConfirmAction(null)}
                    isLoading={actionLoading}
                />
            )}
        </div>
    );
};
