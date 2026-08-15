import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AlertCircle } from 'lucide-react';

interface ReturnRegistrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (data: ReturnRegistrationData) => void;
    orderId: string;
}

export interface ReturnRegistrationData {
    returnReasons: string[];
    otherReason: string;
    newDeadline: string;
    returnObservations: string;
}

const RETURN_REASONS = [
    'Erro no Frontão',
    'Pedra com Defeito',
    'Erro na Instalação',
    'Medida Incorreta',
    'Falta de Material'
];

export const ReturnRegistrationModal: React.FC<ReturnRegistrationModalProps> = ({ isOpen, onClose, onConfirm }) => {
    const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
    const [otherReason, setOtherReason] = useState('');
    const [newDeadline, setNewDeadline] = useState('');
    const [returnObservations, setReturnObservations] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm({
            returnReasons: selectedReasons,
            otherReason,
            newDeadline,
            returnObservations
        });
        resetForm();
    };

    const resetForm = () => {
        setSelectedReasons([]);
        setOtherReason('');
        setNewDeadline('');
        setReturnObservations('');
    };

    const toggleReason = (reason: string) => {
        setSelectedReasons(prev =>
            prev.includes(reason)
                ? prev.filter(r => r !== reason)
                : [...prev, reason]
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={() => { onClose(); resetForm(); }} title="Registrar Retorno de Obra">
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-orange-50 dark:bg-orange-950/30 border-l-4 border-orange-500 p-4 rounded-md flex items-start text-orange-800 dark:text-orange-200 text-sm">
                    <AlertCircle className="h-5 w-5 mr-3 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-semibold mb-1">Atenção!</p>
                        <p>
                            Ao registrar um retorno, este pedido receberá status de <strong>Prioridade Alta</strong>, irá para a fila de produção e sua data de entrega será atualizada no sistema e calendário.
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        Motivos do Retorno
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {RETURN_REASONS.map(reason => (
                            <div key={reason} className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id={`ret-${reason}`}
                                    checked={selectedReasons.includes(reason)}
                                    onChange={() => toggleReason(reason)}
                                    className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 h-4 w-4"
                                />
                                <label htmlFor={`ret-${reason}`} className="text-sm cursor-pointer select-none">
                                    {reason}
                                </label>
                            </div>
                        ))}
                    </div>
                    <Input
                        placeholder="Outro motivo não listado... (opcional)"
                        value={otherReason}
                        onChange={(e) => setOtherReason(e.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center justify-between">
                        <span>Nova Data de Instalação</span>
                        <span className="text-red-500 text-xs font-normal">Obrigatório</span>
                    </label>
                    <Input
                        type="date"
                        value={newDeadline}
                        onChange={(e) => setNewDeadline(e.target.value)}
                        required
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        Observações do Instalador
                    </label>
                    <textarea
                        value={returnObservations}
                        onChange={(e) => setReturnObservations(e.target.value)}
                        className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300"
                        placeholder="Detalhes para correção (ex: Frontão menor 2cm do lado esquerdo...)"
                    />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t dark:border-slate-800">
                    <Button type="button" variant="ghost" onClick={() => { onClose(); resetForm(); }}>
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        className="bg-orange-600 hover:bg-orange-700 text-white"
                        disabled={selectedReasons.length === 0 && !otherReason}
                    >
                        Confirmar Retorno
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
