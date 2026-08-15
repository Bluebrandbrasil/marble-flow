import { safeArray } from '../../lib/dataDiagnostics';
import React, { useState, useEffect, useMemo } from 'react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Trash2, Plus, Zap, Star, ShieldCheck, Calendar } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { PaymentConditions, PaymentInstallment } from '../../types';

interface FormattedNumberInputProps {
    value: number | null | undefined;
    onChange: (val: number | null) => void;
    type?: 'currency' | 'percentage';
    className?: string;
    disabled?: boolean;
    placeholder?: string;
}

const FormattedNumberInput: React.FC<FormattedNumberInputProps> = ({
    value,
    onChange,
    type = 'currency',
    className,
    disabled = false,
    placeholder = ''
}) => {
    const [focused, setFocused] = useState(false);
    const [displayValue, setDisplayValue] = useState('');

    const formatValue = (val: number | null | undefined) => {
        if (val === null || val === undefined || isNaN(val)) {
            return type === 'currency' ? 'R$' : '';
        }
        if (type === 'currency') {
            return new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            }).format(val);
        } else {
            return new Intl.NumberFormat('pt-BR', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }).format(val);
        }
    };

    const parseValue = (str: string): number | null => {
        if (!str.trim()) return null;
        const cleaned = str
            .replace(/[^\d,-]/g, '')
            .replace(/\./g, '')
            .replace(',', '.');
        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    };

    useEffect(() => {
        if (!focused) {
            setDisplayValue(formatValue(value));
        }
    }, [value, focused]);

    const handleFocus = () => {
        setFocused(true);
        if (value !== null && value !== undefined && !isNaN(value)) {
            setDisplayValue(value.toString().replace('.', ','));
        } else {
            setDisplayValue('');
        }
    };

    const handleBlur = () => {
        setFocused(false);
        const parsed = parseValue(displayValue);
        onChange(parsed);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDisplayValue(e.target.value);
    };

    return (
        <div className="relative w-full">
            {type === 'currency' && focused && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400 select-none pointer-events-none animate-in fade-in duration-200">
                    R$
                </span>
            )}
            {type === 'percentage' && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400 select-none pointer-events-none">
                    %
                </span>
            )}
            <Input
                type="text"
                value={displayValue}
                onChange={handleChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                disabled={disabled}
                placeholder={placeholder}
                className={cn(
                    className,
                    type === 'currency' ? (focused ? 'pl-7' : 'pl-3') : 'pl-6'
                )}
            />
        </div>
    );
};

interface PaymentConditionsFormProps {
    total: number;
    paymentDraft: PaymentConditions;
    onUpdate: (draft: PaymentConditions) => void;
}

