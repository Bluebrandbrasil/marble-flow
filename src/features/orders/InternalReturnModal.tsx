import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AlertOctagon } from 'lucide-react';

interface InternalReturnModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (itemToRemake: 'Base' | 'Frontão' | 'Cuba', reason: string, newDate: string) => void;
    initialItem?: 'Base' | 'Frontão' | 'Cuba';
}

export const InternalReturnModal: React.FC<InternalReturnModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    initialItem = 'Base'
}) => {
    const [itemToRemake, setItemToRemake] = useState<'Base' | 'Frontão' | 'Cuba'>(initialItem);
    const [reason, setReason] = useState('Erro de medida');
    const [newDate, setNewDate] = useState('');

    // Sync initial item when modal opens
    useEffect(() => {
        if (isOpen) {
            setItemToRemake(initialItem);
            setReason('Erro de medida');
            setNewDate('');
        }
    }, [isOpen, initialItem]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm(itemToRemake, reason, newDate);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Registrar Retorno de Produção (Avaria)">
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-red-50 dark:bg-red-950/30 border-l-4 border-red-500 p-4 rounded-md flex items-start text-red-800 dark:text-red-200 text-sm">
                    <AlertOctagon className="h-5 w-5 mr-3 mt-0.5 flex-shrink-0 text-red-600 dark:text-red-500" />
                    <div>
                        <p className="font-bold mb-1">Ação Crítica!</p>
                        <p>
                            Ao registrar um retorno por avaria, a Ordem será movida para o <strong>topo da Fila de Produção</strong> com status de <strong>REFAZER - URGENTE</strong>.
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        Peça Selecionada para Refazer
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {['Base', 'Frontão', 'Cuba'].map(item => (
                            <button
                                key={item}
                                type="button"
                                onClick={() => setItemToRemake(item as any)}
                                className={`py-2 px-3 text-sm font-medium rounded-md border text-center transition-colors ${itemToRemake === item
                                    ? 'bg-red-50 border-red-500 text-red-700 dark:bg-red-900/30 dark:border-red-500 dark:text-red-300'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300'
                                    }`}
                            >
                                {item}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-900 dark:text-slate-100 block mb-1">
                        Motivo da Avaria
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                        {['Erro de medida', 'Pedra com defeito', 'Erro no acabamento', 'Outros'].map(motivo => (
                            <label key={motivo} className="flex items-center space-x-2 text-sm cursor-pointer p-2 border rounded-md hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900">
                                <input
                                    type="radio"
                                    name="avariaReason"
                                    value={motivo}
                                    checked={reason === motivo}
                                    onChange={() => setReason(motivo)}
                                    className="text-red-600 focus:ring-red-500"
                                />
                                <span>{motivo}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center justify-between">
                        <span>Nova Data Solicitada de Produção</span>
                        <span className="text-red-500 text-xs font-normal">Obrigatório</span>
                    </label>
                    <Input
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        required
                    />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-800">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        disabled={!newDate}
                        className="bg-red-600 hover:bg-red-700 text-white"
                    >
                        Confirmar Retorno Urgente
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
