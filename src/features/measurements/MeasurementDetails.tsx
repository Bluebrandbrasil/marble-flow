import { safeArray } from '../../lib/dataDiagnostics';
import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Measurement } from '../../types';
import { Calendar, MapPin, Phone, FileText, CopyPlus, Trash2, XCircle, Clock, Info, ShieldCheck, Image as ImageIcon, Paperclip } from 'lucide-react';
import { safeSplit } from '../../lib/dataDiagnostics';
import { Button } from '../../components/ui/Button';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { cn, safeString } from '../../lib/utils';
import { storage } from '../../lib/firebase';
import { ref, getDownloadURL } from 'firebase/storage';

interface MeasurementDetailsProps {
    measurement: Measurement;
    onClose: () => void;
    onConvertToOrder: (measurement: Measurement) => void;
    onDecline: (measurement: Measurement, reason: string) => void;
    onDelete: (e: React.MouseEvent) => void;
    labelConvert?: string;
    onEdit?: () => void;
}

export const MeasurementDetails: React.FC<MeasurementDetailsProps> = ({ measurement, onClose, onConvertToOrder, onDecline, onDelete, labelConvert = 'Converter Projeto', onEdit }) => {
    const [isDeclining, setIsDeclining] = React.useState(false);
    const declineReasons = ['Preço', 'Prazo', 'Concorrente', 'Cliente Desistiu', 'Fora de Área', 'Outros'];

    const [attachmentUrl, setAttachmentUrl] = React.useState<string | null>(null);
    const [isLoadingUrl, setIsLoadingUrl] = React.useState(false);

    React.useEffect(() => {
        if (measurement.measurementAttachment?.storagePath) {
            if (measurement.measurementAttachment.mimeType.startsWith('image/')) {
                getDownloadURL(ref(storage, measurement.measurementAttachment.storagePath))
                    .then(url => setAttachmentUrl(url))
                    .catch(err => console.error("Error loading preview URL:", err));
            }
        } else {
            setAttachmentUrl(null);
        }
    }, [measurement.measurementAttachment]);

    const handleOpenAttachment = async () => {
        if (!measurement.measurementAttachment?.storagePath) return;
        setIsLoadingUrl(true);
        try {
            const url = await getDownloadURL(ref(storage, measurement.measurementAttachment.storagePath));
            window.open(url, '_blank');
        } catch (err) {
            console.error("Error opening attachment:", err);
            alert("Erro ao abrir o arquivo.");
        } finally {
            setIsLoadingUrl(false);
        }
    };

    const clientName = String(measurement?.customerName || 'Cliente não identificado');
    const safeDate = measurement?.scheduledDate ? new Date(measurement.scheduledDate + 'T12:00:00') : new Date();
    const formattedDate = (measurement?.scheduledDate && !isNaN(safeDate.getTime())) ? format(safeDate, "dd 'de' MMMM", { locale: ptBR }) : 'Data pendente';

    return (
        <div className="animate-in fade-in zoom-in-95 duration-300 flex flex-col bg-white dark:bg-slate-900">
            {/* Professional CRM Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-slate-100 dark:border-white/5 pb-6">
                <div className="flex flex-col">
                    <h2 className={cn(
                        "text-2xl font-bold text-slate-900 dark:text-white transition-colors",
                        !measurement.customerName && "text-slate-400 font-medium"
                    )}>
                        {clientName}
                    </h2>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 font-medium">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{formattedDate}</span>
                        <span className="text-slate-300 dark:text-slate-700">|</span>
                        <Clock className="h-3.5 w-3.5" />
                        <span>{String(measurement?.scheduledTime || '--:--')}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {measurement.phone && (
                        <button
                            onClick={() => {
                                const whatsappName = safeSplit(clientName, ' ', 'measurements', 'customerName')[0];
                                const message = `Olá ${whatsappName}, tudo bem? Gostaríamos de confirmar os detalhes do seu agendamento.`;
                                const phone = String(measurement?.phone || '').replace(/\D/g, '');
                                window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank');
                            }}
                            className="h-10 w-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/10 hover:bg-emerald-600 transition-all"
                            title="Contato via WhatsApp"
                        >
                            <WhatsAppIcon className="h-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {isDeclining ? (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                    <div className="bg-amber-50 dark:bg-amber-950/20 p-5 rounded-2xl border border-amber-200/50 dark:border-amber-800/50 flex items-start gap-4">
                        <Info className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                            <h3 className="text-sm font-bold text-amber-800 dark:text-amber-400">Por que este agendamento não avançou?</h3>
                            <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">Selecione o principal motivo para o registro no histórico do cliente.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {safeArray(declineReasons).map(reason => (
                            <Button
                                key={reason}
                                variant="outline"
                                className="h-12 justify-center font-bold text-xs text-slate-600 dark:text-slate-300 rounded-xl border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5"
                                onClick={() => onDecline(measurement, reason)}
                            >
                                {reason}
                            </Button>
                        ))}
                    </div>
                    <div className="flex justify-start">
                        <Button variant="ghost" onClick={() => setIsDeclining(false)} className="text-xs font-bold text-slate-500">
                            Voltar
                        </Button>
                    </div>
                </div>
            ) : (
                <>
                    {/* CRM 60/40 Grid Layout */}
                    <div className="grid grid-cols-1 md:grid-cols-10 gap-6">
                        {/* LEFT COLUMN (60%) */}
                        <div className="md:col-span-6 space-y-4">
                            {/* Status Card */}
                            <div className="bg-white dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
                                <label className="text-xs text-slate-500 font-medium uppercase tracking-wider block mb-2">Status do Agendamento</label>
                                <div className="flex flex-wrap items-center gap-3 mt-1">
                                    <span className={cn(
                                        "px-3 py-1 rounded-lg text-xs font-bold border",
                                        measurement?.status === 'completed' || measurement?.status === 'converted' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                                        measurement?.status === 'declined' ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-indigo-50 text-indigo-600 border-indigo-100"
                                    )}>
                                        {measurement?.status === 'completed' || measurement?.status === 'converted' ? 'Finalizado' :
                                         measurement?.status === 'declined' ? 'Declinado' : 'Agendado'}
                                    </span>
                                    {!measurement.quoteId && (
                                        <span className="px-3 py-1 rounded-lg text-xs font-bold border bg-amber-50 text-amber-600 border-amber-200 uppercase tracking-wide">
                                            Sem orçamento vinculado
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Contact Card */}
                            <div className="bg-white dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
                                <label className="text-xs text-slate-500 font-medium uppercase tracking-wider block mb-2">Canal de Atendimento</label>
                                <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 bg-slate-50 dark:bg-white/5 rounded-xl flex items-center justify-center text-slate-400">
                                        <Phone className="h-4.5 w-4.5" />
                                    </div>
                                    <span className="text-base font-medium text-slate-700 dark:text-slate-300">{String(measurement?.phone || 'Telefone não informado')}</span>
                                </div>
                            </div>

                            {/* Assigned Measurer Card */}
                            {measurement.assignedStaffName && (
                                <div className="bg-white dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
                                    <label className="text-xs text-slate-500 font-medium uppercase tracking-wider block mb-2">Medidor Responsável</label>
                                    <div className="flex items-center gap-3">
                                        <div className="h-9 w-9 bg-brand-emerald/10 rounded-xl flex items-center justify-center text-brand-emerald">
                                            <ShieldCheck className="h-4.5 w-4.5" />
                                        </div>
                                        <span className="text-base font-medium text-slate-700 dark:text-slate-300">{String(measurement?.assignedStaffName || '')}</span>
                                    </div>
                                </div>
                            )}

                            {/* Address Card */}
                            <div className="bg-white dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
                                <label className="text-xs text-slate-500 font-medium uppercase tracking-wider block mb-3">Endereço da Obra</label>
                                <div className="flex items-start gap-3">
                                    <div className="h-9 w-9 bg-slate-50 dark:bg-white/5 rounded-xl flex items-center justify-center text-slate-400 shrink-0 mt-0.5">
                                        <MapPin className="h-4.5 w-4.5" />
                                    </div>
                                    <span className="text-base font-medium text-slate-700 dark:text-slate-300 leading-relaxed break-words">{String(measurement?.address || 'Endereço não disponível')}</span>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN (40%) */}
                        <div className="md:col-span-4 space-y-4">
                            {/* Observations Card */}
                            <div className="bg-white dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm flex flex-col h-full min-h-[160px]">
                                <label className="text-xs text-slate-500 font-medium uppercase tracking-wider block mb-3 flex items-center gap-2">
                                    <FileText className="h-3.5 w-3.5" /> Observações
                                </label>
                                <div className="text-sm font-medium text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap flex-1">
                                    {String(measurement?.observations || 'Nenhuma observação registrada.')}
                                </div>
                            </div>

                            {/* Linked Material Card */}
                            {measurement.material && (
                                <div className="bg-white dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm animate-in fade-in slide-in-from-right-2">
                                    <label className="text-xs text-slate-500 font-medium uppercase tracking-wider block mb-2">Material Vinculado</label>
                                    <span className="text-base font-medium text-slate-700 dark:text-slate-300">{measurement.material}</span>
                                </div>
                            )}

                            {measurement.measurementAttachment && (
                                <div className="bg-white dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm animate-in fade-in slide-in-from-right-2">
                                    <label className="text-xs text-slate-500 font-medium uppercase tracking-wider block mb-3 flex items-center gap-2">
                                        <Paperclip className="h-3.5 w-3.5 text-brand-emerald" /> Anexo para Medição
                                    </label>
                                    {measurement.measurementAttachment.mimeType?.startsWith('image/') && attachmentUrl && (
                                        <div 
                                            className="mb-3 rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 aspect-video bg-slate-50 dark:bg-slate-900 cursor-pointer hover:opacity-90 transition-opacity" 
                                            onClick={handleOpenAttachment}
                                        >
                                            <img src={attachmentUrl} alt="Anexo" className="w-full h-full object-contain" />
                                        </div>
                                    )}
                                    <div className="flex items-center gap-3 bg-slate-50 dark:bg-white/5 p-3 rounded-xl border border-slate-150 dark:border-white/5 mb-3">
                                        <FileText className="h-6 w-6 text-brand-emerald shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-bold text-slate-700 dark:text-slate-250 truncate" title={measurement.measurementAttachment.originalName}>
                                                {measurement.measurementAttachment.originalName}
                                            </p>
                                            {measurement.measurementAttachment.size && (
                                                <p className="text-[10px] text-slate-400 mt-0.5">
                                                    {(measurement.measurementAttachment.size / (1024 * 1024)).toFixed(1)} MB
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        onClick={handleOpenAttachment}
                                        disabled={isLoadingUrl}
                                        className="w-full h-10 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        {isLoadingUrl ? 'Abrindo...' : 'Abrir Arquivo'}
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Documentação Fotográfica Card (Full Width) */}
                        {(safeArray(measurement.environmentPhotos).length > 0 || safeArray(measurement.technicalMeasurementPhotos).length > 0) && (
                            <div className="md:col-span-10 space-y-4 mt-2">
                                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight flex items-center gap-2">
                                    <ImageIcon className="h-4 w-4" /> Documentação Fotográfica
                                </h3>
                                <div className="bg-white dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm space-y-8">
                                    {safeArray(measurement.environmentPhotos).length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Fotos do Ambiente</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                                {safeArray(measurement.environmentPhotos).map((photo: any, idx: number) => (
                                                    <a key={idx} href={photo.url} target="_blank" rel="noreferrer" className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 dark:border-white/5 hover:ring-2 hover:ring-indigo-500 transition-all block group shadow-sm">
                                                        <img src={photo.url} alt="Ambiente" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {safeArray(measurement.technicalMeasurementPhotos).length > 0 && (
                                        <div className={safeArray(measurement.environmentPhotos).length > 0 ? "pt-8 border-t border-slate-100 dark:border-white/5" : ""}>
                                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Fotos da Medição Técnica</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                                {safeArray(measurement.technicalMeasurementPhotos).map((photo: any, idx: number) => (
                                                    <a key={idx} href={photo.url} target="_blank" rel="noreferrer" className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 dark:border-white/5 hover:ring-2 hover:ring-emerald-500 transition-all block group shadow-sm">
                                                        <img src={photo.url} alt="Técnica" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer Actions Area */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-8 mt-4 border-t border-slate-100 dark:border-white/5">
                        <Button 
                            variant="ghost" 
                            className="h-11 px-6 text-rose-500 hover:text-white hover:bg-rose-500 font-bold text-xs uppercase tracking-widest rounded-xl transition-all w-full md:w-auto" 
                            onClick={onDelete}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                        </Button>
                        
                        <div className="flex gap-3 w-full md:w-auto">
                            {onEdit && (
                                <Button 
                                    variant="outline" 
                                    onClick={onEdit} 
                                    className="h-11 px-6 rounded-xl border-slate-200 dark:border-white/10 font-bold text-xs uppercase tracking-widest text-indigo-650 hover:bg-slate-50 dark:hover:bg-white/5 flex-1 md:flex-none"
                                >
                                    Editar
                                </Button>
                            )}
                            <Button 
                                variant="outline" 
                                onClick={onClose} 
                                className="h-11 px-6 rounded-xl border-slate-200 dark:border-white/10 font-bold text-xs uppercase tracking-widest text-slate-500 flex-1 md:flex-none"
                            >
                                Fechar
                            </Button>
                            
                            {measurement.status === 'scheduled' && (
                                <>
                                    <Button
                                        variant="outline"
                                        className="h-11 px-6 rounded-xl text-amber-600 border-amber-200 hover:bg-amber-500 hover:text-white hover:border-amber-500 font-bold text-xs uppercase tracking-widest transition-all flex-1 md:flex-none"
                                        onClick={() => setIsDeclining(true)}
                                    >
                                        <XCircle className="w-4 h-4 mr-2" />
                                        Declinar
                                    </Button>
                                    <Button
                                        className="h-11 px-10 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl shadow-lg transition-all transform active:scale-95 text-xs uppercase tracking-widest flex-1 md:flex-none"
                                        onClick={() => onConvertToOrder(measurement)}
                                    >
                                        <CopyPlus className="w-4 h-4 mr-2" />
                                        {labelConvert}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
