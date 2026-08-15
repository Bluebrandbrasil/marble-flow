import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useCommercialActions } from '../hooks/useCommercialActions';
import { Button } from './ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/Card';
import { Input } from './ui/Input';

interface ActionTriggerProps {
    defaultData: {
        title: string;
        type: 'reativacao' | 'followup' | 'oportunidade' | 'observacao';
        sourceType: 'alerta' | 'historico' | 'manual';
        sourceId: string;
        influencerId?: string;
        influencerName?: string;
        priority?: 'low' | 'medium' | 'high' | 'critical';
    };
    triggerLabel?: string;
    variant?: 'default' | 'outline' | 'ghost' | 'sm';
}

export const CommercialActionTrigger: React.FC<ActionTriggerProps> = ({ defaultData, triggerLabel = 'Gerar Ação', variant = 'outline' }) => {
    const [showModal, setShowModal] = useState(false);
    const { createAction } = useCommercialActions();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        ...defaultData,
        description: ''
    });

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await createAction(formData as any);
            setShowModal(false);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Button 
                variant={variant === 'sm' ? 'outline' : variant} 
                className={variant === 'sm' ? 'h-8 px-3 text-[9px] font-black uppercase tracking-widest rounded-lg' : 'h-10 px-6 font-black uppercase text-[10px] tracking-widest rounded-xl'}
                onClick={() => setShowModal(true)}
            >
                <Plus className="h-3.5 w-3.5 mr-2" /> {triggerLabel}
            </Button>

            {showModal && (
                <div className="fixed inset-0 z-[1001] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
                    <Card className="relative w-full max-w-md rounded-[2.5rem] bg-white dark:bg-slate-900 shadow-premium border-none overflow-hidden animate-in zoom-in-95 duration-200">
                        <CardHeader className="bg-slate-50 dark:bg-white/2 p-6 border-b border-slate-100 dark:border-white/5">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg font-black uppercase tracking-tighter">Ação Comercial Rápida</CardTitle>
                                <button onClick={() => setShowModal(false)} className="text-slate-300 hover:text-slate-600 transition-colors"><X className="h-6 w-6" /></button>
                            </div>
                            <CardDescription className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">
                                Origem: {defaultData.sourceType}
                            </CardDescription>
                        </CardHeader>
                        <form onSubmit={handleCreate}>
                            <CardContent className="p-6 space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Título</label>
                                    <Input 
                                        required 
                                        value={formData.title} 
                                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                        className="h-10 rounded-xl bg-slate-50 border-none font-bold"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Prioridade</label>
                                        <select 
                                            value={formData.priority || 'medium'}
                                            onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as any }))}
                                            className="w-full h-10 rounded-xl bg-slate-50 border-none font-bold text-xs px-3 outline-none"
                                        >
                                            <option value="low">Baixa</option>
                                            <option value="medium">Média</option>
                                            <option value="high">Alta</option>
                                            <option value="critical">Crítica</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Influencer</label>
                                        <p className="h-10 flex items-center bg-slate-100/50 px-3 rounded-xl text-xs font-black text-slate-400 uppercase truncate">
                                            {defaultData.influencerName || 'S/ Influencer'}
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Observações / Notas</label>
                                    <textarea 
                                        value={formData.description}
                                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                        className="w-full min-h-[80px] rounded-xl bg-slate-50 border-none p-4 text-xs font-bold outline-none resize-none"
                                        placeholder="Breve descrição da ação necessária..."
                                    />
                                </div>
                            </CardContent>
                            <div className="p-6 pt-0">
                                <Button disabled={loading} type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-12 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-100 dark:shadow-none transition-all">
                                    {loading ? 'Confirmando...' : 'Criar Ação CRM'}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </>
    );
};
