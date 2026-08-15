import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { AlertCircle, Building2, CheckCircle2, Loader2, LogOut, Clock } from 'lucide-react';

export const ReactivationScreen: React.FC = () => {
    const { profile, user, logout } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasPendingRequest, setHasPendingRequest] = useState(false);
    const [loadingRequest, setLoadingRequest] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const checkPendingRequest = async () => {
            if (!user) return;
            try {
                const q = query(
                    collection(db, 'reactivation_requests'),
                    where('userId', '==', user.uid),
                    where('status', '==', 'pending')
                );
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    setHasPendingRequest(true);
                }
            } catch (err) {
                console.error("Error checking pending request:", err);
            } finally {
                setLoadingRequest(false);
            }
        };

        checkPendingRequest();
    }, [user]);

    const handleRequestReactivation = async () => {
        if (!user || !profile || hasPendingRequest) return;
        setIsSubmitting(true);
        setError('');

        try {
            // Dupla checagem antes de criar
            const q = query(
                collection(db, 'reactivation_requests'),
                where('userId', '==', user.uid),
                where('status', '==', 'pending')
            );
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                setHasPendingRequest(true);
                return;
            }

            await addDoc(collection(db, 'reactivation_requests'), {
                userId: user.uid,
                email: profile.email,
                companyId: profile.companyId,
                companyName: (profile.company as any)?.name || 'Empresa',
                status: 'pending',
                createdAt: serverTimestamp(),
                reason: 'Usuário tentou acessar empresa desativada'
            });

            setHasPendingRequest(true);
        } catch (err: any) {
            console.error("Reactivation request error:", err);
            setError('Ocorreu um erro ao enviar a solicitação. Tente novamente mais tarde.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loadingRequest) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center font-sans">
            <div className="bg-slate-800 p-8 rounded-3xl border border-white/10 max-w-md w-full shadow-2xl relative overflow-hidden">
                {/* Decorative background blur */}
                <div className="absolute -top-32 -left-32 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

                {hasPendingRequest ? (
                    <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
                        <div className="relative mb-6">
                            <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                            <div className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-900 p-1 rounded-full border-2 border-slate-800">
                                <Clock className="w-4 h-4" />
                            </div>
                        </div>
                        <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">Solicitação enviada com sucesso</h2>
                        <div className="bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest mb-6 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                            Em análise
                        </div>
                        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                            Estamos analisando sua solicitação para a empresa <strong className="text-white">{(profile?.company as any)?.name || 'sua empresa'}</strong>. Você será notificado assim que o Super Admin aprovar seu acesso.
                        </p>
                        
                        <div className="space-y-3 w-full">
                            <button 
                                disabled
                                className="flex items-center justify-center gap-2 bg-slate-700 text-slate-400 w-full h-14 rounded-xl font-black uppercase text-xs tracking-widest cursor-not-allowed border border-white/5"
                            >
                                <Clock className="w-5 h-5" /> Aguardando reativação
                            </button>
                            <button 
                                onClick={logout}
                                className="flex items-center justify-center gap-2 bg-transparent text-slate-400 w-full h-14 rounded-xl font-bold hover:text-white transition-colors uppercase text-[10px] tracking-widest"
                            >
                                <LogOut className="w-4 h-4" /> Sair da conta
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500 relative z-10">
                        <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mb-6">
                            <Building2 className="w-10 h-10 text-amber-500" />
                        </div>
                        <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">Empresa Desativada</h2>
                        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                            A empresa associada à sua conta (<strong className="text-white">{(profile?.company as any)?.name || 'N/A'}</strong>) foi inativada do sistema. Para recuperar o acesso e os dados, você pode solicitar a reativação.
                        </p>

                        {error && (
                            <div className="w-full bg-red-500/10 border border-red-500/20 text-red-500 text-xs px-4 py-3 rounded-xl mb-6 flex flex-col items-center text-center">
                                <AlertCircle className="w-5 h-5 mb-1" />
                                <p>{error}</p>
                            </div>
                        )}

                        <div className="space-y-3 w-full">
                            <button 
                                onClick={handleRequestReactivation}
                                disabled={isSubmitting}
                                className="flex items-center justify-center gap-2 bg-amber-500 text-slate-900 w-full h-14 rounded-xl font-black hover:bg-amber-400 transition-colors uppercase text-xs tracking-widest disabled:opacity-50"
                            >
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Solicitar Reativação'}
                            </button>
                            
                            <button 
                                onClick={logout}
                                disabled={isSubmitting}
                                className="flex items-center justify-center gap-2 bg-transparent text-slate-400 w-full h-14 rounded-xl font-bold hover:text-white transition-colors uppercase text-[10px] tracking-widest"
                            >
                                Sair e Voltar ao Início
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

