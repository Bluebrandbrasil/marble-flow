import { safeArray } from '../../lib/dataDiagnostics';
import React, { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Mail, Building2, User, Copy, Check, FileText, Loader2, AlertCircle } from 'lucide-react';
import { createCompanyWithAdminInvite } from '../../services/superAdminService';
import { useAuth } from '../../context/AuthContext';

interface CreateCompanyModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

export const CreateCompanyModal: React.FC<CreateCompanyModalProps> = ({ onClose, onSuccess }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [inviteLink, setInviteLink] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        cnpj: '',
        adminName: '',
        adminEmail: '',
        status: 'approved' as 'approved' | 'pending' | 'rejected'
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuggestions([]);
        setLoading(true);

        try {
            if (!user?.uid) throw new Error("Usuário não autenticado");

            const result = await createCompanyWithAdminInvite({
                name: formData.name,
                cnpj: formData.cnpj,
                adminName: formData.adminName,
                adminEmail: formData.adminEmail,
                status: formData.status,
                superAdminUid: user.uid
            });

            const link = `${window.location.origin}/accept-invite?token=${result.inviteId}`;
            setInviteLink(link);
            onSuccess(); // Refresh list behind the modal

        } catch (err: any) {
            const msg = err.message || 'Erro ao criar empresa.';
            if (msg.includes('já existe')) {
                setError('Este nome de empresa já está em uso.');
                setSuggestions([
                    `${formData.name} Oficial`,
                    `${formData.name} Centro`,
                    `${formData.name} Brasil`
                ]);
            } else {
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        if (!inviteLink) return;
        navigator.clipboard.writeText(inviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const inputClasses = "w-full h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:border-transparent transition-all dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-emerald dark:focus:border-brand-emerald placeholder:text-slate-400 dark:placeholder:text-slate-500";
    const inputWithIconClasses = "w-full h-11 rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:border-transparent transition-all dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-emerald dark:focus:border-brand-emerald placeholder:text-slate-400 dark:placeholder:text-slate-500";

    if (inviteLink) {
        return (
            <div className="space-y-6 animate-in fade-in zoom-in duration-300 flex flex-col">
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-8 rounded-2xl text-center">
                    <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Check className="w-8 h-8 text-emerald-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Empresa Criada com Sucesso!</h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-8 text-sm max-w-md mx-auto leading-relaxed">
                        O perfil da empresa foi gerado. Agora, copie o link abaixo e envie para o administrador <strong>({formData.adminEmail})</strong> para que ele possa criar a própria senha e acessar o sistema.
                    </p>

                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 rounded-xl p-3 shadow-inner">
                        <input
                            value={inviteLink}
                            readOnly
                            className="bg-transparent border-none focus:ring-0 text-slate-700 dark:text-slate-300 font-mono text-sm w-full focus:outline-none px-2"
                        />
                        <Button
                            onClick={handleCopy}
                            variant={copied ? "default" : "outline"}
                            className="shrink-0 h-10 px-4"
                            type="button"
                        >
                            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                            {copied ? 'Copiado!' : 'Copiar'}
                        </Button>
                    </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-white/10 mt-auto">
                    <Button type="button" onClick={onClose} variant="default" className="h-11 px-6">Concluir</Button>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-[80vh]">
            <div className="mb-6">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Preencha as informações para provisionar um novo inquilino na plataforma.
                </p>
            </div>

            {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 animate-in fade-in flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-red-600 dark:text-red-400 text-sm font-medium">{error}</p>
                        {suggestions.length > 0 && (
                            <div className="mt-3">
                                <p className="text-xs text-red-500/80 dark:text-red-400/80 mb-2">Sugestões disponíveis:</p>
                                <div className="flex flex-wrap gap-2">
                                    {safeArray(suggestions).map((s, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, name: s })}
                                            className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs transition-colors border border-red-500/20"
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto pr-2 pb-4 space-y-8 custom-scrollbar">
                {/* Dados da Empresa Section */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-white/10">
                        <Building2 className="w-4 h-4 text-brand-emerald" />
                        <h4 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">Dados da Empresa</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Nome da Empresa *</label>
                            <div className="relative">
                                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    required
                                    placeholder="Ex: Marmoraria Pedra Bella"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className={inputWithIconClasses}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">CNPJ</label>
                            <div className="relative">
                                <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    placeholder="00.000.000/0000-00"
                                    value={formData.cnpj}
                                    onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                                    className={inputWithIconClasses}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Status Inicial</label>
                            <select
                                value={formData.status}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                className={inputClasses}
                            >
                                <option value="approved">Aprovada (Ativa)</option>
                                <option value="pending">Pendente (Revisão)</option>
                                <option value="rejected">Bloqueada (Inativa)</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Admin Principal Section */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-white/10">
                        <User className="w-4 h-4 text-brand-emerald" />
                        <h4 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">Administrador Principal</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Nome do Admin *</label>
                            <div className="relative">
                                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    required
                                    placeholder="João da Silva"
                                    value={formData.adminName}
                                    onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                                    className={inputWithIconClasses}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">E-mail do Admin *</label>
                            <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    required
                                    type="email"
                                    placeholder="joao@empresa.com"
                                    value={formData.adminEmail}
                                    onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                                    className={inputWithIconClasses}
                                />
                            </div>
                            <p className="text-[11px] text-slate-500 ml-1 mt-1 font-medium">Um convite será enviado para definição de senha.</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 mt-4 border-t border-slate-200 dark:border-white/10 shrink-0">
                <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="h-11 px-6">
                    Cancelar
                </Button>
                <Button type="submit" variant="default" disabled={loading} className="h-11 px-8 min-w-[200px]">
                    {loading ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Criando...
                        </>
                    ) : (
                        'Criar Empresa & Admin'
                    )}
                </Button>
            </div>
        </form>
    );
};
