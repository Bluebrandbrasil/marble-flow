import React, { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Building2, FileText, Loader2, AlertCircle, History } from 'lucide-react';
import { updateCompanyAndUsers } from '../../services/superAdminService';
import { useAuth } from '../../context/AuthContext';

interface EditCompanyModalProps {
    company: { id: string; name: string; cnpj: string; status: 'pending' | 'approved' | 'rejected' };
    onClose: () => void;
    onSuccess: () => void;
}

export const EditCompanyModal: React.FC<EditCompanyModalProps> = ({ company, onClose, onSuccess }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: company.name || '',
        cnpj: company.cnpj || '',
        status: company.status || 'pending'
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (!user?.email) throw new Error("Usuário não autenticado");

            await updateCompanyAndUsers(company.id, {
                name: formData.name,
                cnpj: formData.cnpj,
                status: formData.status
            }, user.email);

            onSuccess(); // Refresh list behind the modal
            onClose();

        } catch (err: any) {
            setError(err.message || 'Erro ao editar empresa.');
        } finally {
            setLoading(false);
        }
    };

    const inputClasses = "w-full h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:border-transparent transition-all dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-emerald dark:focus:border-brand-emerald placeholder:text-slate-400 dark:placeholder:text-slate-500";
    const inputWithIconClasses = "w-full h-11 rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-emerald focus:border-transparent transition-all dark:border-white/10 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-emerald dark:focus:border-brand-emerald placeholder:text-slate-400 dark:placeholder:text-slate-500";

    return (
        <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-[80vh]">
            <div className="mb-6">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Altere os dados básicos da empresa Inquilina.
                </p>
            </div>

            {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-red-600 dark:text-red-400 text-sm font-medium">{error}</p>
                </div>
            )}

            <div className="flex-1 overflow-y-auto pr-2 pb-4 space-y-6 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5 md:col-span-2">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Nome da Empresa *</label>
                        <div className="relative">
                            <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                required
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
                                required
                                placeholder="00.000.000/0000-00"
                                value={formData.cnpj}
                                onChange={(e) => {
                                    let v = e.target.value.replace(/\D/g, '');
                                    if (v.length > 14) v = v.slice(0, 14);
                                    v = v.replace(/^(\d{2})(\d)/, "$1.$2");
                                    v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
                                    v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
                                    v = v.replace(/(\d{4})(\d)/, "$1-$2");
                                    setFormData({ ...formData, cnpj: v });
                                }}
                                className={inputWithIconClasses}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Status</label>
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

            <div className="flex justify-between items-center pt-6 mt-4 border-t border-slate-200 dark:border-white/10 shrink-0">
                <Button type="button" variant="outline" onClick={() => alert('Em breve: Visualização de Histórico na UI.')} className="h-11 px-4 text-slate-500">
                    <History className="w-4 h-4 mr-2" />
                    Histórico
                </Button>

                <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="h-11 px-6">
                        Cancelar
                    </Button>
                    <Button type="submit" variant="default" disabled={loading} className="h-11 px-8 min-w-[160px]">
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            'Salvar Alterações'
                        )}
                    </Button>
                </div>
            </div>
        </form>
    );
};
