import { safeArray } from '../../lib/dataDiagnostics';
import React, { useState, useRef, useEffect } from 'react';
import { toISODateSafe } from '../../lib/dateWriteUtils';
import { useOutletContext } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { normalizeText, displayOrFallback } from '../../utils/textUtils';

import { Input } from '../../components/ui/Input';
import { Trash2, Edit2, Upload, BadgeHelp, X, Printer, Image as ImageIcon, Key, Loader2, ArrowLeft, Copy, Check, ShieldCheck, Eye, EyeOff } from 'lucide-react';

import { useAuth, type UserProfile } from '../../context/AuthContext';
import { storage, auth, db, firebaseConfig } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { cn } from '../../lib/utils';
import { safeString, safeSplit } from '../../lib/dataDiagnostics';

interface StaffViewProps {}

export const StaffView: React.FC<StaffViewProps> = () => {
    const { profile } = useAuth();
    const { isAddStaffModalOpen, setIsAddStaffModalOpen } = useOutletContext<any>();
    const [searchText, setSearchText] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | 'admin' | 'vendedor' | 'seller' | 'medidor' | 'producao' | 'instalador'>('all');

    const [users, setUsers] = useState<UserProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const [badgeModalOpen, setBadgeModalOpen] = useState(false);
    const [badgeData, setBadgeData] = useState<UserProfile | null>(null);

    // Credentials display after creation / reset
    const [generatedCredentials, setGeneratedCredentials] = useState<{ email: string; pass: string; type?: 'creation' | 'reset' } | null>(null);
    const [copiedField, setCopiedField] = useState<'email' | 'pass' | null>(null);

    // Form State
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<UserProfile['role']>('seller');
    const [photoUrl, setPhotoUrl] = useState('');

    // Extra fields
    const [cpf, setCpf] = useState('');
    const [phone, setPhone] = useState('');
    const [bloodType, setBloodType] = useState('');

    // Password change state
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const isLoginlessRole = role === 'serrador' || role === 'acabador' || role === 'instalador';
    const isUserLoginless = (uRole: string) => uRole === 'serrador' || uRole === 'acabador' || uRole === 'instalador';

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch users from Firestore
    useEffect(() => {
        if (!profile?.companyId) return;
        const q = query(collection(db, 'users'), where('companyId', '==', profile.companyId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let usersData = safeArray(snapshot.docs).map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
            usersData = usersData.filter(u => u.role !== 'superadmin' && u.email !== 'rdmarketingcomercial@gmail.com');
            setUsers(usersData);
            setIsLoading(false);
        }, (error) => {
            console.error('Error fetching users:', error);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [profile?.companyId]);

    useEffect(() => {
        if (isAddStaffModalOpen && !editingUser && !name && !email) {
            handleOpenForm();
        }
    }, [isAddStaffModalOpen]);

    const resetForm = () => {
        setName(''); setEmail(''); setPassword(''); setRole('seller'); setPhotoUrl('');
        setCpf(''); setPhone(''); setBloodType('');
        setEditingUser(null);
        setGeneratedCredentials(null);
        setNewPassword('');
        setConfirmPassword('');
        setShowNewPassword(false);
        setShowConfirmPassword(false);
    };

    const handleOpenForm = (user?: UserProfile) => {
        if (user) {
            setEditingUser(user);
            setName(user.name || '');
            setEmail(user.email || '');
            setRole(user.role || 'seller');
            setPhotoUrl(user.photoUrl || '');
            setCpf(user.cpf || '');
            setPhone(user.phone || '');
            setBloodType(user.bloodType || '');
        } else {
            resetForm();
            // Auto-generate random password for new medidor if role is pre-selected or just as default helper
            const randomPass = Math.random().toString(36).slice(-8);
            setPassword(randomPass);
        }
        setIsAddStaffModalOpen(true);
    };

    const handleCloseForm = () => {
        setIsAddStaffModalOpen(false);
        resetForm();
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!auth.currentUser) {
            alert("Sessão expirada. Por favor, faça login novamente.");
            return;
        }

        setIsProcessing(true);
        try {
            if (!profile?.companyId) throw new Error("Company ID not found");
            const storageRef = ref(storage, `staff_photos/${profile.companyId}/${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            setPhotoUrl(downloadURL);
        } catch (error: any) {
            console.error("Upload failed:", error);
            alert("Erro ao subir foto: " + error.message);
        } finally {
            setIsProcessing(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isProcessing) return;

        setIsProcessing(true);
        try {
            if (editingUser) {
                if (newPassword) {
                    if (newPassword.length < 6) {
                        alert('A senha deve ter no mínimo 6 caracteres.');
                        setIsProcessing(false);
                        return;
                    }
                    if (newPassword !== confirmPassword) {
                        alert('As senhas não coincidem.');
                        setIsProcessing(false);
                        return;
                    }

                    try {
                        if (editingUser.uid === auth.currentUser?.uid) {
                            if (!auth.currentUser) throw new Error("Usuário não autenticado no Firebase Auth.");
                            await updatePassword(auth.currentUser, newPassword);
                        } else {
                            const callerRole = profile?.role;
                            if (callerRole !== 'company_admin' && callerRole !== 'admin' && callerRole !== 'superadmin') {
                                alert('Apenas administradores podem alterar a senha de outros colaboradores.');
                                setIsProcessing(false);
                                return;
                            }
                            const functions = getFunctions();
                            const changePasswordFn = httpsCallable<{ uid: string; newPassword: string }, { success: boolean }>(functions, 'changeUserPassword');
                            await changePasswordFn({ uid: editingUser.uid, newPassword: newPassword });
                        }
                        alert('Senha atualizada com sucesso.');
                    } catch (pwError: any) {
                        console.error("Erro ao alterar senha:", pwError);
                        alert("Erro ao alterar senha: " + (pwError.message || "Erro desconhecido"));
                        setIsProcessing(false);
                        return;
                    }
                }

                if (!isLoginlessRole && email !== editingUser.email) {
                    if (editingUser.uid === auth.currentUser?.uid) {
                        alert('Para alterar o seu próprio e-mail, utilize as configurações do perfil no menu principal.');
                        setIsProcessing(false);
                        return;
                    } else {
                        const callerRole = profile?.role;
                        if (callerRole !== 'company_admin' && callerRole !== 'admin' && callerRole !== 'superadmin') {
                            alert('Apenas administradores podem alterar o e-mail de outros colaboradores.');
                            setIsProcessing(false);
                            return;
                        }
                        const functions = getFunctions();
                        const changeEmailFn = httpsCallable<{ uid: string; newEmail: string }, { success: boolean }>(functions, 'changeUserEmail');
                        await changeEmailFn({ uid: editingUser.uid, newEmail: email });
                    }
                }

                const userRef = doc(db, 'users', editingUser.uid);
                await updateDoc(userRef, {
                    name,
                    role,
                    photoUrl,
                    cpf,
                    phone,
                    bloodType,
                    email
                });
                alert('Usuário atualizado com sucesso!');
                handleCloseForm();
            } else if (isLoginlessRole) {
                const usersRef = collection(db, 'users');
                const newDocRef = doc(usersRef);
                const newUid = newDocRef.id;

                await setDoc(newDocRef, {
                    uid: newUid,
                    name,
                    email: email || '',
                    role,
                    companyId: profile?.companyId,
                    status: 'approved',
                    active: true,
                    photoUrl,
                    cpf,
                    phone,
                    bloodType,
                    createdAt: toISODateSafe(new Date())
                });
                alert('Profissional cadastrado com sucesso!');
                handleCloseForm();
            } else {
                let finalEmail = email;
                let finalPassword = password;

                if (role === 'vendedor' || role === 'seller' || role === 'medidor') {
                    // Auto-generate Login/Pass for Sellers and Measurers
                    const nameNormalized = normalizeText(name)
                        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
                        .replace(/[^a-z0-9]/g, '.'); // replace non-chars with dot
                        
                    const prefix = safeSplit(nameNormalized, ' ', 'staff', 'name_generation')
                        .filter(Boolean)
                        .slice(0, 2)
                        .join('.');
                    const randomSuffix = Math.floor(10 + Math.random() * 89);
                    const domain = (role === 'vendedor' || role === 'seller') ? 'vendedor.flow' : 'medidor.flow';
                    
                    finalEmail = `${prefix}${randomSuffix}@${domain}`;
                    finalPassword = Math.random().toString(36).slice(-10) + Math.floor(Math.random() * 9);
                }

                if (!finalEmail || !finalPassword) throw new Error('Dados de acesso não gerados corretamente.');
                
                const secondaryApp = initializeApp(firebaseConfig, 'secondary');
                const secondaryAuth = getAuth(secondaryApp);
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, finalEmail, finalPassword);
                const newUser = userCredential.user;

                await setDoc(doc(db, 'users', newUser.uid), {
                    uid: newUser.uid,
                    name,
                    email: finalEmail,
                    role,
                    companyId: profile?.companyId,
                    status: 'approved',
                    photoUrl,
                    cpf,
                    phone,
                    bloodType,
                    createdAt: toISODateSafe(new Date())
                });

                await deleteApp(secondaryApp);
                
                // Set generated credentials to show in modal
                setGeneratedCredentials({ email: finalEmail, pass: finalPassword });
                alert('Usuário criado com sucesso! Guarde os dados de acesso expostos.');
            }
        } catch (error: any) {
            console.error("Error saving user:", error);
            alert("Erro: " + (error.message || "Desconhecido"));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCopy = (text: string, field: 'email' | 'pass') => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const handleResetPassword = async (userEmail: string) => {
        if (!window.confirm(`Garantir reset de senha para ${userEmail}? Um e-mail de redefinição será enviado.`)) return;
        
        try {
            await sendPasswordResetEmail(auth, userEmail);
            alert("Link de redefinição de senha enviado para o e-mail do colaborador.");
            // After sending email, we show a success modal that reset was requested
            setGeneratedCredentials({ email: userEmail, pass: 'Redefinição enviada p/ e-mail', type: 'reset' });
            setIsAddStaffModalOpen(true);
        } catch (error: any) {
            console.error("Error resetting password:", error);
            alert("Erro ao enviar e-mail: " + error.message);
        }
    };

    const handleToggleStatus = async (user: UserProfile) => {
        const newStatus = user.status === 'blocked' ? 'approved' : 'blocked';
        const msg = newStatus === 'blocked' ? 'Bloquear acesso deste usuário?' : 'Reativar acesso do usuário?';
        if (!window.confirm(msg)) return;

        try {
            await updateDoc(doc(db, 'users', user.uid), { status: newStatus });
        } catch (error: any) {
            alert("Erro ao atualizar status: " + error.message);
        }
    };

    const handleDeleteUser = async (uid: string) => {
        if (!window.confirm('Tem certeza? Isso removerá o acesso do usuário no banco de dados.')) return;
        
        try {
            await deleteDoc(doc(db, 'users', uid));
            alert('Usuário removido do sistema.');
        } catch (error: any) {
            console.error("Error deleting user:", error);
            alert("Erro ao deletar: " + error.message);
        }
    };

    const filteredUsers = safeArray(users).filter(u => {
        const searchLower = normalizeText(searchText);
        const matchesSearch = normalizeText(u?.name).includes(searchLower) ||
            normalizeText(u?.email).includes(searchLower) ||
            normalizeText(u?.role).includes(searchLower);
        
        const userRole = normalizeText(u?.role);
        if (activeFilter === 'all') return matchesSearch;
        if (activeFilter === 'admin') return matchesSearch && (userRole === 'company_admin' || userRole === 'superadmin');
        if (activeFilter === 'vendedor' || activeFilter === 'seller') return matchesSearch && (userRole === 'vendedor' || userRole === 'seller');
        if (activeFilter === 'medidor') return matchesSearch && userRole === 'medidor';
        if (activeFilter === 'producao') return matchesSearch && (userRole === 'serrador' || userRole === 'acabador' || userRole === 'producao');
        if (activeFilter === 'instalador') return matchesSearch && userRole === 'instalador';
        
        return matchesSearch;
    });

    const openBadge = (user: UserProfile) => {
        setBadgeData(user);
        setBadgeModalOpen(true);
    };

    return (
        <div className="animate-in fade-in duration-500 space-y-[var(--density-gap)]">
            {/* FILTERS BAR */}
            <div className="flex flex-wrap items-center justify-between bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 md:pb-0">
                    <button 
                        onClick={() => setActiveFilter('all')}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap border",
                            activeFilter === 'all' ? "bg-slate-900 border-slate-900 text-white shadow-sm" : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                        )}
                    >
                        Tudo ({users.length})
                    </button>
                    <button 
                        onClick={() => setActiveFilter('admin')}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap border",
                            activeFilter === 'admin' ? "bg-brand-rocha-primary border-brand-rocha-primary text-white shadow-sm" : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                        )}
                    >
                        Administração
                    </button>
                    <button 
                        onClick={() => setActiveFilter('vendedor')}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap border",
                            activeFilter === 'vendedor' ? "bg-blue-600 border-blue-600 text-white shadow-sm" : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                        )}
                    >
                        Vendedores
                    </button>
                    <button 
                        onClick={() => setActiveFilter('medidor')}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap border",
                            activeFilter === 'medidor' ? "bg-amber-600 border-amber-600 text-white shadow-sm" : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                        )}
                    >
                        Medidores
                    </button>
                    <button 
                        onClick={() => setActiveFilter('producao')}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap border",
                            activeFilter === 'producao' ? "bg-cyan-600 border-cyan-600 text-white shadow-sm" : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                        )}
                    >
                        Produção
                    </button>
                    <button 
                        onClick={() => setActiveFilter('instalador')}
                        className={cn(
                            "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap border",
                            activeFilter === 'instalador' ? "bg-emerald-600 border-emerald-600 text-white shadow-sm" : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                        )}
                    >
                        Instaladores
                    </button>
                </div>
            </div>

            <div className="rocha-panel bg-white p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="rocha-text-label text-slate-400 border-b border-slate-100 bg-slate-50/10">
                            <tr>
                                <th className="rocha-table-cell w-12 text-center">Foto</th>
                                <th className="rocha-table-cell">Profissional</th>
                                <th className="rocha-table-cell">Cargo / Função</th>
                                <th className="rocha-table-cell">Status</th>
                                <th className="rocha-table-cell text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500 font-medium">Carregando membros da equipe...</td></tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-20 text-center">
                                    <div className="flex flex-col items-center">
                                        <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                            <BadgeHelp className="h-8 w-8 text-slate-300" />
                                        </div>
                                        <p className="text-slate-500 font-bold">Nenhum funcionário encontrado</p>
                                        <p className="text-slate-400 text-xs mt-1">Tente ajustar o filtro ou a pesquisa.</p>
                                    </div>
                                </td></tr>
                            ) : (
                                safeArray(filteredUsers).map(u => (
                                    <tr key={u.uid} className="rocha-table-row group">
                                        <td className="rocha-table-cell">
                                            <div className="w-9 h-9 rounded-lg bg-white overflow-hidden border border-slate-100 flex items-center justify-center shadow-sm mx-auto">
                                                {u.photoUrl ? (
                                                    <img src={u.photoUrl} alt={displayOrFallback(u?.name, "Nome não informado")} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-slate-300 font-black text-[10px] uppercase">{displayOrFallback(u?.name || u?.email, 'U').substring(0, 2)}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="rocha-table-cell">
                                            <div className="font-black text-slate-900 text-sm tracking-tight uppercase leading-none">{displayOrFallback(u?.name, "Nome não informado")}</div>
                                            <div className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1 opacity-70 leading-none">{isUserLoginless(u?.role) ? (u?.email || 'CADASTRO RH (SEM LOGIN)') : displayOrFallback(u?.email, "E-mail não informado")}</div>
                                        </td>
                                        <td className="rocha-table-cell">
                                            <span className={cn(
                                                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                                                !u?.role ? "bg-slate-50 text-slate-400 border-slate-100" :
                                                u.role === 'superadmin' ? "bg-rose-50 text-rose-600 border-rose-100" :
                                                u.role === 'company_admin' ? "bg-violet-50 text-brand-rocha-primary border-violet-100" :
                                                u.role === 'medidor' ? "bg-amber-50 text-amber-600 border-amber-100" :
                                                u.role === 'serrador' ? "bg-cyan-50 text-cyan-600 border-cyan-100" :
                                                u.role === 'acabador' ? "bg-teal-50 text-teal-600 border-teal-100" :
                                                u.role === 'instalador' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                                "bg-blue-50 text-blue-600 border-blue-100"
                                            )}>
                                                {!u?.role ? 'Função não informada' :
                                                 u.role === 'medidor' ? 'Medição Técnica' : 
                                                 u.role === 'serrador' ? 'Serrador' : 
                                                 u.role === 'acabador' ? 'Acabador' : 
                                                 u.role === 'instalador' ? 'Instalador' : 
                                                 safeSplit(u.role, '_', 'staff', 'user.role').join(' ').toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="rocha-table-cell">
                                             <button 
                                                 onClick={() => handleToggleStatus(u)}
                                                 className={cn(
                                                     "flex items-center gap-2 px-2 py-0.5 rounded border transition-all active:scale-95",
                                                     !u?.status ? "bg-slate-50 text-slate-400 border-slate-100" :
                                                     u.status === 'blocked' ? "bg-slate-50 text-slate-400 border-slate-100" :
                                                     "bg-emerald-50 text-emerald-600 border-emerald-100"
                                                  )}
                                             >
                                                 <div className={cn("w-1.5 h-1.5 rounded-full", !u?.status ? "bg-slate-300" : u.status === 'blocked' ? "bg-slate-300" : "bg-emerald-500")} />
                                                 <span className="text-[9px] font-black uppercase tracking-widest">
                                                     {!u?.status ? 'Status não informado' : u.status === 'blocked' ? 'Inativo' : 'Operacional'}
                                                 </span>
                                             </button>
                                        </td>
                                        <td className="rocha-table-cell text-right">
                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                <Button size="icon" onClick={() => openBadge(u)} title="Crachá" className="h-7 w-7 rounded-lg bg-slate-50 text-slate-400 hover:text-brand-rocha-primary hover:bg-violet-50">
                                                    <BadgeHelp className="h-3.5 w-3.5" />
                                                </Button>
                                                {!isUserLoginless(u.role) && (
                                                    <Button size="icon" onClick={() => handleResetPassword(u.email)} title="Resetar Senha" className="h-7 w-7 rounded-lg bg-slate-50 text-slate-400 hover:text-amber-600 hover:bg-amber-50">
                                                        <Key className="h-3.5 w-3.5" />
                                                    </Button>
                                                )}
                                                <Button size="icon" onClick={() => handleOpenForm(u)} title="Editar" className="h-7 w-7 rounded-lg bg-slate-50 text-slate-400 hover:text-slate-900 hover:bg-slate-100">
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                </Button>
                                                {u.uid !== profile?.uid && (
                                                    <Button size="icon" onClick={() => handleDeleteUser(u.uid)} title="Excluir" className="h-7 w-7 rounded-lg bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* FORM MODAL */}
            {isAddStaffModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-2xl flex flex-col max-h-[90vh] shadow-2xl overflow-hidden border border-slate-100">
                        <div className="flex items-center justify-between p-10 border-b border-slate-50">
                            <div>
                                <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight leading-none tabular-nums">
                                    {editingUser ? 'Ajustar Perfil' : 'Novo Acesso'}
                                </h2>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-3 opacity-60">Configurações de Identidade e Permissões</p>
                            </div>
                            <Button variant="ghost" onClick={handleCloseForm} className="h-12 w-12 rounded-2xl hover:bg-slate-50 transition-all">
                                <X className="h-6 w-6 text-slate-300" />
                            </Button>
                        </div>

                        <div className={cn("p-10 overflow-y-auto flex-1 custom-scrollbar", generatedCredentials && "bg-slate-900")}>
                            {generatedCredentials ? (
                                <div className="space-y-10 animate-in zoom-in-95 duration-500">
                                    <div className="flex flex-col items-center text-center">
                                        <div className={cn(
                                            "h-20 w-20 text-white rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl",
                                            generatedCredentials.type === 'reset' ? "bg-amber-500 shadow-amber-500/20" : "bg-emerald-500 shadow-emerald-500/20"
                                        )}>
                                            {generatedCredentials.type === 'reset' ? <Key className="h-10 w-10" /> : <ShieldCheck className="h-10 w-10" />}
                                        </div>
                                        <h3 className="text-2xl font-black text-white mb-3 uppercase tracking-tight">
                                            {generatedCredentials.type === 'reset' ? 'Redefinição Iniciada' : 'Acesso Habilitado'}
                                        </h3>
                                        <p className="text-slate-400 text-xs font-black uppercase tracking-widest max-w-sm opacity-80">
                                            {generatedCredentials.type === 'reset' 
                                                ? 'Um e-mail de recuperação foi enviado. Informe os dados abaixo para o profissional caso ele não localize o link.'
                                                : 'Copie os dados abaixo e envie para o novo funcionário. Por segurança, a senha não será exibida novamente.'}
                                        </p>
                                    </div>

                                    <div className="space-y-6">
                                        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 relative group overflow-hidden">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] block mb-3">Usuário de Login</label>
                                            <div className="flex items-center justify-between">
                                                <span className="text-white font-mono text-xl tracking-wider">{generatedCredentials.email}</span>
                                                <Button 
                                                    onClick={() => handleCopy(generatedCredentials.email, 'email')}
                                                    variant="ghost" 
                                                    className="h-12 px-6 text-emerald-400 hover:bg-emerald-400/10 font-black text-[10px] uppercase tracking-widest rounded-2xl"
                                                >
                                                    {copiedField === 'email' ? <Check className="h-4 w-4 mr-3" /> : <Copy className="h-4 w-4 mr-3" />}
                                                    {copiedField === 'email' ? 'Copiado' : 'Copiar Login'}
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 relative group overflow-hidden">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] block mb-3">
                                                {generatedCredentials.type === 'reset' ? 'Status' : 'Senha de Acesso'}
                                            </label>
                                            <div className="flex items-center justify-between">
                                                <span className={cn("font-mono text-xl tracking-[0.3em]", generatedCredentials.type === 'reset' ? "text-amber-400" : "text-white")}>
                                                    {generatedCredentials.pass}
                                                </span>
                                                {generatedCredentials.type !== 'reset' && (
                                                    <Button 
                                                        onClick={() => handleCopy(generatedCredentials.pass, 'pass')}
                                                        variant="ghost" 
                                                        className="h-12 px-6 text-emerald-400 hover:bg-emerald-400/10 font-black text-[10px] uppercase tracking-widest rounded-2xl"
                                                    >
                                                        {copiedField === 'pass' ? <Check className="h-4 w-4 mr-3" /> : <Copy className="h-4 w-4 mr-3" />}
                                                        {copiedField === 'pass' ? 'Copiada' : 'Copiar Senha'}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <Button onClick={handleCloseForm} className="w-full h-16 bg-white hover:bg-slate-100 text-slate-900 font-black uppercase text-[11px] tracking-[0.2em] rounded-[1.5rem] shadow-2xl active:scale-95 transition-all">
                                        Finalizar Configuração
                                    </Button>
                                </div>
                            ) : (
                                <form id="user-form" onSubmit={handleSubmit} className="space-y-10">
                                    <div className="flex gap-10 items-center bg-slate-50 p-10 rounded-[2.5rem] border border-slate-100 border-dashed">
                                        <div
                                            className="w-28 h-28 rounded-full bg-white border-4 border-white flex items-center justify-center shadow-xl overflow-hidden cursor-pointer hover:opacity-90 transition-all relative group"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            {photoUrl ? (
                                                <img src={photoUrl} alt="Foto" className="w-full h-full object-cover" />
                                            ) : (
                                                <ImageIcon className="h-10 w-10 text-slate-200" />
                                            )}
                                            {isProcessing && (
                                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                                    <Loader2 className="h-8 w-8 text-white animate-spin" />
                                                </div>
                                            )}
                                            <input type="file" className="hidden" ref={fileInputRef} accept="image/*" onChange={handlePhotoUpload} />
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="font-black text-slate-900 text-lg uppercase tracking-tight">Fotografia Oficial</h4>
                                            <p className="text-[10px] text-slate-400 mt-1 uppercase font-black tracking-widest opacity-60">Padrão para crachás e identificação no ERP</p>
                                            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className="mt-5 rounded-xl border-slate-200 h-10 px-6 text-[10px] font-black uppercase tracking-widest">
                                                <Upload className="h-4 w-4 mr-3" /> Alterar Foto
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3 md:col-span-2">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Nome Completo do Profissional</label>
                                            <Input required value={name} onChange={e => setName(e.target.value)} placeholder="Ex: João Silva" className="h-14 rounded-2xl bg-white border-slate-100 px-6 text-base font-black uppercase tracking-tight" />
                                        </div>

                                        {(!editingUser && (role === 'vendedor' || role === 'seller' || role === 'medidor')) ? null : (
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">
                                                    {isLoginlessRole ? 'E-mail (Opcional)' : 'E-mail corporativo / Login'}
                                                </label>
                                                <Input required={!isLoginlessRole} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@marmoflow.com" className="h-14 rounded-2xl bg-white border-slate-100 px-6 font-bold" disabled={isLoginlessRole} />
                                            </div>
                                        )}
 
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Departamento / Atribuição</label>
                                            <select
                                                required
                                                value={role}
                                                onChange={(e) => setRole(e.target.value as any)}
                                                className="flex h-14 w-full rounded-2xl border border-slate-100 bg-white px-6 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-rocha-primary font-black uppercase tracking-widest transition-all shadow-sm"
                                            >
                                                <option value="seller">Vendas e Relacionamento</option>
                                                <option value="medidor">Agendamento de Medição</option>
                                                <option value="serrador">Serrador (Fábrica)</option>
                                                <option value="acabador">Acabador (Fábrica)</option>
                                                <option value="instalador">Instalação e Logística</option>
                                                <option value="company_admin">Diretoria / Gestão</option>
                                            </select>
                                        </div>
 
                                        {(!editingUser && role !== 'vendedor' && role !== 'medidor' && !isLoginlessRole) && (
                                            <div className="space-y-2 md:col-span-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex justify-between">
                                                    Senha Temporária 
                                                    <span className="text-amber-500 normal-case lowercase font-medium">será gerada automaticamente se preferir</span>
                                                </label>
                                                <div className="relative">
                                                    <Input 
                                                        required 
                                                        type="text" 
                                                        value={password} 
                                                        onChange={e => setPassword(e.target.value)} 
                                                        placeholder="Digite uma senha ou use a gerada" 
                                                        className="h-12 rounded-2xl bg-white pr-24" 
                                                        minLength={6} 
                                                    />
                                                    <button 
                                                        type="button"
                                                        onClick={() => setPassword(Math.random().toString(36).slice(-8))}
                                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-indigo-500 uppercase tracking-widest hover:text-indigo-700"
                                                    >
                                                        Gerar Nova
                                                    </button>
                                                </div>
                                            </div>
                                        )}
 
                                        {(!editingUser && (role === 'vendedor' || role === 'medidor')) && (
                                            <div className="md:col-span-2 bg-brand-emerald/5 border border-brand-emerald/10 p-6 rounded-2xl">
                                                <div className="flex items-center gap-3">
                                                    <ShieldCheck className="w-5 h-5 text-brand-emerald" />
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-900">Acesso Automático</p>
                                                        <p className="text-xs text-slate-500 mt-0.5">
                                                            {role === 'medidor' 
                                                                ? 'As credenciais serão geradas automaticamente após o cadastro.' 
                                                                : 'O sistema gerará um login e senha seguros automaticamente para este vendedor.'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {(!editingUser && isLoginlessRole) && (
                                            <div className="md:col-span-2 bg-slate-50 border border-slate-200 p-6 rounded-2xl">
                                                <div className="flex items-center gap-3">
                                                    <ShieldCheck className="w-5 h-5 text-slate-400" />
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-900">Cadastro Operacional Simples</p>
                                                        <p className="text-xs text-slate-500 mt-0.5">
                                                            Este profissional não terá acesso ao sistema. Nenhum usuário será criado no Firebase Auth e nenhuma senha será gerada.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">CPF (Instalador/Medidor)</label>
                                            <Input value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" className="h-12 rounded-2xl bg-white" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Telefone WhatsApp</label>
                                            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" className="h-12 rounded-2xl bg-white" />
                                        </div>
                                    </div>

                                    {editingUser && !isUserLoginless(editingUser.role) && (
                                        <div className="space-y-6 pt-6 border-t border-slate-100">
                                            <div className="flex items-center justify-between">
                                                <h4 className="font-black text-slate-900 text-lg uppercase tracking-tight">Alterar senha de acesso</h4>
                                                <Button type="button" onClick={() => handleResetPassword(editingUser.email)} variant="outline" className="h-10 px-4 text-[10px] font-black uppercase tracking-widest text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-200">
                                                    <Key className="w-4 h-4 mr-2" /> Enviar Link de Redefinição
                                                </Button>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nova senha</label>
                                                    <div className="relative">
                                                        <Input
                                                            type={showNewPassword ? "text" : "password"}
                                                            value={newPassword}
                                                            onChange={e => setNewPassword(e.target.value)}
                                                            placeholder="Mínimo 6 caracteres"
                                                            className="h-12 rounded-2xl bg-white pr-12 font-bold"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowNewPassword(!showNewPassword)}
                                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-all"
                                                        >
                                                            {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirmar nova senha</label>
                                                    <div className="relative">
                                                        <Input
                                                            type={showConfirmPassword ? "text" : "password"}
                                                            value={confirmPassword}
                                                            onChange={e => setConfirmPassword(e.target.value)}
                                                            placeholder="Confirme a nova senha"
                                                            className="h-12 rounded-2xl bg-white pr-12 font-bold"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-all"
                                                        >
                                                            {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </form>
                            )}
                        </div>

                        {!generatedCredentials && (
                            <div className="p-10 border-t border-slate-50 bg-slate-50/50 flex justify-end gap-4">
                                <Button variant="ghost" type="button" onClick={handleCloseForm} className="font-black text-[10px] uppercase tracking-widest text-slate-400 h-14 px-8 rounded-2xl hover:bg-white transition-all">Cancelar</Button>
                                <Button type="submit" form="user-form" className="bg-slate-900 hover:bg-black text-white font-black uppercase text-[11px] tracking-[0.2em] px-14 h-14 rounded-2xl shadow-2xl shadow-slate-200 active:scale-95 transition-all" disabled={isProcessing}>
                                    {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : editingUser ? 'Salvar Alterações' : 'Confirmar Habilitação'}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* CRACHÁ MODAL stays similar but standardized */}
            {badgeModalOpen && badgeData && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 print:bg-white print:p-0 backdrop-blur-md">
                    <div className="relative flex flex-col items-center">
                        <div className="absolute -top-24 w-full max-w-sm mx-auto flex gap-4 items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-2xl print:hidden">
                            <Button variant="ghost" className="h-10 w-10 p-0 rounded-full" onClick={() => setBadgeModalOpen(false)}><ArrowLeft className="h-5 w-5" /></Button>
                            <Button className="bg-brand-emerald text-white font-black uppercase text-[10px] tracking-widest h-10 px-6 rounded-xl shadow-xl" onClick={() => window.print()}>
                                <Printer className="mr-2 h-4 w-4" /> Imprimir
                            </Button>
                        </div>

                        <div className="bg-white w-[54mm] h-[86mm] max-w-[350px] aspect-[54/86] rounded-xl shadow-2xl overflow-hidden flex flex-col relative print:shadow-none border border-gray-200">
                           <div className="h-1/3 bg-slate-900 w-full absolute top-0 left-0" />
                           <div className="z-10 flex flex-col items-center pt-8 px-4 flex-1">
                               <div className="text-white font-black text-xl italic tracking-tighter mb-6">
                                   MARBLE<span className="text-brand-emerald">FLOW</span>
                               </div>
                               <div className="w-24 h-24 rounded-full bg-white shadow-xl border-4 border-white overflow-hidden z-20 mb-4">
                                    {badgeData.photoUrl ? (
                                        <img src={badgeData.photoUrl} alt="Foto" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-slate-50 flex items-center justify-center text-slate-200 font-bold text-2xl uppercase">
                                            {(badgeData.name || badgeData.email || 'U').substring(0, 2)}
                                        </div>
                                    )}
                               </div>
                               <div className="text-center w-full">
                                   <h1 className="text-base font-black text-slate-900 leading-tight uppercase px-2 mb-1">{displayOrFallback(badgeData.name, "Nome não informado")}</h1>
                                   <div className="inline-block px-3 py-1 bg-slate-100 rounded-lg border border-slate-200">
                                       <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                           {!badgeData.role ? 'Função não informada' : badgeData.role === 'medidor' ? 'Medidor Técnico' : badgeData.role.toUpperCase()}
                                       </span>
                                   </div>
                               </div>
                           </div>
                           <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col items-center gap-1">
                                <span className="text-[7px] font-bold text-slate-400 uppercase">Acesso Autorizado</span>
                                <div className="h-6 w-32 bg-slate-200 rounded animate-pulse" />
                           </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
