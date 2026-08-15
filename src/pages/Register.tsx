import { safeArray } from '../lib/dataDiagnostics';
import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Loader2, AlertCircle, Eye, EyeOff, Building2 } from 'lucide-react';
import { normalizeCompanyName, generateSuggestedNames } from '../utils/companyUtils';

interface RegisterProps {
    onNavigateToLogin: () => void;
}

export const Register: React.FC<RegisterProps> = ({ onNavigateToLogin }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showPassword, setShowPassword] = useState(false);

    React.useEffect(() => {
        document.title = `Cadastro | MarbleFlow - Gestão Inteligente marmoraria`;
    }, []);

    const isValidForm = name.trim().length > 2 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
        password.length >= 6 &&
        companyName.trim().length > 2;

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setSuggestions([]);

        try {
            // 1. Normalize company name
            const normalized = normalizeCompanyName(companyName);

            // 2. Pre-check if company already exists to prevent creating orphaned Auth users
            const nameLockRef = doc(db, 'companyNames', normalized);
            const nameLockSnap = await getDoc(nameLockRef);
            if (nameLockSnap.exists()) {
                throw new Error('COMPANY_EXISTS');
            }

            // 3. We must create the Auth user first to get the UID
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 4. Run Transaction for atomic document creation
            const { runTransaction } = await import('firebase/firestore');

            await runTransaction(db, async (transaction) => {
                const nameLockSnapTx = await transaction.get(nameLockRef);

                if (nameLockSnapTx.exists()) {
                    throw new Error('COMPANY_EXISTS');
                }

                const companyId = normalized; // Using normalized name as ID for simplicity and uniqueness
                const companyDocRef = doc(db, 'companies', companyId);
                const userDocRef = doc(db, 'users', user.uid);

                // Create the lock document
                transaction.set(nameLockRef, {
                    companyId: companyId,
                    createdAt: serverTimestamp()
                });

                // Create the company document
                transaction.set(companyDocRef, {
                    id: companyId,
                    name: companyName.trim(),
                    normalizedName: normalized,
                    status: 'pending',
                    createdAt: serverTimestamp()
                });

                // Create the user profile document
                transaction.set(userDocRef, {
                    uid: user.uid,
                    name: name.trim(),
                    email: email.trim(),
                    role: 'company_admin',
                    companyId: companyId,
                    status: 'pending',
                    createdAt: serverTimestamp()
                });
            });

        } catch (err: any) {
            console.error("Register error:", err);

            if (err.message === 'COMPANY_EXISTS') {
                const alternates = generateSuggestedNames(companyName);
                setSuggestions(alternates);
                setError('Já existe uma empresa com este nome. Tente um dos nomes sugeridos abaixo.');
            } else if (err.code === 'auth/email-already-in-use') {
                setError('email-in-use');
            } else if (err.code === 'auth/weak-password') {
                setError('A senha deve ter pelo menos 6 caracteres.');
            } else if (err.code === 'permission-denied') {
                setError('Erro de permissão no banco de dados. Verifique as regras de segurança.');
            } else {
                setError('Ocorreu um erro ao tentar criar a conta. Tente novamente.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-brand-emerald via-emerald-800 to-slate-950 overflow-y-auto relative font-sans p-6 py-12">
            {/* Logo acima do card */}
            <div className="mb-8 animate-in fade-in zoom-in duration-700">
                <img src="/marbleflow-logo.png" alt="MarbleFlow" className="h-40 w-auto object-contain drop-shadow-2xl" />
            </div>

            <div className="relative z-10 w-full max-w-md p-8 pt-10 mx-4 bg-white rounded-3xl border border-white/20 shadow-2xl flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-700 shrink-0">
                <h1 className="text-2xl font-black text-slate-900 mb-2 text-center tracking-tight">Crie sua Conta</h1>
                <p className="text-slate-500 text-sm mb-8 text-center font-medium">Preencha seus dados para acessar o Marble Flow</p>

                {error && (
                    <div className="w-full bg-red-500/10 border border-red-500/20 text-red-500 text-sm px-4 py-3 rounded-xl mb-6 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        {error === 'email-in-use' ? (
                            <div className="space-y-3 w-full">
                                <p className="font-medium text-red-700">Já existe uma conta com este e-mail. Faça login para reativar sua empresa ou recuperar o acesso.</p>
                                <div className="flex gap-2">
                                    <button type="button" onClick={onNavigateToLogin} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-bold text-xs transition-colors">Fazer Login</button>
                                    <button type="button" onClick={onNavigateToLogin} className="border border-red-200 text-red-700 bg-white px-3 py-1.5 rounded-lg font-bold text-xs hover:bg-red-50 transition-colors">Recuperar Senha</button>
                                </div>
                            </div>
                        ) : (
                            <p className="font-medium">{error}</p>
                        )}
                    </div>
                )}

                <form onSubmit={handleRegister} className="w-full space-y-4">
                    <div className="space-y-1.5 text-left w-full">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                        <Input
                            type="text"
                            required
                            placeholder="Seu nome"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 h-14 rounded-xl focus:border-brand-emerald focus:ring-brand-emerald font-medium transition-all"
                        />
                    </div>

                    <div className="space-y-1.5 text-left w-full">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">E-mail Corporativo</label>
                        <Input
                            type="email"
                            required
                            placeholder="seu@email.com.br"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 h-14 rounded-xl focus:border-brand-emerald focus:ring-brand-emerald font-medium transition-all"
                        />
                    </div>

                    <div className="space-y-1.5 text-left w-full">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Empresa</label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                type="text"
                                required
                                placeholder="Ex: Marmoraria Silva"
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 h-14 rounded-xl focus:border-brand-emerald focus:ring-brand-emerald pl-10 font-medium transition-all"
                            />
                        </div>
                    </div>

                    {suggestions.length > 0 && (
                        <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2 animate-in fade-in">
                            <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest text-center">Nomes Disponíveis</p>
                            <div className="flex flex-wrap gap-2 justify-center">
                                {safeArray(suggestions).map(s => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => setCompanyName(s)}
                                        className="text-xs bg-brand-emerald/10 hover:bg-brand-emerald/20 text-brand-emerald px-3 py-1.5 rounded-full border border-brand-emerald/20 transition-all font-bold"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-1.5 text-left w-full">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Senha</label>
                        <div className="relative">
                            <Input
                                type={showPassword ? 'text' : 'password'}
                                required
                                placeholder="Мínimo 6 caracteres"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 h-14 rounded-xl focus:border-brand-emerald focus:ring-brand-emerald pr-10 font-medium transition-all"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-emerald transition-colors"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading || !isValidForm}
                        className="w-full h-14 mt-2 rounded-xl bg-brand-emerald hover:bg-emerald-600 text-white font-black text-lg transition-all flex justify-center items-center shadow-lg shadow-brand-emerald/20 hover:shadow-brand-emerald/40 hover:-translate-y-1 disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                        {isLoading ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                            'CADASTRAR CONTA'
                        )}
                    </Button>

                    <div className="flex justify-center mt-6">
                        <button
                            type="button"
                            onClick={onNavigateToLogin}
                            className="text-sm text-slate-500 hover:text-slate-900 transition-colors py-2"
                        >
                            Já tem uma conta? <span className="text-brand-emerald font-bold ml-1">Fazer login</span>
                        </button>
                    </div>
                </form>
            </div>

            <div className="mt-8 text-sm text-white/50 text-center font-bold tracking-tight">
                © 2026 Marble Flow - Todos os direitos reservados.
            </div>
        </div>
    );
};
