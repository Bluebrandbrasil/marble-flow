import { safeArray } from '../../lib/dataDiagnostics';
import React, { useState, useMemo } from 'react';
import { 
    Wallet, CheckCircle, X, ChevronRight, 
    Calendar, CreditCard, Banknote, Search, 
    Filter, ArrowRight, Loader2, DollarSign
} from 'lucide-react';
import { useInfluencers } from '../../hooks/useInfluencers';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../lib/utils';
import { processBonusBatch } from '../../lib/bonusService';
import { useAuth } from '../../context/AuthContext';

export const PartnerSettlement: React.FC = () => {
    const { bonusRecords, isLoading } = useInfluencers();
    const { profile, user } = useAuth();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'pix' | 'transfer' | 'cash'>('pix');
    const [searchTerm, setSearchTerm] = useState('');

    const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const payableBonus = useMemo(() => {
        return safeArray(bonusRecords).filter(b => b.status === 'payable' && 
            (b.influencerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
             b.clientName.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [bonusRecords, searchTerm]);

    const totalSelected = useMemo(() => {
        return payableBonus
            .filter(b => selectedIds.includes(b.id))
            .reduce((acc, b) => acc + b.bonusAmount, 0);
    }, [payableBonus, selectedIds]);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? safeArray(prev).filter(i => i !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === payableBonus.length) setSelectedIds([]);
        else setSelectedIds(safeArray(payableBonus).map(b => b.id));
    };

    const handleBatchPayment = async () => {
        if (selectedIds.length === 0 || !profile?.companyId || !user) return;

        setIsProcessing(true);
        try {
            const result = await processBonusBatch(
                selectedIds,
                {
                    method: paymentMethod.toUpperCase(),
                    userId: user.uid,
                    userName: profile.name || 'Admin'
                },
                profile.companyId
            );

            console.log(`${result.success} bônus pagos com sucesso! Total: ${formatCurrency(result.totalPaid)}`);
            setSelectedIds([]);
        } catch (error) {
            console.error(error);
        } finally {
            setIsProcessing(false);
        }
    };

    if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin h-8 w-8 text-slate-400" /></div>;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Settlement */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Fechamento <span className="text-brand-emerald">Financeiro</span></h2>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Liquidação de bônus com receita confirmada</p>
                </div>
                <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-3xl shadow-sm border border-slate-100 dark:border-white/5">
                    <div className="text-right border-r border-slate-100 dark:border-white/5 pr-4">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Selecionado</p>
                        <p className="text-xl font-black text-slate-900 dark:text-white">{formatCurrency(totalSelected)}</p>
                    </div>
                    <Button 
                        onClick={handleBatchPayment}
                        disabled={selectedIds.length === 0 || isProcessing}
                        className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 h-12 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-slate-950/20 active:scale-95 transition-all"
                    >
                        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <DollarSign className="h-4 w-4 mr-2" />}
                        Pagar {selectedIds.length} Bônus
                    </Button>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input 
                        placeholder="Buscar por parceiro ou cliente..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 h-14 bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 rounded-2xl shadow-sm font-medium focus:ring-2 focus:ring-brand-emerald/20 transition-all outline-none"
                    />
                </div>
                <div className="flex bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-100 dark:border-white/5 shadow-sm">
                    {[
                        { id: 'pix', label: 'PIX', icon: CreditCard },
                        { id: 'transfer', label: 'TED', icon: Banknote },
                        { id: 'cash', label: 'DIN', icon: DollarSign }
                    ].map(m => (
                        <button
                            key={m.id}
                            onClick={() => setPaymentMethod(m.id as any)}
                            className={cn(
                                "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                                paymentMethod === m.id 
                                    ? "bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white" 
                                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                            )}
                        >
                            <m.icon className="h-3.5 w-3.5" /> {m.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            <Card className="border-none bg-white dark:bg-slate-900/50 rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-100 dark:border-white/5">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-white/2 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-white/5">
                                <th className="px-10 py-6">
                                    <button onClick={toggleSelectAll} className="h-5 w-5 rounded border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center transition-all hover:border-brand-emerald">
                                        {selectedIds.length === payableBonus.length && payableBonus.length > 0 && <CheckCircle className="h-4 w-4 text-brand-emerald" />}
                                    </button>
                                </th>
                                <th className="px-6 py-6">Parceiro</th>
                                <th className="px-6 py-6">Cliente / Referência</th>
                                <th className="px-6 py-6 text-center">Data</th>
                                <th className="px-6 py-6 text-center">Valor do Bônus</th>
                                <th className="px-10 py-6 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                            {safeArray(payableBonus).map((bonus) => (
                                <tr 
                                    key={bonus.id} 
                                    onClick={() => toggleSelect(bonus.id)}
                                    className={cn(
                                        "group cursor-pointer transition-colors",
                                        selectedIds.includes(bonus.id) ? "bg-brand-emerald/5 dark:bg-brand-emerald/10" : "hover:bg-slate-50 dark:hover:bg-white/2"
                                    )}
                                >
                                    <td className="px-10 py-6">
                                        <div className={cn(
                                            "h-5 w-5 rounded border-2 flex items-center justify-center transition-all",
                                            selectedIds.includes(bonus.id) ? "bg-brand-emerald border-brand-emerald" : "border-slate-200 dark:border-slate-700 group-hover:border-slate-400"
                                        )}>
                                            {selectedIds.includes(bonus.id) && <CheckCircle className="h-3 w-3 text-white" />}
                                        </div>
                                    </td>
                                    <td className="px-6 py-6">
                                        <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{bonus.influencerName}</p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">ID: {bonus.influencerId.slice(0, 8)}</p>
                                    </td>
                                    <td className="px-6 py-6">
                                        <p className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase">{bonus.clientName}</p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 line-clamp-1">{bonus.description}</p>
                                    </td>
                                    <td className="px-6 py-6 text-center">
                                        <p className="text-xs font-bold text-slate-600 dark:text-slate-400">{new Date(bonus.createdAt).toLocaleDateString('pt-BR')}</p>
                                    </td>
                                    <td className="px-6 py-6 text-center">
                                        <p className="text-sm font-black text-slate-900 dark:text-white">{formatCurrency(bonus.bonusAmount)}</p>
                                        <p className="text-[9px] font-bold text-brand-emerald uppercase mt-0.5">{bonus.appliedPercentage || 5}% Aplicado</p>
                                    </td>
                                    <td className="px-10 py-6 text-right">
                                        <Badge className="bg-amber-500/10 text-amber-500 font-black text-[9px] uppercase tracking-widest px-3 py-1 rounded-full border-none">
                                            Aguardando Pagamento
                                        </Badge>
                                    </td>
                                </tr>
                            ))}
                            {payableBonus.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-10 py-20 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="h-16 w-16 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center">
                                                <Wallet className="h-8 w-8 text-slate-300" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">Nenhum bônus para liquidar</p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Aguardando recebimento real de contratos indicados</p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
