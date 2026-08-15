import React, { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { ShieldAlert, AlertTriangle, Loader2 } from 'lucide-react';

interface RevokeContractModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => Promise<void>;
    orderProtocol: string;
}

export const RevokeContractModal: React.FC<RevokeContractModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    orderProtocol
}) => {
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleConfirm = async () => {
        if (!reason.trim()) {
            alert('Por favor, informe o motivo da revogação.');
            return;
        }

        try {
            setIsSubmitting(true);
            await onConfirm(reason);
            onClose();
        } catch (err) {
            console.error('Error revoking contract:', err);
            alert('Erro ao revogar contrato. Tente novamente.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Revogar Contrato Digital">
            <div className="p-6 space-y-6">
                <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex gap-4">
                    <ShieldAlert className="w-8 h-8 text-rose-600 shrink-0" />
                    <div>
                        <h4 className="text-sm font-black text-rose-900 uppercase tracking-tight">Ação Irreversível</h4>
                        <p className="text-xs font-bold text-rose-700 mt-1">
                            Ao revogar o contrato da OS <span className="font-black">#{orderProtocol}</span>, o link enviado ao cliente será <span className="font-black">IMEDIATAMENTE INVALIDADO</span>.
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    <p className="text-sm font-black text-slate-900 uppercase tracking-tighter">Por que você está revogando este contrato?</p>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Este motivo será registrado no histórico de auditoria para conformidade.</p>
                    <Input 
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="Ex: Alteração de material solicitada pelo cliente..."
                        className="h-14 rounded-2xl bg-slate-50 border-slate-100 font-bold"
                        autoFocus
                    />
                </div>

                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[10px] font-bold text-amber-700 leading-relaxed uppercase tracking-widest">
                        A revogação irá deletar o snapshot atual e destravar a edição do pedido. 
                        Será necessário gerar um NOVO contrato após as alterações.
                    </p>
                </div>

                <div className="flex gap-3 pt-4">
                    <Button 
                        variant="ghost" 
                        onClick={onClose} 
                        className="flex-1 font-black uppercase text-[10px] tracking-widest h-12 rounded-2xl"
                    >
                        Manter Contrato
                    </Button>
                    <Button 
                        onClick={handleConfirm}
                        disabled={isSubmitting || !reason.trim()}
                        className="flex-[2] bg-rose-600 hover:bg-rose-700 text-white font-black uppercase text-[10px] tracking-widest h-12 rounded-2xl shadow-xl shadow-rose-500/20"
                    >
                        {isSubmitting ? (
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" /> Processando...
                            </div>
                        ) : (
                            'Confirmar Revogação'
                        )}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
