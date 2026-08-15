import React, { useState, useEffect, useRef } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Loader2, AlertCircle, CheckCircle, Eye, EyeOff, ShieldCheck, LockIcon } from 'lucide-react';
import { cn } from '../lib/utils';

interface LoginProps {
    onNavigateToRegister: () => void;
}

export const Login: React.FC<LoginProps> = React.memo(({ onNavigateToRegister }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [isRecovering, setIsRecovering] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        document.title = `Login | MarbleFlow - Gestão Inteligente marmoraria`;
        
        // Load saved login details
        const savedEmail = localStorage.getItem('saved_email');
        const rememberMeValue = localStorage.getItem('remember_me') === 'true';
        if (savedEmail) {
            setEmail(savedEmail);
        }
        setRememberMe(rememberMeValue);
    }, []);

    // Security & UX states
    const [failedAttempts, setFailedAttempts] = useState(0);
    const [lockoutTimer, setLockoutTimer] = useState(0);
    
    // Refs for autofocus
    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const isValidForm = isValidEmail(email) && (isRecovering ? true : password.length >= 6);

    // Initial focus on email or password depending on whether email is pre-filled
    useEffect(() => {
        if (!isRecovering) {
            const savedEmail = localStorage.getItem('saved_email');
            if (savedEmail) {
                passwordRef.current?.focus();
            } else {
                emailRef.current?.focus();
            }
        }
    }, [isRecovering]);

    // Lockout timer logic
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (lockoutTimer > 0) {
            interval = setInterval(() => {
                setLockoutTimer((prev) => prev - 1);
            }, 1000);
        } else if (lockoutTimer === 0 && failedAttempts >= 5) {
            setFailedAttempts(0); // Reset after lockout expires
        }
        return () => clearInterval(interval);
    }, [lockoutTimer, failedAttempts]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (lockoutTimer > 0) {
            setError(`Muitas tentativas. Aguarde ${lockoutTimer} segundos.`);
            return;
        }

        if (isLoading || !isValidForm) return;

        setIsLoading(true);
        setError(null);

        try {
            const persistenceOption = rememberMe ? browserLocalPersistence : browserSessionPersistence;
            await setPersistence(auth, persistenceOption);
            await signInWithEmailAndPassword(auth, email, password);
            
            // Handle credentials persistence settings
            if (rememberMe) {
                localStorage.setItem('saved_email', email);
                localStorage.setItem('remember_me', 'true');
            } else {
                localStorage.removeItem('saved_email');
                localStorage.removeItem('remember_me');
            }
            
            // On success, state reset isn't strictly needed as unmount happens,
            // but we can clear errors just in case
            setError(null);
            setFailedAttempts(0);
        } catch (err: any) {
            console.error("Login attempt failed"); // Removed err details for security
            
            const newAttempts = failedAttempts + 1;
            setFailedAttempts(newAttempts);

            if (newAttempts >= 5) {
                setLockoutTimer(30);
                setError('Muitas tentativas. Aguarde 30 segundos.');
            } else {
                setError('Não foi possível acessar. Verifique seus dados e tente novamente.');
                // Auto focus on password on error for better UX
                setTimeout(() => passwordRef.current?.focus(), 100);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleRecovery = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLoading) return;
        
        if (!isValidEmail(email)) {
            setError('Digite um e-mail válido para a recuperação.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setSuccessMsg(null);

        try {
            await sendPasswordResetEmail(auth, email);
            setSuccessMsg('E-mail de recuperação enviado com sucesso. Verifique sua caixa de entrada ou spam.');
            setIsRecovering(false);
        } catch (err: any) {
            console.error("Recovery failed"); // Removed err details for security
            setError('Não foi possível enviar a recuperação para este e-mail. Tente novamente.');
        } finally {
            setIsLoading(false);
        }
    };

    const isInputDisabled = isLoading || lockoutTimer > 0;

    return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-brand-emerald via-emerald-800 to-slate-950 overflow-y-auto relative font-sans p-6 py-12">
            <div className="mb-10 animate-in fade-in zoom-in duration-700">
                <img src="/marbleflow-logo.png" alt="MarbleFlow" className="h-40 w-auto object-contain drop-shadow-2xl" />
            </div>

            <div className="relative z-10 w-full max-w-md bg-white rounded-3xl border border-white/20 shadow-2xl flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-700 shrink-0 overflow-hidden">
                <div className="w-full bg-slate-50 border-b border-slate-100 p-8 pb-6 flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-emerald-100 text-brand-emerald rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                        <LockIcon className="w-8 h-8" strokeWidth={2.5} />
                    </div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Bem-vindo de volta</h1>
                    <p className="text-slate-500 text-sm mt-1 font-medium">Acesse sua conta para gerenciar seus orçamentos com segurança</p>
                </div>

                <div className="w-full p-8 pt-6">
                    {/* Error and Success Messages */}
                    {error && (
                        <div className="w-full bg-rose-50 border border-rose-200 text-rose-600 text-[13px] px-4 py-3 rounded-xl mb-6 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 shadow-sm transition-all duration-300">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <p className="font-bold leading-relaxed">{error}</p>
                        </div>
                    )}

                    {successMsg && (
                        <div className="w-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[13px] px-4 py-3 rounded-xl mb-6 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 shadow-sm">
                            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <p className="font-bold leading-relaxed">{successMsg}</p>
                        </div>
                    )}

                    <form onSubmit={isRecovering ? handleRecovery : handleLogin} className="w-full space-y-5">
                        <div className="space-y-1.5 text-left w-full group">
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1 group-focus-within:text-brand-emerald transition-colors">E-mail Corporativo</label>
                            <Input
                                ref={emailRef}
                                type="email"
                                required
                                disabled={isInputDisabled}
                                autoComplete="username"
                                placeholder="nome@empresa.com.br"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="bg-white border-2 border-slate-200 text-slate-900 placeholder:text-slate-300 h-14 text-base rounded-2xl focus:border-brand-emerald focus:ring-4 focus:ring-brand-emerald/10 font-bold transition-all disabled:bg-slate-50 disabled:text-slate-400 shadow-sm"
                            />
                        </div>

                        {!isRecovering && (
                            <div className="space-y-1.5 text-left w-full group">
                                <div className="flex items-center justify-between ml-1">
                                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest group-focus-within:text-brand-emerald transition-colors">Senha de Acesso</label>
                                    <button
                                        type="button"
                                        disabled={isInputDisabled}
                                        onClick={() => { setIsRecovering(true); setError(null); setSuccessMsg(null); }}
                                        className="text-[11px] font-bold text-slate-400 hover:text-brand-emerald transition-colors disabled:opacity-50"
                                    >
                                        Esqueceu a senha?
                                    </button>
                                </div>
                                <div className="relative">
                                    <Input
                                        ref={passwordRef}
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        disabled={isInputDisabled}
                                        autoComplete="current-password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="bg-white border-2 border-slate-200 text-slate-900 placeholder:text-slate-300 h-14 text-base rounded-2xl focus:border-brand-emerald focus:ring-4 focus:ring-brand-emerald/10 pr-12 font-bold transition-all disabled:bg-slate-50 disabled:text-slate-400 shadow-sm tracking-wider"
                                    />
                                    {/* Advanced Password Peek: Hold to show */}
                                    <button
                                        type="button"
                                        disabled={isInputDisabled}
                                        onMouseDown={() => setShowPassword(true)}
                                        onMouseUp={() => setShowPassword(false)}
                                        onMouseLeave={() => setShowPassword(false)}
                                        onTouchStart={() => setShowPassword(true)}
                                        onTouchEnd={() => setShowPassword(false)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-emerald hover:bg-emerald-50 w-10 h-10 flex items-center justify-center rounded-xl transition-all disabled:opacity-50 select-none outline-none"
                                        title="Segure para visualizar a senha"
                                    >
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>

                                <div className="flex items-start mt-5 mb-2 ml-1">
                                    <input
                                        type="checkbox"
                                        id="rememberMe"
                                        disabled={isInputDisabled}
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                        className="w-4 h-4 mt-0.5 rounded border-slate-300 text-brand-emerald focus:ring-brand-emerald cursor-pointer disabled:opacity-50 transition-colors"
                                    />
                                    <label htmlFor="rememberMe" className="ml-2.5 flex flex-col cursor-pointer select-none">
                                        <span className="text-xs font-bold text-slate-600">Lembrar este dispositivo</span>
                                        {rememberMe ? (
                                            <span className="text-[10px] text-emerald-600 font-semibold animate-in fade-in slide-in-from-top-1">
                                                Este dispositivo será lembrado.
                                            </span>
                                        ) : (
                                            <span className="text-[10px] text-slate-400 font-semibold animate-in fade-in slide-in-from-top-1">
                                                Seu acesso não será mantido após fechar o navegador.
                                            </span>
                                        )}
                                    </label>
                                </div>
                            </div>
                        )}

                        <div className="pt-2">
                            <Button
                                type="submit"
                                disabled={isInputDisabled || !isValidForm}
                                className={cn(
                                    "w-full h-14 rounded-2xl text-white font-black text-[13px] uppercase tracking-widest transition-all flex justify-center items-center shadow-xl hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0 relative overflow-hidden group",
                                    lockoutTimer > 0 
                                        ? "bg-rose-500 hover:bg-rose-600 shadow-rose-500/20" 
                                        : "bg-brand-emerald hover:bg-emerald-600 shadow-brand-emerald/20 hover:shadow-brand-emerald/40"
                                )}
                            >
                                <div className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] skew-x-12"></div>
                                {isLoading ? (
                                    <div className="flex items-center gap-3">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Autenticando...</span>
                                    </div>
                                ) : lockoutTimer > 0 ? (
                                    <span>AGUARDE {lockoutTimer}S</span>
                                ) : isRecovering ? (
                                    'ENVIAR LINK DE RECUPERAÇÃO'
                                ) : (
                                    'ENTRAR COM SEGURANÇA'
                                )}
                            </Button>
                        </div>
                        
                        <div className="flex items-center justify-center gap-2 mt-5 opacity-70">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Ambiente seguro e criptografado
                            </span>
                        </div>

                        {!isRecovering ? (
                            <div className="flex justify-center mt-6 pt-6 border-t border-slate-100">
                                <button
                                    type="button"
                                    disabled={isInputDisabled}
                                    onClick={onNavigateToRegister}
                                    className="text-xs text-slate-500 hover:text-slate-900 transition-colors py-2 font-medium disabled:opacity-50"
                                >
                                    Novo por aqui? <span className="text-brand-emerald font-black ml-1 uppercase tracking-wider">Criar conta</span>
                                </button>
                            </div>
                        ) : (
                            <div className="flex justify-center mt-6 pt-6 border-t border-slate-100">
                                <button
                                    type="button"
                                    disabled={isInputDisabled}
                                    onClick={() => { setIsRecovering(false); setError(null); setSuccessMsg(null); }}
                                    className="text-xs text-slate-500 hover:text-slate-900 font-black uppercase tracking-wider transition-colors py-2 disabled:opacity-50 flex items-center gap-1"
                                >
                                    ← Voltar para o Login
                                </button>
                            </div>
                        )}
                    </form>
                    
                    {/* Placeholder para integração futura de reCAPTCHA invisível */}
                    <div id="recaptcha-container" className="hidden"></div>
                </div>
            </div>

            <div className="mt-12 text-[11px] text-white/50 text-center font-bold tracking-widest uppercase">
                © {new Date().getFullYear()} Marble Flow - Gestão Inteligente
            </div>
        </div>
    );
});
