import { safeParseISO } from '../lib/dateUtils';
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Loader2, AlertCircle, CheckCircle2, Target, LogOut, LogIn } from 'lucide-react';
import type { Invite } from '../types';

export const AcceptInvite: React.FC = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const { user, profile, logout } = useAuth();
    const [invite, setInvite] = useState<Invite | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Form
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    // UI state for "already exists"
    const [needsLogin, setNeedsLogin] = useState(false);

    useEffect(() => {
        document.title = `Aceitar Convite | MarbleFlow - Gestão Inteligente marmoraria`;
    }, []);

    useEffect(() => {
        const verifyInvite = async () => {
            if (!token) {
                setError('Link de convite inválido ou ausente.');
                setLoading(false);
                return;
            }

            try {
                const inviteRef = doc(db, 'invites', token);
                const inviteSnap = await getDoc(inviteRef);

                if (!inviteSnap.exists()) {
                    setError('Convite não encontrado.');
                } else {
                    const data = inviteSnap.data() as Invite;
                    const expiryDate = safeParseISO(data.expiresAt);

                    if (data.status !== 'pending') {
                        setError(`Este convite já foi ${data.status === 'accepted' ? 'utilizado' : 'revogado'}.`);
                    } else if (expiryDate && expiryDate.getTime() < Date.now()) {
                        setError('Este convite expirou.');
                    } else {
                        setInvite({
                            email: data.email,
                            companyId: data.companyId,
                            role: data.role,
                            status: data.status,
                            createdAt: data.createdAt,
                            expiresAt: data.expiresAt,
                            createdByUid: data.createdByUid,
                            id: inviteSnap.id
                        });
                    }
                }
            } catch (err: any) {
                console.error("Error verifying invite:", err);
                setError(err.message || 'Erro ao verificar convite.');
            } finally {
                setLoading(false);
            }
        };

        verifyInvite();
    }, [token]);

    const handleSignupOrLink = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!invite) return;

        setIsSubmitting(true);
        setError(null);

        try {
            let targetUid = user?.uid;

            // Se o usuário NÃO estiver logado, cria um auth novo.
            if (!user) {
                try {
                    const userCredential = await createUserWithEmailAndPassword(auth, invite.email, password);
                    targetUid = userCredential.user.uid;
                } catch (authErr: any) {
                    if (authErr.code === 'auth/email-already-in-use') {
                        setNeedsLogin(true);
                        setError('Esse e-mail já tem conta. Faça login para aceitar o convite.');
                        setIsSubmitting(false);
                        return; // Para o fluxo aqui para ele fazer login
                    }
                    throw authErr; // Repassa pro catch principal
                }
            }

            if (!targetUid) throw new Error("Falha ao obter credenciais.");

            // 1. Mark invitation as accepted first, so firestore.rules can see that this email has accepted the token
            await updateDoc(doc(db, 'invites', invite.id), {
                status: 'accepted',
                acceptedByUid: targetUid,
                acceptedAt: serverTimestamp()
            });

            // 2. Create the user profile doc as pending first, referencing the inviteToken
            await setDoc(doc(db, 'users', targetUid), {
                uid: targetUid,
                name: name ? name.trim() : (profile?.name || invite.email),
                email: invite.email,
                companyId: invite.companyId,
                role: invite.role, // "company_admin" ou outro
                status: 'pending',
                inviteToken: invite.id,
                createdAt: serverTimestamp()
            }, { merge: true });

            // 3. Now fetch the company status securely (we can do it now since user profile has companyId set)
            const companySnap = await getDoc(doc(db, 'companies', invite.companyId));
            const companyStatus = companySnap.exists() ? companySnap.data().status : 'pending';

            // 4. Update user status based on company status
            await updateDoc(doc(db, 'users', targetUid), {
                status: companyStatus === 'approved' ? 'approved' : 'pending'
            });

            setSuccess(true);
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);

        } catch (err: any) {
            console.error("Signup/Accept error:", err);
            setError(err.message || 'Erro sistemático ao finalizar convite.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLogoutWithRefresh = async () => {
        await logout();
        window.location.reload();
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-brand-emerald animate-spin" />
            </div>
        );
    }

    if (error && (!needsLogin || !invite)) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
                <div className="glass-card p-8 rounded-3xl border border-red-500/20 max-w-sm text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-white mb-2">Atenção</h2>
                    <p className="text-slate-400 text-sm mb-6">{error}</p>
                    <Button onClick={() => window.location.href = '/'} className="w-full">Voltar para o Início</Button>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
                <div className="glass-card p-8 rounded-3xl border border-emerald-500/20 max-w-sm text-center">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-white mb-2">Sucesso!</h2>
                    <p className="text-slate-400 text-sm">Convite aceito com êxito. Acessando portal...</p>
                </div>
            </div>
        );
    }

    // --- LOGGED IN BEHAVIOR ---
    if (user && invite) {
        // Bloquear SuperAdmin
        const isSuperAdmin = user.email === 'rdmarketingcomercial@gmail.com' || profile?.role === 'superadmin';

        if (isSuperAdmin) {
            return (
                <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
                    <div className="glass-card p-8 rounded-3xl border border-amber-500/20 max-w-sm text-center">
                        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-white mb-2">Sessão SuperAdmin Ativa</h2>
                        <p className="text-slate-400 text-sm mb-6">
                            Vocês estão logadas como SuperAdmin. Saiam da conta e abram o convite com o e-mail do Admin (ou usem janela anônima real).
                        </p>
                        <Button onClick={handleLogoutWithRefresh} className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold h-12 rounded-xl">
                            <LogOut className="w-5 h-5 mr-2" /> Sair e continuar
                        </Button>
                    </div>
                </div>
            );
        }

        // Se email não bater
        if (user.email !== invite.email) {
            return (
                <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
                    <div className="glass-card p-8 rounded-3xl border border-amber-500/20 max-w-sm text-center">
                        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-white mb-2">Contra Incorreta</h2>
                        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                            Você está logado como <strong>{user.email}</strong>, mas o convite foi emitido para <strong>{invite.email}</strong>.
                        </p>
                        <Button onClick={handleLogoutWithRefresh} variant="outline" className="w-full h-11 border-white/10 text-white">
                            Sair e acessar conta correta
                        </Button>
                    </div>
                </div>
            );
        }

        // Email bate perfeitamente. Botão limpo de "Vincular e Acessar".
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-brand-emerald/10 via-transparent to-brand-neon/5 opacity-50"></div>

                <div className="relative z-10 w-full max-w-md p-8 mx-4 glass-card rounded-3xl border border-white/10 shadow-2xl backdrop-blur-2xl bg-slate-900/60 flex flex-col items-center">
                    <div className="w-16 h-16 bg-brand-emerald rounded-2xl flex items-center justify-center shadow-lg mb-6 ring-4 ring-slate-900">
                        <Target className="w-8 h-8 text-slate-900" />
                    </div>

                    <h1 className="text-2xl font-bold text-white mb-2 text-center">Olá, {profile?.name || 'equipe'}!</h1>
                    <p className="text-slate-400 text-sm mb-8 text-center px-4 leading-relaxed">
                        Sua conta ({invite.email}) foi designada como <span className="text-brand-emerald font-bold uppercase">{invite.role}</span> para este ambiente.
                    </p>

                    <Button
                        onClick={() => handleSignupOrLink()}
                        disabled={isSubmitting}
                        className="w-full h-12 bg-brand-emerald text-slate-900 font-bold hover:bg-brand-neon transition-all"
                    >
                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Aceitar Convite & Entrar'}
                    </Button>
                </div>
            </div>
        );
    }

    // --- NEEDS LOGIN FIRST VIEW (IF auth/email-already-in-use occurred) ---
    if (needsLogin) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
                <div className="glass-card p-8 rounded-3xl border border-amber-500/20 max-w-sm text-center">
                    <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-white mb-2">Conta Existente</h2>
                    <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                        {error}
                    </p>
                    <Button
                        onClick={() => window.location.href = `/?returnUrl=/accept-invite?token=${token}`}
                        className="w-full h-11 bg-brand-emerald hover:bg-brand-neon text-slate-900 font-bold"
                    >
                        <LogIn className="w-4 h-4 mr-2" /> Fazer Login Agora
                    </Button>
                </div>
            </div>
        );
    }

    // --- STANDARD SIGNUP FLOW ---
    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-emerald/10 via-transparent to-brand-neon/5 opacity-50"></div>

            <div className="relative z-10 w-full max-w-md p-8 mx-4 glass-card rounded-3xl border border-white/10 shadow-2xl backdrop-blur-2xl bg-slate-900/60 flex flex-col items-center">
                <div className="w-16 h-16 bg-brand-emerald rounded-2xl flex items-center justify-center shadow-lg mb-6 ring-4 ring-slate-900">
                    <Target className="w-8 h-8 text-slate-900" />
                </div>

                <h1 className="text-2xl font-bold text-white mb-2 text-center">Bem-vindo(a)!</h1>
                <p className="text-slate-400 text-sm mb-8 text-center leading-relaxed">Você foi convidado para ingressar com cargo de <span className="text-brand-emerald font-bold uppercase">{invite?.role}</span>.</p>

                {error && (
                    <div className="w-full bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-3 rounded-lg mb-4 text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSignupOrLink} className="w-full space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">E-mail Corporativo</label>
                        <Input disabled value={invite?.email} className="bg-white/5 border-white/10 text-slate-300 cursor-not-allowed opacity-70 h-11" />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Seu Nome Completo</label>
                        <Input required value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Maria Oliveira" className="h-11 bg-black/20 border-white/10 text-white focus:border-brand-emerald focus:ring-brand-emerald" />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Crie uma Senha Principal</label>
                        <Input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="h-11 bg-black/20 border-white/10 text-white focus:border-brand-emerald focus:ring-brand-emerald" />
                    </div>

                    <Button type="submit" disabled={isSubmitting} className="w-full h-12 mt-4 bg-brand-emerald hover:bg-brand-neon text-slate-900 font-bold transition-all shadow-lg hover:shadow-brand-emerald/20">
                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Finalizar Cadastro'}
                    </Button>
                </form>
            </div>
        </div>
    );
};
