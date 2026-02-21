import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Check, AlertTriangle } from 'lucide-react';

interface JobClosingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (data: JobClosingData) => void;
    orderId: string;
}

export interface JobClosingData {
    installerName: string;
    completionStatus: 'success' | 'return';
    returnReasons: string[];
    otherReason: string;
}

const RETURN_REASONS = [
    'Erro no Frontão',
    'Pedra com Defeito',
    'Erro na Instalação',
    'Medida Incorreta'
];

export const JobClosingModal: React.FC<JobClosingModalProps> = ({ isOpen, onClose, onConfirm }) => {
    const [installerName, setInstallerName] = useState('');
    const [completionStatus, setCompletionStatus] = useState<'success' | 'return'>('success');
    const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
    const [otherReason, setOtherReason] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm({
            installerName,
            completionStatus,
            returnReasons: selectedReasons,
            otherReason
        });
        resetForm();
    };

    const resetForm = () => {
        setInstallerName('');
        setCompletionStatus('success');
        setSelectedReasons([]);
        setOtherReason('');
    };

    const toggleReason = (reason: string) => {
        setSelectedReasons(prev =>
            prev.includes(reason)
                ? prev.filter(r => r !== reason)
                : [...prev, reason]
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Encerramento de Obra">
            <form onSubmit={handleSubmit} className="space-y-6">

                {/* Installer Name */}
                <div className="space-y-2">
                    <label className="text-sm font-medium">Nome do Instalador</label>
                    <Input
                        value={installerName}
                        onChange={(e) => setInstallerName(e.target.value)}
                        placeholder="Quem realizou a instalação?"
                        required
                    />
                </div>

                {/* Status Selector */}
                <div className="space-y-2">
                    <label className="text-sm font-medium">Status da Conclusão</label>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            type="button"
                            onClick={() => setCompletionStatus('success')}
                            className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-all ${completionStatus === 'success'
                                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                                    : 'border-slate-200 dark:border-slate-800 hover:border-emerald-200'
                                }`}
                        >
                            <Check className="h-6 w-6" />
                            <span className="font-semibold">Finalizado com Sucesso</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setCompletionStatus('return')}
                            className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-all ${completionStatus === 'return'
                                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                                    : 'border-slate-200 dark:border-slate-800 hover:border-red-200'
                                }`}
                        >
                            <AlertTriangle className="h-6 w-6" />
                            <span className="font-semibold">Necessita Retorno</span>
                        </button>
                    </div>
                </div>

                {/* Return Reasons */}
                {completionStatus === 'return' && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                        <label className="text-sm font-medium text-red-600 dark:text-red-400">
                            Motivos do Retorno
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {RETURN_REASONS.map(reason => (
                                <div key={reason} className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id={reason}
                                        checked={selectedReasons.includes(reason)}
                                        onChange={() => toggleReason(reason)}
                                        className="rounded border-slate-300 text-red-600 focus:ring-red-500"
                                    />
                                    <label htmlFor={reason} className="text-sm cursor-pointer select-none">
                                        {reason}
                                    </label>
                                </div>
                            ))}
                        </div>
                        <Input
                            placeholder="Outro motivo (opcional)"
                            value={otherReason}
                            onChange={(e) => setOtherReason(e.target.value)}
                        />
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-800">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        variant={completionStatus === 'success' ? 'default' : 'destructive'}
                    >
                        {completionStatus === 'success' ? 'Concluir Obra' : 'Registrar Retorno'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
