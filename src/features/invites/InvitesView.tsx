import { safeArray } from '../../lib/dataDiagnostics';
import { safeParseISO } from '../../lib/dateUtils';
import React, { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Plus, Trash2, X, Mail, Shield, Clock, ExternalLink } from 'lucide-react';
import { useInvites } from '../../hooks/useInvites';
import type { Invite } from '../../types';
import { clsx } from 'clsx';

export const InvitesView: React.FC = () => {
    const { invites, isLoading, createInvite, revokeInvite, removeInvite } = useInvites();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<Invite['role']>('vendedor');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleCreateInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await createInvite(email, role);
            setIsModalOpen(false);
            setEmail('');
        } catch (error) {
            console.error("Failed to create invite:", error);
            alert("Erro ao criar convite.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const copyInviteLink = (inviteId: string) => {
        const url = `${window.location.origin}/accept-invite?token=${inviteId}`;
        navigator.clipboard.writeText(url);
        alert("Link de convite copiado!");
    };

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col pt-4 pr-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Convites</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Convide novos membros para sua equipe.</p>
                </div>
                <Button onClick={() => setIsModalOpen(true)} className="bg-brand-emerald hover:bg-emerald-600 text-white font-bold">
                    <Plus className="mr-2 h-4 w-4" />
                    Enviar Convite
                </Button>
            </div>

            <div className="border border-gray-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 flex-1 overflow-hidden flex flex-col shadow-sm">
                <div className="overflow-x-auto flex-1 h-full">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 border-b border-gray-200 dark:border-slate-800 z-10">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">E-mail</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">Cargo</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">Status</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">Expira em</th>
                                <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-800/50">
                            {isLoading ? (
                                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Carregando convites...</td></tr>
                            ) : invites.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                        Nenhum convite pendente.
                                    </td>
                                </tr>
                            ) : (
                                safeArray(invites).map(invite => (
                                    <tr key={invite.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors group">
                                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">{invite.email}</td>
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-bold text-brand-emerald uppercase tracking-wider">{invite.role}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={clsx(
                                                "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                                                invite.status === 'pending' && "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
                                                invite.status === 'accepted' && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
                                                invite.status === 'revoked' && "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                                            )}>
                                                {invite.status === 'pending' ? 'Pendente' : invite.status === 'accepted' ? 'Aceito' : 'Revogado'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                                            {safeParseISO(invite.expiresAt)?.toLocaleDateString('pt-BR') || '---'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                {invite.status === 'pending' && (
                                                    <>
                                                        <Button variant="ghost" size="sm" onClick={() => copyInviteLink(invite.id)} className="text-blue-500 hover:text-blue-600" title="Copiar Link">
                                                            <ExternalLink className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="sm" onClick={() => revokeInvite(invite.id)} className="text-amber-500 hover:text-amber-600" title="Revogar">
                                                            <Shield className="h-4 w-4" />
                                                        </Button>
                                                    </>
                                                )}
                                                <Button variant="ghost" size="sm" onClick={() => removeInvite(invite.id)} className="text-slate-400 hover:text-red-500" title="Excluir">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Convidar Colaborador</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-slate-700"><X className="h-5 w-5" /></button>
                        </div>

                        <form onSubmit={handleCreateInvite} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">E-mail do convidado</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                    <Input required type="email" placeholder="colaborador@email.com" value={email} onChange={e => setEmail(e.target.value)} className="pl-10 h-11" />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cargo atribuído</label>
                                <select
                                    required
                                    value={role}
                                    onChange={e => setRole(e.target.value as any)}
                                    className="flex h-11 w-full rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald"
                                >
                                    <option value="vendedor">Vendedor</option>
                                    <option value="medidor">Medidor</option>
                                    <option value="instalador">Instalador</option>
                                    <option value="producao">Produção</option>
                                </select>
                            </div>

                            <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-xl flex gap-3 items-start border border-amber-100 dark:border-amber-900/30">
                                <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-700 dark:text-amber-400">Este convite expirará automaticamente em 7 dias após o envio.</p>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)} className="flex-1">Cancelar</Button>
                                <Button type="submit" disabled={isSubmitting} className="flex-1 bg-brand-emerald text-white font-bold h-11">
                                    {isSubmitting ? 'Gerando...' : 'Enviar Convite'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