export const PaymentConditionsForm: React.FC<PaymentConditionsFormProps> = ({ 
    total, 
    paymentDraft, 
    onUpdate 
}) => {
    const installments = paymentDraft?.installments || [];
    const interest = paymentDraft?.interest || { enabled: false, percentage: 0, amount: 0 };
    
    const percentage = Number(interest?.percentage) || 0;
    const interestAmount = interest?.enabled ? Number(((total * percentage) / 100).toFixed(2)) : 0;
    const financedTotal = total + interestAmount;

    const totalParcelado = safeArray(installments).reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
    const faltaAlocar = financedTotal - totalParcelado;
    const isBalanced = Math.abs(faltaAlocar) < 0.05;

    const recalculateInstallmentsWithTotal = (insts: PaymentInstallment[], newTotal: number): PaymentInstallment[] => {
        const totalCents = Math.round(newTotal * 100);
        const count = insts.length;
        if (count === 0) return [];
        
        let sumCents = 0;
        return insts.map((inst, i) => {
            const isLast = i === count - 1;
            const instPercentage = Number(inst.percentage) || 0;
            if (isLast) {
                const lastCents = totalCents - sumCents;
                return {
                    ...inst,
                    amount: lastCents / 100
                };
            } else {
                const amountCents = Math.round((totalCents * instPercentage) / 100);
                sumCents += amountCents;
                return {
                    ...inst,
                    amount: amountCents / 100
                };
            }
        });
    };

    const handleUpdateInstallmentAmount = (idx: number, val: number | null) => {
        const numVal = val || 0;
        const totalCents = Math.round(financedTotal * 100);
        const newInst = [...installments];
        
        if (idx === installments.length - 1 && installments.length > 1) {
            const amountCents = Math.round(numVal * 100);
            newInst[idx].amount = amountCents / 100;
            if (financedTotal > 0) {
                newInst[idx].percentage = Number(((amountCents / totalCents) * 100).toFixed(2));
            }
            
            let otherSumCents = 0;
            for (let i = 1; i < installments.length; i++) {
                otherSumCents += Math.round((newInst[i].amount || 0) * 100);
            }
            const firstCents = totalCents - otherSumCents;
            newInst[0].amount = firstCents / 100;
            if (financedTotal > 0) {
                newInst[0].percentage = Number(((firstCents / totalCents) * 100).toFixed(2));
            }
        } else {
            const amountCents = Math.round(numVal * 100);
            newInst[idx].amount = amountCents / 100;
            if (financedTotal > 0) {
                newInst[idx].percentage = Number(((amountCents / totalCents) * 100).toFixed(2));
            }
            
            if (installments.length > 1) {
                let sumPriorCents = 0;
                for (let i = 0; i < installments.length - 1; i++) {
                    sumPriorCents += Math.round((newInst[i].amount || 0) * 100);
                }
                const lastCents = totalCents - sumPriorCents;
                const lastIdx = installments.length - 1;
                newInst[lastIdx].amount = lastCents / 100;
                if (financedTotal > 0) {
                    newInst[lastIdx].percentage = Number(((lastCents / totalCents) * 100).toFixed(2));
                }
            }
        }
        
        onUpdate({ ...paymentDraft, installments: newInst });
    };

    const handleUpdateInstallmentPercentage = (idx: number, val: number | null) => {
        const perc = val || 0;
        const totalCents = Math.round(financedTotal * 100);
        const newInst = [...installments];
        
        if (idx === installments.length - 1 && installments.length > 1) {
            newInst[idx].percentage = perc;
            const amountCents = Math.round((totalCents * perc) / 100);
            newInst[idx].amount = amountCents / 100;
            
            let otherSumCents = 0;
            let otherSumPerc = 0;
            for (let i = 1; i < installments.length; i++) {
                otherSumCents += Math.round((newInst[i].amount || 0) * 100);
                otherSumPerc += newInst[i].percentage || 0;
            }
            const firstCents = totalCents - otherSumCents;
            newInst[0].amount = firstCents / 100;
            newInst[0].percentage = Number((100 - otherSumPerc).toFixed(2));
        } else {
            newInst[idx].percentage = perc;
            const amountCents = Math.round((totalCents * perc) / 100);
            newInst[idx].amount = amountCents / 100;
            
            if (installments.length > 1) {
                let sumPriorCents = 0;
                let sumPriorPerc = 0;
                for (let i = 0; i < installments.length - 1; i++) {
                    sumPriorCents += Math.round((newInst[i].amount || 0) * 100);
                    sumPriorPerc += newInst[i].percentage || 0;
                }
                const lastCents = totalCents - sumPriorCents;
                const lastIdx = installments.length - 1;
                newInst[lastIdx].amount = lastCents / 100;
                newInst[lastIdx].percentage = Number((100 - sumPriorPerc).toFixed(2));
            }
        }
        
        onUpdate({ ...paymentDraft, installments: newInst });
    };

    // --- RULE: Recalculate installments when interest changes ---
    const handleToggleInterest = (enabled: boolean) => {
        const percentageVal = Number(interest?.percentage) || 0;
        const newInterest = { ...interest, enabled, amount: enabled ? Number(((total * percentageVal) / 100).toFixed(2)) : 0 };
        const newFinancedTotal = total + newInterest.amount;
        
        const newInst = recalculateInstallmentsWithTotal(installments, newFinancedTotal);
        onUpdate({ ...paymentDraft, interest: newInterest, installments: newInst });
    };

    const handleUpdateInterestPercentage = (percentageInput: number | null) => {
        const newPercentage = percentageInput;
        const numericPercentage = newPercentage || 0;
        const amount = Number(((total * numericPercentage) / 100).toFixed(2));
        const newInterest = { ...interest, percentage: newPercentage as any, amount };
        const newFinancedTotal = total + amount;
        
        const newInst = recalculateInstallmentsWithTotal(installments, newFinancedTotal);
        onUpdate({ ...paymentDraft, interest: newInterest, installments: newInst });
    };

    const applyQuickPayment = (p1: number, p2: number, l1: string, l2: string) => {
        const totalCents = Math.round(financedTotal * 100);
        const amount1Cents = Math.round((totalCents * p1) / 100);
        const amount2Cents = totalCents - amount1Cents;

        const inst1 = { label: l1, percentage: p1, amount: amount1Cents / 100, dueType: 'imediato' as const };
        let newInst: PaymentInstallment[] = [inst1];
        if (p2 > 0) {
            const inst2 = { label: l2, percentage: p2, amount: amount2Cents / 100, dueType: 'entrega' as const };
            newInst.push(inst2);
        }
        const newPC = { ...paymentDraft, installments: newInst };
        onUpdate(newPC);
    };

    const divideAutomatically = (count: number) => {
        if (count <= 0) return;
        const totalCents = Math.round(financedTotal * 100);
        const perc = Number((100 / count).toFixed(2));
        
        let sumCents = 0;
        let sumPerc = 0;
        
        const newInst = Array.from({ length: count }, (_, i) => {
            const isLast = i === count - 1;
            if (isLast) {
                return {
                    label: `Parcela ${i + 1}`,
                    percentage: Number((100 - sumPerc).toFixed(2)),
                    amount: (totalCents - sumCents) / 100,
                    dueType: 'data' as const,
                    dueDate: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                };
            } else {
                const amountCents = Math.round(totalCents / count);
                sumCents += amountCents;
                sumPerc += perc;
                return {
                    label: i === 0 ? 'Entrada' : `Parcela ${i + 1}`,
                    percentage: perc,
                    amount: amountCents / 100,
                    dueType: i === 0 ? 'imediato' as const : 'data' as const,
                    dueDate: i > 0 ? new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : undefined
                };
            }
        });
        const newPC = { ...paymentDraft, installments: newInst };
        onUpdate(newPC);
    };

    // --- EFFECT: Sync installments when total changes (e.g. interest toggle) ---
    useEffect(() => {
        if (installments.length > 0) {
            const currentTotalParcelado = safeArray(installments).reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
            const shouldRecalculate = Math.abs(currentTotalParcelado - financedTotal) > 0.005;

            if (shouldRecalculate) {
                const newInst = recalculateInstallmentsWithTotal(installments, financedTotal);
                onUpdate({ ...paymentDraft, installments: newInst });
            }
        }
    }, [financedTotal]);

    return (
        <div className="space-y-6 py-2">
            {/* Interest Configuration Bar */}
            <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 p-3 rounded-2xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "h-8 w-8 rounded-xl flex items-center justify-center transition-all",
                        interest.enabled ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-400"
                    )}>
                        <Star className={cn("h-4 w-4", interest.enabled && "fill-current")} />
                    </div>
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-tight text-slate-800 dark:text-slate-200 leading-none">Juros de Financiamento</p>
                        <p className="text-[9px] font-bold text-slate-400 leading-none mt-1">Acrescer percentual sobre o total</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    {interest.enabled && (
                        <div className="flex items-center gap-2 animate-in slide-in-from-right-2">
                             <div className="w-16 relative">
                                <FormattedNumberInput 
                                    type="percentage"
                                    value={interest.percentage}
                                    onChange={handleUpdateInterestPercentage}
                                    className="h-8 text-[11px] font-black pr-2 bg-white dark:bg-slate-800 border-amber-200 focus-visible:ring-amber-500 rounded-lg text-amber-700"
                                />
                             </div>
                        </div>
                    )}

                    <button 
                        onClick={() => handleToggleInterest(!interest.enabled)}
                        className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                            interest.enabled ? "bg-brand-emerald" : "bg-slate-200 dark:bg-slate-700"
                        )}
                    >
                        <span className={cn(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out",
                            interest.enabled ? "translate-x-4" : "translate-x-0"
                        )} />
                    </button>
                </div>
            </div>

            {/* Top Summary Indicators */}
            <div className="grid grid-cols-3 gap-2">
                <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl">
                    <p className="text-[8px] font-black tracking-widest uppercase text-slate-400 mb-1">Base Comercial</p>
                    <p className="text-[13px] font-black tabular-nums text-slate-900 dark:text-white">
                        R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                </div>
                
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden">
                    <p className="text-[8px] font-black tracking-widest uppercase text-slate-500 mb-1">Total Financiado</p>
                    <p className="text-[13px] font-black tabular-nums text-white">
                        R$ {financedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    {interest.enabled && (
                        <div className="absolute top-1 right-2 text-[7px] font-black text-amber-400 animate-pulse">
                            +{interest.percentage}%
                        </div>
                    )}
                </div>

                <div className={cn(
                    "p-3 rounded-2xl border transition-all",
                    isBalanced 
                        ? "bg-emerald-50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-900/20" 
                        : "bg-amber-50 border-amber-100 dark:bg-amber-900/10 dark:border-amber-900/20"
                )}>
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-[8px] font-black tracking-widest uppercase text-slate-400">Total Parcelado</p>
                        {isBalanced && <ShieldCheck className="h-3 w-3 text-emerald-500" />}
                    </div>
                    <p className={cn(
                        "text-[13px] font-black tabular-nums",
                        isBalanced ? "text-emerald-600" : (faltaAlocar < 0 ? "text-rose-600" : "text-amber-600")
                    )}>
                        R$ {totalParcelado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                </div>
            </div>

            <div className="space-y-2 max-h-[45vh] overflow-y-auto no-scrollbar pb-2 px-0.5">
                {safeArray(installments).map((inst, idx) => (
                    <div key={idx} className={cn(
                        "group relative bg-white dark:bg-slate-900/50 border p-3 rounded-xl transition-all",
                        "hover:border-brand-emerald/30",
                        Math.abs(inst.amount - ((financedTotal * inst.percentage) / 100)) > 0.05 
                            ? "border-amber-200 bg-amber-50/10" 
                            : "border-slate-100 dark:border-white/5"
                    )}>
                        <div className="space-y-3">
                            {/* LINHA 1: Descrição e Remover */}
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex-1 flex items-center gap-2">
                                    <span className="text-[10px] font-black text-slate-400 w-4">{idx + 1}.</span>
                                    <Input 
                                        placeholder="Ex: Entrada, Entrega..."
                                        value={inst.label} 
                                        onChange={(e) => {
                                            const newInst = [...installments];
                                            newInst[idx].label = e.target.value;
                                            onUpdate({ ...paymentDraft, installments: newInst });
                                        }}
                                        className="h-8 text-[11px] font-bold uppercase tracking-tight bg-transparent border-transparent focus:border-slate-200 dark:focus:border-white/10 p-0 focus-visible:ring-0 placeholder:text-slate-300"
                                    />
                                </div>
                                {idx === 0 && (inst.label.toLowerCase().includes('entrada') || inst.dueType === 'imediato') ? (
                                    <span className="text-[8px] font-black text-brand-emerald bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-tighter animate-in fade-in zoom-in">Pago / Entrada</span>
                                ) : (
                                    <span className="text-[8px] font-black text-slate-400 bg-slate-50 dark:bg-white/5 px-2 py-0.5 rounded-full uppercase tracking-tighter">Saldo / Restante</span>
                                )}
                                {installments.length > 1 && (
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-7 w-7 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors" 
                                        onClick={() => {
                                            const newInst = safeArray(installments).filter((_, i) => i !== idx);
                                            onUpdate({ ...paymentDraft, installments: newInst });
                                        }}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                )}
                            </div>

                            {/* LINHA 2: Grid % e R$ */}
                            <div className="grid grid-cols-2 gap-2">
                                <FormattedNumberInput 
                                    type="percentage"
                                    value={inst.percentage} 
                                    onChange={(val) => handleUpdateInstallmentPercentage(idx, val)}
                                    className="h-[36px] text-[13px] font-black tabular-nums bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 rounded-lg"
                                />
                                
                                <FormattedNumberInput 
                                    type="currency"
                                    value={inst.amount} 
                                    onChange={(val) => handleUpdateInstallmentAmount(idx, val)}
                                    className="h-[36px] text-[13px] font-black tabular-nums bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 rounded-lg"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[8px] font-black uppercase text-slate-400 tracking-widest pl-1">
                                    {idx === 0 && (inst.label.toLowerCase().includes('entrada') || inst.dueType === 'imediato') 
                                        ? "Como o cliente pagou a entrada?" 
                                        : "Como o cliente vai pagar o restante?"}
                                </label>
                                <div className="flex gap-2">
                                    <select 
                                        value={inst.paymentMethod || 'a_combinar'}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            const label = e.target.options[e.target.selectedIndex].text;
                                            const newInst = [...installments];
                                            newInst[idx].paymentMethod = val as any;
                                            newInst[idx].paymentMethodLabel = label;
                                            onUpdate({ ...paymentDraft, installments: newInst });
                                        }}
                                        className="h-[36px] flex-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-[10px] font-black uppercase px-2 outline-none focus:ring-1 focus:ring-brand-emerald"
                                    >
                                        <option value="pix">PIX</option>
                                        <option value="dinheiro">Dinheiro</option>
                                        <option value="debito">Cartão de Débito</option>
                                        <option value="credito">Cartão de Crédito</option>
                                        <option value="boleto">Boleto</option>
                                        <option value="transferencia">Transferência</option>
                                        <option value="a_combinar">A combinar</option>
                                    </select>

                                    <select 
                                        value={inst.dueType}
                                        onChange={(e) => {
                                            const newInst = [...installments];
                                            newInst[idx].dueType = e.target.value as any;
                                            onUpdate({ ...paymentDraft, installments: newInst });
                                        }}
                                        className="h-[36px] flex-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-[10px] font-black uppercase px-2 outline-none focus:ring-1 focus:ring-brand-emerald"
                                    >
                                        <option value="imediato">Sinal Imediato</option>
                                        <option value="entrega">Na Entrega</option>
                                        <option value="data">Data Fixa</option>
                                    </select>
                                </div>
                            </div>

                            {/* LINHA 3: Data se for Data Fixa */}
                            {inst.dueType === 'data' && (
                                <div className="animate-in fade-in slide-in-from-top-1">
                                    <Input 
                                        type="date"
                                        value={inst.dueDate || ''}
                                        onChange={(e) => {
                                            const newInst = [...installments];
                                            newInst[idx].dueDate = e.target.value;
                                            onUpdate({ ...paymentDraft, installments: newInst });
                                        }}
                                        className="h-[36px] text-[10px] font-bold bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 rounded-lg"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                <Button 
                    variant="outline" 
                    className="w-full h-10 border-dashed border border-slate-200 dark:border-slate-800 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:border-brand-emerald/50 hover:bg-emerald-50/30 hover:text-emerald-600 transition-all rounded-xl mt-1"
                    onClick={() => {
                         onUpdate({
                             ...paymentDraft, 
                             installments: [...installments, { label: `Parcela ${installments.length + 1}`, percentage: null as any, amount: null as any, dueType: 'data' }]
                         });
                    }}
                >
                    <Plus className="w-3 mr-2" /> Nova Parcela
                </Button>
            </div>

            <div className="pt-2">
                <label className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em] px-1 block mb-1.5">Observações Financeiras</label>
                <textarea 
                    value={paymentDraft.notes || ''}
                    onChange={e => onUpdate({ ...paymentDraft, notes: e.target.value })}
                    className="flex min-h-[60px] w-full rounded-xl border border-slate-100 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-800 px-3 py-2 text-[11px] font-bold ring-offset-white placeholder:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-emerald/30 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Ex: Pagamento via PIX, vencimento após montagem..."
                />
            </div>
        </div>
    );
};
