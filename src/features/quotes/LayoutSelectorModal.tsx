import { safeArray } from '../../lib/dataDiagnostics';
import React from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { FileText, TrendingUp, Zap, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface LayoutSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (layout: 'classic' | 'commercial' | 'premium') => void;
    defaultLayout?: 'classic' | 'commercial' | 'premium';
}

export const LayoutSelectorModal: React.FC<LayoutSelectorModalProps> = ({
    isOpen,
    onClose,
    onSelect,
    defaultLayout = 'classic'
}) => {
    const layouts = [
        {
            id: 'classic' as const,
            title: 'Clássico',
            description: 'Equilibrado e profissional para qualquer situação.',
            icon: <FileText className="w-5 h-5" />,
            color: 'blue'
        },
        {
            id: 'commercial' as const,
            title: 'Comercial',
            description: 'Foco total no valor e condições de pagamento.',
            icon: <TrendingUp className="w-5 h-5" />,
            color: 'amber'
        },
        {
            id: 'premium' as const,
            title: 'Premium',
            description: 'Design elegante com foco na marca e sofisticação.',
            icon: <Zap className="w-5 h-5" />,
            color: 'indigo'
        }
    ];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Escolha o Estilo do Orçamento">
            <div className="p-1 space-y-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
                    Como deseja apresentar este orçamento para o cliente?
                </p>

                <div className="grid grid-cols-1 gap-3">
                    {safeArray(layouts).map((layout) => (
                        <button
                            key={layout.id}
                            onClick={() => onSelect(layout.id)}
                            className={cn(
                                "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left group",
                                "hover:border-slate-300 hover:bg-slate-50",
                                "border-slate-100 bg-white"
                            )}
                        >
                            <div className={cn(
                                "w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-sm",
                                layout.id === 'classic' && "bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white",
                                layout.id === 'commercial' && "bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white",
                                layout.id === 'premium' && "bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white"
                            )}>
                                {layout.icon}
                            </div>
                            
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">{layout.title}</h4>
                                    {layout.id === defaultLayout && (
                                        <span className="text-[8px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-tighter border border-slate-200">Padrão</span>
                                    )}
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 mt-1 leading-tight">{layout.description}</p>
                            </div>

                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <Check className="w-5 h-5 text-slate-400" />
                            </div>
                        </button>
                    ))}
                </div>

                <div className="pt-4 flex justify-end">
                    <Button variant="ghost" onClick={onClose} className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        Cancelar
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
