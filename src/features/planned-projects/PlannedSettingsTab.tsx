import React, { useState, useEffect } from 'react';
import { usePlannedSettings } from '../../hooks/usePlannedSettings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Save, Loader2, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PlannedContractSettingsCard } from './PlannedContractSettingsCard';

export const PlannedSettingsTab: React.FC = () => {
    const { profile } = useAuth();
    const { settings, updatePlannedSettings, loading } = usePlannedSettings();
    const [freight, setFreight] = useState('16');
    const [assembly, setAssembly] = useState('10');
    const [cardFee, setCardFee] = useState('0');
    const [isSaving, setIsSaving] = useState(false);

    const canEdit = ['superadmin', 'company_admin', 'admin'].includes(profile?.role || '');

    useEffect(() => {
        if (settings) {
            setFreight(String(settings.freightPercentOnMaterialCost ?? 16));
            setAssembly(String(settings.assemblyPercentOnSale ?? 10));
            setCardFee(String(settings.cardMachineFeePercent ?? 0));
        }
    }, [settings]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canEdit) return;

        setIsSaving(true);
        try {
            const parsedFreight = parseFloat(freight.replace(',', '.'));
            const parsedAssembly = parseFloat(assembly.replace(',', '.'));
            const parsedCardFee = parseFloat(cardFee.replace(',', '.'));

            await updatePlannedSettings({
                freightPercentOnMaterialCost: isNaN(parsedFreight) ? 16 : parsedFreight,
                assemblyPercentOnSale: isNaN(parsedAssembly) ? 10 : parsedAssembly,
                cardMachineFeePercent: isNaN(parsedCardFee) ? 0 : parsedCardFee,
            });
            alert('Configurações salvas com sucesso!');
        } catch (err) {
            console.error('Error saving settings:', err);
            alert('Erro ao salvar configurações.');
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-brand-rocha-primary" />
                <span className="text-sm font-bold text-slate-400">Carregando configurações...</span>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto py-4">
            <Card className="border-brand-rocha-border">
                <CardHeader>
                    <CardTitle className="text-xl font-bold text-slate-900 dark:text-white">Configurações Gerais de Planejados</CardTitle>
                    <CardDescription>Configure os percentuais comerciais padrão adotados para novos projetos da empresa.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSave} className="space-y-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    Frete sobre custo do material (%)
                                </label>
                                <Input
                                    type="text"
                                    value={freight}
                                    onChange={(e) => setFreight(e.target.value)}
                                    disabled={!canEdit || isSaving}
                                    placeholder="Ex: 16"
                                    required
                                    className="focus:ring-brand-rocha-primary"
                                />
                                <span className="text-xs text-slate-400 font-medium block mt-1">
                                    Esse percentual é aplicado sobre o custo total de materiais (módulos e produtos) do projeto. Padrão: 16%.
                                </span>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    Montagem sobre valor de venda (%)
                                </label>
                                <Input
                                    type="text"
                                    value={assembly}
                                    onChange={(e) => setAssembly(e.target.value)}
                                    disabled={!canEdit || isSaving}
                                    placeholder="Ex: 10"
                                    required
                                    className="focus:ring-brand-rocha-primary"
                                />
                                <span className="text-xs text-slate-400 font-medium block mt-1">
                                    Esse percentual é aplicado sobre o valor de venda total do projeto. Padrão: 10%.
                                </span>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    Taxa da maquininha (%)
                                </label>
                                <Input
                                    type="text"
                                    value={cardFee}
                                    onChange={(e) => setCardFee(e.target.value)}
                                    disabled={!canEdit || isSaving}
                                    placeholder="Ex: 3"
                                    required
                                    className="focus:ring-brand-rocha-primary"
                                />
                                <span className="text-xs text-slate-400 font-medium block mt-1">
                                    Esse percentual é aplicado sobre o valor de venda total do projeto para abater o custo financeiro. Padrão: 0%.
                                </span>
                            </div>
                        </div>

                        {!canEdit && (
                            <div className="flex gap-2 p-3 bg-amber-50 rounded-xl text-amber-800 text-xs font-medium border border-amber-100">
                                <Info className="h-4 w-4 shrink-0" />
                                Apenas usuários administradores podem salvar ou alterar estas configurações comerciais.
                            </div>
                        )}

                        {canEdit && (
                            <div className="flex justify-end pt-2">
                                <Button
                                    type="submit"
                                    disabled={isSaving}
                                    className="bg-brand-rocha-primary text-white hover:bg-brand-rocha-primary/90 flex items-center gap-2 h-11 px-6 rounded-xl font-bold shadow-md shadow-brand-rocha-primary/20 transition-all duration-300 active:scale-[0.98]"
                                >
                                    {isSaving ? (
                                        <>
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            Salvando...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="h-5 w-5" />
                                            Salvar Configurações
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}
                    </form>
                </CardContent>
            </Card>

            <PlannedContractSettingsCard />
        </div>
    );
};
