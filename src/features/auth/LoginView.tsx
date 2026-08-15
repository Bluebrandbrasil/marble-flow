import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Target, Loader2, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';

export const LoginView: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [isRecovering, setIsRecovering] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const isValidForm = isValidEmail(email) && (isRecovering ? true : password.length >= 6);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Session is persisted automatically by Firebase, App.tsx will redirect.
        } catch (err: any) {
            console.error("Login error:", err);

            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
                setError('E-mail ou senha incorretos.');
            } else if (err.code === 'auth/too-many-requests') {
                setError('Muitas tentativas falhas. Tente novamente mais tarde.');
            } else {
                setError('Ocorreu um erro ao tentar fazer login.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleRecovery = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValidEmail(email)) {
            setError('Digite um e-mail válido para recuperação.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setSuccessMsg(null);

        try {
            await sendPasswordResetEmail(auth, email);
            setSuccessMsg('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
            setIsRecovering(false);
        } catch (err: any) {
            console.error("Recovery error:", err);
            if (err.code === 'auth/user-not-found') {
                setError('E-mail não encontrado em nosso sistema.');
            } else {
                setError('Erro ao enviar e-mail de recuperação.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-900 overflow-hidden relative font-sans">
            {/* Ambient Background Elements */}
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1618220179428-22790b46a014?q=80&w=2727&auto=format&fit=crop')] bg-cover bg-center opacity-30 mix-blend-overlay"></div>

            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-emerald/30 rounded-full blur-[128px] animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-neon/20 rounded-full blur-[128px] animate-pulse delay-1000"></div>

            <div className="relative z-10 w-full max-w-md p-8 pt-10 mx-4 glass-card rounded-3xl border border-white/10 shadow-2xl backdrop-blur-2xl bg-slate-900/60 flex flex-col items-center">

                <div className="w-16 h-16 bg-gradient-to-br from-brand-neon to-brand-emerald rounded-2xl flex items-center justify-center shadow-lg mb-6 ring-4 ring-slate-900">
                    <Target className="w-8 h-8 text-slate-900" />
                </div>

                <h1 className="text-3xl font-bold text-white mb-2 text-center tracking-tight">Marble Flow</h1>
                <p className="text-slate-400 text-sm mb-8 text-center font-medium">Faça login para gerenciar sua produção</p>

                {error && (
                    <div className="w-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl mb-6 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <p>{error}</p>
                    </div>
                )}

                {successMsg && (
                    <div className="w-full bg-brand-emerald/10 border border-brand-emerald/20 text-brand-emerald text-sm px-4 py-3 rounded-xl mb-6 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                        <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <p>{successMsg}</p>
                    </div>
                )}

                <form onSubmit={isRecovering ? handleRecovery : handleLogin} className="w-full space-y-5">
                    <div className="space-y-2 text-left w-full">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">E-mail Corporativo</label>
                        <Input
                            type="email"
                            required
                            placeholder="seu@email.com.br"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="bg-black/20 border-white/10 text-white placeholder:text-slate-500 h-12 rounded-xl focus:border-brand-emerald focus:ring-brand-emerald"
                        />
                    </div>

                    {!isRecovering && (
                        <div className="space-y-2 text-left w-full">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Senha</label>
                            <div className="relative">
                                <Input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="bg-black/20 border-white/10 text-white placeholder:text-slate-500 h-12 rounded-xl focus:border-brand-emerald focus:ring-brand-emerald pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            <div className="flex justify-end pt-1">
                                <button
                                    type="button"
                                    onClick={() => { setIsRecovering(true); setError(null); setSuccessMsg(null); }}
                                    className="text-xs text-brand-emerald hover:text-brand-neon hover:underline transition-colors"
                                >
                                    Esqueci minha senha
                                </button>
                            </div>
                        </div>
                    )}

                    <Button
                        type="submit"
                        disabled={isLoading || !isValidForm}
                        className="w-full h-12 rounded-xl bg-brand-emerald hover:bg-brand-neon text-slate-900 font-bold text-base transition-all flex justify-center items-center shadow-lg shadow-brand-emerald/20 hover:shadow-brand-neon/40 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            isRecovering ? 'Enviar link de recuperação' : 'Entrar no Sistema'
                        )}
                    </Button>

                    {isRecovering && (
                        <div className="flex justify-center mt-4">
                            <button
                                type="button"
                                onClick={() => { setIsRecovering(false); setError(null); setSuccessMsg(null); }}
                                className="text-sm text-slate-400 hover:text-white transition-colors"
                            >
                                Voltar para o Login
                            </button>
                        </div>
                    )}
                </form>

                <div className="mt-8 text-xs text-slate-500 text-center font-medium">
                    &copy; {new Date().getFullYear()} Studio 12 Co. All rights reserved.
                </div>
            </div>
        </div>
    );
};
