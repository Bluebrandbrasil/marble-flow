import React from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    variant?: 'danger' | 'warning' | 'info';
    isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    onConfirm,
    onCancel,
    variant = 'warning',
    isLoading = false
}) => {
    const isDanger = variant === 'danger';

    return (
        <Modal isOpen={isOpen} onClose={onCancel} title={title} className="max-w-md">
            <div className="flex flex-col gap-6">
                <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-full shrink-0 ${isDanger ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div className="pt-1 text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                        {message}
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-white/10 mt-auto">
                    <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading} className="h-10 px-4">
                        <X className="w-4 h-4 mr-2" />
                        {cancelLabel}
                    </Button>
                    <Button
                        type="button"
                        variant="default"
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={`h-10 px-4 ${isDanger ? 'bg-red-500 hover:bg-red-600 text-white border-transparent' : ''}`}
                    >
                        <Check className="w-4 h-4 mr-2" />
                        {isLoading ? 'Aguarde...' : confirmLabel}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
