import React, { useState, useRef } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { UploadCloud, FileText, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface InPersonSignatureModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (file: File, date: string, responsible: string, observation: string) => Promise<void>;
    contract: any;
    profile: any;
}

export const InPersonSignatureModal: React.FC<InPersonSignatureModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    contract,
    profile
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [signDate, setSignDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [responsible, setResponsible] = useState(profile?.name || '');
    const [observation, setObservation] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            validateAndSetFile(e.target.files[0]);
        }
    };

    const validateAndSetFile = (file: File) => {
        // Validate type: PDF, JPG, PNG, WEBP
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            alert('Formato de arquivo inválido. Apenas PDF, JPG, PNG e WEBP são permitidos.');
            return;
        }

        // Validate size: 10MB limit
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            alert('O arquivo excede o limite de tamanho de 10MB.');
            return;
        }

        setSelectedFile(file);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            validateAndSetFile(e.dataTransfer.files[0]);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const removeFile = () => {
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleConfirm = async () => {
        if (!selectedFile) {
            alert('Por favor, anexe o arquivo do contrato assinado.');
            return;
        }
        if (!responsible.trim()) {
            alert('Por favor, informe o responsável por anexar o documento.');
            return;
        }

        try {
            setIsSubmitting(true);
            await onConfirm(selectedFile, signDate, responsible, observation);
            onClose();
        } catch (err) {
            console.error('Error confirming in-person signature:', err);
            alert('Erro ao processar assinatura presencial. Tente novamente.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const isPdf = selectedFile?.type.includes('pdf');

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Assinatura Presencial de Contrato">
            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
                <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-4 rounded-2xl flex gap-4">
                    <AlertCircle className="w-8 h-8 text-slate-500 shrink-0" />
                    <div>
                        <h4 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight">Registro de Assinatura Física</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Anexe o arquivo digitalizado ou foto do contrato físico assinado pelo cliente <span className="font-bold text-slate-700 dark:text-slate-300">{contract?.customerName}</span>.
                        </p>
                    </div>
                </div>

                {/* File Upload Dropzone */}
                {!selectedFile ? (
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={cn(
                            "w-full h-40 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-6 text-center transition-all cursor-pointer relative overflow-hidden group",
                            isDragging ? "border-brand-emerald bg-brand-emerald/5 scale-[1.02]" : "border-slate-300 dark:border-slate-700 hover:border-brand-emerald/50 hover:bg-brand-emerald/5 dark:hover:bg-white/5"
                        )}
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            className="hidden"
                        />

                        <div className="p-4 bg-white dark:bg-slate-800 shadow-sm rounded-full mb-3 group-hover:scale-110 transition-transform">
                            <UploadCloud className="w-8 h-8 text-slate-400" />
                        </div>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            Arraste o arquivo ou clique para selecionar
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            PDF, JPG, PNG ou WEBP de até 10MB
                        </p>
                    </div>
                ) : (
                    <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                            {isPdf ? (
                                <FileText className="w-10 h-10 text-rose-500 shrink-0" />
                            ) : (
                                <img
                                    src={URL.createObjectURL(selectedFile)}
                                    alt="Pré-visualização"
                                    className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                                />
                            )}
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{selectedFile.name}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={removeFile}
                            className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all"
                            title="Remover arquivo"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                )}

                {/* Form Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Data da Assinatura</label>
                        <Input
                            type="date"
                            value={signDate}
                            onChange={e => setSignDate(e.target.value)}
                            className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 font-bold"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Responsável (Quem Anexou)</label>
                        <Input
                            value={responsible}
                            onChange={e => setResponsible(e.target.value)}
                            placeholder="Nome do funcionário"
                            className="h-12 rounded-xl bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 font-bold"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Observações (Opcional)</label>
                    <textarea
                        value={observation}
                        onChange={e => setObservation(e.target.value)}
                        placeholder="Escreva alguma informação importante sobre esta assinatura física..."
                        className="w-full min-h-[80px] p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-bold text-sm focus:ring-2 focus:ring-brand-emerald outline-none transition-all"
                    />
                </div>

                <div className="flex gap-3 pt-4">
                    <Button 
                        variant="ghost" 
                        onClick={onClose} 
                        className="flex-1 font-black uppercase text-[10px] tracking-widest h-12 rounded-2xl"
                        disabled={isSubmitting}
                    >
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleConfirm}
                        disabled={isSubmitting || !selectedFile || !responsible.trim()}
                        className="flex-[2] bg-brand-emerald hover:bg-brand-emerald/90 text-white font-black uppercase text-[10px] tracking-widest h-12 rounded-2xl shadow-xl shadow-brand-emerald/20"
                    >
                        {isSubmitting ? (
                            <div className="flex items-center justify-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" /> Salvando...
                            </div>
                        ) : (
                            'Salvar Contrato Assinado'
                        )}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
